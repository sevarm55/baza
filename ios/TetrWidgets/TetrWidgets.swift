import ActivityKit
import SwiftUI
import WidgetKit

@main
struct TetrWidgets: WidgetBundle {
    var body: some Widget {
        ShiftLiveActivityWidget()
    }
}

struct ShiftLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ShiftActivityAttributes.self) { context in
            lockScreen(context)
                .activityBackgroundTint(ShiftLiveStyle.ink)
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text("\(context.state.count)")
                            .font(.title2.bold())
                            .monospacedDigit()
                            .contentTransition(.numericText())
                        Text(unit(context.attributes.unitName, count: context.state.count))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }

                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 1) {
                        Text(money(context.state.revenue, context.attributes.currency))
                            .font(.headline)
                            .monospacedDigit()
                            .contentTransition(.numericText())
                            .privacySensitive()
                        Text(L("widget.revenue"))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }

                DynamicIslandExpandedRegion(.bottom) {
                    HStack(spacing: 10) {
                        Image(systemName: "clock.fill")
                            .foregroundStyle(ShiftLiveStyle.lime)
                        Text(context.attributes.openedAt, style: .timer)
                            .font(.caption.monospacedDigit())

                        if context.state.pending > 0 {
                            Label("\(context.state.pending)", systemImage: "arrow.triangle.2.circlepath")
                                .font(.caption)
                                .foregroundStyle(ShiftLiveStyle.lime)
                        }

                        Spacer(minLength: 4)

                        Text(L("day.cashInShift", money(context.state.cash, context.attributes.currency)))
                            .font(.caption)
                            .monospacedDigit()
                            .privacySensitive()
                    }
                }
            } compactLeading: {
                HStack(spacing: 4) {
                    Image(systemName: "list.clipboard.fill")
                        .foregroundStyle(ShiftLiveStyle.lime)
                    Text("\(context.state.count)")
                        .font(.caption.bold())
                        .monospacedDigit()
                        .contentTransition(.numericText())
                }
            } compactTrailing: {
                Text(shortMoney(context.state.revenue, context.attributes.currency))
                    .font(.caption.bold())
                    .monospacedDigit()
                    .contentTransition(.numericText())
                    .privacySensitive()
            } minimal: {
                Image(systemName: "list.clipboard.fill")
                    .foregroundStyle(ShiftLiveStyle.lime)
            }
            .keylineTint(ShiftLiveStyle.lime)
        }
    }

    private func lockScreen(_ context: ActivityViewContext<ShiftActivityAttributes>) -> some View {
        HStack(spacing: 14) {
            Image(systemName: "list.clipboard.fill")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(ShiftLiveStyle.ink)
                .frame(width: 42, height: 42)
                .background(ShiftLiveStyle.lime, in: .rect(cornerRadius: 13))

            VStack(alignment: .leading, spacing: 3) {
                Text(context.attributes.tenantName)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                HStack(spacing: 5) {
                    Circle()
                        .fill(ShiftLiveStyle.lime)
                        .frame(width: 6, height: 6)
                    Text(L("work.signOutOpenTitle"))
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.68))
                    Text(context.attributes.openedAt, style: .timer)
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.white.opacity(0.68))
                }
            }

            Spacer(minLength: 8)

            VStack(alignment: .trailing, spacing: 3) {
                Text(units(context.attributes.unitName, count: context.state.count))
                    .font(.subheadline.weight(.semibold))
                    .monospacedDigit()
                    .contentTransition(.numericText())
                Text(money(context.state.revenue, context.attributes.currency))
                    .font(.caption.weight(.medium))
                    .monospacedDigit()
                    .foregroundStyle(.white.opacity(0.72))
                    .contentTransition(.numericText())
                    .privacySensitive()
            }
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    /// Подпись под числом — множественное: «машины», а не «машина».
    private func unit(_ value: String, count: Int) -> String {
        value.isEmpty ? L("widget.records") : Terms.unit(value).many
    }

    /// «3 машины» — число и слово вместе, с формой по числу.
    private func units(_ value: String, count: Int) -> String {
        value.isEmpty ? "\(count) \(L("widget.records"))" : Terms.units(count, value)
    }

    private func money(_ value: Int, _ currency: String) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        // разряды по языку интерфейса; валюта от языка не зависит
        f.groupingSeparator = LangStore.currentLang.groupSeparator
        let amount = f.string(from: NSNumber(value: value)) ?? "\(value)"
        return currency == "AMD" ? "\(amount) ֏" : "\(amount) \(currency)"
    }

    private func shortMoney(_ value: Int, _ currency: String) -> String {
        let sign = currency == "AMD" ? "֏" : currency
        switch abs(value) {
        case 1_000_000...:
            return "\(compact(Double(value) / 1_000_000))M\(sign)"
        case 10_000...:
            return "\(compact(Double(value) / 1_000))K\(sign)"
        default:
            return "\(value)\(sign)"
        }
    }

    private func compact(_ value: Double) -> String {
        value.rounded() == value
            ? String(Int(value))
            : String(format: "%.1f", value)
    }
}

/* Цвета марки — те же числа, что в `Design/Theme.swift`. Таргет виджета
   не видит код приложения, поэтому значения продублированы, но править
   их можно только парой с `Brand.lime`/`Brand.board`: остров — самое
   заметное место продукта, и лайм там был «почти фирменным» (#C2FF00
   вместо #D7FF00) — то есть маркой с чужим оттенком. */
private enum ShiftLiveStyle {
    static let ink = Color(red: 0x0A / 255, green: 0x0A / 255, blue: 0x0C / 255)
    static let lime = Color(red: 0xD7 / 255, green: 1.0, blue: 0)
}
