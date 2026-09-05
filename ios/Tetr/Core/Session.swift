import Foundation
import SwiftUI

/// Только лицо сохранённого входа. PIN и токены сюда не попадают:
/// метаданные лежат в UserDefaults, отдельный refresh — в Keychain.
struct RememberedAccount: Codable, Equatable {
    let name: String
    let phone: String
    let tenant: String
}

/// Состояние входа и всё, что зависит от сервера.
///
/// Один объект на приложение. Он же владеет токенами и он же умеет их
/// обновлять: если access протух посреди запроса, повтор происходит здесь,
/// а экраны об этом не знают вовсе — иначе обработка 401 расползлась бы
/// по каждому месту, где что-то запрашивается.
@MainActor
final class Session: ObservableObject {
    enum State {
        case checking
        case signedOut
        case signedIn
    }

    @Published private(set) var state: State = .checking
    @Published private(set) var tenant: API.Tenant?
    @Published private(set) var me: API.Me?
    @Published private(set) var access: API.Access?
    @Published private(set) var services: [API.Service] = []
    /**
     * Совместная работа: одну машину моют вдвоём-втроём.
     *
     * `percent` — ставка на ВСЮ команду, а не каждому: цена × процент даёт
     * фонд, фонд делится поровну. Пусто — свойство у бизнеса выключено, и
     * экран записи не показывает ни одного нового пикселя.
     *
     * Список коллег приезжает с bootstrap, а не отдельным запросом: его
     * спрашивают в момент записи машины, во дворе, где связи может не
     * быть, — пауза там дороже всего.
     */
    @Published private(set) var teamPercent: Int?
    @Published private(set) var mates: [API.CrewMate] = []
    /**
     * Читал ли человек приветствие первого входа и убрал ли он
     * «Начало работы».
     *
     * Отдельно от `me`, хотя приезжают вместе с ним: `API.Me` — это
     * ответ сервера, неизменный слепок, а эти два меняются прямо на
     * экране. Закрыл приветствие — окно не должно вернуться при
     * следующем открытии вкладки, не дожидаясь нового bootstrap.
     *
     * Оба по умолчанию «уже сделано»: пока сервер не ответил, ничего не
     * показываем. Лишний раз не показать приветствие лучше, чем
     * показать его тому, кто работает в продукте полгода.
     */
    @Published private(set) var welcomeSeen = true
    @Published private(set) var setupHidden = false
    @Published private(set) var rememberedAccount: RememberedAccount?

    /// Быстрый возврат после явного выхода. По умолчанию включён, но
    /// выключается из профиля и тогда удаляет сохранённый вход сразу.
    @Published var rememberLogin: Bool {
        didSet {
            UserDefaults.standard.set(rememberLogin, forKey: Self.rememberEnabledKey)
            if rememberLogin {
                rememberCurrentAccount()
            } else {
                clearRememberedAccount()
            }
        }
    }

    /// Точки человека. Одна или ни одной — переключателя нет вовсе.
    @Published private(set) var points: [API.Point] = []

    /**
     * Последняя версия приложения в App Store — по данным сервера.
     *
     * Отстали — продукт закрывается стеной обновления с одной кнопкой в
     * магазин. Так решил владелец: клиентов немного, и все должны быть
     * на свежей версии, иначе поддержка превращается в угадывание, у
     * кого какой экран.
     *
     * Пусто, пока сервер не ответил или он старый и поля не знает: без
     * ответа стена не ставится никогда — заблокировать работу из-за
     * отсутствия данных хуже, чем пропустить одно обновление.
     */
    @Published private(set) var storeVersion: String?

    /// Когда в последний раз спрашивали сервер о себе. По нему решаем,
    /// стоит ли перечитывать при возвращении в приложение.
    private var loadedAt: Date?

    /**
     * Перечитать себя, вернувшись в приложение.
     *
     * Телефон держит приложение в памяти сутками, и до этого метода
     * версия и срок подписки читались только при холодном запуске.
     * Значит стену обновления и экран истёкшего срока человек не видел,
     * пока не убьёт приложение руками, — а руками его не убивает никто.
     * Ровно так и вышло с 1.2: сервер уже говорил «последняя 1.2», а
     * приложение, открытое из фона, продолжало считать последней 1.1.
     *
     * Минута паузы — чтобы переключение между приложениями и возврат из
     * камеры не превращались в очередь запросов. Отказ гасим: связи нет,
     * значит показываем то, что знали, а не ошибку поверх работы.
     */
    func refreshOnReturn() async {
        guard state == .signedIn else { return }
        guard Date().timeIntervalSince(loadedAt ?? .distantPast) > 60 else { return }
        try? await loadBootstrap()
    }

    /// Своя версия из настроек сборки — та же, что видит App Store.
    static let installedVersion =
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"

    /// Пора ли закрывать продукт стеной обновления.
    var updateRequired: Bool {
        guard let latest = storeVersion else { return false }
        return Self.isVersion(Self.installedVersion, olderThan: latest)
    }

    /**
     * Сравнение версий по числам, а не по строкам.
     *
     * Строковое сравнение однажды решит, что «1.10» старше «1.9», и
     * закроет стеной всех, кто только что обновился. Недостающие разряды
     * считаются нулями: «1.2» и «1.2.0» — одна версия.
     */
    static func isVersion(_ current: String, olderThan latest: String) -> Bool {
        let a = current.split(separator: ".").map { Int($0) ?? 0 }
        let b = latest.split(separator: ".").map { Int($0) ?? 0 }
        for i in 0..<max(a.count, b.count) {
            let x = i < a.count ? a[i] : 0
            let y = i < b.count ? b[i] : 0
            if x != y { return x < y }
        }
        return false
    }

    /**
     * Счётчик смены точки.
     *
     * По нему всё дерево экранов пересоздаётся: `@State` обнуляется,
     * `.task` перезапускается, ответы прежней мойки, которые ещё летят,
     * приземляются в выброшенный вид.
     *
     * Иначе ошибка выглядела бы не ошибкой: на экране правильные цифры,
     * просто чужие. Заметить это невозможно — а поверить легко.
     */
    @Published private(set) var generation = 0

    var canSwitch: Bool { points.count > 1 }

    private var accessToken: String? {
        didSet { Keychain.set(accessToken, for: "access") }
    }
    private var refreshToken: String? {
        didSet { Keychain.set(refreshToken, for: "refresh") }
    }

    private let api = APIClient.shared

    private static let rememberEnabledKey = "tetr.login.remember.enabled"
    private static let rememberAccountKey = "tetr.login.remember.account"
    private static let rememberedRefreshKey = "remembered-refresh"

    #if DEBUG
    /* Сброс — ровно один раз за запуск процесса. SwiftUI пересоздаёт
       объект не только на старте, и без этого флага второй `init`
       стирал уже выданные токены посреди работы: человек оказывался на
       экране входа, ничего не нажимая. */
    private static var didReset = false
    #endif

    init() {
        #if DEBUG
        /* Чистый лист для проверки входа.
         *
         * Вход живёт в Keychain, а Keychain переживает и перезапуск
         * приложения, и его удаление с симулятора. Поэтому тест, который
         * проверяет экран входа, со второго прогона проверял не его:
         * приложение открывалось сразу на смене, потому что вход остался
         * от прошлого раза.
         *
         * Только в отладочной сборке и только по явной переменной —
         * в магазинную это не попадает вовсе. Стереть чужой вход
         * случайно нечем: обычный запуск переменной не несёт.
         */
        if ProcessInfo.processInfo.environment["TETR_RESET"] == "1", !Self.didReset {
            Self.didReset = true
            Keychain.set(nil, for: "access")
            Keychain.set(nil, for: "refresh")
            Keychain.set(nil, for: Self.rememberedRefreshKey)
            UserDefaults.standard.removeObject(forKey: Self.rememberAccountKey)
            UserDefaults.standard.removeObject(forKey: Self.rememberEnabledKey)
        }
        #endif

        /* По умолчанию НЕ запоминаем: телефон на мойке нередко общий, а
           сохранённый вход возвращает в кабинет одним касанием. Включает
           это человек сам, в своём профиле. */
        rememberLogin = UserDefaults.standard.object(forKey: Self.rememberEnabledKey) as? Bool ?? false
        rememberedAccount = Self.loadRememberedAccount()
        accessToken = Keychain.get("access")
        refreshToken = Keychain.get("refresh")
    }

    /// Пуск: есть ли живой вход. Токен мог протухнуть, пока приложение
    /// не открывали, — тогда молча обновляем и идём дальше.
    func start() async {
        guard refreshToken != nil else {
            state = .signedOut
            return
        }
        do {
            try await loadBootstrap()
            state = .signedIn
        } catch {
            state = .signedOut
        }
    }

    /**
     * Вход логином и паролем.
     *
     * Логин у владельца — почта, у сотрудника — телефон. Какой перед
     * нами, решает СЕРВЕР, а не приложение: угадывать по виду строки
     * значит ошибиться на первом же владельце, который завёл ящик вида
     * `77123456@`. Роль приходит в ответе вместе с сессией.
     *
     * Код страны нужен ровно для телефонного логина: сотрудник набирает
     * национальную часть, а сверять сервер будет с E.164.
     */
    /**
     * Логин, приехавший ссылкой из браузера.
     *
     * Человек подтвердил почту или задал новый пароль на странице в
     * браузере, и та вернула его сюда своей схемой. Экран входа
     * подставит адрес и попросит только пароль: набирать почту второй
     * раз после того, как её только что подтвердили, — работа впустую.
     *
     * Живёт здесь, а не в экране входа, потому что ссылку принимает
     * корень приложения, а экран к этому моменту может быть ещё не
     * создан.
     */
    @Published var pendingLogin: String?

    func signIn(login: String, password: String, country: String) async throws {
        let result: API.LoginResult = try await api.send(
            "auth/login",
            method: "POST",
            body: [
                "login": login,
                "password": password,
                "country": country,
                "device": UIDevice.current.name,
                /* Отпечаток установки. По нему сервер узнаёт своё
                   устройство: заголовок браузера у приложения один и тот
                   же у всех, а этот идентификатор — только у этой
                   установки. */
                "installId": Self.installId,
            ],
            as: API.LoginResult.self
        )
        try await accept(result)
    }

    /**
     * Регистрация мойки: заявка и письмо.
     *
     * Ничего не заводит. Сервер проверяет поля, кладёт заявку на час и
     * шлёт ссылку на почту; мойка появляется, только когда человек по
     * ссылке перейдёт. Поэтому здесь нет ни токенов, ни входа — экрану
     * остаётся сказать «проверьте почту».
     *
     * Полей три, и это следствие того же: всё, что не спросили, не
     * пропадёт вместе с заявкой, до которой человек может не дойти. Имя
     * берётся из адреса, телефон и валюта спрашиваются внутри.
     *
     * Возвращается адрес, каким его принял сервер: показать надо именно
     * его, а не то, что человек набрал, — регистр и пробелы там уже
     * приведены к одному виду.
     */
    func signUp(
        niche: String,
        businessName: String,
        email: String,
        password: String
    ) async throws -> String {
        let started: API.SignupStarted = try await api.send(
            "auth/signup",
            method: "POST",
            body: [
                "niche": niche,
                "businessName": businessName,
                "email": email,
                "password": password,
                /* Язык письма. Берём тот, на котором человек видит
                   приложение: армянское письмо на русском интерфейсе —
                   то же самое, что письмо на суахили. */
                "locale": Self.locale,
            ],
            as: API.SignupStarted.self
        )
        return started.email
    }

    /**
     * «Забыл пароль»: попросить письмо со ссылкой.
     *
     * Ответ всегда один и тот же, есть такой адрес или нет. Иначе экран
     * восстановления превращается в справочник заведённых ящиков, а он
     * открыт без всякого входа. Новый пароль человек задаёт по ссылке, в
     * браузере: письмо и так открывают почтой.
     */
    func requestPasswordReset(email: String) async throws {
        _ = try await api.send(
            "auth/password/reset",
            method: "POST",
            body: ["email": email, "locale": Self.locale],
            as: APIClient.Empty.self
        )
    }



    /**
     * Выслать код повторно.
     *
     * Паузу между отправками и их число держит СЕРВЕР (45 → 90 → 180
     * секунд, не больше трёх). Обратный отсчёт на экране — подсказка
     * человеку, а не правило, и берёт он её из ответа: заявка приходит
     * новая, со своим идентификатором и своим `resendAt`.
     *
     * Ответ раньше выбрасывался, и это была не мелочь: экран не знал ни
     * нового идентификатора, ни момента следующего повтора — то есть
     * второе подтверждение уходило к погашенной заявке, а кнопка повтора
     * оставалась включённой и отвечала отказом.
     */
    @discardableResult

    private func accept(_ result: API.LoginResult) async throws {
        try await enter(access: result.access, refresh: result.refresh)
    }

    /// Общий хвост любого входа: сохранить пару, перечитать всё, войти.
    ///
    /// Дверей стало три — код из SMS, PIN и досдача кода при незнакомом
    /// устройстве, — а вход после них один и тот же. Три копии этих пяти
    /// строк разошлись бы на первой правке, и разошлись бы молча.
    private func enter(access: String, refresh: String) async throws {
        accessToken = access
        refreshToken = refresh

        try await loadBootstrap()
        rememberCurrentAccount()
        state = .signedIn
    }

    // ═══════════════════ вход по коду из SMS ═══════════════════




    /// Ниша нового бизнеса. Продаётся автомойка; сервер всё равно
    /// проверяет, что ниша включена, — выключенную прямым запросом не
    /// завести.
    static let niche = "carwash"

    // ═══════════════════ восстановление кода ═══════════════════




    /**
     * Идентификатор установки.
     *
     * Живёт в Keychain, а не в UserDefaults, по той же причине, что и
     * токены: UserDefaults — файл в песочнице, который уезжает в
     * резервную копию и переживает удаление приложения. Здесь это важно
     * не ради секретности, а ради смысла: переустановил приложение —
     * значит устройство для сервера новое, и код из SMS спросят
     * заново. Ровно этого мы и хотим.
     *
     * `identifierForVendor` не годится: он общий для всех приложений
     * одного издателя и меняется при удалении последнего из них — то
     * есть ведёт себя ровно наоборот.
     */
    /**
     * Язык интерфейса — двухбуквенный код для сервера.
     *
     * `preferredLanguages` отдаёт `hy-AM`, `ru-RU`, `en-GB`; серверу
     * нужна только первая часть. Всё, чего он не знает, превращается там
     * в армянский — список поддерживаемых языков живёт на сервере, а не
     * здесь, и приложению незачем его дублировать.
     */
    static var locale: String {
        let tag = Locale.preferredLanguages.first ?? "hy"
        return String(tag.prefix(while: { $0 != "-" && $0 != "_" }))
    }

    static var installId: String {
        if let existing = Keychain.get("install-id") { return existing }
        let made = UUID().uuidString
        Keychain.set(made, for: "install-id")
        return made
    }

    /// Вход по сохранённому профилю. Перед этим экран входа подтверждает
    /// владельца через Face ID / Touch ID / код устройства.
    func resumeRemembered() async throws {
        guard rememberLogin,
              rememberedAccount != nil,
              let rememberedRefresh = Keychain.get(Self.rememberedRefreshKey)
        else { throw APIError(status: 401, code: "NO_REMEMBERED_LOGIN", retryAfter: nil) }

        accessToken = nil
        refreshToken = rememberedRefresh

        do {
            _ = try await renew()
            try await loadBootstrap()
            rememberCurrentAccount()
            state = .signedIn
        } catch {
            clearRememberedAccount()
            forget(preserveRemembered: false)
            throw error
        }
    }

    /* Вход и регистрация — одна дверь, как в вебе: телефон, код из SMS,
       и только ПОСЛЕ кода выясняется, знаком ли нам номер. Различать их
       раньше нельзя — как только ответ на знакомый номер отличается от
       ответа на незнакомый, форма превращается в справочник
       зарегистрированных.

       Про правила магазина см. `completeSignUp`: 3.1.3(f) запрещает
       продавать внутри и звать платить наружу, а не заводить аккаунт.
       Прежний экран регистрации нарушал правило не тем, что регистрировал,
       а тем, что обещал «шесть дней бесплатно», то есть начинал платный
       путь. Здесь этого обещания нет. */

    /// Есть ли у человека PIN. Нет — значит он завёл мойку по коду из
    /// SMS, и текущий код у него спрашивать нечего.
    var hasPin: Bool { me?.pinSet ?? true }

    /**
     * Код временный: его выдал админ платформы, когда войти было нечем.
     *
     * Дата — когда он сгорит. Приложение об этом напоминает, пока метка
     * стоит: после срока временный код перестаёт пускать, и человек
     * останется у ворот посреди смены, если не задаст свой.
     */
    var tempAccessUntil: Date? { me?.tempAccessUntil }

    /// Сменить PIN. И задать его впервые, если кода не было.
    ///
    /// Сервер гасит все сессии — в этом смысл смены — и тут же выдаёт
    /// новую пару на это устройство. Иначе человек, сменивший PIN, сам бы
    /// и вылетел из приложения, а вышвырнуть надо было остальных.
    ///
    /// Пустой `current` не ошибка: у заведённых по SMS кода нет вовсе.
    /// Решает не приложение, а сервер, и по хешу в базе, а не по тому,
    /// что мы прислали, — присланный признак «у меня нет кода» был бы
    /// способом сменить чужой код, не зная старого.
    /**
     * Сменить пароль.
     *
     * После смены сервер гасит все сессии, включая эту, и тут же выдаёт
     * новую пару токенов на это устройство: человека, который только что
     * сменил пароль, выкидывать из приложения незачем. Остальные телефоны
     * выходят — в этом весь смысл.
     */
    func changePassword(current: String, next: String) async throws {
        let issued: API.Tokens = try await authed { token in
            try await self.api.send(
                "profile/password",
                method: "POST",
                body: [
                    "current": current,
                    "next": next,
                    "device": UIDevice.current.name,
                ],
                token: token,
                as: API.Tokens.self
            )
        }
        /* Токены сами уезжают в Keychain: у обоих свойств стоит
           `didSet`. Отдельного сохранения не нужно. */
        accessToken = issued.access
        refreshToken = issued.refresh
    }

    func saveProfile(
        name: String?,
        businessName: String?,
        currency: String? = nil,
        phone: String? = nil
    ) async throws {
        var payload: [String: Any] = [:]
        if let name { payload["name"] = name }
        if let businessName { payload["businessName"] = businessName }
        if let currency { payload["currency"] = currency }
        /* Пустая строка тоже значение: «убрать номер». Поэтому проверяем
           на nil, а не на пустоту. */
        if let phone { payload["phone"] = phone }
        guard !payload.isEmpty else { return }

        _ = try await authed { token in
            try await self.api.raw("profile", method: "PATCH", body: payload, token: token)
        }
        // название бизнеса стоит в заголовке экрана смены — перечитываем
        try await loadBootstrap()
    }

    func signOut() async {
        // сначала отзываем токен устройства: телефон на мойке переходит из
        // рук в руки, и уведомления о чужой выручке приходить не должны
        await Push.shared.revoke()

        if rememberLogin {
            /* Это «уйти с экрана», а не забыть устройство. Живой refresh
               остаётся только в Keychain и открывается с проверкой самого
               устройства. Если настройка выключена, поведение прежнее —
               серверная сессия отзывается полностью. */
            rememberCurrentAccount()
        } else if let refreshToken {
            _ = try? await api.raw("auth/logout", method: "POST", body: ["refresh": refreshToken])
        }
        forget(preserveRemembered: rememberLogin)
    }

    // ═══════════════════════ устройства ═══════════════════════

    /**
     * Откуда сейчас открыт вход.
     *
     * Телефон на мойке общий и переходит из рук в руки, а пара токенов
     * живёт тридцать дней. Пока этого списка не было, погасить чужой вход
     * можно было только сменой PIN — то есть вылетев самому и заодно
     * выкинув себя со всех своих устройств.
     */
    func devices() async throws -> [API.Device] {
        let result: API.Devices = try await authed { token in
            try await self.api.send("auth/devices", token: token, as: API.Devices.self)
        }
        return result.devices
    }

    /// Погасить вход. Гасить можно только своё — проверяет сервер.
    func revokeDevice(_ id: String) async throws {
        _ = try await authed { token in
            try await self.api.raw("auth/devices/\(id)", method: "DELETE", token: token)
        }
    }


    /**
     * Удалить мойку.
     *
     * Подтверждается паролем — тем же, чем человек входит. Кодов из SMS у
     * продукта больше нет, а PIN перестал быть входом. Запрос идёт с
     * живым токеном, и подтверждение всё равно спрашивается заново:
     * телефон лежит на мойке разблокированным, и между «зашёл посмотреть
     * выручку» и «стёр всё» должно стоять то, чего случайный человек
     * рядом не знает.
     */
    func deleteBusiness(password: String) async throws {
        _ = try await authed { token in
            try await self.api.raw(
                "account",
                method: "DELETE",
                body: ["password": password],
                token: token
            )
        }
        clearRememberedAccount()
        forget(preserveRemembered: false)
    }

    private func forget(preserveRemembered: Bool = true) {
        accessToken = nil
        refreshToken = nil
        tenant = nil
        me = nil
        access = nil
        services = []
        points = []
        /* Обратно в «уже сделано»: следующий вход начнётся с ответа
           сервера, а не с чужого приветствия поверх экрана входа. */
        welcomeSeen = true
        setupHidden = false
        if !preserveRemembered { clearRememberedAccount() }
        state = .signedOut
    }

    private func rememberCurrentAccount() {
        guard rememberLogin,
              let me,
              let phone = me.phone,
              let tenant,
              let refreshToken
        else { return }

        let account = RememberedAccount(name: me.name, phone: phone, tenant: tenant.name)
        rememberedAccount = account
        Keychain.set(refreshToken, for: Self.rememberedRefreshKey)
        if let data = try? JSONEncoder().encode(account) {
            UserDefaults.standard.set(data, forKey: Self.rememberAccountKey)
        }
    }

    private func clearRememberedAccount() {
        rememberedAccount = nil
        Keychain.set(nil, for: Self.rememberedRefreshKey)
        UserDefaults.standard.removeObject(forKey: Self.rememberAccountKey)
    }

    private static func loadRememberedAccount() -> RememberedAccount? {
        guard let data = UserDefaults.standard.data(forKey: rememberAccountKey) else { return nil }
        return try? JSONDecoder().decode(RememberedAccount.self, from: data)
    }

    func loadBootstrap() async throws {
        let boot: API.Bootstrap = try await authed { token in
            try await self.api.send("bootstrap", token: token, as: API.Bootstrap.self)
        }
        loadedAt = Date()
        tenant = boot.tenant
        me = boot.me
        access = boot.access
        services = boot.services
        points = boot.points ?? []
        teamPercent = boot.crew?.percent
        /* Себя из списка убираем здесь, а не на экране: автор записи
           участник по определению, и галочка напротив собственного имени
           была бы способом однажды остаться без денег за свою же
           работу. */
        mates = (boot.crew?.members ?? []).filter { $0.id != boot.me.id }
        welcomeSeen = boot.me.welcomeSeen ?? true
        setupHidden = boot.me.setupHidden ?? false
        storeVersion = boot.app?.iosLatest
    }

    /**
     * Перечитать bootstrap со стены обновления.
     *
     * Нужен человеку, который уже обновился через магазин, не убивая
     * приложение, или которому владелец поправил версию на сервере.
     * Отказ гасится: стена остаётся, и это честно — данных о новой
     * версии так и нет.
     */
    func recheckVersion() async {
        try? await loadBootstrap()
    }

    // ─────────────────────────── начало работы ───────────────────────────

    /**
     * Приветствие прочитано.
     *
     * Отмечаем в момент показа, а не по нажатию: приветствие уже
     * случилось — человек его видит. Ждать кнопки значило бы показывать
     * окно снова после каждого перезапуска приложения, а окно, которое
     * возвращается, перестаёт быть приветствием.
     *
     * Отказ сервера гасится: онбординг не повод показывать ошибку тому,
     * кто только что зашёл впервые. Ценой того, что в следующий раз окно
     * придёт ещё раз, — и это меньшее из двух зол.
     */
    func markWelcomeSeen() async {
        welcomeSeen = true
        await tellSetup("welcome")
    }

    /// Убрать «Начало работы» — и пропуск, и «Готово» в конце.
    func hideSetup() async {
        setupHidden = true
        await tellSetup("hide")
    }

    /// Вернуть настройку на сводку — из разделов.
    func resumeSetup() async {
        setupHidden = false
        await tellSetup("resume")
    }

    private func tellSetup(_ action: String) async {
        _ = try? await authed { token in
            try await self.api.raw("setup", method: "POST", body: ["action": action], token: token)
        }
    }

    /**
     * Перейти на другую свою точку.
     *
     * Порядок здесь важнее кода. Сначала досылаем очередь — записи в ней
     * принадлежат ПРЕЖНЕЙ мойке, и уехать они должны туда, пока токен ещё
     * её. Потом меняем токены и перечитываем всё с нуля. И только
     * последним двигаем поколение: к этому моменту на руках уже данные
     * новой точки, и перерисовка покажет их, а не пустоту.
     */
    func switchTo(_ point: API.Point, queue: OrderQueue) async throws {
        guard point.id != tenant?.id else { return }

        await queue.flush(using: self)

        let device = UIDevice.current.name
        let result: API.Switched = try await authed { token in
            try await self.api.send(
                "auth/switch",
                method: "POST",
                body: ["tenantId": point.id, "device": device],
                token: token,
                as: API.Switched.self
            )
        }
        accessToken = result.access
        refreshToken = result.refresh

        try await loadBootstrap()
        rememberCurrentAccount()
        // токен устройства привязан к участию: без этого новая мойка молчит
        await Push.shared.reupload()

        generation += 1
    }

    /// Запрос с токеном и одной попыткой обновления.
    ///
    /// Повтор ровно один: если и после обновления 401, значит сессию
    /// отозвали — крутить дальше бессмысленно, надо входить заново.
    func authed<T>(_ work: (String) async throws -> T) async throws -> T {
        guard let token = accessToken else { throw APIError(status: 401, code: nil, retryAfter: nil) }

        do {
            return try await work(token)
        } catch let error as APIError where error.isStaleToken {
            guard let refreshed = try? await renew() else {
                state = .signedOut
                throw error
            }
            return try await work(refreshed)
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
     * Причина не в сервере: ротация refresh — это защита от кражи токена,
     * и отказывать по второму предъявлению он обязан. Чинится на стороне
     * приложения: обновление должно быть одно, а его результат — общим.
     * Кто пришёл вторым, дожидается той же попытки и получает тот же
     * новый токен.
     */
    private var renewal: Task<String, Error>?

    private func renew() async throws -> String {
        // уже обновляемся — ждём тот же результат, а не начинаем второе
        if let renewal { return try await renewal.value }

        guard let refreshToken else { throw APIError(status: 401, code: nil, retryAfter: nil) }

        let task = Task<String, Error> { @MainActor [weak self] in
            guard let self else { throw APIError(status: 401, code: nil, retryAfter: nil) }
            let tokens: API.Tokens = try await self.api.send(
                "auth/refresh",
                method: "POST",
                body: ["refresh": refreshToken],
                as: API.Tokens.self
            )
            self.accessToken = tokens.access
            self.refreshToken = tokens.refresh
            return tokens.access
        }
        renewal = task
        defer { renewal = nil }

        return try await task.value
    }
}
