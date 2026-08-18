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
            Form {
                /* Итог дня — первым, до сдачи наличных.
                 *
                 * Смену закрывают один раз за день, и после неё записывать
                 * нельзя до следующей. Раньше окно спрашивало только про
                 * деньги в кармане, и человек соглашался, не увидев, что
                 * именно он закрывает. Три числа читаются за две секунды и
                 * стоят ровно там, где принимается решение. */
                Section {
                    LabeledContent(unitOne.isEmpty ? L("shift.record") : unitOne) {
                        Text("\(count)").monospacedDigit().foregroundStyle(Brand.boardMuted)
                    }
                    LabeledContent(L("work.worksTotal")) {
                        Text(money(revenue, currency))
                            .monospacedDigit()
                            .foregroundStyle(Brand.boardMuted)
                    }
                    if takesShare {
                        LabeledContent(L("work.earnedToday")) {
                            Text(money(earned, currency))
                                .monospacedDigit()
                                .fontWeight(.semibold)
                        }
                    }
                } header: {
                    Text(L("common.today"))
                } footer: {
                    Text(L("handover.endNote", Terms.unit(session.tenant?.unitOne ?? "").acc))
                }

                Section {
                    LabeledContent(L("handover.cashInShift")) {
                        Text(money(expected, currency))
                            .monospacedDigit()
                            .foregroundStyle(Brand.boardMuted)
                    }
                } footer: {
                    Text(L("handover.cardNote"))
                }

                Section {
                    LabeledContent(L("handover.declaring")) {
                        TextField("", text: $amount)
                            .keyboardType(.numberPad)
                            .focused($typingAmount)
                            .multilineTextAlignment(.trailing)
                            .monospacedDigit()
                    }
                    // строка целиком: попадать в пустое поле у правого края
                    // мокрыми руками почти невозможно
                    .contentShape(.rect)
                    .onTapGesture { typingAmount = true }
                } footer: {
                    /* Расхождение показываем сразу, а не после отправки:
                       чаще всего это опечатка, и увидеть её надо до того,
                       как она уедет к владельцу уведомлением. */
                    if entered != nil && diff != 0 {
                        Text(diff < 0
                             ? L("handover.short", money(-diff, currency))
                             : L("handover.over", money(diff, currency)))
                            .foregroundStyle(Brand.warn)
                    }
                }

                Section {
                    Button(L("handover.submit")) {
                        onDone(entered ?? expected)
                        dismiss()
                    }
                    Button(L("common.skip")) {
                        onDone(nil)
                        dismiss()
                    }
                    .foregroundStyle(Brand.boardMuted)
                }
            }
            .navigationTitle(L("work.endTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    // остаться на смене — тем же словом, что в вебе
                    Button(L("work.endStay")) { dismiss() }
                }
            }
        }
        .task { amount = expected > 0 ? String(expected) : "" }
    }
}
