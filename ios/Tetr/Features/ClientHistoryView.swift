import SwiftUI

/**
 * История одной машины.
 *
 * Список клиентов отвечает «кто это и сколько принёс». Следующий вопрос
 * владельца всегда один и тот же: **что именно он у меня брал** — и без
 * ответа строка списка тупик, а сам список превращается в счётчик, по
 * которому ничего нельзя решить.
 *
 * Открывается листом, а не отдельной страницей. Сюда заходят из списка,
 * смотрят и возвращаются в тот же список: переход с уходом всего экрана
 * потерял бы место, на котором человек стоял, и поиск, который он набрал.
 *
 * Отменённых записей здесь нет. Клиент за них не платил, и в его итоге
 * их нет — покажи мы их, сумма в шапке перестала бы сходиться с лентой
 * под ней.
 */
struct ClientHistoryView: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss

    let client: API.Client
    let currency: String

    @State private var orders: [API.ClientOrder] = []
    @State private var loaded = false
    @State private var name = ""
    @State private var phone = ""
    /// Первый визит приходит из карточки, а не из списка: в списке
    /// сравнивают давность последнего.
    @State private var firstSeen: Date?
    @State private var editing = false
    @State private var saving = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 10) {
                    reading

                    habits

                    contacts

                    if !orders.isEmpty {
                        VStack(spacing: 0) {
                            ForEach(orders) { order in
                                row(order)
                                if order.id != orders.last?.id {
                                    Rectangle()
                                        .fill(Brand.boardInk.opacity(0.07))
                                        .frame(height: 1)
                                }
                            }
                        }
                        .padding(.top, 4)
                    }

                    if loaded && orders.isEmpty {
                        Text(L("today.noRecords"))
                            .font(.system(size: 14))
                            .foregroundStyle(Brand.boardMuted)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 44)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 28)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Brand.board.ignoresSafeArea())
            .navigationTitle(client.key)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(L("common.close")) { dismiss() }
                }
            }
            .task { await reload() }
        }
    }

    /// Сколько эта машина принесла и как часто приезжает.
    ///
    /// Средний чек здесь считается, а не приходит с сервера: он и есть
    /// частное двух чисел, которые уже на экране, и лишнее поле в ответе
    /// ради деления было бы ещё одним местом, где два счёта могут
    /// разойтись.
    private var reading: some View {
        VStack(spacing: 0) {
            Text(L("common.total"))
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Brand.onBoard.opacity(0.85))
                .padding(.top, 6)

            Text(money(client.total, currency))
                .font(.system(size: 44, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)
                .lineLimit(1)
                .minimumScaleFactor(0.45)

            Text(subtitle)
                .font(.system(size: 12))
                .monospacedDigit()
                .foregroundStyle(Brand.boardMuted)
                .padding(.top, 6)
        }
        .frame(maxWidth: .infinity)
        .padding(.bottom, 6)
    }

    /**
     * Привычки клиента.
     *
     * Три-четыре факта, из-за которых карточку и открывают перед
     * разговором: давно ли он тут, что берёт, чем платит и кто его знает.
     * До этого карточка отвечала только «сколько принёс» и «что было» —
     * а «что он обычно берёт» приходилось выводить, читая ленту глазами.
     *
     * Считается из уже приехавшей истории, а не отдельным запросом:
     * список визитов и так лежит перед глазами, и спрашивать сервер
     * второй раз ради подсчёта по нему значило бы платить запросом за
     * арифметику. Ровно так же это устроено в кабинете.
     *
     * У приезжавшего один раз привычек нет: и «первый визит», и «обычно
     * берёт» пересказали бы ту единственную строку, что стоит ниже.
     */
    @ViewBuilder
    private var habits: some View {
        if orders.count > 1 {
            VStack(spacing: 0) {
                if let firstSeen {
                    fact(L("owner.clientFirstVisit"), longDay(firstSeen))
                }
                if let service = topOf(orders.map(\.serviceName)) {
                    fact(L("owner.clientOftenTakes"), service)
                }
                if let payment = topOf(orders.map { paymentWord($0.payment) }) {
                    fact(L("owner.clientOftenPays"), payment)
                }
                if let who = topOf(orders.compactMap(\.staffName)) {
                    fact(L("owner.clientOftenServed"), who)
                }
            }
            .background(Brand.boardInk.opacity(0.05), in: .rect(cornerRadius: 16))
        }
    }

    private func fact(_ title: String, _ value: String) -> some View {
        HStack(spacing: 12) {
            Text(title)
                .font(.system(size: 13))
                .foregroundStyle(Brand.boardMuted)
            Spacer(minLength: 8)
            Text(value)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Brand.onBoard)
                .lineLimit(1)
                .truncationMode(.tail)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
    }

    /// Что встречается чаще всего. Пусто, когда выбирать не из чего.
    private func topOf(_ values: [String]) -> String? {
        guard values.count > 1 else { return nil }
        var count: [String: Int] = [:]
        for v in values { count[v, default: 0] += 1 }
        return count.max { a, b in a.value < b.value }?.key
    }

    /// «15 օգոստոսի, 2026 թ.» — в поясе бизнеса, как и всё остальное.
    private func longDay(_ d: Date) -> String {
        let f = DateFormatter()
        f.locale = LangStore.currentLang.locale
        f.dateStyle = .long
        if let tz = session.tenant?.timezone, let zone = TimeZone(identifier: tz) {
            f.timeZone = zone
        }
        return f.string(from: d)
    }

    /**
     * Имя, телефон и две кнопки к нему.
     *
     * Телефон при записи машины не спрашивают и не будут: мойщик вводит
     * номер, услугу и оплату мокрыми руками, с очередью за спиной.
     * Владелец заходит в карточку постоянного спокойно — вот здесь номер
     * и вписывается, чтобы потом было куда позвонить, когда человек
     * пропал.
     *
     * «Զանգել» и «Գրել» открывают телефон и сообщения: звонить и писать
     * умеет сам аппарат, своего набора номера продукту заводить незачем.
     */
    @ViewBuilder
    private var contacts: some View {
        VStack(alignment: .leading, spacing: 10) {
            if editing {
                TextField(L("owner.clientName"), text: $name)
                    .textFieldStyle(.plain)
                    .font(.system(size: 15))
                    .foregroundStyle(Brand.onBoard)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 11)
                    .background(Brand.boardSurface, in: .rect(cornerRadius: 10))

                TextField("+374 77 123 456", text: $phone)
                    .textFieldStyle(.plain)
                    .font(.system(size: 15))
                    .monospacedDigit()
                    .keyboardType(.phonePad)
                    .foregroundStyle(Brand.onBoard)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 11)
                    /* Светлее карточки, а не того же тона: на общей
                       серой подложке поле пропадало, и человек не
                       понимал, есть там ввод или нет. */
                    .background(Brand.boardSurface, in: .rect(cornerRadius: 10))

                HStack(spacing: 8) {
                    Button {
                        Task { await saveContact() }
                    } label: {
                        Text(saving ? "…" : L("common.save"))
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Brand.onLime)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 9)
                            .background(Brand.lime, in: .rect(cornerRadius: 10))
                    }
                    .buttonStyle(.press)
                    .disabled(saving)

                    Button(L("common.cancel")) { editing = false }
                        .font(.system(size: 14))
                        .foregroundStyle(Brand.boardMuted)
                }
            } else {
                HStack(alignment: .top, spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(L("owner.clientContacts"))
                            .font(.system(size: 12))
                            .foregroundStyle(Brand.boardMuted)
                        Text(name.isEmpty ? client.key : name)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Brand.onBoard)
                        Text(phone.isEmpty ? L("owner.clientNoPhone") : phone)
                            .font(.system(size: 13))
                            .monospacedDigit()
                            .foregroundStyle(Brand.boardMuted)
                    }

                    Spacer(minLength: 8)

                    Button(L("common.edit")) { editing = true }
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Brand.boardMuted)
                }

                if !phone.isEmpty {
                    HStack(spacing: 8) {
                        link(L("owner.clientCall"), "tel:\(phone)", filled: true)
                        link(L("owner.clientWrite"), "sms:\(phone)", filled: false)
                    }
                }

                /* Подсказка только пропавшему: у того, кто был вчера, она
                   превратилась бы в фон, который перестают замечать. */
                if client.daysSince > API.lostAfterDays {
                    Text(L("owner.clientLostHint"))
                        .font(.system(size: 12.5))
                        .foregroundStyle(Brand.warnOnBoard)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Brand.boardInk.opacity(0.05), in: .rect(cornerRadius: 16))
    }

    private func link(_ title: String, _ url: String, filled: Bool) -> some View {
        Link(destination: URL(string: url) ?? URL(string: "tel:0")!) {
            Text(title)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(filled ? Brand.onLime : Brand.onBoard)
                .padding(.horizontal, 16)
                .padding(.vertical, 9)
                .background(
                    filled ? Brand.lime : Brand.boardInk.opacity(0.09),
                    in: .rect(cornerRadius: 10)
                )
        }
    }

    private func saveContact() async {
        saving = true
        let escaped = client.key.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? client.key
        _ = try? await session.authed { token in
            try await APIClient.shared.raw(
                "clients/\(escaped)/contact",
                method: "PATCH",
                body: ["name": name, "phone": phone],
                token: token
            )
        }
        saving = false
        editing = false
    }

    private var subtitle: String {
        let avg = client.visits > 0 ? client.total / client.visits : 0
        let last = client.daysSince == 0 ? L("owner.lastVisitToday") : Ln("clients.daysAgo", client.daysSince)
        return L(
            "clients.summaryLine",
            Ln("clients.visitsCount", client.visits),
            money(avg, currency),
            last
        )
    }

    private func row(_ order: API.ClientOrder) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 1) {
                Text(order.serviceName)
                    .font(.system(size: 14.5, weight: .semibold))
                    .foregroundStyle(Brand.onBoard)
                    .lineLimit(1)
                Text(line(order))
                    .font(.system(size: 11.5))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            /* Скидка видна и в истории машины: постоянному её дают не
               один раз, и «сколько всего оставил» без неё читается
               неправдой в обе стороны. */
            if let list = order.listPrice, list > order.price {
                Text(money(list, currency))
                    .font(.system(size: 11.5))
                    .monospacedDigit()
                    .strikethrough()
                    .foregroundStyle(Brand.boardMuted)
            }
            Text(money(order.price, currency))
                .font(.system(size: 14, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 11)
        .accessibilityElement(children: .combine)
    }

    /// «12.08 · Կանխիկ · Դավիթ» — когда, чем платил и кто мыл.
    private func line(_ order: API.ClientOrder) -> String {
        var parts = [day(order.createdAt), paymentWord(order.payment)]
        if let who = order.staffName { parts.append(who) }
        return parts.joined(separator: " · ")
    }

    /// Дата из строки ISO без разбора в `Date`: нужен только день и месяц,
    /// а полный разбор с часовым поясом здесь ничего не добавляет.
    private func day(_ iso: String) -> String {
        let head = iso.prefix(10).split(separator: "-")
        return head.count == 3 ? "\(head[2]).\(head[1])" : String(iso.prefix(10))
    }

    private func paymentWord(_ p: String) -> String {
        switch p {
        case "cash": return L("payment.cash")
        case "card": return L("payment.card")
        case "pass": return L("payment.pass")
        default: return L("payment.transfer")
        }
    }

    private func reload() async {
        let escaped = client.key.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? client.key
        let result: API.ClientHistory? = try? await session.authed { token in
            try await APIClient.shared.send("clients/\(escaped)", token: token, as: API.ClientHistory.self)
        }
        if let result {
            orders = result.orders
            name = result.client.name ?? ""
            phone = result.client.phone ?? ""
            firstSeen = result.client.firstSeenAt
        }
        loaded = true
    }
}
