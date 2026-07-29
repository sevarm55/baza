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
        .background(Brand.bg)
        .task { await reload() }
        .refreshable { await reload() }
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
                    period == key ? Brand.grape : .clear,
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
