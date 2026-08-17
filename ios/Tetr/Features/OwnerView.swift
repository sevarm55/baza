import SwiftUI

/**
 * Кабинет владельца — вариант «Տաբլո».
 *
 * Приборное табло, а не список карточек. Экран отвечает на шесть вопросов
 * в том порядке, в каком их задают: сколько мне осталось → сколько принесли
 * → сколько ушло людям и на расходы → сколько машин → что было последним.
 * Всё, что не отвечает ни на один из них, отсюда убрано.
 *
 * 1. **Показание, а не карточка.** Главная цифра стоит по оси экрана, без
 *    подложки и рамки: осевая симметрия прибора читается «показание»
 *    раньше, чем прочитано слово над ней.
 * 2. **Вычитание под цифрой.** `886 300 − 122 419 − 335 882 = 427 999`.
 *    Это единственная строка на экране, которая объясняет, ОТКУДА взялось
 *    главное число, — раньше владелец сверял его с плитками сам и не
 *    всегда сходился. Мелким и приглушённым: смотрят на неё раз в неделю,
 *    но когда смотрят — она отвечает целиком.
 * 3. **График низкий и подписанный.** Ход периода — линия в 60 точек с
 *    подписями времени и лаймовыми точками там, где были деньги. Прежняя
 *    волна занимала столько же места, но не говорила, когда именно; без
 *    оси она отвечала только «ровно или рывками».
 * 4. **Плитки одного ДНК.** Тон, два источника света, кромка стекла,
 *    крупный полупрозрачный знак и лаймовая засечка — те же, что на экране
 *    разделов, из общего `AuroraSurface`. Одна плитка — один показатель, и
 *    ни одна не повторяет цифру наверху.
 */
struct OwnerView: View {
    /**
     * Перейти на вкладку смены.
     *
     * Нужно одному месту — последнему шагу настройки: запись машины
     * живёт в своей вкладке, и открыть её поверх сводки нельзя, экран
     * смены корневой. Замыкание, а не общий объект состояния: у сводки
     * к вкладкам больше никаких дел нет.
     */
    var goToShift: () -> Void = {}

    @EnvironmentObject private var session: Session

    @State private var summary: API.Summary?
    @State private var period = "today"
    /// Период именно тех цифр, которые уже пришли с сервера. Выбор в
    /// segmented control меняется сразу, но подписи старых данных не имеют
    /// права называться новым периодом, пока его ответ ещё в пути.
    @State private var summaryPeriod = "today"
    /// Поводы, требующие внимания: колокольчик в шапке.
    @State private var alerts: [API.Alert] = []
    @State private var showAlerts = false
    @State private var showClients = false
    @State private var failure: String?
    @State private var cancelling: API.FeedItem?
    /// Идёт запрос. На это время период фиксируется, чтобы второй быстрый
    /// выбор не вернул на экран ответ от предыдущего периода.
    @State private var loading = false
    @State private var detailsVisible = true
    @State private var newestFeedID: String?
    @State private var loadID = 0

    /* Прокрутку разрядов система сама по «Уменьшению движения» не гасит:
       withAnimation отрабатывает как обычно. Гасим здесь — иначе настройка,
       которую человек включил не просто так, ничего не меняет. */
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var currency: String { session.tenant?.currency ?? "AMD" }

    private let periods = [("today", L("common.today")), ("month", L("owner.periodMonth")), ("prevmonth", L("owner.periodPrevMonth"))]

    private let gap: CGFloat = 12

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if let failure {
                    // Нули вместо выручки — худшее, что может показать этот
                    // экран: неверные данные выглядят как верные, и владелец
                    // принимает решение по ним. Лучше честно ничего.
                    problem(failure)
                } else if let s = summary {
                    reading(s)
                    details(s)
                        .opacity(detailsVisible ? 1 : 0)
                        .offset(y: detailsVisible || reduceMotion ? 0 : 8)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 28)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.board.ignoresSafeArea())
        .safeAreaInset(edge: .top) { chips }
        .task { await reload() }
        /* Настройку убрали или вернули — перечитываем сводку.

           Состояние блока приезжает в её ответе, а не хранится на
           экране, и без этого «пропустить» гасило бы карточку только до
           следующего обновления, а «вернуть» из разделов не показывало
           бы её вовсе: сводка осталась бы с прежним ответом на руках.
           Сам признак при этом ещё и участвует в условии выше — иначе
           между нажатием и ответом сервера карточка стояла бы на месте. */
        .onChange(of: session.setupHidden) { _, _ in
            Task { await reload() }
        }
        .refreshable { await reload() }
        .sheet(isPresented: $showAlerts) {
            /* Куда ведёт повод, решает приложение: у него свои разделы,
               и адрес страницы браузера здесь не при чём. Зарплата —
               соседняя вкладка, клиенты живут в «Ավելին», поэтому их
               список открывается прямо отсюда листом: лишний переход
               через меню к звонку не приближает. */
            AlertsView(onOpen: { key in
                if key == "payroll-due" {
                    NotificationCenter.default.post(name: .openPayroll, object: nil)
                } else {
                    showClients = true
                }
            })
            .environmentObject(session)
        }
        .sheet(isPresented: $showClients) {
            ClientsView().environmentObject(session)
        }
        .alert(
            L("work.revokeTitle"),
            isPresented: .init(get: { cancelling != nil }, set: { if !$0 { cancelling = nil } })
        ) {
            Button(L("common.no"), role: .cancel) { cancelling = nil }
            Button(L("common.cancel"), role: .destructive) {
                if let item = cancelling { Task { await cancel(item) } }
                cancelling = nil
            }
        } message: {
            if let item = cancelling {
                Text("\(item.clientKey ?? "—") · \(money(item.price, currency))")
            }
        }
    }

    // ══════════════════════════ верхняя строка ══════════════════════════

    /**
     * Период — системный segmented picker. На iOS 26 он сам получает
     * актуальную геометрию и материал и остаётся знакомым органом выбора.
     * Ручное обновление не дублируем кнопкой: для него уже есть pull to
     * refresh. Стекло остаётся только у действия с уведомлениями.
     */
    private var chips: some View {
        HStack(spacing: 10) {
            Picker(
                L("owner.periodLabel"),
                selection: Binding(
                    get: { period },
                    set: { key in Task { await selectPeriod(key) } }
                )
            ) {
                ForEach(periods, id: \.0) { key, label in
                    Text(label).tag(key)
                }
            }
            .pickerStyle(.segmented)
            .disabled(loading)

            Button {
                showAlerts = true
            } label: {
                /* Меньше, чем было: колокольчик — не действие экрана, а
                   вход в список поводов, и раз в неделю. Кнопка в 38
                   точек рядом с переключателем периода читалась как
                   равная ему по важности. */
                Image(systemName: alerts.isEmpty ? "bell" : "bell.badge")
                    .font(.system(size: 13.5, weight: .semibold))
                    .contentTransition(.symbolEffect(.replace.magic(fallback: .downUp)))
                    .frame(width: 32, height: 32)
                    .overlay(alignment: .topTrailing) {
                        if !alerts.isEmpty {
                            Text("\(alerts.count)")
                                .font(.system(size: 9, weight: .bold))
                                .monospacedDigit()
                                .foregroundStyle(Brand.onLime)
                                .frame(minWidth: 15, minHeight: 15)
                                .background(Brand.lime, in: .circle)
                                .offset(x: 3, y: -3)
                        }
                    }
            }
            .buttonStyle(.glass)
            /* Круглым: колокольчик — единственная кнопка-значок в этой
               строке, и круг отделяет её от прямоугольного переключателя
               периода рядом, не прибавляя ни веса, ни размера. */
            .buttonBorderShape(.circle)
            .accessibilityLabel(L("alerts.title"))
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
        .background(Brand.board.ignoresSafeArea(edges: .top))
    }

    // ══════════════════════════ показание ══════════════════════════

    /**
     * Показание прибора: подпись над числом, число по оси, приписка под ним.
     *
     * Прибыль, а не выручка: выручку владелец и так примерно помнит — она
     * равна числу машин на средний чек. Прибыль не помнит никто, в ней сидят
     * проценты работников и доля аренды за день.
     */
    private func reading(_ s: API.Summary) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 7) {
                Text(periodDates)
                    .font(.system(size: 12.5, weight: .semibold))
                    .foregroundStyle(Brand.boardMuted)
                    .contentTransition(.numericText())
                crewChip
            }
            .padding(.top, 4)

            Text(profitTitle)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Brand.onBoard.opacity(0.85))
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 8)

            /* Минус настоящий, U+2212: дефис на таком кегле читается точкой.
               Убыток жёлтым, не красным — красный в продукте значит
               «удалить». */
            Text((s.profit < 0 ? "−" : "") + money(abs(s.profit), currency))
                .font(.system(size: 54, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(s.profit < 0 ? Brand.warnOnBoard : Brand.onBoard)
                .lineLimit(1)
                .minimumScaleFactor(0.42)
                .padding(.top, 1)
                // значение передаётся внутрь: по нему система понимает, в
                // какую сторону крутить разряды
                .contentTransition(.numericText(value: Double(s.profit)))

            breakdown(s)
            change
        }
        .frame(maxWidth: .infinity)
    }

    /** Три источника результата, без повторения самого результата.

        Главное число уже стоит сверху. Повторять его ещё раз после `=` —
        значит заставлять человека дважды прочитать один и тот же ответ.
        Здесь остаётся только происхождение суммы: что вошло и что вышло. */
    @ViewBuilder
    private func breakdown(_ s: API.Summary) -> some View {
        if s.stats.revenue > 0 || s.costs.total > 0 || s.stats.payroll > 0 {
            HStack(spacing: 0) {
                moneySource(L("summary.paidIn"), amount: s.stats.revenue, sign: "+", ink: Brand.mintInk)
                sourceDivider
                moneySource(L("summary.toStaff"), amount: s.stats.payroll, sign: "−", ink: Brand.lavenderInk)
                sourceDivider
                moneySource(L("expenses.title"), amount: s.costs.total, sign: "−", ink: Brand.sandInk)
            }
            .padding(.vertical, 10)
            .background(Brand.boardSurface, in: .rect(cornerRadius: 19))
            .overlay {
                RoundedRectangle(cornerRadius: 19, style: .continuous)
                    .strokeBorder(Brand.boardInk.opacity(0.07), lineWidth: 0.8)
            }
            .padding(.top, 10)
            .frame(maxWidth: 360)
            /* Читалка экрана произносит показания фразой, а не набором
               чисел, — и на языке интерфейса, как и всё остальное. */
            .accessibilityLabel(
                L(
                    "summary.voiceover",
                    plain(s.stats.revenue),
                    plain(s.costs.total),
                    plain(s.stats.payroll)
                )
            )
        }
    }

    private func moneySource(_ title: String, amount: Int, sign: String, ink: Color) -> some View {
        VStack(spacing: 3) {
            Text("\(sign) \(money(amount, currency))")
                .font(.system(size: 12.5, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(ink)
                .lineLimit(1)
                .minimumScaleFactor(0.62)
            Text(title)
                .font(.system(size: 9.5, weight: .medium))
                .foregroundStyle(Brand.boardMuted)
                .lineLimit(1)
                .minimumScaleFactor(0.62)
        }
        .frame(maxWidth: .infinity)
    }

    private var sourceDivider: some View {
        Rectangle()
            .fill(Brand.boardInk.opacity(0.09))
            .frame(width: 1, height: 31)
    }

    /// Число без валюты — для строки вычитания.
    private func plain(_ amount: Int) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.groupingSeparator = "\u{202F}"
        return f.string(from: NSNumber(value: amount)) ?? "\(amount)"
    }

    /**
     * С чем сравнили и на сколько разошлось.
     *
     * В драмах, а не в процентах: процент от маленькой базы врёт — вчера
     * 3 000, сегодня 9 500 даёт «+217 %», а разница три помывки.
     *
     * Молчим, когда сравнивать не с чем: в базе ноль записей или разница
     * меньше сотни драмов.
     */
    @ViewBuilder
    private var change: some View {
        if let c = profitChange {
            HStack(spacing: 5) {
                /* Знак стрелкой и цифрой, не одним цветом: WCAG 1.4.1
                   запрещает передавать смысл оттенком, а этот экран смотрят
                   на мокром телефоне под солнцем. */
                Image(systemName: c.up ? "arrow.up" : "arrow.down")
                    .font(.system(size: 9, weight: .black))
                Text(c.diff)
                    .font(.system(size: 12.5, weight: .bold))
                    .monospacedDigit()
                /* С ЧЕМ сравнили, а не «сколько было тогда». Раньше рядом
                   стояло второе число — база, — и оно ничего не объясняло:
                   два числа подряд без подписи читаются как ошибка. Слово
                   отвечает на единственный вопрос, который тут возникает, —
                   «по сравнению с чем». */
                Text(c.label)
                    .font(.system(size: 12))
                    .foregroundStyle(Brand.boardMuted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
            .foregroundStyle(c.up ? Brand.goodOnBoard : Brand.warnOnBoard)
            .padding(.horizontal, 11)
            .padding(.vertical, 6)
            .background(Brand.chipRest, in: .rect(cornerRadius: 9))
            .padding(.top, 9)
        }
    }

    /**
     * Кто сейчас на площадке — тёмной плашкой рядом с датой.
     *
     * Это не то же самое, что «работал сегодня»: человек мог встать час
     * назад и ещё ничего не намыть — по записям его не видно вовсе, а на
     * мойке он стоит.
     *
     * Плашка графитовая, и это не украшение. Лаймовая точка «сейчас на
     * смене» по светлому полотну даёт контраст 1.06 — её там просто нет.
     * Собственный тёмный фон — единственный способ пустить фирменный лайм
     * в верх экрана; заодно плашка сама по себе читается органом
     * управления, а не подписью, и по ней понятно, что сюда можно нажать.
     *
     * Ведёт к работникам: вопрос «кто на смене» и вопрос «а сколько он у
     * меня получает» задают подряд.
     */
    @ViewBuilder
    private var crewChip: some View {
        if let present = summary?.onShift, !present.isEmpty {
            NavigationLink {
                StaffView().navigationTitle(Terms.staff(session.tenant?.staffRole ?? "").many)
            } label: {
                HStack(spacing: 5) {
                    // единственный настоящий кружок в продукте: точка
                    // состояния, а не форма
                    Circle()
                        .fill(Brand.lime)
                        .frame(width: 6, height: 6)
                        .shadow(color: Brand.lime.opacity(0.6), radius: 3)

                    Text(present.map(\.name).joined(separator: ", "))
                        .font(.system(size: 12.5, weight: .semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .truncationMode(.tail)

                    Image(systemName: "chevron.right")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundStyle(.white.opacity(0.5))
                }
                .padding(.horizontal, 9)
                .padding(.vertical, 5)
                .background(Tone.slate.base, in: .rect(cornerRadius: 9))
            }
            .buttonStyle(.press)
            .accessibilityLabel(
                present.map { L("summary.onShiftSince", $0.name, since($0.openedAt)) }.joined(separator: ", ")
            )
        }
    }

    // ══════════════════════════ содержание периода ══════════════════════════

    @ViewBuilder
    private func details(_ s: API.Summary) -> some View {
        /* Настройка первого дня — первой карточкой, пока она не
           закончена. Показание над ней остаётся на месте: у новой мойки
           там ноль, и ноль этот правдивый — работы ещё не было. Прятать
           его значило бы отвечать «здесь ничего нет» на вопрос «сколько
           я заработал», а первый день начинается ровно с него.

           Только на сегодняшнем периоде: у прошлого месяца настройка
           первого дня не при чём, там смотрят закрытые числа. */
        if summaryPeriod == "today", let setup = s.setup, setup.visible, !session.setupHidden {
            SetupCard(setup: setup, goToShift: goToShift)
        }

        if summaryPeriod == "today" {
            /* Графика на сегодняшнем экране нет.

               Он отвечал на вопрос «как шёл день», а этот вопрос владелец
               мойки себе не задаёт: у него за день пять машин, и «как
               шло» видно по журналу внизу построчно, с номерами и
               суммами. График же занимал треть экрана и в спокойный день
               показывал один столбик — то есть ровно то, что и так
               написано в журнале, только беднее.

               За месяц он остаётся: там тридцать точек, и форма месяца —
               настоящий ответ, которого больше нигде нет. */
            todaySnapshot(s)
            /* Порядок тот же, что в кабинете: что сейчас → кто работает →
               чем платили → что именно было. Два экрана одного продукта
               обязаны отвечать в одной последовательности, иначе владелец
               каждый раз заново ищет, где что. */
            crewBoard(s)
            paymentBreakdown(s)
            journal(s.feed)
        } else {
            chart(s.series)
            grid(s)
            paymentBreakdown(s)
            journal(s.feed)
        }
    }

    // ══════════════════════════ кто работает ══════════════════════════

    /**
     * Кто сегодня работает и сколько ему за это причитается.
     *
     * Раньше имена стояли только чипом у даты — списком, без единой
     * цифры. На вопрос «кто на площадке» он отвечал, на вопрос «сколько
     * я сегодня должен Валоду» — нет, и за ответом приходилось уходить в
     * зарплаты.
     *
     * Сумма здесь — заработок человека, а не выручка, которую он принёс:
     * приход уже назван строкой вычитания наверху, и повторять его
     * именами значило бы показать одни и те же деньги дважды.
     *
     * Порядок по состоянию: сначала те, кто на смене, потом отработавшие.
     * Внутри — по заработку. Вопрос «кто сейчас на посту» задают чаще,
     * чем «кто заработал больше».
     */
    @ViewBuilder
    private func crewBoard(_ s: API.Summary) -> some View {
        let lines = crew(s)
        if !lines.isEmpty {
            VStack(spacing: 0) {
                HStack {
                    Text(L("today.working"))
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Brand.boardMuted)
                    Text("\(lines.count)")
                        .font(.system(size: 12))
                        .monospacedDigit()
                        .foregroundStyle(Brand.boardMuted.opacity(0.7))
                    Spacer()
                }
                .padding(.horizontal, 6)
                .padding(.top, 14)
                .padding(.bottom, 4)

                ForEach(lines) { line in
                    crewRow(line)
                    if line.id != lines.last?.id {
                        Divider().overlay(Brand.boardInk.opacity(0.07))
                    }
                }
            }
            .padding(.horizontal, 10)
            .padding(.bottom, 4)
            .background(Brand.boardSurface, in: .rect(cornerRadius: 18))
            .overlay {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .strokeBorder(Brand.boardInk.opacity(0.07), lineWidth: 0.8)
            }
            .padding(.top, 10)
        }
    }

    private func crewRow(_ line: CrewLine) -> some View {
        HStack(spacing: 9) {
            /* Точка — состояние, а не опознавательный знак человека:
               зелёная значит «сейчас здесь». Цвет человека в этом списке
               не нужен — имена стоят по одному, различать их нечем. */
            Circle()
                .fill(line.present ? Brand.goodOnBoard : Color.clear)
                .frame(width: 7, height: 7)
                .overlay {
                    if !line.present {
                        Circle().strokeBorder(Brand.boardInk.opacity(0.28), lineWidth: 1.5)
                    }
                }

            Text(line.name)
                .font(.system(size: 14.5, weight: .semibold))
                .foregroundStyle(line.present ? Brand.onBoard : Brand.boardMuted)
                .lineLimit(1)

            Spacer(minLength: 8)

            Text(Terms.units(line.count, session.tenant?.unitOne ?? "").trimmingCharacters(in: .whitespaces))
                .font(.system(size: 12.5))
                .monospacedDigit()
                .foregroundStyle(Brand.boardMuted)
                .lineLimit(1)

            Text(money(line.earned, currency))
                .font(.system(size: 14.5, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)
                .lineLimit(1)
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 10)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "\(line.name)\(line.present ? ", հերթափոխին" : ""), \(line.count), \(money(line.earned, currency))"
        )
    }

    /// Человек в сегодняшнем дне: на смене или уже отработавший.
    private struct CrewLine: Identifiable {
        let id: String
        let name: String
        let present: Bool
        let count: Int
        let earned: Int
    }

    /**
     * Список объединённый, а не два подряд.
     *
     * Человек, который встал на смену час назад и ещё ничего не намыл, в
     * `byStaff` не попадает вовсе — по записям его не видно, а на
     * площадке он стоит. И наоборот: тот, кто отработал утро и ушёл, из
     * `onShift` уже пропал, но его деньги за день никуда не делись.
     */
    private func crew(_ s: API.Summary) -> [CrewLine] {
        let worked = s.stats.byStaff ?? []
        let present = Set(s.onShift.map(\.userId))

        var out: [CrewLine] = s.onShift.map { person in
            let line = worked.first { $0.staffId == person.userId }
            return CrewLine(
                id: person.userId,
                name: person.name,
                present: true,
                count: line?.count ?? 0,
                earned: line?.earned ?? 0
            )
        }

        out += worked
            .filter { line in line.staffId.map { !present.contains($0) } ?? true }
            .map { line in
                CrewLine(
                    id: line.staffId ?? "—",
                    name: line.name ?? "—",
                    present: false,
                    count: line.count,
                    earned: line.earned
                )
            }

        return out.sorted { a, b in
            a.present == b.present ? a.earned > b.earned : a.present
        }
    }

    /**
     * Быстрый ответ для сегодняшнего дня. Три показателя стоят одной
     * строкой без трёх цветных карточек: сначала итог наверху, затем объём,
     * средний чек и люди. Приход уже объяснён над строкой и здесь не
     * повторяется второй раз.
     *
     * Наличные отсюда ушли. Одно число «Կանխիկ» называло сумму, но не
     * долю, — а решает владелец именно по доле: сколько денег дня лежит
     * в кармане, а сколько придёт на счёт. Полный разрез стоит ниже, и
     * держать здесь его четверть значило бы показывать одни и те же
     * драмы дважды.
     */
    private func todaySnapshot(_ s: API.Summary) -> some View {
        HStack(spacing: 0) {
            snapshotValue(L("summary.served"), "\(s.stats.count)")
            snapshotDivider
            snapshotValue(L("owner.avgCheck"), money(s.stats.avgCheck, currency))
            snapshotDivider
            snapshotValue(L("owner.onShift"), "\(s.onShift.count)")
        }
        .padding(.top, 20)
        .padding(.vertical, 13)
        .accessibilityElement(children: .contain)
    }

    private func snapshotValue(_ title: String, _ value: String) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.system(size: 18, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)
                .lineLimit(1)
                .minimumScaleFactor(0.55)
            Text(title)
                .font(.system(size: 10.5, weight: .medium))
                .foregroundStyle(Brand.boardMuted)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
    }

    private var snapshotDivider: some View {
        Rectangle()
            .fill(Brand.boardInk.opacity(0.1))
            .frame(width: 1, height: 34)
    }

    // ══════════════════════════ волна ══════════════════════════

    /**
     * Ход периода — низкая линия с подписями времени.
     *
     * Она не отвечает «сколько было в одиннадцать»: для этого есть журнал
     * внизу. Она отвечает на два других вопроса — ровно шёл день или
     * рывками и когда пришёл главный заезд.
     *
     * Прежняя волна занимала столько же места, но висела без единой
     * подписи: без оси линия говорит только «ровно или рывками», а «когда»
     * приходилось угадывать по положению точки. Четыре подписи под ней
     * стоят тринадцать точек высоты и снимают вопрос целиком.
     *
     * Подписи берутся из самих данных, а не прибиты к 08:00–20:00: ряд
     * начинается с первой записи смены, и у мойки, открывающейся в семь,
     * фиксированная сетка врала бы на час.
     *
     * Лаймовые точки там, где были деньги. Это и есть «сделки»: между ними
     * линия лежит на нуле, и без точек не видно, две это помывки или
     * двадцать. На длинном ряде точки гасятся — тридцать лаймовых пятен на
     * месяце это уже не акцент, а сыпь; остаётся одна, на пике.
     *
     * Заливка под линией слабая, до полной прозрачности: она даёт графику
     * низ, иначе линия в 60 точек читается царапиной на полотне.
     */
    @ViewBuilder
    /**
     * График выручки. Вся отрисовка живёт в `RevenueChart`; здесь только
     * то, что знает именно этот экран: как называется период и как
     * подписать деление.
     */
    private func chart(_ series: [API.SeriesPoint]) -> some View {
        RevenueChart(
            series: series,
            title: chartTitle,
            axis: { point in axis(point) },
            money: { value in money(value, currency) }
        )
    }

    private var chartTitle: String {
        summaryPeriod == "today" ? L("summary.paymentsDay") : L("summary.paymentsMonth")
    }

    private func axis(_ point: API.SeriesPoint?) -> String {
        guard let point else { return "" }
        return summaryPeriod == "today" ? "\(point.hourLabel):00" : point.dayLabel
    }

    /// У единственного часа нет линии, но есть точка и подпись: сегодняшний
    /// график не должен исчезать только потому, что обе машины приехали в
    /// один час.
    // ══════════════════════════ финансовые детали ══════════════════════════

    /** За длинный период финансовая формула уже видна сверху. Здесь только
        два операционных показателя — данные, которых в формуле нет,
        поэтому ни одна большая сумма не повторяется. */
    private func grid(_ s: API.Summary) -> some View {
        let unit = Terms.unit(session.tenant?.unitOne ?? "").nom

        return HStack(spacing: gap) {
            softMetric(
                background: Brand.mintCard,
                ink: Brand.mintInk,
                title: L("summary.served"),
                value: "\(s.stats.count) \(unit)".trimmingCharacters(in: .whitespaces),
                foot: L("summary.inPeriod"),
                symbol: "car.fill",
                animate: Double(s.stats.count)
            )
            softMetric(
                background: Brand.lavenderCard,
                ink: Brand.lavenderInk,
                title: L("summary.avgPayment"),
                value: money(s.stats.avgCheck, currency),
                foot: unit.isEmpty ? "" : perOneUnit(unit),
                symbol: "creditcard.fill",
                animate: Double(s.stats.avgCheck)
            )
        }
        .padding(.top, 20)
    }

    /**
     * Чем платили.
     *
     * Прибор стоит теперь и на сегодняшнем экране, а не только за месяц.
     * Раньше сегодняшний день отвечал на этот вопрос одним числом
     * «Կանխիկ» в строке фактов: сумма без доли не решает ничего, а
     * решает владелец именно долей — сколько денег дня в кармане, а
     * сколько придёт на счёт.
     *
     * Доля считается от суммы самих способов, а не от выручки периода: в
     * выручку входит продажа абонемента, которой в разрезе нет, и
     * проценты тогда не сходятся в сто.
     *
     * Порядок по величине, нулевые способы не показываются: строка
     * «Փոխանցում 0 ֏ · 0 %» сообщает ровно то же, что её отсутствие, и
     * занимает место.
     */
    @ViewBuilder
    private func paymentBreakdown(_ s: API.Summary) -> some View {
        let parts = s.split.filter { $0.revenue > 0 }.sorted { $0.revenue > $1.revenue }
        let total = parts.reduce(0) { $0 + $1.revenue }

        VStack(alignment: .leading, spacing: 13) {
            HStack {
                Text(L("today.paidWith"))
                    .font(.system(size: 13.5, weight: .semibold))
                Spacer()
                Image(systemName: "wallet.bifold")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Brand.lavenderInk)
            }

            if parts.isEmpty {
                Text(L("today.noPayments"))
                    .font(.system(size: 12.5))
                    .foregroundStyle(Brand.boardMuted)
            } else {
                ForEach(parts) { part in
                    paymentRow(part, of: total)
                }
            }
        }
        .padding(15)
        .background(Brand.boardSurface, in: .rect(cornerRadius: 20))
        .overlay {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(Brand.boardInk.opacity(0.07), lineWidth: 0.8)
        }
        .padding(.top, 10)
    }

    /**
     * Способ оплаты строкой с полосой под ней.
     *
     * Была одна общая лента из сегментов и легенда сбоку — то есть чтение
     * в два приёма: найти цвет, найти его в списке. Полоса длиной в свою
     * долю отвечает сразу, а сумма и процент стоят в той же строке.
     */
    private func paymentRow(_ part: API.SplitSegment, of total: Int) -> some View {
        let share = total > 0 ? Int((Double(part.revenue) / Double(total) * 100).rounded()) : 0

        return VStack(spacing: 6) {
            HStack(spacing: 6) {
                Circle()
                    .fill(paymentInk(part.payment))
                    .frame(width: 6, height: 6)
                Text(paymentLabel(part.payment))
                    .font(.system(size: 13))
                    .foregroundStyle(Brand.boardMuted)
                    .lineLimit(1)

                Spacer(minLength: 8)

                Text(money(part.revenue, currency))
                    .font(.system(size: 13.5, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(Brand.onBoard)
                    .lineLimit(1)
                Text("\(share)%")
                    .font(.system(size: 12))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)
                    .frame(width: 38, alignment: .trailing)
            }

            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(Brand.boardInk.opacity(0.08))
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(paymentInk(part.payment))
                        // не меньше двух процентов: нулевой ширины полоса
                        // читается как отсутствие способа, а он есть
                        .frame(width: max(proxy.size.width * CGFloat(max(share, 2)) / 100, 4))
                }
            }
            .frame(height: 6)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "\(paymentLabel(part.payment)), \(money(part.revenue, currency)), \(share)%"
        )
    }

    private func paymentInk(_ key: String) -> Color {
        switch key {
        case "cash": return Brand.mintInk
        case "card": return Brand.lavenderInk
        case "transfer": return Brand.sandInk
        case "pass": return Brand.grape
        default: return Brand.boardMuted
        }
    }

    /// Рабочий показатель: тихая поверхность и маленький функциональный
    /// знак вместо огромной декоративной пиктограммы.
    private func softMetric(
        background: Color,
        ink: Color,
        title: String,
        value: String,
        foot: String,
        symbol: String,
        animate: Double
    ) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Image(systemName: symbol)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(ink)
                .frame(width: 32, height: 32)
                .background(ink.opacity(0.1), in: .rect(cornerRadius: 10))

            Spacer(minLength: 10)

            Text(title)
                .font(.system(size: 12))
                .foregroundStyle(ink.opacity(0.8))
                .lineLimit(1)
                .minimumScaleFactor(0.75)

            Text(value)
                .font(.system(size: 21, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(ink)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .contentTransition(.numericText(value: animate))
            Text(foot.isEmpty ? " " : foot)
                .font(.system(size: 10.5))
                .foregroundStyle(ink.opacity(0.68))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .padding(.top, 1)
        }
        .padding(14)
        .frame(height: 134, alignment: .topLeading)
        .frame(maxWidth: .infinity)
        .background(background, in: .rect(cornerRadius: 20))
        .accessibilityElement(children: .combine)
    }

    // ══════════════════════════ журнал ══════════════════════════

    /**
     * Записи — строками прямо на табло, без карточки.
     *
     * Номер машины поднят в первую строку и набран крупнее всего
     * остального: это единственный опознавательный знак записи. Раньше
     * первым по левому краю стояло время, и колонка одинаковых «17:00»
     * забирала вход в строку у того, ради чего в неё смотрят.
     *
     * Кто помыл — цветом имени: на мойке два-три работника, и цвет
     * различает их быстрее, чем текст. Тот же цвет у этого человека в
     * ленте смены и в списке зарплат — цвет здесь имя, а не украшение.
     */
    @ViewBuilder
    private func journal(_ feed: [API.FeedItem]) -> some View {
        if !feed.isEmpty {
            VStack(spacing: 0) {
                HStack {
                    /* Тем же словом, что в кабинете: владелец приходит
                       смотреть не на строки базы, а на то, что за день
                       сделали. За длинный период это уже не «сегодня», и
                       раздел честно называется потоком. */
                    Text(summaryPeriod == "today" ? L("today.work") : L("owner.feed"))
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Brand.boardMuted)
                    Spacer()
                    Text(Terms.units(feed.count, session.tenant?.unitOne ?? "").trimmingCharacters(in: .whitespaces))
                        .font(.system(size: 12))
                        .monospacedDigit()
                        .foregroundStyle(Brand.boardMuted)
                }
                .padding(.horizontal, 4)
                .padding(.top, 22)
                .padding(.bottom, 4)

                ForEach(feed) { item in
                    journalRow(item)
                    if item.id != feed.last?.id {
                        Rectangle()
                            .fill(Brand.boardInk.opacity(0.07))
                            .frame(height: 1)
                    }
                }
            }
        }
    }

    private func journalRow(_ item: API.FeedItem) -> some View {
        let who = item.staffName ?? "—"
        return VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(item.clientKey ?? "—")
                    .font(.system(size: 16, weight: .semibold, design: .rounded))
                    .foregroundStyle(Brand.onBoard)
                    .lineLimit(1)
                if newestFeedID == item.id {
                    Image(systemName: "checkmark")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(Brand.goodOnBoard)
                        .symbolEffect(.drawOn, options: .nonRepeating, isActive: !reduceMotion)
                        .transition(.opacity)
                }
                Spacer(minLength: 8)
                Text(money(item.price, currency))
                    .font(.system(size: 15, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(Brand.onBoard)
            }

            /* Услуга — потому что без неё цена необъяснима: 2 500 и 12 000 в
               соседних строках выглядят ошибкой, пока не видно, что одно это
               кузов, а другое химчистка. Способ оплаты словом, а не значком:
               значок карты и значок перевода на 10 точках различаются только
               если знать, что они разные. */
            HStack(spacing: 4) {
                Text(at(item.createdAt))
                    .monospacedDigit()
                Text("·")
                    .foregroundStyle(Brand.boardMuted.opacity(0.6))
                Text(item.serviceName)
                Text("·")
                    .foregroundStyle(Brand.boardMuted.opacity(0.6))
                Text(paymentLabel(item.payment).lowercased())
            }
            .font(.system(size: 12))
            .foregroundStyle(Brand.boardMuted)
            .lineLimit(1)
            .truncationMode(.tail)

            /* Кто помыл и как разошлись деньги — одной строкой, теми же
               словами, что в кабинете.

               Раньше здесь стояло только «նրան 2 500 ֏»: сколько ушло
               человеку, было видно, а сколько осталось мойке — нет, и
               владелец вычитал в уме на каждой строке. Это и есть главная
               арифметика продукта, и показывать из неё половину значит
               оставлять вопрос открытым.

               При нулевой ставке строки долей нет вовсе: у владельца,
               который записывает сам, процента нет, и «ему 0 ֏» в каждой
               записи — шум. */
            HStack(spacing: 6) {
                Circle()
                    .fill(Brand.person(who))
                    .frame(width: 6, height: 6)
                Text(who)
                    .fontWeight(.semibold)
                    .foregroundStyle(Brand.person(who))
                    .lineLimit(1)

                Spacer(minLength: 8)

                if (item.staffPercent ?? 0) > 0 {
                    Text(L("summary.share", money(item.earned, currency)))
                        .monospacedDigit()
                        .foregroundStyle(Brand.boardMuted)
                        .lineLimit(1)
                    Text("·")
                        .foregroundStyle(Brand.boardMuted.opacity(0.6))
                }
                Text(L("summary.toBusiness", money(item.price - item.earned, currency)))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)
                    .lineLimit(1)
            }
            .font(.system(size: 12))
            .padding(.top, 1)
        }
        .padding(.horizontal, 4)
        .padding(.vertical, 11)
        .background(
            newestFeedID == item.id ? Brand.lime.opacity(0.1) : Color.clear,
            in: .rect(cornerRadius: 12)
        )
        .transition(
            reduceMotion
                ? .opacity
                : .move(edge: .top).combined(with: .opacity)
        )
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(who), \(item.clientKey ?? "")")
        // Отмена мягкая: запись остаётся в истории и в аудите, но перестаёт
        // попадать в выручку и зарплату. Поэтому и спрашиваем — вернуть её
        // обратно нельзя.
        .contextMenu {
            Button(L("work.revoke"), role: .destructive) {
                cancelling = item
            }
        }
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
            Button(L("common.retry")) { Task { await reload() } }
                .buttonStyle(.glass)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 60)
    }

    // ══════════════════════════ текст и данные ══════════════════════════

    private var isLoss: Bool { (summary?.profit ?? 0) < 0 }

    /* Не «շահույթ»: от «հասույթ» на плитке оно отличается одной буквой и
       звучит почти так же. Два похожих слова с разными числами на одном
       экране путают даже автора продукта. «Вам остаётся» ни на что не
       похоже, потому что это не термин, а обычная речь. */
    private var profitTitle: String {
        switch summaryPeriod {
        case "month": return isLoss ? L("summary.redMonth") : L("summary.keptMonth")
        case "prevmonth": return isLoss ? L("summary.redPrevMonth") : L("summary.keptPrevMonth")
        default: return isLoss ? L("summary.redToday") : L("summary.keptToday")
        }
    }

    /* «Заплатили», а не «выручка»: `հասույթ` отличается от `շահույթ` одной
       буквой, и два похожих слова с разными числами на одном экране путают
       даже автора продукта. Обычная речь ни на что не похожа и потому
       читается однозначно. */
    private var paidTitle: String {
        switch summaryPeriod {
        case "month": return L("summary.paidMonth")
        case "prevmonth": return L("summary.paidPrevMonth")
        default: return L("summary.paidToday")
        }
    }

    private var spentTitle: String {
        switch summaryPeriod {
        case "month": return L("summary.spentMonth")
        case "prevmonth": return L("summary.spentPrevMonth")
        default: return L("summary.spentToday")
        }
    }

    /// Дата обязательна всегда, включая «сегодня»: сутки считаются по времени
    /// бизнеса и в полночь начинаются заново. Владелец, открывший приложение
    /// в половине первого, видел ноль и решал, что данные ушли.
    private var periodDates: String {
        let f = DateFormatter()
        f.locale = LangStore.currentLang.locale
        /* Шаблон, а не жёсткий формат: от языка зависит не только имя
           месяца, но и порядок. «16 августа» и «August 16» — одна и та же
           дата, записанная так, как её пишет язык. */
        f.setLocalizedDateFormatFromTemplate("d MMMM")
        guard let from = summary?.from, summaryPeriod != "today" else {
            return f.string(from: summary?.from ?? Date())
        }
        /* Верхнюю границу берём из ответа, а не из «сегодня»: у закрытого
           прошлого месяца период кончился, и подписывать его сегодняшним
           числом — врать. Старый сервер её не пришлёт, тогда «по сейчас». */
        return range(from, summary?.to ?? Date().addingTimeInterval(1))
    }

    private var profitChange: (label: String, base: String, diff: String, up: Bool)? {
        guard let s = summary else { return nil }

        // Сравнивать не с чем: бизнес завёлся недавно, прошлого месяца у него
        // не было. «+100 %» от пустоты — не новость, а деление на ноль в
        // другой одежде.
        guard (s.previous.count ?? 1) > 0 else { return nil }

        let diff = s.profit - s.previous.profit
        guard abs(diff) >= 100 else { return nil }

        let label: String
        if summaryPeriod == "today" {
            label = L("summary.vsLastWeek")
        } else if let f = s.previous.from, let t = s.previous.to {
            label = range(f, t)
        } else {
            label = L("summary.vsPrevMonth")
        }

        return (
            label,
            money(s.previous.profit, currency),
            "\(diff > 0 ? "+" : "−")\(money(abs(diff), currency))",
            diff > 0
        )
    }

    /// «1 — 7 օգոստոսի». Месяц не повторяется дважды, когда он один.
    private func range(_ from: Date, _ to: Date) -> String {
        let full = DateFormatter()
        full.locale = LangStore.currentLang.locale
        full.setLocalizedDateFormatFromTemplate("d MMMM")
        let dayOnly = DateFormatter()
        dayOnly.locale = full.locale
        dayOnly.dateFormat = "d"

        // верхняя граница исключающая: последний показанный день — накануне
        let last = to.addingTimeInterval(-1)
        let cal = Calendar(identifier: .gregorian)
        let sameMonth = cal.component(.month, from: from) == cal.component(.month, from: last)
        return sameMonth
            ? "\(dayOnly.string(from: from)) — \(full.string(from: last))"
            : "\(full.string(from: from)) — \(full.string(from: last))"
    }

    /// Время в зоне бизнеса, а не устройства: владелец в поездке видел
    /// смену, начатую в шесть утра.
    private func clock() -> DateFormatter {
        let f = DateFormatter()
        f.locale = LangStore.currentLang.locale
        f.dateFormat = "HH:mm"
        if let tz = session.tenant?.timezone, let zone = TimeZone(identifier: tz) {
            f.timeZone = zone
        }
        return f
    }

    private func at(_ date: Date) -> String { clock().string(from: date) }

    /// «с 09:40» — время выхода, а не длительность: длительность пришлось бы
    /// пересчитывать каждую минуту, иначе она врёт.
    private func since(_ date: Date) -> String { L("summary.since", clock().string(from: date)) }

    private func cancel(_ item: API.FeedItem) async {
        _ = try? await session.authed { token in
            try await APIClient.shared.raw(
                "orders/\(item.id)/cancel",
                method: "POST",
                token: token
            )
        }
        await reload()
    }

    private func selectPeriod(_ key: String) async {
        guard key != period else { return }

        if reduceMotion {
            detailsVisible = false
        } else {
            withAnimation(.easeOut(duration: 0.12)) {
                detailsVisible = false
            }
        }
        period = key
        await reload(staged: true)
    }

    private func reload(staged: Bool = false) async {
        loadID += 1
        let id = loadID
        let requestedPeriod = period
        loading = true
        defer {
            if id == loadID { loading = false }
        }

        /* Поводы тянем вместе со сводкой и молча: колокольчик — не то,
           ради чего открывают экран, и его отказ не должен мешать
           показать выручку. */
        Task {
            let fresh: API.Alerts? = try? await session.authed { token in
                try await APIClient.shared.send("alerts", token: token, as: API.Alerts.self)
            }
            if let fresh { alerts = fresh.alerts }
        }

        do {
            let fresh = try await session.authed { token in
                try await APIClient.shared.send(
                    "summary?period=\(requestedPeriod)",
                    token: token,
                    as: API.Summary.self
                )
            }

            guard id == loadID, requestedPeriod == period else { return }

            let oldIDs = Set(summary?.feed.map(\.id) ?? [])
            let inserted = staged ? nil : fresh.feed.first { !oldIDs.contains($0.id) }

            /* Числа перекручиваются разрядами при смене периода — так видно,
               что это то же число за другой срок, а не другой экран.

               Первая загрузка идёт без анимации: прокрутка от нуля к сумме на
               старте читается как индикатор загрузки, а не как смысл. */
            if summary == nil || reduceMotion {
                summary = fresh
                summaryPeriod = requestedPeriod
                newestFeedID = inserted?.id
            } else {
                withAnimation(.spring(response: 0.38, dampingFraction: 0.94)) {
                    summary = fresh
                    summaryPeriod = requestedPeriod
                    newestFeedID = inserted?.id
                }
            }
            failure = nil

            if staged && !reduceMotion {
                try? await Task.sleep(for: .milliseconds(110))
            }
            withAnimation(reduceMotion ? .easeOut(duration: 0.12) : .easeOut(duration: 0.2)) {
                detailsVisible = true
            }

            if inserted != nil {
                Task { @MainActor in
                    try? await Task.sleep(for: .milliseconds(850))
                    withAnimation(.easeOut(duration: 0.18)) { newestFeedID = nil }
                }
            }
        } catch is CancellationError {
            /* Потянули вниз и отпустили, или ушли с экрана. Ничего не
               сломалось — и экран об этом молчит: прежнее содержимое
               остаётся на месте. */
            return
        } catch let error as APIError {
            detailsVisible = true
            period = summaryPeriod
            failure = error.isOffline
                ? L("errors.offline")
                : L("errors.server", "\(error.status) \(error.code ?? "—")")
        } catch {
            detailsVisible = true
            period = summaryPeriod
            // разбор ответа: показываем как есть — это баг, а не сбой сети, и
            // прятать его за «попробуйте позже» значит никогда не найти
            failure = "\(error)"
        }
    }
}
