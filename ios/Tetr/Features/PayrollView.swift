import SwiftUI

/// Зарплаты.
///
/// Считается не за период, а с момента последнего расчёта по каждому: на
/// мойке рассчитываются когда придётся — в понедельник, через десять дней,
/// как получится. Тогда двойная выплата невозможна в принципе, а не
/// «если не забыть».
///
/// Сумму приложение не отправляет — только имя сотрудника. Считает сервер,
/// иначе подделанный запрос запишет в историю выплат любую цифру.
struct PayrollView: View {
    @EnvironmentObject private var session: Session

    @State private var payroll: API.Payroll?
    @State private var settling: String?
    @State private var confirming: API.PayrollDue?
    @State private var failure: String?

    private var currency: String { session.tenant?.currency ?? "AMD" }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                if let failure {
                    problem(failure)
                } else if let payroll {
                    if payroll.due.isEmpty {
                        Text("Վճարելու բան չկա")
                            .font(.system(size: 14))
                            .foregroundStyle(Brand.muted)
                            .padding(.vertical, 44)
                    } else {
                        ForEach(payroll.due) { row in
                            dueRow(row)
                        }
                    }

                    if !payroll.payouts.isEmpty {
                        history(payroll.payouts)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .screenBackground()
        .task { await reload() }
        .refreshable { await reload() }
        .alert(
            "Նշե՞լ վճարվածը",
            isPresented: .init(get: { confirming != nil }, set: { if !$0 { confirming = nil } })
        ) {
            Button("Չեղարկել", role: .cancel) { confirming = nil }
            Button("Նշել") {
                if let row = confirming { Task { await settle(row) } }
                confirming = nil
            }
        } message: {
            if let row = confirming {
                Text("\(row.name ?? "—") · \(money(row.earned, currency))")
            }
        }
    }

    private func dueRow(_ row: API.PayrollDue) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(row.name ?? "—")
                        .font(.system(size: 17, weight: .bold))
                    Text("\(row.count) \(session.tenant?.unitOne ?? "") · \(money(row.revenue, currency)) · \(row.percent)%")
                        .font(.system(size: 12.5))
                        .foregroundStyle(Brand.muted)
                }
                Spacer()
                Text(money(row.earned, currency))
                    .font(.system(size: 22, weight: .bold))
                    .monospacedDigit()
            }

            /* Кнопка только когда есть что платить. У владельца процент
               обычно 0, и «отметить выплату» на нуле ничего не сделает:
               сервер вернёт ноль и не запишет ничего. Кнопка, которая не
               работает, хуже её отсутствия — человек жмёт и не понимает,
               сломалось или так задумано. */
            if row.earned > 0 {
                Button(settling == row.staffId ? "…" : "Նշել վճարվածը") {
                    confirming = row
                }
                .buttonStyle(LimeButton())
                .disabled(settling != nil)
            }
        }
        .padding(16)
        .glassEffect(.regular, in: .rect(cornerRadius: 18))
    }

    private func history(_ payouts: [API.Payout]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Վճարումների պատմություն")
                .font(.system(size: 11, weight: .bold))
                .tracking(1.2)
                .textCase(.uppercase)
                .foregroundStyle(Brand.muted)
                .padding(.top, 10)

            ForEach(payouts) { payout in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(payout.staffName ?? "—")
                            .font(.system(size: 14, weight: .semibold))
                        Text(payout.paidAt.formatted(date: .abbreviated, time: .shortened))
                            .font(.system(size: 11.5))
                            .foregroundStyle(Brand.muted)
                    }
                    Spacer()
                    Text(money(payout.amount, currency))
                        .font(.system(size: 14, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(Brand.muted)
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

    private func settle(_ row: API.PayrollDue) async {
        guard let staffId = row.staffId else { return }
        settling = staffId
        defer { settling = nil }

        _ = try? await session.authed { token in
            try await APIClient.shared.raw(
                "payouts",
                method: "POST",
                body: ["staffId": staffId],
                token: token
            )
        }
        await reload()
    }

    private func reload() async {
        do {
            payroll = try await session.authed { token in
                try await APIClient.shared.send("payroll", token: token, as: API.Payroll.self)
            }
            failure = nil
        } catch let error as APIError {
            failure = error.isOffline ? "Կապ չկա։" : "\(error.status) \(error.code ?? "—")"
        } catch {
            failure = "\(error)"
        }
    }
}
