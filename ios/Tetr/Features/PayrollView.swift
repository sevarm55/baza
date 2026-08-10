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
    /// Кого сейчас держат пальцем и насколько заполнилось.
    @State private var holding: String?
    @State private var progress: CGFloat = 0
    /// Когда прошла последняя выплата. См. `press` — этим закрыт «цепной»
    /// повтор на соседнем человеке.
    @State private var locked: Date?
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
                    /* Ставка — та, по которой деньги ПОСЧИТАНЫ, а не та,
                       что стоит у человека сейчас. Стояла текущая, и
                       после любой смены процента три числа в строке
                       переставали перемножаться: «21 մեքենա · 133 500 ֏ ·
                       20%» и рядом 600 ֏. Сумма верная — старые записи
                       хранят свой процент, — но на зарплатах такое
                       читается как обман. */
                    Text("\(row.count) \(session.tenant?.unitOne ?? "") · \(money(row.revenue, currency)) · \(row.rateLabel)")
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

            byDay(row)

            holdToSettle(row)
                .padding(.top, 14)
        }
        .tile(base: tone.base, glow: tone.glow, radius: 24, pad: 16)
        .accessibilityElement(children: .contain)
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
                Divider().overlay(.white.opacity(0.18))
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
                .foregroundStyle(.white.opacity(dim))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
            Spacer(minLength: 4)
            Text(right)
                .fontWeight(.semibold)
                .foregroundStyle(.white.opacity(min(1, dim + 0.15)))
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
    private func holdToSettle(_ row: API.PayrollDue) -> some View {
        let busy = settling == row.staffId
        let active = holding == row.staffId

        return HStack(spacing: 7) {
            Image(systemName: "checkmark")
                .font(.system(size: 12, weight: .bold))
            Text("Պահեք՝ նշելու համար")
                .font(.system(size: 14, weight: .semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .foregroundStyle(.white)
        .loading(busy, tint: .white, size: 18)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background { fill(active: active) }
        .contentShape(.rect(cornerRadius: 14))
        /* `minimumDuration` и длительность заливки — одно и то же число:
           разойдись они, полоса дозаполнялась бы уже после срабатывания
           или срабатывало бы раньше, чем полоса дошла до края. */
        .onLongPressGesture(minimumDuration: hold) {
            /* Платим только тому, кого держали с самого начала. Без этой
               проверки достаточно, чтобы удержание началось само — а оно
               умеет: см. `press`. */
            guard !busy, holding == row.staffId else { return }
            Task { await settle(row) }
        } onPressingChanged: { pressing in
            guard !busy else { return }
            press(row, pressing)
        }
        .disabled(settling != nil)
        /* Удержание недоступно тем, кто ходит по экрану голосом или кому
           тяжело держать палец. Для них остаётся прежний путь — обычное
           действие с вопросом. */
        .accessibilityElement()
        .accessibilityLabel("Նշել վճարվածը")
        .accessibilityValue(money(row.earned, currency))
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { confirming = row }
    }

    /// Сколько держать. Больше секунды — чтобы случайное касание не
    /// доходило до конца; меньше полутора — чтобы намеренное не бесило.
    private var hold: Double { 1.1 }

    /// Заливка наливается только у того, кого держат: `progress` один на
    /// экран, и без проверки полоса ползла бы разом у всех.
    @ViewBuilder
    private func fill(active: Bool) -> some View {
        let shape = RoundedRectangle(cornerRadius: 14)
        let done = active ? progress : 0
        if reduceMotion {
            /* «Уменьшение движения» запрещает движение, а не признак
               работы: вместо ползущей полосы кнопка наливается целиком. */
            shape.fill(.white.opacity(0.18 + 0.24 * done))
        } else {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    shape.fill(.white.opacity(0.18))
                    shape
                        .fill(.white.opacity(0.42))
                        .frame(width: geo.size.width * done)
                }
            }
        }
    }

    /**
     * Начало и конец удержания.
     *
     * Здесь же закрыт самый неприятный способ заплатить дважды. После
     * выплаты строка человека уходит из списка, и следующая **уезжает вверх
     * ровно под палец**. Палец с экрана не снимали — а на новой кнопке уже
     * началось удержание, и через секунду деньги отданы второму человеку,
     * которого никто не выбирал.
     *
     * Поэтому сразу после выплаты удержание не начинается: пока палец не
     * отпустили, новое нажатие не считается нажатием. Запрет снимается сам
     * через секунду — иначе непойманное отпускание оставило бы экран
     * мёртвым до перезахода.
     */
    private func press(_ row: API.PayrollDue, _ pressing: Bool) {
        guard pressing else {
            locked = nil
            holding = nil
            // отпустили раньше времени — полоса возвращается быстро, чтобы
            // отмена читалась отменой, а не подтормаживанием
            withAnimation(.snappy(duration: 0.2)) { progress = 0 }
            return
        }

        if let locked, Date().timeIntervalSince(locked) < 1 { return }

        holding = row.staffId
        // толчок в начале: палец узнаёт, что отсчёт пошёл, раньше глаза
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        withAnimation(.linear(duration: hold)) { progress = 1 }
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

        defer {
            /* Список сейчас перестроится под пальцем, который могли и не
               убрать. До отпускания новых удержаний нет — см. `press`. */
            locked = Date()
            holding = nil
            progress = 0
        }

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
