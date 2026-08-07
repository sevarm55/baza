import SwiftUI

/**
 * Запись машины — одним экраном.
 *
 * Мастера из трёх шагов больше нет. Он стоил тех же трёх касаний, но между
 * ними были три смены страницы: человек не видел, что уже выбрал, не мог
 * поправить номер, не вернувшись назад, и не знал суммы, пока не дошёл до
 * оплаты. Здесь всё три вещи на виду сразу — номер, услуги, оплата, — и
 * запись по-прежнему занимает три касания.
 *
 * Порядок сверху вниз повторяет порядок работы: сначала подъехала машина,
 * потом решили, что с ней делают, потом взяли деньги. Оплата закреплена
 * внизу, у большого пальца руки, которой держат телефон, и она же —
 * последнее действие: касание по способу оплаты и есть запись.
 *
 * Запись всегда ложится в очередь и всегда показывает успех сразу. Отправка
 * — отдельная забота: сеть во дворе мойки пропадает, но человек уже отпустил
 * машину и к телефону не вернётся.
 */
struct OrderFlowView: View {
    let onDone: () async -> Void

    @EnvironmentObject private var session: Session
    @EnvironmentObject private var queue: OrderQueue
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var clientKey = ""
    /**
     * Выбранные услуги. За один заезд делают комплекс и химчистку салона, и
     * до сих пор это записывали двумя машинами.
     */
    @State private var chosen: [API.Service] = []
    @State private var known: API.KnownClient?
    @State private var saved = false
    @State private var scanning = false
    /// Скидка: развёрнута ли строка и что в ней набрано.
    @State private var showDiscount = false
    @State private var discountText = ""
    @FocusState private var typing: Bool
    /// Выбранный тариф — номером в списке бизнеса. `nil`, когда тарифов
    /// нет вовсе.
    @State private var tier: Int?

    /// Тарифы бизнеса. Пусто — ряда классов на экране не будет.
    private var tiers: [String] { session.tenant?.tiers ?? [] }

    private var currency: String { session.tenant?.currency ?? "AMD" }

    private let payments: [(key: String, label: String, icon: String, tone: Tone)] = [
        ("cash", "Կանխիկ", "banknote.fill", .lime),
        ("card", "Քարտ", "creditcard.fill", .violet),
        ("transfer", "Փոխանցում", "arrow.left.arrow.right", .slate),
    ]

    var body: some View {
        ZStack {
            Brand.board.ignoresSafeArea()

            if saved {
                done
            } else {
                composer
            }
        }
        .animation(reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.85), value: saved)
    }

    // ══════════════════════════ страница записи ══════════════════════════

    private var composer: some View {
        VStack(spacing: 0) {
            header

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    plateRow

                    if let known {
                        // узнавание постоянного клиента прямо при вводе — то,
                        // ради чего экран и существует
                        Text("Արդեն եղել է \(known.visits) անգամ · ընդամենը \(money(known.total, currency))")
                            .font(.system(size: 12.5, weight: .medium))
                            .foregroundStyle(Brand.goodOnBoard)
                            .padding(.top, 8)
                            .transition(.opacity.combined(with: .move(edge: .top)))
                    }

                    if !tiers.isEmpty {
                        tierRow
                    }

                    if scanning {
                        PlateCameraPanel(
                            onFound: { plate in
                                clientKey = plate
                                scanning = false
                            },
                            onManual: { typing = true },
                            onClose: { scanning = false }
                        )
                        .frame(height: 320)
                        .padding(.top, 12)
                        .transition(.asymmetric(
                            insertion: .scale(scale: 0.94, anchor: .top).combined(with: .opacity),
                            removal: .opacity
                        ))
                    }

                    section("Ծառայություն")
                    services
                    discountRow
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 20)
                .animation(
                    reduceMotion ? nil : .spring(response: 0.36, dampingFraction: 0.86),
                    value: scanning
                )
                .animation(
                    reduceMotion ? nil : .spring(response: 0.32, dampingFraction: 0.8),
                    value: chosen.map(\.id)
                )
                .animation(.easeOut(duration: 0.18), value: known?.key)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .safeAreaInset(edge: .bottom) { checkout }
    }

    private var header: some View {
        HStack {
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Brand.boardMuted)
                    .frame(width: 38, height: 38)
                    .background(Brand.boardInk.opacity(0.07), in: .circle)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Փակել")

            Spacer()

            Text("Նոր \(session.tenant?.unitOne ?? "")")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Brand.onBoard)

            Spacer()

            // Симметрия: без пустого кружка справа заголовок стоял бы не по
            // центру экрана, а по центру остатка, и это заметно.
            Color.clear.frame(width: 38, height: 38)
        }
        .padding(.horizontal, 16)
        .padding(.top, 6)
        .padding(.bottom, 14)
    }

    private func section(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(Brand.boardMuted)
            .padding(.top, 22)
            .padding(.bottom, 10)
    }

    // ══════════════════════════ номер ══════════════════════════

    private var plateRow: some View {
        HStack(spacing: 10) {
            TextField(session.tenant?.clientIdLabel ?? "", text: $clientKey)
                .font(.system(size: 24, weight: .bold, design: .rounded))
                .foregroundStyle(Brand.onBoard)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                .keyboardType(session.tenant?.clientIdType == "phone" ? .phonePad : .default)
                .focused($typing)
                .padding(.horizontal, 16)
                .frame(maxWidth: .infinity)
                .frame(height: 60)
                .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 18))

            /* Камера — только для номеров и только там, где она есть. Ручной
               ввод остаётся рядом всегда: номер бывает грязный, гнутый или
               иностранный, и воевать с камерой вместо восьми символов
               человек не должен. */
            if session.tenant?.clientIdType == "plate", PlateScannerView.isAvailable {
                Button {
                    typing = false
                    scanning.toggle()
                } label: {
                    Image(systemName: scanning ? "xmark" : "camera.viewfinder")
                        .font(.system(size: 20, weight: .medium))
                        .foregroundStyle(scanning ? Brand.board : Brand.grape)
                        .frame(width: 60, height: 60)
                        .background(
                            scanning ? Brand.boardInk : Brand.boardInk.opacity(0.07),
                            in: .rect(cornerRadius: 18)
                        )
                }
                .buttonStyle(.press)
                .accessibilityLabel("Տեսախցիկ")
            }
        }
        .onAppear { typing = true }
        .onChange(of: clientKey) { _, value in
            Task { await lookup(value) }
        }
    }

    /**
     * Класс машины — ряд чипов сразу под номером.
     *
     * Стоит здесь, а не рядом с услугами, потому что класс принадлежит
     * МАШИНЕ, а не услуге: «джип по комплексу, седан по химчистке» — не
     * бизнес-случай, а способ ошибиться. Выбирается один раз на заезд, и
     * цены всех услуг ниже сразу пересчитываются.
     *
     * Для знакомого номера класс подставляется сам, из прошлой записи этой
     * машины: тарифы не должны стоить мойщику ни одного лишнего касания
     * сорок раз за смену.
     */
    private var tierRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(session.tenant?.tierLabel ?? "Դաս")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Brand.boardMuted)

            Flow(spacing: 8) {
                ForEach(Array(tiers.enumerated()), id: \.offset) { index, name in
                    let on = tier == index
                    Button {
                        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
                        tier = index
                    } label: {
                        Text(name)
                            .font(.system(size: 14.5, weight: .semibold))
                            .foregroundStyle(on ? Brand.onLime : Brand.onBoard)
                            .padding(.horizontal, 15)
                            .padding(.vertical, 10)
                            .background(on ? Brand.lime : Brand.boardInk.opacity(0.07), in: .capsule)
                    }
                    .buttonStyle(.press)
                    .accessibilityAddTraits(on ? [.isSelected] : [])
                }
            }
        }
        .padding(.top, 18)
    }

    // ══════════════════════════ услуги ══════════════════════════

    /**
     * Услуги плитками в поток, а не списком строк.
     *
     * Список во всю ширину показывал четыре услуги на экран и заставлял
     * прокручивать; в поток тех же четыре встают в два ряда и видны сразу
     * вместе с суммой внизу. Выбранная плитка заливается лаймом — тем же
     * цветом, что и «сколько всего», поэтому связь между выбором и суммой
     * не нужно объяснять.
     *
     * Повторное касание снимает выбор. Отдельного крестика нет: он занимал
     * бы место в каждой плитке ради действия, которое делают раз в день.
     */
    private var services: some View {
        Flow(spacing: 8) {
            ForEach(session.services) { item in
                let on = chosen.contains { $0.id == item.id }
                Button {
                    UIImpactFeedbackGenerator(style: .soft).impactOccurred()
                    if on {
                        chosen.removeAll { $0.id == item.id }
                    } else {
                        chosen.append(item)
                    }
                } label: {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(item.name)
                            .font(.system(size: 14.5, weight: .semibold))
                            .foregroundStyle(on ? Brand.onLime : Brand.onBoard)
                        Text(money(item.price(tier: tier), currency))
                            .font(.system(size: 12))
                            .monospacedDigit()
                            .foregroundStyle(on ? Brand.onLime.opacity(0.7) : Brand.boardMuted)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)
                    .background(
                        on ? Brand.lime : Brand.boardInk.opacity(0.07),
                        in: .rect(cornerRadius: 16)
                    )
                }
                .buttonStyle(.press)
                .accessibilityAddTraits(on ? [.isSelected] : [])
            }
        }
    }

    /**
     * Скидка.
     *
     * Свёрнута по умолчанию и стоит под услугами, а не полем цены в шапке:
     * скидка — исключение, и вводить её должен тот, кто её действительно
     * даёт, а не каждый по дороге.
     *
     * Больше прайса ввести нельзя — сервер откажет, и поле это повторяет.
     * Запись должна фиксировать сумму, а не назначать её.
     */
    @ViewBuilder
    private var discountRow: some View {
        if showDiscount {
            HStack(spacing: 10) {
                Text("Զեղչով")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Brand.boardMuted)

                TextField(String(listTotal), text: $discountText)
                    .keyboardType(.numberPad)
                    .multilineTextAlignment(.trailing)
                    .monospacedDigit()
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Brand.onBoard)
                    .onChange(of: discountText) { _, v in
                        // выше прайса не пускаем прямо в поле
                        if let n = Int(v), n > listTotal { discountText = String(listTotal) }
                    }

                Text(currencySign)
                    .font(.system(size: 14))
                    .foregroundStyle(Brand.boardMuted)
            }
            .padding(14)
            .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 18))
            .padding(.top, 12)
        } else if !chosen.isEmpty {
            Button("Զեղչ տալ") { showDiscount = true }
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Brand.grape)
                .padding(.top, 14)
        }
    }

    // ══════════════════════════ оплата ══════════════════════════

    /**
     * Сумма и три способа оплаты, закреплённые внизу.
     *
     * Касание по способу и есть запись — отдельной кнопки «сохранить» нет.
     * Она стоила бы четвёртого касания сорок раз в день и не отвечала бы ни
     * на один вопрос: способ оплаты выбирают последним и всегда.
     *
     * Пока не введён номер или не выбрана услуга, ряд приглушён и не
     * нажимается: причина видна на самом экране, и окошко с отказом не
     * нужно.
     */
    private var checkout: some View {
        VStack(spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text("Ընդամենը")
                    .font(.system(size: 13))
                    .foregroundStyle(Brand.boardMuted)
                Spacer()
                if discounted {
                    Text(money(listTotal, currency))
                        .font(.system(size: 14))
                        .monospacedDigit()
                        .strikethrough()
                        .foregroundStyle(Brand.boardMuted)
                }
                Text(money(charged, currency))
                    .font(.system(size: 26, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(discounted ? Brand.warnOnBoard : Brand.onBoard)
                    .contentTransition(.numericText(value: Double(charged)))
            }

            HStack(spacing: 8) {
                ForEach(payments, id: \.key) { pay in
                    Button {
                        record(payment: pay.key)
                    } label: {
                        VStack(spacing: 6) {
                            Image(systemName: pay.icon)
                                .font(.system(size: 17, weight: .semibold))
                            Text(pay.label)
                                .font(.system(size: 12, weight: .semibold))
                                .lineLimit(1)
                                .minimumScaleFactor(0.7)
                        }
                        .foregroundStyle(pay.tone.ink)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .tile(pay.tone, radius: 18, pad: 0)
                    }
                    .buttonStyle(.press)
                }
            }
            .disabled(!canRecord)
            .opacity(canRecord ? 1 : 0.4)
            .animation(.easeOut(duration: 0.2), value: canRecord)
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 8)
        .background(Brand.board.ignoresSafeArea(edges: .bottom))
        .animation(reduceMotion ? nil : .snappy(duration: 0.3), value: charged)
    }

    private var canRecord: Bool {
        !clientKey.trimmingCharacters(in: .whitespaces).isEmpty && !chosen.isEmpty
    }

    /// Сколько стоит по прайсу всё выбранное.
    private var listTotal: Int { chosen.reduce(0) { $0 + $1.price(tier: tier) } }

    /// Сколько возьмём: введённая сумма или прайс.
    private var charged: Int {
        guard showDiscount, let typed = Int(discountText) else { return listTotal }
        return min(typed, listTotal)
    }

    private var discounted: Bool { charged < listTotal }

    private var currencySign: String { currency == "AMD" ? "֏" : currency }

    // ══════════════════════════ готово ══════════════════════════

    private var done: some View {
        VStack(spacing: 14) {
            Spacer()
            Image(systemName: "checkmark")
                .font(.system(size: 40, weight: .black))
                .foregroundStyle(Brand.onLime)
                .frame(width: 104, height: 104)
                .background(Brand.lime, in: .circle)
                .transition(.scale(scale: 0.5).combined(with: .opacity))

            Text("Գրանցված է")
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(Brand.onBoard)

            Text(clientKey.uppercased())
                .font(.system(size: 15, weight: .semibold, design: .rounded))
                .foregroundStyle(Brand.boardMuted)

            Text(money(charged, currency))
                .font(.system(size: 15, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)

            Spacer()
        }
        .frame(maxWidth: .infinity)
        .task {
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            await onDone()
            // экран успеха живёт секунду с небольшим: мойщик уже пошёл к
            // следующей машине, задерживать его незачем
            try? await Task.sleep(nanoseconds: 1_400_000_000)
            dismiss()
        }
    }

    // ══════════════════════════ данные ══════════════════════════

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

        /* Класс из прошлой записи этой машины. Только если человек ещё не
           выбрал сам: подсказка не имеет права переспорить решение. */
        if tier == nil, let last = result?.known?.lastTier,
           let i = tiers.firstIndex(where: { $0.caseInsensitiveCompare(last) == .orderedSame }) {
            tier = i
        }
    }

    /// Запись ложится в очередь ВСЕГДА, даже при живой связи.
    ///
    /// Так у отправки один путь вместо двух, и офлайн перестаёт быть особым
    /// случаем, который проверяют отдельно и забывают починить.
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
                // словом, а не номером: список классов мог смениться, пока
                // запись лежала в очереди без связи
                tier: tier.flatMap { tiers[safe: $0] },
                at: Date()
            )
        )
        saved = true
    }
}

/**
 * Раскладка в поток: плитки идут в строку, пока помещаются, потом
 * переносятся.
 *
 * В SwiftUI такой нет, а нужна она ровно здесь: у услуг разной длины
 * названия, и `LazyVGrid` с равными колонками даёт либо обрезанное
 * «Քիմմաքրում», либо половину пустой строки рядом с «Թափք».
 */
struct Flow: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0

        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: maxWidth == .infinity ? x : maxWidth, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0

        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX, x > bounds.minX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
