package com.sevarm.tetr.core.i18n

import kotlin.math.absoluteValue

/**
 * Заводские слова бизнеса на трёх языках.
 *
 * Ровно то же самое, что `lib/i18n/terms.ts` на сайте и `Terms.swift` в
 * iOS, и таблицы обязаны совпадать: «мойщик» в браузере и «мойщик» в
 * приложении — одно слово, а не два похожих.
 *
 * Почему это лежит в приложении, а не приходит готовым с сервера. Сервер и
 * правда отдаёт термины на языке заголовка — в `/bootstrap` по
 * `Accept-Language`. Но полагаться на это нельзя по двум причинам, и обе
 * видны на площадке:
 *
 *  — язык переключают внутри приложения, а термины уже лежат в сессии.
 *    Без пере-запроса на экране остаётся прежний язык: русский интерфейс
 *    и «մեքենա» на главной кнопке;
 *  — мойщик работает без связи. Пере-запрос в этот момент не проходит, и
 *    кнопка записи осталась бы на чужом языке до возвращения сети.
 *
 * Правило то же, что на сайте: переводим ровно то, что совпадает с
 * заводским значением ниши. Совпало — это наша подпись. Не совпало —
 * слово владельца, и трогать его нельзя.
 */
object Terms {

    /** Формы одного слова. Те же поля, что у `Forms` в terms.ts. */
    class Forms(
        /** Именительный единственного: «машина». */
        val nom: String,
        /** Винительный: «Добавить машину». */
        val acc: String,
        /** Множественное для заголовка столбца, где числа рядом нет. */
        val many: String,
        /**
         * Слово в форме, которую требует число, — но без самого числа.
         *
         * Для плиток: цифра нарисована крупно сверху, подпись мелко снизу,
         * и в строку они не склеиваются. Но читаются вместе, и «6 машины»
         * глаз ловит как опечатку.
         */
        val word: (Int) -> String,
        /** «0 машин», «1 машина», «22 машины». */
        val count: (Int) -> String,
    )

    // ─────────────────────────── правила языка ───────────────────────────

    /** Три формы русского после числительного. */
    private fun plRu(n: Int, one: String, few: String, many: String): String {
        val abs = n.absoluteValue % 100
        val last = abs % 10
        if (abs in 11..19) return many
        if (last == 1) return one
        if (last in 2..4) return few
        return many
    }

    /** После числительного армянский всегда ставит единственное: «5 մեքենա». */
    private fun hyUnit(word: String) = Forms(word, word, word, { word }, { "$it $word" })

    private fun ruUnit(one: String, acc: String, few: String, many: String): Forms {
        val form = { n: Int -> plRu(n, one, few, many) }
        return Forms(one, acc, few, form, { "$it ${form(it)}" })
    }

    private fun enUnit(one: String, many: String): Forms {
        val form = { n: Int -> if (n.absoluteValue == 1) one else many }
        return Forms(one, one, many, form, { "$it ${form(it)}" })
    }

    // ─────────────────────────── таблицы ───────────────────────────

    /** Единицы учёта. Ключ — заводское слово из `NICHES[*].unitOne`. */
    private val units: Map<String, Map<Lang, Forms>> = mapOf(
        "մեքենա" to mapOf(
            Lang.HY to hyUnit("մեքենա"),
            Lang.RU to ruUnit("машина", "машину", "машины", "машин"),
            Lang.EN to enUnit("car", "cars"),
        ),
        "ընդունելություն" to mapOf(
            Lang.HY to hyUnit("ընդունելություն"),
            Lang.RU to ruUnit("приём", "приём", "приёма", "приёмов"),
            Lang.EN to enUnit("visit", "visits"),
        ),
        "պատվեր" to mapOf(
            Lang.HY to hyUnit("պատվեր"),
            Lang.RU to ruUnit("заказ", "заказ", "заказа", "заказов"),
            Lang.EN to enUnit("order", "orders"),
        ),
        "հաճախորդ" to mapOf(
            Lang.HY to hyUnit("հաճախորդ"),
            Lang.RU to ruUnit("клиент", "клиента", "клиента", "клиентов"),
            Lang.EN to enUnit("client", "clients"),
        ),
        "այց" to mapOf(
            Lang.HY to hyUnit("այց"),
            Lang.RU to ruUnit("визит", "визит", "визита", "визитов"),
            Lang.EN to enUnit("visit", "visits"),
        ),
    )

    /** Как зовут исполнителя. Ключ — заводское `NICHES[*].staffRole`. */
    private val staffRoles: Map<String, Map<Lang, Forms>> = mapOf(
        "Լվացող" to mapOf(
            Lang.HY to hyUnit("Լվացող"),
            Lang.RU to ruUnit("Мойщик", "Мойщика", "Мойщика", "Мойщиков"),
            Lang.EN to enUnit("Washer", "Washers"),
        ),
        "Բժիշկ" to mapOf(
            Lang.HY to hyUnit("Բժիշկ"),
            Lang.RU to ruUnit("Врач", "Врача", "Врача", "Врачей"),
            Lang.EN to enUnit("Doctor", "Doctors"),
        ),
        "Վարպետ" to mapOf(
            Lang.HY to hyUnit("Վարպետ"),
            Lang.RU to ruUnit("Мастер", "Мастера", "Мастера", "Мастеров"),
            Lang.EN to enUnit("Mechanic", "Mechanics"),
        ),
        "Բարբեր" to mapOf(
            Lang.HY to hyUnit("Բարբեր"),
            Lang.RU to ruUnit("Барбер", "Барбера", "Барбера", "Барберов"),
            Lang.EN to enUnit("Barber", "Barbers"),
        ),
        "Մաքրող" to mapOf(
            Lang.HY to hyUnit("Մաքրող"),
            Lang.RU to ruUnit("Клинер", "Клинера", "Клинера", "Клинеров"),
            Lang.EN to enUnit("Cleaner", "Cleaners"),
        ),
    )

    /** По чему узнают клиента. Ключ — заводское `NICHES[*].clientIdLabel`. */
    private val clientIdLabels: Map<String, Map<Lang, String>> = mapOf(
        "Պետհամարանիշ" to mapOf(Lang.HY to "Պետհամարանիշ", Lang.RU to "Госномер", Lang.EN to "Plate"),
        "Հիվանդի հեռախոս" to mapOf(
            Lang.HY to "Հիվանդի հեռախոս", Lang.RU to "Телефон пациента", Lang.EN to "Patient's phone",
        ),
        "Հաճախորդի հեռախոս" to mapOf(
            Lang.HY to "Հաճախորդի հեռախոս", Lang.RU to "Телефон клиента", Lang.EN to "Client's phone",
        ),
        "Պատվիրատուի հեռախոս" to mapOf(
            Lang.HY to "Պատվիրատուի հեռախոս", Lang.RU to "Телефон заказчика", Lang.EN to "Customer's phone",
        ),
        "Տիրոջ հեռախոս" to mapOf(
            Lang.HY to "Տիրոջ հեռախոս", Lang.RU to "Телефон владельца", Lang.EN to "Owner's phone",
        ),
    )

    /**
     * Обратный указатель: любая известная форма → заводской ключ.
     *
     * Нужен потому, что слово может прийти уже переведённым — сервер отдаёт
     * термины на языке заголовка, и в сессии лежит «машина», а не «մեքենա».
     * Без обратного поиска переключение на английский после русского
     * оставило бы «машина» навсегда: в таблице такого ключа нет.
     */
    /**
     * Названия заводских услуг. Ключ — заводское имя из конфига ниши.
     *
     * Прайс нового бизнеса кладёт регистрация, и на русском экране
     * «Կոմպլեքս» читался чужой надписью посреди своего: человек этих пяти
     * строк не заводил, а поменять их язык не мог.
     *
     * Переводится ровно то, что совпало с конфигом ниши. «Мойка дисков»,
     * заведённая владельцем, проходит насквозь и остаётся его словом на
     * всех трёх языках — придумывать за человека перевод его собственного
     * слова мы права не имеем.
     *
     * Таблица обязана совпадать с `SERVICE_NAMES` в `lib/i18n/terms.ts` и с
     * той же таблицей в iOS. Своей копией она заведена не от небрежности:
     * язык переключают внутри приложения, а мойщик работает без связи, и
     * ждать нового ответа сервера там нечего.
     */
    private val serviceNames: Map<String, Map<Lang, String>> = mapOf(
        // Автомойка
        "Կոմպլեքս" to mapOf(Lang.HY to "Կոմպլեքս", Lang.RU to "Комплекс", Lang.EN to "Full wash"),
        "Թափք" to mapOf(Lang.HY to "Թափք", Lang.RU to "Кузов", Lang.EN to "Body"),
        "Սալոն" to mapOf(Lang.HY to "Սալոն", Lang.RU to "Салон", Lang.EN to "Interior"),
        "Քիմմաքրում" to mapOf(Lang.HY to "Քիմմաքրում", Lang.RU to "Химчистка", Lang.EN to "Deep clean"),
        "Փայլեցում" to mapOf(Lang.HY to "Փայլեցում", Lang.RU to "Полировка", Lang.EN to "Polish"),
        // Стоматология
        "Զննում" to mapOf(Lang.HY to "Զննում", Lang.RU to "Осмотр", Lang.EN to "Checkup"),
        "Մաքրում" to mapOf(Lang.HY to "Մաքրում", Lang.RU to "Чистка", Lang.EN to "Cleaning"),
        "Պլոմբ" to mapOf(Lang.HY to "Պլոմբ", Lang.RU to "Пломба", Lang.EN to "Filling"),
        "Հեռացում" to mapOf(Lang.HY to "Հեռացում", Lang.RU to "Удаление", Lang.EN to "Extraction"),
        "Իմպլանտ" to mapOf(Lang.HY to "Իմպլանտ", Lang.RU to "Имплант", Lang.EN to "Implant"),
        // Автосервис
        "Յուղի փոխարինում" to mapOf(Lang.HY to "Յուղի փոխարինում", Lang.RU to "Замена масла", Lang.EN to "Oil change"),
        "Ախտորոշում" to mapOf(Lang.HY to "Ախտորոշում", Lang.RU to "Диагностика", Lang.EN to "Diagnostics"),
        "Արգելակներ" to mapOf(Lang.HY to "Արգելակներ", Lang.RU to "Тормоза", Lang.EN to "Brakes"),
        "Կախոց" to mapOf(Lang.HY to "Կախոց", Lang.RU to "Подвеска", Lang.EN to "Suspension"),
        "Անվադողերի փոխարինում" to mapOf(Lang.HY to "Անվադողերի փոխարինում", Lang.RU to "Шиномонтаж", Lang.EN to "Tire change"),
        // Барбершоп
        "Սանրվածք" to mapOf(Lang.HY to "Սանրվածք", Lang.RU to "Стрижка", Lang.EN to "Haircut"),
        "Մորուք" to mapOf(Lang.HY to "Մորուք", Lang.RU to "Борода", Lang.EN to "Beard"),
        "Մանկական" to mapOf(Lang.HY to "Մանկական", Lang.RU to "Детская", Lang.EN to "Kids"),
        "Սափրում" to mapOf(Lang.HY to "Սափրում", Lang.RU to "Бритьё", Lang.EN to "Shave"),
        // Клининг
        "Բնակարան" to mapOf(Lang.HY to "Բնակարան", Lang.RU to "Квартира", Lang.EN to "Apartment"),
        "Գրասենյակ" to mapOf(Lang.HY to "Գրասենյակ", Lang.RU to "Офис", Lang.EN to "Office"),
        "Գլխավոր մաքրում" to mapOf(Lang.HY to "Գլխավոր մաքրում", Lang.RU to "Генеральная уборка", Lang.EN to "Deep cleaning"),
        "Վերանորոգումից հետո" to mapOf(Lang.HY to "Վերանորոգումից հետո", Lang.RU to "После ремонта", Lang.EN to "After renovation"),
        "Պատուհաններ" to mapOf(Lang.HY to "Պատուհաններ", Lang.RU to "Окна", Lang.EN to "Windows"),
        // Ветклиника
        "Ընդունելություն" to mapOf(Lang.HY to "Ընդունելություն", Lang.RU to "Приём", Lang.EN to "Visit"),
        "Պատվաստում" to mapOf(Lang.HY to "Պատվաստում", Lang.RU to "Вакцинация", Lang.EN to "Vaccination"),
        "Ուլտրաձայն" to mapOf(Lang.HY to "Ուլտրաձայն", Lang.RU to "УЗИ", Lang.EN to "Ultrasound"),
        "Ստերիլիզացիա" to mapOf(Lang.HY to "Ստերիլիզացիա", Lang.RU to "Стерилизация", Lang.EN to "Spaying"),
        "Խուզում" to mapOf(Lang.HY to "Խուզում", Lang.RU to "Груминг", Lang.EN to "Grooming"),
    )

    private val unitKeys = reverse(units)
    private val staffKeys = reverse(staffRoles)
    private val clientIdKeys: Map<String, String> = buildMap {
        for ((key, byLang) in clientIdLabels) {
            put(key, key)
            for (word in byLang.values) putIfAbsent(word, key)
        }
    }

    /*
     * Услугу правят руками: открыл прайс на русском, поменял цену и
     * сохранил — на сервер ушло «Комплекс». Обратный указатель узнаёт её и
     * в этом виде, поэтому армянский экран после такой правки не остаётся с
     * русским словом.
     */
    private val serviceKeys: Map<String, String> = buildMap {
        for ((key, byLang) in serviceNames) {
            put(key, key)
            for (word in byLang.values) putIfAbsent(word, key)
        }
    }

    private fun reverse(table: Map<String, Map<Lang, Forms>>): Map<String, String> = buildMap {
        for ((key, byLang) in table) {
            put(key, key)
            for (forms in byLang.values) {
                for (form in listOf(forms.nom, forms.acc, forms.many)) putIfAbsent(form, key)
            }
        }
    }

    // ─────────────────────────── доступ ───────────────────────────

    private fun forms(
        table: Map<String, Map<Lang, Forms>>,
        keys: Map<String, String>,
        value: String,
        lang: Lang,
    ): Forms {
        val raw = value.trim()
        keys[raw]?.let { key -> table[key]?.get(lang)?.let { return it } }
        /*
         * Слово владельца: во всех формах оно само. Склонять чужое слово
         * нельзя — «5 тачкы» хуже, чем «5 тачка», а придумывать за человека
         * множественное число мы права не имеем.
         */
        return Forms(raw, raw, raw, { raw }, { "$it $raw" })
    }

    /** Разделитель, которым сервер склеивает услуги одной записи. */
    private const val SERVICE_JOIN = " + "

    /**
     * Название услуги: «Комплекс», «Кузов».
     *
     * Составное разбирается по частям: в записи их бывает две
     * («Կոմպլեքս + Թափք»), и одна может быть заводской, а вторая словом
     * владельца.
     */
    fun service(value: String, lang: Lang): String =
        if (!value.contains(SERVICE_JOIN)) {
            oneService(value, lang)
        } else {
            value.split(SERVICE_JOIN).joinToString(SERVICE_JOIN) { oneService(it, lang) }
        }

    private fun oneService(value: String, lang: Lang): String {
        val raw = value.trim()
        val key = serviceKeys[raw] ?: return value
        return serviceNames[key]?.get(lang) ?: value
    }

    /** Единица учёта во всех формах: «машина» / «машину» / «машины». */
    fun unit(value: String, lang: Lang): Forms = forms(units, unitKeys, value, lang)

    /** Исполнитель во всех формах: «Мойщик» / «Мойщика» / «Мойщики». */
    fun staff(value: String, lang: Lang): Forms = forms(staffRoles, staffKeys, value, lang)

    /**
     * «3 машины» — единственный правильный способ поставить число рядом.
     *
     * Склейка `"$n $unitOne"` давала по-русски «0 машина», и это читалось
     * опечаткой, а не нулём.
     */
    fun units(n: Int, value: String, lang: Lang): String = unit(value, lang).count(n)

    /** Слово под числом плитки: «6» сверху, «машин» снизу. */
    fun unitWord(n: Int, value: String, lang: Lang): String = unit(value, lang).word(n)

    /** «3 мойщика» — счёт людей, а не подпись столбца. */
    fun staffCount(n: Int, value: String, lang: Lang): String =
        staff(value, lang).count(n).lowercase(lang.locale)

    /** По чему узнают клиента: «Госномер», «Телефон клиента». */
    fun clientId(value: String, lang: Lang): String {
        val raw = value.trim()
        val key = clientIdKeys[raw] ?: return value
        return clientIdLabels[key]?.get(lang) ?: value
    }
}
