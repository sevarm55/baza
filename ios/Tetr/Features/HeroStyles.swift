import SwiftUI

/**
 * Пять видов главной плиты сводки — и переключатель между ними.
 *
 * ВРЕМЕННАЯ ВЕЩЬ. Владелец забраковал подряд несколько редакций и
 * попросил показать пять разных блоков целиком, с кнопкой для сравнения.
 * Как только вид выбран, остальные четыре и переключатель уходят, а
 * выбранный переезжает в `OwnerView` единственным телом плиты.
 *
 * Виды нарочно разведены не оттенками, а замыслом: тетрадь, чек, табло,
 * карта, документ. Одинаковых среди них нет.
 */
enum HeroStyle: Int, CaseIterable, Identifiable {
    /// Тетрадь: поле с лаймовой линейкой, суммы по линейкам.
    case notebook = 0
    /// Чек: моноширинная лента с пунктиром и итогом.
    case receipt = 1
    /// Табло: тёмный прибор, цифры в клетках.
    case board = 2
    /// Карта: грейповая платёжная карта.
    case card = 3
    /// Документ: без карточки вовсе, только типографика на полотне.
    case paper = 4

    var id: Int { rawValue }

    /// Имя для переключателя — язык разработки, в релизе его не будет.
    var name: String {
        switch self {
        case .notebook: return "Тетрадь"
        case .receipt: return "Чек"
        case .board: return "Табло"
        case .card: return "Карта"
        case .paper: return "Документ"
        }
    }

    static var current: HeroStyle {
        get { HeroStyle(rawValue: UserDefaults.standard.integer(forKey: key)) ?? .notebook }
        set { UserDefaults.standard.set(newValue.rawValue, forKey: key) }
    }

    private static let key = "tetr.heroStyle"
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

    /// Только цифры, без валюты — для видов, где знак стоит отдельно.
    var figureDigits: String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.groupingSeparator = LangStore.currentLang.groupSeparator
        let n = f.string(from: NSNumber(value: abs(profit))) ?? "\(abs(profit))"
        return (loss ? "−" : "") + n
    }

    var currencySign: String { currency == "AMD" ? "֏" : currency }
}

/// Плита сводки в выбранном виде.
struct SummaryHero<Crew: View, Change: View>: View {
    let data: HeroData
    let style: HeroStyle
    /// Плашка «кто на смене» — приходит с экрана: она умеет вести к людям.
    @ViewBuilder var crew: Crew
    /// Фишка сравнения с прошлым периодом.
    @ViewBuilder var change: Change

    var body: some View {
        switch style {
        case .notebook: notebook
        case .receipt: receipt
        case .board: board
        case .card: card
        case .paper: paper
        }
    }

    // ══════════════════════════ 1. Тетрадь ══════════════════════════

    /**
     * То, чем продукт называется: «տետր» — тетрадь.
     *
     * Лаймовое поле слева, как красная линейка в школьной тетради, и
     * суммы, вписанные по линейкам. Ни одного украшения: линейка тут
     * работает разметкой, а не декором.
     */
    private var notebook: some View {
        HStack(spacing: 0) {
            Rectangle()
                .fill(Brand.lime)
                .frame(width: 4)

            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 7) {
                    Text(data.dates)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Brand.boardMuted)
                    crew
                    Spacer(minLength: 0)
                }

                Text(data.title)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Brand.boardMuted)
                    .padding(.top, 18)

                Text(data.figure)
                    .font(.system(size: 45, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Brand.sign(data.profit))
                    .lineLimit(1)
                    .minimumScaleFactor(0.42)
                    .contentTransition(.numericText(value: Double(data.profit)))

                change

                VStack(spacing: 0) {
                    ruledRow(L("summary.paidIn"), data.revenue, minus: false)
                    ruledRow(L("summary.toStaff"), data.payroll, minus: true)
                    ruledRow(L("expenses.title"), data.costs, minus: true)
                }
                .padding(.top, 14)
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 18)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Brand.boardSurface, in: .rect(cornerRadius: R.hero, style: .continuous))
        .cardStroke(R.hero)
    }

    /// Строка по линейке: слово, сумма у правого края, линия под ними.
    private func ruledRow(_ title: String, _ amount: Int, minus: Bool) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Text(title)
                    .font(.system(size: 13))
                    .foregroundStyle(Brand.boardMuted)
                Spacer(minLength: 8)
                Text((minus && amount > 0 ? "−" : "") + money(amount, data.currency))
                    .font(.system(size: 14, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(minus ? Brand.boardMuted : Brand.onBoard)
            }
            .padding(.bottom, 7)

            Hairline()
        }
        .padding(.top, 7)
    }

    // ══════════════════════════ 2. Чек ══════════════════════════

    /**
     * Кассовая лента: моноширинные цифры, пунктир, итог внизу.
     *
     * Мойка — наличный бизнес, и чек тут не стилизация, а привычная
     * человеку форма: приход сверху, вычеты, черта, итог.
     */
    private var receipt: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 7) {
                Text(data.dates.uppercased())
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                    .tracking(0.6)
                    .foregroundStyle(Brand.boardMuted)
                crew
                Spacer(minLength: 0)
            }
            .padding(.bottom, 14)

            DashRule()
            receiptRow(L("summary.paidIn"), data.revenue, minus: false)
            receiptRow(L("summary.toStaff"), data.payroll, minus: true)
            receiptRow(L("expenses.title"), data.costs, minus: true)
            DashRule()
                .padding(.bottom, 12)

            Text(data.title.uppercased())
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .tracking(0.6)
                .foregroundStyle(Brand.boardMuted)

            Text(data.figure)
                .font(.system(size: 40, weight: .bold, design: .monospaced))
                .foregroundStyle(Brand.sign(data.profit))
                .lineLimit(1)
                .minimumScaleFactor(0.42)
                .padding(.top, 2)
                .contentTransition(.numericText(value: Double(data.profit)))

            change
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Brand.boardSurface, in: .rect(cornerRadius: R.hero, style: .continuous))
        .cardStroke(R.hero)
    }

    private func receiptRow(_ title: String, _ amount: Int, minus: Bool) -> some View {
        HStack(spacing: 8) {
            Text(title)
                .font(.system(size: 12.5, design: .monospaced))
                .foregroundStyle(Brand.boardMuted)
            Spacer(minLength: 8)
            Text((minus && amount > 0 ? "−" : "") + money(amount, data.currency))
                .font(.system(size: 13, weight: .semibold, design: .monospaced))
                .foregroundStyle(minus ? Brand.boardMuted : Brand.onBoard)
        }
        .padding(.vertical, 8)
    }

    // ══════════════════════════ 3. Табло ══════════════════════════

    /**
     * Прибор: тёмная плита, каждая цифра в своей клетке.
     *
     * Так устроены счётчики и табло — предметы, которые показывают
     * величину, а не рассказывают о ней.
     */
    private var board: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 7) {
                Text(data.title.uppercased())
                    .font(.system(size: 10, weight: .black))
                    .tracking(1.2)
                    .foregroundStyle(.white.opacity(0.55))
                Spacer(minLength: 0)
                crew
            }
            .padding(.bottom, 14)

            DigitCells(text: data.figureDigits, sign: data.currencySign, loss: data.loss)

            HStack(spacing: 7) {
                Text(data.dates)
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.5))
                change
                Spacer(minLength: 0)
            }
            .padding(.top, 12)

            HStack(spacing: 7) {
                boardCell(L("summary.paidIn"), data.revenue, tint: .white)
                boardCell(L("summary.toStaff"), data.payroll, tint: Brand.mutedOnDark)
                boardCell(L("expenses.title"), data.costs, tint: Brand.mutedOnDark)
            }
            .padding(.top, 14)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Tone.slate.base, in: .rect(cornerRadius: R.hero, style: .continuous))
    }

    private func boardCell(_ title: String, _ amount: Int, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(.system(size: 10))
                .foregroundStyle(.white.opacity(0.5))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(money(amount, data.currency))
                .font(.system(size: 13, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(tint)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 9)
        .background(.white.opacity(0.07), in: .rect(cornerRadius: R.control, style: .continuous))
    }

    // ══════════════════════════ 4. Карта ══════════════════════════

    /**
     * Платёжная карта: грейп, марка в углу, доли мелкой строкой снизу.
     *
     * Форма, которую человек уже держал в руках, — и потому не требует
     * объяснения, что перед ним деньги.
     */
    private var card: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 7) {
                Wordmark(size: 13)
                    .foregroundStyle(.white.opacity(0.9))
                Spacer(minLength: 0)
                crew
            }

            Text(data.title)
                .font(.system(size: 12))
                .foregroundStyle(.white.opacity(0.62))
                .padding(.top, 22)

            Text(data.figure)
                .font(.system(size: 42, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(data.loss ? Brand.badOnDark : .white)
                .lineLimit(1)
                .minimumScaleFactor(0.42)
                .contentTransition(.numericText(value: Double(data.profit)))

            change

            HStack(spacing: 0) {
                cardPart(L("summary.paidIn"), data.revenue)
                Rectangle().fill(.white.opacity(0.16)).frame(width: 1, height: 26)
                cardPart(L("summary.toStaff"), data.payroll)
                Rectangle().fill(.white.opacity(0.16)).frame(width: 1, height: 26)
                cardPart(L("expenses.title"), data.costs)
            }
            .padding(.top, 18)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            ZStack(alignment: .topTrailing) {
                Brand.heroGradient
                RadialGradient(
                    colors: [.white.opacity(0.16), .clear],
                    center: .topTrailing,
                    startRadius: 4,
                    endRadius: 220
                )
            }
            .clipShape(.rect(cornerRadius: R.hero, style: .continuous))
        }
    }

    private func cardPart(_ title: String, _ amount: Int) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.system(size: 10))
                .foregroundStyle(.white.opacity(0.55))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(money(amount, data.currency))
                .font(.system(size: 12.5, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.leading, 10)
    }

    // ══════════════════════════ 5. Документ ══════════════════════════

    /**
     * Никакой карточки: числа прямо на полотне.
     *
     * Экран перестаёт быть набором коробок — сверху остаётся только
     * типографика и две волосяные линии. Самый тихий из пяти.
     */
    private var paper: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 7) {
                Text(data.dates)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Brand.boardMuted)
                crew
                Spacer(minLength: 0)
            }

            Text(data.title)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Brand.boardMuted)
                .padding(.top, 22)

            Text(data.figure)
                .font(.system(size: 52, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.sign(data.profit))
                .lineLimit(1)
                .minimumScaleFactor(0.4)
                .padding(.top, 2)
                .contentTransition(.numericText(value: Double(data.profit)))

            change

            Hairline()
                .padding(.top, 20)

            HStack(spacing: 0) {
                paperPart(L("summary.paidIn"), data.revenue, first: true)
                paperPart(L("summary.toStaff"), data.payroll, first: false)
                paperPart(L("expenses.title"), data.costs, first: false)
            }
            .padding(.vertical, 14)

            Hairline()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func paperPart(_ title: String, _ amount: Int, first: Bool) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(.system(size: 11))
                .foregroundStyle(Brand.boardMuted)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(money(amount, data.currency))
                .font(.system(size: 15, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.leading, first ? 0 : 10)
    }
}

/**
 * Цифры в клетках — как на счётчике.
 *
 * Разделители разрядов клеток не получают: клетка это цифра, а пробел
 * между тысячами — воздух, и рисовать под ним коробку значит сломать
 * счёт.
 */
private struct DigitCells: View {
    let text: String
    let sign: String
    let loss: Bool

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 3) {
            ForEach(Array(text.enumerated()), id: \.offset) { _, ch in
                if ch.isNumber {
                    Text(String(ch))
                        .font(.system(size: 32, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(loss ? Brand.badOnDark : .white)
                        .frame(width: 26, height: 44)
                        .background(.white.opacity(0.09), in: .rect(cornerRadius: 8, style: .continuous))
                } else {
                    Text(String(ch))
                        .font(.system(size: 32, weight: .bold))
                        .foregroundStyle(loss ? Brand.badOnDark : .white)
                        .frame(width: ch == " " ? 6 : 14)
                }
            }

            Text(sign)
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(.white.opacity(0.5))
                .padding(.leading, 2)
        }
        .lineLimit(1)
        .minimumScaleFactor(0.5)
    }
}

/// Пунктирная черта чека.
private struct DashRule: View {
    var body: some View {
        DashShape()
            .stroke(Brand.boardInk.opacity(0.22), style: StrokeStyle(lineWidth: 1, dash: [3, 4]))
            .frame(height: 1)
    }
}

private struct DashShape: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: 0, y: rect.midY))
        p.addLine(to: CGPoint(x: rect.width, y: rect.midY))
        return p
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
