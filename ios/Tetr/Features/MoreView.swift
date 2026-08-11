import SwiftUI

/**
 * Разделы, в которые заходят редко.
 *
 * Не системный список строк, а сетка плиток — как на домашнем экране
 * телефона. Список одинаковых строк заставляет читать их все подряд; в
 * сетке нужное находится по цвету и месту раньше, чем прочитано название,
 * а заходят сюда именно за конкретной вещью, а не «посмотреть, что есть».
 *
 * ЧЕТЫРЕ, А НЕ ШЕСТЬ. Шесть равных плиток — это не сетка, а таблица: у
 * шести ячеек нет старшей, и выбор снова превращается в чтение всех
 * подряд. Здесь наверху четыре раздела, в которые заходят за данными
 * (день, клиенты, прайс, расходы), ниже отдельной группой «Կառավարում» —
 * два, в которые заходят настроить (люди и свой профиль). Разница между
 * группами показана не только заголовком, но и формой: наверху квадраты,
 * ниже широкие строки. Форма считывается до слов.
 *
 * ОДНА СЕМЬЯ, А НЕ ШЕСТЬ ЦВЕТОВ. У всех плиток одно устройство: очень
 * тёмная насыщенная база, свет из правого верхнего угла, второй источник
 * снизу слева соседним оттенком, кромка стекла по верхней грани, крупный
 * полупрозрачный знак в углу и лаймовая засечка над заголовком. Цвет
 * меняется, приём — нет; поэтому шесть плиток читаются набором приборов
 * одной панели, а не витриной случайных карточек.
 *
 * ЗНАК МЕНЬШЕ ТЕКСТА. Знак был вдвое крупнее и перетягивал плитку на себя:
 * первым читался процент или тег, а не слово. Уменьшен примерно на треть —
 * он остался тем, чем должен быть: весом и направлением, а не содержанием.
 *
 * Отдельной вкладкой, а не пунктами в панели: вкладок должно быть столько,
 * сколько экранов открывают каждый день. Прайс правят раз в месяц — ему
 * там не место.
 */
struct MoreView: View {
    @EnvironmentObject private var session: Session

    @State private var exporting = false
    @State private var exported: URL?

    private let gap: CGFloat = 12

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: gap) {
                header

                /* Точки — во всю ширину и первыми. Не из важности, а из
                   смысла: они отвечают, О КАКОЙ мойке всё остальное на
                   этом экране, и стоят до разделов ровно поэтому. Тон
                   графитовый, знак тише: это не седьмой раздел, а рамка,
                   в которой читаются остальные шесть.

                   У кого мойка одна — плитки нет вовсе. Рассказывать ему
                   про точки значит объяснять устройство, которого он не
                   просил. */
                if session.canSwitch {
                    row(.slate, "Իմ մասնաճյուղերը", points, symbol: "building.2.fill", height: 88) {
                        PointsView().navigationTitle("Իմ մասնաճյուղերը")
                    }
                }

                HStack(spacing: gap) {
                    tile(.violet, "Օրացույց", "օրվա և ամսվա տվյալներ", symbol: "calendar") {
                        CalendarView().toolbar(.hidden, for: .navigationBar)
                    }
                    tile(.teal, "Հաճախորդներ", "այցեր և պատմություն", symbol: "person.2.fill") {
                        ClientsView().navigationTitle("Հաճախորդներ")
                    }
                }

                HStack(spacing: gap) {
                    tile(.lime, "Ծառայություններ", "ծառայություններ և գներ", symbol: "tag.fill") {
                        ServicesView().navigationTitle("Ծառայություններ և գներ")
                    }
                    /* Стрелка без круга. Залитый кружок читался розовым
                       блином на пол-плитки — фигурой, а не знаком; голая
                       стрелка тем же размером весит вчетверо меньше и
                       говорит ровно то же самое. */
                    tile(.rose, "Ծախսեր", "բոլոր ծախսերը", symbol: "arrow.down", size: 92) {
                        ExpensesView().navigationTitle("Ծախսեր")
                    }
                }

                group("Կառավարում")

                /* Название роли приходит с сервера: на мойке это мойщики,
                   у барбера мастера. Слово «Աշխատակիցներ» — только запасное. */
                row(
                    .amber,
                    session.tenant?.staffRole ?? "Աշխատակիցներ",
                    "վճարումներ և տոկոսներ",
                    symbol: "percent"
                ) {
                    StaffView().navigationTitle(session.tenant?.staffRole ?? "Աշխատակիցներ")
                }

                row(.indigo, "Պրոֆիլ", "անձնական տվյալներ և PIN", symbol: "person.crop.circle.fill") {
                    ProfileView().toolbar(.hidden, for: .navigationBar)
                }

                exportCard
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
            Text("Ավելին")
                .font(.system(size: 32, weight: .bold))
                .foregroundStyle(Brand.onBoard)
            Text("Կառավարեք ձեր ավտոլվացումը")
                .font(.system(size: 13.5))
                .foregroundStyle(Brand.boardMuted)
        }
        .padding(.horizontal, 4)
        .padding(.bottom, 2)
    }

    /// Заголовок второй группы. Тише плиток настолько, насколько возможно:
    /// его работа — разделить, а не быть прочитанным.
    private func group(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(Brand.boardMuted)
            .padding(.horizontal, 4)
            .padding(.top, 12)
    }

    /// Сколько точек и сколько из них ждут денег — то, ради чего сюда
    /// заходят, видно ещё до нажатия.
    private var points: String {
        let all = session.points.count
        let closed = session.points.filter { !$0.canRead }.count
        return closed == 0
            ? "\(all) մասնաճյուղ · բոլորը բաց են"
            : "\(all) մասնաճյուղ · \(closed) սպասում է վճարման"
    }

    // ══════════════════════════ плитки ══════════════════════════

    /* Поверхность, знак и засечка живут в `Theme.swift`: тот же приём
       собирает плитки на сводке, и двум копиям одного градиента в разных
       файлах разъехаться — вопрос одной правки.

       Наружу знак уходит только вправо. Вверх нельзя: `interactive()` на
       нажатии поджимает форму стекла, а она же обрезает содержимое. */

    /**
     * Квадратная плитка раздела.
     *
     * Текст прижат к низу слева на всех четырёх — глаз идёт по одной
     * линии и не ищет заголовок заново в каждой ячейке.
     *
     * Кегль и поля подобраны под самое длинное слово, а не под среднее.
     * «Ծառայություններ» — пятнадцать букв и ни одного места для переноса:
     * в половине ширины оно единственное упирается в край, и `minimumScaleFactor`
     * жмёт его одно, оставляя соседей крупными. Разнокалиберные заголовки
     * в сетке из четырёх ячеек видно сразу — это читается небрежностью, а
     * не заботой. Поэтому 18 пунктов и поля в 15: при них длинное слово
     * встаёт целиком, и все четыре набраны одним кеглем.
     */
    private func tile<D: View>(
        _ tone: Tone,
        _ title: String,
        _ note: String,
        symbol: String,
        /* Размер знака оптический, а не одинаковый: залитая фигура из
           четырёх человек и голая стрелка одного кегля весят по-разному.
           Ровняем по тому, сколько знак занимает глазом. */
        size: CGFloat = 74,
        @ViewBuilder destination: @escaping () -> D
    ) -> some View {
        NavigationLink {
            destination()
        } label: {
            ZStack(alignment: .topTrailing) {
                ToneMark(symbol: symbol, tone: tone, size: size, offset: CGSize(width: 14, height: -6))

                VStack(alignment: .leading, spacing: 0) {
                    Spacer(minLength: 0)
                    ToneAccent(tone: tone).padding(.bottom, 9)
                    Text(title)
                        .font(.system(size: 18, weight: .bold))
                        .lineLimit(2)
                        .minimumScaleFactor(0.85)
                        .multilineTextAlignment(.leading)
                    Text(note)
                        .font(.system(size: 13))
                        .opacity(0.72)
                        .lineLimit(2)
                        .minimumScaleFactor(0.8)
                        .multilineTextAlignment(.leading)
                        .padding(.top, 2)
                }
                .foregroundStyle(tone.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(15)
            .frame(height: 158, alignment: .bottomLeading)
            .frame(maxWidth: .infinity)
            .auroraTile(tone, radius: 26)
        }
        .buttonStyle(.press)
    }

    /**
     * Широкая строка: то же устройство, но спокойнее.
     *
     * Спокойнее не серостью, а светом: главное пятно растянуто вдвое и
     * оттого мягче, второй источник и знак приглушены. Цвет остаётся
     * полным — это по-прежнему часть набора, просто в ней нет события.
     * Знак стоит справа по центру, а не в углу: строка низкая, и в углу
     * он налезал бы на кромку.
     */
    private func row<D: View>(
        _ tone: Tone,
        _ title: String,
        _ note: String,
        symbol: String,
        height: CGFloat = 92,
        @ViewBuilder destination: @escaping () -> D
    ) -> some View {
        NavigationLink {
            destination()
        } label: {
            ZStack(alignment: .trailing) {
                ToneMark(symbol: symbol, tone: tone, size: 62, offset: CGSize(width: 12, height: 0), calm: true)

                VStack(alignment: .leading, spacing: 0) {
                    ToneAccent(tone: tone).padding(.bottom, 9)
                    Text(title)
                        .font(.system(size: 18, weight: .bold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                    Text(note)
                        .font(.system(size: 13))
                        .opacity(0.72)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                        .padding(.top, 1)
                }
                .foregroundStyle(tone.ink)
                // знаку оставлена его четверть: без этого длинное армянское
                // название доезжает до символа и жмётся об него
                .padding(.trailing, 64)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(17)
            .frame(height: height, alignment: .leading)
            .frame(maxWidth: .infinity)
            .auroraTile(tone, radius: 24, calm: true)
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
                    Text(exporting ? "Պատրաստվում է…" : "Արտահանել տվյալները")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Brand.onBoard)
                    Text("վերջին 30 օրը")
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
