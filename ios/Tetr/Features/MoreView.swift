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
    филиалам, песок расходам, грейп деньгам и учётке — тот же смысл, что
    был у заливок, только теперь он не спорит с заголовками. */
struct MoreView: View {
    @EnvironmentObject private var session: Session

    /* Шкала скруглений одна на весь экран, а не своя у каждого блока:
       крупный контекстный блок, карточки и коробки списков. Три значения,
       и ни одного случайного. */
    private let rHero: CGFloat = 28
    private let rCard: CGFloat = 24
    private let rGroup: CGFloat = 22

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
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.board.ignoresSafeArea())
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

    /// Сколько точек и сколько из них ждут денег: то, ради чего сюда
    /// заходят, видно ещё до нажатия.
    private var points: String {
        let all = session.points.count
        let closed = session.points.filter { !$0.canRead }.count
        return closed == 0
            ? L("more.pointsAllOpen", all)
            : L("more.pointsSomeClosed", all, closed)
    }

    // ══════════════════════════ контекстный блок ══════════════════════════

    /**
     * История бизнеса: единственный крупный блок экрана.
     *
     * Он один такой намеренно. Если крупных блоков два, приоритета нет ни у
     * одного, и глазу приходится читать оба заголовка, чтобы выбрать. Здесь
     * же первым читается слово, а не картинка: календарь ушёл в подложку
     * восемью процентами лавандовых чернил и держит правый нижний угол, где
     * текста нет вовсе.
     *
     * Высота блока задана содержанием, а не числом: раньше в фиксированных
     * ста сорока восьми точках нижняя треть пустовала.
     */
    private var calendarCard: some View {
        NavigationLink {
            CalendarView().toolbar(.hidden, for: .navigationBar)
        } label: {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 5) {
                    Text("365")
                        .font(.system(size: 11, weight: .black, design: .rounded))
                        .tracking(1.4)
                        .foregroundStyle(Brand.lavenderInk.opacity(0.75))
                    Text(L("calendar.title"))
                        .font(.system(size: 26, weight: .bold))
                        .foregroundStyle(Brand.onBoard)
                    Text(L("calendar.lead"))
                        .font(.system(size: 13.5))
                        .foregroundStyle(Brand.boardMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 0)

                /* Стрелка без плашки под ней: нажимается всё равно вся
                   карточка, и задача знака не позвать, а показать, что
                   карточка ведёт куда-то. Плашка делала из него кнопку,
                   которой он не является. */
                Image(systemName: "arrow.up.right")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Brand.lavenderInk)
                    .padding(.top, 2)
            }
            .padding(18)
            .frame(maxWidth: .infinity, minHeight: 122, alignment: .topLeading)
            .background {
                ZStack {
                    Brand.lavenderCard
                    Image(systemName: "calendar")
                        .font(.system(size: 108, weight: .semibold))
                        .foregroundStyle(Brand.lavenderInk.opacity(0.085))
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                        /* Уведён за правый нижний угол настолько, чтобы под
                           описанием оставалась чистая бумага: подложка,
                           начинающаяся под строкой текста, читается не
                           украшением, а грязью на ней. */
                        .offset(x: 46, y: 44)
                }
            }
            .clipShape(.rect(cornerRadius: rHero, style: .continuous))
        }
        .buttonStyle(.press)
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
                title: L("owner.tabClients"), note: L("more.clientsLead")
            ) {
                ClientsView().navigationTitle(L("owner.tabClients"))
            }
            separator
            navRow(
                symbol: "tag.fill", tint: Brand.lavenderInk,
                title: L("settings.tabServices"), note: nil
            ) {
                ServicesView().navigationTitle(L("settings.services"))
            }
            separator
            navRow(
                symbol: "arrow.down.circle.fill", tint: Brand.sandInk,
                title: L("expenses.title"), note: nil
            ) {
                ExpensesView().navigationTitle(L("expenses.title"))
            }
            separator
            navRow(
                symbol: "chart.bar.doc.horizontal.fill", tint: Brand.grape,
                title: L("reports.title"), note: L("reports.lead")
            ) {
                ReportView().navigationTitle(L("reports.title"))
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
                title: L("more.team"), note: L("more.teamLead")
            ) {
                StaffView().navigationTitle(L("more.team"))
            }

            /* Филиалы видит только тот, у кого их больше одного: остальные не
               должны узнать, что вторые бывают. */
            if session.canSwitch {
                separator
                navRow(
                    symbol: "building.2.fill", tint: Brand.lavenderInk,
                    title: L("more.points"), note: points
                ) {
                    PointsView().navigationTitle(L("points.title"))
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

            /* Дверь обратно к настройке только тому, кто её убрал. Пропустить
               можно случайно и в первый же день, а вспомнить о ней на третий;
               без этой строки вернуть список было бы нечем. У того, кто её не
               убирал, здесь ни одного нового пикселя. */
            if session.setupHidden {
                separator
                Button {
                    Task { await session.resumeSetup() }
                } label: {
                    rowFace(
                        symbol: "list.bullet.rectangle.fill", tint: Brand.mintInk,
                        title: L("setup.resume"), note: L("setup.resumeNote"),
                        trailing: "arrow.uturn.backward"
                    )
                }
                .buttonStyle(.press)
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
     * экране и так восемь штук, по одному на строку. Цвет раздела при этом
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
        trailing: String = "chevron.right"
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
                        .font(.system(size: 12.5))
                        .foregroundStyle(Brand.boardMuted)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }
            }

            Spacer(minLength: 4)

            Image(systemName: trailing)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Brand.boardMuted)
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
