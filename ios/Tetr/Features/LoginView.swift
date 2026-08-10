import SwiftUI

/// Вход: телефон и четыре цифры.
///
/// Ошибка на неверный телефон и на неверный PIN одна и та же — так же,
/// как на сервере. Разные тексты превратили бы форму в способ узнать,
/// кто зарегистрирован.
struct LoginView: View {
    @EnvironmentObject private var session: Session

    @State private var phone = LoginView.prefilled("TETR_PHONE")
    @State private var pin = LoginView.prefilled("TETR_PIN")
    @State private var error: String?
    @State private var busy = false
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

                Text("Մուտք")
                    .font(.system(size: 40, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(.top, 10)

                field(title: "Հեռախոս") {
                    TextField("+374 77 123 456", text: $phone)
                        .keyboardType(.phonePad)
                        .textContentType(.telephoneNumber)
                        .focused($focus, equals: .phone)
                }
                .padding(.top, 34)

                field(title: "PIN կոդ · 4 նիշ") {
                    SecureField("••••", text: $pin)
                        .keyboardType(.numberPad)
                        .focused($focus, equals: .pin)
                        .onChange(of: pin) { value in
                            // четыре цифры и не больше: лишнее ввести
                            // нельзя, а не «можно, но потом ошибка»
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
                .buttonStyle(LimeButton(loading: busy))
                .disabled(busy || phone.isEmpty || pin.count < 4)
                .opacity(phone.isEmpty || pin.count < 4 ? 0.5 : 1)
                .padding(.top, 28)

                /* Заводить бизнес отсюда больше нельзя, и это не про
                   удобство, а про правила App Store.

                   Приложение раздаётся бесплатно, а сервис оплачивается вне
                   его. Apple такое разрешает (3.1.3f) при условии, что
                   внутри нет ни покупки, ни намёка на оплату снаружи.
                   Самостоятельная регистрация с пробным сроком — это ровно
                   начало платного пути, и держать её внутри значит спорить
                   с этим условием на пустом месте.

                   Экран при этом не должен быть тупиком: строка объясняет,
                   откуда берётся вход. Без ссылки и без цен — по той же
                   причине. */
                Text("Մուտքի տվյալները տալիս է բիզնեսի սեփականատերը")
                    .font(.system(size: 13.5))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.white.opacity(0.6))
                    .frame(maxWidth: .infinity)
                    .padding(.top, 18)

                Spacer()
                Spacer()
            }
            .padding(.horizontal, 24)
        }
        /* Курсор в поле телефона — но не раньше, чем уйдёт заставка:
           клавиатура рисуется системой поверх всего приложения и закрывала
           бы ролик снизу. Оба обработчика нужны: экран может появиться и
           до заставки, и после неё. */
        .onAppear { if !splashActive { focus = .phone } }
        .onChange(of: splashActive) { _, active in
            if !active { focus = .phone }
        }
        // Экран стоит на грейпе, и он тёмный при любой теме телефона:
        // иначе строка состояния становится чёрной на тёмно-фиолетовом
        .preferredColorScheme(.dark)
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
