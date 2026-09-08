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
    @State private var openedProfit: ProfitDetailSnapshot?
    @Namespace private var profitTransition
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
    /// Запись журнала, взятая долгим нажатием: панель вкладок уступает
    /// место стеклянной полосе действий для неё.
    @State private var focused: API.FeedItem?
    /// Клиент этой записи, найденный по номеру: телефон и история.
    @State private var focusedClient: API.Client?
    @State private var historyClient: API.Client?
    /// Идёт запрос. На это время период фиксируется, чтобы второй быстрый
    /// выбор не вернул на экран ответ от предыдущего периода.
    @State private var loading = false
    /// Такт прихода содержимого: лист собирается по секциям сверху вниз,
    /// как только приехали первые числа.
    @State private var beat: Beat = .waiting
    /// Главное число накручивается от нуля при первом показе.
    @State private var countUp = false
    @State private var detailsVisible = true
    @State private var newestFeedID: String?
    @State private var loadID = 0

    /* Прокрутку разрядов система сама по «Уменьшению движения» не гасит:
       withAnimation отрабатывает как обычно. Гасим здесь — иначе настройка,
       которую человек включил не просто так, ничего не меняет. */
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var currency: String { session.tenant?.currency ?? "AMD" }

    private let periods = [("today", L("common.today")), ("month", L("owner.periodMonth")), ("prevmonth", L("owner.periodPrevMonth"))]

    /**
     * Проба композиции «цветные блоки стопкой» для сегодняшнего дня:
     * белая карточка с приветствием и фишками денег, лаймовый блок с
     * прибылью, грейповый блок с графиком часов. Владелец показал такой
     * экран, примерил 6 сентября 2026 и попросил вернуть прежнюю
     * раскладку. Код оставлен под флагом на случай, если захочется
     * вернуться к пробе.
     */
    private let bentoToday = false


    var body: some View {
        /* Отдельного экрана «данных нет» больше нет.
         *
         * Он показывал иллюстрацию вместо сводки, и владелец сказал
         * прямо: пусть будет тот же экран, только с нулями. Это честнее
         * и спокойнее — утром человек видит привычную раскладку, а не
         * другой экран, который надо прочитать заново. Ноль в начале дня
         * правдив: работы ещё не было. */
        /* Прокрутка уходит под часы, чтобы шапка была полотном от
           самого верха; отступ под часы шапка добавляет сама, поэтому
           его меряет геометрия снаружи. */
        dashboardScroll()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        /* Белый лист с сиреневым отсветом и стекло — тот же язык, что
           у смены: владелец попросил не менять раскладку сводки, а
           переодеть её в мотив смены. Шапка над листом — грейповое
           полотно входа с маскотом: выбрано из трёх картинок. */
        /* Тот же лист, что у зарплаты: светлый с пятнами сирени и лайма,
           бумажные карточки, пилюля периода. Грейповую шапку владелец
           попросил заменить полной рекомпозицией. */
        .meshPage()
        .task { await reload() }
        /* Данные обычно приезжают ещё под заставкой; приход ждёт её ухода,
           иначе сборка листа проходит за непрозрачным полотном. */
        .onReceive(NotificationCenter.default.publisher(for: .splashDone)) { _ in
            if summary != nil, beat == .waiting {
                Task { @MainActor in
                    try? await Task.sleep(for: .milliseconds(120))
                    arrive(first: true)
                }
            }
        }
    }

    /// Секции приходят по очереди, число накручивается следом.
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

    private func dashboardScroll() -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header

                VStack(alignment: .leading, spacing: 0) {
                if let failure {
                    // Нули вместо выручки — худшее, что может показать этот
                    // экран: неверные данные выглядят как верные, и владелец
                    // принимает решение по ним. Лучше честно ничего.
                    problem(failure)
                } else if let s = summary {
                    hero(s)
                        .reveal(beat, step: 0)

                    /* Детали завёрнуты в общий столбец, и это не
                       оформление, а необходимость.

                       `details(s)` возвращает не один вид, а группу: пять
                       блоков подряд. Модификатор, поставленный на группу,
                       SwiftUI применяет к КАЖДОМУ её виду по отдельности —
                       и загрузка, повешенная накладкой, рисовалась пять
                       раз столбиком. На экране это выглядело так, будто
                       грузятся пять разных вещей.

                       Столбец делает из группы один вид, и накладка
                       ложится один раз. Отступ ноль — тот же, что у
                       внешнего столбца: собственный сдвинул бы все блоки
                       относительно шапки. */
                    VStack(alignment: .leading, spacing: 0) {
                        details(s)
                    }
                    .opacity(detailsVisible ? 1 : 0)
                    .offset(y: detailsVisible || reduceMotion ? 0 : 8)
                    /* Пока едут числа другого периода, на месте деталей
                       стоит загрузка. Сами детали уже уехали в
                       прозрачность — так задумано, уход разом читается
                       как смена периода, — но без знака между уходом и
                       приходом остаётся секунда пустого экрана, и она
                       читается поломкой.

                       Сверху, а не по центру всей высоты: детали за месяц
                       уходят на два экрана вниз, и загрузка посередине
                       такого столбца оказалась бы за краем экрана. */
                    .overlay(alignment: .top) {
                        if loading, !detailsVisible {
                            TetrSpinner(size: 28)
                                .padding(.top, 64)
                                .transition(.opacity)
                        }
                    }
                    .animation(Motion.content, value: loading)
                } else {
                    /* Первая загрузка: место щита, а не пустой экран. */
                    Delayed(active: loading) {
                        VStack(alignment: .leading, spacing: 14) {
                            TetrSkeleton(height: 96, radius: 22)
                            TetrSkeleton(width: 120, height: 13)
                            TetrSkeletonList(rows: 4)
                        }
                        .padding(.top, 10)
                    }
                }
                }
                .padding(.horizontal, 16)
            }
            .padding(.bottom, 28)
        }
            /* Обновление вешается на саму прокрутку, а не в конец
               цепочки. Снаружи оно попадает в окружение всего, что ниже,
               включая листы: форма найма наследовала «потянуть, чтобы
               обновить», отвечала на движение вниз загрузчиком и не
               давала закрыть себя смахиванием. */
            .refreshable { await reload() }
        .brandTitleFont()
        /* Взятая запись: вкладки уходят, снизу вырастает стеклянная
           полоса действий той же формы — приём «панель перетекает в
           действие», как в ролике Kavsoft. */
        .toolbar(focused == nil ? .visible : .hidden, for: .tabBar)
        .safeAreaInset(edge: .bottom) {
            if let item = focused {
                actionBar(item)
                    .transition(.scale(scale: 0.55, anchor: .bottom).combined(with: .opacity))
            }
        }
        .animation(reduceMotion ? nil : Motion.springSnap, value: focused?.id)
        .sheet(item: $historyClient) { client in
            NavigationStack {
                ClientHistoryView(client: client, currency: currency)
            }
            .environmentObject(session)
        }
        .fullScreenCover(item: $openedProfit) { snapshot in
            if reduceMotion {
                ProfitDetailView(snapshot: snapshot)
            } else {
                ProfitDetailView(snapshot: snapshot)
                    .navigationTransition(.zoom(sourceID: "owner.profit", in: profitTransition))
            }
        }
        .navigationTitle(L("tab.summary"))
        .navigationSubtitle(periodDates)
        .toolbarTitleDisplayMode(.inlineLarge)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { bell }
        }
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
                /* Заголовок ставит сам экран: крупный, сжимается в центр
                   при прокрутке. Здесь только выход из листа. */
                ClientsView()
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

    // ══════════════════════════ шапка ══════════════════════════

    /**
     * Заголовок, даты периода, колокольчик и пилюля периода.
     *
     * Та же шапка, что у зарплаты: крупное слово, дата под ним, фишки.
     * Период — пилюлей, а не системным сегментом: пилюля уже стоит на
     * зарплате, и владелец узнаёт орган по форме.
     */
    /**
     * Заголовок и даты — нативные: крупный заголовок панели, при
     * прокрутке сжимается в центр над стеклом, даты подзаголовком.
     * Владелец попросил именно эту системную вещь iOS 26. Здесь остаются
     * только плашка «кто на смене» и пилюля периода.
     */
    private var header: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                crewChip
                Spacer(minLength: 0)
                TetrRefreshDot(active: loading && summary != nil && detailsVisible)
            }
            .padding(.horizontal, 4)
            .padding(.top, 2)

            /**
             * Периоды — тем же переключателем, что и полки на прайсе,
             * клиентах, расходах и зарплате.
             *
             * До этого здесь стоял системный `Picker(.segmented)`, и
             * сводка была единственной вкладкой, которая переключается
             * не как остальные четыре. Тёмный бегунок системный контрол
             * тоже умеет — `selectedSegmentTintColor` на iOS 26
             * принимается и стекло при этом остаётся настоящим, — но
             * задаётся он глобальным прокси UIKit, а дорожка и ширина
             * сегментов всё равно остаются чужими. Один язык на все
             * вкладки оказался дороже родной анимации бегунка.
             */
            PillTabs(
                items: periods.map { ($0.0, $0.1) },
                selection: Binding<String>(
                    get: { period },
                    set: { (key: String) in Task { await selectPeriod(key) } }
                )
            )
            .accessibilityIdentifier("owner.period")
            .padding(.top, 16)
        }
        .padding(.horizontal, 16)
    }

    /// Вход в список поводов: кнопка панели, стекло ей даёт система.
    private var bell: some View {
        Button {
            showAlerts = true
        } label: {
            Image(systemName: alerts.isEmpty ? "bell" : "bell.badge")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Brand.ink)
                .contentTransition(.symbolEffect(.replace.magic(fallback: .downUp)))
                .overlay(alignment: .topTrailing) {
                    if !alerts.isEmpty {
                        Text("\(alerts.count)")
                            .font(.system(size: 10, weight: .bold))
                            .monospacedDigit()
                            .foregroundStyle(Brand.onLime)
                            .frame(minWidth: 17, minHeight: 17)
                            .background(Brand.lime, in: .circle)
                            .offset(x: 8, y: -8)
                    }
                }
        }
        .accessibilityLabel(L("alerts.title"))
    }

    /**
     * Показание — лаймовая карточка.
     *
     * Лайм в продукте значит «здесь и сейчас», и главное число дня стоит
     * на нём: прибыль, под ней сравнение и две фишки — обслужено и на
     * смене. Вся карточка раскрывается в разбор того же финансового снимка.
     */
    private func hero(_ s: API.Summary) -> some View {
        /* Полосы долей здесь нет: три плитки денег стоят сразу под
           карточкой, и полоса повторяла их третий раз. */
        Button {
            openedProfit = ProfitDetailSnapshot(
                summary: s, period: summaryPeriod, title: profitTitle,
                dates: periodDates, currency: currency
            )
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .top) {
                    Text(profitTitle)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Brand.onLime.opacity(0.75))
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 8)
                    Image(systemName: "arrow.up.left.and.arrow.down.right")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(Brand.lime)
                        .frame(width: 36, height: 36)
                        .background(Brand.onLime, in: .circle)
                        .accessibilityHidden(true)
                }

                /* Минус настоящий, U+2212: дефис на таком кегле читается точкой. */
                /* Накручивается от нуля при первом показе: движение разрядов
                   и есть «число посчитано», как в приборе. */
                let shown = countUp ? s.profit : 0
                Text((shown < 0 ? "−" : "") + money(abs(shown), currency))
                    .font(.system(size: 46, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Brand.onLime)
                    .lineLimit(1)
                    .minimumScaleFactor(0.45)
                    .contentTransition(.numericText(value: Double(shown)))
                    .padding(.top, 2)

                change

                HStack(spacing: 8) {
                    bentoPill(L("summary.served"), "\(s.stats.count)")
                    bentoPill(L("owner.onShift"), "\(s.onShift.count)", live: !s.onShift.isEmpty)
                    Spacer(minLength: 0)
                }
                .padding(.top, 16)
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Brand.lime, in: .rect(cornerRadius: 28, style: .continuous))
            .contentShape(.rect(cornerRadius: 28))
            .matchedTransitionSource(id: "owner.profit", in: profitTransition) { source in
                source.background(Brand.lime).clipShape(.rect(cornerRadius: 28))
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("owner.profit.open")
        .accessibilityHint(L("profit.openHint"))
        .shadow(color: Brand.lime.opacity(0.35), radius: 16, y: 8)
        .padding(.top, 18)
    }

    // ══════════════════════════ показание ══════════════════════════

    /**
     * Показание прибора: подпись над числом, число по оси, приписка под ним.
     *
     * Прибыль, а не выручка: выручку владелец и так примерно помнит — она
     * равна числу машин на средний чек. Прибыль не помнит никто, в ней сидят
     * проценты работников и доля аренды за день.
     */
    /**
     * Показание прибора — как было при первом выпуске: белая плита,
     * цвет числа по знаку, полоса долей с подписями. Владелец перебрал
     * пять редакций и попросил вернуть исходную.
     */
    private func reading(_ s: API.Summary) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 7) {
                Text(periodDates)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Brand.boardMuted)
                    .contentTransition(.numericText())
                crewChip
                Spacer(minLength: 0)
            }
            .padding(.bottom, 19)

            Text(profitTitle)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Brand.boardMuted)
                .fixedSize(horizontal: false, vertical: true)

            /* Минус настоящий, U+2212: дефис на таком кегле читается точкой.
               Цвет по знаку — правило одно на все денежные экраны и
               живёт в `Brand.sign`. */
            Text((s.profit < 0 ? "−" : "") + money(abs(s.profit), currency))
                .font(.system(size: 45, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.sign(s.profit))
                .lineLimit(1)
                .minimumScaleFactor(0.42)
                .padding(.top, 2)
                // значение передаётся внутрь: по нему система понимает, в
                // какую сторону крутить разряды
                .contentTransition(.numericText(value: Double(s.profit)))

            change
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .paperCard(28)
        .padding(.top, 6)
    }

    /**
     * Приход и вычеты — отдельными плитками под карточкой.
     *
     * Тот же приём, что в мобильном вебе (`MStatTile`): цветная точка,
     * тихая подпись, число. Владелец попросил показать их так же, только
     * компактно — поэтому плитки низкие, в один ряд и без значков.
     *
     * Своей доли владельца среди них нет намеренно: она и есть главное
     * число над ними, и повторять её плиткой значит показать одни и те
     * же деньги дважды. Точки цвета остались от полосы долей: тот же
     * словарь, что на всех остальных экранах продукта.
     */
    private func moneyTiles(_ s: API.Summary) -> some View {
        HStack(spacing: 8) {
            moneyTile(L("summary.paidIn"), s.stats.revenue, dot: Brand.grapeFill)
            moneyTile(L("summary.toStaff"), s.stats.payroll, dot: Brand.lavenderInk)
            moneyTile(L("expenses.title"), s.costs.total, dot: Brand.sandInk)
        }
        .padding(.top, 10)
    }

    private func moneyTile(_ title: String, _ amount: Int, dot: Color) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 5) {
                Circle()
                    .fill(dot)
                    .frame(width: 6, height: 6)
                Text(title)
                    .font(.system(size: 11))
                    .foregroundStyle(Brand.boardMuted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.65)
            }
            Text(money(amount, currency))
                .font(.system(size: 15, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .contentTransition(.numericText(value: Double(amount)))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 11)
        .paperCard(R.small)
        .accessibilityElement(children: .combine)
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
                    .foregroundStyle(Brand.boardMuted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
            .foregroundStyle(c.up ? Brand.goodOnBoard : Brand.badOnBoard)
            .padding(.horizontal, 11)
            .padding(.vertical, 6)
            .background(.white.opacity(0.55), in: .rect(cornerRadius: 10, style: .continuous))
            .padding(.top, 9)
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
                StaffView()
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
                .background(Tone.slate.base, in: .rect(cornerRadius: 10, style: .continuous))
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
        if !(bentoToday && summaryPeriod == "today") {
            moneyTiles(s)
                .reveal(beat, step: 1)
        }

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
            crewBoard(s)
                .reveal(beat, step: 2)
            /* Разреза по способам оплаты в сегодняшнем дне нет.

               За день на него отвечает сам журнал: пять строк, и в каждой
               написано, чем платили, — а над ними стоит фильтр по способу,
               которым наличные и отбирают при пересчёте ящика. Отдельный
               разрез повторял те же деньги третий раз и занимал экран
               между «кто работает» и «что было».

               За месяц он остаётся: тридцать дней по строкам не сложить, и
               доля наличных за период — ответ, которого больше нигде нет. */
            journal(s.feed, total: s.stats.count)
                .reveal(beat, step: 3)
        } else {
            chart(s.series)
                .reveal(beat, step: 2)
            grid(s)
                .reveal(beat, step: 3)
            paymentBreakdown(s)
                .reveal(beat, step: 4)
            journal(s.feed, total: s.stats.count)
                .reveal(beat, step: 5)
        }
    }

    // ══════════════════════════ блоки стопкой ══════════════════════════

    /// Приветствие по времени суток — то же, что на смене.
    private var hello: String {
        switch Calendar.current.component(.hour, from: Date()) {
        case 5..<12: return L("shift.greetingMorning")
        case 12..<18: return L("shift.greetingDay")
        case 18..<24: return L("shift.greetingEvening")
        default: return L("shift.greetingPlain")
        }
    }

    /**
     * Три блока стопкой: белый, лаймовый, грейповый.
     *
     * Каждый блок — своя мысль и свой цвет: кто и где (белый), сколько
     * осталось (лайм — «здесь и сейчас»), как шёл день (грейп — марка).
     * Числа не повторяются между блоками: приход, зарплата и расходы
     * стоят фишками в белом, прибыль в лайме, часы в грейпе.
     */
    @ViewBuilder
    private func bento(_ s: API.Summary) -> some View {
        VStack(spacing: 10) {
            bentoHello(s)
            bentoProfit(s)
            bentoHours(s)
        }
        .padding(.top, 6)
    }

    private func bentoHello(_ s: API.Summary) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(session.me.map { "\(hello), \($0.name)" } ?? hello)
                        .font(.system(size: 24, weight: .bold))
                        .foregroundStyle(Brand.onBoard)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    HStack(spacing: 7) {
                        Text(periodDates)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Brand.boardMuted)
                        crewChip
                    }
                }
                Spacer(minLength: 8)
            }

            /* Фишки денег: приход, людям, расходы. Точка цвета — из
               словаря продукта, тот же, что у полосы долей. */
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    bentoChip(paidTitle, s.stats.revenue, dot: Brand.grapeFill)
                    bentoChip(L("summary.toStaff"), s.stats.payroll, dot: Brand.lavenderInk)
                    bentoChip(spentTitle, s.costs.total, dot: Brand.sandInk)
                }
            }
            .scrollClipDisabled()
            .padding(.top, 18)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Glass.top, in: .rect(cornerRadius: 28, style: .continuous))
        .shadow(color: Brand.grapeDeep.opacity(0.10), radius: 14, y: 6)
    }

    private func bentoChip(_ title: String, _ amount: Int, dot: Color) -> some View {
        HStack(spacing: 6) {
            Circle().fill(dot).frame(width: 7, height: 7)
            Text(title)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Brand.boardMuted)
            Text(money(amount, currency))
                .font(.system(size: 13, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)
                .contentTransition(.numericText(value: Double(amount)))
        }
        .lineLimit(1)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Glass.page, in: .rect(cornerRadius: R.control, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: R.control, style: .continuous)
                .strokeBorder(Brand.boardInk.opacity(0.08), lineWidth: 0.8)
        }
        .accessibilityElement(children: .combine)
    }

    /// Лаймовый блок: прибыль, полоса долей и две фишки-показателя.
    private func bentoProfit(_ s: API.Summary) -> some View {
        let parts = Split.money(mine: s.profit, staff: s.stats.payroll, costs: s.costs.total)
        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                Text(profitTitle)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Brand.onLime.opacity(0.75))
                Spacer()
                /* Круглая тёмная кнопка ведёт в зарплаты: там прибыль
                   разложена по людям. */
                Button {
                    NotificationCenter.default.post(name: .openPayroll, object: nil)
                } label: {
                    Image(systemName: "arrow.up.right")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(Brand.lime)
                        .frame(width: 36, height: 36)
                        .background(Brand.onLime, in: .circle)
                }
                .buttonStyle(.press)
                .accessibilityLabel(L("tab.payroll"))
            }

            Text((s.profit < 0 ? "−" : "") + money(abs(s.profit), currency))
                .font(.system(size: 48, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.onLime)
                .lineLimit(1)
                .minimumScaleFactor(0.45)
                .contentTransition(.numericText(value: Double(s.profit)))
                .padding(.top, 2)

            if !parts.isEmpty {
                SplitBar(parts: parts, height: 8)
                    .padding(.top, 12)
                    .opacity(0.85)
            }

            HStack(spacing: 8) {
                bentoPill(L("summary.served"), "\(s.stats.count)")
                bentoPill(L("owner.onShift"), "\(s.onShift.count)", live: !s.onShift.isEmpty)
                Spacer(minLength: 0)
            }
            .padding(.top, 16)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Brand.lime, in: .rect(cornerRadius: 28, style: .continuous))
        .shadow(color: Brand.lime.opacity(0.35), radius: 16, y: 8)
    }

    private func bentoPill(_ title: String, _ value: String, live: Bool = false) -> some View {
        HStack(spacing: 7) {
            if live {
                Circle().fill(Brand.goodOnBoard).frame(width: 7, height: 7)
            }
            Text(value)
                .font(.system(size: 15, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.onLime)
            Text(title)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Brand.onLime.opacity(0.75))
                .lineLimit(1)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.white.opacity(0.55), in: .rect(cornerRadius: R.control, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    /**
     * Грейповый блок: приход по часам столбиками.
     *
     * Столбики белые полупрозрачные, лучший час — сплошной белый. Часы
     * без денег стоят низкой чертой, чтобы ось не рвалась.
     */
    private func bentoHours(_ s: API.Summary) -> some View {
        let points = s.series
        let top = max(1, points.map(\.revenue).max() ?? 1)
        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text(L("summary.paymentsDay"))
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.7))
                Spacer()
                Text(money(s.stats.revenue, currency))
                    .font(.system(size: 15, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(.white)
            }

            if points.isEmpty {
                Text(L("work.emptyOpenNote"))
                    .font(.system(size: 13))
                    .foregroundStyle(.white.opacity(0.6))
                    .padding(.top, 24)
                    .padding(.bottom, 8)
            } else {
                HStack(alignment: .bottom, spacing: 5) {
                    ForEach(points) { point in
                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                            .fill(point.revenue == top ? Color.white : Color.white.opacity(point.revenue > 0 ? 0.42 : 0.16))
                            .frame(height: max(6, 96 * CGFloat(point.revenue) / CGFloat(top)))
                            .frame(maxWidth: .infinity)
                    }
                }
                .frame(height: 96, alignment: .bottom)
                .padding(.top, 18)

                HStack {
                    ForEach(Array(points.enumerated()), id: \.offset) { i, point in
                        if i == 0 || i == points.count - 1 || i == points.count / 2 {
                            Text(point.hourLabel)
                                .font(.system(size: 11, weight: .medium))
                                .monospacedDigit()
                                .foregroundStyle(.white.opacity(0.6))
                                .frame(maxWidth: .infinity, alignment: i == 0 ? .leading : (i == points.count - 1 ? .trailing : .center))
                        }
                    }
                }
                .padding(.top, 6)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(colors: [Brand.grapeFill, Brand.grapeMid], startPoint: .topLeading, endPoint: .bottomTrailing),
            in: .rect(cornerRadius: 28, style: .continuous)
        )
        .shadow(color: Brand.grapeDeep.opacity(0.25), radius: 16, y: 8)
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
        .paperCard(18)
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
        .paperCard(R.card)
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
        .paperCard(R.card)
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
        .paperCard(22)
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
    private func units(_ n: Int) -> String {
        Terms.units(n, session.tenant?.unitOne ?? "").trimmingCharacters(in: .whitespaces)
    }

    /// `total` — число записей за период из статистики, а не длина ленты:
    /// сервер отдаёт последние сто строк, и за месяц с тремя сотнями машин
    /// справа стояло «100 машин». Теперь справа настоящее число, а под
    /// шапкой сказано, сколько из них видно.
    @ViewBuilder
    private func journal(_ feed: [API.FeedItem], total: Int) -> some View {
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
                    Text(units(max(total, feed.count)))
                        .font(.system(size: 12))
                        .monospacedDigit()
                        .foregroundStyle(Brand.boardMuted)
                }
                .padding(.horizontal, 4)
                .padding(.top, 22)
                .padding(.bottom, 4)

                if feed.count < total {
                    Text(L("feed.truncated", units(feed.count), units(total)))
                        .font(.system(size: 12))
                        .monospacedDigit()
                        .foregroundStyle(Brand.boardMuted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 4)
                        .padding(.bottom, 6)
                }

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
                            Hairline(inset: 4)
                        }
                    }
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .paperCard(R.card)
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
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(on ? Brand.onInk : Brand.ink)
                .padding(.horizontal, 13)
                .padding(.vertical, 7)
                .background(on ? Brand.ink : Brand.paper, in: .capsule)
                .overlay(Capsule().strokeBorder(Brand.ink.opacity(on ? 0 : 0.08), lineWidth: 1))
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

        /* Кружка с буквой больше нет — владелец попросил его убрать из
           списка. Кто мыл, называется словом в строке под номером, а
           цвет человека остаётся точкой перед именем: тот же оттенок,
           что в команде и в зарплатах. */
        return HStack(alignment: .top, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 7) {
                        /* Номер — просто жирным: рамку со флагом в этом
                           списке владелец отверг. */
                        Text(item.clientKey ?? "—")
                            .font(.system(size: 17, weight: .bold, design: .rounded))
                            .monospacedDigit()
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
                    HStack(spacing: 5) {
                        Circle()
                            .fill(tone.base)
                            .frame(width: 6, height: 6)
                        Text(item.shared
                            ? "\(Terms.service(item.serviceName)) · \(paymentLabel(item.payment).lowercased())"
                            : "\(face) · \(Terms.service(item.serviceName)) · \(paymentLabel(item.payment).lowercased())")
                            .font(.system(size: 12))
                            .foregroundStyle(Brand.boardMuted)
                            .lineLimit(1)
                            .truncationMode(.tail)
                    }

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

                    /* Доля работника — грейповой плашкой, как в
                       онбординге: там этот приём владельцу и понравился.
                       Плашка отделяет чужие деньги от своих одним
                       взглядом, чего серая строка не делала: три тихие
                       строки подряд читались одним пятном.

                       При нулевой ставке плашки нет вовсе: у владельца,
                       который записывает сам, процента нет, и «ему 0 ֏» в
                       каждой записи — шум. */
                    if (item.staffPercent ?? 0) > 0 {
                        Text("+" + money(item.earned, currency))
                            .font(.system(size: 12, weight: .bold))
                            .monospacedDigit()
                            .foregroundStyle(Brand.grape)
                            .lineLimit(1)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 3)
                            .background(Brand.grape.opacity(0.10), in: .rect(cornerRadius: 8, style: .continuous))
                            .padding(.top, 1)
                    }
                }
            }
        }
        .padding(.horizontal, 4)
        .padding(.vertical, 10)
        .background(
            newestFeedID == item.id || focused?.id == item.id ? Brand.grape.opacity(0.12) : Color.clear,
            in: .rect(cornerRadius: 14, style: .continuous)
        )
        .transition(
            reduceMotion
                ? .opacity
                : .move(edge: .top).combined(with: .opacity)
        )
        .contentShape(.rect)
        /* Долгое нажатие берёт запись: строка подсвечивается, а внизу
           вырастает полоса действий. Повторное нажатие отпускает. */
        .onLongPressGesture(minimumDuration: 0.45, maximumDistance: 8) {
            if focused?.id == item.id { release() } else { focus(item) }
        }
    }

    // ══════════════════════════ полоса действий ══════════════════════════

    private func focus(_ item: API.FeedItem) {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        focusedClient = nil
        withAnimation(reduceMotion ? nil : Motion.springSnap) { focused = item }
        guard let key = item.clientKey else { return }
        Task {
            let result: API.Clients? = try? await session.authed { token in
                try await APIClient.shared.send("clients", token: token, as: API.Clients.self)
            }
            guard focused?.id == item.id else { return }
            focusedClient = result?.clients.first { $0.key == key }
        }
    }

    private func release() {
        withAnimation(reduceMotion ? nil : Motion.springSnap) { focused = nil }
    }

    /**
     * Стеклянная полоса вместо вкладок: номер и цена записи, история
     * клиента, звонок, отмена записи и крестик. Кнопки — кружки в одном
     * стеклянном контейнере, чтобы сливались в одну форму, как панель.
     */
    private func actionBar(_ item: API.FeedItem) -> some View {
        GlassEffectContainer(spacing: 10) {
            HStack(spacing: 10) {
                HStack(spacing: 8) {
                    Text(item.clientKey ?? "—")
                        .font(.system(size: 15, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(Brand.ink)
                        .lineLimit(1)
                        .layoutPriority(2)
                    Text(money(item.price, currency))
                        .font(.system(size: 13, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(Brand.muted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                }
                .padding(.horizontal, 14)
                .frame(height: 46)
                .glassEffect(.regular, in: .capsule)

                barButton("clock.arrow.circlepath", enabled: focusedClient != nil) {
                    historyClient = focusedClient
                }
                barButton("phone.fill", enabled: focusedClient?.phone != nil) {
                    if let phone = focusedClient?.phone, let url = URL(string: "tel:\(phone)") {
                        UIApplication.shared.open(url)
                    }
                }
                barButton("trash.fill", tint: Brand.badOnBoard) {
                    cancelling = item
                }
                barButton("xmark") { release() }
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 10)
    }

    private func barButton(_ symbol: String, tint: Color = Brand.ink, enabled: Bool = true, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(enabled ? tint : Brand.muted.opacity(0.5))
                .frame(width: 46, height: 46)
                .contentShape(.circle)
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .glassEffect(.regular.interactive(), in: .circle)
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

    /* «Чистая прибыль» — так решил владелец: по-армянски «մաքուր
       եկամուտ». Прежнее «զուտ շահույթ» звучало по-бухгалтерски, а не
       так, как говорят на мойке. С «հասույթ» новое слово всё равно не
       спутать: оно не похоже ни звучанием, ни корнем. Та же формула на
       всех языках и на вебе. */
    private var profitTitle: String {
        switch summaryPeriod {
        case "month": return isLoss ? L("summary.redMonth") : L("summary.keptMonth")
        case "prevmonth": return isLoss ? L("summary.redPrevMonth") : L("summary.keptPrevMonth")
        default: return isLoss ? L("summary.redToday") : L("summary.keptToday")
        }
    }

    /* «Заплатили», а не «выручка»: `հասույթ` — слово из отчёта, а не из
       разговора, и рядом с соседним числом на том же экране два книжных
       термина путают даже автора продукта. Обычная речь ни на что не
       похожа и потому читается однозначно. */
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
        release()
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
                let first = summary == nil
                summary = fresh
                summaryPeriod = requestedPeriod
                newestFeedID = inserted?.id
                /* Первый показ: секции приходят по очереди, число
                   накручивается от нуля следом за карточкой. Владелец
                   показал ролик с таким приходом и попросил так же. */
                arrive(first: first)
            } else {
                withAnimation(.spring(response: 0.38, dampingFraction: 0.94)) {
                    summary = fresh
                    summaryPeriod = requestedPeriod
                    newestFeedID = inserted?.id
                }
            }
            failure = nil

            /* Мойка ожила: на площадке уже что-то происходило. Отсюда, а
               не из первого входа, приложение предлагает уведомления —
               спрашивать про них на пустом экране значит сжечь
               единственную попытку системного окна. */
            if !fresh.feed.isEmpty {
                NotificationCenter.default.post(name: .washAlive, object: nil)
            }

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
            beat = .here
            countUp = true
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
