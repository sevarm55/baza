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

    @Environment(\.scenePhase) private var phase

    /* Заставка живёт столько же, сколько процесс: возврат из фона `App`
       не пересоздаёт, поэтому ролик играет один раз за холодный старт и
       не встречает человека каждый раз, когда он переключился на камеру
       и вернулся. */
    @State private var splash = true

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
            exit(Int32(PlateReaderTests.run()))
        }
        #endif

        // до конца запуска, иначе система не знает идентификатора задачи
        BackgroundSync.register()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .environmentObject(queue)
                .environmentObject(lock)
                .environmentObject(net)
                .tint(Brand.grape)
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
                        lock.lockIfNeeded(hasSession: session.state == .signedIn)
                    default:
                        break
                    }
                }
                /* Поверх всего: проверка сессии идёт своим ходом под
                   заставкой, и к моменту, когда ролик кончился, приложение
                   обычно уже знает, кого показывать. */
                .overlay {
                    if splash {
                        LaunchVideoView {
                            withAnimation(.easeOut(duration: 0.35)) { splash = false }
                        }
                        .transition(.opacity)
                    }
                }
                // экраны под заставкой не должны поднимать клавиатуру
                .environment(\.splashActive, splash)
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

    var body: some View {
        #if DEBUG
        /* Посмотреть онбординг, не входя в аккаунт и не сбрасывая
           состояние: `xcrun simctl launch <udid> com.sevarm.tetr --onboarding`.
           Тем же способом здесь запускаются проверки разбора номера. */
        if CommandLine.arguments.contains("--onboarding") {
            OnboardingView {}
        } else {
            content
        }
        #else
        content
        #endif
    }

    @ViewBuilder
    private var content: some View {
        switch session.state {
        case .checking:
            ZStack {
                Brand.heroGradient.ignoresSafeArea()
                TetrLoader(size: 34, tint: Brand.lime)
            }
            .preferredColorScheme(.dark)
            .task {
                await session.start()
                lock.lockIfNeeded(hasSession: session.state == .signedIn)
            }

        case .signedOut:
            LoginView()

        case .signedIn:
            if lock.locked {
                LockView()
            } else if session.access?.canRead == false {
                /* Срок вышел — вместо всего продукта один экран. Стоит
                   выше замка по смыслу, но ниже по порядку: сначала
                   человек доказывает, что это его телефон, и только
                   потом узнаёт про счёт. */
                ExpiredView()
            } else {
                MainTabs()
                    /* Онбординг только владельцу и только один раз. Мойщик
                       открывает приложение, чтобы записать машину, — у него
                       на площадке стоит клиент, и объяснять ему устройство
                       зарплаты и расходов значит задержать работу. */
                    .fullScreenCover(isPresented: $onboarding) {
                        OnboardingView {
                            Onboarding.seen = true
                            onboarding = false
                        }
                    }
                    .task {
                        if session.me?.isOwner == true && !Onboarding.seen {
                            onboarding = true
                        }
                        /* Разрешение спрашиваем здесь, а не на запуске:
                           только у владельца и только когда он уже внутри.
                           Системный запрос без объяснения на первом экране
                           отклоняют не глядя, а вернуть его потом можно
                           лишь через настройки телефона. */
                        if session.me?.isOwner == true {
                            await Push.shared.askAndRegister()
                        }
                    }
            }
        }
    }
}

struct MainTabs: View {
    @EnvironmentObject private var session: Session
    @EnvironmentObject private var queue: OrderQueue

    /* Вкладку держим сами: при переходе на другую точку набор вкладок
       может смениться — на одной мойке человек владелец, на другой
       мойщик, — и выбранная вкладка перестала бы существовать под
       пальцем. Экран смены есть у обеих ролей, туда и возвращаемся. */
    @State private var tab = Tabs.shift

    enum Tabs { case shift, summary, payroll, more }

    var body: some View {
        TabView(selection: $tab) {
            /* Планшет с записями, а не капля. Капля — это автомойка, а ниш
               будет шесть: у стоматолога и барбера вода ни при чём. Экран
               же во всех нишах один и тот же — журнал за смену, — и планшет
               одинаково читается и как карта приёма, и как лист заказов.
               Заодно это ровно то, что значит армянское «տետր» — тетрадь. */
            Tab("Հերթափոխ", systemImage: "list.clipboard.fill", value: Tabs.shift) {
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
                                        Task { try? await session.switchTo(point, queue: queue) }
                                    }
                                }
                            }
                            signOut
                        }
                }
            }

            if session.me?.isOwner == true {
                Tab("Ամփոփում", systemImage: "chart.bar.fill", value: Tabs.summary) {
                    NavigationStack {
                        /* Без заголовка панели: на этом экране заголовок
                           страницы — дата, и «Ամփոփում» над ней было бы
                           второй шапкой над шапкой. Имя раздела уже
                           написано во вкладке. */
                        OwnerView()
                            .toolbar(.hidden, for: .navigationBar)
                    }
                }

                Tab("Աշխատավարձ", systemImage: "banknote.fill", value: Tabs.payroll) {
                    NavigationStack {
                        /* Без заголовка панели: показание «Վճարելու է» и
                           есть заголовок страницы, а «Աշխատավարձեր» над ним
                           было бы второй шапкой над шапкой. Имя раздела уже
                           написано во вкладке. */
                        PayrollView()
                            .toolbar(.hidden, for: .navigationBar)
                    }
                }

                // Разделы, куда заходят редко. Вкладок должно быть столько,
                // сколько экранов открывают каждый день; прайс правят раз
                // в месяц — ему в панели не место.
                Tab("Ավելին", systemImage: "ellipsis.circle.fill", value: Tabs.more) {
                    NavigationStack {
                        /* Без заголовка панели: имя раздела уже написано во
                           вкладке, а прозрачная панель поверх плиток давала
                           «Ավելին», просвечивающее сквозь первый ряд. */
                        MoreView()
                            .toolbar(.hidden, for: .navigationBar)
                    }
                }
            }
        }
        // Панель вкладок сжимается при прокрутке вниз: на экране смены
        // важнее список записей, чем постоянная навигация
        .tabBarMinimizeBehavior(.onScrollDown)
        /* Смена точки пересоздаёт всё дерево: @State обнуляется, .task
           перезапускается, ответы прежней мойки приземляются в
           выброшенный вид. Без этого на экране остались бы правильные
           цифры чужой мойки — а это не выглядит ошибкой вовсе. */
        .id(session.generation)
        .onChange(of: session.generation) { _, _ in tab = .shift }
        /* Повод «зарплата копится» ведёт на соседнюю вкладку. Через
           уведомление, а не через привязку: вкладку держит этот вид, а
           повод открывают двумя экранами ниже, и тянуть привязку через
           всё дерево ради одного перехода — дороже, чем одно имя. */
        .onReceive(NotificationCenter.default.publisher(for: .openPayroll)) { _ in
            tab = .payroll
        }
    }

    @ToolbarContentBuilder
    private var signOut: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Button {
                Task { await session.signOut() }
            } label: {
                // цвет явно: наследованный tint до символов доходит не везде
                Image(systemName: "power").foregroundStyle(Brand.grape)
            }
        }
    }
}

extension Notification.Name {
    /// Повод «зарплата копится» просит открыть свою вкладку.
    static let openPayroll = Notification.Name("tetr.openPayroll")
}
