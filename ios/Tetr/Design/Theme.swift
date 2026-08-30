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

    /* Табло. Почти чёрное в тёмной теме и почти белое в светлой — а плитки
       на нём тёмные в обеих: их цвет несёт смысл и меняться от того, светло
       в комнате или темно, не должен. */
    static let board = adaptive(light: 0xF3F2F0, dark: 0x0A0A0C)
    static let onBoard = adaptive(light: 0x14121A, dark: 0xF7F5FB)
    static let boardMuted = adaptive(light: 0x6B6577, dark: 0x8E8899)
    /// Чернила табло для подложек: тёмные по светлому, светлые по тёмному.
    static let boardInk = adaptive(light: 0x14121A, dark: 0xF7F5FB)

    /* Заливка поля ввода на карточке. Светлее подложки на светлой теме,
       темнее — на тёмной: правило одно, поле не совпадает с тем, на чём
       лежит, иначе его просто не видно. */
    static let boardSurface = adaptive(light: 0xFFFFFF, dark: 0x1A191F)

    /**
     * Заливка нажимаемого контрола на полотне: поле, чип, плитка выбора.
     *
     * Раньше форма записи красила их `boardInk.opacity(0.07)` — той же
     * альфой, что волосяные грани карточек. На светлой теме это работало
     * случайно, а на тёмной 7 % белого по чёрному полотну давали
     * поверхность, неотличимую от фона: поле ввода, кнопка камеры и
     * плитки оплаты просто исчезали. Светлое значение здесь — тот же
     * серый, что давала альфа (пиксель в пиксель), тёмное — заметно
     * светлее полотна и светлее карточки: контрол обязан читаться
     * предметом, на который нажимают.
     */
    static let boardControl = adaptive(light: 0xE3E2E1, dark: 0x232129)
    /* Спокойные информационные поверхности. Это не новые акцентные цвета:
       ими нельзя красить кнопки или состояние. Мята принадлежит объёму
       работы, лаванда — денежному контексту, чистый кобальт — расходам.
       Синий отделяет траты от зелёной выручки без тяжести коричневого и
       без косметического оттенка розово-бордового. */
    static let mintCard = adaptive(light: 0xE3EEE9, dark: 0x152B27)
    static let mintInk = adaptive(light: 0x176B59, dark: 0x78D8BF)
    static let lavenderCard = adaptive(light: 0xECE8F3, dark: 0x282231)
    static let lavenderInk = adaptive(light: 0x66557F, dark: 0xC9B8E3)
    static let sandCard = adaptive(light: 0xE8F0FD, dark: 0x17253D)
    static let sandInk = adaptive(light: 0x2563C9, dark: 0x6EA8FF)

    /**
     * Невыбранная плашка переключателя периода.
     *
     * Тёплая, а не нейтрально-серая: полотно табло тёплое, и серый чип на
     * нём выглядит вырезанным из другого интерфейса. Отличие в пару
     * процентов насыщенности, но ряд из трёх плашек перестаёт быть
     * системным сегмент-контролом и становится частью этого продукта.
     */
    static let chipRest = adaptive(light: 0xE7E2D8, dark: 0x232029)
    static let goodOnBoard = adaptive(light: 0x0E8A5F, dark: 0x34D399)
    static let warnOnBoard = adaptive(light: 0xB45309, dark: 0xFBBF24)
    /* Удаление и убыток. Долгое время красный значил ровно одно —
       «удалить», — и убыток ради этого набирался жёлтым. Правило не
       окупилось: жёлтый на денежном числе читается предупреждением, а
       не потерей, и «вы в минусе» приходилось дочитывать словами.
       Убыток теперь красный, а спутать его с удалением нечего:
       удаление всегда стоит на кнопке и подписано. Тот же тон, что у
       `--bad` в вебе. */
    static let badOnBoard = adaptive(light: 0xDC2626, dark: 0xF87171)
    static let good = adaptive(light: 0x047857, dark: 0x34D399)

    /**
     * Цвет денежного числа по его знаку.
     *
     * Одно правило на все денежные экраны: убыток красным, заработок
     * зелёным. До этого каждый экран решал сам, и сводка с днём
     * расходились в оттенках при одинаковом смысле.
     *
     * Ноль не красится ни во что: нулевой день это не потеря и не
     * заработок, подсвечивать в нём нечего. Зелёный ноль читался бы
     * как «всё хорошо», хотя не заработано ничего.
     *
     * Цвет не остаётся единственным носителем смысла — рядом с числом
     * всегда стоит знак «−» и подпись словами («вы в минусе», «вам
     * остаётся»). Того требует WCAG 1.4.1, и того же требует мокрый
     * телефон под солнцем, на котором оттенки не различить.
     */
    static func sign(_ amount: Int) -> Color {
        amount < 0 ? badOnBoard : amount > 0 ? goodOnBoard : onBoard
    }

    /// Серая дорожка выбора. Плашки поверх неё продукт больше не красит,
    /// поэтому из пары остался один слой.
    static let track = adaptive(light: 0xEDEBF3, dark: 0x241E33)

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
    static let badOnDark = Color(red: 0xF8 / 255, green: 0x71 / 255, blue: 0x71 / 255)

    /**
     * Полотно заставки запуска.
     *
     * Не грейп из палитры, а ровно тот цвет, на котором собрана заставка
     * в макете. Он же лежит в `Assets.xcassets/LaunchBackground` — том
     * прямоугольнике, который система рисует ДО того, как приложение
     * получило управление. Разойдутся эти два места — на холодном старте
     * мелькнёт смена фона, и выглядит это как сбой запуска.
     */
    static let launchCanvas = Color(red: 0x42 / 255, green: 0x16 / 255, blue: 0x85 / 255)

    static let heroGradient = LinearGradient(
        colors: [grapeMid, grapeDeep],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    /**
     * Полотно заставки.
     *
     * Не плоская заливка и не диагональ. Плоский прямоугольник краски во
     * весь экран читается как «стили не загрузились», а диагональный
     * градиент уводит взгляд в угол — мимо фигуры, ради которой экран и
     * показан. Здесь свет идёт из центра, где стоит загрузчик, и гаснет
     * к краям.
     *
     * Разница между центром и краем меньше десяти процентов светлоты:
     * заставка обязана быть фоном для фигуры, а не рекламным экраном.
     */
    static let splashGlow = RadialGradient(
        colors: [grapeFill.opacity(0.55), grapeDeep.opacity(0)],
        center: UnitPoint(x: 0.5, y: 0.42),
        startRadius: 0,
        endRadius: 460
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
    /* Разряды по языку интерфейса, а не по языку телефона: сумма обязана
       выглядеть одинаково в приложении и в браузере до символа. Валюта от
       языка НЕ зависит — мойка в Ереване берёт драмы, на каком бы языке
       владелец ни читал экран. */
    f.groupingSeparator = LangStore.currentLang.groupSeparator
    f.decimalSeparator = LangStore.currentLang.decimalSeparator
    let number = f.string(from: NSNumber(value: amount)) ?? "\(amount)"
    let symbol = currency == "AMD" ? "֏" : currency
    return "\(number)\u{202F}\(symbol)"
}

/**
 * «с одной машины» — единица учёта в нужной форме.
 *
 * Единица приходит с сервера словом: у мойки машина, у барбера клиент, —
 * и рамка вокруг него у каждого языка своя.
 *
 * По-армянски это отложительный падеж, и склеить его дефисом нельзя:
 * «մեքենա-ից» читается опечаткой, а не словом. Правило языка простое и
 * верное для любого армянского слова, включая придуманное владельцем:
 * после гласной между основой и окончанием встаёт «յ», после согласной —
 * ничего.
 *
 * По-русски и по-английски падеж чужого слова не построить вовсе — там
 * рамка обходится без него, а само слово идёт как пришло. Сервер к этому
 * моменту уже прислал его на языке интерфейса (см. lib/i18n/terms.ts),
 * так что в русском это «машина», а не «մեքենա».
 */
func perOneUnit(_ word: String) -> String {
    guard !word.isEmpty else { return word }
    switch LangStore.currentLang {
    case .hy:
        let vowels: Set<Character> = ["ա", "ե", "է", "ը", "ի", "ո", "օ"]
        let tail = vowels.contains(word.last!) ? "յից" : "ից"
        return L("summary.perOne", "\(word)\(tail)")
    case .ru, .en:
        return L("summary.perOne", word)
    }
}

/// Главная кнопка: лайм под тёмным текстом, во всю ширину.
///
/// Заливка сплошная, не стеклянная, и это не упущение. Стекло берёт цвет
/// от того, что под ним, — а единственное действие на экране обязано
/// выглядеть одинаково всегда, иначе перестаёт читаться как кнопка.
/// Стекло достаётся поверхностям, сплошной цвет — действию.
struct LimeButton: ButtonStyle {
    /// Идёт запрос. Надпись остаётся на месте и гаснет, поверх ложится
    /// признак работы: подменять текст на «…» значит менять ширину кнопки
    /// под пальцем и терять то, на что человек только что нажал.
    var loading = false
    /// Что делаем: «Մուտք գործում ենք…», «Վճարում ենք…».
    ///
    /// Кнопка во всю ширину, поэтому длина подписи на габарит не влияет
    /// вовсе, а на понимание влияет сильно: слово отвечает на вопрос,
    /// который человек задал нажатием, а один индикатор говорит только
    /// «что-то идёт».
    var busyTitle: String?

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 17, weight: .bold))
            .foregroundStyle(Brand.onLime)
            .loading(loading, tint: Brand.onLime, size: 22, title: busyTitle)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 17)
            .background(Brand.lime, in: RoundedRectangle(cornerRadius: 22))
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(Motion.springSnap, value: configuration.isPressed)
    }
}

/**
 * Поле ввода, по которому попадают всей строкой.
 *
 * SwiftUI отдаёт `TextField` ровно ту площадь, которую занимает набранный
 * текст: у пустого поля это несколько точек возле каретки, и промахнуться
 * мимо них проще, чем попасть. Подпись, поля вокруг, левая половина строки
 * касание не принимали вовсе — человек тыкал в коробку и не понимал, почему
 * клавиатура не появляется.
 *
 * Здесь коробка сама ловит касание и ставит фокус руками. Цель размером во
 * всю строку, то есть больше сорока четырёх точек по высоте, как и требует
 * система от любого нажимаемого места.
 *
 * Подпись сверху, а не слева, и набор идёт влево: у всех полей продукта
 * один левый край, и каретка не ищется заново на каждой строке.
 *
 * Заведено здесь, а не в каждом экране, потому что полей в продукте
 * дюжина: услуга, класс, работник, номер, процент, название бизнеса. Шесть
 * копий одного приёма разъезжаются на первой же правке.
 */
struct FieldBox<Content: View>: View {
    let title: String
    /// Заливка коробки. Обычно серая подложка карточки; в сгруппированных
    /// списках её берёт на себя сама коробка списка.
    var fill: Color? = nil
    var radius: CGFloat = 22
    @ViewBuilder var content: () -> Content

    @FocusState private var focused: Bool

    init(
        _ title: String,
        fill: Color? = nil,
        radius: CGFloat = 22,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.title = title
        self.fill = fill
        self.radius = radius
        self.content = content
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(.system(size: 12))
                .foregroundStyle(Brand.boardMuted)
            content()
                /* Фокус привязан к самому полю: модификатор ставится на то,
                   что пришло в замыкании, а туда всегда приходит поле. */
                .focused($focused)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.vertical, 11)
        .background {
            if let fill {
                RoundedRectangle(cornerRadius: radius, style: .continuous).fill(fill)
            }
        }
        /* Без этого касание принимают только буквы: у прозрачной коробки
           площади для нажатия нет. */
        .contentShape(.rect)
        .onTapGesture { focused = true }
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
    /* Роза и индиго добавлены под сетку разделов: там две плитки подряд
       выпадали на `slate`, и низ экрана читался одним чёрным прямоугольником
       на две ячейки. Устройство у них то же, что у остальных, — очень
       тёмная база и яркое пятно, — поэтому в ряду они не выбиваются. */
    case violet, teal, amber, lime, slate, rose, indigo

    var base: Color {
        switch self {
        case .violet: return Color(red: 0x3B / 255, green: 0x14 / 255, blue: 0x7A / 255)
        case .teal: return Color(red: 0x0B / 255, green: 0x3D / 255, blue: 0x3A / 255)
        case .amber: return Color(red: 0x4A / 255, green: 0x22 / 255, blue: 0x0A / 255)
        case .lime: return Brand.lime
        case .slate: return Color(red: 0x22 / 255, green: 0x21 / 255, blue: 0x2A / 255)
        case .rose: return Color(red: 0x4C / 255, green: 0x0F / 255, blue: 0x2E / 255)
        case .indigo: return Color(red: 0x12 / 255, green: 0x22 / 255, blue: 0x54 / 255)
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
        case .rose: return Color(red: 0xF4 / 255, green: 0x72 / 255, blue: 0xB6 / 255)
        case .indigo: return Color(red: 0x60 / 255, green: 0xA5 / 255, blue: 0xFA / 255)
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

/**
 * Кусок разреза: имя, цвет и деньги.
 *
 * Полоса долей принадлежит сводке и только ей. На соседние экраны она не
 * ходит намеренно: там свои вопросы и свои фигуры, а две одинаковые полосы
 * по разным данным читались бы одной и той же вещью — ровно та путаница,
 * ради которой разрезы и разведены по экранам.
 */
struct Split: Identifiable {
    let id: String
    let label: String
    let ink: Color
    let amount: Int

    /**
     * Разрез денег: сколько осталось владельцу, сколько ушло людям,
     * сколько расходам.
     *
     * Три краски, а не серые оттенки. Грейп у доли владельца: это марка, и
     * главный кусок полосы должен быть ею. Лаванда у зарплат, приглушённая
     * кобальт у расходов — те же цвета стоят под этими словами на всех экранах.
     *
     * В минус полоса не уходит: отрицательного куска не бывает. Когда день
     * ушёл в убыток, владельцу не осталось ничего, и полоса честно состоит
     * из одних расходов, а знак минуса уже стоит в главном числе над ней.
     */
    static func money(mine: Int, staff: Int, costs: Int) -> [Split] {
        [
            Split(id: "mine", label: L("common.you"), ink: Brand.grapeFill, amount: max(0, mine)),
            Split(id: "staff", label: L("summary.toStaff"), ink: Brand.lavenderInk, amount: staff),
            Split(id: "costs", label: L("expenses.title"), ink: Brand.sandInk, amount: costs),
        ].filter { $0.amount > 0 }
    }
}

/**
 * Полоса, разрезанная по долям.
 *
 * Один орган на оба разреза сводки: деньги дня и способы оплаты. Полоса
 * отвечает на вопрос, которого нет у колонок цифр, — КАКОЙ ДОЛЕЙ. Из
 * каждых двадцати двух тысяч владельцу осталось четыре, и это видно
 * длиной куска, без чтения.
 *
 * Целое считается по кускам, а не приходит снаружи: полоса, у которой
 * сумма частей не сходится с её же длиной, врёт молча.
 */
struct SplitBar: View {
    let parts: [Split]
    var height: CGFloat = 12

    var body: some View {
        let total = max(1, parts.reduce(0) { $0 + $1.amount })

        GeometryReader { proxy in
            let gaps = CGFloat(max(0, parts.count - 1)) * 2
            let free = max(0, proxy.size.width - gaps)
            HStack(spacing: 2) {
                ForEach(parts) { part in
                    RoundedRectangle(cornerRadius: height / 3, style: .continuous)
                        .fill(part.ink)
                        /* Не тоньше четырёх точек: кусок нулевой ширины
                           читается как отсутствие статьи, а она есть. */
                        .frame(width: max(4, free * CGFloat(part.amount) / CGFloat(total)))
                }
                Spacer(minLength: 0)
            }
        }
        .frame(height: height)
    }
}

/// Подписи к полосе — одной строкой, а не колонками: колонка под полосой
/// это опять тройка блоков, от которой мы и ушли.
struct SplitLegend: View {
    let parts: [Split]
    let currency: String

    var body: some View {
        HStack(spacing: 11) {
            ForEach(parts) { part in
                HStack(spacing: 5) {
                    Circle()
                        .fill(part.ink)
                        .frame(width: 6, height: 6)
                    Text(part.label)
                        .font(.system(size: 11))
                        .foregroundStyle(Brand.boardMuted)
                    Text(money(part.amount, currency))
                        .font(.system(size: 11, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(Brand.onBoard)
                }
            }
            Spacer(minLength: 0)
        }
        .lineLimit(1)
        .minimumScaleFactor(0.6)
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
            .animation(Motion.springSnap, value: configuration.isPressed)
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
 * Четыре столбика — то, из чего собран весь продукт: они в графике дня,
 * в профиле недели, в значке вкладки, на плитках щита. Пока приложение
 * думает, оно показывает ту же фигуру, которой показывает деньги, и это
 * единственная причина, по которой загрузчик здесь свой, а не
 * `ProgressView`.
 *
 * Что делает фигура за оборот:
 *
 *     волна  →  сходятся  →  складываются 2×2  →  вдох  →  расходятся
 *
 * Волна говорит «идёт счёт»: столбики поднимаются по очереди, как растёт
 * столбик выручки. Складывание в квадрат — момент, ради которого всё и
 * затевалось: четыре одинаковые детали на секунду становятся одним
 * знаком, и знак этот больше нигде не встречается, поэтому запоминается.
 * Вдох ставит точку, расхождение возвращает в начало.
 *
 * Ни один кадр не крутится вокруг центра. Вращение — чужой язык: так
 * выглядит каждый второй индикатор, и фигура, которая крутится,
 * перестаёт быть чьей-то.
 *
 * Ход берётся из `TimelineView`, а не из `repeatForever`. Бесконечная
 * анимация останавливается, когда SwiftUI пересоздаёт вид, — а загрузчик
 * живёт как раз внутри кнопок, которые перестраиваются на каждое
 * нажатие, и замерший индикатор загрузки хуже, чем никакого: он говорит,
 * что всё зависло. По той же причине кадр считается от абсолютного
 * времени: пересозданный вид продолжает оборот с того места, где он идёт
 * у соседа, а не начинает свой.
 *
 * Оборот кончается там же, где начался, поэтому шва между оборотами не
 * видно.
 *
 * При «Уменьшении движения» столбики стоят лесенкой и вместо них дышит
 * прозрачность: настройка запрещает движение, а не признак работы.
 */
struct TetrLoader: View {
    /// Высота фигуры. Ширина считается от неё.
    var size: CGFloat = 22
    var tint: Color = Brand.grape
    var bars: Int = 4

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Доли оборота, на которых стоят опорные кадры.
    private static let times: [Double] = [0, 0.08, 0.16, 0.24, 0.32, 0.44, 0.6, 0.7, 0.8, 0.92, 1]

    /// Кривая на каждом промежутке между опорными кадрами.
    private static let curves: [(Double) -> Double] = [
        Ease.inOut,  // волна: столбик 1
        Ease.inOut,  // столбик 2
        Ease.inOut,  // столбик 3
        Ease.inOut,  // столбик 4
        Ease.spring, // сходятся к центру
        Ease.soft,   // складываются в квадрат
        Ease.out,    // вдох
        Ease.inOut,  // выдох
        Ease.spring, // расходятся обратно в ряд
        Ease.linear, // пауза перед новым оборотом
    ]

    /// Шаг между столбиками в ряду, в долях высоты фигуры.
    private static let pitch: CGFloat = 0.3
    /// Ширина столбика, в долях высоты фигуры.
    private static let barWidth: CGFloat = 0.17
    /// Насколько ряд сжимается к центру перед складыванием.
    ///
    /// Не теснее: при 0.46 шаг становится меньше ширины столбика, четыре
    /// детали сливаются в один прямоугольник, и вместо «сошлись» видно
    /// «пропали».
    private static let compress: CGFloat = 0.72
    private static let gridX: CGFloat = 0.115
    private static let gridY: CGFloat = 0.155

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 60.0, paused: false)) { ctx in
            let t = ctx.date.timeIntervalSinceReferenceDate
            let p = reduceMotion ? 0 : phase(t)
            ZStack {
                ForEach(0..<bars, id: \.self) { i in
                    Capsule()
                        .fill(tint)
                        .frame(width: size * Self.barWidth, height: size)
                        .scaleEffect(y: scaleY(i, p), anchor: .center)
                        .offset(x: offsetX(i, p), y: offsetY(i, p))
                        .opacity(reduceMotion ? breathe(t) : 1)
                }
            }
            .frame(width: size * 1.24, height: size)
            .scaleEffect(reduceMotion ? 1 : pulse(p))
        }
        .accessibilityElement()
        .accessibilityLabel(L("common.loadingShort"))
        .accessibilityAddTraits(.updatesFrequently)
    }

    /// Где мы внутри оборота: 0…1.
    private func phase(_ t: Double) -> Double {
        let c = Motion.loaderCycle
        return (t.truncatingRemainder(dividingBy: c) + c).truncatingRemainder(dividingBy: c) / c
    }

    /**
     * Значение дорожки на доле оборота `p`.
     *
     * Опорные кадры и кривая между ними — ровно те же, что в
     * `components/loading/tetrin-loader.tsx`. Разъехаться им негде:
     * числа стоят рядом в обоих файлах и правятся вместе.
     */
    private func track(_ values: [CGFloat], _ p: Double) -> CGFloat {
        let times = Self.times
        guard values.count == times.count else { return values.first ?? 0 }
        if p <= 0 { return values[0] }
        for k in 1..<times.count where p <= times[k] {
            let span = times[k] - times[k - 1]
            let raw = span <= 0 ? 1 : (p - times[k - 1]) / span
            let eased = CGFloat(Self.curves[k - 1](min(max(raw, 0), 1)))
            return values[k - 1] + (values[k] - values[k - 1]) * eased
        }
        return values[values.count - 1]
    }

    /// Ряд складывается пополам: левая пара уходит влево, правая вправо.
    /// Иначе третий столбик пролетает сквозь второй, и вместо
    /// складывания видно свалку.
    private func rowX(_ i: Int) -> CGFloat {
        (CGFloat(i) - CGFloat(bars - 1) / 2) * Self.pitch * size
    }

    private func offsetX(_ i: Int, _ p: Double) -> CGFloat {
        guard !reduceMotion else { return rowX(i) }
        let row = rowX(i)
        let grid = (i < bars / 2 ? -Self.gridX : Self.gridX) * size
        return track(
            Array(repeating: row, count: 5) + [row * Self.compress, grid, grid, grid, row, row],
            p
        )
    }

    private func offsetY(_ i: Int, _ p: Double) -> CGFloat {
        guard !reduceMotion else { return 0 }
        let grid = (i % 2 == 0 ? -Self.gridY : Self.gridY) * size
        return track([0, 0, 0, 0, 0, 0, grid, grid, grid, 0, 0], p)
    }

    private func scaleY(_ i: Int, _ p: Double) -> CGFloat {
        guard !reduceMotion else {
            // неподвижная лесенка: движения нет, а фигура остаётся собой
            return 0.42 + 0.58 * CGFloat(i) / CGFloat(max(1, bars - 1))
        }
        let w = wave(i)
        return track(w + [0.56, 0.26, 0.26, 0.26, w[0], w[0]], p)
    }

    /// Высота столбика на кадрах волны: свой кадр вытягивает столбик
    /// целиком, соседние поднимают на треть. Отсюда бегущая волна вместо
    /// четырёх одновременных морганий.
    private func wave(_ i: Int) -> [CGFloat] {
        (0...4).map { k in
            let d = abs(k - (i + 1))
            let lift: CGFloat = d == 0 ? 1 : (d == 1 ? 0.34 : 0)
            return 0.4 + 0.6 * lift
        }
    }

    /// Вдох собранной фигуры.
    private func pulse(_ p: Double) -> CGFloat {
        track([1, 1, 1, 1, 1, 1, 1, 1.055, 1, 1, 1], p)
    }

    /// Дыхание прозрачности вместо движения.
    private func breathe(_ t: Double) -> Double {
        0.45 + 0.55 * (sin(t * 1.6) + 1) / 2
    }
}

/**
 * Малый загрузчик: та же волна, три детали.
 *
 * Живёт внутри кнопок и строк. Фирменный морф сюда не ставится
 * сознательно: кнопку «записать» жмут сорок раз за смену, и фигура,
 * которая на каждое нажатие собирается в квадрат, через неделю начинает
 * раздражать. Праздник — на запуске, в работе достаточно признака жизни.
 */
struct TetrMiniLoader: View {
    var size: CGFloat = 16
    var tint: Color = Brand.grape

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 60.0, paused: false)) { ctx in
            let t = ctx.date.timeIntervalSinceReferenceDate
            HStack(spacing: size * 0.16) {
                ForEach(0..<3, id: \.self) { i in
                    Capsule()
                        .fill(tint)
                        .frame(width: size * 0.22, height: size * 0.62)
                        .scaleEffect(y: reduceMotion ? 1 : lift(i, t), anchor: .center)
                        .opacity(reduceMotion ? breathe(i, t) : 0.55 + 0.45 * (lift(i, t) - 1) / 0.38)
                }
            }
            .frame(height: size)
        }
        .accessibilityHidden(true)
    }

    private func lift(_ i: Int, _ t: Double) -> CGFloat {
        let phase = t * 5.7 - Double(i) * 0.75
        let k = (sin(phase) + 1) / 2
        return 1 + 0.38 * CGFloat(k)
    }

    private func breathe(_ i: Int, _ t: Double) -> Double {
        0.35 + 0.65 * (sin(t * 1.6 - Double(i) * 0.6) + 1) / 2
    }
}

extension View {
    /**
     * Подменить содержимое признаком работы, не меняя размера.
     *
     * Именно не меняя: если на время запроса заменить текст кнопки на
     * индикатор, кнопка схлопывается до ширины индикатора и прыгает под
     * пальцем. Здесь содержимое остаётся на месте и просто становится
     * прозрачным, а признак работы ложится поверх.
     *
     * Слово важнее фигуры. «Պահպանում ենք…» отвечает ровно на вопрос,
     * который человек задал нажатием; один индикатор без слова говорит
     * только «что-то идёт». Поэтому `title` есть везде, где подпись
     * умещается, и нет там, где кнопка размером со значок.
     *
     * Внутри кнопки стоит малый загрузчик, а не фирменный: кнопку
     * «записать» жмут сорок раз за смену, и морф на каждое нажатие через
     * неделю начинает раздражать. Праздник — на запуске.
     */
    func loading(_ on: Bool, tint: Color, size: CGFloat = 22, title: String? = nil) -> some View {
        opacity(on ? 0 : 1)
            .overlay {
                if on {
                    HStack(spacing: 7) {
                        TetrMiniLoader(size: size * 0.9, tint: tint)
                        if let title {
                            Text(title)
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                        }
                    }
                    .foregroundStyle(tint)
                }
            }
            .animation(.easeOut(duration: Motion.fast), value: on)
    }

    /**
     * Погашено или занято — это разные состояния.
     *
     * `.disabled(true)` в SwiftUI гасит и то и другое одинаково, а
     * значат они противоположное: погашенная кнопка говорит «сейчас
     * нельзя», занятая — «принято, идёт». Здесь занятость только
     * запрещает повторное нажатие и не трогает цвет: ответ на палец уже
     * дан признаком работы внутри кнопки.
     */
    func busy(_ on: Bool) -> some View {
        allowsHitTesting(!on)
            .accessibilityAddTraits(on ? .updatesFrequently : [])
    }
}

// ═══════════════════════════ шкалы формы ═══════════════════════════

/**
 * Радиусы продукта. Пять ступеней — и никаких промежуточных.
 *
 * До шкалы в коде жило двадцать пять разных значений, и соседние
 * карточки были скруглены «почти одинаково»: 20 против 22, 24 против
 * 26. Почти одинаковое читается случайностью. Ступени шагом в четыре
 * точки различимы глазом, и у каждой есть роль, а не вкус.
 *
 * Капсула остаётся только у фишек выбора и распознанного номера; круг —
 * только у людей и точек состояния.
 */
enum R {
    /// Бейдж, микроплашка.
    static let chip: CGFloat = 10
    /// Вложенное в карточку: поле, плашка значка, подсветка строки, клетка.
    static let control: CGFloat = 14
    /// Малая карточка, строка-плитка, панель.
    static let small: CGFloat = 18
    /// Карточка, кнопка, лист — рабочая ступень.
    static let card: CGFloat = 22
    /// Плита-показание наверху экрана.
    static let hero: CGFloat = 28
}

/// Волосяная линия — единственная в продукте: одна точка, чернила 7 %.
/// Три реализации в разных файлах разъехались по толщине и отступу;
/// теперь линия одна, отступ — параметром.
struct Hairline: View {
    var inset: CGFloat = 0

    var body: some View {
        Rectangle()
            .fill(Brand.boardInk.opacity(0.07))
            .frame(height: 1)
            .padding(.leading, inset)
    }
}

extension View {
    /// Волосяная грань поверхности. Кривая та же, что у заливки:
    /// заливка и обводка, построенные разными кривыми, расходятся в углах.
    func cardStroke(_ radius: CGFloat) -> some View {
        overlay {
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .strokeBorder(Brand.boardInk.opacity(0.07), lineWidth: 0.8)
        }
    }

    /// Карточка табло: белая бумага, скругление, грань. Без тени —
    /// глубину в продукте несёт грань, а не свет.
    func boardCard(_ radius: CGFloat = R.card) -> some View {
        background(Brand.boardSurface, in: .rect(cornerRadius: radius, style: .continuous))
            .cardStroke(radius)
    }
}

// ═══════════════════════════ типографика ═══════════════════════════

/**
 * Роли текста. Кегль называется по работе, а не числом.
 *
 * До шкалы в коде жило под тридцать кеглей с полушагами (14.5, 12.5),
 * и Dynamic Type не работал нигде: `Font.system(size:)` настройку
 * размера текста игнорирует. Роль несёт и кегль, и вес, и начертание,
 * и якорь масштабирования — увеличенный системный шрифт теперь
 * увеличивает и наш.
 *
 * У ролей с цифрами `monospacedDigit` включён всегда: деньги и счётчики
 * не имеют права менять ширину при смене цифр.
 */
enum TRole {
    /// Главное число экрана. Одно на экран.
    case figure
    /// Крупная сумма второго ранга: чекаут, итог карточки.
    case figureS
    /// Показатель в ряду и сетке.
    case numValue
    /// Заголовок корневого экрана.
    case screenTitle
    /// Заголовок листа и модальной семьи.
    case sheetTitle
    /// Заголовок карточки и строки.
    case cardTitle
    /// Текст.
    case body
    /// Текст с весом.
    case bodyStrong
    /// Подпись секции.
    case sectionLabel
    /// Тихая вторая строка.
    case secondary
    /// Мелочь: время, детали.
    case caption
    /// Микроподпись. Капса и разрядки нет: армянский капс читается хуже
    /// латинского, а весь продукт армянский.
    case label

    var spec: (size: CGFloat, weight: Font.Weight, anchor: Font.TextStyle, rounded: Bool, mono: Bool) {
        switch self {
        case .figure: return (44, .bold, .largeTitle, true, true)
        case .figureS: return (26, .bold, .title2, true, true)
        case .numValue: return (18, .bold, .title3, true, true)
        case .screenTitle: return (30, .bold, .largeTitle, false, false)
        case .sheetTitle: return (27, .bold, .title, true, false)
        case .cardTitle: return (15, .semibold, .headline, false, false)
        case .body: return (15, .regular, .body, false, false)
        case .bodyStrong: return (15, .semibold, .body, false, false)
        case .sectionLabel: return (13, .semibold, .subheadline, false, false)
        case .secondary: return (13, .regular, .footnote, false, false)
        case .caption: return (12, .regular, .caption, false, false)
        case .label: return (11, .semibold, .caption2, false, false)
        }
    }
}

/// Модификатор роли: `@ScaledMetric` живёт здесь, поэтому каждый
/// `tfont(...)` масштабируется системной настройкой размера текста.
struct TFont: ViewModifier {
    @ScaledMetric private var size: CGFloat
    private let weight: Font.Weight
    private let rounded: Bool
    private let mono: Bool

    init(_ role: TRole) {
        let s = role.spec
        _size = ScaledMetric(wrappedValue: s.size, relativeTo: s.anchor)
        weight = s.weight
        rounded = s.rounded
        mono = s.mono
    }

    func body(content: Content) -> some View {
        let f = Font.system(size: size, weight: weight, design: rounded ? .rounded : .default)
        content.font(mono ? f.monospacedDigit() : f)
    }
}

extension View {
    func tfont(_ role: TRole) -> some View { modifier(TFont(role)) }
}

// ═══════════════════════════ кнопки-пары ═══════════════════════════

/**
 * Тихая кнопка — пара лаймовой: та же геометрия, разница только
 * заливкой. Правило владельца о равных кнопках в паре: два выхода
 * одного размера, главный отличается цветом, а не ростом.
 */
struct QuietButton: ButtonStyle {
    @ScaledMetric(relativeTo: .headline) private var size: CGFloat = 17

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: size, weight: .semibold))
            .foregroundStyle(Brand.onBoard)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 17)
            .background(Brand.boardControl, in: RoundedRectangle(cornerRadius: R.card, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(Motion.springSnap, value: configuration.isPressed)
    }
}

/// Красная кнопка разрушительного. Всегда за подтверждением и никогда
/// не лаймовая: лайм в продукте значит главное созидательное действие.
struct DangerButton: ButtonStyle {
    @ScaledMetric(relativeTo: .headline) private var size: CGFloat = 17
    var loading = false
    var busyTitle: String?

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: size, weight: .bold))
            .foregroundStyle(.white)
            .loading(loading, tint: .white, size: 22, title: busyTitle)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 17)
            .background(Brand.badOnBoard, in: RoundedRectangle(cornerRadius: R.card, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(Motion.springSnap, value: configuration.isPressed)
    }
}

