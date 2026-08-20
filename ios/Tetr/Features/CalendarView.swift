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
    @Environment(\.dismiss) private var dismiss

    @State private var month = ""
    @State private var data: API.Month?
    @State private var picked: String?
    @State private var loading = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var currency: String { session.tenant?.currency ?? "AMD" }

    /// Понедельник первым: в Армении неделя начинается с него.
    ///
    /// Имена берёт система на языке интерфейса — выписывать семь слов
    /// трижды значило бы держать три списка и забывать один из них.
    private var weekdays: [String] { LocalDate.shortWeekdays }

    private let gap: CGFloat = 10

    var body: some View {
        ScrollView {
            VStack(spacing: gap) {
                if let total = data?.total { reading(total) }
                grid
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
            /* Выход с экрана. Своя шапка заменила системную панель, и
               вместе с панелью пропала кнопка «назад» — из календаря
               можно было выйти только жестом от края, о котором знают не
               все. Стрелки месяца при этом собраны справа: слева уход с
               экрана, справа перемещение внутри него, и две разные по
               смыслу стрелки больше не стоят рядом. */
            Button { dismiss() } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Brand.onBoard)
                    .frame(width: 38, height: 38)
                    .background(Brand.boardInk.opacity(0.07), in: .circle)
            }
            .buttonStyle(.press)
            .accessibilityLabel(L("common.back"))

            Text(Self.title(month))
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(Brand.onBoard)
                .frame(maxWidth: .infinity)
                .contentTransition(.numericText())

            arrow("chevron.left", L("owner.vsPrevPeriod")) { shift(by: -1) }

            // вперёд дальше текущего месяца незачем: там пусто по определению
            arrow("chevron.right", L("calendar.nextMonth")) { shift(by: 1) }
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
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 5) {
            Text(total.profit >= 0 ? L("calendar.monthProfit") : L("calendar.monthInTheRed"))
                    .font(.system(size: 11, weight: .black, design: .rounded))
                    .tracking(1.15)
                    .foregroundStyle(Brand.boardMuted)

            Text((total.profit < 0 ? "−" : "") + money(abs(total.profit), currency))
                    .font(.system(size: 42, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.sign(total.profit))
                .lineLimit(1)
                .minimumScaleFactor(0.42)
                // значение передаётся внутрь: по нему система понимает, в
                // какую сторону крутить разряды
                .contentTransition(.numericText(value: Double(total.profit)))
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, alignment: .leading)

            totals(total)
        }
        .frame(maxWidth: .infinity)
        .padding(.bottom, 2)
    }

    /**
     * Итоги месяца четырьмя мягкими карточками.
     *
     * Тёмных плиток со свечением было две — выручка и машины, — и они
     * отвечали на два вопроса из четырёх: куда делись деньги, из них не
     * следовало. Светились при этом громче всего на экране, хотя главное
     * здесь — форма месяца в сетке.
     *
     * Теперь цепочка названа целиком: пришло, за сколько машин, ушло
     * людям, ушло на расходы. Краски те же, что на смене и в карточке дня:
     * мята за объём работы, лаванда за деньги, кобальт за траты — и один и
     * тот же смысл окрашен одинаково во всём продукте.
     */
    @ViewBuilder
    private func totals(_ total: API.MonthTotal) -> some View {
        if total.revenue > 0 || total.count > 0 {
            VStack(spacing: 13) {
                HStack(alignment: .firstTextBaseline) {
                    Text(L("owner.revenue"))
                        .font(.system(size: 12.5, weight: .medium))
                        .foregroundStyle(Brand.boardMuted)
                    Spacer(minLength: 8)
                    Text(money(total.revenue, currency))
                        .font(.system(size: 19, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(Brand.mintInk)
                }

                Rectangle().fill(Brand.boardInk.opacity(0.07)).frame(height: 1)

                HStack(alignment: .top, spacing: 6) {
                    monthMetric("\(total.count)", Terms.unitWord(total.count, session.tenant?.unitOne ?? ""), Brand.onBoard)
                    divider
                    monthMetric(money(total.payroll, currency), L("summary.toStaff"), Brand.lavenderInk)
                    divider
                    monthMetric(money(total.expenses, currency), L("expenses.title"), Brand.sandInk)
                }
            }
            .padding(16)
            .background(Brand.boardSurface, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .strokeBorder(Brand.boardInk.opacity(0.07))
            }
        }
    }

    private func monthMetric(_ value: String, _ label: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(value)
                .font(.system(size: 14, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(color)
                .lineLimit(1)
                .minimumScaleFactor(0.65)
            Text(label)
                .font(.system(size: 10.5))
                .foregroundStyle(Brand.boardMuted)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var divider: some View {
        Rectangle()
            .fill(Brand.boardInk.opacity(0.07))
            .frame(width: 1, height: 34)
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
        /* Бумага, а не серое пятно от полотна.

           Серая подложка была тенью: на светлой теме она читалась не как
           «спокойная поверхность», а как выключенный блок, и сетка теряла
           края. Белая коробка с волосяной кромкой — та же, в которой на
           этом экране живут все списки, — держит сетку предметом, а
           сиреневые клетки внутри становятся заметно чище. */
        .background(Brand.boardSurface, in: .rect(cornerRadius: 24, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .strokeBorder(Brand.boardInk.opacity(0.07), lineWidth: 0.8)
        }
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
        /* Верх шкалы приглушён нарочно.

           Раньше лучший день заливался грейпом во всю силу, и в сетке
           появлялся тяжёлый тёмно-фиолетовый квадрат — на светлой теме он
           читался как ошибка или как выделенная ячейка, а не как «в этот
           день заработали больше всего». Календарь смотрят целиком, и ни
           одна клетка не должна бить по глазам.

           Потолок теперь 0.38: клетка остаётся светлой сиреневой при любой
           выручке, и месяц читается ровным полем, где сильные дни просто
           плотнее. Белая цифра при таком потолке не нужна вовсе — тёмная
           читается на всей шкале, а переключение цвета на полпути само по
           себе выглядело сбоем. Разницу между днями и так несёт число
           внутри клетки. */
        let heat = day.revenue > 0 ? 0.07 + 0.31 * sqrt(share) : 0
        let deep = false
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
        .accessibilityValue(day.revenue > 0 ? "\(day.count) · \(money(day.revenue, currency))" : L("common.empty"))
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
                    Text(L("calendar.weekShape"))
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
            .background(Brand.boardSurface, in: .rect(cornerRadius: 24, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .strokeBorder(Brand.boardInk.opacity(0.07), lineWidth: 0.8)
            }
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
        guard let date = LocalDate.fromYM(month) else { return month }
        return LocalDate.monthYear(date)
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
