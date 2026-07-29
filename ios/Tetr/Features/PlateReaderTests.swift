#if DEBUG
import Foundation

/// Проверка разбора номера.
///
/// Не XCTest намеренно: цель — чтобы разбор можно было прогнать одной
/// командой вместе с остальными проверками продукта, а не поднимая
/// тестовый таргет и симулятор. Вызывается из `--self-test`.
///
/// Проверяется ровно то, ради чего этот код существует: камера путает
/// букву с цифрой, и позиция в номере решает, что из них правильно.
enum PlateReaderTests {
    static func run() -> Int {
        var failed = 0

        func check(_ name: String, _ got: String?, _ want: String?) {
            if got == want {
                print("  ok   \(name)")
            } else {
                failed += 1
                print("  FAIL \(name): получили \(got ?? "nil"), ждали \(want ?? "nil")")
            }
        }

        check("чистый номер", PlateReader.parse("77FF477"), "77 FF 477")
        check("с пробелами", PlateReader.parse("12 AB 345"), "12 AB 345")
        check("в нижнем регистре", PlateReader.parse("34ss567"), "34 SS 567")
        check("с дефисом", PlateReader.parse("34-SS-567"), "34 SS 567")

        // то, ради чего всё и написано: камера читает 0 как O, 1 как I
        check("O вместо нуля в цифрах", PlateReader.parse("O7FF477"), "07 FF 477")
        check("I вместо единицы", PlateReader.parse("I2AB345"), "12 AB 345")
        check("S вместо пятёрки в хвосте", PlateReader.parse("34AB56S"), "34 AB 565")
        check("и наоборот: 0 в буквах становится O", PlateReader.parse("77 0B 477"), "77 OB 477")

        // мусор в кадре не должен приезжать как номер
        check("короткое отвергается", PlateReader.parse("77FF"), nil)
        check("длинное отвергается", PlateReader.parse("77FF4777"), nil)
        check("вывеска отвергается", PlateReader.parse("AVANGARD"), nil)
        check("пустое отвергается", PlateReader.parse(""), nil)

        print(failed == 0 ? "\nразбор номера: все проверки пройдены\n"
                          : "\nразбор номера: \(failed) провалено\n")
        return failed
    }
}
#endif
