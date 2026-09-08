import SwiftUI

/// Сирень под выбранной вкладкой: светлая по светлой теме, глубокая по
/// тёмной. Не грейп в полную силу — на нём грейповый значок пропал бы.
private let adaptiveTabSelection = UIColor { traits in
    traits.userInterfaceStyle == .dark
        ? UIColor(red: 0x4C / 255, green: 0x1D / 255, blue: 0x95 / 255, alpha: 0.55)
        : UIColor(red: 0x6D / 255, green: 0x28 / 255, blue: 0xD9 / 255, alpha: 0.14)
}

/// Делегат нужен ровно ради одного: токен устройства система отдаёт
/// только сюда, до SwiftUI он не доходит.
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken token: Data
    ) {
        Task { @MainActor in Push.shared.store(token) }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        // без уведомлений приложение работает целиком, поэтому только след
        print("[push] регистрация не прошла: \(error.localizedDescription)")
    }
}

@main
struct TetrApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @StateObject private var session = Session()
    @StateObject private var queue = OrderQueue()
    @StateObject private var lock = BiometricLock()
    @StateObject private var net = Connectivity()
    @StateObject private var lang = LangStore.shared

    @Environment(\.scenePhase) private var phase

    /* Заставка живёт столько же, сколько процесс: возврат из фона `App`
       не пересоздаёт, поэтому она идёт один раз за холодный старт и
       не встречает человека каждый раз, когда он переключился на камеру
       и вернулся. */
    @State private var splash = !Launch.debugScreen

    init() {
        /* Спиннер «потяни, чтобы обновить» — это UIRefreshControl из UIKit,
           и общий `.tint` приложения его не касается: он остаётся системным
           серым. Красим через appearance, другого входа к нему SwiftUI не
           даёт. Цвет адаптивный — иначе в тёмной теме он потонет. */
        UIRefreshControl.appearance().tintColor = Brand.grapeUI

        /* Плашка выбранной вкладки — сиреневая, а не системная серая.
           Значок и подпись на ней и так грейповые; серая подложка под ними
           единственное место внизу экрана, где марки нет вовсе.

           Через appearance, потому что SwiftUI до этого слоя не дотягивается:
           `.tint` красит содержимое вкладки, но не выделение под ним.
           Фон настраивается `configureWithDefaultBackground()` — стекло
           панели остаётся системным, меняется только заливка выделения. */
        let tabs = UITabBarAppearance()
        tabs.configureWithDefaultBackground()
        tabs.selectionIndicatorTintColor = adaptiveTabSelection
        UITabBar.appearance().standardAppearance = tabs
        UITabBar.appearance().scrollEdgeAppearance = tabs

        #if DEBUG
        /* Проверки чистой логики прогоняются запуском с флагом:
           `xcrun simctl launch <udid> com.sevarm.tetr --self-test`.
           Отдельный тестовый таргет ради десятка проверок разбора номера
           стоил бы дороже, чем даёт. */
        if CommandLine.arguments.contains("--self-test") {
            exit(Int32(PlateReaderTests.run() + TermsTests.run()))
        }
        #endif

        // до конца запуска, иначе система не знает идентификатора задачи
        BackgroundSync.register()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                /* Смена языка перерисовывает всё дерево: `.id` заставляет
                   SwiftUI собрать виды заново, и новые строки встают на
                   место сразу, а не на следующем открытии экрана. Здесь
                   же — локаль для дат и чисел внутри дерева. */
                .applyLanguage(lang.current)
                .environmentObject(lang)
                .environmentObject(session)
                .environmentObject(queue)
                .environmentObject(lock)
                .environmentObject(net)
                .tint(Brand.grape)
                /* Возвращение из браузера.
                 *
                 * `tetrin://signin?login=…` — единственная ссылка, которую
                 * приложение принимает. Её открывает страница подтверждения
                 * почты или страница нового пароля: обе живут в браузере,
                 * потому что письмо читают почтой, и оттуда дорога одна.
                 *
                 * Заставку и знакомство при этом снимаем: человек пришёл
                 * по делу, и показывать ему листалку про продукт, который
                 * он уже завёл, значит держать его на пороге.
                 */
                .onOpenURL { url in
                    guard url.scheme == "tetrin", url.host == "signin" else { return }

                    let login = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                        .queryItems?
                        .first { $0.name == "login" }?
                        .value

                    session.pendingLogin = login ?? ""
                    Onboarding.seen = true
                    splash = false
                }
                .task {
                    BackgroundSync.use(session: session, queue: queue)
                    Push.shared.use(session: session)
                    // связь вернулась — досылаем тут же, не дожидаясь,
                    // пока человек снова откроет экран смены
                    net.onReturn = {
                        Task { await queue.flush(using: session) }
                    }
                }
                .onChange(of: phase) { _, new in
                    switch new {
                    case .background:
                        BackgroundSync.schedule()
                    case .active:
                        /* Спрашиваем сервер о себе заново. Без этого
                           версия и срок подписки узнавались только при
                           холодном запуске, а приложение живёт в памяти
                           сутками. */
                        Task { await session.refreshOnReturn() }
                    default:
                        break
                    }
                }
                /* Поверх всего: проверка сессии идёт своим ходом под
                   заставкой, и к моменту, когда заставка ушла, приложение
                   обычно уже знает, кого показывать. */
                .overlay {
                    if splash {
                        LaunchSplashView {
                            withAnimation(.easeOut(duration: 0.35)) { splash = false }
                            /* Экраны под заставкой ждут этого момента,
                               чтобы собраться на глазах: приход секций и
                               накрутка чисел под заставкой пропадают зря. */
                            Launch.splashShowing = false
                            NotificationCenter.default.post(name: .splashDone, object: nil)
                        }
                        .transition(.opacity)
                        /* Имя нужно, чтобы дождаться конца заставки.
                           Экран входа под ней уже нарисован и по всем
                           признакам доступен — а касание уходит в заставку.
                           Проверка при этом «нажимала войти» и оставалась
                           на входе, то есть проверяла, что вход сломан. */
                        .accessibilityIdentifier("splash")
                    }
                }
        }
    }
}

/// Что показывать: замок, вход, кабинет или экран смены.
///
/// Роль приходит с сервера в `/bootstrap`, и приложение не решает её само.
/// Владелец, который сам моет машины, видит обе вкладки — на маленькой
/// мойке это один и тот же человек.
struct RootView: View {
    @EnvironmentObject private var session: Session
    @EnvironmentObject private var lock: BiometricLock

    @State private var onboarding = false
    @State private var ownerGuide = false

    /// Лист про уведомления перед системным окном.
    @State private var pushPrimer = false

    /// Согласился ли он на них. Системное окно поднимаем после того, как
    /// лист уедет: два окна в одном такте наезжают друг на друга.
    @State private var pushAsked = false

    /**
     * Знакомство при самом первом открытии, ДО входа.
     *
     * Так попросил владелец: человек ставит приложение из магазина и
     * первым делом видит рассказ о продукте, а не форму входа. Роль в
     * этот момент ещё неизвестна, и это осознанная цена: кадры говорят
     * о деньгах мойки, и тому, кто пришёл по ссылке владельца, они
     * тоже объясняют, куда он попал.
     *
     * Флаг тот же, что у показа после входа: посмотрел до входа —
     * второй раз после входа не встретит.
     */
    @State private var firstRun = !Onboarding.seen

    var body: some View {
        #if DEBUG
        /* Посмотреть онбординг, не входя в аккаунт и не сбрасывая
           состояние: `xcrun simctl launch <udid> com.sevarm.tetr --onboarding`.
           Тем же способом здесь запускаются проверки разбора номера. */
        /* Заставку видно доли секунды, а проверять её приходится
           глазами: оборот загрузчика длится полторы секунды, и в
           обычном запуске половина фаз на экран не попадает. Тем же
           способом, что онбординг:
           `xcrun simctl launch <udid> com.sevarm.tetr --loader`. */
        if CommandLine.arguments.contains("--loader") {
            ZStack {
                Brand.grapeDeep.ignoresSafeArea()
                Brand.splashGlow.ignoresSafeArea()
                TetrLoader(size: 40, tint: Brand.lime)
            }
            .preferredColorScheme(.dark)
        } else if CommandLine.arguments.contains("--onboarding") {
            OnboardingView {}
        } else if CommandLine.arguments.contains("--push-primer") {
            /* Лист про уведомления, не заводя аккаунт и не сжигая
               системное окно:
               `xcrun simctl launch <udid> com.sevarm.tetr --push-primer`. */
            Color.clear
                .sheet(isPresented: .constant(true)) {
                    /* Согласие здесь настоящее: поднимает то самое
                       системное окно, ради которого лист и написан. */
                    NotificationsPrimerView(
                        onAllow: { Task { await Push.shared.askAndRegister() } },
                        onSkip: {}
                    )
                }
        } else {
            content
        }
        #else
        content
        #endif
    }

    /* Пришли по ссылке из браузера — знакомство убираем с дороги.
     *
     * Человек уже завёл мойку и идёт входить; листалка про продукт,
     * который у него уже есть, держала бы его на пороге. Живёт здесь, а
     * не в корне приложения: `firstRun` принадлежит этому виду.
     */
    private var content: some View {
        shell
            .onChange(of: session.pendingLogin) { _, arrived in
                if arrived != nil { firstRun = false }
            }
    }

    @ViewBuilder
    private var shell: some View {
        switch session.state {
        case .checking:
            /* Единственный экран продукта, который отбирает всё сразу, и
               единственный повод для этого: приложение ещё не знает, чей
               оно и что показывать. Всё остальное ожидание живёт в
               скелете раздела или в занятой кнопке.

               Подписи под фигурой нет. «Բեռնվում է…» под движущимся
               загрузчиком не добавляет ни одного факта, а занимает
               строку и задаёт вопрос «а сколько ещё». */
            ZStack {
                Brand.grapeDeep.ignoresSafeArea()
                Brand.splashGlow.ignoresSafeArea()
                TetrLoader(size: 40, tint: Brand.lime)
            }
            .preferredColorScheme(.dark)
            .task { await session.start() }

        case .signedOut:
            if firstRun {
                OnboardingView {
                    Onboarding.seen = true
                    withAnimation(.easeOut(duration: Motion.normal)) { firstRun = false }
                }
            } else {
                LoginView()
            }

        case .signedIn:
            if session.access?.canRead == false {
                /* Срок вышел — вместо всего продукта один экран. Стоит
                   выше замка по смыслу, но ниже по порядку: сначала
                   человек доказывает, что это его телефон, и только
                   потом узнаёт про счёт. */
                ExpiredView()
            } else if session.updateRequired {
                /* Версия отстала от App Store — работать нельзя, только
                   обновиться. После счёта, а не до: вопрос «почему я не
                   могу войти в свои деньги» важнее вопроса версии. */
                UpdateWallView()
            } else {
                MainTabs()
                    /* Запасной показ знакомства. Основной теперь при самом
                       первом открытии, до входа (см. `firstRun`); сюда
                       попадает владелец, который вошёл ещё до этой версии
                       и слайдов не видел. Мойщику не показываем: он
                       открывает приложение записать машину, у него на
                       площадке стоит клиент. */
                    .fullScreenCover(isPresented: $onboarding, onDismiss: {
                        /* Приветственные слайды и обучение — два разных
                           события. После слайдов показываем владельцу
                           практическую памятку снизу, если он её ещё не
                           видел. `onDismiss` ждёт окончания перехода и не
                           сталкивает две презентации в один такт. */
                        if session.me?.isOwner == true && !session.welcomeSeen {
                            ownerGuide = true
                        } else {
                            Task { await refreshPush() }
                        }
                    }) {
                        OnboardingView {
                            Onboarding.seen = true
                            onboarding = false
                        }
                    }
                    .sheet(isPresented: $ownerGuide, onDismiss: {
                        Task { await refreshPush() }
                    }) {
                        OwnerWelcomeSheet(
                            onLook: { ownerGuide = false },
                            onStart: {
                                ownerGuide = false
                                NotificationCenter.default.post(name: .openOwnerSetup, object: nil)
                            }
                        )
                        /* Серверный флаг принадлежит именно практическому
                           обучению — тому же листу, который получает
                           владелец в веб-кабинете. Картинные слайды выше
                           остаются локальным знакомством с приложением. */
                        .task {
                            guard !session.welcomeSeen else { return }
                            await session.markWelcomeSeen()
                        }
                    }
                    .sheet(isPresented: $pushPrimer, onDismiss: {
                        /* Системное окно — после того, как лист уехал.
                           Поднятое поверх уезжающего листа, оно встаёт
                           на полпути анимации и читается сбоем. */
                        guard pushAsked else { return }
                        pushAsked = false
                        Task { await Push.shared.askAndRegister() }
                    }) {
                        NotificationsPrimerView(
                            onAllow: {
                                PushPrimer.seen = true
                                pushAsked = true
                                pushPrimer = false
                            },
                            onSkip: {
                                /* Отказ помним: второй раз тот же лист
                                   был бы уговариванием. Системного окна
                                   при этом не было вовсе, и включить
                                   уведомления можно переключателем в
                                   профиле. */
                                PushPrimer.seen = true
                                pushPrimer = false
                            }
                        )
                    }
                    .task(id: session.me?.id) {
                        /* Очередь первых экранов владельца, по одному за
                           раз: слайды, памятка, уведомления. Каждый
                           следующий поднимается в `onDismiss`
                           предыдущего — иначе лист про уведомления
                           открывается под уже стоящим экраном и не
                           показывается вовсе, молча. */
                        guard session.me?.isOwner == true else { return }

                        if !Onboarding.seen {
                            onboarding = true
                        } else if !session.welcomeSeen {
                            ownerGuide = true
                        } else {
                            await refreshPush()
                        }
                    }
                    /* Предложение уведомлений ждёт первого события на
                       мойке: его объявляет сводка, когда в ленте есть
                       хотя бы одна запись. */
                    .onReceive(NotificationCenter.default.publisher(for: .washAlive)) { _ in
                        Task { await offerPush() }
                    }
            }
        }
    }

    /**
     * Забрать токен у того, кто уведомления уже разрешил.
     *
     * Проходит молча и без единого окна, но нужен на каждом входе: токен
     * устройства меняется, и без повторной регистрации уведомления
     * однажды просто перестают приходить.
     *
     * Тому, кого система ещё не спрашивала, здесь не делаем ничего:
     * его очередь наступает в `offerPush`, и не по расписанию запуска.
     */
    private func refreshPush() async {
        guard session.me?.isOwner == true else { return }
        guard await Push.shared.shouldPrime() == false else { return }

        await Push.shared.askAndRegister()
    }

    /**
     * Предложить уведомления.
     *
     * СПРАШИВАЕМ НЕ ПРИ ВХОДЕ, А ПОСЛЕ ПЕРВОГО СОБЫТИЯ НА МОЙКЕ. У
     * системного окна одна попытка за установку: нажал «Запретить» — и
     * вернуть его можно только через настройки телефона, куда никто не
     * идёт. Значит вопрос надо задать в момент, когда ответ на него
     * очевиден. В первый вход мойка пустая, уведомлять не о чем, и
     * честный ответ на «пускать ли это приложение к себе» — нет. Когда в
     * ленте уже есть записанные машины, тот же вопрос звучит про них.
     *
     * Порядок с остальными первыми экранами сторожим сами: лист,
     * поднятый поверх слайдов или памятки, не показывается вовсе, молча.
     */
    private func offerPush() async {
        guard session.me?.isOwner == true else { return }
        guard !onboarding, !ownerGuide, !pushPrimer else { return }
        guard !PushPrimer.seen else { return }
        guard await Push.shared.shouldPrime() else { return }

        pushPrimer = true
    }
}

struct MainTabs: View {
    @EnvironmentObject private var session: Session
    @EnvironmentObject private var queue: OrderQueue
    @EnvironmentObject private var lang: LangStore

    /* Вкладку держим сами: при переходе на другую точку набор вкладок
       может смениться — на одной мойке человек владелец, на другой
       мойщик, — и выбранная вкладка перестала бы существовать под
       пальцем. Домашняя вкладка своя у каждой роли: владелец открывает
       приложение узнать, что происходит, — это сводка; мойщик приходит
       записать машину — это смена. */
    @State private var tab = Tabs.shift

    /**
     * Значок вкладки, который отзывается на нажатие.
     *
     * Отскок рисует сама система: `symbolEffect(.bounce)` — родное
     * движение SF Symbols, и оно живёт в той же панели, что и всё
     * остальное. Ради этого вкладки собраны с ярлыком вручную:
     * `Tab(systemImage:)` берёт голое имя значка, и повесить на него
     * ничего нельзя.
     *
     * Пружина срабатывает на смену выбранной вкладки, а не на каждое
     * касание: тыкать в уже открытую вкладку и получать прыжок — это
     * движение без события.
     */
    @ViewBuilder
    private func tabLabel(_ title: String, _ icon: String, value: Tabs) -> some View {
        Label {
            Text(title)
        } icon: {
            Image(systemName: icon)
                .symbolEffect(.bounce, options: .nonRepeating, value: tab == value)
        }
    }

    /// Экран смены со своей панелью: один и тот же для обеих вкладок.
    private var shiftStack: some View {
        NavigationStack {
            ShiftView()
                .navigationTitle(session.canSwitch ? "" : (session.tenant?.name ?? "Tetrin"))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    /* У кого мойка одна — прежний заголовок и
                       больше ничего: ни шеврона, ни меню. */
                    if session.canSwitch {
                        ToolbarItem(placement: .principal) {
                            PointMenu(
                                points: session.points,
                                currentId: session.tenant?.id
                            ) { point in
                                try? await session.switchTo(point, queue: queue)
                            }
                        }
                    }
                    languageMenu
                    signOut
                }
        }
    }

    enum Tabs { case shift, summary, payroll, more }

    /// Куда попадает человек при входе и при смене точки.
    private var homeTab: Tabs {
        session.me?.isOwner == true ? .summary : .shift
    }

    /* Домашняя вкладка ставится один раз за вход. Именно флагом, а не
       голым `onAppear`: закрытие полноэкранной формы записи заново
       «показывает» TabView, и без флага владельца утаскивало бы со
       смены на сводку сразу после записанной машины. */
    @State private var landed = false

    var body: some View {
        TabView(selection: $tab) {
            /* Планшет с записями, а не капля. Капля — это автомойка, а ниш
               будет шесть: у стоматолога и барбера вода ни при чём. Экран
               же во всех нишах один и тот же — журнал за смену, — и планшет
               одинаково читается и как карта приёма, и как лист заказов.
               Заодно это ровно то, что значит армянское «տետր» — тетрадь. */
            /* Мойщику смена — единственная вкладка, и стоит она обычно.
               У владельца она уезжает в отдельный круглый выступ справа
               (`role: .search` в iOS 26 рисует вкладку отдельно от
               остальных): три раздела про деньги вместе, работа —
               отдельно, под большим пальцем. */
            if session.me?.isOwner != true {
                Tab(value: Tabs.shift) {
                    shiftStack
                } label: {
                    tabLabel(L("tab.shift"), "list.clipboard.fill", value: Tabs.shift)
                }
            }

            if session.me?.isOwner == true {
                Tab(value: Tabs.summary) {
                    NavigationStack {
                        /* Заголовок панели нативный, крупный в одном ряду
                           с колокольчиком; при прокрутке сжимается в
                           центр. Ряд опущен от часов на отступ снизу:
                           вплотную к ним владелец назвал «слишком высоко». */
                        OwnerView()
                    }
                } label: {
                    tabLabel(L("tab.summary"), "chart.bar.fill", value: Tabs.summary)
                }

                Tab(value: Tabs.payroll) {
                    NavigationStack {
                        PayrollView()
                    }
                } label: {
                    tabLabel(L("tab.payroll"), "banknote.fill", value: Tabs.payroll)
                }

                // Разделы, куда заходят редко. Вкладок должно быть столько,
                // сколько экранов открывают каждый день; прайс правят раз
                // в месяц — ему в панели не место.
                Tab(value: Tabs.more) {
                    NavigationStack {
                        /* Без заголовка панели: имя раздела уже написано во
                           вкладке, а прозрачная панель поверх плиток давала
                           «Ավելին», просвечивающее сквозь первый ряд. */
                        MoreView()
                    }
                } label: {
                    tabLabel(L("tab.more"), "ellipsis.circle.fill", value: Tabs.more)
                }

                Tab(value: Tabs.shift, role: .search) {
                    shiftStack
                } label: {
                    tabLabel(L("tab.shift"), "list.clipboard.fill", value: Tabs.shift)
                }
            }
        }
        /* Панель вкладок не сжимается при прокрутке. Система умеет
           убирать её в кружок, и это выглядит опрятно ровно до момента,
           когда человеку надо переключиться: кружок не говорит, где он
           находится, и по нему приходится сначала попасть, а потом ещё
           раз выбрать вкладку. На мойке переключаются часто и не глядя,
           поэтому панель стоит на месте целиком. */
        .tabBarMinimizeBehavior(.never)
        /* Смена точки пересоздаёт всё дерево: @State обнуляется, .task
           перезапускается, ответы прежней мойки приземляются в
           выброшенный вид. Без этого на экране остались бы правильные
           цифры чужой мойки — а это не выглядит ошибкой вовсе. */
        .id(session.generation)
        .onAppear {
            guard !landed else { return }
            landed = true
            tab = homeTab
        }
        .onChange(of: session.generation) { _, _ in tab = homeTab }
        /* Повод «зарплата копится» ведёт на соседнюю вкладку. Через
           уведомление, а не через привязку: вкладку держит этот вид, а
           повод открывают двумя экранами ниже, и тянуть привязку через
           всё дерево ради одного перехода — дороже, чем одно имя. */
        .onChange(of: lang.current) { _, fresh in
            Typo.applyNavigationTitles(for: fresh)
        }
        .onReceive(NotificationCenter.default.publisher(for: .openPayroll)) { _ in
            tab = .payroll
        }
        .onReceive(NotificationCenter.default.publisher(for: .openOwnerSetup)) { _ in
            tab = .summary
        }
    }

    /**
     * Язык — в панели экрана смены.
     *
     * Здесь, а не только в профиле, потому что у мойщика профиля нет
     * вовсе: он открывает приложение, чтобы записать машину, и дальше
     * экрана смены не заходит. Это единственное место, где он может
     * переключить продукт на свой язык.
     */
    @ToolbarContentBuilder
    private var languageMenu: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Menu {
                Picker(L("common.language"), selection: Binding(
                    get: { lang.current },
                    set: { lang.set($0) }
                )) {
                    ForEach(Lang.allCases, id: \.self) { option in
                        Text(option.ownName).tag(option)
                    }
                }
                .pickerStyle(.inline)
            } label: {
                /* Белым: панель смены лежит на фиолетовой сцене, и
                   грейп на ней не виден. */
                Image(systemName: "globe").foregroundStyle(.white)
            }
            .accessibilityLabel(L("common.language"))
            .accessibilityValue(lang.current.ownName)
        }
    }

    @ToolbarContentBuilder
    private var signOut: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Button {
                Task { await session.signOut() }
            } label: {
                // цвет явно: наследованный tint до символов доходит не везде;
                // белым, потому что панель смены лежит на фиолетовой сцене
                Image(systemName: "power").foregroundStyle(.white)
            }
        }
    }
}

extension Notification.Name {
    /// Повод «зарплата копится» просит открыть свою вкладку.
    static let openPayroll = Notification.Name("tetr.openPayroll")
    /// Заставка запуска ушла: можно показывать приход содержимого.
    static let splashDone = Notification.Name("tetr.splashDone")
    /// Обучающий лист владельца ведёт к живому чек-листу на сводке.
    static let openOwnerSetup = Notification.Name("tetr.openOwnerSetup")
    /// В ленте мойки есть хотя бы одно событие: на площадке что-то
    /// произошло. Момент, когда уведомления перестают быть обещанием.
    static let washAlive = Notification.Name("tetr.washAlive")
}

/// Состояние заставки запуска для экранов, которые собираются под ней.
enum Launch {
    @MainActor static var splashShowing = true

    /**
     * Запущены ли мы ради одного отладочного экрана.
     *
     * Заставка рисуется поверх всего и не знает, что под ней: проверяя
     * онбординг или лист про уведомления, её приходилось пережидать, а
     * первые полторы секунды экран был занят маркой. Отладочный запуск
     * начинается сразу с того, что проверяют.
     */
    static var debugScreen: Bool {
        #if DEBUG
        let flags: Set<String> = ["--onboarding", "--loader", "--push-primer"]
        return CommandLine.arguments.contains { flags.contains($0) }
        #else
        return false
        #endif
    }
}
