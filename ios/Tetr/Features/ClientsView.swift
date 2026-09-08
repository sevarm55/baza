import SwiftUI

/**
 * База машин.
 *
 * Экран построен вокруг одного действия: позвонить тому, кто перестал
 * ездить. Вернуть старого клиента дешевле, чем привести нового, и всё
 * остальное на экране — способ до него добраться.
 *
 * Отсюда порядок сверху вниз:
 *
 *   1. кому звонить прямо сейчас → карусель карточек с трубкой;
 *   2. найти конкретную машину   → поиск;
 *   3. посмотреть кто вообще есть → полки и сетка номеров.
 *
 * Композиция сменилась целиком. Прежний экран открывался поиском, тремя
 * счётчиками и полосой сортировки — тремя органами управления подряд, и
 * ни один из них не был ответом. Счётчики за собой ничего не решали:
 * «постоянных 12» отвечало на вопрос, которого владелец мойки себе не
 * задаёт, а те, ради кого он сюда пришёл, лежали строчками ниже, среди
 * всех прочих.
 *
 * Теперь машина — не строка таблицы, а плитка с номером: номер и есть
 * имя клиента на мойке, и читается он с плитки быстрее, чем из строки,
 * где слева от него стоит точка, а справа деньги.
 */
struct ClientsView: View {
    @EnvironmentObject private var session: Session

    /// Через сколько дней молчания клиент считается потерянным.
    /// Число одно на приложение и на кабинет — см. `API.lostAfterDays`.
    private let lostAfter = API.lostAfterDays

    @State private var clients: [API.Client] = []
    @State private var loaded = false
    /**
     * Почему список пуст.
     *
     * Пусто и «не доехало» — разные ответы, и до сих пор экран давал на
     * оба один: `try?` глотал отказ, `loaded` вставало в `true`, и
     * человек читал «пока ничего нет» о списке, который просто не
     * привезли.
     */
    @State private var failed = false
    @State private var failNote: String?

    @State private var query = ""
    @FocusState private var typingQuery: Bool

    @State private var shelf: Shelf = .all
    @State private var sort: Sort = .recent
    @State private var opened: API.Client?

    /// Такт прихода: карусель, полки и сетка собираются по очереди.
    @State private var beat: Beat = .waiting

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /**
     * Полка: какую часть базы показывает сетка.
     *
     * Это отбор, а не порядок, и в этом отличие от прежней полосы
     * сортировки. Владелец приходит с вопросом «кто у меня постоянный»
     * или «кто заезжал впервые», а не «покажи всех, но в другом
     * порядке»: порядок сам по себе ни одного вопроса не закрывает.
     */
    private enum Shelf: Hashable { case all, loyal, fresh }

    /** Чем упорядочена сетка внутри полки.

        Ушло из полосы под поиском в меню: порядок нужен раз в месяц, а
        место занимал всегда. */
    private enum Sort: Hashable, CaseIterable {
        case recent, often, richest

        var label: String {
            switch self {
            case .recent: return L("owner.lastVisit")
            case .often: return L("owner.sortOften")
            case .richest: return L("owner.sortRichest")
            }
        }

        var symbol: String {
            switch self {
            case .recent: return "clock"
            case .often: return "repeat"
            case .richest: return "banknote"
            }
        }
    }

    private var currency: String { session.tenant?.currency ?? "AMD" }
    private var unitOne: String { session.tenant?.unitOne ?? "" }

    // ══════════════════════════ отбор ══════════════════════════

    /// Поиск по номеру, имени и телефону. Пробелы и регистр не в счёт:
    /// номер диктуют вслух и записывают как придётся — «93LM227» и
    /// «93 lm 227» это одна машина. Имя с телефоном владелец вписывает
    /// сам и человека помнит по ним, а не по шести символам номера.
    private func matching(_ base: [API.Client]) -> [API.Client] {
        let q = query.replacingOccurrences(of: " ", with: "").uppercased()
        guard !q.isEmpty else { return base }
        return base.filter { client in
            [client.key, client.name ?? "", client.phone ?? ""].contains {
                $0.replacingOccurrences(of: " ", with: "").uppercased().contains(q)
            }
        }
    }

    private func ordered(_ base: [API.Client]) -> [API.Client] {
        switch sort {
        case .recent: return base.sorted { $0.daysSince < $1.daysSince }
        case .often: return base.sorted { $0.visits > $1.visits }
        case .richest: return base.sorted { $0.total > $1.total }
        }
    }

    /// Был больше одного раза: тот же порог, что в кабинете.
    private var loyalAll: [API.Client] { clients.filter { $0.visits > 1 } }
    /// Был ровно один раз: вернётся или нет — ещё неизвестно.
    private var freshAll: [API.Client] { clients.filter { $0.visits == 1 } }
    private var lostAll: [API.Client] {
        clients.filter { $0.daysSince > lostAfter }.sorted { $0.total > $1.total }
    }

    private var shelved: [API.Client] {
        switch shelf {
        case .all: return clients
        case .loyal: return loyalAll
        case .fresh: return freshAll
        }
    }

    private var shown: [API.Client] { ordered(matching(shelved)) }

    /// Карусель «стоит позвонить» показывается, только пока не ищут:
    /// человек уже сказал, какая машина ему нужна, и звать его звонить
    /// другому в этот момент — перебивать.
    private var calling: [API.Client] { query.isEmpty ? lostAll : [] }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                search
                    .padding(.horizontal, 16)
                    .padding(.top, 6)

                if loaded {
                    if !calling.isEmpty {
                        callBack
                            .padding(.top, 20)
                            .reveal(beat, step: 0)
                    }

                    if !clients.isEmpty {
                        shelves
                            .padding(.horizontal, 16)
                            .padding(.top, calling.isEmpty ? 16 : 26)
                            .reveal(beat, step: 1)
                    }
                }

                if !loaded {
                    Delayed(active: true) { TetrScreenLoader(height: 280) }
                        .padding(.horizontal, 16)
                } else if failed, clients.isEmpty {
                    TetrFailure(
                        title: L("common.loadFailed"),
                        note: failNote,
                        retry: { await reload() }
                    )
                    .padding(.horizontal, 16)
                } else if clients.isEmpty {
                    emptyDatabase
                        .padding(.horizontal, 16)
                } else if shown.isEmpty {
                    emptyShelf
                        .padding(.horizontal, 16)
                } else {
                    grid
                        .padding(.horizontal, 16)
                        .padding(.top, 12)
                        .reveal(beat, step: 2)
                }
            }
            .padding(.bottom, 28)
        }
            /* Обновление вешается на саму прокрутку, а не в конец
               цепочки. Снаружи оно попадает в окружение всего, что ниже,
               включая листы: форма найма наследовала «потянуть, чтобы
               обновить», отвечала на движение вниз загрузчиком и не
               давала закрыть себя смахиванием. */
            .refreshable { await reload() }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .meshPage()
        .brandTitleFont()
        .navigationTitle(L("owner.tabClients"))
        .navigationSubtitle(subtitle)
        .toolbarTitleDisplayMode(.inlineLarge)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { sortMenu }
        }
        .task { await reload() }
        .sheet(item: $opened) { client in
            ClientHistoryView(client: client, currency: currency)
                .environmentObject(session)
        }
    }

    /// Подзаголовок панели: сколько машин в базе. Число здесь уместно —
    /// это подпись к разделу, а не показание, за которым идут.
    private var subtitle: String {
        guard loaded, !clients.isEmpty else { return "" }
        return Terms.units(clients.count, unitOne).trimmingCharacters(in: .whitespaces)
    }

    // ══════════════════════════ поиск и порядок ══════════════════════════

    /// Поиск капсулой на бумаге: тот же орган, что фишки на соседних
    /// экранах, и он же первое, что видно под заголовком.
    private var search: some View {
        HStack(spacing: 9) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Brand.muted)

            /* Подсказка называет всё, по чему ищут. Стояло «по номеру
               машины», а поиск шёл ещё по имени и телефону — и имя,
               вписанное вчера, искали номером и не находили. */
            TextField(L("owner.clientsSearch"), text: $query)
                .focused($typingQuery)
                .font(.system(size: 16))
                .foregroundStyle(Brand.ink)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.characters)
                .submitLabel(.search)

            if !query.isEmpty {
                Button {
                    query = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 16))
                        .foregroundStyle(Brand.muted)
                }
                .buttonStyle(.plain)
                .transition(.scale.combined(with: .opacity))
            }
        }
        .padding(.horizontal, 16)
        .frame(height: 50)
        .background(Brand.paper, in: .capsule)
        .overlay(Capsule().strokeBorder(Brand.ink.opacity(0.08), lineWidth: 1))
        .shadow(color: Brand.ink.opacity(0.05), radius: 8, y: 3)
        // по всей капсуле, а не по буквам подсказки
        .contentShape(.capsule)
        .onTapGesture { typingQuery = true }
        .animation(.easeOut(duration: Motion.fast), value: query.isEmpty)
    }

    private var sortMenu: some View {
        Menu {
            Picker("", selection: $sort) {
                ForEach(Sort.allCases, id: \.self) { option in
                    Label(option.label, systemImage: option.symbol).tag(option)
                }
            }
        } label: {
            Image(systemName: "arrow.up.arrow.down")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Brand.ink)
        }
        .accessibilityLabel(sort.label)
    }

    // ══════════════════════════ кому звонить ══════════════════════════

    /**
     * Карусель «стоит позвонить».
     *
     * Ровно то, ради чего в базу заходят, и поэтому оно наверху, до
     * поиска по всем. Карточка в янтарном тоне — не украшение: янтарь в
     * продукте значит «нужно внимание», и он же стоит на строке срока
     * подписки.
     *
     * Порядок по деньгам, а не по давности: между тем, кто оставил сто
     * тысяч и пропал, и тем, кто заехал раз на две тысячи, звонить
     * начинают с первого.
     *
     * Трубка гаснет, когда телефона нет: владелец вписывает его сам, и
     * у половины базы его не будет. Кнопка, которая ничего не делает,
     * хуже её отсутствия — по ней жмут и не понимают, сломалось или так.
     */
    private var callBack: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Text(L("clients.worthCalling").uppercased())
                    .font(.system(size: 11, weight: .black, design: .rounded))
                    .tracking(1.3)
                    .foregroundStyle(Brand.warnOnBoard)
                Text("\(calling.count)")
                    .font(.system(size: 11, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(Brand.warnOnBoard.opacity(0.7))
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 20)

            ScrollView(.horizontal) {
                LazyHStack(spacing: 12) {
                    ForEach(calling) { client in
                        callCard(client)
                            .containerRelativeFrame(.horizontal) { width, _ in
                                calling.count > 1 ? width - 76 : width - 32
                            }
                    }
                }
                .scrollTargetLayout()
            }
            .contentMargins(.horizontal, 16, for: .scrollContent)
            .scrollTargetBehavior(.viewAligned)
            .scrollIndicators(.hidden)
            .scrollClipDisabled()
        }
    }

    private func callCard(_ client: API.Client) -> some View {
        let phone = client.phone.flatMap { $0.isEmpty ? nil : $0 }

        return Button {
            opened = client
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .top, spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(client.key)
                            .font(.system(size: 22, weight: .heavy, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(Brand.ink)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                        /* Вторая строка — то, чем человека зовут: имя,
                           если владелец его вписал, иначе телефон. Когда
                           нет ни того ни другого, честно сказано, что
                           звонить некуда: гаснущая трубка справа это
                           показывает знаком, а строка — словами. */
                        Text(client.name?.isEmpty == false ? client.name! : (phone ?? L("owner.clientNoPhone")))
                            .font(.system(size: 13))
                            .monospacedDigit()
                            .foregroundStyle(phone == nil && client.name?.isEmpty != false ? Brand.warnOnBoard.opacity(0.8) : Brand.muted)
                            .lineLimit(1)
                    }

                    Spacer(minLength: 0)

                    /* Звонок — отдельной кнопкой поверх карточки: сама
                       карточка ведёт в историю машины, и одно нажатие не
                       может значить два разных дела. */
                    if let phone, let url = URL(string: "tel:\(phone)") {
                        Button {
                            UIApplication.shared.open(url)
                        } label: {
                            Image(systemName: "phone.fill")
                                .font(.system(size: 17, weight: .semibold))
                                .foregroundStyle(Brand.onLime)
                                .frame(width: 48, height: 48)
                                .background(Brand.lime, in: .circle)
                                .shadow(color: Brand.lime.opacity(0.5), radius: 10, y: 4)
                                .contentShape(.circle)
                        }
                        .buttonStyle(.press)
                        .accessibilityLabel(L("owner.clientCall"))
                    } else {
                        Image(systemName: "phone.badge.waveform")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Brand.warnOnBoard.opacity(0.55))
                            .frame(width: 48, height: 48)
                            .background(Brand.warnOnBoard.opacity(0.12), in: .circle)
                    }
                }

                Spacer(minLength: 16)

                Text(Ln("clients.daysAgo", client.daysSince))
                    .font(.system(size: 15, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(Brand.warnOnBoard)
                    .lineLimit(1)

                HStack(spacing: 6) {
                    Text(money(client.total, currency))
                        .font(.system(size: 13, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(Brand.ink)
                    Text("·")
                        .foregroundStyle(Brand.muted)
                    Text(Ln("clients.visitsCount", client.visits))
                        .font(.system(size: 13))
                        .monospacedDigit()
                        .foregroundStyle(Brand.muted)
                    Spacer(minLength: 0)
                }
                .padding(.top, 2)
            }
            .padding(18)
            .frame(height: 172, alignment: .topLeading)
            .background {
                ZStack(alignment: .topTrailing) {
                    LinearGradient(
                        colors: [Brand.warnOnBoard.opacity(0.16), Brand.warnOnBoard.opacity(0.06)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                    Brand.paper.opacity(0.35)
                }
            }
            .clipShape(.rect(cornerRadius: 26, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 26, style: .continuous)
                    .strokeBorder(Brand.warnOnBoard.opacity(0.28), lineWidth: 1.2)
            }
            .shadow(color: Brand.warnOnBoard.opacity(0.18), radius: 14, y: 8)
            .contentShape(.rect)
        }
        .buttonStyle(.press)
    }

    // ══════════════════════════ полки ══════════════════════════

    /// Три полки пилюлей: вся база, постоянные, новые. Счётчик внутри
    /// пилюли — тот же ответ, что давали три отдельных счётчика, только
    /// он же и есть орган переключения.
    private var shelves: some View {
        PillTabs(
            items: [
                (Shelf.all, "\(L("owner.allClients")) \(clients.count)"),
                (Shelf.loyal, "\(L("owner.clientsLoyal")) \(loyalAll.count)"),
                (Shelf.fresh, "\(L("owner.clientsFresh")) \(freshAll.count)"),
            ],
            selection: $shelf
        )
    }

    // ══════════════════════════ сетка ══════════════════════════

    /**
     * Машины плитками по две в ряд.
     *
     * Номер на плитке крупный и стоит один — так его находят глазами, а
     * не читают. В строке он всегда оказывался зажат между значком
     * слева и суммой справа, и список из тридцати номеров приходилось
     * просматривать построчно.
     *
     * Внизу плитки деньги и давность: два числа, по которым решают,
     * стоит ли открывать историю.
     */
    private var grid: some View {
        LazyVGrid(
            columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)],
            spacing: 10
        ) {
            ForEach(shown) { client in
                Button { opened = client } label: { tile(client) }
                    .buttonStyle(.press)
            }
        }
    }

    private func tile(_ client: API.Client) -> some View {
        let lost = client.daysSince > lostAfter
        let loyal = client.visits > 1

        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 6) {
                Text(client.key)
                    .font(.system(size: 19, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Brand.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.55)

                Spacer(minLength: 0)

                /* Один знак на плитку, не два. Постоянный — лаймовая
                   точка, пропавший — янтарная; быть и тем и другим
                   можно, но важнее второе, и оно перекрывает. */
                if lost {
                    Circle().fill(Brand.warnOnBoard).frame(width: 8, height: 8).padding(.top, 5)
                } else if loyal {
                    Circle().fill(Brand.good).frame(width: 8, height: 8).padding(.top, 5)
                }
            }

            Text(client.name?.isEmpty == false ? client.name! : " ")
                .font(.system(size: 12))
                .foregroundStyle(Brand.muted)
                .lineLimit(1)
                .padding(.top, 1)

            Spacer(minLength: 12)

            Text(money(client.total, currency))
                .font(.system(size: 17, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.6)

            Text(visitLine(client))
                .font(.system(size: 11))
                .monospacedDigit()
                .foregroundStyle(lost ? Brand.warnOnBoard : Brand.muted)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .padding(.top, 1)
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 118, alignment: .topLeading)
        .paperCard(20)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
    }

    /// «3 визита · 12 дней назад». Слово «последний» на плитке не нужно:
    /// в строке оно отделяло давность от числа визитов, а здесь между
    /// ними стоит сумма и своя строка.
    private func visitLine(_ client: API.Client) -> String {
        let visits = Ln("clients.visitsCount", client.visits)
        if client.daysSince == 0 { return L("clients.visitsLastToday", visits) }
        return L("clients.visitsLastAgo", visits, Ln("clients.daysAgo", client.daysSince))
    }

    // ══════════════════════════ пусто ══════════════════════════

    /// Базы ещё нет вовсе. Не ошибка и не пустой экран: так выглядит
    /// мойка в первый день, и сказать об этом надо словами.
    private var emptyDatabase: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: "car.2.fill")
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(Brand.grape)
                .frame(width: 52, height: 52)
                .background(Brand.grapeFill.opacity(0.1), in: .circle)
            Spacer(minLength: 10)
            Text(L("owner.clientsEmpty"))
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(Brand.ink)
                .fixedSize(horizontal: false, vertical: true)
            Text(L("owner.clientsEmptyNote"))
                .font(.system(size: 13))
                .foregroundStyle(Brand.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(20)
        .frame(maxWidth: .infinity, minHeight: 190, alignment: .topLeading)
        .paperCard(26)
        .padding(.top, 18)
    }

    /// На полке или в поиске ничего не нашлось.
    private var emptyShelf: some View {
        VStack(spacing: 6) {
            Text(query.isEmpty ? L("owner.clientsShelfEmpty") : L("owner.clientsNotFound"))
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Brand.ink)
            if !query.isEmpty {
                Text(query)
                    .font(.system(size: 13, weight: .medium))
                    .monospacedDigit()
                    .foregroundStyle(Brand.muted)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 42)
        .paperCard(24)
        .padding(.top, 12)
    }

    // ══════════════════════════ загрузка ══════════════════════════

    private func reload() async {
        do {
            let result = try await session.authed { token in
                try await APIClient.shared.send("clients", token: token, as: API.Clients.self)
            }
            /* С анимацией: счётчики в полках перекручиваются разрядами,
               а не подменяются скачком. */
            withAnimation(.snappy(duration: Motion.normal)) {
                clients = result.clients
            }
            failed = false
            failNote = nil
            loaded = true
            arrive()
        } catch is CancellationError {
            /* Потянули вниз и отпустили, или ушли с экрана. Ничего не
               сломалось — и экран об этом молчит. */
            return
        } catch let error as APIError {
            failNote = error.isOffline ? L("errors.offline") : nil
            failed = true
            loaded = true
            arrive()
        } catch {
            failed = true
            loaded = true
            arrive()
        }
    }

    /// Секции приходят по очереди, как на сводке и зарплате.
    private func arrive() {
        guard beat == .waiting else { return }
        if reduceMotion {
            beat = .here
        } else {
            withAnimation { beat = .here }
        }
    }
}
