import SwiftUI

/// База клиентов.
///
/// Наверху — те, кто давно не был. Это не сортировка ради сортировки:
/// вернуть старого клиента дешевле, чем привести нового, и список нужен
/// ровно для одного действия — позвонить.
struct ClientsView: View {
    @EnvironmentObject private var session: Session

    /// Через сколько дней молчания клиент считается потерянным.
    /// То же число, что в кабинете: продукт не должен считать по-разному.
    private let lostAfter = 21

    @State private var clients: [API.Client] = []
    @State private var loaded = false

    private var currency: String { session.tenant?.currency ?? "AMD" }
    private var lost: [API.Client] { clients.filter { $0.daysSince > lostAfter } }
    private var rest: [API.Client] { clients.filter { $0.daysSince <= lostAfter } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if !lost.isEmpty {
                    section("Արժե զանգել", lost, warn: true)
                }
                if !rest.isEmpty {
                    section("Բոլորը", rest, warn: false)
                }
                if loaded && clients.isEmpty {
                    Text("Դեռ տվյալներ չկան")
                        .font(.system(size: 14))
                        .foregroundStyle(Brand.muted)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 44)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .background(Brand.bg)
        .task { await reload() }
        .refreshable { await reload() }
    }

    private func section(_ title: String, _ items: [API.Client], warn: Bool) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 11, weight: .bold))
                .tracking(1.2)
                .textCase(.uppercase)
                .foregroundStyle(warn ? Brand.grape : Brand.muted)

            ForEach(items) { client in
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(client.key)
                            .font(.system(size: 15, weight: .semibold, design: .rounded))
                        Text(visitLine(client))
                            .font(.system(size: 11.5))
                            .foregroundStyle(Brand.muted)
                    }
                    Spacer()
                    Text(money(client.total, currency))
                        .font(.system(size: 14, weight: .semibold))
                        .monospacedDigit()
                }
                .padding(13)
                .glassEffect(.regular, in: .rect(cornerRadius: 13))
            }
        }
    }

    private func visitLine(_ client: API.Client) -> String {
        let visits = "\(client.visits) այց"
        if client.daysSince == 0 { return "\(visits) · այսօր" }
        return "\(visits) · \(client.daysSince) օր առաջ"
    }

    private func reload() async {
        let result: API.Clients? = try? await session.authed { token in
            try await APIClient.shared.send("clients", token: token, as: API.Clients.self)
        }
        if let result { clients = result.clients }
        loaded = true
    }
}
