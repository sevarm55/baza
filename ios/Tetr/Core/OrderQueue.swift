import Foundation

/// Очередь записей, сделанных без связи.
///
/// Мойка часто в подвале или за городом. «Не сохранилось, потому что не
/// было интернета» убьёт доверие быстрее любого бага, поэтому запись
/// сначала ложится сюда, экран сразу показывает успех, а отправка —
/// отдельная забота.
///
/// У каждой записи свой `ref`, придуманный телефоном. Досылка может уйти
/// дважды: сервер по ref поймёт, что это та же машина, а не вторая, и
/// ответит 200 вместо 201. Ошибкой это не считается ни на одной стороне.
///
/// Хранится файлом, а не базой. Записей в очереди единицы — они уходят
/// при первой же связи; ради них тянуть SQLite незачем.
@MainActor
final class OrderQueue: ObservableObject {
    struct Item: Codable, Identifiable {
        let ref: String
        let clientKey: String
        let serviceId: String
        let serviceName: String
        let price: Int
        let payment: String
        let at: Date

        var id: String { ref }
    }

    @Published private(set) var items: [Item] = []

    private let file: URL
    private let api = APIClient.shared

    init() {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        file = dir.appendingPathComponent("queue.json")
        load()
    }

    func add(_ item: Item) {
        items.append(item)
        save()
    }

    /// Отправить всё, что накопилось.
    ///
    /// На первой же неудаче останавливаемся: связь пропала, остальное
    /// подождёт следующей попытки. Порядок сохраняется — записи уходят
    /// в том же порядке, в каком их сделали.
    @discardableResult
    func flush(using session: Session) async -> Int {
        var sent = 0
        for item in items {
            do {
                _ = try await session.authed { token in
                    try await self.api.raw(
                        "orders",
                        method: "POST",
                        body: [
                            "ref": item.ref,
                            "clientKey": item.clientKey,
                            "serviceId": item.serviceId,
                            "payment": item.payment,
                        ],
                        token: token
                    )
                }
                remove(item.ref)
                sent += 1
            } catch let error as APIError where error.isOffline {
                break
            } catch {
                // сервер отказал по существу — например, услугу убрали из
                // прайса. Держать такую запись вечно нельзя: она будет
                // отваливаться при каждой попытке и блокировать очередь
                remove(item.ref)
            }
        }
        return sent
    }

    private func remove(_ ref: String) {
        items.removeAll { $0.ref == ref }
        save()
    }

    private func load() {
        guard let data = try? Data(contentsOf: file) else { return }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        items = (try? decoder.decode([Item].self, from: data)) ?? []
    }

    private func save() {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        try? encoder.encode(items).write(to: file, options: .atomic)
    }
}
