package com.sevarm.tetr.core.i18n

import android.text.format.DateFormat
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.time.temporal.ChronoUnit
import java.util.Locale

/**
 * Даты на языке интерфейса и в поясе бизнеса.
 *
 * Имена месяцев и дней недели нигде не выписаны руками. Три списка по
 * двенадцать слов пришлось бы держать в трёх местах и на трёх языках, а
 * система знает их для всех локалей сразу — и знает, что по-русски
 * «16 августа», а по-английски «August 16», то есть меняется не только
 * слово, но и порядок.
 *
 * Пояс — всегда пояс мойки, а не устройства. Владелец в поездке иначе
 * увидит смену, начатую в шесть утра, и день, который на мойке ещё не
 * кончился.
 */
object Dates {

    /** Пояс бизнеса. Нет или неизвестен — берём системный. */
    fun zone(timezone: String?): ZoneId = runCatching {
        timezone?.let { ZoneId.of(it) }
    }.getOrNull() ?: ZoneId.systemDefault()

    /**
     * Шаблон, а не жёсткий формат.
     *
     * `getBestDateTimePattern` — это ICU-скелет: «dMMMM» превращается в
     * «d MMMM» по-русски и «MMMM d» по-английски. Жёсткая строка дала бы
     * английскому читателю «16 August», то есть чужой порядок.
     */
    private fun pattern(skeleton: String, lang: Lang): String =
        DateFormat.getBestDateTimePattern(lang.locale, skeleton)

    private fun formatter(skeleton: String, lang: Lang, zone: ZoneId): DateTimeFormatter =
        DateTimeFormatter.ofPattern(pattern(skeleton, lang), lang.locale).withZone(zone)

    private fun exact(format: String, lang: Lang, zone: ZoneId): DateTimeFormatter =
        DateTimeFormatter.ofPattern(format, lang.locale).withZone(zone)

    /** «16 օգոստոսի» / «16 августа» / «August 16». */
    fun longDay(at: Instant, lang: Lang, zone: ZoneId = ZoneId.systemDefault()): String =
        formatter("dMMMM", lang, zone).format(at)

    /** То же с годом — для дат не этого года. */
    /**
     * «շաբաթ» / «суббота» / «Saturday».
     *
     * Нужен карточке дня: владелец помнит не число, а «та суббота, когда
     * было много», и без дня недели дата из истории ни с чем не связана.
     */
    fun weekday(at: Instant, lang: Lang, zone: ZoneId = ZoneId.systemDefault()): String =
        formatter("EEEE", lang, zone).format(at)

    /** То же по ключу дня «2026-08-16», как его присылает сервер. */
    fun weekdayKey(day: String, lang: Lang): String {
        val date = fromYMD(day) ?: return ""
        return DateTimeFormatter.ofPattern(pattern("EEEE", lang), lang.locale).format(date)
    }

    fun longDayYear(at: Instant, lang: Lang, zone: ZoneId = ZoneId.systemDefault()): String =
        formatter("dMMMMy", lang, zone).format(at)

    /** «օգոստոս 2026» / «август 2026» / «August 2026» — заголовок месяца. */
    fun monthYear(month: YearMonth, lang: Lang): String {
        val f = DateTimeFormatter.ofPattern(pattern("LLLLy", lang), lang.locale)
        return f.format(month.atDay(1))
    }

    /** Одно имя месяца: для жёлоба выбора в отчёте. */
    fun monthName(at: Instant, lang: Lang, zone: ZoneId): String =
        DateTimeFormatter.ofPattern(pattern("LLLL", lang), lang.locale).withZone(zone).format(at)

    /**
     * Короткое имя месяца: подпись столбика на графике отчёта.
     *
     * Полное имя под столбиком шириной в палец не встаёт, а шесть
     * обрезанных подписей подряд читаются хуже, чем шесть коротких.
     */
    fun monthShort(at: Instant, lang: Lang, zone: ZoneId): String =
        DateTimeFormatter.ofPattern(pattern("LLL", lang), lang.locale).withZone(zone).format(at)

    /** «HH:mm» в поясе мойки. */
    fun clock(at: Instant, lang: Lang, zone: ZoneId): String =
        exact("HH:mm", lang, zone).format(at)

    /** «14 օգս, 12:25» — короткая отметка о выдаче в строке. */
    fun stamp(at: Instant, lang: Lang, zone: ZoneId): String =
        formatter("dMMMHHmm", lang, zone).format(at)

    /**
     * Короткие имена дней недели, начиная с понедельника.
     *
     * Понедельник первым задан явно: календарь продукта рисует неделю так
     * во всех языках, а у английской локали первый день воскресенье, и
     * сетка разъехалась бы на один столбец.
     */
    fun shortWeekdays(lang: Lang): List<String> = (1..7).map { iso ->
        java.time.DayOfWeek.of(iso).getDisplayName(TextStyle.SHORT_STANDALONE, lang.locale)
    }

    /** `YYYY-MM-DD` момента в поясе мойки. */
    fun dayKey(at: Instant, zone: ZoneId): String =
        DateTimeFormatter.ofPattern("yyyy-MM-dd", Locale.US).withZone(zone).format(at)

    /** `YYYY-MM` момента в поясе мойки. */
    fun monthKey(at: Instant, zone: ZoneId): String =
        DateTimeFormatter.ofPattern("yyyy-MM", Locale.US).withZone(zone).format(at)

    /** «2026-08-16» → дата. Пустая строка и мусор дают null. */
    fun fromYMD(value: String): LocalDate? = runCatching { LocalDate.parse(value) }.getOrNull()

    /** «2026-08» → месяц. */
    fun fromYM(value: String): YearMonth? = runCatching { YearMonth.parse(value) }.getOrNull()

    /**
     * `2026-08-13` → «13 օգոստոսի».
     *
     * Число словом, а не «13.08»: экран зарплат различает рабочий день и
     * день выплаты, и точки в обеих датах эту разницу стирают. Год
     * появляется, только когда он не текущий.
     */
    fun longDayKey(day: String, lang: Lang, zone: ZoneId, today: Instant = Instant.now()): String {
        val date = fromYMD(day) ?: return day
        val thisYear = ZonedDateTime.ofInstant(today, zone).year
        val skeleton = if (date.year == thisYear) "dMMMM" else "dMMMMy"
        val f = DateTimeFormatter.ofPattern(pattern(skeleton, lang), lang.locale)
        return f.format(date)
    }

    /** Сегодня ли этот момент по календарю мойки. */
    fun isToday(at: Instant, zone: ZoneId, now: Instant = Instant.now()): Boolean =
        dayKey(at, zone) == dayKey(now, zone)

    fun isYesterday(at: Instant, zone: ZoneId, now: Instant = Instant.now()): Boolean =
        dayKey(at, zone) == dayKey(now.minus(1, ChronoUnit.DAYS), zone)
}
