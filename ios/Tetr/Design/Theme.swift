import SwiftUI

/// Цвета марки — те же, что в вебе.
///
/// Разделение труда между ними не вкусовое, а вынужденное: лайм почти
/// предел яркости, и по светлому фону даёт контраст 1.06 — линия или
/// подпись этим цветом просто не видны. Поэтому лайм живёт только
/// заливкой под тёмный текст, а всё структурное держит грейп.
/// Цвет, который знает про тёмную тему.
///
/// Без этого экраны читались только днём: стекло и системные списки в
/// тёмной адаптируются сами, а прибитый гвоздями тёмный текст остаётся
/// тёмным — и ложится на тёмное. Ровно это и случилось в полночь.
private func adaptiveUI(light: UInt32, dark: UInt32) -> UIColor {
    UIColor { traits in
        UIColor(hex: traits.userInterfaceStyle == .dark ? dark : light)
    }
}

private func adaptive(light: UInt32, dark: UInt32) -> Color {
    Color(uiColor: adaptiveUI(light: light, dark: dark))
}

/// То же самое для палитры людей — она живёт в расширении и до приватной
/// функции не дотягивается.
func adaptivePublic(light: UInt32, dark: UInt32) -> Color {
    adaptive(light: light, dark: dark)
}

private extension UIColor {
    convenience init(hex: UInt32) {
        self.init(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: 1
        )
    }
}

enum Brand {
    /* Марка одинакова в обеих темах: грейп и лайм — это она и есть,
       а не элемент интерфейса. Меняется только окружение. */
    static let grapeFill = Color(red: 0x6D / 255, green: 0x28 / 255, blue: 0xD9 / 255)
    static let grapeDeep = Color(red: 0x2E / 255, green: 0x10 / 255, blue: 0x65 / 255)
    static let grapeMid = Color(red: 0x4C / 255, green: 0x1D / 255, blue: 0x95 / 255)
    static let lime = Color(red: 0xD7 / 255, green: 1, blue: 0)
    static let onLime = Color(red: 0x2E / 255, green: 0x10 / 255, blue: 0x65 / 255)

    /* Грейп как ТЕКСТ на тёмном фоне тонет — там он светлеет.
       Как заливка кнопки остаётся прежним: белый по нему читается
       одинаково на любой теме. */
    static let grape = Color(uiColor: grapeUI)

    /// Тот же грейп, но для UIKit.
    ///
    /// Нужен там, куда SwiftUI не дотягивается: спиннер обновления в
    /// списке — это UIRefreshControl, и `.tint` его не красит.
    static let grapeUI = adaptiveUI(light: 0x6D28D9, dark: 0xA78BFA)

    static let ink = adaptive(light: 0x1A1626, dark: 0xF7F5FB)
    static let muted = adaptive(light: 0x56506B, dark: 0xA9A2BD)
    static let line = adaptive(light: 0xE5E2EC, dark: 0x362F47)
    static let bg = adaptive(light: 0xFAF9FC, dark: 0x120F1A)
    static let good = adaptive(light: 0x047857, dark: 0x34D399)

    /* Сегментный переключатель: дорожка и выбранная плашка.
       Плашка светлее дорожки в обеих темах — так «выбрано» читается
       подсветкой, а не цветом, и не спорит с грейпом и лаймом, у которых
       на экране свои роли. */
    static let track = adaptive(light: 0xEDEBF3, dark: 0x241E33)
    static let trackOn = adaptive(light: 0xFFFFFF, dark: 0x453D5C)

    /* Убыток жёлтым, а не красным: красный в продукте значит «удалить»,
       и путать эти два сигнала нельзя. Те же значения, что в вебе. */
    static let warn = adaptive(light: 0xB45309, dark: 0xFBBF24)

    static let heroGradient = LinearGradient(
        colors: [grapeMid, grapeDeep],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}

extension View {
    /// Фон на весь экран, а не по размеру содержимого.
    ///
    /// `.background` красит ровно то, к чему прицеплен. На экране зарплат
    /// с одной строчкой «платить нечего» это давало белую полосу по ширине
    /// текста и чёрные поля по бокам. Растягиваем явно.
    func screenBackground() -> some View {
        frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Brand.bg.ignoresSafeArea())
    }
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

/**
 * Цвет человека.
 *
 * Один и тот же работник всегда одного цвета — в ленте, в списке на
 * смене, в истории дня. Тогда «кто это помыл» читается по цвету, без
 * чтения имени: на мойке два-три человека, и глаз запоминает их за день.
 *
 * Цвет берётся из имени, а не назначается: не нужно ни хранить его, ни
 * спрашивать, и он одинаков на всех устройствах.
 *
 * Оттенки подобраны различимыми и достаточно тёмными, чтобы читаться на
 * светлом фоне; в тёмной теме каждый светлеет.
 */
extension Brand {
    private static let people: [(light: UInt32, dark: UInt32)] = [
        (0x0E7490, 0x22D3EE), // бирюзовый
        (0xB45309, 0xFBBF24), // янтарный
        (0xBE185D, 0xF472B6), // малиновый
        (0x4D7C0F, 0xA3E635), // оливковый
        (0x6D28D9, 0xA78BFA), // грейп
        (0x0F766E, 0x2DD4BF), // морской
    ]

    static func person(_ name: String) -> Color {
        guard !name.isEmpty else { return muted }
        /* Простая устойчивая свёртка. Криптостойкость тут не нужна, нужна
           одинаковость: имя всегда даёт один и тот же цвет. */
        var hash = 0
        for scalar in name.unicodeScalars {
            hash = (hash &* 31 &+ Int(scalar.value)) & 0xFFFFFF
        }
        let pick = people[hash % people.count]
        return adaptivePublic(light: pick.light, dark: pick.dark)
    }
}
