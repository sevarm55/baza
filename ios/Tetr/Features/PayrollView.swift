import SwiftUI

/**
 * Зарплаты.
 *
 * Экран построен вокруг рабочего дня, а не вокруг человека и не вокруг
 * кнопки. Причина простая: рассчитываются днями. «За вчера отдал, за
 * сегодня нет» — фраза из жизни, а «Валоду отдал шесть тысяч из
 * тринадцати» — нет: вторая требует держать в голове, за что именно
 * шесть, и ровно на этом возникает спор, ради устранения которого
 * продукт и написан.
 *
 * Порядок чтения задан вопросами, с которыми сюда заходят:
 *
 *   1. сколько всего раздать сейчас   → плита наверху;
 *   2. кому                           → строки внутри дня;
 *   3. за какой день                  → сам блок дня;
 *   4. почему столько                 → разложение по машинам в строке;
 *   5. что уже отдано                 → вкладка «Պատմություն».
 *
 * Пятое живёт отдельной вкладкой, а не в конце того же списка: долг и
 * уже отданное — разные вопросы, и один список, где они перемешаны, не
 * отвечает ни на один.
 *
 * Считает сервер, и тем же кодом, что для кабинета: `board` приходит
 * готовым листом. Складывать эти числа на телефоне было бы не только
 * лишней работой — по старому `due` закрытый день вообще не отличить от
 * дня, где мыли по нулевой ставке, оба приходят нулём.
 */
struct PayrollView: View {
    @EnvironmentObject private var session: Session

    @State private var payroll: API.Payroll?
    @State private var tab = Tab.due
    /// что отмечено к выплате: `день|человек`
    @State private var picked: Set<String> = []
    /// у каких строк раскрыто разложение по машинам
    @State private var opened: Set<String> = []
    /// какие закрытые дни развернули обратно в полную карточку
    @State private var openedDays: Set<String> = []
    /// что сейчас на подтверждении
    @State private var asking: [Pick]?
    @State private var showClosed = false
    @State private var settling = false
    @State private var note: String?
    @State private var failure: String?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private enum Tab: Hashable { case due, history }

    /// Человек и рабочий день, за который платят. Одно без другого не
    /// имеет смысла: деньги отдают за день, а не «вообще».
    private struct Pick: Hashable {
        let staffId: String
        let day: String
        let name: String
        let amount: Int
    }

    private var currency: String { session.tenant?.currency ?? "AMD" }
    private var unitOne: String { session.tenant?.unitOne ?? "" }
    private var staffRole: String { session.tenant?.staffRole ?? "" }

    private let gap: CGFloat = 10

    var body: some View {
        ScrollView {
            VStack(spacing: gap) {
                if let failure {
                    problem(failure)
                } else if let board = payroll?.board {
                    hero(board)
                    tabs(board)

                    if tab == .due {
                        due(board)
                    } else {
                        history(board)
                    }
                } else if payroll != nil {
                    /* Сервер старше приложения: дневного листа он ещё не
                       отдаёт. Молчать нельзя — экран выглядел бы пустым, —
                       но и врать про суммы нечем. */
                    outdated
                }
            }
            .padding(.horizontal, 12)
            .padding(.bottom, settling || !picked.isEmpty ? 96 : 28)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.board.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) { dock }
        .overlay(alignment: .bottom) { toast }
        .task { await reload() }
        .refreshable { await reload() }
        .alert(
            L("payroll.confirmTitle"),
            isPresented: .init(get: { asking != nil }, set: { if !$0 { asking = nil } })
        ) {
            Button(L("common.cancel"), role: .cancel) { asking = nil }
            Button(L("payroll.confirm")) {
                if let items = asking { Task { await settle(items) } }
                asking = nil
            }
        } message: {
            /* В окне стоит ровно то, что произойдёт: кому, сколько и за
               какой день. Расчёт закрывает день, и следующий пойдёт от
               него; подтверждение без имён и сумм — это кнопка «да»,
               которую жмут не глядя. */
            if let items = asking { Text(confirmText(items)) }
        }
    }

    // ══════════════════════════ показания ══════════════════════════

    /**
     * Сколько всего раздать — и кому.
     *
     * Грейповой плиты здесь больше нет: она была самой яркой вещью на
     * экране, но говорила ровно одно число, а следом шла белая полоска из
     * трёх показателей, где первым стояло начисление — та же самая сумма
     * второй раз подряд.
     *
     * И голое число по центру тоже не годится: ровно так начинается
     * сводка, и два разных экрана открывались бы одинаково. Разница между
     * ними существенная. Сводка отвечает «сколько получилось» — это
     * показание прибора, и место ему по оси. Зарплаты отвечают «кому
     * раздать» — это список людей, и начинаться он должен с людей.
     *
     * Поэтому наверху стопка кружков: те, кому сейчас должны, каждый
     * своим цветом — тем же, каким его имя набрано в ленте, в команде и
     * в строке ниже. Кружки перекрывают друг друга, как принято
     * показывать группу, и при пятерых и больше последним встаёт счётчик
     * остатка. Блок прижат влево, а не выровнен по центру: асимметрия и
     * есть то, чем этот экран отличается от сводки с первого взгляда.
     */
    private func hero(_ board: API.PayrollBoard) -> some View {
        let total = board.totals.outstanding
        let owed = owedPeople(board)

        var parts: [String] = []
        if total > 0 { parts.append(Terms.staff(board.totals.owedTo, staffRole)) }
        parts.append("\(board.totals.units) \(Terms.unitWord(board.totals.units, unitOne))")
        if board.totals.settled > 0 {
            parts.append("\(L("owner.payrollAccrued")) \(money(board.totals.accrued, currency))")
            parts.append("\(L("payroll.paid")) \(money(board.totals.settled, currency))")
        }

        return VStack(alignment: .leading, spacing: 0) {
            if !owed.isEmpty {
                faces(owed)
                    .padding(.bottom, 12)
            }

            Text(L("payroll.dueHeader"))
                .font(.system(size: 10, weight: .black, design: .rounded))
                .tracking(1.35)
                .foregroundStyle(Brand.boardMuted)

            /* Долг набран чернилами, а не грейпом: это показание, а не
               действие, и красить его фирменным цветом значит обещать
               нажатие, которого нет. */
            Text(money(total, currency))
                .font(.system(size: 44, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)
                .lineLimit(1)
                .minimumScaleFactor(0.42)
                .contentTransition(.numericText(value: Double(total)))
                .padding(.top, 2)

            Text(total > 0 ? parts.joined(separator: " · ") : L("payroll.dayAllPaid"))
                .font(.system(size: 12.5))
                .monospacedDigit()
                .foregroundStyle(Brand.boardMuted)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .padding(.top, 3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 4)
        .padding(.top, 10)
        .padding(.bottom, 8)
        .accessibilityElement(children: .combine)
    }

    /// Кому должны, от большего долга к меньшему.
    ///
    /// Один человек может стоять в нескольких днях; здесь он один и с
    /// общим долгом, иначе в стопке появились бы два одинаковых кружка.
    private func owedPeople(_ board: API.PayrollBoard) -> [(name: String, owed: Int)] {
        var sums: [String: Int] = [:]
        for day in board.days {
            for person in day.people where person.earned > 0 {
                guard let name = person.name, !name.isEmpty else { continue }
                sums[name, default: 0] += person.earned
            }
        }
        return sums.map { (name: $0.key, owed: $0.value) }.sorted { $0.owed > $1.owed }
    }

    /// Стопка кружков: четверо в лицо, остальные счётчиком.
    ///
    /// Кольцо цвета полотна вокруг каждого — не украшение: без него два
    /// тёмных кружка внахлёст сливаются в одно пятно, и стопка перестаёт
    /// читаться количеством.
    private func faces(_ people: [(name: String, owed: Int)]) -> some View {
        let shown = people.prefix(4)
        let rest = people.count - shown.count

        return HStack(spacing: -11) {
            ForEach(Array(shown.enumerated()), id: \.offset) { _, person in
                Text(String(person.name.prefix(1)))
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(Brand.personTone(person.name).base, in: .circle)
                    .overlay(Circle().strokeBorder(Brand.board, lineWidth: 2.5))
            }

            if rest > 0 {
                Text("+\(rest)")
                    .font(.system(size: 13, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)
                    .frame(width: 36, height: 36)
                    .background(Brand.boardInk.opacity(0.09), in: .circle)
                    .overlay(Circle().strokeBorder(Brand.board, lineWidth: 2.5))
            }
        }
        .accessibilityHidden(true)
    }

    /**
     * Долг и история — под переключателем, а не в одном списке.
     *
     * Суммы на вкладке нет, хотя в кабинете она есть. Причина в ширине:
     * сегмент ужимает надпись, и узкие пробелы между разрядами
     * схлопываются — «1 266 750» превращается в «1266750», число, которое
     * читают по одной цифре. На телефоне оно и не нужно: та же сумма
     * стоит строкой выше, в плите, кеглем в сорок три.
     */
    private func tabs(_ board: API.PayrollBoard) -> some View {
        Picker("", selection: $tab) {
            Text(board.totals.outstanding > 0 ? L("owner.toPay") : L("payroll.allPaidMark")).tag(Tab.due)
            Text(L("payroll.tabHistory")).tag(Tab.history)
        }
        .pickerStyle(.segmented)
        .padding(.top, 2)
    }

    // ══════════════════════════ рабочие дни ══════════════════════════

    @ViewBuilder
    private func due(_ board: API.PayrollBoard) -> some View {
        /* Дни с долгом — и сегодняшний, даже если он уже закрыт: сегодня
           ещё растёт, и владельцу нужно видеть, что там происходит.
           Когда долга нет вовсе, под чертой оказываются все дни: наверху
           стоит ответ «всё выплачено», и единственная карточка рядом с
           ним читалась бы исключением из него. */
        let today = dayKey(Date())
        let open = board.totals.outstanding > 0
            ? board.days.filter { $0.outstanding > 0 || $0.day == today }
            : []
        let closed = board.days.filter { day in !open.contains { $0.day == day.day } }

        if board.totals.outstanding == 0 {
            settled(board)
        } else {
            if !open.contains(where: { $0.day == today }) {
                emptyToday(today)
            }
            ForEach(open) { day in
                dayCard(day, today: today)
            }
        }

        if !closed.isEmpty {
            Button {
                withAnimation(.snappy(duration: 0.24)) { showClosed.toggle() }
            } label: {
                Text(showClosed ? L("payroll.hidePaidDays") : Ln("payroll.showPaidDays", closed.count))
                    .font(.system(size: 12.5, weight: .medium))
                    .foregroundStyle(Brand.boardMuted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 6)
                    .padding(.top, 6)
            }
            .buttonStyle(.press)

            if showClosed {
                ForEach(closed) { day in
                    /* Развёрнутый закрытый день — обычная карточка:
                       ничего особенного в нём нет, кроме того, что он
                       закрыт. */
                    if openedDays.contains(day.day) {
                        dayCard(day, today: today)
                    } else {
                        closedCard(day, today: today)
                    }
                }
            }
        }
    }

    /**
     * Рабочий день блоком.
     *
     * В шапке стоит то, ради чего блок читают: сколько по этому дню
     * осталось отдать. Не «начислено за день» и не «выплачено» — именно
     * долг: два других числа справочные, и ставить их на то же место
     * значит заставлять выбирать, какое из трёх сейчас важно.
     */
    private func dayCard(_ day: API.PayrollBoardDay, today: String) -> some View {
        let payable = day.people.filter { $0.staffId != nil && $0.earned > 0 }
        let mine = payable.filter { picked.contains(key(day.day, $0)) }

        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(dayTitle(day.day, today: today))
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(Brand.onBoard)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                    Text("\(Terms.staff(day.people.count, staffRole)) · \(Terms.units(day.units, unitOne))")
                        .font(.system(size: 11.5))
                        .monospacedDigit()
                        .foregroundStyle(Brand.boardMuted)
                }

                Spacer(minLength: 8)

                if day.outstanding > 0 {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(money(day.outstanding, currency))
                            .font(.system(size: 19, weight: .bold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(Brand.onBoard)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                        Text(L("payroll.dayToPay"))
                            .font(.system(size: 10.5))
                            .foregroundStyle(Brand.boardMuted)
                    }
                } else {
                    /* Коротко: «Ամեն ինչ վճարված է» рядом с датой ломало
                       заголовок на две строки — на телефоне на эту полку
                       не помещаются две фразы сразу. Полная стоит там,
                       где место есть, — в пустом состоянии. */
                    Label(L("payroll.paid"), systemImage: "checkmark")
                        .font(.system(size: 12.5, weight: .semibold))
                        .foregroundStyle(Brand.goodOnBoard)
                        .fixedSize()
                }
            }

            /* «Выбрать всех» — тихой подписью, а не второй кнопкой рядом
               с расчётом: закрыть день целиком нужно часто, но выбор
               делает человек, и по умолчанию не отмечено ничего. */
            if payable.count > 1 && mine.count < payable.count {
                Button {
                    for person in payable { picked.insert(key(day.day, person)) }
                } label: {
                    Text(L("payroll.selectAll"))
                        .font(.system(size: 12.5, weight: .medium))
                        .foregroundStyle(Brand.grape)
                }
                .buttonStyle(.press)
                .padding(.top, 10)
            }

            VStack(spacing: 0) {
                ForEach(Array(day.people.enumerated()), id: \.element.id) { index, person in
                    // линия между строками, но не над первой: список
                    // должен начинаться содержимым, а не чертой
                    if index > 0 {
                        Rectangle()
                            .fill(Brand.boardInk.opacity(0.07))
                            .frame(height: 1)
                    }
                    row(person, day: day.day)
                }
            }
            .padding(.top, 6)

            /* Полосы расчёта внутри дня здесь нет: её место занимает
               причал у нижнего края. Две одинаковые кнопки в одном
               экране — не подстраховка, а вопрос «эти две делают одно и
               то же или разное», который человек задаёт себе с деньгами
               в руке. В кабинете полоса остаётся: там экран шире дня, и
               причал появляется только на телефоне. */
        }
        .padding(16)
        .background(Brand.boardSurface, in: .rect(cornerRadius: 22))
    }

    /// Закрытый день ничего не требует и занимает столько места, сколько
    /// стоит ответ «здесь всё».
    private func closedCard(_ day: API.PayrollBoardDay, today: String) -> some View {
        Button {
            withAnimation(reduceMotion ? nil : .snappy(duration: 0.24)) {
                _ = openedDays.insert(day.day)
            }
        } label: {
            HStack(spacing: 10) {
                Text(dayTitle(day.day, today: today))
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Brand.onBoard)

                Label(L("payroll.paid"), systemImage: "checkmark")
                    .font(.system(size: 11.5, weight: .semibold))
                    .foregroundStyle(Brand.goodOnBoard)

                Spacer(minLength: 8)

                Text(money(day.paid, currency))
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Brand.onBoard)

                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Brand.boardMuted)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity)
            .background(Brand.boardSurface, in: .rect(cornerRadius: 18))
        }
        .buttonStyle(.press)
    }

    /**
     * Человек внутри дня.
     *
     * Строка, а не карточка с кнопкой во всю ширину. Прежде под каждым
     * именем лежала лаймовая полоса «отметить выплаченным», и лист из
     * пяти человек читался пятью призывами нажать; кто из них сколько
     * получит, приходилось искать между кнопками.
     *
     * Закрытая строка приглушена, но не спрятана: полный итог рабочего
     * дня владельцу нужен целиком, иначе завтра он не вспомнит, отдал ли.
     */
    private func row(_ person: API.PayrollPerson, day: String) -> some View {
        let id = key(day, person)
        let owed = person.earned > 0
        let closed = !owed && person.paid > 0
        let name = person.name ?? "—"
        let tone = Brand.personTone(name)
        let isOpen = opened.contains(id)

        return VStack(spacing: 0) {
            HStack(spacing: 10) {
                /* Флажок у того, кому ещё должны; галка у того, с кем уже
                   рассчитались. Одно место, два состояния — по нему день
                   и читается сверху вниз, без чтения сумм. */
                if owed, person.staffId != nil {
                    Button {
                        if picked.contains(id) { picked.remove(id) } else { picked.insert(id) }
                    } label: {
                        Image(systemName: picked.contains(id) ? "checkmark.square.fill" : "square")
                            .font(.system(size: 19, weight: .regular))
                            .foregroundStyle(picked.contains(id) ? Brand.grape : Brand.boardMuted)
                            .frame(width: 30, height: 30)
                            .contentShape(.rect)
                    }
                    .buttonStyle(.press)
                    .disabled(settling)
                    .accessibilityLabel("\(name) · \(money(person.earned, currency))")
                } else {
                    Image(systemName: closed ? "checkmark" : "minus")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(closed ? Brand.goodOnBoard : Brand.boardMuted.opacity(0.5))
                        .frame(width: 30, height: 30)
                }

                Circle()
                    .fill(tone.base)
                    .frame(width: 8, height: 8)

                VStack(alignment: .leading, spacing: 1) {
                    Text(name)
                        .font(.system(size: 14.5, weight: .semibold))
                        .foregroundStyle(closed ? Brand.boardMuted : Brand.onBoard)
                        .lineLimit(1)

                    Text(facts(person))
                        .font(.system(size: 11.5))
                        .monospacedDigit()
                        .foregroundStyle(Brand.boardMuted)
                        .lineLimit(1)
                }

                Spacer(minLength: 6)

                VStack(alignment: .trailing, spacing: 1) {
                    Text(money(owed ? person.earned : person.paid, currency))
                        .font(.system(size: 15, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(closed ? Brand.boardMuted : Brand.onBoard)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)

                    if closed, let paidAt = person.paidAt {
                        Text(stamp(paidAt))
                            .font(.system(size: 11))
                            .monospacedDigit()
                            .foregroundStyle(Brand.goodOnBoard)
                    } else if owed, person.paid > 0 {
                        /* День, за который заплатили днём, а вечером
                           намыли ещё, иначе выглядит неоплаченным целиком. */
                        Text(L("payroll.alreadyPaid", money(person.paid, currency)))
                            .font(.system(size: 11))
                            .monospacedDigit()
                            .foregroundStyle(Brand.boardMuted)
                    } else if owed {
                        Text(L("payroll.unpaid"))
                            .font(.system(size: 11))
                            .foregroundStyle(Brand.boardMuted)
                    }
                }

                if person.lines != nil {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(Brand.boardMuted.opacity(0.7))
                        .rotationEffect(.degrees(isOpen ? 90 : 0))
                        .frame(width: 16)
                } else {
                    Spacer().frame(width: 16)
                }
            }
            .padding(.vertical, 9)
            .contentShape(.rect)
            .onTapGesture {
                guard person.lines != nil else { return }
                withAnimation(reduceMotion ? nil : .snappy(duration: 0.22)) {
                    if isOpen { opened.remove(id) } else { opened.insert(id) }
                }
            }

            /* Разложение суммы. Оно и есть ответ на вопрос «почему
               столько»: цена машины, ставка в момент записи и доля с
               неё. Ставка берётся из самой записи — после смены процента
               текущая её уже не объясняет. */
            if isOpen, let lines = person.lines {
                VStack(spacing: 3) {
                    ForEach(lines) { line in
                        HStack(spacing: 8) {
                            Text(line.title)
                                .foregroundStyle(Brand.boardMuted)
                                .lineLimit(1)
                            Spacer(minLength: 6)
                            /* Совместная работа дописывает делитель. Без
                               него строка «12 000 ֏ × 45 % → 1 800 ֏»
                               врёт на глазах: сорок пять процентов от
                               двенадцати тысяч это пять четыреста.
                               Деление на число участников и есть
                               недостающее звено — процент здесь общий на
                               команду, а получает человек свою часть
                               фонда. */
                            Text(line.formula(money(line.price, currency)))
                                .foregroundStyle(Brand.boardMuted.opacity(0.85))
                                .lineLimit(1)
                            Text(money(line.earned, currency))
                                .fontWeight(.semibold)
                                .foregroundStyle(Brand.onBoard)
                        }
                        .font(.system(size: 11.5))
                        .monospacedDigit()
                    }
                }
                .padding(.leading, 48)
                .padding(.bottom, 8)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
    }

    private func facts(_ person: API.PayrollPerson) -> String {
        let left = Terms.units(person.count, unitOne)
        guard let rate = person.rateLabel else { return left }
        return "\(left) · \(rate)"
    }

    // ══════════════════════════ пусто и сломалось ══════════════════════

    private func settled(_ board: API.PayrollBoard) -> some View {
        VStack(spacing: 6) {
            Image(systemName: "checkmark")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(Brand.goodOnBoard)
            Text(L("payroll.dayAllPaid"))
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Brand.onBoard)
            Text(L("payroll.nothingUnpaid"))
                .font(.system(size: 13))
                .foregroundStyle(Brand.boardMuted)

            if !board.payments.isEmpty {
                Button(L("payroll.openHistory")) { tab = .history }
                    .buttonStyle(.glass)
                    .padding(.top, 8)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
        .background(Brand.boardSurface, in: .rect(cornerRadius: 22))
    }

    /// Сегодня ещё не мыли. Пустой сегодняшний день — это ответ, а не
    /// отсутствие ответа.
    private func emptyToday(_ today: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(dayTitle(today, today: today))
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(Brand.onBoard)
            Text(L("payroll.dayEmpty"))
                .font(.system(size: 13))
                .foregroundStyle(Brand.boardMuted)
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.vertical, 12)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Brand.boardSurface, in: .rect(cornerRadius: 22))
    }

    /**
     * Сервер старше приложения: дневного листа он ещё не отдаёт.
     *
     * Винить приложение здесь нельзя — обновлять надо не его, и надпись
     * «обновите приложение» отправила бы человека в магазин, где для него
     * ничего нет. Такое бывает ровно в одном случае: сборку поставили на
     * телефон раньше, чем выкатили сервер.
     */
    private var outdated: some View {
        VStack(spacing: 10) {
            Image(systemName: "arrow.trianglehead.2.clockwise")
                .font(.system(size: 22))
                .foregroundStyle(Brand.boardMuted)
            Text(L("payroll.notOnServer"))
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Brand.onBoard)
            Text(L("errors.appNewer"))
                .font(.system(size: 13))
                .foregroundStyle(Brand.boardMuted)
            Button(L("common.retry")) { Task { await reload() } }
                .buttonStyle(.glass)
                .padding(.top, 6)
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 44)
    }

    private func problem(_ text: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 26))
                .foregroundStyle(Brand.grape)
            Text(text)
                .font(.system(size: 14))
                .multilineTextAlignment(.center)
                .foregroundStyle(Brand.boardMuted)
            Button(L("common.retry")) { Task { await reload() } }
                .buttonStyle(.glass)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 60)
    }

    // ══════════════════════════ история ══════════════════════════

    /**
     * Что уже отдано.
     *
     * Прежде здесь стоял список «имя · дата · сумма», и на вопрос «за
     * какой день я заплатил» он не отвечал вовсе. Теперь две разные
     * сущности названы двумя разными способами и стоят в разных местах:
     * когда отдали — заголовок дня и время слева, за что отдали —
     * подпись «за работу такого-то» под суммой.
     *
     * Группировка идёт по дню ВЫПЛАТЫ: сюда приходят с вопросом «когда я
     * реально отдал деньги». Расчёт с тремя людьми, сделанный одним
     * нажатием, показан одной записью — тем, чем он и был.
     */
    @ViewBuilder
    private func history(_ board: API.PayrollBoard) -> some View {
        if board.payments.isEmpty {
            Text(L("payroll.historyEmpty"))
                .font(.system(size: 14))
                .foregroundStyle(Brand.boardMuted)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 44)
        } else {
            let today = dayKey(Date())
            let groups = Dictionary(grouping: board.payments) { dayKey($0.paidAt) }

            ForEach(groups.keys.sorted(by: >), id: \.self) { key in
                VStack(alignment: .leading, spacing: 8) {
                    Text(dayTitle(key, today: today))
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Brand.boardMuted)
                        .padding(.horizontal, 6)

                    ForEach(groups[key] ?? []) { payment in
                        paymentCard(payment)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 6)
            }
        }
    }

    private func paymentCard(_ payment: API.PayrollPayment) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(time(payment.paidAt))
                .font(.system(size: 12, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(Brand.boardMuted)
                .padding(.top, 1)

            VStack(alignment: .leading, spacing: 3) {
                ForEach(payment.rows) { line in
                    HStack(spacing: 8) {
                        Circle()
                            .fill(Brand.personTone(line.name ?? "—").base)
                            .frame(width: 7, height: 7)
                        Text(line.name ?? "—")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(Brand.onBoard)
                            .lineLimit(1)
                        Spacer(minLength: 6)
                        Text(money(line.amount, currency))
                            .font(.system(size: 14, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(Brand.onBoard)
                    }
                }

                // итог — только когда людей несколько: под одной строкой
                // он повторял бы её же число
                if payment.rows.count > 1 {
                    Rectangle()
                        .fill(Brand.boardInk.opacity(0.09))
                        .frame(height: 1)
                        .padding(.top, 3)

                    HStack {
                        Text(L("common.total"))
                            .font(.system(size: 12))
                            .foregroundStyle(Brand.boardMuted)
                        Spacer()
                        Text(money(payment.total, currency))
                            .font(.system(size: 14.5, weight: .bold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(Brand.onBoard)
                    }
                }

                Text(workLabel(payment))
                    .font(.system(size: 11.5))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)
                    .padding(.top, 2)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Brand.boardSurface, in: .rect(cornerRadius: 18))
    }

    /// За какой рабочий день отданы деньги — словами, а не второй датой:
    /// две даты подряд снова пришлось бы различать по порядку, а не по
    /// смыслу.
    private func workLabel(_ payment: API.PayrollPayment) -> String {
        var line: String
        if let day = payment.day {
            line = L("payroll.forWork", longDay(day))
        } else {
            /* Старая выплата: она закрывала отрезок целиком, и разложить
               её обратно по дням честно нельзя. Верхняя граница — полночь
               СЛЕДУЮЩИХ суток, поэтому последний рабочий день на миг
               раньше. */
            let last = dayKey(payment.periodTo.addingTimeInterval(-0.001))
            if payment.periodFrom.timeIntervalSince1970 <= 0 {
                line = L("payroll.forWorkUpTo", longDay(last))
            } else {
                let first = dayKey(payment.periodFrom)
                line = first == last
                    ? L("payroll.forWork", longDay(first))
                    : L("payroll.forWorkRange", longDay(first), longDay(last))
            }
        }
        if let units = payment.units, units > 0 { line += " · \(Terms.units(units, unitOne))" }
        return line
    }

    // ══════════════════════════ расчёт ══════════════════════════

    /// Причал у нижнего края: отмеченное в разных днях остаётся под
    /// рукой, даже когда сам день уехал за верхний край.
    @ViewBuilder
    private var dock: some View {
        let items = allPicked()
        if !items.isEmpty {
            HStack(spacing: 12) {
                Text(Ln("payroll.selected", items.count))
                    .font(.system(size: 13))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)

                Spacer(minLength: 8)

                /* Поля у надписи свои.
                   `LimeButton` рассчитан на кнопку во всю ширину: боковых
                   полей у него нет вовсе, их роль играет растяжение.
                   Здесь кнопка сжата по содержимому, и без собственных
                   полей надпись упиралась в края заливки — «Վճարել 3 000 ֏»
                   читалось одним слипшимся словом. */
                Button {
                    asking = items
                } label: {
                    Text(L("payroll.paySum", money(items.reduce(0) { $0 + $1.amount }, currency)))
                        .padding(.horizontal, 20)
                }
                .buttonStyle(LimeButton(loading: settling, busyTitle: L("payroll.paying")))
                .fixedSize()
                .disabled(settling)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(.bar)
            .transition(.move(edge: .bottom))
        }
    }

    /// Сообщение о том, что расчёт лёг. Нужно ровно потому, что после
    /// расчёта строки исчезают: экран меняется сам, и без единого слова
    /// непонятно, случилось это от нажатия или что-то сломалось.
    @ViewBuilder
    private var toast: some View {
        if let note {
            Text(note)
                .font(.system(size: 13.5, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(Brand.board)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Brand.onBoard, in: .rect(cornerRadius: 14))
                /* Выше плавающей полосы вкладок: у нижнего края экрана
                   его закрывала бы она, и сообщение о выплате видел бы
                   только тот, кто успел посмотреть на нижние сто точек. */
                .padding(.bottom, 96)
                .transition(.opacity.combined(with: .move(edge: .bottom)))
        }
    }

    private func confirmText(_ items: [Pick]) -> String {
        var lines = items.map { "\($0.name) · \(money($0.amount, currency))" }
        if items.count > 1 {
            lines.append(L("payroll.feedTotal", money(items.reduce(0) { $0 + $1.amount }, currency)))
        }
        let days = Set(items.map(\.day)).sorted()
        let today = dayKey(Date())
        let when = days.count == 1 ? dayTitle(days[0], today: today) : nil
        return ([when].compactMap { $0 } + lines).joined(separator: "\n")
    }

    private func settle(_ items: [Pick]) async {
        settling = true
        defer { settling = false }

        do {
            /* Список, а не запрос на каждого: момент выдачи ставит сервер
               один раз, и в истории это ложится одной выдачей. */
            _ = try await session.authed { token in
                try await APIClient.shared.raw(
                    "payouts",
                    method: "POST",
                    body: ["items": items.map { ["staffId": $0.staffId, "day": $0.day] }],
                    token: token
                )
            }
        } catch {
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            show(L("payroll.failed"))
            /* Часть расчётов могла лечь до сбоя: перечитываем лист и
               снимаем отметки, иначе следующее нажатие заплатит дважды. */
            picked.removeAll()
            await reload()
            return
        }

        let total = items.reduce(0) { $0 + $1.amount }
        picked.removeAll()
        // Деньги отданы из рук в руки — толчок подтверждает, что запись
        // легла, не заставляя вчитываться в изменившийся список.
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        show(L("payroll.done", money(total, currency)))
        await reload()
    }

    private func show(_ text: String) {
        withAnimation(reduceMotion ? nil : .snappy(duration: 0.2)) { note = text }
        Task {
            try? await Task.sleep(for: .seconds(4))
            withAnimation(reduceMotion ? nil : .snappy(duration: 0.2)) { note = nil }
        }
    }

    private func reload() async {
        do {
            let fresh = try await session.authed { token in
                try await APIClient.shared.send("payroll", token: token, as: API.Payroll.self)
            }
            /* Первая загрузка без анимации: прокрутка от нуля к сумме на
               старте читается как индикатор загрузки, а не как смысл. */
            if payroll == nil || reduceMotion {
                payroll = fresh
            } else {
                withAnimation(.snappy(duration: 0.45)) { payroll = fresh }
            }
            failure = nil
        } catch is CancellationError {
            /* Потянули вниз и отпустили, или ушли с экрана. Ничего не
               сломалось — и экран об этом молчит. */
            return
        } catch let error as APIError {
            failure = error.isOffline ? L("errors.offline") : "\(error.status) \(error.code ?? "—")"
        } catch {
            failure = Failure.text(error)
        }
    }

    // ══════════════════════════ мелочи ══════════════════════════

    private func key(_ day: String, _ person: API.PayrollPerson) -> String {
        "\(day)|\(person.staffId ?? "—")"
    }

    private func pick(_ person: API.PayrollPerson, day: String) -> Pick? {
        guard let staffId = person.staffId else { return nil }
        return Pick(staffId: staffId, day: day, name: person.name ?? "—", amount: person.earned)
    }

    /// Отмеченное во всех днях сразу — по нему живёт причал.
    private func allPicked() -> [Pick] {
        guard let days = payroll?.board?.days else { return [] }
        return days.flatMap { day in
            day.people.compactMap { person in
                picked.contains(key(day.day, person)) ? pick(person, day: day.day) : nil
            }
        }
    }

    private func dayTitle(_ day: String, today: String) -> String {
        day == today ? L("payroll.todayDay", longDay(day)) : longDay(day)
    }

    /* Даты — в поясе мойки, а не устройства: владелец в поездке видит
       смену своей мойки, а не своего часового пояса. */
    private var zone: TimeZone {
        session.tenant.flatMap { TimeZone(identifier: $0.timezone) } ?? .current
    }

    /// Технический формат: время и ключи дней, где порядок задан нами.
    private func formatter(_ format: String) -> DateFormatter {
        let f = DateFormatter()
        f.locale = LangStore.currentLang.locale
        f.timeZone = zone
        f.dateFormat = format
        return f
    }

        /* Шаблон, а не жёсткий формат: от языка зависит не только имя
           месяца, но и порядок. «16 августа» и «August 16» — одна и та же
           дата, записанная так, как её пишет язык. */
    private func dayFormatter(_ template: String) -> DateFormatter {
        let f = DateFormatter()
        f.locale = LangStore.currentLang.locale
        f.timeZone = zone
        f.setLocalizedDateFormatFromTemplate(template)
        return f
    }

    /// `2026-08-13` → «13 օգոստոսի». Число словом, а не «13.08»: экран
    /// различает рабочий день и день выплаты, и точки в обеих датах эту
    /// разницу стирают. Год появляется, только когда он не текущий.
    private func longDay(_ day: String) -> String {
        let parse = DateFormatter()
        parse.locale = Locale(identifier: "en_US_POSIX")
        parse.timeZone = TimeZone(identifier: "UTC")
        parse.dateFormat = "yyyy-MM-dd"
        guard let date = parse.date(from: day) else { return day }

        // полдень по UTC остаётся тем же днём в любом поясе
        let noon = date.addingTimeInterval(12 * 3600)
        let thisYear = formatter("yyyy").string(from: Date())
        return dayFormatter(day.hasPrefix(thisYear) ? "d MMMM" : "d MMMM y").string(from: noon)
    }

    /// `YYYY-MM-DD` момента в поясе мойки.
    private func dayKey(_ at: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = zone
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: at)
    }

    /// «14 օգս, 12:25» — короткая отметка о выдаче в строке.
    private func stamp(_ at: Date) -> String {
        dayFormatter("d MMM HH:mm").string(from: at)
    }

    private func time(_ at: Date) -> String {
        formatter("HH:mm").string(from: at)
    }
}
