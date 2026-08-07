import SwiftUI

/**
 * Зарплаты — то же табло: показание по оси, плитки, журнал.
 *
 * Наверху стоит число, которого на этом экране не было вовсе: **сколько
 * всего надо раздать сейчас**. Раньше владелец складывал строки в уме — а
 * вопрос, с которым сюда заходят, ровно один: хватит ли в кассе.
 *
 * У каждого работника своя плитка его цветом. Тем же, каким его имя набрано
 * в ленте и кружок на смене: цвет — это имя, и на листе зарплат он
 * превращает стопку одинаковых карточек в список людей.
 *
 * Считается не за период, а с момента последнего расчёта по каждому: на
 * мойке рассчитываются когда придётся — в понедельник, через десять дней,
 * как получится. Тогда двойная выплата невозможна в принципе, а не «если не
 * забыть».
 *
 * Сумму приложение не отправляет — только имя сотрудника. Считает сервер,
 * иначе подделанный запрос запишет в историю выплат любую цифру.
 */
struct PayrollView: View {
    @EnvironmentObject private var session: Session

    @State private var payroll: API.Payroll?
    @State private var settling: String?
    @State private var confirming: API.PayrollDue?
    @State private var failure: String?
    @State private var loading = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var currency: String { session.tenant?.currency ?? "AMD" }

    private let gap: CGFloat = 10

    var body: some View {
        ScrollView {
            VStack(spacing: gap) {
                if let failure {
                    problem(failure)
                } else if let payroll {
                    reading(payroll)

                    ForEach(payroll.due.filter { $0.earned > 0 }) { row in
                        person(row)
                    }

                    if payroll.due.allSatisfy({ $0.earned <= 0 }) {
                        settled
                    }

                    if !payroll.payouts.isEmpty {
                        history(payroll.payouts)
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 28)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.board.ignoresSafeArea())
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

    // ══════════════════════════ показание ══════════════════════════

    /// Сколько всего раздать. Люди с нулём в счёт не идут: у владельца
    /// процент обычно 0, и его строка не должна раздувать итог.
    private func reading(_ p: API.Payroll) -> some View {
        let owed = p.due.filter { $0.earned > 0 }
        let total = owed.reduce(0) { $0 + $1.earned }

        return VStack(spacing: 0) {
            Text(total > 0 ? "Վճարելու է" : "Ամեն ինչ վճարված է")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Brand.onBoard.opacity(0.85))
                .padding(.top, 10)

            Text(money(total, currency))
                .font(.system(size: 54, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)
                .lineLimit(1)
                .minimumScaleFactor(0.42)
                .padding(.top, 2)
                // значение передаётся внутрь: по нему система понимает, в
                // какую сторону крутить разряды
                .contentTransition(.numericText(value: Double(total)))

            if !owed.isEmpty {
                Text("\(owed.count) \(session.tenant?.staffRole ?? "աշխատակցի")")
                    .font(.system(size: 12))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)
                    .padding(.top, 6)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.bottom, 8)
    }

    // ══════════════════════════ человек ══════════════════════════

    /**
     * Плитка человека.
     *
     * Основание расчёта стоит рядом с суммой, а не спрятано: «23 машины,
     * 146 500 ֏ выручки, его 40 %» — это то, чем владелец проверяет цифру,
     * прежде чем отдать деньги. Без основания сумма требует веры.
     *
     * Кнопка есть только когда есть что платить: строки с нулём в список
     * вообще не попадают, а кнопка, которая ничего не делает, хуже её
     * отсутствия — человек жмёт и не понимает, сломалось или так задумано.
     */
    private func person(_ row: API.PayrollDue) -> some View {
        let name = row.name ?? "—"
        let tone = Brand.personTone(name)

        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 12) {
                Text(String(name.prefix(1)))
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 34, height: 34)
                    .background(.white.opacity(0.22), in: .circle)

                VStack(alignment: .leading, spacing: 1) {
                    Text(name)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    Text("\(row.count) \(session.tenant?.unitOne ?? "") · \(money(row.revenue, currency)) · \(row.percent)%")
                        .font(.system(size: 11.5))
                        .monospacedDigit()
                        .foregroundStyle(.white.opacity(0.72))
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                }

                Spacer(minLength: 8)

                Text(money(row.earned, currency))
                    .font(.system(size: 24, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .contentTransition(.numericText(value: Double(row.earned)))
            }

            Button {
                confirming = row
            } label: {
                HStack(spacing: 7) {
                    Image(systemName: "checkmark")
                        .font(.system(size: 12, weight: .bold))
                    Text("Նշել վճարվածը")
                        .font(.system(size: 14, weight: .semibold))
                }
                .foregroundStyle(.white)
                .loading(settling == row.staffId, tint: .white, size: 18)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(.white.opacity(0.18), in: .rect(cornerRadius: 14))
            }
            .buttonStyle(.press)
            .disabled(settling != nil)
            .padding(.top, 14)
        }
        .tile(base: tone.base, glow: tone.glow, radius: 24, pad: 16)
        .accessibilityElement(children: .contain)
    }

    private var settled: some View {
        Text("Վճարելու բան չկա")
            .font(.system(size: 14))
            .foregroundStyle(Brand.boardMuted)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 44)
    }

    // ══════════════════════════ история ══════════════════════════

    /// Что уже выплачено — строками на табло, без карточек.
    ///
    /// История нужна, чтобы ответить «я ему платил на прошлой неделе или
    /// нет», и для этого хватает даты, имени и суммы. Карточка вокруг каждой
    /// строки делала бы прошлое таким же весомым, как долг.
    private func history(_ payouts: [API.Payout]) -> some View {
        VStack(spacing: 0) {
            HStack {
                Text("Վճարումների պատմություն")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Brand.boardMuted)
                Spacer()
                Text("\(payouts.count)")
                    .font(.system(size: 12))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)
            }
            .padding(.horizontal, 6)
            .padding(.top, 16)
            .padding(.bottom, 6)

            ForEach(payouts) { payout in
                let name = payout.staffName ?? "—"
                HStack(spacing: 10) {
                    Circle()
                        .fill(Brand.person(name))
                        .frame(width: 8, height: 8)

                    Text(name)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Brand.onBoard)
                        .lineLimit(1)

                    Text(paidAt(payout.paidAt))
                        .font(.system(size: 11.5))
                        .monospacedDigit()
                        .foregroundStyle(Brand.boardMuted)

                    Spacer(minLength: 8)

                    Text(money(payout.amount, currency))
                        .font(.system(size: 14, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(Brand.onBoard)
                }
                .padding(.horizontal, 6)
                .padding(.vertical, 11)
                .accessibilityElement(children: .combine)

                if payout.id != payouts.last?.id {
                    Rectangle()
                        .fill(Brand.boardInk.opacity(0.07))
                        .frame(height: 1)
                }
            }
        }
    }

    /// Дата выплаты в зоне бизнеса, а не устройства: владелец в поездке
    /// видел вчерашний расчёт сегодняшним.
    private func paidAt(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "hy_AM")
        f.dateFormat = "d MMM, HH:mm"
        if let tz = session.tenant?.timezone, let zone = TimeZone(identifier: tz) {
            f.timeZone = zone
        }
        return f.string(from: date)
    }

    private func problem(_ text: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 26))
                .foregroundStyle(Brand.grape)
            Text(text)
                .font(.system(size: 14))
                .multilineTextAlignment(.center)
                .foregroundStyle(Brand.boardMuted)
            Button("Կրկնել") { Task { await reload() } }
                .buttonStyle(.glass)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 60)
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
        // Деньги отданы из рук в руки — толчок подтверждает, что запись
        // легла, не заставляя вчитываться в изменившийся список.
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        await reload()
    }

    private func reload() async {
        loading = true
        defer { loading = false }
        do {
            let fresh = try await session.authed { token in
                try await APIClient.shared.send("payroll", token: token, as: API.Payroll.self)
            }
            /* Первая загрузка без анимации: прокрутка от нуля к сумме на
               старте читается как индикатор загрузки, а не как смысл. */
            if payroll == nil || reduceMotion {
                payroll = fresh
            } else {
                withAnimation(.snappy(duration: 0.45)) { payroll = fresh }
            }
            failure = nil
        } catch let error as APIError {
            failure = error.isOffline ? "Կապ չկա։" : "\(error.status) \(error.code ?? "—")"
        } catch {
            failure = "\(error)"
        }
    }
}
