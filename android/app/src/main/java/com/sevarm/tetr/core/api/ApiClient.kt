package com.sevarm.tetr.core.api

import com.sevarm.tetr.BuildConfig
import com.sevarm.tetr.core.i18n.LangStore
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Клиент HTTP.
 *
 * Один на приложение, как `APIClient` в iOS. Retrofit здесь не нужен:
 * запросов полтора десятка, тела у них разной формы (тот же
 * `auth/pin/reset` принимает три разных набора полей на трёх шагах), а
 * OkHttp умеет всё, что для них требуется. Каждая лишняя зависимость —
 * это ещё и её обновления, её несовместимости и её сопровождение.
 *
 * Всё, что должно происходить с каждым запросом, происходит здесь: язык
 * интерфейса заголовком, токен заголовком, разбор отказа в
 * `ApiException`, отличение обрыва связи от отказа сервера. Экраны об
 * этом не знают вовсе.
 */
class ApiClient(
    private val langStore: LangStore,
    /** Свой адрес нужен проверкам: они поднимают сервер у себя. */
    baseUrl: String = BuildConfig.API_BASE,
) {
    /**
     * Косая черта на конце обязательна: без неё относительный путь
     * заменяет последний сегмент, и `summary` уезжает в `/api/summary`.
     */
    private val base = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"

    val json: Json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        coerceInputValues = true
    }

    private val http = OkHttpClient.Builder()
        /*
         * Во дворе мойки связь пропадает. Долгое ожидание бессмысленно:
         * запись всё равно ляжет в очередь и уйдёт, когда связь вернётся.
         */
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(12, TimeUnit.SECONDS)
        .writeTimeout(12, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    private val jsonType = "application/json; charset=utf-8".toMediaType()

    /**
     * Ответ с разбором.
     *
     * Разбор идёт через `json`, а не через `decodeFromStream`: тело у нас
     * всегда маленькое, а строка в исключении разбора называет то, что
     * реально пришло, — без неё расхождение с сервером на одно поле
     * ищется наугад.
     */
    suspend inline fun <reified T> send(
        path: String,
        method: String = "GET",
        body: JsonObject? = null,
        token: String? = null,
    ): T {
        val text = raw(path, method, body, token).decodeToString()
        return json.decodeFromString(text)
    }

    /**
     * Запрос без ответа: сервер отвечает 204 на всё, что ничего не
     * возвращает, и разбирать там нечего.
     */
    suspend fun call(
        path: String,
        method: String = "GET",
        body: JsonObject? = null,
        token: String? = null,
    ) {
        raw(path, method, body, token)
    }

    /** Тело ответа как есть — выгрузке CSV нужен именно оно. */
    suspend fun raw(
        path: String,
        method: String = "GET",
        body: JsonObject? = null,
        token: String? = null,
    ): ByteArray = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url(base + path.removePrefix("/"))
            /*
             * Язык интерфейса — тем же заголовком, каким его шлёт любой
             * браузер. Сервер отвечает на нём там, где слова собирает он:
             * заводские термины ниши, поводы для колокольчика, шапка
             * выгрузки. Токен при этом не трогается — язык меняют в
             * настройках, а не перевходом.
             */
            .header("Accept-Language", langStore.current.value.code)
            .apply {
                token?.let { header("Authorization", "Bearer $it") }
                when {
                    body != null -> method(method, body.toString().toRequestBody(jsonType))
                    method == "GET" -> get()
                    // DELETE и POST без тела: OkHttp требует явного пустого
                    else -> method(method, ByteArray(0).toRequestBody(jsonType))
                }
            }
            .build()

        val response = try {
            http.newCall(request).await()
        } catch (e: CancellationException) {
            /*
             * Отмена — НЕ отсутствие связи. Уход с экрана или отпущенное
             * «потянуть вниз» обрывает запрос на полпути; раньше это
             * приходило наравне с обрывом сети и превращалось в «Կապ չկա» —
             * экран сообщал о поломке там, где ничего не сломалось.
             */
            throw e
        } catch (e: SocketTimeoutException) {
            throw ApiException(status = 0, code = "TIMEOUT")
        } catch (e: UnknownHostException) {
            throw ApiException(status = 0, code = "NO_HOST")
        } catch (e: SSLException) {
            throw ApiException(status = 0, code = "TLS")
        } catch (e: IOException) {
            throw ApiException(status = 0, code = e.javaClass.simpleName)
        }

        response.use {
            val bytes = it.body?.bytes() ?: ByteArray(0)
            if (!it.isSuccessful) throw failure(it.code, bytes)
            bytes
        }
    }

    /** Разбор отказа: код, пауза и всё, что сервер добавил к нему. */
    private fun failure(status: Int, bytes: ByteArray): ApiException {
        val obj = runCatching {
            json.parseToJsonElement(bytes.decodeToString()) as? JsonObject
        }.getOrNull()

        fun text(key: String) = (obj?.get(key) as? JsonPrimitive)?.takeIf { it.isString }?.content
        fun number(key: String) = runCatching { obj?.get(key)?.jsonPrimitive?.int }.getOrNull()

        return ApiException(
            status = status,
            code = text("error"),
            retryAfter = number("retryAfter"),
            challengeId = text("challengeId"),
            maskedPhone = text("phone"),
            reason = text("reason"),
        )
    }

    private suspend fun Call.await(): Response = suspendCancellableCoroutine { cont ->
        cont.invokeOnCancellation { runCatching { cancel() } }
        enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                if (!cont.isCancelled) cont.resumeWithException(e)
            }

            override fun onResponse(call: Call, response: Response) {
                cont.resume(response)
            }
        })
    }
}

// ─────────────────────────── сборка тел ───────────────────────────

/**
 * Тело запроса.
 *
 * Собирается вручную, а не из data-класса, ровно потому, что тела здесь
 * условные: `auth/phone` на трёх шагах принимает три разных набора полей,
 * а цена в записи машины шлётся, только когда она отличается от прайса.
 * Три data-класса на один маршрут — это три места, где можно забыть поле.
 */
fun jsonBody(build: MutableMap<String, JsonElement>.() -> Unit): JsonObject {
    val map = LinkedHashMap<String, JsonElement>()
    map.build()
    return JsonObject(map)
}

fun MutableMap<String, JsonElement>.field(key: String, value: String) {
    this[key] = JsonPrimitive(value)
}

fun MutableMap<String, JsonElement>.field(key: String, value: Int) {
    this[key] = JsonPrimitive(value)
}

fun MutableMap<String, JsonElement>.field(key: String, value: Boolean) {
    this[key] = JsonPrimitive(value)
}

fun MutableMap<String, JsonElement>.field(key: String, value: JsonElement) {
    this[key] = value
}

/**
 * Поле, посланное ПУСТЫМ намеренно.
 *
 * Не то же самое, что `optional`: там пустое значение поле убирает, а
 * здесь отправляет его как `null`. Разница не формальная — на ней держатся
 * ответы вида «выключить свойство» против «оставить как есть». Общий
 * процент команды: пусто означает «совместной работы у нас не бывает»,
 * ноль — «мойте вместе, доплаты нет», а отсутствие поля — «не трогай». Три
 * разных ответа, и свести их к двум значило бы отобрать у владельца один
 * из них.
 */
fun MutableMap<String, JsonElement>.nullField(key: String) {
    this[key] = JsonNull
}

/** Поле, которого может не быть: пустое не отправляется вовсе. */
fun MutableMap<String, JsonElement>.optional(key: String, value: String?) {
    if (!value.isNullOrBlank()) this[key] = JsonPrimitive(value)
}
