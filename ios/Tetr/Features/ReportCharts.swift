import SwiftUI

/**
 * Три разреза отчёта, которые до этого были только в кабинете.
 *
 * Считает их сервер тем же кодом, что и кабинет: отчёт, расходящийся с
 * браузером хотя бы на драм, не читают вовсе. Здесь только показ.
 *
 *     загрузка      день недели × час — когда приезжают
 *     ход месяца    выручка по дням, столбиками
 *     филиалы       две мойки рядом за один отрезок
 *
 * Все три необязательные: сервер может оказаться старее приложения, и
 * тогда блока просто нет. Пустой блок с подписью хуже отсутствующего —
 * он обещает то, чего нет.
 */

// MARK: - Загрузка по времени

/**
 * День недели × час: не график, а таблица с цветом.
 *
 * У мойки неделя имеет рельеф, и вопрос «когда приезжают» отвечается
 * взглядом на пятна, а не чтением цифр. Цвет от числа машин, деньги
 * прячутся в подпись выбранной клетки.
 *
 * Часы берутся от первого до последнего, в котором хоть что-то было, но
 * не уже восьми и не шире двадцати: пустая клетка в рабочий час это тоже
 * ответ, а сутки целиком на телефоне превращаются в кашу из точек.
 */
struct ReportHeatmap: View {
    let cells: [API.HeatCell]
    let currency: String
    let unit: String

    @State private var picked: API.HeatCell?

    /// Дни недели с понедельника, коротко, на языке интерфейса.
    private var weekdays: [String] {
        let f = DateFormatter()
        f.locale = LangStore.currentLang.locale
        let symbols = f.shortWeekdaySymbols ?? ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
        // системный порядок начинается с воскресенья, нам нужен с понедельника
        return (1...7).map { symbols[$0 % 7] }
    }

    private var hours: [Int] {
        let busy = cells.filter { $0.count > 0 }.map(\.hour)
        let low = min(busy.min() ?? 8, 8)
        let high = max(busy.max() ?? 20, 20)
        return Array(low...high)
    }

    private var peak: Int { max(1, cells.map(\.count).max() ?? 1) }

    private func cell(_ dow: Int, _ hour: Int) -> API.HeatCell? {
        cells.first { $0.dow == dow && $0.hour == hour }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            /* Подпись выбранной клетки стоит НАД картой и держит место
               всегда. Снизу она сдвигала бы карту при каждом нажатии, а
               пустая строка сверху ничего не стоит. */
            Text(pickLine)
                .font(.system(size: 12))
                .monospacedDigit()
                .foregroundStyle(picked == nil ? Brand.boardMuted : Brand.onBoard)
                .lineLimit(1)
                .frame(height: 16, alignment: .leading)

            ScrollView(.horizontal, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 3) {
                        Color.clear.frame(width: 26, height: 10)
                        ForEach(hours, id: \.self) { h in
                            /* Подписаны только чётные часы: на телефоне
                               двадцать чисел подряд сливаются в серую
                               полосу и не читается ни одно. */
                            Text(h % 2 == 0 ? "\(h)" : "")
                                .font(.system(size: 9, weight: .medium))
                                .monospacedDigit()
                                .foregroundStyle(Brand.boardMuted)
                                .frame(width: 22)
                        }
                    }

                    ForEach(1...7, id: \.self) { dow in
                        HStack(spacing: 3) {
                            Text(weekdays[dow - 1])
                                .font(.system(size: 10, weight: .medium))
                                .foregroundStyle(Brand.boardMuted)
                                .frame(width: 26, alignment: .leading)

                            ForEach(hours, id: \.self) { h in
                                let c = cell(dow, h)
                                let share = Double(c?.count ?? 0) / Double(peak)
                                Button {
                                    picked = (picked?.id == c?.id) ? nil : c
                                } label: {
                                    RoundedRectangle(cornerRadius: 5, style: .continuous)
                                        .fill(colour(share))
                                        .frame(width: 22, height: 22)
                                        .overlay {
                                            if picked?.id == c?.id, c != nil {
                                                RoundedRectangle(cornerRadius: 5, style: .continuous)
                                                    .strokeBorder(Brand.onBoard, lineWidth: 1.5)
                                            }
                                        }
                                }
                                .buttonStyle(.plain)
                                .disabled(c == nil)
                            }
                        }
                    }
                }
                .padding(.vertical, 2)
            }
            .scrollClipDisabled()
        }
    }

    /// Пусто — очень бледная бумага, полный час — грейп. Корень вместо
    /// прямой доли: без него один пиковый час делает всю неделю бледной.
    private func colour(_ share: Double) -> Color {
        share <= 0
            ? Brand.boardInk.opacity(0.05)
            : Brand.grape.opacity(0.14 + 0.66 * sqrt(share))
    }

    private var pickLine: String {
        guard let picked else { return L("report.heatHint") }
        let day = weekdays[max(0, min(6, picked.dow - 1))]
        let time = String(format: "%02d:00", picked.hour)
        return "\(day) \(time) · \(Terms.units(picked.count, unit)) · \(moneyShort(picked.revenue, currency))"
    }
}

// MARK: - Ход месяца

/**
 * Выручка по дням месяца, столбиками.
 *
 * Отвечает на вопрос, которого не было ни у одного другого блока: месяц
 * это ровная полка или две пиковые субботы. Числа под столбиками не
 * пишем: тридцать подписей не читаются, а форма читается сразу.
 */
struct ReportTrend: View {
    let points: [API.ReportPoint]
    let currency: String

    @State private var picked: API.ReportPoint?

    private var peak: Int { max(1, points.map(\.revenue).max() ?? 1) }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(pickLine)
                .font(.system(size: 12))
                .monospacedDigit()
                .foregroundStyle(picked == nil ? Brand.boardMuted : Brand.onBoard)
                .lineLimit(1)
                .frame(height: 16, alignment: .leading)

            HStack(alignment: .bottom, spacing: 2) {
                ForEach(points) { p in
                    let share = Double(p.revenue) / Double(peak)
                    Button {
                        picked = (picked?.id == p.id) ? nil : p
                    } label: {
                        RoundedRectangle(cornerRadius: 2, style: .continuous)
                            .fill(picked?.id == p.id ? Brand.grape : Brand.grape.opacity(0.32))
                            /* Минимум три точки высоты: день с одной
                               машиной обязан отличаться от дня без
                               единой, иначе полка внизу врёт. */
                            .frame(height: max(p.revenue > 0 ? 3 : 1, 76 * share))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.plain)
                }
            }
            .frame(height: 76, alignment: .bottom)
        }
    }

    private var pickLine: String {
        guard let picked else { return L("report.trendHint") }
        return "\(picked.day) · \(moneyShort(picked.revenue, currency)) · \(picked.count)"
    }
}

// MARK: - Филиалы рядом

/**
 * Две мойки за один отрезок.
 *
 * Полосой, а не таблицей: вопрос владельца двух точек звучит «которая
 * тянет», и на него отвечает длина, а не два числа в столбик. Блока нет
 * вовсе, когда точка одна — сравнивать не с чем.
 */
struct ReportBranches: View {
    let branches: [API.BranchLine]
    let currency: String
    let unit: String

    private var peak: Int { max(1, branches.map(\.revenue).max() ?? 1) }

    var body: some View {
        VStack(spacing: 10) {
            ForEach(branches) { b in
                VStack(alignment: .leading, spacing: 5) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(b.name)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Brand.onBoard)
                            .lineLimit(1)
                        Text(Terms.units(b.count, unit))
                            .font(.system(size: 12))
                            .monospacedDigit()
                            .foregroundStyle(Brand.boardMuted)
                        Spacer(minLength: 8)
                        Text(moneyShort(b.revenue, currency))
                            .font(.system(size: 15, weight: .bold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(Brand.onBoard)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }

                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Brand.boardInk.opacity(0.06))
                            Capsule()
                                .fill(Brand.grape.opacity(0.6))
                                .frame(width: max(4, geo.size.width * CGFloat(Double(b.revenue) / Double(peak))))
                        }
                    }
                    .frame(height: 6)
                }
            }
        }
    }
}

// MARK: - общее

/// Деньги коротко: в подписи под графиком место дороже точности до драма.
private func moneyShort(_ value: Int, _ currency: String) -> String {
    let sign = currency == "AMD" ? "֏" : currency
    switch abs(value) {
    case 1_000_000...:
        let m = Double(value) / 1_000_000
        return m.rounded() == m ? "\(Int(m))M\u{202F}\(sign)" : String(format: "%.1fM\u{202F}%@", m, sign)
    case 10_000...:
        return "\(value / 1000)K\u{202F}\(sign)"
    default:
        return "\(value)\u{202F}\(sign)"
    }
}
