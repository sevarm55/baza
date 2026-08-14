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
    @State private var settleFailed = false

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
        /* Запрос не прошёл — об этом надо сказать словами. Молчание здесь
           опаснее всего: человек уже отдал деньги из рук в руки и уверен,
           что запись легла. */
        .alert("Չգրանցվեց", isPresented: $settleFailed) {
            Button("Լավ", role: .cancel) {}
        } message: {
            Text("Վճարումը չպահվեց։ Ստուգեք կապը և կրկնեք։")
        }
    }

    // ══════════════════════════ показание ══════════════════════════

    /// Сколько всего раздать. Люди с нулём в счёт не идут: у владельца
    /// процент обычно 0, и его строка не должна раздувать итог.
    private func reading(_ p: API.Payroll) -> some View {
        let owed = p.due.filter { $0.earned > 0 }
        let total = owed.reduce(0) { $0 + $1.earned }

        return ZStack(alignment: .bottomLeading) {
            /* Не самый тёмный грейп, а фирменный с уходом в глубину.

               `grapeDeep` — почти чёрный фиолетовый: на весь блок он даёт
               тяжёлую плиту, рядом с которой светлый экран выглядит
               провалившимся. Тот же цвет марки, только живой: сверху
               заливка кнопок, снизу на тон глубже — так плита читается
               предметом, а не дырой. */
            LinearGradient(
                colors: [Brand.grapeFill, Brand.grapeMid],
                startPoint: .top,
                endPoint: .bottom
            )

            Image(systemName: "banknote.fill")
                .font(.system(size: 108, weight: .black))
                .foregroundStyle(.white.opacity(0.055))
                .offset(x: 220, y: 30)

            VStack(alignment: .leading, spacing: 5) {
                Text(total > 0 ? "ՎՃԱՐԵԼՈՒ Է" : "ԱՄԵՆ ԻՆՉ ՎՃԱՐՎԱԾ Է")
                    .font(.system(size: 10, weight: .black, design: .rounded))
                    .tracking(1.35)
                    .foregroundStyle(Brand.lime)

                Text(money(total, currency))
                    .font(.system(size: 43, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.42)
                    .contentTransition(.numericText(value: Double(total)))

                if !owed.isEmpty {
                    Text("\(owed.count) հոգու · վերջին վճարումից ի վեր")
                        .font(.system(size: 12))
                        .monospacedDigit()
                        .foregroundStyle(.white.opacity(0.58))
                }
            }
            .padding(18)
        }
        .frame(maxWidth: .infinity, minHeight: 158, alignment: .bottomLeading)
        .clipShape(.rect(cornerRadius: 26))
        .padding(.top, 8)
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
                    .foregroundStyle(tone.base)
                    .frame(width: 38, height: 38)
                    .background(tone.glow.opacity(0.16), in: .rect(cornerRadius: 12))

                VStack(alignment: .leading, spacing: 1) {
                    Text(name)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(Brand.onBoard)
                        .lineLimit(1)
                    Text("կուտակված աշխատավարձ")
                        .font(.system(size: 11.5))
                        .foregroundStyle(Brand.boardMuted)
                }

                Spacer(minLength: 8)

                Text(money(row.earned, currency))
                    .font(.system(size: 24, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Brand.onBoard)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .contentTransition(.numericText(value: Double(row.earned)))
            }

            HStack(spacing: 0) {
                payrollFact("Գրանցում", "\(row.count)")
                payrollDivider
                payrollFact("Հասույթ", money(row.revenue, currency))
                payrollDivider
                payrollFact("Տոկոս", row.rateLabel)
            }
            .padding(.vertical, 10)
            .background(Brand.chipRest, in: .rect(cornerRadius: 15))
            .padding(.top, 13)

            byDay(row)

            settleButton(row)
                .padding(.top, 14)
        }
        .padding(16)
        .background(Brand.boardSurface, in: .rect(cornerRadius: 24))
        .overlay(alignment: .leading) {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(tone.base)
                .frame(width: 4)
                .padding(.vertical, 18)
        }
        .overlay {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .strokeBorder(Brand.boardInk.opacity(0.07), lineWidth: 0.8)
        }
        .accessibilityElement(children: .contain)
    }

    private func payrollFact(_ title: String, _ value: String) -> some View {
        VStack(spacing: 3) {
            Text(value)
                .font(.system(size: 12.5, weight: .bold, design: .rounded))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text(title)
                .font(.system(size: 9.5, weight: .medium))
                .foregroundStyle(Brand.boardMuted)
        }
        .frame(maxWidth: .infinity)
    }

    private var payrollDivider: some View {
        Rectangle()
            .fill(Brand.boardInk.opacity(0.09))
            .frame(width: 1, height: 29)
    }

    /**
     * Разбивка по дням под суммой.
     *
     * Одна растущая сумма не читается: владелец не понимает, за сегодня
     * она, за вчера или за месяц, а деньги, которые нельзя разложить на
     * дни, вызывают ровно тот спор, ради устранения которого продукт и
     * написан. День закрывается полночью в часовом поясе мойки — считает
     * сервер, здесь только показываем.
     *
     * Дни без начисления сложены в одну строку, длинный хвост платных —
     * тоже: у владельца, который сам мыл месяц по нулевой ставке,
     * разбивка выходила в двадцать строк по нулю и хоронила под собой те
     * два дня, за которые он действительно должен.
     */
    @ViewBuilder
    private func byDay(_ row: API.PayrollDue) -> some View {
        let all = row.days ?? []
        if all.count > 1 {
            let paying = all.filter { $0.earned > 0 }
            let idle = all.filter { $0.earned == 0 }
            let shown = Array(paying.prefix(6))
            let rest = Array(paying.dropFirst(6))

            VStack(spacing: 4) {
                Divider().overlay(Brand.boardInk.opacity(0.1))
                    .padding(.bottom, 6)

                ForEach(shown) { d in
                    dayRow(
                        left: "\(short(d.day)) · \(d.count) \(session.tenant?.unitOne ?? "")",
                        right: money(d.earned, currency),
                        dim: 0.72
                    )
                }

                if !rest.isEmpty {
                    dayRow(
                        left: "+ \(rest.count) օր",
                        right: money(rest.reduce(0) { $0 + $1.earned }, currency),
                        dim: 0.72
                    )
                }

                if !idle.isEmpty {
                    dayRow(
                        left: "\(idle.count) օր · \(idle.reduce(0) { $0 + $1.count }) \(session.tenant?.unitOne ?? "")",
                        right: money(0, currency),
                        dim: 0.5
                    )
                }
            }
            .padding(.top, 12)
        }
    }

    private func dayRow(left: String, right: String, dim: Double) -> some View {
        HStack(spacing: 8) {
            Text(left)
                .foregroundStyle(Brand.boardMuted.opacity(dim + 0.2))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
            Spacer(minLength: 4)
            Text(right)
                .fontWeight(.semibold)
                .foregroundStyle(Brand.onBoard.opacity(min(1, dim + 0.18)))
        }
        .font(.system(size: 12))
        .monospacedDigit()
    }

    /// `2026-08-10` → `10.08`. Год не показываем: неоплаченное за год —
    /// не тот случай, ради которого стоит занимать место в строке.
    private func short(_ iso: String) -> String {
        let p = iso.split(separator: "-")
        return p.count == 3 ? "\(p[2]).\(p[1])" : iso
    }

    /**
     * «Отметить выплаченным» — удержанием, а не диалогом.
     *
     * Выплата необратима: она закрывает период по человеку, и следующий
     * расчёт пойдёт от неё. Прежде это защищал вопрос «вы уверены?» —
     * защита, которую жмут не глядя, потому что за день таких вопросов
     * десяток. Хуже того, диалог выскакивал ровно в тот момент, когда одна
     * рука отдаёт деньги, а вторая держит телефон.
     *
     * Удержание работает иначе: подтверждение не отдельный экран, а само
     * действие, растянутое во времени. Палец соскользнул или человек
     * передумал — заливка откатилась, и ничего не случилось. Промахнуться
     * невозможно в принципе, а не «маловероятно».
     *
     * Заливка идёт слева направо по самой кнопке: она не украшение, а
     * единственный ответ на вопрос «сколько ещё держать».
     */
    private func settleButton(_ row: API.PayrollDue) -> some View {
        let busy = settling == row.staffId
        return Button {
            confirming = row
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 15, weight: .semibold))
                Text("Նշել վճարված")
                    .font(.system(size: 14, weight: .bold))
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .bold))
            }
            .foregroundStyle(Brand.onLime)
            .loading(busy, tint: Brand.onLime, size: 18)
            .padding(.horizontal, 15)
            .padding(.vertical, 13)
            .background(Brand.lime, in: .rect(cornerRadius: 14))
            .contentShape(.rect(cornerRadius: 14))
        }
        .buttonStyle(.press)
        .disabled(settling != nil)
        .accessibilityLabel("Նշել վճարվածը")
        .accessibilityValue(money(row.earned, currency))
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

        do {
            _ = try await session.authed { token in
                try await APIClient.shared.raw(
                    "payouts",
                    method: "POST",
                    body: ["staffId": staffId],
                    token: token
                )
            }
        } catch {
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            settleFailed = true
            return
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
        } catch is CancellationError {
            /* Потянули вниз и отпустили, или ушли с экрана. Ничего не
               сломалось — и экран об этом молчит: прежнее содержимое
               остаётся на месте. */
            return
        } catch let error as APIError {
            failure = error.isOffline ? "Կապ չկա։" : "\(error.status) \(error.code ?? "—")"
        } catch {
            failure = "\(error)"
        }
    }
}
