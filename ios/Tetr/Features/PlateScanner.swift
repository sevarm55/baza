import SwiftUI
import VisionKit

/// Разбор номера из того, что увидела камера.
///
/// Отдельно от экрана и без UIKit — чтобы проверять её можно было
/// обычными тестами, а не наводя телефон на машину.
///
/// Armenian формат: две цифры, две буквы, три цифры — 12 AB 345.
/// Камера читает это как текст и ошибается предсказуемо: O вместо нуля,
/// I вместо единицы, S вместо пятёрки. Ошибается она ровно там, где буква
/// и цифра похожи, и позиция в номере говорит, что из них правильно.
/// Без этой поправки сканер бесполезен: «77FF477» приезжает как «7TFF4T7».
enum PlateReader {
    /// Похоже ли на номер и как он выглядит в нормальном виде.
    static func parse(_ raw: String) -> String? {
        let cleaned = raw.uppercased().filter { $0.isLetter || $0.isNumber }
        guard cleaned.count == 7 else { return nil }

        let chars = Array(cleaned)
        var out = ""

        for (i, c) in chars.enumerated() {
            // позиции 0,1 и 4,5,6 — цифры; 2,3 — буквы
            let wantsDigit = i < 2 || i >= 4
            out.append(wantsDigit ? asDigit(c) : asLetter(c))
        }

        let fixed = Array(out)
        let digitsOk = fixed[0].isNumber && fixed[1].isNumber
            && fixed[4].isNumber && fixed[5].isNumber && fixed[6].isNumber
        let lettersOk = fixed[2].isLetter && fixed[3].isLetter
        guard digitsOk && lettersOk else { return nil }

        return "\(out.prefix(2)) \(out.dropFirst(2).prefix(2)) \(out.suffix(3))"
    }

    private static func asDigit(_ c: Character) -> Character {
        switch c {
        case "O", "Q", "D": return "0"
        case "I", "L", "T": return "1"
        case "Z": return "2"
        case "S": return "5"
        case "G": return "6"
        case "B": return "8"
        default: return c
        }
    }

    private static func asLetter(_ c: Character) -> Character {
        switch c {
        case "0": return "O"
        case "1": return "I"
        case "5": return "S"
        case "8": return "B"
        case "6": return "G"
        default: return c
        }
    }
}

/// Экран сканера.
///
/// Ручной ввод остаётся рядом всегда: номер бывает грязный, гнутый или
/// вовсе иностранный, и заставлять человека воевать с камерой вместо
/// восьми символов — худшее, что можно сделать.
struct PlateScannerView: UIViewControllerRepresentable {
    let onFound: (String) -> Void

    static var isAvailable: Bool {
        DataScannerViewController.isSupported && DataScannerViewController.isAvailable
    }

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.text()],
            qualityLevel: .accurate,
            recognizesMultipleItems: true,
            isHighFrameRateTrackingEnabled: false,
            isHighlightingEnabled: true
        )
        scanner.delegate = context.coordinator
        try? scanner.startScanning()
        return scanner
    }

    func updateUIViewController(_ controller: DataScannerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onFound: onFound)
    }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        private let onFound: (String) -> Void
        private var done = false

        init(onFound: @escaping (String) -> Void) {
            self.onFound = onFound
        }

        /// Берём первое, что похоже на номер, и закрываемся.
        ///
        /// В кадре почти всегда есть и другой текст — марка, реклама на
        /// стене, наклейка. Поэтому фильтр по формату, а не «самый крупный
        /// текст»: тот сплошь и рядом оказывается вывеской мойки.
        func dataScanner(
            _ scanner: DataScannerViewController,
            didAdd added: [RecognizedItem],
            allItems: [RecognizedItem]
        ) {
            guard !done else { return }
            for item in allItems {
                guard case let .text(text) = item else { continue }
                if let plate = PlateReader.parse(text.transcript) {
                    done = true
                    onFound(plate)
                    return
                }
            }
        }
    }
}
