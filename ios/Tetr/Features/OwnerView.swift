import SwiftUI

/// Кабинет владельца.
///
/// Сводка приходит одним запросом — на мобильной сети четыре round-trip
/// складываются в паузу, а часть ещё и обрывается.
struct OwnerView: View {
    @EnvironmentObject private var session: Session

    @State private var summary: API.Summary?
    @State private var period = "today"
    @State private var failure: String?
    @State private var cancelling: API.FeedItem?

    private var currency: String { session.tenant?.currency ?? "AMD" }

    private let periods = [("today", "Այսօր"), ("7", "7 օր"), ("30", "30 օր")]

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                picker

                if let failure {
                    // Нули вместо выручки — худшее, что может показать этот
                    // экран: неверные данные выглядят как верные, и владелец
                    // принимает решение по ним. Лучше честно ничего.
                    problem(failure)
                } else {
                    revenue

                    if let series = summary?.series, series.count > 1 {
                        chart(series)
                    }
                    if let split = summary?.split, !split.isEmpty {
                        splitBar(split)
                    }

                    if let feed = summary?.feed, !feed.isEmpty {
                        list(feed)
                    } else if summary != nil {
                        Text("Դեռ տվյալներ չկան")
                            .font(.system(size: 14))
                            .foregroundStyle(Brand.muted)
                            .padding(.vertical, 44)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .screenBackground()
        .task { await reload() }
        .refreshable { await reload() }
        .alert(
            "Չեղարկե՞լ այս գրանցումը",
            isPresented: .init(get: { cancelling != nil }, set: { if !$0 { cancelling = nil } })
        ) {
            Button("Ոչ", role: .cancel) { cancelling = nil }
            Button("Չեղարկել", role: .destructive) {
                if let item = cancelling { Task { await cancel(item) } }
                cancelling = nil
            }
        } message: {
            if let item = cancelling {
                Text("\(item.clientKey ?? "—") · \(money(item.price, currency))")
            }
        }
    }

    private func cancel(_ item: API.FeedItem) async {
        _ = try? await session.authed { token in
            try await APIClient.shared.raw(
                "orders/\(item.id)/cancel",
                method: "POST",
                token: token
            )
        }
        await reload()
    }

    private var picker: some View {
        HStack(spacing: 6) {
            ForEach(periods, id: \.0) { key, label in
                Button(label) {
                    period = key
                    Task { await reload() }
                }
                .font(.system(size: 13, weight: period == key ? .bold : .regular))
                .foregroundStyle(period == key ? .white : Brand.muted)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(
                    period == key ? Brand.grapeFill : .clear,
                    in: Capsule()
                )
            }
            Spacer()
        }
        .padding(.top, 8)
    }

    private var revenue: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Հասույթ")
                .font(.system(size: 11, weight: .bold))
                .tracking(1.2)
                .textCase(.uppercase)
                .foregroundStyle(.white.opacity(0.7))

            Text(money(summary?.stats.revenue ?? 0, currency))
                .font(.system(size: 38, weight: .bold))
                .foregroundStyle(.white)

            Text("\(summary?.stats.count ?? 0) \(session.tenant?.unitOne ?? "") · Միջին չեկ \(money(summary?.stats.avgCheck ?? 0, currency))")
                .font(.system(size: 13))
                .foregroundStyle(.white.opacity(0.75))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(Brand.heroGradient, in: RoundedRectangle(cornerRadius: 20))
    }

    /// Форма дня столбиками.
    ///
    /// У мойки день имеет рельеф — утренний заезд, дневной провал,
    /// вечерний наплыв. Владелец это чувствует, но не видит: список
    /// записей рельеф не показывает, а столбики показывают сразу.
    private func chart(_ series: [API.SeriesPoint]) -> some View {
        let peak = max(1, series.map(\.revenue).max() ?? 1)

        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .bottom, spacing: 3) {
                ForEach(series) { point in
                    VStack(spacing: 4) {
                        RoundedRectangle(cornerRadius: 3)
                            // пик берёт полный цвет: график нужен ради
                            // одного ответа — когда заезд
                            .fill(point.revenue == peak ? Brand.grape : Brand.grape.opacity(0.28))
                            .frame(height: max(2, 90 * CGFloat(point.revenue) / CGFloat(peak)))
                        Text(point.label)
                            .font(.system(size: 9))
                            .monospacedDigit()
                            .foregroundStyle(Brand.muted)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
        }
        .padding(14)
        .glassEffect(.regular, in: .rect(cornerRadius: 16))
    }

    /// Доля наличных одной полосой: владельцу важна не сумма наличных,
    /// а сколько денег проходит мимо кассы.
    private func splitBar(_ split: [API.SplitSegment]) -> some View {
        let total = max(1, split.reduce(0) { $0 + $1.revenue })
        let sorted = split.sorted { $0.revenue > $1.revenue }

        return VStack(alignment: .leading, spacing: 9) {
            GeometryReader { geo in
                HStack(spacing: 3) {
                    ForEach(sorted) { seg in
                        Capsule()
                            .fill(paymentColor(seg.payment))
                            .frame(width: max(2, geo.size.width * CGFloat(seg.revenue) / CGFloat(total)))
                    }
                }
            }
            .frame(height: 9)

            HStack(spacing: 14) {
                ForEach(sorted) { seg in
                    HStack(spacing: 5) {
                        Circle().fill(paymentColor(seg.payment)).frame(width: 7, height: 7)
                        Text("\(paymentLabel(seg.payment)) \(money(seg.revenue, currency))")
                            .font(.system(size: 11.5))
                            .monospacedDigit()
                            .foregroundStyle(Brand.muted)
                    }
                }
                Spacer()
            }
        }
        .padding(14)
        .glassEffect(.regular, in: .rect(cornerRadius: 16))
    }

    private func paymentColor(_ key: String) -> Color {
        switch key {
        case "cash": return Brand.good
        case "card": return Brand.grape
        case "transfer": return Brand.grape.opacity(0.5)
        default: return Brand.muted
        }
    }

    private func list(_ feed: [API.FeedItem]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Հոսք")
                .font(.system(size: 11, weight: .bold))
                .tracking(1.2)
                .textCase(.uppercase)
                .foregroundStyle(Brand.muted)

            ForEach(feed) { item in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.clientKey ?? "—")
                            .font(.system(size: 14.5, weight: .semibold, design: .rounded))
                        Text("\(item.serviceName) · \(item.staffName ?? "—") · \(paymentLabel(item.payment))")
                            .font(.system(size: 11.5))
                            .foregroundStyle(Brand.muted)
                    }
                    Spacer()
                    Text(money(item.price, currency))
                        .font(.system(size: 14.5, weight: .semibold))
                        .monospacedDigit()
                }
                .padding(12)
                .glassEffect(.regular, in: .rect(cornerRadius: 12))
                // Отмена мягкая: запись остаётся в истории и в аудите, но
                // перестаёт попадать в выручку и зарплату. Поэтому и
                // спрашиваем — вернуть её обратно нельзя.
                .contextMenu {
                    Button("Չեղարկել գրանցումը", role: .destructive) {
                        cancelling = item
                    }
                }
            }
        }
    }

    private func problem(_ text: String) -> some View {
        VStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 28))
                .foregroundStyle(Brand.grape)
            Text(text)
                .font(.system(size: 14))
                .multilineTextAlignment(.center)
                .foregroundStyle(Brand.muted)
            Button("Կրկնել") { Task { await reload() } }
                .buttonStyle(.glass)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }

    private func reload() async {
        do {
            summary = try await session.authed { token in
                try await APIClient.shared.send(
                    "summary?period=\(period)",
                    token: token,
                    as: API.Summary.self
                )
            }
            failure = nil
        } catch let error as APIError {
            failure = error.isOffline
                ? "Կապ չկա։"
                : "Սերվերը չպատասխանեց (\(error.status) \(error.code ?? "—"))"
        } catch {
            // разбор ответа: показываем как есть — это баг, а не сбой сети,
            // и прятать его за «попробуйте позже» значит никогда не найти
            failure = "\(error)"
        }
    }
}
