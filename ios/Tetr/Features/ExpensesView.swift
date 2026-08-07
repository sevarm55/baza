import SwiftUI

/**
 * Расходы бизнеса.
 *
 * Выручка отвечала на вопрос «сколько намыли», а владелец спрашивает
 * «сколько осталось». Половина ответа — зарплата — считалась и раньше;
 * вторая заводится здесь.
 *
 * Два вида расходов разведены не подписью, а **разными списками**. Раньше
 * они лежали вперемешку и различались словом «ամսական» мелким шрифтом под
 * названием — то есть не различались вовсе. Постоянные наверху и с общей
 * суммой в месяц: это и есть то, что съедает прибыль каждый день, и знать
 * её надо одним взглядом.
 *
 * Постоянный расход относится ко всем дням месяца сразу, и в прибыли за
 * день от него берётся доля. Свалить аренду одним днём значило бы показать
 * первое число месяца глубоко убыточным, а второе — прибыльным сверх меры.
 */
struct ExpensesView: View {
    @EnvironmentObject private var session: Session

    @State private var items: [API.Expense] = []
    @State private var hints: [String] = []
    @State private var adding = false
    @State private var editing: API.Expense?
    @State private var loaded = false

    private var currency: String { session.tenant?.currency ?? "AMD" }

    private var monthlyOnes: [API.Expense] { items.filter(\.monthly) }
    private var oneOffs: [API.Expense] { items.filter { !$0.monthly } }

    private let gap: CGFloat = 10

    var body: some View {
        ScrollView {
            VStack(spacing: gap) {
                if loaded { reading }

                if !monthlyOnes.isEmpty {
                    heading("Ամսական", "\(monthlyOnes.count)")
                    ForEach(monthlyOnes) { item in
                        card(item, tone: .amber)
                    }
                }

                if !oneOffs.isEmpty {
                    heading("Միանվագ", "\(oneOffs.count)")
                    VStack(spacing: 0) {
                        ForEach(oneOffs) { item in
                            row(item)
                            if item.id != oneOffs.last?.id {
                                Rectangle()
                                    .fill(Brand.boardInk.opacity(0.07))
                                    .frame(height: 1)
                            }
                        }
                    }
                }

                if loaded && items.isEmpty {
                    Text("Ծախսեր դեռ չկան")
                        .font(.system(size: 14))
                        .foregroundStyle(Brand.boardMuted)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 44)
                }

                addButton

                Text("Ամսականները բաշխվում են ամսվա բոլոր օրերին։ Միանվագները մնում են իրենց օրում։")
                    .font(.system(size: 11.5))
                    .foregroundStyle(Brand.boardMuted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 6)
                    .padding(.top, 6)
            }
            .padding(.horizontal, 12)
            .padding(.top, 8)
            .padding(.bottom, 28)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.board.ignoresSafeArea())
        .sheet(isPresented: $adding) {
            ExpenseEditor(hints: hints, currency: currency) { await reload() }
        }
        .sheet(item: $editing) { item in
            ExpenseEditor(editing: item, hints: hints, currency: currency) { await reload() }
        }
        .task { await reload() }
        .refreshable { await reload() }
    }

    /// Сколько постоянных расходов в месяц и во что это обходится в день.
    ///
    /// Дневная доля — то, чего в продукте не было: в прибыли за день она
    /// участвует, но увидеть её было негде, и владелец каждый раз заново
    /// удивлялся, откуда взялись расходы в день без покупок.
    private var reading: some View {
        let perMonth = monthlyOnes.reduce(0) { $0 + $1.amount }
        let perDay = perMonth > 0 ? Int(Double(perMonth) / Double(daysThisMonth)) : 0

        return VStack(spacing: 0) {
            Text("Ամսական ծախս")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Brand.onBoard.opacity(0.85))
                .padding(.top, 6)

            Text(money(perMonth, currency))
                .font(.system(size: 46, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)
                .lineLimit(1)
                .minimumScaleFactor(0.45)
                .contentTransition(.numericText(value: Double(perMonth)))

            if perDay > 0 {
                Text("օրական \(money(perDay, currency))")
                    .font(.system(size: 12))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)
                    .padding(.top, 6)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.bottom, 4)
    }

    /// Длина текущего месяца — тот же знаменатель, которым сервер делит
    /// постоянные расходы по дням.
    private var daysThisMonth: Int {
        var cal = Foundation.Calendar(identifier: .gregorian)
        if let tz = session.tenant?.timezone, let zone = TimeZone(identifier: tz) {
            cal.timeZone = zone
        }
        return cal.range(of: .day, in: .month, for: Date())?.count ?? 30
    }

    private func heading(_ title: String, _ count: String) -> some View {
        HStack {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Brand.boardMuted)
            Spacer()
            Text(count)
                .font(.system(size: 12))
                .monospacedDigit()
                .foregroundStyle(Brand.boardMuted)
        }
        .padding(.horizontal, 6)
        .padding(.top, 14)
        .padding(.bottom, 2)
    }

    /// Постоянный расход — плиткой: он тянет деньги каждый день, и в списке
    /// должен весить больше, чем канистра химии, купленная во вторник.
    private func card(_ item: API.Expense, tone: Tone) -> some View {
        Button {
            editing = item
        } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.category)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(tone.ink)
                        .lineLimit(1)
                    Text("օրական \(money(item.amount / max(1, daysThisMonth), currency))")
                        .font(.system(size: 11.5))
                        .monospacedDigit()
                        .foregroundStyle(tone.ink.opacity(0.72))
                }
                Spacer(minLength: 8)
                Text(money(item.amount, currency))
                    .font(.system(size: 19, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(tone.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .tile(tone, radius: 20, pad: 15)
        }
        .buttonStyle(.press)
        .accessibilityElement(children: .combine)
    }

    /// Разовый — строкой: он уже случился и больше ничего не тянет.
    private func row(_ item: API.Expense) -> some View {
        Button {
            editing = item
        } label: {
            HStack(spacing: 10) {
                Text(day(item.at))
                    .font(.system(size: 12))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)
                    .frame(width: 46, alignment: .leading)

                Text(item.category)
                    .font(.system(size: 14.5, weight: .semibold))
                    .foregroundStyle(Brand.onBoard)
                    .lineLimit(1)

                Spacer(minLength: 8)

                Text(money(item.amount, currency))
                    .font(.system(size: 14.5, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(Brand.onBoard)
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 12)
            .contentShape(.rect)
        }
        .buttonStyle(.press)
        .accessibilityElement(children: .combine)
    }

    /// Добавление — строкой в самом списке, а не плюсиком в панели: плюсик
    /// в углу ищут глазами, строка стоит там, куда смотрит человек.
    private var addButton: some View {
        Button {
            adding = true
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "plus")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Brand.grape)
                    .frame(width: 44, height: 44)
                    .background(Brand.boardInk.opacity(0.07), in: .circle)
                Text("Ավելացնել ծախս")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Brand.onBoard)
                Spacer(minLength: 0)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 24))
        }
        .buttonStyle(.press)
        .padding(.top, 10)
    }

    private func day(_ d: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "dd.MM"
        if let tz = session.tenant?.timezone, let zone = TimeZone(identifier: tz) {
            f.timeZone = zone
        }
        return f.string(from: d)
    }

    private func reload() async {
        let result: API.Expenses? = try? await session.authed { token in
            try await APIClient.shared.send("expenses", token: token, as: API.Expenses.self)
        }
        if let result {
            items = result.expenses
            hints = result.hints
        }
        loaded = true
    }
}

/**
 * Расход: новый или правка существующего.
 *
 * Форма одна на оба случая. Разница только в том, что у правки уже есть id
 * и заполненные поля, — заводить ради этого второй экран значило бы держать
 * две формы, которые обязаны расходиться только заголовком.
 *
 * Вид расхода выбирается двумя крупными карточками, а не переключателем.
 * Переключатель «Ամսական» требовал прочитать подпись под ним, чтобы понять,
 * что будет; здесь у каждого выбора своё объяснение прямо в карточке, и
 * ошибиться, не читая, труднее.
 */
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
    @FocusState private var typingAmount: Bool

    private var isNew: Bool { editing == nil }
    private var value: Int { Int(amount.filter(\.isNumber)) ?? 0 }
    private var ready: Bool { !busy && !category.trimmingCharacters(in: .whitespaces).isEmpty && value > 0 }

    /* Сумма постоянного расхода не переписывает прошлое: старый
       закрывается сегодняшним днём, новый с него же начинается. Сказать это
       надо до нажатия «сохранить», а не после — иначе владелец ждёт, что
       прошлый месяц пересчитается, и не понимает, почему нет. */
    private var amountChanged: Bool {
        guard let editing, editing.monthly else { return false }
        return value != editing.amount
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                header

                amountField

                if !hints.isEmpty && isNew {
                    /* Подсказки фишками, а не выпадающим списком: их шесть,
                       и нажать готовое быстрее, чем набирать армянское
                       слово. Своё при этом никто не запрещает. */
                    Flow(spacing: 8) {
                        ForEach(hints, id: \.self) { hint in
                            Button {
                                category = hint
                            } label: {
                                Text(hint)
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(category == hint ? Brand.onLime : Brand.onBoard)
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 10)
                                    .background(
                                        category == hint ? Brand.lime : Brand.boardInk.opacity(0.07),
                                        in: .capsule
                                    )
                            }
                            .buttonStyle(.press)
                        }
                    }
                    .padding(.horizontal, 2)
                }

                /* Вид расхода у существующего не меняется: превращать
                   разовую канистру химии в аренду нечем — это другой
                   расход, и заводится он заново. */
                if isNew {
                    kindPicker
                } else if amountChanged {
                    note("Հին գումարը մնում է անցած օրերին։ Նորը գործում է այսօրվանից։")
                }

                if let error {
                    Text(error)
                        .font(.system(size: 13))
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 4)
                }
            }
            .padding(.horizontal, 12)
            .padding(.top, 8)
            .padding(.bottom, 28)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.board.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) { saveBar }
        .onAppear {
            guard let editing else {
                typingAmount = true
                return
            }
            category = editing.category
            amount = String(editing.amount)
            monthly = editing.monthly
        }
    }

    private var header: some View {
        HStack {
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Brand.boardMuted)
                    .frame(width: 38, height: 38)
                    .background(Brand.boardInk.opacity(0.07), in: .circle)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Փակել")

            Spacer()

            Text(isNew ? "Նոր ծախս" : "Ծախս")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Brand.onBoard)

            Spacer()

            Color.clear.frame(width: 38, height: 38)
        }
        .padding(.bottom, 6)
    }

    /// Сумма — крупно и первой: расход заводят, держа в руке чек, и первое,
    /// что с него переписывают, это цифра.
    private var amountField: some View {
        VStack(spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                TextField("0", text: $amount)
                    .font(.system(size: 40, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Brand.onBoard)
                    .keyboardType(.numberPad)
                    .focused($typingAmount)
                    .multilineTextAlignment(.center)
                    .fixedSize()
                Text(currency == "AMD" ? "֏" : currency)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(Brand.boardMuted)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 18)
            .padding(.bottom, 14)

            Rectangle().fill(Brand.boardInk.opacity(0.07)).frame(height: 1)

            HStack(spacing: 12) {
                Text("Ինչի համար")
                    .font(.system(size: 14))
                    .foregroundStyle(Brand.boardMuted)
                Spacer(minLength: 8)
                TextField("վարձ, ջուր, քիմիա", text: $category)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Brand.onBoard)
                    .multilineTextAlignment(.trailing)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 15)
        }
        .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 22))
    }

    private var kindPicker: some View {
        HStack(spacing: 10) {
            kind(
                title: "Միանվագ",
                note: "մնում է այսօրվա օրում",
                icon: "cart.fill",
                on: !monthly
            ) { monthly = false }

            kind(
                title: "Ամսական",
                note: "բաշխվում է ամսվա բոլոր օրերին",
                icon: "arrow.trianglehead.2.clockwise",
                on: monthly
            ) { monthly = true }
        }
    }

    private func kind(
        title: String,
        note: String,
        icon: String,
        on: Bool,
        run: @escaping () -> Void
    ) -> some View {
        Button(action: run) {
            VStack(alignment: .leading, spacing: 0) {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(on ? Brand.onLime : Brand.grape)
                Spacer(minLength: 10)
                Text(title)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(on ? Brand.onLime : Brand.onBoard)
                Text(note)
                    .font(.system(size: 11))
                    .foregroundStyle(on ? Brand.onLime.opacity(0.7) : Brand.boardMuted)
                    .fixedSize(horizontal: false, vertical: true)
                    .multilineTextAlignment(.leading)
            }
            .frame(height: 108, alignment: .topLeading)
            .padding(15)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                on ? Brand.lime : Brand.boardInk.opacity(0.07),
                in: .rect(cornerRadius: 22)
            )
        }
        .buttonStyle(.press)
        .accessibilityAddTraits(on ? [.isSelected] : [])
    }

    private func note(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 12.5))
            .foregroundStyle(Brand.boardMuted)
            .fixedSize(horizontal: false, vertical: true)
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 22))
    }

    private var saveBar: some View {
        Button {
            Task { await save() }
        } label: {
            Text("Պահպանել")
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(Brand.onLime)
                .loading(busy, tint: Brand.onLime, size: 20)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(Brand.lime, in: .rect(cornerRadius: 22))
        }
        .buttonStyle(.press)
        .disabled(!ready)
        .opacity(ready ? 1 : 0.4)
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
        .background(Brand.board.ignoresSafeArea(edges: .bottom))
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
                        body: ["amount": value, "category": category],
                        token: token
                    )
                }
                return try await APIClient.shared.raw(
                    "expenses",
                    method: "POST",
                    body: [
                        "amount": value,
                        "category": category,
                        "monthly": monthly,
                    ],
                    token: token
                )
            }
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            await onSave()
            dismiss()
        } catch {
            self.error = "Չհաջողվեց։ Փորձեք կրկին։"
        }
    }
}
