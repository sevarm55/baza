import SwiftUI

/**
 * Точки: где человек работает и что с каждой.
 *
 * Переключиться можно и из заголовка экрана смены — там это одно нажатие
 * и никакой страницы не нужно. Здесь другое: **состояние**. Меню в
 * заголовке отвечает «куда перейти», эта страница — «что у меня где»:
 * какая оплачена, у какой кончается срок, какая ждёт денег.
 *
 * Появляется только когда точек больше одной. У кого мойка одна, для того
 * этого раздела не существует: рассказывать ему про точки — значит
 * объяснять устройство, которого он не просил.
 */
struct PointsView: View {
    @EnvironmentObject private var session: Session
    @EnvironmentObject private var queue: OrderQueue

    @State private var going: String?
    @State private var failed = false

    private let gap: CGFloat = 10

    var body: some View {
        ScrollView {
            VStack(spacing: gap) {
                ForEach(session.points) { point in
                    card(point)
                }

                /* Завести точку отсюда нельзя, и человек должен узнать об
                   этом здесь, а не искать кнопку. Правила App Store
                   (3.1.3f) не разрешают начинать внутри приложения
                   платный путь, а вторая точка платная сразу. */
                Text("Նոր մասնաճյուղն ավելացվում է կայքում՝ tetrin.pro")
                    .font(.system(size: 12.5))
                    .foregroundStyle(Brand.boardMuted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 6)
            }
            .padding(.horizontal, 12)
            .padding(.top, 8)
            .padding(.bottom, 28)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.board.ignoresSafeArea())
        .alert("Չհաջողվեց", isPresented: $failed) {
            Button("Լավ", role: .cancel) {}
        } message: {
            Text("Չստացվեց անցնել։ Ստուգեք կապը և կրկնեք։")
        }
    }

    private func card(_ point: API.Point) -> some View {
        let here = point.id == session.tenant?.id
        let tone = Brand.personTone(point.name)

        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(point.name)
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    Text(point.role == "owner" ? "Սեփականատեր" : "Աշխատակից")
                        .font(.system(size: 12))
                        .foregroundStyle(.white.opacity(0.7))
                }

                Spacer(minLength: 8)

                if here {
                    Text("այստեղ եք")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(Brand.onLime)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Brand.lime, in: .capsule)
                }
            }

            /* Состояние словами и цифрой. «12 օր» само по себе не говорит
               чего именно двенадцать, а «оплачено» без срока не отвечает
               на вопрос, ради которого сюда зашли. */
            Text(state(point))
                .font(.system(size: 13.5, weight: .medium))
                .monospacedDigit()
                .foregroundStyle(point.canRead ? .white.opacity(0.85) : Brand.warnOnDark)
                .padding(.top, 12)

            if !here {
                Button {
                    guard going == nil else { return }
                    going = point.id
                    Task {
                        do { try await session.switchTo(point, queue: queue) } catch {
                            failed = true
                            going = nil
                        }
                    }
                } label: {
                    Text("Անցնել")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                        .loading(going == point.id, tint: .white, size: 16)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 11)
                        .background(.white.opacity(0.18), in: .rect(cornerRadius: 13))
                }
                .buttonStyle(.press)
                .disabled(going != nil)
                .padding(.top, 12)
            }
        }
        .tile(base: tone.base, glow: tone.glow, radius: 22, pad: 16)
    }

    private func state(_ point: API.Point) -> String {
        let days = point.daysLeft ?? 0
        switch point.state {
        case "active": return days > 0 ? "Վճարված է · \(days) օր" : "Վճարված է"
        case "trial": return "Փորձնական · \(days) օր"
        case "unpaid": return "Սպասում է վճարման"
        case "expired": return "Ժամկետը լրացել է"
        case "blocked": return "Հասանելիությունը փակ է"
        default: return point.canRead ? "Աշխատում է" : "Փակ է"
        }
    }
}
