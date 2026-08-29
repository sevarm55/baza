import SwiftUI

/**
 * Поле для кода — PIN или код из SMS — клетками.
 *
 * ГЛАВНОЕ РЕШЕНИЕ ТО ЖЕ, ЧТО В КАБИНЕТЕ: клеток шесть, а поле одно.
 *
 * Шесть отдельных полей — самый частый способ сделать такое и самый
 * плохой. VoiceOver произносит шесть безымянных полей вместо одного
 * кода; вставка из буфера попадает в первую клетку и обрезается; забой
 * через границу клетки не работает; а на iOS автоподстановка кода из
 * SMS кладёт ВЕСЬ код в первую клетку, и `oneTimeCode` перестаёт
 * работать вовсе — то есть ломается ровно то, ради чего этот экран и
 * переделывали.
 *
 * Здесь настоящее поле ровно одно, прозрачное, во всю площадь ряда, а
 * клетки под ним — картинка. Поэтому само собой работает всё, что
 * работает у обычного поля: вставка, забой, выделение, автоподстановка
 * из SMS, аппаратная клавиатура, Dynamic Type.
 *
 * Клетки набраны цветами экрана входа: он тёмно-фиолетовый при любой
 * теме телефона, и «утопленная» клетка на нём — это белый в малой доле,
 * а не серый из палитры кабинета.
 */
struct CodeCells<Field: Hashable>: View {
    /**
     * На каком полотне стоят клетки.
     *
     * Вход тёмно-фиолетовый при любой теме телефона, и его клетки —
     * белый в малой доле. Листы кабинета стоят на светлом табло, и тем
     * же клеткам там нужны краски поверхности: до этого кабинетные
     * экраны кода рисовали голый `TextField("••••••")`, второй,
     * несовместимый ввод кода в одном продукте.
     */
    enum Skin { case dark, board }

    @Binding var text: String
    /**
     * Фокус остаётся у экрана, а не заводится внутри.
     *
     * Экран входа сам решает, куда поставить курсор: пришли на шаг кода
     * — в код, вернулись к PIN — в PIN. Если бы клетки держали
     * собственный фокус, эти решения перестали бы доходить, и
     * клавиатура не открывалась бы сама ни на одном шаге — а это
     * лишнее нажатие в движении, которое повторяют каждый день.
     */
    var focus: FocusState<Field?>.Binding
    var field: Field
    /// Сколько клеток. Шесть у кода из SMS и у нового PIN.
    var length: Int
    /// Подпись для VoiceOver: ряд озвучивается как одно поле.
    var label: String
    /// Имя для UI-тестов. Стоит на НАСТОЯЩЕМ поле, а не на ряду клеток:
    /// тест ищет `textFields[...]`, и на группе он его не находит.
    var identifier: String?
    /// Прятать ли набранное. У PIN — да, у кода из SMS — нет: код и так
    /// только что пришёл человеку в открытом сообщении.
    var secure: Bool = false
    /// Системная подсказка автозаполнения.
    var contentType: UITextContentType?
    /// Полотно под клетками. По умолчанию тёмный вход.
    var skin: Skin = .dark
    /// Набрали последнюю цифру. У входа этим отправляют форму, чтобы не
    /// заставлять тянуться к кнопке ради движения, которое повторяют
    /// каждый день.
    var onComplete: (() -> Void)?

    private var focused: Bool { focus.wrappedValue == field }

    private let cellHeight: CGFloat = 52

    var body: some View {
        ZStack {
            /* Клетки — картинка, и читалке экрана их видеть незачем:
               озвучивать шесть безымянных прямоугольников вместо одного
               поля кода это ровно та беда, ради которой всё и сделано
               одним полем. */
            HStack(spacing: 7) {
                ForEach(0..<length, id: \.self) { i in
                    cell(at: i)
                }
            }
            .accessibilityHidden(true)

            /* Настоящее поле поверх ряда: прозрачное, без курсора и без
               выделения. Нажатие в любое место ряда открывает
               клавиатуру, потому что нажимают именно в него. */
            TextField("", text: $text)
                .keyboardType(.numberPad)
                .textContentType(contentType)
                .focused(focus, equals: field)
                .foregroundStyle(.clear)
                .tint(.clear)
                .accentColor(.clear)
                .frame(height: cellHeight)
                .contentShape(Rectangle())
                .accessibilityLabel(label)
                .accessibilityValue(L("auth.entered", text.count, length))
                .accessibilityIdentifier(identifier ?? "")
                .onChange(of: text) { _, value in
                    let clean = String(value.filter(\.isNumber).prefix(length))
                    if clean != text { text = clean }
                    if clean.count == length { onComplete?() }
                }
        }
        .onTapGesture { focus.wrappedValue = field }
    }

    @ViewBuilder
    private func cell(at index: Int) -> some View {
        let chars = Array(text)
        let filled = index < chars.count
        /* Клетка, куда попадёт следующая цифра. Когда набрано всё,
           подсвечиваем последнюю: иначе подсветка уезжает за ряд и
           «сюда пишут» не показано нигде. */
        let active = focused && index == min(chars.count, length - 1)

        RoundedRectangle(cornerRadius: 14, style: .continuous)
            .fill(skin == .dark
                ? Color.white.opacity(filled ? 0.18 : 0.08)
                : Brand.boardControl.opacity(filled ? 1 : 0.55))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(
                        active
                            ? (skin == .dark ? Brand.lime : Brand.grape)
                            : (skin == .dark
                                ? Color.white.opacity(filled ? 0.34 : 0.18)
                                : Brand.boardInk.opacity(filled ? 0.22 : 0.10)),
                        lineWidth: active ? 2 : 1
                    )
            )
            .frame(height: cellHeight)
            .overlay {
                if filled {
                    /* Точка вместо цифры у PIN — то же, что делает
                       системный `SecureField`, и та же причина: код от
                       входа читают через плечо. */
                    if secure {
                        Circle()
                            .fill(skin == .dark ? Color.white : Brand.onBoard)
                            .frame(width: 9, height: 9)
                    } else {
                        Text(String(chars[index]))
                            .font(.system(size: 21, weight: .bold))
                            .monospacedDigit()
                            .foregroundStyle(skin == .dark ? Color.white : Brand.onBoard)
                    }
                }
            }
            .animation(.easeOut(duration: 0.14), value: filled)
            .animation(.easeOut(duration: 0.14), value: active)
    }
}
