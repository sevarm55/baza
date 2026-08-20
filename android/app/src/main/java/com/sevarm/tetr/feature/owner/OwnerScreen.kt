package com.sevarm.tetr.feature.owner

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sevarm.tetr.LocalGraph
import com.sevarm.tetr.R
import com.sevarm.tetr.core.api.FeedItem
import com.sevarm.tetr.core.api.SplitSegment
import com.sevarm.tetr.core.api.Summary
import com.sevarm.tetr.core.i18n.Dates
import com.sevarm.tetr.core.i18n.L
import com.sevarm.tetr.core.i18n.Terms
import com.sevarm.tetr.core.i18n.money
import com.sevarm.tetr.core.i18n.perOneUnit
import com.sevarm.tetr.core.i18n.plainAmount
import com.sevarm.tetr.core.ui.clock
import com.sevarm.tetr.core.ui.currency
import com.sevarm.tetr.core.ui.graphViewModel
import com.sevarm.tetr.core.ui.lang
import com.sevarm.tetr.core.ui.money
import com.sevarm.tetr.core.ui.paymentInk
import com.sevarm.tetr.core.ui.paymentLabel
import com.sevarm.tetr.core.ui.serviceName
import com.sevarm.tetr.core.ui.tenant
import com.sevarm.tetr.core.ui.units
import com.sevarm.tetr.core.ui.zone
import com.sevarm.tetr.design.Brand
import com.sevarm.tetr.design.DelayedContent
import com.sevarm.tetr.design.ErrorState
import com.sevarm.tetr.design.FlowRowLayout
import com.sevarm.tetr.design.HairLine
import com.sevarm.tetr.design.Insets
import com.sevarm.tetr.design.Palette
import com.sevarm.tetr.design.Refreshable
import com.sevarm.tetr.design.SelectChip
import com.sevarm.tetr.design.TetrRefreshDot
import com.sevarm.tetr.design.TetrSkeleton
import com.sevarm.tetr.design.TetrSkeletonList
import com.sevarm.tetr.design.Tone
import com.sevarm.tetr.design.VerticalHair
import com.sevarm.tetr.design.pressable
import com.sevarm.tetr.design.surfaceCard
import java.time.Instant
import java.time.temporal.ChronoUnit
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlinx.coroutines.delay

/**
 * Кабинет владельца — приборное табло, а не список карточек.
 *
 * Главная цифра стоит по оси экрана, без подложки и рамки: осевая
 * симметрия прибора читается «показание» раньше, чем прочитано слово над
 * ней. Прибыль, а не выручка: выручку владелец и так примерно помнит — она
 * равна числу машин на средний чек. Прибыль не помнит никто, в ней сидят
 * проценты работников и доля аренды за день.
 *
 * Под цифрой — вычитание, единственная строка, объясняющая, ОТКУДА она
 * взялась. Мелким и приглушённым: смотрят на неё раз в неделю, но когда
 * смотрят — она отвечает целиком.
 */
@Composable
fun OwnerScreen(
    goToShift: () -> Unit,
    goToPayroll: () -> Unit,
    goToServices: () -> Unit,
    goToStaff: () -> Unit,
    goToClients: () -> Unit,
) {
    val vm = graphViewModel { OwnerViewModel(it) }
    val ui by vm.ui.collectAsState()
    val session = LocalGraph.current.session
    val setupHidden by session.setupHidden.collectAsState()

    var showAlerts by remember { mutableStateOf(false) }
    var cancelling by remember { mutableStateOf<FeedItem?>(null) }

    LaunchedEffect(Unit) { vm.reloadNow() }
    LaunchedEffect(setupHidden) { vm.reloadNow() }
    LaunchedEffect(ui.newestFeedId) {
        if (ui.newestFeedId != null) {
            delay(850)
            vm.clearHighlight()
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(Brand.board)
            .padding(top = Insets.top.calculateTopPadding()),
    ) {
        PeriodBar(
            period = ui.period,
            /* Сверка, а не первая загрузка: пока щита ещё нет, о работе
               говорит скелет, и вторая точка про то же была бы лишней. */
            refreshing = ui.loading && ui.summary != null,
            alerts = ui.alerts.size,
            onPeriod = vm::selectPeriod,
            onAlerts = { showAlerts = true },
        )

        val summary = ui.summary
        /* Жест обновления, которого у Android не было вовсе. Сверка,
           а не первая загрузка: числа остаются на экране. */
        Refreshable(
            refreshing = ui.loading && ui.summary != null,
            modifier = Modifier.weight(1f),
            onRefresh = { vm.reload() },
        ) {
            when {
                ui.failure != null -> ErrorState(ui.failure!!) { vm.reload() }
                /* Место щита, а не кружок посреди пустого экрана. Форма
                   повторяет именно эту страницу: плита итога, строка фактов,
                   график и лента. Скелет чужой формы читается как
                   «загрузилось неправильно». */
                summary == null -> DelayedContent(ui.loading) {
                    Column(
                        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        TetrSkeleton(width = 130.dp, height = 13.dp)
                        TetrSkeleton(height = 52.dp, radius = 14.dp)
                        TetrSkeleton(height = 96.dp, radius = 20.dp)
                        TetrSkeleton(height = 190.dp, radius = 22.dp)
                        TetrSkeleton(width = 120.dp, height = 13.dp)
                        TetrSkeletonList(rows = 4)
                    }
                }
                else -> Body(
                    vm = vm,
                    ui = ui,
                    summary = summary,
                    setupHidden = setupHidden,
                    goToShift = goToShift,
                    goToServices = goToServices,
                    goToStaff = goToStaff,
                    onCancel = { cancelling = it },
                )
            }
        }
    }

    if (showAlerts) {
        AlertsSheet(
            alerts = ui.alerts,
            /*
             * Куда ведёт повод, решает приложение: у него свои разделы, и
             * адрес страницы браузера здесь ни при чём.
             */
            onOpen = { key -> if (key == "payroll-due") goToPayroll() else goToClients() },
            onSnooze = vm::snooze,
            onClose = { showAlerts = false },
        )
    }

    cancelling?.let { item ->
        AlertDialog(
            onDismissRequest = { cancelling = null },
            containerColor = Brand.boardSurface,
            title = { Text(L(R.string.work__revokeTitle), color = Brand.onBoard) },
            text = {
                Text("${item.clientKey ?: "—"} · ${money(item.price)}", color = Brand.boardMuted)
            },
            confirmButton = {
                TextButton(onClick = {
                    vm.cancel(item.id)
                    cancelling = null
                }) { Text(L(R.string.common__cancel), color = Brand.badOnBoard) }
            },
            dismissButton = {
                TextButton(onClick = { cancelling = null }) {
                    Text(L(R.string.common__no), color = Brand.boardMuted)
                }
            },
        )
    }
}

/**
 * Период и колокольчик.
 *
 * Ручное обновление не дублируем кнопкой: для него уже есть потягивание
 * вниз. Колокольчик меньше переключателя намеренно — это не действие
 * экрана, а вход в список поводов, и открывают его раз в неделю.
 */
@Composable
private fun PeriodBar(
    period: String,
    refreshing: Boolean,
    alerts: Int,
    onPeriod: (String) -> Unit,
    onAlerts: () -> Unit,
) {
    val periods = listOf(
        OwnerViewModel.TODAY to L(R.string.common__today),
        OwnerViewModel.MONTH to L(R.string.owner__periodMonth),
        OwnerViewModel.PREV_MONTH to L(R.string.owner__periodPrevMonth),
    )

    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .padding(bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        SingleChoiceSegmentedButtonRow(Modifier.weight(1f)) {
            periods.forEachIndexed { index, (key, label) ->
                SegmentedButton(
                    selected = period == key,
                    /* Переключатель НЕ гаснет и не глохнет на время
                       запроса. Порядок ответов держит `loadId` вместе со
                       сверкой периода — поздний ответ на старый период на
                       экран не попадает, — и запрещать выбор сверх этого
                       нечего: владелец как раз и щёлкает между «сегодня»
                       и «месяцем», пока считается предыдущий. */
                    onClick = { onPeriod(key) },
                    shape = SegmentedButtonDefaults.itemShape(index, periods.size),
                    colors = SegmentedButtonDefaults.colors(
                        activeContainerColor = Brand.onBoard,
                        activeContentColor = Brand.board,
                        inactiveContainerColor = Brand.chipRest,
                        inactiveContentColor = Brand.boardMuted,
                        activeBorderColor = Color.Transparent,
                        inactiveBorderColor = Color.Transparent,
                    ),
                    icon = {},
                ) {
                    Text(label, fontSize = 12.5.sp, maxLines = 1)
                }
            }
        }

        /* Идёт сверка: точка, а не заслонка. Данные на экране остаются
           верными, просто чуть старыми. */
        TetrRefreshDot(active = refreshing)

        Box(
            Modifier
                .size(36.dp)
                .clip(CircleShape)
                .background(Brand.boardInk.copy(alpha = 0.07f))
                .pressable(onClick = onAlerts),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                if (alerts == 0) Icons.Filled.Notifications else Icons.Filled.NotificationsActive,
                contentDescription = L(R.string.alerts__title),
                tint = Brand.onBoard,
                modifier = Modifier.size(16.dp),
            )
            if (alerts > 0) {
                Text(
                    "$alerts",
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold,
                    color = Brand.onLime,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .size(15.dp)
                        .clip(CircleShape)
                        .background(Brand.lime),
                )
            }
        }
    }
}

@Composable
private fun Body(
    vm: OwnerViewModel,
    ui: OwnerViewModel.UiState,
    summary: Summary,
    setupHidden: Boolean,
    goToShift: () -> Unit,
    goToServices: () -> Unit,
    goToStaff: () -> Unit,
    onCancel: (FeedItem) -> Unit,
) {
    val today = ui.loadedPeriod == OwnerViewModel.TODAY
    val feed = summary.feed

    /*
     * Способы оплаты — только те, что реально встретились: кнопка,
     * не выбирающая ни одной записи, сообщает ровно то же, что её
     * отсутствие. Порядок — как в разрезе выше, по деньгам: два одинаковых
     * набора, отсортированных по-разному, читаются как разные.
     */
    val methods = remember(feed) {
        feed.groupBy { it.payment }
            .mapValues { (_, rows) -> rows.sumOf { it.price } }
            .entries.sortedByDescending { it.value }
            .map { it.key }
    }
    /*
     * Полоса появляется, только когда есть что фильтровать: на дне из
     * четырёх машин с одними наличными это управление, которое ничего не
     * меняет, и прочитать его приходится, чтобы это понять.
     */
    val filterable = feed.size > 8 && methods.size > 1
    val shown = if (filterable) {
        feed.filter { ui.feedMethod == null || it.payment == ui.feedMethod }
    } else {
        feed
    }

    LazyColumn(
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 28.dp),
    ) {
        item { Reading(ui, summary) }

        /*
         * Настройка первого дня — первой карточкой, пока она не закончена.
         * Только на сегодняшнем периоде: у прошлого месяца настройка ни при
         * чём, там смотрят закрытые числа.
         */
        val setup = summary.setup
        if (today && setup != null && setup.visible && !setupHidden) {
            item {
                SetupCard(
                    setup = setup,
                    onSkip = vm::hideSetup,
                    onStep = { key ->
                        when (key) {
                            "services" -> goToServices()
                            "staff" -> goToStaff()
                            "firstOrder" -> goToShift()
                        }
                    },
                )
            }
        }

        if (today) {
            /*
             * Графика на сегодняшнем экране нет. Он отвечал на вопрос «как
             * шёл день», а этот вопрос владелец мойки себе не задаёт: у
             * него за день пять машин, и «как шло» видно по журналу внизу
             * построчно, с номерами и суммами.
             */
            item { TodaySnapshot(summary) }
            item { CrewBoard(vm.crew(summary)) }
        } else {
            item {
                /*
                 * Валюту и язык берём заранее: подписи графика собираются
                 * в обычных лямбдах, а `money()` из `core.ui` — это
                 * composable-обёртка, и звать её оттуда нельзя.
                 */
                val currency = currency()
                val lang = lang()
                RevenueChart(
                    series = summary.series,
                    title = L(R.string.summary__paymentsMonth),
                    axis = { it.dayLabel },
                    money = { amount -> money(amount, currency, lang) },
                )
            }
            item { MonthGrid(summary) }
            /*
             * Разрез оплат только в месяце. В сегодняшнем дне он повторял
             * журнал: под ним шли те же четыре записи, у каждой способ
             * оплаты написан словом, — и доля «наличные 75 %» была
             * пересказом трёх строк из четырёх. За месяц записей триста, и
             * пересчитать их глазами уже нельзя.
             */
            item { PaymentBreakdown(summary.split) }
        }

        if (feed.isNotEmpty()) {
            item { JournalHeader(today, feed.size) }
            if (filterable) {
                item { MethodFilter(methods, ui.feedMethod, vm::setFeedMethod) }
            }
            items(shown, key = { it.id }) { item ->
                JournalRow(
                    item = item,
                    highlighted = ui.newestFeedId == item.id,
                    onLongPress = { onCancel(item) },
                )
                if (item.id != shown.lastOrNull()?.id) HairLine()
            }
        }
    }
}

// ══════════════════════════ показание ══════════════════════════

@Composable
private fun Reading(ui: OwnerViewModel.UiState, summary: Summary) {
    Column(
        Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Row(
            Modifier.padding(top = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(7.dp),
        ) {
            /*
             * Дата обязательна всегда, включая «сегодня»: сутки считаются
             * по времени бизнеса и в полночь начинаются заново. Владелец,
             * открывший приложение в половине первого, видел ноль и решал,
             * что данные ушли.
             */
            Text(
                periodDates(summary, ui.loadedPeriod),
                fontSize = 12.5.sp,
                fontWeight = FontWeight.SemiBold,
                color = Brand.boardMuted,
            )
            CrewChip(summary)
        }

        /*
         * Не «прибыль»: по-армянски она отличается от «выручки» одной
         * буквой, и два похожих слова с разными числами на одном экране
         * путают даже автора продукта. «Вам остаётся» ни на что не похоже,
         * потому что это не термин, а обычная речь.
         */
        Text(
            profitTitle(ui.loadedPeriod, ui.isLoss),
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            color = Brand.onBoard.copy(alpha = 0.85f),
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 8.dp),
        )

        /*
         * Знак числа красит одно общее правило, а не этот экран: пока
         * каждый решал сам, день и сводка разошлись в оттенках при
         * одинаковом смысле, и это читалось как разная арифметика.
         */
        Text(
            money(summary.profit),
            fontSize = 54.sp,
            fontWeight = FontWeight.Bold,
            color = Brand.sign(summary.profit),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )

        Breakdown(summary)
        Change(summary, ui.loadedPeriod)
    }
}

/**
 * Из чего вышел результат — одной полосой, а не тремя колонками.
 *
 * Колонки были ошибкой композиции: сразу под ними шла вторая такая же
 * тройка (машины, средний чек, люди), и две одинаковые полоски подряд
 * читались одним длинным блоком ни о чём. Отличить их можно было, только
 * прочитав подписи, то есть глаз не работал вовсе.
 *
 * Полоса отвечает на вопрос, которого у колонок не было: КАКОЙ ДОЛЕЙ. Из
 * каждых двадцати тысяч владельцу осталось четыре, и это видно длиной
 * куска, без чтения цифр. Ровно так же устроен разрез по способам оплаты
 * ниже: одна фигура, один язык.
 *
 * Сумма кусков равна выручке всегда: прибыль — это она минус зарплаты
 * минус расходы, других слагаемых у неё нет.
 */
@Composable
private fun Breakdown(summary: Summary) {
    val stats = summary.stats
    val lang = lang()

    /*
     * В минус полоса не уходит: отрицательного куска не бывает. Когда
     * период ушёл в убыток, владельцу не осталось ничего — и полоса честно
     * состоит из зарплат и расходов, а знак минуса уже стоит в главном
     * числе над ней.
     */
    val parts = listOf(
        Share(L(R.string.common__you), Brand.grapeFill, maxOf(0, summary.profit)),
        Share(L(R.string.summary__toStaff), Brand.lavenderInk, stats.payroll),
        Share(L(R.string.expenses__title), Brand.sandInk, summary.costs.total),
    ).filter { it.amount > 0 }
    val total = parts.sumOf { it.amount }
    if (total == 0) return

    val voiceover = L(
        R.string.summary__voiceover,
        plainAmount(stats.revenue, lang),
        plainAmount(summary.costs.total, lang),
        plainAmount(stats.payroll, lang),
    )

    Column(
        Modifier
            .padding(top = 14.dp)
            .widthIn(max = 360.dp)
            .fillMaxWidth()
            /*
             * Читалка экрана произносит показания фразой, а не набором
             * чисел, — и на языке интерфейса, как и всё остальное.
             */
            .semantics(mergeDescendants = true) { contentDescription = voiceover },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        /*
         * Сколько всего пришло. Без этой строки полоса делила бы неизвестно
         * что: главное число называет остаток, а целое, из которого он
         * вышел, на экране не звучало нигде.
         */
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(L(R.string.summary__paidIn), fontSize = 11.5.sp, color = Brand.boardMuted)
            Text(
                money(stats.revenue),
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                color = Brand.onBoard,
                maxLines = 1,
            )
        }

        SplitBar(parts.map { it.ink to it.amount }, total, 12.dp)

        /*
         * Подписи одной строкой, а не колонками: колонка под полосой — это
         * снова тройка блоков, от которой мы и ушли.
         */
        FlowRowLayout(spacing = 11.dp) {
            parts.forEach { part ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                ) {
                    Dot(part.ink, 6.dp)
                    Text(part.label, fontSize = 11.sp, color = Brand.boardMuted, maxLines = 1)
                    Text(
                        money(part.amount),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = Brand.onBoard,
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

/** Кусок разреза: имя, цвет и деньги. */
private data class Share(val label: String, val ink: Color, val amount: Int)

/**
 * Полоса, разрезанная по долям.
 *
 * Один орган на оба разреза экрана — деньги периода и способы оплаты.
 * Второй копией он разъехался бы с первой на первой же правке, а читаются
 * они одинаково именно потому, что это одна фигура.
 */
@Composable
private fun SplitBar(parts: List<Pair<Color, Int>>, total: Int, height: Dp) {
    Row(
        Modifier.fillMaxWidth().height(height),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        parts.forEach { (ink, amount) ->
            Box(
                Modifier
                    /*
                     * Вес по деньгам: доля и есть длина. Минимум держим
                     * ненулевым — кусок нулевой ширины читается как
                     * отсутствие статьи, а она есть.
                     */
                    .weight(maxOf(amount.toFloat() / maxOf(total, 1), 0.02f))
                    .fillMaxHeight()
                    .clip(RoundedCornerShape(height / 3))
                    .background(ink)
            )
        }
    }
}

/** Точка-метка цвета: повторяется в легенде, в разрезе оплат и в журнале. */
@Composable
private fun Dot(ink: Color, size: Dp) {
    Box(Modifier.size(size).clip(CircleShape).background(ink))
}

/**
 * С чем сравнили и на сколько разошлось.
 *
 * В драмах, а не в процентах: процент от маленькой базы врёт — вчера
 * 3 000, сегодня 9 500 даёт «+217 %», а разница три помывки. Молчим, когда
 * сравнивать не с чем: в базе ноль записей или разница меньше сотни.
 */
@Composable
private fun Change(summary: Summary, period: String) {
    val previous = summary.previous
    if ((previous.count ?: 1) <= 0) return

    val diff = summary.profit - previous.profit
    if (abs(diff) < 100) return

    val lang = lang()
    val zone = zone()
    val label = when {
        period == OwnerViewModel.TODAY -> L(R.string.summary__vsLastWeek)
        previous.from != null && previous.to != null -> range(previous.from!!, previous.to!!, lang, zone)
        else -> L(R.string.summary__vsPrevMonth)
    }
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
        /*
         * Знак стрелкой и цифрой, не одним цветом: смысл не передаётся
         * оттенком — экран смотрят на мокром телефоне под солнцем.
         */
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
        Text(label, fontSize = 12.sp, color = Brand.boardMuted, maxLines = 1)
    }
}

/**
 * Кто сейчас на площадке — тёмной плашкой рядом с датой.
 *
 * Это не то же самое, что «работал сегодня»: человек мог встать час назад
 * и ещё ничего не намыть — по записям его не видно вовсе, а на мойке он
 * стоит.
 *
 * Плашка графитовая, и это не украшение: лаймовая точка по светлому
 * полотну даёт контраст 1.06, её там просто нет. Собственный тёмный фон —
 * единственный способ пустить фирменный лайм в верх экрана.
 *
 * Себя владелец здесь не видит. Он и так знает, что стоит на мойке, — а
 * плашка отвечает на вопрос «кто ещё», и собственное имя в ней занимало
 * место, ничего не сообщая.
 */
@Composable
private fun CrewChip(summary: Summary) {
    val me = LocalGraph.current.session.me.collectAsState().value
    val others = summary.onShift.filter { it.userId != me?.id }
    if (others.isEmpty()) return
    Row(
        Modifier
            .clip(RoundedCornerShape(9.dp))
            .background(Tone.SLATE.base)
            .padding(horizontal = 9.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Box(
            Modifier
                .size(6.dp)
                .clip(CircleShape)
                .background(Brand.lime)
        )
        Text(
            others.joinToString(", ") { it.name },
            fontSize = 12.5.sp,
            fontWeight = FontWeight.SemiBold,
            color = Color.White,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

// ══════════════════════════ содержание периода ══════════════════════════

/**
 * Быстрый ответ для сегодняшнего дня: объём, средний чек и люди.
 *
 * Приход уже объяснён полосой выше и здесь не повторяется. Средний чек
 * тоже ушёл: за день из пяти машин он считается по пяти числам, которые
 * стоят строчками ниже, и отдельным показанием ничего не добавляет. В
 * месяце, где записей триста, он остался — там его в уме не сложить.
 */
@Composable
private fun TodaySnapshot(summary: Summary) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(top = 20.dp, bottom = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SnapshotValue(L(R.string.summary__served), "${summary.stats.count}", Modifier.weight(1f))
        VerticalHair(34.dp)
        SnapshotValue(L(R.string.owner__onShift), "${summary.onShift.size}", Modifier.weight(1f))
    }
}

@Composable
private fun SnapshotValue(title: String, value: String, modifier: Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            value,
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            color = Brand.onBoard,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            title,
            fontSize = 10.5.sp,
            fontWeight = FontWeight.Medium,
            color = Brand.boardMuted,
            maxLines = 1,
        )
    }
}

/**
 * Кто сегодня работает и сколько ему за это причитается.
 *
 * Лента карточек, а не список строк.
 *
 * Строки в белой коробке отвечали верно, но выглядели таблицей: имя,
 * число, сумма — и так у каждого. Люди в этом продукте везде показаны
 * кружком своего цвета: в журнале записей, в команде, на зарплатах. Здесь
 * было единственное место, где они оставались безымянными строками.
 *
 * Карточка на человека даёт лицо и заработок одним предметом, а лента
 * вбок держит любое их число: на мойке их двое, у автосервиса бывает
 * шестеро, и вертикальный список из шести отодвинул бы журнал за нижний
 * край экрана.
 *
 * Сумма здесь — заработок человека, а не выручка, которую он принёс:
 * приход уже назван полосой наверху, и повторять его именами значило бы
 * показать одни и те же деньги дважды.
 */
@Composable
private fun CrewBoard(lines: List<OwnerViewModel.CrewLine>) {
    if (lines.isEmpty()) return

    Column(
        Modifier.fillMaxWidth().padding(top = 14.dp),
        verticalArrangement = Arrangement.spacedBy(9.dp),
    ) {
        Row(
            Modifier.padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                L(R.string.today__working),
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = Brand.boardMuted,
            )
            Text("${lines.size}", fontSize = 12.sp, color = Brand.boardMuted.copy(alpha = 0.7f))
        }

        LazyRow(
            contentPadding = PaddingValues(horizontal = 4.dp, vertical = 2.dp),
            horizontalArrangement = Arrangement.spacedBy(9.dp),
        ) {
            items(lines, key = { it.id }) { line -> CrewTile(line) }
        }
    }
}

@Composable
private fun CrewTile(line: OwnerViewModel.CrewLine) {
    val tone = Palette.personTone(line.name)

    Column(
        Modifier
            .width(148.dp)
            .clip(RoundedCornerShape(20.dp))
            .background(Brand.boardSurface)
            .border(0.8.dp, Brand.boardInk.copy(alpha = 0.07f), RoundedCornerShape(20.dp))
            .padding(13.dp),
    ) {
        Box(contentAlignment = Alignment.BottomEnd) {
            Box(
                Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    /*
                     * Ушедший домой — серым кружком, а не своим цветом:
                     * цвет здесь значит «человек», серый значит «его уже
                     * нет», и различать это надо раньше, чем читать точку.
                     */
                    .background(if (line.present) tone.base else Brand.boardInk.copy(alpha = 0.18f)),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    line.name.take(1),
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                )
            }
            /*
             * Зелёная точка значит «сейчас здесь». Кайма цвета карточки
             * отделяет её от кружка: на тёмном пятне зелёное без каймы
             * сливается.
             */
            if (line.present) {
                Box(
                    Modifier
                        .size(11.dp)
                        .clip(CircleShape)
                        .background(Brand.boardSurface),
                    contentAlignment = Alignment.Center,
                ) {
                    Box(
                        Modifier
                            .size(7.dp)
                            .clip(CircleShape)
                            .background(Brand.goodOnBoard)
                    )
                }
            }
        }

        Text(
            line.name,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            color = Brand.onBoard,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 10.dp),
        )
        Text(
            money(line.earned),
            fontSize = 17.sp,
            fontWeight = FontWeight.Bold,
            color = Brand.onBoard,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 1.dp),
        )
        Text(
            units(line.count),
            fontSize = 11.5.sp,
            color = Brand.boardMuted,
            maxLines = 1,
        )
    }
}

/**
 * За длинный период финансовая формула уже видна сверху. Здесь только два
 * операционных показателя — данные, которых в формуле нет, поэтому ни одна
 * большая сумма не повторяется.
 */
@Composable
private fun MonthGrid(summary: Summary) {
    val unit = Terms.unit(tenant()?.unitOne.orEmpty(), lang()).nom
    Row(
        Modifier
            .fillMaxWidth()
            .padding(top = 20.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        SoftMetric(
            background = Brand.mintCard,
            ink = Brand.mintInk,
            title = L(R.string.summary__served),
            value = "${summary.stats.count} $unit".trim(),
            foot = L(R.string.summary__inPeriod),
            icon = Icons.Filled.DirectionsCar,
            modifier = Modifier.weight(1f),
        )
        SoftMetric(
            background = Brand.lavenderCard,
            ink = Brand.lavenderInk,
            title = L(R.string.summary__avgPayment),
            value = money(summary.stats.avgCheck),
            foot = if (unit.isEmpty()) "" else perOneUnit(unit, lang()),
            icon = Icons.Filled.CreditCard,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun SoftMetric(
    background: Color,
    ink: Color,
    title: String,
    value: String,
    foot: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    modifier: Modifier,
) {
    Column(
        modifier
            .height(134.dp)
            .clip(RoundedCornerShape(20.dp))
            .background(background)
            .padding(14.dp),
    ) {
        Box(
            Modifier
                .size(32.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(ink.copy(alpha = 0.1f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null, tint = ink, modifier = Modifier.size(15.dp))
        }
        Spacer(Modifier.weight(1f))
        Text(title, fontSize = 12.sp, color = ink.copy(alpha = 0.8f), maxLines = 1)
        Text(
            value,
            fontSize = 21.sp,
            fontWeight = FontWeight.Bold,
            color = ink,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            foot.ifEmpty { " " },
            fontSize = 10.5.sp,
            color = ink.copy(alpha = 0.68f),
            maxLines = 1,
        )
    }
}

/**
 * Чем платили.
 *
 * Доля считается от суммы самих способов, а не от выручки периода: в
 * выручку входит продажа абонемента, которой в разрезе нет, и проценты
 * тогда не сходятся в сто. Нулевые способы не показываются: строка
 * «Перевод 0 ֏ · 0 %» сообщает ровно то же, что её отсутствие.
 */
@Composable
private fun PaymentBreakdown(split: List<SplitSegment>) {
    val parts = split.filter { it.revenue > 0 }.sortedByDescending { it.revenue }
    val total = parts.sumOf { it.revenue }

    Column(
        Modifier
            .fillMaxWidth()
            .padding(top = 10.dp)
            .surfaceCard(20.dp)
            .padding(15.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            L(R.string.today__paidWith),
            fontSize = 13.5.sp,
            fontWeight = FontWeight.SemiBold,
            color = Brand.onBoard,
        )

        if (parts.isEmpty()) {
            Text(L(R.string.today__noPayments), fontSize = 12.5.sp, color = Brand.boardMuted)
        } else {
            /*
             * Одна полоса на весь разрез, а не своя под каждой строкой.
             * Раньше три способа давали три отдельных шкалы, и сравнивать
             * их приходилось глазом через полстроки текста; целое при этом
             * не показывал никто. Теперь доли лежат рядом и складываются в
             * одну фигуру — ту же, что и в деньгах периода наверху.
             */
            SplitBar(parts.map { paymentInk(it.payment) to it.revenue }, total, 10.dp)

            parts.forEach { part ->
                val share = if (total > 0) {
                    (part.revenue.toDouble() / total * 100).roundToInt()
                } else {
                    0
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(7.dp),
                ) {
                    Dot(paymentInk(part.payment), 7.dp)
                    Text(
                        paymentLabel(part.payment),
                        fontSize = 13.sp,
                        color = Brand.onBoard,
                        modifier = Modifier.weight(1f),
                        maxLines = 1,
                    )
                    Text(
                        money(part.revenue),
                        fontSize = 13.5.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Brand.onBoard,
                        maxLines = 1,
                    )
                    Text(
                        "$share%",
                        fontSize = 12.sp,
                        color = Brand.boardMuted,
                        textAlign = TextAlign.End,
                        modifier = Modifier.width(38.dp),
                    )
                }
            }
        }
    }
}

// ══════════════════════════ журнал ══════════════════════════

@Composable
private fun JournalHeader(today: Boolean, count: Int) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 4.dp)
            .padding(top = 22.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        /*
         * Тем же словом, что в кабинете: владелец приходит смотреть не на
         * строки базы, а на то, что за день сделали. За длинный период это
         * уже не «сегодня», и раздел честно называется потоком.
         */
        Text(
            if (today) L(R.string.today__work) else L(R.string.owner__feed),
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            color = Brand.boardMuted,
            modifier = Modifier.weight(1f),
        )
        Text(units(count).trim(), fontSize = 12.sp, color = Brand.boardMuted)
    }
}

/**
 * Чем платили — полоса кнопок над журналом.
 *
 * Вопрос, ради которого она есть, один: «сколько сегодня налом». Разрез
 * выше отвечает суммой, а этот фильтр — списком: владелец пересчитывает
 * деньги в ящике по строкам, а не по итогу.
 *
 * Прокрутка вбок, а не перенос на вторую строку: способов оплаты четыре, а
 * на узком экране четыре кнопки в ряд не помещаются.
 */
@Composable
private fun MethodFilter(methods: List<String>, selected: String?, onSelect: (String?) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 4.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        SelectChip(L(R.string.today__all), selected == null) { onSelect(null) }
        methods.forEach { key ->
            SelectChip(paymentLabel(key), selected == key) {
                /*
                 * Повторное нажатие по выбранному снимает фильтр: иначе
                 * вернуться ко «всем» можно только прицелившись в первую
                 * кнопку, которая на узком экране уже уехала влево.
                 */
                onSelect(if (selected == key) null else key)
            }
        }
    }
}

/**
 * Строка журнала: кружок слева, деньги колонкой справа.
 *
 * Так устроены ленты операций в банковских приложениях, и причина в том,
 * как их читают: список не читают, его просматривают. Кружок слева
 * опознаётся раньше слова, а деньги, стоящие всегда у правого края на
 * одной и той же высоте, сравниваются между строками без чтения.
 *
 * Кружок заменил и точку с именем: писать имя словом больше не нужно,
 * цвет человека один и тот же в команде, в зарплатах и здесь.
 *
 * Три строки слева, три справа, на одной высоте: номер против суммы,
 * услуга против доли мойки, время против доли человека. Время внизу, в
 * самом тихом месте строки: на вопрос «что было» оно отвечает последним.
 */
@Composable
private fun JournalRow(item: FeedItem, highlighted: Boolean, onLongPress: () -> Unit) {
    /*
     * Лицо — по первому участнику: цвет человека один и тот же в команде,
     * в зарплатах и здесь. У совместной работы буква одна, а мыли
     * несколько — состав называет строка услуги ниже.
     */
    val face = item.crew?.firstOrNull()?.name ?: item.staffName ?: "—"
    val tone = Palette.personTone(face)

    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(if (highlighted) Brand.lime.copy(alpha = 0.1f) else Color.Transparent)
            /*
             * Отмена — долгим нажатием, как контекстное меню в iOS. Из
             * сорока записей отменяют одну, и заметным элементом строки это
             * действие быть не должно.
             */
            .pressable(role = L(R.string.work__revoke), onClick = onLongPress)
            .padding(horizontal = 4.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            Modifier
                .padding(top = 1.dp)
                .size(34.dp)
                .clip(CircleShape)
                .background(tone.base),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                face.take(1),
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
            )
        }

        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                Text(
                    item.clientKey ?: "—",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Brand.onBoard,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (highlighted) {
                    Icon(
                        Icons.Filled.Check,
                        contentDescription = null,
                        tint = Brand.goodOnBoard,
                        modifier = Modifier.size(10.dp),
                    )
                }
            }

            /*
             * Услуга — потому что без неё цена необъяснима: 2 500 и 12 000
             * в соседних строках выглядят ошибкой, пока не видно, что одно
             * это кузов, а другое химчистка. Способ оплаты словом, а не
             * значком: значок карты и значок перевода на десяти точках
             * различаются, только если знать, что они разные.
             *
             * У совместной работы здесь же состав: одной буквы в кружке
             * мало — по ней не поймёшь, что работали трое.
             */
            Text(
                if (item.shared) {
                    "${serviceName(item.serviceName)} · ${item.crewNames}"
                } else {
                    "${serviceName(item.serviceName)} · ${paymentLabel(item.payment).lowercase()}"
                },
                fontSize = 12.5.sp,
                color = Brand.boardMuted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                clock(item.createdAt),
                fontSize = 11.5.sp,
                color = Brand.boardMuted.copy(alpha = 0.75f),
                maxLines = 1,
            )
        }

        Column(
            horizontalAlignment = Alignment.End,
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                /*
                 * Скидка: зачёркнутый прайс рядом со взятым. Без него
                 * «6 500» не отличить от обычной цены, и о скидке владелец
                 * не узнаёт вовсе.
                 */
                item.listPrice?.takeIf { it > item.price }?.let { list ->
                    Text(
                        money(list),
                        fontSize = 12.sp,
                        color = Brand.boardMuted,
                        textDecoration = TextDecoration.LineThrough,
                    )
                }
                Text(
                    money(item.price),
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Brand.onBoard,
                    maxLines = 1,
                )
            }
            Text(
                L(R.string.summary__toBusiness, money(item.price - item.earned)),
                fontSize = 12.sp,
                color = Brand.boardMuted,
                maxLines = 1,
            )
            /*
             * При нулевой ставке строки долей нет вовсе: у владельца,
             * который записывает сам, процента нет, и «ему 0 ֏» в каждой
             * записи — шум.
             */
            if ((item.staffPercent ?: 0) > 0) {
                Text(
                    L(R.string.summary__share, money(item.earned)),
                    fontSize = 11.5.sp,
                    color = Brand.boardMuted.copy(alpha = 0.75f),
                    maxLines = 1,
                )
            }
        }
    }
}

// ══════════════════════════ слова ══════════════════════════

@Composable
private fun profitTitle(period: String, loss: Boolean): String = when (period) {
    OwnerViewModel.MONTH ->
        if (loss) L(R.string.summary__redMonth) else L(R.string.summary__keptMonth)

    OwnerViewModel.PREV_MONTH ->
        if (loss) L(R.string.summary__redPrevMonth) else L(R.string.summary__keptPrevMonth)

    else -> if (loss) L(R.string.summary__redToday) else L(R.string.summary__keptToday)
}

@Composable
private fun periodDates(summary: Summary, period: String): String {
    val lang = lang()
    val zone = zone()
    if (period == OwnerViewModel.TODAY) return Dates.longDay(summary.from, lang, zone)
    /*
     * Верхнюю границу берём из ответа, а не из «сегодня»: у закрытого
     * прошлого месяца период кончился, и подписывать его сегодняшним числом
     * — врать. Старый сервер её не пришлёт, тогда «по сейчас».
     */
    val to = summary.to ?: Instant.now().plusMillis(1)
    return range(summary.from, to, lang, zone)
}

/** «1 — 7 августа». Месяц не повторяется дважды, когда он один. */
@Composable
private fun range(
    from: Instant,
    to: Instant,
    lang: com.sevarm.tetr.core.i18n.Lang,
    zone: java.time.ZoneId,
): String {
    // верхняя граница исключающая: последний показанный день — накануне
    val last = to.minus(1, ChronoUnit.SECONDS)
    val sameMonth = Dates.monthKey(from, zone) == Dates.monthKey(last, zone)
    val head = if (sameMonth) {
        Dates.dayKey(from, zone).takeLast(2).trimStart('0')
    } else {
        Dates.longDay(from, lang, zone)
    }
    return "$head — ${Dates.longDay(last, lang, zone)}"
}
