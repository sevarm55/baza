import SwiftUI

/// Цвета марки — те же, что в вебе.
///
/// Разделение труда между ними не вкусовое, а вынужденное: лайм почти
/// предел яркости, и по светлому фону даёт контраст 1.06 — линия или
/// подпись этим цветом просто не видны. Поэтому лайм живёт только
/// заливкой под тёмный текст, а всё структурное держит грейп.
enum Brand {
    static let grape = Color(red: 0x6D / 255, green: 0x28 / 255, blue: 0xD9 / 255)
    static let grapeDeep = Color(red: 0x2E / 255, green: 0x10 / 255, blue: 0x65 / 255)
    static let grapeMid = Color(red: 0x4C / 255, green: 0x1D / 255, blue: 0x95 / 255)
    static let lime = Color(red: 0xD7 / 255, green: 1, blue: 0)
    static let onLime = Color(red: 0x2E / 255, green: 0x10 / 255, blue: 0x65 / 255)

    static let ink = Color(red: 0x1A / 255, green: 0x16 / 255, blue: 0x26 / 255)
    static let muted = Color(red: 0x56 / 255, green: 0x50 / 255, blue: 0x6B / 255)
    static let line = Color(red: 0xE5 / 255, green: 0xE2 / 255, blue: 0xEC / 255)
    static let bg = Color(red: 0xFA / 255, green: 0xF9 / 255, blue: 0xFC / 255)
    static let good = Color(red: 0x04 / 255, green: 0x78 / 255, blue: 0x57 / 255)

    static let heroGradient = LinearGradient(
        colors: [grapeMid, grapeDeep],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}

/// Деньги.
///
/// Целые в минимальных единицах — так они пришли с сервера и так же
/// уходят обратно. Через плавающую точку сумма зарплаты однажды разойдётся
/// с той, что видит владелец, и объяснить это будет нечем.
func money(_ amount: Int, _ currency: String = "AMD") -> String {
    let f = NumberFormatter()
    f.numberStyle = .decimal
    f.groupingSeparator = "\u{202F}"
    let number = f.string(from: NSNumber(value: amount)) ?? "\(amount)"
    let symbol = currency == "AMD" ? "֏" : currency
    return "\(number)\u{202F}\(symbol)"
}

/// Главная кнопка: лайм под тёмным текстом, во всю ширину.
///
/// Заливка сплошная, не стеклянная, и это не упущение. Стекло берёт цвет
/// от того, что под ним, — а единственное действие на экране обязано
/// выглядеть одинаково всегда, иначе перестаёт читаться как кнопка.
/// Стекло достаётся поверхностям, сплошной цвет — действию.
struct LimeButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 17, weight: .bold))
            .foregroundStyle(Brand.onLime)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 17)
            .background(Brand.lime, in: RoundedRectangle(cornerRadius: 22))
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

/// Стеклянная карточка — поверхность, а не действие.
struct GlassCard: ViewModifier {
    var radius: CGFloat = 20

    func body(content: Content) -> some View {
        content
            .padding(16)
            .glassEffect(.regular, in: .rect(cornerRadius: radius))
    }
}

extension View {
    func glassCard(radius: CGFloat = 20) -> some View {
        modifier(GlassCard(radius: radius))
    }
}
