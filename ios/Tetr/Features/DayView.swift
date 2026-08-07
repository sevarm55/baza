import SwiftUI

/**
 * Один день из истории — то же табло, что везде.
 *
 * Показание по оси, плитки, журнал строками. Наверху прибыль, а не
 * выручка: карточку дня открывают из календаря, где уже видели, насколько
 * день был густым; вопрос, с которым сюда заходят, другой — сколько с него
 * осталось.
 *
 * Смены стоят отдельно от записей и первыми. Человек мог отстоять день и не
 * намыть ничего — по одним записям этого не увидеть, а владельцу важно
 * именно это.
 */
struct DayView: View {
    let date: String

    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss

    @State private var day: API.Day?
    @State private var loading = true

    private var currency: String { session.tenant?.currency ?? "AMD" }

    private let gap: CGFloat = 10

    var body: some View {
        ScrollView {
            VStack(spacing: gap) {
                if let day {
                    reading(day)
                    tiles(day)
                    if !day.shifts.isEmpty { crew(day.shifts) }
                    if day.feed.isEmpty {
                        Text("Այս օրը գրանցումներ չկան")
                            .font(.system(size: 14))
                            .foregroundStyle(Brand.boardMuted)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 40)
                    } else {
                        records(day.feed)
                    }
                } else if loading {
                    TetrLoader(size: 34, tint: Brand.grape).padding(.vertical, 80)
                }
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 28)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.board.ignoresSafeArea())
        .safeAreaInset(edge: .top) { header }
        .task { await load() }
        .presentationDragIndicator(.hidden)
    }

    private var header: some View {
        HStack {
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Brand.boardMuted)
                    .frame(width: 38, height: 38)
                    .background(Brand.boardInk.opacity(0.07), in: .circle)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Փակել")

            Spacer()

            Text(Self.title(date))
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Brand.onBoard)

            Spacer()

            // симметрия: без пустого кружка справа заголовок стоял бы не по
            // центру экрана, а по центру остатка, и это заметно
            Color.clear.frame(width: 38, height: 38)
        }
        .padding(.horizontal, 12)
        .padding(.top, 10)
        .padding(.bottom, 10)
        .background(Brand.board.ignoresSafeArea(edges: .top))
    }

    private func reading(_ day: API.Day) -> some View {
        VStack(spacing: 0) {
            Text(day.profit >= 0 ? "Այդ օրը ձեզ մնաց" : "Այդ օրը մինուսում էիք")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Brand.onBoard.opacity(0.85))

            /* Минус настоящий, U+2212: дефис на таком кегле читается точкой.
               Убыток жёлтым, не красным — красный в продукте значит
               «удалить». */
            Text((day.profit < 0 ? "−" : "") + Tetr.money(abs(day.profit), currency))
                .font(.system(size: 48, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(day.profit < 0 ? Brand.warnOnBoard : Brand.onBoard)
                .lineLimit(1)
                .minimumScaleFactor(0.45)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 4)
        .padding(.bottom, 4)
    }

    private func tiles(_ day: API.Day) -> some View {
        HStack(spacing: gap) {
            small(.teal, "Հասույթ", Tetr.money(day.stats.revenue, currency))
            small(.slate, session.tenant?.unitOne ?? "", "\(day.stats.count)")
        }
    }

    private func small(_ tone: Tone, _ title: String, _ value: String) -> some View {
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
        }
        .frame(height: 86, alignment: .topLeading)
        .tile(tone)
        .accessibilityElement(children: .combine)
    }

    /// Кто стоял на смене — плиткой цветом человека, как в зарплатах.
    private func crew(_ shifts: [API.DayShift]) -> some View {
        VStack(spacing: gap) {
            HStack {
                Text("Հերթափոխին")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Brand.boardMuted)
                Spacer()
            }
            .padding(.horizontal, 6)
            .padding(.top, 12)

            ForEach(shifts) { s in
                let tone = Brand.personTone(s.name)
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 10) {
                        Text(String(s.name.prefix(1)))
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 28, height: 28)
                            .background(.white.opacity(0.22), in: .circle)
                        Text(s.name)
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(.white)
                        Spacer()
                        Text(span(s))
                            .font(.system(size: 12.5))
                            .monospacedDigit()
                            .foregroundStyle(.white.opacity(0.8))
                    }

                    if let expected = s.cashExpected, expected > 0 || s.cashDeclared != nil {
                        cash(expected: expected, declared: s.cashDeclared)
                    }
                }
                .tile(base: tone.base, glow: tone.glow, radius: 20, pad: 14)
                .accessibilityElement(children: .combine)
            }
        }
    }

    /**
     * Наличные: сколько намыл и сколько сдал.
     *
     * «Не отмечено» и «сдал ноль» показываются по-разному: первое значит,
     * что человек пропустил шаг, второе — что денег не было. Смешать их
     * значит превратить забывчивость в обвинение.
     */
    private func cash(expected: Int, declared: Int?) -> some View {
        HStack(spacing: 6) {
            Text("Կանխիկ \(Tetr.money(expected, currency))")
                .foregroundStyle(.white.opacity(0.8))

            if let declared {
                Text("· հանձնեց \(Tetr.money(declared, currency))")
                    .foregroundStyle(.white.opacity(0.8))

                let diff = declared - expected
                if diff != 0 {
                    Text(diff < 0
                         ? "· −\(Tetr.money(-diff, currency))"
                         : "· +\(Tetr.money(diff, currency))")
                        .fontWeight(.bold)
                        .foregroundStyle(Brand.lime)
                }
            } else {
                Text("· չի նշել").foregroundStyle(Brand.lime.opacity(0.9))
            }
        }
        .font(.system(size: 12))
        .monospacedDigit()
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.white.opacity(0.14), in: .rect(cornerRadius: 12))
    }

    /// Записи — строками на табло, как журнал смены.
    private func records(_ feed: [API.FeedItem]) -> some View {
        VStack(spacing: 0) {
            HStack {
                Text("Գրանցումներ")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Brand.boardMuted)
                Spacer()
                Text("\(feed.count)")
                    .font(.system(size: 12))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)
            }
            .padding(.horizontal, 6)
            .padding(.top, 16)
            .padding(.bottom, 6)

            ForEach(feed) { item in
                let who = item.staffName ?? "—"
                HStack(spacing: 10) {
                    Text(hhmm(item.createdAt))
                        .font(.system(size: 12))
                        .monospacedDigit()
                        .foregroundStyle(Brand.boardMuted)
                        .frame(width: 42, alignment: .leading)

                    Text(item.clientKey ?? "—")
                        .font(.system(size: 14, weight: .semibold, design: .rounded))
                        .foregroundStyle(Brand.person(who))
                        .lineLimit(1)

                    Image(systemName: paymentSymbol(item.payment))
                        .font(.system(size: 10.5))
                        .foregroundStyle(Brand.boardMuted)
                        .accessibilityLabel(paymentLabel(item.payment))

                    Spacer(minLength: 8)

                    Text(Tetr.money(item.price, currency))
                        .font(.system(size: 14, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(Brand.onBoard)
                }
                .padding(.horizontal, 6)
                .padding(.vertical, 11)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(who), \(item.clientKey ?? "")")

                if item.id != feed.last?.id {
                    Rectangle()
                        .fill(Brand.boardInk.opacity(0.07))
                        .frame(height: 1)
                }
            }
        }
    }

    /// «09:40 — 19:12» или «с 09:40», если смену не закрыли.
    private func span(_ s: API.DayShift) -> String {
        guard let closed = s.closedAt else { return "\(hhmm(s.openedAt))-ից" }
        return "\(hhmm(s.openedAt)) — \(hhmm(closed))"
    }

    /// Время в зоне бизнеса, а не устройства: владелец в поездке видел
    /// смену, начатую в шесть утра.
    private func hhmm(_ at: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        if let tz = session.tenant?.timezone, let zone = TimeZone(identifier: tz) {
            f.timeZone = zone
        }
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
