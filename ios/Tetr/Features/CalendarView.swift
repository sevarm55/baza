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
    /**
     * Почему месяц не приехал.
     *
     * Раньше отказ глотался молча, и хуже того: заголовок уже показывал
     * новый месяц, а сетка — цифры старого. Экран, где подпись и данные
     * врут друг про друга, опаснее пустого.
     */
    @State private var failure: String?
    /// Месяц, чьи данные сейчас на экране. При отказе заголовок
    /// возвращается к нему, чтобы не подписывать чужие цифры.
    @State private var shownMonth = ""
    /// Номер запроса: поздний ответ о старом месяце не затирает свежий.
    @State private var loadID = 0

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
            VStack(alignment: .leading, spacing: 0) {
                if let failure, data == nil {
                    TetrFailure(title: failure, retry: { await reload() })
                        .padding(.top, 60)
                } else {
                    if let failure {
                        HStack(spacing: 10) {
                            Text(failure)
                                .font(.system(size: 13))
                                .foregroundStyle(Brand.badOnBoard)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 8)
                            Button(L("common.retry")) { Task { await reload() } }
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(Brand.grape)
                        }
                        .padding(12)
                        .background(Brand.badOnBoard.opacity(0.09), in: .rect(cornerRadius: 14, style: .continuous))
                        .padding(.bottom, 12)
                    }

                    if let total = data?.total { hero(total) }

                    grid
                        .padding(.top, 12)

                    weekProfile
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 6)
            .padding(.bottom, 28)
        }
        .refreshable { await reload() }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .meshPage()
        .brandTitleFont()
        .navigationTitle(L("calendar.title"))
        .navigationSubtitle(Self.title(month))
        .toolbarTitleDisplayMode(.inlineLarge)
        .toolbar {
            /* Месяцы листаются стрелками в панели, а не своей шапкой:
               шапка была ещё одной строкой поверх экрана и повторяла
               заголовок, который система рисует сама. Вперёд дальше
               текущего месяца незачем — там пусто по определению. */
            ToolbarItem(placement: .topBarTrailing) {
                arrow("chevron.left", L("calendar.prevMonth")) { shift(by: -1) }
            }
            ToolbarItem(placement: .topBarTrailing) {
                arrow("chevron.right", L("calendar.nextMonth")) { shift(by: 1) }
                    .disabled(month >= Self.currentMonth())
                    .opacity(month >= Self.currentMonth() ? 0.35 : 1)
            }
        }
        .task {
            if month.isEmpty { month = Self.currentMonth() }
            await reload()
        }
        .sheet(item: $picked) { date in
            DayView(date: date).environmentObject(session)
        }
    }

    private func arrow(_ symbol: String, _ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Brand.ink)
        }
        .accessibilityLabel(label)
    }

    // ══════════════════════════ показание ══════════════════════════

    /**
     * Месяц одной лаймовой картой.
     *
     * Прибыль стояла голым числом на полотне, а под ней лежала карточка
     * с выручкой и тремя показателями — два блока про одни и те же
     * деньги подряд. Теперь всё в одной карте: главное число крупно,
     * остальное фишками, и каждое число названо ровно один раз.
     *
     * Фишки переносятся строкой: по-армянски «Աշխատակիցներին» вдвое
     * длиннее русского слова, и в жёсткий ряд из четырёх они не встают.
     */
    private func hero(_ total: API.MonthTotal) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(total.profit >= 0 ? L("calendar.monthProfit") : L("calendar.monthInTheRed"))
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Brand.onLime.opacity(0.75))

            /* Минус настоящий, U+2212: дефис на таком кегле читается
               точкой. Убыток краснеет — на лайме это единственный цвет,
               который читается тревогой. */
            Text((total.profit < 0 ? "−" : "") + money(abs(total.profit), currency))
                .font(.system(size: 44, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(total.profit < 0 ? Brand.badOnBoard : Brand.onLime)
                .lineLimit(1)
                .minimumScaleFactor(0.42)
                .padding(.top, 2)
                // значение передаётся внутрь: по нему система понимает, в
                // какую сторону крутить разряды
                .contentTransition(.numericText(value: Double(total.profit)))

            if total.revenue > 0 || total.count > 0 {
                FlowLayout(spacing: 8) {
                    pill("\(L("owner.revenue")) \(money(total.revenue, currency))")
                    pill(Terms.units(total.count, session.tenant?.unitOne ?? ""))
                    if total.payroll > 0 {
                        pill("\(L("summary.toStaff")) \(money(total.payroll, currency))")
                    }
                    if total.expenses > 0 {
                        pill("\(L("expenses.title")) \(money(total.expenses, currency))")
                    }
                }
                .padding(.top, 16)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Brand.lime, in: .rect(cornerRadius: 28, style: .continuous))
        .shadow(color: Brand.lime.opacity(0.35), radius: 16, y: 8)
    }

    private func pill(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 13, weight: .semibold))
            .monospacedDigit()
            .foregroundStyle(Brand.onLime)
            .lineLimit(1)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(.white.opacity(0.55), in: .capsule)
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
                        .foregroundStyle(Brand.muted)
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
        .paperCard(22)
        .opacity(loading && data == nil ? 0.4 : 1)
        .animation(reduceMotion ? nil : .easeOut(duration: Motion.normal), value: month)
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
        let today = day.date == Self.today()

        return Button {
            picked = day.date
        } label: {
            VStack(spacing: 2) {
                Text(String(Int(day.date.suffix(2)) ?? 0))
                    .font(.system(size: 14, weight: day.revenue > 0 ? .bold : .regular))
                    .monospacedDigit()
                    .foregroundStyle(day.revenue > 0 ? Brand.ink : Brand.muted.opacity(0.55))
                if day.count > 0 {
                    Text("\(day.count)")
                        .font(.system(size: 11, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(Brand.muted)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 46)
            /* Адаптивный грейп, а не прибитый: в тёмной теме фиксированный
               #6D28D9 почти не отличим от полотна, и теплокарта теряла
               разрешение. Светлый вариант из пары `Brand.grape` держит
               шкалу читаемой в обеих темах. */
            .background(Brand.grape.opacity(heat), in: .rect(cornerRadius: 14, style: .continuous))
            .overlay {
                // сегодня — кольцом, а не заливкой: заливка здесь уже занята
                // величиной, и второй смысл в неё не вложить
                if today {
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .strokeBorder(Brand.lime, lineWidth: 2)
                }
            }
        }
        .buttonStyle(.press)
        /* Открывается любой прошедший день, не только с выручкой: день с
           одними расходами участвует в убытке месяца, и заперт был зря.
           Пустой день честно отвечает «пусто» своим экраном. */
        .disabled(day.date > Self.today())
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
                    Text(L("calendar.weekShape").uppercased())
                        .font(.system(size: 11, weight: .black, design: .rounded))
                        .tracking(1.3)
                        .foregroundStyle(Brand.muted)
                    Spacer()
                    Text("\(weekdays[best]) · \(money(Int(peak), currency))")
                        .font(.system(size: 12))
                        .monospacedDigit()
                        .foregroundStyle(Brand.muted)
                }
                .padding(.bottom, 12)

                HStack(alignment: .bottom, spacing: 6) {
                    ForEach(0..<7, id: \.self) { i in
                        VStack(spacing: 5) {
                            RoundedRectangle(cornerRadius: 5, style: .continuous)
                                .fill(i == best ? Brand.grapeFill : Brand.grapeFill.opacity(0.26))
                                .frame(height: max(3, 62 * CGFloat(avg[i] / peak)))
                            Text(weekdays[i])
                                .font(.system(size: 11))
                                .foregroundStyle(Brand.muted)
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
            .paperCard(22)
            .padding(.top, 12)
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
        loadID += 1
        let id = loadID
        let requested = month
        loading = true
        defer { if id == loadID { loading = false } }

        do {
            let fresh = try await session.authed { token in
                try await APIClient.shared.send("calendar?month=\(requested)", token: token, as: API.Month.self)
            }
            guard id == loadID, requested == month else { return }
            failure = nil
            shownMonth = requested
            if reduceMotion {
                data = fresh
            } else {
                withAnimation(.snappy(duration: 0.35)) { data = fresh }
            }
        } catch is CancellationError {
            return
        } catch let error as APIError {
            guard id == loadID else { return }
            if !shownMonth.isEmpty { month = shownMonth }
            failure = error.isOffline
                ? L("errors.offline")
                : L("errors.server", "\(error.status) \(error.code ?? "—")")
        } catch {
            guard id == loadID else { return }
            if !shownMonth.isEmpty { month = shownMonth }
            failure = Failure.text(error)
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
