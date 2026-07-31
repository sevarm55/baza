import SwiftUI

/// Расходы бизнеса.
///
/// Выручка отвечала на вопрос «сколько намыли», а владелец спрашивает
/// «сколько осталось». Половина ответа — зарплата — считалась и раньше;
/// вторая заводится здесь.
///
/// Два вида, и разница между ними видна прямо в списке. Разовый — химия,
/// ремонт — падает в свой день. Постоянный — аренда, свет — относится ко
/// всем дням месяца сразу, и в прибыли за день от него берётся доля.
/// Свалить аренду одним днём значило бы показать первое число месяца
/// глубоко убыточным, а второе — прибыльным сверх меры.
struct ExpensesView: View {
    @EnvironmentObject private var session: Session

    @State private var items: [API.Expense] = []
    @State private var hints: [String] = []
    @State private var adding = false
    @State private var editing: API.Expense?

    private var currency: String { session.tenant?.currency ?? "AMD" }

    var body: some View {
        List {
            if items.isEmpty {
                Text("Ծախսեր դեռ չկան")
                    .font(.system(size: 14))
                    .foregroundStyle(Brand.muted)
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }

            ForEach(items) { item in
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(item.category)
                            .font(.system(size: 16, weight: .semibold))
                        Text(item.monthly ? "ամսական" : day(item.at))
                            .font(.system(size: 12))
                            .foregroundStyle(Brand.muted)
                    }
                    Spacer()
                    Text(money(item.amount, currency))
                        .font(.system(size: 15, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(Brand.ink)
                }
                .padding(15)
                .frame(maxWidth: .infinity)
                .glassEffect(.regular, in: .rect(cornerRadius: 14))
                .foregroundStyle(Brand.ink)
                // аренда дорожает — самое обычное событие; до сих пор её
                // приходилось удалять и заводить заново
                .contentShape(.rect)
                .onTapGesture { editing = item }
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .listRowInsets(.init(top: 5, leading: 16, bottom: 5, trailing: 16))
                .swipeActions(edge: .trailing) {
                    Button(role: .destructive) {
                        Task { await remove(item) }
                    } label: {
                        Label("Հեռացնել", systemImage: "trash")
                    }
                    // явный красный: общий тинт приложения перекрыл бы системный
                    .tint(.red)
                }
            }

            Text("Ամսական ծախսերը բաշխվում են ամսվա բոլոր օրերին։ Միանվագները մնում են իրենց օրում։")
                .font(.system(size: 12.5))
                .foregroundStyle(Brand.muted)
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .listRowInsets(.init(top: 10, leading: 16, bottom: 5, trailing: 16))
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .screenBackground()
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { adding = true } label: {
                    Image(systemName: "plus").foregroundStyle(Brand.grape)
                }
            }
        }
        .sheet(isPresented: $adding) {
            ExpenseEditor(hints: hints, currency: currency) { await reload() }
        }
        .sheet(item: $editing) { item in
            ExpenseEditor(editing: item, hints: hints, currency: currency) { await reload() }
        }
        .task { await reload() }
        .refreshable { await reload() }
    }

    private func day(_ d: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "dd.MM"
        return f.string(from: d)
    }

    /// Строка исчезает сразу, не дожидаясь сервера: иначе после смахивания
    /// она секунду стоит на месте и кажется, что не сработало.
    private func remove(_ item: API.Expense) async {
        items.removeAll { $0.id == item.id }

        _ = try? await session.authed { token in
            try await APIClient.shared.raw("expenses/\(item.id)", method: "DELETE", token: token)
        }
        await reload()
    }

    private func reload() async {
        let result: API.Expenses? = try? await session.authed { token in
            try await APIClient.shared.send("expenses", token: token, as: API.Expenses.self)
        }
        if let result {
            items = result.expenses
            hints = result.hints
        }
    }
}

/// Расход: новый или правка существующего.
///
/// Форма одна на оба случая. Разница только в том, что у правки уже есть
/// id и заполненные поля, — заводить ради этого второй экран значило бы
/// держать две формы, которые обязаны расходиться только заголовком.
struct ExpenseEditor: View {
    var editing: API.Expense?
    let hints: [String]
    let currency: String
    let onSave: () async -> Void

    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss

    @State private var category = ""
    @State private var amount = ""
    @State private var monthly = false
    @State private var busy = false
    @State private var error: String?

    /* Сумма постоянного расхода не переписывает прошлое: старый
       закрывается сегодняшним днём, новый с него же начинается. Сказать
       это надо до нажатия «сохранить», а не после — иначе владелец ждёт,
       что прошлый месяц пересчитается, и не понимает, почему нет. */
    private var amountChanged: Bool {
        guard let editing, editing.monthly else { return false }
        return Int(amount) != editing.amount
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Ինչի համար", text: $category)
                    TextField("Գումար", text: $amount)
                        .keyboardType(.numberPad)
                }

                /* Подсказки кнопками, а не выпадающим списком: их шесть,
                   и на телефоне нажать готовое быстрее, чем набирать
                   армянское слово. Своё при этом никто не запрещает. */
                if !hints.isEmpty {
                    Section {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(hints, id: \.self) { hint in
                                    Button(hint) { category = hint }
                                        .buttonStyle(.bordered)
                                        .tint(Brand.grape)
                                }
                            }
                        }
                    }
                }

                /* Вид расхода у существующего не меняется: превращать
                   разовую канистру химии в аренду нечем — это другой
                   расход, и заводится он заново. */
                if editing == nil {
                    Section {
                        Toggle(isOn: $monthly) {
                            Text("Ամսական")
                        }
                    } footer: {
                        Text(monthly
                             ? "Վարձ, հոսանք․ բաշխվում է ամսվա բոլոր օրերին։"
                             : "Միանվագ ծախս՝ այսօրվա ամսաթվով։")
                    }
                } else if amountChanged {
                    Section {
                        Text("Հին գումարը մնում է անցած օրերին։ Նորը գործում է այսօրվանից։")
                            .font(.system(size: 13))
                            .foregroundStyle(Brand.muted)
                    }
                }

                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
            }
            .navigationTitle(editing == nil ? "Նոր ծախս" : "Ծախս")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Փակել") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Պահպանել") { Task { await save() } }
                        .disabled(busy || category.isEmpty || Int(amount) ?? 0 <= 0)
                }
            }
        }
        .onAppear {
            guard let editing else { return }
            category = editing.category
            amount = String(editing.amount)
            monthly = editing.monthly
        }
    }

    private func save() async {
        busy = true
        defer { busy = false }
        error = nil

        do {
            _ = try await session.authed { token in
                if let editing {
                    return try await APIClient.shared.raw(
                        "expenses/\(editing.id)",
                        method: "PATCH",
                        body: ["amount": Int(amount) ?? 0, "category": category],
                        token: token
                    )
                }
                return try await APIClient.shared.raw(
                    "expenses",
                    method: "POST",
                    body: [
                        "amount": Int(amount) ?? 0,
                        "category": category,
                        "monthly": monthly,
                    ],
                    token: token
                )
            }
            await onSave()
            dismiss()
        } catch {
            self.error = "Չհաջողվեց։ Փորձեք կրկին։"
        }
    }
}
