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

    var body: some View {
        ScrollView {
            VStack(spacing: gap) {
                ForEach(ordered) { person in
                    card(person)
                }

                addButton
            }
            .padding(.horizontal, 12)
            .padding(.top, 8)
            .padding(.bottom, 28)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.board.ignoresSafeArea())
        .sheet(item: $editing) { person in
            StaffEditor(person: person) { await reload() }
        }
        .sheet(isPresented: $adding) {
            StaffEditor(person: nil) { await reload() }
        }
        .task { await reload() }
        .refreshable { await reload() }
    }

    private func card(_ person: API.StaffMember) -> some View {
        let tone = Brand.personTone(person.name)
        let owner = person.role == "owner"

        return Button {
            // себя владелец не правит и не отключает — открывать редактор
            // незачем
            if !person.isMe { editing = person }
        } label: {
            HStack(spacing: 14) {
                Text(String(person.name.prefix(1)))
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(.white.opacity(0.22), in: .circle)

                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(person.name)
                            .font(.system(size: 17, weight: .bold))
                            .foregroundStyle(.white)
                            .lineLimit(1)
                        if person.isMe {
                            Text("դուք")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundStyle(.white.opacity(0.85))
                                .padding(.horizontal, 7)
                                .padding(.vertical, 2)
                                .background(.white.opacity(0.2), in: .capsule)
                        }
                        /* Стоит ли он на мойке прямо сейчас. Этого на
                           экране не было вовсе: «кто работает» узнавали
                           на сводке, а вернувшись сюда, уже не помнили.
                           Метка, а не зелёная точка: плитка сама цветная,
                           и точка на ней читалась бы украшением. */
                        if person.onShift == true {
                            Text("հերթափոխին")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 7)
                                .padding(.vertical, 2)
                                .background(.white.opacity(0.28), in: .capsule)
                        }
                    }
                    Text(person.phone)
                        .font(.system(size: 12))
                        .monospacedDigit()
                        .foregroundStyle(.white.opacity(0.72))

                    /* Что человек сделал за месяц. Без этого экран
                       отвечал «кто заведён» и молчал о том, ради чего
                       этих людей держат: за числами приходилось уходить
                       в сводку и в зарплаты. Месяц, а не день: за один
                       день «чего стоит человек» не видно. */
                    if let cars = person.cars, let earned = person.earned, cars > 0 {
                        Text("\(cars) \(session.tenant?.unitOne ?? "") · \(money(earned, session.tenant?.currency ?? "AMD"))")
                            .font(.system(size: 12, weight: .semibold))
                            .monospacedDigit()
                            .foregroundStyle(.white.opacity(0.9))
                            .padding(.top, 2)
                    }

                    /* Сколько ему сейчас должны. Считает лист зарплат —
                       тот же, которым живут сами зарплаты, — а называется
                       здесь потому, что вопрос «сколько я ему должен»
                       задают, глядя на человека, а не на ведомость. */
                    if let due = person.due, due > 0 {
                        Text("վճարելու է \(money(due, session.tenant?.currency ?? "AMD"))")
                            .font(.system(size: 12, weight: .semibold))
                            .monospacedDigit()
                            .foregroundStyle(.white.opacity(0.9))
                    }
                }

                Spacer(minLength: 8)

                /* Процент — крупно и с подписью. Владельцу вместо него
                   слово: у него ставка обычно нулевая, и «0 %» рядом с
                   именем читается как ошибка, а не как «долю не берёт». */
                if owner {
                    Text("Սեփականատեր")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.85))
                        .multilineTextAlignment(.trailing)
                } else {
                    VStack(alignment: .trailing, spacing: 0) {
                        Text("\(person.percent)%")
                            .font(.system(size: 24, weight: .bold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(.white)
                        Text("գրանցումից")
                            .font(.system(size: 10))
                            .foregroundStyle(.white.opacity(0.7))
                    }
                }
            }
            .tile(base: tone.base, glow: tone.glow, radius: 24, pad: 16)
        }
        .buttonStyle(.press)
        .disabled(person.isMe)
        .accessibilityElement(children: .combine)
    }

    /// Добавление — строкой в самом списке, а не плюсиком в панели.
    ///
    /// Плюсик в углу панели ищут глазами; строка стоит там, где список
    /// кончается, то есть ровно там, куда смотрит человек, не нашедший
    /// нужного имени.
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
                Text("Ավելացնել \(session.tenant?.staffRole ?? "աշխատակից")")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Brand.onBoard)
                Spacer(minLength: 0)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 24))
        }
        .buttonStyle(.press)
        .padding(.top, 4)
    }

    private func reload() async {
        let result: API.Staff? = try? await session.authed { token in
            try await APIClient.shared.send("staff", token: token, as: API.Staff.self)
        }
        if let result { staff = result.staff }
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

    /// Ставки, которые встречаются на мойке. Остальное — вручную.
    private let common = [30, 35, 40, 45, 50]

    private var isNew: Bool { person == nil }

    private var ready: Bool {
        guard !busy, !name.trimmingCharacters(in: .whitespaces).isEmpty else { return false }
        if isNew {
            return phone.count >= 9 && pin.count == 4
        }
        return true
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                header

                VStack(spacing: 0) {
                    field("Անուն", text: $name, placeholder: "Դավիթ")
                    if isNew {
                        divider
                        field("Հեռախոս", text: $phone, placeholder: "+374 …", keyboard: .phonePad)
                        divider
                        field("PIN · 4 նիշ", text: $pin, placeholder: "••••", keyboard: .numberPad)
                            .onChange(of: pin) { _, v in
                                if v.count > 4 { pin = String(v.prefix(4)) }
                            }
                    }
                }
                .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 22))

                percentPicker

                if let error {
                    Text(error)
                        .font(.system(size: 13))
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 4)
                }

                if let person, !person.isMe {
                    fireRow(person)
                }
            }
            .padding(.horizontal, 12)
            .padding(.top, 8)
            .padding(.bottom, 28)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.board.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) { saveBar }
        .alert("Անջատե՞լ աշխատակցին", isPresented: $firing) {
            Button("Չեղարկել", role: .cancel) {}
            Button("Անջատել", role: .destructive) {
                if let person { Task { await fire(person) } }
            }
        } message: {
            // это не косметика: увольнение гасит его сессии, и человек
            // теряет доступ немедленно
            Text("Մուտքը փակվում է անմիջապես։ Պատմությունը մնում է։")
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

            Text(isNew ? "Նոր \(session.tenant?.staffRole ?? "աշխատակից")" : (person?.name ?? ""))
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Brand.onBoard)
                .lineLimit(1)

            Spacer()

            Color.clear.frame(width: 38, height: 38)
        }
        .padding(.bottom, 6)
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
        HStack(spacing: 12) {
            Text(title)
                .font(.system(size: 14))
                .foregroundStyle(Brand.boardMuted)
            Spacer(minLength: 8)
            TextField(placeholder, text: text)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Brand.onBoard)
                .keyboardType(keyboard)
                .multilineTextAlignment(.trailing)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 15)
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
            Text("Տոկոս գրանցումից")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Brand.boardMuted)

            Flow(spacing: 8) {
                ForEach(common, id: \.self) { value in
                    chip("\(value)%", on: !custom && percent == value) {
                        custom = false
                        percent = value
                    }
                }
                chip("Այլ", on: custom) {
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
                        .multilineTextAlignment(.trailing)
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
                .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 18))
            }

            Text("Փոփոխությունը գործում է նոր գրանցումների համար։ Հները չեն վերահաշվարկվում։")
                .font(.system(size: 11.5))
                .foregroundStyle(Brand.boardMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 22))
    }

    private func chip(_ title: String, on: Bool, run: @escaping () -> Void) -> some View {
        Button(action: run) {
            Text(title)
                .font(.system(size: 14.5, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(on ? Brand.onLime : Brand.onBoard)
                .padding(.horizontal, 15)
                .padding(.vertical, 10)
                .background(on ? Brand.lime : Brand.boardInk.opacity(0.07), in: .capsule)
        }
        .buttonStyle(.press)
        .accessibilityAddTraits(on ? [.isSelected] : [])
    }

    private func fireRow(_ person: API.StaffMember) -> some View {
        Button {
            firing = true
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "person.badge.minus")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.red)
                    .frame(width: 22)
                VStack(alignment: .leading, spacing: 1) {
                    Text("Անջատել աշխատակցին")
                        .font(.system(size: 14.5, weight: .semibold))
                        .foregroundStyle(.red)
                    Text("Մուտքը փակվում է անմիջապես։ Պատմությունը մնում է։")
                        .font(.system(size: 11.5))
                        .foregroundStyle(Brand.boardMuted)
                        .fixedSize(horizontal: false, vertical: true)
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 22))
        }
        .buttonStyle(.press)
        .disabled(busy)
        .padding(.top, 14)
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
            error = e.code == "PHONE_TAKEN"
                ? "Այս համարն արդեն գրանցված է"
                : "Չհաջողվեց (\(e.code ?? "\(e.status)"))"
        } catch {
            self.error = "\(error)"
        }
    }

    private func fire(_ person: API.StaffMember) async {
        busy = true
        defer { busy = false }

        _ = try? await session.authed { token in
            try await APIClient.shared.raw("staff/\(person.id)", method: "DELETE", token: token)
        }
        await onSave()
        dismiss()
    }
}
