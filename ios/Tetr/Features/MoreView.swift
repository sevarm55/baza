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
 * Вместо трёхмерных наклеек — крупный системный знак в углу. Наклейки
 * развалили экран не тем, что они картинки, а тем, что каждая была
 * нарисована сама по себе: разный свет, перспектива, глянец, а мойщик
 * ещё и мультяшный. Шесть таких рядом читались витриной случайных
 * клипартов и спорили со стеклом, поверх которого лежали.
 *
 * У системного набора одна рука на всех, поэтому согласованность
 * получается сама. Знак взят вдвое крупнее обычного и приглушён до
 * подложки: он не опознаёт раздел — для этого есть слово, — а даёт
 * плитке вес, чтобы шесть прямоугольников не читались таблицей.
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
                    wide(.slate, "Իմ մասնաճյուղերը", subtitle, symbol: "building.2.fill") {
                        PointsView().navigationTitle("Իմ մասնաճյուղերը")
                    }
                }

                HStack(spacing: gap) {
                    tile(.violet, "Օրացույց", "պատմություն", symbol: "calendar") {
                        CalendarView().toolbar(.hidden, for: .navigationBar)
                    }
                    tile(.teal, "Հաճախորդներ", "ովքեր են վերադառնում", symbol: "person.2.fill") {
                        ClientsView().navigationTitle("Հաճախորդներ")
                    }
                }

                HStack(spacing: gap) {
                    tile(.amber, session.tenant?.staffRole ?? "Աշխատակիցներ", "և տոկոսները", symbol: "percent") {
                        StaffView().navigationTitle(session.tenant?.staffRole ?? "Աշխատակիցներ")
                    }
                    tile(.lime, "Ծառայություններ", "և գները", symbol: "tag.fill") {
                        ServicesView().navigationTitle("Ծառայություններ և գներ")
                    }
                }

                HStack(spacing: gap) {
                    tile(.rose, "Ծախսեր", "վարձ, ջուր, քիմիա", symbol: "arrow.down.circle.fill") {
                        ExpensesView().navigationTitle("Ծախսեր")
                    }
                    tile(.indigo, "Պրոֆիլ", "անուն, PIN, մուտք", symbol: "person.crop.circle.fill") {
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

    /**
     * Знак раздела — крупно, в угол, наполовину за краем.
     *
     * Это не иконка в привычном смысле: её не разглядывают и по ней не
     * опознают раздел — для этого есть слово. Она задаёт плитке вес и
     * направление, чтобы шесть прямоугольников не читались таблицей.
     * Поэтому размер вдвое больше обычного значка, а прозрачность такая,
     * что знак остаётся частью заливки, а не лежит на ней предметом.
     *
     * Взяты системные символы, а не рисунки. Прежние наклейки развалили
     * экран именно тем, что каждая была нарисована сама по себе: разный
     * свет, перспектива, глянец. У системного набора одна рука на всех,
     * и согласованность получается сама, а не поддерживается вручную.
     * Плюс он векторный: не весит ничего и не мылится ни на одном экране.
     *
     * Наружу только вправо. Вверх нельзя: `interactive()` на нажатии
     * поджимает форму стекла, а она же обрезает содержимое.
     */
    private func mark(_ symbol: String, tone: Tone, size: CGFloat, offset: CGSize) -> some View {
        Image(systemName: symbol)
            .font(.system(size: size, weight: .medium))
            /* Цветом свечения плитки, а не серым. Раньше знак красился
               чернилами (`ink`) — белым или почти чёрным, — и на любой
               заливке выходило блёклое серое пятно, похожее на заглушку.
               `glow` — тот же свет, что льётся из угла, поэтому знак
               становится его частью, а не предметом поверх. */
            .foregroundStyle(tone.glow.opacity(0.34))
            .offset(x: offset.width, y: offset.height)
            .accessibilityHidden(true)
    }

    /**
     * Заливка плитки: плотный тон и свет из угла.
     *
     * Было стекло, подкрашенное тоном на 0.72, — и цвет выцветал: стекло
     * подмешивает к нему то, что под ним, а под ним светлое полотно.
     * Здесь заливка своя и непрозрачная, а глубину даёт не материал, а
     * свечение — тот же приём, что у плиток на сводке и на экране смены.
     * Это язык приложения: плитка не карточка, а прибор, и он горит.
     */
    private func fill(_ tone: Tone, radius: CGFloat) -> some View {
        ZStack(alignment: .topTrailing) {
            tone.base
            RadialGradient(
                colors: [tone.glow.opacity(0.55), tone.glow.opacity(0)],
                center: .topTrailing,
                startRadius: 2,
                endRadius: 150
            )
        }
        .clipShape(.rect(cornerRadius: radius))
    }

    /// Плитка во всю ширину: та же, только ниже, и заголовок крупнее.
    private func wide<D: View>(
        _ tone: Tone,
        _ title: String,
        _ note: String,
        symbol: String,
        @ViewBuilder destination: @escaping () -> D
    ) -> some View {
        NavigationLink {
            destination()
        } label: {
            ZStack(alignment: .topTrailing) {
                mark(symbol, tone: tone, size: 96, offset: CGSize(width: 14, height: -10))

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
            .background { fill(tone, radius: 26) }
            // заливка, в отличие от стекла, содержимое не обрезает:
            // без этого знак вылезает за угол плитки
            .clipShape(.rect(cornerRadius: 26))
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
        symbol: String,
        @ViewBuilder destination: @escaping () -> D
    ) -> some View {
        NavigationLink {
            destination()
        } label: {
            ZStack(alignment: .topTrailing) {
                mark(symbol, tone: tone, size: 108, offset: CGSize(width: 20, height: -14))

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
            .background { fill(tone, radius: 26) }
            // заливка, в отличие от стекла, содержимое не обрезает:
            // без этого знак вылезает за угол плитки
            .clipShape(.rect(cornerRadius: 26))
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
