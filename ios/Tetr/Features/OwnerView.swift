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

    private var currency: String { session.tenant?.currency ?? "AMD" }

    private let periods = [("today", "Այսօր"), ("7", "7 օր"), ("30", "30 օր")]

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

    private var picker: some View {
        HStack(spacing: 6) {
            ForEach(periods, id: \.0) { key, label in
                Button(label) {
                    period = key
                    Task { await reload() }
                }
                .font(.system(size: 13, weight: period == key ? .bold : .regular))
                .foregroundStyle(period == key ? .white : Brand.muted)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(
                    period == key ? Brand.grapeFill : .clear,
                    in: Capsule()
                )
            }
            Spacer()
        }
        .padding(.top, 8)
    }

    /// Заголовок с периодом внутри.
    ///
    /// Было просто «ՀԱՍՈՒՅԹ», и при переключении на 7 или 30 дней надпись
    /// не менялась — только число. Что перед тобой, приходилось вспоминать
    /// по нажатой кнопке.
    private var revenueTitle: String {
        switch period {
        case "7": return "7 օրվա հասույթ"
        case "30": return "30 օրվա հասույթ"
        default: return "Այսօրվա հասույթ"
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
        let today = f.string(from: Date())
        guard let from = summary?.from, period != "today" else { return today }
        return "\(f.string(from: from)) — \(today)"
    }

    private var revenue: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(revenueTitle)
                .font(.system(size: 11, weight: .bold))
                .tracking(1.2)
                .textCase(.uppercase)
                .foregroundStyle(.white.opacity(0.7))

            Text(money(summary?.stats.revenue ?? 0, currency))
                .font(.system(size: 38, weight: .bold))
                .foregroundStyle(.white)

            Text("\(periodDates) · \(summary?.stats.count ?? 0) \(session.tenant?.unitOne ?? "") · Միջին չեկ \(money(summary?.stats.avgCheck ?? 0, currency))")
                .font(.system(size: 13))
                .foregroundStyle(.white.opacity(0.75))
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(Brand.heroGradient, in: RoundedRectangle(cornerRadius: 20))
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

    /// Прибыль и из чего она сложилась.
    ///
    /// Одной цифры мало: «осталось 46 000» без разбора выглядит как
    /// ошибка, особенно в первый раз. Владелец должен увидеть вычитание
    /// целиком — тогда он либо соглашается, либо понимает, какой расход
    /// забыл завести.
    ///
    /// Зарплата отдельной строкой от расходов, хотя формально тоже
    /// расход: её считает продукт, а расходы заводит человек. Смешать их
    /// значило бы скрыть, что именно можно поправить руками.
    private func profit(_ s: API.Summary) -> some View {
        VStack(spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text("Շահույթ")
                    .font(.system(size: 11, weight: .bold))
                    .tracking(1.2)
                    .textCase(.uppercase)
                    .foregroundStyle(Brand.muted)
                Spacer()
                Text(money(s.profit, currency))
                    .font(.system(size: 26, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(s.profit >= 0 ? Brand.good : Brand.warn)
            }

            VStack(spacing: 5) {
                breakdown("Հասույթ", s.stats.revenue)
                breakdown("Աշխատավարձ", -s.stats.payroll)
                breakdown("Ծախսեր", -s.costs.total)
            }
        }
        .glassCard()
    }

    private func breakdown(_ label: String, _ value: Int) -> some View {
        HStack {
            Text(label)
            Spacer()
            Text(value < 0 ? "− \(money(-value, currency))" : money(value, currency))
                .monospacedDigit()
        }
        .font(.system(size: 13))
        .foregroundStyle(Brand.muted)
    }

    /// Форма дня столбиками.
    ///
    /// У мойки день имеет рельеф — утренний заезд, дневной провал,
    /// вечерний наплыв. Владелец это чувствует, но не видит: список
    /// записей рельеф не показывает, а столбики показывают сразу.
    /// Подпись столбика: все подряд, пока их немного, иначе каждый третий.
    private func label(_ point: API.SeriesPoint, in series: [API.SeriesPoint]) -> String {
        guard series.count > 12 else { return point.label }
        let index = series.firstIndex(where: { $0.id == point.id }) ?? 0
        return index % 3 == 0 ? point.label : ""
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
                        // на тридцати днях числа сливаются — подписываем реже
                        Text(label(point, in: series))
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
                    Text(money(item.price, currency))
                        .font(.system(size: 14.5, weight: .semibold))
                        .monospacedDigit()
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
            summary = try await session.authed { token in
                try await APIClient.shared.send(
                    "summary?period=\(period)",
                    token: token,
                    as: API.Summary.self
                )
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
