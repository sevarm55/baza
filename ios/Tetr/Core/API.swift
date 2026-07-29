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

    struct Summary: Decodable {
        let stats: Stats
        let feed: [FeedItem]
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
}

/// Клиент HTTP.
///
/// Без сторонних библиотек: запросов полтора десятка, а URLSession умеет
/// всё, что для них нужно. Каждая зависимость — это ещё и её обновления,
/// её несовместимости и её сопровождение.
actor APIClient {
    static let shared = APIClient()

    private let base = URL(string: "https://baziss.duckdns.org/api/v1")!
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
        var request = URLRequest(url: base.appendingPathComponent(path))
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
