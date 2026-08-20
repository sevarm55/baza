package com.sevarm.tetr.feature.owner

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sevarm.tetr.core.api.SeriesPoint
import com.sevarm.tetr.design.Brand
import kotlin.math.roundToInt

/**
 * График выручки на телефоне.
 *
 * Линия здесь была и не работала. Линия показывает ХОД — как одно
 * перетекает в другое; на мойке, где за день пять машин и половина часов
 * пустая, хода нет: получалась почти горизонтальная нитка с редкими
 * иглами, а при одной машине — пустая рамка с точкой посередине. Владелец
 * видел картинку и не понимал, что это график.
 *
 * Столбики отвечают на тот вопрос, который у владельца есть на самом деле:
 * СКОЛЬКО И КОГДА. Один столбик читается так же однозначно, как двадцать
 * четыре, и это главное свойство — экран не должен разваливаться на
 * маленьких числах, потому что маленькие числа у мойки бывают чаще больших.
 *
 * Столбик можно вести пальцем: под пальцем встаёт подпись «12:00 · 2 500 ֏».
 * Без касания подписан пик — экран, на который просто смотрят, обязан
 * отвечать без действий.
 */
@Composable
fun RevenueChart(
    series: List<SeriesPoint>,
    title: String,
    axis: (SeriesPoint) -> String,
    money: (Int) -> String,
    modifier: Modifier = Modifier,
) {
    if (series.isEmpty()) return

    val peak = maxOf(1, series.maxOf { it.revenue })
    val peakIndex = series.indexOfFirst { it.revenue == peak }.coerceAtLeast(0)

    /** Под пальцем. Пусто — палец убран, подписан пик. */
    var touched by remember(series) { mutableStateOf<Int?>(null) }
    val shown = touched ?: peakIndex

    /**
     * Высота поля. Больше прежних шестидесяти: это единственная картинка
     * на экране, и мелкой она читается полоской шума под числами.
     */
    val field = 94.dp

    Column(modifier.padding(top = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.Bottom) {
            Text(
                title,
                fontSize = 12.5.sp,
                fontWeight = FontWeight.SemiBold,
                color = Brand.boardMuted,
                modifier = Modifier.weight(1f),
            )
            /*
             * Одна подпись на оба состояния: под пальцем — то, что под
             * пальцем, без пальца — пик. Две разные строки в одном углу
             * заставляли бы читать, какая из них сейчас.
             */
            Text(
                series.getOrNull(shown)?.let { "${axis(it)} · ${money(it.revenue)}" }.orEmpty(),
                fontSize = 12.5.sp,
                fontWeight = if (touched == null) FontWeight.Normal else FontWeight.SemiBold,
                color = if (touched == null) Brand.boardMuted else Brand.onBoard,
                maxLines = 1,
            )
        }

        val gap = if (series.size > 16) 2.dp else 4.dp
        Row(
            Modifier
                .fillMaxWidth()
                .height(field)
                /*
                 * Ведём палец, а не ловим нажатие: на графике из двадцати
                 * четырёх делений попасть в нужное с первого раза нельзя, а
                 * провести и остановиться — можно.
                 */
                .pointerInput(series) {
                    val step = size.width.toFloat() / series.size
                    detectHorizontalDragGestures(
                        onDragStart = { offset ->
                            touched = (offset.x / step).toInt().coerceIn(0, series.lastIndex)
                        },
                        onDragEnd = { touched = null },
                        onDragCancel = { touched = null },
                    ) { change, _ ->
                        touched = (change.position.x / step).toInt().coerceIn(0, series.lastIndex)
                    }
                },
            horizontalArrangement = Arrangement.spacedBy(gap),
            verticalAlignment = Alignment.Bottom,
        ) {
            series.forEachIndexed { i, point ->
                val share = point.revenue.toFloat() / peak
                /*
                 * Лайм — только под пальцем. Подсвечивать пик самим по себе
                 * нельзя: когда за день одна машина, она же и пик, её
                 * столбик тянется на всю высоту поля, и экран занимает
                 * горящий зелёный прямоугольник в пол-ладони.
                 */
                val lit = touched == i && point.revenue > 0
                Box(
                    Modifier
                        .weight(1f)
                        /*
                         * Пустой час остаётся видимой полоской: ноль — это
                         * «машин не было», а не «данных нет», и разница
                         * между этими двумя вещами для владельца
                         * существенна.
                         */
                        .height(maxOf(3.dp, field * share))
                        .clip(RoundedCornerShape(3.dp))
                        .background(
                            if (lit) Brand.lime else Brand.boardInk.copy(alpha = 0.18f)
                        )
                )
            }
        }

        /*
         * Четыре отметки: начало, две внутри, конец. Позиции подобраны под
         * места подписей, а не под номера точек.
         */
        val last = series.lastIndex
        val picks = if (last <= 3) {
            (0..last).toList()
        } else {
            listOf(0, (last * 0.375).roundToInt(), (last * 0.625).roundToInt(), last)
        }
        Row(Modifier.fillMaxWidth()) {
            picks.forEachIndexed { slot, i ->
                Text(
                    series.getOrNull(i)?.let(axis).orEmpty(),
                    fontSize = 11.sp,
                    color = Brand.boardMuted.copy(alpha = 0.85f),
                    textAlign = when (slot) {
                        0 -> TextAlign.Start
                        picks.lastIndex -> TextAlign.End
                        else -> TextAlign.Center
                    },
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}
