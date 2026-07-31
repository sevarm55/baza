import SwiftUI

/// Стена: срок вышел.
///
/// Раньше просрочка была мягкой — разделы открывались, закрывалась только
/// запись. Выглядело невнятно: продукт сообщал «время прошло» и тут же
/// пускал ходить по экранам, и человек не понимал, кончилось у него
/// что-то или нет. Теперь вместо всего продукта один экран.
///
/// На нём три вещи, и порядок неслучаен. Сначала — что данные целы: тот,
/// кому закрыли доступ, первым делом боится потерять историю, и пока этот
/// страх не снят, остальное он не читает. Потом — как продолжить. И
/// только в конце — забрать данные или уйти совсем.
///
/// Обе последние кнопки работают: выгрузка и удаление аккаунта намеренно
/// не смотрят на состояние счёта. Держать чужую историю в заложниках у
/// неоплаченного счёта — верный способ, чтобы человек не вернулся даже
/// заплатив.
struct ExpiredView: View {
    @EnvironmentObject private var session: Session

    @State private var exporting = false
    @State private var exported: URL?
    @State private var deleting = false

    private let phone = "+374 99 855 546"

    var body: some View {
        ZStack(alignment: .bottom) {
            Color.clear
                .overlay(alignment: .top) {
                    if let art = UIImage(named: "expired.jpg") {
                        Image(uiImage: art).resizable().scaledToFill()
                    }
                }
                .clipped()
                .overlay {
                    LinearGradient(
                        colors: [.clear, Brand.grapeDeep.opacity(0.92), Brand.grapeDeep],
                        startPoint: UnitPoint(x: 0.5, y: 0.3),
                        endPoint: .bottom
                    )
                }

            VStack(alignment: .leading, spacing: 14) {
                Text("Ժամկետը լրացել է")
                    .font(.system(size: 30, weight: .bold))
                    .foregroundStyle(.white)

                Text("Ձեր տվյալները տեղում են՝ գրանցումները, հասույթը, հաճախորդների բազան։ Ոչինչ չի կորել։")
                    .font(.system(size: 15.5))
                    .lineSpacing(3)
                    .foregroundStyle(.white.opacity(0.8))
                    .fixedSize(horizontal: false, vertical: true)

                /* Звонок первым действием и лаймовой кнопкой: продолжить
                   пользоваться — это то, чего хотят и мы, и клиент.
                   Остальное мельче и спокойнее. */
                Link(destination: URL(string: "tel:+37499855546")!) {
                    Text("Զանգահարել \(phone)")
                }
                .buttonStyle(LimeButton())
                .padding(.top, 4)

                HStack(spacing: 10) {
                    Button(exporting ? "…" : "Ներբեռնել տվյալները") {
                        Task { await exportCsv() }
                    }
                    .disabled(exporting)

                    Button("Ջնջել բիզնեսը", role: .destructive) { deleting = true }
                }
                .font(.system(size: 14.5, weight: .semibold))
                .padding(.top, 2)

                Button("Դուրս գալ") {
                    Task { await session.signOut() }
                }
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.white.opacity(0.55))
                .padding(.top, 6)
            }
            .padding(.horizontal, 26)
            .padding(.bottom, 44)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .ignoresSafeArea()
        .preferredColorScheme(.dark)
        .sheet(item: $exported) { url in ShareSheet(url: url) }
        .sheet(isPresented: $deleting) { DeleteBusinessView() }
    }

    /// Выгрузка за всё время: человек уходит, и отдавать ему тридцать
    /// дней вместо всей истории было бы обманом.
    private func exportCsv() async {
        exporting = true
        defer { exporting = false }

        guard let data = try? await session.authed({ token in
            try await APIClient.shared.raw("export?days=all", token: token)
        }) else { return }

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("tetr-\(Int(Date().timeIntervalSince1970)).csv")
        guard (try? data.write(to: url)) != nil else { return }
        exported = url
    }
}
