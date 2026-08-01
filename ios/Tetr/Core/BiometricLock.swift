import LocalAuthentication
import SwiftUI

/// Замок на приложении.
///
/// В нём лежит выручка бизнеса и зарплаты людей, а телефон мойщика на
/// мойке живёт где придётся. PIN спрашивать при каждом запуске — значит
/// сорок раз в смену; Face ID снимает это одним взглядом.
///
/// Политика намеренно `deviceOwnerAuthentication`, а не только биометрия:
/// она допускает код-пароль телефона как запасной путь. С одной биометрией
/// человек с мокрыми руками или в маске оказался бы заперт снаружи —
/// приложение бы работало, а войти было нельзя.
@MainActor
final class BiometricLock: ObservableObject {
    private static let key = "tetr.lock.enabled"

    @Published private(set) var locked = false

    @Published var enabled: Bool {
        didSet {
            UserDefaults.standard.set(enabled, forKey: Self.key)
            if !enabled { locked = false }
        }
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
        default: return "կոդ"
        }
    }

    init() {
        // По умолчанию включён: продукт про деньги, и открытый нараспашку
        // кабинет владельца — плохая настройка по умолчанию. Выключается
        // одним переключателем.
        enabled = UserDefaults.standard.object(forKey: Self.key) as? Bool ?? true
    }

    /// Закрыть, если есть что закрывать. Зовётся на запуске и при уходе
    /// приложения в фон.
    func lockIfNeeded(hasSession: Bool) {
        locked = enabled && available && hasSession
    }

    func unlock() async {
        let context = LAContext()
        // «Ввести пароль» вместо «Отмена»: тупика быть не должно
        context.localizedFallbackTitle = ""

        do {
            locked = !(try await context.evaluatePolicy(
                .deviceOwnerAuthentication,
                localizedReason: "Բացել Tetrin-ը"
            ))
        } catch {
            // отказались или не вышло — остаётся закрытым, попробуют снова
        }
    }
}

/// Экран замка.
///
/// Ничего, кроме кнопки: показывать здесь цифры смысла нет — ради того,
/// чтобы их не показывать, замок и стоит.
struct LockView: View {
    @EnvironmentObject private var lock: BiometricLock
    @EnvironmentObject private var session: Session

    /// Автоматически пробуем ровно один раз.
    ///
    /// Иначе получается ловушка: системный запрос закрывает экран целиком,
    /// отказ возвращает нас сюда, и `.task` тут же зовёт его снова. До
    /// кнопок под ним не добраться никогда — ни до повтора, ни до выхода.
    @State private var tried = false

    var body: some View {
        ZStack {
            Brand.heroGradient.ignoresSafeArea()

            VStack(spacing: 18) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 44))
                    .foregroundStyle(Brand.lime)

                Text("TETRIN")
                    .font(.system(size: 15, weight: .bold))
                    .tracking(4)
                    .foregroundStyle(.white.opacity(0.7))

                Button("Բացել \(lock.kindName)-ով") {
                    Task { await lock.unlock() }
                }
                .buttonStyle(LimeButton())
                .padding(.horizontal, 40)
                .padding(.top, 10)

                /* Выход отсюда обязателен. Замок может не открыться по
                   причинам, которых человек не выбирал: Face ID сломался,
                   лицо в маске, код-пароль сменили. Без этой кнопки он
                   заперт снаружи собственного приложения — и починить
                   это можно будет только переустановкой.
                   Вход по телефону и PIN остаётся всегда. */
                Button("Մուտք գործել հեռախոսով") {
                    Task { await session.signOut() }
                }
                .font(.system(size: 14.5, weight: .semibold))
                .foregroundStyle(.white.opacity(0.7))
                .padding(.top, 6)
            }
        }
        .preferredColorScheme(.dark)
        // пробуем сразу: лишнее касание на входе никому не нужно
        .task {
            guard !tried else { return }
            tried = true
            await lock.unlock()
        }
    }
}
