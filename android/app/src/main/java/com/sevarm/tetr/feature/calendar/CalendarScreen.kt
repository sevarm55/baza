package com.sevarm.tetr.feature.calendar

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sevarm.tetr.LocalGraph
import com.sevarm.tetr.R
import com.sevarm.tetr.core.api.Month
import com.sevarm.tetr.core.i18n.Dates
import com.sevarm.tetr.core.i18n.L
import com.sevarm.tetr.core.ui.lang
import com.sevarm.tetr.core.ui.money
import com.sevarm.tetr.core.ui.unitWord
import com.sevarm.tetr.core.ui.units
import com.sevarm.tetr.core.ui.zone
import com.sevarm.tetr.design.Brand
import com.sevarm.tetr.design.DelayedContent
import com.sevarm.tetr.design.Insets
import com.sevarm.tetr.design.RoundIconButton
import com.sevarm.tetr.design.ScreenHeader
import com.sevarm.tetr.design.Stat
import com.sevarm.tetr.design.StatCards
import com.sevarm.tetr.design.StatTint
import com.sevarm.tetr.design.TetrSkeleton
import com.sevarm.tetr.design.VerticalHair
import com.sevarm.tetr.design.pressable
import com.sevarm.tetr.design.surfaceCard
import java.time.Instant
import java.time.YearMonth

/**
 * История бизнеса месяцем.
 *
 * Сетка дней, где густота заливки — выручка дня. Это не украшение: месяц
 * читается формой, а не столбцом чисел. Провал в середине недели видно
 * раньше, чем прочитана хоть одна цифра, и именно за этим сюда приходят.
 *
 * Пустой день и день без работы — разные вещи. День, которого ещё не было,
 * пуст; день, в который не приехал никто, залит самым слабым тоном и
 * нажимается: у него есть карточка, и в ней написано, что расходы за него
 * всё равно набежали.
 */
@Composable
fun CalendarScreen(onBack: () -> Unit, onDay: (String) -> Unit) {
    val graph = LocalGraph.current
    val session = graph.session
    val zone = zone()
    val lang = lang()

    var month by remember { mutableStateOf(YearMonth.from(Instant.now().atZone(zone))) }
    var data by remember { mutableStateOf<Month?>(null) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(month) {
        loading = true
        val key = "%04d-%02d".format(month.year, month.monthValue)
        data = runCatching {
            session.authed { token -> graph.api.send<Month>("calendar?month=$key", token = token) }
        }.getOrNull()
        loading = false
    }

    val today = YearMonth.from(Instant.now().atZone(zone))
    val canGoForward = month < today

    Column(
        Modifier
            .fillMaxSize()
            .background(Brand.board)
            .padding(top = Insets.top.calculateTopPadding()),
    ) {
        ScreenHeader(L(R.string.calendar__title), onBack = onBack)

        Column(
            Modifier
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 12.dp)
                .padding(bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(
                Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                RoundIconButton(
                    Icons.AutoMirrored.Filled.KeyboardArrowLeft,
                    L(R.string.common__back),
                ) { month = month.minusMonths(1) }

                Text(
                    Dates.monthYear(month, lang),
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = Brand.onBoard,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.weight(1f),
                )

                /*
                 * Вперёд дальше текущего месяца не ходим: будущего в
                 * истории не бывает, и пустая сетка сентября выглядела бы
                 * поломкой, а не концом данных.
                 */
                if (canGoForward) {
                    RoundIconButton(
                        Icons.AutoMirrored.Filled.KeyboardArrowRight,
                        L(R.string.common__next),
                    ) { month = month.plusMonths(1) }
                } else {
                    Spacer(Modifier.size(38.dp))
                }
            }

            val loaded = data
            when {
                /* Месяц читается фигурой целиком, поэтому место под
                   него — прямоугольник той же высоты, а не кружок
                   посреди пустого поля. */
                loading && loaded == null -> DelayedContent(true) {
                    Column(
                        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        TetrSkeleton(height = 64.dp, radius = 18.dp)
                        TetrSkeleton(height = 320.dp, radius = 20.dp)
                    }
                }
                loaded == null -> Text(
                    L(R.string.errors__offline),
                    fontSize = 14.sp,
                    color = Brand.boardMuted,
                    modifier = Modifier.padding(vertical = 40.dp),
                )

                else -> {
                    Totals(loaded)
                    Grid(month, loaded, today, zone, onDay)
                }
            }
        }
    }
}

/**
 * Итог месяца рядом мягких карточек.
 *
 * Полоса из трёх ячеек отвечала верно, но повторяла ту же ошибку, что
 * плитки дня: главное число месяца стоит выше, а полоса под ним говорила
 * то же самое другими словами. Четыре карточки называют цепочку целиком —
 * пришло, сколько машин, ушло людям, ушло на расходы.
 *
 * Краски те же, что на смене и в карточке дня: мята за объём работы,
 * лаванда за деньги людям, песок за траты. Один и тот же смысл окрашен
 * одинаково во всём продукте.
 *
 * Машины на белой бумаге, а не денежной краской: это счётчик, а не деньги,
 * и красить его как сумму значит соврать глазу.
 */
@Composable
private fun Totals(month: Month) {
    val total = month.total
    if (total.revenue == 0 && total.count == 0) return

    StatCards(
        listOf(
            Stat(L(R.string.owner__revenue), money(total.revenue), StatTint.MINT),
            Stat(unitWord(total.count), "${total.count}", StatTint.PAPER),
            Stat(L(R.string.summary__toStaff), money(total.payroll), StatTint.LAVENDER),
            Stat(L(R.string.expenses__title), money(total.expenses), StatTint.SAND),
        ),
        columns = 2,
        modifier = Modifier.padding(top = 16.dp),
    )
}

/**
 * Сетка месяца.
 *
 * Неделя начинается с понедельника во всех трёх языках: у английской
 * локали первый день воскресенье, и сетка разъехалась бы на один столбец
 * относительно кабинета.
 */
@Composable
private fun Grid(
    month: YearMonth,
    data: Month,
    today: YearMonth,
    zone: java.time.ZoneId,
    onDay: (String) -> Unit,
) {
    val lang = lang()
    val byDate = remember(data) { data.days.associateBy { it.date } }
    val peak = maxOf(1, data.days.maxOfOrNull { it.revenue } ?: 1)

    val first = month.atDay(1)
    // понедельник = 1, воскресенье = 7 → сколько пустых клеток слева
    val lead = first.dayOfWeek.value - 1
    val length = month.lengthOfMonth()
    val todayKey = Dates.dayKey(Instant.now(), zone)

    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(Modifier.fillMaxWidth()) {
            Dates.shortWeekdays(lang).forEach { name ->
                Text(
                    name,
                    fontSize = 10.5.sp,
                    color = Brand.boardMuted,
                    textAlign = TextAlign.Center,
                    maxLines = 1,
                    modifier = Modifier.weight(1f),
                )
            }
        }

        val cells = lead + length
        val rows = (cells + 6) / 7
        repeat(rows) { row ->
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                repeat(7) { col ->
                    val index = row * 7 + col
                    val dayNumber = index - lead + 1
                    if (dayNumber !in 1..length) {
                        Spacer(Modifier.weight(1f).aspectRatio(1f))
                    } else {
                        val date = month.atDay(dayNumber)
                        val key = date.toString()
                        val entry = byDate[key]
                        val revenue = entry?.revenue ?: 0
                        /*
                         * День, которого ещё не было, не заливаем вовсе:
                         * слабая заливка на будущем числе читается как
                         * «работали и ничего не заработали».
                         */
                        val future = key > todayKey
                        DayCell(
                            number = dayNumber,
                            share = if (future) -1f else revenue.toFloat() / peak,
                            isToday = key == todayKey,
                            modifier = Modifier.weight(1f),
                            onClick = if (future) null else ({ onDay(key) }),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DayCell(
    number: Int,
    share: Float,
    isToday: Boolean,
    modifier: Modifier,
    onClick: (() -> Unit)?,
) {
    /*
     * Густота заливки — выручка дня. Минимум держим заметным: день без
     * работы обязан отличаться от дня, которого не было, а не сливаться с
     * полотном.
     */
    val fill = when {
        share < 0f -> Color.Transparent
        else -> Brand.grape.copy(alpha = 0.10f + 0.62f * share.coerceIn(0f, 1f))
    }
    val ink = when {
        share < 0f -> Brand.boardMuted.copy(alpha = 0.45f)
        share > 0.55f -> Color.White
        else -> Brand.onBoard
    }

    Box(
        modifier
            .aspectRatio(1f)
            .clip(RoundedCornerShape(12.dp))
            .background(fill)
            /*
             * Сегодня обведён, а не залит ярче: заливка уже занята
             * выручкой, и второй смысл на ней не поместится.
             */
            .border(
                width = if (isToday) 1.5.dp else 0.dp,
                color = if (isToday) Brand.grape else Color.Transparent,
                shape = RoundedCornerShape(12.dp),
            )
            .then(if (onClick != null) Modifier.pressable(onClick = onClick) else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            "$number",
            fontSize = 13.sp,
            fontWeight = if (isToday) FontWeight.Bold else FontWeight.Medium,
            color = ink,
        )
    }
}
