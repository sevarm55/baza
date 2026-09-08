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
    @State private var scanning = false
    @State private var detectedPlate: String?
    /// Выбранный способ оплаты. Пусто — кнопка записи погашена.
    @State private var payment: String?
    /// Отправка идёт: засов от второго касания той же кнопки.
    @State private var sending = false
    /// Запись не легла на диск. Форма остаётся с набранным: набирать
    /// номер заново после честной ошибки — работа впустую.
    @State private var saveFailed = false
    /// Скидка: развёрнута ли строка и что в ней набрано.
    @State private var showDiscount = false
    /// Открыт вопрос «сбросить набранное?» при закрытии полной формы.
    @State private var discarding = false
    @State private var discountText = ""
    @FocusState private var typing: Bool
    /// Выбранный тариф — номером в списке бизнеса. `nil`, когда тарифов
    /// нет вовсе.
    @State private var tier: Int?
    /**
     * Мыли вместе.
     *
     * Выключено по умолчанию, и это не мелочь: девять записей из десяти
     * одиночные, и лишнее касание на них стоило бы сорока касаний за
     * смену ради одного случая.
     *
     * Переключатель отдельно от списка отмеченных: человек выбирает
     * «вместе с коллегами» раньше, чем успевает кого-то отметить, и до
     * первой галочки экран обязан показывать выбор, а не молчать.
     */
    @State private var together = false
    @State private var helpers: Set<String> = []

    @FocusState private var typingDiscount: Bool
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
        ("cash", L("payment.cash"), "banknote.fill"),
        ("card", L("payment.card"), "creditcard.fill"),
        ("transfer", L("payment.transfer"), "arrow.left.arrow.right"),
    ]

    var body: some View {
        GlassEffectContainer(spacing: 12) {
            ZStack {
                /* Белый лист, как на смене: форма открывается поверх неё,
                   и серое табло под белой витриной читалось другим
                   продуктом. */
                Brand.boardSurface.ignoresSafeArea()
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
                    /* Строки «записано» здесь больше нет.
                     *
                     * Она была нужна, пока лист оставался открытым после
                     * записи: экран не менялся, и без неё нажатие
                     * выглядело безответным. Теперь лист закрывается, а
                     * подтверждение стоит там, где ему и место, — машина
                     * в журнале смены, подсвеченная и с галкой. */
                    plateRow

                    if let known {
                        // узнавание постоянного клиента прямо при вводе — то,
                        // ради чего экран и существует
                        Text(L("order.knownClient", known.visits, money(known.total, currency)))
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Brand.goodOnBoard)
                            .padding(.top, 8)
                            .transition(.opacity.combined(with: .move(edge: .top)))
                    }

                    if !tiers.isEmpty {
                        tierRow
                    }

                    section(L("owner.colService"))
                    services
                    discountRow
                    crewRow
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
                .animation(.easeOut(duration: Motion.fast), value: known?.key)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .safeAreaInset(edge: .bottom) { checkout }
        /* Камера выезжает снизу отдельной панелью и закрывает полосу
           оплаты, а не втискивается под поле номера: так попросил
           владелец, показав, как это сделано в других приложениях.
           Панель занимает нижнюю половину экрана — столько нужно, чтобы
           навести телефон на знак, не поднимая его к глазам, — а поле
           номера остаётся видно сверху, и распознанное ложится в него
           на глазах. */
        .sheet(isPresented: $scanning) {
            PlateCameraPanel(
                onFound: { plate in
                    acceptDetected(plate)
                },
                onManual: { typing = true },
                onClose: { scanning = false }
            )
            /* Системный лист на три пятых экрана: кадр во весь лист,
               скруглённый верх, ручка. Столько нужно, чтобы навести
               телефон на знак, не поднимая его к глазам, а поле номера
               над листом остаётся видно, и распознанное ложится в него
               на глазах. */
            .presentationDetents([.fraction(0.62), .large])
            .presentationCornerRadius(36)
            .presentationDragIndicator(.visible)
            .presentationBackground(.black)
        }
    }

    /// В форме уже есть набранное — закрытие стирает его.
    private var dirty: Bool {
        !clientKey.isEmpty || !chosen.isEmpty || payment != nil || !discountText.isEmpty
    }

    private var header: some View {
        HStack {
            Button {
                if dirty { discarding = true } else { dismiss() }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Brand.boardMuted)
                    .frame(width: 38, height: 38)
                    .background(Brand.boardControl, in: .circle)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(L("common.close"))
            /* Набранный номер и выбранные услуги не исчезают молча:
               закрытие полной формы спрашивает. Пустую закрывает сразу. */
            .confirmationDialog(
                L("order.discardTitle"),
                isPresented: $discarding,
                titleVisibility: .visible
            ) {
                Button(L("order.discardConfirm"), role: .destructive) {
                    dismiss()
                }
                Button(L("work.revokeKeep"), role: .cancel) {}
            }

            Spacer()

            Text(L("order.newUnit", Terms.unit(session.tenant?.unitOne ?? "").acc))
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

    /**
     * Поле номера — номерной знак.
     *
     * Белая табличка с чёрной рамкой и синим блоком флага слева, как
     * настоящий знак и как строка в журнале смены: то, что набирают,
     * выглядит так же, как то, что потом увидят в списке. Блок с флагом
     * только у ниш с номерами; у телефона клиента это обычное поле.
     *
     * Камера отсюда переехала вниз, к кнопке записи: владелец попросил.
     * Поле занимает всю ширину, и восемь знаков номера в нём читаются с
     * расстояния вытянутой руки.
     */
    private var plateRow: some View {
        let isPlate = session.tenant?.clientIdType == "plate"
        return HStack(spacing: 12) {
            TextField(Terms.clientId(session.tenant?.clientIdLabel ?? ""), text: $clientKey)
                .font(.system(size: 27, weight: .bold, design: .rounded))
                .monospacedDigit()
                .kerning(1)
                .foregroundStyle(Brand.onBoard)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                /* Латинская клавиатура, а не языковая: в госномере только
                   латиница и цифры, а на армянской раскладке их нет — до
                   этой правки каждый номер стоил двух переключений
                   раскладки, сорок раз за смену. */
                .keyboardType(isPlate ? .asciiCapable : (session.tenant?.clientIdType == "phone" ? .phonePad : .asciiCapable))
                .focused($typing)
                /* Поле без подписи: на экране его объясняет крупный
                   плейсхолдер, а VoiceOver читал бы пустоту. Здесь же
                   имя, по которому его находят UI-тесты. */
                .accessibilityIdentifier("order.clientKey")
                .accessibilityLabel(Terms.clientId(session.tenant?.clientIdLabel ?? ""))
                .frame(maxWidth: .infinity, alignment: .leading)

            /* Распознанный камерой номер отмечается галкой в самом поле:
               камера внизу, и отдельной плашке рядом с полем места нет. */
            if detectedPlate != nil {
                Image(systemName: "checkmark")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Brand.onLime)
                    .symbolEffect(.drawOn, options: .nonRepeating, isActive: !reduceMotion)
                    .frame(width: 30, height: 30)
                    .background(Brand.lime, in: .circle)
                    .transition(.scale.combined(with: .opacity))
            }
        }
        .padding(.horizontal, 18)
        /**
         * Поле номера — просто поле, без синего блока с флагом.
         *
         * Блок был копией настоящего знака: синяя полоса слева, флаг над
         * кодом страны. На экране записи он не работал. Страну здесь
         * никто не выбирает — она одна на весь бизнес и уже написана в
         * его валюте, — а синяя плашка забирала левый край и первой
         * ловила глаз вместо самого номера, ради которого поле и стоит.
         * В журнале смены знак остаётся знаком: там номер надо УЗНАТЬ
         * среди сорока строк, а здесь — НАБРАТЬ.
         *
         * Взамен поле само отвечает на касание: в покое волосяная грань,
         * под набором — грейповая рамка и мягкий отсвет, как у всякого
         * активного поля продукта.
         */
        .frame(height: 62)
        .background(Brand.paper, in: .rect(cornerRadius: 16, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(
                    typing ? Brand.grape.opacity(0.55) : Brand.onBoard.opacity(0.10),
                    lineWidth: typing ? 1.8 : 1
                )
        }
        .shadow(color: typing ? Brand.grape.opacity(0.18) : .clear, radius: 14, y: 4)
        .animation(.easeOut(duration: Motion.fast), value: typing)
        .contentShape(.rect)
        .onTapGesture { typing = true }
        .animation(.easeOut(duration: Motion.fast), value: detectedPlate)
        /* Клавиатура сама не встаёт. Форма открывается на пол-экрана
           поверх смены, и поднятая клавиатура забирала вторую половину:
           человек видел поле ввода и больше ничего, хотя первым делом он
           обычно жмёт камеру и сканирует номер, а не набирает его
           руками. Поле остаётся в одном касании. */
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
            Text(session.tenant?.tierLabel ?? L("work.tier"))
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Brand.boardMuted)

            Flow(spacing: 8) {
                ForEach(Array(tiers.enumerated()), id: \.offset) { index, name in
                    let on = tier == index
                    Button {
                        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
                        /* Повторное касание снимает класс — как у услуг.
                           Раньше промах по «Джипу» лечился только
                           закрытием всей формы. */
                        tier = on ? nil : index
                    } label: {
                        Text(name)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(on ? Brand.onLime : Brand.onBoard)
                            .padding(.horizontal, 16)
                            .frame(minHeight: 44)
                            .formGlass(R.control, selected: on)
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
    @ViewBuilder
    private var services: some View {
        if session.services.isEmpty {
            /* Пустой прайс объясняет себя: раньше под заголовком
               «Услуга» была пустота, запись не собиралась, и почему —
               оставалось загадкой. */
            Text(L("order.noServices"))
                .font(.system(size: 14))
                .foregroundStyle(Brand.boardMuted)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
                .background(Brand.boardControl, in: .rect(cornerRadius: 18, style: .continuous))
        } else {
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
                        Text(Terms.service(item.name))
                            .font(.system(size: 15, weight: .semibold))
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
                    .formGlass(18, selected: on)
                }
                .buttonStyle(.press)
                .accessibilityAddTraits(on ? [.isSelected] : [])
            }
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
                Text(L("order.discounted"))
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Brand.boardMuted)

                TextField(money(listTotal, currency), text: $discountText)
                    .keyboardType(.numberPad)
                    .focused($typingDiscount)
                    .multilineTextAlignment(.leading)
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
            .background(Brand.boardControl, in: .rect(cornerRadius: 18, style: .continuous))
            // касание принимает вся коробка, а не только набранные цифры
            .contentShape(.rect)
            .onTapGesture { typingDiscount = true }
            .padding(.top, 12)
        } else if !chosen.isEmpty {
            Button {
                showDiscount = true
            } label: {
                Text(L("order.giveDiscount"))
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Brand.grape)
                    .frame(minHeight: 44, alignment: .leading)
                    .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .padding(.top, 4)
        }
    }

    // ══════════════════════════ кто мыл ══════════════════════════

    /// Коллеги точки. Себя из списка убрал `Session`: автор записи
    /// участник по определению.
    private var mates: [API.CrewMate] { session.mates }

    /* Выбирать можно только тех, кто на смене. Остальные в списке не
       стоят: сервер такую запись всё равно не примет, и показывать имя,
       по которому придёт отказ, значит обещать несуществующее. */
    private var working: [API.CrewMate] { mates.filter(\.working) }

    /// Общий процент команды. Пусто — свойство у бизнеса выключено.
    private var teamPercent: Int? { session.teamPercent }

    /**
     * Совместная работа предлагается, только когда её есть с кем делать и
     * когда владелец назначил общий процент. Иначе выбор «кто мыл» —
     * управление, которое ничего не меняет: его придётся прочитать, чтобы
     * это понять, а читают его сорок раз за смену.
     */
    private var canShare: Bool { teamPercent != nil && !mates.isEmpty }

    /// Отмеченные, оставшиеся в списке. Владелец мог уволить человека,
    /// пока экран открыт; считаем по тому, что видно.
    private var crewIds: [String] {
        guard canShare, together else { return [] }
        return working.map(\.id).filter { helpers.contains($0) }
    }

    private var crewSize: Int { crewIds.count + 1 }

    /// Своя доля — тем же кодом, которым её посчитает сервер.
    private var myShare: Int {
        Crew.shares(price: charged, percent: teamPercent ?? 0, people: crewSize).first ?? 0
    }

    private var teamPool: Int {
        Crew.pool(price: charged, percent: teamPercent ?? 0)
    }

    @ViewBuilder
    private var crewRow: some View {
        if canShare {
            section(L("crew.who"))

            HStack(spacing: 8) {
                choice(L("crew.onlyMe"), on: !together) {
                    together = false
                    /* Отметки снимаем сразу. Оставленные «на потом» они не
                       видны — список свёрнут, — а уходят на сервер и делят
                       деньги молча. */
                    helpers = []
                }
                choice(L("crew.together"), on: together) { together = true }
            }

            if together {
                Flow(spacing: 8) {
                    ForEach(working) { mate in
                        let on = helpers.contains(mate.id)
                        Button {
                            UIImpactFeedbackGenerator(style: .soft).impactOccurred()
                            if on {
                                helpers.remove(mate.id)
                            } else if crewSize < Crew.maxSize {
                                helpers.insert(mate.id)
                            }
                        } label: {
                            HStack(spacing: 7) {
                                Circle()
                                    .fill(Brand.person(mate.name))
                                    .frame(width: 8, height: 8)
                                Text(mate.name)
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(on ? Brand.onLime : Brand.onBoard)
                            }
                            .padding(.horizontal, 14)
                            .frame(height: 44)
                            .background(
                                on ? Brand.lime : Brand.boardControl,
                                in: .rect(cornerRadius: 14, style: .continuous)
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.top, 10)

                /* Что получится — числами и до нажатия.
                 *
                 * Главное место всей затеи. Мойщик должен увидеть СВОЮ
                 * долю раньше, чем согласится на совместную запись, иначе
                 * вечером он узнает её из ведомости и решит, что его
                 * обсчитали.
                 *
                 * Пока никого не отметили — подсказка, а не расчёт: «фонд
                 * 5 000, каждому 5 000» на одном участнике не считает, а
                 * путает. */
                Group {
                    if working.isEmpty {
                        /* Коллеги в бизнесе есть, но все вне смены.
                           Молчать здесь нельзя: пустой список читается
                           как поломка, а причина у него рабочая и
                           поправимая — человеку надо встать на смену на
                           своём телефоне. */
                        Text(L("crew.nobodyOnShift"))
                            .foregroundStyle(Brand.warnOnBoard)
                    } else if crewIds.isEmpty {
                        Text(L("crew.percentHint"))
                            .foregroundStyle(Brand.boardMuted)
                    } else {
                        Text(
                            Terms.staff(crewSize, session.tenant?.staffRole ?? "")
                                + " · " + L("crew.teamPercent") + " \(teamPercent ?? 0)%\n"
                                + L("crew.pool") + " " + money(teamPool, currency)
                                + " · " + L("crew.yours") + " " + money(myShare, currency)
                        )
                        .foregroundStyle(Brand.goodOnBoard)
                    }
                }
                .font(.system(size: 13, weight: .medium))
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 10)
            }
        }
    }

    /// Один из двух равноправных выходов: разница только в заливке.
    private func choice(_ label: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button {
            UIImpactFeedbackGenerator(style: .soft).impactOccurred()
            action()
        } label: {
            Text(label)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(on ? Brand.onLime : Brand.onBoard)
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .background(
                    on ? Brand.lime : Brand.boardControl,
                    in: .rect(cornerRadius: 18, style: .continuous)
                )
        }
        .buttonStyle(.plain)
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
                Text(L("work.toPay"))
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
                        .background(on ? Brand.boardInk : Color.clear, in: .rect(cornerRadius: 18, style: .continuous))
                        .formGlass(18, selected: false)
                        .opacity(1)
                    }
                    .buttonStyle(.press)
                    .accessibilityAddTraits(on ? [.isSelected] : [])
                }
            }
            .animation(reduceMotion ? nil : .snappy(duration: Motion.normal), value: payment)

            /* Последнее движение — отдельная кнопка, и на ней написано,
               что произойдёт и за сколько.

               Раньше запись делало касание по способу оплаты: экономило
               одно движение и стоило дорого. Между «выбрал наличные» и
               «машина записана» не оставалось ничего, что можно прочитать
               и передумать, а промах по соседней плитке записывал не тот
               способ оплаты и правился только отменой всей записи.

               ПОСЛЕ ЗАПИСИ ЛИСТ ЗАКРЫВАЕТСЯ. Раньше он оставался и
               очищался — «мойщик записывает машины подряд». На деле это
               отвечало не на тот вопрос: после нажатия человек хочет
               увидеть, что машина записалась, а пустой лист на её месте
               выглядит так, будто ничего не произошло и надо набирать
               заново. Подтверждение, которому верят, — машина в журнале
               смены и выросший счётчик; они на экране под листом, туда и
               возвращаемся. */
            /* Занято и погашено — разные состояния, и до сих пор они
               выглядели одинаково: кнопка гасла до 45 процентов и когда
               не хватало номера, и когда запись уже летела на сервер.
               Первое значит «дозаполни», второе «принято, идёт», и
               мойщик, который видит одно и то же, начинает жать ещё раз.

               Теперь бледнеет только неполная запись. Занятая кнопка
               остаётся в полном цвете и показывает, что делает. */
            HStack(spacing: 10) {
                /* Камера — внизу, рядом с записью, а не у поля: так
                   попросил владелец. Первое движение мойщика с мокрыми
                   руками — навести камеру, и большой квадрат у большого
                   пальца ближе, чем кружок наверху. Только для номеров и
                   только там, где камера есть; ручной ввод остаётся
                   всегда — номер бывает грязный, гнутый или иностранный. */
                if session.tenant?.clientIdType == "plate", PlateScannerView.isAvailable {
                    Button {
                        typing = false
                        withAnimation(
                            reduceMotion
                                ? .easeOut(duration: Motion.fast)
                                : .spring(response: 0.34, dampingFraction: 0.92)
                        ) {
                            scanning.toggle()
                        }
                    } label: {
                        Image(systemName: scanning ? "xmark" : "camera.viewfinder")
                            .font(.system(size: 22, weight: .semibold))
                            .foregroundStyle(scanning ? Brand.onBoard : Brand.grape)
                            .contentTransition(.symbolEffect(.replace.magic(fallback: .downUp)))
                            .frame(width: 58, height: 58)
                            .background(
                                scanning ? Brand.boardControl : Brand.grape.opacity(0.10),
                                in: .rect(cornerRadius: R.card, style: .continuous)
                            )
                    }
                    .buttonStyle(.press)
                    .accessibilityLabel(scanning ? L("order.closeCamera") : L("order.openCamera"))
                }

                Button {
                    record()
                } label: {
                    Text(L("work.addFor", Terms.unit(session.tenant?.unitOne ?? "").acc, money(charged, currency)))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
                .accessibilityIdentifier("order.save")
                .buttonStyle(LimeButton(loading: sending, busyTitle: L("order.saving")))
                .disabled(!canRecord || sending)
                .opacity(canRecord ? 1 : 0.45)
                .shadow(color: Brand.lime.opacity(canRecord ? 0.4 : 0), radius: 16, y: 6)
                .animation(.easeOut(duration: Motion.normal), value: canRecord)
            }

            if saveFailed {
                /* Единственная ошибка, которая приходит не с сервера, а с
                   собственного диска. Под кнопкой, а не поверх формы:
                   набранное должно остаться на виду. */
                Text(L("order.saveFailed"))
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Brand.badOnBoard)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 8)
                    .transition(.opacity)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 8)
        .background(Brand.boardSurface.ignoresSafeArea(edges: .bottom))
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
        saveFailed = false

        let item = OrderQueue.Item(
                ref: UUID().uuidString,
                clientKey: normalizedClientKey(clientKey),
                // старое поле заполняем всегда: очередь могла быть записана
                // этой версией, а отправлена — после отката на прежнюю
                serviceId: first.id,
                serviceIds: chosen.map(\.id),
                serviceName: chosen.map { Terms.service($0.name) }.joined(separator: " + "),
                price: charged,
                listPrice: listTotal,
                payment: payment,
                // словом, а не номером: список классов мог смениться, пока
                // запись лежала в очереди без связи
                tier: tier.flatMap { tiers[safe: $0] },
                // чья мойка: очередь переживает переключение точки
                tenantId: session.tenant?.id,
                // кто ещё мыл; пусто — одиночная запись, как и была
                participants: crewIds.isEmpty ? nil : crewIds,
                at: Date()
        )

        do {
            try queue.add(item)
        } catch {
            /* Диск отказал. «Готово» здесь было бы ложью: запись не
               пережила бы перезапуск. Форма остаётся с набранным, человек
               нажимает ещё раз — или переписывает машину на бумажку, но
               знает об этом. */
            sending = false
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            withAnimation(reduceMotion ? nil : .easeOut(duration: Motion.normal)) { saveFailed = true }
            return
        }

        UINotificationFeedbackGenerator().notificationOccurred(.success)

        Task { @MainActor in
            /* Сначала перечитываем смену, потом закрываем лист: иначе
               человек на мгновение увидит журнал БЕЗ своей машины — то
               есть ровно то, чего боится, нажимая кнопку.

               Но ждём недолго. Без связи сверка упирается в сетевой
               таймаут, и кнопка держала человека на «Պահպանում ենք…» до
               двадцати секунд — при том что запись уже надёжно лежит в
               очереди. Секунды с половиной хватает живой связи с
               запасом; не успела — закрываемся, смена покажет запись
               плашкой «ждёт отправки», а очередь дошлёт её сама, как
               только связь вернётся. */
            await withTaskGroup(of: Void.self) { group in
                group.addTask { await onDone() }
                group.addTask { try? await Task.sleep(for: .seconds(1.5)) }
                await group.next()
                group.cancelAll()
            }
            clear()
            sending = false
            dismiss()
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
        /* Состав сбрасывается вместе со всем остальным. Соблазн оставить
           его «до конца смены» есть — бригада за день не меняется, — но
           цена ошибки несимметрична: забытая галочка запишет коллеге
           чужую машину и уполовинит заработок тому, кто мыл её один. */
        together = false
        helpers = []
        typing = true
    }

    private func acceptDetected(_ plate: String) {
        clientKey = PlateReader.canonical(plate)
        withAnimation(
            reduceMotion
                ? .easeOut(duration: Motion.fast)
                : .spring(response: 0.34, dampingFraction: 0.92)
        ) {
            scanning = false
            detectedPlate = plate
        }

        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(reduceMotion ? 350 : 850))
            withAnimation(
                reduceMotion
                    ? .easeOut(duration: Motion.fast)
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

/**
 * Матовое стекло формы — то же, что у плиток на смене: белёсая
 * заливка с сиреневым низом, белая грань и тонкая грейповая. Выбранное
 * заливается лаймом целиком; стекло у него не остаётся.
 */
extension View {
    func formGlass(_ radius: CGFloat, selected: Bool = false) -> some View {
        background {
            if selected {
                RoundedRectangle(cornerRadius: radius, style: .continuous).fill(Brand.lime)
            } else {
                LinearGradient(
                    colors: [
                        adaptivePublic(light: 0xFAF8FE, dark: 0x1F1A2C),
                        adaptivePublic(light: 0xEEE8F9, dark: 0x181425),
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .clipShape(.rect(cornerRadius: radius, style: .continuous))
            }
        }
        .overlay {
            if !selected {
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(Brand.grapeFill.opacity(0.12), lineWidth: 0.8)
            }
        }
    }
}
