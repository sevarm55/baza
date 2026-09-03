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
    /// Выбранная композиция. ВРЕМЕННО: пять видов на выбор владельца,
    /// после выбора остаётся один и `StaffScreenStyles.swift` уходит.
    /**
     * Почему список пуст.
     *
     * Пусто и «не доехало» — разные ответы. Список людей, который не
     * привезли, до сих пор выглядел как мойка без сотрудников, и
     * владелец шёл заводить их заново.
     */
    @State private var failed = false
    @State private var failNote: String?

    private let gap: CGFloat = 10

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

    /* Кто моет и кто владеет — разные списки.
     *
     * Раньше владелец стоял в общем ряду последней строкой, и это читалось
     * как работник, у которого почему-то нет ни ставки, ни смены, ни
     * заработка: три пустоты подряд там, где у соседей числа. Метка «вы»
     * положение не спасала, потому что глаз сравнивает столбцы, а не
     * читает подписи. Теперь коробки разные, и сравнивать нечего.
     */
    private var crew: [API.StaffMember] { ordered.filter { $0.role != "owner" } }
    private var owners: [API.StaffMember] { ordered.filter { $0.role == "owner" } }

    var body: some View {
        /* Стеклянные плиты живут в общем контейнере: он даёт системе
           видеть их как одну группу и правильно считать преломление на
           границах, когда список прокручивается под ними.

           Две плиты, а не три и не десять. Люди — однородный список, и
           каждому по стеклу превратило бы экран в мозаику; правило
           оплаты и владелец — другая порода вещи, и им своя плита. */
        GlassEffectContainer(spacing: 22) {
            ScrollView {
                VStack(spacing: 22) {
                    crewSection
                    rulesSection
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 28)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.board.ignoresSafeArea())
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
        .refreshable { await reload() }
    }

    // ══════════════════ экран команды ══════════════════

    private var currency: String { session.tenant?.currency ?? "AMD" }
    private var totalDue: Int { crew.compactMap(\.due).reduce(0, +) }
    private var onShiftCount: Int { crew.filter { $0.onShift == true }.count }

    /**
     * Люди: одна стеклянная плита, внутри строки.
     *
     * Стекло здесь нативное, то самое, которым система рисует панели на
     * iOS 26. Оно даёт списку глубину, которой не даёт плоская белая
     * заливка: под ним видно полотно, и плита читается лежащей НА экране,
     * а не нарисованной в нём.
     *
     * Плита одна на группу, а не карточка на человека: люди — однородный
     * список, и десять отдельных стёкол превратили бы его в мозаику.
     * Внутри строки разделены волосяной чертой с отступом под кружок —
     * так глаз ведёт по именам, а не спотыкается о линии во всю ширину.
     */
    private var crewSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHead(
                Terms.staff(session.tenant?.staffRole ?? "").many,
                note: loaded && totalDue > 0 ? money(totalDue, currency) : nil
            )

            VStack(spacing: 0) {
                crewContent

                ForEach(Array(crew.enumerated()), id: \.element.id) { index, person in
                    if index > 0 { hairline }
                    personRow(person)
                }
            }
            .glassEffect(.regular, in: .rect(cornerRadius: 26, style: .continuous))
        }
    }

    /**
     * Правила и владелец: вторая плита.
     *
     * Отдельной плитой, а не строками под людьми: это не человек, а
     * устройство мойки. Одна плита на обе строки, потому что вопрос у
     * них общий — как здесь платят и кто здесь главный.
     */
    private var rulesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHead(L("staff.rulesSection"), note: nil)

            VStack(spacing: 0) {
                teamRow

                if loaded, !owners.isEmpty {
                    ForEach(owners) { person in
                        hairline
                        personRow(person)
                    }
                }
            }
            .glassEffect(.regular, in: .rect(cornerRadius: 26, style: .continuous))
        }
    }

    /// Подпись группы: слово слева, при нужде число справа. Тихая, серым.
    private func sectionHead(_ title: String, note: String?) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Brand.boardMuted)
            Spacer(minLength: 8)
            if let note {
                Text(note)
                    .font(.system(size: 13, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, 8)
    }

    /// Волосяная черта с отступом под кружок: линия во всю ширину режет
    /// список на куски, а с отступом ведёт взгляд по именам.
    private var hairline: some View {
        Rectangle()
            .fill(Brand.boardInk.opacity(0.08))
            .frame(height: 0.7)
            .padding(.leading, 68)
    }

    @ViewBuilder
    private var crewContent: some View {
        if !loaded {
            Delayed(active: true) { TetrScreenLoader(height: 180) }
        } else if failed, staff.isEmpty {
            TetrFailure(title: L("common.loadFailed"), note: failNote, retry: { await reload() })
        } else if crew.isEmpty {
            staffEmpty
        }
    }

    /**
     * Строка человека.
     *
     * Слева кружок с буквой и зелёной точкой смены, в середине имя и
     * работа за месяц, справа доля и долг. Владельцу вместо доли слово:
     * у него она обычно нулевая, и «0 %» рядом с именем читается ошибкой,
     * а не «долю не берёт».
     *
     * Сумма к выдаче — единственное, что набрано жирным и округлым: это
     * ответ на вопрос, с которым сюда приходят.
     */
    private func personRow(_ person: API.StaffMember) -> some View {
        let owner = person.role == "owner"

        return Button {
            if !person.isMe { editing = person }
        } label: {
            HStack(spacing: 14) {
                ZStack(alignment: .bottomTrailing) {
                    Text(String(person.name.prefix(1)))
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 42, height: 42)
                        .background(Brand.personTone(person.name).base, in: .circle)

                    if person.onShift == true {
                        Circle()
                            .fill(Brand.goodOnBoard)
                            .frame(width: 12, height: 12)
                            .overlay(Circle().strokeBorder(Brand.board, lineWidth: 2.5))
                            .offset(x: 2, y: 2)
                            .accessibilityLabel(L("staff.onShift"))
                    }
                }

                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(person.name)
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(Brand.onBoard)
                            .lineLimit(1)

                        if person.isMe {
                            Text(L("common.you"))
                                .font(.system(size: 10, weight: .bold))
                                .foregroundStyle(Brand.boardMuted)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 6, style: .continuous))
                        }
                    }

                    Text(personNote(person))
                        .font(.system(size: 12))
                        .monospacedDigit()
                        .foregroundStyle(Brand.boardMuted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)
                }

                Spacer(minLength: 8)

                VStack(alignment: .trailing, spacing: 2) {
                    if owner {
                        Text(L("roles.owner"))
                            .font(.system(size: 13))
                            .foregroundStyle(Brand.boardMuted)
                    } else {
                        Text("\(person.percent)%")
                            .font(.system(size: 15, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(Brand.boardMuted)

                        if let due = person.due, due > 0 {
                            Text(money(due, currency))
                                .font(.system(size: 19, weight: .bold, design: .rounded))
                                .monospacedDigit()
                                .foregroundStyle(Brand.onBoard)
                                .lineLimit(1)
                                .minimumScaleFactor(0.7)
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 13)
            .frame(maxWidth: .infinity, minHeight: 70, alignment: .leading)
            .contentShape(.rect)
        }
        .buttonStyle(.press)
        .disabled(person.isMe)
        .accessibilityElement(children: .combine)
    }

    /// Вторая строка человека: работа за месяц, а если её нет — телефон.
    /// Пустая строка на месте работы читалась бы «данные не пришли».
    private func personNote(_ person: API.StaffMember) -> String {
        if let cars = person.cars, let earned = person.earned, cars > 0 {
            return "\(Terms.units(cars, session.tenant?.unitOne ?? "")) · \(money(earned, currency))"
        }
        return person.phone
    }

    private var staffEmpty: some View {
        VStack(spacing: 12) {
            HStack(spacing: -9) {
                ForEach(Array([Tone.teal, Tone.violet, Tone.rose].enumerated()), id: \.offset) { index, tone in
                    Circle()
                        .fill(tone.base)
                        .frame(width: 42, height: 42)
                        .overlay {
                            Image(systemName: index == 1 ? "plus" : "person.fill")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(.white.opacity(index == 1 ? 1 : 0.84))
                        }
                        .overlay(Circle().strokeBorder(Brand.boardSurface, lineWidth: 3))
                }
            }

            Text(L("staff.add", Terms.staff(session.tenant?.staffRole ?? "").acc))
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Brand.onBoard)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 25)
    }

    /// Добавление — последней строкой того же списка, а не отдельной
    /// плашкой под ним.
    ///
    /// Плюсик в углу панели ищут глазами; строка стоит там, где список
    /// кончается, то есть ровно там, куда смотрит человек, не нашедший
    /// нужного имени.
    /**
     * «Добавить мойщика» — прижата ко дну, над панелью вкладок.
     *
     * Раньше это была последняя строка в коробке людей, и до неё
     * приходилось долистывать: у мойки с шестью мойщиками кнопка
     * оказывалась за краем экрана. Теперь она на одном месте всегда, и
     * рука находит её не глядя — тем же движением, что «+ машину» на
     * смене.
     *
     * Подложка цветом полотна, а не материалом: материал серый и на
     * тёмной теме читался бы отдельной плитой. Сверху короткий градиент,
     * чтобы список уходил под кнопку, а не обрывался под ней ножом.
     */
    private var addButton: some View {
        Button(L("staff.add", Terms.staff(session.tenant?.staffRole ?? "").acc)) {
            adding = true
        }
        .buttonStyle(LimeButton())
        .padding(.horizontal, 16)
        .padding(.top, 18)
        .padding(.bottom, 8)
        .background {
            VStack(spacing: 0) {
                LinearGradient(
                    colors: [Brand.board.opacity(0), Brand.board],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(height: 20)

                Brand.board
            }
            .ignoresSafeArea(edges: .bottom)
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
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Brand.grape)
                    .frame(width: 42, height: 42)
                    .background(Brand.grape.opacity(0.10), in: .circle)

                VStack(alignment: .leading, spacing: 2) {
                    Text(L("crew.title"))
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Brand.onBoard)
                    Text(L("crew.lead"))
                        .font(.system(size: 12))
                        .foregroundStyle(Brand.boardMuted)
                        .lineLimit(1)
                }

                Spacer(minLength: 8)

                Text(session.teamPercent.map { "\($0)%" } ?? L("crew.off"))
                    .font(.system(size: 14, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(session.teamPercent == nil ? Brand.boardMuted : Brand.onBoard)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, minHeight: 66, alignment: .leading)
            .contentShape(.rect)
        }
        .buttonStyle(.press)
    }

    private func reload() async {
        do {
            let result = try await session.authed { token in
                try await APIClient.shared.send("staff", token: token, as: API.Staff.self)
            }
            staff = result.staff
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
    @State private var pin = ""
    @State private var percent = 40
    @State private var custom = false
    @State private var customText = ""
    @State private var error: String?
    @State private var busy = false
    @State private var firing = false
    /// Развёрнута ли выдача нового кода и что в ней набрано.
    @State private var resettingPin = false
    @State private var newPin = ""
    /// Код выдан. Отдельно от `error`: та строка красная, и подтверждение
    /// в ней читалось бы отказом.
    @State private var pinDone = false

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
            return phoneDigits >= 8 && pin.count == API.pinLength
        }
        return true
    }

    private var phoneDigits: Int { phone.filter(\.isNumber).count }

    var body: some View {
        NavigationStack {
        ScrollView {
            VStack(spacing: 10) {
                VStack(spacing: 0) {
                    field(L("owner.clientName"), text: $name, placeholder: L("staff.namePlaceholder"))
                    if isNew {
                        divider
                        field(L("auth.phone"), text: $phone, placeholder: "+374 …", keyboard: .phonePad)
                        divider
                        /* Шесть цифр, а не четыре.
                         *
                         * Стояло четыре, и найм не работал НИКОГДА:
                         * сервер требует ровно `PIN_LENGTH` (шесть) и
                         * отвечал отказом на каждую попытку. Со стороны
                         * это выглядело как «сервер сломался», потому что
                         * форма отправляла заведомо негодный код и сама
                         * об этом не знала. Длина берётся из одного места
                         * на всё приложение — см. `API.pinLength`. */
                        field(L("auth.staffAccessCode"), text: $pin, placeholder: "••••••", keyboard: .numberPad)
                            .onChange(of: pin) { _, v in
                                let clean = String(v.filter(\.isNumber).prefix(API.pinLength))
                                if clean != v { pin = clean }
                            }
                    }
                }
                .boardCard()

                /* Чем именно этот код является. Владелец в эту минуту
                   придумывает его вслух, стоя рядом с работником, и
                   должен понимать, что диктует не одноразовый код из
                   сообщения, а постоянный, с которым тот будет входить
                   каждое утро. */
                if isNew {
                    Text(L("auth.staffAccessCodeNote"))
                        .font(.system(size: 12))
                        .foregroundStyle(Brand.boardMuted)
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

                if pinDone {
                    Text(L("settings.pinResetDone"))
                        .font(.system(size: 13))
                        .foregroundStyle(Brand.goodOnBoard)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 4)
                }

                /* Новый код сотруднику.

                   Забытый мойщиком код был тупиком: восстановить по SMS он
                   не может — номер ему заводил владелец, и подтверждённым
                   тот не стал, — а сменить его было нечем. Оставалось
                   отключить человека и завести заново на другой номер,
                   потеряв связь с его историей записей и выплат.

                   Только сотруднику, и сервер откажет, если человек
                   работает не только здесь: назначенный тут код открыл бы
                   его второй бизнес. */
                if let person, !person.isMe, person.role != "owner" {
                    resetPinRow(person)
                    fireRow(person)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 28)
        }
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

    private func field(
        _ title: String,
        text: Binding<String>,
        placeholder: String,
        keyboard: UIKeyboardType = .default
    ) -> some View {
        FieldBox(title) {
            TextField(placeholder, text: text)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Brand.onBoard)
                .keyboardType(keyboard)
        }
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
     * Выдать новый код.
     *
     * Свёрнуто по умолчанию: пустой ряд клеток в карточке ничего не
     * показывает и ничего не спрашивает, а читается сломанным элементом.
     * Клетки приходят по нажатию — тогда, когда владелец решил код менять.
     *
     * Код виден открытым, и это осознанно: владелец придумывает его вслух,
     * стоя рядом с работником, и должен видеть, что набрал. Прятать
     * звёздочками то, что он сам сейчас продиктует, значит мешать без
     * причины.
     */
    @ViewBuilder
    private func resetPinRow(_ person: API.StaffMember) -> some View {
        if resettingPin {
            VStack(alignment: .leading, spacing: 10) {
                Text(L("settings.pinReset"))
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Brand.boardMuted)

                TextField("••••••", text: $newPin)
                    .keyboardType(.numberPad)
                    .font(.system(size: 20, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Brand.onBoard)
                    .padding(.horizontal, 14)
                    .frame(height: 52)
                    .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 18, style: .continuous))
                    .onChange(of: newPin) { _, v in
                        let clean = String(v.filter(\.isNumber).prefix(API.pinLength))
                        if clean != v { newPin = clean }
                    }

                Text(L("settings.pinResetNote"))
                    .font(.system(size: 12))
                    .foregroundStyle(Brand.boardMuted)
                    .fixedSize(horizontal: false, vertical: true)

                HStack(spacing: 10) {
                    Button(L("common.save")) { Task { await resetPin(person) } }
                        .buttonStyle(.glass)
                        .disabled(busy || newPin.count != API.pinLength)
                    Button(L("common.cancel")) {
                        resettingPin = false
                        newPin = ""
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
                resettingPin = true
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: "lock.rotation")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Brand.grape)
                        .frame(width: 22)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(L("settings.pinReset"))
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Brand.onBoard)
                        Text(L("settings.pinResetNote"))
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
                        "pin": pin,
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
            case (_, "TRIVIAL_PIN"), (_, "BAD_PIN"): error = L("auth.pinTrivial")
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
     * Выдать сотруднику новый код.
     *
     * Экран не закрываем: владелец только что придумал код и сейчас
     * продиктует его человеку, а закрывшаяся карточка забрала бы его с
     * глаз. Вместо этого форма сворачивается, а на месте ошибки встаёт
     * подтверждение.
     */
    private func resetPin(_ person: API.StaffMember) async {
        busy = true
        defer { busy = false }
        error = nil

        do {
            _ = try await session.authed { token in
                try await APIClient.shared.raw(
                    "staff/\(person.id)/pin",
                    method: "POST",
                    body: ["pin": newPin],
                    token: token
                )
            }
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            resettingPin = false
            newPin = ""
            pinDone = true
            await onSave()
        } catch let e as APIError {
            switch (e.code, e.reason) {
            case (_, "WORKS_ELSEWHERE"): error = L("settings.pinWorksElsewhere")
            case ("PIN_WEAK", _): error = L("auth.pinTrivial")
            case ("FORBIDDEN", _): error = L("settings.pinWorksElsewhere")
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
