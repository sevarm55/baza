import SwiftUI

/**
 * База клиентов.
 *
 * Наверху — те, кто давно не был. Это не сортировка ради сортировки:
 * вернуть старого клиента дешевле, чем привести нового, и список нужен
 * ровно для одного действия — позвонить.
 *
 * Показание наверху отвечает на вопрос, ради которого сюда заходят: сколько
 * людей пропало. Раньше это число нигде не стояло, и «стоит ли звонить»
 * приходилось решать, пересчитывая строки глазами.
 */
struct ClientsView: View {
    @EnvironmentObject private var session: Session

    /// Через сколько дней молчания клиент считается потерянным.
    /// Число одно на приложение и на кабинет — см. `API.lostAfterDays`.
    private let lostAfter = API.lostAfterDays

    @State private var clients: [API.Client] = []
    @State private var loaded = false
    @State private var query = ""
    @State private var sort: Sort = .recent
    @State private var opened: API.Client?
    @State private var group: ClientGroupView.Group?

    /** Чем упорядочен список.

        Это порядок, а не отбор: ни один клиент не пропадает, меняется
        только кто наверху. Отбор здесь был бы вреден — владелец ищет
        конкретную машину, а не подмножество. */
    private enum Sort: String, CaseIterable {
        case recent, often, richest

        var label: String {
            switch self {
            case .recent: return L("owner.lastVisit")
            case .often: return L("owner.sortOften")
            case .richest: return L("owner.sortRichest")
            }
        }
    }

    private var currency: String { session.tenant?.currency ?? "AMD" }

    /// Поиск по номеру, имени и телефону. Пробелы и регистр не в счёт:
    /// номер диктуют вслух и записывают как придётся — «93LM227» и
    /// «93 lm 227» это одна машина. Имя с телефоном владелец вписывает
    /// сам и человека помнит по ним, а не по шести символам номера.
    private var found: [API.Client] {
        let q = query.replacingOccurrences(of: " ", with: "").uppercased()
        let base = q.isEmpty
            ? clients
            : clients.filter { client in
                [client.key, client.name ?? "", client.phone ?? ""].contains {
                    $0.replacingOccurrences(of: " ", with: "").uppercased().contains(q)
                }
            }

        switch sort {
        case .recent: return base.sorted { $0.daysSince < $1.daysSince }
        case .often: return base.sorted { $0.visits > $1.visits }
        case .richest: return base.sorted { $0.total > $1.total }
        }
    }

    private var lost: [API.Client] { found.filter { $0.daysSince > lostAfter } }
    private var rest: [API.Client] { found.filter { $0.daysSince <= lostAfter } }

    /* Счётчики в шапке считают по всей базе, а не по найденному.
       Это показания продукта — «сколько у меня всего», «сколько
       постоянных», — и они не должны меняться от того, что человек
       набрал в поиске три буквы номера. Деление списка ниже, наоборот,
       идёт по найденному: там речь ровно о том, что сейчас на экране. */
    private var loyalAll: [API.Client] { clients.filter { $0.visits > 1 } }
    /// Был ровно один раз: вернётся или нет — ещё неизвестно. Тот же
    /// порог, что в кабинете; выдумывать здесь своё значило бы, что
    /// продукт считает постоянных по-разному на двух экранах.
    private var freshAll: [API.Client] { clients.filter { $0.visits == 1 } }
    private var lostAll: [API.Client] { clients.filter { $0.daysSince > lostAfter } }

    /// Разделять на «стоит позвонить» и остальных имеет смысл только в
    /// полном списке по умолчанию. При поиске или другом порядке человек
    /// уже сказал, что ищет, и деление мешает.
    private var grouped: Bool { query.isEmpty && sort == .recent }

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                if loaded { head }

                if grouped {
                    if !lost.isEmpty { group(L("clients.worthCalling"), lost, lostOnes: true) }
                    if !rest.isEmpty { group(L("owner.allClients"), rest, lostOnes: false) }
                } else if !found.isEmpty {
                    group(sort.label, found, lostOnes: false)
                }

                if loaded && clients.isEmpty {
                    empty(L("common.empty"))
                } else if loaded && found.isEmpty {
                    empty(L("owner.clientsNotFound"))
                }
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 28)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.board.ignoresSafeArea())
        .task { await reload() }
        .refreshable { await reload() }
        .sheet(item: $opened) { client in
            ClientHistoryView(client: client, currency: currency)
                .environmentObject(session)
        }
        .sheet(item: $group) { which in
            ClientGroupView(
                group: which,
                clients: clients,
                lostAfter: lostAfter,
                currency: currency
            )
            .environmentObject(session)
        }
    }

    /**
     * Шапка: сколько их, поиск, порядок.
     *
     * Было показание на пятьдесят пунктов — число клиентов огромной
     * цифрой, — и то же число повторялось ещё дважды: в подписи группы
     * «Բոլորը» и в её счётчике. Три раза одно и то же, и полэкрана
     * воздуха до первой строки. Показание уместно там, где число само по
     * себе ответ: выручка, зарплата к выдаче. «Сколько у меня машин в
     * базе» такой вопрос не задаёт — с этим экраном приходят искать
     * конкретную.
     *
     * Поэтому строка вместо плаката, а освободившееся место отдано
     * поиску. На двадцати клиентах он не нужен, на двухстах без него
     * страницу листают вслепую, и заводить его надо до того, как их
     * станет двести, а не после.
     */
    private var head: some View {
        VStack(alignment: .leading, spacing: 10) {
            counters

            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Brand.boardMuted)

                /* Подсказка называет всё, по чему ищут. Стояло «по номеру
                   машины», а поиск шёл ещё по имени и телефону — и имя,
                   вписанное вчера, искали номером и не находили. */
                TextField(L("owner.clientsSearch"), text: $query)
                    .font(.system(size: 15))
                    .foregroundStyle(Brand.onBoard)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.characters)
                    .submitLabel(.search)

                if !query.isEmpty {
                    Button {
                        query = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 15))
                            .foregroundStyle(Brand.boardMuted)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 11)
            .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 12))

            /* Порядок — прокруткой вбок: три слова по-армянски в строку
               не помещаются, а перенос превратил бы переключатель в
               абзац. */
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(Sort.allCases, id: \.self) { option in
                        Button {
                            sort = option
                        } label: {
                            Text(option.label)
                                .font(.system(size: 13, weight: sort == option ? .semibold : .regular))
                                .foregroundStyle(sort == option ? Brand.board : Brand.boardMuted)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 7)
                                .background(
                                    sort == option ? Brand.onBoard : Brand.boardInk.opacity(0.07),
                                    in: .rect(cornerRadius: 9)
                                )
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 1)
            }
        }
        .padding(.horizontal, 4)
        .padding(.top, 6)
        .padding(.bottom, 2)
    }

    /**
     * Три счётчика, и по каждому можно нажать.
     *
     * Число без списка за собой — тупик: «մշտական 12» видно, а кто эти
     * двенадцать — нет, и владелец шёл сортировать список и считать
     * строки глазами. Теперь за каждым числом открывается ровно его
     * список.
     *
     * «Վաղուց չեն եղել 0» не нажимается: за нулём списка нет. Кнопка,
     * которая ничего не открывает, хуже обычного текста — по ней жмут и
     * не понимают, сломалось или так задумано.
     */
    private var counters: some View {
        HStack(spacing: 6) {
            counter(L("owner.clientsTotal"), clients.count, tone: Brand.onBoard) { group = .all }
            counter(L("owner.clientsLoyal"), loyalAll.count, tone: Brand.goodOnBoard) { group = .loyal }
            /* «Новых» тут не было, а в кабинете они есть: клиент с одним
               визитом — это не то же самое, что постоянный, и вопрос
               «кто у меня ещё не вернулся» задают отдельно. */
            counter(L("owner.clientsFresh"), freshAll.count, tone: Brand.onBoard) { group = .fresh }
            counter(
                L("owner.clientsLost"),
                lostAll.count,
                tone: lostAll.isEmpty ? Brand.onBoard : Brand.warnOnBoard
            ) {
                group = lostAll.isEmpty ? nil : .lost
            }
        }
    }

    private func counter(
        _ label: String,
        _ value: Int,
        tone: Color,
        _ tap: @escaping () -> Void
    ) -> some View {
        // за нулём списка нет: кнопка, которая ничего не открывает, хуже
        // обычного текста — по ней жмут и не понимают, сломалось или так
        // задумано
        let live = value > 0

        return Button(action: tap) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 3) {
                    Text(label)
                        .font(.system(size: 11))
                        .foregroundStyle(Brand.boardMuted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)

                    Spacer(minLength: 0)

                    /* Шеврон, а не просто нажимаемая плитка: без знака
                       она читается подписью, по ней не пробуют тапнуть
                       и не узнают, что за числом что-то есть. */
                    if live {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 8.5, weight: .bold))
                            .foregroundStyle(Brand.boardMuted.opacity(0.55))
                    }
                }

                Text("\(value)")
                    .font(.system(size: 19, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(tone)
                    .contentTransition(.numericText(value: Double(value)))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 10)
            .padding(.vertical, 9)
            .background(Brand.boardInk.opacity(0.05), in: .rect(cornerRadius: 12))
            .contentShape(.rect)
        }
        .buttonStyle(.press)
        .disabled(!live)
    }

    private func empty(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 14))
            .foregroundStyle(Brand.boardMuted)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 44)
    }

    /**
     * Группа клиентов.
     *
     * Потерянные — на янтарной плитке, остальные строками на табло. Разный
     * носитель, а не разный заголовок: список из двух одинаковых секций
     * читается одним списком, и «кому позвонить» тонет в «всех».
     */
    private func group(_ title: String, _ items: [API.Client], lostOnes: Bool) -> some View {
        VStack(spacing: lostOnes ? 8 : 0) {
            HStack {
                Text(title)
                    .font(.system(size: 14.5, weight: .semibold))
                    .foregroundStyle(lostOnes ? Brand.warnOnBoard : Brand.boardMuted)
                Spacer()
                Text("\(items.count)")
                    .font(.system(size: 12))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)
            }
            .padding(.horizontal, 6)
            .padding(.top, 14)
            .padding(.bottom, 6)

            ForEach(items) { client in
                if lostOnes {
                    Button { opened = client } label: { row(client, tone: .amber) }
                        .buttonStyle(.press)
                } else {
                    Button { opened = client } label: { plainRow(client) }
                        .buttonStyle(.press)
                    if client.id != items.last?.id {
                        Rectangle()
                            .fill(Brand.boardInk.opacity(0.07))
                            .frame(height: 1)
                    }
                }
            }
        }
    }

    private func row(_ client: API.Client, tone: Tone) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(client.key)
                    .font(.system(size: 16, weight: .bold, design: .rounded))
                    .foregroundStyle(tone.ink)
                    .lineLimit(1)
                Text(visitLine(client))
                    .font(.system(size: 11.5))
                    .monospacedDigit()
                    .foregroundStyle(tone.ink.opacity(0.72))
            }
            Spacer(minLength: 8)
            Text(money(client.total, currency))
                .font(.system(size: 17, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(tone.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.7)

            /* Шеврон, а не просто нажимаемая строка. Строка без знака
               выглядит подписью: человек не пробует по ней тапнуть и не
               узнаёт, что за ней что-то есть. */
            Image(systemName: "chevron.right")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(tone.ink.opacity(0.45))
        }
        .tile(tone, radius: 20, pad: 14)
        .accessibilityElement(children: .combine)
    }

    private func plainRow(_ client: API.Client) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 6) {
                    Text(client.key)
                        .font(.system(size: 14.5, weight: .semibold, design: .rounded))
                        .foregroundStyle(Brand.onBoard)
                        .lineLimit(1)

                    /* Метка постоянного. До неё это читалось только
                       счётчиком визитов, а «сколько раз был» и «свой ли
                       это человек» — разные вопросы, и второй решается
                       взглядом. */
                    if client.visits > 1 {
                        Text(L("owner.clientLoyal"))
                            .font(.system(size: 10.5, weight: .semibold))
                            .foregroundStyle(Brand.goodOnBoard)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 1.5)
                            .background(Brand.goodOnBoard.opacity(0.16), in: .rect(cornerRadius: 5))
                    }

                    /* Имя рядом с номером, а не строкой под ним: строкой
                       оно делало запись с контактами выше соседних, и
                       список получался рваным. Телефон остаётся в
                       карточке — в строку он не помещается, а звонят всё
                       равно оттуда. */
                    if let name = client.name, !name.isEmpty {
                        Text(name)
                            .font(.system(size: 12))
                            .foregroundStyle(Brand.boardMuted)
                            .lineLimit(1)
                    }
                }
                Text(visitLine(client))
                    .font(.system(size: 11.5))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)
            }
            Spacer(minLength: 8)
            Text(money(client.total, currency))
                .font(.system(size: 14, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)

            Image(systemName: "chevron.right")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Brand.boardMuted.opacity(0.6))
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 11)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
    }

    /// «213 այց · վերջինը՝ 3 օր առաջ».
    ///
    /// Слово «վերջինը» обязательно. Без него «3 օր առաջ» стоит рядом с
    /// числом визитов и читается чем угодно — сроком, промежутком,
    /// давностью первого приезда. Речь о последнем, и это надо сказать.
    private func visitLine(_ client: API.Client) -> String {
        let visits = Ln("clients.visitsCount", client.visits)
        if client.daysSince == 0 { return L("clients.visitsLastToday", visits) }
        return L("clients.visitsLastAgo", visits, Ln("clients.daysAgo", client.daysSince))
    }

    private func reload() async {
        let result: API.Clients? = try? await session.authed { token in
            try await APIClient.shared.send("clients", token: token, as: API.Clients.self)
        }
        if let result { clients = result.clients }
        loaded = true
    }
}
