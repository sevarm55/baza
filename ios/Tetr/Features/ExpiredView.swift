import SwiftUI

/// Стена: срок вышел.
///
/// Раньше просрочка была мягкой — разделы открывались, закрывалась только
/// запись. Выглядело невнятно: продукт сообщал «время прошло» и тут же
/// пускал ходить по экранам, и человек не понимал, кончилось у него
/// что-то или нет. Теперь вместо всего продукта один экран.
///
/// На нём сначала — что данные целы: тот, кому закрыли доступ, первым
/// делом боится потерять историю, и пока этот страх не снят, остальное он
/// не читает. Потом — забрать данные или уйти совсем.
///
/// Обе кнопки работают: выгрузка и удаление аккаунта намеренно не смотрят
/// на состояние счёта. Держать чужую историю в заложниках у неоплаченного
/// счёта — верный способ, чтобы человек не вернулся даже заплатив.
///
/// Как продолжить пользоваться, здесь не написано, и это не упущение.
/// Правила App Store (3.1.3f) разрешают не встраивать покупку внутрь
/// приложения ровно при одном условии: внутри нет ни оплаты, ни призыва
/// оплатить снаружи. Кнопка «позвонить нам» была именно таким призывом.
/// Клиент попадает сюда, уже зная, с кем он договаривался.
struct ExpiredView: View {
    @EnvironmentObject private var session: Session
    @EnvironmentObject private var queue: OrderQueue

    @State private var exporting = false
    @State private var exported: URL?
    @State private var deleting = false

    /* Точку только что завели, и «срок вышел» здесь было бы прямой
       неправдой: ничего не истекло, оплаты просто ещё не было. Тот же
       разбор, что на веб-стене. */
    private var fresh: Bool { session.access?.state == "unpaid" }

    /// Остальные точки человека — куда отсюда можно уйти.
    private var others: [API.Point] {
        session.points.filter { $0.id != session.tenant?.id }
    }

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
                Text(fresh ? "Կետը ստեղծված է" : "Ժամկետը լրացել է")
                    .font(.system(size: 30, weight: .bold))
                    .foregroundStyle(.white)

                Text(fresh
                     ? "Սկսում ենք վճարումից հետո։ Ձեր մյուս կետերն աշխատում են ինչպես առաջ։"
                     : "Մուտքը ժամանակավորապես դադարեցված է։ Ձեր տվյալները տեղում են՝ գրանցումները, հասույթը, հաճախորդների բազան։ Ոչինչ չի կորել։")
                    .font(.system(size: 15.5))
                    .lineSpacing(3)
                    .foregroundStyle(.white.opacity(0.8))
                    .fixedSize(horizontal: false, vertical: true)

                /* Одна закрытая точка не имеет права запирать открытую.
                   Без этого владелец, заведший вторую мойку, упирался бы
                   в стену и терял доступ к первой — работающей. */
                if others.isEmpty == false {
                    VStack(spacing: 0) {
                        ForEach(others) { point in
                            Button {
                                Task { try? await session.switchTo(point, queue: queue) }
                            } label: {
                                HStack(spacing: 10) {
                                    Circle()
                                        .fill(point.canRead ? Brand.lime : Brand.warnOnDark)
                                        .frame(width: 7, height: 7)
                                    Text(point.name)
                                        .font(.system(size: 15, weight: .medium))
                                        .lineLimit(1)
                                    Spacer(minLength: 8)
                                    Image(systemName: "chevron.right")
                                        .font(.system(size: 11, weight: .bold))
                                        .foregroundStyle(.white.opacity(0.4))
                                }
                                .foregroundStyle(.white)
                                .padding(.vertical, 11)
                            }
                            if point.id != others.last?.id {
                                Rectangle().fill(.white.opacity(0.12)).frame(height: 1)
                            }
                        }
                    }
                    .padding(.horizontal, 14)
                    .background(.white.opacity(0.08), in: .rect(cornerRadius: 14))
                    .padding(.top, 4)
                }

                /* Выгрузка — главное действие на этом экране. Единственное,
                   что человеку тут по-настоящему нужно: забрать своё.
                   У новой точки её нет: там пока нечего забирать. */
                if !fresh {
                    Button(exporting ? "…" : "Ներբեռնել տվյալները") {
                        Task { await exportCsv() }
                    }
                    .buttonStyle(LimeButton())
                    .disabled(exporting)
                    .padding(.top, 4)
                }

                /* Удаление остаётся и у новой точки: её могли завести по
                   ошибке, и без него она висела бы в списке навсегда. */
                Button("Ջնջել բիզնեսը", role: .destructive) { deleting = true }
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
