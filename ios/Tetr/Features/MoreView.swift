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
    /// Открыт вопрос выхода из аккаунта.
    @State private var leaving = false

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
                VStack(alignment: .leading, spacing: 14) {
                    header
                    calendarCard
                }

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
        .background(Brand.board.ignoresSafeArea())
        .sheet(item: $picked) { date in
            DayView(date: date).environmentObject(session)
        }
        .task { await loadWeek() }
    }

    // ══════════════════════════ шапка ══════════════════════════

    /**
     * Имя экрана крупно, хотя оно же написано во вкладке.
     *
     * Повтор здесь не лишний: вкладка это где я нахожусь, заголовок это с
     * чего начинается страница. Но заголовок остаётся заголовком экрана, а
     * не витриной: тридцать два пункта, подпись под ним и никакого воздуха
     * сверх нужного. Вместе с чёлкой шапка занимает около сотни точек, и
     * первый экран начинается с содержания, а не с типографики.
     */
    private var header: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(L("more.title"))
                .font(.system(size: 32, weight: .bold))
                .foregroundStyle(Brand.onBoard)
            Text(L("more.lead"))
                .font(.system(size: 15))
                .foregroundStyle(Brand.boardMuted)
        }
        .padding(.horizontal, 4)
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
                CalendarView().toolbar(.hidden, for: .navigationBar)
            } label: {
                HStack(alignment: .center, spacing: 12) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text("365")
                            .font(.system(size: 11, weight: .black, design: .rounded))
                            .tracking(1.4)
                            .foregroundStyle(Brand.boardMuted)
                        Text(L("calendar.title"))
                            .font(.system(size: 24, weight: .bold))
                            .foregroundStyle(Brand.onBoard)
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
        .background(Brand.boardSurface, in: .rect(cornerRadius: rCard, style: .continuous))
        .overlay { edge(rCard) }
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
                    .foregroundStyle(Brand.boardMuted)
                Text(String(Int(date.suffix(2)) ?? 0))
                    .font(.system(size: 15, weight: revenue > 0 ? .bold : .medium))
                    .monospacedDigit()
                    .foregroundStyle(revenue > 0 ? Brand.onBoard : Brand.boardMuted)
                /* Сколько машин. Число мельче суммы намеренно: заливка уже
                   сказала про деньги, а это ответ на другой вопрос — много
                   ли было работы. */
                Text(week[date].map { $0.count > 0 ? "\($0.count)" : " " } ?? " ")
                    .font(.system(size: 9, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 56)
            .background(Brand.grapeFill.opacity(heat), in: .rect(cornerRadius: rDay, style: .continuous))
            .overlay {
                /* Сегодня обведено, а не залито: заливка здесь занята
                   выручкой, и второй смысл на неё не повесить. */
                if isToday {
                    RoundedRectangle(cornerRadius: rDay, style: .continuous)
                        .strokeBorder(Brand.onBoard.opacity(0.32), lineWidth: 1.2)
                } else {
                    RoundedRectangle(cornerRadius: rDay, style: .continuous)
                        .strokeBorder(Brand.boardInk.opacity(0.06), lineWidth: 0.8)
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

    // ══════════════════════════ сгруппированные списки ══════════════════════════

    /**
     * Ежедневная работа: клиенты, прейскурант, расходы и отчёт.
     *
     * Первая коробка после контекстного блока, и это её место по частоте:
     * сюда заходят каждую неделю, в остальные две раз в месяц и раз в год.
     * Отчёт стоит последним внутри своей же коробки — он про те же деньги,
     * только собранные в месяцы.
     */
    private var workGroup: some View {
        groupCard {
            navRow(
                symbol: "person.2.fill", tint: Brand.mintInk,
                title: L("owner.tabClients"), note: nil
            ) {
                ClientsView().navigationTitle(L("owner.tabClients"))
                    .navigationBarTitleDisplayMode(.inline)
            }
            separator
            navRow(
                symbol: "tag.fill", tint: Brand.lavenderInk,
                title: L("settings.tabServices"), note: nil
            ) {
                ServicesView().navigationTitle(L("settings.services"))
                    .navigationBarTitleDisplayMode(.inline)
            }
            separator
            navRow(
                symbol: "arrow.down.circle.fill", tint: Brand.sandInk,
                title: L("expenses.title"), note: nil
            ) {
                ExpensesView().navigationTitle(L("expenses.title"))
                    .navigationBarTitleDisplayMode(.inline)
            }
            separator
            navRow(
                symbol: "chart.bar.doc.horizontal.fill", tint: Brand.grape,
                title: L("reports.title"), note: nil
            ) {
                ReportView().navigationTitle(L("reports.title"))
                    .navigationBarTitleDisplayMode(.inline)
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
                symbol: "person.3.fill", tint: Brand.mintInk,
                title: L("more.team"), note: nil
            ) {
                StaffView().navigationTitle(L("more.team"))
                    .navigationBarTitleDisplayMode(.inline)
            }

            /* Филиалы видит только тот, у кого их больше одного: остальные не
               должны узнать, что вторые бывают. */
            if session.canSwitch {
                separator
                navRow(
                    symbol: "building.2.fill", tint: Brand.lavenderInk,
                    title: L("more.points"), note: nil
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
     * Профиль это язык, тема, ПИН и выход, то есть не место работы, а место
     * настройки себя. Стоять в одном списке с клиентами и расходами он не
     * должен: тогда «где мои настройки» становится вопросом чтения, а не
     * взгляда.
     */
    private var accountGroup: some View {
        groupCard {
            navRow(
                symbol: "person.crop.circle.fill", tint: Brand.grape,
                title: L("more.profileLead"), note: nil
            ) {
                ProfileView().toolbar(.hidden, for: .navigationBar)
            }

            separator

            /* Оформление отдельной строкой, а не внутри профиля: профиль
               про человека и его доступ, а это про то, как продукт
               выглядит на телефоне. */
            navRow(
                symbol: "paintbrush.fill", tint: Brand.lavenderInk,
                title: L("appearance.title"), note: nil
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
     * Переехало сюда из профиля. Там за ним нужно было сначала зайти, а
     * выходят обычно не задумчиво: с чужого телефона, перед тем как
     * отдать аппарат, в конце смены. Два нажатия ради этого — на одно
     * больше, чем нужно.
     *
     * Знак приглушённый, а не цветной: цвет на этом экране означает
     * раздел, и красить им действие значит обещать ещё одно место.
     * Красным он тоже быть не может — красный в продукте значит ровно
     * «удалить», и путать эти два сигнала нельзя.
     */
    private var signOutRow: some View {
        groupCard {
            /* С вопросом. Строка выглядит ровно как соседние переходы, и
               промах по ней одним касанием выбрасывал человека на
               SMS-вход — самое дорогое «не туда нажал» на этом экране. */
            Button {
                leaving = true
            } label: {
                rowFace(
                    symbol: "power", tint: Brand.boardMuted,
                    title: L("auth.signOut"), note: nil, trailing: nil
                )
            }
            .buttonStyle(.press)
            .confirmationDialog(
                L("more.signOutTitle"),
                isPresented: $leaving,
                titleVisibility: .visible
            ) {
                Button(L("auth.signOut"), role: .destructive) {
                    Task { await session.signOut() }
                }
                Button(L("common.cancel"), role: .cancel) {}
            } message: {
                Text(L("more.signOutNote"))
            }
        }
    }

    /// Коробка списка: белая бумага, общее скругление, волосяная грань.
    private func groupCard<C: View>(@ViewBuilder _ content: () -> C) -> some View {
        VStack(spacing: 0) {
            content()
        }
        .background(Brand.boardSurface, in: .rect(cornerRadius: rGroup, style: .continuous))
        .overlay { edge(rGroup) }
    }

    /// Волосяная линия между строками, отбитая под текст, а не под значок:
    /// линия под значком разрезала бы коробку пополам.
    private var separator: some View {
        Rectangle()
            .fill(Brand.boardInk.opacity(0.07))
            .frame(height: 0.7)
            .padding(.leading, 56)
    }

    private func navRow<D: View>(
        symbol: String,
        tint: Color,
        title: String,
        note: String?,
        @ViewBuilder destination: @escaping () -> D
    ) -> some View {
        NavigationLink {
            destination()
        } label: {
            rowFace(symbol: symbol, tint: tint, title: title, note: note)
        }
        .buttonStyle(.press)
    }

    /**
     * Лицо строки списка.
     *
     * Значок без плашки под ним: плашка это ещё один прямоугольник, а их на
     * экране и так восемь штук, по одному на строку. Вторая строка сейчас
     * не приходит ни одной строке — смотрим, как список читается одними
     * заголовками, — но поддержку её оставляем: это свойство строки
     * настроек, а не временная надобность. Цвет раздела при этом
     * остаётся — он просто перешёл с заливки на сам знак, и в столбце из
     * четырёх строк по нему находят нужную раньше, чем прочитано слово.
     *
     * Колонка знаков фиксированной ширины, иначе широкая «стопка карточек»
     * сдвинула бы заголовок своей строки относительно соседних, и ровного
     * левого края у списка не было бы.
     */
    private func rowFace(
        symbol: String,
        tint: Color,
        title: String,
        note: String?,
        trailing: String? = "chevron.right"
    ) -> some View {
        HStack(spacing: 13) {
            Image(systemName: symbol)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 27, alignment: .center)

            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Brand.onBoard)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                if let note, !note.isEmpty {
                    Text(note)
                        .font(.system(size: 13))
                        .foregroundStyle(Brand.boardMuted)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }
            }

            Spacer(minLength: 4)

            if let trailing {
                Image(systemName: trailing)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Brand.boardMuted)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 11)
        .frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
        .contentShape(.rect)
    }

    /// Грань светлой карточки на светлом полотне: без неё белое по белому
    /// перестаёт быть карточкой.
    private func edge(_ radius: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .strokeBorder(Brand.boardInk.opacity(0.07), lineWidth: 0.8)
    }
}
