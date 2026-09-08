import SwiftUI

/** Не системное меню, а небольшая карта бизнеса.

    Экран собран сверху вниз одной композицией: шапка, один контекстный
    блок про историю и дальше сгруппированные списки — работа, бизнес,
    учётка. Действий на экране нет вовсе: выгрузка данных уехала в профиль,
    к смене кода, устройствам и удалению бизнеса, где ей и место. Здесь
    остались только места, куда переходят.

    Цветных плиток нет намеренно. Шесть залитых прямоугольников весили
    одинаково, и приоритета не было ни у одного; цвет при этом никуда не
    делся, он ушёл в значки. Мята принадлежит людям, лаванда прейскуранту и
    филиалам, кобальт расходам, грейп деньгам и учётке — тот же смысл, что
    был у заливок, только теперь он не спорит с заголовками. */
struct MoreView: View {
    @EnvironmentObject private var session: Session

    /// Выручка по дням ленты. Ключ — дата в том же виде, в каком её
    /// присылает сервер.
    @State private var week: [String: API.MonthDay] = [:]
    /// День, который открыт листом. Сама лента при этом остаётся на месте.
    @State private var picked: String?
    /// Сколько дней в ленте. Семь — это ровно неделя, и в ней всегда есть
    /// и суббота, и вторник: у мойки разница между ними в разы.
    private let strip = 7

    /* Шкала скруглений одна на весь экран, а не своя у каждого блока:
       крупный контекстный блок, карточки и коробки списков. Три значения,
       и ни одного случайного. */
    private let rCard: CGFloat = 26
    private let rGroup: CGFloat = 22
    private let rDay: CGFloat = 12

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                calendarCard

                /* Три коробки подряд, а не одна на всё: список из восьми
                   строк читается таблицей, где всё равнозначно. Разрыв между
                   коробками и есть ответ на вопрос «где работа, где бизнес,
                   где я сам» — его видно раньше, чем прочитано первое
                   слово. */
                VStack(alignment: .leading, spacing: 14) {
                    workGroup
                    businessGroup
                    accountGroup
                }

                signOutRow
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .meshPage()
        /* Заголовок и подпись — нативные, как на сводке и зарплате:
           крупный в ряду панели, при прокрутке сжимается в центр. */
        .brandTitleFont()
        .navigationTitle(L("more.title"))
        .navigationSubtitle(L("more.lead"))
        .toolbarTitleDisplayMode(.inlineLarge)
        .sheet(item: $picked) { date in
            DayView(date: date).environmentObject(session)
        }
        .task { await loadWeek() }
    }

    // ══════════════════════════ контекстный блок ══════════════════════════

    /**
     * История бизнеса, и сразу последняя неделя её.
     *
     * Раньше здесь была лавандовая заливка, крупная подпись и декоративный
     * календарь в углу — то есть карточка обещала календарь, а показывала
     * рисунок календаря. Теперь она показывает сам календарь: семь клеток,
     * сегодня и шесть дней назад, залитых по величине выручки. Тот же приём,
     * что на экране месяца, и та же шкала: глаз сравнивает светлоту без
     * измерения, и форма недели читается раньше, чем прочитано слово.
     *
     * Заливки у карточки больше нет, белая бумага как у списков. Цвет
     * остался ровно там, где он несёт число, — внутри клеток. Пустой день
     * бумажный, лучший день сиреневый; это не украшение, это данные.
     *
     * Нажатий два разных, и они не перепутаются: заголовок ведёт в месяц,
     * клетка открывает свой день листом поверх. Поэтому карточка не одна
     * большая ссылка, как была: внутри ссылки нельзя нажать что-то ещё.
     */
    private var calendarCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            NavigationLink {
                CalendarView()
            } label: {
                HStack(alignment: .center, spacing: 12) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text("365")
                            .font(.system(size: 11, weight: .black, design: .rounded))
                            .tracking(1.4)
                            .foregroundStyle(Brand.muted)
                        Text(L("calendar.title"))
                            .font(.system(size: 24, weight: .bold))
                            .foregroundStyle(Brand.ink)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "arrow.up.right")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(Brand.grape)
                }
                .contentShape(.rect)
            }
            .buttonStyle(.press)

            dayStrip
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .paperCard(rCard)
    }

    /**
     * Лента последних дней.
     *
     * Даты считаются на телефоне и стоят на месте сразу, ещё до ответа
     * сервера: иначе карточка при каждом открытии экрана меняла бы высоту,
     * а по пустому месту не нажать. Выручка приезжает следом и только
     * подкрашивает уже нарисованные клетки.
     */
    private var dayStrip: some View {
        let dates = Self.lastDates(strip)
        // потолок шкалы — лучший день недели, а не месяца: неделя из
        // одинаково бледных клеток не говорит ничего
        let peak = max(1, dates.compactMap { week[$0]?.revenue }.max() ?? 1)

        return HStack(spacing: 5) {
            ForEach(dates, id: \.self) { date in
                dayCell(date, peak: peak)
            }
        }
    }

    private func dayCell(_ date: String, peak: Int) -> some View {
        let revenue = week[date]?.revenue ?? 0
        let share = min(1, Double(revenue) / Double(peak))
        /* Та же кривая и тот же приглушённый верх, что на экране месяца:
           клетка остаётся светлой при любой выручке, чтобы лучший день не
           читался ошибкой или выделением. */
        let heat = revenue > 0 ? 0.05 + 0.19 * sqrt(share) : 0
        let isToday = date == CalendarView.today()

        return Button {
            picked = date
        } label: {
            VStack(spacing: 2) {
                Text(Self.weekdayShort(date))
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Brand.muted)
                Text(String(Int(date.suffix(2)) ?? 0))
                    .font(.system(size: 15, weight: revenue > 0 ? .bold : .medium))
                    .monospacedDigit()
                    .foregroundStyle(revenue > 0 ? Brand.ink : Brand.muted)
                /* Сколько машин. Число мельче суммы намеренно: заливка уже
                   сказала про деньги, а это ответ на другой вопрос — много
                   ли было работы. */
                Text(week[date].map { $0.count > 0 ? "\($0.count)" : " " } ?? " ")
                    .font(.system(size: 9, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(Brand.muted)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 56)
            .background(Brand.grapeFill.opacity(heat), in: .rect(cornerRadius: rDay, style: .continuous))
            .overlay {
                /* Сегодня обведено, а не залито: заливка здесь занята
                   выручкой, и второй смысл на неё не повесить. */
                if isToday {
                    RoundedRectangle(cornerRadius: rDay, style: .continuous)
                        .strokeBorder(Brand.ink.opacity(0.32), lineWidth: 1.2)
                } else {
                    RoundedRectangle(cornerRadius: rDay, style: .continuous)
                        .strokeBorder(Brand.ink.opacity(0.06), lineWidth: 0.8)
                }
            }
        }
        .buttonStyle(.press)
        .accessibilityLabel(LocalDate.fromYMD(date).map { LocalDate.longDay($0) } ?? date)
    }

    /// Последние `n` дат, сегодня последней.
    private static func lastDates(_ n: Int) -> [String] {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        let cal = Calendar.current
        return (0..<n).reversed().compactMap { back in
            cal.date(byAdding: .day, value: -back, to: Date()).map { f.string(from: $0) }
        }
    }

    /// Короткое имя дня недели на языке интерфейса.
    private static func weekdayShort(_ ymd: String) -> String {
        guard let date = LocalDate.fromYMD(ymd) else { return "" }
        let names = LocalDate.shortWeekdays
        guard names.count == 7 else { return "" }
        // у системы 1 — воскресенье, у продукта неделя начинается с понедельника
        let index = (Calendar.current.component(.weekday, from: date) + 5) % 7
        return names[index]
    }

    /**
     * Выручка за ленту.
     *
     * Сервер отдаёт календарь месяцами, а лента в начале месяца заходит в
     * предыдущий — тогда запросов два. Дальше первой недели это никогда не
     * второй запрос впустую: условие ровно по дате, а не «на всякий
     * случай».
     */
    private func loadWeek() async {
        let dates = Self.lastDates(strip)
        var months = [CalendarView.currentMonth()]
        if let first = dates.first, first.prefix(7) != months[0] {
            months.append(String(first.prefix(7)))
        }

        var loaded: [String: API.MonthDay] = [:]
        for month in months {
            let data: API.Month? = try? await session.authed { token in
                try await APIClient.shared.send("calendar?month=\(month)", token: token, as: API.Month.self)
            }
            for day in data?.days ?? [] { loaded[day.date] = day }
        }
        guard !loaded.isEmpty else { return }
        week = loaded
    }

    // ══════════════════════════ разделы ══════════════════════════

    /**
     * Разделы строками, у каждой из которых есть подпись.
     *
     * Прежний список называл места одним словом: «Клиенты», «Услуги»,
     * «Расходы». Слово отвечает, КУДА ведёт строка, и молчит о том, что
     * там внутри, — а «Ещё» открывают именно затем, чтобы вспомнить, где
     * что лежит. Подпись под именем стоит ровно за этим: «визиты и
     * история машин», «прайс и классы», «аренда, вода, химия». Читать её
     * каждый раз не нужно, она нужна первые несколько раз.
     *
     * Значок переехал в тонированный квадрат и взял цвет своего раздела —
     * тот же, каким этот раздел окрашен на своих экранах: мята у людей,
     * лаванда у прайса, кобальт у расходов, грейп у денег. По цвету
     * строку находят раньше, чем прочитано слово, а голый значок на
     * бумаге этого не давал: шесть значков подряд в один тон читались
     * рядом одинаковых точек.
     */
    private var workGroup: some View {
        groupCard {
            navRow(
                symbol: "person.2.fill", tint: Brand.mintInk, tile: Brand.mintCard,
                title: L("owner.tabClients"), note: L("more.clientsLead")
            ) {
                ClientsView()
            }
            separator
            navRow(
                symbol: "tag.fill", tint: Brand.lavenderInk, tile: Brand.lavenderCard,
                title: L("settings.tabServices"), note: L("more.servicesLead")
            ) {
                ServicesView()
            }
            separator
            navRow(
                symbol: "arrow.down.circle.fill", tint: Brand.sandInk, tile: Brand.sandCard,
                title: L("expenses.title"), note: L("more.expensesLead")
            ) {
                ExpensesView()
            }
            separator
            navRow(
                symbol: "chart.bar.doc.horizontal.fill", tint: Brand.grape, tile: Brand.grapeFill.opacity(0.1),
                title: L("reports.title"), note: L("more.reportLead")
            ) {
                ReportView()
            }
        }
    }

    /**
     * Команда и филиалы.
     *
     * Это тоже бизнес, но не ежедневный: проценты правят при найме, филиалы
     * заводят раз в год. Отдельная коробка говорит ровно это, и говорит
     * молча.
     */
    private var businessGroup: some View {
        groupCard {
            navRow(
                symbol: "person.3.fill", tint: Brand.mintInk, tile: Brand.mintCard,
                title: L("more.team"), note: L("more.teamLead")
            ) {
                StaffView()
            }

            /* Филиалы видит только тот, у кого их больше одного: остальные не
               должны узнать, что вторые бывают. */
            if session.canSwitch {
                separator
                navRow(
                    symbol: "building.2.fill", tint: Brand.lavenderInk, tile: Brand.lavenderCard,
                    title: L("more.points"), note: L("more.pointsLead")
                ) {
                    PointsView().navigationTitle(L("points.title"))
                        .navigationBarTitleDisplayMode(.inline)
                }
            }
        }
    }

    /**
     * Учётка отдельной коробкой от рабочих разделов.
     *
     * Профиль это язык, тема, пароль и выход, то есть не место работы, а
     * место настройки себя. Стоять в одном списке с клиентами и расходами
     * он не должен: тогда «где мои настройки» становится вопросом чтения,
     * а не взгляда.
     */
    private var accountGroup: some View {
        groupCard {
            navRow(
                symbol: "person.crop.circle.fill", tint: Brand.grape, tile: Brand.grapeFill.opacity(0.1),
                /* Подписью стоит логин, а не просто номер: владелец
                   входит почтой, и увидеть под «Профилем и входом» он
                   должен ровно ту строку, которую набирает в окне входа.
                   Почты нет — значит это сотрудник, и логин у него
                   телефон. */
                title: L("more.profileLead"),
                note: session.me?.email ?? session.me?.phone ?? ""
            ) {
                ProfileView()
            }

            separator

            /* Оформление отдельной строкой, а не внутри профиля: профиль
               про человека и его доступ, а это про то, как продукт
               выглядит на телефоне. */
            navRow(
                symbol: "paintbrush.fill", tint: Brand.lavenderInk, tile: Brand.lavenderCard,
                title: L("appearance.title"), note: L("more.appearanceLead")
            ) {
                AppearanceView()
            }
        }
    }

    /**
     * Выход.
     *
     * Единственное действие на экране, где всё остальное — места, куда
     * переходят. Поэтому оно стоит последним и за отбивкой, а не строкой
     * среди разделов.
     *
     * Знак приглушённый, а не цветной: цвет на этом экране означает
     * раздел, и красить им действие значит обещать ещё одно место.
     * Красным он тоже быть не может — красный в продукте значит ровно
     * «удалить», и путать эти два сигнала нельзя.
     */
    private var signOutRow: some View {
        groupCard {
            /* Без вопроса. Вопрос здесь стоял ради промаха пальцем, но
               выезжал выноской от самой строки, и в ней помещалась одна
               кнопка из двух: «Отмена» обрезалась краем экрана, и окно,
               которое должно было защищать от случайного нажатия, само
               выглядело поломкой. Выход не разрушителен — данные
               остаются на сервере, — и цена ошибки здесь ровно один
               повторный вход. */
            Button {
                Task { await session.signOut() }
            } label: {
                rowFace(
                    symbol: "power", tint: Brand.muted, tile: Brand.ink.opacity(0.06),
                    title: L("auth.signOut"), note: nil, trailing: nil
                )
            }
            .buttonStyle(.press)
        }
    }

    /// Коробка списка: бумага, общее скругление, волосяная грань.
    private func groupCard<C: View>(@ViewBuilder _ content: () -> C) -> some View {
        VStack(spacing: 0) {
            content()
        }
        .paperCard(rGroup)
    }

    /// Волосяная линия между строками, отбитая под квадрат значка: линия
    /// во всю ширину режет коробку пополам, а с отступом ведёт взгляд по
    /// именам.
    private var separator: some View {
        Rectangle()
            .fill(Brand.ink.opacity(0.06))
            .frame(height: 0.7)
            .padding(.leading, 68)
    }

    private func navRow<D: View>(
        symbol: String,
        tint: Color,
        tile: Color,
        title: String,
        note: String?,
        @ViewBuilder destination: @escaping () -> D
    ) -> some View {
        NavigationLink {
            destination()
        } label: {
            rowFace(symbol: symbol, tint: tint, tile: tile, title: title, note: note)
        }
        .buttonStyle(.press)
    }

    /// Лицо строки: значок в тонированном квадрате, имя, подпись, шеврон.
    private func rowFace(
        symbol: String,
        tint: Color,
        tile: Color,
        title: String,
        note: String?,
        trailing: String? = "chevron.right"
    ) -> some View {
        HStack(spacing: 13) {
            Image(systemName: symbol)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 40, height: 40)
                .background(tile, in: .rect(cornerRadius: 13, style: .continuous))

            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Brand.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                if let note, !note.isEmpty {
                    Text(note)
                        .font(.system(size: 12))
                        .foregroundStyle(Brand.muted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
            }

            Spacer(minLength: 4)

            if let trailing {
                Image(systemName: trailing)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Brand.muted.opacity(0.7))
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
        .contentShape(.rect)
    }
}
