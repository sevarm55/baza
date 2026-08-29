import SwiftUI

/**
 * Точки: где человек работает и что с каждой.
 *
 * Переключиться можно и из заголовка экрана смены — там это одно нажатие
 * и никакой страницы не нужно. Здесь другое: **состояние**. Меню в
 * заголовке отвечает «куда перейти», эта страница — «что у меня где»:
 * какая оплачена, у какой кончается срок, какая ждёт денег.
 *
 * Отсюда и композиция. Точка, где человек стоит прямо сейчас, — крупной
 * плиткой сверху, со шкалой срока: это ответ на вопрос, ради которого
 * сюда чаще всего заходят. Остальные — плитками поменьше под ней, и
 * нажимается вся плитка целиком. Кнопки «Перейти» внутри карточки больше
 * нет: она была самым тяжёлым элементом экрана ради второстепенного
 * действия, и из-за неё карточки стояли разной высоты — стопка
 * получалась рваной.
 *
 * Появляется только когда точек больше одной. У кого мойка одна, для того
 * этого раздела не существует: рассказывать ему про точки — значит
 * объяснять устройство, которого он не просил.
 */
struct PointsView: View {
    /**
     * Тон карточки филиала.
     *
     * Не `personTone`: та палитра — цвет ЧЕЛОВЕКА, один и тот же в
     * ленте, зарплатах и командах, и мойка, окрашенная цветом мойщика,
     * размывала словарь продукта. У филиалов своя четвёрка глубоких
     * тонов из плиточной палитры.
     */
    static func pointTone(_ name: String) -> (base: Color, glow: Color) {
        let tones: [Tone] = [.violet, .teal, .indigo, .rose]
        var hash = 0
        for scalar in name.unicodeScalars {
            hash = (hash &* 31 &+ Int(scalar.value)) & 0xFFFFFF
        }
        let t = tones[hash % tones.count]
        return (t.base, t.glow)
    }

    @EnvironmentObject private var session: Session
    @EnvironmentObject private var queue: OrderQueue

    @State private var going: String?
    @State private var failed = false

    private let gap: CGFloat = 10

    /**
     * Полный бак — месяц.
     *
     * Шкала показывает запас времени, а не долю оплаченного периода:
     * периоды бывают разной длины, и одна и та же полоска то значила бы
     * месяц, то полгода. Месяц как мера понятен без подписи, а оплата
     * вперёд на дольше просто упирает шкалу в край — это правда, запаса
     * действительно много.
     *
     * Числа здесь только про длину полоски. Сколько дней осталось и
     * пускать ли внутрь, решает сервер; разойдись они — соврёт цвет, а
     * не доступ.
     */
    private let fullTank: Double = 30

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(spacing: gap) {
                    if let here = current {
                        hero(here)
                    }
                    ForEach(others) { point in
                        row(point)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 20)
            }

            /* Завести точку отсюда нельзя, и человек должен узнать об
               этом здесь, а не искать кнопку. Правила App Store
               (3.1.3f) не разрешают начинать внутри приложения
               платный путь, а вторая точка платная сразу.

               Внизу экрана, а не следом за плиткой: это сноска про
               устройство продукта, а не ещё одна строка списка. Пока она
               висела сразу под последней карточкой, она читалась как
               подпись к ней. */
            Text(L("points.addOnWeb"))
                .font(.system(size: 13))
                .foregroundStyle(Brand.boardMuted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 24)
                .padding(.top, 8)
                .padding(.bottom, 12)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.board.ignoresSafeArea())
        .alert(L("common.failed"), isPresented: $failed) {
            Button(L("common.ok"), role: .cancel) {}
        } message: {
            Text(L("points.switchFailed"))
        }
    }

    private var current: API.Point? {
        session.points.first { $0.id == session.tenant?.id }
    }

    private var others: [API.Point] {
        session.points.filter { $0.id != session.tenant?.id }
    }

    /**
     * Точка, где человек стоит сейчас.
     *
     * Имя крупнее всего на экране, под ним роль, ниже — срок словами и
     * шкалой. Метка «вы здесь» — точка состояния и слово рядом: горящая
     * точка это единственная круглая форма, оставшаяся в продукте, и
     * значит она ровно то, что значит здесь.
     */
    private func hero(_ point: API.Point) -> some View {
        let tone = PointsView.pointTone(point.name)

        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(point.name)
                        .font(.system(size: 23, weight: .bold))
                        .foregroundStyle(.white)
                        .lineLimit(2)
                    Text(role(point))
                        .font(.system(size: 13))
                        .foregroundStyle(.white.opacity(0.7))
                }

                Spacer(minLength: 8)

                HStack(spacing: 5) {
                    Circle()
                        .fill(Brand.lime)
                        .frame(width: 7, height: 7)
                    Text(L("points.here"))
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.9))
                }
                .padding(.top, 5)
            }

            /* Состояние словами и цифрой. «12 օր» само по себе не говорит
               чего именно двенадцать, а «оплачено» без срока не отвечает
               на вопрос, ради которого сюда зашли. */
            Text(state(point))
                .font(.system(size: 15, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(point.canRead ? .white.opacity(0.9) : Brand.warnOnDark)
                .padding(.top, 18)

            gauge(point)
                .padding(.top, 10)
        }
        .tile(base: tone.base, glow: tone.glow, radius: 22, pad: 18)
    }

    /**
     * Остальные точки: имя, состояние одной строкой и стрелка.
     *
     * Нажимается вся плитка. Отдельная кнопка внутри неё заставляла
     * целиться в полосу вместо того, чтобы попасть в карточку, а на
     * мокром экране это разница между одним нажатием и тремя.
     */
    private func row(_ point: API.Point) -> some View {
        let tone = PointsView.pointTone(point.name)

        return Button {
            guard going == nil else { return }
            going = point.id
            Task {
                do { try await session.switchTo(point, queue: queue) } catch {
                    failed = true
                    going = nil
                }
            }
        } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(point.name)
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    Text("\(role(point)) · \(state(point))")
                        .font(.system(size: 13))
                        .monospacedDigit()
                        .foregroundStyle(point.canRead ? .white.opacity(0.75) : Brand.warnOnDark)
                        .lineLimit(1)
                }

                Spacer(minLength: 8)

                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(.white.opacity(0.55))
                    .frame(width: 20)
                    .loading(going == point.id, tint: .white, size: 16)
            }
            .tile(base: tone.base, glow: tone.glow, radius: 18, pad: 14)
        }
        .buttonStyle(.press)
        .disabled(going != nil)
        .accessibilityLabel("\(point.name) · \(state(point))")
        .accessibilityHint(L("points.open"))
    }

    /**
     * Шкала срока.
     *
     * Только там, где ей есть что показывать: у закрытой точки остаток
     * нулевой, и пустая полоска под словами «ждёт оплаты» повторяла бы
     * их молча, второй раз.
     *
     * Полоска белая всегда. Янтарный «осталось мало» здесь пробовался и
     * не работает: цвет плитки берётся из имени точки, и на янтарной
     * мойке тревожная полоска исчезала в собственном фоне. Длина и есть
     * сигнал — короткая полоска говорит «мало» на любом тоне.
     */
    @ViewBuilder
    private func gauge(_ point: API.Point) -> some View {
        let days = point.daysLeft ?? 0
        if point.canRead, days > 0 {
            let part = min(1, Double(days) / fullTank)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .fill(.white.opacity(0.18))
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .fill(.white.opacity(0.9))
                        // минимум, чтобы последний день оставался виден
                        .frame(width: max(6, geo.size.width * part))
                }
            }
            .frame(height: 5)
            .accessibilityHidden(true)
        }
    }

    private func role(_ point: API.Point) -> String {
        point.role == "owner" ? L("roles.owner") : L("roles.staff")
    }

    private func state(_ point: API.Point) -> String {
        let days = point.daysLeft ?? 0
        switch point.state {
        case "active": return days > 0 ? L("points.paidDays", days) : L("payroll.paid")
        case "trial": return L("points.trialDays", days)
        case "unpaid": return L("points.awaitingPayment")
        case "expired": return L("billing.expiredTitle")
        case "blocked": return L("billing.blockedTitle")
        default: return point.canRead ? L("points.working") : L("points.closed")
        }
    }
}
