package com.sevarm.tetr.feature.report

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material3.Icon
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sevarm.tetr.LocalGraph
import com.sevarm.tetr.R
import com.sevarm.tetr.core.api.Report
import com.sevarm.tetr.core.api.ReportCurrent
import com.sevarm.tetr.core.api.ReportLine
import com.sevarm.tetr.core.api.ReportMonth
import com.sevarm.tetr.core.api.SplitSegment
import com.sevarm.tetr.core.i18n.Dates
import com.sevarm.tetr.core.i18n.L
import com.sevarm.tetr.core.i18n.Terms
import com.sevarm.tetr.core.ui.lang
import com.sevarm.tetr.core.ui.money
import com.sevarm.tetr.core.ui.paymentInk
import com.sevarm.tetr.core.ui.paymentLabel
import com.sevarm.tetr.core.ui.serviceName
import com.sevarm.tetr.core.ui.staffRole
import com.sevarm.tetr.core.ui.units
import com.sevarm.tetr.core.ui.zone
import com.sevarm.tetr.design.Brand
import com.sevarm.tetr.design.DelayedContent
import com.sevarm.tetr.design.ErrorState
import com.sevarm.tetr.design.HairLine
import com.sevarm.tetr.design.Insets
import com.sevarm.tetr.design.Palette
import com.sevarm.tetr.design.ScreenHeader
import com.sevarm.tetr.design.TetrScreenSkeleton
import com.sevarm.tetr.design.VerticalHair
import com.sevarm.tetr.design.pressable
import com.sevarm.tetr.design.surfaceCard
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * Отчёт по месяцам.
 *
 * Сводка отвечает «сколько сегодня» и «сколько за месяц». Вопрос, который
 * владелец задаёт себе на самом деле, другой: СТАЛО ЛУЧШЕ ИЛИ ХУЖЕ, И
 * ПОЧЕМУ. Разрезы — откуда пришли деньги, куда ушли, кто это сделал — были
 * только в браузере, и владелец, работающий с телефона, на этот вопрос
 * ответа не получал вовсе.
 *
 * Порядок задан вопросами, а не удобством вёрстки, и он тот же, что в
 * кабинете: сколько заработал → лучше или хуже → из чего сложилось →
 * откуда пришло → куда ушло → чем платили → кто это сделал.
 *
 * Ни одно число здесь не считается на телефоне: месяц целиком приходит с
 * сервера, посчитанный тем же кодом, что и кабинет. Отчёт, расходящийся с
 * кабинетом хотя бы на драм, не читают вовсе.
 */
@Composable
fun ReportScreen(onBack: () -> Unit) {
    val graph = LocalGraph.current
    val session = graph.session
    val lang = lang()
    val zone = zone()

    var report by remember { mutableStateOf<Report?>(null) }
    var back by remember { mutableStateOf(0) }
    var loading by remember { mutableStateOf(true) }
    var failure by remember { mutableStateOf<String?>(null) }

    suspend fun load() {
        loading = true
        try {
            report = session.authed { token ->
                graph.api.send<Report>("report?back=$back", token = token)
            }
            failure = null
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            failure = com.sevarm.tetr.core.api.Failure.text(e)
        }
        loading = false
    }

    LaunchedEffect(back) { load() }

    Column(
        Modifier
            .fillMaxSize()
            .background(Brand.board)
            .padding(top = Insets.top.calculateTopPadding()),
    ) {
        ScreenHeader(L(R.string.reports__title), onBack = onBack)

        val data = report
        when {
            failure != null -> ErrorState(failure!!) { back = back }
            /* Отчёт считается дольше остальных разделов: он поднимает
               историю за период целиком, и пустой экран на эту секунду
               читается как сломанный. */
            data == null -> DelayedContent(loading) {
                TetrScreenSkeleton(rows = 4)
            }
            else -> LazyColumn(
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
            ) {
                item {
                    Timeline(
                        months = data.months,
                        selected = back,
                        enabled = !loading,
                        label = { m -> Dates.monthShort(m.from, lang, zone) },
                    ) { back = it }
                }

                item { Reading(data) }
                item { Breakdown(data.current) }
                item { Income(data) }
                item {
                    Bars(L(R.string.reports__whereGone), data.costsByCategory, Brand.sandInk)
                }
                item { Team(data.current) }
            }
        }
    }
}

/**
 * Месяцы графиком, а не рядом плашек.
 *
 * Плашка называла месяц и его прибыль, но сравнивать их приходилось
 * чтением: шесть чисел подряд, и «лучше или хуже» человек считал в уме.
 * Столбики отвечают на это без чтения, и выбор месяца становится тем же
 * движением, что и сравнение, а не вторым органом под ним.
 *
 * Время идёт слева направо, как во всяком графике. Плашки шли наоборот,
 * свежим влево, и ход по ним читался задом наперёд.
 *
 * Убыточный месяц уходит под нулевую линию и берёт тот же красный, что
 * число над графиком: иначе один и тот же месяц назывался бы потерей в
 * двух разных оттенках. Прибыльный остаётся грейповым — это марка, а не
 * «хорошо»: зелёный ряд из двенадцати столбиков превратил бы график в
 * оценку каждого месяца, а он про ход.
 *
 * Выбранный лежит на бумаге. Лайм сюда не годится вовсе: по светлому
 * полотну он даёт контраст 1.06 и просто не виден, а грейп уже занят самим
 * столбиком.
 */
@Composable
private fun Timeline(
    months: List<ReportMonth>,
    selected: Int,
    enabled: Boolean,
    label: (ReportMonth) -> String,
    onPick: (Int) -> Unit,
) {
    /*
     * Одному месяцу не с чем стоять рядом: у новой мойки график был бы
     * одиноким столбиком, который ничего не сравнивает.
     */
    if (months.size < 2) return

    val row = months.sortedByDescending { it.back }
    val up = maxOf(0, row.maxOf { it.profit })
    val down = maxOf(0, -row.minOf { it.profit })

    val field = 92.dp
    /*
     * Ноль делит поле по правде: если убытки вдвое мельче лучшей прибыли,
     * под линией и остаётся треть высоты. Половина на половину
     * преувеличивала бы провал.
     */
    val upField = when {
        up <= 0 -> 0.dp
        down <= 0 -> field
        else -> field * (up.toFloat() / (up + down))
    }
    val downField = field - upField

    Row(
        Modifier
            .fillMaxWidth()
            /*
             * Ширина под число месяцев, а не под экран. У мойки, которая
             * работает второй месяц, столбцов два, и растянутые на пол-экрана
             * они читаются не графиком, а парой плит.
             */
            .widthIn(max = (row.size * 66).dp)
            .padding(top = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        row.forEach { month ->
            MonthColumn(
                month = month,
                on = month.back == selected,
                enabled = enabled,
                up = up,
                down = down,
                upField = upField,
                downField = downField,
                label = label(month),
                modifier = Modifier.weight(1f),
            ) { onPick(month.back) }
        }
    }
}

@Composable
private fun MonthColumn(
    month: ReportMonth,
    on: Boolean,
    enabled: Boolean,
    up: Int,
    down: Int,
    upField: Dp,
    downField: Dp,
    label: String,
    modifier: Modifier,
    onClick: () -> Unit,
) {
    val loss = month.profit < 0
    val tone = if (loss) Brand.badOnBoard else Brand.grape
    val height = when {
        loss && down > 0 -> maxOf(3.dp, downField * (-month.profit).toFloat() / down)
        !loss && up > 0 -> maxOf(3.dp, upField * month.profit.toFloat() / up)
        else -> 0.dp
    }

    Column(
        modifier
            .clip(RoundedCornerShape(14.dp))
            .background(if (on) Brand.boardSurface else Color.Transparent)
            .pressable(enabled = enabled, onClick = onClick)
            .padding(vertical = 9.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        Column(Modifier.height(upField + downField)) {
            Box(
                Modifier.fillMaxWidth().height(upField),
                contentAlignment = Alignment.BottomCenter,
            ) {
                if (!loss) Column1(tone, height, on)
            }
            Box(
                Modifier.fillMaxWidth().height(downField),
                contentAlignment = Alignment.TopCenter,
            ) {
                if (loss) Column1(tone, height, on)
            }
        }

        Text(
            label,
            fontSize = 11.5.sp,
            fontWeight = if (on) FontWeight.Bold else FontWeight.Medium,
            color = if (on) Brand.onBoard else Brand.boardMuted,
            maxLines = 1,
        )
    }
}

/** Сам столбик: у выбранного месяца он плотнее, у остальных приглушён. */
@Composable
private fun Column1(tone: Color, height: Dp, on: Boolean) {
    Box(
        Modifier
            .width(20.dp)
            .height(height)
            .clip(RoundedCornerShape(6.dp))
            .background(if (on) tone else tone.copy(alpha = 0.45f))
    )
}

@Composable
private fun Reading(report: Report) {
    val m = report.current
    val loss = m.profit < 0

    Column(
        Modifier
            .fillMaxWidth()
            .padding(top = 8.dp, bottom = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            /*
             * Короткое «Вам остаётся», а не «В этом месяце вам остаётся»:
             * месяц назван строкой выше, и повторять его здесь значит
             * прочитать одно и то же дважды подряд. В сводке слово длинное
             * потому, что там периода над числом нет.
             */
            if (loss) L(R.string.reports__red) else L(R.string.reports__kept),
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            color = Brand.onBoard.copy(alpha = 0.85f),
        )
        Text(
            money(m.profit),
            fontSize = 46.sp,
            fontWeight = FontWeight.Bold,
            color = Brand.sign(if (loss) -1 else 1),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )

        /*
         * Насколько разошлось с прошлым месяцем. В драмах, а не в
         * процентах: процент от маленькой базы врёт. Молчим, когда
         * сравнивать не с чем — у самого старого месяца базы нет.
         */
        val base = report.base
        if (base != null) {
            val diff = m.profit - base.profit
            if (abs(diff) >= 100) {
                val up = diff > 0
                Row(
                    Modifier
                        .padding(top = 9.dp)
                        .clip(RoundedCornerShape(9.dp))
                        .background(Brand.chipRest)
                        .padding(horizontal = 11.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                ) {
                    Icon(
                        if (up) Icons.Filled.ArrowUpward else Icons.Filled.ArrowDownward,
                        contentDescription = null,
                        tint = Brand.sign(diff),
                        modifier = Modifier.size(11.dp),
                    )
                    Text(
                        (if (up) "+" else "") + money(diff),
                        fontSize = 12.5.sp,
                        fontWeight = FontWeight.Bold,
                        color = Brand.sign(diff),
                    )
                    Text(
                        L(R.string.summary__vsPrevMonth),
                        fontSize = 12.sp,
                        color = Brand.boardMuted,
                    )
                }
            }
        }
    }
}

/** Из чего сложился результат: приход минус люди минус расходы. */
/**
 * Какой долей прихода остался владелец.
 *
 * Три колонки «заплатили / сотрудникам / расходы» отвечали на вопрос
 * «сколько», но не на тот, ради которого открывают отчёт: из каждых ста
 * драм до владельца дошло тридцать четыре. Долю не считают в уме, её
 * видят — и кольцо это единственная фигура, у которой целое замкнуто и
 * потому не требует подписи «из чего».
 *
 * Кусков ровно три, и больше их не станет: приход раскладывается на долю
 * владельца, людей и расходы, других слагаемых у него нет.
 *
 * Полоса долей осталась в сводке, где родилась: две одинаковые фигуры по
 * разным данным читались бы одной вещью.
 *
 * Внизу карточки, за волосяной линией, стоит операционная строка: машины,
 * средний чек, скидки. Она приросла сюда не для экономии места — это те
 * самые числа, из которых сложился приход в шапке карточки, и стоять они
 * должны при нём.
 */
@Composable
private fun Breakdown(m: ReportCurrent) {
    if (m.revenue == 0 && m.costs == 0 && m.payroll == 0) return

    val parts = listOf(
        Triple(L(R.string.common__you), Brand.grapeFill, maxOf(0, m.profit)),
        Triple(L(R.string.summary__toStaff), Brand.lavenderInk, m.payroll),
        Triple(L(R.string.expenses__title), Brand.sandInk, m.costs),
    ).filter { it.third > 0 }

    Column(
        Modifier
            .fillMaxWidth()
            .padding(top = 8.dp)
            .surfaceCard(20.dp)
            .padding(15.dp),
        verticalArrangement = Arrangement.spacedBy(13.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            MoneyDonut(parts, m.kept.coerceIn(0, 100), L(R.string.common__you))

            Column(
                Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                /* Приход целиком — то целое, доли которого показывает
                   кольцо. Без него проценты делят неизвестно что. */
                Column {
                    Text(
                        L(R.string.summary__paidIn),
                        fontSize = 11.5.sp,
                        color = Brand.boardMuted,
                    )
                    Text(
                        money(m.revenue),
                        fontSize = 19.sp,
                        fontWeight = FontWeight.Bold,
                        color = Brand.onBoard,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }

                parts.forEach { (label, ink, amount) ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Box(
                            Modifier
                                .size(7.dp)
                                .clip(CircleShape)
                                .background(ink)
                        )
                        Text(
                            label,
                            fontSize = 12.sp,
                            color = Brand.boardMuted,
                            modifier = Modifier.weight(1f),
                            maxLines = 1,
                        )
                        Text(
                            money(amount),
                            fontSize = 12.5.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Brand.onBoard,
                            maxLines = 1,
                        )
                    }
                }
            }
        }

        HairLine()

        /*
         * Машины, средний чек и скидки — операционная строка. Скидки
         * называются, только когда они были: «скидок 0 ֏» сообщает ровно то
         * же, что их отсутствие.
         */
        val facts = buildList {
            add(units(m.count))
            if (m.avgCheck > 0) add(L(R.string.owner__avgCheck) + " " + money(m.avgCheck))
            if (m.discounts > 0) add(L(R.string.reports__discounts) + " " + money(m.discounts))
        }
        Text(
            facts.joinToString(" · "),
            fontSize = 12.5.sp,
            color = Brand.boardMuted,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/**
 * Кольцо: сколько из прихода дошло до владельца.
 *
 * Замкнутая фигура, а не полоса: у кольца целое видно само по себе, и
 * подпись «из чего» ему не нужна. Просвет между кусками — только когда их
 * больше одного: у единственного он отгрыз бы кусок от самого себя.
 */
@Composable
private fun MoneyDonut(
    parts: List<Triple<String, Color, Int>>,
    percent: Int,
    caption: String,
    size: Dp = 104.dp,
    width: Dp = 13.dp,
) {
    val total = maxOf(1, parts.sumOf { it.third })
    val track = Brand.boardInk.copy(alpha = 0.07f)
    val gap = if (parts.size > 1) 2.9f else 0f

    Box(Modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val stroke = Stroke(width = width.toPx(), cap = StrokeCap.Butt)
            val inset = width.toPx() / 2
            val arc = Size(this.size.width - width.toPx(), this.size.height - width.toPx())
            val at = Offset(inset, inset)

            drawArc(track, 0f, 360f, false, at, arc, style = stroke)

            var start = -90f
            parts.forEach { (_, ink, amount) ->
                val sweep = 360f * amount / total
                /*
                 * Просвет отгрызается с обоих концов, но кусок от него не
                 * переворачивается: у доли в полпроцента конец не может
                 * оказаться раньше начала.
                 */
                val drawn = maxOf(0f, sweep - gap)
                drawArc(ink, start + gap / 2, drawn, false, at, arc, style = stroke)
                start += sweep
            }
        }

        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                "$percent%",
                fontSize = 19.sp,
                fontWeight = FontWeight.Bold,
                color = Brand.onBoard,
            )
            Text(caption, fontSize = 10.sp, color = Brand.boardMuted, maxLines = 1)
        }
    }
}

@Composable
private fun Bars(title: String, lines: List<ReportLine>, tone: Color) {
    val rows = lines.filter { it.value > 0 }.sortedByDescending { it.value }
    if (rows.isEmpty()) return
    val total = rows.sumOf { it.value }

    Column(
        Modifier
            .fillMaxWidth()
            .padding(top = 12.dp)
            .surfaceCard(20.dp)
            .padding(15.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        SectionTitle(title, total)
        rows.forEach { row ->
            Bar(
                name = row.name,
                note = row.count?.let { units(it) }
                    ?: if (row.monthly == true) {
                        L(R.string.expenses__perMonth)
                    } else {
                        L(R.string.expenses__oneOff)
                    },
                value = row.value,
                total = total,
                tone = tone,
            )
        }
    }
}

/**
 * Откуда пришли деньги: услуги строками и способы оплаты метрами.
 *
 * Способы прирастают к приходу, а не живут отдельной карточкой: это те же
 * деньги, разрезанные вторым способом, и своя коробка повторяла бы целое
 * третий раз за экран.
 *
 * В заголовке стоит сумма ИМЕННО ЭТИХ строк, а не выручка месяца, и это не
 * мелочь. Разрез по услугам собирается из позиций записи, и записи,
 * заведённой суммой без услуги, в нём нет: у мойки, где половину машин
 * пишут суммой, разрез уже, чем приход. Подписать его выручкой значило бы
 * поставить над единственной строкой в 15 000 её сотую долю от 523 800 и
 * назвать эту строку «100 %». Целое прихода звучит выше, в шапке кольца,
 * где оно и есть целое.
 */
@Composable
private fun Income(report: Report) {
    val rows = report.services.filter { it.value > 0 }.sortedByDescending { it.value }
    val ways = report.split.filter { it.revenue > 0 }.sortedByDescending { it.revenue }
    if (rows.isEmpty() && ways.isEmpty()) return

    val total = rows.sumOf { it.value }

    Column(Modifier.fillMaxWidth().padding(top = 12.dp)) {
        SectionTitle(
            L(R.string.reports__whereFrom),
            if (rows.isEmpty()) report.current.revenue else total,
        )

        Column(
            Modifier
                .fillMaxWidth()
                .surfaceCard(20.dp),
        ) {
            if (rows.isNotEmpty()) {
                Column(Modifier.padding(vertical = 4.dp)) {
                    rows.forEach { row ->
                        Bar(
                            name = serviceName(row.name),
                            note = row.count?.takeIf { it > 0 }?.let { units(it) }.orEmpty(),
                            value = row.value,
                            total = total,
                            tone = Brand.mintInk,
                        )
                    }
                }
            }
            if (ways.isNotEmpty()) {
                if (rows.isNotEmpty()) HairLine()
                Methods(ways)
            }
        }
    }
}

/**
 * Способы оплаты — ряд метров, а не ещё один список полос.
 *
 * Их два-четыре, и вопрос к ним один: какая часть месяца прошла наличными.
 * Метры стоят рядом, а не друг под другом, потому что сравнивают их между
 * собой, а не с целым: доля подписана числом, а длина под ней добавляет ей
 * вес.
 *
 * Краски те же, что в сводке: один способ оплаты окрашен одинаково во всём
 * продукте.
 */
@Composable
private fun Methods(ways: List<SplitSegment>) {
    val total = maxOf(1, ways.sumOf { it.revenue })

    Column(
        Modifier.fillMaxWidth().padding(horizontal = 15.dp, vertical = 13.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            L(R.string.today__paidWith),
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            color = Brand.boardMuted,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            ways.forEach { way ->
                Method(way, total, Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun Method(way: SplitSegment, total: Int, modifier: Modifier) {
    val share = way.revenue.toFloat() / total
    val percent = (share * 100).roundToInt()
    val ink = paymentInk(way.payment)

    Column(modifier, verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                paymentLabel(way.payment),
                fontSize = 11.sp,
                color = Brand.boardMuted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
            Text(
                "$percent%",
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                color = ink,
                maxLines = 1,
            )
        }
        Text(
            money(way.revenue),
            fontSize = 13.5.sp,
            fontWeight = FontWeight.SemiBold,
            color = Brand.onBoard,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Box(
            Modifier
                .fillMaxWidth()
                .height(3.dp)
                .clip(RoundedCornerShape(1.5.dp))
                .background(Brand.boardInk.copy(alpha = 0.08f)),
        ) {
            Box(
                Modifier
                    // не тоньше трёх точек: метр нулевой длины читается как
                    // отсутствие способа, а он есть
                    .fillMaxWidth(share.coerceIn(0.03f, 1f))
                    .height(3.dp)
                    .clip(RoundedCornerShape(1.5.dp))
                    .background(ink)
            )
        }
    }
}

/**
 * Заголовок раздела с его собственным итогом.
 *
 * Итог стоит в заголовке, а не строкой «Всего» внизу: читают сверху вниз,
 * и целое нужно раньше долей, а не после них.
 */
@Composable
private fun SectionTitle(title: String, total: Int) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 6.dp)
            .padding(bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            title,
            fontSize = 13.5.sp,
            fontWeight = FontWeight.SemiBold,
            color = Brand.onBoard,
            modifier = Modifier.weight(1f),
        )
        Text(
            money(total),
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
            color = Brand.boardMuted,
            maxLines = 1,
        )
    }
}

@Composable
private fun Bar(name: String, note: String, value: Int, total: Int, tone: Color) {
    val share = if (total > 0) value.toFloat() / total else 0f
    val percent = (share * 100).roundToInt()

    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))) {
        Row(Modifier.matchParentSize()) {
            Box(
                Modifier
                    // не тоньше волоска: нулевая заливка читается как
                    // отсутствие строки, а строка есть
                    .fillMaxWidth(share.coerceIn(0.01f, 1f))
                    .fillMaxHeight()
                    .background(tone.copy(alpha = 0.16f)),
            )
            Box(
                Modifier
                    .width(2.dp)
                    .fillMaxHeight()
                    .background(tone.copy(alpha = 0.55f))
            )
        }

        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 15.dp, vertical = 11.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Text(
                    name,
                    fontSize = 13.5.sp,
                    color = Brand.onBoard,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (note.isNotEmpty()) {
                    Text(note, fontSize = 11.sp, color = Brand.boardMuted, maxLines = 1)
                }
            }
            Text(
                money(value),
                fontSize = 13.5.sp,
                fontWeight = FontWeight.SemiBold,
                color = Brand.onBoard,
                maxLines = 1,
            )
            Text(
                "$percent%",
                fontSize = 11.5.sp,
                color = Brand.boardMuted,
                textAlign = TextAlign.End,
                maxLines = 1,
                // «100 %» шире прочих долей, и на узкой колонке знак
                // процента уезжал на вторую строку
                modifier = Modifier.width(38.dp),
            )
        }
    }
}

@Composable
private fun Team(m: ReportCurrent) {
    val rows = m.byStaff.filter { it.count > 0 }.sortedByDescending { it.earned }
    if (rows.isEmpty()) return
    val lang = lang()

    Column(Modifier.fillMaxWidth().padding(top = 20.dp)) {
        Text(
            Terms.staff(staffRole(), lang).many,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            color = Brand.boardMuted,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 4.dp),
        )
        rows.forEachIndexed { index, row ->
            if (index > 0) HairLine()
            val who = row.name ?: "—"
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 6.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(9.dp),
            ) {
                /*
                 * Кружок с буквой, а не безымянная точка: человека в этом
                 * продукте показывают им и в журнале смены, и в карточке
                 * дня, и в зарплатах. Отчёт был единственным местом, где от
                 * человека оставался цветной пиксель.
                 */
                Box(
                    Modifier
                        .size(28.dp)
                        .clip(CircleShape)
                        .background(Palette.personTone(who).base),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        who.take(1),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                    )
                }
                Text(
                    who,
                    fontSize = 14.5.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Brand.onBoard,
                    maxLines = 1,
                    modifier = Modifier.weight(1f),
                )
                Text(units(row.count), fontSize = 12.5.sp, color = Brand.boardMuted, maxLines = 1)
                Text(
                    money(row.earned),
                    fontSize = 14.5.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Brand.onBoard,
                    maxLines = 1,
                )
            }
        }
    }
}
