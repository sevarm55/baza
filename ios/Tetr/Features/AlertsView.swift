import SwiftUI

/**
 * Что требует внимания.
 *
 * Не лента событий, а список поводов — состояний мойки, каждое из
 * которых требует одного конкретного действия: клиенты, которые давно не
 * были, и зарплата, которая копится неделю. Считает их сервер, той же
 * сборкой, что и кабинет в браузере: два места, считающие поводы
 * по-разному, врут в одном из двух.
 *
 * «Прочитано» здесь нет вовсе. Повод — состояние: «пятеро не были три
 * недели» правда, пока они не приедут, и отмечать её прочитанной значит
 * врать себе. Есть только «Հետո» — повод замолкает на неделю и
 * возвращается, если ничего не изменилось.
 *
 * Строкой, а не карточкой: значок, две строки текста, шеврон — тот же
 * вид, что у списка машин и у людей. Карточка с цветной полосой и парой
 * кнопок читалась бы вставкой из чужого приложения.
 */
struct AlertsView: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss

    /// Куда ведёт повод. Экран выбирает приложение, а не сервер: у него
    /// свои разделы, и адрес страницы браузера здесь не при чём.
    let onOpen: (String) -> Void

    @State private var alerts: [API.Alert] = []
    @State private var loaded = false
    @State private var busy: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(alerts) { alert in
                        row(alert)
                        if alert.id != alerts.last?.id {
                            Rectangle()
                                .fill(Brand.boardInk.opacity(0.07))
                                .frame(height: 1)
                        }
                    }

                    if loaded && alerts.isEmpty { empty }
                }
                .padding(.horizontal, 12)
                .padding(.top, 6)
                .padding(.bottom, 28)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Brand.board.ignoresSafeArea())
            .navigationTitle("Ուշադրություն")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Փակել") { dismiss() }
                }
            }
            .task { await reload() }
        }
    }

    private func row(_ alert: API.Alert) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Button {
                onOpen(alert.key)
                dismiss()
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: alert.key == "payroll-due" ? "wallet.bifold.fill" : "clock.fill")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(alert.tone == "warn" ? Brand.warnOnBoard : Brand.grape)
                        .frame(width: 34, height: 34)
                        .background(
                            (alert.tone == "warn" ? Brand.warnOnBoard : Brand.grape).opacity(0.14),
                            in: .rect(cornerRadius: 10)
                        )

                    VStack(alignment: .leading, spacing: 1) {
                        Text(alert.title)
                            .font(.system(size: 14.5, weight: .semibold))
                            .foregroundStyle(Brand.onBoard)
                            .multilineTextAlignment(.leading)
                        Text(alert.note)
                            .font(.system(size: 12.5))
                            .foregroundStyle(Brand.boardMuted)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    Spacer(minLength: 8)

                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Brand.boardMuted.opacity(0.6))
                }
                .padding(.vertical, 11)
                .contentShape(.rect)
            }
            .buttonStyle(.press)

            /* «Отложить» — отказ, а не равноправный выбор: тихой
               подписью под строкой, а не второй кнопкой рядом. */
            Button {
                Task { await snooze(alert.key) }
            } label: {
                Text("Հետո")
                    .font(.system(size: 12.5))
                    .foregroundStyle(Brand.boardMuted)
            }
            .buttonStyle(.plain)
            .disabled(busy == alert.key)
            .padding(.leading, 46)
            .padding(.bottom, 10)
        }
    }

    private var empty: some View {
        VStack(spacing: 6) {
            Text("Ամեն ինչ կարգին է")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Brand.onBoard)
            Text("Անելիք չկա։ Երբ որևէ բան պահանջի ուշադրություն, կհայտնվի այստեղ։")
                .font(.system(size: 13))
                .foregroundStyle(Brand.boardMuted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 24)
        .padding(.vertical, 48)
    }

    private func reload() async {
        let result: API.Alerts? = try? await session.authed { token in
            try await APIClient.shared.send("alerts", token: token, as: API.Alerts.self)
        }
        if let result { alerts = result.alerts }
        loaded = true
    }

    private func snooze(_ key: String) async {
        busy = key
        let result: API.Alerts? = try? await session.authed { token in
            try await APIClient.shared.send(
                "alerts",
                method: "POST",
                body: ["key": key],
                token: token,
                as: API.Alerts.self
            )
        }
        if let result { alerts = result.alerts }
        busy = nil
    }
}
