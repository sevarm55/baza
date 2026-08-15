import SwiftUI

/**
 * Смена мойщика — то же табло, что у владельца.
 *
 * Показание по оси экрана, сетка плиток, журнал строками. Экран открывают
 * сорок раз за смену мокрыми руками, поэтому три вещи, ради которых его
 * открывают, не уезжают за край никогда: переключатель смены закреплён
 * сверху, кнопка записи — снизу, заработок стоит между ними.
 *
 * Графика хода смены по часам здесь нет намеренно. На своей смене человек
 * и так знает, как шёл день; линия отвечала на вопрос, которого у него не
 * возникает, и занимала место между заработком и плитками. Разбор по часам
 * живёт там, где его действительно спрашивают, — в кабинете владельца.
 */
struct ShiftView: View {
    @EnvironmentObject private var session: Session
    @EnvironmentObject private var queue: OrderQueue

    @State private var shift: API.Shift?
    /// Держим отдельно от `shift`: переключатель должен отзываться сразу,
    /// а не ждать, пока с сервера приедет вся смена целиком.
    @State private var onShift = false
    /// Открыт лист сдачи наличных.
    @State private var handingOver = false
    @State private var recording = false
    @State private var loading = false
    @State private var newestOrderID: String?
    /// Номер обновления. Экран открывается и сразу тянут вниз — два
    /// обновления идут одновременно, и то, что стартовало раньше, может
    /// ответить позже. Без этого счётчика старый ответ затирает свежий, и
    /// только что записанная машина исчезает с экрана, хотя на сервере она
    /// есть. Ровно так это и выглядело.
    @State private var loadID = 0
    /// Запись, которую собираются отменить. Пусто — вопроса нет.
    @State private var revoking: API.ShiftOrder?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var currency: String { session.tenant?.currency ?? "AMD" }

    private let gap: CGFloat = 10

    var body: some View {
        ScrollView {
            VStack(spacing: gap) {
                reading

                if !queue.waiting(at: session.tenant?.id).isEmpty { pending }
                ForEach(queue.rejected(at: session.tenant?.id)) { item in stuck(item) }

                grid

                if let shift, !shift.orders.isEmpty {
                    journal(shift.orders)
                } else if !loading {
                    empty
                }
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 28)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.board.ignoresSafeArea())
        // Встать на смену — первое действие дня, и оно не должно уезжать за
        // край при прокрутке.
        .safeAreaInset(edge: .top) { toggleBar }
        .safeAreaInset(edge: .bottom) { recordButton }
        .sheet(isPresented: $handingOver) {
            HandoverView(
                expected: shift?.cashSoFar ?? 0,
                count: shift?.count ?? 0,
                revenue: shift?.revenue ?? 0,
                earned: shift?.earned ?? 0,
                takesShare: takesShare
            ) { cash in
                Task { await leaveShift(cash: cash) }
            }
        }
        .fullScreenCover(isPresented: $recording) {
            OrderFlowView { await reload() }
        }
        /* Отмена спрашивает и называет машину. Запись при этом не
           удаляется — она остаётся в истории и в аудите, — но перестаёт
           попадать в выручку и в заработок, и заработок за день
           пересчитается на глазах. Поэтому и слово «отменить», а не
           «удалить»: то же самое видит владелец. */
        .confirmationDialog(
            "Չեղարկե՞լ այս գրանցումը",
            isPresented: .init(get: { revoking != nil }, set: { if !$0 { revoking = nil } }),
            titleVisibility: .visible,
            presenting: revoking
        ) { order in
            Button("Չեղարկել գրանցումը", role: .destructive) {
                Task { await revoke(order) }
            }
            Button("Թողնել", role: .cancel) {}
        } message: { order in
            Text("\(order.clientKey ?? order.serviceName) · \(order.serviceName) · \(money(order.price, currency))\nՉեղարկելուց հետո այսօրվա վաստակը կվերահաշվարկվի։")
        }
        .task { await reload() }
        .refreshable { await reload() }
    }

    /// У владельца процент обычно 0 — он не берёт долю со своей работы.
    /// Показывать ему «твой заработок: 0 ֏» самым крупным числом на экране
    /// значит показывать пустоту: цифра верная, но смысла в ней никакого.
    /// Ему важна выручка смены, и она и становится главной.
    private var takesShare: Bool { (shift?.percent ?? 0) > 0 }

    // ══════════════════════════ переключатель ══════════════════════════

    /**
     * «Я на смене».
     *
     * Владельцу он показывает, кто на мойке, ещё до того как появится первая
     * запись: человека, который вышел час назад и пока ничего не намыл, по
     * записям не видно вовсе.
     *
     * Состояние меняем сразу, не дожидаясь сервера: связь на мойке
     * пропадает, а переключатель, который «думает» секунду, жмут второй раз.
     * Не прошло — вернём обратно на следующем обновлении.
     */
    private var toggleBar: some View {
        Toggle(isOn: Binding(
            get: { onShift },
            set: { want in Task { await setOnShift(want) } }
        )) {
            HStack(spacing: 8) {
                // точка никогда не единственный носитель смысла: рядом с ней
                // всегда слово
                Circle()
                    .fill(onShift ? Brand.goodOnBoard : Brand.boardMuted.opacity(0.5))
                    .frame(width: 8, height: 8)
                Text(onShift ? "Հերթափոխին եմ" : "Հերթափոխից դուրս")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Brand.onBoard)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
        }
        .tint(Brand.good)
        .padding(.leading, 16)
        .padding(.trailing, 12)
        .padding(.vertical, 9)
        .background(Brand.boardInk.opacity(0.07), in: .capsule)
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
        .background(Brand.board.ignoresSafeArea(edges: .top))
    }

    private func setOnShift(_ want: Bool) async {
        /* Уходя со смены — спрашиваем про наличные. Это единственный момент,
           когда деньги переходят из рук в руки, и другого места спросить не
           будет. Встаём молча: на входе спрашивать нечего. */
        if !want {
            handingOver = true
            return
        }

        let previous = onShift
        onShift = true

        let done: API.ShiftState? = try? await session.authed { token in
            try await APIClient.shared.send(
                "shift", method: "POST", body: ["open": true], token: token,
                as: API.ShiftState.self
            )
        }
        // не прошло — честно откатываемся, а не делаем вид, что встали
        onShift = done?.onShift ?? previous
        if onShift {
            if let openedAt = done?.openedAt, let tenant = session.tenant {
                await ShiftLiveActivity.shared.start(
                    openedAt: openedAt,
                    tenant: tenant,
                    worker: session.me
                )
            }
            await reload()
        }
    }

    private func leaveShift(cash: Int?) async {
        onShift = false

        var payload: [String: Any] = ["open": false]
        if let cash { payload["cash"] = cash }

        let done: API.ShiftState? = try? await session.authed { token in
            try await APIClient.shared.send(
                "shift", method: "POST", body: payload, token: token,
                as: API.ShiftState.self
            )
        }
        if done == nil {
            onShift = true
        } else if done?.onShift == false, let tenantID = session.tenant?.id {
            // Закрытие уже подтверждено. Не ждём повторный GET: если связь
            // исчезнет после POST, остров всё равно обязан пропасть.
            await ShiftLiveActivity.shared.end(for: tenantID)
        }
        await reload()
    }

    // ══════════════════════════ показание ══════════════════════════

    /// Приветствие по времени суток.
    ///
    /// Единственное место, где продукт обращается к человеку по имени.
    /// Стоит десять строк, а экран перестаёт быть казённым — мойщик
    /// открывает его сорок раз за смену, и каждый раз его встречала таблица.
    private var greeting: String {
        session.me.map { "\(hello), \($0.name)" } ?? hello
    }

    private var hello: String {
        switch Calendar.current.component(.hour, from: Date()) {
        case 5..<12: return "Բարի լույս"
        case 12..<18: return "Բարի օր"
        case 18..<24: return "Բարի երեկո"
        // ночью «доброй ночи» звучит прощанием, поэтому нейтральное
        default: return "Բարև"
        }
    }

    private var reading: some View {
        let value = takesShare ? (shift?.earned ?? 0) : (shift?.revenue ?? 0)
        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                Text(greeting)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Brand.boardMuted)
                    .lineLimit(1)

                Spacer()
            }

            Text(takesShare ? "Քո վաստակն այսօր" : "Հերթափոխի հասույթ")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Brand.boardMuted)
                .padding(.top, 14)

            Text(money(value, currency))
                .font(.system(size: 46, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)
                .lineLimit(1)
                .minimumScaleFactor(0.42)
                .contentTransition(.numericText(value: Double(value)))

            /* Состояние смены — строкой под цифрой, а не значком «ԲԱՑ Է» в
               углу. Значок отвечал только «да или нет», а спрашивают на
               этом экране другое: с которого часа и сколько уже. Три
               состояния вместо двух: «ещё не вставал» и «отработал и
               закрылся» — это утро и вечер одного дня, и человек,
               закрывший смену, не должен читать про себя то же, что
               читал до её начала. */
            shiftLine
                .padding(.top, 10)
        }
        .padding(17)
        .frame(maxWidth: .infinity, minHeight: 154, alignment: .leading)
        .background(Brand.boardSurface, in: .rect(cornerRadius: 25))
        .overlay {
            RoundedRectangle(cornerRadius: 25, style: .continuous)
                .strokeBorder(Brand.boardInk.opacity(0.07), lineWidth: 0.8)
        }
    }

    /**
     * «Я на смене · с 08:40 · 7 ч 15 мин».
     *
     * Точка залита, когда смена идёт, и пустая, когда нет: одного цвета
     * мало — приглушённый серый и зелёный на солнце различаются хуже, чем
     * кольцо и пятно. Тот же знак и в вебе, и в списке людей у владельца.
     *
     * Длительность тикает от `TimelineView`, а не от таймера в состоянии:
     * экран открыт часами, и число обязано расти само, но будить всю
     * страницу ради минутной стрелки незачем.
     */
    private var shiftLine: some View {
        HStack(spacing: 7) {
            Circle()
                .strokeBorder(onShift ? Color.clear : Brand.boardMuted, lineWidth: 1.5)
                .background(Circle().fill(onShift ? Brand.goodOnBoard : Color.clear))
                .frame(width: 7, height: 7)

            if onShift, let openedAt = shift?.openedAt {
                TimelineView(.periodic(from: .now, by: 30)) { _ in
                    Text("Հերթափոխին եմ · \(at(openedAt))-ից · \(lasted(since: openedAt))")
                        .font(.system(size: 13, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(Brand.goodOnBoard)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                }
            } else if let done = shift?.closedToday {
                Text("Հերթափոխն ավարտված է · \(at(done.openedAt)) — \(at(done.closedAt))")
                    .font(.system(size: 13, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            } else {
                Text(onShift ? "Հերթափոխին եմ" : "Հերթափոխը դեռ չի սկսվել")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(onShift ? Brand.goodOnBoard : Brand.boardMuted)
                    .lineLimit(1)
            }

            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }

    /// «7 ժ 15 ր». Часы отбрасываются, когда их нет, — как в вебе.
    private func lasted(since: Date) -> String {
        let minutes = max(0, Int(Date().timeIntervalSince(since) / 60))
        return minutes < 60 ? "\(minutes) ր" : "\(minutes / 60) ժ \(minutes % 60) ր"
    }

    // ══════════════════════════ сетка плиток ══════════════════════════

    /**
     * Плитки смены. Ни одна не повторяет цифру наверху.
     *
     * Когда мойщик берёт процент, наверху стоит его заработок — значит
     * широкая плитка показывает выручку смены и кольцом его долю в ней.
     * Когда процента нет (владелец моет сам), наверху уже стоит выручка, и
     * широкой становится другая: наличные на руках.
     *
     * Наличные — та цифра, ради которой экран открывают во второй раз за
     * смену: столько с него спросят при закрытии, и лучше увидеть её
     * заранее, чем узнать в момент сдачи.
     */
    private var grid: some View {
        let count = shift?.count ?? 0
        let cash = shift?.cashSoFar ?? 0
        let revenue = shift?.revenue ?? 0
        let percent = shift?.percent ?? 0

        return HStack(spacing: gap) {
            /* Подпись называет, ЧЬИ это деньги. «Выручка смены» стояло и
               здесь, и в кабинете владельца, а рядом — заработок мойщика:
               два похожих числа, и какое из них твоё, приходилось решать.
               Теперь это «сумма работ», и доля названа долей. Те же слова
               в вебе. */
            shiftPrimary(
                title: takesShare ? "Աշխատանքի գումարը" : "Կանխիկ ձեռքին",
                value: money(takesShare ? revenue : cash, currency),
                note: takesShare ? "քո բաժինը՝ \(percent)%" : "հանձնելու է վերջում",
                background: Brand.lavenderCard,
                ink: Brand.lavenderInk,
                animate: Double(takesShare ? revenue : cash)
            )

            VStack(spacing: gap) {
                shiftSmall(
                    title: session.tenant?.unitOne ?? "Գրանցում",
                    value: "\(count)",
                    background: Brand.mintCard,
                    ink: Brand.mintInk,
                    animate: Double(count)
                )
                shiftSmall(
                    title: takesShare ? "Կանխիկ" : "Միջին չեկ",
                    value: takesShare
                        ? money(cash, currency)
                        : money(count > 0 ? revenue / count : 0, currency),
                    background: Brand.sandCard,
                    ink: Brand.sandInk,
                    animate: Double(takesShare ? cash : (count > 0 ? revenue / count : 0))
                )
            }
        }
    }

    private func shiftPrimary(
        title: String,
        value: String,
        note: String,
        background: Color,
        ink: Color,
        animate: Double
    ) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Image(systemName: "wallet.bifold.fill")
                .font(.system(size: 15, weight: .semibold))
                .frame(width: 34, height: 34)
                .background(ink.opacity(0.1), in: .rect(cornerRadius: 11))
            Spacer()
            Text(title)
                .font(.system(size: 11.5, weight: .medium))
            Text(value)
                .font(.system(size: 24, weight: .bold, design: .rounded))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .contentTransition(.numericText(value: animate))
            Text(note)
                .font(.system(size: 10.5))
                .opacity(0.68)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .foregroundStyle(ink)
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 176, alignment: .leading)
        .background(background, in: .rect(cornerRadius: 22))
    }

    private func shiftSmall(
        title: String,
        value: String,
        background: Color,
        ink: Color,
        animate: Double
    ) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.system(size: 11.5))
                .foregroundStyle(ink.opacity(0.72))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Spacer(minLength: 6)
            Text(value)
                .font(.system(size: 18, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(ink)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .contentTransition(.numericText(value: animate))
        }
        .padding(12)
        .frame(maxWidth: .infinity, minHeight: 83, alignment: .topLeading)
        .background(background, in: .rect(cornerRadius: 19))
        .accessibilityElement(children: .combine)
    }

    // ══════════════════════════ очередь ══════════════════════════

    /// Несинхронизированное показываем честно, но не тревожно: запись
    /// сделана и не пропадёт, просто ещё не ушла.
    private var pending: some View {
        HStack(spacing: 10) {
            Image(systemName: loading ? "arrow.triangle.2.circlepath" : "wifi.exclamationmark")
                .font(.system(size: 13))
                .foregroundStyle(Brand.boardMuted)
                .contentTransition(.symbolEffect(.replace.magic(fallback: .downUp)))
                .symbolEffect(.drawOn, options: .nonRepeating, isActive: loading && !reduceMotion)
            Text("\(queue.waiting(at: session.tenant?.id).count) գրանցում սպասում է կապի")
                .font(.system(size: 13))
                .foregroundStyle(Brand.boardMuted)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 18))
    }

    /// Запись, которую сервер не принял.
    ///
    /// Показывается как есть, с номером машины и причиной: молча выбросить
    /// работу человека нельзя, а решить, повторить её или отменить, может
    /// только он сам.
    private func stuck(_ item: OrderQueue.Item) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 13))
                    .foregroundStyle(Brand.warnOnBoard)
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.clientKey)
                        .font(.system(size: 14, weight: .semibold, design: .rounded))
                        .foregroundStyle(Brand.onBoard)
                    Text("\(item.serviceName) · \(item.failure ?? "")")
                        .font(.system(size: 11.5))
                        .foregroundStyle(Brand.boardMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }

            HStack(spacing: 8) {
                Button("Կրկնել") { queue.retry(item.ref) }
                    .buttonStyle(.glass)
                Button("Հեռացնել") { queue.drop(item.ref) }
                    .buttonStyle(.glass)
                    .tint(Brand.muted)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 18))
    }

    // ══════════════════════════ журнал ══════════════════════════

    private func journal(_ orders: [API.ShiftOrder]) -> some View {
        VStack(spacing: 0) {
            HStack {
                Text("Վերջինները")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Brand.boardMuted)
                Spacer()
                Text("\(orders.count)")
                    .font(.system(size: 12))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)
            }
            .padding(.horizontal, 6)
            .padding(.top, 14)
            .padding(.bottom, 6)

            /* Номер машины крупно, услуга и оплата под ним.
               Из сорока записей за смену «Комплекс» встречается двадцать
               раз, а номер один: искать свою ошибку по названию услуги —
               это читать список целиком. Так же в вебе. */
            ForEach(orders) { order in
                VStack(spacing: 0) {
                    HStack(spacing: 10) {
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 6) {
                                Text(order.clientKey ?? order.serviceName)
                                    .font(.system(size: 14.5, weight: .semibold, design: .rounded))
                                    .monospacedDigit()
                                    .foregroundStyle(Brand.onBoard)
                                    .lineLimit(1)

                                Image(systemName: newestOrderID == order.id ? "checkmark" : paymentSymbol(order.payment))
                                    .font(.system(size: 10.5, weight: newestOrderID == order.id ? .bold : .regular))
                                    .foregroundStyle(newestOrderID == order.id ? Brand.goodOnBoard : Brand.boardMuted)
                                    .contentTransition(.symbolEffect(.replace.magic(fallback: .downUp)))
                                    .symbolEffect(
                                        .drawOn,
                                        options: .nonRepeating,
                                        isActive: newestOrderID == order.id && !reduceMotion
                                    )
                                    .accessibilityLabel(paymentLabel(order.payment))
                            }

                            Text(
                                order.clientKey == nil
                                    ? "\(paymentLabel(order.payment)) · \(at(order.createdAt))"
                                    : "\(order.serviceName) · \(paymentLabel(order.payment)) · \(at(order.createdAt))"
                            )
                            .font(.system(size: 12))
                            .monospacedDigit()
                            .foregroundStyle(Brand.boardMuted)
                            .lineLimit(1)
                        }

                        Spacer(minLength: 8)

                        Text(money(order.price, currency))
                            .font(.system(size: 14, weight: .semibold))
                            .monospacedDigit()
                            .foregroundStyle(Brand.onBoard)

                        /* Отмена ошибочной записи — здесь же, а не «позвони
                           владельцу». Три точки молчат: из сорока записей
                           отменяют одну, и заметным элементом строки это
                           действие быть не должно. */
                        Button {
                            revoking = order
                        } label: {
                            Image(systemName: "ellipsis")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(Brand.boardMuted)
                                .frame(width: 30, height: 30)
                                .contentShape(.rect)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Գործողություններ՝ \(order.clientKey ?? order.serviceName)")
                    }
                    .padding(.horizontal, 6)
                    .padding(.vertical, 9)
                    .background(
                        newestOrderID == order.id ? Brand.lime.opacity(0.1) : Color.clear,
                        in: .rect(cornerRadius: 12)
                    )

                    if order.id != orders.last?.id {
                        Rectangle()
                            .fill(Brand.boardInk.opacity(0.07))
                            .frame(height: 1)
                    }
                }
                .transition(
                    reduceMotion
                        ? .opacity
                        : .move(edge: .top).combined(with: .opacity)
                )
            }
        }
    }

    /* Пусто до смены и пусто на смене — разные ответы. Первый говорит,
       что делать; второй — что всё в порядке и первая машина просто ещё
       не приехала. Одна строка «смена не начата» на открытой смене
       читалась поломкой. */
    private var empty: some View {
        VStack(spacing: 6) {
            Text(onShift ? "Հերթափոխը սկսված է" : "Հերթափոխը դեռ չի սկսվել")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Brand.onBoard)
            Text(onShift
                ? "Առաջին գրանցումն այստեղ կհայտնվի։"
                : "Սկսեք հերթափոխը, որպեսզի գրանցեք աշխատանքը։")
                .font(.system(size: 13))
                .foregroundStyle(Brand.boardMuted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
        .padding(.horizontal, 20)
    }

    /**
     * Отменить запись.
     *
     * Сервер решает, чью запись можно отменить: мойщику — только свою.
     * После ответа перечитываем смену целиком, а не правим список на
     * месте: заработок, счётчик и сумма работ обязаны сойтись с сервером,
     * а не с нашим представлением о нём.
     */
    private func revoke(_ order: API.ShiftOrder) async {
        revoking = nil
        let done: Bool = (try? await session.authed { token in
            try await APIClient.shared.raw("orders/\(order.id)/cancel", method: "POST", token: token)
        }) != nil
        if done { UINotificationFeedbackGenerator().notificationOccurred(.success) }
        await reload()
    }

    // ══════════════════════════ кнопка ══════════════════════════

    /* Вне смены записывать нельзя, и кнопка это показывает собой, а не
       окошком с отказом. Причина не в дисциплине: машина, записанная вне
       смены, не попадает в сдачу наличных при закрытии — деньги за неё
       работник уносит, ничего не нарушив, а владелец недосчитывается и не
       понимает почему. */
    private var recordButton: some View {
        VStack(spacing: 8) {
            if !onShift {
                Text("Գրանցելու համար միացրեք հերթափոխը")
                    .font(.system(size: 12.5))
                    .foregroundStyle(Brand.boardMuted)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Button("+ \(session.tenant?.unitOne ?? "")") {
                recording = true
            }
            .accessibilityIdentifier("shift.record")
            .buttonStyle(LimeButton())
            .disabled(!onShift)
            .opacity(onShift ? 1 : 0.45)
        }
        .padding(.horizontal, 12)
        .padding(.top, 18)
        .padding(.bottom, 8)
        /**
         * Подложка цветом самого полотна, а не материалом.
         *
         * Без подложки полоса была прозрачной, и журнал проезжал сквозь
         * неё: строка «Կանխիկ · 13:27» ложилась ровно на подпись под
         * кнопкой, и две разные мысли читались одной. `safeAreaInset`
         * отводит под полосу место в конце прокрутки, но не мешает
         * содержимому проходить под ней по дороге.
         *
         * Материал здесь однажды стоял и был убран правильно: он серый, и
         * на тёмной теме читался отдельной плитой от кнопки до самого низа.
         * `Brand.board` — тот же цвет, что у полотна, поэтому плиты не
         * возникает вовсе: видно только, что список кончился.
         *
         * Сверху короткий градиент: список должен уходить под кнопку, а не
         * обрываться под ней ножом.
         */
        .background {
            VStack(spacing: 0) {
                LinearGradient(
                    colors: [Brand.board.opacity(0), Brand.board],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(height: 20)

                Brand.board
            }
            .ignoresSafeArea(edges: .bottom)
        }
        .animation(reduceMotion ? nil : .snappy(duration: 0.25), value: onShift)
    }

    /// Время в зоне бизнеса, а не устройства: владелец в поездке видел
    /// смену, начатую в шесть утра.
    private func at(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "hy_AM")
        f.dateFormat = "HH:mm"
        if let tz = session.tenant?.timezone, let zone = TimeZone(identifier: tz) {
            f.timeZone = zone
        }
        return f.string(from: date)
    }

    private func reload() async {
        loadID += 1
        let id = loadID
        loading = true
        defer { loading = false }

        // сначала досылаем накопленное: иначе смена покажет вчерашние цифры,
        // хотя записи уже сделаны
        await queue.flush(using: session)

        let fresh = try? await session.authed { token in
            try await APIClient.shared.send("shift", token: token, as: API.Shift.self)
        }

        // применяем только если за это время не начали новое обновление
        guard id == loadID else { return }

        if let fresh {
            let oldIDs = Set(shift?.orders.map(\.id) ?? [])
            let inserted = shift == nil ? nil : fresh.orders.first { !oldIDs.contains($0.id) }

            /* Первая загрузка без анимации: прокрутка от нуля к сумме на старте
               читается как индикатор загрузки, а не как смысл. */
            if shift == nil || reduceMotion {
                shift = fresh
                newestOrderID = inserted?.id
            } else {
                /* Один transaction обновляет строку, счётчик и деньги: так
                   запись ощущается причиной новых итогов, а не отдельным
                   декоративным эффектом. */
                withAnimation(.spring(response: 0.38, dampingFraction: 0.94)) {
                    shift = fresh
                    newestOrderID = inserted?.id
                }
            }
            onShift = fresh.onShift

            if inserted != nil {
                Task { @MainActor in
                    try? await Task.sleep(for: .milliseconds(850))
                    withAnimation(.easeOut(duration: 0.18)) { newestOrderID = nil }
                }
            }
        }

        // Даже если GET не прошёл из-за связи, локальная очередь уже знает
        // про только что записанную машину и обновляет Dynamic Island.
        if let shift, let tenant = session.tenant {
            await ShiftLiveActivity.shared.sync(
                shift: shift,
                tenant: tenant,
                worker: session.me,
                pending: queue.waiting(at: tenant.id)
            )
        }
    }
}

/**
 * Значок способа оплаты.
 *
 * В ленте способ стоял словом, и строка «Դավիթ · Թափք · Փոխանցում» читалась
 * целиком — а нужен из неё один взгляд: наличные это были или карта. Значок
 * отвечает на это мгновенно и занимает место одной буквы.
 */
func paymentSymbol(_ key: String) -> String {
    switch key {
    case "cash": return "banknote.fill"
    case "card": return "creditcard.fill"
    case "transfer": return "arrow.left.arrow.right"
    case "pass": return "ticket.fill"
    default: return "circle.fill"
    }
}

func paymentLabel(_ key: String) -> String {
    switch key {
    case "cash": return "Կանխիկ"
    case "card": return "Քարտ"
    case "transfer": return "Փոխանցում"
    case "pass": return "Աբոնեմենտ"
    default: return key
    }
}
