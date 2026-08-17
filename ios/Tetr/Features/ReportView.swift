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
 * Порядок задан вопросами, а не удобством вёрстки, и он тот же, что в
 * кабинете:
 *
 *   1. сколько заработал за месяц → показание наверху;
 *   2. лучше или хуже стало       → строка сравнения;
 *   3. из чего сложилось          → три слагаемых;
 *   4. откуда пришли деньги       → услуги;
 *   5. куда ушли                  → расходы по названиям;
 *   6. чем платили                → способы оплаты;
 *   7. кто это сделал             → люди.
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

    private var currency: String { session.tenant?.currency ?? "AMD" }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if let failure {
                    problem(failure)
                } else if let report {
                    months(report)
                    reading(report)
                    breakdown(report.current)
                    bars(L("reports.whereFrom"), report.services, tone: Brand.lavenderInk)
                    bars(L("reports.whereGone"), report.costsByCategory, tone: Brand.sandInk)
                    payments(report.split)
                    team(report.current)
                } else {
                    TetrLoader(size: 26, tint: Brand.grape)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 80)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.board.ignoresSafeArea())
        .task { await reload() }
        .refreshable { await reload() }
    }

    // ══════════════════════════ выбор месяца ══════════════════════════

    /**
     * Месяцы жёлобом, а не выпадающим списком.
     *
     * Их не больше шести, и у каждого рядом с названием стоит его число:
     * выбирают, посмотрев, а не наугад. Свежий слева — так же, как в
     * таблице кабинета.
     */
    private func months(_ report: API.Report) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(report.months) { month in
                    let on = month.back == back
                    Button {
                        Task { await select(month.back) }
                    } label: {
                        VStack(spacing: 2) {
                            Text(monthName(month.from))
                                .font(.system(size: 13.5, weight: .semibold))
                            Text(money(month.profit, currency))
                                .font(.system(size: 11))
                                .monospacedDigit()
                                .opacity(0.7)
                        }
                        .foregroundStyle(on ? Brand.onLime : Brand.onBoard)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 9)
                        .background(on ? Brand.lime : Brand.boardInk.opacity(0.07), in: .capsule)
                    }
                    .buttonStyle(.press)
                    .disabled(loading)
                    .accessibilityAddTraits(on ? [.isSelected] : [])
                }
            }
            .padding(.vertical, 10)
        }
        .scrollClipDisabled()
    }

    // ══════════════════════════ показание ══════════════════════════

    private func reading(_ report: API.Report) -> some View {
        let m = report.current
        return VStack(spacing: 0) {
            Text(m.profit < 0 ? L("summary.redMonth") : L("summary.keptMonth"))
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Brand.onBoard.opacity(0.85))
                .padding(.top, 8)

            /* Минус настоящий, U+2212: дефис на таком кегле читается
               точкой. Убыток жёлтым, не красным — красный в продукте
               значит «удалить». */
            Text((m.profit < 0 ? "−" : "") + money(abs(m.profit), currency))
                .font(.system(size: 46, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(m.profit < 0 ? Brand.warnOnBoard : Brand.onBoard)
                .lineLimit(1)
                .minimumScaleFactor(0.42)
                .contentTransition(.numericText(value: Double(m.profit)))

            change(report)
        }
        .frame(maxWidth: .infinity)
        .padding(.bottom, 6)
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
                        .font(.system(size: 12.5, weight: .bold))
                        .monospacedDigit()
                    Text(L("summary.vsPrevMonth"))
                        .font(.system(size: 12))
                        .foregroundStyle(Brand.boardMuted)
                }
                .foregroundStyle(diff > 0 ? Brand.goodOnBoard : Brand.warnOnBoard)
                .padding(.horizontal, 11)
                .padding(.vertical, 6)
                .background(Brand.chipRest, in: .rect(cornerRadius: 9))
                .padding(.top, 9)
            }
        }
    }

    /// Из чего сложился результат: приход минус люди минус расходы.
    private func breakdown(_ m: API.ReportCurrent) -> some View {
        VStack(spacing: 10) {
            HStack(spacing: 0) {
                source(L("summary.paidIn"), m.revenue, sign: "+", ink: Brand.mintInk)
                divider
                source(L("summary.toStaff"), m.payroll, sign: "−", ink: Brand.lavenderInk)
                divider
                source(L("expenses.title"), m.costs, sign: "−", ink: Brand.sandInk)
            }
            .padding(.vertical, 10)
            .background(Brand.boardSurface, in: .rect(cornerRadius: 19))
            .overlay {
                RoundedRectangle(cornerRadius: 19, style: .continuous)
                    .strokeBorder(Brand.boardInk.opacity(0.07), lineWidth: 0.8)
            }

            /* Машины, средний чек и скидки — операционная строка. Скидки
               называются, только когда они были: «скидок 0 ֏» сообщает
               ровно то же, что их отсутствие. */
            HStack(spacing: 6) {
                Text(Terms.units(m.count, session.tenant?.unitOne ?? ""))
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
            .font(.system(size: 12.5))
            .monospacedDigit()
            .foregroundStyle(Brand.boardMuted)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
        }
        .padding(.top, 8)
    }

    private func source(_ title: String, _ amount: Int, sign: String, ink: Color) -> some View {
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

    private var divider: some View {
        Rectangle().fill(Brand.boardInk.opacity(0.09)).frame(width: 1, height: 31)
    }

    private var dot: some View {
        Text("·").foregroundStyle(Brand.boardMuted.opacity(0.6))
    }

    // ══════════════════════════ разрезы ══════════════════════════

    /**
     * Строки с полосой длиной в свою долю.
     *
     * Полоса отвечает «сколько из всего» без чтения, а сумма стоит в той
     * же строке. Пустой разрез не показываем вовсе: раздел, в котором
     * написано «пусто», занимает место и не отвечает ни на что.
     */
    @ViewBuilder
    private func bars(_ title: String, _ lines: [API.ReportLine], tone: Color) -> some View {
        let rows = lines.filter { $0.value > 0 }.sorted { $0.value > $1.value }
        if !rows.isEmpty {
            let total = rows.reduce(0) { $0 + $1.value }
            VStack(alignment: .leading, spacing: 12) {
                Text(title)
                    .font(.system(size: 13.5, weight: .semibold))
                    .foregroundStyle(Brand.onBoard)

                ForEach(rows) { row in
                    bar(
                        name: row.name,
                        note: row.count.map { Terms.units($0, session.tenant?.unitOne ?? "") }
                            ?? (row.monthly == true ? L("expenses.perMonth") : L("expenses.oneOff")),
                        value: row.value,
                        of: total,
                        tone: tone
                    )
                }
            }
            .padding(15)
            .background(Brand.boardSurface, in: .rect(cornerRadius: 20))
            .overlay {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .strokeBorder(Brand.boardInk.opacity(0.07), lineWidth: 0.8)
            }
            .padding(.top, 12)
        }
    }

    private func bar(name: String, note: String, value: Int, of total: Int, tone: Color) -> some View {
        let share = total > 0 ? Int((Double(value) / Double(total) * 100).rounded()) : 0
        return VStack(spacing: 6) {
            HStack(spacing: 6) {
                Text(name)
                    .font(.system(size: 13))
                    .foregroundStyle(Brand.onBoard)
                    .lineLimit(1)
                Text(note)
                    .font(.system(size: 11.5))
                    .foregroundStyle(Brand.boardMuted)
                    .lineLimit(1)

                Spacer(minLength: 8)

                Text(money(value, currency))
                    .font(.system(size: 13.5, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(Brand.onBoard)
                    .lineLimit(1)
            }

            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(Brand.boardInk.opacity(0.08))
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(tone)
                        // не меньше двух процентов: нулевая полоса
                        // читается как отсутствие строки, а строка есть
                        .frame(width: max(proxy.size.width * CGFloat(max(share, 2)) / 100, 4))
                }
            }
            .frame(height: 6)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(name), \(money(value, currency)), \(share)%")
    }

    @ViewBuilder
    private func payments(_ split: [API.SplitSegment]) -> some View {
        let parts = split.filter { $0.revenue > 0 }.sorted { $0.revenue > $1.revenue }
        if !parts.isEmpty {
            let total = parts.reduce(0) { $0 + $1.revenue }
            VStack(alignment: .leading, spacing: 12) {
                Text(L("today.paidWith"))
                    .font(.system(size: 13.5, weight: .semibold))
                    .foregroundStyle(Brand.onBoard)

                ForEach(parts) { part in
                    bar(
                        name: paymentLabel(part.payment),
                        note: "",
                        value: part.revenue,
                        of: total,
                        tone: Brand.mintInk
                    )
                }
            }
            .padding(15)
            .background(Brand.boardSurface, in: .rect(cornerRadius: 20))
            .overlay {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .strokeBorder(Brand.boardInk.opacity(0.07), lineWidth: 0.8)
            }
            .padding(.top, 12)
        }
    }

    /// Кто это сделал. Сумма — заработок человека, а не выручка, которую
    /// он принёс: приход уже назван строкой вычитания выше.
    @ViewBuilder
    private func team(_ m: API.ReportCurrent) -> some View {
        let rows = m.byStaff.filter { $0.count > 0 }.sorted { $0.earned > $1.earned }
        if !rows.isEmpty {
            VStack(spacing: 0) {
                HStack {
                    Text(Terms.staff(session.tenant?.staffRole ?? "").many)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Brand.boardMuted)
                    Spacer()
                }
                .padding(.horizontal, 6)
                .padding(.top, 20)
                .padding(.bottom, 4)

                ForEach(rows) { row in
                    HStack(spacing: 9) {
                        Circle()
                            .fill(Brand.person(row.name ?? "—"))
                            .frame(width: 7, height: 7)
                        Text(row.name ?? "—")
                            .font(.system(size: 14.5, weight: .semibold))
                            .foregroundStyle(Brand.onBoard)
                            .lineLimit(1)

                        Spacer(minLength: 8)

                        Text(Terms.units(row.count, session.tenant?.unitOne ?? ""))
                            .font(.system(size: 12.5))
                            .monospacedDigit()
                            .foregroundStyle(Brand.boardMuted)
                        Text(money(row.earned, currency))
                            .font(.system(size: 14.5, weight: .semibold))
                            .monospacedDigit()
                            .foregroundStyle(Brand.onBoard)
                    }
                    .padding(.horizontal, 6)
                    .padding(.vertical, 10)
                    .accessibilityElement(children: .combine)

                    if row.id != rows.last?.id {
                        Divider().overlay(Brand.boardInk.opacity(0.07))
                    }
                }
            }
        }
    }

    private func problem(_ text: String) -> some View {
        VStack(spacing: 12) {
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

    // ══════════════════════════ данные ══════════════════════════

    private func monthName(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = LangStore.currentLang.locale
        f.setLocalizedDateFormatFromTemplate("LLLL")
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
