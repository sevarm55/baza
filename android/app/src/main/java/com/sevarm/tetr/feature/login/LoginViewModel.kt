package com.sevarm.tetr.feature.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sevarm.tetr.AppGraph
import com.sevarm.tetr.R
import com.sevarm.tetr.core.api.Api
import com.sevarm.tetr.core.api.ApiException
import com.sevarm.tetr.core.api.Failure
import com.sevarm.tetr.core.i18n.L
import com.sevarm.tetr.core.phone.Countries
import com.sevarm.tetr.core.phone.Country
import com.sevarm.tetr.core.session.RememberedAccount
import com.sevarm.tetr.core.session.Session
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.Instant

/**
 * Вход.
 *
 * ДВЕРЕЙ ДВЕ, И ОНИ НЕ РАВНЫ. Главная — телефон и код из SMS: ею входят
 * владельцы, и ею же входит тот, кто забыл свой код. Вторая — телефон и
 * PIN: ею входят мойщики, которым аккаунт завёл владелец, и она остаётся,
 * когда SMS не идёт. Единственной дверью код из SMS делать нельзя:
 * оператор ложится, роуминг отваливается, а мойка в этот момент не должна
 * закрываться.
 *
 * Почему код из SMS главный, хотя SMS дороже и медленнее. До него у
 * владельца, заведшего мойку на сайте, PIN не появлялся вовсе: входит он
 * кодом, и в базе у него стоит метка «кода нет». Приложение при этом
 * умело только PIN — то есть такой владелец не мог войти сюда никогда и
 * ничем. Не «неудобно», а «нельзя».
 *
 * Ответ на знакомый и незнакомый номер одинаковый, и это правило, а не
 * оформление: как только они различаются, форма превращается в справочник
 * зарегистрированных.
 */
class LoginViewModel(private val graph: AppGraph) : ViewModel() {

    private val session: Session = graph.session

    /**
     * Кто пришёл.
     *
     * Регистрация это всегда владелец: сотрудника заводит хозяин мойки,
     * сам себя он завести не может.
     */
    enum class Who { OWNER, STAFF }

    /**
     * Чем входит владелец.
     *
     * У сотрудника способ один, и переключать ему нечего: номер ему заводит
     * владелец, подтверждённым тот не становится, а SMS уходит только на
     * подтверждённый.
     */
    enum class Method { SMS, CODE }

    /** Что сейчас на экране. */
    sealed interface Stage {
        /** учётные данные: роль, номер и, если надо, код доступа */
        data object Entry : Stage

        /** забыл код доступа: телефон, чтобы выслать SMS */
        data object Reset : Stage

        /** ждём шесть цифр */
        data class Code(val waiting: Waiting) : Stage

        /** код восстановления сошёлся, осталось придумать новый */
        data class NewPin(val ticket: String) : Stage

        /** номер свободен: осталось назвать мойку */
        data class Name(val ticket: String) : Stage

        /** код сменён, входить надо им */
        data object Done : Stage
    }

    /** Заявка на код: чем подтверждать и зачем её заводили. */
    data class Waiting(
        val purpose: Purpose,
        val id: String,
        /** куда ушёл код — номер закрытый, как его прислал сервер */
        val phone: String,
        /** раньше этого момента повтор не сработает; правило держит сервер */
        val resendAt: Instant,
    ) {
        enum class Purpose { ENTRY, STEP_UP, RESET }
    }

    data class UiState(
        val stage: Stage = Stage.Entry,
        /**
         * Первый вопрос экрана — «кто вы», а не «каким кодом».
         *
         * Владельцу по умолчанию шлём код из SMS, потому что помнить ему
         * нечего; сотруднику сразу показываем оба поля, потому что код
         * доступа ему уже выдали.
         */
        val who: Who = Who.OWNER,
        val method: Method = Method.SMS,
        val country: Country = Countries.default,
        val phone: String = "",
        val pin: String = "",
        val code: String = "",
        val newPin: String = "",
        val repeatPin: String = "",
        val businessName: String = "",
        val ownerName: String = "",
        val busy: Boolean = false,
        val error: String? = null,
        /**
         * Человек попросил другой аккаунт: сохранённый профиль больше не
         * показываем до следующего запуска.
         */
        val manual: Boolean = false,
    ) {
        /**
         * Расходятся ли уже набранные части нового кода.
         *
         * Пока повтор короче нового, молчим: ругаться на второй цифре из
         * шести значит ругаться на человека, который ещё печатает.
         */
        val mismatch: Boolean
            get() = repeatPin.isNotEmpty() && repeatPin.length >= newPin.length && newPin != repeatPin

        /**
         * Имя короче двух знаков сервер не примет — гасим кнопку здесь,
         * чтобы отказ не приходил после нажатия.
         */
        val namesReady: Boolean
            get() = businessName.trim().length >= 2 && ownerName.trim().length >= 2

        val canSendPhone: Boolean get() = phone.isNotBlank() && !busy

        /**
         * Минимум четыре, а не шесть: столько цифр у всех, кто завёл
         * аккаунт до перехода на шестизначный код. Требовать шесть значило
         * бы запереть их снаружи. Длину НОВОГО кода проверяет сервер.
         */
        val canSubmitPin: Boolean
            get() = phone.isNotBlank() && pin.length >= Api.PIN_MIN_LENGTH && !busy

        val canConfirmCode: Boolean get() = code.length == Api.CODE_LENGTH && !busy

        val canSaveNewPin: Boolean
            get() = newPin.length == Api.PIN_LENGTH && newPin == repeatPin && !busy
    }

    private val _ui = MutableStateFlow(UiState())
    val ui: StateFlow<UiState> = _ui.asStateFlow()

    val rememberedAccount: StateFlow<RememberedAccount?> = session.rememberedAccount

    init {
        // сохранённого нет — сразу показываем форму, а не пустое место
        if (session.rememberedAccount.value == null) _ui.value = _ui.value.copy(manual = true)
    }

    // ─────────────────────────── ввод ───────────────────────────

    fun setCountry(value: Country) = update { it.copy(country = value) }
    fun setPhone(value: String) = update { it.copy(phone = value) }
    fun setPin(value: String) = update { it.copy(pin = value) }
    fun setCode(value: String) = update { it.copy(code = value) }
    fun setNewPin(value: String) = update { it.copy(newPin = value) }
    fun setRepeatPin(value: String) = update { it.copy(repeatPin = value) }
    fun setBusinessName(value: String) = update { it.copy(businessName = value) }
    fun setOwnerName(value: String) = update { it.copy(ownerName = value) }

    /** Сменить шаг, погасив то, что от прежнего осталось. */
    fun go(next: Stage) = update {
        it.copy(
            stage = next,
            error = null,
            code = "",
            pin = if (next is Stage.Entry) it.pin else "",
            newPin = "",
            repeatPin = "",
            /*
             * Названия держим, пока человек на своём шаге: отказ сервера по
             * одному из полей не должен стирать оба.
             */
            businessName = if (next is Stage.Name) it.businessName else "",
            ownerName = if (next is Stage.Name) it.ownerName else "",
        )
    }

    fun useAnotherAccount() = update { it.copy(manual = true) }

    /**
     * Смена роли.
     *
     * Фокус НЕ трогаем: поле телефона одно на оба состояния и никуда не
     * девается — если клавиатура была открыта, она такой и остаётся, а
     * номер остаётся набранным.
     *
     * Сотрудник входит кодом доступа всегда. Возвращаясь к владельцу,
     * отдаём ему главную дверь: код придёт сам.
     */
    fun setWho(value: Who) = update {
        if (it.who == value) it else it.copy(
            who = value,
            method = if (value == Who.STAFF) Method.CODE else Method.SMS,
            error = null,
            pin = "",
        )
    }

    /** Сменить дверь, не трогая набранный номер. */
    fun setMethod(value: Method) = update {
        it.copy(method = value, error = null, pin = "")
    }

    /**
     * Досдача кода после кода доступа возвращает к нему же, всё остальное —
     * к началу своей двери. Возврат «куда-нибудь» заставил бы человека
     * проходить сценарий заново из-за одного нажатия.
     */
    fun backFromCode(waiting: Waiting) = when (waiting.purpose) {
        Waiting.Purpose.STEP_UP -> {
            update { it.copy(method = Method.CODE) }
            go(Stage.Entry)
        }
        Waiting.Purpose.ENTRY -> {
            update { it.copy(method = Method.SMS) }
            go(Stage.Entry)
        }
        Waiting.Purpose.RESET -> go(Stage.Reset)
    }

    // ─────────────────────────── запросы ───────────────────────────

    fun sendEntryCode() = run {
        val state = _ui.value
        val started = session.beginEntry(state.country.e164(state.phone))
        go(
            Stage.Code(
                Waiting(
                    purpose = Waiting.Purpose.ENTRY,
                    id = started.challengeId,
                    phone = started.phone.orEmpty(),
                    resendAt = started.resendAt,
                )
            )
        )
    }

    fun sendResetCode() = run {
        val state = _ui.value
        val started = session.beginPinReset(state.country.e164(state.phone))
        go(
            Stage.Code(
                Waiting(
                    purpose = Waiting.Purpose.RESET,
                    id = started.challengeId,
                    phone = started.phone.orEmpty(),
                    resendAt = started.resendAt,
                )
            )
        )
    }

    fun submitPin() {
        val state = _ui.value
        if (state.busy) return
        viewModelScope.launch {
            busy(true)
            try {
                session.signIn(state.country.e164(state.phone), state.pin)
            } catch (e: ApiException) {
                /*
                 * Не отказ, а второй шаг: код подошёл, устройство сервер
                 * видит впервые. Экран меняется, а не показывает ошибку —
                 * человек всё сделал правильно.
                 */
                val id = e.challengeId
                if (e.code == "STEP_UP_REQUIRED" && id != null) {
                    go(
                        Stage.Code(
                            Waiting(
                                purpose = Waiting.Purpose.STEP_UP,
                                id = id,
                                phone = e.maskedPhone.orEmpty(),
                                /*
                                 * Сервер прислал заявку, но не сказал,
                                 * когда можно повторить: у входа поле не
                                 * предусмотрено. Берём первую паузу — ту
                                 * же, что стоит на сервере.
                                 */
                                resendAt = Instant.now().plusSeconds(45),
                            )
                        )
                    )
                } else {
                    update { it.copy(pin = "", error = Failure.auth(e)) }
                }
            } catch (e: Exception) {
                update { it.copy(error = Failure.text(e)) }
            } finally {
                busy(false)
            }
        }
    }

    fun confirm(waiting: Waiting) {
        val state = _ui.value
        if (state.busy || state.code.length != Api.CODE_LENGTH) return
        viewModelScope.launch {
            busy(true)
            try {
                when (waiting.purpose) {
                    Waiting.Purpose.STEP_UP ->
                        session.completeStepUp(waiting.id, state.code)

                    Waiting.Purpose.ENTRY -> {
                        /*
                         * Пропуск означает, что номер свободен: аккаунта
                         * под него нет, и осталось спросить название
                         * мойки. Пусто — человек уже внутри.
                         */
                        val ticket = session.completeEntry(waiting.id, state.code)
                        if (ticket != null) go(Stage.Name(ticket))
                    }

                    Waiting.Purpose.RESET -> {
                        val ticket = session.checkResetCode(waiting.id, state.code)
                        go(Stage.NewPin(ticket))
                    }
                }
            } catch (e: ApiException) {
                val text = Failure.auth(e)
                /*
                 * Заявка сгорела — возвращаем к началу: другого честного
                 * пути отсюда нет, код нужен новый.
                 */
                if (e.code == "OTP_EXPIRED" || e.code == "OTP_TOO_MANY") {
                    backFromCode(waiting)
                    update { it.copy(error = text) }
                } else {
                    update { it.copy(code = "", error = text) }
                }
            } catch (e: Exception) {
                update { it.copy(code = "", error = Failure.text(e)) }
            } finally {
                busy(false)
            }
        }
    }

    fun resend(waiting: Waiting) = run {
        val again = session.resendCode(waiting.id)
        /*
         * Новая заявка приходит со своим идентификатором: у старой код уже
         * погашен, и подтверждать её нечем.
         */
        update {
            it.copy(
                stage = Stage.Code(waiting.copy(id = again.challengeId, resendAt = again.resendAt)),
                code = "",
            )
        }
    }

    fun saveNewPin(ticket: String) = run {
        session.completePinReset(ticket, _ui.value.newPin)
        go(Stage.Done)
    }

    /**
     * Завести мойку. Успех сам сменит экран: состояние сессии станет
     * «вошли», и корневой вид покажет продукт вместо входа.
     */
    fun createBusiness(ticket: String) = run {
        val state = _ui.value
        session.completeSignUp(ticket, state.businessName.trim(), state.ownerName.trim())
    }

    /**
     * Быстрый вход по сохранённому профилю.
     *
     * Проверка владельца телефона идёт до этого, на экране: биометрия
     * требует Activity, и модели о ней знать незачем.
     */
    fun resumeRemembered(account: RememberedAccount, onFallback: (String) -> Unit) {
        viewModelScope.launch {
            busy(true)
            try {
                session.resumeRemembered()
            } catch (e: Exception) {
                fallBackToManual(account)
                onFallback(L(R.string.auth__rememberedExpiredPin))
            } finally {
                busy(false)
            }
        }
    }

    /**
     * Сохранённый вход не сработал: открываем форму с уже подставленным
     * номером. Дверь при этом PIN-овая — человек, у которого сохранён
     * вход, свой код знает, и лишняя SMS ему ни к чему.
     */
    fun fallBackToManual(account: RememberedAccount, why: String? = null) {
        val (country, national) = Countries.guess(account.phone)
        update {
            it.copy(
                manual = true,
                stage = Stage.Entry,
                /* Дверь кодовая: человек, у которого сохранён вход, свой
                   код знает, и лишняя SMS ему ни к чему. */
                method = Method.CODE,
                country = country,
                phone = national,
                pin = "",
                error = why,
            )
        }
    }

    fun showError(text: String) = update { it.copy(error = text) }

    // ─────────────────────────── обвязка ───────────────────────────

    /** Общая обвязка запроса: занятость, гашение прежней ошибки, разбор. */
    private fun run(work: suspend () -> Unit) {
        if (_ui.value.busy) return
        viewModelScope.launch {
            busy(true)
            try {
                work()
            } catch (e: ApiException) {
                update { it.copy(error = Failure.auth(e)) }
            } catch (e: Exception) {
                update { it.copy(error = Failure.text(e)) }
            } finally {
                busy(false)
            }
        }
    }

    private fun busy(on: Boolean) = update { it.copy(busy = on, error = if (on) null else it.error) }

    private inline fun update(block: (UiState) -> UiState) {
        _ui.value = block(_ui.value)
    }
}
