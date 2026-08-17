import SwiftUI

/** Не системное меню, а небольшая карта бизнеса.

    Календарь — широкий тёмный «объектив» истории, клиенты — высокий живой
    блок, две настройки прайса пристыкованы к нему справа. Разные размеры
    задают приоритеты без радуги и без шести одинаковых строк. */
struct MoreView: View {
    @EnvironmentObject private var session: Session

    @State private var exporting = false
    @State private var exported: URL?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                header

                if session.canSwitch {
                    pointsCard
                }

                calendarCard
                controlMosaic
                staffCard
                profileCard
                exportCard
                /* Дверь обратно к настройке — только тому, кто её убрал.
                   Пропустить можно случайно и в первый же день, а
                   вспомнить о ней на третий; без этой строки вернуть
                   список было бы нечем. У того, кто её не убирал, здесь
                   ни одного нового пикселя. */
                if session.setupHidden { resumeSetupCard }
            }
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .padding(.bottom, 32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.board.ignoresSafeArea())
        .sheet(item: $exported) { url in
            ShareSheet(url: url)
        }
    }

    // ══════════════════════════ шапка ══════════════════════════

    /**
     * Имя экрана крупно, хотя оно же написано во вкладке.
     *
     * Повтор здесь не лишний: вкладка — это где я нахожусь, заголовок —
     * с чего начинается страница. Без него плитки начинались от самой
     * чёлки и экран выглядел вываленным, а не свёрстанным. Подпись под
     * заголовком говорит, чем этот экран вообще является, — она читается
     * один раз в жизни и дальше просто держит воздух над сеткой.
     */
    private var header: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(L("more.title"))
                .font(.system(size: 32, weight: .bold))
                .foregroundStyle(Brand.onBoard)
            Text(L("more.lead"))
                .font(.system(size: 13.5))
                .foregroundStyle(Brand.boardMuted)
        }
        .padding(.horizontal, 4)
        .padding(.bottom, 2)
    }

    /// Сколько точек и сколько из них ждут денег — то, ради чего сюда
    /// заходят, видно ещё до нажатия.
    private var points: String {
        let all = session.points.count
        let closed = session.points.filter { !$0.canRead }.count
        return closed == 0
            ? L("more.pointsAllOpen", all)
            : L("more.pointsSomeClosed", all, closed)
    }

    // ══════════════════════════ карта разделов ══════════════════════════

    /// Вернуть «Начало работы» на сводку.
    ///
    /// Тихой строкой в самом низу, а не карточкой раздела: это не место,
    /// куда ходят, а действие, которое делают один раз.
    private var resumeSetupCard: some View {
        Button {
            Task { await session.resumeSetup() }
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "checklist")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Brand.mintInk)
                    .frame(width: 38, height: 38)
                    .background(Brand.mintCard, in: .rect(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 2) {
                    Text(L("setup.resume"))
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Brand.onBoard)
                    Text(L("setup.resumeNote"))
                        .font(.system(size: 12.5))
                        .foregroundStyle(Brand.boardMuted)
                        .multilineTextAlignment(.leading)
                }
                Spacer()
                Image(systemName: "arrow.uturn.backward")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Brand.mintInk)
            }
            .padding(13)
            .background(Brand.boardSurface, in: .rect(cornerRadius: 18))
            .overlay {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .strokeBorder(Brand.boardInk.opacity(0.07), lineWidth: 0.8)
            }
        }
        .buttonStyle(.press)
    }

    private var pointsCard: some View {
        NavigationLink {
            PointsView().navigationTitle(L("points.title"))
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "building.2.fill")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Brand.lavenderInk)
                    .frame(width: 38, height: 38)
                    .background(Brand.lavenderCard, in: .rect(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 2) {
                    Text(L("more.points"))
                        .font(.system(size: 15, weight: .semibold))
                    Text(points)
                        .font(.system(size: 12.5))
                        .foregroundStyle(Brand.boardMuted)
                }
                Spacer()
                Image(systemName: "arrow.up.right")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Brand.lavenderInk)
            }
            .padding(13)
            .background(Brand.boardSurface, in: .rect(cornerRadius: 18))
            .overlay {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .strokeBorder(Brand.boardInk.opacity(0.07), lineWidth: 0.8)
            }
        }
        .buttonStyle(.press)
    }

    private var calendarCard: some View {
        NavigationLink {
            CalendarView().toolbar(.hidden, for: .navigationBar)
        } label: {
            ZStack(alignment: .bottomLeading) {
                /* Светлая карточка, как у соседей.

                   Насыщенная фиолетовая плита читалась среди мятной и
                   песочной карточек как чужеродная — не «раздел», а
                   баннер. Приглушать её оттенками бесполезно: дело не в
                   том, что она тёмная, а в том, что она единственная
                   залитая цветом во всю площадь. Тот же лавандовый набор,
                   что у остальных разделов, снимает вопрос совсем. */
                Brand.lavenderCard

                Image(systemName: "calendar")
                    .font(.system(size: 104, weight: .black))
                    .foregroundStyle(Brand.lavenderInk.opacity(0.10))
                    .offset(x: 214, y: 20)

                VStack(alignment: .leading, spacing: 6) {
                    Text("365")
                        .font(.system(size: 11, weight: .black, design: .rounded))
                        .tracking(1.4)
                        .foregroundStyle(Brand.lavenderInk.opacity(0.75))
                    Text(L("calendar.title"))
                        .font(.system(size: 25, weight: .bold))
                        .foregroundStyle(Brand.onBoard)
                    Text(L("calendar.lead"))
                        .font(.system(size: 12.5))
                        .foregroundStyle(Brand.boardMuted)
                }
                .padding(18)

                Image(systemName: "arrow.up.right")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Brand.lavenderInk)
                    .frame(width: 35, height: 35)
                    .background(Brand.lavenderInk.opacity(0.12), in: .rect(cornerRadius: 11))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                    .padding(14)
            }
            .frame(height: 148)
            .clipShape(.rect(cornerRadius: 25))
        }
        .buttonStyle(.press)
    }

    private var controlMosaic: some View {
        HStack(spacing: 10) {
            NavigationLink {
                ClientsView().navigationTitle(L("owner.tabClients"))
            } label: {
                VStack(alignment: .leading, spacing: 0) {
                    Image(systemName: "person.2.fill")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(Brand.mintInk)
                    Spacer()
                    Text(L("owner.tabClients"))
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(Brand.mintInk)
                    Text(L("more.clientsLead"))
                        .font(.system(size: 11.5))
                        .foregroundStyle(Brand.mintInk.opacity(0.7))
                        .multilineTextAlignment(.leading)
                }
                .padding(15)
                .frame(maxWidth: .infinity, minHeight: 170, alignment: .leading)
                .background(Brand.mintCard, in: .rect(cornerRadius: 22))
            }
            .buttonStyle(.press)

            VStack(spacing: 10) {
                smallTile(
                    L("settings.tabServices"), "tag.fill",
                    fill: Brand.lavenderCard, ink: Brand.lavenderInk
                ) {
                    ServicesView().navigationTitle(L("settings.services"))
                }
                smallTile(
                    L("expenses.title"), "arrow.down",
                    fill: Brand.sandCard, ink: Brand.sandInk
                ) {
                    ExpensesView().navigationTitle(L("expenses.title"))
                }
            }
            .frame(maxWidth: .infinity)
        }
    }

    private func smallTile<D: View>(
        _ title: String,
        _ symbol: String,
        fill: Color,
        ink: Color,
        @ViewBuilder destination: @escaping () -> D
    ) -> some View {
        NavigationLink {
            destination()
        } label: {
            HStack(spacing: 10) {
                Image(systemName: symbol)
                    .font(.system(size: 14, weight: .semibold))
                Text(title)
                    .font(.system(size: 14, weight: .semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)
                Spacer(minLength: 0)
                Image(systemName: "arrow.up.right")
                    .font(.system(size: 9, weight: .bold))
                    .opacity(0.55)
            }
            .foregroundStyle(ink)
            .padding(13)
            .frame(maxWidth: .infinity, minHeight: 80)
            .background(fill, in: .rect(cornerRadius: 20))
        }
        .buttonStyle(.press)
    }

    /**
     * Только команда.

     * Зарплата отсюда убрана: она уже вкладка в нижней панели, и второй
     * вход в неё из разделов означал, что человек ищет её в двух местах и
     * в одном из них не находит. Раздел показывает то, чего в панели нет.
     */
    private var staffCard: some View {
        NavigationLink {
            StaffView().navigationTitle(L("more.team"))
        } label: {
            HStack(spacing: 11) {
                Image(systemName: "person.2.fill")
                    .font(.system(size: 19, weight: .semibold))
                    .foregroundStyle(Brand.mintInk)
                VStack(alignment: .leading, spacing: 2) {
                    Text(L("more.team"))
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(Brand.onBoard)
                    Text(L("more.teamLead"))
                        .font(.system(size: 11.5))
                        .foregroundStyle(Brand.boardMuted)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(Brand.boardMuted)
            }
            .padding(.horizontal, 15)
            .frame(maxWidth: .infinity, minHeight: 68, alignment: .leading)
            .background(Brand.mintCard, in: .rect(cornerRadius: 22))
        }
        .buttonStyle(.press)
    }

    private var profileCard: some View {
        NavigationLink {
            ProfileView().toolbar(.hidden, for: .navigationBar)
        } label: {
            HStack(spacing: 11) {
                Image(systemName: "person.crop.circle.fill")
                    .font(.system(size: 20))
                    .foregroundStyle(Brand.boardMuted)
                Text(L("more.profileLead"))
                    .font(.system(size: 14.5, weight: .semibold))
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(Brand.boardMuted)
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 54)
            .background(Brand.chipRest, in: .rect(cornerRadius: 17))
        }
        .buttonStyle(.press)
    }

    // ══════════════════════════ выгрузка ══════════════════════════

    /**
     * Выгрузка приходит файлом и отдаётся системе: дальше человек сам
     * решает — отправить себе в почту, положить в «Файлы», открыть в
     * Excel. Приложению не нужно знать, что он с ней сделает.
     *
     * Не плитка и не строка раздела: это единственное на экране действие,
     * а не место, куда переходят. Поэтому тёплая бумага вместо светящейся
     * заливки — тише всего остального, — но марка в ней есть: грейповый
     * квадрат с лаймовой стрелкой. Тем же двухцветием набрана и активная
     * вкладка внизу, так что низ экрана держится одной парой цветов.
     */
    private var exportCard: some View {
        Button {
            Task { await exportCsv() }
        } label: {
            HStack(spacing: 13) {
                /* Лайм по светлой бумаге не виден — контраст 1.06. Поэтому
                   он появляется только внутри тёмного квадрата: это та же
                   лаймовая засечка, что на плитках, просто ей понадобилось
                   принести с собой собственный тёмный фон. */
                Image(systemName: "square.and.arrow.up.fill")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Brand.lime)
                    .frame(width: 38, height: 38)
                    .background(Brand.grapeFill, in: .rect(cornerRadius: 12))

                VStack(alignment: .leading, spacing: 1) {
                    Text(exporting ? L("common.preparing") : L("more.export"))
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Brand.onBoard)
                    Text(L("more.exportLead"))
                        .font(.system(size: 13))
                        .foregroundStyle(Brand.boardMuted)
                }

                Spacer(minLength: 0)

                if exporting {
                    TetrLoader(size: 20, tint: Brand.grape)
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Brand.warmCard, in: .rect(cornerRadius: 22))
            .overlay {
                // кремовая бумага по кремовому полотну без грани теряется
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .strokeBorder(Brand.boardInk.opacity(0.07), lineWidth: 0.8)
            }
        }
        .buttonStyle(.press)
        .disabled(exporting)
        .padding(.top, 4)
    }

    private func exportCsv() async {
        exporting = true
        defer { exporting = false }

        guard let data = try? await session.authed({ token in
            try await APIClient.shared.raw("export?days=30", token: token)
        }) else { return }

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("tetr-\(Int(Date().timeIntervalSince1970)).csv")
        guard (try? data.write(to: url)) != nil else { return }
        exported = url
    }
}

extension URL: @retroactive Identifiable {
    public var id: String { absoluteString }
}

struct ShareSheet: UIViewControllerRepresentable {
    let url: URL

    /// Сохранил файл или передумал.
    ///
    /// Нужно там, где за передачей файла следует необратимое действие:
    /// закрытый крестиком лист обмена не должен считаться сохранением,
    /// иначе человек лишится и данных, и копии.
    var onFinish: ((Bool) -> Void)?

    func makeUIViewController(context: Context) -> UIActivityViewController {
        let controller = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        controller.completionWithItemsHandler = { _, completed, _, _ in onFinish?(completed) }
        return controller
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
