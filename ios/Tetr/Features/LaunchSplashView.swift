import SwiftUI
import UIKit

/**
 * Заставка запуска: марка ставится штампом, маскот выглядывает снизу.
 *
 * Почему это отдельный экран, а не Launch Screen. `UILaunchScreen` в iOS —
 * статичная раскладка, которую система рисует до того, как приложение
 * получило управление; движения в ней нет в принципе. Поэтому система
 * показывает залитый прямоугольник (цвет — `Brand.launchCanvas`), а
 * заставку мы рисуем сами первым же кадром после старта.
 *
 * Хореография та же, что у марки на вебе (`docs/brand/logo-motion/
 * motion_spec.md`): буквы TETR встают из-под базовой линии слева направо
 * внахлёст, плашка «IN» проявляется приподнятой, делает замах и падает
 * штампом; удар сжимает плашку на три процента и волной проходит по
 * буквам справа налево. Один такт — 1200 мс. Следом снизу выглядывает
 * маскот и держится за кромку экрана: тот же персонаж, что на смене и на
 * входе.
 *
 * Заставка уходит по первому из двух: истекли свои секунды или человек
 * коснулся экрана. Только на холодном старте.
 */
struct LaunchSplashView: View {
    let onFinish: () -> Void

    /* «Уменьшить движение» — не про вкусы: у части людей движение
       вызывает головокружение. Тогда заставки нет вовсе. */
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Взведён ли вход: буквы и плашка.
    @State private var on = false
    /// Штамп ударил: волна по буквам, вспышка, маскот.
    @State private var hit = false
    /// Маскот поднялся к кромке.
    @State private var mascot = false

    /// Сколько заставка держится. Штамп кончается на 1.2 с, маскот встаёт
    /// к 1.7, дальше доля секунды, чтобы собранный кадр увидели целым.
    private static let total: Double = 2.7

    private static let backdrop = UIImage(named: "splash-bg.jpg")
    private static let grip = UIImage(named: "grip.png")

    var body: some View {
        GeometryReader { geo in
            ZStack {
                Brand.launchCanvas

                scene(geo.size)

                glow(geo.size)

                VStack(spacing: 18) {
                    wordmark
                    kicker
                }
                .position(x: geo.size.width / 2, y: geo.size.height * 0.40)

                mascotView(geo.size)
            }
            .frame(width: geo.size.width, height: geo.size.height)
            .clipped()
        }
        .background(Brand.launchCanvas)
        .ignoresSafeArea()
        .contentShape(Rectangle())
        .onTapGesture(perform: onFinish)
        .task { await play() }
    }

    // MARK: - Сцена

    /// Мокрая студия с пеной: медленный наезд, чтобы кадр дышал. Без
    /// картинки в бандле остаётся полотно с грейповым светом.
    @ViewBuilder
    private func scene(_ size: CGSize) -> some View {
        if let image = Self.backdrop {
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .frame(width: size.width, height: size.height)
                .scaleEffect(on ? 1.07 : 1.0)
                .animation(.easeOut(duration: Self.total + 0.6), value: on)
                .overlay {
                    /* Притемнение к центру: марка должна читаться на любом
                       кадре, а сцена остаётся вокруг неё. */
                    RadialGradient(
                        colors: [Brand.grapeDeep.opacity(0.55), Brand.grapeDeep.opacity(0.1)],
                        center: UnitPoint(x: 0.5, y: 0.4),
                        startRadius: 40,
                        endRadius: size.width * 0.9
                    )
                }
                .clipped()
        } else {
            Brand.splashGlow
        }
    }

    /// Лаймовая вспышка за маркой: тлеет, на ударе вспыхивает и гаснет.
    private func glow(_ size: CGSize) -> some View {
        RadialGradient(
            colors: [Brand.lime.opacity(0.9), Brand.lime.opacity(0)],
            center: .center,
            startRadius: 0,
            endRadius: size.width * 0.55
        )
        .frame(width: size.width * 1.4, height: size.width * 1.4)
        .position(x: size.width / 2, y: size.height * 0.40)
        .keyframeAnimator(initialValue: 0.0, trigger: hit) { view, value in
            view.opacity(value)
        } keyframes: { _ in
            KeyframeTrack {
                LinearKeyframe(hit ? 0.42 : 0.0, duration: 0.06)
                CubicKeyframe(0.14, duration: 1.1)
            }
        }
        .blendMode(.screen)
        .allowsHitTesting(false)
    }

    // MARK: - Марка

    private static let name = "TETRIN"
    private static let letterSize: CGFloat = 58

    /**
     * «TETR» буквами и «IN» плашкой.
     *
     * Буквы встают из-под базовой линии по очереди, плашка падает
     * штампом. Времена — из спецификации марки на вебе: замах 0…240,
     * действие 240…840, удар 810, довод до 1200.
     */
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

    /// Буква: встаёт снизу с длинным выкатом, на ударе чуть приседает —
    /// волна идёт справа налево, от плашки.
    private func letter(_ text: String, index: Int) -> some View {
        Text(verbatim: text)
            .tracking(Self.letterSize * 0.02)
            .opacity(on ? 1 : 0)
            .offset(y: on ? 0 : Self.letterSize * 0.6)
            .animation(
                .timingCurve(0.16, 1, 0.3, 1, duration: 0.62).delay(0.09 + Double(index) * 0.085),
                value: on
            )
            .keyframeAnimator(initialValue: 1.0, trigger: hit) { view, scale in
                view.scaleEffect(x: 1, y: scale, anchor: .bottom)
            } keyframes: { _ in
                KeyframeTrack {
                    LinearKeyframe(1.0, duration: 0.02 + Double(3 - index) * 0.055)
                    CubicKeyframe(hit ? 0.955 : 1.0, duration: 0.07)
                    SpringKeyframe(1.0, duration: 0.42, spring: .init(response: 0.32, dampingRatio: 0.6))
                }
            }
    }

    /// Плашка «IN»: проявляется приподнятой, замахивается и падает.
    /// На ударе сжимается на три процента и мягко восстанавливается.
    private var plaque: some View {
        Text(verbatim: String(Self.name.suffix(2)))
            .tracking(Self.letterSize * 0.02)
            .foregroundStyle(Brand.onLime)
            .padding(.leading, Self.letterSize * 0.2)
            .padding(.trailing, Self.letterSize * 0.12)
            .padding(.vertical, Self.letterSize * 0.12)
            .background(Brand.lime, in: .rect(cornerRadius: Self.letterSize * 0.2, style: .continuous))
            .keyframeAnimator(initialValue: Stamp(), trigger: on) { view, frame in
                view
                    .opacity(frame.opacity)
                    .offset(y: frame.y)
                    .scaleEffect(x: frame.squash > 0 ? 1 + frame.squash * 0.5 : 1, y: 1 - frame.squash, anchor: .bottom)
            } keyframes: { _ in
                KeyframeTrack(\.opacity) {
                    LinearKeyframe(on ? 0 : 0, duration: 0.42)
                    LinearKeyframe(on ? 1 : 0, duration: 0.16)
                }
                KeyframeTrack(\.y) {
                    LinearKeyframe(-30, duration: 0.42)
                    CubicKeyframe(-42, duration: 0.2)
                    CubicKeyframe(0, duration: 0.2)
                }
                KeyframeTrack(\.squash) {
                    LinearKeyframe(0, duration: 0.82)
                    LinearKeyframe(0.03, duration: 0.05)
                    SpringKeyframe(0, duration: 0.4, spring: .init(response: 0.3, dampingRatio: 0.55))
                }
            }
    }

    private struct Stamp {
        var opacity: Double = 0
        var y: CGFloat = -30
        var squash: CGFloat = 0
    }

    /// Подпись под маркой: линия из букв, приходит после удара.
    private var kicker: some View {
        Text(verbatim: "CAR WASH BOOK")
            .font(.system(size: 10, weight: .semibold))
            .tracking(6)
            .foregroundStyle(.white.opacity(0.6))
            .opacity(hit ? 1 : 0)
            .offset(y: hit ? 0 : 6)
            .animation(.timingCurve(0.16, 1, 0.3, 1, duration: 0.7).delay(0.1), value: hit)
    }

    // MARK: - Маскот

    /// Выглядывает снизу и держится за кромку экрана. Поднимается
    /// пружиной после удара штампа: сначала марка, потом тот, кто её
    /// поставил.
    @ViewBuilder
    private func mascotView(_ size: CGSize) -> some View {
        if let image = Self.grip {
            let width = size.width * 0.66
            let height = width * image.size.height / image.size.width
            Image(uiImage: image)
                .resizable()
                .frame(width: width, height: height)
                .shadow(color: Brand.lime.opacity(0.35), radius: 28, y: -6)
                .position(x: size.width / 2, y: size.height - height / 2 + 6)
                .offset(y: mascot ? 0 : height * 1.05)
                .animation(.spring(response: 0.62, dampingFraction: 0.72), value: mascot)
        }
    }

    // MARK: - Ход

    /**
     * Отклик в ладонь: один тяжёлый удар в момент штампа и мягкий толчок,
     * когда маскот берётся за кромку.
     */
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
        let soft = UIImpactFeedbackGenerator(style: .soft)
        land.prepare()
        soft.prepare()

        try? await Task.sleep(for: .milliseconds(820))
        guard !Task.isCancelled else { return }
        hit = true
        land.impactOccurred(intensity: 0.9)

        try? await Task.sleep(for: .milliseconds(140))
        guard !Task.isCancelled else { return }
        mascot = true

        try? await Task.sleep(for: .milliseconds(420))
        guard !Task.isCancelled else { return }
        soft.impactOccurred(intensity: 0.6)

        try? await Task.sleep(for: .seconds(Self.total - 1.4))
        guard !Task.isCancelled else { return }
        onFinish()
    }
}
