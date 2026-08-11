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
    @State private var failure: String?
    @State private var cancelling: API.FeedItem?
    /// Идёт запрос. Виден только знаком обновления: отдельный индикатор
    /// занял бы место и сказал бы ровно то же.
    @State private var loading = false
    @Namespace private var pill

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
                    wave(s.series)
                    grid(s)
                    journal(s.feed)
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
     * Период — ряд плашек, обновление — кружок справа.
     *
     * Ряд стоит на самом табло, без подложки и без карточки: это органы
     * прибора, а не панель над содержимым.
     *
     * Плашки прямоугольные со скруглением 11, а не капсулы: капсул в
     * продукте нет нигде — ни на кнопках, ни на полях, ни на вкладках.
     * Острая форма про точность, а этот экран про деньги.
     *
     * Невыбранные — тёплый серый, а не нейтральный: полотно табло тёплое,
     * и холодный серый чип на нём выглядит вырезанным из чужого
     * интерфейса.
     */
    private var chips: some View {
        HStack(spacing: 6) {
            ForEach(periods, id: \.0) { key, label in
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { period = key }
                    Task { await reload() }
                } label: {
                    Text(label)
                        .font(.system(size: 13, weight: .semibold))
                        /* Выбранная плашка залита чернилами табло, поэтому
                           текст на ней — цвет самого табло. `onBoard` здесь
                           брать нельзя: он тех же чернил, и надпись
                           пропадала начисто. */
                        .foregroundStyle(period == key ? Brand.board : Brand.boardMuted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                        .padding(.horizontal, 13)
                        .padding(.vertical, 9)
                        .frame(minHeight: 38)
                        .background {
                            let shape = RoundedRectangle(cornerRadius: 11, style: .continuous)
                            if period == key {
                                shape
                                    .fill(Brand.boardInk)
                                    .matchedGeometryEffect(id: "period", in: pill)
                            } else {
                                shape.fill(Brand.chipRest)
                            }
                        }
                        .contentShape(.rect(cornerRadius: 11))
                }
                .buttonStyle(.plain)
            }

            Spacer(minLength: 8)

            Button {
                Task { await reload() }
            } label: {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Brand.boardMuted)
                    .frame(width: 38, height: 38)
                    .background(Brand.chipRest, in: .circle)
                    // вращение и есть видимый признак «идёт запрос»
                    .rotationEffect(.degrees(loading && !reduceMotion ? 360 : 0))
                    .animation(
                        loading && !reduceMotion
                            ? .linear(duration: 0.9).repeatForever(autoreverses: false)
                            : .default,
                        value: loading
                    )
            }
            .accessibilityLabel("Թարմացնել")
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

    /**
     * Откуда взялось главное число: приход минус расходы минус доля людей.
     *
     * Единственная строка на экране, которую можно проверить арифметикой.
     * Раньше её не было вовсе: три слагаемых лежали по разным плиткам, и
     * чтобы понять, почему осталось именно столько, владелец складывал их
     * сам — а половина ошибок доверия к продукту начинается ровно здесь,
     * с «а почему так мало».
     *
     * Порядок тот же, в каком человек считает вслух: сколько принесли,
     * сколько отдал, сколько вышло. Знак минуса настоящий, U+2212 —
     * дефис между разрядами читается частью числа.
     *
     * Валюта только у результата: четыре значка ֏ в одной строке
     * превращают вычитание в список сумм.
     */
    @ViewBuilder
    private func breakdown(_ s: API.Summary) -> some View {
        // Считать нечего: без прихода и расходов строка «0 − 0 = 0» это шум.
        if s.stats.revenue > 0 || s.costs.total > 0 || s.stats.payroll > 0 {
            /* Минус у результата тоже настоящий, U+2212. Через `money()` он
               приходил дефисом, и в строке из трёх настоящих минусов
               четвёртый выпадал коротким штрихом. */
            Text(
                "\(plain(s.stats.revenue)) − \(plain(s.costs.total)) − \(plain(s.stats.payroll)) = "
                + (s.profit < 0 ? "−" : "") + money(abs(s.profit), currency)
            )
            .font(.system(size: 12))
            .monospacedDigit()
            .foregroundStyle(Brand.boardMuted)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .padding(.top, 4)
            .accessibilityLabel(
                "Հասույթ \(plain(s.stats.revenue)), ծախս \(plain(s.costs.total)),"
                + " աշխատակիցներին \(plain(s.stats.payroll)), մնում է \(money(s.profit, currency))"
            )
        }
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
        if series.count > 1 {
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
                        alignment: i == 0 ? .leading : (i == picks.count - 1 ? .trailing : .center)
                    )
            }
        }
        .accessibilityHidden(true)
    }

    private var chartTitle: String {
        period == "today" ? "Օրվա վճարումները" : "Ամսվա վճարումները"
    }

    private func axis(_ point: API.SeriesPoint?) -> String {
        guard let point else { return "" }
        return period == "today" ? "\(point.hourLabel):00" : point.dayLabel
    }

    /// Точки волны. Единственное значение не рисуется вовсе — линия по
    /// одной точке это не линия.
    private func points(_ values: [Double], in size: CGSize) -> [CGPoint] {
        guard values.count > 1 else { return [] }
        let step = size.width / CGFloat(values.count - 1)
        let top: CGFloat = 6
        let usable = size.height - top * 2
        return values.enumerated().map { i, v in
            CGPoint(x: CGFloat(i) * step, y: top + usable * (1 - CGFloat(v)))
        }
    }

    // ══════════════════════════ сетка плиток ══════════════════════════

    /**
     * Сетка показателей. Одна плитка — один показатель, и ни одна не
     * повторяет цифру наверху.
     *
     * Широкая плитка — приход и то, какая его доля осталась владельцу.
     * Кольцо в ней и есть весь разбор: заполненная дуга — то, что осталось,
     * пустая — то, что ушло. Отдельного блока с вычитанием нет: вычитание
     * требовало читать вычисление, кольцо читается взглядом.
     *
     * Ниже четыре мелких: зарплата, расходы, машины, средний чек.
     */
    private func grid(_ s: API.Summary) -> some View {
        let base = max(1, s.stats.revenue)
        let keptShare = Double(max(0, s.profit)) / Double(base)
        let unit = session.tenant?.unitOne ?? ""

        return VStack(spacing: gap) {
            paid(s, keptShare: keptShare)

            HStack(spacing: gap) {
                metric(
                    .teal, "Աշխատակցին", money(s.stats.payroll, currency),
                    foot: "վճարումների \(Int((Double(s.stats.payroll) / Double(base) * 100).rounded()))%-ը",
                    symbol: "percent", animate: Double(s.stats.payroll)
                )
                metric(
                    .amber, spentTitle, money(s.costs.total, currency),
                    foot: expensesNote(s),
                    symbol: "arrow.down", animate: Double(s.costs.total)
                )
            }

            HStack(spacing: gap) {
                /* Единица приходит с сервера: у мойки это машина, у барбера
                   клиент. Слово подставляется к числу, а не берётся
                   заголовком, — «Սպասարկվել է 2 մեքենա» это предложение, а
                   «մեքենա / 2» было подписью к цифре. */
                metric(
                    .lime, "Սպասարկվել է", "\(s.stats.count) \(unit)".trimmingCharacters(in: .whitespaces),
                    foot: "", symbol: "car.fill", animate: Double(s.stats.count)
                )
                metric(
                    .indigo, "Միջին վճարումը", money(s.stats.avgCheck, currency),
                    foot: unit.isEmpty ? "" : "մեկ \(ablative(unit))",
                    symbol: "creditcard.fill", animate: Double(s.stats.avgCheck)
                )
            }
        }
        .padding(.top, 20)
    }

    /**
     * Приход и доля, которая от него осталась.
     *
     * Кольцо и есть весь разбор: заполненная дуга — то, что осталось,
     * пустая — то, что ушло. Под ним обязательна подпись: процент без
     * объяснения — самая дорогая ошибка на таком экране, потому что каждый
     * прочитает в нём своё. «Вам остаётся» отвечает раз и навсегда.
     *
     * Плитка одна широкая и единственная крупная в сетке: приход — второе
     * по важности число после того, что осталось, и оно не должно спорить
     * с четырьмя мелкими.
     */
    private func paid(_ s: API.Summary, keptShare: Double) -> some View {
        HStack(alignment: .center, spacing: 14) {
            VStack(alignment: .leading, spacing: 3) {
                ToneAccent(tone: .violet)
                Text(paidTitle)
                    .font(.system(size: 12.5))
                    .foregroundStyle(.white.opacity(0.72))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Text(money(s.stats.revenue, currency))
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                    .contentTransition(.numericText(value: Double(s.stats.revenue)))
            }

            Spacer(minLength: 0)

            VStack(spacing: 4) {
                Ring(share: keptShare)
                    .frame(width: 68, height: 68)
                Text("ձեզ մնում է")
                    .font(.system(size: 10.5))
                    .foregroundStyle(.white.opacity(0.72))
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Ձեզ մնում է")
            .accessibilityValue("\(Int((keptShare * 100).rounded())) տոկոս")
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .auroraTile(.violet, radius: 24)
    }

    /**
     * Мелкая плитка показателя.
     *
     * Устройство ровно то же, что у плиток на экране разделов: засечка и
     * подпись сверху, число внизу, крупный полупрозрачный знак в правом
     * верхнем углу. Четыре плитки одного размера, одного скругления, с
     * одним направлением света — набор приборов, а не четыре виджета.
     *
     * Знак приглушён сильнее, чем на разделах (`calm`): там он опознавал
     * раздел, здесь на плитке уже стоит число, и второй крупный объект
     * рядом с ним начинает спорить.
     */
    private func metric(
        _ tone: Tone,
        _ title: String,
        _ value: String,
        foot: String,
        symbol: String,
        animate: Double
    ) -> some View {
        ZStack(alignment: .topTrailing) {
            ToneMark(symbol: symbol, tone: tone, size: 54, offset: CGSize(width: 10, height: -4), calm: true)

            VStack(alignment: .leading, spacing: 0) {
                ToneAccent(tone: tone).padding(.bottom, 7)
                Text(title)
                    .font(.system(size: 12))
                    .foregroundStyle(tone.ink.opacity(0.72))
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)

                Spacer(minLength: 8)

                Text(value)
                    .font(.system(size: 22, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(tone.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                    .contentTransition(.numericText(value: animate))
                /* Пустая приписка занимает свою строку пробелом, а не
                   исчезает. Иначе у плитки без приписки число опускается
                   на её высоту ниже соседней, и четыре показателя в сетке
                   стоят на четырёх разных уровнях. */
                Text(foot.isEmpty ? " " : foot)
                    .font(.system(size: 11))
                    .monospacedDigit()
                    .foregroundStyle(tone.ink.opacity(0.72))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .padding(.top, 1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(15)
        .frame(height: 118, alignment: .topLeading)
        .frame(maxWidth: .infinity)
        .auroraTile(tone, radius: 24)
        .accessibilityElement(children: .combine)
    }

    private func expensesNote(_ s: API.Summary) -> String {
        // Без этой приписки владелец скажет «я столько сегодня не тратил», и
        // будет прав: в сумме сидит доля месячной аренды. Она важнее общего
        // «все расходы» и потому стоит первой.
        if s.costs.monthlyShare > 0 && period == "today" { return "ամսականից օրվա բաժինը" }
        if s.costs.oneOff > 0 && s.costs.monthlyShare == 0 { return "միանվագ" }
        return "բոլոր ծախսերը"
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
        switch period {
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
        switch period {
        case "month": return "Այս ամիս վճարել են"
        case "prevmonth": return "Անցյալ ամիս վճարել են"
        default: return "Այսօր վճարել են"
        }
    }

    private var spentTitle: String {
        switch period {
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
        guard let from = summary?.from, period != "today" else {
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
        if period == "today" {
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

    private func reload() async {
        loading = true
        defer { loading = false }
        do {
            let fresh = try await session.authed { token in
                try await APIClient.shared.send(
                    "summary?period=\(period)",
                    token: token,
                    as: API.Summary.self
                )
            }

            /* Числа перекручиваются разрядами при смене периода — так видно,
               что это то же число за другой срок, а не другой экран.

               Первая загрузка идёт без анимации: прокрутка от нуля к сумме на
               старте читается как индикатор загрузки, а не как смысл. */
            if summary == nil || reduceMotion {
                summary = fresh
            } else {
                withAnimation(.snappy(duration: 0.45)) { summary = fresh }
            }
            failure = nil
        } catch is CancellationError {
            /* Потянули вниз и отпустили, или ушли с экрана. Ничего не
               сломалось — и экран об этом молчит: прежнее содержимое
               остаётся на месте. */
            return
        } catch let error as APIError {
            failure = error.isOffline
                ? "Կապ չկա։"
                : "Սերվերը չպատասխանեց (\(error.status) \(error.code ?? "—"))"
        } catch {
            // разбор ответа: показываем как есть — это баг, а не сбой сети, и
            // прятать его за «попробуйте позже» значит никогда не найти
            failure = "\(error)"
        }
    }
}
