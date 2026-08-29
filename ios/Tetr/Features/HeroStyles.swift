import SwiftUI

/**
 * Пять раскладок главной плиты — третий заход.
 *
 * ВРЕМЕННАЯ ВЕЩЬ. Две прошлые пятёрки владелец забраковал, и в последней
 * назвал причину: «особенно то, что без фонового блока». Значит карточка
 * не обсуждается — она у всех пяти одна и та же, та самая белая плита с
 * грейповым отсветом. Отличается только раскладка внутри: где стоит
 * разрез «приход · зарплаты · расходы» и сколько высоты он берёт.
 *
 * Как только вид выбран, остальные четыре и переключатель уходят.
 */
enum HeroStyle: Int, CaseIterable, Identifiable {
    /// Разрез справа от числа: блок не становится выше ни на точку.
    case beside = 0
    /// Разрез подвалом карточки, на своей подложке.
    case footer = 1
    /// Разрез фишками в одну строку.
    case chips = 2
    /// Толстая полоса с числами внутри кусков, без подписей.
    case band = 3
    /// Разрез свёрнут: карточка короткая, подробности по касанию.
    case fold = 4

    var id: Int { rawValue }

    /// Имя для переключателя — язык разработки, в релизе его не будет.
    var name: String {
        switch self {
        case .beside: return "Рядом"
        case .footer: return "Подвал"
        case .chips: return "Фишки"
        case .band: return "Полоса"
        case .fold: return "Складка"
        }
    }

    static var current: HeroStyle {
        get { HeroStyle(rawValue: UserDefaults.standard.integer(forKey: key)) ?? .beside }
        set { UserDefaults.standard.set(newValue.rawValue, forKey: key) }
    }

    private static let key = "tetr.heroStyle3"
}

/// Числа плиты. Собраны в одно место, чтобы виды отличались только видом.
struct HeroData {
    /// «Чистая прибыль за сегодня».
    let title: String
    /// «29 августа» или «1 — 30 августа».
    let dates: String
    let profit: Int
    let revenue: Int
    let payroll: Int
    let costs: Int
    let currency: String

    var loss: Bool { profit < 0 }

    /// Главное число со знаком. Минус настоящий, U+2212: дефис на таком
    /// кегле читается точкой.
    var figure: String { (loss ? "−" : "") + money(abs(profit), currency) }

    /// Три части разреза в порядке чтения.
    var parts: [(label: String, amount: Int, ink: Color)] {
        [
            (L("summary.paidIn"), revenue, Brand.onBoard),
            (L("summary.toStaff"), payroll, Brand.lavenderInk),
            (L("expenses.title"), costs, Brand.sandInk),
        ]
    }
}

/// Плита сводки в выбранной раскладке.
struct SummaryHero<Crew: View, Change: View>: View {
    let data: HeroData
    let style: HeroStyle
    /// Плашка «кто на смене» — приходит с экрана: она умеет вести к людям.
    @ViewBuilder var crew: Crew
    /// Фишка сравнения с прошлым периодом.
    @ViewBuilder var change: Change

    /// Разрез развёрнут. Живёт только у «Складки».
    @State private var open = false

    var body: some View {
        Group {
            switch style {
            case .beside: beside
            case .footer: footer
            case .chips: chips
            case .band: band
            case .fold: fold
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        /* Карточка одна на все пять: белая бумага, мягкий грейповый
           отсвет в углу, волосяная грань. Владелец назвал фон
           обязательным — значит спорить об этом больше нечему. */
        .background {
            ZStack(alignment: .topTrailing) {
                RoundedRectangle(cornerRadius: R.hero, style: .continuous)
                    .fill(Brand.boardSurface)
                Circle()
                    .fill(Brand.grape.opacity(0.075))
                    .frame(width: 138, height: 138)
                    .blur(radius: 4)
                    .offset(x: 54, y: -70)
            }
            .clipShape(.rect(cornerRadius: R.hero, style: .continuous))
        }
        .cardStroke(R.hero)
    }

    // ── общее ──

    /// Шапка: дата и плашка людей.
    private var head: some View {
        HStack(spacing: 7) {
            Text(data.dates)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Brand.boardMuted)
                .contentTransition(.numericText())
            crew
            Spacer(minLength: 0)
        }
    }

    /// Подпись и главное число.
    private func figure(_ size: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(data.title)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Brand.boardMuted)
                .fixedSize(horizontal: false, vertical: true)

            Text(data.figure)
                .font(.system(size: size, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.sign(data.profit))
                .lineLimit(1)
                .minimumScaleFactor(0.42)
                .padding(.top, 2)
                .contentTransition(.numericText(value: Double(data.profit)))
        }
    }

    // ══════════════════════════ 1. Рядом ══════════════════════════

    /**
     * Разрез стоит СПРАВА от числа, а не под ним.
     *
     * Высота блока при этом не растёт вовсе: колонка из трёх строк ровно
     * равна высоте числа с подписью. Это ответ на «блок стал побольше» —
     * данные добавились, а места не прибавилось.
     */
    private var beside: some View {
        VStack(alignment: .leading, spacing: 16) {
            head

            HStack(alignment: .top, spacing: 14) {
                figure(38)
                Spacer(minLength: 8)

                VStack(alignment: .trailing, spacing: 6) {
                    ForEach(Array(data.parts.enumerated()), id: \.offset) { _, part in
                        VStack(alignment: .trailing, spacing: 0) {
                            Text(part.label)
                                .font(.system(size: 10.5))
                                .foregroundStyle(Brand.boardMuted)
                                .lineLimit(1)
                                .minimumScaleFactor(0.7)
                            Text(money(part.amount, data.currency))
                                .font(.system(size: 13.5, weight: .bold))
                                .monospacedDigit()
                                .foregroundStyle(part.ink)
                                .lineLimit(1)
                                .minimumScaleFactor(0.6)
                        }
                    }
                }
                .frame(width: 128, alignment: .trailing)
            }

            change
        }
        .padding(20)
    }

    // ══════════════════════════ 2. Подвал ══════════════════════════

    /**
     * Разрез — подвал карточки на своей подложке.
     *
     * Верх остаётся тем, ради чего экран открыли: число и ничего лишнего.
     * Разрез отделён тоном, поэтому не спорит с числом, а объясняет его,
     * когда до него дочитывают.
     */
    private var footer: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 16) {
                head
                figure(45)
                change
            }
            .padding(20)

            HStack(spacing: 0) {
                ForEach(Array(data.parts.enumerated()), id: \.offset) { index, part in
                    if index > 0 {
                        Rectangle()
                            .fill(Brand.boardInk.opacity(0.08))
                            .frame(width: 1, height: 26)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(part.label)
                            .font(.system(size: 10.5))
                            .foregroundStyle(Brand.boardMuted)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                        Text(money(part.amount, data.currency))
                            .font(.system(size: 13.5, weight: .bold))
                            .monospacedDigit()
                            .foregroundStyle(part.ink)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.leading, index > 0 ? 12 : 0)
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 14)
            .background(Brand.boardInk.opacity(0.035))
        }
        .clipShape(.rect(cornerRadius: R.hero, style: .continuous))
    }

    // ══════════════════════════ 3. Фишки ══════════════════════════

    /**
     * Разрез — три фишки в одну строку.
     *
     * Каждая величина в своей пилюле цветом смысла: мята приходу не
     * нужна, приход и так главный, а зарплата и расходы получают свои
     * тона — те же, что на всех остальных экранах продукта.
     */
    private var chips: some View {
        VStack(alignment: .leading, spacing: 16) {
            head
            figure(45)
            change

            HStack(spacing: 7) {
                ForEach(Array(data.parts.enumerated()), id: \.offset) { _, part in
                    HStack(spacing: 6) {
                        Text(part.label)
                            .font(.system(size: 10.5))
                            .foregroundStyle(Brand.boardMuted)
                        Text(money(part.amount, data.currency))
                            .font(.system(size: 12, weight: .bold))
                            .monospacedDigit()
                            .foregroundStyle(part.ink)
                    }
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .padding(.horizontal, 10)
                    .frame(minHeight: 30)
                    .background(part.ink.opacity(0.08), in: .capsule)
                }
                Spacer(minLength: 0)
            }
        }
        .padding(20)
    }

    // ══════════════════════════ 4. Полоса ══════════════════════════

    /**
     * Толстая полоса с числами внутри кусков.
     *
     * Подписей под ней нет вовсе: длина куска и число в нём говорят обо
     * всём сразу, а слова остаются только там, где кусок для них широк.
     * Один предмет вместо полосы с легендой.
     */
    private var band: some View {
        VStack(alignment: .leading, spacing: 16) {
            head
            figure(45)
            change

            GeometryReader { proxy in
                let all = max(1, data.parts.reduce(0) { $0 + $1.amount })
                let gaps: CGFloat = 3 * CGFloat(max(0, data.parts.count - 1))
                let free = max(0, proxy.size.width - gaps)
                HStack(spacing: 3) {
                    ForEach(Array(data.parts.enumerated()), id: \.offset) { _, part in
                        let width = max(8, free * CGFloat(part.amount) / CGFloat(all))
                        VStack(alignment: .leading, spacing: 1) {
                            if width > 104 {
                                Text(part.label)
                                    .font(.system(size: 10))
                                    .foregroundStyle(.white.opacity(0.75))
                                    .lineLimit(1)
                            }
                            if width > 68 {
                                Text(money(part.amount, data.currency))
                                    .font(.system(size: 13, weight: .bold))
                                    .monospacedDigit()
                                    .foregroundStyle(.white)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.7)
                            }
                        }
                        .padding(.horizontal, 10)
                        .frame(width: width, height: 44, alignment: .leading)
                        .background(bandInk(part.ink), in: .rect(cornerRadius: 12, style: .continuous))
                    }
                    Spacer(minLength: 0)
                }
            }
            .frame(height: 44)
        }
        .padding(20)
    }

    /// Приход внутри полосы красится грейпом: `onBoard` — это чернила
    /// текста, и заливать им кусок значит получить чёрный прямоугольник.
    private func bandInk(_ ink: Color) -> Color {
        ink == Brand.onBoard ? Brand.grapeFill : ink
    }

    // ══════════════════════════ 5. Складка ══════════════════════════

    /**
     * Карточка короткая, разрез приходит по касанию.
     *
     * Владелец открывает сводку сорок раз в неделю ради одного числа, а
     * разбор смотрит раз в неделю. Здесь это и записано: обычный вид —
     * две строки, подробности разворачиваются нажатием и остаются
     * развёрнутыми, пока экран открыт.
     */
    private var fold: some View {
        VStack(alignment: .leading, spacing: 14) {
            head

            HStack(alignment: .bottom, spacing: 10) {
                figure(45)
                Spacer(minLength: 8)
                Image(systemName: "chevron.down")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Brand.boardMuted)
                    .rotationEffect(.degrees(open ? 180 : 0))
                    .padding(.bottom, 8)
            }

            change

            if open {
                VStack(spacing: 0) {
                    ForEach(Array(data.parts.enumerated()), id: \.offset) { index, part in
                        if index > 0 { Hairline() }
                        HStack(spacing: 8) {
                            Text(part.label)
                                .font(.system(size: 13))
                                .foregroundStyle(Brand.boardMuted)
                            Spacer(minLength: 8)
                            Text(money(part.amount, data.currency))
                                .font(.system(size: 14, weight: .semibold))
                                .monospacedDigit()
                                .foregroundStyle(part.ink)
                        }
                        .padding(.vertical, 9)
                    }
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding(20)
        .contentShape(.rect)
        .onTapGesture {
            withAnimation(.snappy(duration: Motion.normal)) { open.toggle() }
        }
        .accessibilityAddTraits(.isButton)
        .accessibilityHint(open ? L("common.close") : L("summary.paidIn"))
    }
}

/// Переключатель видов плиты — временный орган выбора.
struct HeroStyleSwitch: View {
    @Binding var style: HeroStyle

    var body: some View {
        Button {
            let all = HeroStyle.allCases
            let next = all[(all.firstIndex(of: style).map { $0 + 1 } ?? 0) % all.count]
            style = next
            HeroStyle.current = next
            UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        } label: {
            HStack(spacing: 5) {
                Text("\(style.rawValue + 1)/\(HeroStyle.allCases.count)")
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
        .accessibilityLabel("Вид сводки: \(style.name)")
    }
}
