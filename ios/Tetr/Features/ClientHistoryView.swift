import SwiftUI

/**
 * История одной машины.
 *
 * Список клиентов отвечает «кто это и сколько принёс». Следующий вопрос
 * владельца всегда один и тот же: **что именно он у меня брал** — и без
 * ответа строка списка тупик, а сам список превращается в счётчик, по
 * которому ничего нельзя решить.
 *
 * Открывается листом, а не отдельной страницей. Сюда заходят из списка,
 * смотрят и возвращаются в тот же список: переход с уходом всего экрана
 * потерял бы место, на котором человек стоял, и поиск, который он набрал.
 *
 * Отменённых записей здесь нет. Клиент за них не платил, и в его итоге
 * их нет — покажи мы их, сумма в шапке перестала бы сходиться с лентой
 * под ней.
 */
struct ClientHistoryView: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss

    let client: API.Client
    let currency: String

    @State private var orders: [API.ClientOrder] = []
    @State private var loaded = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 10) {
                    reading

                    if !orders.isEmpty {
                        VStack(spacing: 0) {
                            ForEach(orders) { order in
                                row(order)
                                if order.id != orders.last?.id {
                                    Rectangle()
                                        .fill(Brand.boardInk.opacity(0.07))
                                        .frame(height: 1)
                                }
                            }
                        }
                        .padding(.top, 4)
                    }

                    if loaded && orders.isEmpty {
                        Text("Գրանցումներ չկան")
                            .font(.system(size: 14))
                            .foregroundStyle(Brand.boardMuted)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 44)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 28)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Brand.board.ignoresSafeArea())
            .navigationTitle(client.key)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Փակել") { dismiss() }
                }
            }
            .task { await reload() }
        }
    }

    /// Сколько эта машина принесла и как часто приезжает.
    ///
    /// Средний чек здесь считается, а не приходит с сервера: он и есть
    /// частное двух чисел, которые уже на экране, и лишнее поле в ответе
    /// ради деления было бы ещё одним местом, где два счёта могут
    /// разойтись.
    private var reading: some View {
        VStack(spacing: 0) {
            Text("Ընդամենը")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Brand.onBoard.opacity(0.85))
                .padding(.top, 6)

            Text(money(client.total, currency))
                .font(.system(size: 44, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)
                .lineLimit(1)
                .minimumScaleFactor(0.45)

            Text(subtitle)
                .font(.system(size: 12))
                .monospacedDigit()
                .foregroundStyle(Brand.boardMuted)
                .padding(.top, 6)
        }
        .frame(maxWidth: .infinity)
        .padding(.bottom, 6)
    }

    private var subtitle: String {
        let avg = client.visits > 0 ? client.total / client.visits : 0
        let last = client.daysSince == 0 ? "այսօր" : "\(client.daysSince) օր առաջ"
        return "\(client.visits) այց · միջինը \(money(avg, currency)) · վերջինը՝ \(last)"
    }

    private func row(_ order: API.ClientOrder) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 1) {
                Text(order.serviceName)
                    .font(.system(size: 14.5, weight: .semibold))
                    .foregroundStyle(Brand.onBoard)
                    .lineLimit(1)
                Text(line(order))
                    .font(.system(size: 11.5))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            Text(money(order.price, currency))
                .font(.system(size: 14, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 11)
        .accessibilityElement(children: .combine)
    }

    /// «12.08 · Կանխիկ · Դավիթ» — когда, чем платил и кто мыл.
    private func line(_ order: API.ClientOrder) -> String {
        var parts = [day(order.createdAt), paymentWord(order.payment)]
        if let who = order.staffName { parts.append(who) }
        return parts.joined(separator: " · ")
    }

    /// Дата из строки ISO без разбора в `Date`: нужен только день и месяц,
    /// а полный разбор с часовым поясом здесь ничего не добавляет.
    private func day(_ iso: String) -> String {
        let head = iso.prefix(10).split(separator: "-")
        return head.count == 3 ? "\(head[2]).\(head[1])" : String(iso.prefix(10))
    }

    private func paymentWord(_ p: String) -> String {
        switch p {
        case "cash": return "Կանխիկ"
        case "card": return "Քարտ"
        case "pass": return "Աբոնեմենտ"
        default: return "Փոխանցում"
        }
    }

    private func reload() async {
        let escaped = client.key.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? client.key
        let result: API.ClientHistory? = try? await session.authed { token in
            try await APIClient.shared.send("clients/\(escaped)", token: token, as: API.ClientHistory.self)
        }
        if let result { orders = result.orders }
        loaded = true
    }
}
