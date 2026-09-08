import SwiftUI

/// Keep the period, labels and numbers together while the dashboard reloads.
/// The detail is an expansion of this snapshot, not a second report request.
struct ProfitDetailSnapshot: Identifiable {
    let id = UUID()
    let summary: API.Summary
    let period: String
    let title: String
    let dates: String
    let currency: String
}

struct ProfitDetailView: View {
    let snapshot: ProfitDetailSnapshot
    @Environment(\.dismiss) private var dismiss
    @ScaledMetric(relativeTo: .largeTitle) private var amountSize = 46.0

    private var summary: API.Summary { snapshot.summary }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                heading

                VStack(alignment: .leading, spacing: 24) {
                    composition
                    trend
                    expenses
                }
                .padding(20)
                .padding(.bottom, 24)
            }
        }
        .background(Brand.board)
        .safeAreaInset(edge: .top, spacing: 0) {
            HStack {
                Text(L("profit.breakdown"))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Brand.onLime)
                Spacer()
                Button(L("common.close"), systemImage: "xmark") { dismiss() }
                    .labelStyle(.iconOnly)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Brand.onLime)
                    .frame(width: 44, height: 44)
                    .buttonStyle(.glass)
                    .buttonBorderShape(.circle)
                    .accessibilityIdentifier("owner.profit.close")
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 6)
            .background(Brand.lime.ignoresSafeArea(edges: .top))
        }
        .accessibilityIdentifier("owner.profit.detail")
    }

    private var heading: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(snapshot.title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Brand.onLime.opacity(0.75))
            Text(formatted(summary.profit))
                .font(.system(size: amountSize, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.onLime)
                .lineLimit(1)
                .minimumScaleFactor(0.4)
                .accessibilityIdentifier("owner.profit.amount")
            Text(snapshot.dates)
                .font(.subheadline)
                .foregroundStyle(Brand.onLime.opacity(0.75))
                .accessibilityIdentifier("owner.profit.dates")
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .padding(.bottom, 28)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Brand.lime, in: .rect(bottomLeadingRadius: 28, bottomTrailingRadius: 28))
        /* Потолок из того же лайма над шапкой.
         *
         * Панель с названием и крестиком приклеена к верху, а лист под
         * ней прокручивается. Стоило оттянуть его вниз, и между лаймовой
         * панелью и лаймовой шапкой открывалась серая полоса: лайм
         * буквально отрывался от лайма. Прямоугольник уезжает вместе с
         * листом и закрывает всё, что откроется при оттягивании. */
        .background(alignment: .top) {
            Brand.lime
                .frame(height: 600)
                .offset(y: -600)
        }
        .accessibilityElement(children: .contain)
    }

    private var composition: some View {
        VStack(spacing: 0) {
            amountRow(L("owner.revenue"), summary.stats.revenue, color: Brand.grape)
            amountRow(L("summary.toStaff"), summary.stats.payroll,
                      color: Brand.lavenderInk, subtract: true, note: L("profit.accrued"))
            amountRow(L("expenses.title"), summary.costs.total, color: Brand.sandInk, subtract: true)
            Divider().padding(.vertical, 4)
            amountRow(snapshot.title, summary.profit, color: Brand.sign(summary.profit), result: true)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .paperCard(24)
    }

    private var trend: some View {
        VStack(alignment: .leading, spacing: 0) {
            if summary.series.isEmpty {
                Text(L(snapshot.period == "today" ? "summary.paymentsDay" : "summary.paymentsMonth"))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Brand.onBoard)
                Text(L("profit.noPayments"))
                    .font(.subheadline)
                    .foregroundStyle(Brand.boardMuted)
                    .padding(.top, 8)
            } else {
                RevenueChart(
                    series: summary.series,
                    title: L(snapshot.period == "today" ? "summary.paymentsDay" : "summary.paymentsMonth"),
                    axis: { snapshot.period == "today" ? "\($0.hourLabel):00" : $0.dayLabel },
                    money: { formatted($0) }
                )
            }
        }
        .padding(16)
        .paperCard(24)
    }

    private var expenses: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(L("expenses.title"))
                .font(.headline)
                .foregroundStyle(Brand.onBoard)
                .padding(.bottom, 6)
            amountRow(L("expenses.oneOff"), summary.costs.oneOff, color: Brand.sandInk)
            amountRow(L("profit.monthlyShare"), summary.costs.monthlyShare, color: Brand.sandInk)
        }
        .padding(16)
        .paperCard(24)
    }

    private func amountRow(_ title: String, _ amount: Int, color: Color,
                           subtract: Bool = false, note: String? = nil, result: Bool = false) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .firstTextBaseline, spacing: 16) {
                rowLabel(title, note: note)
                Spacer(minLength: 8)
                rowAmount(amount, color: color, subtract: subtract, result: result)
                    .fixedSize()
            }
            VStack(alignment: .leading, spacing: 6) {
                rowLabel(title, note: note)
                rowAmount(amount, color: color, subtract: subtract, result: result)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 12)
        .accessibilityElement(children: .combine)
    }

    private func rowLabel(_ title: String, note: String?) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title).font(.subheadline).foregroundStyle(Brand.onBoard)
            if let note { Text(note).font(.caption).foregroundStyle(Brand.boardMuted) }
        }
    }

    private func rowAmount(_ amount: Int, color: Color, subtract: Bool, result: Bool) -> some View {
        Text((subtract && amount > 0 ? "−" : "") + formatted(amount))
            .font(result ? .title3.bold() : .body.weight(.semibold))
            .monospacedDigit()
            .foregroundStyle(color)
    }

    private func formatted(_ amount: Int) -> String {
        (amount < 0 ? "−" : "") + money(abs(amount), snapshot.currency)
    }
}
