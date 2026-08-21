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

    /* Заливка поля ввода на карточке. Светлее подложки на светлой теме,
       темнее — на тёмной: правило одно, поле не совпадает с тем, на чём
       лежит, иначе его просто не видно. */
    static let boardSurface = adaptive(light: 0xFFFFFF, dark: 0x1A191F)
    /**
     * Тёплая карточка на табло — для того, что не раздел, а действие.
     *
     * Раньше выгрузка лежала на `boardInk.opacity(0.07)`, то есть на сером
     * пятне от полотна. Рядом с шестью светящимися плитками серое читается
     * не как «спокойнее», а как «выключено». Тёплая кремовая бумага решает
     * то же самое: она тише плиток, потому что не светится, но остаётся
     * поверхностью, а не тенью.
     */
    static let warmCard = adaptive(light: 0xFCF8EF, dark: 0x1C1826)

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
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
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

private func toneRGB(_ hex: UInt32) -> Color {
    Color(
        red: Double((hex >> 16) & 0xFF) / 255,
        green: Double((hex >> 8) & 0xFF) / 255,
        blue: Double(hex & 0xFF) / 255
    )
}

/**
 * Второй слой тона: сияние, кромка и фирменная засечка.
 *
 * `base` и `glow` — это плитка-показание: тёмная заливка и пятно из угла,
 * такие стоят на сводке, на смене, в календаре. Здесь к ним добавлено то,
 * что нужно только крупным плиткам разделов: второй источник света с
 * противоположной стороны, кромка стекла по верхнему краю и лаймовая
 * засечка над заголовком.
 *
 * Отдельным слоем, а не правкой `base`/`glow`, намеренно: те два значения
 * держат ещё шесть экранов, и подкрутить их «ради экрана разделов» значит
 * незаметно перекрасить полприложения.
 *
 * Второй источник — то, чем набор из шести плиток отличается от набора из
 * шести заливок. Один свет из угла даёт градиент; два света с разных
 * сторон и разного оттенка дают объём, и плитка начинает читаться телом, а
 * не прямоугольником. Оттенок берётся соседний по кругу — фуксия к
 * фиолетовому, циан к бирюзовому, — поэтому цвет остаётся собой, а не
 * превращается в грязь.
 */
extension Tone {
    /// Плитка светлая — и на ней всё переворачивается: свет становится
    /// тенью, белая кромка чернильной, лаймовая засечка грейповой.
    var isLight: Bool {
        switch self {
        case .lime: return true
        default: return false
        }
    }

    /**
     * Что происходит в правом верхнем углу.
     *
     * У тёмных плиток это свет — то же пятно, что и везде. У лаймовой
     * наоборот, глубокая олива: лайм и так на пределе яркости, добавить к
     * нему свет нечем, и угол приходится не зажигать, а гасить. Событие
     * при этом в том же углу, что у остальных, — поэтому шесть плиток
     * читаются одним набором, хотя одна из них светлая.
     */
    var cornerLight: Color {
        switch self {
        case .lime: return toneRGB(0x1E2609)
        default: return glow
        }
    }

    /// Второй источник — снизу слева, соседним оттенком.
    var aurora: Color {
        switch self {
        case .violet: return toneRGB(0xE879F9)
        case .teal: return toneRGB(0x22D3EE)
        case .amber: return toneRGB(0xFB923C)
        // на лайме второй источник осветляет низ, где стоит тёмный текст
        case .lime: return toneRGB(0xF2FF9E)
        case .slate: return toneRGB(0x818CF8)
        case .rose: return toneRGB(0xFB7185)
        case .indigo: return toneRGB(0x818CF8)
        }
    }

    /// Кромка стекла по верхнему краю: свет ложится на грань, а не на плоскость.
    var rim: Color { isLight ? Brand.onLime : .white }

    /**
     * Фирменная засечка над заголовком.
     *
     * Лайм на тёмном, грейп на лайме — то есть всегда вторая половина
     * марки, та, которой на этой плитке нет. Ставится в одном и том же
     * месте на всех плитках экрана, и именно повтор делает её подписью, а
     * не украшением одной карточки.
     *
     * На светлое полотно её вынести нельзя: лайм по светлому даёт контраст
     * 1.06 и просто не виден. Поэтому подпись живёт внутри плиток, а на
     * полотне за неё отвечает грейп — значок выгрузки.
     */
    var accent: Color { isLight ? Brand.onLime : Brand.lime }

    /// Чем красится крупный знак. На лайме — бледным лаймом поверх оливы:
    /// светящийся предмет в тёмном углу, а не тёмный на светлом.
    var markTint: Color { isLight ? aurora : glow }
}

/**
 * Поверхность плитки: плотный тон и два источника света.
 *
 * Было стекло, подкрашенное тоном, — и цвет выцветал: стекло подмешивает к
 * нему то, что под ним, а под ним светлое полотно. Здесь заливка своя и
 * непрозрачная, а глубину даёт не материал, а свет. Это язык приложения:
 * плитка не карточка, а прибор, и он горит.
 *
 * Источников два. Один — главный, из правого верхнего угла, тем же
 * оттенком, что и знак. Второй — снизу слева, соседним по кругу цветом и
 * вчетверо слабее; он не читается отдельным пятном, но убирает у плитки
 * плоскость. Свет всегда с одной стороны на всех плитках экрана, иначе
 * набор рассыпается.
 *
 * Кромка — тонкая светлая линия по верхней грани, гаснущая к низу. Это и
 * есть «стекло»: у стекла блик на грани, а не на плоскости, и одной линии
 * в 0.8 точки хватает, чтобы плитка перестала выглядеть наклейкой.
 *
 * Живёт здесь, а не в экране, ровно потому, что экранов теперь два —
 * разделы и сводка. Две копии одного приёма разъезжаются на первой же
 * правке, и «одинаковое ДНК» перестаёт быть правдой через неделю.
 */
struct AuroraSurface: View {
    let tone: Tone
    var radius: CGFloat = 24
    /// Спокойнее: главное пятно растянуто вдвое и оттого мягче. Для широких
    /// строк, в которых нет события.
    var calm = false

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)

        ZStack {
            tone.base

            /* На светлой плитке угол не зажигается, а гасится — и это
               другая кривая, а не тот же градиент с другим цветом. Ровное
               падение прозрачности от угла давало «лайм погрязнее»:
               половина плитки в грязно-оливковой дымке и ни одного места,
               где было бы по-настоящему темно. Здесь у массы есть плато —
               до трети радиуса она держится почти плотной и только потом
               отпускает. Тогда у плитки появляется настоящая тёмная
               половина, знак в ней светится, а лайм из заливки
               превращается в свет, льющийся из-под неё. */
            if tone.isLight {
                RadialGradient(
                    gradient: Gradient(stops: [
                        .init(color: tone.cornerLight.opacity(0.97), location: 0),
                        .init(color: tone.cornerLight.opacity(0.9), location: 0.32),
                        .init(color: tone.cornerLight.opacity(0.42), location: 0.66),
                        .init(color: tone.cornerLight.opacity(0), location: 1)
                    ]),
                    center: .topTrailing,
                    startRadius: 2,
                    endRadius: 172
                )
            } else {
                RadialGradient(
                    colors: [tone.cornerLight.opacity(calm ? 0.40 : 0.52), tone.cornerLight.opacity(0)],
                    center: .topTrailing,
                    startRadius: 2,
                    endRadius: calm ? 210 : 165
                )
            }

            RadialGradient(
                colors: [tone.aurora.opacity(tone.isLight ? 0.55 : (calm ? 0.12 : 0.18)), tone.aurora.opacity(0)],
                center: .bottomLeading,
                startRadius: 4,
                endRadius: tone.isLight ? 145 : 190
            )
        }
        .clipShape(shape)
        .overlay {
            shape.strokeBorder(
                LinearGradient(
                    colors: [tone.rim.opacity(tone.isLight ? 0.14 : 0.22), tone.rim.opacity(0)],
                    startPoint: .top,
                    endPoint: .bottom
                ),
                lineWidth: 0.8
            )
        }
    }
}

/**
 * Крупный полупрозрачный знак в углу плитки.
 *
 * Это не иконка в привычном смысле: её не разглядывают и по ней не
 * опознают раздел — для этого есть слово. Она задаёт плитке вес и
 * направление, чтобы прямоугольники не читались таблицей. Поэтому знак
 * заметно крупнее обычного значка, но приглушён до подложки: как только он
 * становится ярче заголовка, первым читается он, а не слово.
 *
 * Цветом свечения плитки, а не серым: `glow` — тот же свет, что льётся из
 * угла, поэтому знак становится его частью, а не предметом поверх. На
 * лаймовой плитке наоборот — бледный лайм по тёмной оливе: там тёмный
 * угол, и светиться в нём должен предмет.
 */
struct ToneMark: View {
    let symbol: String
    let tone: Tone
    var size: CGFloat
    var offset: CGSize = .zero
    var calm = false

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: size, weight: .medium))
            /* На светлой плитке знак читается сильнее при той же
               прозрачности: он лежит не на тёмной заливке, а в тёмном углу,
               и контраст с ним выше. Поэтому у неё своя пара значений —
               иначе лаймовая плитка в сетке одна выглядит громче
               остальных. */
            .foregroundStyle(
                tone.markTint.opacity(
                    tone.isLight ? (calm ? 0.34 : 0.5) : (calm ? 0.24 : 0.32)
                )
            )
            .offset(x: offset.width, y: offset.height)
            .accessibilityHidden(true)
    }
}

/**
 * Фирменная засечка над заголовком.
 *
 * Короткая светящаяся линия в 18 точек — то, что повторяется на каждой
 * плитке в одном и том же месте. Лаймовая на тёмных, грейповая на
 * лаймовой: всегда вторая половина марки, та, которой на этой плитке нет.
 *
 * Свечение даёт тень её же цветом, а не blur: линия остаётся резкой, а
 * свет вокруг неё мягкий — так ведёт себя светодиод, и ровно это нужно,
 * чтобы засечка читалась включённой, а не нарисованной.
 */
struct ToneAccent: View {
    let tone: Tone
    var width: CGFloat = 18

    var body: some View {
        RoundedRectangle(cornerRadius: 1.25, style: .continuous)
            .fill(tone.accent)
            .frame(width: width, height: 2.5)
            .shadow(color: tone.accent.opacity(tone.isLight ? 0 : 0.55), radius: 5)
            .accessibilityHidden(true)
    }
}

extension View {
    /// Плитка нового поколения: тон, два источника, кромка. Заливка, в
    /// отличие от стекла, содержимое не обрезает — поэтому форма ещё и
    /// клипует, иначе крупный знак вылезает за угол.
    func auroraTile(_ tone: Tone, radius: CGFloat = 24, calm: Bool = false) -> some View {
        background { AuroraSurface(tone: tone, radius: radius, calm: calm) }
            .clipShape(.rect(cornerRadius: radius))
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
 * Спокойная краска показания: заливка и знаки к ней.
 *
 * Это не акцентные цвета продукта — грейпом и лаймом здесь не красят
 * ничего. Мята принадлежит объёму работы, лаванда денежному контексту,
 * чистый кобальт расходам, и один и тот же смысл окрашен одинаково на
 * всех экранах: увидев синюю карточку, человек ещё до чтения знает, что
 * речь о тратах.
 */
enum StatTint {
    case mint, lavender, sand
    /// Не деньги. Бумага без краски — для счётчиков: число машин стоит в
    /// одном ряду с суммами, но отвечает на другой вопрос, и красить его
    /// денежной краской значит соврать глазу.
    case paper

    var fill: Color {
        switch self {
        case .mint: return Brand.mintCard
        case .lavender: return Brand.lavenderCard
        case .sand: return Brand.sandCard
        case .paper: return Brand.boardSurface
        }
    }

    var ink: Color {
        switch self {
        case .mint: return Brand.mintInk
        case .lavender: return Brand.lavenderInk
        case .sand: return Brand.sandInk
        case .paper: return Brand.onBoard
        }
    }
}

/// Показание в ряду итогов: подпись, число и краска.
struct Stat: Identifiable {
    let id: String
    let label: String
    let value: String
    let tint: StatTint
}

/**
 * Ряд итогов: несколько мягких карточек в строку.
 *
 * Цвет остался — ушла громкость. Тёмная плитка со свечением была
 * прибором: она светилась, тянула взгляд первой и спорила с главным
 * числом экрана, хотя говорит вещи второстепенные. Эти карточки той же
 * семьи, что спокойные поверхности смены: низкая насыщенность, никакого
 * градиента, знаки цветом самой краски, а не белым по тёмному.
 *
 * Содержимое по центру карточки, а не по левому краю. Числа здесь разной
 * длины — «5» и «43 500 ֏» рядом, — и при левой выключке ряд выглядит
 * рассыпанным; по центру каждая карточка читается отдельным показанием, а
 * ряд остаётся ровным.
 */
struct StatCards: View {
    let items: [Stat]
    var columns: Int = 3

    var body: some View {
        LazyVGrid(
            columns: Array(repeating: GridItem(.flexible(), spacing: 9), count: columns),
            spacing: 9
        ) {
            ForEach(items) { item in
                VStack(spacing: 3) {
                    Text(item.label)
                        .font(.system(size: 11.5))
                        .foregroundStyle(item.ink.opacity(0.85))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Text(item.value)
                        .font(.system(size: 18, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(item.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 13)
                .padding(.horizontal, 8)
                .background(item.tint.fill, in: .rect(cornerRadius: 18, style: .continuous))
                .accessibilityElement(children: .combine)
            }
        }
    }
}

private extension Stat {
    var ink: Color { tint.ink }
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

    /// Замкнуть вниз до этой отметки — тогда фигуру можно залить.
    ///
    /// Заливка под линией не украшение: голая линия в 60 точек высотой
    /// читается царапиной на полотне, а с мягкой тенью под ней у графика
    /// появляется низ, и он становится фигурой. Необязательное — обводке
    /// замыкание вредит: она пошла бы по основанию обратно.
    var closedTo: CGFloat?

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
        if let base = closedTo {
            p.addLine(to: CGPoint(x: points[points.count - 1].x, y: base))
            p.addLine(to: CGPoint(x: points[0].x, y: base))
            p.closeSubpath()
        }
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
