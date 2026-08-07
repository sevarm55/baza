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

    /// Карточка на холсте: белая бумага поверх кремовой.
    static let tile = adaptive(light: 0xFFFFFF, dark: 0x1A1626)

    /// Холст кабинета владельца: тёплая бумага вместо голубоватого белого.
    ///
    /// В тёмной теме он почти чёрный — на нём цветные карточки бьют так же,
    /// как в референсе. В светлой он темнее белой карточки, иначе белое на
    /// белом перестаёт быть карточкой.
    ///
    /// Верх этого экрана набран одной типографикой — ни карточки, ни
    /// заливки. На `bg` (#FAF9FC, холодный, почти белый) чёрная цифра в 68
    /// пунктов выглядит документом из офиса; на тёплом кремовом — печатью.
    /// Отличие в четыре процента яркости, а читается совсем иначе.
    static let canvas = adaptive(light: 0xE8E4DC, dark: 0x0B0A0E)

    /* Лист в линейку. Имя продукта — «տետր», тетрадь, и кабинет владельца
       ровно ей и притворяется: бумага, поле, линейки, суммы в колонку.
       Линейка бледная намеренно: она разметка, а не содержание, и стоит
       заметить её только тогда, когда специально посмотришь. */
    static let paper = adaptive(light: 0xF4F0E6, dark: 0x131118)
    static let rule = adaptive(light: 0x1A1626, dark: 0xF7F5FB)

    /* Табло. Почти чёрное в тёмной теме и почти белое в светлой — а плитки
       на нём тёмные в обеих: их цвет несёт смысл и меняться от того, светло
       в комнате или темно, не должен. */
    static let board = adaptive(light: 0xF3F2F0, dark: 0x0A0A0C)
    static let onBoard = adaptive(light: 0x14121A, dark: 0xF7F5FB)
    static let boardMuted = adaptive(light: 0x6B6577, dark: 0x8E8899)
    /// Чернила табло для подложек: тёмные по светлому, светлые по тёмному.
    static let boardInk = adaptive(light: 0x14121A, dark: 0xF7F5FB)
    static let goodOnBoard = adaptive(light: 0x0E8A5F, dark: 0x34D399)
    static let warnOnBoard = adaptive(light: 0xB45309, dark: 0xFBBF24)
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

    /* Те же знаки, но НА ТЁМНОМ — и по теме системы они не адаптируются.
       Ловушка простая: `warn` в светлой теме тёмно-оранжевый, а `good` —
       тёмно-зелёный, и на грейповой заливке их обоих просто нет. Цвет
       текста выбирается по цвету поверхности под ним, а не по теме. */
    static let inkOnDark = Color.white
    static let mutedOnDark = Color.white.opacity(0.72)
    static let goodOnDark = Color(red: 0x34 / 255, green: 0xD3 / 255, blue: 0x99 / 255)
    static let warnOnDark = Color(red: 0xFB / 255, green: 0xBF / 255, blue: 0x24 / 255)

    static let heroGradient = LinearGradient(
        colors: [grapeMid, grapeDeep],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}

/**
 * Лицо карточки — заливка и оба знака текста разом.
 *
 * Цвета здесь НЕ адаптивные, и это главное. В референсе белая, лаймовая и
 * синяя карточки одинаковы на любом фоне; менять их по теме системы значит
 * менять сам продукт от того, светло в комнате или темно. Меняется только
 * холст под ними.
 *
 * Заведено типом, а не набором цветов, потому что правило «цвет текста
 * выбирается по цвету карточки под ним» нарушается ровно тогда, когда его
 * можно нарушить: белый текст на лайме невидим, тёмный на грейпе — тоже.
 * Теперь взять заливку, не взяв к ней знаки, нельзя.
 */
enum Face {
    /// Белая бумага. Главное число и списки.
    case paper
    /// Лайм. Разбор денег: то, ради чего экран и открыли.
    case lime
    /// Грейп. График и всё, что про форму периода.
    case grape

    var fill: Color {
        switch self {
        case .paper: return Color(red: 1, green: 1, blue: 1)
        case .lime: return Brand.lime
        case .grape: return Brand.grapeFill
        }
    }

    /// Основной текст.
    var ink: Color {
        switch self {
        case .grape: return .white
        default: return Color(red: 0x14 / 255, green: 0x12 / 255, blue: 0x1A / 255)
        }
    }

    /// Второстепенный.
    var muted: Color {
        switch self {
        case .grape: return .white.opacity(0.72)
        case .lime: return Color(red: 0x14 / 255, green: 0x12 / 255, blue: 0x1A / 255).opacity(0.62)
        case .paper: return Color(red: 0x5A / 255, green: 0x55 / 255, blue: 0x68 / 255)
        }
    }

    /// Вложенная плашка: чип, пилюля, кружок кнопки.
    var inset: Color {
        switch self {
        case .grape: return .white.opacity(0.16)
        case .lime: return Color(red: 0x14 / 255, green: 0x12 / 255, blue: 0x1A / 255).opacity(0.10)
        case .paper: return Color(red: 0xF0 / 255, green: 0xEE / 255, blue: 0xEA / 255)
        }
    }

    /// Тёмный кружок-кнопка из референса: он одинаков на всех лицах.
    var knob: Color {
        switch self {
        case .grape: return .white
        default: return Color(red: 0x14 / 255, green: 0x12 / 255, blue: 0x1A / 255)
        }
    }

    var onKnob: Color {
        switch self {
        case .grape: return Brand.grapeFill
        case .lime: return Brand.lime
        case .paper: return .white
        }
    }

    var good: Color { Color(red: 0x0E / 255, green: 0x8A / 255, blue: 0x5F / 255) }
    var warn: Color { Color(red: 0xB4 / 255, green: 0x53 / 255, blue: 0x09 / 255) }
}

extension View {
    /// Карточка-виджет: крупное скругление, свой цвет, свои поля.
    func face(_ f: Face, radius: CGFloat = 28, pad: CGFloat = 18) -> some View {
        padding(pad)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(f.fill, in: .rect(cornerRadius: radius))
    }

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
    /// Идёт запрос. Надпись остаётся на месте и гаснет, поверх ложится
    /// загрузчик: подменять текст на «…» значит менять ширину кнопки под
    /// пальцем и терять то, на что человек только что нажал.
    var loading = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 17, weight: .bold))
            .foregroundStyle(Brand.onLime)
            .loading(loading, tint: Brand.onLime, size: 22)
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

/**
 * Тон плитки: тёмная заливка и светящееся пятно в углу.
 *
 * Пятно — не украшение, а то, чем этот приём отличается от плоского
 * прямоугольника: оно даёт плитке источник света, и сетка из шести таких
 * читается набором приборов, а не таблицей ячеек.
 */
enum Tone {
    case violet, teal, amber, lime, slate

    var base: Color {
        switch self {
        case .violet: return Color(red: 0x3B / 255, green: 0x14 / 255, blue: 0x7A / 255)
        case .teal: return Color(red: 0x0B / 255, green: 0x3D / 255, blue: 0x3A / 255)
        case .amber: return Color(red: 0x4A / 255, green: 0x22 / 255, blue: 0x0A / 255)
        case .lime: return Brand.lime
        case .slate: return Color(red: 0x22 / 255, green: 0x21 / 255, blue: 0x2A / 255)
        }
    }

    /// Светящееся пятно.
    var glow: Color {
        switch self {
        case .violet: return Color(red: 0xA7 / 255, green: 0x8B / 255, blue: 0xFA / 255)
        case .teal: return Color(red: 0x2D / 255, green: 0xD4 / 255, blue: 0xBF / 255)
        case .amber: return Color(red: 0xFB / 255, green: 0xBF / 255, blue: 0x24 / 255)
        case .lime: return .white
        case .slate: return Color(red: 0x8B / 255, green: 0x88 / 255, blue: 0xA8 / 255)
        }
    }

    /// Знаки на плитке. По цвету заливки, а не по теме системы: лайм светлый
    /// при любой теме, и белый текст на нём невидим.
    var ink: Color {
        switch self {
        case .lime: return Color(red: 0x1A / 255, green: 0x16 / 255, blue: 0x26 / 255)
        default: return .white
        }
    }
}

extension View {
    func tile(_ tone: Tone, radius: CGFloat = 22, pad: CGFloat = 15) -> some View {
        padding(pad)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                ZStack(alignment: .topTrailing) {
                    tone.base
                    RadialGradient(
                        colors: [tone.glow.opacity(0.55), tone.glow.opacity(0)],
                        center: .topTrailing,
                        startRadius: 2,
                        endRadius: 130
                    )
                }
                .clipShape(.rect(cornerRadius: radius))
            }
    }
}

/// Кольцо доли: заполненная дуга — то, что осталось владельцу.
struct Ring: View {
    let share: Double

    var body: some View {
        let s = min(1, max(0, share))
        ZStack {
            Circle()
                .stroke(.white.opacity(0.22), lineWidth: 7)
            Circle()
                .trim(from: 0, to: s)
                .stroke(Brand.lime, style: .init(lineWidth: 7, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Text("\(Int((s * 100).rounded()))%")
                .font(.system(size: 15, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(.white)
        }
        .animation(.snappy(duration: 0.45), value: s)
    }
}

/**
 * Волна: сглаженная линия через точки.
 *
 * Квадратичные сегменты через середины отрезков, а не через сами точки:
 * кривая, натянутая на узлы, вылетает за них выбросами, и на данных с одним
 * высоким часом это давало горб выше пика.
 */
struct Wave: Shape {
    let points: [CGPoint]

    func path(in rect: CGRect) -> Path {
        var p = Path()
        guard points.count > 1 else { return p }
        p.move(to: points[0])
        for i in 0..<(points.count - 1) {
            let mid = CGPoint(
                x: (points[i].x + points[i + 1].x) / 2,
                y: (points[i].y + points[i + 1].y) / 2
            )
            if i == 0 { p.addLine(to: mid) } else { p.addQuadCurve(to: mid, control: points[i]) }
        }
        p.addLine(to: points[points.count - 1])
        return p
    }
}

/**
 * Нажатие как у плитки, а не как у ссылки.
 *
 * `.plain` не даёт вообще никакого отклика, и на мокром экране остаётся
 * непонятно, засчиталось касание или палец проскользнул. Уменьшение на два
 * процента с короткой пружиной — самый дешёвый честный ответ: он есть в
 * момент касания, а не после ответа сервера.
 */
struct PressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .opacity(configuration.isPressed ? 0.9 : 1)
            .animation(.spring(response: 0.22, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == PressStyle {
    static var press: PressStyle { PressStyle() }
}

extension Brand {
    /**
     * Тон плитки для конкретного человека.
     *
     * Палитра людей уже хранит по два значения на каждого — тёмное для
     * светлой темы и светлое для тёмной. Здесь они работают не как «цвет по
     * теме», а как заливка и свечение одной плитки: тёмное вниз, светлое в
     * угол. Поэтому у каждого мойщика своя плитка его цветом, и лист
     * зарплат перестаёт быть стопкой одинаковых карточек.
     */
    static func personTone(_ name: String) -> (base: Color, glow: Color) {
        guard !name.isEmpty else {
            return (Color(red: 0x22 / 255, green: 0x21 / 255, blue: 0x2A / 255),
                    Color(red: 0x8B / 255, green: 0x88 / 255, blue: 0xA8 / 255))
        }
        var hash = 0
        for scalar in name.unicodeScalars {
            hash = (hash &* 31 &+ Int(scalar.value)) & 0xFFFFFF
        }
        let deep: [UInt32] = [0x0E7490, 0x8A3F07, 0x8E1245, 0x3A5E0B, 0x4C1D95, 0x0F766E]
        let bright: [UInt32] = [0x22D3EE, 0xFBBF24, 0xF472B6, 0xA3E635, 0xA78BFA, 0x2DD4BF]
        let i = hash % deep.count
        return (rgb(deep[i]), rgb(bright[i]))
    }

    private static func rgb(_ hex: UInt32) -> Color {
        Color(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}

extension View {
    /// Та же плитка со свечением, но своими цветами — для людей, у каждого
    /// из которых свой оттенок.
    func tile(base: Color, glow: Color, radius: CGFloat = 22, pad: CGFloat = 16) -> some View {
        padding(pad)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                ZStack(alignment: .topTrailing) {
                    base
                    RadialGradient(
                        colors: [glow.opacity(0.5), glow.opacity(0)],
                        center: .topTrailing,
                        startRadius: 2,
                        endRadius: 150
                    )
                }
                .clipShape(.rect(cornerRadius: radius))
            }
    }
}

/**
 * Фирменный загрузчик.
 *
 * Не системный спиннер и не три точки. Столбики — то, из чего собран весь
 * продукт: они в графике дня, в профиле недели, в значке вкладки. Пока
 * приложение думает, оно показывает ту же фигуру, которой показывает
 * деньги, и это единственная причина, по которой загрузчик здесь свой, а не
 * `ProgressView`.
 *
 * Волна, а не мигание: столбики поднимаются по очереди со сдвигом фазы,
 * поэтому фигура читается «идёт счёт», а не «что-то моргает».
 *
 * Ход берётся из `TimelineView`, а не из `repeatForever`. Бесконечная
 * анимация останавливается, когда SwiftUI пересоздаёт вид — а загрузчик
 * живёт как раз внутри кнопок, которые перестраиваются на каждое нажатие,
 * и замерший индикатор загрузки хуже, чем никакого: он говорит, что всё
 * зависло.
 *
 * При «Уменьшении движения» столбики стоят на месте и вместо них дышит
 * прозрачность: настройка запрещает движение, а не признак работы.
 */
struct TetrLoader: View {
    /// Высота фигуры. Ширина считается от неё.
    var size: CGFloat = 22
    var tint: Color = Brand.grape
    var bars: Int = 4

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 60.0, paused: false)) { ctx in
            let t = ctx.date.timeIntervalSinceReferenceDate
            HStack(spacing: size * 0.15) {
                ForEach(0..<bars, id: \.self) { i in
                    Capsule()
                        .fill(tint)
                        .frame(width: size * 0.17, height: height(at: i, t: t))
                        .opacity(reduceMotion ? breathe(t) : 1)
                }
            }
            .frame(width: size * 1.2, height: size)
        }
        .accessibilityElement()
        .accessibilityLabel("Բեռնվում է")
        .accessibilityAddTraits(.updatesFrequently)
    }

    /// Высота столбика: синус со сдвигом по номеру — отсюда бегущая волна.
    private func height(at i: Int, t: Double) -> CGFloat {
        guard !reduceMotion else {
            // неподвижная лесенка: движения нет, а фигура остаётся собой
            return size * (0.42 + 0.58 * CGFloat(i) / CGFloat(max(1, bars - 1)))
        }
        let phase = t * 2.7 - Double(i) * 0.5
        let k = (sin(phase) + 1) / 2
        return size * CGFloat(0.32 + 0.68 * k)
    }

    /// Дыхание прозрачности вместо движения.
    private func breathe(_ t: Double) -> Double {
        0.45 + 0.55 * (sin(t * 1.6) + 1) / 2
    }
}

extension View {
    /**
     * Подменить содержимое загрузчиком, не меняя размера.
     *
     * Именно не меняя: если на время запроса заменить текст кнопки на
     * индикатор, кнопка схлопывается до ширины индикатора и прыгает под
     * пальцем. Здесь содержимое остаётся на месте и просто становится
     * прозрачным, а загрузчик ложится поверх.
     */
    func loading(_ on: Bool, tint: Color, size: CGFloat = 22) -> some View {
        opacity(on ? 0 : 1)
            .overlay {
                if on { TetrLoader(size: size, tint: tint) }
            }
            .animation(.easeOut(duration: 0.18), value: on)
    }
}
