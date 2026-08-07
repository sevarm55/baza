import SwiftUI

/**
 * База клиентов.
 *
 * Наверху — те, кто давно не был. Это не сортировка ради сортировки:
 * вернуть старого клиента дешевле, чем привести нового, и список нужен
 * ровно для одного действия — позвонить.
 *
 * Показание наверху отвечает на вопрос, ради которого сюда заходят: сколько
 * людей пропало. Раньше это число нигде не стояло, и «стоит ли звонить»
 * приходилось решать, пересчитывая строки глазами.
 */
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
            VStack(spacing: 10) {
                if loaded { reading }

                if !lost.isEmpty {
                    group("Արժե զանգել", lost, lostOnes: true)
                }
                if !rest.isEmpty {
                    group("Բոլորը", rest, lostOnes: false)
                }
                if loaded && clients.isEmpty {
                    Text("Դեռ տվյալներ չկան")
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
        .task { await reload() }
        .refreshable { await reload() }
    }

    /// Сколько всего клиентов и сколько из них пропало.
    private var reading: some View {
        VStack(spacing: 0) {
            Text("Հաճախորդ")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Brand.onBoard.opacity(0.85))
                .padding(.top, 6)

            Text("\(clients.count)")
                .font(.system(size: 50, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)
                .contentTransition(.numericText(value: Double(clients.count)))

            if !lost.isEmpty {
                Text("\(lost.count) չի եղել \(lostAfter) օրից ավել")
                    .font(.system(size: 12))
                    .monospacedDigit()
                    .foregroundStyle(Brand.warnOnBoard)
                    .padding(.top, 6)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.bottom, 4)
    }

    /**
     * Группа клиентов.
     *
     * Потерянные — на янтарной плитке, остальные строками на табло. Разный
     * носитель, а не разный заголовок: список из двух одинаковых секций
     * читается одним списком, и «кому позвонить» тонет в «всех».
     */
    private func group(_ title: String, _ items: [API.Client], lostOnes: Bool) -> some View {
        VStack(spacing: lostOnes ? 8 : 0) {
            HStack {
                Text(title)
                    .font(.system(size: 14.5, weight: .semibold))
                    .foregroundStyle(lostOnes ? Brand.warnOnBoard : Brand.boardMuted)
                Spacer()
                Text("\(items.count)")
                    .font(.system(size: 12))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)
            }
            .padding(.horizontal, 6)
            .padding(.top, 14)
            .padding(.bottom, 6)

            ForEach(items) { client in
                if lostOnes {
                    row(client, tone: .amber)
                } else {
                    plainRow(client)
                    if client.id != items.last?.id {
                        Rectangle()
                            .fill(Brand.boardInk.opacity(0.07))
                            .frame(height: 1)
                    }
                }
            }
        }
    }

    private func row(_ client: API.Client, tone: Tone) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(client.key)
                    .font(.system(size: 16, weight: .bold, design: .rounded))
                    .foregroundStyle(tone.ink)
                    .lineLimit(1)
                Text(visitLine(client))
                    .font(.system(size: 11.5))
                    .monospacedDigit()
                    .foregroundStyle(tone.ink.opacity(0.72))
            }
            Spacer(minLength: 8)
            Text(money(client.total, currency))
                .font(.system(size: 17, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(tone.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .tile(tone, radius: 20, pad: 14)
        .accessibilityElement(children: .combine)
    }

    private func plainRow(_ client: API.Client) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 1) {
                Text(client.key)
                    .font(.system(size: 14.5, weight: .semibold, design: .rounded))
                    .foregroundStyle(Brand.onBoard)
                    .lineLimit(1)
                Text(visitLine(client))
                    .font(.system(size: 11.5))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)
            }
            Spacer(minLength: 8)
            Text(money(client.total, currency))
                .font(.system(size: 14, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 11)
        .accessibilityElement(children: .combine)
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
