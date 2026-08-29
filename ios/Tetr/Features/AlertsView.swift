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
    /**
     * Почему поводы не приехали.
     *
     * Раньше отказ глотался, `loaded` вставал в true, и экран уверенно
     * рисовал зелёное «у вас всё в порядке» — при том что он просто
     * ничего не загрузил. Хуже лжи в продукте нет.
     */
    @State private var failure: String?

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

                    if alerts.isEmpty {
                        if let failure {
                            TetrFailure(title: failure, retry: { await reload() })
                        } else if !loaded {
                            Delayed(active: true) {
                                TetrSkeletonList(rows: 3)
                                    .padding(.top, 14)
                                    .padding(.horizontal, 4)
                            }
                        } else {
                            empty
                        }
                    }
                }
                .padding(.horizontal, 12)
                .padding(.top, 6)
                .padding(.bottom, 28)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Brand.board.ignoresSafeArea())
            .navigationTitle(L("alerts.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(L("common.close")) { dismiss() }
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
               подписью под строкой, а не второй кнопкой рядом. Подпись
               тихая, но цель полная: повод замолкает на неделю, и
               случайное касание здесь дороже случайного промаха. */
            Button {
                Task { await snooze(alert.key) }
            } label: {
                Text(L("alerts.later"))
                    .font(.system(size: 12.5))
                    .foregroundStyle(Brand.boardMuted)
                    .frame(minWidth: 44, minHeight: 40, alignment: .leading)
                    .contentShape(.rect)
                    .loading(busy == alert.key, tint: Brand.boardMuted, size: 13)
            }
            .buttonStyle(.plain)
            .busy(busy == alert.key)
            .padding(.leading, 46)
            .padding(.bottom, 4)
        }
    }

    private var empty: some View {
        VStack(spacing: 11) {
            ZStack {
                Circle()
                    .fill(Brand.goodOnBoard.opacity(0.09))
                    .frame(width: 98, height: 98)
                Circle()
                    .strokeBorder(Brand.goodOnBoard.opacity(0.17), lineWidth: 1)
                    .frame(width: 70, height: 70)
                Image(systemName: "checkmark")
                    .font(.system(size: 25, weight: .bold))
                    .foregroundStyle(Brand.goodOnBoard)
            }

            Text(L("alerts.empty"))
                .font(.system(size: 18, weight: .bold, design: .rounded))
                .foregroundStyle(Brand.onBoard)
            Text(L("alerts.emptyNote"))
                .font(.system(size: 13))
                .foregroundStyle(Brand.boardMuted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 24)
        .padding(.vertical, 34)
        .background(Brand.boardSurface, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .strokeBorder(Brand.boardInk.opacity(0.07))
        }
        .padding(.top, 10)
    }

    private func reload() async {
        do {
            let result = try await session.authed { token in
                try await APIClient.shared.send("alerts", token: token, as: API.Alerts.self)
            }
            failure = nil
            alerts = result.alerts
        } catch is CancellationError {
            return
        } catch let error as APIError {
            failure = error.isOffline
                ? L("errors.offline")
                : L("errors.server", "\(error.status) \(error.code ?? "—")")
        } catch {
            failure = Failure.text(error)
        }
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
