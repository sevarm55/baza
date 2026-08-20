package com.sevarm.tetr.core.i18n

import android.content.Context
import android.content.SharedPreferences
import android.content.res.Configuration
import android.content.res.Resources
import androidx.annotation.PluralsRes
import androidx.annotation.StringRes
import androidx.appcompat.app.AppCompatDelegate
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.core.os.LocaleListCompat
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.util.Locale

/**
 * Язык приложения.
 *
 * Три языка, армянский — исходный и запасной. Выбор человека переживает
 * перезапуск; пока выбора нет, берётся язык телефона, а если он не наш —
 * армянский.
 *
 * Почему не только системный механизм. `AppCompatDelegate.setApplicationLocales`
 * пересоздаёт Activity — то есть переключение языка выкидывало бы человека
 * из открытой формы с набранным номером машины. Продукту этого мало: язык
 * переключают в самом приложении, и переключение обязано работать сразу и
 * без потери ввода.
 *
 * Поэтому строки берутся из `Resources` ВЫБРАННОГО языка, собранных
 * через `createConfigurationContext` — штатный способ, без подмены классов.
 * Системную локаль мы тоже переставляем, но ради того, что рисуем не мы:
 * выбор даты, системные диалоги разрешений, формат в шторке уведомлений.
 */
enum class Lang(val code: String) {
    HY("hy"),
    RU("ru"),
    EN("en");

    /**
     * Как язык называется сам на себе.
     *
     * Не переводится и не заменяется флагом: флаг — это страна, а не язык.
     * Человек, случайно попавший в чужой язык, ищет глазами своё слово, а
     * перевода чужого он не прочтёт.
     */
    val ownName: String
        get() = when (this) {
            HY -> "Հայերեն"
            RU -> "Русский"
            EN -> "English"
        }

    /**
     * Локаль для дат, чисел и регистра.
     *
     * Английский — американский: он даёт «August 16», а британский
     * «16 August». Порядок «месяц число» и есть та форма, которую ждёт
     * англоязычный читатель под цифрой.
     */
    val locale: Locale
        get() = when (this) {
            HY -> Locale.forLanguageTag("hy-AM")
            RU -> Locale.forLanguageTag("ru-RU")
            EN -> Locale.forLanguageTag("en-US")
        }

    /**
     * Разделитель разрядов и дробной части.
     *
     * Считаем сами, а не через системный форматтер, по той же причине, что
     * и на сайте: сумма обязана выглядеть одинаково в приложении и в
     * браузере до символа. Армянский и русский пишут одинаково —
     * неразрывный пробел и запятая; английский иначе.
     */
    val groupSeparator: String get() = if (this == EN) "," else "\u00A0"
    val decimalSeparator: String get() = if (this == EN) "." else ","

    companion object {
        fun of(code: String?): Lang? = entries.firstOrNull { it.code == code?.lowercase() }
    }
}

/**
 * Текущий язык и его переключение.
 *
 * Один объект на приложение, как `LangStore` в iOS.
 */
class LangStore(private val app: Context) {

    private val prefs: SharedPreferences =
        app.getSharedPreferences("tetr.lang", Context.MODE_PRIVATE)

    private val _current = MutableStateFlow(resolveAtLaunch())
    val current: StateFlow<Lang> = _current

    /**
     * Первый запуск.
     *
     * Порядок: выбор человека → язык телефона, если он наш → армянский.
     * Спрашивать на первом экране нечего: у мойщика на площадке стоит
     * клиент, и вопрос про язык там не к месту.
     */
    private fun resolveAtLaunch(): Lang {
        Lang.of(prefs.getString(KEY, null))?.let { return it }

        val system = Resources.getSystem().configuration.locales
        for (i in 0 until system.size()) {
            Lang.of(system[i].language)?.let { return it }
        }
        return Lang.HY
    }

    fun set(lang: Lang) {
        if (lang == _current.value) return
        prefs.edit().putString(KEY, lang.code).apply()
        Strings.use(app, lang)
        _current.value = lang
        /*
         * Системная локаль — ради того, что рисуем не мы. На Android 13+
         * это переживает перезапуск само; ниже — держится в AppCompat.
         */
        AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(lang.code))
    }

    /** Поднять словарь до первой отрисовки: `L()` зовут и вне Compose. */
    fun warmUp() {
        Strings.use(app, _current.value)
        AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(_current.value.code))
    }

    private companion object {
        const val KEY = "lang"
    }
}

/**
 * Словарь выбранного языка.
 *
 * Держим глобально, потому что строки нужны не только видам: заголовок
 * уведомления собирается в сервисе, ошибка запроса — во ViewModel, слово
 * ниши — в чистой функции без всякого контекста. Ровно так же устроен
 * `L(_:)` в iOS.
 */
object Strings {
    @Volatile
    private var res: Resources? = null

    fun use(context: Context, lang: Lang) {
        val config = Configuration(context.resources.configuration)
        config.setLocale(lang.locale)
        res = context.createConfigurationContext(config).resources
    }

    fun resources(): Resources =
        res ?: error("Strings.use() не позвали до первого обращения")

    fun ready(): Boolean = res != null
}

/** Строка интерфейса по ключу. Единственный способ достать текст. */
fun L(@StringRes id: Int): String = Strings.resources().getString(id)

/** Строка с подстановками: `L(R.string.work__since, at)`. */
fun L(@StringRes id: Int, vararg args: Any): String = Strings.resources().getString(id, *args)

/**
 * Форма слова по числу.
 *
 * Варианты лежат в каталоге у каждого языка своими — три формы у русского,
 * две у английского, одна у армянского (после числительного он всегда
 * ставит единственное: «5 օր», а не «5 օրեր»).
 */
fun Ln(@PluralsRes id: Int, count: Int): String =
    Strings.resources().getQuantityString(id, count, count)

/**
 * Одна и та же строка во всех трёх языках.
 *
 * Нужна там, где надо узнать НАШЕ слово в данных, а не показать своё.
 * Пример: значок расхода подбирается по названию категории, а название
 * лежит в базе на том языке, на котором его завели, — русский владелец
 * увидел бы конверт вместо крана только потому, что переключил язык.
 */
fun LAll(context: Context, @StringRes id: Int): List<String> = Lang.entries.map { lang ->
    val config = Configuration(context.resources.configuration)
    config.setLocale(lang.locale)
    context.createConfigurationContext(config).resources.getString(id)
}

/**
 * Язык внутри дерева видов.
 *
 * Корневой вид пересобирается по нему целиком (`key(lang)`), поэтому
 * новые строки встают на место сразу, а не на следующем открытии экрана.
 */
val LocalLang = staticCompositionLocalOf { Lang.HY }

@Composable
fun currentLang(): Lang = LocalLang.current
