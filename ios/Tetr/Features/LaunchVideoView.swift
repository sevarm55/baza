import AVFoundation
import SwiftUI

/**
 * Идёт ли сейчас заставка.
 *
 * Нужно тем экранам, которые сами поднимают клавиатуру. Экран входа
 * ставит курсор в поле телефона по `onAppear` — и делал это, пока сверху
 * ещё крутился ролик: клавиатура системная, она рисуется поверх всего
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
 * Заставка запуска: знак собирается из света и застывает.
 *
 * Почему это отдельный экран, а не Launch Screen. `UILaunchScreen` в iOS —
 * статичная раскладка, которую система рисует до того, как приложение
 * получило управление; проиграть в ней видео нельзя в принципе. Поэтому
 * система показывает своё пустое полотно, а ролик мы играем сами — первым
 * же кадром после старта, поверх всего остального.
 *
 * Ролик кончается ровно на настоящей иконке, а под ним лежит то же
 * грейповое полотно, что и на экране проверки сессии. Поэтому уход
 * заставки — это растворение, а не смена картинки: человек не видит
 * стыка.
 *
 * Четыре секунды — это долго. Поэтому заставка уходит по первому из двух:
 * досмотрели до конца или коснулись экрана. И только на холодном старте:
 * `@State` в `App` живёт столько же, сколько процесс, а возврат из фона
 * процесс не пересоздаёт.
 */
struct LaunchVideoView: View {
    let onFinish: () -> Void

    /* Системная настройка «уменьшить движение» — не про вкусы: у части
       людей движение вызывает головокружение. Тогда заставки нет вовсе. */
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var player: AVPlayer?
    @State private var beats: Any?

    /* Отклик в ладонь по ходу ролика — дробь, а не отдельные касания.

       Пока свет стягивается к центру, телефон бьёт всё чаще и всё сильнее:
       промежуток сжимается с 0.16 до 0.055 секунды, сила растёт с 0.55 до
       предела. Получается разгон, который заканчивается одним тяжёлым
       ударом в момент, когда буква встала. Ощущается это не как
       уведомление, а как то, что приложение включилось.

       Стиль `.rigid` намеренно: у него короткий резкий импульс, и на
       частоте в полтора десятка ударов за секунду он остаётся отдельными
       касаниями. Мягкий `.light` на такой частоте сливается в жужжание.

       Времена привязаны к ролику. Меняется ролик — меняются и они. */
    private static let beatFrom = 1.1
    private static let beatTo = 2.85
    private static let landing: Double = 2.9

    private static let beats: [Double] = {
        var out: [Double] = []
        var t = beatFrom
        var gap = 0.16
        while t < beatTo {
            out.append(t)
            t += gap
            gap = max(0.055, gap * 0.88)
        }
        return out
    }()

    var body: some View {
        ZStack {
            // то же полотно, что под заставкой: пока не пришёл первый кадр,
            // на экране не должно мелькнуть чёрное
            Brand.heroGradient.ignoresSafeArea()

            if let player {
                PlayerLayer(player: player)
                    .ignoresSafeArea()
            }
        }
        .contentShape(Rectangle())
        .onTapGesture(perform: onFinish)
        .task {
            guard !reduceMotion, let url = Bundle.main.url(forResource: "launch", withExtension: "mp4") else {
                onFinish()
                return
            }

            let item = AVPlayerItem(url: url)
            let p = AVPlayer(playerItem: item)
            /* Звука у ролика нет, но проигрыватель всё равно объявляет себя
               аудиосессии. Без этого запуск приложения обрывает музыку,
               которую человек слушал по дороге на мойку. */
            p.isMuted = true

            /* Наблюдатель надо удержать: `addBoundaryTimeObserver` возвращает
               токен, и как только он исчезает, система снимает наблюдение —
               вибрации просто не будет, без единой ошибки. */
            let tap = UIImpactFeedbackGenerator(style: .rigid)
            let hit = UIImpactFeedbackGenerator(style: .heavy)
            tap.prepare()
            hit.prepare()

            /* Наблюдатель сообщает только «время наступило», без указания
               какое именно, — поэтому силу удара ведём счётчиком: он растёт
               ровно в том порядке, в каком расставлены отметки. */
            let total = Double(Self.beats.count)
            var step = 0.0

            let marks = Self.beats.map { NSValue(time: CMTime(seconds: $0, preferredTimescale: 600)) }
            beats = p.addBoundaryTimeObserver(forTimes: marks, queue: .main) {
                let force = 0.55 + 0.45 * (step / max(1, total - 1))
                tap.impactOccurred(intensity: CGFloat(min(1, force)))
                tap.prepare()
                step += 1
            }

            let landing = [NSValue(time: CMTime(seconds: Self.landing, preferredTimescale: 600))]
            let landingToken = p.addBoundaryTimeObserver(forTimes: landing, queue: .main) {
                hit.impactOccurred(intensity: 1)
            }

            player = p
            p.play()

            defer {
                if let beats { p.removeTimeObserver(beats) }
                p.removeTimeObserver(landingToken)
            }

            for await _ in NotificationCenter.default.notifications(
                named: AVPlayerItem.didPlayToEndTimeNotification,
                object: item
            ) {
                break
            }
            onFinish()
        }
    }
}

/**
 * Слой проигрывателя без единого элемента управления.
 *
 * `VideoPlayer` из SwiftUI тянет за собой полосу перемотки и кнопку
 * звука — на заставке они лишние и выдают, что это видео, а не анимация.
 * `AVPlayerLayer` рисует только кадр.
 */
private struct PlayerLayer: UIViewRepresentable {
    let player: AVPlayer

    func makeUIView(context: Context) -> LayerView {
        let view = LayerView()
        view.backgroundColor = .clear
        view.playerLayer.player = player
        // кадр вертикальный и экран вертикальный, но пропорции у моделей
        // телефонов разные: заполняем целиком, обрезая по краям
        view.playerLayer.videoGravity = .resizeAspectFill
        return view
    }

    func updateUIView(_ view: LayerView, context: Context) {
        view.playerLayer.player = player
    }

    final class LayerView: UIView {
        override static var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
    }
}
