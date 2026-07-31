import SwiftUI

/// Профиль: кто я, какой бизнес, чем защищён вход.
///
/// Появился потому, что «Ավելին» делал две несовместимые работы: держал
/// разделы, куда ходят работать, и переключатели, которые трогают раз в
/// год. Десять пунктов, где «Հաճախորդներ» стоит рядом с «Բացել Face ID-ով»,
/// читаются плохо — это разные вещи в одном ящике.
///
/// И потому, что смены PIN до сих пор не было нигде. Механизм под неё был
/// построен с самого начала, а самой функции не существовало: PIN диктуют
/// работнику вслух, работника однажды увольняют, и закрыть доступ было
/// нечем.
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

    private var isOwner: Bool { session.me?.isOwner == true }

    var body: some View {
        Form {
            Section {
                if isOwner {
                    LabeledContent("Բիզնես") {
                        TextField("", text: $businessName)
                            .multilineTextAlignment(.trailing)
                    }
                }
                LabeledContent("Անուն") {
                    TextField("", text: $myName)
                        .multilineTextAlignment(.trailing)
                }
                LabeledContent("Հեռախոս") {
                    // не правится: телефон — это логин, и смена сломала бы вход
                    Text(session.me?.phone ?? "—")
                        .monospacedDigit()
                        .foregroundStyle(Brand.muted)
                }
            } footer: {
                if saved {
                    Text("Պահպանված է").foregroundStyle(Brand.good)
                }
            }

            Section {
                Button("Պահպանել") { Task { await save() } }
                    .disabled(saving || !changed)
            }

            Section {
                Button("Փոխել PIN-ը") { changingPin = true }
            } footer: {
                Text("PIN-ը փոխելուց հետո մյուս հեռախոսներից ելքը փակվում է։")
            }

            if let access = session.access {
                Section {
                    /* «Доступ», а не «подписка»: подписка — слово про
                       оплату, а оплаты внутри приложения нет и по правилам
                       App Store быть не должно. Человеку тут важен срок,
                       а не название договора. */
                    LabeledContent("Մուտք") {
                        Text(Self.plan(access))
                            .foregroundStyle(access.warn ? Brand.warn : Brand.good)
                    }
                }
            }

            if isOwner {
                Section {
                    Toggle("Ծանուցում ամեն մեքենայի մասին", isOn: $notifyOrders)
                        .onChange(of: notifyOrders) { _, on in
                            Task { await saveNotify(on) }
                        }
                } footer: {
                    Text("Հերթափոխի բացման մասին ծանուցումը գալիս է միշտ։")
                }
            }

            if lock.available {
                Section {
                    Toggle("Բացել \(lock.kindName)-ով", isOn: $lock.enabled)
                } footer: {
                    Text("Հավելվածը կփակվի ամեն անգամ, երբ դուրս գաք դրանից։")
                }
            }

            Section {
                Button("Դուրս գալ", role: .destructive) {
                    Task { await session.signOut() }
                }
            }

            if isOwner {
                /* Отдельной секцией в самом низу, а не рядом с выходом:
                   «выйти» и «стереть всё» не должны стоять двумя соседними
                   красными строчками, где промах пальцем стоит бизнеса. */
                Section {
                    Button("Ջնջել բիզնեսը", role: .destructive) { deleting = true }
                } footer: {
                    Text("Բոլոր տվյալները և աշխատակիցները ջնջվում են ընդմիշտ։")
                }
            }
        }
        .scrollContentBackground(.hidden)
        .screenBackground()
        .sheet(isPresented: $changingPin) { PinChangeView() }
        .sheet(isPresented: $deleting) { DeleteBusinessView() }
        .task {
            businessName = session.tenant?.name ?? ""
            myName = session.me?.name ?? ""
            notifyOrders = session.me?.notifyOrders ?? true
        }
    }

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
     * читаются как «скоро платить», то есть как начало платного пути
     * внутри приложения. Правила App Store (3.1.3f) разрешают держать
     * оплату вне приложения ровно при условии, что внутри нет ни покупки,
     * ни подталкивания к ней.
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
                    Button(busy ? "…" : "Փոխել") { Task { await change() } }
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
