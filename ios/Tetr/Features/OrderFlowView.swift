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
    /// Короткая строка «записано». Уходит сама через пару секунд.
    @State private var saved = false
    @State private var scanning = false
    @State private var detectedPlate: String?
    /// Выбранный способ оплаты. Пусто — кнопка записи погашена.
    @State private var payment: String?
    /// Отправка идёт: засов от второго касания той же кнопки.
    @State private var sending = false
    /// Скидка: развёрнута ли строка и что в ней набрано.
    @State private var showDiscount = false
    @State private var discountText = ""
    @FocusState private var typing: Bool
    /// Выбранный тариф — номером в списке бизнеса. `nil`, когда тарифов
    /// нет вовсе.
    @State private var tier: Int?
    @Namespace private var glass

    /// Тарифы бизнеса. Пусто — ряда классов на экране не будет.
    private var tiers: [String] { session.tenant?.tiers ?? [] }

    private var currency: String { session.tenant?.currency ?? "AMD" }

    /* Способы оплаты одним тоном, а не тремя разными.
     *
     * Было: лаймовые наличные, фиолетовая карта, серый перевод — «чтобы
     * попадать пальцем по цветному пятну, не читая». Пятна и правда видно,
     * но горели все три и всегда, а выбранный не отличался от невыбранного
     * ничем. Экран отвечал «вот три кнопки» вместо «вот что вы выбрали».
     * Лайм при этом означает в продукте главное действие и открытую смену,
     * и третьим значением «наличные» терял оба.
     *
     * Теперь все три спокойные, а цвет несёт ровно одно: который выбран.
     * Тот же язык, что у выбора услуги выше, и тот же, что в вебе. */
    private let payments: [(key: String, label: String, icon: String)] = [
        ("cash", "Կանխիկ", "banknote.fill"),
        ("card", "Քարտ", "creditcard.fill"),
        ("transfer", "Փոխանցում", "arrow.left.arrow.right"),
    ]

    var body: some View {
        GlassEffectContainer(spacing: 12) {
            ZStack {
                Brand.board.ignoresSafeArea()
                composer
            }
        }
    }

    // ══════════════════════════ страница записи ══════════════════════════

    private var composer: some View {
        VStack(spacing: 0) {
            header

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    /* «Записано» — строкой, а не экраном.
                     *
                     * Экран успеха с галкой в кружке занимал место формы
                     * полторы секунды и всё это время не давал набрать
                     * следующую машину: очередь ждала анимацию. Строка
                     * говорит то же самое, стоит там, где глаз, и ничего не
                     * закрывает — а подтверждение, которому мойщик верит,
                     * всё равно другое: машина в журнале смены. */
                    if saved {
                        Label("Գրանցված է", systemImage: "checkmark.circle.fill")
                            .font(.system(size: 13.5, weight: .semibold))
                            .foregroundStyle(Brand.goodOnBoard)
                            .padding(.bottom, 12)
                            .transition(.opacity.combined(with: .move(edge: .top)))
                    }

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
                                acceptDetected(plate)
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
                .animation(reduceMotion ? nil : .snappy(duration: 0.28), value: tier)
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
                if let detectedPlate {
                    HStack(spacing: 7) {
                        Image(systemName: "checkmark")
                            .font(.system(size: 15, weight: .bold))
                            .symbolEffect(.drawOn, options: .nonRepeating, isActive: !reduceMotion)
                        Text(detectedPlate)
                            .font(.system(size: 13, weight: .bold, design: .rounded))
                            .monospaced()
                            .lineLimit(1)
                    }
                    .foregroundStyle(Brand.onLime)
                    .padding(.horizontal, 14)
                    .frame(height: 60)
                    .glassEffect(
                        .regular.tint(Brand.lime).interactive(false),
                        in: .rect(cornerRadius: 18)
                    )
                    .glassEffectID("plate-scan", in: glass)
                    .glassEffectTransition(.matchedGeometry)
                    .transition(.opacity)
                } else {
                    Button {
                        typing = false
                        withAnimation(
                            reduceMotion
                                ? .easeOut(duration: 0.16)
                                : .spring(response: 0.34, dampingFraction: 0.92)
                        ) {
                            scanning.toggle()
                        }
                    } label: {
                        Image(systemName: scanning ? "xmark" : "camera.viewfinder")
                            .font(.system(size: 20, weight: .medium))
                            .foregroundStyle(scanning ? Brand.onBoard : Brand.grape)
                            .contentTransition(.symbolEffect(.replace.magic(fallback: .downUp)))
                            .symbolEffect(
                                .drawOn,
                                options: .nonRepeating,
                                isActive: scanning && !reduceMotion
                            )
                            .frame(width: 60, height: 60)
                    }
                    .buttonStyle(.plain)
                    .glassEffect(
                        .regular
                            .tint(scanning ? Brand.boardInk.opacity(0.12) : Brand.grape.opacity(0.08))
                            .interactive(),
                        in: .rect(cornerRadius: 18)
                    )
                    .glassEffectID("plate-scan", in: glass)
                    .glassEffectTransition(.matchedGeometry)
                    .accessibilityLabel(scanning ? "Փակել տեսախցիկը" : "Բացել տեսախցիկը")
                }
            }
        }
        .onAppear { typing = true }
        .onChange(of: clientKey) { _, value in
            /* Как только ручной ввод стал полноценным номером, показываем
               его ровно так же, как результат камеры. Это не только
               косметика: очередь и поиск получают один и тот же ключ. */
            if session.tenant?.clientIdType == "plate",
               let plate = PlateReader.parse(value), plate != value {
                clientKey = plate
                return
            }
            Task { await lookup(normalizedClientKey(value)) }
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
                        /* Цена перекручивается разрядами при смене класса.
                           Без этого выбор «Ջիպ» молча подменял все цены
                           разом, и связь между нажатием и результатом
                           приходилось додумывать: тот же приём, что у всех
                           меняющихся чисел в продукте, здесь объясняет
                           саму новую функцию. */
                        Text(money(item.price(tier: tier), currency))
                            .font(.system(size: 12))
                            .monospacedDigit()
                            .foregroundStyle(on ? Brand.onLime.opacity(0.7) : Brand.boardMuted)
                            .contentTransition(
                                .numericText(value: Double(item.price(tier: tier)))
                            )
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
                Text("Վճարման գումարը")
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
                    let on = payment == pay.key
                    Button {
                        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
                        payment = pay.key
                    } label: {
                        VStack(spacing: 6) {
                            Image(systemName: pay.icon)
                                .font(.system(size: 17, weight: .semibold))
                            Text(pay.label)
                                .font(.system(size: 12, weight: .semibold))
                                .lineLimit(1)
                                .minimumScaleFactor(0.7)
                        }
                        .foregroundStyle(on ? Brand.board : Brand.onBoard)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(
                            on ? Brand.boardInk : Brand.boardInk.opacity(0.07),
                            in: .rect(cornerRadius: 18)
                        )
                    }
                    .buttonStyle(.press)
                    .accessibilityAddTraits(on ? [.isSelected] : [])
                }
            }
            .animation(reduceMotion ? nil : .snappy(duration: 0.2), value: payment)

            /* Последнее движение — отдельная кнопка, и на ней написано,
               что произойдёт и за сколько.

               Раньше запись делало касание по способу оплаты: экономило
               одно движение и стоило дорого. Между «выбрал наличные» и
               «машина записана» не оставалось ничего, что можно прочитать
               и передумать, а промах по соседней плитке записывал не тот
               способ оплаты и правился только отменой всей записи.

               Движение возвращается на следующей машине: после записи
               лист не закрывается, а очищается и снова ждёт номер. */
            Button {
                record()
            } label: {
                Text(sending
                     ? "Գրանցվում է…"
                     : "Ավելացնել \(session.tenant?.unitOne ?? "") · \(money(charged, currency))")
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .buttonStyle(LimeButton())
            .disabled(!canRecord || sending)
            .opacity(canRecord && !sending ? 1 : 0.45)
            .animation(.easeOut(duration: 0.2), value: canRecord)
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 8)
        .background(Brand.board.ignoresSafeArea(edges: .bottom))
        .animation(reduceMotion ? nil : .snappy(duration: 0.3), value: charged)
    }

    /// Неполную запись не отправляем: сервер её и так не примет, но узнавать
    /// об этом из ошибки после нажатия — значит нажимать вслепую.
    private var canRecord: Bool {
        !normalizedClientKey(clientKey).isEmpty && !chosen.isEmpty && payment != nil
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

    // ══════════════════════════ данные ══════════════════════════

    private func lookup(_ key: String) async {
        let trimmed = normalizedClientKey(key)
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
    ///
    /// Засов `sending` — не про сеть, а про палец: кнопку жмут мокрой рукой,
    /// и второе касание приходит раньше, чем экран успевает перерисоваться.
    /// Две одинаковые машины в отчёте владелец считает ошибкой продукта, и
    /// он прав.
    private func record() {
        guard let first = chosen.first, let payment, !sending else { return }
        sending = true

        queue.add(
            .init(
                ref: UUID().uuidString,
                clientKey: normalizedClientKey(clientKey),
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
                // чья мойка: очередь переживает переключение точки
                tenantId: session.tenant?.id,
                at: Date()
            )
        )

        UINotificationFeedbackGenerator().notificationOccurred(.success)

        Task { @MainActor in
            await onDone()
            clear()
            sending = false
            withAnimation(reduceMotion ? .easeOut(duration: 0.15) : .snappy(duration: 0.25)) {
                saved = true
            }
            /* Строка успеха уходит сама. Мойщик уже набирает следующий
               номер, и убирать её руками ему незачем. */
            try? await Task.sleep(for: .seconds(2.5))
            withAnimation(.easeOut(duration: 0.2)) { saved = false }
        }
    }

    /// Очистить набранное, оставив лист открытым и курсор в номере.
    private func clear() {
        clientKey = ""
        chosen = []
        payment = nil
        tier = nil
        known = nil
        showDiscount = false
        discountText = ""
        typing = true
    }

    private func acceptDetected(_ plate: String) {
        clientKey = PlateReader.canonical(plate)
        withAnimation(
            reduceMotion
                ? .easeOut(duration: 0.16)
                : .spring(response: 0.34, dampingFraction: 0.92)
        ) {
            scanning = false
            detectedPlate = plate
        }

        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(reduceMotion ? 350 : 850))
            withAnimation(
                reduceMotion
                    ? .easeOut(duration: 0.14)
                    : .spring(response: 0.3, dampingFraction: 1)
            ) {
                detectedPlate = nil
            }
        }
    }

    private func normalizedClientKey(_ raw: String) -> String {
        if session.tenant?.clientIdType == "plate" {
            return PlateReader.canonical(raw)
        }
        return raw.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
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
