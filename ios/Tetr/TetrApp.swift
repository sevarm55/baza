import SwiftUI

@main
struct TetrApp: App {
    @StateObject private var session = Session()
    @StateObject private var queue = OrderQueue()
    @StateObject private var lock = BiometricLock()
    @StateObject private var net = Connectivity()

    @Environment(\.scenePhase) private var phase

    init() {
        /* Спиннер «потяни, чтобы обновить» — это UIRefreshControl из UIKit,
           и общий `.tint` приложения его не касается: он остаётся системным
           серым. Красим через appearance, другого входа к нему SwiftUI не
           даёт. Цвет адаптивный — иначе в тёмной теме он потонет. */
        UIRefreshControl.appearance().tintColor = Brand.grapeUI

        #if DEBUG
        /* Проверки чистой логики прогоняются запуском с флагом:
           `xcrun simctl launch <udid> org.tetr.app --self-test`.
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

    var body: some View {
        switch session.state {
        case .checking:
            ZStack {
                Brand.heroGradient.ignoresSafeArea()
                ProgressView().tint(.white)
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
            } else {
                MainTabs()
            }
        }
    }
}

struct MainTabs: View {
    @EnvironmentObject private var session: Session

    var body: some View {
        TabView {
            /* Планшет с записями, а не капля. Капля — это автомойка, а ниш
               будет шесть: у стоматолога и барбера вода ни при чём. Экран
               же во всех нишах один и тот же — журнал за смену, — и планшет
               одинаково читается и как карта приёма, и как лист заказов.
               Заодно это ровно то, что значит «Տետր». */
            Tab("Հերթափոխ", systemImage: "list.clipboard.fill") {
                NavigationStack {
                    ShiftView()
                        .navigationTitle(session.tenant?.name ?? "Տետր")
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar { signOut }
                }
            }

            if session.me?.isOwner == true {
                Tab("Այսօր", systemImage: "chart.bar.fill") {
                    NavigationStack {
                        OwnerView()
                            .navigationTitle("Այսօր")
                            .navigationBarTitleDisplayMode(.inline)
                    }
                }

                Tab("Աշխատավարձ", systemImage: "banknote.fill") {
                    NavigationStack {
                        PayrollView()
                            .navigationTitle("Աշխատավարձեր")
                            .navigationBarTitleDisplayMode(.inline)
                    }
                }

                // Разделы, куда заходят редко. Вкладок должно быть столько,
                // сколько экранов открывают каждый день; прайс правят раз
                // в месяц — ему в панели не место.
                Tab("Ավելին", systemImage: "ellipsis.circle.fill") {
                    NavigationStack {
                        MoreView()
                            .navigationTitle("Ավելին")
                            .navigationBarTitleDisplayMode(.inline)
                    }
                }
            }
        }
        // Панель вкладок сжимается при прокрутке вниз: на экране смены
        // важнее список записей, чем постоянная навигация
        .tabBarMinimizeBehavior(.onScrollDown)
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
