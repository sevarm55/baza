import SwiftUI

/// Месяц и история дня.
///
/// Календарь здесь не украшение, а способ задать вопрос: владелец помнит
/// не даты, а «та суббота, когда было много». Сетка показывает форму
/// месяца сразу — где густо, где пусто, — и по ней же в этот день и
/// заходят.
///
/// В клетке столбик, а не сумма: пять-шесть цифр в клетку шириной в палец
/// не влезают, а высота читается мгновенно и без чтения.
struct CalendarView: View {
    @EnvironmentObject private var session: Session

    @State private var month = ""
    @State private var data: API.Month?
    @State private var picked: String?
    @State private var loading = false

    private var currency: String { session.tenant?.currency ?? "AMD" }

    /// Понедельник первым: в Армении неделя начинается с него.
    private let weekdays = ["Ե", "Ե", "Չ", "Հ", "Ո", "Շ", "Կ"]

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                header
                grid
                if let total = data?.total { summary(total) }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .screenBackground()
        .task {
            if month.isEmpty { month = Self.currentMonth() }
            await reload()
        }
        .refreshable { await reload() }
        .sheet(item: $picked) { date in
            DayView(date: date).environmentObject(session)
        }
    }

    private var header: some View {
        HStack {
            Button { shift(by: -1) } label: {
                Image(systemName: "chevron.left").foregroundStyle(Brand.grape)
            }
            Spacer()
            Text(Self.title(month))
                .font(.system(size: 17, weight: .bold))
                .contentTransition(.numericText())
            Spacer()
            Button { shift(by: 1) } label: {
                Image(systemName: "chevron.right").foregroundStyle(Brand.grape)
            }
            // вперёд дальше текущего месяца незачем: там пусто по определению
            .disabled(month >= Self.currentMonth())
            .opacity(month >= Self.currentMonth() ? 0.3 : 1)
        }
        .padding(.top, 6)
    }

    private var grid: some View {
        let days = data?.days ?? []
        let peak = max(1, days.map(\.revenue).max() ?? 1)

        return VStack(spacing: 8) {
            HStack(spacing: 4) {
                ForEach(Array(weekdays.enumerated()), id: \.offset) { _, w in
                    Text(w)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Brand.muted)
                        .frame(maxWidth: .infinity)
                }
            }

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 4) {
                ForEach(0..<Self.blanks(before: month), id: \.self) { _ in
                    Color.clear.frame(height: 54)
                }
                ForEach(days) { day in
                    cell(day, peak: peak)
                }
            }
        }
        .opacity(loading && data == nil ? 0.4 : 1)
    }

    private func cell(_ day: API.MonthDay, peak: Int) -> some View {
        let worked = day.revenue > 0
        return Button {
            picked = day.date
        } label: {
            VStack(spacing: 4) {
                Text(String(Int(day.date.suffix(2)) ?? 0))
                    .font(.system(size: 14, weight: worked ? .bold : .regular))
                    .foregroundStyle(worked ? Brand.ink : Brand.muted.opacity(0.6))

                /* Столбик от общей высоты, а не от нуля: день с одной
                   машиной должен быть виден, иначе он неотличим от
                   выходного, а это разные вещи. */
                Capsule()
                    .fill(worked ? Brand.grape : Color.clear)
                    .frame(
                        width: 18,
                        height: worked ? 4 + 14 * CGFloat(day.revenue) / CGFloat(peak) : 0
                    )
            }
            .frame(maxWidth: .infinity)
            .frame(height: 54)
            .background(
                worked ? Brand.grape.opacity(0.08) : Color.clear,
                in: RoundedRectangle(cornerRadius: 10)
            )
        }
        .buttonStyle(.plain)
        .disabled(!worked)
    }

    private func summary(_ total: API.MonthTotal) -> some View {
        VStack(spacing: 10) {
            row("Հասույթ", money(total.revenue, currency))
            row("\(total.count) \(session.tenant?.unitOne ?? "")", "", muted: true)
            Divider().overlay(Brand.line)
            row("Շահույթ", money(total.profit, currency), accent: total.profit >= 0)
        }
        .glassCard()
    }

    private func row(_ label: String, _ value: String, muted: Bool = false, accent: Bool? = nil) -> some View {
        HStack {
            Text(label)
                .font(.system(size: muted ? 13 : 15, weight: muted ? .regular : .semibold))
                .foregroundStyle(muted ? Brand.muted : Brand.ink)
            Spacer()
            Text(value)
                .font(.system(size: 15, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(accent == nil ? Brand.ink : (accent! ? Brand.good : Brand.warn))
        }
    }

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
        if let fresh { data = fresh }
    }
}

/* ---------- работа с «YYYY-MM» ----------

   Месяц держим строкой, а не датой: сервер отвечает на неё же, и
   превращать её в Date и обратно значит завести две точки, где может
   поехать часовой пояс.                                              */

extension CalendarView {
    static func currentMonth() -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM"
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
