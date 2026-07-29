import SwiftUI

@main
struct TetrApp: App {
    @StateObject private var session = Session()
    @StateObject private var queue = OrderQueue()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .environmentObject(queue)
                .tint(Brand.grape)
        }
    }
}

/// Что показывать: вход, кабинет или экран смены.
///
/// Роль приходит с сервера в `/bootstrap`, и приложение не решает её само.
/// Владелец, который сам моет машины, видит обе вкладки — на маленькой
/// мойке это один и тот же человек.
struct RootView: View {
    @EnvironmentObject private var session: Session
    @EnvironmentObject private var queue: OrderQueue

    var body: some View {
        switch session.state {
        case .checking:
            ZStack {
                Brand.heroGradient.ignoresSafeArea()
                ProgressView().tint(.white)
            }
            .task { await session.start() }

        case .signedOut:
            LoginView()

        case .signedIn:
            MainTabs()
        }
    }
}

struct MainTabs: View {
    @EnvironmentObject private var session: Session
    @EnvironmentObject private var queue: OrderQueue

    var body: some View {
        TabView {
            Tab("Հերթափոխ", systemImage: "drop.fill") {
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
                Image(systemName: "power")
            }
        }
    }
}
