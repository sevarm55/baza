import SwiftUI

/**
 * Ожидание, отказ и пустота — три разных ответа.
 *
 * До этого набора экраны приложения отвечали на них одинаково. Список
 * расходов, до которого не доехали данные, показывал «Դեռ ծախսեր չկան» —
 * то есть врал: расходы есть, их не привезли. Разница дорогая: в первом
 * случае человек заводит расход, во втором ждёт связь, и подсказать ему
 * не то значит отправить заводить второй раз то, что уже заведено.
 *
 * Пять уровней ожидания, которые нельзя смешивать:
 *
 *     A · приложение   TetrLoader на заставке   только запуск и сессия
 *     B · экран        TetrSkeleton             форма именно этого экрана
 *     C · часть        AsyncSection             прибор ждёт, экран живёт
 *     D · действие     .loading(_:tint:title:)  нажали, идёт
 *     E · фон          TetrRefreshDot           данные есть, идёт сверка
 */

// MARK: - Скелет

/**
 * Место прибора, пока едут данные.
 *
 * По нему проходит одна очень мягкая волна света. Волна медленная (2.6 с)
 * и слабая по контрасту: скелет обязан читаться как «сейчас будет», а не
 * как «что-то мигает».
 *
 * Все блоки экрана появляются одновременно, поэтому их волны идут в один
 * такт и глаз читает одно движение на весь экран, а не десять
 * независимых бликов на пустоте.
 */
struct TetrSkeleton: View {
    var width: CGFloat?
    var height: CGFloat = 14
    var radius: CGFloat = 6

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var travel = false

    var body: some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(Brand.onBoard.opacity(0.06))
            .frame(width: width, height: height)
            .overlay {
                if !reduceMotion {
                    GeometryReader { geo in
                        LinearGradient(
                            colors: [
                                .clear,
                                Brand.onBoard.opacity(0.05),
                                Brand.onBoard.opacity(0.05),
                                .clear,
                            ],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                        .frame(width: geo.size.width * 1.6)
                        .offset(x: travel ? geo.size.width * 0.9 : -geo.size.width * 1.5)
                    }
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .onAppear {
                guard !reduceMotion else { return }
                /* Пауза в конце оборота (`autoreverses: false` плюс
                   длина больше самого прохода) — чтобы движение не
                   читалось бесконечной лентой и не торопило. */
                withAnimation(.easeInOut(duration: 1.9).repeatForever(autoreverses: false).delay(0.2)) {
                    travel = true
                }
            }
            .accessibilityHidden(true)
    }
}

/// Место строки списка: значок, название, число справа.
struct TetrSkeletonRow: View {
    var index: Int = 0
    var avatar = false

    /// Ширины подписей заданы раз и навсегда, а не случайно: случайная
    /// ширина меняется на каждой отрисовке, и скелет начинает дёргаться
    /// сам по себе.
    private static let widths: [CGFloat] = [112, 144, 96, 128, 160, 112]

    var body: some View {
        HStack(spacing: 12) {
            if avatar {
                TetrSkeleton(width: 32, height: 32, radius: 16)
            } else {
                TetrSkeleton(width: 18, height: 18, radius: 5)
            }
            TetrSkeleton(width: Self.widths[index % Self.widths.count], height: 13)
            Spacer(minLength: 8)
            TetrSkeleton(width: 72, height: 13)
        }
    }
}

/// Место списка строк.
struct TetrSkeletonList: View {
    var rows: Int = 4
    var avatar = false

    var body: some View {
        VStack(spacing: 16) {
            ForEach(0..<rows, id: \.self) { i in
                TetrSkeletonRow(index: i, avatar: avatar)
            }
        }
        .accessibilityElement()
        .accessibilityLabel(L("common.loadingShort"))
    }
}

/// Место экрана со сводкой наверху и списком под ней.
///
/// Форма общая для разделов, которые так и устроены: расходы, услуги,
/// люди, клиенты. Экрану с другой раскладкой нужен свой скелет: скелет,
/// показывающий не ту разметку, читается как «загрузилось неправильно»,
/// и вздрагивание при подстановке заметнее, чем его отсутствие.
struct TetrScreenSkeleton: View {
    var reading = true
    var rows: Int = 5
    var avatar = false

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            if reading {
                VStack(alignment: .leading, spacing: 10) {
                    TetrSkeleton(width: 120, height: 13)
                    TetrSkeleton(width: 210, height: 40, radius: 10)
                    TetrSkeleton(width: 170, height: 13)
                }
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.bottom, 4)
            }
            TetrSkeleton(width: 130, height: 14)
            TetrSkeletonList(rows: rows, avatar: avatar)
        }
        .padding(.horizontal, 12)
        .padding(.top, 8)
    }
}

// MARK: - Отказ

/**
 * Отказ, который остался внутри своего экрана.
 *
 * Ни кода ошибки, ни подробностей: владельцу мойки они ничего не
 * говорят, а испугать успевают. Кнопка одна, и она сама показывает, что
 * повтор пошёл: без этого человек жмёт её второй и третий раз, не
 * понимая, нажалась ли она вообще.
 */
struct TetrFailure: View {
    var title: String
    var note: String?
    var retry: (() async -> Void)?

    @State private var busy = false

    var body: some View {
        VStack(spacing: 10) {
            Text(title)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Brand.onBoard)
                .multilineTextAlignment(.center)

            if let note {
                Text(note)
                    .font(.system(size: 13))
                    .foregroundStyle(Brand.boardMuted)
                    .multilineTextAlignment(.center)
            }

            if let retry {
                Button {
                    guard !busy else { return }
                    busy = true
                    Task {
                        await retry()
                        busy = false
                    }
                } label: {
                    Text(L("common.retry"))
                        .font(.system(size: 14, weight: .semibold))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .loading(busy, tint: Brand.grape, size: 16, title: L("common.retrying"))
                }
                .buttonStyle(.plain)
                .busy(busy)
                .padding(.top, 2)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
        .padding(.horizontal, 24)
    }
}

// MARK: - Фоновое обновление

/**
 * Точка рядом с заголовком: данные на экране сверяются с сервером.
 *
 * Первая загрузка и фоновое обновление — разные состояния. Когда числа
 * уже на экране, подменять их скелетом нельзя: скелет говорит «ничего
 * нет», а всё есть, просто чуть устарело.
 */
struct TetrRefreshDot: View {
    var active: Bool
    var tint: Color = Brand.lime

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: !active)) { ctx in
            let t = ctx.date.timeIntervalSinceReferenceDate
            Circle()
                .fill(tint)
                .frame(width: 6, height: 6)
                .opacity(active ? (reduceMotion ? 0.8 : 0.3 + 0.7 * (sin(t * 5) + 1) / 2) : 0)
        }
        .frame(width: 6, height: 6)
        .accessibilityHidden(!active)
        .accessibilityLabel(L("common.refreshing"))
    }
}

// MARK: - Порог показа

/**
 * Признак загрузки, включающийся не сразу.
 *
 * Между нажатием и ответом чаще всего проходит меньше двух десятых
 * секунды. Если на это время подставить скелет, человек увидит вспышку
 * серого и решит, что экран моргнул, — хуже, чем если бы не было
 * ничего. Обратный ход мгновенный: пришли данные — показываем данные.
 * Придержать готовый ответ ради красоты анимации значит соврать про
 * скорость продукта в единственном месте, где скорость видна.
 */
@MainActor
@Observable
final class DelayedFlag {
    private(set) var shown = false
    private var task: Task<Void, Never>?

    func update(_ active: Bool, delay: Duration = Motion.loadingDelay) {
        task?.cancel()
        guard active else {
            shown = false
            return
        }
        task = Task { [weak self] in
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled else { return }
            self?.shown = true
        }
    }
}

/// Показать содержимое, только если ожидание затянулось.
struct Delayed<Content: View>: View {
    var active: Bool
    @ViewBuilder var content: Content

    @State private var flag = DelayedFlag()

    var body: some View {
        Group {
            if active && flag.shown { content }
        }
        .onAppear { flag.update(active) }
        .onChange(of: active) { _, now in flag.update(now) }
        .animation(Motion.content, value: flag.shown)
    }
}
