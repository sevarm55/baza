import SwiftUI

/**
 * Сотрудники.
 *
 * Каждый — плитка своего цвета, того же, каким его имя набрано в ленте,
 * кружок на смене и карточка в зарплатах. Цвет здесь работает именем, и
 * список людей перестаёт быть списком строк.
 *
 * Процент вынесен из строки в отдельный крупный знак: это единственное
 * число, ради которого сюда заходят, и раньше оно стояло тем же кеглем, что
 * телефон.
 *
 * Меняется процент только на будущее: в каждом заказе лежит снимок, и
 * прошлые зарплаты не пересчитываются. Иначе поднять ставку было бы
 * страшно — это переписывало бы уже согласованные суммы.
 */
struct StaffView: View {
    @EnvironmentObject private var session: Session

    @State private var staff: [API.StaffMember] = []
    @State private var editing: API.StaffMember?
    @State private var adding = false
    /// Открыта настройка общего процента команды.
    @State private var teamOpen = false
    @State private var loaded = false
    /**
     * Почему список пуст.
     *
     * Пусто и «не доехало» — разные ответы. Список людей, который не
     * привезли, до сих пор выглядел как мойка без сотрудников, и
     * владелец шёл заводить их заново.
     */
    @State private var failed = false
    @State private var failNote: String?

    /// Такт прихода: люди и правила собираются по очереди.
    @State private var beat: Beat = .waiting

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /* Порядок задан состоянием, а не тем, в каком порядке людей завели:
       сначала те, кто стоит на мойке прямо сейчас, потом отработавшие в
       этом месяце, потом остальные. Вопрос «кто сейчас на площадке»
       задают чаще, чем «кто заведён раньше». Тот же порядок в кабинете. */
    private var ordered: [API.StaffMember] {
        staff.sorted { a, b in
            let onA = a.onShift ?? false
            let onB = b.onShift ?? false
            if onA != onB { return onA }
            let earnedA = a.earned ?? 0
            let earnedB = b.earned ?? 0
            if earnedA != earnedB { return earnedA > earnedB }
            return a.name.localizedCompare(b.name) == .orderedAscending
        }
    }

    /**
     * На экране только те, кто моет.
     *
     * Владельца здесь нет вовсе: экран заведён, чтобы завести человека,
     * поменять ему ставку и отключить, — а с собой владелец ничего из
     * этого сделать не может. Своя строка стояла последней и читалась
     * работником, у которого почему-то нет ни ставки, ни смены, ни
     * заработка. Имя и телефон владельца живут в профиле.
     */
    private var crew: [API.StaffMember] { ordered.filter { $0.role != "owner" } }

    private var currency: String { session.tenant?.currency ?? "AMD" }
    private var totalDue: Int { crew.compactMap(\.due).reduce(0, +) }
    private var onShiftCount: Int { crew.filter { $0.onShift == true }.count }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if loaded, !crew.isEmpty {
                    chips
                        .padding(.horizontal, 16)
                        .padding(.top, 6)
                        .reveal(beat, step: 0)

                    grid
                        .padding(.horizontal, 16)
                        .padding(.top, 16)
                        .reveal(beat, step: 1)
                }

                if !loaded {
                    Delayed(active: true) { TetrScreenLoader(height: 200) }
                        .padding(.horizontal, 16)
                } else if failed, staff.isEmpty {
                    TetrFailure(title: L("common.loadFailed"), note: failNote, retry: { await reload() })
                        .padding(.horizontal, 16)
                } else if crew.isEmpty {
                    staffEmpty
                        .padding(.horizontal, 16)
                        .padding(.top, 18)
                }

                if loaded {
                    rules
                        .padding(.horizontal, 16)
                        .padding(.top, 26)
                        .reveal(beat, step: 2)
                }
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
        /* «Команда», а не форма слова «мойщик»: `Terms.staff().many`
           даёт «Мойщика» — форму после числительного, и в заголовке она
           читается опечаткой. Тем же словом раздел назван в «Ещё», через
           которое сюда и заходят. */
        .navigationTitle(L("more.team"))
        .navigationSubtitle(subtitle)
        .toolbarTitleDisplayMode(.inlineLarge)
        .safeAreaInset(edge: .bottom) { addButton }
        .sheet(item: $editing) { person in
            StaffEditor(person: person) { await reload() }
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $adding) {
            StaffEditor(person: nil) { await reload() }
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $teamOpen) {
            TeamWashEditor()
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
        }
        .task { await reload() }
    }

    private var subtitle: String {
        guard loaded, !crew.isEmpty else { return "" }
        return Terms.staff(crew.count, session.tenant?.staffRole ?? "")
    }

    // ══════════════════════════ фишки ══════════════════════════

    /// Два факта о команде: сколько сейчас на площадке и сколько всем
    /// вместе должны. Оба — состояние, а не действие, поэтому фишками.
    private var chips: some View {
        FlowLayout(spacing: 8) {
            if onShiftCount > 0 {
                PillChip(
                    text: "\(onShiftCount) · \(L("staff.onShift"))",
                    ink: Brand.onLime,
                    fill: Brand.lime,
                    outlined: false
                )
            }
            if totalDue > 0 {
                PillChip(text: sentence(L("staff.due", money(totalDue, currency))))
            }
        }
    }

    /// Первая буква заглавная, остальное как есть.
    private func sentence(_ text: String) -> String {
        text.prefix(1).uppercased() + text.dropFirst()
    }

    // ══════════════════════════ люди ══════════════════════════

    /**
     * Люди плитками, а не строками.
     *
     * Строка отвечала колонками: имя слева, процент и долг справа, — и
     * человек в ней читался записью таблицы. На мойке людей двое-трое, и
     * список из двух строк выглядел недоделанным списком.
     *
     * Плитка начинается с самого человека: крупный кружок его цветом,
     * тем же, каким он подписан в ленте, на смене и в зарплатах. Ставка
     * под именем — это правило, за которым сюда и заходят; работа за
     * месяц строкой ниже.
     */
    private var grid: some View {
        LazyVGrid(
            columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)],
            spacing: 10
        ) {
            ForEach(crew) { person in
                Button { editing = person } label: { tile(person) }
                    .buttonStyle(.press)
                    .disabled(person.isMe)
            }
        }
    }

    private func tile(_ person: API.StaffMember) -> some View {
        let tone = Brand.personTone(person.name)
        let onShift = person.onShift == true

        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                ZStack(alignment: .bottomTrailing) {
                    Text(String(person.name.prefix(1)).uppercased())
                        .font(.system(size: 19, weight: .heavy, design: .rounded))
                        .foregroundStyle(.white)
                        .frame(width: 46, height: 46)
                        .background(tone.base, in: .circle)

                    /* Точка смены лаймом, а не зелёным: лайм в продукте
                       значит «здесь и сейчас», и это ровно оно. Кайма
                       цвета бумаги отделяет её от кружка. */
                    if onShift {
                        Circle()
                            .fill(Brand.lime)
                            .frame(width: 13, height: 13)
                            .overlay(Circle().strokeBorder(Brand.paper, lineWidth: 2.5))
                            .offset(x: 2, y: 2)
                            .accessibilityLabel(L("staff.onShift"))
                    }
                }

                Spacer(minLength: 0)

                if person.isMe {
                    Text(L("common.you"))
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(Brand.muted)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Brand.ink.opacity(0.06), in: .capsule)
                        .padding(.top, 4)
                }
            }

            Text(person.name)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(Brand.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .padding(.top, 12)

            Text("\(person.percent)% \(L("staff.perRecord"))")
                .font(.system(size: 12, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(Brand.grape)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .padding(.top, 2)

            Spacer(minLength: 10)

            Text(personNote(person))
                .font(.system(size: 11))
                .monospacedDigit()
                .foregroundStyle(Brand.muted)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 148, alignment: .topLeading)
        .paperCard(20)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
    }

    /// Нижняя строка плитки: работа за месяц, а если её нет — телефон.
    /// Пустая строка на месте работы читалась бы «данные не пришли».
    private func personNote(_ person: API.StaffMember) -> String {
        if let cars = person.cars, let earned = person.earned, cars > 0 {
            return "\(Terms.units(cars, session.tenant?.unitOne ?? "")) · \(money(earned, currency))"
        }
        return person.phone
    }

    // ══════════════════════════ правила ══════════════════════════

    /**
     * Правила оплаты и владелец — одной бумагой.
     *
     * Отдельно от людей, а не строками под ними: это не человек, а
     * устройство мойки. Вопрос у обеих строк общий — как здесь платят и
     * кто здесь главный.
     */
    private var rules: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(L("staff.rulesSection").uppercased())
                .font(.system(size: 11, weight: .black, design: .rounded))
                .tracking(1.3)
                .foregroundStyle(Brand.muted)
                .padding(.horizontal, 6)

            teamRow
                .paperCard(22)
        }
    }

    /**
     * Общий процент команды за совместную работу.
     *
     * Состояние стоит прямо на строке: свойство редкое, и открывать окно
     * только чтобы узнать, включено ли оно, — лишний путь на экране, куда
     * заходят за другим.
     */
    private var teamRow: some View {
        Button {
            teamOpen = true
        } label: {
            HStack(spacing: 14) {
                Image(systemName: "person.2.fill")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Brand.grape)
                    .frame(width: 42, height: 42)
                    .background(Brand.grapeFill.opacity(0.1), in: .circle)

                VStack(alignment: .leading, spacing: 2) {
                    Text(L("crew.title"))
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Brand.ink)
                    Text(L("crew.lead"))
                        .font(.system(size: 12))
                        .foregroundStyle(Brand.muted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }

                Spacer(minLength: 8)

                Text(session.teamPercent.map { "\($0)%" } ?? L("crew.off"))
                    .font(.system(size: 14, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(session.teamPercent == nil ? Brand.muted : Brand.ink)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, minHeight: 66, alignment: .leading)
            .contentShape(.rect)
        }
        .buttonStyle(.press)
    }

    // ══════════════════════════ пусто и кнопка ══════════════════════════

    private var staffEmpty: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: -10) {
                ForEach(Array([Brand.mintInk, Brand.grape, Brand.sandInk].enumerated()), id: \.offset) { _, tint in
                    Circle()
                        .fill(tint.opacity(0.85))
                        .frame(width: 40, height: 40)
                        .overlay(Circle().strokeBorder(Brand.paper, lineWidth: 2.5))
                }
            }
            Spacer(minLength: 10)
            Text(L("staff.empty"))
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(Brand.ink)
                .fixedSize(horizontal: false, vertical: true)
            Text(L("staff.emptyNote"))
                .font(.system(size: 13))
                .foregroundStyle(Brand.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(20)
        .frame(maxWidth: .infinity, minHeight: 190, alignment: .topLeading)
        .paperCard(26)
    }

    private var addButton: some View {
        Button(L("staff.add", Terms.staff(session.tenant?.staffRole ?? "").acc)) {
            adding = true
        }
        .buttonStyle(LimeButton())
        .shadow(color: Brand.lime.opacity(0.45), radius: 16, y: 8)
        .padding(.horizontal, 16)
        .padding(.bottom, 6)
    }

    private func reload() async {
        do {
            let result = try await session.authed { token in
                try await APIClient.shared.send("staff", token: token, as: API.Staff.self)
            }
            withAnimation(.snappy(duration: Motion.normal)) { staff = result.staff }
            failed = false
            failNote = nil
        } catch is CancellationError {
            // потянули вниз и отпустили: ничего не сломалось
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

    /// Фишки, люди и правила приходят по очереди.
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
 * Карточка сотрудника: заведение и правка.
 *
 * Процент набирается не с клавиатуры, а колесом из готовых ставок. На мойке
 * их три-четыре — 35, 40, 45, 50, — и цифровая клавиатура ради одного из
 * четырёх известных чисел это лишний экран поверх экрана. Своё значение
 * всё равно можно ввести: последняя фишка открывает поле.
 */
struct StaffEditor: View {
    let person: API.StaffMember?
    let onSave: () async -> Void

    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var phone = ""
    @State private var password = ""
    @State private var percent = 40
    @State private var custom = false
    @State private var customText = ""
    @State private var error: String?
    @State private var busy = false
    @State private var firing = false
    /// Развёрнута ли выдача нового кода и что в ней набрано.
    @State private var issuingPassword = false
    @State private var newPassword = ""
    /// Код выдан. Отдельно от `error`: та строка красная, и подтверждение
    /// в ней читалось бы отказом.
    @State private var passwordDone = false

    /// Куда сейчас смотрит клавиатура. Нужна, чтобы вести по форме
    /// сверху вниз одной кнопкой «дальше», а не тыкать в каждое поле.
    @FocusState private var focus: Slot?

    private enum Slot: Hashable { case name, phone, password }

    /// Ставки, которые встречаются на мойке. Остальное — вручную.
    private let common = [30, 35, 40, 45, 50]

    private var isNew: Bool { person == nil }

    private var ready: Bool {
        guard !busy, !name.trimmingCharacters(in: .whitespaces).isEmpty else { return false }
        if isNew {
            /* Цифры, а не длина строки. Считалась именно строка, и порог
               стоял в девять знаков — то есть местный армянский номер из
               восьми цифр («77123456») кнопку не включал вовсе, а тот же
               номер с нулём впереди включал. Сколько цифр в номере какой
               страны, знает сервер (`isValidPhone`), и последнее слово
               остаётся за ним; здесь только отсекается заведомо пустое. */
            return phoneDigits >= 8 && password.count >= API.passwordMinLength
        }
        return true
    }

    private var phoneDigits: Int { phone.filter(\.isNumber).count }

    var body: some View {
        NavigationStack {
        ScrollView {
            VStack(spacing: 10) {
                VStack(spacing: 0) {
                    /* Имя поля стоит В САМОМ поле, а не подписью над ним.
                       Подпись занимала строку, а под ней лежал пример —
                       «Давид», «+374 …», — и форма спрашивала дважды:
                       сначала чего от тебя хотят, потом как это выглядит.
                       Пример здесь ничего не объясняет: что писать в поле
                       «Имя», человек знает и без образца. */
                    field(L("owner.clientName"), text: $name, slot: .name, submit: isNew ? .next : .done) {
                        focus = isNew ? .phone : nil
                    }
                    if isNew {
                        divider
                        field(L("auth.phone"), text: $phone, slot: .phone, keyboard: .phonePad, submit: .next) {
                            focus = .password
                        }
                        divider
                        /* Пароль, а не шесть цифр.
                         *
                         * Поле принимало ровно шесть цифр, а сервер к
                         * тому времени уже требовал пароль от восьми
                         * знаков: найм не работал вовсе и отвечал общей
                         * ошибкой. Длина берётся из одного места на всё
                         * приложение — см. `API.passwordMinLength`.
                         *
                         * Открытым текстом намеренно: владелец
                         * придумывает пароль вслух, стоя рядом с
                         * работником, и должен видеть, что набрал. */
                        field(L("auth.staffPassword"), text: $password, slot: .password, submit: .done) {
                            focus = nil
                        }
                    }
                }
                .boardCard()

                /* Чем именно этот пароль является. Владелец в эту
                   минуту придумывает его вслух, стоя рядом с
                   работником, и должен понимать, что диктует постоянный
                   пароль, с которым тот будет входить каждое утро. */
                if isNew {
                    /* Длина пароля больше не живёт в подсказке поля:
                       подсказка исчезает с первой набранной буквой, ровно
                       когда о длине и вспоминают. Здесь она появляется,
                       только пока пароль короткий. */
                    Text(password.isEmpty || password.count >= API.passwordMinLength
                         ? L("auth.staffPasswordNote")
                         : L("auth.passwordHint"))
                        .font(.system(size: 12))
                        .foregroundStyle(password.isEmpty || password.count >= API.passwordMinLength
                                         ? Brand.boardMuted
                                         : Brand.warnOnBoard)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 4)
                }

                percentPicker

                if let error {
                    Text(error)
                        .font(.system(size: 13))
                        .foregroundStyle(Brand.badOnBoard)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 4)
                }

                if passwordDone {
                    Text(L("auth.staffPasswordIssued"))
                        .font(.system(size: 13))
                        .foregroundStyle(Brand.goodOnBoard)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 4)
                }

                /* Новый пароль сотруднику.

                   Забытый мойщиком пароль это тупик: почты у него нет,
                   восстановить самому нечем, и сменить его было нечем.
                   Оставалось
                   отключить человека и завести заново на другой номер,
                   потеряв связь с его историей записей и выплат.

                   Только сотруднику, и сервер откажет, если человек
                   работает не только здесь: назначенный тут код открыл бы
                   его второй бизнес. */
                if let person, !person.isMe, person.role != "owner" {
                    issuePasswordRow(person)
                    fireRow(person)
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
        .alert(L("staff.deactivateTitle"), isPresented: $firing) {
            Button(L("common.cancel"), role: .cancel) {}
            Button(L("staff.deactivate"), role: .destructive) {
                if let person { Task { await fire(person) } }
            }
        } message: {
            // это не косметика: увольнение гасит его сессии, и человек
            // теряет доступ немедленно
            Text(L("staff.deactivateNote"))
        }
        /* У нового человека клавиатура открыта сразу на имени: экран
           открыли, чтобы его завести, и первое поле известно. У правки
           нет — там смотрят на ставку, а не переписывают имя. */
        .task {
            guard isNew else { return }
            try? await Task.sleep(for: .milliseconds(360))
            focus = .name
        }
        .onAppear {
            name = person?.name ?? ""
            let p = person?.percent ?? 40
            percent = p
            if !common.contains(p) {
                custom = true
                customText = String(p)
            }
        }
        // системная скорлупа листа: заголовок по центру, текстовое «Закрыть»
        .navigationTitle(isNew ? L("staff.newTitle", Terms.staff(session.tenant?.staffRole ?? "").nom) : (person?.name ?? ""))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(L("common.close")) { dismiss() }.disabled(busy)
            }
        }
        }
    }

    private var divider: some View {
        Rectangle().fill(Brand.boardInk.opacity(0.07)).frame(height: 1)
    }

    /**
     * Поле формы: имя поля вместо подсказки, вся строка принимает касание.
     *
     * Кнопка клавиатуры ведёт к следующему полю, а на последнем закрывает
     * её: три поля подряд заполняют, стоя рядом с человеком, и тянуться
     * пальцем к каждому — лишнее движение в чужих руках.
     */
    private func field(
        _ placeholder: String,
        text: Binding<String>,
        slot: Slot,
        keyboard: UIKeyboardType = .default,
        submit: SubmitLabel = .next,
        onSubmit: @escaping () -> Void = {}
    ) -> some View {
        TextField(placeholder, text: text)
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(Brand.onBoard)
            .keyboardType(keyboard)
            .autocorrectionDisabled()
            .focused($focus, equals: slot)
            .submitLabel(submit)
            .onSubmit(onSubmit)
            .padding(.horizontal, 16)
            .frame(height: 58)
            .contentShape(.rect)
            .onTapGesture { focus = slot }
    }

    /**
     * Ставка — фишками.
     *
     * Выбранная заливается лаймом. Последняя фишка — «своё»: она открывает
     * поле, но не заменяет собой готовые значения, потому что в девяти
     * случаях из десяти ставка одна из этих четырёх.
     */
    private var percentPicker: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(L("staff.percentField"))
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Brand.boardMuted)

            Flow(spacing: 8) {
                ForEach(common, id: \.self) { value in
                    chip("\(value)%", on: !custom && percent == value) {
                        custom = false
                        percent = value
                    }
                }
                chip(L("common.other"), on: custom) {
                    custom = true
                    customText = String(percent)
                }
            }

            if custom {
                HStack(spacing: 8) {
                    TextField("40", text: $customText)
                        .keyboardType(.numberPad)
                        .font(.system(size: 17, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(Brand.onBoard)
                        .multilineTextAlignment(.leading)
                        .onChange(of: customText) { _, v in
                            // выше сотни ставка не бывает: работник не может
                            // забирать больше, чем стоит услуга
                            let n = min(100, Int(v.filter(\.isNumber)) ?? 0)
                            percent = n
                            if v != String(n) && !v.isEmpty { customText = String(n) }
                        }
                    Text("%")
                        .font(.system(size: 15))
                        .foregroundStyle(Brand.boardMuted)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 13)
                .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 18, style: .continuous))
            }

            Text(L("staff.percentNote"))
                .font(.system(size: 12))
                .foregroundStyle(Brand.boardMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .boardCard()
    }

    private func chip(_ title: String, on: Bool, run: @escaping () -> Void) -> some View {
        Button(action: run) {
            Text(title)
                .font(.system(size: 15, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(on ? Brand.onLime : Brand.onBoard)
                .padding(.horizontal, 15)
                .padding(.vertical, 10)
                .background(on ? Brand.lime : Brand.boardInk.opacity(0.07), in: .capsule)
        }
        .buttonStyle(.press)
        .accessibilityAddTraits(on ? [.isSelected] : [])
    }

    /**
     * Выдать новый пароль.
     *
     * Свёрнуто по умолчанию: пустое поле в карточке ничего не показывает
     * и ничего не спрашивает, а читается сломанным элементом. Поле
     * приходит по нажатию — тогда, когда владелец решил пароль менять.
     *
     * Пароль виден открытым, и это осознанно: владелец придумывает его
     * вслух, стоя рядом с работником, и должен видеть, что набрал.
     * Прятать звёздочками то, что он сам сейчас продиктует, значит
     * мешать без причины.
     */
    @ViewBuilder
    private func issuePasswordRow(_ person: API.StaffMember) -> some View {
        if issuingPassword {
            VStack(alignment: .leading, spacing: 10) {
                Text(L("settings.passwordIssue"))
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Brand.boardMuted)

                TextField(L("auth.passwordHint"), text: $newPassword)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(Brand.onBoard)
                    .padding(.horizontal, 14)
                    .frame(height: 52)
                    .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 18, style: .continuous))

                Text(L("settings.passwordIssueNote"))
                    .font(.system(size: 12))
                    .foregroundStyle(Brand.boardMuted)
                    .fixedSize(horizontal: false, vertical: true)

                HStack(spacing: 10) {
                    Button(L("common.save")) { Task { await issuePassword(person) } }
                        .buttonStyle(.glass)
                        .disabled(busy || newPassword.count < API.passwordMinLength)
                    Button(L("common.cancel")) {
                        issuingPassword = false
                        newPassword = ""
                    }
                    .buttonStyle(.glass)
                    .tint(Brand.muted)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .boardCard()
            .padding(.top, 14)
        } else {
            Button {
                issuingPassword = true
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: "lock.rotation")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Brand.grape)
                        .frame(width: 22)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(L("settings.passwordIssue"))
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Brand.onBoard)
                        Text(L("settings.passwordIssueNote"))
                            .font(.system(size: 12))
                            .foregroundStyle(Brand.boardMuted)
                            .fixedSize(horizontal: false, vertical: true)
                            .multilineTextAlignment(.leading)
                    }
                    Spacer(minLength: 0)
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .boardCard()
            }
            .buttonStyle(.press)
            .disabled(busy)
            .padding(.top, 14)
        }
    }

    private func fireRow(_ person: API.StaffMember) -> some View {
        Button {
            firing = true
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "person.badge.minus")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Brand.badOnBoard)
                    .frame(width: 22)
                VStack(alignment: .leading, spacing: 1) {
                    Text(L("staff.deactivateAction"))
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Brand.badOnBoard)
                    Text(L("staff.deactivateNote"))
                        .font(.system(size: 12))
                        .foregroundStyle(Brand.boardMuted)
                        .fixedSize(horizontal: false, vertical: true)
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .boardCard()
        }
        .buttonStyle(.press)
        .disabled(busy)
        .padding(.top, 14)
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

    private func save() async {
        busy = true
        defer { busy = false }
        error = nil

        do {
            _ = try await session.authed { token in
                if let person {
                    return try await APIClient.shared.raw(
                        "staff/\(person.id)",
                        method: "PATCH",
                        body: ["name": name, "percent": percent],
                        token: token
                    )
                }
                return try await APIClient.shared.raw(
                    "staff",
                    method: "POST",
                    body: [
                        "name": name,
                        "phone": phone,
                        "password": password,
                        "percent": percent,
                    ],
                    token: token
                )
            }
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            await onSave()
            dismiss()
        } catch let e as APIError {
            /* Отказ называется своим именем там, где человек может его
               исправить: номер занят, код слишком простой, номер не
               похож на номер. Общий «ошибка BAD_REQUEST» на форме, где
               три поля, не говорит, какое из них переписать. */
            switch (e.code, e.reason) {
            case ("PHONE_TAKEN", _): error = L("auth.phoneTaken")
            case (_, "PASSWORD_SHORT"): error = L("auth.passwordShort")
            case (_, "PASSWORD_COMMON"): error = L("auth.passwordCommon")
            case (_, "BAD_PHONE"): error = L("auth.wrongCredentials")
            case ("TOO_MANY_TRIES", _): error = L("auth.throttled")
            default:
                error = e.isOffline
                    ? L("errors.offline")
                    : L("errors.failedCode", e.code ?? "\(e.status)")
            }
        } catch {
            self.error = Failure.text(error)
        }
    }

    /**
     * Выдать сотруднику новый пароль.
     *
     * Экран не закрываем: владелец только что придумал пароль и сейчас
     * продиктует его человеку, а закрывшаяся карточка забрала бы его с
     * глаз. Вместо этого форма сворачивается, а на месте ошибки встаёт
     * подтверждение.
     */
    private func issuePassword(_ person: API.StaffMember) async {
        busy = true
        defer { busy = false }
        error = nil

        do {
            _ = try await session.authed { token in
                try await APIClient.shared.raw(
                    "staff/\(person.id)/pin",
                    method: "POST",
                    body: ["password": newPassword],
                    token: token
                )
            }
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            issuingPassword = false
            newPassword = ""
            passwordDone = true
            await onSave()
        } catch let e as APIError {
            switch (e.code, e.reason) {
            case (_, "WORKS_ELSEWHERE"): error = L("settings.passwordWorksElsewhere")
            case (_, "PASSWORD_SHORT"): error = L("auth.passwordShort")
            case (_, "PASSWORD_COMMON"): error = L("auth.passwordCommon")
            case ("FORBIDDEN", _): error = L("settings.passwordWorksElsewhere")
            default:
                error = e.isOffline
                    ? L("errors.offline")
                    : L("errors.failedCode", e.code ?? "\(e.status)")
            }
        } catch {
            self.error = L("payroll.failed")
        }
    }

    private func fire(_ person: API.StaffMember) async {
        busy = true
        defer { busy = false }

        /* Отказ остаётся на экране, а не закрывается как успех. Раньше
           здесь стоял `try?`: сеть падала, человек оставался с доступом,
           а лист закрывался так, будто всё прошло, — владелец узнавал об
           этом только со следующей смены уволенного. */
        do {
            _ = try await session.authed { token in
                try await APIClient.shared.raw("staff/\(person.id)", method: "DELETE", token: token)
            }
        } catch let e as APIError {
            error = e.isOffline ? L("errors.offline") : L("errors.failedCode", e.code ?? "\(e.status)")
            return
        } catch {
            self.error = L("payroll.failed")
            return
        }
        await onSave()
        dismiss()
    }
}

/**
 * Общий процент команды за совместную работу.
 *
 * ЧТО ЗДЕСЬ ГЛАВНОЕ. Не поле ввода, а пример под ним. Число «50» само по
 * себе двусмысленно ровно в том месте, где ошибка стоит дороже всего:
 * владелец, решивший, что ставит 50 % каждому из троих, поставит 17 и
 * будет платить втрое меньше, чем собирался; понявший наоборот — втрое
 * больше. Определение эту разницу объясняет, но определения пролистывают,
 * а пример с числами читают. Поэтому пример живой: он пересчитывается,
 * пока человек набирает процент, и показывает ровно то, что произойдёт.
 *
 * Пустое поле выключает свойство: мойщику совместная работа перестаёт
 * предлагаться. Ноль этого НЕ делает — ноль означает «мойте вместе,
 * доплаты нет», и это настоящий, хоть и редкий, выбор владельца.
 *
 * Считает всё `Crew` — тот же код, которым доли посчитает экран записи, и
 * то же правило, что на сервере. Своя формула здесь разошлась бы с
 * настоящей на первом же остатке от деления.
 */
struct TeamWashEditor: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss

    @State private var text = ""
    @State private var busy = false
    @State private var error: String?

    /// Числа примера. Круглые нарочно: пример объясняет правило, а не
    /// показывает случай из жизни.
    private let examplePrice = 10_000
    private let examplePeople = 2

    private var currency: String { session.tenant?.currency ?? "AMD" }

    /// Пусто — выключить свойство. Ноль — настоящий ноль.
    private var asked: Int? {
        let digits = text.filter(\.isNumber)
        guard !digits.isEmpty, let n = Int(digits) else { return nil }
        return min(100, n)
    }

    var body: some View {
        NavigationStack {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 10) {
                Text(L("crew.percentLabel"))
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Brand.boardMuted)

                HStack(spacing: 8) {
                    TextField(L("crew.off"), text: $text)
                        .keyboardType(.numberPad)
                        .font(.system(size: 17, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(Brand.onBoard)
                        .multilineTextAlignment(.leading)
                        .onChange(of: text) { _, v in
                            let clean = String(v.filter(\.isNumber).prefix(3))
                            let capped = Int(clean).map { String(min(100, $0)) } ?? clean
                            if capped != v { text = capped }
                        }
                    Text("%")
                        .font(.system(size: 15))
                        .foregroundStyle(Brand.boardMuted)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 13)
                .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 18, style: .continuous))

                Text(L("crew.percentHint"))
                    .font(.system(size: 12))
                    .foregroundStyle(Brand.boardMuted)
                    .fixedSize(horizontal: false, vertical: true)

                /* Что произойдёт после сохранения — до нажатия, числами.
                   Здесь и разрешается двусмысленность процента: видно, что
                   пятьдесят на двоих дают по четверти цены каждому. */
                Text(example)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(asked == nil ? Brand.boardMuted : Brand.goodOnBoard)
                    .fixedSize(horizontal: false, vertical: true)

                if let error {
                    Text(error)
                        .font(.system(size: 13))
                        .foregroundStyle(Brand.badOnBoard)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .boardCard()

            Spacer(minLength: 12)

            Button {
                Task { await save() }
            } label: {
                Text(L("common.save"))
            }
            .buttonStyle(LimeButton(loading: busy, busyTitle: L("common.saving")))
            .disabled(busy)
        }
        .padding(.horizontal, 16)
        .padding(.top, 6)
        .padding(.bottom, 10)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Brand.board.ignoresSafeArea())
        .onAppear { text = session.teamPercent.map(String.init) ?? "" }
        // системная скорлупа листа, как у всех редакторов
        .navigationTitle(L("crew.title"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(L("common.close")) { dismiss() }.disabled(busy)
            }
        }
        }
    }

    private var example: String {
        guard let percent = asked else { return L("crew.offNote") }
        let each = Crew.shares(price: examplePrice, percent: percent, people: examplePeople).first ?? 0
        return L(
            "crew.example",
            money(examplePrice, currency),
            percent,
            Terms.staff(examplePeople, session.tenant?.staffRole ?? ""),
            money(each, currency)
        )
    }

    private func save() async {
        busy = true
        error = nil
        defer { busy = false }

        do {
            _ = try await session.authed { token in
                try await APIClient.shared.raw(
                    "team",
                    method: "PUT",
                    /* Пусто и ноль — разные ответы, и `NSNull` отличает
                       первое от второго: «выключить» против «мойте вместе
                       бесплатно». */
                    body: ["percent": asked as Any? ?? NSNull()],
                    token: token
                )
            }
        } catch {
            self.error = L("errors.generic")
            return
        }

        /* Перечитываем bootstrap: от этого числа зависит, покажет ли экран
           записи выбор «кто мыл», и узнать об этом он должен сразу. */
        try? await session.loadBootstrap()
        dismiss()
    }
}
