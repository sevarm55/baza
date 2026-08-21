import SwiftUI
import UIKit

/**
 * Идёт ли сейчас заставка.
 *
 * Нужно тем экранам, которые сами поднимают клавиатуру. Экран входа
 * ставит курсор в поле телефона по `onAppear` — и делал это, пока сверху
 * ещё шла заставка: клавиатура системная, она рисуется поверх всего
 * приложения, и заставка оказывалась наполовину закрыта.
 *
 * Убрать `onAppear` нельзя: курсор в поле — это правильно, человек
 * открыл приложение, чтобы войти. Значит фокус не отменяется, а
 * откладывается до конца заставки.
 */
private struct SplashActiveKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    var splashActive: Bool {
        get { self[SplashActiveKey.self] }
        set { self[SplashActiveKey.self] = newValue }
    }
}

/**
 * Заставка запуска: марка собирается на грейповом полотне.
 *
 * Почему это отдельный экран, а не Launch Screen. `UILaunchScreen` в iOS —
 * статичная раскладка, которую система рисует до того, как приложение
 * получило управление; движения в ней нет в принципе. Поэтому система
 * показывает залитый прямоугольник (цвет — `Brand.launchCanvas`, тот же,
 * что здесь), а заставку мы рисуем сами — первым же кадром после старта,
 * поверх всего остального.
 *
 * Раньше здесь крутился mp4. Ролик весил полтора мегабайта, играл ровно
 * четыре секунды и на разных телефонах обрезался по-разному. Теперь то же
 * самое нарисовано видами: вес нулевой, кадр всегда чёткий, а времена
 * лежат в коде и правятся строкой.
 *
 * Заставка уходит по первому из двух: истекли свои секунды или человек
 * коснулся экрана. И только на холодном старте: `@State` в `App` живёт
 * столько же, сколько процесс, а возврат из фона процесс не пересоздаёт.
 */
struct LaunchSplashView: View {
    let onFinish: () -> Void

    /* Системная настройка «уменьшить движение» — не про вкусы: у части
       людей движение вызывает головокружение. Тогда заставки нет вовсе. */
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Взведён ли вход. Все появления навешаны на это одно значение,
    /// каждое со своей задержкой, — так задержки видно списком.
    @State private var on = false

    /// Сколько заставка держится на экране.
    ///
    /// Вход кончается на 2.4 секунде (последней въезжает нижняя подпись),
    /// дальше добавлена доля секунды, чтобы собранный кадр успели увидеть
    /// целым. Ролик держал четыре — это было заметно долго.
    private static let total: Double = 2.9

    var body: some View {
        GeometryReader { geo in
            /* Раскладка набрана в тех же числах, что и макет: 430×932.
               На экран она кладётся целиком, с обрезкой по краям, — так
               же, как это делал ролик. У всех телефонов, до которых
               дотягивается iOS 26, отношение сторон отличается от
               макетного меньше чем на промилле, поэтому обрезать
               оказывается нечего. */
            let fill = max(geo.size.width / Macket.w, geo.size.height / Macket.h)

            canvas
                .frame(width: Macket.w, height: Macket.h)
                .scaleEffect(fill)
                .frame(width: geo.size.width, height: geo.size.height)
                .clipped()
        }
        .background(Brand.launchCanvas)
        .ignoresSafeArea()
        .contentShape(Rectangle())
        .onTapGesture(perform: onFinish)
        .task { await play() }
    }

    // MARK: - Кадр

    private enum Macket {
        static let w: CGFloat = 430
        static let h: CGFloat = 932
    }

    private var canvas: some View {
        ZStack(alignment: .topLeading) {
            Brand.launchCanvas

            rail
            runner

            kicker
                .offset(x: 112, y: 112)

            VStack(alignment: .leading, spacing: 22) {
                wordmark
                marks
            }
            .offset(x: 112, y: 390)

            roller
                .offset(x: 112, y: Macket.h - 104 - 18)
        }
        .frame(width: Macket.w, height: Macket.h, alignment: .topLeading)
    }

    /**
     * Поле слева.
     *
     * Тетрадь и есть поле с полосой: весь текст на экране стоит от одной
     * вертикали, и эта вертикаль нарисована. Полоса приезжает сверху вниз
     * первой — до неё на экране нет ничего, и она задаёт, откуда читать.
     */
    private var rail: some View {
        Rectangle()
            .fill(Brand.lime.opacity(0.22))
            .frame(width: 4, height: Macket.h)
            .scaleEffect(x: 1, y: on ? 1 : 0, anchor: .top)
            .animation(.timingCurve(0.16, 1, 0.3, 1, duration: 1.1), value: on)
            .offset(x: 74)
    }

    /**
     * Бегунок по полю.
     *
     * Яркий отрезок, который бесконечно сходит по бледной полосе. Он и
     * есть индикатор загрузки: полоски со шкалой на заставке нет, а
     * сказать «работаем» чем-то надо. Появляется и гаснет на концах
     * пути, чтобы не было видно, как он выскакивает из-под края.
     */
    private var runner: some View {
        KeyframeAnimator(initialValue: Runner(), repeating: true) { frame in
            Rectangle()
                .fill(Brand.lime)
                .frame(width: 4, height: 120)
                .opacity(frame.opacity)
                .offset(x: 74, y: frame.top)
        } keyframes: { _ in
            KeyframeTrack(\.top) {
                LinearKeyframe(0, duration: 1)
                CubicKeyframe(Macket.h, duration: 3.2)
            }
            KeyframeTrack(\.opacity) {
                LinearKeyframe(0, duration: 1)
                LinearKeyframe(1, duration: 3.2 * 0.12)
                LinearKeyframe(1, duration: 3.2 * 0.76)
                LinearKeyframe(0, duration: 3.2 * 0.12)
            }
        }
    }

    private struct Runner {
        var top: CGFloat = 0
        var opacity: CGFloat = 0
    }

    /**
     * Надпись над маркой.
     *
     * Девять пунктов с разрядкой в семь — это не текст, а линия из букв:
     * читать её никто не станет, а увидит как ещё одну горизонталь. Набрана
     * системным шрифтом: в бандле лежит одно начертание Unbounded, чёрное,
     * и на таком кегле разница в буквах не видна, а лишний файл шрифта —
     * это мегабайты в приложении, которое ставят с телефона на мойке.
     */
    private var kicker: some View {
        /* `verbatim`, а не обычный `Text`: иначе строка уходит в каталог
           переводов и ждёт, пока её переведут на три языка. Переводить
           тут нечего — это часть знака, и на всех языках она одна. */
        Text(verbatim: "TETRIN · CAR WASH BOOK")
            .font(.system(size: 9, weight: .light))
            .tracking(7)
            .foregroundStyle(.white.opacity(0.45))
            .opacity(on ? 1 : 0)
            .animation(.easeOut(duration: 1).delay(0.5), value: on)
    }

    /**
     * Марка.
     *
     * Открывается слева направо — не проявляется и не выезжает, а именно
     * прописывается, будто её пишут по полю. Отсюда и маска: она режет
     * буквы по вертикали, и в любой момент видно ровно то, что уже
     * «написано».
     *
     * Unbounded Black — тот же файл, что на витрине; марка нигде не
     * набирается ничем другим.
     */
    private var wordmark: some View {
        Text("TETRIN")
            .font(.custom("Unbounded-Black", size: 56))
            .tracking(-2)
            .foregroundStyle(.white)
            .mask(alignment: .leading) {
                Rectangle().scaleEffect(x: on ? 1 : 0, anchor: .leading)
            }
            .animation(.timingCurve(0.16, 1, 0.3, 1, duration: 1.05).delay(0.6), value: on)
    }

    /// Три квадрата под маркой: тетрамино, разобранное на клетки, и
    /// заодно счётчик — они загораются по очереди и гаснущей яркостью.
    private var marks: some View {
        HStack(spacing: 5) {
            mark(Brand.lime, delay: 1.05)
            mark(Brand.lime.opacity(0.45), delay: 1.15)
            mark(Brand.lime.opacity(0.22), delay: 1.25)
        }
    }

    private func mark(_ fill: Color, delay: Double) -> some View {
        Rectangle()
            .fill(fill)
            .frame(width: 16, height: 16)
            .opacity(on ? 1 : 0)
            .offset(y: on ? 0 : 10)
            .animation(.timingCurve(0.16, 1, 0.3, 1, duration: 0.7).delay(delay), value: on)
    }

    /**
     * Подпись внизу, которая переворачивается.
     *
     * Две строки в окне высотой в одну: окно стоит на месте, а лента под
     * ним сдвигается на строку и через паузу возвращается. Пауза длинная
     * намеренно — подпись должна смениться, пока на неё не смотрят, а не
     * мигать.
     *
     * Первый переворот приходится на 3.3 секунду, то есть при обычном
     * запуске его не видно: заставка к тому времени уже ушла. Он для
     * того случая, когда сеть тормозит и заставка держится дольше, —
     * тогда экран продолжает жить, а не застывает картинкой.
     */
    private var roller: some View {
        KeyframeAnimator(initialValue: Roll(), repeating: true) { frame in
            VStack(spacing: 0) {
                line("LEZGO GO", Brand.lime)
                line("LOADING", .white.opacity(0.55))
            }
            .offset(y: frame.y)
        } keyframes: { _ in
            KeyframeTrack(\.y) {
                LinearKeyframe(0, duration: 1.936)
                CubicKeyframe(-18, duration: 0.264)
                LinearKeyframe(-18, duration: 1.936)
                CubicKeyframe(0, duration: 0.264)
            }
        }
        .frame(width: 220, height: 18, alignment: .topLeading)
        .clipped()
        .opacity(on ? 1 : 0)
        .animation(.easeOut(duration: 1).delay(1.4), value: on)
    }

    private struct Roll {
        var y: CGFloat = 0
    }

    private func line(_ text: String, _ ink: Color) -> some View {
        Text(verbatim: text)
            .font(.system(size: 9, weight: .light))
            .tracking(8)
            .foregroundStyle(ink)
            .frame(width: 220, height: 18, alignment: .leading)
    }

    // MARK: - Ход

    /**
     * Отклик в ладонь.
     *
     * Один тяжёлый удар в момент, когда марка дописана, и следом три
     * коротких тика — по одному на каждый загоревшийся квадрат, всё
     * сильнее. Ощущается это не как уведомление, а как то, что
     * приложение включилось.
     *
     * Стиль `.rigid` для тиков намеренно: у него короткий резкий импульс,
     * и три удара подряд остаются тремя касаниями. Мягкий `.light` на
     * такой частоте сливается в жужжание.
     *
     * Времена привязаны к анимации выше. Меняется она — меняются и они.
     */
    private static let beats: [(at: Double, heavy: Bool, force: CGFloat)] = [
        (0.95, true, 0.8),
        (1.40, false, 0.5),
        (1.50, false, 0.7),
        (1.60, false, 0.9),
    ]

    private func play() async {
        guard !reduceMotion else {
            onFinish()
            return
        }

        /* Первый кадр должен быть нарисован до того, как взведётся вход:
           иначе смена состояния попадает в тот же проход, что и появление
           экрана, и SwiftUI показывает конечное положение без движения. */
        try? await Task.sleep(for: .milliseconds(20))
        guard !Task.isCancelled else { return }
        on = true

        let land = UIImpactFeedbackGenerator(style: .heavy)
        let tick = UIImpactFeedbackGenerator(style: .rigid)
        land.prepare()
        tick.prepare()

        var clock = 0.0
        for beat in Self.beats {
            try? await Task.sleep(for: .seconds(beat.at - clock))
            guard !Task.isCancelled else { return }
            clock = beat.at

            let generator = beat.heavy ? land : tick
            generator.impactOccurred(intensity: beat.force)
            generator.prepare()
        }

        try? await Task.sleep(for: .seconds(Self.total - clock))
        guard !Task.isCancelled else { return }
        onFinish()
    }
}
