import SwiftUI

/**
 * Разделы, в которые заходят редко.
 *
 * Не системный список строк, а сетка плиток — как на домашнем экране
 * телефона. Список из шести одинаковых строк заставляет читать все шесть
 * подряд; в сетке нужное находится по цвету и месту раньше, чем прочитано
 * название, а заходят сюда именно за конкретной вещью, а не «посмотреть,
 * что есть».
 *
 * Рисунков на плитках больше нет. Стояли трёхмерные наклейки — машина,
 * календарь, мойщик, — и каждая была нарисована в своей манере: разный
 * свет, разная перспектива, разная степень глянца. Шесть таких рядом
 * читались не набором разделов, а витриной случайных иллюстраций и
 * спорили со стеклом, поверх которого лежали. Плитку держат цвет и слово.
 *
 * Отдельной вкладкой, а не пунктами в панели: вкладок должно быть столько,
 * сколько экранов открывают каждый день. Прайс правят раз в месяц — ему там
 * не место.
 */
struct MoreView: View {
    @EnvironmentObject private var session: Session

    @State private var exporting = false
    @State private var exported: URL?

    private let gap: CGFloat = 10

    var body: some View {
        ScrollView {
            VStack(spacing: gap) {
                /* Точки — во всю ширину и первыми. Не из важности, а из
                   смысла: они отвечают, О КАКОЙ мойке всё остальное на
                   этом экране. Половинной плиткой в ряду это читалось бы
                   как ещё один раздел наравне с расходами.

                   У кого мойка одна — плитки нет вовсе. Рассказывать ему
                   про точки значит объяснять устройство, которого он не
                   просил. */
                if session.canSwitch {
                    wide(.slate, "Իմ մասնաճյուղերը", subtitle) {
                        PointsView().navigationTitle("Իմ մասնաճյուղերը")
                    }
                }

                HStack(spacing: gap) {
                    tile(.violet, "Օրացույց", "պատմություն") {
                        CalendarView().toolbar(.hidden, for: .navigationBar)
                    }
                    tile(.teal, "Հաճախորդներ", "ովքեր են վերադառնում") {
                        ClientsView().navigationTitle("Հաճախորդներ")
                    }
                }

                HStack(spacing: gap) {
                    tile(.amber, session.tenant?.staffRole ?? "Աշխատակիցներ", "և տոկոսները") {
                        StaffView().navigationTitle(session.tenant?.staffRole ?? "Աշխատակիցներ")
                    }
                    tile(.lime, "Ծառայություններ", "և գները") {
                        ServicesView().navigationTitle("Ծառայություններ և գներ")
                    }
                }

                HStack(spacing: gap) {
                    tile(.slate, "Ծախսեր", "վարձ, ջուր, քիմիա") {
                        ExpensesView().navigationTitle("Ծախսեր")
                    }
                    tile(.slate, "Պրոֆիլ", "անուն, PIN, մուտք") {
                        ProfileView().toolbar(.hidden, for: .navigationBar)
                    }
                }

                exportRow
            }
            .padding(.horizontal, 12)
            .padding(.top, 8)
            .padding(.bottom, 28)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.board.ignoresSafeArea())
        .sheet(item: $exported) { url in
            ShareSheet(url: url)
        }
    }

    /// Сколько точек и сколько из них ждут денег — то, ради чего сюда
    /// заходят, видно ещё до нажатия.
    private var subtitle: String {
        let all = session.points.count
        let closed = session.points.filter { !$0.canRead }.count
        return closed == 0
            ? "\(all) մասնաճյուղ · բոլորը բաց են"
            : "\(all) մասնաճյուղ · \(closed) սպասում է վճարման"
    }

    /// Плитка во всю ширину: та же, только ниже, и заголовок крупнее.
    private func wide<D: View>(
        _ tone: Tone,
        _ title: String,
        _ note: String,
        @ViewBuilder destination: @escaping () -> D
    ) -> some View {
        NavigationLink {
            destination()
        } label: {
            ZStack(alignment: .topTrailing) {
                VStack(alignment: .leading, spacing: 0) {
                    Spacer(minLength: 0)
                    Text(title)
                        .font(.system(size: 18, weight: .bold))
                    Text(note)
                        .font(.system(size: 12))
                        .opacity(0.72)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
                .foregroundStyle(tone.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(16)
            .frame(height: 116, alignment: .bottomLeading)
            .frame(maxWidth: .infinity)
            .glassEffect(.regular.tint(tone.base.opacity(0.72)).interactive(),
                         in: .rect(cornerRadius: 26))
        }
        .buttonStyle(.press)
    }

    /**
     * Плитка раздела.
     *
     * Настоящее liquid glass, подкрашенное тоном раздела, а не сплошная
     * заливка. Разница здесь не косметическая: стекло преломляет то, что под
     * ним, поэтому шесть плиток подряд перестают быть шестью плоскими
     * прямоугольниками и получают глубину.
     */
    private func tile<D: View>(
        _ tone: Tone,
        _ title: String,
        _ note: String,
        @ViewBuilder destination: @escaping () -> D
    ) -> some View {
        NavigationLink {
            destination()
        } label: {
            ZStack(alignment: .topTrailing) {
                VStack(alignment: .leading, spacing: 0) {
                    Spacer(minLength: 0)
                    Text(title)
                        .font(.system(size: 16, weight: .bold))
                        .lineLimit(2)
                        .minimumScaleFactor(0.75)
                        .multilineTextAlignment(.leading)
                    Text(note)
                        .font(.system(size: 11.5))
                        .opacity(0.72)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
                .foregroundStyle(tone.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(16)
            .frame(height: 148, alignment: .bottomLeading)
            .frame(maxWidth: .infinity)
            /* Стекло ставится ПОСЛЕ всех модификаторов вида и обрезает
               содержимое само. Обрезать отдельно нельзя: `clipShape` над
               стеклом растрирует задник, и преломление вырождается в
               плоский фрост. */
            .glassEffect(.regular.tint(tone.base.opacity(0.72)).interactive(),
                         in: .rect(cornerRadius: 26))
        }
        .buttonStyle(.press)
    }

    /// Выгрузка приходит файлом и отдаётся системе: дальше человек сам
    /// решает — отправить себе в почту, положить в «Файлы», открыть в
    /// Excel. Приложению не нужно знать, что он с ней сделает.
    private var exportRow: some View {
        Button {
            Task { await exportCsv() }
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "square.and.arrow.up.fill")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Brand.grape)
                VStack(alignment: .leading, spacing: 1) {
                    Text(exporting ? "Պատրաստվում է…" : "Ներբեռնել 30 օրվա տվյալները")
                        .font(.system(size: 14.5, weight: .semibold))
                        .foregroundStyle(Brand.onBoard)
                    Text("Ձեր տվյալները ձերն են՝ ցանկացած պահի")
                        .font(.system(size: 11.5))
                        .foregroundStyle(Brand.boardMuted)
                }
                Spacer(minLength: 0)
                if exporting {
                    TetrLoader(size: 20, tint: Brand.grape)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 22))
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
