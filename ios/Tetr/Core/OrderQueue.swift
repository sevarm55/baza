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
        /// Сколько взяли — уже со скидкой, если она была.
        let price: Int
        /**
         * Цена по прайсу. Нужна, чтобы скидка не потерялась в очереди:
         * запись может пролежать в телефоне до вечера, и отправить её
         * потом по прайсу значило бы молча отменить решение мойщика.
         *
         * Необязательная: в очереди могли остаться записи, сделанные до
         * появления скидок.
         */
        var listPrice: Int?
        let payment: String
        let at: Date
        /// Код отказа сервера, если он был. Запись при этом остаётся:
        /// молча выбрасывать работу человека нельзя.
        var failure: String?

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
    /// Три разных исхода, и разница между ними — это разница между
    /// «подождём» и «потеряли»:
    ///
    ///   ушло          — убираем из очереди, дело сделано;
    ///   связи нет     — останавливаем весь проход: остальным идти некуда;
    ///   сервер отказал — ПОМЕЧАЕМ и идём дальше.
    ///
    /// Последнее раньше было удалением, и это было ошибкой: мойщик записал
    /// машину, приложение сказало «готово», а запись исчезала молча и
    /// навсегда. Для продукта, который обещает «не потеряется», хуже
    /// поведения нет. Пусть лучше висит с пометкой и человек решит сам.
    @discardableResult
    func flush(using session: Session) async -> Int {
        var sent = 0

        for item in items where item.failure == nil {
            do {
                var payload: [String: Any] = [
                    "ref": item.ref,
                    "clientKey": item.clientKey,
                    "serviceId": item.serviceId,
                    "payment": item.payment,
                ]
                /* Цену шлём только когда она отличается от прайса: в
                   обычной записи это лишнее поле, а в записи со скидкой —
                   единственное, что её сохраняет. */
                if let list = item.listPrice, item.price < list {
                    payload["price"] = item.price
                }

                _ = try await session.authed { token in
                    try await self.api.raw("orders", method: "POST", body: payload, token: token)
                }
                remove(item.ref)
                sent += 1
            } catch let error as APIError where error.isOffline {
                break
            } catch let error as APIError {
                mark(item.ref, failure: error.code ?? "HTTP \(error.status)")
            } catch {
                mark(item.ref, failure: "\(error)")
            }
        }

        return sent
    }

    /// Записи, которые сервер не принял. Показываются отдельно: это не
    /// «ещё не ушло», а «не уйдёт само».
    var rejected: [Item] { items.filter { $0.failure != nil } }
    var waiting: [Item] { items.filter { $0.failure == nil } }

    /// Повторить отвергнутую — например, после того как владелец вернул
    /// услугу в прайс.
    func retry(_ ref: String) {
        mark(ref, failure: nil)
    }

    /// Убрать отвергнутую совсем. Только по решению человека: сама
    /// очередь ничего не выбрасывает.
    func drop(_ ref: String) {
        remove(ref)
    }

    private func mark(_ ref: String, failure: String?) {
        guard let i = items.firstIndex(where: { $0.ref == ref }) else { return }
        items[i].failure = failure
        save()
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
