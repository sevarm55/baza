import SwiftUI

/**
 * Вход.
 *
 * ДВЕРЕЙ ДВЕ, И ОНИ НЕ РАВНЫ. Главная — телефон и код из SMS: ею входят
 * владельцы, и ею же входит тот, кто забыл свой код. Вторая — телефон и
 * PIN: ею входят мойщики, которым аккаунт завёл владелец, и она остаётся,
 * когда SMS не идёт. Единственной дверью код из SMS делать нельзя:
 * оператор ложится, роуминг отваливается, а мойка в этот момент не должна
 * закрываться.
 *
 * Почему код из SMS главный, хотя SMS дороже и медленнее. До него у
 * владельца, заведшего мойку на сайте, PIN не появлялся вовсе: входит он
 * кодом, и в `pin_hash` у него стоит метка «кода нет». Приложение при
 * этом умело только PIN — то есть такой владелец не мог войти сюда
 * никогда и ничем. Не «неудобно», а «нельзя».
 *
 * Ответ на знакомый и незнакомый номер одинаковый, и это правило, а не
 * оформление: как только они различаются, форма превращается в справочник
 * зарегистрированных. Кто мы такому номеру, выясняется уже ПОСЛЕ кода, то
 * есть только для того, кто держит этот телефон в руках. Дальше человек
 * либо внутри, либо на экране с названием мойки — и это тот же разговор,
 * а не вторая дверь.
 *
 * ПРО ПРАВИЛА МАГАЗИНА. 3.1.3(f) разрешает бесплатное
 * приложение-компаньон к платному веб-сервису ровно при двух условиях:
 * внутри ничего не продаётся и наружу платить не зовут. Регистрация
 * покупкой не является и под запрет не подпадает. Прежний экран
 * регистрации нарушал правило не тем, что регистрировал, а тем, что
 * обещал «шесть дней бесплатно» — то есть начинал платный путь. Ни здесь,
 * ни на стене «срок вышел» нет ни цены, ни срока, ни ссылки на оплату, и
 * добавлять их сюда нельзя.
 */
struct LoginView: View {
    @EnvironmentObject private var session: Session
    @EnvironmentObject private var lock: BiometricLock

    @State private var phone = LoginView.prefilled("TETR_PHONE")
    @State private var pin = LoginView.prefilled("TETR_PIN")
    @State private var code = ""
    @State private var newPin = ""
    @State private var repeatPin = ""
    @State private var businessName = ""
    @State private var ownerName = ""

    @State private var stage: Stage = .sms
    @State private var error: String?
    @State private var busy = false
    /// Человек попросил другой аккаунт: сохранённый профиль больше не
    /// показываем до следующего запуска.
    @State private var manual = false

    @FocusState private var focus: Field?
    @Environment(\.splashActive) private var splashActive

    private enum Field { case phone, pin, code, newPin, repeatPin, businessName, ownerName }

    /// Что сейчас на экране.
    private enum Stage: Equatable {
        /// главная дверь: один телефон
        case sms
        /// вторая дверь: телефон и код
        case pin
        /// забыл код: телефон, чтобы выслать SMS
        case reset
        /// ждём шесть цифр
        case code(Waiting)
        /// код восстановления сошёлся, осталось придумать новый
        case newPin(ticket: String)
        /// номер свободен: осталось назвать мойку
        case name(ticket: String)
        /// код сменён, входить надо им
        case done
    }

    /// Заявка на код: чем подтверждать и зачем её заводили.
    private struct Waiting: Equatable {
        enum Purpose { case entry, stepUp, reset }
        let purpose: Purpose
        let id: String
        /// куда ушёл код — номер закрытый, как его прислал сервер
        let phone: String
        /// раньше этого момента повтор не сработает; правило держит сервер
        var resendAt: Date
    }

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
     *       --setenv TETR_PHONE 77000001 --setenv TETR_PIN 111111
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

                content
                    .padding(.top, 34)

                Spacer()
                Spacer()
            }
            .padding(.horizontal, 24)
        }
        /* Курсор в первое поле — но не раньше, чем уйдёт заставка:
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

    @ViewBuilder
    private var content: some View {
        switch stage {
        case .code(let waiting):
            codeForm(waiting)
        case .newPin(let ticket):
            newPinForm(ticket)
        case .name(let ticket):
            nameForm(ticket)
        case .done:
            resetDone
        case .reset:
            resetForm
        case .pin:
            pinForm
        case .sms:
            if let account = session.rememberedAccount, !manual {
                remembered(account)
            } else {
                smsForm
            }
        }
    }

    private var headline: String {
        switch stage {
        case .code(let waiting):
            return waiting.purpose == .stepUp ? L("auth.stepUpTitle") : L("auth.otpTitle")
        case .newPin: return L("auth.newPin")
        case .name: return L("auth.nameTitle")
        case .done: return L("auth.resetDone")
        case .reset: return L("auth.resetTitle")
        case .pin, .sms:
            if session.rememberedAccount != nil && !manual && stage == .sms {
                return L("auth.welcomeBack")
            }
            return L("auth.entryTitle")
        }
    }

    // ══════════════════════ сохранённый профиль ══════════════════════

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
            .accessibilityLabel(L("auth.signInAs", account.name))

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
                Text(L("auth.tapAvatarPhone"))
                    .font(.system(size: 12.5, weight: .medium))
                    .foregroundStyle(.white.opacity(0.55))
            }

            if let error {
                Text(error)
                    .font(.system(size: 13.5))
                    .foregroundStyle(Brand.lime)
                    .multilineTextAlignment(.center)
            }

            quiet(L("auth.anotherAccount")) {
                withAnimation(.spring(response: 0.34, dampingFraction: 0.96)) {
                    manual = true
                }
                focus = .phone
            }
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity)
    }

    // ══════════════════════ дверь первая: код ══════════════════════

    private var smsForm: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(L("auth.entrySub"))
                .font(.system(size: 14))
                .foregroundStyle(.white.opacity(0.7))
                .fixedSize(horizontal: false, vertical: true)

            phoneField.padding(.top, 20)

            errorLine

            Button(L("auth.entrySend")) {
                Task { await sendEntryCode() }
            }
            .accessibilityIdentifier("login.send")
            .buttonStyle(LimeButton(loading: busy))
            .disabled(busy || phone.isEmpty)
            .opacity(phone.isEmpty ? 0.5 : 1)
            .padding(.top, 28)

            /* Вторая дверь строкой, а не вкладкой: ею входят мойщики,
               которым аккаунт завёл владелец, и она же остаётся, когда
               SMS не идёт. Вкладки соврали бы о том, как продуктом
               пользуются. */
            quiet(L("auth.entryPinDoor")) {
                go(.pin)
                focus = .phone
            }
            .accessibilityIdentifier("login.pinDoor")
            .frame(maxWidth: .infinity)
            .padding(.top, 20)
        }
    }

    // ══════════════════════ дверь вторая: PIN ══════════════════════

    private var pinForm: some View {
        VStack(alignment: .leading, spacing: 0) {
            phoneField

            field(title: L("auth.pinField")) {
                SecureField("••••••", text: $pin)
                    .keyboardType(.numberPad)
                    .textContentType(.password)
                    .focused($focus, equals: .pin)
                    .accessibilityIdentifier("login.pin")
                    .accessibilityLabel(L("auth.pin"))
                    .onChange(of: pin) { _, value in
                        pin = digits(value, limit: API.pinLength)
                    }
            }
            .padding(.top, 16)

            errorLine

            Button(L("auth.signIn")) {
                Task { await submitPin() }
            }
            .accessibilityIdentifier("login.submit")
            .buttonStyle(LimeButton(loading: busy))
            /* Минимум четыре, а не шесть: столько цифр у всех, кто завёл
               аккаунт до перехода на шестизначный код. Требовать шесть
               значило бы запереть их снаружи. Длину НОВОГО кода проверяет
               сервер; здесь код только вводят. */
            .disabled(busy || phone.isEmpty || pin.count < API.pinMinLength)
            .opacity(phone.isEmpty || pin.count < API.pinMinLength ? 0.5 : 1)
            .padding(.top, 28)

            VStack(spacing: 14) {
                quiet(L("auth.forgotPin")) {
                    go(.reset)
                    focus = .phone
                }
                .accessibilityIdentifier("login.forgot")

                quiet(L("auth.entrySmsDoor")) {
                    go(.sms)
                    focus = .phone
                }
                .accessibilityIdentifier("login.smsDoor")
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 20)

            Text(L("auth.staffNote"))
                .font(.system(size: 13.5))
                .multilineTextAlignment(.center)
                .foregroundStyle(.white.opacity(0.6))
                .frame(maxWidth: .infinity)
                .padding(.top, 18)
        }
    }

    // ══════════════════════ забыл код ══════════════════════

    private var resetForm: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(L("auth.resetSub"))
                .font(.system(size: 14))
                .foregroundStyle(.white.opacity(0.7))
                .fixedSize(horizontal: false, vertical: true)

            phoneField.padding(.top, 20)

            errorLine

            Button(L("auth.resetSend")) {
                Task { await sendResetCode() }
            }
            .buttonStyle(LimeButton(loading: busy))
            .disabled(busy || phone.isEmpty)
            .opacity(phone.isEmpty ? 0.5 : 1)
            .padding(.top, 28)

            quiet(L("auth.backToSignIn")) {
                go(.pin)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 20)
        }
    }

    // ══════════════════════ шесть цифр ══════════════════════

    private func codeForm(_ waiting: Waiting) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(
                waiting.purpose == .stepUp
                    ? L("auth.stepUpSub", waiting.phone)
                    : L("auth.otpSent", waiting.phone)
            )
            .font(.system(size: 14))
            .foregroundStyle(.white.opacity(0.7))
            .fixedSize(horizontal: false, vertical: true)

            field(title: L("auth.otpCode")) {
                TextField("••••••", text: $code)
                    .keyboardType(.numberPad)
                    /* Ради этой строки всё и затевалось: iOS сама
                       предлагает код из только что пришедшей SMS, и
                       человеку не надо уходить в «Сообщения». */
                    .textContentType(.oneTimeCode)
                    .focused($focus, equals: .code)
                    .accessibilityIdentifier("login.code")
                    .accessibilityLabel(L("auth.otpCode"))
                    .onChange(of: code) { _, value in
                        code = digits(value, limit: API.codeLength)
                        // шесть цифр — отправляем сами, лишнее нажатие тут ни к чему
                        if code.count == API.codeLength { Task { await confirm(waiting) } }
                    }
            }
            .padding(.top, 20)

            errorLine

            Button(L("auth.otpVerify")) {
                Task { await confirm(waiting) }
            }
            .accessibilityIdentifier("login.confirm")
            .buttonStyle(LimeButton(loading: busy))
            .disabled(busy || code.count < API.codeLength)
            .opacity(code.count < API.codeLength ? 0.5 : 1)
            .padding(.top, 26)

            HStack(spacing: 18) {
                resendButton(waiting)
                quiet(L("common.back")) { backFromCode(waiting) }
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 18)
        }
    }

    /**
     * Повтор с обратным отсчётом.
     *
     * Отсчёт — подсказка человеку, а не правило: правило держит сервер
     * (45 → 90 → 180 секунд, не больше трёх повторов). Но без подсказки
     * кнопка выглядит рабочей и отвечает отказом, то есть продукт
     * предлагает нажать и ругается за нажатие.
     *
     * `TimelineView`, а не таймер в состоянии: секунда обязана тикать
     * сама, но будить весь экран ради подписи одной кнопки незачем.
     */
    private func resendButton(_ waiting: Waiting) -> some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let left = max(0, Int(waiting.resendAt.timeIntervalSince(context.date).rounded(.up)))
            Button {
                Task { await resend(waiting) }
            } label: {
                Text(left > 0 ? L("auth.otpResendIn", mmss(left)) : L("auth.otpResend"))
                    .font(.system(size: 13.5, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(.white.opacity(left > 0 ? 0.4 : 0.72))
            }
            .buttonStyle(.plain)
            .disabled(busy || left > 0)
        }
    }

    // ══════════════════════ новый код ══════════════════════

    private func newPinForm(_ ticket: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(L("auth.pinMemo"))
                .font(.system(size: 14))
                .foregroundStyle(.white.opacity(0.7))

            field(title: L("auth.newPin")) {
                SecureField("••••••", text: $newPin)
                    .keyboardType(.numberPad)
                    .textContentType(.newPassword)
                    .focused($focus, equals: .newPin)
                    .accessibilityLabel(L("auth.newPin"))
                    .onChange(of: newPin) { _, value in
                        newPin = digits(value, limit: API.pinLength)
                    }
            }
            .padding(.top, 20)

            /* Повтор сервер не спрашивает и знать о нём не должен: он
               проверяется здесь, до отправки. Причина в последствии —
               опечатка в единственном поле означала бы новый код,
               которого человек не знает, и вход только через ещё одну
               SMS. Второе поле стоит одного лишнего движения раз в год. */
            field(title: L("common.retry")) {
                SecureField("••••••", text: $repeatPin)
                    .keyboardType(.numberPad)
                    .textContentType(.newPassword)
                    .focused($focus, equals: .repeatPin)
                    .accessibilityLabel(L("common.retry"))
                    .onChange(of: repeatPin) { _, value in
                        repeatPin = digits(value, limit: API.pinLength)
                    }
            }
            .padding(.top, 14)

            if mismatch {
                Text(L("auth.pinMismatch"))
                    .font(.system(size: 14))
                    .foregroundStyle(Brand.lime)
                    .padding(.top, 14)
            } else {
                errorLine
            }

            Button(L("auth.resetSave")) {
                Task { await saveNewPin(ticket) }
            }
            .buttonStyle(LimeButton(loading: busy))
            .disabled(busy || newPin.count < API.pinLength || newPin != repeatPin)
            .opacity(newPin.count < API.pinLength || newPin != repeatPin ? 0.5 : 1)
            .padding(.top, 26)
        }
    }

    /// Расходятся ли уже набранные части. Пока повтор короче нового,
    /// молчим: ругаться на второй цифре из шести значит ругаться на
    /// человека, который ещё печатает.
    private var mismatch: Bool {
        !repeatPin.isEmpty && repeatPin.count >= newPin.count && newPin != repeatPin
    }

    // ══════════════════════ исходы ══════════════════════

    /**
     * Последний шаг новичка: как называется мойка и как зовут владельца.
     *
     * PIN здесь не спрашивается — входить он будет кодом. Два поля, и
     * это единственный экран, который человек видит один раз в жизни.
     *
     * Ни цены, ни срока, ни слова «бесплатно»: заводить аккаунт правила
     * магазина не запрещают, запрещают продавать внутри и звать платить
     * наружу (см. `completeSignUp`). Появится здесь обещание бесплатных
     * дней — нарушением станет оно, а не сама регистрация.
     */
    private func nameForm(_ ticket: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(L("auth.nameSub"))
                .font(.system(size: 14))
                .foregroundStyle(.white.opacity(0.7))
                .fixedSize(horizontal: false, vertical: true)

            field(title: L("onboarding.bizName")) {
                TextField(L("auth.namePlaceholder"), text: $businessName)
                    .textContentType(.organizationName)
                    .autocorrectionDisabled()
                    .focused($focus, equals: .businessName)
                    .accessibilityIdentifier("login.businessName")
                    .accessibilityLabel(L("onboarding.bizName"))
            }
            .padding(.top, 20)

            field(title: L("onboarding.ownerName")) {
                TextField(L("staff.namePlaceholder"), text: $ownerName)
                    .textContentType(.name)
                    .autocorrectionDisabled()
                    .focused($focus, equals: .ownerName)
                    .accessibilityIdentifier("login.ownerName")
                    .accessibilityLabel(L("onboarding.ownerName"))
            }
            .padding(.top, 14)

            errorLine

            Button(L("auth.nameCreate")) {
                Task { await createBusiness(ticket) }
            }
            .accessibilityIdentifier("login.create")
            .buttonStyle(LimeButton(loading: busy))
            .disabled(busy || !namesReady)
            .opacity(namesReady ? 1 : 0.5)
            .padding(.top, 26)
        }
    }

    /// Имя короче двух знаков сервер не примет — гасим кнопку здесь,
    /// чтобы отказ не приходил после нажатия.
    private var namesReady: Bool {
        businessName.trimmingCharacters(in: .whitespaces).count >= 2
            && ownerName.trimmingCharacters(in: .whitespaces).count >= 2
    }

    private var resetDone: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(L("auth.resetDoneNote"))
                .font(.system(size: 15))
                .foregroundStyle(.white.opacity(0.75))

            Button(L("auth.backToSignIn")) {
                pin = ""
                go(.pin)
                focus = .pin
            }
            .buttonStyle(LimeButton())
        }
    }

    // ══════════════════════ мелочи ══════════════════════

    private var phoneField: some View {
        field(title: L("auth.phone")) {
            TextField("+374 77 123 456", text: $phone)
                .keyboardType(.phonePad)
                .textContentType(.telephoneNumber)
                .focused($focus, equals: .phone)
                /* Имена для VoiceOver и для UI-тестов — одни и те же.
                   Плейсхолдер озвучивать нечего: «+374 77 123 456»
                   читается как набор цифр, а не как «телефон». */
                .accessibilityIdentifier("login.phone")
                .accessibilityLabel(L("auth.phone"))
        }
    }

    @ViewBuilder
    private var errorLine: some View {
        if let error {
            Text(error)
                .font(.system(size: 14))
                .foregroundStyle(Brand.lime)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 14)
        }
    }

    private func quiet(_ title: String, run: @escaping () -> Void) -> some View {
        Button(title, action: run)
            .font(.system(size: 13.5, weight: .semibold))
            .foregroundStyle(.white.opacity(0.72))
            .disabled(busy)
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

    /// Только цифры и не длиннее предела. Одно правило на все поля кода:
    /// раньше каждое поле обрезало себя само, и одно из них обрезало не
    /// на той длине.
    private func digits(_ raw: String, limit: Int) -> String {
        String(raw.filter(\.isNumber).prefix(limit))
    }

    private func mmss(_ total: Int) -> String {
        String(format: "%02d:%02d", total / 60, total % 60)
    }

    /// Сменить шаг, погасив то, что от прежнего осталось.
    private func go(_ next: Stage) {
        withAnimation(.spring(response: 0.34, dampingFraction: 0.96)) {
            stage = next
        }
        error = nil
        code = ""
        if next != .pin { pin = "" }
        newPin = ""
        repeatPin = ""
        /* Названия держим, пока человек на своём шаге: отказ сервера по
           одному из полей не должен стирать оба. */
        if case .name = next {} else {
            businessName = ""
            ownerName = ""
        }
    }

    private func backFromCode(_ waiting: Waiting) {
        /* Досдача кода после PIN возвращает к PIN, всё остальное — к
           началу своей двери. Возврат «куда-нибудь» заставил бы человека
           проходить сценарий заново из-за одного нажатия. */
        switch waiting.purpose {
        case .stepUp: go(.pin); focus = .pin
        case .entry: go(.sms); focus = .phone
        case .reset: go(.reset); focus = .phone
        }
    }

    // ══════════════════════ запросы ══════════════════════

    private func sendEntryCode() async {
        await run {
            let started = try await session.beginEntry(phone: phone)
            go(.code(Waiting(
                purpose: .entry,
                id: started.challengeId,
                phone: started.phone ?? "",
                resendAt: started.resendAt
            )))
            focus = .code
        }
    }

    private func sendResetCode() async {
        await run {
            let started = try await session.beginPinReset(phone: phone)
            go(.code(Waiting(
                purpose: .reset,
                id: started.challengeId,
                phone: started.phone ?? "",
                resendAt: started.resendAt
            )))
            focus = .code
        }
    }

    private func submitPin() async {
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
                go(.code(Waiting(
                    purpose: .stepUp,
                    id: id,
                    phone: e.maskedPhone ?? "",
                    /* Сервер прислал заявку, но не сказал, когда можно
                       повторить: у входа поле не предусмотрено. Берём
                       первую паузу — ту же, что стоит на сервере. */
                    resendAt: Date().addingTimeInterval(45)
                )))
                focus = .code
                return
            }
            pin = ""
            error = message(for: e)
        } catch {
            self.error = L("payroll.failed")
        }
    }

    private func confirm(_ waiting: Waiting) async {
        guard !busy, code.count == API.codeLength else { return }
        busy = true
        error = nil
        defer { busy = false }

        do {
            switch waiting.purpose {
            case .stepUp:
                try await session.completeStepUp(challengeId: waiting.id, code: code)
            case .entry:
                /* Пропуск означает, что номер свободен: аккаунта под него
                   нет, и осталось спросить название мойки. Пусто —
                   человек уже внутри. */
                if let ticket = try await session.completeEntry(challengeId: waiting.id, code: code) {
                    go(.name(ticket: ticket))
                    focus = .businessName
                }
            case .reset:
                let ticket = try await session.checkResetCode(challengeId: waiting.id, code: code)
                go(.newPin(ticket: ticket))
                focus = .newPin
            }
        } catch let e as APIError {
            code = ""
            error = message(for: e)
            /* Заявка сгорела — возвращаем к началу: другого честного
               пути отсюда нет, код нужен новый. */
            if e.code == "OTP_EXPIRED" || e.code == "OTP_TOO_MANY" {
                let text = error
                backFromCode(waiting)
                error = text
            }
        } catch {
            self.error = L("payroll.failed")
        }
    }

    private func saveNewPin(_ ticket: String) async {
        await run {
            try await session.completePinReset(ticket: ticket, pin: newPin)
            go(.done)
        }
    }

    /// Завести мойку. Успех сам сменит экран: `session.state` станет
    /// `.signedIn`, и корневой вид покажет продукт вместо входа.
    private func createBusiness(_ ticket: String) async {
        await run {
            try await session.completeSignUp(
                ticket: ticket,
                businessName: businessName.trimmingCharacters(in: .whitespaces),
                ownerName: ownerName.trimmingCharacters(in: .whitespaces)
            )
        }
    }

    private func resend(_ waiting: Waiting) async {
        busy = true
        error = nil
        defer { busy = false }

        do {
            let again = try await session.resendCode(challengeId: waiting.id)
            /* Новая заявка приходит со своим идентификатором: у старой
               код уже погашен, и подтверждать её нечем. */
            stage = .code(Waiting(
                purpose: waiting.purpose,
                id: again.challengeId,
                phone: waiting.phone,
                resendAt: again.resendAt
            ))
            code = ""
            focus = .code
        } catch let e as APIError {
            error = message(for: e)
        } catch {
            self.error = L("payroll.failed")
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
         * единственная большая кнопка ничего не делает.
         *
         * Теперь отказ проверки открывает форму с PIN — тем же путём, что
         * и просроченный сохранённый вход. Пароль от телефона мойщик может
         * не знать, свой PIN знает всегда.
         */
        if lock.available {
            guard await lock.authenticate(reason: L("auth.signInAs", account.name)) else {
                fallBackToManual(account, why: L("lock.failed", lock.kindName))
                return
            }
        }

        do {
            try await session.resumeRemembered()
        } catch {
            fallBackToManual(account, why: L("auth.rememberedExpiredPin"))
        }
    }

    /// Сохранённый вход не сработал: открываем форму с уже подставленным
    /// номером. Дверь при этом PIN-овая — человек, у которого сохранён
    /// вход, свой код знает, и лишняя SMS ему ни к чему.
    private func fallBackToManual(_ account: RememberedAccount, why: String) {
        phone = account.phone
        pin = ""
        withAnimation(.easeOut(duration: 0.2)) {
            manual = true
            stage = .pin
        }
        error = why
        focus = .pin
    }

    /// Общая обвязка запроса: занятость, гашение прежней ошибки, разбор.
    private func run(_ work: () async throws -> Void) async {
        busy = true
        error = nil
        defer { busy = false }

        do {
            try await work()
        } catch let e as APIError {
            error = message(for: e)
        } catch {
            self.error = L("payroll.failed")
        }
    }

    private func message(for error: APIError) -> String {
        if error.isOffline { return L("errors.offline") }
        switch error.code {
        case "TOO_MANY_TRIES":
            let minutes = max(1, (error.retryAfter ?? 60) / 60)
            return Ln("auth.tooManyTries", minutes)
        case "WRONG_CREDENTIALS":
            return L("auth.wrongCredentials")
        case "OTP_INVALID":
            return L("auth.otpInvalid")
        case "OTP_EXPIRED":
            return L("auth.otpExpired")
        case "OTP_TOO_MANY":
            return L("auth.otpTooMany")
        case "SMS_FAILED":
            return L("auth.smsFailed")
        case "PIN_WEAK":
            /* Сервер различает «мало цифр» и «слишком очевидный», и
               человеку это надо сказать: он в этот момент придумывает
               код, и общий ответ заставляет его гадать. */
            return error.reason == "TRIVIAL_PIN" ? L("auth.pinTrivial") : L("auth.pinMemo")
        default:
            return L("payroll.failed")
        }
    }
}
