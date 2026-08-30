import SwiftUI

/**
 * Пять видов карточки дня в зарплатах — и переключатель между ними.
 *
 * ВРЕМЕННАЯ ВЕЩЬ. Владелец вернул страницу зарплат к прежнему виду, но
 * саму карточку дня попросил переделать и показать варианты. Виды
 * разведены устройством, а не отделкой: список, конверты, чек, сетка,
 * доли. Общее у них одно — что делает человек: отмечает, кому отдал.
 *
 * Как только вид выбран, остальные четыре и переключатель уходят.
 */
enum PayrollDayStyle: Int, CaseIterable, Identifiable {
    /// Конверты: человек — карточка со своей цветной кромкой.
    case envelopes = 0
    /// Чек: моноширинная лента с пунктиром и итогом внизу.
    case receipt = 1
    /// Сетка: люди плитками по двое в ряд.
    case grid = 2
    /// Итог сверху, люди тихими строками под ним.
    case total = 3
    /// Доли: у каждого полоса его части дневного фонда.
    case shares = 4

    var id: Int { rawValue }

    /// Имя для переключателя — язык разработки, в релизе его не будет.
    var name: String {
        switch self {
        case .envelopes: return "Конверты"
        case .receipt: return "Чек"
        case .grid: return "Сетка"
        case .total: return "Итог сверху"
        case .shares: return "Доли"
        }
    }

    static var current: PayrollDayStyle {
        get { PayrollDayStyle(rawValue: UserDefaults.standard.integer(forKey: key)) ?? .envelopes }
        set { UserDefaults.standard.set(newValue.rawValue, forKey: key) }
    }

    private static let key = "tetr.payrollDayStyle"
}

/// Переключатель видов карточки дня — временный орган выбора.
struct PayrollDayStyleSwitch: View {
    @Binding var style: PayrollDayStyle

    var body: some View {
        Button {
            let all = PayrollDayStyle.allCases
            let next = all[(all.firstIndex(of: style).map { $0 + 1 } ?? 0) % all.count]
            style = next
            PayrollDayStyle.current = next
            UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        } label: {
            HStack(spacing: 5) {
                Text("\(style.rawValue + 1)/\(PayrollDayStyle.allCases.count)")
                    .font(.system(size: 10, weight: .bold))
                    .monospacedDigit()
                Text(style.name)
                    .font(.system(size: 10, weight: .semibold))
                Image(systemName: "arrow.trianglehead.2.clockwise")
                    .font(.system(size: 9, weight: .bold))
            }
            .foregroundStyle(Brand.grape)
            .padding(.horizontal, 9)
            .frame(minHeight: 28)
            .background(Brand.grape.opacity(0.10), in: .capsule)
            .contentShape(.rect)
        }
        .buttonStyle(.press)
        .accessibilityLabel("Вид дня: \(style.name)")
    }
}

/// Пунктирная черта чека.
struct PayrollDash: View {
    var body: some View {
        PayrollDashShape()
            .stroke(Brand.boardInk.opacity(0.22), style: StrokeStyle(lineWidth: 1, dash: [3, 4]))
            .frame(height: 1)
    }
}

private struct PayrollDashShape: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: 0, y: rect.midY))
        p.addLine(to: CGPoint(x: rect.width, y: rect.midY))
        return p
    }
}
