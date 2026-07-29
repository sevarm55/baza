import SwiftUI

/// Вход: телефон и четыре цифры.
///
/// Ошибка на неверный телефон и на неверный PIN одна и та же — так же,
/// как на сервере. Разные тексты превратили бы форму в способ узнать,
/// кто зарегистрирован.
struct LoginView: View {
    @EnvironmentObject private var session: Session

    @State private var phone = ""
    @State private var pin = ""
    @State private var error: String?
    @State private var busy = false
    @State private var registering = false
    @FocusState private var focus: Field?

    private enum Field { case phone, pin }

    var body: some View {
        ZStack {
            Brand.heroGradient.ignoresSafeArea()

            VStack(alignment: .leading, spacing: 0) {
                Spacer()

                Text("Տետր")
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

                Button(busy ? "…" : "Մուտք գործել") {
                    Task { await submit() }
                }
                .buttonStyle(LimeButton())
                .disabled(busy || phone.isEmpty || pin.count < 4)
                .opacity(phone.isEmpty || pin.count < 4 ? 0.5 : 1)
                .padding(.top, 28)

                /* Экран входа не должен быть тупиком: у пришедшего впервые
                   аккаунта ещё нет. Ровно та же оговорка стоит в окне
                   входа на сайте — и по той же причине. */
                Button("Ստեղծել բիզնես") { registering = true }
                    .font(.system(size: 14.5, weight: .semibold))
                    .foregroundStyle(Brand.lime)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 18)

                Spacer()
                Spacer()
            }
            .padding(.horizontal, 24)
        }
        .onAppear { focus = .phone }
        .fullScreenCover(isPresented: $registering) {
            RegisterView()
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
