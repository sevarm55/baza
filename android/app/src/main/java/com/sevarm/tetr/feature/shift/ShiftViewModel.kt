package com.sevarm.tetr.feature.shift

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sevarm.tetr.AppGraph
import com.sevarm.tetr.core.api.Shift
import com.sevarm.tetr.core.api.ShiftState
import com.sevarm.tetr.core.api.field
import com.sevarm.tetr.core.api.jsonBody
import com.sevarm.tetr.core.queue.OrderQueue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Смена мойщика.
 *
 * Экран открывают сорок раз за смену мокрыми руками, и весь смысл модели —
 * чтобы то, что человек только что сделал, отражалось немедленно, а сеть
 * догоняла потом.
 */
class ShiftViewModel(private val graph: AppGraph) : ViewModel() {

    private val session = graph.session
    private val api = graph.api
    val queue: OrderQueue = graph.queue

    data class UiState(
        val shift: Shift? = null,
        /**
         * Держим отдельно от `shift`: переключатель должен отзываться
         * сразу, а не ждать, пока с сервера приедет вся смена целиком.
         */
        val onShift: Boolean = false,
        val loading: Boolean = false,
        /** Только что приехавшая запись — её строка подсвечивается. */
        val newestOrderId: String? = null,
    ) {
        /**
         * У владельца процент обычно 0 — он не берёт долю со своей работы.
         * Показывать ему «твой заработок: 0 ֏» самым крупным числом на
         * экране значит показывать пустоту: цифра верная, но смысла в ней
         * никакого. Ему важна выручка смены, и она и становится главной.
         */
        val takesShare: Boolean get() = (shift?.percent ?: 0) > 0
    }

    private val _ui = MutableStateFlow(UiState())
    val ui: StateFlow<UiState> = _ui.asStateFlow()

    /**
     * Номер обновления.
     *
     * Экран открывают и сразу тянут вниз — два обновления идут
     * одновременно, и то, что стартовало раньше, может ответить позже. Без
     * этого счётчика старый ответ затирает свежий, и только что записанная
     * машина исчезает с экрана, хотя на сервере она есть. Ровно так это и
     * выглядело.
     */
    private var loadId = 0

    fun reload() {
        viewModelScope.launch { reloadNow() }
    }

    suspend fun reloadNow() {
        loadId += 1
        val id = loadId
        _ui.value = _ui.value.copy(loading = true)

        // сначала досылаем накопленное: иначе смена покажет вчерашние
        // цифры, хотя записи уже сделаны
        runCatching { queue.flush(session) }

        val fresh = try {
            session.authed { token -> api.send<Shift>("shift", token = token) }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        }

        // применяем только если за это время не начали новое обновление
        if (id != loadId) return

        if (fresh != null) {
            val oldIds = _ui.value.shift?.orders?.map { it.id }?.toSet() ?: emptySet()
            val inserted =
                if (_ui.value.shift == null) null
                else fresh.orders.firstOrNull { it.id !in oldIds }

            _ui.value = _ui.value.copy(
                shift = fresh,
                onShift = fresh.onShift,
                newestOrderId = inserted?.id,
                loading = false,
            )
        } else {
            _ui.value = _ui.value.copy(loading = false)
        }

        syncBoard()
    }

    /** Подсветка новой строки гаснет сама — она отмечает, а не остаётся. */
    fun clearHighlight() {
        _ui.value = _ui.value.copy(newestOrderId = null)
    }

    /**
     * Встать на смену.
     *
     * Состояние меняем сразу, не дожидаясь сервера: связь на мойке
     * пропадает, а переключатель, который «думает» секунду, жмут второй
     * раз. Не прошло — вернём обратно на следующем обновлении.
     */
    fun openShift() {
        val previous = _ui.value.onShift
        _ui.value = _ui.value.copy(onShift = true)
        viewModelScope.launch {
            val done = try {
                session.authed { token ->
                    api.send<ShiftState>(
                        "shift",
                        method = "POST",
                        body = jsonBody { field("open", true) },
                        token = token,
                    )
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                null
            }
            // не прошло — честно откатываемся, а не делаем вид, что встали
            _ui.value = _ui.value.copy(onShift = done?.onShift ?: previous)
            if (_ui.value.onShift) reloadNow()
        }
    }

    /**
     * Уйти со смены, отметив наличные.
     *
     * `cash == null` значит «не отмечал»: это не ноль, и владелец увидит
     * разницу между «сдал ничего» и «не дошёл до экрана сдачи».
     */
    fun closeShift(cash: Int?) {
        _ui.value = _ui.value.copy(onShift = false)
        viewModelScope.launch {
            val done = try {
                session.authed { token ->
                    api.send<ShiftState>(
                        "shift",
                        method = "POST",
                        body = jsonBody {
                            field("open", false)
                            cash?.let { field("cash", it) }
                        },
                        token = token,
                    )
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                null
            }
            if (done == null) {
                _ui.value = _ui.value.copy(onShift = true)
            } else if (!done.onShift) {
                /*
                 * Закрытие уже подтверждено. Не ждём повторный запрос: если
                 * связь исчезнет после отправки, табло в шторке всё равно
                 * обязано пропасть.
                 */
                graph.shiftBoard.end()
            }
            reloadNow()
        }
    }

    /**
     * Отменить запись.
     *
     * Сервер решает, чью запись можно отменить: мойщику — только свою.
     * После ответа перечитываем смену целиком, а не правим список на
     * месте: заработок, счётчик и сумма работ обязаны сойтись с сервером,
     * а не с нашим представлением о нём.
     */
    fun revoke(orderId: String) {
        viewModelScope.launch {
            runCatching {
                session.authed { token ->
                    api.call("orders/$orderId/cancel", method = "POST", token = token)
                }
            }
            reloadNow()
        }
    }

    fun retryQueued(ref: String) {
        queue.retry(ref)
        reload()
    }

    fun dropQueued(ref: String) = queue.drop(ref)

    /**
     * Табло открытой смены в шторке.
     *
     * Считает не сервер, а мы — и это единственный правильный способ:
     * только что записанная без связи машина уже лежит в очереди, и
     * прибавить её к счётчику может только приложение.
     */
    private fun syncBoard() {
        val shift = _ui.value.shift ?: return
        val tenant = session.tenant.value ?: return
        graph.shiftBoard.sync(shift, tenant, queue.waiting(tenant.id))
    }

    fun markWelcomeSeen() {
        viewModelScope.launch { session.markWelcomeSeen() }
    }
}
