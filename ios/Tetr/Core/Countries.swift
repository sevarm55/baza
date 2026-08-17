import SwiftUI

/**
 * Код страны при вводе номера.
 *
 * ЗАЧЕМ. Поле было одним `TextField` с подсказкой «+374 77 123 456»:
 * человек с российским или грузинским номером должен был догадаться, что
 * плюс и код страны надо набрать самому, а тот, кто набрал восьмёрку или
 * ноль по привычке, получал отказ без объяснения. В кабинете код
 * выбирается списком с первого дня, и приложение осталось единственным
 * местом, где это надо было знать заранее.
 *
 * ЭТО НЕ ПРОВЕРКА НОМЕРА. Здесь только приставка к набранному и разбивка
 * на группы для глаза. Настоящий номер собирает и проверяет сервер
 * (`normalizePhone`, `isValidPhone` в `lib/phone.ts`) — тот же код и для
 * кабинета, и для приложения. Экранная строка ничего не гарантирует и
 * гарантировать не должна: клиент никогда не граница безопасности.
 *
 * Список повторяет `COUNTRIES` из `lib/phone.ts`. Повтор здесь
 * сознательный и узкий: это подсказка для пальца, а не правило. Если
 * страна появится на сервере, а сюда её не добавят, номер всё равно
 * примут — набранный с плюсом он уйдёт как есть.
 */
struct Country: Identifiable, Hashable {
    let code: String
    let dial: String
    let flag: String
    /// Сколько цифр в национальной части
    let length: Int
    /// Как выглядит здешний номер — подсказкой в пустом поле
    let example: String

    var id: String { code }

    /// Собрать то, что уйдёт на сервер. Он всё равно нормализует заново.
    func e164(_ typed: String) -> String {
        var digits = typed.filter(\.isNumber)

        /* Набранное вместе с кодом страны или с ведущим нулём — обычное
           дело: человек диктует номер так, как привык. Отрезаем то, что
           иначе уехало бы в национальную часть и сделало номер длиннее
           настоящего. */
        if digits.count > length {
            if digits.hasPrefix(dial) { digits = String(digits.dropFirst(dial.count)) }
            else if digits.hasPrefix("0") { digits = String(digits.dropFirst()) }
        }

        return "+\(dial)\(digits)"
    }
}

enum Countries {
    static let all: [Country] = [
        Country(code: "AM", dial: "374", flag: "🇦🇲", length: 8, example: "77 123 456"),
        Country(code: "RU", dial: "7", flag: "🇷🇺", length: 10, example: "912 345 67 89"),
        Country(code: "GE", dial: "995", flag: "🇬🇪", length: 9, example: "555 123 456"),
        Country(code: "AE", dial: "971", flag: "🇦🇪", length: 9, example: "50 123 4567"),
        Country(code: "US", dial: "1", flag: "🇺🇸", length: 10, example: "415 555 0123"),
    ]

    static let `default` = all[0]
}

/**
 * Поле телефона: код страны меню, номер — цифрами.
 *
 * Меню, а не колесо выбора: стран пять, и разворачивать ради них
 * барабан на пол-экрана незачем. Флаг здесь картинка; сущность —
 * телефонный код, и он написан рядом словами.
 */
struct CountryPhoneField: View {
    @Binding var country: Country
    @Binding var number: String

    var body: some View {
        HStack(spacing: 10) {
            Menu {
                Picker("", selection: $country) {
                    ForEach(Countries.all) { c in
                        Text("\(c.flag) \(c.code) +\(c.dial)").tag(c)
                    }
                }
            } label: {
                HStack(spacing: 4) {
                    Text(country.flag)
                    Text("+\(country.dial)")
                        .font(.system(size: 17, weight: .semibold))
                        .monospacedDigit()
                    Image(systemName: "chevron.down")
                        .font(.system(size: 10, weight: .bold))
                }
                .foregroundStyle(Brand.onBoard)
            }
            .accessibilityLabel(L("auth.country"))

            TextField(country.example, text: $number)
                .keyboardType(.phonePad)
                .textContentType(.telephoneNumber)
                .font(.system(size: 17, weight: .medium))
                .monospacedDigit()
                .accessibilityLabel(L("auth.phone"))
                /* Поле НЕ переписывается на каждом нажатии, и это не
                   лень, а исправленная ошибка: разбивка на группы прямо
                   во время набора возвращала в поле новую строку после
                   каждой цифры, и цифры, набранные быстро, терялись — из
                   восьми доезжало пять. Здесь только отсекается лишнее,
                   и пока человек набирает цифры, поле не трогают вовсе.
                   Красивую разбивку показывает подсказка в пустом поле,
                   а собирает номер `e164` при отправке. */
                .onChange(of: number) { _, v in
                    let clean = String(v.filter(\.isNumber).prefix(country.length))
                    if clean != v { number = clean }
                }
        }
    }
}
