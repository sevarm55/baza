import SwiftUI

/**
 * Отчёт по месяцам.
 *
 * ЗАЧЕМ ОН НУЖЕН. Сводка отвечает «сколько сегодня» и «сколько за
 * месяц». Вопрос, который владелец задаёт себе на самом деле, другой:
 * **стало лучше или хуже, и почему**. Разрезы — откуда пришли деньги,
 * куда ушли, кто это сделал — были только в браузере, и владелец,
 * работающий с телефона, на этот вопрос ответа не получал вовсе.
 *
 * ЧТО ЗДЕСЬ ПЕРЕСОБРАНО. Экран отвечал верно, но выглядел стопкой
 * одинаковых белых коробок с полосками внутри: ряд месяцев, три колонки
 * слагаемых, три раздела с полосами. Ни одна фигура не была своей, и
 * первое, что видел глаз, — не результат месяца, а рамки.
 *
 *   1. **Месяцы стали графиком.** Тот же ряд, что был плашками, теперь
 *      столбики прибыли от нулевой линии: выбор месяца и ответ «лучше
 *      или хуже» — это одно движение глаза, а не два органа подряд.
 *      Время идёт слева направо, как во всяком графике; плашки шли
 *      наоборот, свежим влево, и «ход» по ним читался задом наперёд.
 *   2. **Кольцо вместо трёх колонок.** Вопрос месяца не «сколько ушло
 *      людям», а «какая доля прихода дошла до меня». Кольцо отвечает на
 *      него без чтения, а три слагаемых стоят рядом списком с суммами.
 *      Полоса долей осталась в сводке, где родилась: две одинаковые
 *      фигуры по разным данным читались бы одной вещью.
 *   3. **Строка сама себе полоса.** У разрезов больше нет отдельной
 *      полоски под каждой строкой: доля залита в саму строку и
 *      закрыта справа плотной засечкой в две точки. Высота строки упала
 *      вдвое, а «сколько из всего» читается по-прежнему без цифр.
 *   4. **Способы оплаты приросли к приходу.** Это те же деньги, разрезанные
 *      вторым способом, и отдельная карточка ради них повторяла целое
 *      третий раз.
 *
 * Порядок задан вопросами, а не удобством вёрстки, и он тот же, что в
 * кабинете:
 *
 *   1. какой месяц смотрим и как он на фоне соседних → график;
 *   2. сколько заработал                             → показание;
 *   3. какой долей и из чего                         → кольцо;
 *   4. откуда пришли деньги и чем платили            → приход;
 *   5. куда ушли                                     → расход;
 *   6. кто это сделал                                → люди.
 *
 * Ни одно число здесь не считается на телефоне: месяц целиком приходит
 * с сервера, посчитанный тем же кодом, что и кабинет. Отчёт,
 * расходящийся с кабинетом хотя бы на драм, не читают вовсе.
 */
struct ReportView: View {
    @EnvironmentObject private var session: Session

    @State private var report: API.Report?
    @State private var back = 0
    @State private var loading = false
    @State private var failure: String?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var currency: String { session.tenant?.currency ?? "AMD" }
    private var unit: String { session.tenant?.unitOne ?? "" }

    /// Высота поля графика месяцев.
    private let field: CGFloat = 58

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if let failure {
                    problem(failure)
                } else if let report {
                    timeline(report.months)

                    VStack(alignment: .leading, spacing: 0) {
                        reading(report)
                        composition(report.current)

                        /* Когда приезжают и как шёл месяц — сразу после
                           состава, до разрезов по деньгам: это вопросы
                           про работу мойки, а не про её бухгалтерию, и
                           владелец задаёт их первыми. */
                        if let heat = report.heat, heat.contains(where: { $0.count > 0 }) {
                            section(L("report.heatTitle"), total: report.current.count)
                            ReportHeatmap(cells: heat, currency: currency, unit: unit)
                        }

                        if let series = report.series, series.count > 1 {
                            section(L("report.trendTitle"), total: report.current.revenue)
                            ReportTrend(points: series, currency: currency)
                        }

                        income(report)
                        outgo(report.costsByCategory)
                        team(report.current)

                        /* Филиалы последними: это вопрос владельца двух
                           точек, а таких меньшинство, и до него доходят
                           те, кто уже прочитал свою мойку. */
                        if let branches = report.branches, branches.count > 1 {
                            section(L("report.branchesTitle"), total: branches.reduce(0) { $0 + $1.revenue })
                            ReportBranches(branches: branches, currency: currency, unit: unit)
                        }
                    }
                    /* Пока идёт ответ по другому месяцу, содержимое гаснет,
                       но остаётся на месте: график со свежим выбором стоит
                       над ним и уже показывает, что нажатие услышано. Пустой
                       экран вместо чисел на секунду читался бы поломкой. */
                    .opacity(loading ? 0.45 : 1)
                    .animation(reduceMotion ? nil : .easeOut(duration: Motion.normal), value: loading)
                } else {
                    /* Скелет по форме отчёта с порогом показа: вспышка
                       большого лоадера на быстрый ответ читалась дрожью. */
                    Delayed(active: true) {
                        VStack(alignment: .leading, spacing: 14) {
                            TetrSkeleton(height: 90, radius: 22)
                            TetrSkeleton(width: 140, height: 12)
                                .frame(maxWidth: .infinity, alignment: .center)
                            TetrSkeleton(width: 230, height: 44, radius: 14)
                                .frame(maxWidth: .infinity, alignment: .center)
                            TetrSkeleton(height: 150, radius: 22)
                            TetrSkeleton(height: 110, radius: 22)
                        }
                        .padding(.top, 12)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 34)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.board.ignoresSafeArea())
        .task { await reload() }
        .refreshable { await reload() }
    }

    // ══════════════════════════ месяцы ══════════════════════════

    /**
     * Ряд месяцев графиком, а не плашками.
     *
     * Плашки отвечали «какой месяц открыт» и молчали про главное: ряд из
     * шести чисел рядом друг с другом — это форма полугода, и она видна
     * только фигурой. Столбик считает прибыль, а не выручку: наверху
     * экрана стоит она же, и график обязан показывать то самое число, к
     * которому ведёт.
     *
     * Убыточный месяц уходит под нулевую линию и красится жёлтым. Это не
     * украшение: столбик вниз читается провалом до всякого чтения, а
     * красный в продукте значит «удалить» и здесь появиться не может.
     *
     * Выбранный месяц лежит на бумаге. Лайм сюда не годится вовсе: по
     * светлому полотну он даёт контраст 1.06 и просто не виден, а грейп
     * уже занят самим столбиком.
     */
    @ViewBuilder
    private func timeline(_ months: [API.ReportMonth]) -> some View {
        // одному месяцу не с чем стоять рядом: у новой мойки график был бы
        // одиноким столбиком, который ничего не сравнивает
        if months.count > 1 {
            let row = months.sorted { $0.back > $1.back }
            let up = CGFloat(max(0, row.map(\.profit).max() ?? 0))
            let down = CGFloat(max(0, -(row.map(\.profit).min() ?? 0)))
            /* Ноль делит поле по правде: если убытки вдвое мельче лучшей
               прибыли, под линией и остаётся треть высоты. Половина на
               половину преувеличивала бы провал. */
            let upField = up > 0 ? (down > 0 ? (field * up / (up + down)).rounded() : field) : 0
            let downField = field - upField

            HStack(spacing: 4) {
                ForEach(row) { month in
                    monthColumn(month, up: up, down: down, upField: upField, downField: downField)
                }
            }
            /* Ширина под число месяцев, а не под экран. У мойки, которая
               работает второй месяц, столбцов два, и растянутые на пол-экрана
               они читаются не графиком, а парой плит. Шести столбцам предел
               не мешает: до него они не дотягиваются и делят ширину поровну. */
            .frame(maxWidth: CGFloat(row.count) * 66, alignment: .leading)
            .overlay(alignment: .top) {
                if up > 0 && down > 0 {
                    Rectangle()
                        .fill(Brand.boardInk.opacity(0.13))
                        .frame(height: 1)
                        .offset(y: 9 + upField)
                        .allowsHitTesting(false)
                }
            }
            .padding(.top, 4)
        }
    }

    private func monthColumn(
        _ month: API.ReportMonth,
        up: CGFloat,
        down: CGFloat,
        upField: CGFloat,
        downField: CGFloat
    ) -> some View {
        let on = month.back == back
        let loss = month.profit < 0
        /* Грейп, который знает про тёмную тему, а не заливка марки. Заливка
           неизменна нарочно: она сама марка. Но на почти чёрном полотне
           тёмно-фиолетовый столбик под четверть прозрачности пропадал
           вовсе, и ряд месяцев в темноте оставался с одним столбиком. */
        /* Столбик убыточного месяца берёт тот же красный, что число над
           графиком: иначе один и тот же месяц назывался бы потерей в
           двух разных оттенках. Прибыльный остаётся грейповым — это
           марка, а не «хорошо»: зелёный ряд из двенадцати столбиков
           превратил бы график в оценку каждого месяца, а он про ход. */
        let tone: Color = loss ? Brand.badOnBoard : Brand.grape
        let height: CGFloat = loss
            ? (down > 0 ? max(3, downField * CGFloat(-month.profit) / down) : 0)
            : (up > 0 ? max(3, upField * CGFloat(month.profit) / up) : 0)

        return Button {
            Task { await select(month.back) }
        } label: {
            VStack(spacing: 7) {
                VStack(spacing: 0) {
                    ZStack(alignment: .bottom) {
                        Color.clear
                        if !loss { column(tone: tone, height: height, on: on) }
                    }
                    .frame(height: upField)

                    ZStack(alignment: .top) {
                        Color.clear
                        if loss { column(tone: tone, height: height, on: on) }
                    }
                    .frame(height: downField)
                }
                .frame(height: field)

                Text(monthShort(month.from))
                    .font(.system(size: 12, weight: on ? .bold : .medium))
                    .foregroundStyle(on ? Brand.onBoard : Brand.boardMuted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 9)
            .background {
                if on {
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(Brand.boardSurface)
                        .overlay {
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .strokeBorder(Brand.boardInk.opacity(0.07), lineWidth: 0.8)
                        }
                }
            }
        }
        .buttonStyle(.press)
        .disabled(loading)
        .accessibilityLabel(monthTitle(month.from))
        .accessibilityValue(money(month.profit, currency))
        .accessibilityAddTraits(on ? [.isSelected] : [])
    }

    private func column(tone: Color, height: CGFloat, on: Bool) -> some View {
        RoundedRectangle(cornerRadius: 3, style: .continuous)
            /* Невыбранные месяцы держат тот же цвет, только тише: ряд
               остаётся одним графиком, а не выбранным столбиком среди
               серых палочек. */
            .fill(tone.opacity(on ? 1 : 0.34))
            .frame(width: 17, height: height)
            .animation(reduceMotion ? nil : .snappy(duration: 0.28), value: on)
    }

    // ══════════════════════════ показание ══════════════════════════

    /**
     * Сколько осталось за открытый месяц.
     *
     * Месяц назван словом над числом, а не выведен из выбранной плашки:
     * до графика взгляд доходит вторым, и подпись «Апрель» обязана
     * стоять там же, где сумма, иначе число висит без периода.
     */
    private func reading(_ report: API.Report) -> some View {
        let m = report.current
        return VStack(spacing: 0) {
            Text(monthTitle(m.from))
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Brand.boardMuted)
                .contentTransition(.numericText())

            Text(m.profit < 0 ? L("reports.red") : L("reports.kept"))
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Brand.onBoard.opacity(0.85))
                .padding(.top, 5)

            /* Минус настоящий, U+2212: дефис на таком кегле читается
               точкой. Цвет по знаку — то же правило, что на сводке. */
            Text((m.profit < 0 ? "−" : "") + money(abs(m.profit), currency))
                .font(.system(size: 44, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.sign(m.profit))
                .lineLimit(1)
                .minimumScaleFactor(0.42)
                .padding(.top, 1)
                .contentTransition(.numericText(value: Double(m.profit)))

            change(report)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 14)
    }

    /**
     * Насколько разошлось с прошлым месяцем.
     *
     * В драмах, а не в процентах: процент от маленькой базы врёт. И
     * молчим, когда сравнивать не с чем — у самого старого месяца базы
     * нет, и «+100 %» от пустоты это не новость, а деление на ноль в
     * другой одежде.
     */
    @ViewBuilder
    private func change(_ report: API.Report) -> some View {
        if let base = report.base {
            let diff = report.current.profit - base.profit
            if abs(diff) >= 100 {
                HStack(spacing: 5) {
                    /* Знак стрелкой и цифрой, не одним цветом: смысл не
                       передаётся оттенком — экран смотрят на мокром
                       телефоне под солнцем. */
                    Image(systemName: diff > 0 ? "arrow.up" : "arrow.down")
                        .font(.system(size: 9, weight: .black))
                    Text("\(diff > 0 ? "+" : "−")\(money(abs(diff), currency))")
                        .font(.system(size: 13, weight: .bold))
                        .monospacedDigit()
                    Text(L("summary.vsPrevMonth"))
                        .font(.system(size: 12))
                        .foregroundStyle(Brand.boardMuted)
                }
                .foregroundStyle(Brand.sign(diff))
                .padding(.horizontal, 11)
                .padding(.vertical, 6)
                .background(Brand.chipRest, in: .rect(cornerRadius: 10, style: .continuous))
                .padding(.top, 10)
            }
        }
    }

    // ══════════════════════════ кольцо ══════════════════════════

    /**
     * Какой долей прихода остался владелец.
     *
     * Три колонки «заплатили / сотрудникам / расходы» отвечали на вопрос
     * «сколько», но не на тот, ради которого открывают отчёт: из каждых
     * ста драм до владельца дошло тридцать четыре. Долю не считают в
     * уме, её видят — и кольцо это единственная фигура, у которой целое
     * замкнуто и потому не требует подписи «из чего».
     *
     * Кусков ровно три, и больше их не станет: приход раскладывается на
     * долю владельца, людей и расходы, других слагаемых у него нет.
     *
     * Внизу карточки, за волосяной линией, стоит операционная строка:
     * машины, средний чек, скидки. Она приросла сюда не для экономии
     * места — это те самые числа, из которых сложился приход в шапке
     * карточки, и стоять они должны при нём.
     */
    @ViewBuilder
    private func composition(_ m: API.ReportCurrent) -> some View {
        if m.revenue > 0 || m.costs > 0 || m.payroll > 0 {
            let parts = Split.money(mine: m.profit, staff: m.payroll, costs: m.costs)

            VStack(spacing: 0) {
                HStack(alignment: .center, spacing: 16) {
                    MoneyDonut(
                        parts: parts,
                        percent: max(0, min(100, m.kept)),
                        caption: L("common.you")
                    )

                    VStack(alignment: .leading, spacing: 0) {
                        Text(L("summary.paidIn"))
                            .font(.system(size: 12))
                            .foregroundStyle(Brand.boardMuted)
                        Text(money(m.revenue, currency))
                            .font(.system(size: 19, weight: .bold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(Brand.onBoard)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                            .contentTransition(.numericText(value: Double(m.revenue)))

                        VStack(spacing: 7) {
                            ForEach(parts) { part in
                                legend(part)
                            }
                        }
                        .padding(.top, 11)
                    }
                }
                .padding(15)

                hairline
                operations(m)
            }
            .clipShape(.rect(cornerRadius: 22, style: .continuous))
            .background(Brand.boardSurface, in: .rect(cornerRadius: 22, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .strokeBorder(Brand.boardInk.opacity(0.07), lineWidth: 0.8)
            }
            .padding(.top, 18)
        }
    }

    private func legend(_ part: Split) -> some View {
        HStack(spacing: 7) {
            // единственные настоящие кружки в продукте: точки, а не форма
            Circle()
                .fill(part.ink)
                .frame(width: 7, height: 7)
            Text(part.label)
                .font(.system(size: 13))
                .foregroundStyle(Brand.boardMuted)
                .lineLimit(1)

            Spacer(minLength: 8)

            Text(money(part.amount, currency))
                .font(.system(size: 13, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .accessibilityElement(children: .combine)
    }

    /**
     * Машины, средний чек и скидки — одной тихой строкой.
     *
     * Три числа в трёх карточках сделали бы четвёртый ряд коробок на
     * экране, где их и так хватает, а отвечают они на подробность, а не
     * на вопрос. Скидки называются, только когда они были: «скидок 0 ֏»
     * сообщает ровно то же, что их отсутствие.
     */
    private func operations(_ m: API.ReportCurrent) -> some View {
        HStack(spacing: 6) {
            Text(Terms.units(m.count, unit))
            if m.avgCheck > 0 {
                dot
                Text("\(L("owner.avgCheck")) \(money(m.avgCheck, currency))")
            }
            if m.discounts > 0 {
                dot
                Text("\(L("reports.discounts")) \(money(m.discounts, currency))")
            }
            Spacer(minLength: 0)
        }
        .font(.system(size: 13))
        .monospacedDigit()
        .foregroundStyle(Brand.boardMuted)
        .lineLimit(1)
        .minimumScaleFactor(0.68)
        .padding(.horizontal, 15)
        .padding(.vertical, 11)
    }

    // ══════════════════════════ приход ══════════════════════════

    /**
     * Откуда пришли деньги и чем за них платили.
     *
     * Обе вещи про один и тот же приход, разрезанный по-разному: сверху
     * по услугам, снизу по способу оплаты. Раньше это были две карточки
     * подряд, и вторая повторяла то же целое третий раз за экран.
     *
     * Итог раздела стоит в его заголовке, а не строкой «Всего» внизу:
     * читают сверху вниз, и целое нужно раньше долей, а не после них.
     */
    @ViewBuilder
    private func income(_ report: API.Report) -> some View {
        let rows = report.services.filter { $0.value > 0 }.sorted { $0.value > $1.value }
        let ways = report.split.filter { $0.revenue > 0 }.sorted { $0.revenue > $1.revenue }

        if !rows.isEmpty || !ways.isEmpty {
            let total = rows.reduce(0) { $0 + $1.value }

            VStack(alignment: .leading, spacing: 0) {
                /* В заголовке стоит сумма ИМЕННО ЭТИХ строк, а не выручка
                   месяца, и это не мелочь. Разрез по услугам собирается из
                   позиций записи, и записи, заведённой без услуги, в нём нет:
                   у мойки, где половину машин пишут суммой, разрез уже, чем
                   приход. Подписать его выручкой значило бы поставить над
                   единственной строкой в 15 000 её сотую долю от 523 800 и
                   назвать эту строку «100 %». Целое прихода звучит выше,
                   в шапке кольца, где оно и есть целое. */
                section(L("reports.whereFrom"), total: rows.isEmpty ? report.current.revenue : total)

                VStack(spacing: 0) {
                    if !rows.isEmpty {
                        lines(rows, total: total, tone: Brand.mintInk, services: true)
                    }
                    if !ways.isEmpty {
                        if !rows.isEmpty { hairline }
                        methods(ways)
                    }
                }
                .clipShape(.rect(cornerRadius: 22, style: .continuous))
                .background(Brand.boardSurface, in: .rect(cornerRadius: 22, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .strokeBorder(Brand.boardInk.opacity(0.07), lineWidth: 0.8)
                }
            }
        }
    }

    /**
     * Способы оплаты — ряд метров, а не ещё один список полос.
     *
     * Их два-четыре, и вопрос к ним один: какая часть месяца прошла
     * наличными. Метры стоят рядом, а не друг под другом, потому что
     * сравнивают их между собой, а не с целым: доля подписана числом,
     * а длина под ней добавляет ей вес.
     *
     * Краски те же, что в сводке: мята наличным, лаванда карте, кобальт
     * переводу. Один способ оплаты окрашен одинаково во всём продукте.
     */
    private func methods(_ ways: [API.SplitSegment]) -> some View {
        let total = max(1, ways.reduce(0) { $0 + $1.revenue })

        return VStack(alignment: .leading, spacing: 10) {
            Text(L("today.paidWith"))
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Brand.boardMuted)

            HStack(alignment: .top, spacing: 12) {
                ForEach(ways) { way in
                    method(way, of: total)
                }
            }
        }
        .padding(.horizontal, 15)
        .padding(.vertical, 13)
    }

    private func method(_ way: API.SplitSegment, of total: Int) -> some View {
        let share = Double(way.revenue) / Double(total)
        let percent = Int((share * 100).rounded())
        let ink = paymentInk(way.payment)

        return VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 4) {
                Text(paymentLabel(way.payment))
                    .font(.system(size: 11))
                    .foregroundStyle(Brand.boardMuted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                Text("\(percent)%")
                    .font(.system(size: 11, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(ink)
                Spacer(minLength: 0)
            }

            Text(money(way.revenue, currency))
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)
                .lineLimit(1)
                .minimumScaleFactor(0.6)

            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 1.5, style: .continuous)
                        .fill(Brand.boardInk.opacity(0.08))
                    RoundedRectangle(cornerRadius: 1.5, style: .continuous)
                        .fill(ink)
                        // не тоньше трёх точек: метр нулевой длины читается
                        // как отсутствие способа, а способ есть
                        .frame(width: max(3, proxy.size.width * share))
                }
            }
            .frame(height: 3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "\(paymentLabel(way.payment)), \(money(way.revenue, currency)), \(percent)%"
        )
    }

    // ══════════════════════════ расход ══════════════════════════

    @ViewBuilder
    private func outgo(_ costs: [API.ReportLine]) -> some View {
        let rows = costs.filter { $0.value > 0 }.sorted { $0.value > $1.value }
        if !rows.isEmpty {
            let total = rows.reduce(0) { $0 + $1.value }

            VStack(alignment: .leading, spacing: 0) {
                // то же правило, что у прихода: заголовок называет сумму
                // перечисленного под ним, и доли складываются ровно в сто
                section(L("reports.whereGone"), total: total)

                lines(rows, total: total, tone: Brand.sandInk)
                    .clipShape(.rect(cornerRadius: 22, style: .continuous))
                    .background(Brand.boardSurface, in: .rect(cornerRadius: 22, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .strokeBorder(Brand.boardInk.opacity(0.07), lineWidth: 0.8)
                    }
            }
        }
    }

    // ══════════════════════════ разрез строками ══════════════════════════

    /**
     * Строки, у каждой из которых своя доля залита в неё саму.
     *
     * Было имя, сумма и полоска под ними — три этажа на строку, из
     * которых читались два. Заливка отвечает на «сколько из всего» тем
     * же движением, что и полоска, но не занимает собственной высоты, и
     * восемь услуг перестают быть простынёй.
     *
     * Справа у заливки плотная засечка в две точки. Мягкий тон
     * заканчивается размыто, и без неё длину пришлось бы угадывать;
     * засечка ставит на шкале метку, а вместе с ней у разреза появляется
     * точность, ради которой его и открывают.
     *
     * Пустой разрез не показываем вовсе: раздел, в котором написано
     * «пусто», занимает место и не отвечает ни на что.
     */
    private func lines(
        _ rows: [API.ReportLine],
        total: Int,
        tone: Color,
        /* Разрез по услугам переводит заводские названия, разрез по
           расходам — нет: категорию расхода придумывает владелец, и
           сверять её не с чем. */
        services: Bool = false
    ) -> some View {
        // просвет в точку между строками: он виден ровно там, где есть
        // заливка, и отделяет соседние доли, не рисуя ни одной линии
        VStack(spacing: 1) {
            ForEach(rows) { row in
                line(
                    name: services ? Terms.service(row.name) : row.name,
                    note: row.count.map { Terms.units($0, unit) }
                        ?? (row.monthly == true ? L("expenses.perMonth") : L("expenses.oneOff")),
                    value: row.value,
                    of: total,
                    tone: tone
                )
            }
        }
    }

    private func line(name: String, note: String, value: Int, of total: Int, tone: Color) -> some View {
        let share = total > 0 ? Double(value) / Double(total) : 0
        let percent = Int((share * 100).rounded())

        return HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 1) {
                Text(name)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Brand.onBoard)
                    .lineLimit(1)
                if !note.isEmpty {
                    Text(note)
                        .font(.system(size: 11))
                        .monospacedDigit()
                        .foregroundStyle(Brand.boardMuted)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 8)

            Text(money(value, currency))
                .font(.system(size: 13, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)
                .lineLimit(1)
            Text("\(percent)%")
                .font(.system(size: 12))
                .monospacedDigit()
                .foregroundStyle(Brand.boardMuted)
                // «100 %» шире прочих долей, и на узкой колонке знак процента
                // уезжал на вторую строку
                .lineLimit(1)
                .frame(width: 38, alignment: .trailing)
        }
        .padding(.horizontal, 15)
        .padding(.vertical, 11)
        .background {
            GeometryReader { proxy in
                let width = max(4, min(proxy.size.width - 2, (proxy.size.width - 2) * share))
                HStack(spacing: 0) {
                    Rectangle().fill(tone.opacity(0.16)).frame(width: width)
                    Rectangle().fill(tone.opacity(0.55)).frame(width: 2)
                    Spacer(minLength: 0)
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(name), \(money(value, currency)), \(percent)%")
    }

    // ══════════════════════════ люди ══════════════════════════

    /**
     * Кто это сделал.
     *
     * Сумма — заработок человека, а не выручка, которую он принёс:
     * приход уже назван кольцом выше, и повторять его именами значило бы
     * показать одни и те же деньги дважды.
     *
     * Человек показан кружком с буквой своего цвета — так он выглядит в
     * ленте смены, в команде, в зарплатах и в карточке дня. Это
     * единственное место, где он раньше оставался безымянной строкой с
     * точкой.
     */
    @ViewBuilder
    private func team(_ m: API.ReportCurrent) -> some View {
        let rows = m.byStaff.filter { $0.count > 0 }.sorted { $0.earned > $1.earned }
        if !rows.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                section(Terms.staff(session.tenant?.staffRole ?? "").many, total: m.payroll)

                VStack(spacing: 0) {
                    ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                        if index > 0 { hairline }
                        person(row)
                    }
                }
                .background(Brand.boardSurface, in: .rect(cornerRadius: 22, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .strokeBorder(Brand.boardInk.opacity(0.07), lineWidth: 0.8)
                }
            }
        }
    }

    private func person(_ row: API.StaffLine) -> some View {
        let name = row.name ?? "—"

        return HStack(spacing: 11) {
            Text(String(name.prefix(1)))
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 32, height: 32)
                .background(Brand.personTone(name).base, in: .circle)

            VStack(alignment: .leading, spacing: 1) {
                Text(name)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Brand.onBoard)
                    .lineLimit(1)
                Text(Terms.units(row.count, unit))
                    .font(.system(size: 12))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)
            }

            Spacer(minLength: 8)

            Text(money(row.earned, currency))
                .font(.system(size: 15, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
        .accessibilityElement(children: .combine)
    }

    // ══════════════════════════ общее ══════════════════════════

    /// Заголовок раздела с его итогом справа.
    private func section(_ title: String, total: Int) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Brand.boardMuted)
            Spacer(minLength: 8)
            Text(money(total, currency))
                .font(.system(size: 13, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(Brand.boardMuted)
                .lineLimit(1)
                .contentTransition(.numericText(value: Double(total)))
        }
        .padding(.horizontal, 4)
        .padding(.top, 22)
        .padding(.bottom, 7)
    }

    private var hairline: some View {
        Rectangle()
            .fill(Brand.boardInk.opacity(0.07))
            .frame(height: 1)
    }

    private var dot: some View {
        Text("·").foregroundStyle(Brand.boardMuted.opacity(0.6))
    }

    /// Единый вид отказа продукта, а не свой на каждом экране.
    private func problem(_ text: String) -> some View {
        TetrFailure(title: text, retry: { await reload() })
            .padding(.top, 40)
    }

    // ══════════════════════════ данные ══════════════════════════

    /// «Апрель», а с прошлого года — «Апрель 2025». Год без нужды не
    /// пишем: в окне из шести месяцев он одинаков у всех, кроме зимнего
    /// хвоста, и лишнее число рядом с суммами читается частью суммы.
    private func monthTitle(_ date: Date) -> String {
        let crossesYear = !Calendar.current.isDate(date, equalTo: Date(), toGranularity: .year)
        return named(date, template: crossesYear ? "LLLL yyyy" : "LLLL")
            .capitalized(with: LangStore.currentLang.locale)
    }

    /// Подпись под столбиком: «апр».
    private func monthShort(_ date: Date) -> String {
        named(date, template: "LLL")
    }

    private func named(_ date: Date, template: String) -> String {
        let f = DateFormatter()
        f.locale = LangStore.currentLang.locale
        f.setLocalizedDateFormatFromTemplate(template)
        /* Границы месяца считает сервер в зоне бизнеса; подписать их зоной
           телефона значит сдвинуть название у владельца в поездке. */
        if let tz = session.tenant?.timezone, let zone = TimeZone(identifier: tz) {
            f.timeZone = zone
        }
        return f.string(from: date)
    }

    private func select(_ month: Int) async {
        guard month != back else { return }
        back = month
        await reload()
    }

    private func reload() async {
        loading = true
        defer { loading = false }
        failure = nil

        do {
            report = try await session.authed { token in
                try await APIClient.shared.send("report?back=\(back)", token: token, as: API.Report.self)
            }
        } catch is CancellationError {
            // потянули вниз и отпустили: ничего не сломалось
            return
        } catch let error as APIError {
            /* Нули вместо разбора — худшее, что может показать этот
               экран: неверные данные выглядят как верные. Лучше честно
               ничего. */
            failure = error.isOffline
                ? L("errors.offline")
                : L("errors.server", "\(error.status) \(error.code ?? "—")")
        } catch {
            failure = Failure.text(error)
        }
    }
}

/**
 * Кольцо разреза: три куска и доля владельца в центре.
 *
 * Принадлежит отчёту и только ему — ровно так же, как полоса долей
 * принадлежит сводке. Одна и та же фигура на двух экранах по разным
 * данным читается одной вещью, и разводить разрезы по органам дешевле,
 * чем потом объяснять, почему они не сходятся.
 *
 * Куски разделены угловым просветом, а не обводкой: обводка цветом
 * подложки на тёмной теме превращается в чёрную нитку, а просвет
 * работает одинаково в обеих.
 *
 * Концы кусков срезаны прямо. Скруглённые заходили бы друг на друга и
 * прибавляли каждому куску по градусу с обеих сторон — то есть врали бы
 * о доле тем сильнее, чем мельче кусок.
 */
private struct MoneyDonut: View {
    let parts: [Split]
    /// Доля владельца в процентах — то же число, что считает сервер.
    let percent: Int
    let caption: String

    var size: CGFloat = 104
    var width: CGFloat = 13

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let total = max(1, parts.reduce(0) { $0 + $1.amount })
        // просвет только там, где кусков больше одного: у единственного он
        // отгрыз бы кусок от самого себя
        let gap = parts.count > 1 ? 0.008 : 0

        ZStack {
            Circle()
                .stroke(Brand.boardInk.opacity(0.07), lineWidth: width)

            ForEach(Array(offsets(total: total).enumerated()), id: \.offset) { index, span in
                /* Просвет отгрызается с обоих концов, но кусок от него не
                   переворачивается: у доли в полпроцента конец не может
                   оказаться раньше начала. */
                let from = min(span.start + gap / 2, span.end)
                let to = max(span.end - gap / 2, from)

                Circle()
                    .trim(from: from, to: to)
                    .stroke(parts[index].ink, style: .init(lineWidth: width, lineCap: .butt))
                    .rotationEffect(.degrees(-90))
            }

            VStack(spacing: 0) {
                Text("\(percent)%")
                    .font(.system(size: 19, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Brand.onBoard)
                    .contentTransition(.numericText(value: Double(percent)))
                Text(caption)
                    .font(.system(size: 10))
                    .foregroundStyle(Brand.boardMuted)
                    .lineLimit(1)
            }
        }
        .frame(width: size, height: size)
        .animation(reduceMotion ? nil : .snappy(duration: 0.4), value: total)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L("summary.share", "\(percent)%"))
    }

    /// Начало и конец каждого куска в долях круга.
    private func offsets(total: Int) -> [(start: Double, end: Double)] {
        var running = 0.0
        return parts.map { part in
            let start = running
            running += Double(part.amount) / Double(total)
            return (start, running)
        }
    }
}
