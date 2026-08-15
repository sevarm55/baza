import SwiftUI

/// Четыре экрана о том, как продукт считает деньги.
///
/// Показывается владельцу один раз, после первого входа. Не мойщику: он
/// открывает приложение, чтобы записать машину, и объяснять ему устройство
/// зарплаты и расходов — значит задержать человека, у которого на площадке
/// стоит клиент.
///
/// Текст рисуется здесь, а не впечён в картинку. Впечённый нельзя ни
/// перевести, ни увеличить вместе с системным шрифтом — а у владельца мойки
/// он часто крупный. Картинки же намеренно нарисованы с пустой нижней
/// третью: текст ложится ровно туда.
struct OnboardingView: View {
    let onDone: () -> Void

    @State private var page = 0

    private struct Slide: Identifiable {
        let id: Int
        let image: String
        let title: String
        let text: String
    }

    private let slides: [Slide] = [
        Slide(
            id: 0,
            image: "onboarding-1.jpg",
            title: L("onboarding.s1Title"),
            text: L("onboarding.s1Body")
        ),
        Slide(
            id: 1,
            image: "onboarding-2.jpg",
            title: L("onboarding.s2Title"),
            text: L("onboarding.s2Body")
        ),
        Slide(
            id: 2,
            image: "onboarding-3.jpg",
            title: L("onboarding.s3Title"),
            text: L("onboarding.s3Body")
        ),
        Slide(
            id: 3,
            image: "onboarding-4.jpg",
            title: L("onboarding.s4Title"),
            text: L("onboarding.s4Body")
        ),
    ]

    var body: some View {
        ZStack(alignment: .bottom) {
            Brand.grapeDeep.ignoresSafeArea()

            TabView(selection: $page) {
                ForEach(slides) { slide in
                    self.slide(slide).tag(slide.id)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .ignoresSafeArea()

            controls
        }
        .overlay(alignment: .topTrailing) {
            /* Выход есть на каждом экране. Онбординг, из которого нельзя
               выйти, — это не объяснение, а препятствие: человек уже
               завёл бизнес и хочет работать. */
            Button(L("common.skip")) { onDone() }
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.white.opacity(0.7))
                .padding(.horizontal, 22)
                .padding(.top, 14)
        }
        .preferredColorScheme(.dark)
    }

    private func slide(_ slide: Slide) -> some View {
        ZStack(alignment: .bottomLeading) {
            /* Картинка положена фоном через overlay поверх Color.clear,
               а не соседним слоем в стопке. Разница не косметическая:
               scaledToFill делает её шире экрана, и как обычный элемент
               она раздувает разметку — текст уезжает за левый край, а
               сама картинка оказывается за пределами видимого. Color.clear
               берёт размер экрана, overlay на размер не влияет, clipped
               срезает лишнее. */
            Color.clear
                /* Грузим через UIImage с расширением, а не Image("имя"):
                   SwiftUI ищет по имени в каталоге ассетов, а у нас файлы
                   лежат в бандле россыпью — и картинка молча не рисовалась,
                   оставляя пустой фиолетовый экран. */
                /* scaledToFit, а не Fill: картинка уже нарисована в пропорции
                   телефона, и заполнение срезало бы её по бокам — у машины
                   пропадал нос. Вписываем целиком и прижимаем к верху;
                   низ добирает тот же грейп, что и в самой картинке. */
                .overlay(alignment: .top) {
                    if let art = UIImage(named: slide.image) {
                        Image(uiImage: art)
                            .resizable()
                            .scaledToFit()
                    }
                }
                .clipped()
                /* Затемнение снизу: держит текст читаемым и заодно прячет
                   шов, который генератор оставил на своём градиенте. */
                .overlay {
                    LinearGradient(
                        colors: [.clear, Brand.grapeDeep.opacity(0.9), Brand.grapeDeep],
                        // начинаем выше середины: генератор оставил на своём
                        // градиенте горизонтальный шов, и растушёвка должна
                        // накрыть его, а не начаться под ним
                        startPoint: UnitPoint(x: 0.5, y: 0.34),
                        endPoint: .bottom
                    )
                }

            VStack(alignment: .leading, spacing: 10) {
                Text(slide.title)
                    .font(.system(size: 27, weight: .bold))
                    .foregroundStyle(.white)

                Text(slide.text)
                    .font(.system(size: 16))
                    .lineSpacing(3)
                    .foregroundStyle(.white.opacity(0.78))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 28)
            // место под точки и кнопку, которые лежат поверх
            .padding(.bottom, 200)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .ignoresSafeArea()
    }

    private var controls: some View {
        VStack(spacing: 18) {
            HStack(spacing: 7) {
                ForEach(slides) { slide in
                    Capsule()
                        .fill(slide.id == page ? Brand.lime : Color.white.opacity(0.28))
                        // текущая точка вытягивается в чёрточку: так видно
                        // не только «где я», но и «сколько осталось»
                        .frame(width: slide.id == page ? 20 : 7, height: 7)
                }
            }
            .animation(.spring(response: 0.35, dampingFraction: 0.8), value: page)

            Button(page == slides.count - 1 ? L("common.start") : L("common.next")) {
                if page == slides.count - 1 {
                    onDone()
                } else {
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { page += 1 }
                }
            }
            .buttonStyle(LimeButton())
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 28)
    }
}

/// Показывали ли уже.
///
/// Флаг локальный, а не серверный: онбординг объясняет устройство
/// приложения, а не состояние бизнеса. Поставил второй телефон — увидел
/// объяснение заново, и это правильно.
enum Onboarding {
    private static let key = "tetr.onboarding.seen"

    static var seen: Bool {
        get { UserDefaults.standard.bool(forKey: key) }
        set { UserDefaults.standard.set(newValue, forKey: key) }
    }
}
