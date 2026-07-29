import SwiftUI

/// Запись в три касания: клиент → услуга → оплата.
///
/// Ровно три шага и ни одного лишнего: мойщик делает это по сорок раз в
/// день мокрыми руками. Каждое добавленное поле здесь стоит сорока
/// касаний в смену.
///
/// Запись всегда ложится в очередь и всегда показывает успех сразу.
/// Отправка — отдельная забота: сеть во дворе мойки пропадает, но человек
/// уже отпустил машину и к телефону не вернётся.
struct OrderFlowView: View {
    let onDone: () async -> Void

    @EnvironmentObject private var session: Session
    @EnvironmentObject private var queue: OrderQueue
    @Environment(\.dismiss) private var dismiss

    @State private var step = 0
    @State private var clientKey = ""
    @State private var service: API.Service?
    @State private var known: API.KnownClient?
    @State private var saved = false
    @FocusState private var typing: Bool

    private var currency: String { session.tenant?.currency ?? "AMD" }

    private let payments: [(key: String, label: String, icon: String)] = [
        ("cash", "Կանխիկ", "banknote"),
        ("card", "Քարտ", "creditcard"),
        ("transfer", "Փոխանցում", "iphone"),
    ]

    var body: some View {
        NavigationStack {
            Group {
                if saved {
                    done
                } else {
                    VStack(spacing: 0) {
                        progress
                        content
                    }
                }
            }
            .background(Brand.bg)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    if !saved {
                        Button("Փակել") { dismiss() }
                            .foregroundStyle(Brand.muted)
                    }
                }
            }
        }
    }

    private var progress: some View {
        HStack(spacing: 6) {
            ForEach(0..<3) { i in
                Capsule()
                    .fill(i <= step ? Brand.grape : Brand.line)
                    .frame(height: 4)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    @ViewBuilder
    private var content: some View {
        switch step {
        case 0: clientStep
        case 1: serviceStep
        default: paymentStep
        }
    }

    private var clientStep: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(session.tenant?.clientIdLabel ?? "")
                .font(.system(size: 11, weight: .bold))
                .tracking(1.2)
                .textCase(.uppercase)
                .foregroundStyle(Brand.muted)

            TextField("", text: $clientKey)
                .font(.system(size: 26, weight: .bold, design: .rounded))
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                .keyboardType(session.tenant?.clientIdType == "phone" ? .phonePad : .default)
                .focused($typing)
                .padding(.horizontal, 16)
                .frame(height: 62)
                .glassEffect(.regular, in: .rect(cornerRadius: 14))

            // узнавание постоянного клиента прямо при вводе — то, ради
            // чего экран и существует
            if let known {
                Text("Արդեն եղել է \(known.visits) անգամ · ընդամենը \(money(known.total, currency))")
                    .font(.system(size: 13))
                    .foregroundStyle(Brand.good)
            }

            Spacer()

            Button("Առաջ") { step = 1 }
                .buttonStyle(LimeButton())
                .disabled(clientKey.trimmingCharacters(in: .whitespaces).isEmpty)
                .opacity(clientKey.trimmingCharacters(in: .whitespaces).isEmpty ? 0.5 : 1)
        }
        .padding(16)
        .onAppear { typing = true }
        .onChange(of: clientKey) { value in
            Task { await lookup(value) }
        }
    }

    private var serviceStep: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Ծառայություն")
                .font(.system(size: 11, weight: .bold))
                .tracking(1.2)
                .textCase(.uppercase)
                .foregroundStyle(Brand.muted)

            ScrollView {
                VStack(spacing: 8) {
                    ForEach(session.services) { item in
                        Button {
                            service = item
                            step = 2
                        } label: {
                            HStack {
                                Text(item.name)
                                    .font(.system(size: 16, weight: .semibold))
                                Spacer()
                                Text(money(item.price, currency))
                                    .font(.system(size: 15, weight: .semibold))
                                    .monospacedDigit()
                                    .foregroundStyle(Brand.muted)
                            }
                            .padding(16)
                            .frame(maxWidth: .infinity)
                            .glassEffect(.regular, in: .rect(cornerRadius: 14))
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(Brand.ink)
                    }
                }
            }

            Button("Հետ") { step = 0 }
                .buttonStyle(.glass)
        }
        .padding(16)
    }

    private var paymentStep: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Վճարում")
                .font(.system(size: 11, weight: .bold))
                .tracking(1.2)
                .textCase(.uppercase)
                .foregroundStyle(Brand.muted)

            ForEach(payments, id: \.key) { pay in
                Button {
                    record(payment: pay.key)
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: pay.icon)
                            .foregroundStyle(Brand.grape)
                        Text(pay.label)
                            .font(.system(size: 16, weight: .semibold))
                        Spacer()
                        Text(money(service?.price ?? 0, currency))
                            .font(.system(size: 15, weight: .semibold))
                            .monospacedDigit()
                            .foregroundStyle(Brand.muted)
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity)
                    .glassEffect(.regular, in: .rect(cornerRadius: 14))
                }
                .buttonStyle(.plain)
                .foregroundStyle(Brand.ink)
            }

            Spacer()

            Button("Հետ") { step = 1 }
                .buttonStyle(.glass)
        }
        .padding(16)
    }

    private var done: some View {
        VStack(spacing: 14) {
            Spacer()
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 64))
                .foregroundStyle(Brand.grape)
            Text("Գրանցված է")
                .font(.system(size: 24, weight: .bold))
            Text(clientKey.uppercased())
                .font(.system(size: 15, weight: .semibold, design: .rounded))
                .foregroundStyle(Brand.muted)
            Spacer()
            Button("Փակել") { dismiss() }
                .buttonStyle(LimeButton())
                .padding(16)
        }
        .task {
            await onDone()
            // экран успеха живёт секунду с небольшим: мойщик уже пошёл
            // к следующей машине, задерживать его незачем
            try? await Task.sleep(nanoseconds: 1_400_000_000)
            dismiss()
        }
    }

    private func lookup(_ key: String) async {
        let trimmed = key.trimmingCharacters(in: .whitespaces)
        guard trimmed.count >= 3 else {
            known = nil
            return
        }
        let result: API.Lookup? = try? await session.authed { token in
            try await APIClient.shared.send(
                "clients/lookup?key=\(trimmed.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")",
                token: token,
                as: API.Lookup.self
            )
        }
        known = result?.known
    }

    /// Запись ложится в очередь ВСЕГДА, даже при живой связи.
    ///
    /// Так у отправки один путь вместо двух, и офлайн перестаёт быть
    /// особым случаем, который проверяют отдельно и забывают починить.
    private func record(payment: String) {
        guard let service else { return }

        queue.add(
            .init(
                ref: UUID().uuidString,
                clientKey: clientKey.trimmingCharacters(in: .whitespaces).uppercased(),
                serviceId: service.id,
                serviceName: service.name,
                price: service.price,
                payment: payment,
                at: Date()
            )
        )
        saved = true
    }
}
