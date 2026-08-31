import SwiftUI

/**
 * Пять видов списка клиентов — и переключатель между ними.
 *
 * ВРЕМЕННАЯ ВЕЩЬ. Владельцу не понравился прежний список: те, кому стоит
 * позвонить, лежали тёмно-коричневыми плитками (`Tone.amber`, #4A220A), и
 * на белом табло это читалось грязью, а не поводом.
 *
 * Виды разведены устройством, а не отделкой. Общее у них одно — зачем
 * человек сюда пришёл: найти машину и увидеть, кого давно не было.
 *
 *     строки     тише некуда, повод помечен точкой
 *     кружки     у каждого свой знак, как у людей в команде
 *     сетка      двое в ряд, много номеров на экран
 *     полосы     деньги читаются длиной, а не только цифрой
 *     ступени    разбито по давности: неделя, месяц, давно
 *
 * Как только вид выбран, остальные четыре и переключатель уходят, а этот
 * файл удаляется.
 */
enum ClientsListStyle: Int, CaseIterable, Identifiable {
    case rows = 0
    case circles = 1
    case grid = 2
    case bars = 3
    case steps = 4

    var id: Int { rawValue }

    /// Имя для переключателя — язык разработки, в релизе его не будет.
    var name: String {
        switch self {
        case .rows: return "Строки"
        case .circles: return "Кружки"
        case .grid: return "Сетка"
        case .bars: return "Полосы"
        case .steps: return "Ступени"
        }
    }

    /// Сетка укладывается по двое в ряд, остальные — строками.
    var isGrid: Bool { self == .grid }

    /// Ступени сами разводят людей по давности, поэтому отдельная группа
    /// «кому позвонить» им не нужна: она была бы шестым заголовком.
    var groupsByRecency: Bool { self == .steps }

    static var current: ClientsListStyle {
        get { ClientsListStyle(rawValue: UserDefaults.standard.integer(forKey: key)) ?? .rows }
        set { UserDefaults.standard.set(newValue.rawValue, forKey: key) }
    }

    private static let key = "tetr.clientsListStyle"
}

/// Переключатель видов списка — временный орган выбора.
struct ClientsListStyleSwitch: View {
    @Binding var style: ClientsListStyle

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(ClientsListStyle.allCases) { option in
                    let on = option == style
                    Button {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.9)) {
                            style = option
                            ClientsListStyle.current = option
                        }
                    } label: {
                        Text(option.name)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(on ? .white : Brand.boardMuted)
                            .padding(.horizontal, 11)
                            .padding(.vertical, 7)
                            .background(
                                on ? Brand.grape : Brand.boardInk.opacity(0.05),
                                in: .capsule
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 6)
        }
        .scrollClipDisabled()
    }
}

/**
 * Одна строка клиента в выбранном виде.
 *
 * Данные приходят уже готовыми к показу: подпись про визиты и сумма
 * собраны на экране списка, где живут форматтеры и словарь. Виду
 * остаётся расположение.
 */
struct ClientRowView: View {
    let style: ClientsListStyle
    /// Номер машины или другой опознавательный признак.
    let key: String
    let name: String?
    /// «3 визита · 12 дней назад» — уже собранная строка.
    let subtitle: String
    /// Сумма за всё время, уже с валютой.
    let amount: String
    let visits: Int
    /// Давно не был: повод позвонить.
    let isLost: Bool
    /// Доля от лучшего клиента, 0…1. Нужна только виду «полосы».
    var share: Double = 0

    var body: some View {
        switch style {
        case .rows: quiet
        case .circles: withCircle
        case .grid: cell
        case .bars: withBar
        case .steps: quiet
        }
    }

    // ─────────────────────────── строки ───────────────────────────

    /**
     * Тише некуда: чернила по бумаге, повод помечен точкой.
     *
     * Ставка на то, что список читают глазами сверху вниз, а не
     * рассматривают. Заливки нет ни у кого, поэтому строка с поводом
     * отличается ровно одним знаком — янтарной точкой слева от номера, —
     * и это заметно именно потому, что больше ничем строки не отличаются.
     */
    private var quiet: some View {
        HStack(spacing: 10) {
            if isLost {
                Circle()
                    .fill(Brand.warnOnBoard)
                    .frame(width: 7, height: 7)
            }

            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 6) {
                    Text(key)
                        .font(.system(size: 15, weight: .semibold, design: .rounded))
                        .foregroundStyle(Brand.onBoard)
                        .lineLimit(1)
                    loyalMark
                    nameLabel
                }
                Text(subtitle)
                    .font(.system(size: 12))
                    .monospacedDigit()
                    .foregroundStyle(isLost ? Brand.warnOnBoard : Brand.boardMuted)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)
            money
            chevron
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
        .contentShape(.rect)
    }

    // ─────────────────────────── кружки ───────────────────────────

    /**
     * Знак человека, как у людей в команде.
     *
     * Цвет кружка считается из самого номера, поэтому у машины он всегда
     * один и тот же: список становится узнаваемым по пятнам ещё до
     * чтения. Тем, кого давно не было, кружок обводится янтарным.
     */
    private var withCircle: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(seedColor.opacity(0.16))
                Text(initials)
                    .font(.system(size: 14, weight: .bold, design: .rounded))
                    .foregroundStyle(seedColor)
            }
            .frame(width: 38, height: 38)
            .overlay {
                if isLost {
                    Circle().strokeBorder(Brand.warnOnBoard, lineWidth: 1.5)
                }
            }

            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 6) {
                    Text(key)
                        .font(.system(size: 15, weight: .semibold, design: .rounded))
                        .foregroundStyle(Brand.onBoard)
                        .lineLimit(1)
                    loyalMark
                }
                Text(nameOrSubtitle)
                    .font(.system(size: 12))
                    .monospacedDigit()
                    .foregroundStyle(isLost ? Brand.warnOnBoard : Brand.boardMuted)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)
            money
            chevron
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .contentShape(.rect)
    }

    // ─────────────────────────── сетка ───────────────────────────

    /**
     * Двое в ряд: номер крупно, сумма под ним.
     *
     * Для тех, у кого клиентов сотни: на экран помещается вдвое больше
     * номеров, а номер и есть то, что ищут. Подпись про визиты ушла —
     * в половину ширины она читалась бы в две строки и сломала бы ряд.
     */
    private var cell: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 5) {
                Text(key)
                    .font(.system(size: 15, weight: .bold, design: .rounded))
                    .foregroundStyle(Brand.onBoard)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Spacer(minLength: 0)
                if isLost {
                    Circle().fill(Brand.warnOnBoard).frame(width: 6, height: 6)
                } else if visits > 1 {
                    Circle().fill(Brand.goodOnBoard.opacity(0.7)).frame(width: 6, height: 6)
                }
            }

            Text(amount)
                .font(.system(size: 16, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)
                .lineLimit(1)
                .minimumScaleFactor(0.7)

            Text(subtitle)
                .font(.system(size: 11))
                .monospacedDigit()
                .foregroundStyle(isLost ? Brand.warnOnBoard : Brand.boardMuted)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Brand.boardSurface, in: .rect(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(
                    isLost ? Brand.warnOnBoard.opacity(0.35) : Brand.boardInk.opacity(0.07),
                    lineWidth: 0.8
                )
        }
        .contentShape(.rect)
    }

    // ─────────────────────────── полосы ───────────────────────────

    /**
     * Деньги длиной, а не только цифрой.
     *
     * Столбец одинаковых чисел глаз не сравнивает: «84 000» и «12 000»
     * различаются на взгляд слабее, чем полоса в семь раз длиннее.
     * Полоса считается от лучшего клиента, поэтому у первого она полная,
     * и шкала понятна без подписи.
     */
    private var withBar: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 8) {
                if isLost {
                    Circle().fill(Brand.warnOnBoard).frame(width: 7, height: 7)
                }
                Text(key)
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundStyle(Brand.onBoard)
                    .lineLimit(1)
                loyalMark
                nameLabel
                Spacer(minLength: 8)
                money
                chevron
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Brand.boardInk.opacity(0.06))
                    Capsule()
                        .fill(isLost ? Brand.warnOnBoard.opacity(0.55) : Brand.grape.opacity(0.55))
                        .frame(width: max(3, geo.size.width * CGFloat(min(1, max(0, share)))))
                }
            }
            .frame(height: 4)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
        .contentShape(.rect)
    }

    // ─────────────────────────── общее ───────────────────────────

    @ViewBuilder
    private var loyalMark: some View {
        if visits > 1 {
            Text(L("owner.clientLoyal"))
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Brand.goodOnBoard)
                .padding(.horizontal, 5)
                .padding(.vertical, 1.5)
                .background(Brand.goodOnBoard.opacity(0.16), in: .rect(cornerRadius: 5, style: .continuous))
        }
    }

    @ViewBuilder
    private var nameLabel: some View {
        if let name, !name.isEmpty {
            Text(name)
                .font(.system(size: 12))
                .foregroundStyle(Brand.boardMuted)
                .lineLimit(1)
        }
    }

    private var money: some View {
        Text(amount)
            .font(.system(size: 15, weight: .bold, design: .rounded))
            .monospacedDigit()
            .foregroundStyle(Brand.onBoard)
            .lineLimit(1)
            .minimumScaleFactor(0.75)
    }

    private var chevron: some View {
        Image(systemName: "chevron.right")
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(Brand.boardInk.opacity(0.28))
    }

    /// Имя, если оно есть; иначе подпись про визиты. В виде с кружками
    /// строка одна, и имя человека важнее счётчика визитов.
    private var nameOrSubtitle: String {
        if let name, !name.isEmpty { return name }
        return subtitle
    }

    /// Две первые буквы номера: по ним машину и узнают.
    private var initials: String {
        let clean = key.filter { !$0.isWhitespace }
        return String(clean.prefix(2)).uppercased()
    }

    /// Цвет знака из самого номера: у одной машины он всегда один.
    private var seedColor: Color {
        let palette: [Color] = [Brand.grape, Brand.goodOnBoard, Brand.lavenderInk, Brand.mintInk, Brand.warnOnBoard]
        var hash = 5381
        for ch in key.unicodeScalars { hash = (hash &* 33) &+ Int(ch.value) }
        return palette[abs(hash) % palette.count]
    }
}
