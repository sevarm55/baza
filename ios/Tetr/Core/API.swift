import Foundation

/// Ответы сервера.
///
/// Деньги везде целые и в минимальных единицах — драмах. Так они лежат в
/// базе, так уходят по сети, и нигде по дороге не превращаются в Double:
/// сумма зарплаты, посчитанная через плавающую точку, однажды разойдётся
/// с той, что видит владелец, и объяснить это будет нечем.
enum API {
    struct Tenant: Decodable {
        let id: String
        let name: String
        let currency: String
        let timezone: String
        /// «Պետհամարանիշ» или «Հեռախոս» — приложение не знает про ниши,
        /// для него это просто слово, которое прислал сервер
        let clientIdLabel: String
        let clientIdType: String
        let staffRole: String
        let unitOne: String

        /**
         * Тарифные варианты: у мойки это класс машины.
         *
         * Необязательные намеренно. Приложение стоит на чужих телефонах и
         * обновляется само по себе — оно всегда может оказаться новее
         * сервера. Обязательное поле в такой паре это экран с ошибкой
         * разбора вместо смены у каждого, кто обновился первым.
         *
         * Пусто — свойства нет, и ни ряда классов, ни второй цены человек
         * не увидит. Продукт мультинишевый: «седаны» приходят с сервера
         * словами, которые придумал владелец.
         */
        let tierLabel: String?
        let tiers: [String]?
    }

    struct Me: Decodable {
        let id: String
        let name: String
        let role: String
        let percent: Int
        /// Слать ли владельцу уведомление о каждой записи.
        let notifyOrders: Bool?
        /// Он же логин.
        let phone: String?

        var isOwner: Bool { role == "owner" }
    }

    struct Access: Decodable {
        let state: String
        let daysLeft: Int
        let canRead: Bool
        let canWrite: Bool
        let warn: Bool
    }

    struct Service: Decodable, Identifiable, Hashable {
        let id: String
        let name: String
        let price: Int
        /// Цены по тарифам в порядке `tenant.tiers`. Нет своей — базовая.
        let tierPrices: [Int]?

        /// Цена для выбранного тарифа. Единственное место, где это
        /// считается на клиенте, — и правило то же, что на сервере.
        func price(tier: Int?) -> Int {
            guard let tier, tier >= 0, let own = tierPrices?[safe: tier], own > 0 else { return price }
            return own
        }
    }

    /// Точка, где человек работает.
    ///
    /// Отдельно от `Tenant`: тот — про бизнес целиком, со всеми его
    /// терминами и услугами, а здесь ровно то, что нужно строке в списке.
    struct Point: Decodable, Identifiable, Hashable {
        let id: String
        let name: String
        /// owner | staff — на разных мойках роль может отличаться
        let role: String
        let state: String
        let canRead: Bool
        /// Необязательное: сервер может оказаться старее приложения.
        let daysLeft: Int?
    }

    struct Bootstrap: Decodable {
        let tenant: Tenant
        let me: Me
        let access: Access
        let services: [Service]
        /// Необязательное: приложение может оказаться новее сервера.
        let points: [Point]?
    }

    struct Tokens: Decodable {
        let access: String
        let refresh: String
        let expiresIn: Int
    }

    /// Ответ перехода на другую точку — та же пара токенов и новый список.
    struct Switched: Decodable {
        let access: String
        let refresh: String
        let expiresIn: Int
        let tenantId: String
        let points: [Point]?
    }

    struct LoginResult: Decodable {
        let access: String
        let refresh: String
        let expiresIn: Int
        let user: Me
        let tenantId: String?
        let points: [Point]?
    }

    struct ShiftOrder: Decodable, Identifiable {
        let id: String
        let serviceName: String
        let price: Int
        let payment: String
        let createdAt: Date
    }

    struct Shift: Decodable {
        let count: Int
        let revenue: Int
        let earned: Int
        let percent: Int
        let orders: [ShiftOrder]
        /// Встал ли человек на смену переключателем.
        let onShift: Bool
        let openedAt: Date?
        /// Сколько наличных набралось с начала смены — подставляется при сдаче.
        let cashSoFar: Int
    }

    /// Ответ на включение и выключение переключателя.
    struct ShiftState: Decodable {
        let onShift: Bool
        let openedAt: Date?
        let cashExpected: Int?
        let cashDeclared: Int?
    }

    struct MonthDay: Decodable, Identifiable {
        let date: String
        let revenue: Int
        let count: Int
        var id: String { date }
    }

    struct MonthTotal: Decodable {
        let revenue: Int
        let serviceRevenue: Int
        let count: Int
        let payroll: Int
        let expenses: Int
        let profit: Int
    }

    struct Month: Decodable {
        let month: String
        let days: [MonthDay]
        let total: MonthTotal
    }

    struct DayShift: Decodable, Identifiable {
        let userId: String
        let name: String
        let openedAt: Date
        let closedAt: Date?
        /// Сколько наличных намыл и сколько сдал. null — не отмечал.
        let cashExpected: Int?
        let cashDeclared: Int?
        // человек мог отстоять две смены за день — одного userId мало
        var id: String { "\(userId)-\(openedAt.timeIntervalSince1970)" }
    }

    struct Day: Decodable {
        let date: String
        let stats: Stats
        let costs: Costs
        let profit: Int
        /**
         * Сравнение с предыдущим отрезком. Необязательное: маршрут дня его
         * не присылает — карточку дня открывают из календаря, где соседние
         * дни уже видны рядом.
         *
         * Было объявлено обязательным, и разбор всего дня падал на
         * отсутствующем ключе. Ошибку глотал `try?`, поэтому экран не
         * ругался, а просто оставался пустым: белый лист вместо дня, в
         * котором была работа.
         *
         * Отсюда правило для всей этой структуры: любое поле, которого
         * может не быть хоть в одном ответе, объявляется необязательным.
         */
        let previous: Previous?
        let shifts: [DayShift]
        let feed: [FeedItem]
    }

    /// Кто сейчас на мойке — для экрана владельца.
    struct Present: Decodable, Identifiable {
        let userId: String
        let name: String
        let openedAt: Date
        var id: String { userId }
    }

    struct KnownClient: Decodable {
        let key: String
        let visits: Int
        let total: Int
        let lastSeenAt: Date
        /// Каким классом эту машину записывали в прошлый раз: джип не
        /// станет седаном между мойками, поэтому выбор подставляется сам.
        let lastTier: String?
    }

    struct Lookup: Decodable {
        let known: KnownClient?
    }

    struct Stats: Decodable {
        let revenue: Int
        let count: Int
        let cash: Int
        let avgCheck: Int
        /// Начислено исполнителям за период — не выплачено, а именно начислено.
        let payroll: Int
        /**
         * Кто сколько намыл и сколько ему за это причитается.
         *
         * Сервер отдавал это поле и раньше, просто приложение его не
         * читало: сводка знала только сумму зарплаты целиком и не могла
         * разложить её по именам. Кабинет теперь показывает список людей
         * с машинами и заработком, и телефон обязан отвечать так же.
         *
         * Optional — по общему правилу этого файла: приложение стоит на
         * чужих телефонах и обновляется само по себе, оно всегда может
         * оказаться новее сервера.
         */
        let byStaff: [StaffLine]?
    }

    struct Costs: Decodable {
        let oneOff: Int
        let monthlyShare: Int
        let total: Int
    }

    struct Expense: Decodable, Identifiable {
        let id: String
        let amount: Int
        let category: String
        let note: String?
        let monthly: Bool
        let at: Date
        /// Заполнено только у завершённого постоянного расхода.
        let endedAt: Date?
    }

    struct Expenses: Decodable {
        let hints: [String]
        let expenses: [Expense]
        /// Optional: старое приложение продолжает работать со старым сервером.
        let costs: Costs?
    }

    struct FeedItem: Decodable, Identifiable {
        let id: String
        let clientKey: String?
        let serviceName: String
        let staffName: String?
        /**
         * Снимок процента в самой записи, а не текущая ставка человека.
         *
         * Необязательное намеренно. Приложение стоит на чужих телефонах и
         * обновляется само по себе: оно всегда может оказаться новее
         * сервера. Обязательное поле в такой паре — это экран с ошибкой
         * декодирования вместо выручки у каждого, кто обновился первым.
         * Любое новое поле здесь приходит optional.
         */
        let staffPercent: Int?
        let price: Int
        let payment: String
        let createdAt: Date

        /// Сколько с этой машины ушло исполнителю. Округление то же, что
        /// на сервере (`staffShare`), иначе в приложении и в ведомости
        /// стояли бы разные драмы.
        var earned: Int { price * (staffPercent ?? 0) / 100 }
    }

    /// Столбик графика. Ключ приходит строкой «2026-07-29 16», а не датой:
    /// timestamp без зоны при разборе трактуется как время клиента, и
    /// график съезжает на разницу часовых поясов.
    struct SeriesPoint: Decodable, Identifiable {
        let key: String
        let revenue: Int
        var id: String { key }

        /* Ключ приходит в виде «2026-07-02 00» и ВСЕГДА кончается часом —
           даже когда ряд дневной. Брать две последние цифры годилось только
           для часов: на тридцати днях все подписи выходили «00». */
        var hourLabel: String { String(key.suffix(2)) }
        var dayLabel: String { String(key.dropFirst(8).prefix(2)) }
    }

    struct SplitSegment: Decodable, Identifiable {
        let payment: String
        let revenue: Int
        var id: String { payment }
    }

    struct StaffLine: Decodable, Identifiable {
        let staffId: String?
        let name: String?
        let count: Int
        let revenue: Int
        let earned: Int
        var id: String { staffId ?? "—" }
    }

    struct Summary: Decodable {
        /// Начало периода. Нужно, чтобы подписать цифру датой: без неё
        /// «Հասույթ» — число без привязки, и понять, за что оно, можно
        /// только вспомнив, какую кнопку нажал.
        let from: Date
        /// Верхняя граница периода. У закрытого прошлого месяца она в
        /// прошлом, и подписывать его сегодняшним числом было бы враньём.
        /// Optional: приложение обновляется отдельно от сервера.
        let to: Date?
        let stats: Stats
        /* Прибыль считает сервер: формула одна на приложение и кабинет,
           и разъехаться между ними она не должна — это та цифра, из-за
           которой продукту верят. */
        let costs: Costs
        let profit: Int
        /// Тот же отрезок непосредственно перед текущим — не с чем иначе
        /// сравнить: вчерашнюю прибыль владелец в уме не считает.
        let previous: Previous
        let onShift: [Present]
        let series: [SeriesPoint]
        let split: [SplitSegment]
        let feed: [FeedItem]
    }

    struct Previous: Decodable {
        /// Границы базы: подпись обязана назвать даты, иначе «к прошлому
        /// периоду» не сообщает ничего.
        let from: Date?
        let to: Date?
        let revenue: Int
        let profit: Int
        /// Ноль записей — сравнивать не с чем, и клиент молчит вместо
        /// «+100 %» от пустоты.
        let count: Int?
    }

    struct PayrollDay: Decodable, Identifiable {
        /// день в часовом поясе мойки, `YYYY-MM-DD`
        let day: String
        let count: Int
        let revenue: Int
        let earned: Int
        var id: String { day }
    }

    struct PayrollDue: Decodable, Identifiable {
        let staffId: String?
        let name: String?
        /// текущая ставка человека — НЕ та, по которой посчитано
        let percent: Int
        /* Ставки, по которым деньги посчитаны на самом деле. Каждая
           запись хранит процент, который стоял в момент записи, поэтому
           после смены ставки `percent` перестаёт объяснять `earned`.
           Показывать надо эти две, а вилку — когда они разошлись. */
        let pctFrom: Int?
        let pctTo: Int?
        let count: Int
        let revenue: Int
        let earned: Int
        /// то же неоплаченное, разложенное по дням
        let days: [PayrollDay]?
        var id: String { staffId ?? "—" }

        /// Ставка строкой: одно число, если не менялась, иначе вилка.
        var rateLabel: String {
            guard let from = pctFrom, let to = pctTo else { return "\(percent)%" }
            return from == to ? "\(from)%" : "\(from)–\(to)%"
        }
    }

    struct Payout: Decodable, Identifiable {
        let id: String
        let amount: Int
        let paidAt: Date
        let staffName: String?
    }

    /* ─────────────────── лист по рабочим дням ───────────────────

       То же, что показывает кабинет, и посчитанное тем же кодом на
       сервере (`lib/payroll-board.ts`). Отличие от `due` не в
       оформлении: там сумма по человеку с границей «всё, что раньше
       последней выплаты», здесь — остаток по каждому дню отдельно,
       вместе с тем, что за этот день уже отдано и когда.

       Считать это на телефоне нельзя было бы даже при желании: по
       `due` закрытый день не отличить от дня, в котором человек мыл по
       нулевой ставке, — оба приходят нулём. */

    /// Машина, из которой сложилась дневная доля.
    struct PayrollLine: Decodable, Identifiable {
        let id: String
        /// «34 AA 555 · Կոմպլեքս» — чем запись названа в ленте
        let title: String
        let price: Int
        let percent: Int
        let earned: Int
    }

    /// Человек внутри рабочего дня.
    struct PayrollPerson: Decodable, Identifiable {
        /// пусто у записей без исполнителя: платить по ним некому
        let staffId: String?
        let name: String?
        let count: Int
        /// сколько за этот день ещё должны
        let earned: Int
        /// сколько за этот день уже отдано
        let paid: Int
        /// когда отдали в последний раз
        let paidAt: Date?
        let pctFrom: Int?
        let pctTo: Int?
        /// пусто, если полного разложения нет: половина машин под суммой
        /// читается как полная и не сходится
        let lines: [PayrollLine]?

        var id: String { staffId ?? "—" }

        /// Ставка, по которой посчитано: одно число, а после смены — вилка.
        var rateLabel: String? {
            guard let from = pctFrom, let to = pctTo else { return nil }
            return from == to ? "\(from)%" : "\(from)–\(to)%"
        }
    }

    /// Рабочий день целиком: и долг, и уже закрытое.
    struct PayrollBoardDay: Decodable, Identifiable {
        /// `YYYY-MM-DD` в часовом поясе мойки
        let day: String
        let units: Int
        let outstanding: Int
        let paid: Int
        let people: [PayrollPerson]

        var id: String { day }
    }

    struct PayrollPaymentRow: Decodable, Identifiable {
        let id: String
        let staffId: String?
        let name: String?
        let amount: Int
    }

    /// Одна выдача: сколько человек за раз получили деньги из рук в руки.
    struct PayrollPayment: Decodable, Identifiable {
        let key: String
        let paidAt: Date
        /// за какой рабочий день; пусто у старых выплат — там только отрезок
        let day: String?
        let periodFrom: Date
        let periodTo: Date
        /// машин за тот рабочий день, если это ещё известно
        let units: Int?
        let total: Int
        let rows: [PayrollPaymentRow]

        var id: String { key }
    }

    struct PayrollTotals: Decodable {
        /// сколько сейчас нужно раздать
        let outstanding: Int
        /// скольким людям
        let owedTo: Int
        let accrued: Int
        let settled: Int
        let units: Int
    }

    struct PayrollBoard: Decodable {
        let days: [PayrollBoardDay]
        let payments: [PayrollPayment]
        let totals: PayrollTotals
        let lastPaidAt: Date?
    }

    struct Payroll: Decodable {
        let due: [PayrollDue]
        let payouts: [Payout]
        /**
         * Необязательный намеренно.
         *
         * Приложение стоит на чужих телефонах и обновляется само по себе —
         * оно всегда может оказаться новее сервера. Обязательное поле в
         * такой паре это экран с ошибкой разбора вместо зарплат у всех,
         * кто обновился первым.
         */
        let board: PayrollBoard?
    }

    struct Client: Decodable, Identifiable {
        let id: String
        let key: String
        let name: String?
        /* Телефон вписывает владелец из карточки — при записи машины его
           не спрашивают. Необязательное: сервер может оказаться старше
           приложения, а на пустом поле экран падать не должен. */
        let phone: String?
        let visits: Int
        let total: Int
        let daysSince: Int
    }

    struct ClientOrder: Decodable, Identifiable {
        let id: String
        let createdAt: String
        let price: Int
        let serviceName: String
        let payment: String
        let staffName: String?
    }

    /// Одна машина и всё, что она у нас мыла.
    struct ClientHistory: Decodable {
        let client: Client
        let orders: [ClientOrder]
    }

    struct Clients: Decodable {
        let clients: [Client]
    }

    /**
     * Повод для колокольчика.
     *
     * Не событие, а состояние мойки: «пятеро не были три недели» правда,
     * пока они не приедут. Считает его сервер — той же сборкой, что и
     * кабинет в браузере: два места, считающие поводы по-разному, врут
     * в одном из двух.
     */
    struct Alert: Decodable, Identifiable {
        let key: String
        let title: String
        let note: String
        let action: String
        /// `warn` — то, что теряет деньги прямо сейчас
        let tone: String
        var id: String { key }
    }

    struct Alerts: Decodable {
        let alerts: [Alert]
    }

    /// Машина, которую владелец принял и передал мойщику.
    ///
    /// Отдельно от записи: у наряда нет ни цены, ни оплаты — он живёт
    /// между «машина заехала» и «машина вымыта», а деньги появляются
    /// только в записи, которая его и закрывает.
    struct Job: Decodable, Identifiable {
        let id: String
        let clientKey: String
        let staffId: String
        let staffName: String?
        let serviceName: String?
        let note: String?
        /// assigned → accepted → started
        let status: String
        let createdAt: Date
        let acceptedAt: Date?
        let startedAt: Date?

        /// Сколько машина ждёт — минутами, для подписи под номером.
        var waitedMinutes: Int {
            max(0, Int(Date().timeIntervalSince(createdAt) / 60))
        }
    }

    struct Jobs: Decodable {
        let jobs: [Job]
    }

    struct StaffMember: Decodable, Identifiable {
        let id: String
        let name: String
        let phone: String
        let role: String
        let percent: Int
        let isMe: Bool
        /* Что человек сделал за этот месяц. Необязательные: сервер может
           оказаться старше приложения, а список людей должен работать и
           без чисел. */
        let cars: Int?
        let earned: Int?
    }

    struct Staff: Decodable {
        let staff: [StaffMember]
    }

    struct Services: Decodable {
        let services: [Service]
    }

    /// Тип бизнеса. Приложение про ниши ничего не знает — список приходит
    /// с сервера, из того же конфига, что и лендинг.
    struct Niche: Decodable, Identifiable {
        let key: String
        let icon: String
        let name: String
        let tag: String
        let defaultName: String
        var id: String { key }

        /// Значок для нативной карточки. Необязательный намеренно: если
        /// сервер окажется старее приложения, разбор всего списка ниш упал
        /// бы целиком — и экран регистрации остался бы пустым из-за иконки.
        let symbol: String?
        var glyph: String { symbol ?? "building.2.fill" }
    }

    struct Niches: Decodable {
        let niches: [Niche]
    }

    struct CreatedOrder: Decodable {
        let duplicate: Bool
    }
}

/// Ошибка запроса.
///
/// `code` — то, что прислал сервер: WRONG_CREDENTIALS, PASS_UNAVAILABLE и
/// прочие. Приложение переводит их само, поэтому сервер шлёт код, а не
/// готовую строку.
struct APIError: Error {
    let status: Int
    let code: String?
    let retryAfter: Int?

    /// Сеть не ответила вовсе — запись уйдёт в очередь, а не потеряется.
    var isOffline: Bool { status == 0 }
    var isUnauthorized: Bool { status == 401 }

    /// Протух токен — и только это.
    ///
    /// 401 приходит и по другому поводу: сервер понял, кто пришёл, и
    /// отказал по существу — например не сошёлся PIN при удалении
    /// бизнеса. Обновлять токен там бессмысленно, а молчаливый повтор
    /// запроса списал бы у человека вторую попытку из лимита за одну
    /// опечатку.
    var isStaleToken: Bool { status == 401 && (code == nil || code == "UNAUTHORIZED") }
}

/// Клиент HTTP.
///
/// Без сторонних библиотек: запросов полтора десятка, а URLSession умеет
/// всё, что для них нужно. Каждая зависимость — это ещё и её обновления,
/// её несовместимости и её сопровождение.
actor APIClient {
    static let shared = APIClient()

    /// Косая черта на конце обязательна: без неё относительный путь
    /// заменяет последний сегмент, и `summary` уезжает в `/api/summary`.
    /* Свой домен. Прежний baziss.duckdns.org сервер обслуживает по-прежнему
       и обрывать его нельзя: на телефонах стоят сборки, которые ходят
       именно туда, и для них смена адреса означала бы мёртвое приложение
       до следующего обновления. */
    private let base = APIClient.baseURL()

    /**
     * Адрес сервера.
     *
     * В обычной сборке он один и зашит намертво. В отладочной его можно
     * подменить переменной окружения `TETR_API` — без этого проверить
     * приложение можно только на боевом сервере, то есть на живых
     * клиентах. Схема запуска в Xcode переменных не несёт: ставится руками
     * или через `xcrun simctl launch`.
     *
     *     xcrun simctl launch --console <udid> com.sevarm.tetr \
     *       --setenv TETR_API http://localhost:3100/api/v1/
     */
    private static func baseURL() -> URL {
        #if DEBUG
        if let raw = ProcessInfo.processInfo.environment["TETR_API"], let url = URL(string: raw) {
            return url
        }
        #endif
        return URL(string: "https://tetrin.pro/api/v1/")!
    }
    private let session: URLSession

    private lazy var decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { decoder in
            let text = try decoder.singleValueContainer().decode(String.self)
            if let date = ISO8601DateFormatter.withFraction.date(from: text) { return date }
            if let date = ISO8601DateFormatter.plain.date(from: text) { return date }
            throw DecodingError.dataCorrupted(
                .init(codingPath: decoder.codingPath, debugDescription: "дата: \(text)")
            )
        }
        return d
    }()

    init() {
        let config = URLSessionConfiguration.default
        // Во дворе мойки связь пропадает. Долгое ожидание бессмысленно:
        // запись всё равно ляжет в очередь и уйдёт, когда связь вернётся.
        config.timeoutIntervalForRequest = 12
        config.waitsForConnectivity = false
        session = URLSession(configuration: config)
    }

    func send<T: Decodable>(
        _ path: String,
        method: String = "GET",
        body: [String: Any]? = nil,
        token: String? = nil,
        as type: T.Type
    ) async throws -> T {
        let data = try await raw(path, method: method, body: body, token: token)
        if data.isEmpty, let empty = Empty() as? T { return empty }
        return try decoder.decode(T.self, from: data)
    }

    @discardableResult
    func raw(
        _ path: String,
        method: String = "GET",
        body: [String: Any]? = nil,
        token: String? = nil
    ) async throws -> Data {
        /* Не appendingPathComponent: он считает весь аргумент именем
           сегмента и кодирует «?» как часть пути. Запрос уходил на
           /summary%3Fperiod=today и возвращал 404 — сборка при этом
           проходила, и увидеть это можно было только запустив. */
        guard let url = URL(string: path, relativeTo: base) else {
            throw APIError(status: 0, code: nil, retryAfter: nil)
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch let error as URLError where error.code == .cancelled {
            /* Отмена — НЕ отсутствие связи.
               SwiftUI снимает задачу `refreshable`, и запрос обрывается на
               полпути. Раньше это приходило сюда наравне с обрывом сети и
               превращалось в «Կապ չկա» — экран сообщал о поломке там, где
               ничего не сломалось: каждое потягивание вниз в сводке давало
               ошибку. Отмену обязан обрабатывать тот, кто её вызвал. */
            throw CancellationError()
        } catch is CancellationError {
            throw CancellationError()
        } catch let error as URLError {
            /* Отличаем «сети нет» от «сервер ответил плохо»: в первом
               случае запись ждёт в очереди, во втором ждать нечего.
               Код URLError кладём в `code` — без него все сетевые беды
               выглядели одинаково, и разобрать их было нечем. */
            throw APIError(status: 0, code: "URL \(error.code.rawValue)", retryAfter: nil)
        } catch {
            throw APIError(status: 0, code: nil, retryAfter: nil)
        }

        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            throw APIError(
                status: status,
                code: json?["error"] as? String,
                retryAfter: json?["retryAfter"] as? Int
            )
        }
        return data
    }

    struct Empty: Decodable {}
}

extension ISO8601DateFormatter {
    static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    static let plain = ISO8601DateFormatter()
}

extension Array {
    /// Обращение по номеру, которого может не быть.
    ///
    /// Нужно там, где список приходит с сервера и короче ожидаемого:
    /// владелец добавил четвёртый класс, а цены в услуге пока на три.
    /// Падение приложения из-за этого недопустимо.
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
