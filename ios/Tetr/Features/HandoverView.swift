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
    let onDone: (Int?) -> Void

    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss

    @State private var amount = ""

    private var currency: String { session.tenant?.currency ?? "AMD" }
    private var entered: Int? { Int(amount) }
    private var diff: Int { (entered ?? expected) - expected }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Կանխիկ հերթափոխում") {
                        Text(money(expected, currency))
                            .monospacedDigit()
                            .foregroundStyle(Brand.muted)
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
                    .foregroundStyle(Brand.muted)
                }
            }
            .navigationTitle("Հերթափոխի ավարտ")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    // закрыть крестиком — остаться на смене
                    Button("Փակել") { dismiss() }
                }
            }
        }
        .task { amount = expected > 0 ? String(expected) : "" }
    }
}
