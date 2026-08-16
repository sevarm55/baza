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

        rememberLogin = UserDefaults.standard.object(forKey: Self.rememberEnabledKey) as? Bool ?? true
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

    func signIn(phone: String, pin: String) async throws {
        let result: API.LoginResult = try await api.send(
            "auth/login",
            method: "POST",
            body: [
                "phone": phone,
                "pin": pin,
                "device": UIDevice.current.name,
                /* Отпечаток установки. По нему сервер узнаёт своё
                   устройство и не спрашивает код из SMS на каждом входе:
                   заголовок браузера у приложения один и тот же у всех,
                   а этот идентификатор — только у этой установки. */
                "installId": Self.installId,
                /* Язык, на котором придёт код из SMS. Берём тот, на
                   котором человек видит приложение: получить армянское
                   «никому не сообщайте» на русском интерфейсе — то же
                   самое, что получить его на суахили. */
                "locale": Self.locale,
            ],
            as: API.LoginResult.self
        )
        try await accept(result)
    }

    /**
     * Досдать код из SMS при входе с незнакомого устройства.
     *
     * Сюда экран попадает после `STEP_UP_REQUIRED`: PIN подошёл, но
     * устройство сервер видит впервые. Телефон и код повторно не
     * спрашиваются — заявка на сервере уже привязана к тому человеку,
     * чей код подошёл.
     *
     * Успех означает и вход, и запоминание устройства: со второго раза
     * кода на нём не спросят.
     */
    func completeStepUp(challengeId: String, code: String) async throws {
        let result: API.LoginResult = try await api.send(
            "auth/step-up",
            method: "POST",
            body: [
                "challengeId": challengeId,
                "code": code,
                "device": UIDevice.current.name,
            ],
            as: API.LoginResult.self
        )
        try await accept(result)
    }

    /// Выслать код повторно. Паузу между отправками держит сервер.
    func resendCode(challengeId: String) async throws {
        _ = try await api.send(
            "auth/otp/resend",
            method: "POST",
            body: ["challengeId": challengeId],
            as: API.Empty.self
        )
    }

    private func accept(_ result: API.LoginResult) async throws {
        accessToken = result.access
        refreshToken = result.refresh

        try await loadBootstrap()
        rememberCurrentAccount()
        state = .signedIn
    }

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

    /* Регистрации из приложения больше нет — только вход. Бизнес
       заводится на сайте: приложение раздаётся бесплатно, а сервис
       оплачивается вне его, и правила App Store (3.1.3f) разрешают это
       ровно при условии, что внутри нет ни покупки, ни начала платного
       пути. Экран регистрации с пробным сроком был именно им.

       Серверный /auth/register никуда не делся: им пользуется веб. */

    /// Сменить PIN.
    ///
    /// Сервер гасит все сессии — в этом смысл смены — и тут же выдаёт
    /// новую пару на это устройство. Иначе человек, сменивший PIN, сам бы
    /// и вылетел из приложения, а вышвырнуть надо было остальных.
    func changePin(current: String, next: String) async throws {
        let device = UIDevice.current.name
        let issued: API.Tokens = try await authed { token in
            try await self.api.send(
                "profile/pin",
                method: "POST",
                body: ["current": current, "next": next, "device": device],
                token: token,
                as: API.Tokens.self
            )
        }
        accessToken = issued.access
        refreshToken = issued.refresh
    }

    /// Имя человека и название бизнеса.
    func saveProfile(name: String?, businessName: String?) async throws {
        var payload: [String: Any] = [:]
        if let name { payload["name"] = name }
        if let businessName { payload["businessName"] = businessName }
        guard !payload.isEmpty else { return }

        _ = try await authed { token in
            try await self.api.raw("profile", method: "PATCH", body: payload, token: token)
        }
        // название бизнеса стоит в заголовке экрана смены — перечитываем
        try await loadBootstrap()
    }

    func signOut() async {
        // Смена не должна оставаться на Lock Screen после выхода из чужого
        // аккаунта на общем телефоне мойки.
        await ShiftLiveActivity.shared.endAll()

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

    /// Удалить бизнес насовсем.
    ///
    /// Выходим через `forget`, а не через `signOut`: гасить сессию на
    /// сервере уже некому и незачем — вместе с бизнесом удалились и она,
    /// и сам пользователь. Запрос в `/auth/logout` ушёл бы в пустоту с
    /// мёртвым токеном.
    ///
    /// Сотрудники отдельного действия не требуют: они удаляются там же,
    /// на сервере, и теряют доступ в тот же момент.
    func deleteBusiness(pin: String) async throws {
        _ = try await authed { token in
            try await self.api.raw("account", method: "DELETE", body: ["pin": pin], token: token)
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
        tenant = boot.tenant
        me = boot.me
        access = boot.access
        services = boot.services
        points = boot.points ?? []
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
