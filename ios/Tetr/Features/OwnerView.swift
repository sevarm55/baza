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

    private let periods = [("today", "Այսօր"), ("month", "Այս ամիս"), ("prevmonth", "Անցյալ ամիս")]

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
            "Չեղարկե՞լ այս գրանցումը",
            isPresented: .init(get: { cancelling != nil }, set: { if !$0 { cancelling = nil } })
        ) {
            Button("Ոչ", role: .cancel) { cancelling = nil }
            Button("Չեղարկել", role: .destructive) {
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
                "Ժամանակահատված",
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
                Image(systemName: alerts.isEmpty ? "bell" : "bell.badge")
                    .font(.system(size: 15, weight: .semibold))
                    .contentTransition(.symbolEffect(.replace.magic(fallback: .downUp)))
                    .frame(width: 38, height: 38)
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
            .accessibilityLabel("Ուշադրություն")
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
                moneySource("Վճարել են", amount: s.stats.revenue, sign: "+", ink: Brand.mintInk)
                sourceDivider
                moneySource("Աշխատակիցներին", amount: s.stats.payroll, sign: "−", ink: Brand.lavenderInk)
                sourceDivider
                moneySource("Ծախսեր", amount: s.costs.total, sign: "−", ink: Brand.sandInk)
            }
            .padding(.vertical, 10)
            .background(Brand.boardSurface, in: .rect(cornerRadius: 19))
            .overlay {
                RoundedRectangle(cornerRadius: 19, style: .continuous)
                    .strokeBorder(Brand.boardInk.opacity(0.07), lineWidth: 0.8)
            }
            .padding(.top, 10)
            .frame(maxWidth: 360)
            .accessibilityLabel(
                "Հասույթ \(plain(s.stats.revenue)), ծախս \(plain(s.costs.total)),"
                + " աշխատակիցներին \(plain(s.stats.payroll))"
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
                StaffView().navigationTitle(session.tenant?.staffRole ?? "Աշխատակիցներ")
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
                present.map { "\($0.name) հերթափոխին \(since($0.openedAt))" }.joined(separator: ", ")
            )
        }
    }

    // ══════════════════════════ содержание периода ══════════════════════════

    @ViewBuilder
    private func details(_ s: API.Summary) -> some View {
        if summaryPeriod == "today" {
            todaySnapshot(s)
            wave(s.series)
            journal(s.feed)
        } else {
            wave(s.series)
            grid(s)
            journal(s.feed)
        }
    }

    /**
     * Быстрый ответ для сегодняшнего дня. Три показателя стоят одной
     * строкой без трёх цветных карточек: сначала итог наверху, затем объём,
     * наличные и люди. Приход уже объяснён над строкой и здесь не
     * повторяется второй раз.
     */
    private func todaySnapshot(_ s: API.Summary) -> some View {
        HStack(spacing: 0) {
            snapshotValue("Սպասարկվել է", "\(s.stats.count)")
            snapshotDivider
            snapshotValue("Կանխիկ", money(s.stats.cash, currency))
            snapshotDivider
            snapshotValue("Հերթափոխին", "\(s.onShift.count)")
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
    private func wave(_ series: [API.SeriesPoint]) -> some View {
        if !series.isEmpty {
            let peak = max(1, series.map(\.revenue).max() ?? 1)
            let peakIndex = series.firstIndex(where: { $0.revenue == peak }) ?? 0
            let values = series.map { Double($0.revenue) / Double(peak) }
            let live = series.indices.filter { series[$0].revenue > 0 }
            let marks = live.count <= 10 ? live : [peakIndex]

            VStack(alignment: .leading, spacing: 7) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(chartTitle)
                        .font(.system(size: 12.5, weight: .semibold))
                        .foregroundStyle(Brand.boardMuted)
                    Spacer(minLength: 0)
                    /* Пик подписью, а не догадкой по картинке. Со словом,
                       а не голыми «07 · 146 500 ֏»: два числа через точку
                       в углу графика каждый прочитает по-своему, и чаще
                       всего — как итог за период. */
                    Text("ամենաշատը՝ \(axis(series[peakIndex])) · \(money(peak, currency))")
                        .font(.system(size: 11.5))
                        .monospacedDigit()
                        .foregroundStyle(Brand.boardMuted)
                        .lineLimit(1)
                }

                GeometryReader { geo in
                    let pts = points(values, in: geo.size)
                    ZStack(alignment: .topLeading) {
                        if pts.count > 1 {
                            Wave(points: pts, closedTo: geo.size.height)
                                .fill(
                                    LinearGradient(
                                        colors: [Brand.onBoard.opacity(0.13), Brand.onBoard.opacity(0)],
                                        startPoint: .top,
                                        endPoint: .bottom
                                    )
                                )
                            Wave(points: pts)
                                .stroke(
                                    Brand.onBoard.opacity(0.62),
                                    style: .init(lineWidth: 1.6, lineCap: .round, lineJoin: .round)
                                )
                        }
                        ForEach(marks, id: \.self) { i in
                            if pts.indices.contains(i) {
                                Circle()
                                    .fill(Brand.lime)
                                    .frame(
                                        width: i == peakIndex ? 7 : 4.5,
                                        height: i == peakIndex ? 7 : 4.5
                                    )
                                    /* Обводка цветом полотна: на светлой теме
                                       лайм по светлому почти не виден, и точка
                                       читается только тем, что вырезана из
                                       линии. */
                                    .overlay(
                                        Circle().strokeBorder(Brand.board, lineWidth: i == peakIndex ? 1.5 : 1)
                                    )
                                    .position(pts[i])
                            }
                        }
                    }
                }
                .frame(height: 60)

                axisLabels(series)
            }
            .padding(.top, 18)
        }
    }

    /**
     * Четыре отметки по ширине: начало, две внутри, конец. Больше не нужно —
     * подписи здесь дают масштаб, а не отсчёт.
     *
     * Номера точек подобраны под МЕСТА подписей, а не наоборот. Четыре
     * равные колонки ставят свои середины на 0, 37.5, 62.5 и 100 процентов
     * ширины; если брать точки через треть ряда, подпись «04» встаёт над
     * пятым днём, и график начинает врать на четверть колонки — тем
     * обиднее, что врёт он ровно в том, ради чего подписи и появились.
     *
     * Короткий ряд подписывается целиком: на трёх точках выбирать нечего.
     */
    @ViewBuilder
    private func axisLabels(_ series: [API.SeriesPoint]) -> some View {
        let last = series.count - 1
        let picks: [Int] = last <= 3
            ? Array(0...max(0, last))
            : [
                0,
                Int((Double(last) * 0.375).rounded()),
                Int((Double(last) * 0.625).rounded()),
                last
            ]

        HStack(spacing: 0) {
            ForEach(Array(picks.enumerated()), id: \.offset) { i, index in
                Text(axis(series[min(max(index, 0), last)]))
                    .font(.system(size: 10.5))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted.opacity(0.85))
                    .frame(
                        maxWidth: .infinity,
                        alignment: picks.count == 1
                            ? .center
                            : (i == 0 ? .leading : (i == picks.count - 1 ? .trailing : .center))
                    )
            }
        }
        .accessibilityHidden(true)
    }

    private var chartTitle: String {
        summaryPeriod == "today" ? "Օրվա վճարումները" : "Ամսվա վճարումները"
    }

    private func axis(_ point: API.SeriesPoint?) -> String {
        guard let point else { return "" }
        return summaryPeriod == "today" ? "\(point.hourLabel):00" : point.dayLabel
    }

    /// У единственного часа нет линии, но есть точка и подпись: сегодняшний
    /// график не должен исчезать только потому, что обе машины приехали в
    /// один час.
    private func points(_ values: [Double], in size: CGSize) -> [CGPoint] {
        let top: CGFloat = 6
        let usable = size.height - top * 2
        if values.count == 1 {
            return [CGPoint(x: size.width / 2, y: top + usable * (1 - CGFloat(values[0])))]
        }
        guard values.count > 1 else { return [] }
        let step = size.width / CGFloat(values.count - 1)
        return values.enumerated().map { i, v in
            CGPoint(x: CGFloat(i) * step, y: top + usable * (1 - CGFloat(v)))
        }
    }

    // ══════════════════════════ финансовые детали ══════════════════════════

    /** За длинный период финансовая формула уже видна сверху. Здесь только
        два операционных показателя и структура оплат — данные, которых в
        формуле нет, поэтому ни одна большая сумма не повторяется. */
    private func grid(_ s: API.Summary) -> some View {
        let unit = session.tenant?.unitOne ?? ""

        return VStack(spacing: gap) {
            HStack(spacing: gap) {
                softMetric(
                    background: Brand.mintCard,
                    ink: Brand.mintInk,
                    title: "Սպասարկվել է",
                    value: "\(s.stats.count) \(unit)".trimmingCharacters(in: .whitespaces),
                    foot: "այս ժամանակահատվածում",
                    symbol: "car.fill",
                    animate: Double(s.stats.count)
                )
                softMetric(
                    background: Brand.lavenderCard,
                    ink: Brand.lavenderInk,
                    title: "Միջին վճարումը",
                    value: money(s.stats.avgCheck, currency),
                    foot: unit.isEmpty ? "" : "մեկ \(ablative(unit))",
                    symbol: "creditcard.fill",
                    animate: Double(s.stats.avgCheck)
                )
            }

            paymentBreakdown(s)
        }
        .padding(.top, 20)
    }

    private func paymentBreakdown(_ s: API.Summary) -> some View {
        VStack(alignment: .leading, spacing: 13) {
            HStack {
                Text("Վճարման եղանակները")
                    .font(.system(size: 13.5, weight: .semibold))
                Spacer()
                Image(systemName: "wallet.bifold")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Brand.lavenderInk)
            }

            if s.split.isEmpty {
                Text("Դեռ վճարումներ չկան")
                    .font(.system(size: 12.5))
                    .foregroundStyle(Brand.boardMuted)
            } else {
                GeometryReader { proxy in
                    HStack(spacing: 3) {
                        ForEach(s.split) { part in
                            RoundedRectangle(cornerRadius: 3, style: .continuous)
                                .fill(paymentInk(part.payment))
                                .frame(
                                    width: max(
                                        5,
                                        (proxy.size.width - CGFloat(s.split.count - 1) * 3)
                                            * CGFloat(part.revenue) / CGFloat(max(1, s.stats.revenue))
                                    )
                                )
                        }
                    }
                }
                .frame(height: 7)

                HStack(alignment: .top, spacing: 8) {
                    ForEach(s.split) { part in
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 5) {
                                Circle()
                                    .fill(paymentInk(part.payment))
                                    .frame(width: 6, height: 6)
                                Text(paymentLabel(part.payment))
                                    .font(.system(size: 10.5, weight: .medium))
                                    .foregroundStyle(Brand.boardMuted)
                                    .lineLimit(1)
                            }
                            Text(money(part.revenue, currency))
                                .font(.system(size: 12.5, weight: .bold, design: .rounded))
                                .monospacedDigit()
                                .lineLimit(1)
                                .minimumScaleFactor(0.62)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        }
        .padding(15)
        .background(Brand.boardSurface, in: .rect(cornerRadius: 20))
        .overlay {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(Brand.boardInk.opacity(0.07), lineWidth: 0.8)
        }
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
                    Text("Վերջին սպասարկումները")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Brand.boardMuted)
                    Spacer()
                    Text("\(feed.count) \(session.tenant?.unitOne ?? "")".trimmingCharacters(in: .whitespaces))
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

            HStack(spacing: 4) {
                Text(at(item.createdAt))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)
                Text("·")
                    .foregroundStyle(Brand.boardMuted.opacity(0.6))
                Text(who)
                    .fontWeight(.semibold)
                    .foregroundStyle(Brand.person(who))
            }
            .font(.system(size: 12))
            .lineLimit(1)

            /* Услуга — потому что без неё цена необъяснима: 2 500 и 12 000 в
               соседних строках выглядят ошибкой, пока не видно, что одно это
               кузов, а другое химчистка. Способ оплаты словом, а не значком:
               значок карты и значок перевода на 10 точках различаются только
               если знать, что они разные.
               Доля работника — там же, третьей мелочью: она уже посчитана в
               «Աշխատակցին» наверху, и отдельной колонки не стоит, но по
               конкретной записи её спрашивают чаще всего. */
            HStack(spacing: 4) {
                Text(item.serviceName)
                Text("·")
                    .foregroundStyle(Brand.boardMuted.opacity(0.6))
                Text(paymentLabel(item.payment).lowercased())
                // При нулевой ставке доли нет: у владельца, который
                // записывает сам, процента нет, и «ему 0 ֏» в каждой
                // строке — шум.
                if (item.staffPercent ?? 0) > 0 {
                    Text("·")
                        .foregroundStyle(Brand.boardMuted.opacity(0.6))
                    Text("նրան \(money(item.earned, currency))")
                        .monospacedDigit()
                }
            }
            .font(.system(size: 12))
            .foregroundStyle(Brand.boardMuted)
            .lineLimit(1)
            .truncationMode(.tail)
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
            Button("Չեղարկել գրանցումը", role: .destructive) {
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
            Button("Կրկնել") { Task { await reload() } }
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
        case "month": return isLoss ? "Այս ամիս մինուսի մեջ եք" : "Այս ամիս ձեզ մնում է"
        case "prevmonth": return isLoss ? "Անցյալ ամիս մինուսում էիք" : "Անցյալ ամիս ձեզ մնացել է"
        default: return isLoss ? "Այսօր մինուսի մեջ եք" : "Այսօր ձեզ մնում է"
        }
    }

    /* «Заплатили», а не «выручка»: `հասույթ` отличается от `շահույթ` одной
       буквой, и два похожих слова с разными числами на одном экране путают
       даже автора продукта. Обычная речь ни на что не похожа и потому
       читается однозначно. */
    private var paidTitle: String {
        switch summaryPeriod {
        case "month": return "Այս ամիս վճարել են"
        case "prevmonth": return "Անցյալ ամիս վճարել են"
        default: return "Այսօր վճարել են"
        }
    }

    private var spentTitle: String {
        switch summaryPeriod {
        case "month": return "Այս ամիս ծախսվել է"
        case "prevmonth": return "Անցյալ ամիս ծախսվել է"
        default: return "Այսօր ծախսվել է"
        }
    }

    /// Дата обязательна всегда, включая «сегодня»: сутки считаются по времени
    /// бизнеса и в полночь начинаются заново. Владелец, открывший приложение
    /// в половине первого, видел ноль и решал, что данные ушли.
    private var periodDates: String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "hy_AM")
        f.dateFormat = "d MMMM"
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
            label = "մեկ շաբաթ առաջ այս ժամին"
        } else if let f = s.previous.from, let t = s.previous.to {
            label = range(f, t)
        } else {
            label = "նախորդ ամիս"
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
        full.locale = Locale(identifier: "hy_AM")
        full.dateFormat = "d MMMM"
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
        f.locale = Locale(identifier: "hy_AM")
        f.dateFormat = "HH:mm"
        if let tz = session.tenant?.timezone, let zone = TimeZone(identifier: tz) {
            f.timeZone = zone
        }
        return f
    }

    private func at(_ date: Date) -> String { clock().string(from: date) }

    /// «с 09:40» — время выхода, а не длительность: длительность пришлось бы
    /// пересчитывать каждую минуту, иначе она врёт.
    private func since(_ date: Date) -> String { "\(clock().string(from: date))-ից" }

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
                ? "Կապ չկա։"
                : "Սերվերը չպատասխանեց (\(error.status) \(error.code ?? "—"))"
        } catch {
            detailsVisible = true
            period = summaryPeriod
            // разбор ответа: показываем как есть — это баг, а не сбой сети, и
            // прятать его за «попробуйте позже» значит никогда не найти
            failure = "\(error)"
        }
    }
}
