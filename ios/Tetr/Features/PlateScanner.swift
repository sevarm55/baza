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
    /// Единая форма для ручного ввода, камеры, очереди и поиска.
    /// Если это не армянский госномер, сохраняем введённый идентификатор,
    /// только убирая случайные края и повторные пробелы.
    static func canonical(_ raw: String) -> String {
        if let plate = parse(raw) { return plate }
        return raw
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .uppercased()
            .split(whereSeparator: { $0.isWhitespace })
            .joined(separator: " ")
    }

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

/**
 * Видоискатель.
 *
 * Он больше не решает за человека. Раньше первый же распознанный номер
 * закрывал экран — камера срабатывала молча, и если она ошиблась, человек
 * узнавал об этом уже в поле ввода. Теперь вид только сообщает наружу, что
 * сейчас видит, а решение принимает экран поверх него.
 *
 * Ручной ввод остаётся рядом всегда: номер бывает грязный, гнутый или вовсе
 * иностранный, и заставлять человека воевать с камерой вместо восьми
 * символов — худшее, что можно сделать.
 */
struct PlateScannerView: UIViewControllerRepresentable {
    /// Что камера видит прямо сейчас. `nil` — ничего похожего на номер.
    @Binding var candidate: String?

    static var isAvailable: Bool {
        DataScannerViewController.isSupported && DataScannerViewController.isAvailable
    }

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.text()],
            qualityLevel: .accurate,
            recognizesMultipleItems: true,
            isHighFrameRateTrackingEnabled: false,
            // Подсветку системы выключили: рамка вокруг каждой строки текста
            // в кадре спорит с собственной рамкой прицела и превращает
            // видоискатель в кашу из прямоугольников.
            isHighlightingEnabled: false
        )
        scanner.delegate = context.coordinator
        try? scanner.startScanning()
        return scanner
    }

    func updateUIViewController(_ controller: DataScannerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator { found in candidate = found }
    }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        private let report: (String?) -> Void
        private var last: String?

        init(report: @escaping (String?) -> Void) {
            self.report = report
        }

        /* Все три события ведут в одно место и пересчитывают кандидата из
           полного списка. По одному `didAdd` этого не сделать: номер,
           уехавший из кадра, приходит в `didRemove`, и без него на экране
           навсегда оставался бы номер прошлой машины. */
        func dataScanner(_ s: DataScannerViewController, didAdd a: [RecognizedItem], allItems all: [RecognizedItem]) {
            recompute(all)
        }

        func dataScanner(_ s: DataScannerViewController, didUpdate u: [RecognizedItem], allItems all: [RecognizedItem]) {
            recompute(all)
        }

        func dataScanner(_ s: DataScannerViewController, didRemove r: [RecognizedItem], allItems all: [RecognizedItem]) {
            recompute(all)
        }

        /// Первое, что похоже на номер.
        ///
        /// В кадре почти всегда есть и другой текст — марка, реклама на
        /// стене, наклейка. Поэтому фильтр по формату, а не «самый крупный
        /// текст»: тот сплошь и рядом оказывается вывеской мойки.
        private func recompute(_ items: [RecognizedItem]) {
            var found: String?
            for item in items {
                guard case let .text(text) = item else { continue }
                if let plate = PlateReader.parse(text.transcript) {
                    found = plate
                    break
                }
            }
            guard found != last else { return }
            last = found
            report(found)
        }
    }
}

/**
 * Встроенная камера.
 *
 * Не отдельный экран, а нижняя часть той же страницы: поле ввода остаётся
 * на месте сверху, под ним раскрывается кадр. Полноэкранная камера уводила
 * человека со страницы и возвращала обратно — два перехода там, где нужно
 * было показать одну картинку, и на возврате страница успевала перекраситься
 * в тёмное вслед за камерой.
 *
 * Тёмная здесь только сама панель. Тему приложения она не трогает: это
 * чёрная карточка на светлой странице, а не тёмный экран.
 *
 * Главное решение — **затвор с обратным отсчётом**. Прежний сканер
 * срабатывал молча на первом же распознанном номере: если он ошибался,
 * человек узнавал об этом уже в поле ввода. Теперь узнанный номер сначала
 * показывается, кольцо затвора заполняется за секунду с небольшим, и только
 * потом номер принимается. Видно, ЧТО будет принято, и есть время
 * остановить. Ждать не обязательно: касание затвора принимает сразу.
 */
struct PlateCameraPanel: View {
    let onFound: (String) -> Void
    let onManual: () -> Void
    let onClose: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var candidate: String?
    /// Заполнение кольца затвора: 0 — пусто, 1 — принято.
    @State private var fill: CGFloat = 0

    /// Сколько номер показывается, прежде чем будет принят.
    private let hold: Double = 1.2

    var body: some View {
        VStack(spacing: 0) {
            viewfinder
            controls
        }
        .background(Color.black, in: .rect(cornerRadius: 26))
        /* Отсчёт привязан к самому номеру, а не к таймеру: сменился
           кандидат — задача снимается и заводится заново, пропал — не
           остаётся висеть. Обратный отсчёт, переживший уход номера из
           кадра, принял бы то, чего в кадре уже нет. */
        .task(id: candidate) {
            fill = 0
            guard let plate = candidate else { return }
            withAnimation(reduceMotion ? nil : .linear(duration: hold)) { fill = 1 }
            try? await Task.sleep(nanoseconds: UInt64(hold * 1_000_000_000))
            guard !Task.isCancelled else { return }
            accept(plate)
        }
    }

    private var viewfinder: some View {
        ZStack {
            if PlateScannerView.isAvailable {
                PlateScannerView(candidate: $candidate)
            } else {
                // Камеры нет — панель всё равно не должна быть чёрной дырой.
                VStack(spacing: 10) {
                    Image(systemName: "camera.metering.unknown")
                        .font(.system(size: 26))
                    Text("Տեսախցիկը հասանելի չէ")
                        .font(.system(size: 13))
                }
                .foregroundStyle(.white.opacity(0.6))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }

            // Прицел: рамка не по всему кадру, а по той полосе, куда кладут
            // номер. Она не обрезает распознавание — она говорит, куда
            // целиться, и этого достаточно.
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(.white.opacity(candidate == nil ? 0.5 : 0), lineWidth: 1.5)
                .frame(height: 84)
                .padding(.horizontal, 34)
                .animation(.easeOut(duration: 0.2), value: candidate == nil)

            if let candidate {
                Text(candidate)
                    .font(.system(size: 24, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Brand.onLime)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 9)
                    .background(Brand.lime, in: .capsule)
                    .transition(.scale(scale: 0.8).combined(with: .opacity))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipShape(.rect(cornerRadius: 26))
        .animation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.8), value: candidate)
    }

    private var controls: some View {
        HStack {
            round("xmark", label: "Փակել տեսախցիկը", action: onClose)
            Spacer()
            shutter
            Spacer()
            round("keyboard", label: "Ձեռքով") {
                onManual()
                onClose()
            }
        }
        .padding(.horizontal, 26)
        .padding(.vertical, 14)
    }

    /**
     * Затвор. Кольцо вокруг него — это и есть обратный отсчёт: пока оно
     * заполняется, номер ещё можно не принять, уведя камеру.
     */
    private var shutter: some View {
        Button {
            if let candidate { accept(candidate) }
        } label: {
            ZStack {
                Circle()
                    .stroke(.white.opacity(0.35), lineWidth: 3)
                    .frame(width: 66, height: 66)
                Circle()
                    .trim(from: 0, to: fill)
                    .stroke(Brand.lime, style: .init(lineWidth: 3, lineCap: .round))
                    .frame(width: 66, height: 66)
                    .rotationEffect(.degrees(-90))
                Circle()
                    .fill(candidate == nil ? Color.white.opacity(0.35) : Brand.lime)
                    .frame(width: 54, height: 54)
            }
        }
        .buttonStyle(.plain)
        .disabled(candidate == nil)
        .accessibilityLabel("Ընդունել")
        .accessibilityValue(candidate ?? "")
        .animation(reduceMotion ? nil : .snappy(duration: 0.2), value: candidate == nil)
    }

    private func round(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 44, height: 44)
                .background(.white.opacity(0.16), in: .circle)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private func accept(_ plate: String) {
        // Толчок в руку: мокрыми руками экран смотрят вполглаза, и звука
        // затвора у сканера нет.
        UIImpactFeedbackGenerator(style: .rigid).impactOccurred()
        onFound(plate)
    }
}
