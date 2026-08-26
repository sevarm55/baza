import SwiftUI

/// Четыре экрана о том, как продукт считает деньги.
///
/// Показывается владельцу один раз, после первого входа. Не мойщику: он
/// открывает приложение, чтобы записать машину, и объяснять ему устройство
/// зарплаты и расходов — значит задержать человека, у которого на площадке
/// стоит клиент.
///
/// ЭКРАН УСТРОЕН КАК СМЕНА КАДРОВ, А НЕ КАК ЛИСТАЛКА. Здесь был `TabView` с
/// четырьмя картинками: человек тянул их пальцем, картинки ехали вбок, и
/// всё вместе читалось стопкой слайдов, которую пролистывают не читая.
/// Теперь кадр уходит целиком, сцена долю секунды стоит пустой, и новый
/// собирается по частям — показание, потом заголовок, потом объяснение.
/// Пауза и порядок и делают из четырёх экранов рассказ.
///
/// Картинок больше нет вовсе. Вместо них показания, собранные из настоящих
/// видов продукта (`OnboardingHeroes.swift`): строка ленты той же вёрстки,
/// та же полоса разреза денег, тот же значок оплаты. Нарисованный кошелёк
/// рассказывал ПРО приложение, стоя снаружи него; строка ленты показывает
/// само приложение за секунду до того, как владелец впервые его откроет.
///
/// Текст по-прежнему рисуется здесь, а не впечён в картинку: впечённый
/// нельзя ни перевести, ни увеличить вместе с системным шрифтом.
struct OnboardingView: View {
    let onDone: () -> Void

    /* Системная настройка «уменьшить движение» — не про вкусы: у части
       людей движение вызывает головокружение. Тогда кадры просто
       сменяются, а показания стоят собранными. */
    @Environment(\.accessibilityReduceMotion) private var calm

    /// Какой кадр сейчас нарисован.
    @State private var page = 0

    /// Какой кадр человек выбрал. Отличается от `page` те триста
    /// миллисекунд, пока старый кадр уходит: точки и подпись кнопки
    /// переключаются в момент нажатия, а не после паузы. Палец обязан
    /// получить ответ сразу, даже если сцена ещё меняется.
    @State private var mark = 0

    /// Такт, в котором стоит содержимое сцены.
    @State private var beat: Beat = .waiting

    /// Идём назад: кадр уходит вправо, вслед за пальцем.
    @State private var back = false

    /// Смена кадра уже идёт. Второе нажатие в эту секунду сбило бы
    /// последовательность и оставило сцену пустой.
    @State private var moving = false

    /// Разгорание фонового света.
    @State private var bloom = false

    private struct Slide: Identifiable {
        let id: Int
        let title: String
        let text: String
    }

    private let slides: [Slide] = [
        Slide(id: 0, title: L("onboarding.s1Title"), text: L("onboarding.s1Body")),
        Slide(id: 1, title: L("onboarding.s2Title"), text: L("onboarding.s2Body")),
        Slide(id: 2, title: L("onboarding.s3Title"), text: L("onboarding.s3Body")),
        Slide(id: 3, title: L("onboarding.s4Title"), text: L("onboarding.s4Body")),
    ]

    /// Высота места под показание.
    ///
    /// Одна на все четыре, хотя карточки разной высоты. Иначе заголовок
    /// стоит на каждом кадре на своей строке и прыгает при переходе — а
    /// прыгающий заголовок читается как перезагрузка экрана.
    private let stage: CGFloat = 280

    var body: some View {
        ZStack {
            Brand.grapeDeep.ignoresSafeArea()

            /* Тот же свет, что на заставке запуска: приложение открылось
               им, и знакомство продолжается в нём же. Перед приходом
               кадра свет коротко разгорается — то есть сцена освещается
               ДО того, как на неё что-то ставят. */
            Brand.splashGlow
                .ignoresSafeArea()
                .scaleEffect(bloom ? 1.14 : 1)
                .opacity(bloom ? 1 : 0.85)
                .animation(.easeOut(duration: 0.55), value: bloom)

            /* Пустое место копится в ОДНОМ месте — между объяснением и
               кнопкой. Пока в стопке стояло три гибких промежутка, они
               делили остаток поровну, и половина экрана уходила в дыру
               между показанием и заголовком: кадр разваливался на две
               несвязанные половины. Всё, что выше кнопки, стоит теперь
               на постоянных расстояниях и читается одним блоком. */
            VStack(alignment: .leading, spacing: 0) {
                exit
                    .frame(height: 34)

                hero
                    .frame(height: stage, alignment: .top)
                    .padding(.top, 12)
                    /* Читалке экрана показание не отдаём. Оно
                       демонстрационное: те же мысли сказаны заголовком и
                       абзацем под ним словами, а озвученные подряд
                       выдуманные номера и суммы — это полминуты чтения
                       вслух того, чего у человека нет. */
                    .accessibilityHidden(true)

                words
                    .padding(.top, 22)

                Spacer(minLength: 24)

                controls
            }
            .padding(.horizontal, 24)
        }
        .environment(\.revealBack, back)
        .contentShape(Rectangle())
        /* Жест остаётся: кадры сменяются кнопкой, но рука на четвёртом
           экране продукта уже привыкла листать, и экран, который не
           отвечает на свайп, читается зависшим. `simultaneousGesture`,
           чтобы не отбирать касание у кнопки под пальцем. */
        .simultaneousGesture(
            DragGesture(minimumDistance: 22)
                .onEnded { drag in
                    if drag.translation.width < -50 {
                        go(to: mark + 1, back: false)
                    } else if drag.translation.width > 50 {
                        go(to: mark - 1, back: true)
                    }
                }
        )
        .preferredColorScheme(.dark)
        .task {
            /* Первый кадр собирается не сразу: лист онбординга сам
               приезжает снизу примерно треть секунды, и приход
               содержимого поверх едущего листа — два движения в одном
               кадре. Ждём, пока лист встанет. */
            if !calm {
                try? await Task.sleep(for: .milliseconds(260))
            }
            beat = .here
        }
    }

    /// Выход есть на каждом экране. Онбординг, из которого нельзя выйти,
    /// — это не объяснение, а препятствие: человек уже завёл бизнес и
    /// хочет работать.
    private var exit: some View {
        HStack {
            Spacer(minLength: 0)
            Button(L("common.skip")) { onDone() }
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.white.opacity(0.7))
        }
    }

    @ViewBuilder
    private var hero: some View {
        switch page {
        case 0: RecordHero(beat: beat)
        case 1: PayrollHero(beat: beat)
        case 2: SplitHero(beat: beat)
        default: ExportHero(beat: beat)
        }
    }

    private var words: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(slides[page].title)
                .font(.system(size: 27, weight: .bold))
                .foregroundStyle(.white)
                .fixedSize(horizontal: false, vertical: true)
                .reveal(beat, step: 4)

            Text(slides[page].text)
                .font(.system(size: 15))
                .lineSpacing(3)
                .foregroundStyle(.white.opacity(0.76))
                .fixedSize(horizontal: false, vertical: true)
                .reveal(beat, step: 5)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Точки и кнопка. В смене кадра не участвуют вовсе: это не
    /// содержимое рассказа, а место, откуда им управляют.
    private var controls: some View {
        VStack(spacing: 18) {
            HStack(spacing: 7) {
                ForEach(slides) { slide in
                    Capsule()
                        .fill(slide.id == mark ? Brand.lime : Color.white.opacity(0.28))
                        // текущая точка вытягивается в чёрточку: так видно
                        // не только «где я», но и «сколько осталось»
                        .frame(width: slide.id == mark ? 20 : 7, height: 7)
                }
            }
            .animation(.spring(response: 0.35, dampingFraction: 0.8), value: mark)

            Button(mark == slides.count - 1 ? L("common.start") : L("common.next")) {
                go(to: mark + 1, back: false)
            }
            .buttonStyle(LimeButton())
        }
        .frame(maxWidth: .infinity)
        .padding(.bottom, 28)
    }

    /**
     * Смена кадра.
     *
     * Три шага и пауза между ними. Уход, пустая сцена, приход по очереди
     * — порядок ровно тот, в котором это видит человек, и написан он
     * подряд, а не разложен по обработчикам анимаций.
     *
     * `page` меняется В ОДИН ТАКТ с `beat = .waiting`: новое показание
     * обязано появиться уже спрятанным. Поменяй мы их порознь, сцена
     * успела бы моргнуть собранным кадром между двумя переходами.
     */
    private func go(to next: Int, back: Bool) {
        guard !moving else { return }
        guard next >= 0 else { return }
        guard next < slides.count else { onDone(); return }

        mark = next
        self.back = back

        guard !calm else {
            page = next
            return
        }

        moving = true
        beat = .leaving
        bloom = true

        Task { @MainActor in
            try? await Task.sleep(for: .seconds(Motion.fast) + Motion.beatGap)
            beat = .waiting
            page = next

            /* Один кадр на то, чтобы SwiftUI успел построить спрятанное
               показание. Без этой паузы приход и постройка попадают в
               одну транзакцию, и очередь не отыгрывается вовсе. */
            try? await Task.sleep(for: .milliseconds(20))
            beat = .here
            bloom = false
            moving = false
        }
    }
}

/// Показывали ли на этом устройстве приветственные слайды.
///
/// Это не практическое обучение аккаунта: его состояние хранит сервер в
/// `Session.welcomeSeen`. Слайды знакомят именно с мобильным приложением,
/// поэтому после смены телефона их можно увидеть снова.
enum Onboarding {
    private static let key = "tetr.onboarding.seen"

    static var seen: Bool {
        get { UserDefaults.standard.bool(forKey: key) }
        set { UserDefaults.standard.set(newValue, forKey: key) }
    }
}
