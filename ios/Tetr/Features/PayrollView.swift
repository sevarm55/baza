import SwiftUI

/**
 * Зарплаты.
 *
 * Экран построен вокруг человека, а дни живут внутри него.
 *
 * Прежняя раскладка шла от рабочего дня: карточка дня, внутри плитки
 * людей. На мойке людей двое-трое, и владелец приходит сюда с вопросом
 * «сколько отдать Каро», а не «что было во вторник». Поэтому наверху —
 * карусель кошельков, по одному на человека, каждый своим цветом (тем
 * же, каким имя набрано в ленте и на смене), а под выбранным кошельком
 * его дни: за какой день сколько, отдано ли, и по каким машинам.
 *
 * Считается всё равно днями, и это важно: «за вчера отдал, за сегодня
 * нет» — фраза из жизни. Отметка стоит на дне, кошелёк лишь отмечает
 * все дни человека разом.
 *
 * Считает сервер, тем же кодом, что для кабинета: `board` приходит
 * готовым листом.
 */
struct PayrollView: View {
    @EnvironmentObject private var session: Session

    @State private var payroll: API.Payroll?
    @State private var tab = Tab.due
    /// Сколько выплат раскрыто в истории: порциями, чтобы длинный
    /// список не грузил экран целиком.
    @State private var historyShown = 10
    private let historyPage = 10
    /// что отмечено к выплате: `день|человек`
    @State private var picked: Set<String> = []
    /// у каких строк раскрыто разложение по машинам
    @State private var opened: Set<String> = []
    /// чей кошелёк сейчас перед глазами
    @State private var focus: String?
    @State private var openedWallet: WalletDetail?
    @State private var walletHistoryShown = 10
    @Namespace private var walletTransition
    /// что сейчас на подтверждении
    @State private var asking: [Pick]?
    @State private var settling = false
    @State private var note: String?
    @State private var failure: String?
    @State private var loading = false
    /// Такт прихода: кошельки, дни и история приходят по очереди.
    @State private var beat: Beat = .waiting
    /// Суммы на кошельках накручиваются от нуля при первом показе.
    @State private var countUp = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private enum Tab: Hashable { case due, history }

    /// Человек и рабочий день, за который платят. Одно без другого не
    /// имеет смысла: деньги отдают за день, а не «вообще».
    private struct Pick: Hashable {
        let staffId: String
        let day: String
        let name: String
        let amount: Int
    }

    /// День человека: сам день и его запись в нём.
    private struct Entry: Identifiable {
        let day: API.PayrollBoardDay
        let person: API.PayrollPerson
        var id: String { day.day }
        var payable: Bool { person.staffId != nil && person.earned > 0 }
    }

    /// Кошелёк: человек со всеми своими днями.
    private struct Wallet: Identifiable {
        let id: String
        let name: String
        let staffId: String?
        let owed: Int
        let paid: Int
        let units: Int
        let entries: [Entry]
    }

    /// Freeze the card and its payment history together for the expansion.
    private struct WalletDetail: Identifiable {
        let wallet: Wallet
        let payments: [API.PayrollPayment]
        var id: String { wallet.id }
    }

    /// «Сегодня» для экрана. В отладочной сборке подменяется переменной
    /// `TETR_TODAY=2026-09-07` (через `SIMCTL_CHILD_`), чтобы посмотреть,
    /// как лист выглядит завтра, не дожидаясь полуночи.
    private static let debugToday: Date? = {
        #if DEBUG
        guard let raw = ProcessInfo.processInfo.environment["TETR_TODAY"], !raw.isEmpty else { return nil }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        return f.date(from: raw)?.addingTimeInterval(12 * 3600)
        #else
        return nil
        #endif
    }()
    private var now: Date { Self.debugToday ?? Date() }

    private var currency: String { session.tenant?.currency ?? "AMD" }
    private var unitOne: String { session.tenant?.unitOne ?? "" }
    private var staffRole: String { session.tenant?.staffRole ?? "" }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                title
                if let failure {
                    problem(failure)
                } else if let board = payroll?.board {
                    tabs(board)
                    if tab == .due {
                        let wallets = wallets(board)
                        carousel(wallets)
                            .reveal(beat, step: 0)
                        if let wallet = wallets.first(where: { $0.id == focus }) ?? wallets.first {
                            days(wallet)
                                .reveal(beat, step: 1)
                        }
                    } else {
                        history(board)
                            .reveal(beat, step: 0)
                    }
                } else if payroll != nil {
                    outdated
                } else {
                    Delayed(active: loading) {
                        VStack(alignment: .leading, spacing: 14) {
                            TetrSkeleton(width: 220, height: 30, radius: 10)
                            TetrSkeleton(height: 200, radius: 28)
                            TetrSkeletonList(rows: 3)
                        }
                        .padding(.horizontal, 16)
                        .padding(.top, 12)
                    }
                }
            }
            .padding(.bottom, picked.isEmpty ? 28 : 110)
        }
            /* Обновление вешается на саму прокрутку, а не в конец
               цепочки. Снаружи оно попадает в окружение всего, что ниже,
               включая листы: форма найма наследовала «потянуть, чтобы
               обновить», отвечала на движение вниз загрузчиком и не
               давала закрыть себя смахиванием. */
            .refreshable { await reload() }
        .scrollClipDisabled()
        .brandTitleFont()
        .navigationTitle(L("tab.payroll"))
        .navigationSubtitle(longDay(dayKey(now)))
        .toolbarTitleDisplayMode(.inlineLarge)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .meshPage()
        .safeAreaInset(edge: .bottom) { dock }
        .overlay(alignment: .bottom) { toast }
        .task { await reload() }
        .onReceive(NotificationCenter.default.publisher(for: .splashDone)) { _ in
            if payroll != nil, beat == .waiting {
                Task { @MainActor in
                    try? await Task.sleep(for: .milliseconds(120))
                    arrive(first: true)
                }
            }
        }
        .fullScreenCover(item: $openedWallet) { detail in
            if reduceMotion {
                walletDetail(detail)
            } else {
                walletDetail(detail)
                    .navigationTransition(.zoom(sourceID: detail.id, in: walletTransition))
            }
        }
        .onChange(of: payroll?.board?.days.count) { _, _ in
            if let board = payroll?.board {
                let ids = wallets(board).map(\.id)
                if focus == nil || !ids.contains(focus!) { focus = ids.first }
            }
        }
        .alert(
            L("payroll.confirmTitle"),
            isPresented: .init(get: { asking != nil }, set: { if !$0 { asking = nil } })
        ) {
            Button(L("common.cancel"), role: .cancel) { asking = nil }
            Button(L("payroll.confirm")) {
                if let items = asking { Task { await settle(items) } }
                asking = nil
            }
        } message: {
            if let items = asking { Text(confirmText(items)) }
        }
    }

    /// Кошельки и дни приходят по очереди, суммы накручиваются следом.
    private func arrive(first: Bool) {
        if Launch.splashShowing && !reduceMotion { return }
        beat = .here
        if first && !reduceMotion {
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(260))
                withAnimation(.timingCurve(0.16, 1, 0.3, 1, duration: 1.1)) { countUp = true }
            }
        } else {
            countUp = true
        }
    }

    // ══════════════════════════ заголовок ══════════════════════════

    /// Шапка: заголовок, дата и фишки. Маскот с купюрами стоял справа,
    /// владелец попросил убрать.
    /// Заголовок и дата — нативные, в панели; здесь только фишки.
    @ViewBuilder
    private var title: some View {
        if let board = payroll?.board {
            chips(board)
                .padding(.horizontal, 20)
                .padding(.top, 4)
        }
    }

    /// Фишки состояния: сколько раздать, скольким, за сколько машин.
    private func chips(_ board: API.PayrollBoard) -> some View {
        let t = board.totals
        return FlowLayout(spacing: 8) {
            if t.outstanding > 0 {
                PillChip(text: "\(sentence(L("payroll.dueHeader"))) · \(money(t.outstanding, currency))", ink: Brand.onLime, fill: Brand.lime, outlined: false)
                PillChip(text: Terms.staff(t.owedTo, staffRole))
            } else {
                PillChip(text: L("payroll.dayAllPaid"), ink: .white, fill: Brand.good, outlined: false)
            }
        }
    }

    /**
     * Долг и история — двумя вкладками, а не одной лентой.
     *
     * Владелец сказал прямо: в одном листе дни, проценты и история
     * путаются, «нужно напрягаться». Долг и уже отданное — разные
     * вопросы, и у каждого своя страница.
     */
    private func tabs(_ board: API.PayrollBoard) -> some View {
        PillTabs(items: [(Tab.due, L("owner.toPay")), (Tab.history, L("payroll.tabHistory"))], selection: $tab)
            .padding(.horizontal, 16)
            .padding(.top, 22)
    }

    /// Первая буква заглавная, остальное как есть: `capitalized` поднимал
    /// бы каждое слово («К Выплате»).
    private func sentence(_ text: String) -> String {
        let lower = text.lowercased()
        return lower.prefix(1).uppercased() + lower.dropFirst()
    }

    // ══════════════════════════ кошельки ══════════════════════════

    /// Люди с долгом и те, кто в сегодняшнем дне: долг вперёд.
    ///
    /// Прошлые рассчитанные дни в кошелёк не попадают: на новом дне
    /// карточка показывала «выплачено 27 750» за три дня назад, и
    /// владелец спросил, почему не ноль. Выплаченное живёт в истории.
    private func wallets(_ board: API.PayrollBoard) -> [Wallet] {
        let today = dayKey(now)
        var order: [String] = []
        var groups: [String: [Entry]] = [:]
        for day in board.days {
            for person in day.people where person.earned > 0 || day.day == today {
                let id = person.staffId ?? "—|\(person.name ?? "")"
                if groups[id] == nil { order.append(id) }
                groups[id, default: []].append(Entry(day: day, person: person))
            }
        }
        return order.map { id -> Wallet in
            let entries = groups[id] ?? []
            return Wallet(
                id: id,
                name: entries.first?.person.name ?? "—",
                staffId: entries.first?.person.staffId,
                owed: entries.reduce(0) { $0 + $1.person.earned },
                paid: entries.reduce(0) { $0 + $1.person.paid },
                units: entries.reduce(0) { $0 + $1.person.count },
                entries: entries
            )
        }
        .sorted { a, b in
            if (a.owed > 0) != (b.owed > 0) { return a.owed > 0 }
            return a.owed != b.owed ? a.owed > b.owed : a.paid > b.paid
        }
    }

    @ViewBuilder
    private func carousel(_ wallets: [Wallet]) -> some View {
        if wallets.isEmpty {
            emptyWallet
                .padding(.horizontal, 16)
                .padding(.top, 18)
        } else {
            ScrollView(.horizontal) {
                LazyHStack(spacing: 12) {
                    ForEach(wallets) { wallet in
                        walletCard(wallet)
                            /* Контейнер уже без боковых полей прокрутки:
                               одна карточка во всю ширину, несколько — с
                               выглядывающим краем следующей. */
                            .containerRelativeFrame(.horizontal) { width, _ in
                                wallets.count > 1 ? width - 44 : width
                            }
                            .id(wallet.id)
                    }
                }
                .scrollTargetLayout()
            }
            .contentMargins(.horizontal, 16, for: .scrollContent)
            .scrollTargetBehavior(.viewAligned)
            .scrollPosition(id: $focus)
            .scrollIndicators(.hidden)
            .scrollClipDisabled()
            .padding(.top, 18)
        }
    }

    /// Все ли дни человека отмечены.
    private func allPicked(_ wallet: Wallet) -> Bool {
        let payable = wallet.entries.filter(\.payable)
        return !payable.isEmpty && payable.allSatisfy { picked.contains(key($0.day.day, $0.person)) }
    }

    private func togglePerson(_ wallet: Wallet) {
        guard !settling else { return }
        let keys = wallet.entries.filter(\.payable).map { key($0.day.day, $0.person) }
        guard !keys.isEmpty else { return }
        withAnimation(reduceMotion ? nil : Motion.springSnap) {
            if allPicked(wallet) { keys.forEach { picked.remove($0) } } else { picked.formUnion(keys) }
        }
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
    }

    /**
     * Кошелёк человека.
     *
     * Яркий тон человека заливкой, тёмный тон чернилами: карточка
     * цветная, а не тёмная — тёмных плит посреди светлого экрана
     * владелец не хочет. Рассчитанный человек — белая тихая карточка с
     * зелёной галкой. Кнопка справа внизу отмечает все его дни.
     */
    private func walletCard(_ wallet: Wallet) -> some View {
        let tone = Brand.personTone(wallet.name)
        let on = allPicked(wallet)

        return Button {
            walletHistoryShown = historyPage
            openedWallet = WalletDetail(wallet: wallet, payments: payroll?.board?.payments ?? [])
        } label: {
            walletFace(wallet)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("payroll.wallet.open.\(wallet.id)")
        .accessibilityHint(L("payroll.walletOpenHint"))
        // A sibling overlay, not a button nested inside the open-card button.
        .overlay(alignment: .bottomTrailing) {
            if wallet.owed > 0, wallet.staffId != nil {
                Button { togglePerson(wallet) } label: {
                    Image(systemName: "checkmark")
                        .font(.system(size: 20, weight: .black))
                        .foregroundStyle(on ? .white : tone.base)
                        .frame(width: 54, height: 54)
                        .background(on ? tone.base : .white.opacity(0.55), in: .circle)
                        .overlay(Circle().strokeBorder(tone.base.opacity(on ? 0 : 0.35), lineWidth: 2))
                        .contentShape(.circle)
                }
                .buttonStyle(.press)
                .disabled(settling)
                .accessibilityLabel("\(L("payroll.selectAll")) · \(wallet.name)")
                .accessibilityAddTraits(on ? [.isSelected] : [])
                .accessibilityIdentifier("payroll.wallet.select.\(wallet.id)")
                .padding(20)
            }
        }
        .matchedTransitionSource(id: wallet.id, in: walletTransition) { source in
            source.background(wallet.owed > 0 ? tone.glow : Brand.paper)
                .clipShape(.rect(cornerRadius: 28))
        }
    }

    /// The same face is used before and after the zoom; controls live outside it.
    private func walletFace(_ wallet: Wallet, expanded: Bool = false) -> some View {
        let tone = Brand.personTone(wallet.name)
        let live = wallet.owed > 0
        let ink: Color = live ? tone.base : Brand.ink

        return VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                Text(String(wallet.name.prefix(1)).uppercased())
                    .font(.system(size: 19, weight: .heavy, design: .rounded))
                    .foregroundStyle(live ? .white : tone.base)
                    .frame(width: 42, height: 42)
                    .background(live ? tone.base : tone.glow.opacity(0.25), in: .circle)

                VStack(alignment: .leading, spacing: 1) {
                    Text(wallet.name)
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(ink)
                        .lineLimit(1)
                    Text(Terms.units(wallet.units, unitOne))
                        .font(.system(size: 12, weight: .medium))
                        .monospacedDigit()
                        .foregroundStyle(ink.opacity(0.7))
                }
                Spacer(minLength: 0)
                if live, !expanded {
                    Image(systemName: "arrow.up.left.and.arrow.down.right")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(ink)
                        .frame(width: 32, height: 32)
                        .background(.white.opacity(0.55), in: .circle)
                        .accessibilityHidden(true)
                }
                if !live {
                    Image(systemName: "checkmark.seal.fill")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Brand.good)
                        .frame(width: 38, height: 38)
                        .background(Brand.ink.opacity(0.05), in: .rect(cornerRadius: 12, style: .continuous))
                }
            }

            Spacer(minLength: 22)

            Text(L("payroll.dueHeader"))
                .font(.system(size: 11, weight: .black, design: .rounded))
                .tracking(1.3)
                .foregroundStyle(live ? ink.opacity(0.7) : Brand.good)

            HStack(alignment: .center, spacing: 12) {
                Text(money(expanded || countUp ? wallet.owed : 0, currency))
                    .font(.system(size: 38, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(live ? ink : Brand.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                    .contentTransition(.numericText(value: expanded || countUp ? Double(wallet.owed) : 0))

                Spacer(minLength: 0)

                if live, wallet.staffId != nil {
                    Color.clear.frame(width: 54, height: 54)
                        .accessibilityHidden(true)
                } else if !live {
                    Image(systemName: "checkmark")
                        .font(.system(size: 18, weight: .black))
                        .foregroundStyle(.white)
                        .frame(width: 44, height: 44)
                        .background(Brand.good, in: .circle)
                }
            }
            .padding(.top, 2)
        }
        .padding(20)
        .frame(height: 200, alignment: .topLeading)
        /* Стикер с пачкой денег в правом верхнем углу живой карточки:
           говорит «деньги» без слов и заполняет пустую середину. */
        .overlay(alignment: .topTrailing) {
            if live, let cash = UIImage(named: "cash.png") {
                Image(uiImage: cash)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 118)
                    .rotationEffect(.degrees(-6))
                    .shadow(color: tone.base.opacity(0.35), radius: 10, y: 6)
                    .padding(.top, 32)
                    .padding(.trailing, 44)
                    .accessibilityHidden(true)
                    .allowsHitTesting(false)
            }
        }
        .background {
            ZStack(alignment: .topLeading) {
                if live {
                    LinearGradient(
                        colors: [tone.glow.mix(with: .white, by: 0.12), tone.glow.mix(with: .white, by: 0.42)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                    RadialGradient(
                        colors: [.white.opacity(0.55), .white.opacity(0)],
                        center: UnitPoint(x: 0.15, y: 0.1),
                        startRadius: 0,
                        endRadius: 260
                    )
                    /* Глянцевый блик по диагонали: карточка читается
                       пластиком, а не плоской заливкой. */
                    LinearGradient(
                        stops: [
                            .init(color: .white.opacity(0), location: 0.42),
                            .init(color: .white.opacity(0.22), location: 0.5),
                            .init(color: .white.opacity(0), location: 0.58),
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                } else {
                    Brand.paper
                }
            }
        }
        .clipShape(.rect(cornerRadius: 28, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .strokeBorder(live ? .white.opacity(0.6) : Brand.ink.opacity(0.08), lineWidth: 1.2)
        }
        .shadow(color: live ? tone.base.opacity(0.28) : Brand.ink.opacity(0.06), radius: 18, y: 10)
    }

    private func walletDetail(_ detail: WalletDetail) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                walletFace(detail.wallet, expanded: true)
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                days(detail.wallet, selectable: false)
                walletPaymentHistory(detail)
            }
            .padding(.bottom, 32)
        }
        .meshPage()
        .safeAreaInset(edge: .top, spacing: 0) {
            HStack {
                Text(L("tab.payroll"))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Brand.ink)
                Spacer()
                Button(L("common.close"), systemImage: "xmark") { openedWallet = nil }
                    .labelStyle(.iconOnly)
                    .font(.system(size: 16, weight: .semibold))
                    .frame(width: 44, height: 44)
                    .buttonStyle(.glass)
                    .buttonBorderShape(.circle)
                    .accessibilityIdentifier("payroll.wallet.close")
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 6)
            .background(Brand.bg.ignoresSafeArea(edges: .top))
        }
        .accessibilityIdentifier("payroll.wallet.detail")
    }

    @ViewBuilder
    private func walletPaymentHistory(_ detail: WalletDetail) -> some View {
        // A missing staff ID cannot safely be matched by name: two people may
        // share a name, and deleted people may have nil IDs in old payments.
        if let staffId = detail.wallet.staffId {
            let payments = detail.payments
                .filter { $0.rows.contains { $0.staffId == staffId } }
                .sorted { $0.paidAt > $1.paidAt }
            let shown = Array(payments.prefix(walletHistoryShown))
            VStack(alignment: .leading, spacing: 10) {
                Text(L("payroll.tabHistory"))
                    .font(.headline)
                    .foregroundStyle(Brand.ink)
                    .padding(.horizontal, 6)
                if payments.isEmpty {
                    Text(L("payroll.historyEmpty"))
                        .font(.subheadline)
                        .foregroundStyle(Brand.muted)
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .paperCard(20)
                } else {
                    ForEach(shown) { payment in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(longDay(dayKey(payment.paidAt)))
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(Brand.muted)
                                .padding(.horizontal, 6)
                            paymentCard(payment, scopedRows: payment.rows.filter { $0.staffId == staffId })
                        }
                    }
                    if shown.count < payments.count {
                        Button(L("payroll.showMore", "\(min(historyPage, payments.count - shown.count))")) {
                            walletHistoryShown += historyPage
                        }
                        .buttonStyle(.glass)
                        .frame(maxWidth: .infinity)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 26)
        }
    }

    /// Никого в листе: ни долга, ни записей.
    private var emptyWallet: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: "checkmark")
                .font(.system(size: 18, weight: .black))
                .foregroundStyle(.white)
                .frame(width: 44, height: 44)
                .background(Brand.good, in: .circle)
            Spacer(minLength: 0)
            Text(L("payroll.dayAllPaid"))
                .font(.system(size: 22, weight: .bold, design: .rounded))
                .foregroundStyle(Brand.ink)
            Text(L("payroll.nothingUnpaid"))
                .font(.system(size: 13))
                .foregroundStyle(Brand.muted)
        }
        .padding(20)
        .frame(maxWidth: .infinity, minHeight: 170, alignment: .topLeading)
        .background(Brand.paper, in: .rect(cornerRadius: 28, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).strokeBorder(Brand.ink.opacity(0.08), lineWidth: 1.2))
        .shadow(color: Brand.ink.opacity(0.06), radius: 18, y: 10)
    }

    // ══════════════════════════ дни человека ══════════════════════════

    /**
     * Дни выбранного кошелька.
     *
     * Открытые — с флажком, рассчитанные — за подписью «показать
     * выплаченные». Строка раскрывается в машины: цена, ставка в момент
     * записи и доля — ответ на «почему столько».
     */
    private func days(_ wallet: Wallet, selectable: Bool = true) -> some View {
        let today = dayKey(now)
        /* Только открытые дни и сегодняшний. Выплаченные здесь не
           показываются вовсе: для них есть вкладка «История», и второй
           список того же самого под кнопкой только путал. */
        let open = wallet.entries.filter { $0.person.earned > 0 || $0.day.day == today }

        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("\(wallet.name) · \(L("payroll.byDays").lowercased())")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Brand.ink)
                    .lineLimit(1)
                Spacer()
                if selectable, open.filter(\.payable).count > 1, !allPicked(wallet) {
                    Button(L("payroll.selectAll")) { togglePerson(wallet) }
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Brand.grape)
                        .buttonStyle(.press)
                }
            }
            .padding(.horizontal, 6)

            VStack(spacing: 0) {
                    /* Сегодня ещё не мыли: пустой сегодняшний день — это
                       ответ, а не отсутствие ответа. */
                    if !open.contains(where: { $0.day.day == today }) {
                        HStack(spacing: 12) {
                            Image(systemName: "sun.max")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(Brand.muted)
                                .frame(width: 28, height: 28)
                                .background(Brand.ink.opacity(0.05), in: .circle)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(dayTitle(today, today: today))
                                    .font(.system(size: 15, weight: .semibold))
                                    .foregroundStyle(Brand.ink)
                                Text(L("payroll.dayEmpty"))
                                    .font(.system(size: 12))
                                    .foregroundStyle(Brand.muted)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 13)
                        if !open.isEmpty { divider }
                    }
                    ForEach(Array(open.enumerated()), id: \.element.id) { i, entry in
                        if i > 0 { divider }
                        row(entry, today: today, selectable: selectable)
                    }
                }
                .background(Brand.paper, in: .rect(cornerRadius: 24, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(Brand.ink.opacity(0.07), lineWidth: 1))
                .shadow(color: Brand.ink.opacity(0.05), radius: 12, y: 6)
        }
        .padding(.horizontal, 16)
        .padding(.top, 26)
        .animation(reduceMotion ? nil : .snappy(duration: Motion.normal), value: focus)
    }

    private var divider: some View {
        Rectangle().fill(Brand.ink.opacity(0.06)).frame(height: 1).padding(.leading, 16)
    }

    private func row(_ entry: Entry, today: String, selectable: Bool = true) -> some View {
        let person = entry.person
        let day = entry.day.day
        let id = key(day, person)
        let owed = person.earned > 0
        let closed = !owed && person.paid > 0
        let on = picked.contains(id)
        let isOpen = opened.contains(id)

        return VStack(spacing: 0) {
            HStack(spacing: 12) {
                if entry.payable, selectable {
                    Button {
                        withAnimation(reduceMotion ? nil : Motion.springSnap) {
                            if on { picked.remove(id) } else { picked.insert(id) }
                        }
                        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
                    } label: {
                        Image(systemName: "checkmark")
                            .font(.system(size: 13, weight: .black))
                            .foregroundStyle(on ? Brand.onLime : Brand.ink.opacity(0.25))
                            .frame(width: 28, height: 28)
                            .background(on ? Brand.lime : Brand.ink.opacity(0.05), in: .circle)
                            .overlay(Circle().strokeBorder(Brand.ink.opacity(on ? 0 : 0.12), lineWidth: 1))
                            .contentShape(Rectangle().inset(by: -8))
                    }
                    .buttonStyle(.press)
                    .disabled(settling)
                } else {
                    Image(systemName: closed ? "checkmark" : owed ? "calendar" : "minus")
                        .font(.system(size: 12, weight: .black))
                        .foregroundStyle(closed ? .white : Brand.muted)
                        .frame(width: 28, height: 28)
                        .background(closed ? Brand.good : Brand.ink.opacity(0.05), in: .circle)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(dayTitle(day, today: today))
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(closed ? Brand.muted : Brand.ink)
                        .lineLimit(1)
                    Text(Terms.units(person.count, unitOne))
                        .font(.system(size: 12))
                        .monospacedDigit()
                        .foregroundStyle(Brand.muted)
                        .lineLimit(1)
                }

                Spacer(minLength: 6)

                VStack(alignment: .trailing, spacing: 2) {
                    Text(money(owed ? person.earned : person.paid, currency))
                        .font(.system(size: 16, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(closed ? Brand.muted : Brand.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                    if closed, let paidAt = person.paidAt {
                        Text(stamp(paidAt))
                            .font(.system(size: 11))
                            .monospacedDigit()
                            .foregroundStyle(Brand.good)
                    } else if owed, person.paid > 0 {
                        Text(L("payroll.alreadyPaid", money(person.paid, currency)))
                            .font(.system(size: 11))
                            .monospacedDigit()
                            .foregroundStyle(Brand.muted)
                    }
                }

                if person.lines != nil {
                    Image(systemName: "chevron.down")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(Brand.muted.opacity(0.7))
                        .rotationEffect(.degrees(isOpen ? 180 : 0))
                        .frame(width: 14)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 13)
            .contentShape(.rect)
            .onTapGesture {
                guard person.lines != nil else { return }
                withAnimation(reduceMotion ? nil : .snappy(duration: Motion.normal)) {
                    if isOpen { opened.remove(id) } else { opened.insert(id) }
                }
            }

            if isOpen, let lines = person.lines {
                VStack(spacing: 6) {
                    ForEach(lines) { line in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(line.title)
                                .foregroundStyle(Brand.ink)
                                .lineLimit(1)
                                .truncationMode(.tail)
                                .minimumScaleFactor(0.85)
                            Spacer(minLength: 6)
                            Text(line.formula(money(line.price, currency)))
                                .foregroundStyle(Brand.muted)
                                .lineLimit(1)
                            Text(money(line.earned, currency))
                                .fontWeight(.bold)
                                .foregroundStyle(Brand.ink)
                        }
                        .font(.system(size: 12))
                        .monospacedDigit()
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(Brand.ink.opacity(0.035), in: .rect(cornerRadius: 14, style: .continuous))
                .padding(.horizontal, 12)
                .padding(.bottom, 12)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
    }


    // ══════════════════════════ пусто и сломалось ══════════════════════

    private var outdated: some View {
        VStack(spacing: 10) {
            Image(systemName: "arrow.trianglehead.2.clockwise")
                .font(.system(size: 22))
                .foregroundStyle(Brand.muted)
            Text(L("payroll.notOnServer"))
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Brand.ink)
            Text(L("errors.appNewer"))
                .font(.system(size: 13))
                .foregroundStyle(Brand.muted)
            Button(L("common.retry")) { Task { await reload() } }
                .buttonStyle(.glass)
                .padding(.top, 6)
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 44)
    }

    private func problem(_ text: String) -> some View {
        TetrFailure(title: text, retry: { await reload() })
            .padding(.top, 40)
            .padding(.horizontal, 16)
    }

    // ══════════════════════════ история ══════════════════════════

    /// Что уже отдано — секцией внизу, по дню ВЫПЛАТЫ: сюда приходят с
    /// вопросом «когда я реально отдал деньги».
    private func history(_ board: API.PayrollBoard) -> some View {
        let today = dayKey(now)
        /* Первые десять, дальше по кнопке: у мойки за год набирается
           несколько сотен выплат, и рисовать их все разом незачем. */
        let sorted = board.payments.sorted { $0.paidAt > $1.paidAt }
        let shown = Array(sorted.prefix(historyShown))
        let rest = sorted.count - shown.count
        let groups = Dictionary(grouping: shown) { dayKey($0.paidAt) }

        return VStack(alignment: .leading, spacing: 10) {
            if board.totals.settled > 0 {
                PillChip(text: "\(sentence(L("payroll.paid"))) · \(money(board.totals.settled, currency))", ink: .white, fill: Brand.good, outlined: false)
                    .padding(.bottom, 4)
            }

            if board.payments.isEmpty {
                Text(L("payroll.historyEmpty"))
                    .font(.system(size: 13))
                    .foregroundStyle(Brand.muted)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 22)
                    .background(Brand.paper.opacity(0.6), in: .rect(cornerRadius: 20, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(Brand.ink.opacity(0.06), lineWidth: 1))
            } else {
                ForEach(groups.keys.sorted(by: >), id: \.self) { key in
                    Text(dayTitle(key, today: today))
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Brand.muted)
                        .padding(.horizontal, 6)
                        .padding(.top, 4)
                    ForEach(groups[key] ?? []) { payment in
                        paymentCard(payment)
                    }
                }
                if rest > 0 {
                    Button {
                        withAnimation(reduceMotion ? nil : .snappy(duration: Motion.normal)) {
                            historyShown += historyPage
                        }
                    } label: {
                        Text(L("payroll.showMore", "\(min(rest, historyPage))"))
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(Brand.ink)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 13)
                            .background(Brand.paper, in: .capsule)
                            .overlay(Capsule().strokeBorder(Brand.ink.opacity(0.08), lineWidth: 1))
                            .contentShape(.capsule)
                    }
                    .buttonStyle(.press)
                    .padding(.top, 6)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 18)
    }

    private func paymentCard(_ payment: API.PayrollPayment, scopedRows: [API.PayrollPaymentRow]? = nil) -> some View {
        let rows = scopedRows ?? payment.rows
        let total = scopedRows.map { $0.reduce(0) { $0 + $1.amount } } ?? payment.total
        return HStack(alignment: .top, spacing: 12) {
            Text(time(payment.paidAt))
                .font(.system(size: 12, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(Brand.muted)
                .padding(.top, 2)

            VStack(alignment: .leading, spacing: 4) {
                ForEach(rows) { line in
                    HStack(spacing: 8) {
                        Circle()
                            .fill(Brand.personTone(line.name ?? "—").base)
                            .frame(width: 8, height: 8)
                        Text(line.name ?? "—")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Brand.ink)
                            .lineLimit(1)
                        Spacer(minLength: 6)
                        Text(money(line.amount, currency))
                            .font(.system(size: 14, weight: .bold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(Brand.ink)
                    }
                }
                if rows.count > 1 {
                    Rectangle().fill(Brand.ink.opacity(0.08)).frame(height: 1).padding(.top, 3)
                    HStack {
                        Text(L("common.total"))
                            .font(.system(size: 12))
                            .foregroundStyle(Brand.muted)
                        Spacer()
                        Text(money(total, currency))
                            .font(.system(size: 15, weight: .bold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(Brand.ink)
                    }
                }
                Text(workLabel(payment, includeUnits: scopedRows == nil))
                    .font(.system(size: 12))
                    .monospacedDigit()
                    .foregroundStyle(Brand.muted)
                    .padding(.top, 2)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Brand.paper, in: .rect(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(Brand.ink.opacity(0.06), lineWidth: 1))
        .shadow(color: Brand.ink.opacity(0.04), radius: 10, y: 4)
    }

    private func workLabel(_ payment: API.PayrollPayment, includeUnits: Bool = true) -> String {
        var line: String
        if let day = payment.day {
            line = L("payroll.forWork", longDay(day))
        } else {
            let last = dayKey(payment.periodTo.addingTimeInterval(-0.001))
            if payment.periodFrom.timeIntervalSince1970 <= 0 {
                line = L("payroll.forWorkUpTo", longDay(last))
            } else {
                let first = dayKey(payment.periodFrom)
                line = first == last
                    ? L("payroll.forWork", longDay(first))
                    : L("payroll.forWorkRange", longDay(first), longDay(last))
            }
        }
        if includeUnits, let units = payment.units, units > 0 { line += " · \(Terms.units(units, unitOne))" }
        return line
    }

    // ══════════════════════════ расчёт ══════════════════════════

    /// Плавающая лаймовая кнопка: одна на экран, как на смене.
    @ViewBuilder
    private var dock: some View {
        let items = allPicked()
        if !items.isEmpty {
            Button {
                asking = items
            } label: {
                HStack(spacing: 10) {
                    Text(L("payroll.paySum", money(items.reduce(0) { $0 + $1.amount }, currency)))
                    if items.count > 1 {
                        Text("\(items.count)")
                            .font(.system(size: 13, weight: .bold))
                            .monospacedDigit()
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(Brand.onLime.opacity(0.14), in: .capsule)
                    }
                }
            }
            .buttonStyle(LimeButton(loading: settling, busyTitle: L("payroll.paying")))
            .disabled(settling)
            .shadow(color: Brand.lime.opacity(0.5), radius: 18, y: 8)
            .padding(.horizontal, 16)
            .padding(.bottom, 6)
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }

    @ViewBuilder
    private var toast: some View {
        if let note {
            Text(note)
                .font(.system(size: 13, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(Brand.onInk)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Brand.ink, in: .rect(cornerRadius: 14, style: .continuous))
                .padding(.bottom, 96)
                .transition(.opacity.combined(with: .move(edge: .bottom)))
        }
    }

    private func confirmText(_ items: [Pick]) -> String {
        var lines = items.map { "\($0.name) · \(money($0.amount, currency))" }
        if items.count > 1 {
            lines.append(L("payroll.feedTotal", money(items.reduce(0) { $0 + $1.amount }, currency)))
        }
        let days = Set(items.map(\.day)).sorted()
        let today = dayKey(now)
        let when = days.count == 1 ? dayTitle(days[0], today: today) : nil
        return ([when].compactMap { $0 } + lines).joined(separator: "\n")
    }

    /**
     * Что сервер на самом деле записал.
     *
     * Сумму считает сервер, и она не обязана совпадать с выбранной: долг
     * мог измениться между листом на экране и нажатием, а расчёт с
     * несколькими людьми идёт по одному и может оборваться посередине
     * (`settleMany` возвращает `ok: false` и то, что успело лечь).
     * `ok` необязательный: старый сервер отвечал одной суммой.
     */
    private struct Settled: Decodable {
        let ok: Bool?
        let paid: Int
    }

    private func settle(_ items: [Pick]) async {
        settling = true
        defer { settling = false }

        let result: Settled
        do {
            result = try await session.authed { token in
                try await APIClient.shared.send(
                    "payouts",
                    method: "POST",
                    body: ["items": items.map { ["staffId": $0.staffId, "day": $0.day] }],
                    token: token,
                    as: Settled.self
                )
            }
        } catch let error as APIError where error.isOffline {
            /* Ответа нет — это не «не записано». Запрос мог дойти, а ответ
               потеряться, и деньги к этому моменту уже отданы из рук в
               руки. Правда только на сервере: перечитываем лист и
               показываем, что там лежит. Повторять POST сами не смеем —
               вторая отметка того же дня легла бы в историю второй
               выплатой. */
            UINotificationFeedbackGenerator().notificationOccurred(.warning)
            show(L("payroll.unsure"))
            picked.removeAll()
            await reload()
            return
        } catch {
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            show(L("payroll.failed"))
            picked.removeAll()
            await reload()
            return
        }

        picked.removeAll()

        /* Показываем то, что легло, а не то, что просили. Раньше здесь
           складывались выбранные суммы, и «выплата отмечена · 24 000»
           появлялась даже когда сервер записал половину или ничего:
           ответ он присылал, а приложение его не читало. */
        if result.ok == false {
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            show(result.paid > 0 ? L("payroll.partial", money(result.paid, currency)) : L("payroll.failed"))
        } else if result.paid == 0 {
            /* Долга уже не было: отметили с другого телефона или из
               кабинета. Не ошибка и не успех — просто лист устарел. */
            UINotificationFeedbackGenerator().notificationOccurred(.warning)
            show(L("payroll.nothingOwed"))
        } else {
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            show(L("payroll.done", money(result.paid, currency)))
        }
        await reload()
    }

    private func show(_ text: String) {
        withAnimation(reduceMotion ? nil : .snappy(duration: Motion.normal)) { note = text }
        Task {
            try? await Task.sleep(for: .seconds(4))
            withAnimation(reduceMotion ? nil : .snappy(duration: Motion.normal)) { note = nil }
        }
    }

    private func reload() async {
        loading = true
        defer { loading = false }
        do {
            let fresh = try await session.authed { token in
                try await APIClient.shared.send("payroll", token: token, as: API.Payroll.self)
            }
            if payroll == nil || reduceMotion {
                let first = payroll == nil
                payroll = fresh
                arrive(first: first)
            } else {
                withAnimation(.snappy(duration: Motion.slow)) { payroll = fresh }
            }
            if let board = fresh.board {
                let ids = wallets(board).map(\.id)
                if focus == nil || !ids.contains(focus!) { focus = ids.first }
            }
            failure = nil
        } catch is CancellationError {
            return
        } catch let error as APIError {
            beat = .here
            countUp = true
            failure = error.isOffline
                ? L("errors.offline")
                : L("errors.server", "\(error.status) \(error.code ?? "—")")
        } catch {
            failure = Failure.text(error)
        }
    }

    // ══════════════════════════ мелочи ══════════════════════════

    private func key(_ day: String, _ person: API.PayrollPerson) -> String {
        "\(day)|\(person.staffId ?? "—")"
    }

    private func pick(_ person: API.PayrollPerson, day: String) -> Pick? {
        guard let staffId = person.staffId else { return nil }
        return Pick(staffId: staffId, day: day, name: person.name ?? "—", amount: person.earned)
    }

    private func allPicked() -> [Pick] {
        guard let days = payroll?.board?.days else { return [] }
        return days.flatMap { day in
            day.people.compactMap { person in
                picked.contains(key(day.day, person)) ? pick(person, day: day.day) : nil
            }
        }
    }

    private func dayTitle(_ day: String, today: String) -> String {
        day == today ? L("payroll.todayDay", longDay(day)) : longDay(day)
    }

    private var zone: TimeZone {
        session.tenant.flatMap { TimeZone(identifier: $0.timezone) } ?? .current
    }

    private func formatter(_ format: String) -> DateFormatter {
        let f = DateFormatter()
        f.locale = LangStore.currentLang.locale
        f.timeZone = zone
        f.dateFormat = format
        return f
    }

    private func dayFormatter(_ template: String) -> DateFormatter {
        let f = DateFormatter()
        f.locale = LangStore.currentLang.locale
        f.timeZone = zone
        f.setLocalizedDateFormatFromTemplate(template)
        return f
    }

    private func longDay(_ day: String) -> String {
        let parse = DateFormatter()
        parse.locale = Locale(identifier: "en_US_POSIX")
        parse.timeZone = TimeZone(identifier: "UTC")
        parse.dateFormat = "yyyy-MM-dd"
        guard let date = parse.date(from: day) else { return day }
        let noon = date.addingTimeInterval(12 * 3600)
        let thisYear = formatter("yyyy").string(from: now)
        return dayFormatter(day.hasPrefix(thisYear) ? "d MMMM" : "d MMMM y").string(from: noon)
    }

    private func dayKey(_ at: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = zone
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: at)
    }

    private func stamp(_ at: Date) -> String {
        dayFormatter("d MMM HH:mm").string(from: at)
    }

    private func time(_ at: Date) -> String {
        formatter("HH:mm").string(from: at)
    }
}
