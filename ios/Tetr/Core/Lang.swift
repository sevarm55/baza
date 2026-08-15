import Foundation
import SwiftUI

/**
 * Язык приложения.
 *
 * Три языка, армянский — исходный и запасной. Выбор человека лежит в
 * `UserDefaults` и переживает перезапуск; пока выбора нет, берётся язык
 * телефона, а если он не наш — армянский.
 *
 * Почему не системный механизм целиком. `Text("ключ")` в SwiftUI берёт
 * перевод из `Bundle.main`, а тот выбирает язык по настройкам ТЕЛЕФОНА и
 * внутри одного запуска не меняется. Продукту этого мало: язык
 * переключают в самом приложении, и переключение обязано работать сразу,
 * не выкидывая человека из открытой смены.
 *
 * Поэтому строки лежат в обычном строковом каталоге (`Localizable
 * .xcstrings`, компилируется в `hy.lproj/ru.lproj/en.lproj`), а берём мы
 * их из бандла ВЫБРАННОГО языка. Это не обход системы: `.lproj` —
 * штатный способ хранения, и `Bundle(path:)` для него — штатный доступ.
 * Никакой подмены классов, никакого свизлинга.
 *
 * `AppleLanguages` в `UserDefaults` мы тоже переставляем — ради того, что
 * рисуем не мы: кнопки системных листов, форматы дат по умолчанию,
 * заголовок «Отмена» в системном алерте. Оно вступает в силу со
 * следующего запуска, и это честно: сам продукт переключается сразу, а
 * системные подписи — когда система их перечитает.
 */
enum Lang: String, CaseIterable, Sendable {
    case hy
    case ru
    case en

    /// Как язык называется сам на себе.
    ///
    /// Не переводится и не заменяется флагом: флаг — это страна, а не
    /// язык. Человек, случайно попавший в чужой язык, ищет глазами своё
    /// слово, а перевода чужого он не прочтёт.
    var ownName: String {
        switch self {
        case .hy: return "Հայերեն"
        case .ru: return "Русский"
        case .en: return "English"
        }
    }

    /// Локаль для дат, чисел и регистра.
    ///
    /// Английский — американский: он даёт «August 16», а британский
    /// «16 August». Порядок «месяц число» и есть та форма, которую ждёт
    /// англоязычный читатель под цифрой.
    var locale: Locale {
        switch self {
        case .hy: return Locale(identifier: "hy_AM")
        case .ru: return Locale(identifier: "ru_RU")
        case .en: return Locale(identifier: "en_US")
        }
    }

    /// Разделитель разрядов и дробной части.
    ///
    /// Считаем сами, а не через `NumberFormatter`, по той же причине, что
    /// и на сайте: сумма обязана выглядеть одинаково в приложении и в
    /// браузере до символа. Армянский и русский пишут одинаково —
    /// неразрывный пробел и запятая; английский иначе.
    var groupSeparator: String { self == .en ? "," : "\u{00A0}" }
    var decimalSeparator: String { self == .en ? "." : "," }
}

/// Текущий язык и его переключение.
@MainActor
final class LangStore: ObservableObject {
    static let shared = LangStore()

    private static let key = "tetr.lang"

    @Published private(set) var current: Lang

    private init() {
        LangStore.current = LangStore.resolveAtLaunch()
        current = LangStore.current
    }

    /**
     * Первый запуск.
     *
     * Порядок: выбор человека → язык телефона, если он наш → армянский.
     * Спрашивать на первом экране нечего: у мойщика на площадке стоит
     * клиент, и вопрос про язык там не к месту.
     */
    private static func resolveAtLaunch() -> Lang {
        if let saved = UserDefaults.standard.string(forKey: key), let lang = Lang(rawValue: saved) {
            return lang
        }
        for tag in Locale.preferredLanguages {
            let base = tag.split(whereSeparator: { $0 == "-" || $0 == "_" }).first.map(String.init) ?? tag
            if let lang = Lang(rawValue: base.lowercased()) { return lang }
        }
        return .hy
    }

    /**
     * Переключить язык.
     *
     * Публикация `current` перерисовывает дерево целиком: у корневого
     * вида стоит `.id(lang.current)`, поэтому новые строки берутся сразу,
     * а не на следующем открытии экрана.
     */
    func set(_ lang: Lang) {
        guard lang != current else { return }
        UserDefaults.standard.set(lang.rawValue, forKey: LangStore.key)
        /* Для системных подписей — тех, что рисуем не мы. Вступит в силу
           со следующего запуска; продукт при этом переключается сразу. */
        UserDefaults.standard.set([lang.rawValue], forKey: "AppleLanguages")
        LangStore.current = lang
        current = lang
    }

    /* -------------------------------------------------------------- */

    /// Текущий язык вне SwiftUI — из него берут строки `L(_:)` и деньги.
    ///
    /// `nonisolated(unsafe)` здесь честно: пишется значение только на
    /// главном потоке из `set(_:)`, а читается одно слово перечисления.
    nonisolated(unsafe) fileprivate static var current: Lang = .hy {
        didSet { bundleCache = nil }
    }

    /// То же самое для тех, кому нужен не текст, а разделитель разрядов
    /// или локаль форматтера.
    nonisolated static var currentLang: Lang { current }

    #if DEBUG
    /// Переключение языка для проверок `--self-test`, без UserDefaults.
    nonisolated static func testOnlySet(_ lang: Lang) { current = lang }
    #endif

    nonisolated(unsafe) private static var bundleCache: Bundle?

    /// Бандл выбранного языка. Нет такого — берём общий: пустой экран
    /// хуже, чем экран на армянском.
    nonisolated fileprivate static var bundle: Bundle {
        if let cached = bundleCache { return cached }
        let path = Bundle.main.path(forResource: current.rawValue, ofType: "lproj")
        let found = path.flatMap(Bundle.init(path:)) ?? Bundle.main
        bundleCache = found
        return found
    }
}

/**
 * Строка интерфейса по ключу.
 *
 * Единственный способ достать текст. Ключ семантический
 * (`work.startShift`), а не сам армянский текст: иначе правка исходной
 * формулировки ломала бы все переводы разом.
 *
 * Ключа нет ни в одном языке — вернётся сам ключ, и это видно глазом на
 * первом же прогоне. Ключа нет в выбранном языке, но есть в армянском —
 * вернётся армянский: показать человеку `payroll.paySum` нельзя ни при
 * каких обстоятельствах.
 */
func L(_ key: String) -> String {
    let value = LangStore.bundle.localizedString(forKey: key, value: nil, table: nil)
    if value != key { return value }

    // запасной язык продукта
    guard
        let path = Bundle.main.path(forResource: "hy", ofType: "lproj"),
        let hy = Bundle(path: path)
    else { return value }
    return hy.localizedString(forKey: key, value: nil, table: nil)
}

/**
 * Одна и та же строка во всех трёх языках.
 *
 * Нужна там, где надо узнать НАШЕ слово в данных, а не показать своё.
 * Пример: значок расхода подбирается по названию категории, а название
 * лежит в базе на том языке, на котором его завели, — русский владелец
 * увидел бы конверт вместо крана только потому, что переключил язык.
 */
func LAll(_ key: String) -> [String] {
    Lang.allCases.compactMap { lang in
        Bundle.main.path(forResource: lang.rawValue, ofType: "lproj")
            .flatMap(Bundle.init(path:))?
            .localizedString(forKey: key, value: nil, table: nil)
    }
}

/// Строка с подстановками: `L("work.since", at)`.
func L(_ key: String, _ args: CVarArg...) -> String {
    String(format: L(key), locale: LangStore.current.locale, arguments: args)
}

/**
 * Форма слова по числу.
 *
 * Строковый каталог умеет это сам, через `stringsdict`-варианты, но
 * только когда строку достаёт `NSLocalizedString` с числом в формате.
 * Здесь тот же путь: ключ содержит `%lld`, а варианты по количеству
 * лежат в каталоге у каждого языка своими — три формы у русского, две у
 * английского, одна у армянского (после числительного он всегда ставит
 * единственное: «5 օր», а не «5 օրեր»).
 */
func Ln(_ key: String, _ count: Int) -> String {
    String(format: L(key), locale: LangStore.current.locale, count)
}

/**
 * Даты на языке интерфейса.
 *
 * Имена месяцев и дней недели больше нигде не выписаны руками. Три
 * списка по двенадцать слов пришлось бы держать в трёх местах и на трёх
 * языках, а система знает их для всех локалей сразу — и знает, что
 * по-русски «16 августа», а по-английски «August 16», то есть меняется
 * не только слово, но и порядок.
 *
 * Форматтеры собираются на каждый вызов намеренно: они дёшевы рядом с
 * отрисовкой экрана, а кэш пришлось бы сбрасывать при смене языка — то
 * есть заводить ещё одно место, где язык можно забыть обновить.
 */
enum LocalDate {
    /// «16 օգոստոսի» / «16 августа» / «August 16».
    static func longDay(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = LangStore.currentLang.locale
        f.setLocalizedDateFormatFromTemplate("d MMMM")
        return f.string(from: date)
    }

    /// То же с годом — для дат не этого года.
    static func longDayYear(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = LangStore.currentLang.locale
        f.setLocalizedDateFormatFromTemplate("d MMMM y")
        return f.string(from: date)
    }

    /// «օգոստոս 2026» / «август 2026» / «August 2026» — заголовок месяца.
    static func monthYear(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = LangStore.currentLang.locale
        f.setLocalizedDateFormatFromTemplate("LLLL y")
        return f.string(from: date)
    }

    /// Короткие имена дней недели, начиная с понедельника.
    ///
    /// Понедельник первым задан явно: календарь продукта рисует неделю
    /// так во всех языках, а `firstWeekday` у английской локали
    /// воскресенье, и сетка разъехалась бы на один столбец.
    static var shortWeekdays: [String] {
        let f = DateFormatter()
        f.locale = LangStore.currentLang.locale
        let names = f.shortWeekdaySymbols ?? []
        guard names.count == 7 else { return names }
        return Array(names[1...6]) + [names[0]]
    }

    /// Дата из «2026-08-16» — полднем, чтобы не съехать в соседние сутки.
    static func fromYMD(_ value: String) -> Date? {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.date(from: value).map { $0.addingTimeInterval(12 * 3600) }
    }

    /// Дата из «2026-08» — первым числом месяца.
    static func fromYM(_ value: String) -> Date? {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM"
        return f.date(from: value)
    }
}

/// Язык для окружения SwiftUI — форматы дат и чисел внутри дерева.
extension View {
    func applyLanguage(_ lang: Lang) -> some View {
        environment(\.locale, lang.locale).id(lang)
    }
}
