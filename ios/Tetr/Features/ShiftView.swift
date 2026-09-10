import SwiftUI

/**
 * Смена мойщика.
 *
 * Экран собран как витрина, а не как таблица: сверху во весь верх
 * телефона стоит сцена — вымытая машина и маскот, — а на неё снизу
 * заезжает белый лист: деньги и оба счётчика, затем журнал.
 * Дальше по белому листу идёт лента записей нитью времени, и внизу
 * одна лаймовая кнопка.
 *
 * Так собрано не сразу. Раньше сумма лежала прямо на фотографии, под
 * сценой стояли ещё две отдельные плитки, а первая запись смены жила
 * под сгибом экрана — три этажа на один вопрос «как идёт смена».
 * Карточка объединила их и подняла ленту на экран.
 *
 * Кнопка одна на оба состояния: до смены она начинает смену, на смене —
 * записывает машину. Погашенной кнопки на экране нет вовсе: кнопка,
 * которую нельзя нажать, это не кнопка, а упрёк.
 *
 * Графика хода смены по часам здесь нет намеренно. На своей смене человек
 * и так знает, как шёл день; линия отвечала на вопрос, которого у него не
 * возникает. Разбор по часам живёт там, где его действительно спрашивают,
 * — в кабинете владельца.
 */
struct ShiftView: View {
    @EnvironmentObject private var session: Session
    @EnvironmentObject private var queue: OrderQueue
    @EnvironmentObject private var net: Connectivity

    @State private var shift: API.Shift?
    /// Держим отдельно от `shift`: кнопка должна отзываться сразу,
    /// а не ждать, пока с сервера приедет вся смена целиком.
    @State private var onShift = false
    /// Идёт запрос на открытие смены: кнопка внизу показывает работу.
    @State private var starting = false
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
    /// Открыт лист смены кода: временный просят сменить на свой.
    @State private var changingPassword = false
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

    /// Сцена уехала вверх. Панель телефона стоит на картинке и потому
    /// белая и без подложки; когда картинка уходит из-под неё, белые
    /// знаки повисают на светлой бумаге и читаться перестают.
    @State private var pastScene = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var currency: String { session.tenant?.currency ?? "AMD" }

    /// Слово ниши под числом плитки — в форме, которую требует само число.
    private func unitLabel(_ count: Int) -> String {
        let word = Terms.unitWord(count, session.tenant?.unitOne ?? "")
        return word.isEmpty ? L("shift.record") : word
    }

    private let gap: CGFloat = 12

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                if let failure, shift == nil {
                    /* Отказ вместо витрины, а не поверх неё: рисовать
                       скелет суммы рядом со словами «нет связи» значит
                       обещать данные, которых не будет. */
                    TetrFailure(title: failure, retry: { await reload() })
                        .padding(.top, 160)
                } else {
                    board
                }
            }
            .padding(.bottom, 28)
        }
        /* Панель одевается по тому, что под ней: на сцене — прозрачная с
           белыми знаками, на бумаге — обычная, со своим материалом. */
        .onScrollGeometryChange(for: Bool.self) { geo in
            geo.contentOffset.y + geo.contentInsets.top > 150
        } action: { _, past in
            withAnimation(.easeInOut(duration: Motion.fast)) { pastScene = past }
        }
        /* Тянуть вниз умеет сама прокрутка, а не экран целиком: жест,
           повешенный в конец цепочки, наследовался листами поверх смены
           и мешал им закрываться свайпом. */
        .refreshable { await reload() }
        /* ПРОБА: системный эффект края вместо ручной смены одежды
           панели. `.soft` растушёвывает содержимое под панелью, и знаки
           на ней должны читаться сами, без флага и без скрима. */
        .scrollEdgeEffectStyle(.soft, for: .top)
        /* Сцена уходит под панель и под часы: верх экрана — картинка,
           а не серая полоса над ней. */
        .ignoresSafeArea(edges: .top)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background {
            ShiftPalette.page.ignoresSafeArea()
        }
        .safeAreaInset(edge: .bottom) { actionBar }
        /* Панель лежит на сцене: у неё нет подложки, а её знаки белые.
           Сам лист остаётся в теме телефона — тёмный экран владелец
           отверг. */
        .toolbarBackground(pastScene ? .visible : .hidden, for: .navigationBar)
        .toolbarColorScheme(pastScene ? nil : .dark, for: .navigationBar)
        /* Возврат на вкладку показывает экран сверху, но `pastScene`
           остаётся с прошлого раза — со дна ленты. Панель тогда
           одевается по-бумажному: светлая подложка, а знаки на ней
           по-прежнему белые, и выход пропадает в собственном фоне.
           Человек это чинил вытягиванием вниз: жест шевелил прокрутку,
           та пересчитывала геометрию и возвращала панели сцену.
           Сбрасываем сами, чтобы жест был не нужен. */
        .onAppear { pastScene = false }
        .sheet(isPresented: $changingPassword) { PasswordChangeView() }
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
    }

    /// Сама витрина: сцена с карточкой смены, очередь, лента записей.
    @ViewBuilder
    private var board: some View {
        ShiftScene(
            greeting: greeting,
            onShift: onShift,
            openedAt: shift?.openedAt,
            closed: shift?.closedToday,
            at: at,
            lasted: lasted,
            onEnd: { handingOver = true }
        )

        /* Общий белый лист заходит на картинку. Закругляется его верх,
           а сумма и журнал остаются на одной непрерывной поверхности. */
        VStack(spacing: 0) {
            sheetContent
        }
        .frame(maxWidth: .infinity)
        .background {
            UnevenRoundedRectangle(
                topLeadingRadius: 28, bottomLeadingRadius: 0,
                bottomTrailingRadius: 0, topTrailingRadius: 28,
                style: .continuous
            )
            .fill(ShiftPalette.page)
        }
        .padding(.top, -42)
    }

    @ViewBuilder
    private var sheetContent: some View {
        ledger
            .padding(.horizontal, 16)

        if hasNotices {
            VStack(spacing: gap) {
                /* Код временный — предупреждение стоит выше очереди и
                   офлайна: те про сейчас, а это про то, что завтра нечем
                   будет войти. */
                if let until = session.tempAccessUntil { tempAccessNote(until) }

                /* Связи нет — сказано словами, а не только пустотой.
                   Запись при этом работает как обычно: она ложится в
                   очередь и уйдёт сама. */
                if !net.online { offline }
                if !queue.waiting(at: session.tenant?.id).isEmpty { pending }
                ForEach(queue.rejected(at: session.tenant?.id)) { item in stuck(item) }
            }
            .padding(.horizontal, 16)
            .padding(.top, 18)
        }

        if let shift, !shift.orders.isEmpty {
            journal(shift.orders)
                .padding(.horizontal, 16)
        } else if shift == nil {
            /* Первая загрузка: места записей, а не пустота. Порог в две
               десятых секунды: быстрый ответ не должен успевать мигнуть
               скелетом. */
            Delayed(active: loading) {
                TetrSkeletonList(rows: 4)
                    .padding(.horizontal, 20)
                    .padding(.top, 26)
            }
        } else {
            ShiftEmpty(onShift: onShift)
                .padding(.horizontal, 16)
        }
    }

    /// Есть ли над лентой хоть одна полоса-предупреждение. Без этого
    /// вопроса пустой блок всё равно занимал бы свой отступ.
    private var hasNotices: Bool {
        session.tempAccessUntil != nil
            || !net.online
            || !queue.waiting(at: session.tenant?.id).isEmpty
            || !queue.rejected(at: session.tenant?.id).isEmpty
    }

    /// У владельца процент обычно 0 — он не берёт долю со своей работы.
    /// Показывать ему «твой заработок: 0 ֏» самым крупным числом на экране
    /// значит показывать пустоту: цифра верная, но смысла в ней никакого.
    /// Ему важна выручка смены, и она и становится главной.
    private var takesShare: Bool { (shift?.percent ?? 0) > 0 }

    // ══════════════════════════ смена ══════════════════════════

    /**
     * Встать на смену.
     *
     * Владельцу это показывает, кто на мойке, ещё до того как появится
     * первая запись: человека, который вышел час назад и пока ничего не
     * намыл, по записям не видно вовсе.
     *
     * Состояние меняем сразу, не дожидаясь сервера: связь на мойке
     * пропадает, а кнопка, которая «думает» секунду, жмётся второй раз.
     * Не прошло — вернём обратно.
     */
    private func startShift() async {
        let previous = onShift
        starting = true
        defer { starting = false }
        withAnimation(reduceMotion ? nil : Motion.springSoft) { onShift = true }

        let done: API.ShiftState? = try? await session.authed { token in
            try await APIClient.shared.send(
                "shift", method: "POST", body: ["open": true], token: token,
                as: API.ShiftState.self
            )
        }
        // не прошло — честно откатываемся, а не делаем вид, что встали
        withAnimation(reduceMotion ? nil : Motion.springSoft) {
            onShift = done?.onShift ?? previous
        }
        if onShift {
            // смена открылась — событие дня, с тактильным весом
            if done != nil { UIImpactFeedbackGenerator(style: .rigid).impactOccurred() }
            await reload()
        }
    }

    /* Уходя со смены — спрашиваем про наличные. Это единственный момент,
       когда деньги переходят из рук в руки, и другого места спросить не
       будет. Встаём молча: на входе спрашивать нечего. */
    private func leaveShift(cash: Int?) async {
        withAnimation(reduceMotion ? nil : Motion.springSoft) { onShift = false }

        var payload: [String: Any] = ["open": false]
        if let cash { payload["cash"] = cash }

        let done: API.ShiftState? = try? await session.authed { token in
            try await APIClient.shared.send(
                "shift", method: "POST", body: payload, token: token,
                as: API.ShiftState.self
            )
        }
        if done == nil {
            withAnimation(reduceMotion ? nil : Motion.springSoft) { onShift = true }
        } else if done?.onShift == false {
            UIImpactFeedbackGenerator(style: .rigid).impactOccurred()
        }
        await reload()
    }

    // ══════════════════════════ сцена ══════════════════════════

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

    /**
     * Карточка смены: деньги и оба счётчика одним предметом.
     *
     * Раньше сумма лежала прямо на фотографии, а под сценой стояли ещё
     * две отдельные плитки — три этажа на один вопрос «как идёт смена».
     * Главное число и счётчики стоят на общем белом листе под сценой,
     * разделённые тонкой чертой.
     */
    private var ledger: some View {
        let count = shift?.count ?? 0
        let cash = shift?.cashSoFar ?? 0
        /* У мойщика с долей главное число — его заработок. Владельцу без
           доли показывать «твой заработок: 0 ֏» самым крупным на экране
           значит показывать пустоту, и главной становится выручка. */
        let value = shift.map { takesShare ? $0.earned : $0.revenue }

        return VStack(alignment: .leading, spacing: 0) {
            Text(takesShare ? L("work.earnedToday") : L("work.shiftRevenue"))
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Brand.boardMuted)

            if let value {
                Text(money(value, currency))
                    .font(.system(size: 44, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Brand.onBoard)
                    .lineLimit(1)
                    .minimumScaleFactor(0.4)
                    .contentTransition(.numericText(value: Double(value)))
                    .padding(.top, 2)
            } else {
                /* Пока смена не приехала — место суммы, а не «0 ֏». Ноль
                   это утверждение «ты не заработал ничего». */
                TetrSkeleton(width: 190, height: 40, radius: 12)
                    .padding(.vertical, 5)
            }

            /* Сумма работ — второй строкой у мойщика с долей: два похожих
               числа, и какое из них твоё, решать не приходится. */
            if takesShare, let shift {
                Text(L("work.worksTotal") + " · " + money(shift.revenue, currency))
                    .font(.system(size: 13, weight: .medium))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .padding(.top, 3)
            }

            Rectangle()
                .fill(Brand.boardInk.opacity(0.08))
                .frame(height: 1)
                .padding(.top, 16)

            HStack(spacing: 0) {
                LedgerHalf(
                    icon: "car.fill",
                    value: "\(count)",
                    label: unitLabel(count),
                    animate: Double(count),
                    ready: shift != nil
                )
                Rectangle()
                    .fill(Brand.boardInk.opacity(0.08))
                    .frame(width: 1, height: 32)
                /* Наличные стоят рядом со счётчиком, а не строкой ниже:
                   это единственные деньги смены, которые в конце дня
                   переходят из рук в руки. */
                LedgerHalf(
                    icon: "banknote.fill",
                    value: money(cash, currency),
                    label: L("shift.cashInHand"),
                    animate: Double(cash),
                    ready: shift != nil
                )
                .padding(.leading, 14)
            }
            .padding(.top, 13)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// «7 ժ 15 ր». Часы отбрасываются, когда их нет, — как в вебе.
    private func lasted(since: Date) -> String {
        let minutes = max(0, Int(Date().timeIntervalSince(since) / 60))
        return minutes < 60 ? L("shift.lastedMinutes", minutes) : L("shift.lastedHours", minutes / 60, minutes % 60)
    }

    // ══════════════════════════ очередь ══════════════════════════

    /**
     * Временный код: напоминание задать свой.
     *
     * Код выдал админ платформы, когда войти было нечем. Он сгорает в
     * свой срок, и человек останется у ворот посреди смены — поэтому
     * напоминание не прячется и не закрывается: оно уйдёт само, как
     * только человек задаст свой код.
     *
     * Янтарное, а не красное: ничего не сломано, вход работает. Красным
     * в продукте помечено разрушительное.
     */
    private func tempAccessNote(_ until: Date) -> some View {
        Button {
            changingPassword = true
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "key.horizontal.fill")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Brand.warnOnBoard)
                    .frame(width: 34, height: 34)
                    .background(Brand.warnOnBoard.opacity(0.12), in: .rect(cornerRadius: R.control, style: .continuous))

                VStack(alignment: .leading, spacing: 1) {
                    Text(L("auth.tempAccessTitle"))
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Brand.onBoard)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                    Text(L("auth.tempAccessNote", tempAccessDeadline(until)))
                        .font(.system(size: 12))
                        .foregroundStyle(Brand.boardMuted)
                        .fixedSize(horizontal: false, vertical: true)
                        .multilineTextAlignment(.leading)
                }

                Spacer(minLength: 6)

                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Brand.boardMuted.opacity(0.7))
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Brand.warnOnBoard.opacity(0.09), in: .rect(cornerRadius: R.small, style: .continuous))
            .contentShape(.rect)
        }
        .buttonStyle(.press)
        .accessibilityLabel(L("auth.tempAccessTitle") + ". " + L("auth.tempAccessNote", tempAccessDeadline(until)))
    }

    /// «31 августа, 11:09» — в зоне бизнеса, как все времена продукта.
    private func tempAccessDeadline(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = LangStore.currentLang.locale
        f.setLocalizedDateFormatFromTemplate("d MMMM HH:mm")
        if let tz = session.tenant?.timezone, let zone = TimeZone(identifier: tz) {
            f.timeZone = zone
        }
        return f.string(from: date)
    }

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
        .background(Brand.warnOnBoard.opacity(0.09), in: .rect(cornerRadius: R.small, style: .continuous))
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
        .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: R.small, style: .continuous))
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
                   потерять сделанную работу, поэтому он спрашивает. */
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
        .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: R.small, style: .continuous))
    }

    // ══════════════════════════ журнал ══════════════════════════

    /**
     * Журнал смены — нитью времени.
     *
     * Записи идут по часам, и слева у них общая нить с точкой на каждой
     * машине: смена читается как ход дня, а не как таблица. Время вынесено
     * в поле слева — им ищут запись, когда ошиблись, — а номер и цена стоят
     * каждый на своей стороне строки.
     *
     * Номер машины в рамке с флагом, как настоящий номерной знак. Из сорока
     * записей за смену «Комплекс» встречается двадцать раз, а номер один:
     * искать свою ошибку по названию услуги — это читать список целиком.
     * Так же в вебе.
     */
    private func journal(_ orders: [API.ShiftOrder]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(L("shift.latest").uppercased())
                    .font(.system(size: 11, weight: .black, design: .rounded))
                    .tracking(1.3)
                    .foregroundStyle(Brand.boardMuted)
                Text("\(orders.count)")
                    .font(.system(size: 11, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted.opacity(0.7))
                Spacer(minLength: 8)
            }
            .padding(.horizontal, 6)
            .padding(.top, 26)
            .padding(.bottom, 12)

            // лениво: за смену записей бывает сорок, строить все разом незачем
            LazyVStack(spacing: 0) {
                ForEach(Array(orders.enumerated()), id: \.element.id) { index, order in
                    journalRow(order, first: index == 0, last: index == orders.count - 1)
                        .transition(
                            reduceMotion
                                ? .opacity
                                : .move(edge: .top).combined(with: .opacity)
                        )
                }
            }
        }
        /* Вопрос об отмене — один на весь журнал, а не по вопросу на
           строку: сорок одинаковых окон в памяти экрана ради одного
           нажатия в день.
         *
         * Окном, а не листом снизу: лист приходит с длинным нажатием на
         * строку и потому рисуется выноской от неё — у нижних записей
         * такая выноска не помещалась и обрезала собственную кнопку
         * «Оставить». Окно стоит посреди экрана всегда. */
        .alert(
            L("work.revokeTitle"),
            isPresented: .init(
                get: { revoking != nil },
                set: { if !$0 { revoking = nil } }
            ),
            presenting: revoking
        ) { order in
            Button(L("work.revoke"), role: .destructive) {
                Task { await revoke(order) }
            }
            Button(L("work.revokeKeep"), role: .cancel) {}
        } message: { order in
            Text(L("shift.revokeBody", order.clientKey ?? Terms.service(order.serviceName), Terms.service(order.serviceName), money(order.price, currency)))
        }
    }

    /**
     * Строка записи: номер, цена, под ними время и услуга.
     *
     * Отмена ушла с глаз в долгое нажатие. Раньше в каждой строке стояли
     * три точки — из сорока записей отменяют одну, а место в строке
     * действие занимало каждый раз, оттесняя номер и цену.
     *
     * Тем же соображением убраны колонка времени и нить с точками:
     * вдвоём они съедали шестьдесят точек слева в каждой строке, то
     * есть седьмую часть ширины, и ради чего — ради украшения. Номер и
     * сумма важнее, поэтому строка начинается прямо с них, а время
     * ушло вниз, к услуге, где читается заодно с ней. Свежую запись
     * по-прежнему видно: её подсвечивает сам номерной знак.
     */
    private func journalRow(_ order: API.ShiftOrder, first: Bool, last: Bool) -> some View {
        let fresh = newestOrderID == order.id
        let isPlate = order.clientKey != nil && session.tenant?.clientIdType == "plate"
        /* Совместная работа названа словом и числом людей. Без них
           строка нечитаема: цена 12 000, а заработок 1 800, и почему —
           неизвестно. */
        let detail = [
            at(order.createdAt),
            order.clientKey == nil ? nil : Terms.service(order.serviceName),
            order.shared
                ? L("crew.joint") + " · "
                    + Terms.staff(order.crew ?? 1, session.tenant?.staffRole ?? "")
                : nil,
        ]
        .compactMap { $0 }
        .joined(separator: " · ")

        return HStack(alignment: .top, spacing: 0) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    PlateTag(
                        text: order.clientKey ?? Terms.service(order.serviceName),
                        country: isPlate ? PlateTag.country(for: currency) : nil,
                        fresh: fresh
                    )

                    Spacer(minLength: 6)

                    Text(money(order.price, currency))
                        .font(.system(size: 17, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(Brand.onBoard)
                        .lineLimit(1)

                    /* Способ оплаты — цветной точкой: из строки нужен
                       один взгляд, наличные это были или карта. Цвет тот
                       же, что у этого способа во всех разрезах продукта. */
                    Circle()
                        .fill(paymentInk(order.payment))
                        .frame(width: 8, height: 8)
                        .accessibilityLabel(paymentLabel(order.payment))
                }

                HStack(spacing: 8) {
                    Text(detail)
                        .font(.system(size: 13))
                        .monospacedDigit()
                        .foregroundStyle(Brand.boardMuted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)

                    Spacer(minLength: 6)

                    /* Своя доля — только у совместной. У одиночной она и
                       так вся наверху экрана. */
                    if order.shared, let mine = order.earned {
                        Text("+" + money(mine, currency))
                            .font(.system(size: 12, weight: .bold))
                            .monospacedDigit()
                            .foregroundStyle(Brand.grape)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 3)
                            .background(Brand.grape.opacity(0.10), in: .rect(cornerRadius: 8, style: .continuous))
                    }
                }
            }
            .padding(.vertical, 11)
        }
        .contentShape(.rect)
        /* Отмена ошибочной записи — здесь же, а не «позвони владельцу».
           Долгим нажатием: действие редкое и разрушительное, и место в
           строке ему не положено. */
        .contextMenu {
            Button(role: .destructive) { revoking = order } label: {
                Label(L("work.revoke"), systemImage: "arrow.uturn.backward")
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAction(named: Text(L("work.revoke"))) { revoking = order }
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

    /**
     * Одна кнопка на всё время смены.
     *
     * До смены она начинает смену, на смене — записывает машину. Раньше
     * внизу стояла погашенная «+ машину» с подписью «начните смену», а
     * переключатель смены жил наверху: два места для одного пути, и
     * первое из них выглядело сломанным.
     *
     * Вне смены записывать нельзя не из дисциплины: машина, записанная
     * вне смены, не попадает в сдачу наличных при закрытии — деньги за
     * неё работник уносит, ничего не нарушив, а владелец недосчитывается
     * и не понимает почему. Теперь путь один: сначала смена, потом
     * машина, и кнопка сама ведёт по нему.
     *
     * Идентификатор один на оба состояния: тесты ищут по нему экран
     * смены, а не конкретное действие.
     */
    private var actionBar: some View {
        Button {
            if onShift {
                recording = true
            } else {
                Task { await startShift() }
            }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: onShift ? "plus" : "play.fill")
                    .font(.system(size: 15, weight: .bold))
                Text(onShift ? Terms.unit(session.tenant?.unitOne ?? "").acc : L("shift.start"))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .contentTransition(.opacity)
        }
        .accessibilityIdentifier("shift.record")
        .buttonStyle(LimeButton(loading: starting, busyTitle: L("work.startingShift")))
        .busy(starting)
        /* Лаймовое свечение под кнопкой. Единственное действие экрана
           обязано быть самым ярким местом на нём — и на белом листе,
           где лайм почти сливается с бумагой, свет вокруг него делает
           кнопку предметом, а не заливкой. */
        .shadow(color: Brand.lime.opacity(0.45), radius: 18, y: 8)
        .padding(.horizontal, 16)
        .padding(.top, 16)
        .padding(.bottom, 8)
        /**
         * Подложка цветом самого листа, а не материалом.
         *
         * Без подложки полоса была прозрачной, и журнал проезжал сквозь
         * неё. Материал серый и на тёмной теме читался отдельной плитой
         * от кнопки до самого низа. Сверху короткий градиент: список
         * уходит под кнопку, а не обрывается под ней ножом.
         */
        .background {
            VStack(spacing: 0) {
                LinearGradient(
                    colors: [ShiftPalette.page.opacity(0), ShiftPalette.page],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(height: 24)

                ShiftPalette.page
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
    }
}

// ═══════════════════════════ палитра витрины ═══════════════════════════

/**
 * Краски этого экрана.
 *
 * Лист белый: сцена наверху и так даёт цвет, под ней нужна бумага.
 * Светлая тема — чистый белый без сиреневого отсвета и стекла.
 * В тёмной теме системная поверхность сохраняет читаемость текста.
 */
private enum ShiftPalette {
    static let page = Color(uiColor: .systemBackground)
}

// ═══════════════════════════ части экрана ═══════════════════════════
//
// Каждая часть — свой тип со своим `body`, а не `some View`-свойство
// экрана. SwiftUI вклеивает вложенные свойства в один обобщённый тип, и
// у экрана с картинками и градиентами он разрастается так, что на живом
// телефоне не помещается в стек главного потока (см. LoginView).

/**
 * Сцена наверху.
 *
 * Картинка во весь верх телефона, уходящая под часы и панель, с
 * прямым низом под белым листом. На тёмном полу сцены — обращение по имени и
 * фишка состояния смены; денег на картинке больше нет, они переехали в
 * карточку, которая заезжает на сцену снизу.
 *
 * Сцена стала ниже ровно на высоту той суммы: раньше она занимала пол-
 * экрана, и первая запись смены жила под сгибом.
 */
private struct ShiftScene: View {
    let greeting: String
    let onShift: Bool
    let openedAt: Date?
    let closed: API.ClosedShift?
    let at: (Date) -> String
    let lasted: (Date) -> String
    let onEnd: () -> Void

    private static let art: UIImage? = UIImage(named: "shift-hero.jpg")

    var body: some View {
        Color.clear
            .aspectRatio(1.12, contentMode: .fit)
            .overlay(alignment: .top) {
                if let art = Self.art {
                    Image(uiImage: art)
                        .resizable()
                        .scaledToFill()
                } else {
                    Brand.heroGradient
                }
            }
            .overlay(alignment: .top) {
                /* Верхний скрим, под панель.
                 *
                 * Знаки панели белые, а верх сцены — самое светлое её
                 * место: сиреневое небо над машиной. Без этой полосы
                 * глобус и выход лежат белым по светлому и почти не
                 * видны, пока экран не потянут вниз — тогда панель
                 * переодевается и контраст возвращается случайно.
                 *
                 * Полоса высотой в панель со статусной строкой и гаснет
                 * задолго до машины: сцена остаётся собой, а кнопки
                 * читаются всегда, а не через жест.
                 */
                LinearGradient(
                    stops: [
                        .init(color: .black.opacity(0.38), location: 0),
                        .init(color: .black.opacity(0.16), location: 0.55),
                        .init(color: .black.opacity(0), location: 1),
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(height: 180)
                .allowsHitTesting(false)
            }
            .overlay {
                /* Скрим: от прозрачного до плотного к нижней кромке. Он
                   короче половины сцены, чтобы машина оставалась в
                   собственном свете. */
                LinearGradient(
                    stops: [
                        .init(color: .black.opacity(0), location: 0.40),
                        .init(color: .black.opacity(0.32), location: 0.74),
                        .init(color: .black.opacity(0.58), location: 1),
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
            }
            .overlay(alignment: .bottomLeading) { reading }
            .clipped()
            .animation(Motion.springSoft, value: onShift)
    }

    /**
     * Что написано на сцене.
     *
     * Имя человека крупно: это единственное место, где продукт
     * обращается к нему по имени, и мойщик открывает экран сорок раз за
     * смену. Нижний отступ считан от карточки: она заходит на сцену на
     * сорок две точки, и строки обязаны остаться выше неё.
     */
    private var reading: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(greeting)
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.7)

            HStack(spacing: 8) {
                /* Фишка состояния важнее кнопки: когда обе не помещаются
                   (армянские слова длинные), ужимается кнопка. */
                statusChip
                    .layoutPriority(1)
                Spacer(minLength: 0)
                if onShift {
                    Button(action: onEnd) {
                        HStack(spacing: 6) {
                            Image(systemName: "stop.fill")
                                .font(.system(size: 9, weight: .bold))
                            /* Короткое «Завершить»: полное «Завершить
                               смену» по-армянски не помещается рядом с
                               фишкой состояния. Что завершается, и так
                               ясно: кнопка стоит на смене. */
                            Text(L("shift.endShort"))
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                        }
                    }
                    .buttonStyle(GlassChipButton())
                    .transition(.scale(scale: 0.9).combined(with: .opacity))
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 56)
        .shadow(color: .black.opacity(0.35), radius: 10, y: 3)
    }

    /**
     * Фишка состояния. На открытой смене лаймовая: смена — то, что идёт
     * прямо сейчас, а лайм в продукте значит «здесь и сейчас». До и
     * после смены — стеклянная.
     *
     * Длительность тикает от `TimelineView`, а не от таймера в
     * состоянии: экран открыт часами, и число обязано расти само, но
     * будить всю страницу ради минутной стрелки незачем.
     */
    @ViewBuilder
    private var statusChip: some View {
        if onShift, let openedAt {
            TimelineView(.periodic(from: .now, by: 30)) { _ in
                limeChip(L("shift.onShiftSince", at(openedAt), lasted(openedAt)))
            }
        } else if let closed {
            glassChip(L("shift.doneRange", at(closed.openedAt), at(closed.closedAt)))
        } else {
            glassChip(onShift ? L("work.onShift") : L("work.emptyOff"))
        }
    }

    private func limeChip(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 13, weight: .bold))
            .monospacedDigit()
            .foregroundStyle(Brand.onLime)
            .lineLimit(1)
            .minimumScaleFactor(0.75)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Brand.lime, in: .rect(cornerRadius: R.control, style: .continuous))
            .shadow(color: Brand.lime.opacity(0.4), radius: 10, y: 3)
    }

    private func glassChip(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 13, weight: .semibold))
            .monospacedDigit()
            .foregroundStyle(.white)
            .lineLimit(1)
            .minimumScaleFactor(0.75)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(.white.opacity(0.16), in: .rect(cornerRadius: R.control, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: R.control, style: .continuous)
                    .strokeBorder(.white.opacity(0.22), lineWidth: 0.8)
            }
    }
}

/// Стеклянная кнопка на сцене: та же фишка, но нажимаемая.
private struct GlassChipButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(.white.opacity(0.16), in: .rect(cornerRadius: R.control, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: R.control, style: .continuous)
                    .strokeBorder(.white.opacity(0.22), lineWidth: 0.8)
            }
            .contentShape(.rect)
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(Motion.springSnap, value: configuration.isPressed)
    }
}

/**
 * Половинка карточки смены: значок, число, подпись.
 *
 * Две такие стоят под общей чертой и делят низ карточки пополам.
 * Значок — системный символ чернилами, без кружка: объёмные игрушки
 * читались мультфильмом рядом с кинематографичной сценой.
 */
private struct LedgerHalf: View {
    let icon: String
    let value: String
    let label: String
    let animate: Double
    let ready: Bool

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Brand.onBoard.opacity(0.5))
                .frame(width: 20)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 1) {
                if ready {
                    Text(value)
                        .font(.system(size: 20, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(Brand.onBoard)
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                        .contentTransition(.numericText(value: animate))
                } else {
                    TetrSkeleton(width: 58, height: 18, radius: 6)
                        .padding(.vertical, 2)
                }

                Text(label)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Brand.boardMuted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/**
 * Пусто до смены и пусто на смене — разные ответы.
 *
 * Первый говорит, что делать; второй — что всё в порядке и первая
 * машина просто ещё не приехала. Одна строка «смена не начата» на
 * открытой смене читалась поломкой.
 *
 * Маскот здесь не повторяется: он уже стоит в сцене наверху. Знак
 * тихий: луна до смены, искры на смене.
 */
private struct ShiftEmpty: View {
    let onShift: Bool

    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: onShift ? "sparkles" : "moon.zzz.fill")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(onShift ? Brand.grape : Brand.boardMuted)
                .frame(width: 56, height: 56)
                .background(Brand.boardInk.opacity(0.06), in: .circle)
                .padding(.bottom, 10)
                .accessibilityHidden(true)

            Text(onShift ? L("work.emptyOpen") : L("work.emptyOff"))
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(Brand.onBoard)
            Text(onShift ? L("shift.emptyOpenNote") : L("work.emptyOffNote"))
                .font(.system(size: 14))
                .foregroundStyle(Brand.boardMuted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 28)
        .padding(.bottom, 10)
        .padding(.horizontal, 28)
        .animation(Motion.springSoft, value: onShift)
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

/// Плашка под значком способа оплаты — светлая пара к `paymentInk`.
func paymentTint(_ key: String) -> Color {
    switch key {
    case "cash": return Brand.mintCard
    case "card": return Brand.lavenderCard
    case "transfer": return Brand.sandCard
    case "pass": return Brand.grape.opacity(0.12)
    default: return Brand.boardInk.opacity(0.06)
    }
}
