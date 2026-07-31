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
    }

    struct Bootstrap: Decodable {
        let tenant: Tenant
        let me: Me
        let access: Access
        let services: [Service]
    }

    struct Tokens: Decodable {
        let access: String
        let refresh: String
        let expiresIn: Int
    }

    struct LoginResult: Decodable {
        let access: String
        let refresh: String
        let expiresIn: Int
        let user: Me
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
    }

    struct Expenses: Decodable {
        let hints: [String]
        let expenses: [Expense]
    }

    struct FeedItem: Decodable, Identifiable {
        let id: String
        let clientKey: String?
        let serviceName: String
        let staffName: String?
        let price: Int
        let payment: String
        let createdAt: Date
    }

    /// Столбик графика. Ключ приходит строкой «2026-07-29 16», а не датой:
    /// timestamp без зоны при разборе трактуется как время клиента, и
    /// график съезжает на разницу часовых поясов.
    struct SeriesPoint: Decodable, Identifiable {
        let key: String
        let revenue: Int
        var id: String { key }
        /// последние две цифры ключа — час или день
        var label: String { String(key.suffix(2)) }
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
        let stats: Stats
        /* Прибыль считает сервер: формула одна на приложение и кабинет,
           и разъехаться между ними она не должна — это та цифра, из-за
           которой продукту верят. */
        let costs: Costs
        let profit: Int
        let onShift: [Present]
        let series: [SeriesPoint]
        let split: [SplitSegment]
        let feed: [FeedItem]
    }

    struct PayrollDue: Decodable, Identifiable {
        let staffId: String?
        let name: String?
        let percent: Int
        let count: Int
        let revenue: Int
        let earned: Int
        var id: String { staffId ?? "—" }
    }

    struct Payout: Decodable, Identifiable {
        let id: String
        let amount: Int
        let paidAt: Date
        let staffName: String?
    }

    struct Payroll: Decodable {
        let due: [PayrollDue]
        let payouts: [Payout]
    }

    struct Client: Decodable, Identifiable {
        let id: String
        let key: String
        let name: String?
        let visits: Int
        let total: Int
        let daysSince: Int
    }

    struct Clients: Decodable {
        let clients: [Client]
    }

    struct StaffMember: Decodable, Identifiable {
        let id: String
        let name: String
        let phone: String
        let role: String
        let percent: Int
        let isMe: Bool
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
    private let base = URL(string: "https://baziss.duckdns.org/api/v1/")!
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
        } catch {
            // отличаем «сети нет» от «сервер ответил плохо»: в первом
            // случае запись ждёт в очереди, во втором ждать нечего
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
