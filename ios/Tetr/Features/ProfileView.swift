import SwiftUI

/**
 * Профиль — то же табло: карточка человека наверху, дальше плитки.
 *
 * Появился потому, что «Ավելին» делал две несовместимые работы: держал
 * разделы, куда ходят работать, и переключатели, которые трогают раз в год.
 * Десять пунктов, где «Հաճախորդներ» стоит рядом с «Բացել Face ID-ով»,
 * читаются плохо — это разные вещи в одном ящике.
 *
 * И потому, что смены PIN до сих пор не было нигде. Механизм под неё был
 * построен с самого начала, а самой функции не существовало: PIN диктуют
 * работнику вслух, работника однажды увольняют, и закрыть доступ было
 * нечем.
 *
 * Форма заменена на карточки не ради вида. В системной `Form` кнопка
 * «Պահպանել» была строкой среди строк и терялась; здесь она появляется
 * только когда есть что сохранять, и появляется целой плашкой.
 */
struct ProfileView: View {
    @EnvironmentObject private var session: Session
    @EnvironmentObject private var lock: BiometricLock

    @State private var businessName = ""
    @State private var myName = ""
    @State private var saving = false
    @State private var saved = false

    @State private var changingPin = false
    @State private var notifyOrders = true
    @State private var deleting = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var isOwner: Bool { session.me?.isOwner == true }

    private let gap: CGFloat = 10

    var body: some View {
        ScrollView {
            VStack(spacing: gap) {
                card
                if let access = session.access { accessTile(access) }
                fields
                if changed || saved { saveRow }
                switches
                actions
            }
            .padding(.horizontal, 12)
            .padding(.top, 8)
            .padding(.bottom, 28)
            .animation(reduceMotion ? nil : .spring(response: 0.32, dampingFraction: 0.86), value: changed)
            .animation(.easeOut(duration: 0.2), value: saved)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.board.ignoresSafeArea())
        .sheet(isPresented: $changingPin) { PinChangeView() }
        .sheet(isPresented: $deleting) { DeleteBusinessView() }
        .task {
            businessName = session.tenant?.name ?? ""
            myName = session.me?.name ?? ""
            notifyOrders = session.me?.notifyOrders ?? true
        }
    }

    // ══════════════════════════ кто я ══════════════════════════

    /// Карточка человека цветом самого человека — тем же, каким его имя
    /// набрано в ленте и кружок на смене.
    private var card: some View {
        let name = session.me?.name ?? "—"
        let tone = Brand.personTone(name)

        return HStack(spacing: 14) {
            Text(String(name.prefix(1)))
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 56, height: 56)
                .background(.white.opacity(0.22), in: .circle)

            VStack(alignment: .leading, spacing: 2) {
                Text(name)
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Text(session.tenant?.name ?? "Tetrin")
                    .font(.system(size: 13))
                    .foregroundStyle(.white.opacity(0.75))
                    .lineLimit(1)
                // телефон не правится: это логин, и смена сломала бы вход
                Text(session.me?.phone ?? "—")
                    .font(.system(size: 12))
                    .monospacedDigit()
                    .foregroundStyle(.white.opacity(0.6))
            }
            Spacer(minLength: 0)
        }
        .tile(base: tone.base, glow: tone.glow, radius: 24, pad: 18)
        .accessibilityElement(children: .combine)
    }

    /**
     * Состояние доступа — плиткой, а не строкой в списке.
     *
     * Янтарной, когда срок подходит: это единственное на экране, из-за чего
     * приложение однажды перестанет работать, и оно не должно выглядеть как
     * ещё одна настройка.
     */
    private func accessTile(_ access: API.Access) -> some View {
        HStack(spacing: 12) {
            Image(systemName: access.warn ? "exclamationmark.circle.fill" : "checkmark.circle.fill")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(access.warn ? Tone.amber.ink : Brand.goodOnBoard)
            VStack(alignment: .leading, spacing: 1) {
                Text("Մուտք")
                    .font(.system(size: 11.5))
                    .foregroundStyle(access.warn ? Tone.amber.ink.opacity(0.72) : Brand.boardMuted)
                Text(Self.plan(access))
                    .font(.system(size: 14.5, weight: .semibold))
                    .foregroundStyle(access.warn ? Tone.amber.ink : Brand.onBoard)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
            Spacer(minLength: 0)
        }
        .modifier(AccessSkin(warn: access.warn))
    }

    // ══════════════════════════ поля ══════════════════════════

    private var fields: some View {
        VStack(spacing: 0) {
            if isOwner {
                field("Բիզնես", $businessName)
                Rectangle().fill(Brand.boardInk.opacity(0.07)).frame(height: 1)
            }
            field("Անուն", $myName)
        }
        .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 22))
    }

    private func field(_ title: String, _ value: Binding<String>) -> some View {
        HStack(spacing: 12) {
            Text(title)
                .font(.system(size: 14))
                .foregroundStyle(Brand.boardMuted)
            Spacer(minLength: 8)
            TextField("", text: value)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Brand.onBoard)
                .multilineTextAlignment(.trailing)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 15)
    }

    /// Кнопка сохранения есть только когда есть что сохранять. В системной
    /// форме она стояла строкой всегда — то есть большую часть времени
    /// предлагала действие, которое ничего не делает.
    private var saveRow: some View {
        Button {
            Task { await save() }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: saved && !changed ? "checkmark" : "arrow.down.to.line")
                    .font(.system(size: 13, weight: .bold))
                Text(saved && !changed ? "Պահպանված է" : "Պահպանել")
                    .font(.system(size: 15, weight: .bold))
            }
            .foregroundStyle(Brand.onLime)
            .loading(saving, tint: Brand.onLime, size: 20)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .background(Brand.lime, in: .rect(cornerRadius: 20))
        }
        .buttonStyle(.press)
        .disabled(saving || !changed)
        .opacity(changed || saving ? 1 : 0.6)
        .transition(.scale(scale: 0.96).combined(with: .opacity))
    }

    // ══════════════════════════ переключатели ══════════════════════════

    private var switches: some View {
        VStack(spacing: 0) {
            if isOwner {
                toggleRow(
                    "Ծանուցում ամեն մեքենայի մասին",
                    "Հերթափոխի բացման մասին ծանուցումը գալիս է միշտ",
                    isOn: Binding(get: { notifyOrders }, set: { on in
                        notifyOrders = on
                        Task { await saveNotify(on) }
                    })
                )
            }

            if isOwner {
                Rectangle().fill(Brand.boardInk.opacity(0.07)).frame(height: 1)
            }
            toggleRow(
                "Հիշել այս հաշիվը",
                "Դուրս գալուց հետո վերադարձեք ավատարով և սարքի հաստատմամբ",
                isOn: $session.rememberLogin
            )

            if lock.available {
                Rectangle().fill(Brand.boardInk.opacity(0.07)).frame(height: 1)
                toggleRow(
                    "Բացել \(lock.kindName)-ով",
                    "Հավելվածը կփակվի ամեն անգամ, երբ դուրս գաք դրանից",
                    isOn: $lock.enabled
                )
            }
        }
        .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 22))
    }

    private func toggleRow(_ title: String, _ note: String, isOn: Binding<Bool>) -> some View {
        Toggle(isOn: isOn) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 14.5, weight: .semibold))
                    .foregroundStyle(Brand.onBoard)
                Text(note)
                    .font(.system(size: 11.5))
                    .foregroundStyle(Brand.boardMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .tint(Brand.good)
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }

    // ══════════════════════════ действия ══════════════════════════

    private var actions: some View {
        VStack(spacing: gap) {
            action("Փոխել PIN-ը", "PIN-ը փոխելուց հետո մյուս հեռախոսներից ելքը փակվում է",
                   icon: "lock.rotation", danger: false) {
                changingPin = true
            }

            action("Դուրս գալ", "", icon: "power", danger: false) {
                Task { await session.signOut() }
            }

            if isOwner {
                /* Отдельно и в самом низу, с воздухом сверху: «выйти» и
                   «стереть всё» не должны стоять двумя соседними строчками,
                   где промах пальцем стоит бизнеса. */
                action("Ջնջել բիզնեսը", "Բոլոր տվյալները և աշխատակիցները ջնջվում են ընդմիշտ",
                       icon: "trash", danger: true) {
                    deleting = true
                }
                .padding(.top, 14)
            }
        }
        .padding(.top, 4)
    }

    private func action(
        _ title: String,
        _ note: String,
        icon: String,
        danger: Bool,
        run: @escaping () -> Void
    ) -> some View {
        Button(action: run) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(danger ? .red : Brand.grape)
                    .frame(width: 22)
                VStack(alignment: .leading, spacing: 1) {
                    Text(title)
                        .font(.system(size: 14.5, weight: .semibold))
                        .foregroundStyle(danger ? .red : Brand.onBoard)
                    if !note.isEmpty {
                        Text(note)
                            .font(.system(size: 11.5))
                            .foregroundStyle(Brand.boardMuted)
                            .fixedSize(horizontal: false, vertical: true)
                            .multilineTextAlignment(.leading)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 22))
        }
        .buttonStyle(.press)
    }

    // ══════════════════════════ данные ══════════════════════════

    private var changed: Bool {
        businessName != (session.tenant?.name ?? "") || myName != (session.me?.name ?? "")
    }

    private func save() async {
        saving = true
        defer { saving = false }
        saved = false

        try? await session.saveProfile(
            name: myName == (session.me?.name ?? "") ? nil : myName,
            businessName: isOwner && businessName != (session.tenant?.name ?? "")
                ? businessName : nil
        )
        saved = true
    }

    private func saveNotify(_ on: Bool) async {
        _ = try? await session.authed { token in
            try await APIClient.shared.raw(
                "push/settings",
                method: "POST",
                body: ["orders": on],
                token: token
            )
        }
    }

    /**
     * Состояние доступа — датой, а не обратным отсчётом.
     *
     * Было «Փորձնական · 6 օր»: слово «пробный» и тающий счётчик вместе
     * читаются как «скоро платить», то есть как начало платного пути внутри
     * приложения. Правила App Store (3.1.3f) разрешают держать оплату вне
     * приложения ровно при условии, что внутри нет ни покупки, ни
     * подталкивания к ней.
     *
     * Дата отвечает на тот же вопрос — до какого числа работает, — и
     * отвечает точнее: «6 дней» человек всё равно про себя переводит в
     * число. Пробный от оплаченного при этом не отличается никак, и это
     * честно: для того, кто пользуется, разницы и нет.
     */
    static func plan(_ a: API.Access) -> String {
        switch a.state {
        case "trial", "active":
            let until = Calendar.current.date(byAdding: .day, value: a.daysLeft, to: Date())
            guard let until else { return "Հասանելի է" }
            let f = DateFormatter()
            f.locale = Locale(identifier: "hy_AM")
            f.dateFormat = "d MMMM"
            return "Հասանելի է մինչև \(f.string(from: until))"
        case "expired": return "Ժամկետը լրացել է"
        default: return "Փակ է"
        }
    }
}

/// Плитка доступа: янтарная, когда срок подходит, и обычная утопленная,
/// когда всё в порядке. Вынесено в модификатор, потому что `tile(_:)` и
/// `background(_:in:)` дают разные типы и в тернарнике не сходятся.
private struct AccessSkin: ViewModifier {
    let warn: Bool

    func body(content: Content) -> some View {
        if warn {
            content.tile(.amber, radius: 22, pad: 16)
        } else {
            content
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 22))
        }
    }
}

/// Смена PIN.
///
/// Старый спрашивается обязательно: телефон может лежать разблокированным
/// на столе, и смена без подтверждения означала бы, что случайный человек
/// рядом отбирает аккаунт целиком.
struct PinChangeView: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss

    @State private var current = ""
    @State private var next = ""
    @State private var again = ""
    @State private var error: String?
    @State private var busy = false

    private var ready: Bool {
        current.count == 4 && next.count == 4 && next == again && !busy
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    pin("Ընթացիկ PIN", $current)
                    pin("Նոր PIN", $next)
                    pin("Կրկնել", $again)
                } footer: {
                    if !again.isEmpty && next != again {
                        Text("PIN-երը չեն համընկնում").foregroundStyle(.red)
                    }
                }

                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }

                Section {
                    Button("Փոխել") { Task { await change() } }
                        .loading(busy, tint: Brand.grape, size: 18)
                        .disabled(!ready)
                } footer: {
                    Text("Մյուս հեռախոսներից ելքը կփակվի։ Այս հեռախոսը կմնա բացված։")
                }
            }
            .navigationTitle("Փոխել PIN-ը")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Փակել") { dismiss() }.disabled(busy)
                }
            }
        }
    }

    private func pin(_ title: String, _ value: Binding<String>) -> some View {
        LabeledContent(title) {
            SecureField("••••", text: value)
                .keyboardType(.numberPad)
                .multilineTextAlignment(.trailing)
                .monospaced()
                .onChange(of: value.wrappedValue) { _, v in
                    if v.count > 4 { value.wrappedValue = String(v.prefix(4)) }
                }
        }
    }

    private func change() async {
        busy = true
        defer { busy = false }
        error = nil

        do {
            try await session.changePin(current: current, next: next)
            dismiss()
        } catch let e as APIError {
            current = ""
            switch e.code {
            case "WRONG_CREDENTIALS": error = "Ընթացիկ PIN-ը սխալ է"
            case "TOO_MANY_TRIES": error = "Չափազանց շատ փորձեր։ Սպասեք։"
            default: error = e.isOffline ? "Կապ չկա։" : "Չհաջողվեց։ Փորձեք կրկին։"
            }
        } catch {
            self.error = "Չհաջողվեց։ Փորձեք կրկին։"
        }
    }
}
