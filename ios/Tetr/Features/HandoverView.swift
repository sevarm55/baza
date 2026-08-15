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

    private var currency: String { session.tenant?.currency ?? "AMD" }
    private var entered: Int? { Int(amount) }
    private var diff: Int { (entered ?? expected) - expected }
    private var unitOne: String { session.tenant?.unitOne ?? "Գրանցում" }

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
                    LabeledContent(unitOne) {
                        Text("\(count)").monospacedDigit().foregroundStyle(Brand.boardMuted)
                    }
                    LabeledContent("Աշխատանքի գումարը") {
                        Text(money(revenue, currency))
                            .monospacedDigit()
                            .foregroundStyle(Brand.boardMuted)
                    }
                    if takesShare {
                        LabeledContent("Քո վաստակն այսօր") {
                            Text(money(earned, currency))
                                .monospacedDigit()
                                .fontWeight(.semibold)
                        }
                    }
                } header: {
                    Text("Այսօր")
                } footer: {
                    Text("Ավարտելուց հետո \(unitOne) գրանցել կարելի կլինի միայն նոր հերթափոխից հետո։")
                }

                Section {
                    LabeledContent("Կանխիկ հերթափոխում") {
                        Text(money(expected, currency))
                            .monospacedDigit()
                            .foregroundStyle(Brand.boardMuted)
                    }
                } footer: {
                    Text("Քարտով և փոխանցումով վճարածը հանձնելու կարիք չկա։")
                }

                Section {
                    LabeledContent("Հանձնում եմ") {
                        TextField("", text: $amount)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                            .monospacedDigit()
                    }
                } footer: {
                    /* Расхождение показываем сразу, а не после отправки:
                       чаще всего это опечатка, и увидеть её надо до того,
                       как она уедет к владельцу уведомлением. */
                    if entered != nil && diff != 0 {
                        Text(diff < 0
                             ? "Պակասում է \(money(-diff, currency))"
                             : "Ավելի է \(money(diff, currency))")
                            .foregroundStyle(Brand.warn)
                    }
                }

                Section {
                    Button("Հանձնել և ավարտել") {
                        onDone(entered ?? expected)
                        dismiss()
                    }
                    Button("Բաց թողնել") {
                        onDone(nil)
                        dismiss()
                    }
                    .foregroundStyle(Brand.boardMuted)
                }
            }
            .navigationTitle("Ավարտե՞լ հերթափոխը")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    // остаться на смене — тем же словом, что в вебе
                    Button("Մնալ հերթափոխին") { dismiss() }
                }
            }
        }
        .task { amount = expected > 0 ? String(expected) : "" }
    }
}
