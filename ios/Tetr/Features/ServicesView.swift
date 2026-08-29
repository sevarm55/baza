import SwiftUI

/**
 * Прайс.
 *
 * Услуги плитками в поток, теми же, что в записи машины. Список во всю
 * ширину показывал четыре услуги на экран и заставлял прокручивать; в поток
 * те же четыре встают в два ряда и видны сразу — а главное, прайс здесь
 * выглядит ровно так же, как в момент выбора, и владелец правит то, что
 * потом сам и нажимает.
 *
 * Правка цены не трогает прошлые записи: в каждом заказе лежит снимок.
 * Поэтому цены можно менять хоть каждый день — вчерашняя выручка и зарплаты
 * останутся прежними. Об этом сказано прямо на экране: без этой строчки
 * цену боятся трогать.
 */
struct ServicesView: View {
    @EnvironmentObject private var session: Session

    @State private var services: [API.Service] = []
    @State private var editing: API.Service?
    @State private var adding = false
    @State private var editingTiers = false
    @State private var loaded = false
    /**
     * Почему список пуст.
     *
     * Пусто и «не доехало» — разные ответы, и до сих пор экран давал на
     * оба один: `try?` глотал отказ, `loaded` вставало в `true`, и
     * человек читал «пока ничего нет» о списке, который просто не
     * привезли.
     *
     * Причина отдельной строкой и только когда она известна точнее, чем
     * «не вышло»: пропавшая связь — совет, который можно выполнить, а
     * код ответа сервера владельцу мойки не говорит ничего.
     */
    @State private var failed = false
    @State private var failNote: String?

    private var currency: String { session.tenant?.currency ?? "AMD" }
    private var tiers: [String] { session.tenant?.tiers ?? [] }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                if loaded && !services.isEmpty { reading }

                serviceRail

                if !loaded {
                    Delayed(active: true) { TetrSkeletonList(rows: 5) }
                        .padding(.horizontal, 4)
                } else if failed, services.isEmpty {
                    TetrFailure(
                        title: L("common.loadFailed"),
                        note: failNote,
                        retry: { await reload() }
                    )
                } else if services.isEmpty {
                    servicesEmpty
                }

                tiersButton

                Text(L("services.priceNote"))
                    .font(.system(size: 12))
                    .foregroundStyle(Brand.boardMuted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 6)
                    .padding(.top, 6)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 28)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.board.ignoresSafeArea())
        /* Полоска захвата видима нарочно: лист и раньше закрывался
           смахиванием, но без неё об этом никто не догадывался и искал
           кнопку. */
        /* Половина экрана, а не весь.
           Правка цены — это одно число, и лист во весь рост под неё
           закрывал прайс целиком: человек переставал видеть, относительно
           чего он эту цену ставит. На половине список остаётся на виду, а
           кому мало — тянет лист вверх, вторая высота на месте. */
        .sheet(item: $editing) { service in
            ServiceEditor(service: service, currency: currency) { await reload() }
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $adding) {
            ServiceEditor(service: nil, currency: currency) { await reload() }
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $editingTiers) {
            TierEditor { await reload() }
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .task { await reload() }
        .refreshable { await reload() }
    }

    private var servicesEmpty: some View {
        VStack(spacing: 15) {
            ZStack {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(Brand.grape.opacity(0.09))
                    .frame(width: 126, height: 78)

                VStack(spacing: 7) {
                    ForEach(Array(([CGFloat(0.72), 0.52, 0.86]).enumerated()), id: \.offset) { index, width in
                        HStack(spacing: 8) {
                            RoundedRectangle(cornerRadius: 3, style: .continuous)
                                .fill(index == 1 ? Brand.sandInk : Brand.grape)
                                .frame(width: 7, height: 7)
                            Capsule()
                                .fill(Brand.boardInk.opacity(0.13))
                                .frame(width: 68 * width, height: 6)
                            Spacer(minLength: 0)
                            Capsule()
                                .fill(Brand.boardInk.opacity(0.22))
                                .frame(width: 21, height: 6)
                        }
                    }
                }
                .padding(.horizontal, 15)
                .frame(width: 126)
            }

            Text(L("services.empty"))
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Brand.onBoard)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
    }

    /// «5 000 — 9 000 ֏», когда у услуги разные цены по классам.
    ///
    /// Диапазон, а не первая цена: список прайса должен показывать, что
    /// цена не одна, — иначе владелец правит седан и думает, что поправил
    /// всё.
    private func priceLabel(_ service: API.Service) -> String {
        let all = (0..<max(1, tiers.count)).map { service.price(tier: tiers.isEmpty ? nil : $0) }
        let low = all.min() ?? service.price
        let high = all.max() ?? service.price
        return low == high ? money(low, currency) : "\(money(low, currency)) — \(money(high, currency))"
    }

    /**
     * Обложка прайса.
     *
     * Была плашка грейпом во всю ширину: белый текст, лаймовая надпись,
     * сумма справа. Она весила больше самого прайса, хотя говорит одно
     * число, и первым на экране читалась заливка, а не цены.
     *
     * Теперь это бумага, как и всё под ней. Работает разница размеров, а
     * не разница цвета: средний чек набран крупно и чернилами, число услуг
     * стоит рядом мелким и приглушённым. Имя раздела ушло совсем — оно уже
     * написано в панели сверху, и повторять его значило бы отдать
     * заголовку треть первого экрана.
     */
    private var reading: some View {
        let avg = services.isEmpty ? 0 : services.reduce(0) { $0 + $1.price } / services.count

        return HStack(alignment: .bottom, spacing: 16) {
            VStack(alignment: .leading, spacing: 3) {
                Text(L("services.avgPrice"))
                    .font(.system(size: 11, weight: .black, design: .rounded))
                    .tracking(1.3)
                    .foregroundStyle(Brand.boardMuted)
                Text(money(avg, currency))
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Brand.onBoard)
                    .lineLimit(1)
                    .minimumScaleFactor(0.55)
                    // сумма меняется цифрами на месте, а не подменой строки
                    .contentTransition(.numericText(value: Double(avg)))
            }

            Spacer(minLength: 8)

            Text(L("services.count", services.count))
                .font(.system(size: 13))
                .monospacedDigit()
                .foregroundStyle(Brand.boardMuted)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Brand.boardSurface, in: .rect(cornerRadius: 28, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .strokeBorder(Brand.boardInk.opacity(0.07), lineWidth: 0.8)
        }
    }

    /**
     * Список, а не лента.
     *
     * Услуги лежали горизонтальными билетами: чтобы увидеть пятую, надо
     * было листать вбок, а сколько их всего — не понять вовсе. Прайс
     * читают сверху вниз, сравнивая цены столбиком; вбок его не читает
     * никто.
     */
    private var serviceRail: some View {
        VStack(spacing: 0) {
            ForEach(Array(services.enumerated()), id: \.element.id) { index, service in
                Button {
                    editing = service
                } label: {
                    HStack(spacing: 12) {
                        Text(Terms.service(service.name))
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Brand.onBoard)
                            .lineLimit(1)

                        Spacer(minLength: 8)

                        Text(money(service.price, currency))
                            .font(.system(size: 15, weight: .bold))
                            .monospacedDigit()
                            .foregroundStyle(Brand.onBoard)

                        Image(systemName: "chevron.right")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(Brand.boardMuted)
                    }
                    .padding(.horizontal, 14)
                    .frame(minHeight: 54)
                }
                .buttonStyle(.press)

                if index < services.count - 1 {
                    Divider().overlay(Brand.boardInk.opacity(0.07)).padding(.leading, 14)
                }
            }

            if !services.isEmpty {
                Divider().overlay(Brand.boardInk.opacity(0.07)).padding(.leading, 14)
            }

            /* Добавление — последней строкой списка, а не отдельной
               плиткой: новая услуга встаёт туда же, где уже стоят
               остальные, и глазу не нужно искать другое место. */
            Button {
                adding = true
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "plus")
                        .font(.system(size: 13, weight: .bold))
                    Text(L("settings.newService"))
                        .font(.system(size: 15, weight: .semibold))
                    Spacer()
                }
                .foregroundStyle(Brand.grape)
                .padding(.horizontal, 14)
                .frame(minHeight: 52)
            }
            .buttonStyle(.press)
        }
        .background(Brand.boardSurface, in: .rect(cornerRadius: 22, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .strokeBorder(Brand.boardInk.opacity(0.07), lineWidth: 0.8)
        }
    }

    private var tiersButton: some View {
        Button {
            editingTiers = true
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "square.stack.3d.up")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Brand.grape)
                    .frame(width: 44, height: 44)
                    .background(Brand.boardInk.opacity(0.07), in: .circle)
                VStack(alignment: .leading, spacing: 1) {
                    Text(tiers.isEmpty
                         ? L("services.addTiers")
                         : "\(session.tenant?.tierLabel ?? "Դաս") · \(tiers.joined(separator: ", "))")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Brand.onBoard)
                        .lineLimit(1)
                    Text(tiers.isEmpty
                         ? L("services.tiersExample")
                         : L("services.tiersNote"))
                        .font(.system(size: 12))
                        .foregroundStyle(Brand.boardMuted)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Brand.boardSurface, in: .rect(cornerRadius: 22, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .strokeBorder(Brand.boardInk.opacity(0.07), lineWidth: 0.8)
            }
        }
        .buttonStyle(.press)
    }

    private func reload() async {
        do {
            let result = try await session.authed { token in
                try await APIClient.shared.send("services", token: token, as: API.Services.self)
            }
            services = result.services
            failed = false
            failNote = nil
        } catch is CancellationError {
            // потянули вниз и отпустили: ничего не сломалось
            return
        } catch let error as APIError {
            failed = true
            failNote = error.isOffline ? L("common.offlineNote") : nil
        } catch {
            failed = true
            failNote = nil
        }
        loaded = true
    }
}

/**
 * Правка одной услуги.
 *
 * Отдельным листом, а не строкой на месте: цена — то, что меняют редко и
 * осознанно, и случайное касание менять её не должно.
 *
 * Цена набирается крупно и первой, как сумма расхода: правят обычно именно
 * её, а название заведено один раз и навсегда.
 */
struct ServiceEditor: View {
    let service: API.Service?
    let currency: String
    let onSave: () async -> Void

    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var price = ""
    /// Цены по классам, по одной строке на класс. Первая — она же базовая.
    @State private var tierPrices: [String] = []
    @State private var busy = false
    @State private var archiving = false
    /// Почему не сохранилось. Пусто — всё в порядке.
    @State private var error: String?
    @FocusState private var typingPrice: Bool

    @EnvironmentObject private var sessionForTiers: Session

    private var tiers: [String] { sessionForTiers.tenant?.tiers ?? [] }
    private var isNew: Bool { service == nil }

    /// Базовая цена: при включённых классах это цена первого из них.
    private var value: Int {
        tiers.isEmpty
            ? (Int(price.filter(\.isNumber)) ?? 0)
            : (Int((tierPrices.first ?? "").filter(\.isNumber)) ?? 0)
    }

    private var ready: Bool { !busy && !name.trimmingCharacters(in: .whitespaces).isEmpty && value > 0 }

    var body: some View {
        NavigationStack {
        ScrollView {
            VStack(spacing: 10) {
                /* Два вопроса — две группы, и порядок в них тот же, в
                   каком их задают: сначала «что это за услуга», потом
                   «сколько она стоит». Раньше и цены, и название лежали
                   одной безымянной стопкой, причём цены сверху, — и по
                   ней нельзя было понять, что вообще заводится: то ли
                   услуга, то ли прайс на что-то уже существующее. */
                caption(L("services.nameField"))

                FieldBox(L("owner.clientName"), fill: Brand.boardControl) {
                    TextField(L("services.namePlaceholder"), text: $name)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Brand.onBoard)
                }

                caption(tiers.isEmpty ? L("services.priceTitle") : L("services.priceByTier"))

                VStack(spacing: 0) {
                    if tiers.isEmpty {
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            TextField("0", text: $price)
                                .font(.system(size: 40, weight: .bold, design: .rounded))
                                .monospacedDigit()
                                .foregroundStyle(Brand.onBoard)
                                .keyboardType(.numberPad)
                                .focused($typingPrice)
                                .multilineTextAlignment(.center)
                                .fixedSize()
                            Text(currency == "AMD" ? "֏" : currency)
                                .font(.system(size: 20, weight: .semibold))
                                .foregroundStyle(Brand.boardMuted)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 18)
                        // по карточке целиком, а не по трём цифрам в её середине
                        .contentShape(.rect)
                        .onTapGesture { typingPrice = true }
                    } else {
                        /* По строке на класс. Крупного поля здесь нет
                           намеренно: когда цен три, ни одна из них не
                           главная, и выделять первую значило бы врать. */
                        ForEach(Array(tiers.enumerated()), id: \.offset) { i, tierName in
                            FieldBox(tierName) {
                                HStack(alignment: .firstTextBaseline, spacing: 5) {
                                    TextField("0", text: binding(for: i))
                                        .font(.system(size: 19, weight: .bold, design: .rounded))
                                        .monospacedDigit()
                                        .foregroundStyle(Brand.onBoard)
                                        .keyboardType(.numberPad)
                                        .fixedSize()
                                    Text(currency == "AMD" ? "֏" : currency)
                                        .font(.system(size: 13))
                                        .foregroundStyle(Brand.boardMuted)
                                    Spacer(minLength: 0)
                                }
                            }

                            if i < tiers.count - 1 {
                                Rectangle().fill(Brand.boardInk.opacity(0.07)).frame(height: 1)
                            }
                        }
                    }
                }
                .boardCard()

                if let error {
                    Label(error, systemImage: "exclamationmark.circle.fill")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Brand.badOnBoard)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                        .background(Brand.badOnBoard.opacity(0.09), in: .rect(cornerRadius: 18, style: .continuous))
                }

                if !isNew {
                    archiveRow
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 28)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.board.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) { saveBar }
        .alert(L("services.removeTitle"), isPresented: $archiving) {
            Button(L("common.cancel"), role: .cancel) {}
            Button(L("expenses.remove"), role: .destructive) { Task { await archive() } }
        } message: {
            Text(L("services.removeNote"))
        }
        .onAppear {
            name = service.map { Terms.service($0.name) } ?? ""
            price = service.map { String($0.price) } ?? ""
            // пустая цена класса означает «как базовая» — так её и
            // показываем: не подставляем базовую цифрой, иначе владелец
            // решит, что назначил её сам
            tierPrices = (0..<tiers.count).map { i in
                guard let own = service?.tierPrices?[safe: i], own > 0 else {
                    return i == 0 ? (service.map { String($0.price) } ?? "") : ""
                }
                return String(own)
            }
            if isNew && tiers.isEmpty { typingPrice = true }
        }
        /* Системная шапка вместо самодельного крестика в круге: та же
           скорлупа, что у остальных листов, — заголовок по центру и
           текстовое «Закрыть». */
        .navigationTitle(isNew ? L("settings.newService") : L("owner.colService"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(L("common.close")) { dismiss() }.disabled(busy)
            }
        }
        }
    }

    /// Строка цены класса. Массив может быть короче списка классов, если
    /// класс добавили только что, — дотягиваем на лету.
    /// Подпись над группой: маленькая, приглушённая, слева.
    private func caption(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(Brand.boardMuted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 6)
            .padding(.top, 6)
    }

    private func binding(for i: Int) -> Binding<String> {
        Binding(
            get: { tierPrices[safe: i] ?? "" },
            set: { v in
                while tierPrices.count <= i { tierPrices.append("") }
                tierPrices[i] = v
            }
        )
    }

    private var archiveRow: some View {
        Button {
            archiving = true
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "archivebox")
                    .font(.system(size: 15, weight: .semibold))
                    // токен, а не системный .red: в тёмной теме системный
                    // темнее и спорит с остальными знаками опасного
                    .foregroundStyle(Brand.badOnBoard)
                    .frame(width: 22)
                VStack(alignment: .leading, spacing: 1) {
                    Text(L("services.remove"))
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Brand.badOnBoard)
                    Text(L("services.removeNoteShort"))
                        .font(.system(size: 12))
                        .foregroundStyle(Brand.boardMuted)
                }
                Spacer(minLength: 0)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .boardCard()
        }
        .buttonStyle(.press)
        .disabled(busy)
        .padding(.top, 14)
    }

    private var saveBar: some View {
        Button {
            Task { await save() }
        } label: {
            Text(L("common.save"))
        }
        .buttonStyle(LimeButton(loading: busy, busyTitle: L("common.saving")))
        .disabled(!ready)
        .opacity(busy || ready ? 1 : 0.45)
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
        .background(Brand.board.ignoresSafeArea(edges: .bottom))
    }

    private func save() async {
        busy = true
        defer { busy = false }

        var payload: [String: Any] = ["name": name, "price": value]
        if let service { payload["id"] = service.id }
        if !tiers.isEmpty {
            // ноль — «как базовая»; сервер так это и понимает
            payload["tierPrices"] = tierPrices.map { Int($0.filter(\.isNumber)) ?? 0 }
        }

        /* Отказ — это отказ, а не повод закрыть лист. Раньше здесь стоял
           `try?`: сервер отвечал ошибкой, а человек получал вибрацию
           успеха и закрытый лист — то есть уверенность, что цена
           изменилась, которой не было. Сосед `TierEditor.save()` всегда
           делал это правильно; теперь одинаково. */
        do {
            _ = try await session.authed { token in
                try await APIClient.shared.raw("services", method: "POST", body: payload, token: token)
            }
        } catch let e as APIError {
            error = e.isOffline ? L("errors.offline") : L("errors.failedCode", e.code ?? "\(e.status)")
            return
        } catch {
            self.error = Failure.text(error)
            return
        }
        error = nil

        /* Прайс живёт в двух местах: на этом экране, чтобы его править, и в
           сессии, откуда его берёт экран записи. Обновлялось только первое —
           и цена, поставленная минуту назад, на записи оставалась прежней до
           перезапуска приложения. Хуже того, у услуги, заведённой до того как
           появились классы, в сессии не было `tierPrices` вовсе: переключение
           «седан / джип» на записи не меняло сумму никак, и это выглядело не
           устаревшими данными, а сломанными классами. */
        try? await session.loadBootstrap()

        UINotificationFeedbackGenerator().notificationOccurred(.success)
        await onSave()
        dismiss()
    }

    private func archive() async {
        guard let service else { return }
        busy = true
        defer { busy = false }

        // тот же контракт, что у save(): не прошло — лист остаётся с причиной
        do {
            _ = try await session.authed { token in
                try await APIClient.shared.raw(
                    "services/\(service.id)",
                    method: "DELETE",
                    token: token
                )
            }
        } catch let e as APIError {
            error = e.isOffline ? L("errors.offline") : L("errors.failedCode", e.code ?? "\(e.status)")
            return
        } catch {
            self.error = Failure.text(error)
            return
        }
        error = nil
        // и убранная услуга должна исчезнуть с экрана записи, а не остаться
        // там до перезапуска
        try? await session.loadBootstrap()
        await onSave()
        dismiss()
    }
}

/**
 * Классы бизнеса.
 *
 * У мойки это седан, кроссовер, джип. У барбершопа их может не быть вовсе,
 * а у клиники они называются иначе — поэтому здесь только слова, которые
 * владелец придумал сам, и слово, которым он их называет. Продукт про
 * «седаны» ничего не знает.
 *
 * Один класс запрещён: один вариант — это отсутствие вариантов, поданное
 * как выбор, и мойщик жал бы единственную кнопку сорок раз за смену.
 * Убрать все — выключить свойство: прайс возвращается к одной цене.
 *
 * Цены услуг при выключении не стираются. Класс вернут — вернутся и они:
 * наказывать потерей всего прайса за опечатку в названии нельзя.
 */
struct TierEditor: View {
    let onSave: () async -> Void

    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss

    @State private var label = ""
    @State private var names: [String] = []
    @State private var busy = false
    @State private var error: String?

    /// Больше шести классов — это уже не выбор, а список.
    private let limit = 6

    private var clean: [String] {
        names.map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    }

    private var ready: Bool { !busy && clean.count != 1 }

    var body: some View {
        NavigationStack {
        ScrollView {
            VStack(spacing: 10) {
                FieldBox(L("services.tierNameField"), fill: Brand.boardControl) {
                    TextField(L("work.tier"), text: $label)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Brand.onBoard)
                }

                VStack(spacing: 0) {
                    ForEach(names.indices, id: \.self) { i in
                        HStack(spacing: 12) {
                            Text("\(i + 1)")
                                .font(.system(size: 13, weight: .semibold))
                                .monospacedDigit()
                                .foregroundStyle(Brand.boardMuted)
                                .frame(width: 18, alignment: .leading)

                            TextField(L("services.tierPlaceholder"), text: binding(i))
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(Brand.onBoard)

                            /* Подтверждения нет намеренно: убирается
                               строка из черновика, настоящее удаление
                               случится только по «Сохранить». А вот цель
                               касания полная — раньше кружок был 22
                               точки, и палец попадал в соседнее поле. */
                            Button {
                                names.remove(at: i)
                            } label: {
                                Image(systemName: "minus.circle.fill")
                                    .font(.system(size: 17))
                                    .foregroundStyle(Brand.boardMuted.opacity(0.6))
                                    .frame(width: 44, height: 44)
                                    .contentShape(.rect)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(L("expenses.remove"))
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 2)

                        if i < names.count - 1 {
                            Rectangle().fill(Brand.boardInk.opacity(0.07)).frame(height: 1)
                        }
                    }

                    if names.count < limit {
                        if !names.isEmpty {
                            Rectangle().fill(Brand.boardInk.opacity(0.07)).frame(height: 1)
                        }
                        Button {
                            names.append("")
                        } label: {
                            HStack(spacing: 10) {
                                Image(systemName: "plus")
                                    .font(.system(size: 13, weight: .bold))
                                Text(L("services.addTier"))
                                    .font(.system(size: 15, weight: .semibold))
                                Spacer(minLength: 0)
                            }
                            .foregroundStyle(Brand.grape)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 14)
                        }
                        .buttonStyle(.press)
                    }
                }
                .boardCard()

                if let error {
                    Text(error)
                        .font(.system(size: 13))
                        .foregroundStyle(Brand.badOnBoard)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 4)
                }

                Text(clean.isEmpty
                     ? L("services.noTiersNote")
                     : L("services.tiersApplyNote", clean.count))
                    .font(.system(size: 12))
                    .foregroundStyle(Brand.boardMuted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 6)
                    .padding(.top, 4)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 28)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.board.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) { saveBar }
        .onAppear {
            label = session.tenant?.tierLabel ?? L("work.tier")
            names = session.tenant?.tiers ?? []
        }
        .navigationTitle(L("services.tiers"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(L("common.close")) { dismiss() }.disabled(busy)
            }
        }
        }
    }

    private func binding(_ i: Int) -> Binding<String> {
        Binding(
            get: { names[safe: i] ?? "" },
            set: { v in if names.indices.contains(i) { names[i] = v } }
        )
    }

    private var saveBar: some View {
        Button {
            Task { await save() }
        } label: {
            Text(L("common.save"))
        }
        .buttonStyle(LimeButton(loading: busy, busyTitle: L("common.saving")))
        .disabled(!ready)
        .opacity(busy || ready ? 1 : 0.45)
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
        .background(Brand.board.ignoresSafeArea(edges: .bottom))
    }

    private func save() async {
        busy = true
        defer { busy = false }
        error = nil

        do {
            _ = try await session.authed { token in
                try await APIClient.shared.raw(
                    "tiers",
                    method: "POST",
                    body: ["label": label, "tiers": clean],
                    token: token
                )
            }
            /* Перечитываем весь bootstrap, а не только тарифы: список
               классов меняет прайс, и услуги в памяти приложения обязаны
               приехать заново вместе с ним. */
            try? await session.loadBootstrap()
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            await onSave()
            dismiss()
        } catch {
            self.error = L("payroll.failed")
        }
    }
}
