import SwiftUI

/// Один день из истории.
///
/// Отвечает ровно на то, ради чего история и заводилась: кто стоял на
/// смене, кто что помыл, сколько вышло.
///
/// Смены показываются отдельно от записей и первыми. Человек мог
/// отстоять день и не намыть ничего — по одним записям этого не увидеть,
/// а владельцу важно именно это.
struct DayView: View {
    let date: String

    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss

    @State private var day: API.Day?
    @State private var loading = true

    private var currency: String { session.tenant?.currency ?? "AMD" }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    if let day {
                        money(day)
                        if !day.shifts.isEmpty { crew(day.shifts) }
                        if day.feed.isEmpty {
                            Text("Այս օրը գրանցումներ չկան")
                                .font(.system(size: 14))
                                .foregroundStyle(Brand.muted)
                                .padding(.vertical, 30)
                        } else {
                            records(day.feed)
                        }
                    } else if loading {
                        ProgressView().tint(Brand.grape).padding(.vertical, 60)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
            .screenBackground()
            .navigationTitle(Self.title(date))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Փակել") { dismiss() }
                }
            }
        }
        .task { await load() }
    }

    private func money(_ day: API.Day) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Հասույթ")
                .font(.system(size: 11, weight: .bold))
                .tracking(1.2)
                .textCase(.uppercase)
                .foregroundStyle(.white.opacity(0.7))

            Text(Tetr.money(day.stats.revenue, currency))
                .font(.system(size: 34, weight: .bold))
                .foregroundStyle(.white)

            Text("\(day.stats.count) \(session.tenant?.unitOne ?? "") · Շահույթ \(Tetr.money(day.profit, currency))")
                .font(.system(size: 13))
                .foregroundStyle(.white.opacity(0.75))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(Brand.heroGradient, in: RoundedRectangle(cornerRadius: 20))
    }

    private func crew(_ shifts: [API.DayShift]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Հերթափոխին")
                .font(.system(size: 11, weight: .bold))
                .tracking(1.2)
                .textCase(.uppercase)
                .foregroundStyle(Brand.muted)

            ForEach(shifts) { s in
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 8) {
                        Circle()
                            .fill(Brand.person(s.name))
                            .frame(width: 9, height: 9)
                        Text(s.name)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Brand.person(s.name))
                        Spacer()
                        Text(span(s))
                            .font(.system(size: 12.5))
                            .monospacedDigit()
                            .foregroundStyle(Brand.muted)
                    }

                    if let expected = s.cashExpected, expected > 0 || s.cashDeclared != nil {
                        cash(expected: expected, declared: s.cashDeclared)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .glassEffect(.regular, in: .rect(cornerRadius: 12))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func records(_ feed: [API.FeedItem]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Գրանցումներ")
                .font(.system(size: 11, weight: .bold))
                .tracking(1.2)
                .textCase(.uppercase)
                .foregroundStyle(Brand.muted)

            ForEach(feed) { item in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.clientKey ?? "—")
                            .font(.system(size: 14.5, weight: .semibold, design: .rounded))
                        HStack(spacing: 5) {
                            Text(item.staffName ?? "—")
                                .fontWeight(.semibold)
                                .foregroundStyle(Brand.person(item.staffName ?? ""))
                            Text("· \(item.serviceName) · \(paymentLabel(item.payment))")
                                .foregroundStyle(Brand.muted)
                        }
                        .font(.system(size: 11.5))
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(Tetr.money(item.price, currency))
                            .font(.system(size: 14.5, weight: .semibold))
                            .monospacedDigit()
                        Text(hhmm(item.createdAt))
                            .font(.system(size: 11))
                            .monospacedDigit()
                            .foregroundStyle(Brand.muted)
                    }
                }
                .padding(12)
                .glassEffect(.regular, in: .rect(cornerRadius: 12))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Наличные: сколько намыл и сколько сдал.
    ///
    /// «Не отмечено» и «сдал ноль» показываются по-разному: первое значит,
    /// что человек пропустил шаг, второе — что денег не было. Смешать их
    /// значит превратить забывчивость в обвинение.
    private func cash(expected: Int, declared: Int?) -> some View {
        HStack(spacing: 6) {
            Text("Կանխիկ \(Tetr.money(expected, currency))")
                .foregroundStyle(Brand.muted)

            if let declared {
                Text("· հանձնեց \(Tetr.money(declared, currency))")
                    .foregroundStyle(Brand.muted)

                let diff = declared - expected
                if diff != 0 {
                    Text(diff < 0
                         ? "· −\(Tetr.money(-diff, currency))"
                         : "· +\(Tetr.money(diff, currency))")
                        .fontWeight(.semibold)
                        .foregroundStyle(Brand.warn)
                }
            } else {
                Text("· չի նշել").foregroundStyle(Brand.warn.opacity(0.8))
            }
        }
        .font(.system(size: 12))
        .monospacedDigit()
    }

    /// «09:40 — 19:12» или «с 09:40», если смену не закрыли.
    private func span(_ s: API.DayShift) -> String {
        guard let closed = s.closedAt else { return "\(hhmm(s.openedAt))-ից" }
        return "\(hhmm(s.openedAt)) — \(hhmm(closed))"
    }

    private func hhmm(_ at: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        return f.string(from: at)
    }

    private func load() async {
        loading = true
        defer { loading = false }

        let fresh: API.Day? = try? await session.authed { token in
            try await APIClient.shared.send("day?date=\(date)", token: token, as: API.Day.self)
        }
        day = fresh
    }

    static func title(_ date: String) -> String {
        let names = ["հունվարի", "փետրվարի", "մարտի", "ապրիլի", "մայիսի", "հունիսի",
                     "հուլիսի", "օգոստոսի", "սեպտեմբերի", "հոկտեմբերի", "նոյեմբերի", "դեկտեմբերի"]
        let parts = date.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, (1...12).contains(parts[1]) else { return date }
        return "\(parts[2]) \(names[parts[1] - 1])"
    }
}
