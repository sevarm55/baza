import SwiftUI

/**
 * Кабинет владельца — вариант «Տաբլո».
 *
 * Приборное табло, а не список карточек. Экран отвечает на шесть вопросов
 * в том порядке, в каком их задают: сколько мне осталось → сколько принесли
 * → сколько ушло людям и на расходы → сколько машин → что было последним.
 * Всё, что не отвечает ни на один из них, отсюда убрано.
 *
 * 1. **Один финансовый снимок.** Результат, поступления и распределение
 *    собраны на одной тихой поверхности: взгляд не прыгает между большим
 *    числом, полосой и разрозненными KPI.
 * 2. **Распределение под цифрой.** `886 300 − 122 419 − 335 882 = 427 999`.
 *    Это единственная строка на экране, которая объясняет, ОТКУДА взялось
 *    главное число, — раньше владелец сверял его с плитками сам и не
 *    всегда сходился. Мелким и приглушённым: смотрят на неё раз в неделю,
 *    но когда смотрят — она отвечает целиком.
 * 3. **График низкий и подписанный.** Ход периода — линия в 60 точек с
 *    подписями времени и лаймовыми точками там, где были деньги. Прежняя
 *    волна занимала столько же места, но не говорила, когда именно; без
 *    оси она отвечала только «ровно или рывками».
 * 4. **Операции после денег.** Сначала объём и люди, затем журнал: экран
 *    сохраняет банковскую иерархию «баланс → контекст → операции».
 */
struct OwnerView: View {
    @EnvironmentObject private var session: Session

    @State private var summary: API.Summary?
    @State private var period = "today"
    /// Период именно тех цифр, которые уже пришли с сервера. Выбор в
    /// segmented control меняется сразу, но подписи старых данных не имеют
    /// права называться новым периодом, пока его ответ ещё в пути.
    @State private var summaryPeriod = "today"
    /// Каким способом платили — фильтр журнала; nil значит «всеми».
    @State private var feedMethod: String?
    /// Поводы, требующие внимания: колокольчик в шапке.
    @State private var alerts: [API.Alert] = []
    @State private var showAlerts = false
    @State private var showClients = false
    @State private var failure: String?
    @State private var cancelling: API.FeedItem?
    /// Идёт запрос. На это время период фиксируется, чтобы второй быстрый
    /// выбор не вернул на экран ответ от предыдущего периода.
    @State private var loading = false
    @State private var detailsVisible = true
    @State private var newestFeedID: String?
    @State private var loadID = 0

    /* Прокрутку разрядов система сама по «Уменьшению движения» не гасит:
       withAnimation отрабатывает как обычно. Гасим здесь — иначе настройка,
       которую человек включил не просто так, ничего не меняет. */
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var currency: String { session.tenant?.currency ?? "AMD" }

    private let periods = [("today", L("common.today")), ("month", L("owner.periodMonth")), ("prevmonth", L("owner.periodPrevMonth"))]

    var body: some View {
        Group {
            if failure == nil, let s = summary, s.stats.count == 0 {
                emptySummary
                    .opacity(detailsVisible ? 1 : 0)
                    .offset(y: detailsVisible || reduceMotion ? 0 : 8)
            } else {
                dashboardScroll
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.board.ignoresSafeArea())
        .safeAreaInset(edge: .top) { chips }
        .task { await reload() }
    }

    private var dashboardScroll: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if let failure {
                    // Нули вместо выручки — худшее, что может показать этот
                    // экран: неверные данные выглядят как верные, и владелец
                    // принимает решение по ним. Лучше честно ничего.
                    problem(failure)
                } else if let s = summary {
                    reading(s)
                    details(s)
                        .opacity(detailsVisible ? 1 : 0)
                        .offset(y: detailsVisible || reduceMotion ? 0 : 8)
                } else {
                    /* Первая загрузка: место щита, а не пустой экран. */
                    Delayed(active: loading) {
                        VStack(alignment: .leading, spacing: 14) {
                            TetrSkeleton(height: 190, radius: 28)
                            TetrSkeleton(height: 74, radius: 22)
                            TetrSkeleton(width: 120, height: 13)
                            TetrSkeletonList(rows: 4)
                        }
                        .padding(.top, 10)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 28)
        }
        .refreshable { await reload() }
        .sheet(isPresented: $showAlerts) {
            /* Куда ведёт повод, решает приложение: у него свои разделы,
               и адрес страницы браузера здесь не при чём. Зарплата —
               соседняя вкладка, клиенты живут в «Ավելին», поэтому их
               список открывается прямо отсюда листом: лишний переход
               через меню к звонку не приближает. */
            AlertsView(onOpen: { key in
                if key == "payroll-due" {
                    NotificationCenter.default.post(name: .openPayroll, object: nil)
                } else {
                    showClients = true
                }
            })
            .environmentObject(session)
        }
        .sheet(isPresented: $showClients) {
            /* Лист получает системную шапку: раньше он открывался вообще
               без заголовка и без «Закрыть» — единственный такой в
               продукте. */
            NavigationStack {
                ClientsView()
                    .navigationTitle(L("owner.tabClients"))
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .topBarTrailing) {
                            Button(L("common.close")) { showClients = false }
                        }
                    }
            }
            .environmentObject(session)
        }
        .alert(
            L("work.revokeTitle"),
            isPresented: .init(get: { cancelling != nil }, set: { if !$0 { cancelling = nil } })
        ) {
            Button(L("common.no"), role: .cancel) { cancelling = nil }
            Button(L("common.cancel"), role: .destructive) {
                if let item = cancelling { Task { await cancel(item) } }
                cancelling = nil
            }
        } message: {
            if let item = cancelling {
                Text("\(item.clientKey ?? "—") · \(money(item.price, currency))")
            }
        }
    }

    // ══════════════════════════ верхняя строка ══════════════════════════

    /**
     * Период — системный segmented picker. На iOS 26 он сам получает
     * актуальную геометрию и материал и остаётся знакомым органом выбора.
     * Ручное обновление не дублируем кнопкой: для него уже есть pull to
     * refresh. Стекло остаётся только у действия с уведомлениями.
     */
    private var chips: some View {
        HStack(spacing: 10) {
            Picker(
                L("owner.periodLabel"),
                selection: Binding(
                    get: { period },
                    set: { key in Task { await selectPeriod(key) } }
                )
            ) {
                ForEach(periods, id: \.0) { key, label in
                    Text(label).tag(key)
                }
            }
            .pickerStyle(.segmented)
            /* Переключатель НЕ гаснет на время запроса. Порядок ответов
               держит `loadID` вместе со сверкой периода — поздний ответ
               на старый период на экран не попадает, — и гасить сверх
               этого нечего: погашенный переключатель отбирает выбор за
               работу, которая идёт полсекунды, а владелец в это время
               как раз и щёлкает между «сегодня» и «месяцем». */

            /* Идёт сверка: точка, а не заслонка. Данные на экране
               остаются верными, просто чуть старыми. */
            TetrRefreshDot(active: loading && summary != nil)

            Button {
                showAlerts = true
            } label: {
                /* Меньше, чем было: колокольчик — не действие экрана, а
                   вход в список поводов, и раз в неделю. Кнопка в 38
                   точек рядом с переключателем периода читалась как
                   равная ему по важности. */
                Image(systemName: alerts.isEmpty ? "bell" : "bell.badge")
                    .font(.system(size: 13, weight: .semibold))
                    .contentTransition(.symbolEffect(.replace.magic(fallback: .downUp)))
                    .frame(width: 32, height: 32)
                    .overlay(alignment: .topTrailing) {
                        if !alerts.isEmpty {
                            Text("\(alerts.count)")
                                .font(.system(size: 9, weight: .bold))
                                .monospacedDigit()
                                .foregroundStyle(Brand.onLime)
                                .frame(minWidth: 15, minHeight: 15)
                                .background(Brand.lime, in: .circle)
                                .offset(x: 3, y: -3)
                        }
                    }
            }
            .buttonStyle(.glass)
            /* Круглым: колокольчик — единственная кнопка-значок в этой
               строке, и круг отделяет её от прямоугольного переключателя
               периода рядом, не прибавляя ни веса, ни размера. */
            .buttonBorderShape(.circle)
            .accessibilityLabel(L("alerts.title"))
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
        .background(Brand.board.ignoresSafeArea(edges: .top))
    }

    // ══════════════════════════ показание ══════════════════════════

    /**
     * Период без единой записи — отдельное состояние, а не нулевое табло.
     *
     * Ноль выручки, пустая полоса и график без точек выглядят как данные,
     * которые надо изучать. Здесь изучать нечего: до первой обслуженной
     * машины сводка ещё не началась. Поэтому весь прибор уступает место
     * спокойной полноэкранной композиции. Действия здесь нет намеренно:
     * владелец не обязан сам выходить в смену.
     */
    private var emptySummary: some View {
        GeometryReader { proxy in
            ZStack(alignment: .topLeading) {
                SummaryEmptyBackdrop()
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 0) {
                    Text(periodDates)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Brand.boardMuted)

                    Spacer(minLength: 16)

                    SummaryEmptyIllustration()
                        .frame(height: min(270, proxy.size.height * 0.43))
                        .accessibilityHidden(true)

                    Spacer(minLength: 12)

                    Text(emptySummaryTitle)
                        .font(.system(size: 27, weight: .semibold, design: .rounded))
                        .tracking(-0.55)
                        .foregroundStyle(Brand.onBoard)
                        .fixedSize(horizontal: false, vertical: true)

                    Text(L("owner.emptySummaryNote"))
                        .font(.system(size: 15, weight: .regular))
                        .foregroundStyle(Brand.boardMuted)
                        .lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: 315, alignment: .leading)
                        .padding(.top, 9)

                    Spacer(minLength: 20)
                }
                .padding(.horizontal, 24)
                .padding(.top, 12)
                .padding(.bottom, 18)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .sheet(isPresented: $showAlerts) {
            AlertsView(onOpen: { key in
                if key == "payroll-due" {
                    NotificationCenter.default.post(name: .openPayroll, object: nil)
                } else {
                    showClients = true
                }
            })
            .environmentObject(session)
        }
        .sheet(isPresented: $showClients) {
            /* Лист получает системную шапку: раньше он открывался вообще
               без заголовка и без «Закрыть» — единственный такой в
               продукте. */
            NavigationStack {
                ClientsView()
                    .navigationTitle(L("owner.tabClients"))
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .topBarTrailing) {
                            Button(L("common.close")) { showClients = false }
                        }
                    }
            }
            .environmentObject(session)
        }
    }

    private var emptySummaryTitle: String {
        switch summaryPeriod {
        case "month": return L("owner.emptySummaryMonth")
        case "prevmonth": return L("owner.emptySummaryPrevious")
        default: return L("owner.emptySummaryToday")
        }
    }

    /**
     * Показание прибора: подпись над числом, число по оси, приписка под ним.
     *
     * Прибыль, а не выручка: выручку владелец и так примерно помнит — она
     * равна числу машин на средний чек. Прибыль не помнит никто, в ней сидят
     * проценты работников и доля аренды за день.
     */
    /**
     * Кошелёк: тёмная глянцевая карточка на светлом табло.
     *
     * Шестая редакция — владелец показал пальцем на конкретный референс:
     * тёмная карточка «Your money» с металлическим блеском и крупным
     * числом. Экран вокруг возвращается к исходному светлому табло; вся
     * тьма собрана в одном предмете. Глянец — не свечение из угла и не
     * размытое пятно: вертикальный градиент металла, диагональный блик
     * и светлая кромка сверху, как у стекла.
     *
     * Лестница вычетов живёт внутри кошелька, под числом: владелец
     * попросил «красиво показать полоски» — они и есть содержимое
     * кошелька, а не отдельная таблица.
     */
    private func reading(_ s: API.Summary) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 7) {
                Text(profitTitle)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Brand.mutedOnDark)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
                crewChip
            }

            heroFigure
                .padding(.top, 10)

            HStack(spacing: 7) {
                Text(periodDates)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Color.white.opacity(0.5))
                    .contentTransition(.numericText())
                change
                Spacer(minLength: 0)
            }
            .padding(.top, 10)

            walletHairline
                .padding(.top, 16)

            ladderRow(L("summary.paidIn"), s.stats.revenue, minus: false)
            walletHairline
            ladderRow(L("summary.toStaff"), s.stats.payroll, minus: true)
            walletHairline
            ladderRow(L("expenses.title"), s.costs.total, minus: true)
                .padding(.bottom, -6)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background { walletSurface }
        .shadow(color: .black.opacity(0.18), radius: 18, y: 10)
        .padding(.top, 6)
        .accessibilityElement(children: .contain)
    }

    /**
     * Металл кошелька. Три слоя, и все тихие: вертикальный градиент
     * почти чёрного, диагональный блик из левого верхнего угла и
     * стеклянная кромка, гаснущая книзу. Заливка фиксированная — как у
     * плиток, предмет одинаков в обеих темах телефона.
     */
    private var walletSurface: some View {
        let shape = RoundedRectangle(cornerRadius: R.hero, style: .continuous)
        return shape
            .fill(
                LinearGradient(
                    colors: [
                        Color(red: 0x20 / 255, green: 0x1E / 255, blue: 0x27 / 255),
                        Color(red: 0x0D / 255, green: 0x0C / 255, blue: 0x11 / 255),
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .overlay {
                LinearGradient(
                    colors: [.white.opacity(0.09), .white.opacity(0.02), .clear],
                    startPoint: .topLeading,
                    endPoint: UnitPoint(x: 0.55, y: 0.55)
                )
                .clipShape(shape)
            }
            .overlay {
                shape.strokeBorder(
                    LinearGradient(
                        colors: [.white.opacity(0.22), .white.opacity(0.03)],
                        startPoint: .top,
                        endPoint: .bottom
                    ),
                    lineWidth: 1
                )
            }
    }

    private var walletHairline: some View {
        Rectangle()
            .fill(Color.white.opacity(0.10))
            .frame(height: 1)
    }

    /// Число героя. Резкий гротеск вместо округлого — по слову владельца;
    /// минус настоящий, U+2212. Убыток — единственная краска на лайме:
    /// глубокий красный, читаемый по светлому.
    @ViewBuilder
    private var heroFigure: some View {
        let profit = summary?.profit ?? 0
        let loss = profit < 0

        HStack(alignment: .firstTextBaseline, spacing: 7) {
            Text((loss ? "−" : "") + plain(abs(profit)))
                .font(.system(size: 46, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(loss ? Brand.badOnDark : Brand.inkOnDark)
                .lineLimit(1)
                .minimumScaleFactor(0.4)
                .contentTransition(.numericText(value: Double(profit)))

            Text(currency == "AMD" ? "֏" : currency)
                .font(.system(size: 24, weight: .medium))
                .foregroundStyle(Color.white.opacity(0.45))
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(profitTitle): \(money(profit, currency))")
    }



    /**
     * Из чего вышел результат — одной полосой, а не тремя колонками.
     *
     * Колонки были ошибкой композиции: следом за ними шла вторая такая же
     * тройка — машины, средний чек, люди на смене, — и две одинаковые
     * полоски подряд читались одним длинным блоком ни о чём. Отличить их
     * можно было, только прочитав подписи, то есть глаз не работал вовсе.
     *
     * Полоса отвечает на вопрос, которого у колонок не было: КАКОЙ ДОЛЕЙ.
     * Из каждых двадцати двух с половиной тысяч владельцу осталось четыре,
     * и это видно длиной куска, без чтения цифр. Ровно так же устроен
     * разрез по способам оплаты ниже: одна фигура, один язык.
     *
     * Сумма кусков равна выручке всегда: прибыль это она минус зарплаты
     * минус расходы, других слагаемых у неё нет.
     */
    /// Строка лестницы: слово слева, сумма по правому краю. Минус
    /// настоящий, U+2212, и стоит у числа, а не в слове. Краски — по
    /// кошельку, а не по теме: он тёмный всегда.
    private func ladderRow(_ title: String, _ amount: Int, minus: Bool) -> some View {
        HStack(spacing: 8) {
            Text(title)
                .font(.system(size: 13))
                .foregroundStyle(Brand.mutedOnDark)
            Spacer(minLength: 8)
            Text((minus && amount > 0 ? "−" : "") + money(amount, currency))
                .font(.system(size: 14, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(minus ? Brand.mutedOnDark : Brand.inkOnDark)
        }
        .padding(.vertical, 10)
    }


    /// Число без валюты — для строки вычитания.
    private func plain(_ amount: Int) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.groupingSeparator = "\u{202F}"
        return f.string(from: NSNumber(value: amount)) ?? "\(amount)"
    }

    /**
     * С чем сравнили и на сколько разошлось.
     *
     * В драмах, а не в процентах: процент от маленькой базы врёт — вчера
     * 3 000, сегодня 9 500 даёт «+217 %», а разница три помывки.
     *
     * Молчим, когда сравнивать не с чем: в базе ноль записей или разница
     * меньше сотни драмов.
     */
    @ViewBuilder
    private var change: some View {
        if let c = profitChange {
            HStack(spacing: 5) {
                /* Знак стрелкой и цифрой, не одним цветом: WCAG 1.4.1
                   запрещает передавать смысл оттенком, а этот экран смотрят
                   на мокром телефоне под солнцем. */
                Image(systemName: c.up ? "arrow.up" : "arrow.down")
                    .font(.system(size: 9, weight: .black))
                Text(c.diff)
                    .font(.system(size: 13, weight: .bold))
                    .monospacedDigit()
                /* С ЧЕМ сравнили, а не «сколько было тогда». Раньше рядом
                   стояло второе число — база, — и оно ничего не объясняло:
                   два числа подряд без подписи читаются как ошибка. Слово
                   отвечает на единственный вопрос, который тут возникает, —
                   «по сравнению с чем». */
                Text(c.label)
                    .font(.system(size: 12))
                    .foregroundStyle(Brand.mutedOnDark)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
            .foregroundStyle(c.up ? Brand.goodOnDark : Brand.badOnDark)
            .padding(.horizontal, 11)
            .padding(.vertical, 6)
            .background(.white.opacity(0.12), in: .rect(cornerRadius: 10, style: .continuous))
            .padding(.top, 10)
        }
    }

    /**
     * Кто сейчас на площадке — тёмной плашкой рядом с датой.
     *
     * Это не то же самое, что «работал сегодня»: человек мог встать час
     * назад и ещё ничего не намыть — по записям его не видно вовсе, а на
     * мойке он стоит.
     *
     * Плашка графитовая, и это не украшение. Лаймовая точка «сейчас на
     * смене» по светлому полотну даёт контраст 1.06 — её там просто нет.
     * Собственный тёмный фон — единственный способ пустить фирменный лайм
     * в верх экрана; заодно плашка сама по себе читается органом
     * управления, а не подписью, и по ней понятно, что сюда можно нажать.
     *
     * Ведёт к работникам: вопрос «кто на смене» и вопрос «а сколько он у
     * меня получает» задают подряд.
     */
    @ViewBuilder
    private var crewChip: some View {
        /* Себя владелец в плашке не видит: он и так знает, что он здесь.
           Плашка отвечает на вопрос «кто у меня сейчас на площадке», а
           собственное имя в этом ответе только занимает место — на узком
           экране из-за него не помещался тот, ради кого её и открывают. */
        let present = (summary?.onShift ?? []).filter { $0.userId != session.me?.id }
        if !present.isEmpty {
            NavigationLink {
                StaffView().navigationTitle(Terms.staff(session.tenant?.staffRole ?? "").many)
                    .navigationBarTitleDisplayMode(.inline)
            } label: {
                HStack(spacing: 5) {
                    // единственный настоящий кружок в продукте: точка
                    // состояния, а не форма
                    Circle()
                        .fill(Brand.lime)
                        .frame(width: 6, height: 6)
                        .shadow(color: Brand.lime.opacity(0.6), radius: 3)

                    Text(present.map(\.name).joined(separator: ", "))
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .truncationMode(.tail)

                    Image(systemName: "chevron.right")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundStyle(.white.opacity(0.5))
                }
                .padding(.horizontal, 9)
                .padding(.vertical, 5)
                .background(.white.opacity(0.14), in: .rect(cornerRadius: 10, style: .continuous))
            }
            .buttonStyle(.press)
            .accessibilityLabel(
                present.map { L("summary.onShiftSince", $0.name, since($0.openedAt)) }.joined(separator: ", ")
            )
        }
    }

    // ══════════════════════════ содержание периода ══════════════════════════

    @ViewBuilder
    private func details(_ s: API.Summary) -> some View {
        /* Чек-листа «Начало работы» на сводке больше нет: владелец
           посмотрел на него и решил, что достаточно приветственного
           листа снизу. Серверные шаги настройки при этом живут — их
           по-прежнему видно в веб-кабинете. */
        if summaryPeriod == "today" {
            /* Графика на сегодняшнем экране нет.

               Он отвечал на вопрос «как шёл день», а этот вопрос владелец
               мойки себе не задаёт: у него за день пять машин, и «как
               шло» видно по журналу внизу построчно, с номерами и
               суммами. График же занимал треть экрана и в спокойный день
               показывал один столбик — то есть ровно то, что и так
               написано в журнале, только беднее.

               За месяц он остаётся: там тридцать точек, и форма месяца —
               настоящий ответ, которого больше нигде нет. */
            todaySnapshot(s)
            crewBoard(s)
            /* Разреза по способам оплаты в сегодняшнем дне нет.

               За день на него отвечает сам журнал: пять строк, и в каждой
               написано, чем платили, — а над ними стоит фильтр по способу,
               которым наличные и отбирают при пересчёте ящика. Отдельный
               разрез повторял те же деньги третий раз и занимал экран
               между «кто работает» и «что было».

               За месяц он остаётся: тридцать дней по строкам не сложить, и
               доля наличных за период — ответ, которого больше нигде нет. */
            journal(s.feed)
        } else {
            chart(s.series)
            grid(s)
            paymentBreakdown(s)
            journal(s.feed)
        }
    }

    // ══════════════════════════ кто работает ══════════════════════════

    /**
     * Кто сегодня работает и сколько ему за это причитается.
     *
     * Раньше имена стояли только чипом у даты — списком, без единой
     * цифры. На вопрос «кто на площадке» он отвечал, на вопрос «сколько
     * я сегодня должен Валоду» — нет, и за ответом приходилось уходить в
     * зарплаты.
     *
     * Сумма здесь — заработок человека, а не выручка, которую он принёс:
     * приход уже назван строкой вычитания наверху, и повторять его
     * именами значило бы показать одни и те же деньги дважды.
     *
     * Порядок по состоянию: сначала те, кто на смене, потом отработавшие.
     * Внутри — по заработку. Вопрос «кто сейчас на посту» задают чаще,
     * чем «кто заработал больше».
     */
    @ViewBuilder
    private func crewBoard(_ s: API.Summary) -> some View {
        let lines = crew(s)
        if !lines.isEmpty {
            VStack(alignment: .leading, spacing: 9) {
                HStack(spacing: 6) {
                    Text(L("today.working"))
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Brand.boardMuted)
                    Text("\(lines.count)")
                        .font(.system(size: 12))
                        .monospacedDigit()
                        .foregroundStyle(Brand.boardMuted.opacity(0.7))
                    Spacer()
                }
                .padding(.horizontal, 4)

                /* Лента, а не список строк.

                   Строки в белой коробке отвечали верно, но выглядели
                   таблицей: имя, число, сумма — и так у каждого. Люди в
                   этом продукте везде показаны кружком своего цвета: в
                   ленте записей, в команде, на зарплатах. Здесь было
                   единственное место, где они оставались безымянными
                   строками.

                   Карточка на человека даёт лицо и заработок одним
                   предметом, а лента вбок держит любое их число: на мойке
                   их двое, у автосервиса бывает шестеро, и вертикальный
                   список из шести отодвинул бы журнал за нижний край. */
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 9) {
                        ForEach(lines) { line in
                            crewTile(line)
                        }
                    }
                    .padding(.horizontal, 4)
                    .padding(.vertical, 2)
                }
                .scrollClipDisabled()
            }
            .padding(.top, 14)
        }
    }

    private func crewTile(_ line: CrewLine) -> some View {
        let tone = Brand.personTone(line.name)

        return HStack(spacing: 11) {
            ZStack(alignment: .bottomTrailing) {
                Text(String(line.name.prefix(1)))
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 38, height: 38)
                    .background(line.present ? tone.base : Brand.boardInk.opacity(0.18), in: .circle)

                /* Зелёная точка значит «сейчас здесь». Кайма цвета
                   карточки отделяет её от кружка: на тёмном пятне зелёное
                   без каймы сливается. */
                if line.present {
                    Circle()
                        .fill(Brand.goodOnBoard)
                        .frame(width: 11, height: 11)
                        .overlay(Circle().strokeBorder(Brand.boardSurface, lineWidth: 2))
                        .offset(x: 1, y: 1)
                }
            }

            VStack(alignment: .leading, spacing: 1) {
                Text(line.name)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(line.present ? Brand.onBoard : Brand.boardMuted)
                    .lineLimit(1)

                Text(money(line.earned, currency))
                    .font(.system(size: 15, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Brand.onBoard)
                    .lineLimit(1)
                    .minimumScaleFactor(0.65)

                Text(Terms.units(line.count, session.tenant?.unitOne ?? "").trimmingCharacters(in: .whitespaces))
                    .font(.system(size: 11))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 11)
        .frame(width: 150, height: 72, alignment: .leading)
        .background(Brand.boardSurface, in: .rect(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(Brand.boardInk.opacity(0.07), lineWidth: 0.8)
        }
        .shadow(color: Brand.boardInk.opacity(0.035), radius: 10, y: 4)
        .accessibilityElement(children: .combine)
    }

    private struct CrewLine: Identifiable {
        let id: String
        let name: String
        let present: Bool
        let count: Int
        let earned: Int
    }

    /**
     * Список объединённый, а не два подряд.
     *
     * Человек, который встал на смену час назад и ещё ничего не намыл, в
     * `byStaff` не попадает вовсе — по записям его не видно, а на
     * площадке он стоит. И наоборот: тот, кто отработал утро и ушёл, из
     * `onShift` уже пропал, но его деньги за день никуда не делись.
     */
    private func crew(_ s: API.Summary) -> [CrewLine] {
        let worked = s.stats.byStaff ?? []
        let present = Set(s.onShift.map(\.userId))

        var out: [CrewLine] = s.onShift.map { person in
            let line = worked.first { $0.staffId == person.userId }
            return CrewLine(
                id: person.userId,
                name: person.name,
                present: true,
                count: line?.count ?? 0,
                earned: line?.earned ?? 0
            )
        }

        out += worked
            .filter { line in line.staffId.map { !present.contains($0) } ?? true }
            .map { line in
                CrewLine(
                    id: line.staffId ?? "—",
                    name: line.name ?? "—",
                    present: false,
                    count: line.count,
                    earned: line.earned
                )
            }

        /* Владелец сам себя в этом списке не видит, пока ничего не намыл.

           Он и так знает, что он на площадке; строка «Севак · 0 машин ·
           0 ֏» отвечала на вопрос, которого он не задавал, и рядом с
           настоящим работником читалась так, будто он весь день
           простоял. Как только он запишет машину, строка появляется:
           тогда это уже работа, и она обязана быть видна. */
        let me = session.me?.id
        return out
            .filter { !($0.id == me && $0.count == 0) }
            .sorted { a, b in
                a.present == b.present ? a.earned > b.earned : a.present
            }
    }

    /**
     * Быстрый ответ для сегодняшнего дня. Три показателя стоят одной
     * строкой без трёх цветных карточек: сначала итог наверху, затем объём,
     * средний чек и люди. Приход уже объяснён над строкой и здесь не
     * повторяется второй раз.
     *
     * Наличные отсюда ушли. Одно число «Կանխիկ» называло сумму, но не
     * долю, — а решает владелец именно по доле: сколько денег дня лежит
     * в кармане, а сколько придёт на счёт. Полный разрез стоит ниже, и
     * держать здесь его четверть значило бы показывать одни и те же
     * драмы дважды.
     */
    private func todaySnapshot(_ s: API.Summary) -> some View {
        /* Среднего чека здесь больше нет.

           За день он считается по трём-пяти записям и прыгает от одной
           дорогой мойки; решения по нему в этот день не принимают, а
           стоял он третьим числом в ряду и требовал объяснения. Средний
           чек — вопрос месяца, там он и остался: в сетке показателей за
           период и в отчёте, где рядом есть с чем сравнить. */
        HStack(spacing: 0) {
            snapshotValue(L("summary.served"), "\(s.stats.count)")
            snapshotDivider
            snapshotValue(L("owner.onShift"), "\(s.onShift.count)")
        }
        .padding(.vertical, 15)
        /* Белая бумага, как у соседних карточек: серая вдавленная плита
           выбивалась из ряда, и владелец попросил её осветлить. */
        .boardCard(R.card)
        .padding(.top, 12)
        .accessibilityElement(children: .contain)
    }

    private func snapshotValue(_ title: String, _ value: String) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.system(size: 18, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)
                .lineLimit(1)
                .minimumScaleFactor(0.55)
            Text(title)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(Brand.boardMuted)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
    }

    private var snapshotDivider: some View {
        Rectangle()
            .fill(Brand.boardInk.opacity(0.1))
            .frame(width: 1, height: 34)
    }

    // ══════════════════════════ волна ══════════════════════════

    /**
     * Ход периода — низкая линия с подписями времени.
     *
     * Она не отвечает «сколько было в одиннадцать»: для этого есть журнал
     * внизу. Она отвечает на два других вопроса — ровно шёл день или
     * рывками и когда пришёл главный заезд.
     *
     * Прежняя волна занимала столько же места, но висела без единой
     * подписи: без оси линия говорит только «ровно или рывками», а «когда»
     * приходилось угадывать по положению точки. Четыре подписи под ней
     * стоят тринадцать точек высоты и снимают вопрос целиком.
     *
     * Подписи берутся из самих данных, а не прибиты к 08:00–20:00: ряд
     * начинается с первой записи смены, и у мойки, открывающейся в семь,
     * фиксированная сетка врала бы на час.
     *
     * Лаймовые точки там, где были деньги. Это и есть «сделки»: между ними
     * линия лежит на нуле, и без точек не видно, две это помывки или
     * двадцать. На длинном ряде точки гасятся — тридцать лаймовых пятен на
     * месяце это уже не акцент, а сыпь; остаётся одна, на пике.
     *
     * Заливка под линией слабая, до полной прозрачности: она даёт графику
     * низ, иначе линия в 60 точек читается царапиной на полотне.
     */
    @ViewBuilder
    /**
     * График выручки. Вся отрисовка живёт в `RevenueChart`; здесь только
     * то, что знает именно этот экран: как называется период и как
     * подписать деление.
     */
    private func chart(_ series: [API.SeriesPoint]) -> some View {
        RevenueChart(
            series: series,
            title: chartTitle,
            axis: { point in axis(point) },
            money: { value in money(value, currency) }
        )
    }

    private var chartTitle: String {
        summaryPeriod == "today" ? L("summary.paymentsDay") : L("summary.paymentsMonth")
    }

    private func axis(_ point: API.SeriesPoint?) -> String {
        guard let point else { return "" }
        return summaryPeriod == "today" ? "\(point.hourLabel):00" : point.dayLabel
    }

    /// У единственного часа нет линии, но есть точка и подпись: сегодняшний
    /// график не должен исчезать только потому, что обе машины приехали в
    /// один час.
    // ══════════════════════════ финансовые детали ══════════════════════════

    /** За длинный период финансовая формула уже видна сверху. Здесь только
        два операционных показателя — данные, которых в формуле нет,
        поэтому ни одна большая сумма не повторяется. */
    private func grid(_ s: API.Summary) -> some View {
        let unit = Terms.unit(session.tenant?.unitOne ?? "").nom

        return HStack(spacing: 0) {
            snapshotValue(
                L("summary.served"),
                "\(s.stats.count) \(unit)".trimmingCharacters(in: .whitespaces)
            )
            snapshotDivider
            snapshotValue(L("summary.avgPayment"), money(s.stats.avgCheck, currency))
        }
        .padding(.vertical, 15)
        /* Белая бумага, как у соседних карточек: серая вдавленная плита
           выбивалась из ряда, и владелец попросил её осветлить. */
        .boardCard(R.card)
        .padding(.top, 12)
    }

    /**
     * Чем платили.
     *
     * Прибор стоит теперь и на сегодняшнем экране, а не только за месяц.
     * Раньше сегодняшний день отвечал на этот вопрос одним числом
     * «Կանխիկ» в строке фактов: сумма без доли не решает ничего, а
     * решает владелец именно долей — сколько денег дня в кармане, а
     * сколько придёт на счёт.
     *
     * Доля считается от суммы самих способов, а не от выручки периода: в
     * выручку входит продажа абонемента, которой в разрезе нет, и
     * проценты тогда не сходятся в сто.
     *
     * Порядок по величине, нулевые способы не показываются: строка
     * «Փոխանցում 0 ֏ · 0 %» сообщает ровно то же, что её отсутствие, и
     * занимает место.
     */
    @ViewBuilder
    private func paymentBreakdown(_ s: API.Summary) -> some View {
        let parts = s.split.filter { $0.revenue > 0 }.sorted { $0.revenue > $1.revenue }
        let total = parts.reduce(0) { $0 + $1.revenue }

        VStack(alignment: .leading, spacing: 13) {
            HStack {
                Text(L("today.paidWith"))
                    .font(.system(size: 13, weight: .semibold))
                Spacer()
                Image(systemName: "wallet.bifold")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Brand.lavenderInk)
            }

            if parts.isEmpty {
                Text(L("today.noPayments"))
                    .font(.system(size: 13))
                    .foregroundStyle(Brand.boardMuted)
            } else {
                /* Полоса одна на все способы, а не по одной под каждым.
                   Три полосы разной длины друг под другом сравниваются
                   плохо: глаз меряет их от общего левого края, а доля
                   читается от целого. Здесь целое и есть полоса. */
                SplitBar(
                    parts: parts.map {
                        Split(
                            id: $0.payment,
                            label: paymentLabel($0.payment),
                            ink: paymentInk($0.payment),
                            amount: $0.revenue
                        )
                    },
                    height: 10
                )

                VStack(spacing: 9) {
                    ForEach(parts) { part in
                        paymentRow(part, of: total)
                    }
                }
            }
        }
        .padding(15)
        .background(Brand.boardSurface, in: .rect(cornerRadius: 22, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .strokeBorder(Brand.boardInk.opacity(0.07), lineWidth: 0.8)
        }
        .padding(.top, 10)
    }

    /**
     * Способ оплаты строкой: точка, имя, деньги, доля.
     *
     * Собственной полосы у строки больше нет — долю показывает общая
     * полоса над списком. Строка отвечает на второй вопрос, «сколько
     * именно», и цифра для него точнее любой длины.
     */
    private func paymentRow(_ part: API.SplitSegment, of total: Int) -> some View {
        let share = total > 0 ? Int((Double(part.revenue) / Double(total) * 100).rounded()) : 0

        return HStack(spacing: 7) {
            Circle()
                .fill(paymentInk(part.payment))
                .frame(width: 7, height: 7)
            Text(paymentLabel(part.payment))
                .font(.system(size: 13))
                .foregroundStyle(Brand.onBoard)
                .lineLimit(1)

            Spacer(minLength: 8)

            Text(money(part.revenue, currency))
                .font(.system(size: 13, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)
                .lineLimit(1)
            Text("\(share)%")
                .font(.system(size: 12))
                .monospacedDigit()
                .foregroundStyle(Brand.boardMuted)
                .frame(width: 38, alignment: .trailing)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "\(paymentLabel(part.payment)), \(money(part.revenue, currency)), \(share)%"
        )
    }

    // ══════════════════════════ журнал ══════════════════════════

    /**
     * Записи — строками прямо на табло, без карточки.
     *
     * Номер машины поднят в первую строку и набран крупнее всего
     * остального: это единственный опознавательный знак записи. Раньше
     * первым по левому краю стояло время, и колонка одинаковых «17:00»
     * забирала вход в строку у того, ради чего в неё смотрят.
     *
     * Кто помыл — цветом имени: на мойке два-три работника, и цвет
     * различает их быстрее, чем текст. Тот же цвет у этого человека в
     * ленте смены и в списке зарплат — цвет здесь имя, а не украшение.
     */
    @ViewBuilder
    private func journal(_ feed: [API.FeedItem]) -> some View {
        if !feed.isEmpty {
            /* Способы оплаты — только те, что реально встретились: кнопка
               «Փոխանցում», не выбирающая ни одной записи, сообщает ровно
               то же, что её отсутствие, и занимает место.

               Порядок — как в разрезе выше, по деньгам: два одинаковых
               набора, отсортированных по-разному, читаются как разные. */
            let present = feed.reduce(into: [String: Int]()) { acc, item in
                acc[item.payment, default: 0] += item.price
            }
            let methods = present.sorted { $0.value > $1.value }.map(\.key)

            /* Полоса появляется, только когда есть что фильтровать: на
               дне из четырёх машин с одними наличными это управление,
               которое ничего не меняет, и прочитать его приходится,
               чтобы это понять. Тот же порог, что в кабинете. */
            let filterable = feed.count > 8 && methods.count > 1
            let shown = filterable ? feed.filter { feedMethod == nil || $0.payment == feedMethod } : feed

            VStack(spacing: 0) {
                HStack {
                    /* Тем же словом, что в кабинете: владелец приходит
                       смотреть не на строки базы, а на то, что за день
                       сделали. За длинный период это уже не «сегодня», и
                       раздел честно называется потоком. */
                    Text(summaryPeriod == "today" ? L("today.work") : L("owner.feed"))
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Brand.boardMuted)
                    Spacer()
                    Text(Terms.units(feed.count, session.tenant?.unitOne ?? "").trimmingCharacters(in: .whitespaces))
                        .font(.system(size: 12))
                        .monospacedDigit()
                        .foregroundStyle(Brand.boardMuted)
                }
                .padding(.horizontal, 4)
                .padding(.top, 22)
                .padding(.bottom, 4)

                if filterable {
                    methodFilter(methods)
                }

                /* Ряды — в белой карточке, а не на голом полотне: линии
                   шире контента без коробки читались веб-таблицей, и
                   владелец попросил такой же белый блок, как у
                   показателей выше. Разделитель отбит под текст, мимо
                   кружка человека. */
                LazyVStack(spacing: 0) {
                    ForEach(shown) { item in
                        journalRow(item)
                        if item.id != shown.last?.id {
                            Hairline(inset: 56)
                        }
                    }
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .boardCard(R.card)
            }
        }
    }

    /**
     * Чем платили — полоса кнопок над журналом.
     *
     * Вопрос, ради которого она есть, один: «сколько сегодня налом».
     * Разрез выше отвечает суммой, а этот фильтр — списком: владелец
     * пересчитывает деньги в ящике по строкам, а не по итогу.
     *
     * Прокрутка вбок, а не перенос на вторую строку: способов оплаты
     * четыре, а на узком экране четыре кнопки в ряд не помещаются, и
     * перенос сдвинул бы вниз весь журнал ради одной кнопки.
     */
    @ViewBuilder
    private func methodFilter(_ methods: [String]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 7) {
                methodChip(nil, label: L("today.all"))
                ForEach(methods, id: \.self) { key in
                    methodChip(key, label: paymentLabel(key))
                }
            }
            .padding(.horizontal, 4)
            .padding(.vertical, 6)
        }
        .scrollClipDisabled()
    }

    private func methodChip(_ key: String?, label: String) -> some View {
        let on = feedMethod == key
        return Button {
            /* Повторное нажатие по выбранному снимает фильтр: иначе
               вернуться ко «всем» можно только прицелившись в первую
               кнопку, которая на узком экране уже уехала влево. */
            withAnimation(.easeOut(duration: Motion.fast)) {
                feedMethod = on ? nil : key
            }
        } label: {
            Text(label)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(on ? Brand.board : Brand.boardMuted)
                .padding(.horizontal, 11)
                .padding(.vertical, 6)
                .background(on ? Brand.onBoard : Brand.chipRest, in: .rect(cornerRadius: 10, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? [.isSelected] : [])
    }

    /**
     * Строка журнала: кружок слева, деньги колонкой справа.
     *
     * Так устроены ленты операций в банковских приложениях, и причина в
     * том, как их читают: список не читают, его просматривают. Кружок
     * слева опознаётся раньше слова, а деньги, стоящие всегда у правого
     * края на одной и той же высоте, сравниваются между строками без
     * чтения.
     *
     * Кружок заменил и точку с именем: писать имя словом больше не нужно,
     * цвет человека один и тот же в команде, в зарплатах и здесь.
     *
     * Три строки слева, три справа, на одной высоте: номер против суммы,
     * услуга против доли мойки, время против доли человека. Время внизу, в
     * самом тихом месте строки: на вопрос «что было» оно отвечает
     * последним.
     */
    private func journalRow(_ item: API.FeedItem) -> some View {
        /* Кто мыл — ВСЕ, а не автор записи: совместную работу вносит
           один человек, а работают несколько, и назвать одного значило бы
           соврать про остальных. У одиночной записи имя ровно одно, и
           строка выглядит как выглядела. */
        let who = item.crewNames
        /* Кружок с буквой — по первому участнику: цвет человека один и
           тот же в команде, в зарплатах и здесь. */
        let face = item.crew?.first?.name ?? item.staffName ?? "—"
        let tone = Brand.personTone(face)

        return HStack(alignment: .top, spacing: 12) {
            Text(String(face.prefix(1)))
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 34, height: 34)
                .background(tone.base, in: .circle)
                .padding(.top, 1)

            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 7) {
                        Text(item.clientKey ?? "—")
                            .font(.system(size: 16, weight: .semibold, design: .rounded))
                            .foregroundStyle(Brand.onBoard)
                            .lineLimit(1)
                        if newestFeedID == item.id {
                            Image(systemName: "checkmark")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundStyle(Brand.goodOnBoard)
                                .symbolEffect(.drawOn, options: .nonRepeating, isActive: !reduceMotion)
                                .transition(.opacity)
                        }
                    }

                    /* Услуга — потому что без неё цена необъяснима: 2 500 и
                       12 000 в соседних строках выглядят ошибкой, пока не
                       видно, что одно это кузов, а другое химчистка. Способ
                       оплаты словом, а не значком: значок карты и значок
                       перевода на десяти точках различаются только если
                       знать, что они разные. */
                    Text("\(Terms.service(item.serviceName)) · \(paymentLabel(item.payment).lowercased())")
                        .font(.system(size: 12))
                        .foregroundStyle(Brand.boardMuted)
                        .lineLimit(1)
                        .truncationMode(.tail)

                    Text(at(item.createdAt))
                        .font(.system(size: 12))
                        .monospacedDigit()
                        .foregroundStyle(Brand.boardMuted.opacity(0.75))
                    /* Состав — отдельной строкой и только у совместной
                       работы. У одиночной записи человека называет кружок
                       с буквой слева, и повторять имя словом незачем; у
                       бригады одной буквы мало — по ней не поймёшь, что
                       работали трое. */
                    if item.shared {
                        Text(who)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(Brand.boardMuted)
                            .lineLimit(1)
                            .truncationMode(.tail)
                    }
                }

                Spacer(minLength: 4)

                VStack(alignment: .trailing, spacing: 2) {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        /* Скидка: зачёркнутый прайс рядом со взятым. Без
                           него «6 500» не отличить от обычной цены, и о
                           скидке владелец не узнаёт вовсе. */
                        if let list = item.listPrice, list > item.price {
                            Text(money(list, currency))
                                .font(.system(size: 12))
                                .monospacedDigit()
                                .strikethrough()
                                .foregroundStyle(Brand.boardMuted)
                        }
                        Text(money(item.price, currency))
                            .font(.system(size: 15, weight: .semibold))
                            .monospacedDigit()
                            .foregroundStyle(Brand.onBoard)
                    }

                    Text(L("summary.toBusiness", money(item.price - item.earned, currency)))
                        .font(.system(size: 12))
                        .monospacedDigit()
                        .foregroundStyle(Brand.boardMuted)
                        .lineLimit(1)

                    /* При нулевой ставке строки долей нет вовсе: у
                       владельца, который записывает сам, процента нет, и
                       «ему 0 ֏» в каждой записи — шум. */
                    if (item.staffPercent ?? 0) > 0 {
                        Text(L("summary.share", money(item.earned, currency)))
                            .font(.system(size: 12))
                            .monospacedDigit()
                            .foregroundStyle(Brand.boardMuted.opacity(0.75))
                            .lineLimit(1)
                    }
                }
            }
        }
        .padding(.horizontal, 4)
        .padding(.vertical, 10)
        .background(
            newestFeedID == item.id ? Brand.grape.opacity(0.12) : Color.clear,
            in: .rect(cornerRadius: 14, style: .continuous)
        )
        .transition(
            reduceMotion
                ? .opacity
                : .move(edge: .top).combined(with: .opacity)
        )
        .contentShape(.rect)
        .contextMenu {
            Button(L("work.revoke"), role: .destructive) {
                cancelling = item
            }
        }
    }
    private func problem(_ text: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 26))
                .foregroundStyle(Brand.grape)
            Text(text)
                .font(.system(size: 14))
                .multilineTextAlignment(.center)
                .foregroundStyle(Brand.boardMuted)
            Button(L("common.retry")) { Task { await reload() } }
                .buttonStyle(.glass)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 60)
    }

    // ══════════════════════════ текст и данные ══════════════════════════

    private var isLoss: Bool { (summary?.profit ?? 0) < 0 }

    /* «Чистая прибыль» — так решил владелец. Страх спутать «շահույթ» с
       «հասույթ» снимает определение «զուտ»: слово из двух частей ни с
       чем не рифмуется. Та же формула на всех языках и на вебе. */
    private var profitTitle: String {
        switch summaryPeriod {
        case "month": return isLoss ? L("summary.redMonth") : L("summary.keptMonth")
        case "prevmonth": return isLoss ? L("summary.redPrevMonth") : L("summary.keptPrevMonth")
        default: return isLoss ? L("summary.redToday") : L("summary.keptToday")
        }
    }

    /* «Заплатили», а не «выручка»: `հասույթ` отличается от `շահույթ` одной
       буквой, и два похожих слова с разными числами на одном экране путают
       даже автора продукта. Обычная речь ни на что не похожа и потому
       читается однозначно. */
    private var paidTitle: String {
        switch summaryPeriod {
        case "month": return L("summary.paidMonth")
        case "prevmonth": return L("summary.paidPrevMonth")
        default: return L("summary.paidToday")
        }
    }

    private var spentTitle: String {
        switch summaryPeriod {
        case "month": return L("summary.spentMonth")
        case "prevmonth": return L("summary.spentPrevMonth")
        default: return L("summary.spentToday")
        }
    }

    /// Дата обязательна всегда, включая «сегодня»: сутки считаются по времени
    /// бизнеса и в полночь начинаются заново. Владелец, открывший приложение
    /// в половине первого, видел ноль и решал, что данные ушли.
    private var periodDates: String {
        let f = DateFormatter()
        f.locale = LangStore.currentLang.locale
        /* Шаблон, а не жёсткий формат: от языка зависит не только имя
           месяца, но и порядок. «16 августа» и «August 16» — одна и та же
           дата, записанная так, как её пишет язык. */
        f.setLocalizedDateFormatFromTemplate("d MMMM")
        guard let from = summary?.from, summaryPeriod != "today" else {
            return f.string(from: summary?.from ?? Date())
        }
        /* Верхнюю границу берём из ответа, а не из «сегодня»: у закрытого
           прошлого месяца период кончился, и подписывать его сегодняшним
           числом — врать. Старый сервер её не пришлёт, тогда «по сейчас». */
        return range(from, summary?.to ?? Date().addingTimeInterval(1))
    }

    private var profitChange: (label: String, base: String, diff: String, up: Bool)? {
        guard let s = summary else { return nil }

        // Сравнивать не с чем: бизнес завёлся недавно, прошлого месяца у него
        // не было. «+100 %» от пустоты — не новость, а деление на ноль в
        // другой одежде.
        guard (s.previous.count ?? 1) > 0 else { return nil }

        let diff = s.profit - s.previous.profit
        guard abs(diff) >= 100 else { return nil }

        let label: String
        if summaryPeriod == "today" {
            label = L("summary.vsLastWeek")
        } else if let f = s.previous.from, let t = s.previous.to {
            label = range(f, t)
        } else {
            label = L("summary.vsPrevMonth")
        }

        return (
            label,
            money(s.previous.profit, currency),
            "\(diff > 0 ? "+" : "−")\(money(abs(diff), currency))",
            diff > 0
        )
    }

    /// «1 — 7 օգոստոսի». Месяц не повторяется дважды, когда он один.
    private func range(_ from: Date, _ to: Date) -> String {
        let full = DateFormatter()
        full.locale = LangStore.currentLang.locale
        full.setLocalizedDateFormatFromTemplate("d MMMM")
        let dayOnly = DateFormatter()
        dayOnly.locale = full.locale
        dayOnly.dateFormat = "d"

        // верхняя граница исключающая: последний показанный день — накануне
        let last = to.addingTimeInterval(-1)
        let cal = Calendar(identifier: .gregorian)
        let sameMonth = cal.component(.month, from: from) == cal.component(.month, from: last)
        return sameMonth
            ? "\(dayOnly.string(from: from)) — \(full.string(from: last))"
            : "\(full.string(from: from)) — \(full.string(from: last))"
    }

    /// Время в зоне бизнеса, а не устройства: владелец в поездке видел
    /// смену, начатую в шесть утра.
    private func clock() -> DateFormatter {
        let f = DateFormatter()
        f.locale = LangStore.currentLang.locale
        f.dateFormat = "HH:mm"
        if let tz = session.tenant?.timezone, let zone = TimeZone(identifier: tz) {
            f.timeZone = zone
        }
        return f
    }

    private func at(_ date: Date) -> String { clock().string(from: date) }

    /// «с 09:40» — время выхода, а не длительность: длительность пришлось бы
    /// пересчитывать каждую минуту, иначе она врёт.
    private func since(_ date: Date) -> String { L("summary.since", clock().string(from: date)) }

    private func cancel(_ item: API.FeedItem) async {
        _ = try? await session.authed { token in
            try await APIClient.shared.raw(
                "orders/\(item.id)/cancel",
                method: "POST",
                token: token
            )
        }
        await reload()
    }

    private func selectPeriod(_ key: String) async {
        guard key != period else { return }

        if reduceMotion {
            detailsVisible = false
        } else {
            withAnimation(.easeOut(duration: Motion.instant)) {
                detailsVisible = false
            }
        }
        period = key
        await reload(staged: true)
    }

    private func reload(staged: Bool = false) async {
        loadID += 1
        let id = loadID
        let requestedPeriod = period
        loading = true
        defer {
            if id == loadID { loading = false }
        }

        /* Поводы тянем вместе со сводкой и молча: колокольчик — не то,
           ради чего открывают экран, и его отказ не должен мешать
           показать выручку. */
        Task {
            let fresh: API.Alerts? = try? await session.authed { token in
                try await APIClient.shared.send("alerts", token: token, as: API.Alerts.self)
            }
            if let fresh { alerts = fresh.alerts }
        }

        do {
            let fresh = try await session.authed { token in
                try await APIClient.shared.send(
                    "summary?period=\(requestedPeriod)",
                    token: token,
                    as: API.Summary.self
                )
            }

            guard id == loadID, requestedPeriod == period else { return }

            let oldIDs = Set(summary?.feed.map(\.id) ?? [])
            let inserted = staged ? nil : fresh.feed.first { !oldIDs.contains($0.id) }

            /* Числа перекручиваются разрядами при смене периода — так видно,
               что это то же число за другой срок, а не другой экран.

               Первая загрузка идёт без анимации: прокрутка от нуля к сумме на
               старте читается как индикатор загрузки, а не как смысл. */
            if summary == nil || reduceMotion {
                summary = fresh
                summaryPeriod = requestedPeriod
                newestFeedID = inserted?.id
            } else {
                withAnimation(.spring(response: 0.38, dampingFraction: 0.94)) {
                    summary = fresh
                    summaryPeriod = requestedPeriod
                    newestFeedID = inserted?.id
                }
            }
            failure = nil

            if staged && !reduceMotion {
                try? await Task.sleep(for: .milliseconds(110))
            }
            withAnimation(reduceMotion ? .easeOut(duration: Motion.instant) : .easeOut(duration: Motion.normal)) {
                detailsVisible = true
            }

            if inserted != nil {
                Task { @MainActor in
                    try? await Task.sleep(for: .milliseconds(850))
                    withAnimation(.easeOut(duration: Motion.fast)) { newestFeedID = nil }
                }
            }
        } catch is CancellationError {
            /* Потянули вниз и отпустили, или ушли с экрана. Ничего не
               сломалось — и экран об этом молчит: прежнее содержимое
               остаётся на месте. */
            return
        } catch let error as APIError {
            detailsVisible = true
            period = summaryPeriod
            failure = error.isOffline
                ? L("errors.offline")
                : L("errors.server", "\(error.status) \(error.code ?? "—")")
        } catch {
            detailsVisible = true
            period = summaryPeriod
            // разбор ответа: показываем как есть — это баг, а не сбой сети, и
            // прятать его за «попробуйте позже» значит никогда не найти
            failure = Failure.text(error)
        }
    }
}

// ══════════════════════ пустая сводка: иллюстрация ══════════════════════

/**
 * Один предмет вместо универсальной placeholder-иконки.
 *
 * Матовая пластина напоминает номерной знак, а проявляющийся на ней график
 * связывает мойку с аналитикой без буквальной сборной машинки. Пена
 * ложится на верхний край, капля уходит с нижнего — объект читается одним
 * целым. Все детали построены SwiftUI-фигурами и остаются резкими при
 * любом масштабе.
 */
private struct SummaryEmptyIllustration: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var floating = false

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .topLeading) {
                Path { path in
                    path.move(to: CGPoint(x: 8, y: proxy.size.height * 0.72))
                    path.addCurve(
                        to: CGPoint(x: proxy.size.width - 18, y: proxy.size.height * 0.36),
                        control1: CGPoint(x: proxy.size.width * 0.30, y: proxy.size.height * 0.78),
                        control2: CGPoint(x: proxy.size.width * 0.58, y: proxy.size.height * 0.23)
                    )
                }
                .stroke(
                    LinearGradient(
                        colors: [Brand.grape.opacity(0.08), Brand.grape.opacity(0.42)],
                        startPoint: .leading,
                        endPoint: .trailing
                    ),
                    style: StrokeStyle(lineWidth: 1.2, lineCap: .round, dash: [2, 7])
                )

                Ellipse()
                    .fill(
                        RadialGradient(
                            colors: [Brand.grape.opacity(0.18), Brand.grape.opacity(0)],
                            center: .center,
                            startRadius: 5,
                            endRadius: 132
                        )
                    )
                    .frame(width: 264, height: 166)
                    .position(x: proxy.size.width * 0.68, y: proxy.size.height * 0.50)

                washPlate
                    .position(x: proxy.size.width * 0.64, y: proxy.size.height * 0.49)

                drop
                    .position(x: proxy.size.width * 0.91, y: proxy.size.height * 0.72)

                foam
                    .position(x: proxy.size.width * 0.35, y: proxy.size.height * 0.25)

                ForEach(0..<3, id: \.self) { index in
                    Circle()
                        .fill(Brand.grape.opacity(0.18 + Double(index) * 0.08))
                        .frame(width: CGFloat(5 + index * 2), height: CGFloat(5 + index * 2))
                        .position(
                            x: 18 + CGFloat(index) * 34,
                            y: proxy.size.height * 0.70 - CGFloat(index) * 9
                        )
                }
            }
        }
        .offset(y: floating ? -3 : 2)
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 3.2).repeatForever(autoreverses: true)) {
                floating = true
            }
        }
    }

    private var washPlate: some View {
        ZStack {
            /* Слабое внутреннее свечение делает стекло объёмным, но не
               превращает пластину в ещё одну карточку интерфейса. */
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [Brand.boardSurface, Brand.grape.opacity(0.10)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            HStack(spacing: 0) {
                VStack(alignment: .leading, spacing: 8) {
                    Capsule()
                        .fill(Brand.boardInk.opacity(0.25))
                        .frame(width: 34, height: 5)
                    Capsule()
                        .fill(Brand.boardInk.opacity(0.13))
                        .frame(width: 22, height: 5)
                }

                Spacer(minLength: 18)

                ZStack(alignment: .bottomTrailing) {
                    HStack(alignment: .bottom, spacing: 7) {
                        bar(height: 18, opacity: 0.42)
                        bar(height: 29, opacity: 0.64)
                        bar(height: 43, opacity: 0.94)
                    }

                    Path { path in
                        path.move(to: CGPoint(x: 1, y: 45))
                        path.addCurve(
                            to: CGPoint(x: 46, y: 5),
                            control1: CGPoint(x: 15, y: 43),
                            control2: CGPoint(x: 31, y: 15)
                        )
                    }
                    .stroke(
                        Brand.grape.opacity(0.72),
                        style: StrokeStyle(lineWidth: 1.7, lineCap: .round)
                    )
                    .frame(width: 48, height: 48)
                    .offset(x: 3, y: -1)
                }
                .frame(width: 58, height: 50)
            }
            .padding(.horizontal, 26)
        }
        .frame(width: 188, height: 104)
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .strokeBorder(
                    LinearGradient(
                        colors: [Brand.boardInk.opacity(0.20), Brand.grape.opacity(0.13)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: 1
                )
        )
        .rotationEffect(.degrees(-4))
        .rotation3DEffect(.degrees(7), axis: (x: 0.2, y: 1, z: 0))
        .shadow(color: Brand.boardInk.opacity(0.10), radius: 22, y: 13)
    }

    private func bar(height: CGFloat, opacity: Double) -> some View {
        RoundedRectangle(cornerRadius: 4, style: .continuous)
            .fill(
                LinearGradient(
                    colors: [Brand.grape.opacity(opacity), Brand.grape.opacity(opacity * 0.66)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .frame(width: 8, height: height)
    }

    private var drop: some View {
        SummaryDropShape()
            .fill(
                LinearGradient(
                    colors: [Brand.boardSurface, Brand.grape.opacity(0.32)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .frame(width: 29, height: 37)
            .overlay {
                SummaryDropShape()
                    .strokeBorder(Brand.grape.opacity(0.38), lineWidth: 0.9)
            }
            .shadow(color: Brand.grape.opacity(0.09), radius: 10, y: 6)
            .rotationEffect(.degrees(14))
    }

    private var foam: some View {
        ZStack {
            bubble(22).offset(x: 0, y: 10)
            bubble(14).offset(x: 18, y: 0)
            bubble(10).offset(x: 30, y: 14)
            bubble(7).offset(x: 14, y: 23)
        }
    }

    private func bubble(_ size: CGFloat) -> some View {
        Circle()
            .fill(Brand.boardSurface.opacity(0.92))
            .frame(width: size, height: size)
            .overlay(Circle().strokeBorder(Brand.boardInk.opacity(0.16), lineWidth: 0.8))
            .shadow(color: Brand.grape.opacity(0.12), radius: 6, y: 3)
    }

}

/**
 * Тихая полноэкранная сетка: она заполняет полотно, не притворяясь
 * данными. Дуги продолжают траекторию иллюстрации и не образуют карточку.
 */
private struct SummaryEmptyBackdrop: View {
    var body: some View {
        GeometryReader { proxy in
            ZStack {
                Circle()
                    .stroke(Brand.boardInk.opacity(0.045), lineWidth: 1)
                    .frame(width: 430, height: 430)
                    .position(x: proxy.size.width * 0.90, y: proxy.size.height * 0.28)

                Circle()
                    .stroke(Brand.grape.opacity(0.065), lineWidth: 1)
                    .frame(width: 310, height: 310)
                    .position(x: proxy.size.width * 0.90, y: proxy.size.height * 0.28)

                Rectangle()
                    .fill(
                        LinearGradient(
                            colors: [Brand.grape.opacity(0), Brand.grape.opacity(0.035), Brand.grape.opacity(0)],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .frame(height: 1)
                    .position(x: proxy.size.width * 0.5, y: proxy.size.height * 0.71)
            }
        }
    }
}

private struct SummaryDropShape: InsettableShape {
    var insetAmount: CGFloat = 0

    func path(in rect: CGRect) -> Path {
        let r = rect.insetBy(dx: insetAmount, dy: insetAmount)
        var path = Path()
        path.move(to: CGPoint(x: r.midX, y: r.minY))
        path.addCurve(
            to: CGPoint(x: r.maxX, y: r.height * 0.62 + r.minY),
            control1: CGPoint(x: r.width * 0.62 + r.minX, y: r.height * 0.18 + r.minY),
            control2: CGPoint(x: r.maxX, y: r.height * 0.42 + r.minY)
        )
        path.addCurve(
            to: CGPoint(x: r.midX, y: r.maxY),
            control1: CGPoint(x: r.maxX, y: r.height * 0.84 + r.minY),
            control2: CGPoint(x: r.width * 0.72 + r.minX, y: r.maxY)
        )
        path.addCurve(
            to: CGPoint(x: r.minX, y: r.height * 0.62 + r.minY),
            control1: CGPoint(x: r.width * 0.28 + r.minX, y: r.maxY),
            control2: CGPoint(x: r.minX, y: r.height * 0.84 + r.minY)
        )
        path.addCurve(
            to: CGPoint(x: r.midX, y: r.minY),
            control1: CGPoint(x: r.minX, y: r.height * 0.42 + r.minY),
            control2: CGPoint(x: r.width * 0.38 + r.minX, y: r.height * 0.18 + r.minY)
        )
        path.closeSubpath()
        return path
    }

    func inset(by amount: CGFloat) -> SummaryDropShape {
        var shape = self
        shape.insetAmount += amount
        return shape
    }
}
