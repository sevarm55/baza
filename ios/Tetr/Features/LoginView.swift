import SwiftUI

/// Вход: телефон и шесть цифр.
///
/// Ошибка на неверный телефон и на неверный PIN одна и та же — так же,
/// как на сервере. Разные тексты превратили бы форму в способ узнать,
/// кто зарегистрирован.
///
/// Второй шаг — код из SMS — появляется не всегда, а только когда
/// сервер отвечает `STEP_UP_REQUIRED`: вход с незнакомого устройства
/// или после серии неудачных попыток. В обычный день его нет, и это
/// главное: SMS на каждый вход — не безопасность, а налог, который
/// владелец мойки платит каждое утро.
struct LoginView: View {
    @EnvironmentObject private var session: Session
    @EnvironmentObject private var lock: BiometricLock

    @State private var phone = LoginView.prefilled("TETR_PHONE")
    @State private var pin = LoginView.prefilled("TETR_PIN")
    @State private var error: String?
    @State private var busy = false
    @State private var manual = false

    /// Заявка на код из SMS. Не nil — значит показываем второй шаг.
    @State private var stepUp: StepUp?
    @State private var code = ""

    @FocusState private var focus: Field?
    @Environment(\.splashActive) private var splashActive

    private enum Field { case phone, pin, code }

    /// Что известно про ожидаемый код: чем подтверждать и куда он ушёл.
    private struct StepUp: Equatable {
        let id: String
        let phone: String
    }

    private static let pinLength = 6
    private static let codeLength = 6

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

                Text(headline)
                    .font(.system(size: 40, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(.top, 10)

                if let waiting = stepUp {
                    codeForm(waiting)
                        .padding(.top, 34)
                } else if let account = session.rememberedAccount, !manual {
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

    private var headline: String {
        if stepUp != nil { return "Ստուգում" }
        return session.rememberedAccount != nil && !manual ? "Կրկին բարև" : "Մուտք"
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

            field(title: "PIN կոդ · 6 նիշ") {
                SecureField("••••••", text: $pin)
                    .keyboardType(.numberPad)
                    .textContentType(.password)
                    .focused($focus, equals: .pin)
                    .accessibilityIdentifier("login.pin")
                    .accessibilityLabel("PIN կոդ")
                    .onChange(of: pin) { _, value in
                        let digits = value.filter(\.isNumber)
                        if digits != value || digits.count > Self.pinLength {
                            pin = String(digits.prefix(Self.pinLength))
                        }
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
            /* Четыре, а не шесть: столько цифр у всех, кто завёл
               аккаунт до перехода на шестизначный код. Требовать шесть
               значило бы запереть их снаружи. Длину нового кода
               проверяет сервер — здесь код только вводят. */
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

    /// Второй шаг: код из SMS. Появляется только по требованию сервера.
    private func codeForm(_ waiting: StepUp) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Մուտքն անծանոթ սարքից է։ Կոդն ուղարկեցինք \(waiting.phone)")
                .font(.system(size: 14))
                .foregroundStyle(.white.opacity(0.7))
                .fixedSize(horizontal: false, vertical: true)

            field(title: "SMS-ի կոդը") {
                TextField("••••••", text: $code)
                    .keyboardType(.numberPad)
                    /* Ради этой строки всё и затевалось: iOS сама
                       предлагает код из только что пришедшей SMS, и
                       человеку не надо уходить в «Сообщения». */
                    .textContentType(.oneTimeCode)
                    .focused($focus, equals: .code)
                    .accessibilityIdentifier("login.code")
                    .accessibilityLabel("SMS-ի կոդը")
                    .onChange(of: code) { _, value in
                        let digits = value.filter(\.isNumber)
                        if digits != value || digits.count > Self.codeLength {
                            code = String(digits.prefix(Self.codeLength))
                        }
                        // шесть цифр — отправляем сами, лишнее нажатие тут ни к чему
                        if code.count == Self.codeLength { Task { await confirm(waiting) } }
                    }
            }
            .padding(.top, 20)

            if let error {
                Text(error)
                    .font(.system(size: 14))
                    .foregroundStyle(Brand.lime)
                    .padding(.top, 14)
            }

            Button("Հաստատել") {
                Task { await confirm(waiting) }
            }
            .accessibilityIdentifier("login.confirm")
            .buttonStyle(LimeButton(loading: busy))
            .disabled(busy || code.count < Self.codeLength)
            .opacity(code.count < Self.codeLength ? 0.5 : 1)
            .padding(.top, 26)

            HStack(spacing: 18) {
                Button("Ուղարկել կրկին") {
                    Task { await resend(waiting) }
                }
                .disabled(busy)

                Button("Հետ") {
                    stepUp = nil
                    code = ""
                    error = nil
                    pin = ""
                    focus = .pin
                }
            }
            .font(.system(size: 13.5, weight: .semibold))
            .foregroundStyle(.white.opacity(0.72))
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
            /* Не отказ, а второй шаг: код подошёл, устройство сервер
               видит впервые. Экран меняется, а не показывает ошибку —
               человек всё сделал правильно. */
            if e.code == "STEP_UP_REQUIRED", let id = e.challengeId {
                withAnimation(.spring(response: 0.34, dampingFraction: 0.96)) {
                    stepUp = StepUp(id: id, phone: e.maskedPhone ?? "")
                }
                code = ""
                focus = .code
                return
            }
            pin = ""
            error = message(for: e)
        } catch {
            self.error = "Չհաջողվեց։ Փորձեք կրկին։"
        }
    }

    private func confirm(_ waiting: StepUp) async {
        guard !busy, code.count == Self.codeLength else { return }
        busy = true
        error = nil
        defer { busy = false }

        do {
            try await session.completeStepUp(challengeId: waiting.id, code: code)
        } catch let e as APIError {
            code = ""
            error = message(for: e)
            /* Заявка сгорела — возвращаем к телефону и коду: другого
               честного пути отсюда нет. */
            if e.code == "OTP_EXPIRED" || e.code == "OTP_TOO_MANY" {
                stepUp = nil
                pin = ""
                focus = .pin
            }
        } catch {
            self.error = "Չհաջողվեց։ Փորձեք կրկին։"
        }
    }

    private func resend(_ waiting: StepUp) async {
        busy = true
        error = nil
        defer { busy = false }

        do {
            try await session.resendCode(challengeId: waiting.id)
        } catch let e as APIError {
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
        case "OTP_INVALID":
            return "Կոդը սխալ է"
        case "OTP_EXPIRED":
            return "Կոդի ժամկետն անցել է։ Խնդրեք նորը։"
        case "OTP_TOO_MANY":
            return "Չափազանց շատ փորձեր։ Խնդրեք նոր կոդ։"
        case "SMS_FAILED":
            return "Չհաջողվեց ուղարկել SMS։ Փորձեք քիչ անց։"
        default:
            return "Չհաջողվեց։ Փորձեք կրկին։"
        }
    }
}
