import SwiftUI

/// Сдача наличных в конце смены.
///
/// Единственный момент, когда деньги переходят из рук в руки, — и до сих
/// пор продукт про него не знал ничего. Он знал, сколько намыто
/// наличными, и не знал, сколько из них дошло до владельца. Разница между
/// этими числами и есть недостача, ради которой в кассовом бизнесе вообще
/// ставят учёт.
///
/// Сумма подставлена заранее: в девяти случаях из десяти сдают ровно
/// столько, сколько намыли, и заставлять человека набирать пять цифр
/// вручную значит получить или неверные данные, или пропущенный шаг.
///
/// Пропустить можно. Заставить отметить — значит запереть человека в
/// приложении в конце смены; уйти он должен уметь всегда, а «не отмечено»
/// владелец увидит именно как «не отмечено», а не как ноль.
struct HandoverView: View {
    let expected: Int
    /// Итог дня: машины, сумма работ и своя доля. Показывается до того, как
    /// смену закроют, — см. `summary`.
    let count: Int
    let revenue: Int
    let earned: Int
    let takesShare: Bool
    let onDone: (Int?) -> Void

    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss

    @State private var amount = ""

    @FocusState private var typingAmount: Bool

    private var currency: String { session.tenant?.currency ?? "AMD" }
    private var entered: Int? { Int(amount) }
    private var diff: Int { (entered ?? expected) - expected }
    private var unitOne: String { Terms.unit(session.tenant?.unitOne ?? "").nom }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(L("common.today"))
                            .font(.system(size: 11, weight: .black, design: .rounded))
                            .tracking(1.25)
                            .foregroundStyle(Brand.boardMuted)

                        Text(money(revenue, currency))
                            .font(.system(size: 38, weight: .bold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(Brand.onBoard)
                            .lineLimit(1)
                            .minimumScaleFactor(0.5)
                            .padding(.top, 6)

                        HStack(spacing: 7) {
                            Text("\(count) \(unitOne.isEmpty ? L("shift.record") : unitOne)")
                            if takesShare {
                                Circle().fill(Brand.boardMuted).frame(width: 3, height: 3)
                                Text("\(L("work.earnedToday")) \(money(earned, currency))")
                            }
                        }
                        .font(.system(size: 12.5, weight: .medium))
                        .monospacedDigit()
                        .foregroundStyle(Brand.boardMuted)
                        .padding(.top, 5)
                    }
                    .padding(18)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Brand.boardSurface, in: .rect(cornerRadius: 25, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 25, style: .continuous)
                            .strokeBorder(Brand.boardInk.opacity(0.07), lineWidth: 0.8)
                    }

                    VStack(alignment: .leading, spacing: 12) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(L("handover.cashInShift"))
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(Brand.boardMuted)
                            Spacer(minLength: 8)
                            Text(money(expected, currency))
                                .font(.system(size: 17, weight: .bold, design: .rounded))
                                .monospacedDigit()
                                .foregroundStyle(Brand.onBoard)
                        }

                        Rectangle().fill(Brand.boardInk.opacity(0.07)).frame(height: 1)

                        Text(L("handover.declaring"))
                            .font(.system(size: 12.5, weight: .medium))
                            .foregroundStyle(Brand.boardMuted)

                        TextField("0", text: $amount)
                            .keyboardType(.numberPad)
                            .focused($typingAmount)
                            .font(.system(size: 34, weight: .bold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(Brand.onBoard)
                            .padding(.horizontal, 14)
                            .frame(height: 62)
                            .background(Brand.boardInk.opacity(0.055), in: .rect(cornerRadius: 16))
                            .contentShape(.rect)
                            .onTapGesture { typingAmount = true }

                        if entered != nil && diff != 0 {
                            Label(
                                diff < 0
                                    ? L("handover.short", money(-diff, currency))
                                    : L("handover.over", money(diff, currency)),
                                systemImage: diff < 0 ? "arrow.down" : "arrow.up"
                            )
                            .font(.system(size: 12.5, weight: .semibold))
                            .foregroundStyle(Brand.warnOnBoard)
                        }
                    }
                    .padding(16)
                    .background(Brand.boardSurface, in: .rect(cornerRadius: 22, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .strokeBorder(Brand.boardInk.opacity(0.07), lineWidth: 0.8)
                    }

                    Text(L("handover.endNote", Terms.unit(session.tenant?.unitOne ?? "").acc))
                        .font(.system(size: 12.5))
                        .foregroundStyle(Brand.boardMuted)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 5)

                    Text(L("handover.cardNote"))
                        .font(.system(size: 11.5))
                        .foregroundStyle(Brand.boardMuted.opacity(0.85))
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 5)
                }
                .padding(.horizontal, 14)
                .padding(.top, 8)
                .padding(.bottom, 100)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Brand.board.ignoresSafeArea())
            .navigationTitle(L("work.endTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    // остаться на смене — тем же словом, что в вебе
                    Button(L("work.endStay")) { dismiss() }
                }
            }
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: 7) {
                    Button {
                        onDone(entered ?? expected)
                        dismiss()
                    } label: {
                        Text(L("handover.submit"))
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(Brand.onLime)
                            .frame(maxWidth: .infinity, minHeight: 52)
                            .background(Brand.lime, in: .rect(cornerRadius: 18, style: .continuous))
                    }
                    .buttonStyle(.press)

                    Button(L("common.skip")) {
                        onDone(nil)
                        dismiss()
                    }
                    .font(.system(size: 13.5, weight: .medium))
                    .foregroundStyle(Brand.boardMuted)
                    .buttonStyle(.press)
                }
                .padding(.horizontal, 14)
                .padding(.top, 8)
                .padding(.bottom, 6)
                .background(.ultraThinMaterial)
            }
        }
        .task { amount = expected > 0 ? String(expected) : "" }
    }
}
