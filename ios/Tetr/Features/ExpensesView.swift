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
    @State private var costs: API.Costs?
    /// Выручка и средний расход в день — того же периода, с сервера.
    @State private var revenue = 0
    @State private var perDayAvg = 0
    @State private var adding = false
    @State private var editing: API.Expense?
    @State private var confirmingRemoval: API.Expense?
    @State private var loaded = false
    /// Какой месяц смотрим. Считает сервер — здесь только выбор.
    @State private var month: Month = .current

    enum Month: String, CaseIterable {
        case current, prev
        var label: String { self == .current ? L("owner.periodMonth") : L("owner.periodPrevMonth") }
    }

    private var currency: String { session.tenant?.currency ?? "AMD" }

    private var monthlyOnes: [API.Expense] { items.filter(\.monthly) }
    private var oneOffs: [API.Expense] { items.filter { !$0.monthly } }


    var body: some View {
        /* Список, а не прокрутка со стопкой плиток: смахивание по строке
           существует только в `List`.

           Тем же приёмом свайп когда-то был сделан в прайсе, и он был
           верным. Своя реализация на `DragGesture` повторяет повадки
           системного списка приблизительно — сопротивление, порог,
           реакцию на бросок приходится подбирать на глаз, и палец
           замечает расхождение раньше, чем глаз. Система эти повадки
           уже знает.

           Плитки при этом остаются как были: подложка строки прозрачная,
           разделители сняты, поля свои. От `List` берётся жест, а не
           внешний вид. */
        List {
            /* Шапка есть, только когда есть чем её заполнить: итог и его
               части считает сервер, и без них показывать здесь нечего —
               ноль на месте расходов читается как «ничего не тратил». */
            if loaded && costs != nil {
                reading
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .listRowInsets(.init(top: 8, leading: 12, bottom: 5, trailing: 12))
            }

            if !monthlyOnes.isEmpty {
                heading(L("expenses.monthlyOnes"), "\(monthlyOnes.count)")
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .listRowInsets(.init(top: 5, leading: 12, bottom: 0, trailing: 12))

                ForEach(monthlyOnes) { item in
                    if month == .current {
                        card(item)
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                            .listRowInsets(.init(top: 5, leading: 12, bottom: 5, trailing: 12))
                            .swipeActions(edge: .trailing) { erase(item) }
                    } else {
                        card(item)
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                            .listRowInsets(.init(top: 5, leading: 12, bottom: 5, trailing: 12))
                    }
                }
            }

            if !oneOffs.isEmpty {
                heading(L("expenses.oneOffs"), "\(oneOffs.count)")
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .listRowInsets(.init(top: 5, leading: 12, bottom: 0, trailing: 12))

                /* Разделителей нет: у каждой строки своя подложка, и линия
                   между двумя подложками — вторая граница там, где
                   хватает одной. */
                ForEach(oneOffs) { item in
                    if month == .current {
                        row(item)
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                            .listRowInsets(.init(top: 3, leading: 12, bottom: 3, trailing: 12))
                            .swipeActions(edge: .trailing) { erase(item) }
                    } else {
                        row(item)
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                            .listRowInsets(.init(top: 3, leading: 12, bottom: 3, trailing: 12))
                    }
                }
            }

            if loaded && items.isEmpty {
                Text(L("expenses.empty"))
                    .font(.system(size: 14))
                    .foregroundStyle(Brand.boardMuted)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 44)
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .listRowInsets(.init(top: 0, leading: 12, bottom: 0, trailing: 12))
            }

            addButton
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .listRowInsets(.init(top: 5, leading: 12, bottom: 5, trailing: 12))

            // те же слова, что в кабинете (`hy.expenses.note`): одно и то
            // же правило, объяснённое двумя разными фразами, читается как
            // два разных правила
            Text(L("expenses.note"))
                .font(.system(size: 11.5))
                .foregroundStyle(Brand.boardMuted)
                .fixedSize(horizontal: false, vertical: true)
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .listRowInsets(.init(top: 6, leading: 18, bottom: 28, trailing: 18))
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.board.ignoresSafeArea())
        /* Полоска захвата видима: лист закрывается смахиванием, но без
           неё об этом не догадываются. */
        .sheet(isPresented: $adding) {
            ExpenseEditor(hints: hints, currency: currency) { await reload() }
                .presentationDragIndicator(.visible)
        }
        .sheet(item: $editing) { item in
            ExpenseEditor(editing: item, hints: hints, currency: currency) { await reload() }
                .presentationDragIndicator(.visible)
        }
        .alert(
            L("expenses.removeTitle"),
            isPresented: .init(
                get: { confirmingRemoval != nil },
                set: { if !$0 { confirmingRemoval = nil } }
            )
        ) {
            Button(L("common.cancel"), role: .cancel) { confirmingRemoval = nil }
            Button(L("expenses.remove"), role: .destructive) {
                if let item = confirmingRemoval { Task { await remove(item) } }
                confirmingRemoval = nil
            }
        } message: {
            if let item = confirmingRemoval {
                Text(
                    item.monthly
                        ? L("expenses.removeMonthlyNote")
                        : L("expenses.removeOneOffNote")
                )
            }
        }
        .task { await reload() }
        .refreshable { await reload() }
    }

    /**
     * Сколько ушло за тот период, который показан ниже.
     *
     * Стояло «Ամսական ծախս 345 000 ֏», а под ним лежали ещё и разовые на
     * 42 000. Число в шапке отвечало не на тот вопрос, с которым сюда
     * заходят: человек читает верхнюю цифру как «столько я потратил» и
     * недосчитывается сорока двух тысяч.
     *
     * Период — календарный месяц, а не скользящие тридцать дней: так
     * считает сервер, так же считает кабинет, и так владелец платит
     * аренду.
     *
     * Под итогом — доля в выручке и из чего итог сложился. Сумма сама по
     * себе не плохая и не хорошая: сто тысяч при выручке в миллион это
     * обычный месяц, а при выручке в двести — беда. Оба числа приходят с
     * сервера: считать их второй раз на телефоне значило бы завести
     * второй источник правды для денег.
     */
    private var reading: some View {
        VStack(spacing: 0) {
            Text(month.label)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Brand.onBoard.opacity(0.85))
                .padding(.top, 6)

            Text(money(spentTotal, currency))
                .font(.system(size: 46, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)
                .lineLimit(1)
                .minimumScaleFactor(0.45)
                .contentTransition(.numericText(value: Double(spentTotal)))

            if let share = revenueShare {
                Text(L("expenses.shareOfRevenue", share))
                    .font(.system(size: 12))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)
                    .padding(.top, 4)
            }

            if spentMonthly > 0 || spentOneOff > 0 {
                Text(breakdown)
                    .font(.system(size: 12))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .padding(.top, 6)
            }

            /* Переключатель месяца рядом с итогом, а не в заголовке
               экрана: он меняет именно это число, и стоять должен там,
               где на него смотрят. */
            HStack(spacing: 6) {
                ForEach(Month.allCases, id: \.self) { option in
                    Button {
                        month = option
                        Task { await reload() }
                    } label: {
                        Text(option.label)
                            .font(.system(size: 13, weight: month == option ? .semibold : .regular))
                            .foregroundStyle(month == option ? Brand.board : Brand.boardMuted)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 7)
                            .background(
                                month == option ? Brand.onBoard : Brand.boardInk.opacity(0.07),
                                in: .rect(cornerRadius: 9)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.top, 12)
        }
        .frame(maxWidth: .infinity)
        .padding(.bottom, 4)
    }

    /**
     * Итог и его части — только с сервера.
     *
     * Здесь стоял запасной счёт на случай старого сервера: сложить суммы
     * постоянных расходов из списка. Он давал НОМИНАЛ вместо доли —
     * триста тысяч аренды десятого августа вместо девяноста семи, — то
     * есть не «примерно», а втрое мимо, и молча. Лучше не показать
     * ничего, чем показать неправду: без `costs` шапки просто нет.
     */
    private var spentMonthly: Int { costs?.monthlyShare ?? 0 }
    private var spentOneOff: Int { costs?.oneOff ?? 0 }
    private var spentTotal: Int { costs?.total ?? 0 }

    /// Доля расходов в выручке. Округлённый ноль — не ответ: двенадцать
    /// тысяч при выручке в четырнадцать миллионов это восемь сотых
    /// процента, и «0%» под ними читается как поломка.
    private var revenueShare: String? {
        guard revenue > 0, spentTotal > 0 else { return nil }
        let exact = Double(spentTotal) / Double(revenue) * 100
        return exact < 1 ? "<1" : String(Int(exact.rounded()))
    }

    /// Из чего сложился итог: постоянные, разовые и сколько это в день.
    private var breakdown: String {
        var parts = [
            L("expenses.monthlySpent", money(spentMonthly, currency)),
            L("expenses.oneOffSpent", money(spentOneOff, currency)),
        ]
        if perDayAvg > 0 { parts.append(L("expenses.perDay", money(perDayAvg, currency))) }
        return parts.joined(separator: " · ")
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

    /**
     * Постоянный расход — такой же строкой, как разовый.
     *
     * Была плитка с тоном и свечением, и она весила на экране втрое
     * больше строки. Основание было такое: постоянный тянет деньги
     * каждый день. Но это не разные вещи, а одна — деньги, ушедшие из
     * кассы, — и разный носитель говорил, что аренда важнее химии,
     * которой за месяц набирается на столько же.
     *
     * Разницу несёт значок, а не размер: «ամսական» рядом с названием
     * сказано словом, и это ровно та подробность, которой оно и
     * является.
     */
    @ViewBuilder
    private func card(_ item: API.Expense) -> some View {
        if month == .current && item.endedAt == nil {
            Button {
                editing = item
            } label: {
                line(title: item.category, badge: L("expenses.perMonth"), note: monthlyNote(item), amount: item.amount)
            }
            .buttonStyle(.press)
            .accessibilityElement(children: .combine)
        } else {
            line(title: item.category, badge: L("expenses.perMonth"), note: monthlyNote(item), amount: item.amount)
        }
    }

    /**
     * Что стоит под названием постоянного расхода.
     *
     * Справа — номинал, то, о чём договорились с арендодателем. Здесь —
     * сколько из него уже набежало за этот месяц и сколько это в сутки.
     * Одного номинала мало десятого числа, одной доли мало всегда.
     *
     * Оба числа приходят с сервера. Раньше дневная доля делилась прямо
     * здесь, на длину ТЕКУЩЕГО месяца, — и в прошлом месяце тридцать
     * один день делился на тридцать: цифра в приложении не сходилась с
     * кабинетом ровно там, где её и проверяют.
     */
    private func monthlyNote(_ item: API.Expense) -> String {
        if let ended = item.endedAt { return L("expenses.stoppedOn", day(ended)) }

        var parts: [String] = []
        if let share = item.share { parts.append(L("expenses.accruedSum", money(share, currency))) }
        if let perDay = item.perDay, perDay > 0 { parts.append(L("expenses.perDay", money(perDay, currency))) }
        return parts.joined(separator: " · ")
    }

    /// Общая строка расхода. Одна на оба вида — в этом весь смысл.
    private func line(title: String, badge: String?, note: String?, amount: Int) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Brand.onBoard)
                        .lineLimit(1)

                    if let badge {
                        Text(badge)
                            .font(.system(size: 10.5, weight: .semibold))
                            .foregroundStyle(Brand.boardMuted)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Brand.boardInk.opacity(0.09), in: .rect(cornerRadius: 6))
                    }
                }

                if let note {
                    Text(note)
                        .font(.system(size: 11.5))
                        .monospacedDigit()
                        .foregroundStyle(Brand.boardMuted)
                }
            }

            Spacer(minLength: 8)

            Text(money(amount, currency))
                .font(.system(size: 15, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .padding(.horizontal, 13)
        .padding(.vertical, 12)
        .background(Brand.boardInk.opacity(0.06), in: .rect(cornerRadius: 14))
        .contentShape(.rect)
    }

    /// Разовый — строкой: он уже случился и больше ничего не тянет.
    /**
     * Разовый расход.
     *
     * Была голая строка: дата колонкой, название, сумма — три текста в
     * ряд, разделённые волосяной линией. На тёмном полотне такой список
     * читается таблицей выгрузки, а не тем же продуктом, что плитки над
     * ним, и разовые расходы выглядели придатком к постоянным.
     *
     * Теперь у каждого своя подложка со скруглением — та же форма, что у
     * плиток, только тише по цвету: разовый расход не событие месяца, ему
     * не нужен тон и свечение.
     *
     * Знак слева не украшение. Постоянных расходов два-три, их узнают по
     * названию; разовых за месяц набирается два десятка одинаковых
     * «Քիմիա» и «Ջուր», и по значку список листается глазами, без чтения.
     */
    @ViewBuilder
    private func row(_ item: API.Expense) -> some View {
        if month == .current {
            Button {
                editing = item
            } label: {
                line(title: item.category, badge: nil, note: day(item.at), amount: item.amount)
            }
            .buttonStyle(.press)
            .accessibilityElement(children: .combine)
        } else {
            line(title: item.category, badge: nil, note: day(item.at), amount: item.amount)
        }
    }

    /// Значок по названию. Совпадение по подсказкам из `EXPENSE_HINTS` —
    /// это то, что мойка вписывает чаще всего; всё остальное получает
    /// нейтральный конверт, а не случайную картинку.
    private func symbol(for category: String) -> String {
        /* Сверяем со всеми языками сразу, а не с текущим. Название
           категории лежит в базе на том языке, на котором расход завели,
           и владелец, переключивший интерфейс, не должен из-за этого
           получить конверты вместо крана и лампочки. */
        let icons: [(String, String)] = [
            ("expenses.hint1", "drop.triangle.fill"),
            ("expenses.hint2", "house.fill"),
            ("expenses.hint3", "bolt.fill"),
            ("expenses.hint4", "drop.fill"),
            ("expenses.hint5", "shippingbox.fill"),
            ("expenses.hint6", "wrench.and.screwdriver.fill"),
        ]
        for (key, symbol) in icons where LAll(key).contains(category) { return symbol }
        return "tray.fill"
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
                Text(L("expenses.addExpense"))
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

    /**
     * Когда потратили.
     *
     * Ближние два дня называются словом, а не числом: «сколько я потратил
     * вчера» — вопрос, который задают вслух, и дата в нём не звучит. Те
     * же два слова стоят в кабинете, над группами разовых расходов.
     *
     * Сравнение идёт по календарю бизнеса, а не по разнице в секундах:
     * запись, сделанная в половине первого ночи, вчерашней не была.
     */
    private func day(_ d: Date) -> String {
        var cal = Foundation.Calendar(identifier: .gregorian)
        if let tz = session.tenant?.timezone, let zone = TimeZone(identifier: tz) {
            cal.timeZone = zone
        }
        if cal.isDateInToday(d) { return L("common.today") }
        if cal.isDateInYesterday(d) { return L("common.yesterday") }

        /* Число цифрами, но в порядке своего языка: «16.08» по-русски и
           «8/16» по-английски — одна дата, и перепутать их нельзя. */
        let f = DateFormatter()
        f.locale = LangStore.currentLang.locale
        f.setLocalizedDateFormatFromTemplate("dd.MM")
        f.timeZone = cal.timeZone
        return f.string(from: d)
    }

    /**
     * Удаление расхода.
     *
     * Строка исчезает сразу, до ответа сервера: жест уже сделан, и ждать
     * сеть, глядя на неудалённое, — значит сомневаться, сработало ли.
     * Если запрос не прошёл, `reload` вернёт её на место.
     *
     * Постоянный расход после подтверждения перестаёт начисляться с
     * сегодняшнего дня. Уже прожитые дни остаются в истории: удаление
     * аренды не должно задним числом увеличивать прибыль прошлых дней.
     */
    /**
     * Кнопка, которая появляется из-под строки.
     *
     * Свайп и красная кнопка показывают намерение, но постоянный расход
     * влияет на прибыль каждого следующего дня. Поэтому после жеста есть
     * системное destructive-подтверждение с прямым описанием результата.
     */
    @ViewBuilder
    private func erase(_ item: API.Expense) -> some View {
        Button(role: .destructive) {
            confirmingRemoval = item
        } label: {
            Label(L("common.delete"), systemImage: "trash")
        }
        .tint(.red)
    }

    private func remove(_ item: API.Expense) async {
        items.removeAll { $0.id == item.id }
        let ok: Bool = (try? await session.authed { token in
            _ = try await APIClient.shared.raw("expenses/\(item.id)", method: "DELETE", token: token)
            return true
        }) ?? false
        if !ok { await reload() }
    }

    private func reload() async {
        let result: API.Expenses? = try? await session.authed { token in
            try await APIClient.shared.send("expenses?month=\(month.rawValue)", token: token, as: API.Expenses.self)
        }
        if let result {
            items = result.expenses
            hints = result.hints
            costs = result.costs
            revenue = result.revenue ?? 0
            perDayAvg = result.perDayAvg ?? 0
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
    /// Каким днём лечь разовому расходу. Расходы заводят пачкой — за всю
    /// неделю сразу, — и без выбора вся неделя оказалась бы потрачена
    /// сегодня.
    @State private var at = Date()
    @State private var busy = false
    @State private var error: String?
    @FocusState private var typingAmount: Bool

    /// Календарь бизнеса: и выбор дня, и его отправка идут по нему, иначе
    /// у владельца в поездке выбранное «15 августа» уехало бы в 14-е.
    private var calendar: Foundation.Calendar {
        var cal = Foundation.Calendar(identifier: .gregorian)
        if let tz = session.tenant?.timezone, let zone = TimeZone(identifier: tz) {
            cal.timeZone = zone
        }
        return cal
    }

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
                    note(L("expenses.changeNote"))
                }

                /* Разовый спрашивает день, постоянный — нет: у него `at`
                   это дата начала действия, и сдвинуть её значит
                   переписать прибыль за уже прожитые дни. Вместо поля
                   постоянный говорит, с какого дня начнёт считаться. */
                if monthly {
                    if isNew {
                        note(L("expenses.monthlyStartNote"))
                    }
                } else {
                    dayField
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
            at = editing.at
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
            .accessibilityLabel(L("common.close"))

            Spacer()

            Text(isNew ? L("expenses.newTitle") : L("expenses.one"))
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
                Text(L("expenses.category"))
                    .font(.system(size: 14))
                    .foregroundStyle(Brand.boardMuted)
                Spacer(minLength: 8)
                TextField(L("expenses.categoryPlaceholder"), text: $category)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Brand.onBoard)
                    .multilineTextAlignment(.trailing)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 15)
        }
        .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 22))
    }

    /// День разового расхода. Вперёд не пускаем: траты, которой ещё не
    /// было, не бывает, и сервер такую дату всё равно отбросит.
    private var dayField: some View {
        HStack(spacing: 12) {
            Text(L("expenses.date"))
                .font(.system(size: 14))
                .foregroundStyle(Brand.boardMuted)
            Spacer(minLength: 8)
            DatePicker("", selection: $at, in: ...Date(), displayedComponents: .date)
                .labelsHidden()
                .environment(\.calendar, calendar)
                .environment(\.timeZone, calendar.timeZone)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 11)
        .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 22))
    }

    private var kindPicker: some View {
        HStack(spacing: 10) {
            kind(
                title: L("expenses.oneOff"),
                note: L("expenses.kindOneNote"),
                icon: "cart.fill",
                on: !monthly
            ) { monthly = false }

            kind(
                title: L("expenses.monthly"),
                note: L("expenses.kindMonthlyNote"),
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
            Text(L("common.save"))
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

    /// «2026-08-12» в календаре бизнеса — ровно тот день, который выбрали
    /// и увидели. Момент собирает сервер, в своём поясе: посылать сюда
    /// готовый `Date` значило бы решать за него, где полночь.
    private var dayKey: String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = calendar.timeZone
        return f.string(from: at)
    }

    private func save() async {
        busy = true
        defer { busy = false }
        error = nil

        do {
            _ = try await session.authed { token in
                if let editing {
                    var body: [String: Any] = ["amount": value, "category": category]
                    // день правит только разовый — постоянному сервер его
                    // всё равно не отдаст, но и слать незачем
                    if !editing.monthly { body["at"] = dayKey }
                    return try await APIClient.shared.raw(
                        "expenses/\(editing.id)",
                        method: "PATCH",
                        body: body,
                        token: token
                    )
                }
                var body: [String: Any] = [
                    "amount": value,
                    "category": category,
                    "monthly": monthly,
                ]
                if !monthly { body["at"] = dayKey }
                return try await APIClient.shared.raw("expenses", method: "POST", body: body, token: token)
            }
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            await onSave()
            dismiss()
        } catch {
            self.error = L("payroll.failed")
        }
    }
}
