import SwiftUI

/**
 * График выручки на телефоне.
 *
 * Линия здесь была и не работала. Линия показывает **ход** — как одно
 * перетекает в другое; на мойке, где за день пять машин и половина часов
 * пустая, хода нет: получалась почти горизонтальная нитка с редкими
 * иглами, а при одной машине — пустая рамка с точкой посередине.
 * Владелец видел картинку и не понимал, что это график.
 *
 * Столбики отвечают на тот вопрос, который у владельца есть на самом
 * деле: **сколько и когда**. Один столбик читается так же однозначно,
 * как двадцать четыре, и это главное свойство — экран не должен
 * разваливаться на маленьких числах, потому что маленькие числа у мойки
 * бывают чаще больших.
 *
 * Столбик можно вести пальцем: под пальцем встаёт подпись «12:00 ·
 * 2 500 ֏». Без касания подписан пик — экран, на который просто
 * смотрят, обязан отвечать без действий.
 */
struct RevenueChart: View {
    let series: [API.SeriesPoint]
    let title: String
    /// Подпись деления: «12:00» для дня, «14» для месяца.
    let axis: (API.SeriesPoint) -> String
    let money: (Int) -> String

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Под пальцем. `nil` — палец убран, подписан пик.
    @State private var touched: Int?

    private var peak: Int { max(1, series.map(\.revenue).max() ?? 1) }
    private var peakIndex: Int { series.firstIndex { $0.revenue == peak } ?? 0 }
    private var shown: Int { touched ?? peakIndex }

    /// Высота поля. Больше прежних шестидесяти: это единственная картинка
    /// на экране, и мелкой она читается как полоска шума под числами.
    private let field: CGFloat = 94

    var body: some View {
        if !series.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                header
                bars
                labels
            }
            .padding(.top, 16)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(title). \(caption)")
        }
    }

    // ──────────────────────────── шапка ────────────────────────────

    private var caption: String {
        guard series.indices.contains(shown) else { return "" }
        let point = series[shown]
        return "\(axis(point)) · \(money(point.revenue))"
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(title)
                .font(.system(size: 12.5, weight: .semibold))
                .foregroundStyle(Brand.boardMuted)

            Spacer(minLength: 0)

            /* Одна подпись на оба состояния: под пальцем — то, что под
               пальцем, без пальца — пик. Две разные строки в одном углу
               заставляли бы читать, какая из них сейчас. */
            Text(caption)
                .font(.system(size: 12.5, weight: touched == nil ? .regular : .semibold))
                .monospacedDigit()
                .foregroundStyle(touched == nil ? Brand.boardMuted : Brand.onBoard)
                .lineLimit(1)
                .contentTransition(.numericText())
        }
    }

    // ──────────────────────────── столбики ────────────────────────────

    private var bars: some View {
        GeometryReader { geo in
            let gap: CGFloat = series.count > 16 ? 2 : 4
            let width = max(2, (geo.size.width - gap * CGFloat(series.count - 1)) / CGFloat(series.count))

            HStack(alignment: .bottom, spacing: gap) {
                ForEach(series.indices, id: \.self) { i in
                    bar(at: i, width: width)
                }
            }
            .frame(width: geo.size.width, height: field, alignment: .bottom)
            /* Ведём палец, а не ловим нажатие: на графике из двадцати
               четырёх делений попасть в нужное с первого раза нельзя, а
               провести и остановиться — можно. */
            .contentShape(.rect)
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        let step = width + gap
                        let index = Int((value.location.x / step).rounded(.down))
                        touched = min(max(0, index), series.count - 1)
                    }
                    .onEnded { _ in touched = nil }
            )
        }
        .frame(height: field)
        .sensoryFeedback(.selection, trigger: touched)
    }

    private func bar(at i: Int, width: CGFloat) -> some View {
        let value = series[i].revenue
        let share = Double(value) / Double(peak)
        /* Лайм — только под пальцем.

           Подсвечивать пик самим по себе нельзя: когда за день одна
           машина, она же и пик, её столбик тянется на всю высоту поля, и
           экран занимает горящий зелёный прямоугольник в пол-ладони. Цвет
           тут отвечает на «что я сейчас трогаю», а не украшает — без
           касания график серый и спокойный, а пик и так подписан
           словами в шапке. */
        let lit = touched == i && value > 0

        return RoundedRectangle(cornerRadius: min(5, width / 2), style: .continuous)
            .fill(
                lit
                    /* Подсвеченный столбик — лаймом с растворением книзу:
                       он должен читаться как свет прибора, а не как
                       залитый прямоугольник. */
                    ? LinearGradient(
                        colors: [Brand.lime, Brand.lime.opacity(0.55)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    : LinearGradient(
                        colors: [Brand.boardInk.opacity(0.22), Brand.boardInk.opacity(0.11)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
            )
            .frame(width: width, height: max(3, field * share))
            /* Пустой час остаётся видимой полоской в три пикселя: ноль —
               это «машин не было», а не «данных нет», и разница между
               этими двумя вещами для владельца существенна. */
            .animation(reduceMotion ? nil : .easeOut(duration: 0.18), value: lit)
    }

    // ──────────────────────────── подписи ────────────────────────────

    /**
     * Четыре отметки: начало, две внутри, конец. Позиции подобраны под
     * места подписей, а не под номера точек: четыре равные колонки ставят
     * свои середины на 0, 37.5, 62.5 и 100 процентов ширины.
     */
    private var labels: some View {
        let last = series.count - 1
        let picks: [Int] = last <= 3
            ? Array(0...max(0, last))
            : [0, Int((Double(last) * 0.375).rounded()), Int((Double(last) * 0.625).rounded()), last]

        return HStack(spacing: 0) {
            ForEach(Array(picks.enumerated()), id: \.offset) { slot, i in
                Text(series.indices.contains(i) ? axis(series[i]) : "")
                    .font(.system(size: 11))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted.opacity(0.85))
                    .frame(
                        maxWidth: .infinity,
                        alignment: slot == 0
                            ? .leading
                            : slot == picks.count - 1 ? .trailing : .center
                    )
            }
        }
    }
}
