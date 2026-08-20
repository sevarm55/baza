package com.sevarm.tetr.core.session

import android.content.Context
import android.os.Build
import com.sevarm.tetr.core.api.Access
import com.sevarm.tetr.core.api.ApiClient
import com.sevarm.tetr.core.api.ApiException
import com.sevarm.tetr.core.api.CrewMate
import com.sevarm.tetr.core.api.Bootstrap
import com.sevarm.tetr.core.api.Challenge
import com.sevarm.tetr.core.api.Devices
import com.sevarm.tetr.core.api.EntryResult
import com.sevarm.tetr.core.api.LoginResult
import com.sevarm.tetr.core.api.Me
import com.sevarm.tetr.core.api.PhoneProof
import com.sevarm.tetr.core.api.Point
import com.sevarm.tetr.core.api.ResetTicket
import com.sevarm.tetr.core.api.Service
import com.sevarm.tetr.core.api.Switched
import com.sevarm.tetr.core.api.Tenant
import com.sevarm.tetr.core.api.Tokens
import com.sevarm.tetr.core.api.field
import com.sevarm.tetr.core.api.jsonBody
import com.sevarm.tetr.core.api.optional
import com.sevarm.tetr.core.i18n.LangStore
import com.sevarm.tetr.core.queue.OrderQueue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.util.UUID

/** Только лицо сохранённого входа. PIN и токены сюда не попадают. */
@Serializable
data class RememberedAccount(val name: String, val phone: String, val tenant: String)

/**
 * Состояние входа и всё, что зависит от сервера.
 *
 * Один объект на приложение. Он же владеет токенами и он же умеет их
 * обновлять: если access протух посреди запроса, повтор происходит здесь,
 * а экраны об этом не знают вовсе — иначе обработка 401 расползлась бы по
 * каждому месту, где что-то запрашивается.
 */
class Session(
    context: Context,
    private val api: ApiClient,
    private val secure: SecureStore,
    private val langStore: LangStore,
    private val scope: CoroutineScope,
    /** Что делать с уведомлениями при выходе и переходе. Ставится позже. */
    var push: PushHooks? = null,
    /** Открытая смена на экране блокировки. Ставится позже. */
    var shiftBoard: ShiftBoardHooks? = null,
) {
    enum class State { CHECKING, SIGNED_OUT, SIGNED_IN }

    /** Что делать с токеном устройства. Реализация живёт в `core/push`. */
    interface PushHooks {
        suspend fun revoke()
        suspend fun reupload()
    }

    /** Открытая смена в шторке. Реализация живёт в `core/push`. */
    interface ShiftBoardHooks {
        fun endAll()
    }

    private val prefs = context.getSharedPreferences("tetr.login", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true }

    private val _state = MutableStateFlow(State.CHECKING)
    val state: StateFlow<State> = _state.asStateFlow()

    private val _tenant = MutableStateFlow<Tenant?>(null)
    val tenant: StateFlow<Tenant?> = _tenant.asStateFlow()

    private val _me = MutableStateFlow<Me?>(null)
    val me: StateFlow<Me?> = _me.asStateFlow()

    private val _access = MutableStateFlow<Access?>(null)
    val access: StateFlow<Access?> = _access.asStateFlow()

    private val _services = MutableStateFlow<List<Service>>(emptyList())
    val services: StateFlow<List<Service>> = _services.asStateFlow()

    /** Точки человека. Одна или ни одной — переключателя нет вовсе. */
    private val _points = MutableStateFlow<List<Point>>(emptyList())
    val points: StateFlow<List<Point>> = _points.asStateFlow()

    /**
     * Совместная работа: одну машину моют вдвоём-втроём.
     *
     * `teamPercent` — ставка на всю команду. Пусто означает, что свойство у
     * бизнеса не включено, и экран записи не показывает ни одного нового
     * пикселя.
     *
     * Список коллег приезжает с bootstrap, а не отдельным запросом: его
     * спрашивают в момент записи машины, во дворе, где связи может не
     * быть, — пауза там дороже всего.
     */
    private val _teamPercent = MutableStateFlow<Int?>(null)
    val teamPercent: StateFlow<Int?> = _teamPercent.asStateFlow()

    private val _mates = MutableStateFlow<List<CrewMate>>(emptyList())
    val mates: StateFlow<List<CrewMate>> = _mates.asStateFlow()

    /**
     * Читал ли человек приветствие первого входа и убрал ли он «Начало
     * работы».
     *
     * Отдельно от `me`, хотя приезжают вместе с ним: `Me` — это ответ
     * сервера, неизменный слепок, а эти два меняются прямо на экране.
     * Закрыл приветствие — окно не должно вернуться при следующем открытии
     * вкладки, не дожидаясь нового bootstrap.
     *
     * Оба по умолчанию «уже сделано»: пока сервер не ответил, ничего не
     * показываем. Лишний раз не показать приветствие лучше, чем показать
     * его тому, кто работает в продукте полгода.
     */
    private val _welcomeSeen = MutableStateFlow(true)
    val welcomeSeen: StateFlow<Boolean> = _welcomeSeen.asStateFlow()

    private val _setupHidden = MutableStateFlow(false)
    val setupHidden: StateFlow<Boolean> = _setupHidden.asStateFlow()

    private val _rememberedAccount = MutableStateFlow<RememberedAccount?>(null)
    val rememberedAccount: StateFlow<RememberedAccount?> = _rememberedAccount.asStateFlow()

    /**
     * Счётчик смены точки.
     *
     * По нему всё дерево экранов пересоздаётся: состояние обнуляется,
     * загрузки перезапускаются, ответы прежней мойки, которые ещё летят,
     * приземляются в выброшенный вид.
     *
     * Иначе ошибка выглядела бы не ошибкой: на экране правильные цифры,
     * просто чужие. Заметить это невозможно — а поверить легко.
     */
    private val _generation = MutableStateFlow(0)
    val generation: StateFlow<Int> = _generation.asStateFlow()

    /**
     * Быстрый возврат после явного выхода.
     *
     * По умолчанию ВЫКЛЮЧЕН: телефон на мойке нередко общий, а
     * сохранённый вход возвращает в кабинет одним касанием. Включает это
     * человек сам, в своём профиле.
     */
    private val _rememberLogin = MutableStateFlow(prefs.getBoolean(KEY_REMEMBER, false))
    val rememberLogin: StateFlow<Boolean> = _rememberLogin.asStateFlow()

    private var accessToken: String? = null
        set(value) {
            field = value
            secure["access"] = value
        }

    private var refreshToken: String? = null
        set(value) {
            field = value
            secure["refresh"] = value
        }

    val canSwitch: Boolean get() = _points.value.size > 1

    /** Есть ли у человека PIN. Нет — он завёл мойку по коду из SMS. */
    val hasPin: Boolean get() = _me.value?.pinSet ?: true

    /** Доказан ли номер кодом из SMS. */
    val phoneVerified: Boolean get() = _me.value?.phoneProven ?: true

    init {
        accessToken = secure["access"]
        refreshToken = secure["refresh"]
        _rememberedAccount.value = loadRemembered()
    }

    // ═══════════════════════════ запуск ═══════════════════════════

    /**
     * Пуск: есть ли живой вход. Токен мог протухнуть, пока приложение не
     * открывали, — тогда молча обновляем и идём дальше.
     */
    suspend fun start() {
        if (refreshToken == null) {
            _state.value = State.SIGNED_OUT
            return
        }

        /*
         * Сначала поднимаем последний известный слепок бизнеса, и только
         * потом идём в сеть.
         *
         * Два следствия, и оба важные. Приложение открывается сразу, с
         * названием мойки и словами ниши на кнопках, а не с пустым
         * ожиданием. И, главное, пуск БЕЗ СВЯЗИ больше не выкидывает
         * наружу: раньше отказ `bootstrap` по любой причине означал
         * «выйти», то есть мойщик в подвале с живой сессией оказывался на
         * экране входа и войти оттуда не мог — сеть-то нужна и для входа.
         * Ровно там, где офлайн обязан работать, продукт закрывался.
         */
        val cached = restoreBootstrap()
        if (cached != null) {
            apply(cached)
            _state.value = State.SIGNED_IN
        }

        try {
            loadBootstrap()
            _state.value = State.SIGNED_IN
        } catch (e: CancellationException) {
            throw e
        } catch (e: ApiException) {
            /*
             * Связи нет — остаёмся там, где были: слепок на руках, очередь
             * работает, экраны сами скажут, что цифры несвежие. Выйти
             * заставляет только настоящий отказ: сессию отозвали, и
             * показывать по ней что-либо нельзя.
             */
            if (!(e.isOffline && cached != null)) forget(preserveRemembered = true)
        } catch (e: Exception) {
            if (cached == null) forget(preserveRemembered = true)
        }
    }

    // ═══════════════════════════ вход по PIN ═══════════════════════════

    suspend fun signIn(phone: String, pin: String) {
        val result: LoginResult = api.send(
            "auth/login",
            method = "POST",
            body = jsonBody {
                field("phone", phone)
                field("pin", pin)
                field("device", deviceName)
                /*
                 * Отпечаток установки. По нему сервер узнаёт своё
                 * устройство и не спрашивает код из SMS на каждом входе:
                 * заголовок у приложения один и тот же у всех, а этот
                 * идентификатор — только у этой установки.
                 */
                field("installId", installId)
                /*
                 * Язык, на котором придёт код из SMS. Берём тот, на
                 * котором человек видит приложение: получить армянское
                 * «никому не сообщайте» на русском интерфейсе — то же
                 * самое, что получить его на суахили.
                 */
                field("locale", locale)
            },
        )
        enter(result.access, result.refresh)
    }

    /**
     * Досдать код из SMS при входе с незнакомого устройства.
     *
     * Сюда экран попадает после `STEP_UP_REQUIRED`: PIN подошёл, но
     * устройство сервер видит впервые. Телефон и код повторно не
     * спрашиваются — заявка на сервере уже привязана к тому человеку, чей
     * код подошёл.
     */
    suspend fun completeStepUp(challengeId: String, code: String) {
        val result: LoginResult = api.send(
            "auth/step-up",
            method = "POST",
            body = jsonBody {
                field("challengeId", challengeId)
                field("code", code)
                field("device", deviceName)
            },
        )
        enter(result.access, result.refresh)
    }

    /**
     * Выслать код повторно.
     *
     * Паузу между отправками и их число держит СЕРВЕР (45 → 90 → 180
     * секунд, не больше трёх). Обратный отсчёт на экране — подсказка
     * человеку, а не правило, и берёт он её из ответа: заявка приходит
     * новая, со своим идентификатором и своим `resendAt`.
     */
    suspend fun resendCode(challengeId: String): Challenge = api.send(
        "auth/otp/resend",
        method = "POST",
        body = jsonBody { field("challengeId", challengeId) },
    )

    // ═══════════════════════ вход по коду из SMS ═══════════════════════

    /**
     * Главная дверь: телефон и код, без PIN.
     *
     * Одна дверь и для входа, и для тех, кого мы не знаем. Различать их до
     * кода нельзя: как только ответ на знакомый номер отличается от ответа
     * на незнакомый, форма превращается в справочник зарегистрированных.
     * Поэтому и здесь, и на сервере ответ один и тот же всегда — даже на
     * невозможный номер, только SMS тогда никуда не уходит.
     */
    suspend fun beginEntry(phone: String): Challenge = api.send(
        "auth/entry",
        method = "POST",
        body = jsonBody {
            field("phone", phone)
            field("locale", locale)
        },
    )

    /**
     * Код сошёлся. Дальше либо внутрь, либо к названию мойки.
     *
     * Возвращает пропуск, когда номер свободен: аккаунта под него нет, и
     * последнее, чего не хватает, — как называется мойка. Пусто — человек
     * уже внутри.
     */
    suspend fun completeEntry(challengeId: String, code: String): String? {
        val result: EntryResult = api.send(
            "auth/entry/verify",
            method = "POST",
            body = jsonBody {
                field("challengeId", challengeId)
                field("code", code)
                field("device", deviceName)
                field("installId", installId)
            },
        )
        val access = result.access
        val refresh = result.refresh
        if (access == null || refresh == null) return result.ticket
        enter(access, refresh)
        return null
    }

    /**
     * Последний шаг новичка: название мойки и имя владельца.
     *
     * PIN не спрашивается вовсе — входить человек будет кодом. Пропуск
     * подписан и обменивается один раз, иначе одна SMS заводила бы сколько
     * угодно моек.
     *
     * Ниша не спрашивается: продаётся автомойка, остальные конфиги —
     * заготовка и не предмет разговора с клиентом. Показать их списком
     * значило бы предложить то, чего мы не продаём.
     */
    suspend fun completeSignUp(ticket: String, businessName: String, ownerName: String) {
        val result: EntryResult = api.send(
            "auth/entry/verify",
            method = "POST",
            body = jsonBody {
                field("ticket", ticket)
                field("niche", NICHE)
                field("businessName", businessName)
                field("ownerName", ownerName)
                field("device", deviceName)
                field("installId", installId)
            },
        )
        val access = result.access ?: throw ApiException(500)
        val refresh = result.refresh ?: throw ApiException(500)
        enter(access, refresh)
    }

    // ═══════════════════════ восстановление кода ═══════════════════════

    /**
     * Три шага одним маршрутом, потому что это один сценарий: номер → код
     * → новый PIN. Шаг сервер определяет по тому, что прислали.
     *
     * Ответ на первом шаге одинаковый для знакомого и незнакомого номера.
     * Форма восстановления открыта без входа, и разница в ответах
     * превратила бы её в справочник зарегистрированных.
     */
    suspend fun beginPinReset(phone: String): Challenge = api.send(
        "auth/pin/reset",
        method = "POST",
        body = jsonBody {
            field("phone", phone)
            field("locale", locale)
        },
    )

    /** Проверить код и получить пропуск на смену кода. */
    suspend fun checkResetCode(challengeId: String, code: String): String {
        val result: ResetTicket = api.send(
            "auth/pin/reset",
            method = "POST",
            body = jsonBody {
                field("challengeId", challengeId)
                field("code", code)
            },
        )
        return result.ticket
    }

    /**
     * Назначить новый код.
     *
     * Сессию сервер здесь не выдаёт намеренно, и мы её не ждём: человек
     * только что назначил код — пусть войдёт им. Иначе восстановление
     * становится вторым способом войти, со своими правилами, и защищать
     * его придётся отдельно.
     */
    suspend fun completePinReset(ticket: String, pin: String) {
        api.call(
            "auth/pin/reset",
            method = "POST",
            body = jsonBody {
                field("ticket", ticket)
                field("pin", pin)
            },
        )
    }

    // ═══════════════════════ сохранённый вход ═══════════════════════

    fun setRememberLogin(on: Boolean) {
        _rememberLogin.value = on
        prefs.edit().putBoolean(KEY_REMEMBER, on).apply()
        if (on) rememberCurrentAccount() else clearRememberedAccount()
    }

    /**
     * Вход по сохранённому профилю.
     *
     * Перед этим экран входа подтверждает владельца отпечатком, лицом или
     * кодом устройства: сохранённый вход — это дверь без кода, и открывать
     * её должен тот, чей это телефон.
     */
    suspend fun resumeRemembered() {
        val stored = secure[KEY_REMEMBERED_REFRESH]
        if (!_rememberLogin.value || _rememberedAccount.value == null || stored == null) {
            throw ApiException(401, "NO_REMEMBERED_LOGIN")
        }

        accessToken = null
        refreshToken = stored

        try {
            renew()
            loadBootstrap()
            rememberCurrentAccount()
            _state.value = State.SIGNED_IN
        } catch (e: Throwable) {
            clearRememberedAccount()
            forget(preserveRemembered = false)
            throw e
        }
    }

    // ═══════════════════════════ профиль ═══════════════════════════

    /**
     * Сменить PIN. И задать его впервые, если кода не было.
     *
     * Сервер гасит все сессии — в этом смысл смены — и тут же выдаёт новую
     * пару на это устройство. Иначе человек, сменивший PIN, сам бы и
     * вылетел из приложения, а вышвырнуть надо было остальных.
     *
     * Пустой `current` не ошибка: у заведённых по SMS кода нет вовсе.
     * Решает не приложение, а сервер, и по хешу в базе, а не по тому, что
     * мы прислали, — присланный признак «у меня нет кода» был бы способом
     * сменить чужой код, не зная старого.
     */
    suspend fun changePin(current: String, next: String) {
        val issued: Tokens = authed { token ->
            api.send(
                "profile/pin",
                method = "POST",
                body = jsonBody {
                    field("next", next)
                    field("device", deviceName)
                    optional("current", current)
                },
                token = token,
            )
        }
        accessToken = issued.access
        refreshToken = issued.refresh
        // в профиле после этого стоит «сменить», а не «задать»
        runCatching { loadBootstrap() }
    }

    /**
     * Убрать код доступа совсем.
     *
     * Человек возвращается в то состояние, в котором живёт каждый, кто
     * завёл мойку по коду из SMS: постоянного кода нет, вход только
     * сообщением. Текущий код спрашивается обязательно — телефон бывает
     * разблокирован и лежит на мойке.
     *
     * Запертым после этого никто не остаётся: вход по коду из SMS работает
     * на любой номер, а подтверждение удаления бизнеса само переходит на
     * SMS. Остальные устройства выходят, это остаётся: сервер выдаёт новую
     * пару взамен погашенной.
     */
    suspend fun deletePin(current: String) {
        val issued: Tokens = authed { token ->
            api.send(
                "profile/pin",
                method = "DELETE",
                body = jsonBody {
                    field("current", current)
                    field("device", deviceName)
                },
                token = token,
            )
        }
        accessToken = issued.access
        refreshToken = issued.refresh
        // в профиле после этого стоит «создать», а не «изменить»
        runCatching { loadBootstrap() }
    }

    /** Имя человека и название бизнеса. */
    suspend fun saveProfile(name: String?, businessName: String?) {
        val body = jsonBody {
            name?.let { field("name", it) }
            businessName?.let { field("businessName", it) }
        }
        if (body.isEmpty()) return

        authed { token -> api.call("profile", method = "PATCH", body = body, token = token) }
        // название бизнеса стоит в заголовке экрана смены — перечитываем
        loadBootstrap()
    }

    suspend fun signOut() {
        // Смена не должна оставаться в шторке после выхода из чужого
        // аккаунта на общем телефоне мойки.
        shiftBoard?.endAll()

        // сначала отзываем токен устройства: телефон на мойке переходит из
        // рук в руки, и уведомления о чужой выручке приходить не должны
        runCatching { push?.revoke() }

        if (_rememberLogin.value) {
            /*
             * Это «уйти с экрана», а не забыть устройство. Живой refresh
             * остаётся только в защищённом хранилище и открывается с
             * проверкой самого устройства.
             */
            rememberCurrentAccount()
        } else {
            refreshToken?.let { token ->
                runCatching {
                    api.call("auth/logout", method = "POST", body = jsonBody { field("refresh", token) })
                }
            }
        }
        forget(preserveRemembered = _rememberLogin.value)
    }

    // ═══════════════════════ подтверждение номера ═══════════════════════

    /**
     * Выслать код на свой номер.
     *
     * Нужно тем, кому аккаунт завёл владелец: их номер не подтверждён, а
     * восстановление доступа по SMS работает только по подтверждённому —
     * иначе оно само стало бы способом забрать чужой непроверенный
     * аккаунт. Пока номер не доказан, забытый код для человека тупик.
     */
    suspend fun startPhoneProof(): Challenge = authed { token ->
        api.send(
            "auth/verify-phone",
            method = "POST",
            body = jsonBody { field("locale", locale) },
            token = token,
        )
    }

    /**
     * Подтвердить номер кодом. Успех перечитывает bootstrap: строка
     * предложения обязана уйти сразу, а не на следующем запуске.
     */
    suspend fun confirmPhone(challengeId: String, code: String) {
        authed { token ->
            api.call(
                "auth/verify-phone",
                method = "POST",
                body = jsonBody {
                    field("challengeId", challengeId)
                    field("code", code)
                },
                token = token,
            )
        }
        runCatching { loadBootstrap() }
    }

    // ═══════════════════════════ смена номера ═══════════════════════════

    /**
     * Смена номера телефона — три шага, и первый не у всех.
     *
     * Номер это логин, поэтому доказательств два и оба обязательные: кто
     * ты (PIN, а у кого его нет — код на текущий номер) и что новый номер
     * твой (код на него). Правила считает сервер тем же кодом, которым
     * живёт кабинет: приложение только спрашивает и показывает.
     */
    suspend fun startPhoneChangeProof(): PhoneProof = authed { token ->
        api.send("auth/phone", method = "POST", body = jsonBody { }, token = token)
    }

    /**
     * Шаг первый: доказать себя и назвать новый номер. В ответ — заявка на
     * код, который придёт уже на новый.
     */
    suspend fun startPhoneChange(
        phone: String,
        pin: String = "",
        proofId: String = "",
        proofCode: String = "",
    ): Challenge = authed { token ->
        api.send(
            "auth/phone",
            method = "POST",
            body = jsonBody {
                field("phone", phone)
                optional("pin", pin)
                if (proofId.isNotBlank()) {
                    field("proofId", proofId)
                    field("proofCode", proofCode)
                }
            },
            token = token,
        )
    }

    /**
     * Шаг последний: код с нового номера. Здесь номер и меняется.
     *
     * Сессию здесь НЕ гасим, хотя на сервере она уже мертва. Причина в
     * экране: выход мгновенно подменяет всё дерево видов входом, и лист со
     * словами «номер изменён, войдите заново» исчез бы вместе с профилем,
     * который его показывал. Человек видел бы, что его выкинуло, и не знал
     * бы, почему, — а причина ровно та, что он только что сделал сам.
     */
    suspend fun finishPhoneChange(challengeId: String, code: String) {
        authed { token ->
            api.call(
                "auth/phone",
                method = "POST",
                body = jsonBody {
                    field("challengeId", challengeId)
                    field("code", code)
                },
                token = token,
            )
        }
    }

    /**
     * Уйти на экран входа после смены номера.
     *
     * `forget`, а не `signOut`: гасить на сервере уже нечего, и запрос с
     * мёртвым токеном ушёл бы в пустоту. Запомненный аккаунт стираем — он
     * помнит СТАРЫЙ номер, и вход одним нажатием привёл бы туда, откуда
     * человек только что ушёл.
     */
    fun leaveAfterPhoneChange() {
        clearRememberedAccount()
        forget(preserveRemembered = false)
    }

    // ═══════════════════════════ устройства ═══════════════════════════

    /**
     * Откуда сейчас открыт вход.
     *
     * Телефон на мойке общий и переходит из рук в руки, а пара токенов
     * живёт тридцать дней. Пока этого списка не было, погасить чужой вход
     * можно было только сменой PIN — то есть вылетев самому.
     */
    suspend fun devices(): List<com.sevarm.tetr.core.api.Device> {
        val result: Devices = authed { token -> api.send("auth/devices", token = token) }
        return result.devices
    }

    /** Погасить вход. Гасить можно только своё — проверяет сервер. */
    suspend fun revokeDevice(id: String) {
        authed { token -> api.call("auth/devices/$id", method = "DELETE", token = token) }
    }

    // ═══════════════════════ удаление бизнеса ═══════════════════════

    /**
     * Выслать код подтверждения удаления — тем, у кого нет PIN.
     *
     * Чем подтверждать, решает сервер по состоянию аккаунта, а не
     * приложение: присланный им признак «у меня нет PIN» был бы способом
     * обойти PIN.
     */
    suspend fun startDeleteCode(): Challenge = authed { token ->
        api.send("account", method = "DELETE", body = jsonBody { }, token = token)
    }

    /**
     * Удалить бизнес насовсем.
     *
     * Подтверждение приходит одним из двух видов: PIN у тех, у кого он
     * есть, и код из SMS у заведённых по коду. Второй появился потому, что
     * первый для них неотвечаем: проверка PIN на метке «кода нет»
     * отказывает всегда, и удалить свой бизнес такой владелец не мог вовсе.
     *
     * Выходим через `forget`, а не через `signOut`: гасить сессию на
     * сервере уже некому и незачем — вместе с бизнесом удалились и она, и
     * сам пользователь.
     */
    suspend fun deleteBusiness(pin: String = "", challengeId: String = "", code: String = "") {
        authed { token ->
            api.call(
                "account",
                method = "DELETE",
                body = jsonBody {
                    optional("pin", pin)
                    if (challengeId.isNotBlank()) {
                        field("challengeId", challengeId)
                        field("code", code)
                    }
                },
                token = token,
            )
        }
        clearRememberedAccount()
        forget(preserveRemembered = false)
    }

    // ═══════════════════════════ начало работы ═══════════════════════════

    /**
     * Приветствие прочитано.
     *
     * Отмечаем в момент показа, а не по нажатию: приветствие уже
     * случилось — человек его видит. Ждать кнопки значило бы показывать
     * окно снова после каждого перезапуска приложения, а окно, которое
     * возвращается, перестаёт быть приветствием.
     */
    suspend fun markWelcomeSeen() {
        _welcomeSeen.value = true
        tellSetup("welcome")
    }

    /** Убрать «Начало работы» — и пропуск, и «Готово» в конце. */
    suspend fun hideSetup() {
        _setupHidden.value = true
        tellSetup("hide")
    }

    /** Вернуть настройку на сводку — из разделов. */
    suspend fun resumeSetup() {
        _setupHidden.value = false
        tellSetup("resume")
    }

    private suspend fun tellSetup(action: String) {
        runCatching {
            authed { token ->
                api.call("setup", method = "POST", body = jsonBody { field("action", action) }, token = token)
            }
        }
    }

    // ═══════════════════════════ точки ═══════════════════════════

    /**
     * Перейти на другую свою точку.
     *
     * Порядок здесь важнее кода. Сначала досылаем очередь — записи в ней
     * принадлежат ПРЕЖНЕЙ мойке, и уехать они должны туда, пока токен ещё
     * её. Потом меняем токены и перечитываем всё с нуля. И только
     * последним двигаем поколение: к этому моменту на руках уже данные
     * новой точки, и перерисовка покажет их, а не пустоту.
     */
    suspend fun switchTo(point: Point, queue: OrderQueue) {
        if (point.id == _tenant.value?.id) return

        queue.flush(this)

        val result: Switched = authed { token ->
            api.send(
                "auth/switch",
                method = "POST",
                body = jsonBody {
                    field("tenantId", point.id)
                    field("device", deviceName)
                },
                token = token,
            )
        }
        accessToken = result.access
        refreshToken = result.refresh

        loadBootstrap()
        rememberCurrentAccount()
        // токен устройства привязан к участию: без этого новая мойка молчит
        runCatching { push?.reupload() }

        _generation.value += 1
    }

    // ═══════════════════════════ токены ═══════════════════════════

    /**
     * Запрос с токеном и одной попыткой обновления.
     *
     * Повтор ровно один: если и после обновления 401, значит сессию
     * отозвали — крутить дальше бессмысленно, надо входить заново.
     */
    suspend fun <T> authed(work: suspend (String) -> T): T {
        val token = accessToken ?: throw ApiException(401)
        return try {
            work(token)
        } catch (e: ApiException) {
            if (!e.isStaleToken) throw e
            val refreshed = try {
                renew()
            } catch (_: Throwable) {
                _state.value = State.SIGNED_OUT
                throw e
            }
            work(refreshed)
        }
    }

    /**
     * Обновление токена — по одному за раз на всё приложение.
     *
     * Сервер ротирует refresh при каждом обмене: отдал новый — старый
     * мёртв. Пока обновление было обычным вызовом, это ломалось на любом
     * экране, который делает больше одного запроса сразу.
     *
     * Так это выглядело у мойщика. Он набирает номер машины, и на каждое
     * изменение поля уходит запрос-подсказка «этот клиент уже был». Если
     * токен протух именно в этот момент, два запроса упираются в 401
     * одновременно и оба идут обновляться. Первый получает новую пару,
     * второй предъявляет уже погашенный refresh, получает отказ — и код
     * ниже честно решает, что сессию отозвали, и выкидывает человека на
     * экран входа. Посреди записи машины, с набранным номером, который
     * после этого негде взять.
     *
     * Причина не в сервере: ротация refresh — это защита от кражи токена.
     * Чинится на стороне приложения: обновление должно быть одно, а его
     * результат — общим. Кто пришёл вторым, дожидается той же попытки и
     * получает тот же новый токен.
     */
    private val renewalLock = Mutex()
    private var renewal: Deferred<String>? = null

    private suspend fun renew(): String {
        val running = renewalLock.withLock {
            renewal ?: scope.async {
                val stored = refreshToken ?: throw ApiException(401)
                val tokens: Tokens = api.send(
                    "auth/refresh",
                    method = "POST",
                    body = jsonBody { field("refresh", stored) },
                )
                accessToken = tokens.access
                refreshToken = tokens.refresh
                tokens.access
            }.also { renewal = it }
        }
        return try {
            running.await()
        } finally {
            renewalLock.withLock { if (renewal === running) renewal = null }
        }
    }

    suspend fun loadBootstrap() {
        val boot: Bootstrap = authed { token -> api.send("bootstrap", token = token) }
        apply(boot)
        rememberBootstrap(boot)
    }

    /** Разложить слепок по состоянию. Один путь у сети и у кэша. */
    private fun apply(boot: Bootstrap) {
        _tenant.value = boot.tenant
        _me.value = boot.me
        _access.value = boot.access
        _services.value = boot.services
        _points.value = boot.points ?: emptyList()
        _teamPercent.value = boot.crew?.percent
        /*
         * Себя из списка убираем здесь, а не на экране: автор записи
         * участник по определению, и галочка напротив собственного имени
         * была бы способом однажды остаться без денег за свою же работу.
         */
        _mates.value = boot.crew?.members.orEmpty().filter { it.id != boot.me.id }
        _welcomeSeen.value = boot.me.welcomeSeen ?: true
        _setupHidden.value = boot.me.setupHidden ?: false
    }

    /*
     * Слепок лежит в защищённом хранилище, а не в обычных настройках.
     * Не ради секретности алгоритма: в нём имя владельца, название мойки и
     * прайс, то есть данные бизнеса, — а телефон на мойке переходит из рук
     * в руки.
     */
    private fun rememberBootstrap(boot: Bootstrap) {
        runCatching { secure[KEY_BOOTSTRAP] = json.encodeToString(boot) }
    }

    private fun restoreBootstrap(): Bootstrap? {
        val raw = secure[KEY_BOOTSTRAP] ?: return null
        return runCatching { json.decodeFromString<Bootstrap>(raw) }.getOrNull()
    }

    // ═══════════════════════════ внутреннее ═══════════════════════════

    /**
     * Общий хвост любого входа: сохранить пару, перечитать всё, войти.
     *
     * Дверей три — код из SMS, PIN и досдача кода при незнакомом
     * устройстве, — а вход после них один и тот же. Три копии этих пяти
     * строк разошлись бы на первой правке, и разошлись бы молча.
     */
    private suspend fun enter(access: String, refresh: String) {
        accessToken = access
        refreshToken = refresh
        loadBootstrap()
        rememberCurrentAccount()
        _state.value = State.SIGNED_IN
    }

    private fun forget(preserveRemembered: Boolean = true) {
        accessToken = null
        refreshToken = null
        // слепок бизнеса уходит вместе с сессией: телефон на мойке общий
        secure[KEY_BOOTSTRAP] = null
        _tenant.value = null
        _me.value = null
        _access.value = null
        _services.value = emptyList()
        _points.value = emptyList()
        _teamPercent.value = null
        _mates.value = emptyList()
        /*
         * Обратно в «уже сделано»: следующий вход начнётся с ответа
         * сервера, а не с чужого приветствия поверх экрана входа.
         */
        _welcomeSeen.value = true
        _setupHidden.value = false
        if (!preserveRemembered) clearRememberedAccount()
        _state.value = State.SIGNED_OUT
    }

    private fun rememberCurrentAccount() {
        if (!_rememberLogin.value) return
        val me = _me.value ?: return
        val phone = me.phone ?: return
        val tenant = _tenant.value ?: return
        val refresh = refreshToken ?: return

        val account = RememberedAccount(me.name, phone, tenant.name)
        _rememberedAccount.value = account
        secure[KEY_REMEMBERED_REFRESH] = refresh
        prefs.edit().putString(KEY_ACCOUNT, json.encodeToString(account)).apply()
    }

    private fun clearRememberedAccount() {
        _rememberedAccount.value = null
        secure[KEY_REMEMBERED_REFRESH] = null
        prefs.edit().remove(KEY_ACCOUNT).apply()
    }

    private fun loadRemembered(): RememberedAccount? {
        val raw = prefs.getString(KEY_ACCOUNT, null) ?: return null
        return runCatching { json.decodeFromString<RememberedAccount>(raw) }.getOrNull()
    }

    /**
     * Идентификатор установки.
     *
     * Живёт в защищённом хранилище, а не в обычных настройках, по той же
     * причине, что и токены. Здесь это важно не ради секретности, а ради
     * смысла: переустановил приложение — значит устройство для сервера
     * новое, и код из SMS спросят заново. Ровно этого мы и хотим.
     *
     * `ANDROID_ID` не годится: он переживает переустановку и в пределах
     * одного издателя одинаков — то есть ведёт себя ровно наоборот.
     */
    val installId: String
        get() = secure["install-id"] ?: UUID.randomUUID().toString().also { secure["install-id"] = it }

    /**
     * Как называется телефон в списке устройств.
     *
     * `Build.MODEL` без производителя даёт «SM-A536B» — строку, по которой
     * свой телефон не узнать. С производителем это «Samsung SM-A536B», что
     * уже опознаётся.
     */
    private val deviceName: String
        get() {
            val brand = Build.MANUFACTURER.orEmpty().replaceFirstChar { it.uppercase() }
            val model = Build.MODEL.orEmpty()
            return if (model.startsWith(brand, ignoreCase = true)) model else "$brand $model".trim()
        }

    /**
     * Язык, на котором придёт код из SMS.
     *
     * Берём язык ИНТЕРФЕЙСА, а не телефона: получить армянское «никому не
     * сообщайте» на русском интерфейсе — то же самое, что получить его на
     * суахили. Всё, чего сервер не знает, превращается там в армянский:
     * список поддерживаемых языков живёт на сервере, и приложению незачем
     * его дублировать.
     */
    private val locale: String
        get() = langStore.current.value.code

    companion object {
        /**
         * Ниша нового бизнеса. Продаётся автомойка; сервер всё равно
         * проверяет, что ниша включена, — выключенную прямым запросом не
         * завести.
         */
        const val NICHE = "carwash"

        private const val KEY_REMEMBER = "remember.enabled"
        private const val KEY_ACCOUNT = "remember.account"
        private const val KEY_REMEMBERED_REFRESH = "remembered-refresh"
        private const val KEY_BOOTSTRAP = "bootstrap"
    }
}
