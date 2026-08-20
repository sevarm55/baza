package com.sevarm.tetr.design

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * Тема приложения.
 *
 * Material 3 здесь — техническая основа, а не образ: от неё берутся
 * поведение полей ввода, ряби, листов и фокуса, но ни один цвет продукта
 * из неё не приходит. Схема заполнена цветами марки только затем, чтобы
 * системные части — курсор, выделение текста, индикатор прокрутки — не
 * оказались фиолетовыми из палитры Material по умолчанию.
 *
 * Динамический цвет Android 12+ выключен намеренно. Обои телефона не
 * должны перекрашивать продукт, в котором цвет несёт смысл: лайм это
 * действие и открытая смена, грейп — деньги и структура, жёлтый — убыток,
 * красный — «удалить». Перекрасить их под обои значит стереть эти
 * различия.
 */
@Composable
fun TetrinTheme(
    dark: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val palette = remember(dark) { Palette(dark) }

    val scheme = if (dark) {
        darkColorScheme(
            primary = palette.grape,
            onPrimary = palette.inkOnDark,
            secondary = palette.lime,
            onSecondary = palette.onLime,
            background = palette.board,
            onBackground = palette.onBoard,
            surface = palette.boardSurface,
            onSurface = palette.onBoard,
            surfaceVariant = palette.chipRest,
            onSurfaceVariant = palette.boardMuted,
            error = palette.badOnBoard,
            outline = palette.line,
        )
    } else {
        lightColorScheme(
            primary = palette.grape,
            onPrimary = palette.inkOnDark,
            secondary = palette.lime,
            onSecondary = palette.onLime,
            background = palette.board,
            onBackground = palette.onBoard,
            surface = palette.boardSurface,
            onSurface = palette.onBoard,
            surfaceVariant = palette.chipRest,
            onSurfaceVariant = palette.boardMuted,
            error = palette.badOnBoard,
            outline = palette.line,
        )
    }

    CompositionLocalProvider(
        LocalPalette provides palette,
        LocalContentColor provides palette.onBoard,
    ) {
        MaterialTheme(
            colorScheme = scheme,
            typography = tetrinTypography,
            content = content,
        )
    }
}

/**
 * Типографика.
 *
 * Системный шрифт, а не свой: марка набрана Unbounded и только она —
 * тащить весь текст в декоративной гарнитуре значит сделать нечитаемым
 * экран, который смотрят под солнцем мокрыми глазами. Здесь только
 * поправлены веса и межстрочные: у Material по умолчанию заголовки
 * воздушнее, чем нужно продукту с плотными таблицами денег.
 */
private val tetrinTypography = Typography(
    headlineLarge = TextStyle(fontSize = 32.sp, fontWeight = FontWeight.Bold),
    headlineMedium = TextStyle(fontSize = 26.sp, fontWeight = FontWeight.Bold),
    titleLarge = TextStyle(fontSize = 20.sp, fontWeight = FontWeight.Bold),
    titleMedium = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 15.sp),
    bodyMedium = TextStyle(fontSize = 14.sp),
    bodySmall = TextStyle(fontSize = 12.5.sp),
    labelLarge = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.SemiBold),
    labelSmall = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.Medium),
)
