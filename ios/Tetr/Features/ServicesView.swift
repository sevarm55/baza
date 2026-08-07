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

    private var currency: String { session.tenant?.currency ?? "AMD" }
    private var tiers: [String] { session.tenant?.tiers ?? [] }

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                if loaded { reading }

                Flow(spacing: 8) {
                    ForEach(services) { service in
                        Button {
                            editing = service
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(service.name)
                                    .font(.system(size: 15, weight: .semibold))
                                    .foregroundStyle(Brand.onBoard)
                                Text(priceLabel(service))
                                    .font(.system(size: 17, weight: .bold, design: .rounded))
                                    .monospacedDigit()
                                    .foregroundStyle(Brand.onBoard)
                            }
                            .padding(.horizontal, 15)
                            .padding(.vertical, 12)
                            .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 18))
                        }
                        .buttonStyle(.press)
                        .accessibilityElement(children: .combine)
                    }
                }

                if loaded && services.isEmpty {
                    Text("Գնացուցակը դատարկ է")
                        .font(.system(size: 14))
                        .foregroundStyle(Brand.boardMuted)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 44)
                }

                addButton
                tiersButton

                Text("Գնի փոփոխությունը չի ազդում արդեն կատարված գրանցումների վրա։")
                    .font(.system(size: 11.5))
                    .foregroundStyle(Brand.boardMuted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 6)
                    .padding(.top, 6)
            }
            .padding(.horizontal, 12)
            .padding(.top, 8)
            .padding(.bottom, 28)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.board.ignoresSafeArea())
        .sheet(item: $editing) { service in
            ServiceEditor(service: service, currency: currency) { await reload() }
        }
        .sheet(isPresented: $adding) {
            ServiceEditor(service: nil, currency: currency) { await reload() }
        }
        .sheet(isPresented: $editingTiers) {
            TierEditor { await reload() }
        }
        .task { await reload() }
        .refreshable { await reload() }
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

    /// Средний чек по прайсу — то, чего здесь не было: владелец правит
    /// цены по одной и не видит, куда съезжает уровень целиком.
    private var reading: some View {
        let avg = services.isEmpty ? 0 : services.reduce(0) { $0 + $1.price } / services.count

        return VStack(spacing: 0) {
            Text("Միջին գին գնացուցակում")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Brand.onBoard.opacity(0.85))
                .padding(.top, 6)

            Text(money(avg, currency))
                .font(.system(size: 44, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)
                .lineLimit(1)
                .minimumScaleFactor(0.45)
                .contentTransition(.numericText(value: Double(avg)))

            Text("\(services.count) ծառայություն")
                .font(.system(size: 12))
                .monospacedDigit()
                .foregroundStyle(Brand.boardMuted)
                .padding(.top, 6)
        }
        .frame(maxWidth: .infinity)
        .padding(.bottom, 6)
    }

    private var addButton: some View {
        Button {
            adding = true
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "plus")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Brand.grape)
                    .frame(width: 44, height: 44)
                    .background(Brand.boardInk.opacity(0.07), in: .circle)
                Text("Ավելացնել ծառայություն")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Brand.onBoard)
                Spacer(minLength: 0)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 24))
        }
        .buttonStyle(.press)
        .padding(.top, 10)
    }

    /**
     * Классы — отдельной строкой под прайсом.
     *
     * Здесь, а не в профиле: список классов меняет прайс целиком, и место
     * ему рядом с ценами, а не рядом с именем владельца.
     */
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
                         ? "Ավելացնել դասեր"
                         : "\(session.tenant?.tierLabel ?? "Դաս") · \(tiers.joined(separator: ", "))")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Brand.onBoard)
                        .lineLimit(1)
                    Text(tiers.isEmpty
                         ? "օրինակ՝ սեդան, կրոսովեր, ջիպ"
                         : "ամեն դասի՝ իր գինը")
                        .font(.system(size: 11.5))
                        .foregroundStyle(Brand.boardMuted)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 24))
        }
        .buttonStyle(.press)
    }

    private func reload() async {
        let result: API.Services? = try? await session.authed { token in
            try await APIClient.shared.send("services", token: token, as: API.Services.self)
        }
        if let result { services = result.services }
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
        ScrollView {
            VStack(spacing: 10) {
                header

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
                        .padding(.top, 18)
                        .padding(.bottom, 14)
                    } else {
                        /* По строке на класс. Крупного поля здесь нет
                           намеренно: когда цен три, ни одна из них не
                           главная, и выделять первую значило бы врать. */
                        ForEach(Array(tiers.enumerated()), id: \.offset) { i, tierName in
                            HStack(spacing: 12) {
                                Text(tierName)
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(Brand.onBoard)
                                Spacer(minLength: 8)
                                TextField("0", text: binding(for: i))
                                    .font(.system(size: 18, weight: .bold, design: .rounded))
                                    .monospacedDigit()
                                    .foregroundStyle(Brand.onBoard)
                                    .keyboardType(.numberPad)
                                    .multilineTextAlignment(.trailing)
                                    .fixedSize()
                                Text(currency == "AMD" ? "֏" : currency)
                                    .font(.system(size: 13))
                                    .foregroundStyle(Brand.boardMuted)
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 14)

                            Rectangle().fill(Brand.boardInk.opacity(0.07)).frame(height: 1)
                        }
                    }

                    if tiers.isEmpty {
                        Rectangle().fill(Brand.boardInk.opacity(0.07)).frame(height: 1)
                    }

                    HStack(spacing: 12) {
                        Text("Անուն")
                            .font(.system(size: 14))
                            .foregroundStyle(Brand.boardMuted)
                        Spacer(minLength: 8)
                        TextField("Կոմպլեքս", text: $name)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Brand.onBoard)
                            .multilineTextAlignment(.trailing)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 15)
                }
                .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 22))

                if !isNew {
                    archiveRow
                }
            }
            .padding(.horizontal, 12)
            .padding(.top, 8)
            .padding(.bottom, 28)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.board.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) { saveBar }
        .alert("Հեռացնե՞լ գնացուցակից", isPresented: $archiving) {
            Button("Չեղարկել", role: .cancel) {}
            Button("Հեռացնել", role: .destructive) { Task { await archive() } }
        } message: {
            Text("Գրանցումների պատմությունը մնում է տեղում։")
        }
        .onAppear {
            name = service?.name ?? ""
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
    }

    /// Строка цены класса. Массив может быть короче списка классов, если
    /// класс добавили только что, — дотягиваем на лету.
    private func binding(for i: Int) -> Binding<String> {
        Binding(
            get: { tierPrices[safe: i] ?? "" },
            set: { v in
                while tierPrices.count <= i { tierPrices.append("") }
                tierPrices[i] = v
            }
        )
    }

    private var header: some View {
        HStack {
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Brand.boardMuted)
                    .frame(width: 38, height: 38)
                    .background(Brand.boardInk.opacity(0.07), in: .circle)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Փակել")

            Spacer()

            Text(isNew ? "Նոր ծառայություն" : "Ծառայություն")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Brand.onBoard)

            Spacer()

            Color.clear.frame(width: 38, height: 38)
        }
        .padding(.bottom, 6)
    }

    private var archiveRow: some View {
        Button {
            archiving = true
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "archivebox")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.red)
                    .frame(width: 22)
                VStack(alignment: .leading, spacing: 1) {
                    Text("Հեռացնել գնացուցակից")
                        .font(.system(size: 14.5, weight: .semibold))
                        .foregroundStyle(.red)
                    Text("Գրանցումների պատմությունը մնում է տեղում")
                        .font(.system(size: 11.5))
                        .foregroundStyle(Brand.boardMuted)
                }
                Spacer(minLength: 0)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 22))
        }
        .buttonStyle(.press)
        .disabled(busy)
        .padding(.top, 14)
    }

    private var saveBar: some View {
        Button {
            Task { await save() }
        } label: {
            Text("Պահպանել")
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(Brand.onLime)
                .loading(busy, tint: Brand.onLime, size: 20)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(Brand.lime, in: .rect(cornerRadius: 22))
        }
        .buttonStyle(.press)
        .disabled(!ready)
        .opacity(ready ? 1 : 0.4)
        .padding(.horizontal, 12)
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

        _ = try? await session.authed { token in
            try await APIClient.shared.raw("services", method: "POST", body: payload, token: token)
        }
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        await onSave()
        dismiss()
    }

    private func archive() async {
        guard let service else { return }
        busy = true
        defer { busy = false }

        _ = try? await session.authed { token in
            try await APIClient.shared.raw(
                "services/\(service.id)",
                method: "DELETE",
                token: token
            )
        }
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
        ScrollView {
            VStack(spacing: 10) {
                header

                HStack(spacing: 12) {
                    Text("Ինչպես կոչվի")
                        .font(.system(size: 14))
                        .foregroundStyle(Brand.boardMuted)
                    Spacer(minLength: 8)
                    TextField("Դաս", text: $label)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Brand.onBoard)
                        .multilineTextAlignment(.trailing)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 15)
                .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 22))

                VStack(spacing: 0) {
                    ForEach(names.indices, id: \.self) { i in
                        HStack(spacing: 12) {
                            Text("\(i + 1)")
                                .font(.system(size: 13, weight: .semibold))
                                .monospacedDigit()
                                .foregroundStyle(Brand.boardMuted)
                                .frame(width: 18, alignment: .leading)

                            TextField("Սեդան", text: binding(i))
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(Brand.onBoard)

                            Button {
                                names.remove(at: i)
                            } label: {
                                Image(systemName: "minus.circle.fill")
                                    .font(.system(size: 17))
                                    .foregroundStyle(Brand.boardMuted.opacity(0.6))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Հեռացնել")
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 13)

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
                                Text("Ավելացնել դաս")
                                    .font(.system(size: 14.5, weight: .semibold))
                                Spacer(minLength: 0)
                            }
                            .foregroundStyle(Brand.grape)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 14)
                        }
                        .buttonStyle(.press)
                    }
                }
                .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 22))

                if let error {
                    Text(error)
                        .font(.system(size: 13))
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 4)
                }

                Text(clean.isEmpty
                     ? "Առանց դասերի ամեն ծառայություն ունի մեկ գին։"
                     : "Ամեն ծառայության մոտ կհայտնվի \(clean.count) գին։ Հին գրանցումները չեն փոխվում։")
                    .font(.system(size: 11.5))
                    .foregroundStyle(Brand.boardMuted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 6)
                    .padding(.top, 4)
            }
            .padding(.horizontal, 12)
            .padding(.top, 8)
            .padding(.bottom, 28)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.board.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) { saveBar }
        .onAppear {
            label = session.tenant?.tierLabel ?? "Դաս"
            names = session.tenant?.tiers ?? []
        }
    }

    private func binding(_ i: Int) -> Binding<String> {
        Binding(
            get: { names[safe: i] ?? "" },
            set: { v in if names.indices.contains(i) { names[i] = v } }
        )
    }

    private var header: some View {
        HStack {
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Brand.boardMuted)
                    .frame(width: 38, height: 38)
                    .background(Brand.boardInk.opacity(0.07), in: .circle)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Փակել")

            Spacer()

            Text("Դասեր")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Brand.onBoard)

            Spacer()

            Color.clear.frame(width: 38, height: 38)
        }
        .padding(.bottom, 6)
    }

    private var saveBar: some View {
        Button {
            Task { await save() }
        } label: {
            Text("Պահպանել")
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(Brand.onLime)
                .loading(busy, tint: Brand.onLime, size: 20)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(Brand.lime, in: .rect(cornerRadius: 22))
        }
        .buttonStyle(.press)
        .disabled(!ready)
        .opacity(ready ? 1 : 0.4)
        .padding(.horizontal, 12)
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
            self.error = "Չհաջողվեց։ Փորձեք կրկին։"
        }
    }
}
