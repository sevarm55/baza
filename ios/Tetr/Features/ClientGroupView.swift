import SwiftUI

/**
 * Кто именно стоит за числом в шапке.
 *
 * «Մշտական 12» отвечает «сколько», но следующий вопрос всегда «кто». До
 * этого ответить было нечем: приходилось менять порядок списка и считать
 * строки глазами — то есть делать работу, которую продукт уже сделал,
 * когда посчитал это число.
 *
 * Листом поверх списка, а не переходом: закрыл — вернулся на то же
 * место, с тем же набранным поиском. Строка ведёт дальше, в карточку
 * машины, вторым листом — «кто это» и «что он у меня брал» идут подряд.
 */
struct ClientGroupView: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss

    /// Какая группа открыта. `Identifiable`, чтобы лист поднимался
    /// прямо по значению — иначе понадобился бы второй флаг рядом.
    enum Group: String, Identifiable, CaseIterable {
        case all, loyal, lost
        var id: String { rawValue }

        var title: String {
            switch self {
            case .all: return "Բազայում"
            case .loyal: return "Մշտական"
            case .lost: return "Վաղուց չեն եղել"
            }
        }
    }

    let group: Group
    let clients: [API.Client]
    let lostAfter: Int
    let currency: String

    @State private var opened: API.Client?

    private var list: [API.Client] {
        switch group {
        case .all: return clients
        case .loyal: return clients.filter { $0.visits > 1 }
        case .lost: return clients.filter { $0.daysSince > lostAfter }
        }
    }

    /* Порядок свой у каждой группы, и это не мелочь: в «пропавших»
       сверху нужен тот, кто молчит дольше всех, в «постоянных» — кто
       ходит чаще, в «базе» — кто был недавно. Один порядок на три
       списка отвечал бы на вопрос группы только в одном случае из трёх. */
    private var sorted: [API.Client] {
        switch group {
        case .all: return list.sorted { $0.daysSince < $1.daysSince }
        case .loyal: return list.sorted { $0.visits > $1.visits }
        case .lost: return list.sorted { $0.daysSince > $1.daysSince }
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(sorted) { client in
                        Button { opened = client } label: { row(client) }
                            .buttonStyle(.press)
                        if client.id != sorted.last?.id {
                            Rectangle()
                                .fill(Brand.boardInk.opacity(0.07))
                                .frame(height: 1)
                        }
                    }

                    if sorted.isEmpty {
                        Text("Դեռ տվյալներ չկան")
                            .font(.system(size: 14))
                            .foregroundStyle(Brand.boardMuted)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 44)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.top, 6)
                .padding(.bottom, 28)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Brand.board.ignoresSafeArea())
            .navigationTitle(group.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Text("\(sorted.count)")
                        .font(.system(size: 13))
                        .monospacedDigit()
                        .foregroundStyle(Brand.boardMuted)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Փակել") { dismiss() }
                }
            }
        }
        .sheet(item: $opened) { client in
            ClientHistoryView(client: client, currency: currency)
                .environmentObject(session)
        }
    }

    private func row(_ client: API.Client) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 6) {
                    Text(client.key)
                        .font(.system(size: 14.5, weight: .semibold, design: .rounded))
                        .foregroundStyle(Brand.onBoard)
                        .lineLimit(1)

                    if client.visits > 1 {
                        Text("մշտական")
                            .font(.system(size: 10.5, weight: .semibold))
                            .foregroundStyle(Brand.goodOnBoard)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 1.5)
                            .background(Brand.goodOnBoard.opacity(0.16), in: .rect(cornerRadius: 5))
                    }
                }

                Text(visitLine(client))
                    .font(.system(size: 11.5))
                    .monospacedDigit()
                    .foregroundStyle(
                        client.daysSince > lostAfter ? Brand.warnOnBoard : Brand.boardMuted
                    )
            }

            Spacer(minLength: 8)

            Text(money(client.total, currency))
                .font(.system(size: 14, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)

            Image(systemName: "chevron.right")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Brand.boardMuted.opacity(0.6))
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 11)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
    }

    private func visitLine(_ client: API.Client) -> String {
        let visits = "\(client.visits) այց"
        if client.daysSince == 0 { return "\(visits) · վերջինը՝ այսօր" }
        return "\(visits) · վերջինը՝ \(client.daysSince) օր առաջ"
    }
}
