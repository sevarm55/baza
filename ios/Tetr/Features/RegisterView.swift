import SwiftUI

/// Регистрация бизнеса с телефона.
///
/// Существует потому, что без неё приложение — тупик: человек скачал его,
/// открыл и упёрся в экран входа, а завести аккаунт негде. Владелец мойки
/// при этом вполне может не иметь компьютера вовсе.
///
/// Ниша выбирается первой и один раз: от неё зависят все слова в продукте —
/// «мойщик» или «врач», «машина» или «приём». Приложение про ниши не знает
/// ничего, список приходит с сервера.
struct RegisterView: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss

    @State private var niches: [API.Niche] = []
    @State private var picked: API.Niche?

    @State private var businessName = ""
    @State private var ownerName = ""
    @State private var phone = ""
    @State private var pin = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            ZStack {
                Brand.heroGradient.ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        if picked == nil {
                            nichePicker
                        } else {
                            form
                        }
                    }
                    .padding(.horizontal, 24)
                    .padding(.top, 20)
                    .padding(.bottom, 40)
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(picked == nil ? "Փակել" : "Հետ") {
                        if picked == nil { dismiss() } else { picked = nil }
                    }
                    .foregroundStyle(Brand.lime)
                }
            }
            .toolbarBackground(.hidden, for: .navigationBar)
        }
        .preferredColorScheme(.dark)
        .task { await loadNiches() }
    }

    private var nichePicker: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Ընտրեք ձեր բիզնեսի տեսակը")
                .font(.system(size: 28, weight: .bold))
                .foregroundStyle(.white)
                .padding(.bottom, 6)

            ForEach(niches) { niche in
                Button {
                    picked = niche
                    businessName = niche.defaultName
                } label: {
                    HStack(spacing: 14) {
                        /* Ширина фиксирована: значки разной ширины —
                           ножницы узкие, машина широкая, — и без рамки
                           названия ниш разъехались бы по строкам. */
                        Image(systemName: niche.glyph)
                            .font(.system(size: 22))
                            .foregroundStyle(Brand.lime)
                            .frame(width: 32)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(niche.name)
                                .font(.system(size: 17, weight: .semibold))
                                .foregroundStyle(.white)
                            Text(niche.tag)
                                .font(.system(size: 12.5))
                                .foregroundStyle(Color.white.opacity(0.65))
                                .multilineTextAlignment(.leading)
                        }
                        Spacer()
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity)
                    .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 16))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .strokeBorder(.white.opacity(0.16), lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(picked?.name ?? "")
                .font(.system(size: 11.5, weight: .bold))
                .tracking(1.4)
                .textCase(.uppercase)
                .foregroundStyle(Brand.lime)

            Text("Ստեղծել բիզնես")
                .font(.system(size: 28, weight: .bold))
                .foregroundStyle(.white)
                .padding(.bottom, 4)

            field("Բիզնեսի անվանումը") {
                TextField("", text: $businessName)
            }
            field("Ձեր անունը") {
                TextField("", text: $ownerName).textContentType(.name)
            }
            field("Հեռախոս") {
                TextField("+374 77 123 456", text: $phone)
                    .keyboardType(.phonePad)
                    .textContentType(.telephoneNumber)
            }
            field("PIN կոդ · 4 նիշ") {
                SecureField("••••", text: $pin)
                    .keyboardType(.numberPad)
                    .onChange(of: pin) { v in if v.count > 4 { pin = String(v.prefix(4)) } }
            }

            if let error {
                Text(error)
                    .font(.system(size: 14))
                    .foregroundStyle(Brand.lime)
            }

            Button(busy ? "…" : "Ստեղծել և սկսել") {
                Task { await submit() }
            }
            .buttonStyle(LimeButton())
            .disabled(busy || !filled)
            .opacity(filled ? 1 : 0.5)
            .padding(.top, 6)

            Text("Առաջին 6 օրը՝ անվճար։ Քարտ պետք չէ։")
                .font(.system(size: 12.5))
                .foregroundStyle(Color.white.opacity(0.6))
                .frame(maxWidth: .infinity, alignment: .center)
        }
    }

    private var filled: Bool {
        businessName.count >= 2 && ownerName.count >= 2 && !phone.isEmpty && pin.count == 4
    }

    @ViewBuilder
    private func field<Content: View>(
        _ title: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(title)
                .font(.system(size: 11, weight: .bold))
                .tracking(1.1)
                .textCase(.uppercase)
                .foregroundStyle(.white.opacity(0.6))

            content()
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(.white)
                .tint(Brand.lime)
                .padding(.horizontal, 15)
                .frame(height: 52)
                .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 13))
                .overlay(
                    RoundedRectangle(cornerRadius: 13)
                        .strokeBorder(.white.opacity(0.16), lineWidth: 1)
                )
        }
    }

    private func loadNiches() async {
        // без токена: аккаунта ещё нет
        let result: API.Niches? = try? await APIClient.shared.send(
            "niches",
            as: API.Niches.self
        )
        if let result { niches = result.niches }
    }

    private func submit() async {
        guard let picked else { return }
        busy = true
        error = nil
        defer { busy = false }

        do {
            try await session.register(
                niche: picked.key,
                businessName: businessName,
                ownerName: ownerName,
                phone: phone,
                pin: pin
            )
            // экран закроется сам: RootView увидит вход и покажет кабинет
        } catch let e as APIError {
            pin = ""
            error = e.code == "PHONE_TAKEN"
                ? "Այս համարն արդեն գրանցված է"
                : (e.isOffline ? "Կապ չկա։" : "Չհաջողվեց։ Ստուգեք տվյալները։")
        } catch {
            self.error = "Չհաջողվեց։ Փորձեք կրկին։"
        }
    }
}
