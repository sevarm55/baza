package com.sevarm.tetr.design

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Лицо карточки — заливка и оба знака текста разом.
 *
 * Цвета здесь НЕ адаптивные, и это главное. Белая, лаймовая и грейповая
 * карточки одинаковы на любом фоне; менять их по теме системы значит
 * менять сам продукт от того, светло в комнате или темно. Меняется только
 * холст под ними.
 *
 * Заведено типом, а не набором цветов, потому что правило «цвет текста
 * выбирается по цвету карточки под ним» нарушается ровно тогда, когда его
 * можно нарушить: белый текст на лайме невидим, тёмный на грейпе — тоже.
 * Взять заливку, не взяв к ней знаки, теперь нельзя.
 */
enum class Face {
    /** Белая бумага. Главное число и списки. */
    PAPER,

    /** Лайм. Разбор денег: то, ради чего экран и открыли. */
    LIME,

    /** Грейп. График и всё, что про форму периода. */
    GRAPE;

    val fill: Color
        get() = when (this) {
            PAPER -> Color.White
            LIME -> Color(0xFFD7FF00)
            GRAPE -> Color(0xFF6D28D9)
        }

    /** Основной текст. */
    val ink: Color
        get() = if (this == GRAPE) Color.White else Color(0xFF14121A)

    /** Второстепенный. */
    val muted: Color
        get() = when (this) {
            GRAPE -> Color.White.copy(alpha = 0.72f)
            LIME -> Color(0xFF14121A).copy(alpha = 0.62f)
            PAPER -> Color(0xFF5A5568)
        }

    /** Вложенная плашка: чип, пилюля, кружок кнопки. */
    val inset: Color
        get() = when (this) {
            GRAPE -> Color.White.copy(alpha = 0.16f)
            LIME -> Color(0xFF14121A).copy(alpha = 0.10f)
            PAPER -> Color(0xFFF0EEEA)
        }
}

/**
 * Кольцо доли: заполненная дуга — то, что осталось владельцу.
 */
@Composable
fun Ring(share: Double, size: Dp = 54.dp, track: Color = Color.White.copy(alpha = 0.22f), fill: Color) {
    val s = min(1.0, max(0.0, share)).toFloat()
    Box(Modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(size)) {
            val stroke = 7.dp.toPx()
            val inset = stroke / 2
            val arcSize = Size(this.size.width - stroke, this.size.height - stroke)
            drawArc(
                color = track,
                startAngle = 0f,
                sweepAngle = 360f,
                useCenter = false,
                topLeft = androidx.compose.ui.geometry.Offset(inset, inset),
                size = arcSize,
                style = Stroke(width = stroke),
            )
            drawArc(
                color = fill,
                startAngle = -90f,
                sweepAngle = 360f * s,
                useCenter = false,
                topLeft = androidx.compose.ui.geometry.Offset(inset, inset),
                size = arcSize,
                style = Stroke(width = stroke, cap = StrokeCap.Round),
            )
        }
        Text(
            "${(s * 100).roundToInt()}%",
            fontSize = 15.sp,
            fontWeight = FontWeight.Bold,
            color = Color.White,
        )
    }
}
