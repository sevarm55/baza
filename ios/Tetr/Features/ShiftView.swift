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
    @EnvironmentObject private var net: Connectivity

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
    /// Несохранённая запись, которую собираются выбросить из очереди.
    @State private var dropping: OrderQueue.Item?
    /**
     * Почему смена не приехала.
     *
     * Раньше отказ глотался: `shift` оставался пустым, сумма — вечным
     * скелетом, журнал не рисовался вовсе, и главный экран продукта на
     * плохой связи выглядел сломанным без единого слова. Показывается
     * только когда данных нет совсем: пришедшие цифры отказ фонового
     * обновления с экрана не стирает.
     */
    @State private var failure: String?
    /// Приветствие мойщика: три строки про смену, один раз за всю жизнь
    /// его участия в этой мойке. Владельцу здесь не показывается — свой
    /// первый экран он уже прочитал в кабинете.
    @State private var welcoming = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var currency: String { session.tenant?.currency ?? "AMD" }

    /// Слово ниши под числом плитки — в форме, которую требует само число.
    private func unitLabel(_ count: Int) -> String {
        let word = Terms.unitWord(count, session.tenant?.unitOne ?? "")
        return word.isEmpty ? L("shift.record") : word
    }

    private let gap: CGFloat = 10

    var body: some View {
        ScrollView {
            VStack(spacing: gap) {
                if let failure, shift == nil {
                    /* Отказ вместо табло, а не поверх него: рисовать
                       скелет суммы рядом со словами «нет связи» значит
                       обещать данные, которых не будет. */
                    TetrFailure(title: failure, retry: { await reload() })
                        .padding(.top, 48)
                } else {
                    board
                }
            }
            .padding(.horizontal, 16)
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
        .sheet(isPresented: $welcoming) {
            WorkerWelcomeSheet { welcoming = false }
        }
        .task { await reload() }
        .task {
            /* Отмечаем прочитанным при показе, а не по кнопке: окно,
               которое возвращается при каждом открытии вкладки,
               перестаёт быть приветствием и становится помехой. */
            if session.me?.isOwner == false && !session.welcomeSeen {
                welcoming = true
                await session.markWelcomeSeen()
            }
        }
        .refreshable { await reload() }
    }

    /// Само табло: показание, очередь, показатели, журнал.
    @ViewBuilder
    private var board: some View {
        reading

        /* Связи нет — сказано словами, а не только пустотой. Запись при
           этом работает как обычно: она ложится в очередь и уйдёт сама. */
        if !net.online { offline }
        if !queue.waiting(at: session.tenant?.id).isEmpty { pending }
        ForEach(queue.rejected(at: session.tenant?.id)) { item in stuck(item) }

        grid

        if let shift, !shift.orders.isEmpty {
            journal(shift.orders)
        } else if shift == nil {
            /* Первая загрузка: места записей, а не пустота. До
               сих пор между открытием экрана и первой строкой
               журнала не было ничего, и смена выглядела пустой
               ровно до того момента, как оказывалась не пустой.

               Порог в две десятых секунды: быстрый ответ не
               должен успевать мигнуть скелетом. */
            Delayed(active: loading) {
                TetrSkeletonList(rows: 4)
                    .padding(.horizontal, 4)
                    .padding(.top, 8)
            }
        } else {
            empty
        }
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
                Text(onShift ? L("work.onShift") : L("shift.offShift"))
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
        .padding(.horizontal, 16)
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
            // смена открылась — событие дня, с тактильным весом
            if done != nil { UIImpactFeedbackGenerator(style: .rigid).impactOccurred() }
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
            UIImpactFeedbackGenerator(style: .rigid).impactOccurred()
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
        case 5..<12: return L("shift.greetingMorning")
        case 12..<18: return L("shift.greetingDay")
        case 18..<24: return L("shift.greetingEvening")
        // ночью «доброй ночи» звучит прощанием, поэтому нейтральное
        default: return L("shift.greetingPlain")
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

            Text(takesShare ? L("work.earnedToday") : L("work.shiftRevenue"))
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Brand.boardMuted)
                .padding(.top, 14)

            /* Пока смена не приехала, на месте суммы стоит место
               суммы, а не «0 ֏». Ноль здесь не пустое место, а
               утверждение: «сегодня ты не заработал ничего», — и мойщик
               читает его как факт, потому что выглядит оно как факт. */
            if shift == nil {
                TetrSkeleton(width: 190, height: 46, radius: 12)
                    .padding(.vertical, 4)
            } else {
                Text(money(value, currency))
                    .font(.system(size: 46, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(Brand.onBoard)
                    .lineLimit(1)
                    .minimumScaleFactor(0.42)
                    .contentTransition(.numericText(value: Double(value)))
            }

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
        .background(Brand.boardSurface, in: .rect(cornerRadius: 28, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
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
                    Text(L("shift.onShiftSince", at(openedAt), lasted(since: openedAt)))
                        .font(.system(size: 13, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(Brand.goodOnBoard)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                }
            } else if let done = shift?.closedToday {
                Text(L("shift.doneRange", at(done.openedAt), at(done.closedAt)))
                    .font(.system(size: 13, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            } else {
                Text(onShift ? L("work.onShift") : L("work.emptyOff"))
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
        return minutes < 60 ? L("shift.lastedMinutes", minutes) : L("shift.lastedHours", minutes / 60, minutes % 60)
    }

    // ══════════════════════════ показатели смены ══════════════════════════

    /**
     * Показатели смены: тонкая строка и одна тёплая.
     *
     * Была мозаика из трёх цветных плиток — лавандовой во всю высоту, мятной
     * и песочной рядом. Она читалась приборной панелью, а не сменой: три
     * заливки одинаковой силы спорили и между собой, и с числом над ними, и
     * первым на экране читался цвет, а не деньги.
     *
     * Сейчас числа стоят строкой на полотне, без коробок вокруг каждого, —
     * тем же приёмом, что показатели дня в сводке. Экран продукта не должен
     * разговаривать в двух разных манерах.
     *
     * Средний чек убран. За смену он считается по трём-пяти записям и
     * прыгает от одной дорогой мойки, а решает по нему не мойщик и не в
     * этот день; у владельца его убрали из сегодняшнего дня по той же
     * причине.
     *
     * Показатели и наличные — ОДНОЙ карточкой, а не стопкой полосок.
     * Раньше между карточкой заработка и узкой карточкой кассы висели два
     * голых числа на полотне, и владелец прямо сказал, что стопка «белая
     * шапка, цифры, ещё одна белая шапка» некрасива. Теперь у смены две
     * поверхности: показание сверху и один блок показателей, внутри
     * которого счётчик, сумма работ и строка наличных разделены волосяной
     * линией.
     */
    private var grid: some View {
        let count = shift?.count ?? 0
        let cash = shift?.cashSoFar ?? 0
        let revenue = shift?.revenue ?? 0

        return VStack(spacing: 0) {
            HStack(spacing: 0) {
                shiftValue(unitLabel(count), "\(count)", animate: Double(count))
                shiftDivider
                /* Подпись называет, ЧЬИ это деньги. «Выручка смены» стояло
                   и здесь, и в кабинете владельца, а рядом — заработок
                   мойщика: два похожих числа, и какое из них твоё,
                   приходилось решать. Теперь это «сумма работ», а доля
                   названа долей. Те же слова в вебе. */
                shiftValue(
                    takesShare ? L("work.worksTotal") : L("shift.yourShare", shift?.percent ?? 0),
                    money(revenue, currency),
                    animate: Double(revenue)
                )
            }
            .padding(.vertical, 14)

            Rectangle()
                .fill(Brand.boardInk.opacity(0.07))
                .frame(height: 1)
                .padding(.horizontal, 14)

            cashRow(cash)
        }
        .background(Brand.boardSurface, in: .rect(cornerRadius: 22, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .strokeBorder(Brand.boardInk.opacity(0.07), lineWidth: 0.8)
        }
    }

    private func shiftValue(_ title: String, _ value: String, animate: Double) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.system(size: 20, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .contentTransition(.numericText(value: animate))
            Text(title)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(Brand.boardMuted)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
    }

    private var shiftDivider: some View {
        Rectangle()
            .fill(Brand.boardInk.opacity(0.1))
            .frame(width: 1, height: 34)
    }

    /**
     * Сколько наличных на руках и что с ними будет.
     *
     * Белая поверхность, а не графит: тёмная плашка посреди светлого
     * табло читалась чёрной полосой, и владелец попросил её убрать.
     * Своей карточки у строки тоже больше нет — она нижняя треть общего
     * блока показателей (см. `grid`).
     *
     * Мята — не украшение: наличные окрашены ею во всех разрезах оплат
     * продукта (`paymentInk`), и значок здесь говорит тем же цветом, что
     * и статистика. Сумма чернилами, как все деньги на светлом.
     */
    private func cashRow(_ cash: Int) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "banknote.fill")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Brand.mintInk)
                .frame(width: 38, height: 38)
                .background(Brand.mintCard, in: .rect(cornerRadius: 14, style: .continuous))

            VStack(alignment: .leading, spacing: 1) {
                Text(L("shift.cashInHand"))
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Brand.onBoard)
                Text(L("shift.toHandOver"))
                    .font(.system(size: 12))
                    .foregroundStyle(Brand.boardMuted)
            }

            Spacer(minLength: 8)

            Text(money(cash, currency))
                .font(.system(size: 20, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .contentTransition(.numericText(value: Double(cash)))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    // ══════════════════════════ очередь ══════════════════════════

    /// Нет связи. Спокойно, не красным: продукт офлайн умеет, и строка
    /// обещает ровно это.
    private var offline: some View {
        HStack(spacing: 10) {
            Image(systemName: "wifi.slash")
                .font(.system(size: 13))
                .foregroundStyle(Brand.warnOnBoard)
            Text(L("shift.offline"))
                .font(.system(size: 13))
                .foregroundStyle(Brand.boardMuted)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Brand.warnOnBoard.opacity(0.09), in: .rect(cornerRadius: 18, style: .continuous))
    }

    /// Несинхронизированное показываем честно, но не тревожно: запись
    /// сделана и не пропадёт, просто ещё не ушла.
    private var pending: some View {
        HStack(spacing: 10) {
            Image(systemName: loading ? "arrow.triangle.2.circlepath" : "wifi.exclamationmark")
                .font(.system(size: 13))
                .foregroundStyle(Brand.boardMuted)
                .contentTransition(.symbolEffect(.replace.magic(fallback: .downUp)))
                .symbolEffect(.drawOn, options: .nonRepeating, isActive: loading && !reduceMotion)
            Text(L("shift.waitingToSend", queue.waiting(at: session.tenant?.id).count))
                .font(.system(size: 13))
                .foregroundStyle(Brand.boardMuted)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 18, style: .continuous))
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
                    /* Причина словами, а не голым кодом: «SHIFT_CLOSED»
                       мойщику не говорит ничего, а испугать успевает.
                       Код остаётся внутри фразы — по нему владелец
                       назовёт проблему в поддержке. */
                    Text("\(Terms.service(item.serviceName)) · \(item.failure.map { L("errors.server", $0) } ?? "")")
                        .font(.system(size: 12))
                        .foregroundStyle(Brand.boardMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }

            HStack(spacing: 8) {
                Button(L("common.retry")) { queue.retry(item.ref) }
                    .buttonStyle(.glass)
                /* Выброс из очереди — единственный способ безвозвратно
                   потерять сделанную работу, поэтому он спрашивает.
                   Отмена сохранённой записи спрашивала всегда, а этот
                   путь был в одно касание — трение стояло обратно цене
                   ошибки. */
                Button(L("expenses.remove")) { dropping = item }
                    .buttonStyle(.glass)
                    .tint(Brand.muted)
                    .confirmationDialog(
                        L("shift.dropTitle"),
                        isPresented: .init(
                            get: { dropping?.ref == item.ref },
                            set: { if !$0 { dropping = nil } }
                        ),
                        titleVisibility: .visible,
                        presenting: item
                    ) { item in
                        Button(L("expenses.remove"), role: .destructive) {
                            dropping = nil
                            queue.drop(item.ref)
                        }
                        Button(L("work.revokeKeep"), role: .cancel) {}
                    } message: { item in
                        Text("\(item.clientKey) · \(money(item.price, currency)) · \(L("shift.dropBody"))")
                    }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 18, style: .continuous))
    }

    // ══════════════════════════ журнал ══════════════════════════

    private func journal(_ orders: [API.ShiftOrder]) -> some View {
        // лениво: за смену записей бывает сорок, строить все разом незачем
        LazyVStack(spacing: 0) {
            HStack {
                Text(L("shift.latest"))
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
            LazyVStack(spacing: 0) {
            ForEach(orders) { order in
                VStack(spacing: 0) {
                    HStack(spacing: 10) {
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 6) {
                                Text(order.clientKey ?? Terms.service(order.serviceName))
                                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                                    .monospacedDigit()
                                    .foregroundStyle(Brand.onBoard)
                                    .lineLimit(1)

                                Image(systemName: newestOrderID == order.id ? "checkmark" : paymentSymbol(order.payment))
                                    .font(.system(size: 11, weight: newestOrderID == order.id ? .bold : .regular))
                                    .foregroundStyle(newestOrderID == order.id ? Brand.goodOnBoard : Brand.boardMuted)
                                    .contentTransition(.symbolEffect(.replace.magic(fallback: .downUp)))
                                    .symbolEffect(
                                        .drawOn,
                                        options: .nonRepeating,
                                        isActive: newestOrderID == order.id && !reduceMotion
                                    )
                                    .accessibilityLabel(paymentLabel(order.payment))
                            }

                            /* Совместная работа названа словом и числом
                               людей. Без них строка нечитаема: цена
                               12 000, а заработок 1 800, и почему —
                               неизвестно. */
                            Text(
                                [
                                    order.clientKey == nil ? nil : Terms.service(order.serviceName),
                                    paymentLabel(order.payment),
                                    at(order.createdAt),
                                    order.shared
                                        ? L("crew.joint") + " · "
                                            + Terms.staff(order.crew ?? 1, session.tenant?.staffRole ?? "")
                                        : nil,
                                ]
                                .compactMap { $0 }
                                .joined(separator: " · ")
                            )
                            .font(.system(size: 12))
                            .monospacedDigit()
                            .foregroundStyle(Brand.boardMuted)
                            .lineLimit(1)
                        }

                        Spacer(minLength: 8)

                        VStack(alignment: .trailing, spacing: 1) {
                            Text(money(order.price, currency))
                                .font(.system(size: 14, weight: .semibold))
                                .monospacedDigit()
                                .foregroundStyle(Brand.onBoard)

                            /* Своя доля — только у совместной. У одиночной
                               она и так вся наверху экрана, и вторая
                               строка под ценой повторяла бы одно число
                               дважды. */
                            if order.shared, let mine = order.earned {
                                Text(money(mine, currency))
                                    .font(.system(size: 12))
                                    .monospacedDigit()
                                    .foregroundStyle(Brand.boardMuted)
                            }
                        }

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
                                /* Полная цель касания: 30 точек мокрый
                                   палец промахивал в цену рядом. */
                                .frame(width: 44, height: 44)
                                .contentShape(.rect)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(L("shift.rowActions", order.clientKey ?? Terms.service(order.serviceName)))
                        /* Вопрос висит на самой кнопке, а не на списке.

                           Раньше он стоял на всей прокрутке, и система, не
                           зная, от чего его вести, привязывала к её началу:
                           нажимаешь три точки у третьей записи, а окно
                           выезжает вверху экрана и стрелкой указывает не
                           туда. Условие тоже стало пооcтрочным — иначе
                           каждая строка считала бы, что спрашивают у неё. */
                        .confirmationDialog(
                            L("work.revokeTitle"),
                            isPresented: .init(
                                get: { revoking?.id == order.id },
                                set: { if !$0 { revoking = nil } }
                            ),
                            titleVisibility: .visible,
                            presenting: order
                        ) { order in
                            Button(L("work.revoke"), role: .destructive) {
                                Task { await revoke(order) }
                            }
                            Button(L("work.revokeKeep"), role: .cancel) {}
                        } message: { order in
                            Text(L("shift.revokeBody", order.clientKey ?? Terms.service(order.serviceName), Terms.service(order.serviceName), money(order.price, currency)))
                        }
                    }
                    .padding(.horizontal, 6)
                    .padding(.vertical, 9)
                    .background(
                        newestOrderID == order.id ? Brand.grape.opacity(0.12) : Color.clear,
                        in: .rect(cornerRadius: 14, style: .continuous)
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
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .boardCard(R.card)
        }
    }

    /* Пусто до смены и пусто на смене — разные ответы. Первый говорит,
       что делать; второй — что всё в порядке и первая машина просто ещё
       не приехала. Одна строка «смена не начата» на открытой смене
       читалась поломкой. */
    private var empty: some View {
        VStack(spacing: 6) {
            Text(onShift ? L("work.emptyOpen") : L("work.emptyOff"))
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Brand.onBoard)
            Text(onShift
                ? L("work.emptyOpenNote")
                : L("work.emptyOffNote"))
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
                Text(L("work.needShift"))
                    .font(.system(size: 13))
                    .foregroundStyle(Brand.boardMuted)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Button("+ \(Terms.unit(session.tenant?.unitOne ?? "").acc)") {
                recording = true
            }
            .accessibilityIdentifier("shift.record")
            .buttonStyle(LimeButton())
            .disabled(!onShift)
            .opacity(onShift ? 1 : 0.45)
        }
        .padding(.horizontal, 16)
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
        .animation(reduceMotion ? nil : .snappy(duration: Motion.normal), value: onShift)
    }

    /// Время в зоне бизнеса, а не устройства: владелец в поездке видел
    /// смену, начатую в шесть утра.
    private func at(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = LangStore.currentLang.locale
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

        do {
            let fresh = try await session.authed { token in
                try await APIClient.shared.send("shift", token: token, as: API.Shift.self)
            }

            // применяем только если за это время не начали новое обновление
            guard id == loadID else { return }
            failure = nil

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
                    withAnimation(.easeOut(duration: Motion.fast)) { newestOrderID = nil }
                }
            }
        } catch is CancellationError {
            /* Потянули вниз и отпустили или ушли с экрана. Ничего не
               сломалось, и экран об этом молчит. */
            return
        } catch let error as APIError {
            guard id == loadID else { return }
            failure = error.isOffline
                ? L("errors.offline")
                : L("errors.server", "\(error.status) \(error.code ?? "—")")
        } catch {
            guard id == loadID else { return }
            // разбор ответа: показываем как есть — это баг, а не сбой сети
            failure = Failure.text(error)
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
    case "cash": return L("payment.cash")
    case "card": return L("payment.card")
    case "transfer": return L("payment.transfer")
    case "pass": return L("payment.pass")
    default: return key
    }
}

/**
 * Цвет способа оплаты.
 *
 * Лежит рядом с его названием и знаком, а не в экране, потому что
 * разрезов по оплате в продукте два: сводка за месяц и отчёт. Пока цвет
 * жил приватным методом одного из них, второй красил наличные заново —
 * и первая же правка палитры развела бы два ответа на один вопрос.
 *
 * Мята наличным, лаванда карте, кобальт переводу: те же спокойные краски,
 * что держат смысл на остальных экранах. Абонемент грейпом — это марка,
 * и он единственный не деньги, а право.
 */
func paymentInk(_ key: String) -> Color {
    switch key {
    case "cash": return Brand.mintInk
    case "card": return Brand.lavenderInk
    case "transfer": return Brand.sandInk
    case "pass": return Brand.grape
    default: return Brand.boardMuted
    }
}
