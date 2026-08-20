package com.sevarm.tetr.design

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

/**
 * Цвета марки — те же, что в вебе и в iOS.
 *
 * Разделение труда между ними не вкусовое, а вынужденное: лайм почти
 * предел яркости, и по светлому фону даёт контраст 1.06 — линия или
 * подпись этим цветом просто не видны. Поэтому лайм живёт только заливкой
 * под тёмный текст, а всё структурное держит грейп.
 *
 * Тема системы меняет ОКРУЖЕНИЕ, а не марку: грейп и лайм одинаковы при
 * любом свете, потому что это она и есть. Меняются холст, бумага, линии и
 * чернила — то, на чём марка лежит.
 */
class Palette(private val dark: Boolean) {

    private fun pick(light: Long, night: Long) = Color(if (dark) night else light)

    /* Марка одинакова в обеих темах. */
    val grapeFill = Color(0xFF6D28D9)
    val grapeDeep = Color(0xFF2E1065)
    val grapeMid = Color(0xFF4C1D95)
    val lime = Color(0xFFD7FF00)
    val onLime = Color(0xFF2E1065)

    /**
     * Грейп как ТЕКСТ на тёмном фоне тонет — там он светлеет.
     * Как заливка кнопки остаётся прежним: белый по нему читается
     * одинаково на любой теме.
     */
    val grape = pick(0xFF6D28D9, 0xFFA78BFA)

    val ink = pick(0xFF1A1626, 0xFFF7F5FB)
    val muted = pick(0xFF56506B, 0xFFA9A2BD)
    val line = pick(0xFFE5E2EC, 0xFF362F47)
    val bg = pick(0xFFFAF9FC, 0xFF120F1A)

    /** Карточка на холсте: белая бумага поверх кремовой. */
    val tile = pick(0xFFFFFFFF, 0xFF1A1626)

    /**
     * Табло. Почти чёрное в тёмной теме и почти белое в светлой — а плитки
     * на нём тёмные в обеих: их цвет несёт смысл и меняться от того,
     * светло в комнате или темно, не должен.
     */
    val board = pick(0xFFF3F2F0, 0xFF0A0A0C)
    val onBoard = pick(0xFF14121A, 0xFFF7F5FB)
    val boardMuted = pick(0xFF6B6577, 0xFF8E8899)

    /** Чернила табло для подложек: тёмные по светлому, светлые по тёмному. */
    val boardInk = pick(0xFF14121A, 0xFFF7F5FB)

    /**
     * Заливка поля ввода на карточке. Светлее подложки на светлой теме,
     * темнее — на тёмной: правило одно, поле не совпадает с тем, на чём
     * лежит, иначе его просто не видно.
     */
    val boardSurface = pick(0xFFFFFFFF, 0xFF1A191F)

    /**
     * Спокойные информационные поверхности. Это не новые акцентные цвета:
     * ими нельзя красить кнопки или состояние. Мята принадлежит объёму
     * работы, лаванда — денежному контексту, песок — расходам.
     */
    val mintCard = pick(0xFFE3EEE9, 0xFF152B27)
    val mintInk = pick(0xFF176B59, 0xFF78D8BF)
    val lavenderCard = pick(0xFFECE8F3, 0xFF282231)
    val lavenderInk = pick(0xFF66557F, 0xFFC9B8E3)
    val sandCard = pick(0xFFF1E9DC, 0xFF30271D)
    val sandInk = pick(0xFF8A5D24, 0xFFE2B776)

    /**
     * Невыбранная плашка переключателя периода.
     *
     * Тёплая, а не нейтрально-серая: полотно табло тёплое, и серый чип на
     * нём выглядит вырезанным из другого интерфейса.
     */
    val chipRest = pick(0xFFE7E2D8, 0xFF232029)

    val goodOnBoard = pick(0xFF0E8A5F, 0xFF34D399)
    val warnOnBoard = pick(0xFFB45309, 0xFFFBBF24)

    /**
     * Удаление и убыток.
     *
     * Долгое время красный значил ровно одно — «удалить», — и убыток ради
     * этого набирался жёлтым. Правило не окупилось: жёлтый на денежном
     * числе читается предупреждением, а не потерей, и «вы в минусе»
     * приходилось дочитывать словами.
     *
     * Убыток теперь красный, а спутать его с удалением нечего: удаление
     * всегда стоит на кнопке и подписано. Тот же тон, что у `--bad` в
     * вебе.
     */
    val badOnBoard = pick(0xFFDC2626, 0xFFF87171)
    val good = pick(0xFF047857, 0xFF34D399)

    /**
     * Цвет денежного числа по его знаку.
     *
     * Одно правило на все денежные экраны: убыток красным, заработок
     * зелёным. До этого знак красил каждый экран сам, и они успели
     * разойтись — на дне минус красился, в сводке нет. Расхождение в
     * окраске денег читается не как небрежность вёрстки, а как разная
     * арифметика.
     *
     * Ноль не красится ни во что: нулевой день это не потеря и не
     * заработок, подсвечивать в нём нечего. Зелёный ноль обещал бы, что
     * всё хорошо, хотя не заработано ничего.
     *
     * Цвет не остаётся единственным носителем смысла — рядом с числом
     * всегда стоит знак «−» и подпись словами. Того требует WCAG 1.4.1, и
     * того же требует мокрый телефон под солнцем, на котором оттенки не
     * различить.
     */
    fun sign(amount: Int): Color =
        if (amount < 0) badOnBoard else if (amount > 0) goodOnBoard else onBoard
    val warn = pick(0xFFB45309, 0xFFFBBF24)

    /**
     * Те же знаки, но НА ТЁМНОМ — и по теме системы они не адаптируются.
     * Ловушка простая: `warn` в светлой теме тёмно-оранжевый, а `good` —
     * тёмно-зелёный, и на грейповой заливке их обоих просто нет. Цвет
     * текста выбирается по цвету поверхности под ним, а не по теме.
     */
    val inkOnDark = Color.White
    val mutedOnDark = Color.White.copy(alpha = 0.72f)
    val goodOnDark = Color(0xFF34D399)
    val warnOnDark = Color(0xFFFBBF24)

    val heroGradient = Brush.linearGradient(listOf(grapeMid, grapeDeep))

    /**
     * Полотно заставки.
     *
     * Не плоская заливка и не диагональ. Плоский прямоугольник краски во
     * весь экран читается как «стили не загрузились», а диагональный
     * градиент уводит взгляд в угол — мимо фигуры, ради которой экран и
     * показан. Здесь свет идёт из центра, где стоит загрузчик, и гаснет
     * к краям.
     *
     * Разница между центром и краем меньше десяти процентов светлоты:
     * заставка обязана быть фоном для фигуры, а не рекламным экраном.
     */
    val splashGlow = Brush.radialGradient(
        colors = listOf(grapeFill.copy(alpha = 0.55f), grapeDeep.copy(alpha = 0f)),
        radius = 1200f,
    )

    /**
     * Цвет человека.
     *
     * Один и тот же работник всегда одного цвета — в ленте, в списке на
     * смене, в истории дня. Тогда «кто это помыл» читается по цвету, без
     * чтения имени: на мойке два-три человека, и глаз запоминает их за
     * день.
     *
     * Цвет берётся из имени, а не назначается: не нужно ни хранить его,
     * ни спрашивать, и он одинаков на всех устройствах.
     */
    fun person(name: String): Color {
        if (name.isEmpty()) return muted
        val i = hashOf(name) % PEOPLE.size
        return pick(PEOPLE[i].first, PEOPLE[i].second)
    }

    companion object {
        private val PEOPLE = listOf(
            0xFF0E7490L to 0xFF22D3EEL, // бирюзовый
            0xFFB45309L to 0xFFFBBF24L, // янтарный
            0xFFBE185DL to 0xFFF472B6L, // малиновый
            0xFF4D7C0FL to 0xFFA3E635L, // оливковый
            0xFF6D28D9L to 0xFFA78BFAL, // грейп
            0xFF0F766EL to 0xFF2DD4BFL, // морской
        )

        private val DEEP = listOf(0xFF0E7490L, 0xFF8A3F07L, 0xFF8E1245L, 0xFF3A5E0BL, 0xFF4C1D95L, 0xFF0F766EL)
        private val BRIGHT = listOf(0xFF22D3EEL, 0xFFFBBF24L, 0xFFF472B6L, 0xFFA3E635L, 0xFFA78BFAL, 0xFF2DD4BFL)

        /**
         * Простая устойчивая свёртка. Криптостойкость тут не нужна, нужна
         * одинаковость: имя всегда даёт один и тот же цвет — и здесь, и в
         * iOS, и в кабинете.
         */
        fun hashOf(name: String): Int {
            var hash = 0
            for (ch in name) hash = (hash * 31 + ch.code) and 0xFFFFFF
            return hash
        }

        /**
         * Тон плитки для конкретного человека.
         *
         * Палитра людей уже хранит по два значения на каждого — тёмное для
         * светлой темы и светлое для тёмной. Здесь они работают не как
         * «цвет по теме», а как заливка и свечение одной плитки: тёмное
         * вниз, светлое в угол. Поэтому у каждого мойщика своя плитка его
         * цветом, и лист зарплат перестаёт быть стопкой одинаковых карточек.
         */
        fun personTone(name: String): PersonTone {
            if (name.isEmpty()) return PersonTone(Color(0xFF22212A), Color(0xFF8B88A8))
            val i = hashOf(name) % DEEP.size
            return PersonTone(Color(DEEP[i]), Color(BRIGHT[i]))
        }
    }
}

data class PersonTone(val base: Color, val glow: Color)

val LocalPalette = staticCompositionLocalOf { Palette(dark = false) }

/** Палитра текущей темы. Обращение к ней короткое: она нужна везде. */
val Brand: Palette
    @Composable @ReadOnlyComposable
    get() = LocalPalette.current

@Composable
fun rememberPalette(dark: Boolean = isSystemInDarkTheme()): Palette = Palette(dark)
