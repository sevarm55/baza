import BackgroundTasks
import Network

/// Досылка очереди, когда приложение закрыто.
///
/// Без неё обещание «не потеряется» держалось на честном слове: запись,
/// сделанная во дворе без связи, лежала в телефоне до тех пор, пока мойщик
/// снова не откроет экран смены. А он не откроет — он пошёл к следующей
/// машине, а к телефону вернётся вечером.
///
/// Два пути, и они дополняют друг друга:
///
///   система будит приложение   — когда захочет, но не чаще, чем считает
///                                нужным; работает и с закрытым
///   связь вернулась            — сразу, но только пока приложение живо
///
/// Ни один из них не гарантирован сам по себе, поэтому оба.
enum BackgroundSync {
    static let taskId = "com.sevarm.tetr.flush"

    @MainActor private static var session: Session?
    @MainActor private static var queue: OrderQueue?

    @MainActor
    static func use(session: Session, queue: OrderQueue) {
        Self.session = session
        Self.queue = queue
    }

    /// Регистрация обязана произойти до конца запуска приложения — иначе
    /// система считает идентификатор неизвестным и падает.
    static func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: taskId, using: nil) { task in
            handle(task)
        }
    }

    /// Просим разбудить нас. Просим каждый раз заново: одна заявка — одно
    /// пробуждение, система не возобновляет их сама.
    static func schedule() {
        let request = BGProcessingTaskRequest(identifier: taskId)
        // без сети досылать нечего, и будить телефон незачем
        request.requiresNetworkConnectivity = true
        request.requiresExternalPower = false
        request.earliestBeginDate = Date(timeIntervalSinceNow: 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    private static func handle(_ task: BGTask) {
        // следующую заявку подаём сразу: если сделать это в конце, а нас
        // прервут по времени — пробуждений больше не будет вовсе
        schedule()

        let work = Task { @MainActor in
            /* Фоновая досылка идёт по текущей точке: остальные дождутся
               возвращения на свою — там их и примут. */
            guard let session, let queue, !queue.waiting(at: session.tenant?.id).isEmpty else {
                task.setTaskCompleted(success: true)
                return
            }
            let sent = await queue.flush(using: session)
            task.setTaskCompleted(success: sent > 0)
        }

        task.expirationHandler = {
            work.cancel()
            task.setTaskCompleted(success: false)
        }
    }
}

/// Наблюдение за связью.
///
/// Нужно ради одного момента: мойщик вышел из подвала, связь появилась —
/// и очередь должна уйти тогда же, а не когда он в следующий раз откроет
/// экран. Ждать системного пробуждения тут глупо: приложение и так на
/// экране.
@MainActor
final class Connectivity: ObservableObject {
    @Published private(set) var online = true

    /// Вызывается в момент, когда связь ВЕРНУЛАСЬ, а не при каждом
    /// изменении: иначе досылка запускалась бы и на её пропадании.
    var onReturn: (() -> Void)?

    private let monitor = NWPathMonitor()

    init() {
        monitor.pathUpdateHandler = { [weak self] path in
            let now = path.status == .satisfied
            Task { @MainActor in
                guard let self else { return }
                let returned = now && !self.online
                self.online = now
                if returned { self.onReturn?() }
            }
        }
        monitor.start(queue: DispatchQueue(label: "com.sevarm.tetr.net"))
    }
}
