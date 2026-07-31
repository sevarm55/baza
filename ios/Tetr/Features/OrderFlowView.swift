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
    /**
     * Выбранные услуги. За один заезд делают комплекс и химчистку салона,
     * и до сих пор это записывали двумя машинами.
     *
     * Первое касание по услуге сразу ведёт к оплате — для одной услуги
     * число касаний не выросло. Вторую добавляют уже оттуда: мойщик
     * делает это по сорок раз в день, и лишнее подтверждение в обычном
     * случае стоило бы сорока касаний в смену.
     */
    @State private var chosen: [API.Service] = []
    @State private var known: API.KnownClient?
    @State private var saved = false
    @State private var scanning = false
    /// Скидка: развёрнута ли строка и что в ней набрано.
    @State private var showDiscount = false
    @State private var discountText = ""
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
            .screenBackground()
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

            HStack(spacing: 10) {
                TextField("", text: $clientKey)
                    .font(.system(size: 26, weight: .bold, design: .rounded))
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .keyboardType(session.tenant?.clientIdType == "phone" ? .phonePad : .default)
                    .focused($typing)
                    .padding(.horizontal, 16)
                    .frame(maxWidth: .infinity)
                    .frame(height: 62)
                    .glassEffect(.regular, in: .rect(cornerRadius: 14))

                /* Камера — только для номеров и только там, где она есть.
                   Ручной ввод остаётся рядом всегда: номер бывает грязный,
                   гнутый или иностранный, и воевать с камерой вместо
                   восьми символов человек не должен. */
                if session.tenant?.clientIdType == "plate", PlateScannerView.isAvailable {
                    Button {
                        typing = false
                        scanning = true
                    } label: {
                        Image(systemName: "camera.viewfinder")
                            .font(.system(size: 22, weight: .medium))
                            .foregroundStyle(Brand.grape)
                            .frame(width: 62, height: 62)
                            .glassEffect(.regular, in: .rect(cornerRadius: 14))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Brand.grape)
                }
            }

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
        .fullScreenCover(isPresented: $scanning) {
            NavigationStack {
                PlateScannerView { plate in
                    clientKey = plate
                    scanning = false
                    // сразу дальше: номер распознан, спрашивать
                    // подтверждение незачем — он виден в поле
                    step = 1
                }
                .ignoresSafeArea()
                .navigationTitle(session.tenant?.clientIdLabel ?? "")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Փակել") { scanning = false }
                    }
                }
            }
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
                            if !chosen.contains(where: { $0.id == item.id }) {
                                chosen.append(item)
                            }
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

            /* Назад — туда, откуда пришли. Если услуга уже выбрана,
               значит сюда вернулись за второй, и бросать человека на
               экран клиента незачем. */
            Button("Հետ") { step = chosen.isEmpty ? 0 : 2 }
                .buttonStyle(.glass)
        }
        .padding(16)
    }

    private var paymentStep: some View {
        VStack(alignment: .leading, spacing: 12) {
            chosenRow
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
                        Text(money(charged, currency))
                            .font(.system(size: 15, weight: .semibold))
                            .monospacedDigit()
                            .foregroundStyle(discounted ? Brand.warn : Brand.muted)
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity)
                    .glassEffect(.regular, in: .rect(cornerRadius: 14))
                }
                .buttonStyle(.plain)
                .foregroundStyle(Brand.ink)
            }

            discountRow

            Spacer()

            Button("Հետ") { step = 1 }
                .buttonStyle(.glass)
        }
        .padding(16)
    }

    /// Что выбрано и сколько всего.
    ///
    /// Вторая услуга добавляется отсюда: список открывается снова и
    /// возвращает сюда же. Убрать лишнюю можно тем же касанием по ней.
    private var chosenRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(chosen) { item in
                HStack {
                    Text(item.name)
                        .font(.system(size: 15, weight: .semibold))
                    Spacer()
                    Text(money(item.price, currency))
                        .font(.system(size: 14))
                        .monospacedDigit()
                        .foregroundStyle(Brand.muted)
                    if chosen.count > 1 {
                        Button {
                            chosen.removeAll { $0.id == item.id }
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(Brand.muted.opacity(0.6))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            Button("+ ևս մեկ ծառայություն") { step = 1 }
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Brand.grape)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassEffect(.regular, in: .rect(cornerRadius: 14))
    }

    /// Скидка.
    ///
    /// Отдельной строкой под способами оплаты, а не полем цены в шапке:
    /// скидка — исключение, и вводить её должен тот, кто её действительно
    /// даёт, а не каждый по дороге. По умолчанию свёрнута.
    ///
    /// Больше прайса ввести нельзя — сервер откажет, и поле это повторяет.
    /// Запись должна фиксировать сумму, а не назначать её.
    @ViewBuilder
    private var discountRow: some View {
        if showDiscount {
            HStack(spacing: 10) {
                Text("Զեղչով")
                    .font(.system(size: 14.5, weight: .semibold))
                    .foregroundStyle(Brand.muted)

                TextField(String(listTotal), text: $discountText)
                    .keyboardType(.numberPad)
                    .multilineTextAlignment(.trailing)
                    .monospacedDigit()
                    .font(.system(size: 16, weight: .semibold))
                    .onChange(of: discountText) { _, v in
                        // выше прайса не пускаем прямо в поле
                        if let n = Int(v), n > listTotal {
                            discountText = String(listTotal)
                        }
                    }

                Text(currencySign)
                    .font(.system(size: 15))
                    .foregroundStyle(Brand.muted)
            }
            .padding(14)
            .glassEffect(.regular, in: .rect(cornerRadius: 14))
        } else {
            Button("Զեղչ տալ") { showDiscount = true }
                .font(.system(size: 14.5, weight: .semibold))
                .foregroundStyle(Brand.grape)
                .padding(.top, 2)
        }
    }

    /// Сколько возьмём: введённая сумма или прайс.
    /// Сколько стоит по прайсу всё выбранное.
    private var listTotal: Int { chosen.reduce(0) { $0 + $1.price } }

    private var charged: Int {
        guard showDiscount, let typed = Int(discountText) else { return listTotal }
        return min(typed, listTotal)
    }

    private var discounted: Bool { charged < listTotal }

    private var currencySign: String { currency == "AMD" ? "֏" : currency }

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
        guard let first = chosen.first else { return }

        queue.add(
            .init(
                ref: UUID().uuidString,
                clientKey: clientKey.trimmingCharacters(in: .whitespaces).uppercased(),
                // старое поле заполняем всегда: очередь могла быть записана
                // этой версией, а отправлена — после отката на прежнюю
                serviceId: first.id,
                serviceIds: chosen.map(\.id),
                serviceName: chosen.map(\.name).joined(separator: " + "),
                price: charged,
                listPrice: listTotal,
                payment: payment,
                at: Date()
            )
        )
        saved = true
    }
}
