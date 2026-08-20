package com.sevarm.tetr.design

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Тон плитки: тёмная заливка и светящееся пятно в углу.
 *
 * Пятно — не украшение, а то, чем этот приём отличается от плоского
 * прямоугольника: оно даёт плитке источник света, и сетка из шести таких
 * читается набором приборов, а не таблицей ячеек.
 *
 * Цвета здесь НЕ адаптивные, и это главное: в референсе тёмная плитка
 * одинакова на любом фоне, а менять её по теме системы значит менять сам
 * продукт от того, светло в комнате или темно. Меняется только холст.
 */
enum class Tone {
    VIOLET, TEAL, AMBER, LIME, SLATE, ROSE, INDIGO;

    val base: Color
        get() = when (this) {
            VIOLET -> Color(0xFF3B147A)
            TEAL -> Color(0xFF0B3D3A)
            AMBER -> Color(0xFF4A220A)
            LIME -> Color(0xFFD7FF00)
            SLATE -> Color(0xFF22212A)
            ROSE -> Color(0xFF4C0F2E)
            INDIGO -> Color(0xFF122254)
        }

    /** Светящееся пятно. */
    val glow: Color
        get() = when (this) {
            VIOLET -> Color(0xFFA78BFA)
            TEAL -> Color(0xFF2DD4BF)
            AMBER -> Color(0xFFFBBF24)
            LIME -> Color.White
            SLATE -> Color(0xFF8B88A8)
            ROSE -> Color(0xFFF472B6)
            INDIGO -> Color(0xFF60A5FA)
        }

    /**
     * Знаки на плитке. По цвету заливки, а не по теме системы: лайм
     * светлый при любой теме, и белый текст на нём невидим.
     */
    val ink: Color
        get() = if (this == LIME) Color(0xFF1A1626) else Color.White

    /** Плитка светлая — и на ней всё переворачивается: свет становится тенью. */
    val isLight: Boolean get() = this == LIME

    /**
     * Что происходит в правом верхнем углу.
     *
     * У тёмных плиток это свет — то же пятно, что и везде. У лаймовой
     * наоборот, глубокая олива: лайм и так на пределе яркости, добавить к
     * нему свет нечем, и угол приходится не зажигать, а гасить. Событие
     * при этом в том же углу, что у остальных.
     */
    val cornerLight: Color
        get() = if (this == LIME) Color(0xFF1E2609) else glow

    /** Второй источник — снизу слева, соседним оттенком. */
    val aurora: Color
        get() = when (this) {
            VIOLET -> Color(0xFFE879F9)
            TEAL -> Color(0xFF22D3EE)
            AMBER -> Color(0xFFFB923C)
            LIME -> Color(0xFFF2FF9E)
            SLATE -> Color(0xFF818CF8)
            ROSE -> Color(0xFFFB7185)
            INDIGO -> Color(0xFF818CF8)
        }

    /** Кромка стекла по верхнему краю: свет ложится на грань, а не на плоскость. */
    val rim: Color get() = if (isLight) Color(0xFF2E1065) else Color.White

    /**
     * Фирменная засечка над заголовком.
     *
     * Лайм на тёмном, грейп на лайме — то есть всегда вторая половина
     * марки, та, которой на этой плитке нет. Ставится в одном и том же
     * месте на всех плитках экрана, и именно повтор делает её подписью, а
     * не украшением одной карточки.
     */
    val accent: Color get() = if (isLight) Color(0xFF2E1065) else Color(0xFFD7FF00)

    /** Чем красится крупный знак. */
    val markTint: Color get() = if (isLight) aurora else glow
}

/**
 * Поверхность плитки: плотный тон и два источника света.
 *
 * Было стекло, подкрашенное тоном, — и цвет выцветал: стекло подмешивает
 * к нему то, что под ним, а под ним светлое полотно. Здесь заливка своя и
 * непрозрачная, а глубину даёт не материал, а свет. Это язык приложения:
 * плитка не карточка, а прибор, и он горит.
 *
 * Источников два. Один — главный, из правого верхнего угла, тем же
 * оттенком, что и знак. Второй — снизу слева, соседним по кругу цветом и
 * вчетверо слабее; он не читается отдельным пятном, но убирает у плитки
 * плоскость. Свет всегда с одной стороны на всех плитках экрана, иначе
 * набор рассыпается.
 */
@Composable
fun Modifier.auroraTile(tone: Tone, radius: Dp = 24.dp, calm: Boolean = false): Modifier {
    val shape = RoundedCornerShape(radius)
    return this
        .clip(shape)
        .drawBehind {
            drawRect(tone.base)

            val corner = Offset(size.width, 0f)
            if (tone.isLight) {
                /*
                 * На светлой плитке угол не зажигается, а гасится — и это
                 * другая кривая, а не тот же градиент с другим цветом.
                 * Ровное падение прозрачности давало «лайм погрязнее»:
                 * половина плитки в оливковой дымке и ни одного места, где
                 * по-настоящему темно. Здесь у массы есть плато — до трети
                 * радиуса она держится почти плотной.
                 */
                drawRect(
                    Brush.radialGradient(
                        0.0f to tone.cornerLight.copy(alpha = 0.97f),
                        0.32f to tone.cornerLight.copy(alpha = 0.90f),
                        0.66f to tone.cornerLight.copy(alpha = 0.42f),
                        1.0f to tone.cornerLight.copy(alpha = 0f),
                        center = corner,
                        radius = 172.dp.toPx(),
                    )
                )
            } else {
                drawRect(
                    Brush.radialGradient(
                        listOf(
                            tone.cornerLight.copy(alpha = if (calm) 0.40f else 0.52f),
                            tone.cornerLight.copy(alpha = 0f),
                        ),
                        center = corner,
                        radius = (if (calm) 210 else 165).dp.toPx(),
                    )
                )
            }

            drawRect(
                Brush.radialGradient(
                    listOf(
                        tone.aurora.copy(
                            alpha = if (tone.isLight) 0.55f else if (calm) 0.12f else 0.18f
                        ),
                        tone.aurora.copy(alpha = 0f),
                    ),
                    center = Offset(0f, size.height),
                    radius = (if (tone.isLight) 145 else 190).dp.toPx(),
                )
            )
        }
        .border(
            width = 0.8.dp,
            brush = Brush.verticalGradient(
                listOf(
                    tone.rim.copy(alpha = if (tone.isLight) 0.14f else 0.22f),
                    tone.rim.copy(alpha = 0f),
                )
            ),
            shape = shape,
        )
}

/**
 * Простая плитка: тон и одно пятно из угла.
 *
 * Ею живут показания смены, календарь и день — там, где плитка стоит
 * рядом с такой же и второй источник света только зашумил бы ряд.
 */
@Composable
fun Modifier.tile(tone: Tone, radius: Dp = 22.dp): Modifier = tile(tone.base, tone.glow, radius)

/** Та же плитка со свечением, но своими цветами — для людей. */
@Composable
fun Modifier.tile(base: Color, glow: Color, radius: Dp = 22.dp): Modifier {
    val shape = RoundedCornerShape(radius)
    return this
        .clip(shape)
        .drawBehind {
            drawRect(base)
            drawRect(
                Brush.radialGradient(
                    listOf(glow.copy(alpha = 0.5f), glow.copy(alpha = 0f)),
                    center = Offset(size.width, 0f),
                    radius = 150.dp.toPx(),
                )
            )
        }
}

/**
 * Карточка на светлом полотне: бумага и волосяная грань.
 *
 * Грань обязательна — без неё белое по белому перестаёт быть карточкой.
 */
@Composable
fun Modifier.surfaceCard(radius: Dp = 20.dp): Modifier {
    val shape = RoundedCornerShape(radius)
    return this
        .background(Brand.boardSurface, shape)
        .border(0.8.dp, Brand.boardInk.copy(alpha = 0.07f), shape)
}

/** Утопленная плашка: поле, строка-действие, чип. */
@Composable
fun Modifier.sunken(radius: Dp = 22.dp, alpha: Float = 0.07f): Modifier =
    background(Brand.boardInk.copy(alpha = alpha), RoundedCornerShape(radius))

/** Пустая коробка нужного тона — там, где заливка идёт фоном контейнера. */
@Composable
fun ToneBox(tone: Tone, radius: Dp = 24.dp, calm: Boolean = false, content: @Composable () -> Unit) {
    Box(Modifier.auroraTile(tone, radius, calm)) {
        Box(Modifier.fillMaxSize()) { content() }
    }
}
