package com.sevarm.tetr.core.queue

import android.content.Context
import com.sevarm.tetr.core.api.ApiClient
import com.sevarm.tetr.core.api.ApiException
import com.sevarm.tetr.core.api.field
import com.sevarm.tetr.core.api.jsonBody
import com.sevarm.tetr.core.session.Session
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import java.io.File

/**
 * Очередь записей, сделанных без связи.
 *
 * Мойка часто в подвале или за городом. «Не сохранилось, потому что не
 * было интернета» убьёт доверие быстрее любого бага, поэтому запись
 * сначала ложится сюда, экран сразу показывает успех, а отправка —
 * отдельная забота.
 *
 * У каждой записи свой `ref`, придуманный телефоном. Досылка может уйти
 * дважды: сервер по ref поймёт, что это та же машина, а не вторая, и
 * ответит 200 вместо 201. Ошибкой это не считается ни на одной стороне.
 *
 * Хранится файлом, а не базой. Записей в очереди единицы — они уходят при
 * первой же связи; ради них тянуть Room незачем.
 */
class OrderQueue(context: Context, private val api: ApiClient) {

    @Serializable
    data class Item(
        val ref: String,
        val clientKey: String,
        /** Одна услуга — форма старых записей, уже лежащих в очереди. */
        val serviceId: String,
        /**
         * Несколько услуг за один заезд. Необязательное: записи,
         * накопленные до этой версии, приедут со старым полем, и терять их
         * из-за формата нельзя.
         */
        val serviceIds: List<String>? = null,
        val serviceName: String,
        /** Сколько взяли — уже со скидкой, если она была. */
        val price: Int,
        /**
         * Цена по прайсу. Нужна, чтобы скидка не потерялась в очереди:
         * запись может пролежать в телефоне до вечера, и отправить её
         * потом по прайсу значило бы молча отменить решение мойщика.
         */
        val listPrice: Int? = null,
        val payment: String,
        /**
         * Тариф словом — «Ջիպ», как его видел мойщик.
         *
         * Словом, а не номером: запись может пролежать до вечера, а
         * владелец за это время переставит классы местами — номер указал бы
         * на соседний, и джип уехал бы по цене седана.
         */
        val tier: String? = null,
        /**
         * Чья это запись.
         *
         * Пока мойка у человека одна, поле не значит ничего. Когда их две,
         * оно единственное, что не даёт машине, записанной на первой,
         * уехать во вторую: очередь переживает переключение точки, а
         * отправляется уже с другим токеном.
         */
        val tenantId: String? = null,
        /**
         * Кто ещё мыл эту машину, кроме автора записи.
         *
         * Пусто — одиночная мойка, тело запроса то же до знака, что и до
         * появления совместной. Себя слать не нужно: сервер добавит автора
         * сам, а повтор молча схлопнет.
         *
         * Хранится в очереди наравне с ценой и услугой: запись может
         * пролежать в телефоне до вечера, и отправить её без состава
         * значило бы оставить коллег без денег за уже сделанную работу.
         * Идентификаторами, а не именами: имена меняются, а начисление
         * должно попасть тому же человеку.
         */
        val participants: List<String>? = null,
        val at: Long,
        /**
         * Код отказа сервера, если он был. Запись при этом остаётся: молча
         * выбрасывать работу человека нельзя.
         */
        val failure: String? = null,
    )

    private val file = File(context.filesDir, "queue.json")
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val lock = Mutex()

    private val _items = MutableStateFlow<List<Item>>(emptyList())
    val items: StateFlow<List<Item>> = _items.asStateFlow()

    init {
        _items.value = load()
    }

    fun add(item: Item) {
        _items.value = _items.value + item
        save()
    }

    /**
     * Записи, которые сервер не принял.
     *
     * Показываются отдельно: это не «ещё не ушло», а «не уйдёт само».
     * Только записи этой мойки — номер машины из соседней точки на чужом
     * экране читается как своя запись.
     */
    fun rejected(tenantId: String?): List<Item> =
        _items.value.filter { it.failure != null && (it.tenantId == null || it.tenantId == tenantId) }

    fun waiting(tenantId: String?): List<Item> =
        _items.value.filter { it.failure == null && (it.tenantId == null || it.tenantId == tenantId) }

    /**
     * Повторить отвергнутую — например, после того как владелец вернул
     * услугу в прайс.
     */
    fun retry(ref: String) = mark(ref, null)

    /**
     * Убрать отвергнутую совсем. Только по решению человека: сама очередь
     * ничего не выбрасывает.
     */
    fun drop(ref: String) = remove(ref)

    /**
     * Отправить всё, что накопилось.
     *
     * Три разных исхода, и разница между ними — это разница между
     * «подождём» и «потеряли»:
     *
     *   ушло           — убираем из очереди, дело сделано;
     *   связи нет      — останавливаем весь проход: остальным идти некуда;
     *   сервер отказал — ПОМЕЧАЕМ и идём дальше.
     *
     * Последнее раньше было удалением, и это было ошибкой: мойщик записал
     * машину, приложение сказало «готово», а запись исчезала молча и
     * навсегда. Для продукта, который обещает «не потеряется», хуже
     * поведения нет. Пусть лучше висит с пометкой и человек решит сам.
     */
    suspend fun flush(session: Session): Int = lock.withLock {
        var sent = 0
        /*
         * Только записи этой мойки. Чужие не выбрасываем и не помечаем
         * ошибкой — они дождутся возвращения на свою точку.
         */
        val here = session.tenant.value?.id
        val batch = _items.value.filter {
            it.failure == null && (it.tenantId == null || it.tenantId == here)
        }

        for (item in batch) {
            try {
                session.authed { token ->
                    api.call(
                        "orders",
                        method = "POST",
                        body = jsonBody {
                            field("ref", item.ref)
                            field("clientKey", item.clientKey)
                            field("payment", item.payment)
                            val ids = item.serviceIds
                            if (!ids.isNullOrEmpty()) {
                                field("serviceIds", JsonArray(ids.map { JsonPrimitive(it) }))
                            } else {
                                field("serviceId", item.serviceId)
                            }
                            /*
                             * Цену шлём только когда она отличается от
                             * прайса: в обычной записи это лишнее поле, а в
                             * записи со скидкой — единственное, что её
                             * сохраняет.
                             */
                            val list = item.listPrice
                            if (list != null && item.price < list) field("price", item.price)
                            item.tier?.takeIf { it.isNotBlank() }?.let { field("tier", it) }
                            item.participants?.takeIf { it.isNotEmpty() }?.let { crew ->
                                field("participants", JsonArray(crew.map { JsonPrimitive(it) }))
                            }
                        },
                        token = token,
                    )
                }
                remove(item.ref)
                sent += 1
            } catch (e: ApiException) {
                if (e.isOffline) break
                mark(item.ref, e.code ?: "HTTP ${e.status}")
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                mark(item.ref, e.javaClass.simpleName)
            }
        }
        sent
    }

    // ─────────────────────────── хранение ───────────────────────────

    private fun mark(ref: String, failure: String?) {
        _items.value = _items.value.map { if (it.ref == ref) it.copy(failure = failure) else it }
        save()
    }

    private fun remove(ref: String) {
        _items.value = _items.value.filterNot { it.ref == ref }
        save()
    }

    private fun load(): List<Item> = runCatching {
        if (!file.exists()) emptyList() else json.decodeFromString<List<Item>>(file.readText())
    }.getOrDefault(emptyList())

    private fun save() {
        val snapshot = _items.value
        runCatching {
            /*
             * Запись через временный файл: обрыв процесса посреди записи не
             * должен оставить обрезанный JSON — тогда пропала бы вся
             * очередь, а не одна строка.
             */
            val tmp = File(file.parentFile, "${file.name}.tmp")
            tmp.writeText(json.encodeToString(snapshot))
            tmp.renameTo(file)
        }
    }

    /** Для фоновой досылки: чтение с диска мимо главного потока. */
    suspend fun reload() = withContext(Dispatchers.IO) { _items.value = load() }
}
