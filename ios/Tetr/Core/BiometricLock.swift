import LocalAuthentication
import SwiftUI

/**
 * Быстрый вход по лицу.
 *
 * Раньше это был замок на всё приложение: каждый выход в фон закрывал
 * продукт, и вернуться можно было только через Face ID. Владелец сказал
 * прямо — не при каждом открытии. Он прав: телефон открывают по десять
 * раз за смену, и десять проверок лица за то, что человек посмотрел
 * время, продукт не защищают, а изматывают.
 *
 * Осталось единственное место, где проверка лица окупается, — экран
 * входа. Сессия хранится в телефоне, и лицо подтверждает, что телефон в
 * руках хозяина: тогда не надо заново набирать код из SMS или код
 * доступа. Выключен — сохранённый вход не предлагается вовсе, и человек
 * входит кодом, как обычно.
 *
 * Политика намеренно `deviceOwnerAuthentication`, а не только биометрия:
 * она допускает код-пароль телефона как запасной путь. С одной биометрией
 * человек с мокрыми руками или в маске оказался бы заперт снаружи —
 * приложение бы работало, а войти было нельзя.
 */
@MainActor
final class BiometricLock: ObservableObject {
    private static let key = "tetr.lock.enabled"

    @Published var enabled: Bool {
        didSet { UserDefaults.standard.set(enabled, forKey: Self.key) }
    }

    /// Есть ли чем открывать: биометрия или хотя бы код-пароль.
    var available: Bool {
        LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)
    }

    /// Как назвать это человеку: Face ID, Touch ID или просто код.
    var kindName: String {
        switch LAContext().biometryType {
        case .faceID: return "Face ID"
        case .touchID: return "Touch ID"
        default: return L("lock.code")
        }
    }

    init() {
        /* По умолчанию выключен: телефон на мойке общий, руки мокрые, и
           предлагать вход по лицу тому, кто его не просил, незачем.
           Включается одним переключателем в профиле. */
        enabled = UserDefaults.standard.object(forKey: Self.key) as? Bool ?? false
    }

    /// Предлагать ли сохранённый вход. И только он: замка на приложении
    /// больше нет.
    var quickSignIn: Bool { enabled && available }

    /// Системная проверка: лицо, отпечаток или код-пароль телефона.
    func authenticate(reason: String) async -> Bool {
        let context = LAContext()
        context.localizedFallbackTitle = ""
        do {
            return try await context.evaluatePolicy(
                .deviceOwnerAuthentication,
                localizedReason: reason
            )
        } catch {
            return false
        }
    }
}
