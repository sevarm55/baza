package com.sevarm.tetr.feature.payroll

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sevarm.tetr.AppGraph
import com.sevarm.tetr.R
import com.sevarm.tetr.core.api.Failure
import com.sevarm.tetr.core.api.Payroll
import com.sevarm.tetr.core.api.PayrollPerson
import com.sevarm.tetr.core.api.field
import com.sevarm.tetr.core.api.jsonBody
import com.sevarm.tetr.core.i18n.Dates
import com.sevarm.tetr.core.i18n.L
import com.sevarm.tetr.core.i18n.money
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.time.Instant

/**
 * Зарплаты.
 *
 * Экран построен вокруг РАБОЧЕГО ДНЯ, а не вокруг человека и не вокруг
 * кнопки. Причина простая: рассчитываются днями. «За вчера отдал, за
 * сегодня нет» — фраза из жизни, а «Валоду отдал шесть тысяч из
 * тринадцати» — нет: вторая требует держать в голове, за что именно шесть,
 * и ровно на этом возникает спор, ради устранения которого продукт и
 * написан.
 *
 * Считает сервер, и тем же кодом, что для кабинета: лист приходит готовым.
 * Складывать эти числа на телефоне было бы не только лишней работой — по
 * старому `due` закрытый день вообще не отличить от дня, где мыли по
 * нулевой ставке, оба приходят нулём.
 */
class PayrollViewModel(private val graph: AppGraph) : ViewModel() {

    private val session = graph.session
    private val api = graph.api

    /** Человек и рабочий день, за который платят. */
    data class Pick(
        val staffId: String,
        val day: String,
        val name: String,
        val amount: Int,
    )

    enum class Tab { DUE, HISTORY }

    data class UiState(
        val payroll: Payroll? = null,
        val loaded: Boolean = false,
        val tab: Tab = Tab.DUE,
        /** что отмечено к выплате: `день|человек` */
        val picked: Set<String> = emptySet(),
        /** у каких строк раскрыто разложение по машинам */
        val opened: Set<String> = emptySet(),
        /** какие закрытые дни развернули обратно в полную карточку */
        val openedDays: Set<String> = emptySet(),
        val showClosed: Boolean = false,
        val settling: Boolean = false,
        /**
         * Идёт сверка с сервером, а долг уже на экране.
         *
         * Отдельно от `loaded`: первая загрузка и обновление — разные
         * состояния. На первой экран показывает места строк, на второй
         * не трогает ничего и только держит системный индикатор
         * потягивания, пока ответ не пришёл.
         */
        val refreshing: Boolean = false,
        val note: String? = null,
        val failure: String? = null,
    )

    private val _ui = MutableStateFlow(UiState())
    val ui: StateFlow<UiState> = _ui.asStateFlow()

    fun setTab(tab: Tab) = update { it.copy(tab = tab) }
    fun toggleClosed() = update { it.copy(showClosed = !it.showClosed) }

    fun toggleOpen(key: String) = update {
        it.copy(opened = if (key in it.opened) it.opened - key else it.opened + key)
    }

    fun openDay(day: String) = update { it.copy(openedDays = it.openedDays + day) }

    fun togglePick(key: String) = update {
        it.copy(picked = if (key in it.picked) it.picked - key else it.picked + key)
    }

    /** Закрыть день целиком: часто нужно, но выбор делает человек. */
    fun pickAll(keys: List<String>) = update { it.copy(picked = it.picked + keys) }

    fun reload() {
        viewModelScope.launch { reloadNow() }
    }

    suspend fun reloadNow() {
        update { it.copy(refreshing = true) }
        try {
            val fresh = session.authed { token -> api.send<Payroll>("payroll", token = token) }
            update { it.copy(payroll = fresh, failure = null, loaded = true, refreshing = false) }
        } catch (e: CancellationException) {
            update { it.copy(refreshing = false) }
            throw e
        } catch (e: Exception) {
            update { it.copy(failure = Failure.text(e), loaded = true, refreshing = false) }
        }
    }

    /**
     * Отдать деньги.
     *
     * Списком, а не запросом на каждого: момент выдачи ставит сервер один
     * раз, и в истории это ложится одной выдачей.
     */
    fun settle(items: List<Pick>, currency: String, lang: com.sevarm.tetr.core.i18n.Lang) {
        if (items.isEmpty() || _ui.value.settling) return
        viewModelScope.launch {
            update { it.copy(settling = true) }
            try {
                session.authed { token ->
                    api.call(
                        "payouts",
                        method = "POST",
                        body = jsonBody {
                            field(
                                "items",
                                JsonArray(
                                    items.map { pick ->
                                        JsonObject(
                                            mapOf(
                                                "staffId" to JsonPrimitive(pick.staffId),
                                                "day" to JsonPrimitive(pick.day),
                                            )
                                        )
                                    }
                                ),
                            )
                        },
                        token = token,
                    )
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                /*
                 * Часть расчётов могла лечь до сбоя: перечитываем лист и
                 * снимаем отметки, иначе следующее нажатие заплатит дважды.
                 */
                update { it.copy(settling = false, picked = emptySet()) }
                show(L(R.string.payroll__failed))
                reloadNow()
                return@launch
            }

            val total = items.sumOf { it.amount }
            update { it.copy(settling = false, picked = emptySet()) }
            /*
             * Сообщение обязательно: после расчёта строки исчезают, экран
             * меняется сам, и без единого слова непонятно, случилось это от
             * нажатия или что-то сломалось.
             */
            show(L(R.string.payroll__done, money(total, currency, lang)))
            reloadNow()
        }
    }

    private fun show(text: String) {
        update { it.copy(note = text) }
        viewModelScope.launch {
            delay(4000)
            update { if (it.note == text) it.copy(note = null) else it }
        }
    }

    // ─────────────────────────── разбор листа ───────────────────────────

    fun key(day: String, person: PayrollPerson): String = "$day|${person.staffId ?: "—"}"

    /** Отмеченное во всех днях сразу — по нему живёт причал. */
    fun allPicked(): List<Pick> {
        val days = _ui.value.payroll?.board?.days ?: return emptyList()
        return days.flatMap { day ->
            day.people.mapNotNull { person ->
                val staffId = person.staffId ?: return@mapNotNull null
                if (key(day.day, person) !in _ui.value.picked) return@mapNotNull null
                Pick(staffId, day.day, person.name ?: "—", person.earned)
            }
        }
    }

    /** `YYYY-MM-DD` сегодняшнего дня в поясе мойки. */
    fun today(): String = Dates.dayKey(Instant.now(), Dates.zone(session.tenant.value?.timezone))

    private inline fun update(block: (UiState) -> UiState) {
        _ui.value = block(_ui.value)
    }
}
