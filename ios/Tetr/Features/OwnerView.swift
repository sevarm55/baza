import SwiftUI

/**
 * Кабинет владельца — вариант «Տաբլո».
 *
 * Приборное табло, а не список карточек. Три вещи делают его непохожим на
 * всё, что было раньше:
 *
 * 1. **Композиция по центру.** Главная цифра стоит по оси экрана, а не по
 *    левому краю: подпись над ней, единица под ней. Это осевая симметрия
 *    прибора, и она сама по себе читается «показание», а не «строка
 *    отчёта».
 * 2. **Волна вместо графика.** Ход периода — одна тонкая линия прямо под
 *    цифрой, без осей, рамки и подписей. Она не отвечает «сколько в 11:00»,
 *    она отвечает «ровно шёл день или рывками», и на это хватает линии.
 * 3. **Сетка мелких плиток.** Каждая плитка — ровно один показатель со
 *    своим градиентом. Ни одна не повторяет главную цифру: то, что стоит
 *    наверху, внизу не появляется.
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

    private let gap: CGFloat = 10

    var body: some View {
        ScrollView {
            VStack(spacing: gap) {
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
            .padding(.horizontal, 12)
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
     * Период — ряд чипов, обновление — кружок справа.
     *
     * Ряд стоит на самом табло, без подложки и без карточки: это органы
     * прибора, а не панель над содержимым.
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
                        /* Выбранный чип залит чернилами табло, поэтому текст
                           на нём — цвет самого табло. `onBoard` здесь брать
                           нельзя: он тех же чернил, и надпись пропадала
                           начисто. */
                        .foregroundStyle(period == key ? Brand.board : Brand.boardMuted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                        .padding(.horizontal, 13)
                        .padding(.vertical, 9)
                        .frame(minHeight: 38)
                        .background {
                            if period == key {
                                Capsule()
                                    .fill(Brand.boardInk)
                                    .matchedGeometryEffect(id: "period", in: pill)
                            } else {
                                Capsule().fill(Brand.boardInk.opacity(0.07))
                            }
                        }
                        .contentShape(Capsule())
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
                    .background(Brand.boardInk.opacity(0.07), in: .circle)
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
        .padding(.horizontal, 12)
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
                    .font(.system(size: 12, weight: .semibold))
                    .contentTransition(.numericText())
                crewDots
            }
            .foregroundStyle(Brand.boardMuted)
            .padding(.top, 10)

            Text(profitTitle)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Brand.onBoard.opacity(0.85))
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 6)

            /* Минус настоящий, U+2212: дефис на таком кегле читается точкой.
               Убыток жёлтым, не красным — красный в продукте значит
               «удалить». */
            Text((s.profit < 0 ? "−" : "") + money(abs(s.profit), currency))
                .font(.system(size: 54, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(s.profit < 0 ? Brand.warnOnBoard : Brand.onBoard)
                .lineLimit(1)
                .minimumScaleFactor(0.42)
                .padding(.top, 2)
                // значение передаётся внутрь: по нему система понимает, в
                // какую сторону крутить разряды
                .contentTransition(.numericText(value: Double(s.profit)))

            change
        }
        .frame(maxWidth: .infinity)
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
                Text(c.base)
                    .font(.system(size: 12))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)
            }
            .foregroundStyle(c.up ? Brand.goodOnBoard : Brand.warnOnBoard)
            .padding(.horizontal, 11)
            .padding(.vertical, 6)
            .background(Brand.boardInk.opacity(0.07), in: .capsule)
            .padding(.top, 8)
        }
    }

    /**
     * Кто сейчас на площадке — точками рядом с датой.
     *
     * Это не то же самое, что «работал сегодня»: человек мог встать час
     * назад и ещё ничего не намыть — по записям его не видно вовсе, а на
     * мойке он стоит.
     */
    @ViewBuilder
    private var crewDots: some View {
        if let present = summary?.onShift, !present.isEmpty {
            HStack(spacing: 4) {
                Text("·")
                ForEach(present) { person in
                    HStack(spacing: 3) {
                        Circle()
                            .fill(Brand.person(person.name))
                            .frame(width: 6, height: 6)
                        Text(person.name)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Brand.person(person.name))
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(person.name) հերթափոխին \(since(person.openedAt))")
                }
            }
        }
    }

    // ══════════════════════════ волна ══════════════════════════

    /**
     * Ход периода — одна линия без осей, рамки и подписей.
     *
     * Она не отвечает «сколько было в одиннадцать»: для этого есть журнал
     * внизу. Она отвечает на другой вопрос, которого в продукте не было
     * вовсе, — ровно шёл день или рывками, и когда пришёл главный заезд. На
     * это хватает линии, а тринадцать столбиков занимали треть экрана ради
     * того же самого.
     */
    @ViewBuilder
    private func wave(_ series: [API.SeriesPoint]) -> some View {
        if series.count > 1 {
            let peak = max(1, series.map(\.revenue).max() ?? 1)
            let peakIndex = series.firstIndex(where: { $0.revenue == peak }) ?? 0
            let values = series.map { Double($0.revenue) / Double(peak) }

            VStack(spacing: 6) {
                GeometryReader { geo in
                    let pts = points(values, in: geo.size)
                    ZStack(alignment: .topLeading) {
                        Wave(points: pts)
                            .stroke(
                                Brand.onBoard.opacity(0.55),
                                style: .init(lineWidth: 1.6, lineCap: .round, lineJoin: .round)
                            )
                        if pts.indices.contains(peakIndex) {
                            Circle()
                                .fill(Brand.lime)
                                .frame(width: 8, height: 8)
                                .position(pts[peakIndex])
                        }
                    }
                }
                .frame(height: 54)

                Text("\(axis(series[peakIndex])) · \(money(peak, currency))")
                    .font(.system(size: 11))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)
            }
            .padding(.top, 4)
            .padding(.bottom, 6)
        }
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
        let perUnit = s.stats.count > 0 ? s.profit / s.stats.count : 0

        return VStack(spacing: gap) {
            // широкая: приход и доля, которая осталась
            HStack(alignment: .center, spacing: 14) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Հասույթ")
                        .font(.system(size: 12))
                        .foregroundStyle(.white.opacity(0.7))
                    Text(money(s.stats.revenue, currency))
                        .font(.system(size: 26, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                        .contentTransition(.numericText(value: Double(s.stats.revenue)))
                    if s.stats.count > 0 {
                        // То, чего в продукте не было ни разу и что владелец
                        // считает в уме каждый вечер.
                        Text("ամեն \(session.tenant?.unitOne ?? "")-ից ձեզ \(money(perUnit, currency))")
                            .font(.system(size: 11))
                            .monospacedDigit()
                            .foregroundStyle(.white.opacity(0.7))
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                }
                Spacer(minLength: 0)
                Ring(share: keptShare)
                    .frame(width: 62, height: 62)
                    .accessibilityLabel("Ձեզ մնում է")
                    .accessibilityValue("\(Int((keptShare * 100).rounded())) տոկոս")
            }
            .tile(.violet)

            HStack(spacing: gap) {
                small(.teal, "Աշխատավարձ", money(s.stats.payroll, currency),
                      foot: "\(Int((Double(s.stats.payroll) / Double(base) * 100).rounded()))%",
                      animate: Double(s.stats.payroll))
                small(.amber, "Ծախսեր", money(s.costs.total, currency),
                      foot: expensesNote(s),
                      animate: Double(s.costs.total))
            }

            HStack(spacing: gap) {
                small(.lime, session.tenant?.unitOne ?? "", "\(s.stats.count)",
                      foot: "", animate: Double(s.stats.count))
                small(.slate, "Միջին չեկ", money(s.stats.avgCheck, currency),
                      foot: "", animate: Double(s.stats.avgCheck))
            }
        }
    }

    private func small(
        _ tone: Tone,
        _ title: String,
        _ value: String,
        foot: String,
        animate: Double
    ) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.system(size: 11.5))
                .foregroundStyle(tone.ink.opacity(0.72))
                .lineLimit(1)
            Spacer(minLength: 6)
            Text(value)
                .font(.system(size: 22, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(tone.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .contentTransition(.numericText(value: animate))
            if !foot.isEmpty {
                Text(foot)
                    .font(.system(size: 10.5))
                    .monospacedDigit()
                    .foregroundStyle(tone.ink.opacity(0.72))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
        }
        .frame(height: 96, alignment: .topLeading)
        .tile(tone)
        .accessibilityElement(children: .combine)
    }

    private func expensesNote(_ s: API.Summary) -> String {
        // Без этой приписки владелец скажет «я столько сегодня не тратил», и
        // будет прав: в сумме сидит доля месячной аренды.
        if s.costs.monthlyShare > 0 && period == "today" { return "ամսականից օրվա բաժինը" }
        if s.costs.oneOff > 0 && s.costs.monthlyShare == 0 { return "միանվագ" }
        return ""
    }

    // ══════════════════════════ журнал ══════════════════════════

    /**
     * Записи — строками прямо на табло, без карточки.
     *
     * Кто помыл — цветом номера: на мойке два-три работника, и цвет
     * различает их быстрее, чем текст, а строка остаётся в одну высоту.
     */
    @ViewBuilder
    private func journal(_ feed: [API.FeedItem]) -> some View {
        if !feed.isEmpty {
            VStack(spacing: 0) {
                HStack {
                    Text("Հոսք")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Brand.boardMuted)
                    Spacer()
                    Text("\(feed.count)")
                        .font(.system(size: 12))
                        .monospacedDigit()
                        .foregroundStyle(Brand.boardMuted)
                }
                .padding(.horizontal, 6)
                .padding(.top, 14)
                .padding(.bottom, 6)

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
        return HStack(spacing: 10) {
            Text(at(item.createdAt))
                .font(.system(size: 12))
                .monospacedDigit()
                .foregroundStyle(Brand.boardMuted)
                .frame(width: 42, alignment: .leading)

            Text(item.clientKey ?? "—")
                .font(.system(size: 14, weight: .semibold, design: .rounded))
                .foregroundStyle(Brand.person(who))
                .lineLimit(1)

            Image(systemName: paymentSymbol(item.payment))
                .font(.system(size: 10.5))
                .foregroundStyle(Brand.boardMuted)
                .accessibilityLabel(paymentLabel(item.payment))

            Spacer(minLength: 8)

            // При нулевой ставке доли нет: у владельца, который записывает
            // сам, процента нет, и «ему 0 ֏» в каждой строке — шум.
            if (item.staffPercent ?? 0) > 0 {
                Text("նրան \(money(item.earned, currency))")
                    .font(.system(size: 11))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)
            }

            Text(money(item.price, currency))
                .font(.system(size: 14, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)
        }
        .padding(.horizontal, 6)
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
