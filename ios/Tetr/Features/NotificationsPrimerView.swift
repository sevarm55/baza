import SwiftUI

/**
 * Подводка к системному запросу уведомлений.
 *
 * ЗАЧЕМ ОНА ВООБЩЕ. Системное окно про уведомления показывается один раз
 * за установку: нажал «Запретить» — и вернуть его можно только через
 * настройки телефона, куда никто не идёт. Поэтому спрашивать вхолодную
 * нельзя: окно без объяснения закрывают отказом не читая, а вместе с ним
 * навсегда закрывается единственный канал, которым мойка сообщает
 * владельцу о деньгах.
 *
 * Этот лист стоит ПЕРЕД системным окном и отвечает на его вопрос заранее:
 * что именно будет приходить и как это выключить. Отказ здесь ничего не
 * сжигает — системное окно просто не показывается, и предложить его можно
 * снова из профиля.
 *
 * ПОКАЗАНИЕ, А НЕ ОБЕЩАНИЕ. Сверху не иконка колокольчика, а само
 * уведомление в том виде, в каком оно придёт на телефон: значок
 * приложения, номер машины заголовком, услуга и сумма под ним. Ровно то
 * же собирает сервер (`lib/orders.ts`, `notifyOwnersInBackground`).
 * Человек видит вещь, о которой его спрашивают, а не рассказ о ней.
 *
 * Числа те же, что на экранах знакомства (`OnboardingHeroes.swift`): те
 * же две машины из демонстрации, 12 000 и 18 000. Продукт про точность в
 * деньгах не имеет права показывать две разные демонстрации.
 *
 * Слов новых здесь три: заголовок, объяснение и «Միացնել». Подписи внутри
 * показания — существующие ключи словаря, уже переведённые на три языка.
 */
struct NotificationsPrimerView: View {
    /// Согласился. Системное окно поднимаем не отсюда, а после того, как
    /// лист уедет: два окна в одном такте наезжают друг на друга.
    let onAllow: () -> Void
    let onSkip: () -> Void

    /* «Уменьшить движение» — не про вкусы: у части людей движение
       вызывает головокружение. Тогда уведомления стоят на месте
       собранными, а не прилетают сверху. */
    @Environment(\.accessibilityReduceMotion) private var calm

    /// Сколько уведомлений уже прилетело. Ноль — сцена пустая.
    @State private var arrived = 0

    /**
     * Высота содержимого.
     *
     * Лист ровно по нему, а не половиной экрана. `.medium` — постоянные
     * 50%, и под кнопками оставалась ладонь пустоты: лист выглядел
     * недогруженным, будто внизу что-то не приехало. Меряем содержимое и
     * отдаём его высоту системе как единственный размер.
     */
    @State private var tall: CGFloat = 0

    /// Высота одной плашки. Меряется, а не назначается: в ней армянский
    /// текст, и при крупном системном шрифте она вырастает.
    @State private var card: CGFloat = 0

    /// Демонстрационная пара: те же машины, что на знакомстве.
    private struct Note: Identifiable {
        let id: Int
        let plate: String
        let price: Int
        let time: String
    }

    private let notes: [Note] = [
        Note(id: 0, plate: "77GG477", price: 18_000, time: "18:41"),
        Note(id: 1, plate: "34SS567", price: 12_000, time: "18:04"),
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                stage
                    /* Читалке экрана показание не отдаём: те же мысли
                       сказаны ниже словами, а выдуманные номер и сумма,
                       прочитанные вслух, — это факты, которых у человека
                       нет. */
                    .accessibilityHidden(true)

                Text(L("push.primeTitle"))
                    .font(.system(size: 26, weight: .bold, design: .rounded))
                    .foregroundStyle(Brand.onBoard)
                    .fixedSize(horizontal: false, vertical: true)
                    /* Показание и слова — две разные части листа, и между
                       ними должно быть видно воздух. Стояли впритык:
                       заголовок читался подписью к нижней плашке, а не
                       началом объяснения. */
                    .padding(.top, 34)

                Text(L("push.primeLead"))
                    .font(.system(size: 15))
                    .lineSpacing(2)
                    .foregroundStyle(Brand.onBoard.opacity(0.82))
                    .fixedSize(horizontal: false, vertical: true)
                    /* Место под хват листа: первые точки занимает он, и плашка,
               поднятая выше, оказывается под ним. */
            .padding(.top, 26)

                Text(L("push.primeBody"))
                    .font(.system(size: 13))
                    .lineSpacing(2)
                    .foregroundStyle(Brand.boardMuted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 14)

                Spacer(minLength: 22)

                /* Пара равных кнопок: одна геометрия, разница только
                   заливкой. Тот же подвал, что у листа приветствия. */
                HStack(spacing: 10) {
                    Button(L("setup.welcomeLook"), action: onSkip)
                        .buttonStyle(QuietButton())

                    Button(L("push.primeAllow"), action: onAllow)
                        .buttonStyle(LimeButton())
                }
                .padding(.top, 22)
            }
            .padding(.horizontal, 16)
            /* Место под хват листа: первые точки занимает он, и плашка,
               поднятая выше, оказывается под ним. */
            .padding(.top, 26)
            .padding(.bottom, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { tall = $0 }
        }
        .background(Brand.board.ignoresSafeArea())
        /* Пока содержимое не измерено, размера нет вовсе: половина экрана
           на один кадр и тут же прыжок к своей высоте читались бы
           дёрганьем листа при открытии. Место под полосу домой система
           добавляет к детенту сама, прибавлять его второй раз значит
           оставить под кнопками ту же пустоту, из-за которой всё и
           затевалось. */
        .presentationDetents(tall > 0 ? [.height(tall)] : [.medium])
        .presentationDragIndicator(.visible)
        .task { await play() }
    }

    // ══════════════════════════ показание ══════════════════════════

    /// Место под уведомления. Высота постоянная: без неё лист подрастает
    /// в момент прилёта второго, и текст под ним уезжает вниз на глазах.
    /// На сколько прошлая плашка опущена относительно свежей.
    private let tuck: CGFloat = 84

    private var stage: some View {
        ZStack(alignment: .top) {
            /* Обратный порядок — это z-порядок, а не список: прошлая
               запись рисуется первой и оказывается ПОД свежей. Нарисованная
               поверх, она накрывала свежую нижним краем, и стопка читалась
               задом наперёд. */
            ForEach(notes.reversed()) { note in
                banner(note)
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height in
                        if note.id == 0 { card = height }
                    }
                    .offset(y: place(note))
                    .scaleEffect(scale(note), anchor: .top)
                    .opacity(shown(note) ? 1 : 0)
                    .blur(radius: calm || shown(note) ? 0 : 10)
                    .animation(
                        .spring(response: 0.44, dampingFraction: 0.82),
                        value: arrived
                    )
            }
        }
        /* Высота сцены считается по плашке, а не назначается числом:
           заданная на глаз, она оказывалась ниже стопки, плашка вылезала
           за неё и съедала отступ до заголовка. `alignment` обязателен —
           без него рамка центрует стопку и тот же отступ уезжает вверх. */
        .frame(maxWidth: .infinity, alignment: .top)
        .frame(height: card > 0 ? card + tuck : nil, alignment: .top)
    }

    /**
     * Уведомление в системном виде.
     *
     * Собрано по раскладке банера iOS, а не «в духе»: значок слева,
     * имя приложения прописными и время в одной строке, заголовок,
     * подпись. Узнаваемость здесь и есть смысл показания: человек должен
     * увидеть ту самую плашку, которая появится у него наверху экрана.
     */
    private func banner(_ note: Note) -> some View {
        HStack(spacing: 11) {
            Image("IconPreviewDefault")
                .resizable()
                .frame(width: 38, height: 38)
                .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(verbatim: "TETRIN")
                        .font(.system(size: 10, weight: .bold))
                        .tracking(1.1)
                        .foregroundStyle(Brand.boardMuted)

                    Spacer(minLength: 4)

                    Text(note.time)
                        .font(.system(size: 10, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(Brand.boardMuted)
                }

                Text(note.plate)
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Brand.onBoard)

                /* Кто мыл машину — тем же порядком, что в настоящем
                   уведомлении (`lib/orders.ts`): услуга, сумма, имя.
                   Показание, в котором имени нет, а в жизни оно есть,
                   обещает меньше, чем продукт делает. */
                Text("\(L("services.namePlaceholder")) · \(money(note.price)) · \(L("staff.namePlaceholder"))")
                    .font(.system(size: 13))
                    .monospacedDigit()
                    .foregroundStyle(Brand.onBoard.opacity(0.75))
                    /* Две строки, как в системном баннере: армянская
                       строка с именем в один ряд не всегда помещается, а
                       обрезанное многоточием имя — ровно тот факт, ради
                       которого строку и удлинили. */
                    .lineLimit(2)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white, in: .rect(cornerRadius: 20, style: .continuous))
        .shadow(color: Brand.grapeDeep.opacity(0.16), radius: 18, y: 8)
        /* Внутри принудительно светлая тема, как у карточек знакомства:
           уведомление на телефоне белое при любой теме продукта. */
        .environment(\.colorScheme, .light)
    }

    /// Прилетело ли это уведомление. Второе (`id` 1) приходит первым и
    /// уезжает вниз, когда сверху ложится свежее.
    private func shown(_ note: Note) -> Bool {
        arrived >= notes.count - note.id
    }

    /// Где стоит плашка. Свежая сверху, прошлая под ней и чуть уже:
    /// так стопка читается глубиной, а не двумя одинаковыми строками.
    private func place(_ note: Note) -> CGFloat {
        guard shown(note) else { return -26 }

        return note.id == 0 ? 0 : tuck
    }

    private func scale(_ note: Note) -> CGFloat {
        guard shown(note) else { return 0.96 }
        return note.id == 0 ? 1 : 0.94
    }

    /// Прилёт: сначала прошлая запись, следом свежая ложится сверху.
    private func play() async {
        guard !calm else { arrived = notes.count; return }

        try? await Task.sleep(for: .milliseconds(320))
        arrived = 1
        try? await Task.sleep(for: .milliseconds(620))
        arrived = 2
    }
}

/// Показывали ли на этом телефоне подводку к уведомлениям.
///
/// Хранится на устройстве, а не на сервере: разрешение принадлежит
/// телефону, и на новом его спрашивают заново. Отказ здесь запоминается
/// навсегда — второй раз тот же лист был бы уговариванием; включить
/// уведомления после отказа можно переключателем в профиле.
enum PushPrimer {
    private static let key = "tetr.push.primed"

    static var seen: Bool {
        get { UserDefaults.standard.bool(forKey: key) }
        set { UserDefaults.standard.set(newValue, forKey: key) }
    }
}
