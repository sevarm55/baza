import SwiftUI

/// Вход: телефон и четыре цифры.
///
/// Ошибка на неверный телефон и на неверный PIN одна и та же — так же,
/// как на сервере. Разные тексты превратили бы форму в способ узнать,
/// кто зарегистрирован.
struct LoginView: View {
    @EnvironmentObject private var session: Session
    @EnvironmentObject private var lock: BiometricLock

    @State private var phone = LoginView.prefilled("TETR_PHONE")
    @State private var pin = LoginView.prefilled("TETR_PIN")
    @State private var error: String?
    @State private var busy = false
    @State private var manual = false
    @FocusState private var focus: Field?
    @Environment(\.splashActive) private var splashActive

    private enum Field { case phone, pin }

    /**
     * Предзаполнение формы для проверки на локальном сервере.
     *
     * Только в отладочной сборке и только из переменных запуска — рядом с
     * `TETR_API`. Причина та же: без этого приложение проверяется лишь на
     * боевом сервере, то есть на живых клиентах. Поле кода это к тому же
     * `SecureField`, и вводить в него автоматикой нечем.
     *
     *     xcrun simctl launch <udid> com.sevarm.tetr \
     *       --setenv TETR_API http://localhost:3100/api/v1/ \
     *       --setenv TETR_PHONE 77000001 --setenv TETR_PIN 1111
     */
    private static func prefilled(_ key: String) -> String {
        #if DEBUG
        return ProcessInfo.processInfo.environment[key] ?? ""
        #else
        return ""
        #endif
    }

    var body: some View {
        ZStack {
            Brand.heroGradient.ignoresSafeArea()

            VStack(alignment: .leading, spacing: 0) {
                Spacer()

                Text("TETRIN")
                    .font(.system(size: 15, weight: .bold))
                    .tracking(4)
                    .foregroundStyle(Brand.lime)

                Text(session.rememberedAccount != nil && !manual ? "Կրկին բարև" : "Մուտք")
                    .font(.system(size: 40, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(.top, 10)

                if let account = session.rememberedAccount, !manual {
                    remembered(account)
                        .padding(.top, 34)
                } else {
                    manualForm
                        .padding(.top, 34)
                }

                Spacer()
                Spacer()
            }
            .padding(.horizontal, 24)
        }
        /* Курсор в поле телефона — но не раньше, чем уйдёт заставка:
           клавиатура рисуется системой поверх всего приложения и закрывала
           бы ролик снизу. Оба обработчика нужны: экран может появиться и
           до заставки, и после неё. */
        .onAppear {
            if session.rememberedAccount == nil { manual = true }
            if !splashActive && manual { focus = .phone }
        }
        .onChange(of: splashActive) { _, active in
            if !active && manual { focus = .phone }
        }
        // Экран стоит на грейпе, и он тёмный при любой теме телефона:
        // иначе строка состояния становится чёрной на тёмно-фиолетовом
        .preferredColorScheme(.dark)
    }

    private func remembered(_ account: RememberedAccount) -> some View {
        let tone = Brand.personTone(account.name)

        return VStack(spacing: 15) {
            Button {
                Task { await quickSubmit(account) }
            } label: {
                ZStack {
                    Circle()
                        .fill(tone.base)
                        .overlay {
                            Circle()
                                .strokeBorder(.white.opacity(0.22), lineWidth: 1)
                        }
                    Text(String(account.name.prefix(1)))
                        .font(.system(size: 34, weight: .bold))
                        .foregroundStyle(.white)
                }
                .frame(width: 92, height: 92)
                .shadow(color: tone.glow.opacity(0.28), radius: 24, y: 12)
                .scaleEffect(busy ? 0.96 : 1)
                .animation(.easeOut(duration: 0.14), value: busy)
            }
            .buttonStyle(.plain)
            .disabled(busy)
            .accessibilityLabel("Մուտք գործել որպես \(account.name)")

            VStack(spacing: 3) {
                Text(account.name)
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(.white)
                Text(account.tenant)
                    .font(.system(size: 13))
                    .foregroundStyle(.white.opacity(0.6))
            }

            if busy {
                TetrLoader(size: 22, tint: Brand.lime)
            } else {
                Text("Հպեք ավատարին՝ մուտք գործելու համար")
                    .font(.system(size: 12.5, weight: .medium))
                    .foregroundStyle(.white.opacity(0.55))
            }

            if let error {
                Text(error)
                    .font(.system(size: 13.5))
                    .foregroundStyle(Brand.lime)
                    .multilineTextAlignment(.center)
            }

            Button("Մուտք գործել այլ համարով") {
                withAnimation(.spring(response: 0.34, dampingFraction: 0.96)) {
                    manual = true
                }
                focus = .phone
            }
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(.white.opacity(0.72))
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity)
    }

    private var manualForm: some View {
        VStack(alignment: .leading, spacing: 0) {
            field(title: "Հեռախոս") {
                TextField("+374 77 123 456", text: $phone)
                    .keyboardType(.phonePad)
                    .textContentType(.telephoneNumber)
                    .focused($focus, equals: .phone)
                    /* Имена для VoiceOver и для UI-тестов — одни и те же.
                       Плейсхолдер озвучивать нечего: «+374 77 123 456»
                       читается как набор цифр, а не как «телефон». */
                    .accessibilityIdentifier("login.phone")
                    .accessibilityLabel("Հեռախոս")
            }

            field(title: "PIN կոդ · 4 նիշ") {
                SecureField("••••", text: $pin)
                    .keyboardType(.numberPad)
                    .focused($focus, equals: .pin)
                    .accessibilityIdentifier("login.pin")
                    .accessibilityLabel("PIN կոդ")
                    .onChange(of: pin) { _, value in
                        if value.count > 4 { pin = String(value.prefix(4)) }
                    }
            }
            .padding(.top, 16)

            if let error {
                Text(error)
                    .font(.system(size: 14))
                    .foregroundStyle(Brand.lime)
                    .padding(.top, 14)
            }

            Button("Մուտք գործել") {
                Task { await submit() }
            }
            .accessibilityIdentifier("login.submit")
            .buttonStyle(LimeButton(loading: busy))
            .disabled(busy || phone.isEmpty || pin.count < 4)
            .opacity(phone.isEmpty || pin.count < 4 ? 0.5 : 1)
            .padding(.top, 28)

            Text("Մուտքի տվյալները տալիս է բիզնեսի սեփականատերը")
                .font(.system(size: 13.5))
                .multilineTextAlignment(.center)
                .foregroundStyle(.white.opacity(0.6))
                .frame(maxWidth: .infinity)
                .padding(.top, 18)
        }
    }

    @ViewBuilder
    private func field<Content: View>(
        title: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 11, weight: .bold))
                .tracking(1.2)
                .textCase(.uppercase)
                .foregroundStyle(.white.opacity(0.6))

            content()
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(.white)
                .tint(Brand.lime)
                .padding(.horizontal, 16)
                .frame(height: 54)
                .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .strokeBorder(.white.opacity(0.16), lineWidth: 1)
                )
        }
    }

    private func submit() async {
        busy = true
        error = nil
        defer { busy = false }

        do {
            try await session.signIn(phone: phone, pin: pin)
        } catch let e as APIError {
            pin = ""
            error = message(for: e)
        } catch {
            self.error = "Չհաջողվեց։ Փորձեք կրկին։"
        }
    }

    private func quickSubmit(_ account: RememberedAccount) async {
        busy = true
        error = nil
        defer { busy = false }

        /* Face ID не сработал — это не повод молчать.
         *
         * Здесь стоял просто `return`: касание по аватару не давало ни
         * входа, ни строчки объяснения. Face ID отказывает буднично —
         * мокрое лицо, солнце в камеру, человек нажал «Отмена», код-пароль
         * не задан вовсе, — и мойщик оставался перед экраном, где
         * единственная большая кнопка ничего не делает. Догадаться, что
         * выход есть внизу, под словами «войти другим номером», нельзя:
         * ничто на это не указывает.
         *
         * Теперь отказ проверки открывает форму с PIN — тем же путём, что
         * и просроченный сохранённый вход. Пароль от телефона мойщик может
         * не знать, свой PIN знает всегда.
         */
        if lock.available {
            guard await lock.authenticate(reason: "Մուտք գործել որպես \(account.name)") else {
                phone = account.phone
                pin = ""
                error = "\(lock.kindName)-ը չհաստատվեց։ Մուտքագրեք PIN-ը։"
                withAnimation(.easeOut(duration: 0.2)) { manual = true }
                focus = .pin
                return
            }
        }

        do {
            try await session.resumeRemembered()
        } catch {
            phone = account.phone
            pin = ""
            self.error = "Պահված մուտքի ժամկետն ավարտվել է։ Մուտքագրեք PIN-ը։"
            withAnimation(.easeOut(duration: 0.2)) { manual = true }
            focus = .pin
        }
    }

    private func message(for error: APIError) -> String {
        if error.isOffline { return "Կապ չկա։" }
        switch error.code {
        case "TOO_MANY_TRIES":
            let minutes = max(1, (error.retryAfter ?? 60) / 60)
            return "Չափազանց շատ փորձեր։ Կրկնեք \(minutes) րոպեից։"
        case "WRONG_CREDENTIALS":
            return "Սխալ հեռախոս կամ PIN"
        default:
            return "Չհաջողվեց։ Փորձեք կրկին։"
        }
    }
}
