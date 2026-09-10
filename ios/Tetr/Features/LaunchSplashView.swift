import SwiftUI
import UIKit
import AVFoundation

/**
 * Заставка запуска: ролик с маскотом, поверх последнего кадра — марка.
 *
 * Почему это отдельный экран, а не Launch Screen. `UILaunchScreen` в iOS —
 * статичная раскладка, которую система рисует до того, как приложение
 * получило управление; движения в ней нет в принципе. Поэтому система
 * показывает залитый прямоугольник (цвет — `Brand.launchCanvas`), а
 * заставку мы рисуем сами первым же кадром после старта.
 *
 * ПОЧЕМУ ШВА НЕ ВИДНО. Фон ролика — грейп `#421F7A`, системный экран
 * залит `#421685`. Разница в полтона, поэтому подмена системного кадра
 * нашим проходит незаметно, и полотном заставки служит тот же цвет, что
 * стоит в самом ролике: видео лежит на нём без рамки и без стыка.
 *
 * ПОЧЕМУ МАРКА ПРИХОДИТ ПОД КОНЕЦ, А НЕ СРАЗУ. Ролик заканчивается тем,
 * что от маскота расходятся круги; на этом кадре и проступают TETRIN с
 * подписью. Появись они раньше — спорили бы с движением за внимание,
 * появись строго после — заставка распалась бы на два отдельных номера.
 *
 * Заставка уходит по первому из двух: истекли свои секунды или человек
 * коснулся экрана. Только на холодном старте.
 */
struct LaunchSplashView: View {
    let onFinish: () -> Void

    /* «Уменьшить движение» — не про вкусы: у части людей движение
       вызывает головокружение. Тогда заставки нет вовсе. */
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Марка проступила.
    @State private var lit = false
    /// Лайм плашки разгорелся.
    @State private var warm = false

    /// Полотно: тот же грейп, что залит в самом ролике.
    private static let canvas = Color(red: 0x42 / 255, green: 0x1F / 255, blue: 0x7A / 255)

    /**
     * Ролик длится 2.5 с — исходный на 3.5 ускорен в 1.4 раза.
     *
     * Причина не в красоте, а в счёте: заставку смотрят не один раз на
     * установке, а каждое утро и после каждого выхода из приложения.
     * Мойщик открывает его сорок раз за смену, и лишняя секунда здесь
     * стоит ему сорока секунд в день.
     *
     * Марка проступает за секунду до конца ролика, дальше полсекунды
     * кадр стоит собранным.
     */
    private static let clip: Double = 2.5
    private static let total: Double = 3.1

    var body: some View {
        ZStack {
            Self.canvas

            if !reduceMotion {
                SplashClip(name: "splash-mascot", ext: "mp4")
                    .allowsHitTesting(false)
            }

            GeometryReader { geo in
                VStack(spacing: 12) {
                    wordmark
                    kicker
                }
                .frame(maxWidth: .infinity)
                .position(x: geo.size.width / 2, y: geo.size.height * 0.82)
            }
        }
        .background(Self.canvas)
        .ignoresSafeArea()
        .contentShape(Rectangle())
        .onTapGesture(perform: onFinish)
        .task { await play() }
    }

    // MARK: - Марка

    private static let name = "TETRIN"
    private static let letterSize: CGFloat = 44

    /// «TETR» буквами и «IN» плашкой — конструкция та же, что на вебе.
    private var wordmark: some View {
        HStack(alignment: .lastTextBaseline, spacing: 0) {
            ForEach(Array(Self.name.prefix(4).enumerated()), id: \.offset) { i, ch in
                letter(String(ch), index: i)
            }
            plaque
                .padding(.leading, Self.letterSize * 0.14)
        }
        .font(.custom("Unbounded-Black", size: Self.letterSize))
        .foregroundStyle(.white)
    }

    /// Буква не приезжает, а входит в фокус: размытие и прозрачность
    /// вместо смещения. Каждая следующая отстаёт на шестьдесят
    /// миллисекунд — читается «слева направо», но очередь не заметна.
    private func letter(_ text: String, index: Int) -> some View {
        Text(verbatim: text)
            .tracking(Self.letterSize * 0.02)
            .opacity(lit ? 1 : 0)
            .blur(radius: lit ? 0 : 12)
            .animation(
                .timingCurve(0.16, 1, 0.3, 1, duration: 0.8)
                    .delay(Double(index) * 0.06),
                value: lit
            )
    }

    /// Плашка «IN»: лайм разгорается изнутри и подсвечивает себя.
    private var plaque: some View {
        Text(verbatim: String(Self.name.suffix(2)))
            .tracking(Self.letterSize * 0.02)
            .foregroundStyle(warm ? Brand.onLime : Brand.lime.opacity(0.7))
            .padding(.leading, Self.letterSize * 0.2)
            .padding(.trailing, Self.letterSize * 0.12)
            .padding(.vertical, Self.letterSize * 0.12)
            .background {
                RoundedRectangle(cornerRadius: Self.letterSize * 0.2, style: .continuous)
                    .fill(Brand.lime.opacity(warm ? 1 : 0))
                    .overlay {
                        RoundedRectangle(cornerRadius: Self.letterSize * 0.2, style: .continuous)
                            .strokeBorder(Brand.lime.opacity(warm ? 0 : 0.5), lineWidth: 1.5)
                    }
                    .shadow(color: Brand.lime.opacity(warm ? 0.4 : 0), radius: 18)
            }
            .opacity(lit ? 1 : 0)
            .blur(radius: lit ? 0 : 9)
            .animation(.timingCurve(0.16, 1, 0.3, 1, duration: 0.75).delay(0.24), value: lit)
            .animation(.easeOut(duration: 0.6), value: warm)
    }

    /// Подпись под маркой: приходит последней и тише всех.
    private var kicker: some View {
        Text(verbatim: "Business, under control")
            .font(.system(size: 13, weight: .medium))
            .tracking(1.6)
            .foregroundStyle(.white.opacity(warm ? 0.62 : 0))
            .animation(.easeOut(duration: 0.8).delay(0.12), value: warm)
    }

    // MARK: - Ход

    /**
     * Такт заставки.
     *
     * Один тактильный отклик, мягкий, в момент, когда загорелся лайм.
     * Прежняя версия била дважды — под удар штампа и под приход маскота.
     */
    private func play() async {
        guard !reduceMotion else {
            onFinish()
            return
        }

        try? await Task.sleep(for: .seconds(Self.clip - 1.0))
        guard !Task.isCancelled else { return }
        lit = true

        try? await Task.sleep(for: .milliseconds(520))
        guard !Task.isCancelled else { return }
        warm = true
        UIImpactFeedbackGenerator(style: .soft).impactOccurred(intensity: 0.55)

        try? await Task.sleep(for: .seconds(Self.total - Self.clip + 1.0 - 0.52))
        guard !Task.isCancelled else { return }
        onFinish()
    }
}

/**
 * Ролик заставки.
 *
 * Свой слой, а не `VideoPlayer` из AVKit: тот приносит собственные
 * органы управления, которые всплывают от касания по экрану — а касание
 * здесь означает «пропустить заставку». Плюс нужен `resizeAspectFill`:
 * ролик уже экрана, и без заполнения по ширине по бокам осталась бы
 * полоса другого оттенка.
 *
 * Звука у файла нет вовсе, поэтому аудиосессию не трогаем: чужая музыка
 * в наушниках не должна прерываться из-за запуска приложения.
 */
private struct SplashClip: UIViewRepresentable {
    let name: String
    let ext: String

    func makeUIView(context: Context) -> ClipView {
        let view = ClipView()
        guard let url = Bundle.main.url(forResource: name, withExtension: ext) else { return view }
        let player = AVPlayer(url: url)
        player.isMuted = true
        /* Последний кадр остаётся на экране: `AVPlayer` на конце просто
           останавливается, и марка проступает на нём, а не на пустоте. */
        player.actionAtItemEnd = .pause
        view.playerLayer.player = player
        view.playerLayer.videoGravity = .resizeAspectFill
        player.play()
        return view
    }

    func updateUIView(_ uiView: ClipView, context: Context) {}

    final class ClipView: UIView {
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
    }
}
