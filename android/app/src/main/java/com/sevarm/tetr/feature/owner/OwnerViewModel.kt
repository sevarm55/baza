package com.sevarm.tetr.feature.owner

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sevarm.tetr.AppGraph
import com.sevarm.tetr.core.api.Alert
import com.sevarm.tetr.core.api.Alerts
import com.sevarm.tetr.core.api.ApiException
import com.sevarm.tetr.core.api.Failure
import com.sevarm.tetr.core.api.StaffLine
import com.sevarm.tetr.core.api.Summary
import com.sevarm.tetr.core.api.field
import com.sevarm.tetr.core.api.jsonBody
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Кабинет владельца.
 *
 * Экран отвечает на шесть вопросов в том порядке, в каком их задают:
 * сколько мне осталось → сколько принесли → сколько ушло людям и на
 * расходы → сколько машин → чем платили → что было последним.
 *
 * Ни одно число здесь не считается на телефоне: период целиком приходит с
 * сервера, посчитанный тем же кодом, что и кабинет в браузере. Сводка,
 * расходящаяся с кабинетом хотя бы на драм, не читается вовсе.
 */
class OwnerViewModel(private val graph: AppGraph) : ViewModel() {

    private val session = graph.session
    private val api = graph.api

    data class UiState(
        val summary: Summary? = null,
        /** Что выбрано в переключателе прямо сейчас. */
        val period: String = TODAY,
        /**
         * Период тех цифр, которые УЖЕ пришли.
         *
         * Выбор меняется сразу, но подписи старых данных не имеют права
         * называться новым периодом, пока его ответ ещё в пути.
         */
        val loadedPeriod: String = TODAY,
        val alerts: List<Alert> = emptyList(),
        val loading: Boolean = false,
        val failure: String? = null,
        /** Чем платили — фильтр журнала; пусто значит «всеми». */
        val feedMethod: String? = null,
        val newestFeedId: String? = null,
    ) {
        val isLoss: Boolean get() = (summary?.profit ?: 0) < 0
    }

    private val _ui = MutableStateFlow(UiState())
    val ui: StateFlow<UiState> = _ui.asStateFlow()

    /**
     * Номер загрузки.
     *
     * Экран открывают и сразу переключают период — два запроса идут
     * одновременно, и стартовавший раньше может ответить позже. Без
     * счётчика на экране окажутся цифры не того периода, который выбран, и
     * заметить это невозможно.
     */
    private var loadId = 0

    fun selectPeriod(next: String) {
        if (next == _ui.value.period) return
        _ui.value = _ui.value.copy(period = next)
        reload()
    }

    fun setFeedMethod(method: String?) {
        _ui.value = _ui.value.copy(feedMethod = method)
    }

    fun clearHighlight() {
        _ui.value = _ui.value.copy(newestFeedId = null)
    }

    fun reload() {
        viewModelScope.launch { reloadNow() }
    }

    suspend fun reloadNow() {
        loadId += 1
        val id = loadId
        val requested = _ui.value.period
        _ui.value = _ui.value.copy(loading = true)

        /*
         * Поводы тянем вместе со сводкой и молча: колокольчик — не то,
         * ради чего открывают экран, и его отказ не должен мешать показать
         * выручку.
         */
        viewModelScope.launch {
            val fresh = runCatching {
                session.authed { token -> api.send<Alerts>("alerts", token = token) }
            }.getOrNull()
            if (fresh != null) _ui.value = _ui.value.copy(alerts = fresh.alerts)
        }

        try {
            val fresh = session.authed { token ->
                api.send<Summary>("summary?period=$requested", token = token)
            }
            // ответ не того периода или отменённая загрузка — на экран не идут
            if (id != loadId || requested != _ui.value.period) return

            val oldIds = _ui.value.summary?.feed?.map { it.id }?.toSet() ?: emptySet()
            val inserted =
                if (_ui.value.summary == null) null
                else fresh.feed.firstOrNull { it.id !in oldIds }

            _ui.value = _ui.value.copy(
                summary = fresh,
                loadedPeriod = requested,
                newestFeedId = inserted?.id,
                failure = null,
                loading = false,
            )
        } catch (e: CancellationException) {
            /*
             * Потянули вниз и отпустили, или ушли с экрана. Ничего не
             * сломалось — и экран об этом молчит: прежнее содержимое
             * остаётся на месте.
             */
            throw e
        } catch (e: ApiException) {
            /*
             * Нули вместо выручки — худшее, что может показать этот экран:
             * неверные данные выглядят как верные, и владелец принимает
             * решение по ним. Лучше честно ничего.
             */
            _ui.value = _ui.value.copy(
                failure = Failure.text(e),
                period = _ui.value.loadedPeriod,
                loading = false,
            )
        } catch (e: Exception) {
            _ui.value = _ui.value.copy(
                failure = Failure.text(e),
                period = _ui.value.loadedPeriod,
                loading = false,
            )
        }
    }

    /**
     * Отменить запись.
     *
     * Отмена мягкая: запись остаётся в истории и в аудите, но перестаёт
     * попадать в выручку и зарплату. Поэтому и спрашиваем — вернуть её
     * обратно нельзя.
     */
    fun cancel(orderId: String) {
        viewModelScope.launch {
            runCatching {
                session.authed { token ->
                    api.call("orders/$orderId/cancel", method = "POST", token = token)
                }
            }
            reloadNow()
        }
    }

    /** Отложить повод на неделю. Он вернётся, если ничего не изменилось. */
    fun snooze(key: String) {
        viewModelScope.launch {
            val fresh = runCatching {
                session.authed { token ->
                    api.send<Alerts>(
                        "alerts",
                        method = "POST",
                        body = jsonBody { field("key", key) },
                        token = token,
                    )
                }
            }.getOrNull()
            if (fresh != null) _ui.value = _ui.value.copy(alerts = fresh.alerts)
        }
    }

    fun hideSetup() {
        viewModelScope.launch {
            session.hideSetup()
            reloadNow()
        }
    }

    /**
     * Кто сегодня работает и сколько ему за это причитается.
     *
     * Список объединённый, а не два подряд. Человек, который встал на
     * смену час назад и ещё ничего не намыл, в `byStaff` не попадает
     * вовсе — по записям его не видно, а на площадке он стоит. И
     * наоборот: тот, кто отработал утро и ушёл, из `onShift` уже пропал,
     * но его деньги за день никуда не делись.
     *
     * Порядок по состоянию: сначала те, кто на смене, потом отработавшие.
     * Внутри — по заработку. Вопрос «кто сейчас на посту» задают чаще, чем
     * «кто заработал больше».
     */
    fun crew(summary: Summary): List<CrewLine> {
        val worked: List<StaffLine> = summary.stats.byStaff.orEmpty()
        val present = summary.onShift.map { it.userId }.toSet()

        /*
         * Себя владелец в списке работающих не видит, пока сам ничего не
         * намыл. Он открыл смену, чтобы принимать машины, — и строка «Вы,
         * 0 машин, 0 ֏» первой сверху была отчётом о собственном
         * бездействии, а не сводкой по людям. Как только запись за ним
         * появится, строка встанет на место наравне со всеми: там она уже
         * про деньги.
         */
        val meId = session.me.value?.id

        val here = summary.onShift.filter { person ->
            person.userId != meId || worked.any { it.staffId == person.userId && it.count > 0 }
        }.map { person ->
            val line = worked.firstOrNull { it.staffId == person.userId }
            CrewLine(
                id = person.userId,
                name = person.name,
                present = true,
                count = line?.count ?: 0,
                earned = line?.earned ?: 0,
            )
        }

        val gone = worked
            .filter { line -> line.staffId?.let { it !in present } ?: true }
            .map { line ->
                CrewLine(
                    id = line.staffId ?: "—",
                    name = line.name ?: "—",
                    present = false,
                    count = line.count,
                    earned = line.earned,
                )
            }

        return (here + gone).sortedWith(
            compareByDescending<CrewLine> { it.present }.thenByDescending { it.earned }
        )
    }

    /** Человек в сегодняшнем дне: на смене или уже отработавший. */
    data class CrewLine(
        val id: String,
        val name: String,
        val present: Boolean,
        val count: Int,
        val earned: Int,
    )

    companion object {
        const val TODAY = "today"
        const val MONTH = "month"
        const val PREV_MONTH = "prevmonth"
    }
}
