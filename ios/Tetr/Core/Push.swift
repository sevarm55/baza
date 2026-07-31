import SwiftUI
import UserNotifications

/// Пуш-уведомления.
///
/// Разрешение спрашиваем не на запуске, а после входа и только у
/// владельца: мойщику уведомления не приходят вовсе, а системный запрос
/// без объяснения на первом экране отклоняют не глядя — и вернуть его
/// потом можно только через настройки телефона.
@MainActor
final class Push: NSObject, ObservableObject {
    static let shared = Push()

    /// Токен, который выдала система. Держим, чтобы отозвать его при выходе.
    private var deviceToken: String?

    /* Сессию держим тем же способом, что и фоновая досылка: делегат
       приложения получает токен от системы вне SwiftUI, и дотянуться до
       окружения оттуда нечем. */
    private weak var session: Session?

    func use(session: Session) {
        self.session = session
        // токен мог прийти раньше, чем поднялась сессия
        if deviceToken != nil { upload() }
    }

    /// Сборка из Xcode получает токен тестового контура Apple, магазинная —
    /// боевого. Хосты у них разные, и отправка не в тот контур возвращает
    /// BadDeviceToken на совершенно исправном токене.
    private var sandbox: Bool {
        #if DEBUG
        return true
        #else
        return false
        #endif
    }

    func askAndRegister() async {
        let center = UNUserNotificationCenter.current()
        center.delegate = self

        let granted = (try? await center.requestAuthorization(options: [.alert, .sound, .badge]))
            ?? false
        guard granted else { return }

        UIApplication.shared.registerForRemoteNotifications()
    }

    func store(_ raw: Data) {
        deviceToken = raw.map { String(format: "%02x", $0) }.joined()
        upload()
    }

    private func upload() {
        guard let session, let token = deviceToken else { return }
        Task {
            _ = try? await session.authed { access in
                try await APIClient.shared.raw(
                    "push/token",
                    method: "POST",
                    body: ["token": token, "sandbox": sandbox],
                    token: access
                )
            }
        }
    }

    /// Отозвать токен при выходе.
    ///
    /// Иначе на телефон, с которого человек вышел, продолжали бы приходить
    /// уведомления о чужой выручке — а телефон на мойке переходит из рук
    /// в руки.
    func revoke() async {
        guard let session, let deviceToken else { return }
        _ = try? await session.authed { access in
            try await APIClient.shared.raw(
                "push/token",
                method: "DELETE",
                body: ["token": deviceToken],
                token: access
            )
        }
        self.deviceToken = nil
    }
}

extension Push: UNUserNotificationCenterDelegate {
    /// Показывать и когда приложение открыто.
    ///
    /// Владелец может смотреть выручку в тот же момент, когда мойщик
    /// записывает машину, — и не увидеть этого было бы страннее всего.
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }
}
