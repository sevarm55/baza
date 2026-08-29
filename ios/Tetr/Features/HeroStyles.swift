import SwiftUI

/**
 * Пять видов главной плиты сводки — второй заход.
 *
 * ВРЕМЕННАЯ ВЕЩЬ. Первую пятёрку (тетрадь, чек, табло, карта, документ)
 * владелец забраковал целиком. Здесь взяты другие оси: масштаб, сетка,
 * данные, геометрия и плотность — так, чтобы виды отличались не
 * оформлением, а самим устройством блока.
 *
 * Как только вид выбран, остальные четыре и переключатель уходят, а
 * выбранный переезжает в `OwnerView` единственным телом плиты.
 */
enum HeroStyle: Int, CaseIterable, Identifiable {
    /// Плакат: число во весь блок, всё остальное — спутники.
    case poster = 0
    /// Бенто: большая плитка итога и три маленькие рядом.
    case bento = 1
    /// График: число стоит на кривой периода.
    case chart = 2
    /// Кольцо: доля владельца дугой, число в центре.
    case ring = 3
    /// Компакт: одна плотная строка, самый низкий блок.
    case compact = 4

    var id: Int { rawValue }

    /// Имя для переключателя — язык разработки, в релизе его не будет.
    var name: String {
        switch self {
        case .poster: return "Плакат"
        case .bento: return "Бенто"
        case .chart: return "График"
        case .ring: return "Кольцо"
        case .compact: return "Компакт"
        }
    }

    static var current: HeroStyle {
        get { HeroStyle(rawValue: UserDefaults.standard.integer(forKey: key)) ?? .poster }
        set { UserDefaults.standard.set(newValue.rawValue, forKey: key) }
    }

    private static let key = "tetr.heroStyle2"
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
    /// Ход периода — для вида с графиком. Пусто, если ряда нет.
    var series: [Int] = []

    var loss: Bool { profit < 0 }

    /// Главное число со знаком. Минус настоящий, U+2212: дефис на таком
    /// кегле читается точкой.
    var figure: String { (loss ? "−" : "") + money(abs(profit), currency) }

    /// Какая доля прихода осталась владельцу. Нужна кольцу.
    var share: Double {
        guard revenue > 0 else { return 0 }
        return min(1, max(0, Double(profit) / Double(revenue)))
    }
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
        case .poster: poster
        case .bento: bento
        case .chart: chart
        case .ring: ring
        case .compact: compact
        }
    }

    // ══════════════════════════ 1. Плакат ══════════════════════════

    /**
     * Число во весь блок.
     *
     * Ни карточки, ни рамок: разница масштабов делает всю работу —
     * главное читается с метра, остальное существует шёпотом. Так
     * набирают обложки, и это единственный вид, где на экране нет ни
     * одной лишней линии.
     */
    private var poster: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 7) {
                Text(data.title)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Brand.boardMuted)
                Spacer(minLength: 8)
                crew
            }

            Text(data.figure)
                .font(.system(size: 76, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.sign(data.profit))
                .lineLimit(1)
                .minimumScaleFactor(0.32)
                .padding(.top, 4)
                .contentTransition(.numericText(value: Double(data.profit)))

            HStack(spacing: 8) {
                Text(data.dates)
                    .font(.system(size: 12))
                    .foregroundStyle(Brand.boardMuted)
                change
                Spacer(minLength: 0)
            }
            .padding(.top, 2)

            HStack(spacing: 10) {
                whisper(L("summary.paidIn"), data.revenue)
                Text("·").foregroundStyle(Brand.boardMuted.opacity(0.5))
                whisper(L("summary.toStaff"), data.payroll)
                Text("·").foregroundStyle(Brand.boardMuted.opacity(0.5))
                whisper(L("expenses.title"), data.costs)
                Spacer(minLength: 0)
            }
            .font(.system(size: 11))
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .padding(.top, 16)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func whisper(_ title: String, _ amount: Int) -> some View {
        HStack(spacing: 4) {
            Text(title)
                .foregroundStyle(Brand.boardMuted)
            Text(money(amount, data.currency))
                .fontWeight(.bold)
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)
        }
    }

    // ══════════════════════════ 2. Бенто ══════════════════════════

    /**
     * Сетка из плиток разного веса.
     *
     * Слева высокая плитка итога, справа три низких — приход и два
     * вычета. Размер плитки и есть иерархия: не нужно ни цвета, ни
     * подписи «главное», чтобы понять, что читать первым.
     */
    private var bento: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 6) {
                    Text(data.title)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Brand.boardMuted)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                }

                Spacer(minLength: 8)

                Text(data.figure)
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Brand.sign(data.profit))
                    .lineLimit(1)
                    .minimumScaleFactor(0.4)
                    .contentTransition(.numericText(value: Double(data.profit)))

                change

                HStack(spacing: 6) {
                    Text(data.dates)
                        .font(.system(size: 11))
                        .foregroundStyle(Brand.boardMuted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Spacer(minLength: 0)
                }
                .padding(.top, 6)
            }
            .padding(16)
            .frame(maxWidth: .infinity, minHeight: 172, alignment: .leading)
            .boardCard(R.card)

            VStack(spacing: 8) {
                bentoCell(L("summary.paidIn"), data.revenue, tint: Brand.onBoard)
                bentoCell(L("summary.toStaff"), data.payroll, tint: Brand.lavenderInk)
                bentoCell(L("expenses.title"), data.costs, tint: Brand.sandInk)
            }
            .frame(width: 132)
        }
        .overlay(alignment: .topTrailing) {
            crew
                .padding(.top, 10)
                .padding(.trailing, 10)
        }
    }

    private func bentoCell(_ title: String, _ amount: Int, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.system(size: 10.5))
                .foregroundStyle(Brand.boardMuted)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(money(amount, data.currency))
                .font(.system(size: 14, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(tint)
                .lineLimit(1)
                .minimumScaleFactor(0.55)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .boardCard(R.small)
    }

    // ══════════════════════════ 3. График ══════════════════════════

    /**
     * Число стоит на ходе периода.
     *
     * Кривая живёт не отдельной карточкой, а полом под числом: у денег
     * появляется форма — ровно шёл день или рывками, — и блок при этом
     * не становится выше, потому что график занимает место, которое
     * раньше было пустым.
     */
    private var chart: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 7) {
                Text(data.title)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Brand.boardMuted)
                Spacer(minLength: 8)
                crew
            }

            Text(data.figure)
                .font(.system(size: 44, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.sign(data.profit))
                .lineLimit(1)
                .minimumScaleFactor(0.42)
                .padding(.top, 4)
                .contentTransition(.numericText(value: Double(data.profit)))

            HStack(spacing: 8) {
                Text(data.dates)
                    .font(.system(size: 12))
                    .foregroundStyle(Brand.boardMuted)
                change
                Spacer(minLength: 0)
            }
            .padding(.top, 2)

            HeroWave(values: data.series)
                .frame(height: 56)
                .padding(.top, 14)

            HStack(spacing: 0) {
                chartPart(L("summary.paidIn"), data.revenue, first: true)
                chartPart(L("summary.toStaff"), data.payroll, first: false)
                chartPart(L("expenses.title"), data.costs, first: false)
            }
            .padding(.top, 12)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .boardCard(R.hero)
    }

    private func chartPart(_ title: String, _ amount: Int, first: Bool) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.system(size: 10.5))
                .foregroundStyle(Brand.boardMuted)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(money(amount, data.currency))
                .font(.system(size: 13.5, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.leading, first ? 0 : 10)
    }

    // ══════════════════════════ 4. Кольцо ══════════════════════════

    /**
     * Одна фигура вместо всех коробок.
     *
     * Кольцо отвечает на вопрос, которого нет ни у полосы, ни у колонок:
     * КАКАЯ ЧАСТЬ прихода осталась. Число стоит в центре, потому что это
     * и есть ответ, а подписи — сбоку, тихой колонкой.
     */
    private var ring: some View {
        HStack(alignment: .center, spacing: 18) {
            ZStack {
                Circle()
                    .stroke(Brand.boardInk.opacity(0.07), lineWidth: 14)
                Circle()
                    .trim(from: 0, to: data.share)
                    .stroke(Brand.sign(data.profit), style: .init(lineWidth: 14, lineCap: .butt))
                    .rotationEffect(.degrees(-90))

                VStack(spacing: 1) {
                    Text(data.figure)
                        .font(.system(size: 22, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(Brand.sign(data.profit))
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                        .contentTransition(.numericText(value: Double(data.profit)))
                    Text("\(Int((data.share * 100).rounded()))%")
                        .font(.system(size: 11))
                        .monospacedDigit()
                        .foregroundStyle(Brand.boardMuted)
                }
                .padding(.horizontal, 14)
            }
            .frame(width: 136, height: 136)

            VStack(alignment: .leading, spacing: 10) {
                Text(data.title)
                    .font(.system(size: 12.5, weight: .medium))
                    .foregroundStyle(Brand.boardMuted)
                    .fixedSize(horizontal: false, vertical: true)

                ringRow(L("summary.paidIn"), data.revenue)
                ringRow(L("summary.toStaff"), data.payroll)
                ringRow(L("expenses.title"), data.costs)

                crew
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .boardCard(R.hero)
    }

    private func ringRow(_ title: String, _ amount: Int) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(title)
                .font(.system(size: 10.5))
                .foregroundStyle(Brand.boardMuted)
                .lineLimit(1)
            Text(money(amount, data.currency))
                .font(.system(size: 13.5, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
    }

    // ══════════════════════════ 5. Компакт ══════════════════════════

    /**
     * Самый низкий блок из возможных.
     *
     * Число слева, три величины справа мелкой колонкой. Ровно то, что
     * помещается в одну строку взгляда: экран начинается не с плиты, а
     * сразу с работы.
     */
    private var compact: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 14) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(data.title)
                        .font(.system(size: 11.5))
                        .foregroundStyle(Brand.boardMuted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Text(data.figure)
                        .font(.system(size: 32, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(Brand.sign(data.profit))
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                        .contentTransition(.numericText(value: Double(data.profit)))
                }

                Spacer(minLength: 8)

                VStack(alignment: .trailing, spacing: 3) {
                    compactRow(L("summary.paidIn"), data.revenue)
                    compactRow(L("summary.toStaff"), data.payroll)
                    compactRow(L("expenses.title"), data.costs)
                }
            }

            HStack(spacing: 8) {
                Text(data.dates)
                    .font(.system(size: 11.5))
                    .foregroundStyle(Brand.boardMuted)
                change
                Spacer(minLength: 0)
                crew
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .boardCard(R.card)
    }

    private func compactRow(_ title: String, _ amount: Int) -> some View {
        HStack(spacing: 6) {
            Text(title)
                .font(.system(size: 10.5))
                .foregroundStyle(Brand.boardMuted)
            Text(money(amount, data.currency))
                .font(.system(size: 12, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)
        }
        .lineLimit(1)
        .minimumScaleFactor(0.7)
    }
}

/**
 * Кривая периода под числом.
 *
 * Сглажена по серединам отрезков, а не натянута на узлы: кривая, идущая
 * через сами точки, вылетает за них выбросами, и один высокий час давал
 * горб выше пика. Заливка под линией слабая: без неё линия читается
 * царапиной на полотне.
 */
private struct HeroWave: View {
    let values: [Int]

    var body: some View {
        GeometryReader { proxy in
            let pts = points(in: proxy.size)
            if pts.count > 1 {
                ZStack {
                    WavePath(points: pts, closedTo: proxy.size.height)
                        .fill(
                            LinearGradient(
                                colors: [Brand.grape.opacity(0.16), Brand.grape.opacity(0)],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                    WavePath(points: pts, closedTo: nil)
                        .stroke(Brand.grape, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                }
            }
        }
        .accessibilityHidden(true)
    }

    private func points(in size: CGSize) -> [CGPoint] {
        guard values.count > 1 else { return [] }
        let peak = max(1, values.max() ?? 1)
        let step = size.width / CGFloat(values.count - 1)
        return values.enumerated().map { index, value in
            let y = size.height - size.height * 0.92 * CGFloat(value) / CGFloat(peak)
            return CGPoint(x: CGFloat(index) * step, y: y)
        }
    }
}

private struct WavePath: Shape {
    let points: [CGPoint]
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
