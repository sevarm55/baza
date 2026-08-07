import SwiftUI

/**
 * Календарь месяца.
 *
 * Владелец помнит не даты, а «та суббота, когда было много». Поэтому клетка
 * здесь — не подпись с суммой и не столбик, а **заливка по величине**:
 * тепловая карта. Форма месяца берётся одним взглядом — где густо, где
 * пусто, — и по той же клетке в день и заходят.
 *
 * Столбик в клетке, который был раньше, требовал сравнивать высоты
 * пятимиллиметровых чёрточек через всю сетку. Заливка сравнивается сама:
 * глаз различает светлоту без измерения, а на мокром экране под солнцем
 * переживает выгорание оттенка лучше, чем тонкая линия.
 *
 * И третье, чего в продукте не было ни разу: **профиль недели** под сеткой.
 * У мойки главные колебания недельные — суббота против вторника даёт разницу
 * в разы. Календарь этого не показывает: он расставляет дни по числам, а не
 * по дням недели. Семь столбиков внизу отвечают на вопрос, который владелец
 * задаёт себе каждый месяц: какой день работает, а какой можно закрывать.
 */
struct CalendarView: View {
    @EnvironmentObject private var session: Session

    @State private var month = ""
    @State private var data: API.Month?
    @State private var picked: String?
    @State private var loading = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var currency: String { session.tenant?.currency ?? "AMD" }

    /// Понедельник первым: в Армении неделя начинается с него.
    private let weekdays = ["Երկ", "Երք", "Չրք", "Հնգ", "Ուր", "Շբթ", "Կիր"]

    private let gap: CGFloat = 10

    var body: some View {
        ScrollView {
            VStack(spacing: gap) {
                if let total = data?.total { reading(total) }
                grid
                if let total = data?.total { totals(total) }
                weekProfile
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 28)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.board.ignoresSafeArea())
        .safeAreaInset(edge: .top) { header }
        .task {
            if month.isEmpty { month = Self.currentMonth() }
            await reload()
        }
        .refreshable { await reload() }
        .sheet(item: $picked) { date in
            DayView(date: date).environmentObject(session)
        }
    }

    // ══════════════════════════ шапка ══════════════════════════

    private var header: some View {
        HStack(spacing: 10) {
            arrow("chevron.left", "Նախորդ ամիս") { shift(by: -1) }
                .disabled(false)

            Text(Self.title(month))
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(Brand.onBoard)
                .frame(maxWidth: .infinity)
                .contentTransition(.numericText())

            // вперёд дальше текущего месяца незачем: там пусто по определению
            arrow("chevron.right", "Հաջորդ ամիս") { shift(by: 1) }
                .disabled(month >= Self.currentMonth())
                .opacity(month >= Self.currentMonth() ? 0.3 : 1)
        }
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
        .background(Brand.board.ignoresSafeArea(edges: .top))
    }

    private func arrow(_ symbol: String, _ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Brand.onBoard)
                .frame(width: 38, height: 38)
                .background(Brand.boardInk.opacity(0.07), in: .circle)
        }
        .buttonStyle(.press)
        .accessibilityLabel(label)
    }

    // ══════════════════════════ показание ══════════════════════════

    private func reading(_ total: API.MonthTotal) -> some View {
        VStack(spacing: 0) {
            Text(total.profit >= 0 ? "Ամսվա շահույթ" : "Ամիսը մինուսում")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Brand.onBoard.opacity(0.85))
                .padding(.top, 6)

            Text((total.profit < 0 ? "−" : "") + money(abs(total.profit), currency))
                .font(.system(size: 46, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(total.profit < 0 ? Brand.warnOnBoard : Brand.onBoard)
                .lineLimit(1)
                .minimumScaleFactor(0.42)
                // значение передаётся внутрь: по нему система понимает, в
                // какую сторону крутить разряды
                .contentTransition(.numericText(value: Double(total.profit)))
        }
        .frame(maxWidth: .infinity)
        .padding(.bottom, 4)
    }

    // ══════════════════════════ сетка ══════════════════════════

    private var grid: some View {
        let days = data?.days ?? []
        let peak = max(1, days.map(\.revenue).max() ?? 1)

        return VStack(spacing: 6) {
            HStack(spacing: 5) {
                ForEach(Array(weekdays.enumerated()), id: \.offset) { i, w in
                    Text(w)
                        .font(.system(size: 10, weight: .semibold))
                        // выходные приглушены: на мойке они как раз самые
                        // сильные, и подсвечивать их красным было бы враньём
                        .foregroundStyle(Brand.boardMuted)
                        .frame(maxWidth: .infinity)
                }
            }

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 5), count: 7), spacing: 5) {
                ForEach(0..<Self.blanks(before: month), id: \.self) { _ in
                    Color.clear.frame(height: 46)
                }
                ForEach(days) { day in
                    cell(day, peak: peak)
                }
            }
        }
        .padding(14)
        .background(Brand.boardInk.opacity(0.05), in: .rect(cornerRadius: 24))
        .opacity(loading && data == nil ? 0.4 : 1)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.25), value: month)
    }

    /**
     * Клетка дня.
     *
     * Заливка — доля от лучшего дня месяца, но не линейно: корень. Линейная
     * шкала на мойке даёт почти одинаково бледные клетки, потому что один
     * выдающийся день задирает знаменатель и прижимает к полу все
     * остальные. Корень растягивает низ шкалы, где и живёт разница между
     * обычным вторником и хорошей средой.
     *
     * Под порогом текст остаётся тёмным, выше — становится белым: на
     * насыщенной заливке тёмная цифра пропадает.
     */
    private func cell(_ day: API.MonthDay, peak: Int) -> some View {
        let share = max(0, min(1, Double(day.revenue) / Double(peak)))
        let heat = day.revenue > 0 ? 0.14 + 0.86 * sqrt(share) : 0
        let deep = heat > 0.55
        let today = day.date == Self.today()

        return Button {
            picked = day.date
        } label: {
            VStack(spacing: 2) {
                Text(String(Int(day.date.suffix(2)) ?? 0))
                    .font(.system(size: 14, weight: day.revenue > 0 ? .bold : .regular))
                    .monospacedDigit()
                    .foregroundStyle(
                        deep ? .white : (day.revenue > 0 ? Brand.onBoard : Brand.boardMuted.opacity(0.55))
                    )
                if day.count > 0 {
                    Text("\(day.count)")
                        .font(.system(size: 9, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(deep ? .white.opacity(0.75) : Brand.boardMuted)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 46)
            .background(Brand.grapeFill.opacity(heat), in: .rect(cornerRadius: 12))
            .overlay {
                // сегодня — кольцом, а не заливкой: заливка здесь уже занята
                // величиной, и второй смысл в неё не вложить
                if today {
                    RoundedRectangle(cornerRadius: 12)
                        .strokeBorder(Brand.lime, lineWidth: 2)
                }
            }
        }
        .buttonStyle(.press)
        .disabled(day.revenue == 0)
        .accessibilityLabel("\(Int(day.date.suffix(2)) ?? 0)")
        .accessibilityValue(day.revenue > 0 ? "\(day.count) · \(money(day.revenue, currency))" : "դատարկ")
    }

    // ══════════════════════════ итоги ══════════════════════════

    private func totals(_ total: API.MonthTotal) -> some View {
        HStack(spacing: gap) {
            small(.teal, "Հասույթ", money(total.revenue, currency), Double(total.revenue))
            small(.slate, session.tenant?.unitOne ?? "", "\(total.count)", Double(total.count))
        }
    }

    private func small(_ tone: Tone, _ title: String, _ value: String, _ animate: Double) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.system(size: 11.5))
                .foregroundStyle(tone.ink.opacity(0.72))
                .lineLimit(1)
            Spacer(minLength: 6)
            Text(value)
                .font(.system(size: 22, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(tone.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .contentTransition(.numericText(value: animate))
        }
        .frame(height: 88, alignment: .topLeading)
        .tile(tone)
        .accessibilityElement(children: .combine)
    }

    // ══════════════════════════ профиль недели ══════════════════════════

    /**
     * Средняя выручка по дням недели за этот месяц.
     *
     * Среднее, а не сумма: в месяце пять суббот и четыре вторника, и по
     * сумме суббота выигрывала бы просто потому, что её больше. Дни без
     * работы в среднее не идут — иначе неделя, когда мойка стояла закрытой,
     * ровным слоем занижала бы весь профиль.
     */
    @ViewBuilder
    private var weekProfile: some View {
        let avg = weekdayAverages
        if avg.contains(where: { $0 > 0 }) {
            let peak = max(1, avg.max() ?? 1)
            let best = avg.firstIndex(of: peak) ?? 0

            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Շաբաթվա պատկերը")
                        .font(.system(size: 14.5, weight: .semibold))
                        .foregroundStyle(Brand.onBoard)
                    Spacer()
                    Text("\(weekdays[best]) · \(money(Int(peak), currency))")
                        .font(.system(size: 11.5))
                        .monospacedDigit()
                        .foregroundStyle(Brand.boardMuted)
                }
                .padding(.bottom, 12)

                HStack(alignment: .bottom, spacing: 6) {
                    ForEach(0..<7, id: \.self) { i in
                        VStack(spacing: 5) {
                            RoundedRectangle(cornerRadius: 5)
                                .fill(i == best ? Brand.grapeFill : Brand.grapeFill.opacity(0.26))
                                .frame(height: max(3, 62 * CGFloat(avg[i] / peak)))
                            Text(weekdays[i])
                                .font(.system(size: 9.5))
                                .foregroundStyle(Brand.boardMuted)
                        }
                        .frame(maxWidth: .infinity)
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel(weekdays[i])
                        .accessibilityValue(money(Int(avg[i]), currency))
                    }
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Brand.boardInk.opacity(0.05), in: .rect(cornerRadius: 24))
        }
    }

    /// Средняя выручка по каждому дню недели, понедельник первым.
    private var weekdayAverages: [Double] {
        var sum = [Double](repeating: 0, count: 7)
        var days = [Double](repeating: 0, count: 7)

        var cal = Foundation.Calendar(identifier: .gregorian)
        cal.firstWeekday = 2
        cal.timeZone = TimeZone(identifier: "UTC")!

        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "UTC")

        for day in data?.days ?? [] where day.revenue > 0 {
            guard let date = f.date(from: day.date) else { continue }
            // 0 — понедельник: система считает воскресенье первым
            let i = (cal.component(.weekday, from: date) + 5) % 7
            sum[i] += Double(day.revenue)
            days[i] += 1
        }

        return (0..<7).map { days[$0] > 0 ? sum[$0] / days[$0] : 0 }
    }

    // ══════════════════════════ данные ══════════════════════════

    private func shift(by months: Int) {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
            month = Self.month(month, plus: months)
        }
        Task { await reload() }
    }

    private func reload() async {
        loading = true
        defer { loading = false }

        let fresh: API.Month? = try? await session.authed { token in
            try await APIClient.shared.send("calendar?month=\(month)", token: token, as: API.Month.self)
        }
        if let fresh {
            if reduceMotion {
                data = fresh
            } else {
                withAnimation(.snappy(duration: 0.35)) { data = fresh }
            }
        }
    }
}

/* ---------- работа с «YYYY-MM» ----------

   Месяц держим строкой, а не датой: сервер отвечает на неё же, и превращать
   её в Date и обратно значит завести две точки, где может поехать часовой
   пояс.                                                                  */

extension CalendarView {
    static func currentMonth() -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM"
        return f.string(from: Date())
    }

    /// Сегодняшняя дата в том же виде, в каком её присылает сервер.
    static func today() -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: Date())
    }

    static func month(_ from: String, plus months: Int) -> String {
        let parts = from.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 2 else { return from }
        let total = parts[0] * 12 + (parts[1] - 1) + months
        return String(format: "%04d-%02d", total / 12, total % 12 + 1)
    }

    static func title(_ month: String) -> String {
        let names = ["Հունվար", "Փետրվար", "Մարտ", "Ապրիլ", "Մայիս", "Հունիս",
                     "Հուլիս", "Օգոստոս", "Սեպտեմբեր", "Հոկտեմբեր", "Նոյեմբեր", "Դեկտեմբեր"]
        let parts = month.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 2, (1...12).contains(parts[1]) else { return month }
        return "\(names[parts[1] - 1]) \(parts[0])"
    }

    /// Сколько пустых клеток перед первым числом.
    static func blanks(before month: String) -> Int {
        var cal = Foundation.Calendar(identifier: .gregorian)
        cal.firstWeekday = 2 // понедельник
        cal.timeZone = TimeZone(identifier: "UTC")!

        let parts = month.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 2,
              let first = cal.date(from: DateComponents(year: parts[0], month: parts[1], day: 1))
        else { return 0 }

        return (cal.component(.weekday, from: first) - cal.firstWeekday + 7) % 7
    }
}

extension String: @retroactive Identifiable {
    public var id: String { self }
}
