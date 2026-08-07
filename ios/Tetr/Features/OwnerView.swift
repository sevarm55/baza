import SwiftUI

/// Кабинет владельца.
///
/// Сводка приходит одним запросом — на мобильной сети четыре round-trip
/// складываются в паузу, а часть ещё и обрывается.
struct OwnerView: View {
    @EnvironmentObject private var session: Session

    @State private var summary: API.Summary?
    @State private var period = "today"
    @State private var failure: String?
    @State private var cancelling: API.FeedItem?
    @Namespace private var pill

    /* Прокрутку разрядов система сама по «Уменьшению движения» не гасит:
       withAnimation отрабатывает как обычно. Гасим здесь — иначе настройка,
       которую человек включил не просто так, ничего не меняет. */
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var currency: String { session.tenant?.currency ?? "AMD" }

    private let periods = [("today", "Այսօր"), ("month", "Այս ամիս"), ("prevmonth", "Անցյալ ամիս")]

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                picker

                if let failure {
                    // Нули вместо выручки — худшее, что может показать этот
                    // экран: неверные данные выглядят как верные, и владелец
                    // принимает решение по ним. Лучше честно ничего.
                    problem(failure)
                } else {
                    revenue

                    if let summary { profit(summary) }

                    if let present = summary?.onShift, !present.isEmpty {
                        onShift(present)
                    }

                    /* Каждый блок назван. Раньше график и разбивка по
                       оплате висели между двумя озаглавленными разделами
                       безымянными карточками, и экран читался сплошной
                       лентой белых прямоугольников. */
                    if let series = summary?.series, series.count > 1 {
                        sectionHeader(period == "today" ? "Ժամերով" : "Օրերով")
                        chart(series)
                    }
                    if let split = summary?.split, !split.isEmpty {
                        sectionHeader("Վճարումներ")
                        splitBar(split)
                    }

                    if let feed = summary?.feed, !feed.isEmpty {
                        list(feed)
                    } else if summary != nil {
                        Text("Դեռ տվյալներ չկան")
                            .font(.system(size: 14))
                            .foregroundStyle(Brand.muted)
                            .padding(.vertical, 44)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .screenBackground()
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

    /**
     * Заголовок раздела.
     *
     * Был 11-м кеглем, приглушённым цветом и в разрядку — тише, чем всё,
     * что под ним. На экране из шести белых карточек подряд структура от
     * этого пропадала: непонятно, где кончается одно и начинается другое.
     *
     * Теперь это настоящий заголовок: крупнее содержимого карточек, полным
     * цветом и с воздухом сверху. Мелкие подписи остались внутри карточек —
     * там они и должны быть тише своего содержимого.
     */
    private func sectionHeader(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 17, weight: .bold))
            .foregroundStyle(Brand.ink)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 6)
    }

    /**
     * Период — сегментным переключателем, а не тремя кнопками.
     *
     * Раньше выбранный период был грейповой капсулой среди двух серых
     * надписей. Грейп на этом экране означает другое — им набраны суммы и
     * столбики, — и капсула читалась как ещё одно значимое пятно, а не как
     * положение переключателя.
     *
     * Здесь выбор показан подсветкой: дорожка тёмная, выбранная плашка
     * светлее. Это тот же язык, что у системного сегмента, и человек знает
     * его до того, как открыл приложение.
     */
    private var picker: some View {
        HStack(spacing: 0) {
            ForEach(periods, id: \.0) { key, label in
                Button {
                    // упругость короткая: переключатель, а не переход экрана
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { period = key }
                    Task { await reload() }
                } label: {
                    Text(label)
                        .font(.system(size: 14, weight: period == key ? .bold : .medium))
                        .foregroundStyle(period == key ? Brand.ink : Brand.muted)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                        .background {
                            if period == key {
                                RoundedRectangle(cornerRadius: 11)
                                    .fill(Brand.trackOn)
                                    .shadow(color: .black.opacity(0.09), radius: 3, y: 1)
                                    .matchedGeometryEffect(id: "period", in: pill)
                            }
                        }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(3)
        .background(Brand.track, in: RoundedRectangle(cornerRadius: 14))
        .padding(.top, 8)
    }

    /* Не «շահույթ»: от «հասույթ» в разборе ниже оно отличается одной
       буквой и звучит почти так же. Два похожих слова с разными числами
       на одном экране путают даже автора продукта. «Вам остаётся» ни на
       что не похоже, потому что это не термин, а обычная речь. */
    private var profitTitle: String {
        switch period {
        case "month": return "Այս ամիս ձեզ մնում է"
        case "prevmonth": return "Անցյալ ամիս ձեզ մնացել է"
        default: return "Այսօր ձեզ մնում է"
        }
    }

    /// «1 օգոստոսի» или «3 հուլիսի — 1 օգոստոսի».
    ///
    /// Без даты сутки не видно вовсе, а они здесь считаются по времени
    /// бизнеса и в полночь начинаются заново. Владелец, открывший приложение
    /// в half past midnight, видел ноль и решал, что данные пропали.
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

    private var revenue: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(profitTitle)
                .font(.system(size: 11, weight: .bold))
                .tracking(1.2)
                .textCase(.uppercase)
                .foregroundStyle(.white.opacity(0.7))

            /* Крупно — прибыль, а не выручка.
               Владелец открывает приложение ради одной цифры, и это «сколько
               осталось», а не «сколько прошло через кассу». Выручку он и так
               примерно помнит: она равна числу машин на средний чек. Прибыль
               не помнит никто — её нельзя посчитать в уме, потому что в ней
               сидят проценты работников и доля аренды за день. */
            Text(money(summary?.profit ?? 0, currency))
                .font(.system(size: 38, weight: .bold))
                .foregroundStyle(.white)
                // значение передаётся внутрь: по нему система понимает, в
                // какую сторону крутить разряды
                .contentTransition(.numericText(value: Double(summary?.profit ?? 0)))

            /* Три вещи в строке: с чем сравнили, сколько было тогда, на
               сколько разошлось. Менее сенсационное первым — иначе разница
               читается сама по себе и кажется больше, чем есть.

               Знак обязателен: цвет на мокром телефоне под солнцем
               пропадает первым, а WCAG прямо запрещает передавать смысл
               одним оттенком. */
            if let c = profitChange {
                (Text(c.label)
                    + Text(" \(c.base)").monospacedDigit()
                    + Text(" · ")
                    + Text(c.diff).monospacedDigit().fontWeight(.semibold))
                    .font(.system(size: 12.5))
                    .foregroundStyle(.white.opacity(0.85))
                    .fixedSize(horizontal: false, vertical: true)
            }

            Text("\(periodDates) · \(summary?.stats.count ?? 0) \(session.tenant?.unitOne ?? "") · Միջին չեկ \(money(summary?.stats.avgCheck ?? 0, currency))")
                .font(.system(size: 13))
                .contentTransition(.numericText(value: Double(summary?.stats.count ?? 0)))
                .foregroundStyle(.white.opacity(0.75))
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(Brand.heroGradient, in: RoundedRectangle(cornerRadius: 20))
    }

    /**
     * «На 6 500 ֏ больше, чем вчера к этому часу».
     *
     * Число без опоры ничего не значит: «прибыль 11 144» — это хорошо или
     * плохо? Владелец помнит вчерашнюю выручку, но не вчерашнюю прибыль —
     * её никто в уме не считает.
     *
     * В драмах, а не в процентах. Процент от маленькой базы врёт: вчера
     * 3 000, сегодня 9 500 — «+217%», а разница три помывки. Драмы можно
     * потрогать, проценты нельзя, и владелец не считает свой бизнес в них.
     *
     * «К этому часу» сказано прямо, потому что сравнивается одинаково
     * прожитое время: сегодня к полудню против вчера к полудню. Без этой
     * оговорки человек решит, что сравнили с целым вчера, и не поверит.
     *
     * Молчим, когда сравнивать не с чем: в прошлом отрезке ноль, или
     * разница меньше сотни драмов — такая строка занимает место, но не
     * сообщает.
     */
    private var profitChange: (label: String, base: String, diff: String, up: Bool)? {
        guard let s = summary else { return nil }

        // Сравнивать не с чем: бизнес завёлся недавно, прошлого месяца у
        // него не было. «+100 %» от пустоты — не новость, а деление на ноль
        // в другой одежде.
        guard (s.previous.count ?? 1) > 0 else { return nil }

        let diff = s.profit - s.previous.profit
        guard abs(diff) >= 100 else { return nil }

        let label: String
        if period == "today" {
            label = "Մեկ շաբաթ առաջ այս ժամին"
        } else if let f = s.previous.from, let t = s.previous.to {
            label = range(f, t)
        } else {
            label = "Նախորդ ամիս"
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

    /// Кто сейчас на мойке.
    ///
    /// Показывается только когда кто-то есть: пустой раздел «на смене
    /// никого» занимал бы место каждую ночь и ничего не сообщал.
    ///
    /// Это не то же самое, что «работал сегодня»: человек мог встать час
    /// назад и ещё ничего не намыть — по записям его не видно вовсе, а на
    /// площадке он стоит.
    private func onShift(_ present: [API.Present]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("Հերթափոխին")

            ForEach(present) { person in
                HStack(spacing: 10) {
                    Circle()
                        .fill(Brand.person(person.name))
                        .frame(width: 9, height: 9)

                    Text(person.name)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Brand.person(person.name))

                    Spacer()

                    Text(since(person.openedAt))
                        .font(.system(size: 12.5))
                        .monospacedDigit()
                        .foregroundStyle(Brand.muted)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .glassEffect(.regular, in: .rect(cornerRadius: 12))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// «с 09:40» — время выхода, а не длительность.
    ///
    /// Длительность пришлось бы пересчитывать каждую минуту, иначе она
    /// врёт; время выхода верно всегда и отвечает на тот же вопрос.
    private func since(_ at: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        return "\(f.string(from: at))-ից"
    }

    /**
     * Лестница: из чего сложилась прибыль.
     *
     * Тремя колонками этот блок был компактнее, но вычитания в нём не
     * читалось: три числа рядом — это три факта, а не «минус, минус,
     * осталось». Строка на каждый вычет, промежуточный итог и ответ под
     * чертой — так устроен отчёт о прибылях у Wave, FreshBooks, Zoho, Xero
     * и QuickBooks, у Lightspeed и у МоегоСклада.
     *
     * Водопад и составной столбик отброшены: у составного нет общего
     * начала сегментов и он даёт наибольший процент ошибок чтения, водопад
     * требует объяснения. Единственная количественная кодировка — длина
     * полоски от общего левого края.
     */
    private func profit(_ s: API.Summary) -> some View {
        let expenses = s.costs.total
        let afterPayroll = s.stats.revenue - s.stats.payroll
        let scale = { (v: Int) -> Double in
            s.stats.revenue > 0 ? min(1, Double(v) / Double(s.stats.revenue)) : 0
        }

        return VStack(alignment: .leading, spacing: 10) {
            ladderRow("Հասույթ", s.stats.revenue, scale(s.stats.revenue), strong: true)
            ladderRow("Աշխատավարձ", s.stats.payroll, scale(s.stats.payroll), minus: true)

            // Промежуточный итог — фраза, а не термин: третье
            // существительное рядом с «Հասույթ» снова начнёт путаться.
            HStack {
                Text("Աշխատավարձից հետո")
                Spacer()
                Text(money(afterPayroll, currency)).monospacedDigit()
            }
            .font(.system(size: 12))
            .foregroundStyle(Brand.muted.opacity(0.75))
            .padding(.leading, 10)

            ladderRow("Ծախսեր", expenses, scale(expenses), minus: true)

            // Без этой строки владелец скажет «я столько сегодня не
            // тратил» — и будет прав: в сумме сидит доля аренды.
            if expenses > 0 {
                HStack(spacing: 12) {
                    if s.costs.oneOff > 0 {
                        Text("Միանվագ \(money(s.costs.oneOff, currency))")
                    }
                    if s.costs.monthlyShare > 0 {
                        Text(
                            period == "today"
                                ? "ամսականից օրվա բաժինը \(money(s.costs.monthlyShare, currency))"
                                : "Ամսական \(money(s.costs.monthlyShare, currency))"
                        )
                    }
                }
                .font(.system(size: 11.5))
                .foregroundStyle(Brand.muted.opacity(0.75))
                .padding(.leading, 10)
            }

            Divider().overlay(Brand.line)

            HStack(alignment: .firstTextBaseline) {
                Text(s.profit >= 0 ? "Ձեզ մնում է" : "Մինուսի մեջ եք")
                    .font(.system(size: 11, weight: .bold))
                    .tracking(1.1)
                    .textCase(.uppercase)
                    .foregroundStyle(Brand.muted)
                Spacer()
                Text(money(abs(s.profit), currency))
                    .font(.system(size: 26, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(s.profit >= 0 ? Brand.good : Brand.warn)
                    .contentTransition(.numericText(value: Double(s.profit)))
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassEffect(.regular, in: .rect(cornerRadius: 16))
    }

    /// Строка лестницы. Знак «−» перед подписью, а не внутри числа:
    /// «− Аренда 4 060» читается как вычитание, «Аренда −4 060» — как
    /// свойство суммы.
    private func ladderRow(
        _ title: String,
        _ value: Int,
        _ fill: Double,
        minus: Bool = false,
        strong: Bool = false
    ) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text(minus ? "− \(title)" : title)
                    .foregroundStyle(strong ? Brand.ink : Brand.muted)
                Spacer()
                Text(money(value, currency))
                    .monospacedDigit()
                    .foregroundStyle(strong ? Brand.ink : Brand.muted)
                    .contentTransition(.numericText(value: Double(value)))
            }
            .font(.system(size: 13, weight: strong ? .semibold : .regular))

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Brand.line).frame(height: 3)
                    Capsule()
                        .fill(strong ? Brand.ink : Brand.muted.opacity(0.45))
                        .frame(width: max(2, geo.size.width * fill), height: 3)
                }
            }
            .frame(height: 3)
        }
    }




    /// Форма дня столбиками.
    ///
    /// У мойки день имеет рельеф — утренний заезд, дневной провал,
    /// вечерний наплыв. Владелец это чувствует, но не видит: список
    /// записей рельеф не показывает, а столбики показывают сразу.
    /// Подпись столбика: все подряд, пока их немного, иначе каждый третий.
    private func label(_ point: API.SeriesPoint, in series: [API.SeriesPoint]) -> String {
        let text = period == "today" ? point.hourLabel : point.dayLabel
        guard series.count > 12 else { return text }
        let index = series.firstIndex(where: { $0.id == point.id }) ?? 0
        return index % 3 == 0 ? text : ""
    }

    private func chart(_ series: [API.SeriesPoint]) -> some View {
        let peak = max(1, series.map(\.revenue).max() ?? 1)

        return VStack(alignment: .leading, spacing: 8) {
            /* Пик подписан цифрой: иначе высота — величина без масштаба.
               Имя графика переехало в заголовок раздела над карточкой. */
            Text("առավելագույնը \(money(peak, currency))")
                .font(.system(size: 11))
                .monospacedDigit()
                .foregroundStyle(Brand.muted)
                .frame(maxWidth: .infinity, alignment: .trailing)

            HStack(alignment: .bottom, spacing: 3) {
                ForEach(series) { point in
                    VStack(spacing: 4) {
                        RoundedRectangle(cornerRadius: 3)
                            /* Пик берёт полный цвет: график нужен ради
                               одного ответа — когда заезд. Пустой час —
                               еле заметная риска: это тоже факт, и часто
                               более важный, чем полный столбик. */
                            .fill(
                                point.revenue == 0
                                    ? Brand.line
                                    : point.revenue == peak
                                        ? Brand.grape
                                        : Brand.grape.opacity(0.28)
                            )
                            .frame(height: max(2, 90 * CGFloat(point.revenue) / CGFloat(peak)))
                        /* На тридцати днях числа сливаются — подписываем реже.
                           Строка одна: столбик уже подписи, и без ограничения
                           «02» ломалось на два этажа. */
                        Text(label(point, in: series))
                            .lineLimit(1)
                            .fixedSize()
                            .font(.system(size: 9))
                            .monospacedDigit()
                            .foregroundStyle(Brand.muted)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
        }
        .padding(14)
        .glassEffect(.regular, in: .rect(cornerRadius: 16))
    }

    /// Доля наличных одной полосой: владельцу важна не сумма наличных,
    /// а сколько денег проходит мимо кассы.
    private func splitBar(_ split: [API.SplitSegment]) -> some View {
        let total = max(1, split.reduce(0) { $0 + $1.revenue })
        let sorted = split.sorted { $0.revenue > $1.revenue }

        return VStack(alignment: .leading, spacing: 9) {
            GeometryReader { geo in
                HStack(spacing: 3) {
                    ForEach(sorted) { seg in
                        Capsule()
                            .fill(paymentColor(seg.payment))
                            .frame(width: max(2, geo.size.width * CGFloat(seg.revenue) / CGFloat(total)))
                    }
                }
            }
            .frame(height: 9)

            HStack(spacing: 14) {
                ForEach(sorted) { seg in
                    HStack(spacing: 5) {
                        Circle().fill(paymentColor(seg.payment)).frame(width: 7, height: 7)
                        Text("\(paymentLabel(seg.payment)) \(money(seg.revenue, currency))")
                            .font(.system(size: 11.5))
                            .monospacedDigit()
                            .foregroundStyle(Brand.muted)
                    }
                }
                Spacer()
            }
        }
        .padding(14)
        .glassEffect(.regular, in: .rect(cornerRadius: 16))
    }

    private func paymentColor(_ key: String) -> Color {
        switch key {
        case "cash": return Brand.good
        case "card": return Brand.grape
        case "transfer": return Brand.grape.opacity(0.5)
        default: return Brand.muted
        }
    }

    private func list(_ feed: [API.FeedItem]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("Հոսք")

            ForEach(feed) { item in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.clientKey ?? "—")
                            .font(.system(size: 14.5, weight: .semibold, design: .rounded))
                        HStack(spacing: 5) {
                            /* Имя цветом самого человека: на мойке два-три
                               работника, и «кто это помыл» читается по
                               цвету, ещё до того как прочитано имя. */
                            Circle()
                                .fill(Brand.person(item.staffName ?? ""))
                                .frame(width: 6, height: 6)
                            Text(item.staffName ?? "—")
                                .fontWeight(.semibold)
                                .foregroundStyle(Brand.person(item.staffName ?? ""))
                            Text("· \(item.serviceName) ·")
                                .foregroundStyle(Brand.muted)
                            Image(systemName: paymentSymbol(item.payment))
                                .font(.system(size: 13))
                                .foregroundStyle(Brand.muted)
                        }
                        .font(.system(size: 11.5))
                    }
                    Spacer()
                    /* Цена и сразу под ней доля исполнителя: владелец
                       видит, сколько с этой машины ушло, не считая в уме
                       и не уходя в зарплатную ведомость. */
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(money(item.price, currency))
                            .font(.system(size: 14.5, weight: .semibold))
                            .monospacedDigit()
                        // При нулевой ставке строка не показывается: у
                        // владельца, который записывает сам, процента нет,
                        // и «ему 0 ֏» под каждой записью — шум.
                        if (item.staffPercent ?? 0) > 0 {
                            Text("նրան \(money(item.earned, currency))")
                                .font(.system(size: 11.5))
                                .foregroundStyle(Brand.muted)
                                .monospacedDigit()
                        }
                    }
                }
                .padding(12)
                .glassEffect(.regular, in: .rect(cornerRadius: 12))
                // Отмена мягкая: запись остаётся в истории и в аудите, но
                // перестаёт попадать в выручку и зарплату. Поэтому и
                // спрашиваем — вернуть её обратно нельзя.
                .contextMenu {
                    Button("Չեղարկել գրանցումը", role: .destructive) {
                        cancelling = item
                    }
                }
            }
        }
    }

    private func problem(_ text: String) -> some View {
        VStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 28))
                .foregroundStyle(Brand.grape)
            Text(text)
                .font(.system(size: 14))
                .multilineTextAlignment(.center)
                .foregroundStyle(Brand.muted)
            Button("Կրկնել") { Task { await reload() } }
                .buttonStyle(.glass)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }

    private func reload() async {
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

               Первая загрузка идёт без анимации: прокрутка от нуля к сумме
               на старте читается как индикатор загрузки, а не как смысл, и
               заставляет ждать там, где ждать нечего. */
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
            // разбор ответа: показываем как есть — это баг, а не сбой сети,
            // и прятать его за «попробуйте позже» значит никогда не найти
            failure = "\(error)"
        }
    }
}
