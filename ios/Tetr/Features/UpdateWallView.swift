import SwiftUI

/**
 * Стена обновления: версия отстала от App Store — работать нельзя.
 *
 * Жёсткая намеренно, без «позже». Так решил владелец: клиентов немного,
 * и все обязаны быть на свежей версии — иначе поддержка превращается в
 * угадывание, чей экран как выглядит. Порог держит сервер
 * (`lib/plan.ts`, `IOS_APP_LATEST`), и правило его обновления одно:
 * сначала релиз реально доступен в магазине, потом меняется число.
 *
 * Стоит после замка и после стены счёта: сначала человек доказывает,
 * что это его телефон, потом узнаёт про оплату, и только потом — про
 * версию. Обратный порядок показывал бы кнопку магазина тому, кто ещё
 * не вошёл.
 *
 * Язык — вестибюль: тёмный грейп и лайм, как у входа, замка и заставки.
 */
struct UpdateWallView: View {
    @EnvironmentObject private var session: Session
    @Environment(\.openURL) private var openURL

    /**
     * Адрес приложения в магазине — тот же, что на витрине
     * (`lib/plan.ts`, `APP_STORE_URL`). Идентификатор выдан магазином
     * при публикации и с версиями не меняется. Без кода страны: Apple
     * сама уводит человека в его витрину.
     */
    private static let storeURL = URL(string: "https://apps.apple.com/app/id6796829076")!

    /// Идёт перепроверка версии по кнопке.
    @State private var checking = false

    var body: some View {
        ZStack {
            Brand.grapeDeep.ignoresSafeArea()
            Brand.splashGlow.ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                Image(systemName: "arrow.down.app.fill")
                    .font(.system(size: 44))
                    .foregroundStyle(Brand.lime)
                    .accessibilityHidden(true)

                Text(L("update.title"))
                    .font(.system(size: 30, weight: .bold))
                    .foregroundStyle(Brand.inkOnDark)
                    .multilineTextAlignment(.center)
                    .padding(.top, 18)

                Text(L("update.note"))
                    .font(.system(size: 15))
                    .foregroundStyle(Brand.mutedOnDark)
                    .multilineTextAlignment(.center)
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 10)

                /* Какая стоит и какая ждёт: снимает вопрос «а я точно
                   отстал», который иначе задают в поддержку. */
                if let latest = session.storeVersion {
                    Text(L("update.versions", Session.installedVersion, latest))
                        .font(.system(size: 12.5))
                        .monospacedDigit()
                        .foregroundStyle(Brand.mutedOnDark.opacity(0.7))
                        .padding(.top, 12)
                }

                Spacer()

                Button {
                    openURL(Self.storeURL)
                } label: {
                    Text(L("update.button"))
                }
                .buttonStyle(LimeButton())

                /**
                 * Запасной выход, а не второе действие.
                 *
                 * Обновившийся через магазин возвращается в живое
                 * приложение без перезапуска; и если владелец ошибся
                 * числом на сервере, у клиента есть способ выйти из
                 * стены сразу после исправления. Отказ сети молча
                 * оставляет стену — данных о новой версии так и нет.
                 */
                Button {
                    guard !checking else { return }
                    checking = true
                    Task {
                        await session.recheckVersion()
                        checking = false
                    }
                } label: {
                    Text(L("update.recheck"))
                        .font(.system(size: 14.5, weight: .semibold))
                        .foregroundStyle(Brand.mutedOnDark)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .loading(checking, tint: Brand.mutedOnDark, size: 16)
                }
                .buttonStyle(.plain)
                .busy(checking)
                .padding(.top, 6)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 24)
        }
        .preferredColorScheme(.dark)
    }
}
