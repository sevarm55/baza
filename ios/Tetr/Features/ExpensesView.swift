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
    /// Выручка периода — с сервера, для доли расходов в ней.
    @State private var revenue = 0
    @State private var adding = false
    @State private var editing: API.Expense?
    @State private var confirmingRemoval: API.Expense?
    @State private var loaded = false
    /**
     * Почему список пуст.
     *
     * Пусто и «не доехало» — разные ответы, и до сих пор экран давал на
     * оба один: `try?` глотал отказ, `loaded` вставало в `true`, и
     * человек читал «Դեռ ծախսեր չկան» о месяце, в котором расходы есть.
     * Дальше он заводил их второй раз.
     */
    @State private var failed = false
    @State private var failNote: String?
    /// Какой месяц смотрим. Считает сервер — здесь только выбор.
    @State private var month: Month = .current

    /// Такт прихода: показание, постоянные и разовые собираются по очереди.
    @State private var beat: Beat = .waiting

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    enum Month: String, CaseIterable {
        case current, prev
        var label: String { self == .current ? L("owner.periodMonth") : L("owner.periodPrevMonth") }
    }

    private var currency: String { session.tenant?.currency ?? "AMD" }

    private var monthlyOnes: [API.Expense] { items.filter(\.monthly) }
    private var oneOffs: [API.Expense] { items.filter { !$0.monthly } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                PillTabs(items: Month.allCases.map { ($0, $0.label) }, selection: monthBinding)
                    .padding(.horizontal, 16)
                    .padding(.top, 6)

                /* Показание есть, только когда есть чем его заполнить:
                   итог и его части считает сервер, и без них показывать
                   здесь нечего — ноль на месте расходов читается как
                   «ничего не тратил». */
                if loaded, costs != nil, !items.isEmpty {
                    reading
                        .padding(.horizontal, 16)
                        .padding(.top, 16)
                        .reveal(beat, step: 0)
                }

                if !monthlyOnes.isEmpty {
                    heading(L("expenses.monthlyOnes"), monthlyOnes.count, spentMonthly)
                        .padding(.top, 26)
                    monthlyGrid
                        .padding(.horizontal, 16)
                        .padding(.top, 10)
                        .reveal(beat, step: 1)
                }

                if !oneOffs.isEmpty {
                    heading(L("expenses.oneOffs"), oneOffs.count, spentOneOff)
                        .padding(.top, 26)
                    oneOffList
                        .padding(.horizontal, 16)
                        .padding(.top, 10)
                        .reveal(beat, step: 2)
                }

                if !loaded {
                    /* Места строк, а не пустой экран. Порог в две десятых
                       секунды: быстрый ответ не должен успевать мигнуть
                       скелетом. */
                    Delayed(active: true) { TetrScreenLoader(height: 300) }
                        .padding(.horizontal, 16)
                } else if failed, items.isEmpty {
                    TetrFailure(
                        title: L("common.loadFailed"),
                        note: failNote,
                        retry: { await reload() }
                    )
                    .padding(.horizontal, 16)
                } else if items.isEmpty {
                    empty
                        .padding(.horizontal, 16)
                        .padding(.top, 18)
                }

                // те же слова, что в кабинете (`hy.expenses.note`): одно и
                // то же правило, объяснённое двумя разными фразами,
                // читается как два разных правила
                Text(L("expenses.note"))
                    .font(.system(size: 12))
                    .foregroundStyle(Brand.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 22)
                    .padding(.top, 22)
            }
            .padding(.bottom, 28)
        }
            /* Обновление вешается на саму прокрутку, а не в конец
               цепочки. Снаружи оно попадает в окружение всего, что ниже,
               включая листы: форма найма наследовала «потянуть, чтобы
               обновить», отвечала на движение вниз загрузчиком и не
               давала закрыть себя смахиванием. */
            .refreshable { await reload() }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .meshPage()
        .brandTitleFont()
        .navigationTitle(L("expenses.title"))
        .navigationSubtitle(loaded && costs != nil ? money(spentTotal, currency) : "")
        .toolbarTitleDisplayMode(.inlineLarge)
        .safeAreaInset(edge: .bottom) {
            if month == .current { addButton } else { readOnlyNote }
        }
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
    }

    /// Выбор месяца через полки: смена сразу тянет данные с сервера.
    private var monthBinding: Binding<Month> {
        Binding(
            get: { month },
            set: { fresh in
                guard fresh != month else { return }
                month = fresh
                Task { await reload() }
            }
        )
    }

    // ══════════════════════════ показание ══════════════════════════

    /**
     * Сколько ушло за выбранный месяц — кобальтовой картой.
     *
     * Кобальт здесь не украшение: этим цветом расходы обозначены на
     * сводке, в разрезе прибыли и в полосе долей. Показание в нём же
     * говорит, о каких деньгах речь, раньше, чем прочитано слово.
     *
     * Период — календарный месяц, а не скользящие тридцать дней: так
     * считает сервер, так же считает кабинет, и так владелец платит
     * аренду.
     *
     * Под итогом — доля в выручке и из чего итог сложился. Сумма сама по
     * себе не плохая и не хорошая: сто тысяч при выручке в миллион это
     * обычный месяц, а при выручке в двести — беда.
     */
    private var reading: some View {
        let parts = [
            Split(id: "monthly", label: L("expenses.monthlyOnes"), ink: Brand.sandInk, amount: spentMonthly),
            Split(id: "oneOff", label: L("expenses.oneOffs"), ink: Brand.grapeFill, amount: spentOneOff),
        ].filter { $0.amount > 0 }

        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                Text(L("expenses.title"))
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Brand.sandInk.opacity(0.75))
                Spacer(minLength: 8)
                if let share = revenueShare {
                    Text(L("expenses.shareOfRevenue", share))
                        .font(.system(size: 12, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(Brand.sandInk)
                        .lineLimit(1)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(Brand.paper.opacity(0.75), in: .capsule)
                }
            }

            Text(money(spentTotal, currency))
                .font(.system(size: 44, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.sandInk)
                .lineLimit(1)
                .minimumScaleFactor(0.45)
                .contentTransition(.numericText(value: Double(spentTotal)))
                .padding(.top, 2)

            /* Ни среднего за день, ни подписей под полосой.
               «В день 5 000» здесь значило средний расход за прошедшие
               дни, а на плитке аренды «в день 10 000» — долю самой
               аренды: два разных смысла одними словами в двадцати
               сантиметрах друг от друга. Подписи под полосой повторяли
               заголовки разделов ниже, слово в слово и сумма в сумму.
               Полоса осталась: она показывает долю картинкой, не
               прибавляя к экрану ни одного числа. */
            if !parts.isEmpty {
                SplitBar(parts: parts, height: 9)
                    .padding(.top, 18)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Brand.sandCard, in: .rect(cornerRadius: 28, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .strokeBorder(Brand.sandInk.opacity(0.18), lineWidth: 1)
        }
        .shadow(color: Brand.sandInk.opacity(0.18), radius: 16, y: 8)
    }

    /**
     * Итог и его части — только с сервера.
     *
     * Здесь стоял запасной счёт на случай старого сервера: сложить суммы
     * постоянных расходов из списка. Он давал НОМИНАЛ вместо доли —
     * триста тысяч аренды десятого августа вместо девяноста семи, — то
     * есть не «примерно», а втрое мимо, и молча.
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

    /**
     * Заголовок раздела с его суммой.
     *
     * Сумма стоит здесь, а не в подписи под полосой наверху: там она
     * была вторым экземпляром тех же слов и того же числа. Раздел сам
     * называет, во что он обошёлся, — и это единственное место, где это
     * число написано.
     */
    private func heading(_ title: String, _ count: Int, _ amount: Int) -> some View {
        HStack(spacing: 8) {
            Text(title.uppercased())
                .font(.system(size: 11, weight: .black, design: .rounded))
                .tracking(1.3)
                .foregroundStyle(Brand.muted)
            Text("\(count)")
                .font(.system(size: 11, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(Brand.muted.opacity(0.7))
            Spacer(minLength: 8)
            Text(money(amount, currency))
                .font(.system(size: 13, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.ink)
                .lineLimit(1)
        }
        .padding(.horizontal, 22)
    }

    // ══════════════════════════ постоянные ══════════════════════════

    /**
     * Постоянные расходы — плитками, и крупным числом стоит НЕ номинал.
     *
     * Аренда в триста тысяч десятого числа обошлась в сто, и раньше
     * список показывал справа именно триста: владелец читал верхнее
     * число как «столько я потратил» и недосчитывался двухсот. Теперь
     * крупно то, во что расход обошёлся за этот месяц, а договорная сумма
     * стоит под ним подписью — там, где ей и место.
     */
    private var monthlyGrid: some View {
        LazyVGrid(
            columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)],
            spacing: 10
        ) {
            ForEach(monthlyOnes) { item in
                monthlyTile(item)
            }
        }
    }

    @ViewBuilder
    private func monthlyTile(_ item: API.Expense) -> some View {
        let editable = month == .current && item.endedAt == nil
        let tile = VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                Image(systemName: symbol(for: item.category))
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Brand.sandInk)
                    .frame(width: 38, height: 38)
                    .background(Brand.paper.opacity(0.8), in: .circle)
                Spacer(minLength: 0)
            }

            Text(item.category)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Brand.ink)
                .lineLimit(1)
                .padding(.top, 10)

            Spacer(minLength: 8)

            /* Крупно — доля этого месяца; когда сервер её не прислал,
               ставим номинал, но тогда и подписи под ним нет: две
               одинаковые суммы подряд читаются как ошибка. */
            Text(money(item.share ?? item.amount, currency))
                .font(.system(size: 20, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.6)

            Text(monthlyNote(item))
                .font(.system(size: 11))
                .monospacedDigit()
                .foregroundStyle(Brand.muted)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .padding(.top, 1)
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 138, alignment: .topLeading)
        .background(Brand.sandCard.opacity(item.endedAt == nil ? 1 : 0.5), in: .rect(cornerRadius: 20, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(Brand.sandInk.opacity(0.16), lineWidth: 1)
        }
        .contentShape(.rect)
        .accessibilityElement(children: .combine)

        if editable {
            Button { editing = item } label: { tile }
                .buttonStyle(.press)
                .contextMenu { eraseButton(item) }
        } else {
            tile
        }
    }

    /**
     * Что стоит под суммой постоянного расхода.
     *
     * Договорная сумма, и только она: крупное число уже сказало, во
     * что расход обошёлся за месяц, а третьим числом на плитке стояла
     * дневная доля — её читают раз в жизни, и она же путалась со
     * средним расходом за день в шапке. Дневная доля осталась в карточке
     * правки, где о ней и спрашивают.
     */
    private func monthlyNote(_ item: API.Expense) -> String {
        if let ended = item.endedAt { return L("expenses.stoppedOn", day(ended)) }
        guard item.share != nil else { return L("expenses.perMonth") }
        return "\(money(item.amount, currency)) \(L("expenses.perMonth"))"
    }

    // ══════════════════════════ разовые ══════════════════════════

    /**
     * Разовые — строками в одной бумаге.
     *
     * Плиткой им быть незачем: разовый расход уже случился и больше
     * ничего не тянет, читают их пачкой и по дням. Знак слева не
     * украшение — за месяц набирается два десятка одинаковых «Химия» и
     * «Вода», и по значку список листается глазами, без чтения.
     */
    private var oneOffList: some View {
        VStack(spacing: 0) {
            ForEach(Array(oneOffs.enumerated()), id: \.element.id) { index, item in
                oneOffRow(item)
                if index < oneOffs.count - 1 { Hairline(inset: 60) }
            }
        }
        .paperCard(22)
    }

    @ViewBuilder
    private func oneOffRow(_ item: API.Expense) -> some View {
        let face = HStack(spacing: 12) {
            Image(systemName: symbol(for: item.category))
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Brand.sandInk)
                .frame(width: 36, height: 36)
                .background(Brand.sandCard, in: .rect(cornerRadius: 12, style: .continuous))

            VStack(alignment: .leading, spacing: 1) {
                Text(item.category)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Brand.ink)
                    .lineLimit(1)
                Text(day(item.at))
                    .font(.system(size: 12))
                    .monospacedDigit()
                    .foregroundStyle(Brand.muted)
            }

            Spacer(minLength: 8)

            Text(money(item.amount, currency))
                .font(.system(size: 16, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)

        if month == .current {
            Button { editing = item } label: { face }
                .buttonStyle(.press)
                .contextMenu { eraseButton(item) }
        } else {
            face
        }
    }

    /**
     * Убрать расход.
     *
     * Долгим нажатием, а не смахиванием: смахивание живёт только в
     * системном списке, а этот экран собран плитками и бумагой. Само
     * удаление осталось прежним — с подтверждением, потому что
     * постоянный расход влияет на прибыль каждого следующего дня.
     */
    @ViewBuilder
    private func eraseButton(_ item: API.Expense) -> some View {
        Button(role: .destructive) {
            confirmingRemoval = item
        } label: {
            Label(L("common.delete"), systemImage: "trash")
        }
    }

    // ══════════════════════════ пусто и кнопки ══════════════════════════

    /** Пустой месяц — законченный экран, а не одинокая подпись списка. */
    private var empty: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: "tray.fill")
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(Brand.sandInk)
                .frame(width: 52, height: 52)
                .background(Brand.sandCard, in: .circle)
            Spacer(minLength: 10)
            Text(L("expenses.empty"))
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(Brand.ink)
                .fixedSize(horizontal: false, vertical: true)
            Text(L("expenses.emptyNote"))
                .font(.system(size: 13))
                .foregroundStyle(Brand.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(20)
        .frame(maxWidth: .infinity, minHeight: 190, alignment: .topLeading)
        .paperCard(26)
    }

    /// Прошлый месяц закрыт для правок — и говорит об этом сам. Раньше
    /// список просто молча не отвечал на касания и выглядел сломанным.
    private var readOnlyNote: some View {
        Text(L("expenses.closedMonth"))
            .font(.system(size: 13))
            .foregroundStyle(Brand.muted)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
    }

    private var addButton: some View {
        Button {
            adding = true
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "plus")
                    .font(.system(size: 15, weight: .black))
                Text(L("expenses.addExpense"))
            }
        }
        .buttonStyle(LimeButton())
        .shadow(color: Brand.lime.opacity(0.45), radius: 16, y: 8)
        .padding(.horizontal, 16)
        .padding(.bottom, 6)
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

    /**
     * «Сегодня», «вчера» или число.
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
    private func remove(_ item: API.Expense) async {
        withAnimation(.snappy(duration: Motion.normal)) {
            items.removeAll { $0.id == item.id }
        }
        let ok: Bool = (try? await session.authed { token in
            _ = try await APIClient.shared.raw("expenses/\(item.id)", method: "DELETE", token: token)
            return true
        }) ?? false
        if !ok { await reload() }
    }

    private func reload() async {
        do {
            let result = try await session.authed { token in
                try await APIClient.shared.send("expenses?month=\(month.rawValue)", token: token, as: API.Expenses.self)
            }
            withAnimation(.snappy(duration: Motion.normal)) {
                items = result.expenses
                costs = result.costs
            }
            hints = result.hints
            revenue = result.revenue ?? 0
            failed = false
            failNote = nil
        } catch is CancellationError {
            /* Потянули вниз и отпустили, или ушли с экрана. Ничего не
               сломалось — и экран об этом молчит. */
            return
        } catch let error as APIError {
            failed = true
            failNote = error.isOffline ? L("common.offlineNote") : nil
        } catch {
            failed = true
            failNote = nil
        }
        loaded = true
        arrive()
    }

    /// Показание, постоянные и разовые приходят по очереди.
    private func arrive() {
        guard beat == .waiting else { return }
        if reduceMotion {
            beat = .here
        } else {
            withAnimation { beat = .here }
        }
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
    @FocusState private var typingCategory: Bool

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
        NavigationStack {
        ScrollView {
            VStack(spacing: 10) {
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
                        .foregroundStyle(Brand.badOnBoard)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 4)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 28)
        }
        /* Короткая форма не тянется и не пружинит.
           Прокрутка внутри листа перехватывала жест вниз: экран отвечал
           оттягиванием, как будто это обновление списка, а лист при этом
           не закрывался — поймать его удавалось только за полоску
           сверху. С `basedOnSize` содержимое, которое помещается,
           прокруткой не считается, и движение вниз достаётся листу: он
           закрывается смахиванием откуда угодно. */
        .scrollBounceBehavior(.basedOnSize)
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
        // системная скорлупа листа: заголовок по центру, текстовое «Закрыть»
        .navigationTitle(isNew ? L("expenses.newTitle") : L("expenses.one"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(L("common.close")) { dismiss() }.disabled(busy)
            }
        }
        }
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
            // по всей полосе, а не по трём цифрам в её середине
            .contentShape(.rect)
            .onTapGesture { typingAmount = true }

            Rectangle().fill(Brand.boardInk.opacity(0.07)).frame(height: 1)

            /* Поле называет себя само: заголовок «На что» стоял над
               коробкой, а внутри лежал пример «аренда, вода, химия» —
               два вопроса об одном. Готовые ответы и так стоят фишками
               строкой ниже. */
            TextField(L("expenses.category"), text: $category)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Brand.onBoard)
                .focused($typingCategory)
                .padding(.horizontal, 16)
                .frame(height: 58)
                .contentShape(.rect)
                .onTapGesture { typingCategory = true }
        }
        .boardCard()
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
        .boardCard()
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
                in: .rect(cornerRadius: 22, style: .continuous)
            )
        }
        .buttonStyle(.press)
        .accessibilityAddTraits(on ? [.isSelected] : [])
    }

    private func note(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 13))
            .foregroundStyle(Brand.boardMuted)
            .fixedSize(horizontal: false, vertical: true)
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .boardCard()
    }

    private var saveBar: some View {
        Button {
            Task { await save() }
        } label: {
            Text(L("common.save"))
        }
        .buttonStyle(LimeButton(loading: busy, busyTitle: L("common.saving")))
        .disabled(!ready)
        .opacity(busy || ready ? 1 : 0.45)
        .padding(.horizontal, 16)
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
