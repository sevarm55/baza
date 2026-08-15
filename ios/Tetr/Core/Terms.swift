import Foundation

/**
 * Заводские слова бизнеса на трёх языках.
 *
 * Ровно то же самое, что `lib/i18n/terms.ts` на сайте, и таблицы обязаны
 * совпадать: «мойщик» в браузере и «мойщик» в приложении — одно слово, а
 * не два похожих.
 *
 * Почему это лежит в приложении, а не приходит готовым с сервера.
 * Сервер и правда отдаёт термины на языке телефона — в `/bootstrap`
 * по заголовку `Accept-Language`. Но полагаться на это нельзя по двум
 * причинам, и обе видны на площадке:
 *
 *  — язык переключают внутри приложения, а термины уже лежат в сессии.
 *    Без пере-запроса на экране остаётся прежний язык: русский интерфейс
 *    и «մեքենա» на главной кнопке. Ровно так это и выглядело;
 *  — мойщик работает без связи. Пере-запрос в этот момент не проходит,
 *    и кнопка записи осталась бы на чужом языке до возвращения сети.
 *
 * Поэтому перевод делается на месте, из того, что уже есть. Сервер при
 * этом остаётся источником правды: если он прислал слово, которого мы не
 * знаем, — значит, владелец придумал его сам, и мы показываем его как
 * есть, на любом языке.
 *
 * Правило то же, что на сайте: переводим ровно то, что совпадает с
 * заводским значением ниши. Совпало — это наша подпись. Не совпало —
 * слово владельца, и трогать его нельзя.
 */
enum Terms {
    /// Формы одного слова. Те же поля, что у `Forms` в terms.ts.
    struct Forms {
        /// Именительный единственного: «машина».
        let nom: String
        /// Винительный: «Добавить машину».
        let acc: String
        /// Множественное для заголовка столбца, где числа рядом нет.
        let many: String
        /**
         * Слово в форме, которую требует число, — но без самого числа.
         *
         * Для плиток: цифра нарисована крупно сверху, подпись мелко
         * снизу, и в строку они не склеиваются. Но читаются вместе, и
         * «6 машины» глаз ловит как опечатку.
         */
        let word: (Int) -> String
        /// «0 машин», «1 машина», «22 машины».
        let count: (Int) -> String
    }

    // ─────────────────────────── правила языка ───────────────────────────

    /// Три формы русского после числительного.
    private static func plRu(_ n: Int, _ one: String, _ few: String, _ many: String) -> String {
        let abs = Swift.abs(n) % 100
        let last = abs % 10
        if abs > 10 && abs < 20 { return many }
        if last == 1 { return one }
        if (2...4).contains(last) { return few }
        return many
    }

    /// После числительного армянский всегда ставит единственное: «5 մեքենա».
    private static func hyUnit(_ word: String) -> Forms {
        Forms(nom: word, acc: word, many: word, word: { _ in word }, count: { "\($0) \(word)" })
    }

    private static func ruUnit(_ one: String, _ acc: String, _ few: String, _ many: String) -> Forms {
        let form = { (n: Int) in plRu(n, one, few, many) }
        return Forms(nom: one, acc: acc, many: few, word: form, count: { "\($0) \(form($0))" })
    }

    private static func enUnit(_ one: String, _ many: String) -> Forms {
        let form = { (n: Int) in Swift.abs(n) == 1 ? one : many }
        return Forms(nom: one, acc: one, many: many, word: form, count: { "\($0) \(form($0))" })
    }

    // ─────────────────────────── таблицы ───────────────────────────

    /// Единицы учёта. Ключ — заводское слово из `NICHES[*].unitOne`.
    private static let units: [String: [Lang: Forms]] = [
        "մեքենա": [
            .hy: hyUnit("մեքենա"),
            .ru: ruUnit("машина", "машину", "машины", "машин"),
            .en: enUnit("car", "cars"),
        ],
        "ընդունելություն": [
            .hy: hyUnit("ընդունելություն"),
            .ru: ruUnit("приём", "приём", "приёма", "приёмов"),
            .en: enUnit("visit", "visits"),
        ],
        "պատվեր": [
            .hy: hyUnit("պատվեր"),
            .ru: ruUnit("заказ", "заказ", "заказа", "заказов"),
            .en: enUnit("order", "orders"),
        ],
        "հաճախորդ": [
            .hy: hyUnit("հաճախորդ"),
            .ru: ruUnit("клиент", "клиента", "клиента", "клиентов"),
            .en: enUnit("client", "clients"),
        ],
        "այց": [
            .hy: hyUnit("այց"),
            .ru: ruUnit("визит", "визит", "визита", "визитов"),
            .en: enUnit("visit", "visits"),
        ],
    ]

    /// Как зовут исполнителя. Ключ — заводское `NICHES[*].staffRole`.
    private static let staffRoles: [String: [Lang: Forms]] = [
        "Լվացող": [
            .hy: hyUnit("Լվացող"),
            .ru: ruUnit("Мойщик", "Мойщика", "Мойщика", "Мойщиков"),
            .en: enUnit("Washer", "Washers"),
        ],
        "Բժիշկ": [
            .hy: hyUnit("Բժիշկ"),
            .ru: ruUnit("Врач", "Врача", "Врача", "Врачей"),
            .en: enUnit("Doctor", "Doctors"),
        ],
        "Վարպետ": [
            .hy: hyUnit("Վարպետ"),
            .ru: ruUnit("Мастер", "Мастера", "Мастера", "Мастеров"),
            .en: enUnit("Mechanic", "Mechanics"),
        ],
        "Բարբեր": [
            .hy: hyUnit("Բարբեր"),
            .ru: ruUnit("Барбер", "Барбера", "Барбера", "Барберов"),
            .en: enUnit("Barber", "Barbers"),
        ],
        "Մաքրող": [
            .hy: hyUnit("Մաքրող"),
            .ru: ruUnit("Клинер", "Клинера", "Клинера", "Клинеров"),
            .en: enUnit("Cleaner", "Cleaners"),
        ],
    ]

    /// По чему узнают клиента. Ключ — заводское `NICHES[*].clientIdLabel`.
    private static let clientIdLabels: [String: [Lang: String]] = [
        "Պետհամարանիշ": [.hy: "Պետհամարանիշ", .ru: "Госномер", .en: "Plate"],
        "Հիվանդի հեռախոս": [.hy: "Հիվանդի հեռախոս", .ru: "Телефон пациента", .en: "Patient's phone"],
        "Հաճախորդի հեռախոս": [.hy: "Հաճախորդի հեռախոս", .ru: "Телефон клиента", .en: "Client's phone"],
        "Պատվիրատուի հեռախոս": [.hy: "Պատվիրատուի հեռախոս", .ru: "Телефон заказчика", .en: "Customer's phone"],
        "Տիրոջ հեռախոս": [.hy: "Տիրոջ հեռախոս", .ru: "Телефон владельца", .en: "Owner's phone"],
    ]

    /**
     * Обратный указатель: любая известная форма → заводской ключ.
     *
     * Нужен потому, что слово может прийти уже переведённым — сервер
     * отдаёт термины на языке заголовка, и в сессии лежит «машина», а не
     * «մեքենա». Без обратного поиска переключение на английский после
     * русского оставило бы «машина» навсегда: в таблице такого ключа нет.
     */
    private static let unitKeys = reverse(units)
    private static let staffKeys = reverse(staffRoles)
    private static let clientIdKeys: [String: String] = {
        var out: [String: String] = [:]
        for (key, byLang) in clientIdLabels {
            out[key] = key
            for word in byLang.values where out[word] == nil { out[word] = key }
        }
        return out
    }()

    private static func reverse(_ table: [String: [Lang: Forms]]) -> [String: String] {
        var out: [String: String] = [:]
        for (key, byLang) in table {
            out[key] = key
            for forms in byLang.values {
                for form in [forms.nom, forms.acc, forms.many] where out[form] == nil { out[form] = key }
            }
        }
        return out
    }

    // ─────────────────────────── доступ ───────────────────────────

    private static func forms(
        _ table: [String: [Lang: Forms]],
        _ keys: [String: String],
        _ value: String
    ) -> Forms {
        let raw = value.trimmingCharacters(in: .whitespaces)
        if let key = keys[raw], let found = table[key]?[LangStore.currentLang] { return found }
        /* Слово владельца: во всех формах оно само. Склонять чужое слово
           нельзя — «5 тачкы» хуже, чем «5 тачка», а придумывать за
           человека множественное число мы права не имеем. */
        return Forms(nom: raw, acc: raw, many: raw, word: { _ in raw }, count: { "\($0) \(raw)" })
    }

    /// Единица учёта во всех формах: «машина» / «машину» / «машины».
    static func unit(_ value: String) -> Forms {
        forms(units, unitKeys, value)
    }

    /// Исполнитель во всех формах: «Мойщик» / «Мойщика» / «Мойщики».
    static func staff(_ value: String) -> Forms {
        forms(staffRoles, staffKeys, value)
    }

    /// «3 машины» — единственный правильный способ поставить число рядом.
    ///
    /// Склейка `"\(n) \(tenant.unitOne)"` давала по-русски «0 машина», и
    /// это читалось опечаткой, а не нулём.
    static func units(_ n: Int, _ value: String) -> String {
        unit(value).count(n)
    }

    /// Слово под числом плитки: «6» сверху, «машин» снизу.
    static func unitWord(_ n: Int, _ value: String) -> String {
        unit(value).word(n)
    }

    /// «3 мойщика» — счёт людей, а не подпись столбца.
    static func staff(_ n: Int, _ value: String) -> String {
        staff(value).count(n).lowercased(with: LangStore.currentLang.locale)
    }

    /// По чему узнают клиента: «Госномер», «Телефон клиента».
    static func clientId(_ value: String) -> String {
        let raw = value.trimmingCharacters(in: .whitespaces)
        guard let key = clientIdKeys[raw], let found = clientIdLabels[key]?[LangStore.currentLang]
        else { return value }
        return found
    }
}
