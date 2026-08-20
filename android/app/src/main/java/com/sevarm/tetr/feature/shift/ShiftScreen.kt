package com.sevarm.tetr.feature.shift

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.WarningAmber
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sevarm.tetr.LocalGraph
import com.sevarm.tetr.R
import com.sevarm.tetr.core.api.ShiftOrder
import com.sevarm.tetr.core.i18n.L
import com.sevarm.tetr.core.i18n.Ln
import com.sevarm.tetr.core.i18n.Terms
import com.sevarm.tetr.core.queue.OrderQueue
import com.sevarm.tetr.core.ui.clock
import com.sevarm.tetr.core.ui.currency
import com.sevarm.tetr.core.ui.graphViewModel
import com.sevarm.tetr.core.ui.lang
import com.sevarm.tetr.core.ui.money
import com.sevarm.tetr.core.ui.paymentIcon
import com.sevarm.tetr.core.ui.paymentLabel
import com.sevarm.tetr.core.ui.serviceName
import com.sevarm.tetr.core.ui.staffCount
import com.sevarm.tetr.core.ui.tenant
import com.sevarm.tetr.core.ui.unitWord
import com.sevarm.tetr.design.Brand
import com.sevarm.tetr.design.DelayedContent
import com.sevarm.tetr.design.EmptyState
import com.sevarm.tetr.design.Insets
import com.sevarm.tetr.design.LimeButton
import com.sevarm.tetr.design.QuietButton
import com.sevarm.tetr.design.Refreshable
import com.sevarm.tetr.design.StateDot
import com.sevarm.tetr.design.TetrSkeleton
import com.sevarm.tetr.design.TetrSkeletonList
import com.sevarm.tetr.design.Tone
import com.sevarm.tetr.design.VerticalHair
import com.sevarm.tetr.design.pressable
import com.sevarm.tetr.feature.onboarding.WorkerWelcome
import java.time.Duration
import java.time.Instant
import kotlinx.coroutines.delay

/**
 * Смена мойщика — то же табло, что у владельца.
 *
 * Показание по оси экрана, сетка плиток, журнал строками. Экран открывают
 * сорок раз за смену мокрыми руками, поэтому три вещи, ради которых его
 * открывают, не уезжают за край никогда: переключатель смены закреплён
 * сверху, кнопка записи — снизу, заработок стоит между ними.
 *
 * Графика хода смены по часам здесь нет намеренно. На своей смене человек
 * и так знает, как шёл день; линия отвечала на вопрос, которого у него не
 * возникает. Разбор по часам живёт там, где его действительно спрашивают,
 * — в кабинете владельца.
 */
@Composable
fun ShiftScreen() {
    val graph = LocalGraph.current
    val session = graph.session
    val vm = graphViewModel { ShiftViewModel(it) }
    val ui by vm.ui.collectAsState()
    val me by session.me.collectAsState()
    val welcomeSeen by session.welcomeSeen.collectAsState()
    val queued by vm.queue.items.collectAsState()
    val tenant = tenant()

    var recording by remember { mutableStateOf(false) }
    var handingOver by remember { mutableStateOf(false) }
    var revoking by remember { mutableStateOf<ShiftOrder?>(null) }
    var welcoming by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { vm.reloadNow() }

    /*
     * Приветствие мойщика: три строки про смену, один раз за всю жизнь его
     * участия в этой мойке. Отмечаем прочитанным при показе, а не по
     * кнопке: окно, которое возвращается при каждом открытии вкладки,
     * перестаёт быть приветствием и становится помехой.
     */
    LaunchedEffect(me?.id, welcomeSeen) {
        if (me?.isOwner == false && !welcomeSeen) {
            welcoming = true
            vm.markWelcomeSeen()
        }
    }

    LaunchedEffect(ui.newestOrderId) {
        if (ui.newestOrderId != null) {
            delay(850)
            vm.clearHighlight()
        }
    }

    val waiting = remember(queued, tenant?.id) { vm.queue.waiting(tenant?.id) }
    val rejected = remember(queued, tenant?.id) { vm.queue.rejected(tenant?.id) }
    val orders = ui.shift?.orders.orEmpty()

    Column(
        Modifier
            .fillMaxSize()
            .background(Brand.board)
            .padding(top = Insets.top.calculateTopPadding()),
    ) {
        ShiftToggleBar(
            onShift = ui.onShift,
            onChange = { want -> if (want) vm.openShift() else handingOver = true },
        )

        /* Жест обновления, которого у Android не было вовсе: рука,
           увидев вчерашнее число, тянет вниз раньше, чем глаз ищет
           кнопку. Содержимое при этом остаётся на месте — это сверка, а
           не первая загрузка. */
        Refreshable(
            refreshing = ui.loading && ui.shift != null,
            modifier = Modifier.weight(1f),
            onRefresh = { vm.reload() },
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(
                    start = 12.dp,
                    end = 12.dp,
                    bottom = 16.dp,
                ),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                item { Reading(ui) }

                if (waiting.isNotEmpty()) {
                    item { PendingRow(waiting.size, ui.loading) }
                }

                items(rejected, key = { it.ref }) { item ->
                    StuckRow(
                        item = item,
                        onRetry = { vm.retryQueued(item.ref) },
                        onDrop = { vm.dropQueued(item.ref) },
                    )
                }

                item { Grid(ui) }

                if (orders.isNotEmpty()) {
                    item { JournalHeader(orders.size) }
                    items(orders, key = { it.id }) { order ->
                        JournalRow(
                            order = order,
                            highlighted = ui.newestOrderId == order.id,
                            last = order.id == orders.last().id,
                            onActions = { revoking = order },
                        )
                    }
                } else if (ui.shift == null) {
                    item {
                        /*
                         * Первая загрузка: места записей, а не пустота. До сих
                         * пор между открытием экрана и первой строкой журнала
                         * не было ничего, и смена выглядела пустой ровно до
                         * того момента, как оказывалась не пустой.
                         */
                        DelayedContent(ui.loading) {
                            TetrSkeletonList(rows = 4, modifier = Modifier.padding(top = 8.dp))
                        }
                    }
                } else {
                    item {
                        /*
                         * Пусто до смены и пусто на смене — разные ответы.
                         * Первый говорит, что делать; второй — что всё в
                         * порядке и первая машина просто ещё не приехала.
                         */
                        EmptyState(
                            title = if (ui.onShift) L(R.string.work__emptyOpen) else L(R.string.work__emptyOff),
                            note = if (ui.onShift) {
                                L(R.string.work__emptyOpenNote)
                            } else {
                                L(R.string.work__emptyOffNote)
                            },
                        )
                    }
                }
            }
        }

        RecordButton(
            onShift = ui.onShift,
            label = "+ " + Terms.unit(tenant?.unitOne.orEmpty(), lang()).acc,
            onRecord = { recording = true },
        )
    }

    if (recording) {
        OrderFlowSheet(
            onClose = { recording = false },
            onDone = { vm.reloadNow() },
        )
    }

    if (handingOver) {
        val shift = ui.shift
        HandoverSheet(
            expected = shift?.cashSoFar ?: 0,
            count = shift?.count ?: 0,
            revenue = shift?.revenue ?: 0,
            earned = shift?.earned ?: 0,
            takesShare = ui.takesShare,
            onClose = { handingOver = false },
            onDone = { cash ->
                handingOver = false
                vm.closeShift(cash)
            },
        )
    }

    revoking?.let { order ->
        /*
         * Отмена спрашивает и называет машину. Запись при этом не
         * удаляется — она остаётся в истории и в аудите, — но перестаёт
         * попадать в выручку и в заработок, и заработок за день
         * пересчитается на глазах. Поэтому и слово «отменить», а не
         * «удалить»: то же самое видит владелец.
         */
        AlertDialog(
            onDismissRequest = { revoking = null },
            containerColor = Brand.boardSurface,
            title = { Text(L(R.string.work__revokeTitle), color = Brand.onBoard) },
            text = {
                Text(
                    L(
                        R.string.shift__revokeBody,
                        order.clientKey ?: serviceName(order.serviceName),
                        serviceName(order.serviceName),
                        money(order.price),
                    ),
                    color = Brand.boardMuted,
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    vm.revoke(order.id)
                    revoking = null
                }) { Text(L(R.string.work__revoke), color = Brand.badOnBoard) }
            },
            dismissButton = {
                TextButton(onClick = { revoking = null }) {
                    Text(L(R.string.work__revokeKeep), color = Brand.boardMuted)
                }
            },
        )
    }

    if (welcoming) {
        val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = { welcoming = false },
            sheetState = sheet,
            containerColor = Brand.bg,
        ) {
            WorkerWelcome(onDone = { welcoming = false })
        }
    }
}

// ══════════════════════════ переключатель ══════════════════════════

/**
 * «Я на смене».
 *
 * Владельцу он показывает, кто на мойке, ещё до того как появится первая
 * запись: человека, который вышел час назад и пока ничего не намыл, по
 * записям не видно вовсе.
 */
@Composable
private fun ShiftToggleBar(onShift: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier
            .padding(horizontal = 12.dp)
            .padding(bottom = 8.dp)
            .fillMaxWidth()
            .clip(CircleShape)
            .background(Brand.boardInk.copy(alpha = 0.07f))
            .padding(start = 16.dp, end = 12.dp, top = 9.dp, bottom = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // точка никогда не единственный носитель смысла: рядом с ней всегда слово
        Box(
            Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(if (onShift) Brand.goodOnBoard else Brand.boardMuted.copy(alpha = 0.5f))
        )
        Spacer(Modifier.size(8.dp))
        Text(
            if (onShift) L(R.string.work__onShift) else L(R.string.shift__offShift),
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            color = Brand.onBoard,
            maxLines = 1,
            modifier = Modifier.weight(1f),
        )
        /*
         * Цвета выключенного состояния заданы явно, и это не вкусовщина.
         *
         * По умолчанию Material красит невключённый переключатель в
         * `surfaceVariant` с тонкой обводкой — а лежит он на светлой
         * капсуле поверх светлого полотна, и на телефоне его просто не
         * видно: человек жмёт наугад и не понимает, засчиталось ли.
         * Единственное действие, с которого начинается смена, обязано быть
         * заметно с первого взгляда.
         */
        Switch(
            checked = onShift,
            onCheckedChange = onChange,
            colors = SwitchDefaults.colors(
                checkedTrackColor = Brand.good,
                checkedThumbColor = Color.White,
                checkedBorderColor = Brand.good,
                uncheckedTrackColor = Brand.boardInk.copy(alpha = 0.14f),
                uncheckedThumbColor = Brand.boardSurface,
                uncheckedBorderColor = Brand.boardInk.copy(alpha = 0.32f),
            ),
        )
    }
}

// ══════════════════════════ показание ══════════════════════════

@Composable
private fun Reading(ui: ShiftViewModel.UiState) {
    val session = LocalGraph.current.session
    val me by session.me.collectAsState()
    val value = if (ui.takesShare) ui.shift?.earned ?: 0 else ui.shift?.revenue ?: 0

    Column(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 154.dp)
            .clip(RoundedCornerShape(25.dp))
            .background(Brand.boardSurface)
            .border(0.8.dp, Brand.boardInk.copy(alpha = 0.07f), RoundedCornerShape(25.dp))
            .padding(17.dp),
    ) {
        /*
         * Приветствие по времени суток — единственное место, где продукт
         * обращается к человеку по имени. Стоит десять строк, а экран
         * перестаёт быть казённым: мойщик открывает его сорок раз за
         * смену, и каждый раз его встречала таблица.
         */
        Text(
            greeting(me?.name),
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            color = Brand.boardMuted,
            maxLines = 1,
        )

        Spacer(Modifier.height(14.dp))
        Text(
            if (ui.takesShare) L(R.string.work__earnedToday) else L(R.string.work__shiftRevenue),
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            color = Brand.boardMuted,
        )

        /*
         * Пока смена не приехала, на месте суммы стоит место суммы, а не
         * «0 ֏». Ноль здесь не пустое место, а утверждение: «сегодня ты
         * не заработал ничего», — и мойщик читает его как факт, потому
         * что выглядит оно как факт.
         */
        if (ui.shift == null) {
            Spacer(Modifier.height(4.dp))
            TetrSkeleton(width = 190.dp, height = 46.dp, radius = 12.dp)
            Spacer(Modifier.height(4.dp))
        } else {
            Text(
                money(value),
                fontSize = 46.sp,
                fontWeight = FontWeight.Bold,
                color = Brand.onBoard,
                maxLines = 1,
            )
        }

        Spacer(Modifier.height(10.dp))
        ShiftLine(ui)
    }
}

@Composable
private fun greeting(name: String?): String {
    val hour = remember { java.time.LocalTime.now().hour }
    val hello = when (hour) {
        in 5..11 -> L(R.string.shift__greetingMorning)
        in 12..17 -> L(R.string.shift__greetingDay)
        in 18..23 -> L(R.string.shift__greetingEvening)
        // ночью «доброй ночи» звучит прощанием, поэтому нейтральное
        else -> L(R.string.shift__greetingPlain)
    }
    return if (name.isNullOrEmpty()) hello else "$hello, $name"
}

/**
 * «Я на смене · с 08:40 · 7 ч 15 мин».
 *
 * Точка залита, когда смена идёт, и пустая, когда нет: одного цвета мало —
 * приглушённый серый и зелёный на солнце различаются хуже, чем кольцо и
 * пятно. Длительность растёт сама: экран открыт часами, и застывшая цифра
 * врала бы.
 */
@Composable
private fun ShiftLine(ui: ShiftViewModel.UiState) {
    val openedAt = ui.shift?.openedAt
    val closed = ui.shift?.closedToday

    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        StateDot(ui.onShift)

        when {
            ui.onShift && openedAt != null -> {
                var now by remember { mutableStateOf(Instant.now()) }
                LaunchedEffect(openedAt) {
                    while (true) {
                        now = Instant.now()
                        delay(30_000)
                    }
                }
                Text(
                    L(R.string.shift__onShiftSince, clock(openedAt), lasted(openedAt, now)),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Brand.goodOnBoard,
                    maxLines = 1,
                )
            }

            closed != null -> Text(
                L(R.string.shift__doneRange, clock(closed.openedAt), clock(closed.closedAt)),
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = Brand.boardMuted,
                maxLines = 1,
            )

            else -> Text(
                if (ui.onShift) L(R.string.work__onShift) else L(R.string.work__emptyOff),
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = if (ui.onShift) Brand.goodOnBoard else Brand.boardMuted,
                maxLines = 1,
            )
        }
    }
}

/** «7 ժ 15 ր». Часы отбрасываются, когда их нет, — как в вебе. */
@Composable
private fun lasted(since: Instant, now: Instant): String {
    val minutes = maxOf(0, Duration.between(since, now).toMinutes().toInt())
    return if (minutes < 60) {
        L(R.string.shift__lastedMinutes, minutes)
    } else {
        L(R.string.shift__lastedHours, minutes / 60, minutes % 60)
    }
}

// ══════════════════════════ сетка плиток ══════════════════════════

/**
 * Показатели смены: тонкая строка и одна тёплая.
 *
 * Была мозаика из трёх цветных плиток — лавандовой во всю высоту, мятной и
 * песочной рядом. Она читалась приборной панелью, а не сменой: три заливки
 * одинаковой силы спорили и между собой, и с числом над ними, и первым на
 * экране читался цвет, а не деньги.
 *
 * Сейчас числа стоят строкой на полотне, без коробок вокруг каждого, — тем
 * же приёмом, что показатели дня в сводке. Экран продукта не должен
 * разговаривать в двух разных манерах.
 *
 * Средний чек убран. За смену он считается по трём-пяти записям и прыгает
 * от одной дорогой мойки, а решает по нему не мойщик и не в этот день; у
 * владельца его убрали из сегодняшнего дня по той же причине.
 *
 * Наличные вынесены из строки отдельной тёплой полосой. Это единственное
 * число экрана, которое превращается в действие: столько с человека
 * спросят при закрытии смены.
 */
@Composable
private fun Grid(ui: ShiftViewModel.UiState) {
    val count = ui.shift?.count ?: 0
    val cash = ui.shift?.cashSoFar ?: 0
    val revenue = ui.shift?.revenue ?: 0
    val percent = ui.shift?.percent ?: 0

    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(
            Modifier.fillMaxWidth().padding(vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ShiftValue(
                // подпись под числом — множественное: «машины», не «машина»
                unitWord(count).ifEmpty { L(R.string.shift__record) },
                "$count",
                Modifier.weight(1f),
            )
            VerticalHair(34.dp)
            /*
             * Подпись называет, ЧЬИ это деньги. «Выручка смены» стояло и
             * здесь, и в кабинете владельца, а рядом — заработок мойщика:
             * два похожих числа, и какое из них твоё, приходилось решать.
             * Теперь это «сумма работ», а доля названа долей.
             */
            ShiftValue(
                if (ui.takesShare) {
                    L(R.string.work__worksTotal)
                } else {
                    L(R.string.shift__yourShare, percent)
                },
                money(revenue),
                Modifier.weight(1f),
            )
        }

        CashRow(cash)
    }
}

@Composable
private fun ShiftValue(title: String, value: String, modifier: Modifier) {
    Column(
        modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            value,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            color = Brand.onBoard,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            title,
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
            color = Brand.boardMuted,
            maxLines = 1,
        )
    }
}

/**
 * Сколько наличных на руках и что с ними будет.
 *
 * Графит, а не кремовая бумага. Кремовая была слишком близка к самому
 * полотну: полоса растворялась в нём и переставала быть отдельным
 * предметом, хотя это единственное число экрана, которое превращается в
 * действие — столько с человека спросят при закрытии смены.
 *
 * Тёмная плашка решает это без нового цвета в палитре: она уже стоит на
 * сводке под именами тех, кто на площадке. И только на тёмном в этом
 * продукте можно пустить лайм — по светлому он даёт контраст 1.06 и не
 * виден вовсе. Сумма лаймом, поэтому её видно раньше подписи.
 */
@Composable
private fun CashRow(cash: Int) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(Tone.SLATE.base)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            Modifier
                .size(38.dp)
                .clip(RoundedCornerShape(13.dp))
                .background(Color.White.copy(alpha = 0.10f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Filled.Payments,
                contentDescription = null,
                tint = Brand.lime,
                modifier = Modifier.size(16.dp),
            )
        }

        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(
                L(R.string.shift__cashInHand),
                fontSize = 14.5.sp,
                fontWeight = FontWeight.SemiBold,
                color = Color.White,
            )
            Text(
                L(R.string.shift__toHandOver),
                fontSize = 11.5.sp,
                color = Color.White.copy(alpha = 0.6f),
            )
        }

        Text(
            money(cash),
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            color = Brand.lime,
            maxLines = 1,
        )
    }
}

/**
 * Несинхронизированное показываем честно, но не тревожно: запись сделана и
 * не пропадёт, просто ещё не ушла.
 */
@Composable
private fun PendingRow(count: Int, loading: Boolean) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(Brand.boardInk.copy(alpha = 0.07f))
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(
            Icons.Filled.WifiOff,
            contentDescription = null,
            tint = Brand.boardMuted,
            modifier = Modifier.size(14.dp),
        )
        Text(
            Ln(R.plurals.shift__waitingToSend, count),
            fontSize = 13.sp,
            color = Brand.boardMuted,
        )
    }
}

/**
 * Запись, которую сервер не принял.
 *
 * Показывается как есть, с номером машины и причиной: молча выбросить
 * работу человека нельзя, а решить, повторить её или отменить, может
 * только он сам.
 */
@Composable
private fun StuckRow(item: OrderQueue.Item, onRetry: () -> Unit, onDrop: () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(Brand.boardInk.copy(alpha = 0.07f))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Icon(
                Icons.Filled.WarningAmber,
                contentDescription = null,
                tint = Brand.warnOnBoard,
                modifier = Modifier.size(15.dp),
            )
            Column {
                Text(
                    item.clientKey,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Brand.onBoard,
                )
                Text(
                    "${serviceName(item.serviceName)} · ${item.failure.orEmpty()}",
                    fontSize = 11.5.sp,
                    color = Brand.boardMuted,
                )
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            QuietButton(L(R.string.common__retry), onClick = onRetry)
            QuietButton(L(R.string.expenses__remove), onClick = onDrop)
        }
    }
}

// ══════════════════════════ журнал ══════════════════════════

@Composable
private fun JournalHeader(count: Int) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 6.dp)
            .padding(top = 14.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            L(R.string.shift__latest),
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            color = Brand.boardMuted,
            modifier = Modifier.weight(1f),
        )
        Text("$count", fontSize = 12.sp, color = Brand.boardMuted)
    }
}

/**
 * Строка журнала.
 *
 * Номер машины крупно, услуга и оплата под ним. Из сорока записей за смену
 * «Комплекс» встречается двадцать раз, а номер один: искать свою ошибку по
 * названию услуги — это читать список целиком. Так же в вебе.
 */
@Composable
private fun JournalRow(
    order: ShiftOrder,
    highlighted: Boolean,
    last: Boolean,
    onActions: () -> Unit,
) {
    Column {
        Row(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(if (highlighted) Brand.lime.copy(alpha = 0.1f) else Color.Transparent)
                .padding(horizontal = 6.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Column(Modifier.weight(1f)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(
                        order.clientKey ?: serviceName(order.serviceName),
                        fontSize = 14.5.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Brand.onBoard,
                        maxLines = 1,
                    )
                    Icon(
                        if (highlighted) Icons.Filled.Check else paymentIcon(order.payment),
                        contentDescription = paymentLabel(order.payment),
                        tint = if (highlighted) Brand.goodOnBoard else Brand.boardMuted,
                        modifier = Modifier.size(11.dp),
                    )
                }
                /*
                 * Совместная работа названа словом и числом людей. Без них
                 * строка нечитаема: цена 12 000, а заработок 1 800, и
                 * почему — неизвестно.
                 */
                Text(
                    listOfNotNull(
                        serviceName(order.serviceName).takeIf { order.clientKey != null },
                        paymentLabel(order.payment),
                        clock(order.createdAt),
                        if (order.shared) {
                            L(R.string.crew__joint) + " · " + staffCount(order.crew ?: 1)
                        } else {
                            null
                        },
                    ).joinToString(" · "),
                    fontSize = 12.sp,
                    color = Brand.boardMuted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            Column(horizontalAlignment = Alignment.End) {
                Text(
                    money(order.price),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Brand.onBoard,
                )
                /*
                 * Своя доля — только у совместной. У одиночной она и так
                 * вся наверху экрана, и вторая строка под ценой повторяла
                 * бы одно число дважды.
                 */
                if (order.shared) {
                    order.earned?.let { mine ->
                        Text(money(mine), fontSize = 12.sp, color = Brand.boardMuted)
                    }
                }
            }

            /*
             * Отмена ошибочной записи — здесь же, а не «позвони владельцу».
             * Три точки молчат: из сорока записей отменяют одну, и заметным
             * элементом строки это действие быть не должно.
             */
            Box(
                Modifier
                    .size(30.dp)
                    .pressable(onClick = onActions),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Filled.MoreHoriz,
                    contentDescription = L(
                        R.string.shift__rowActions,
                        order.clientKey ?: serviceName(order.serviceName),
                    ),
                    tint = Brand.boardMuted,
                    modifier = Modifier.size(16.dp),
                )
            }
        }

        if (!last) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(1.dp)
                    .background(Brand.boardInk.copy(alpha = 0.07f))
            )
        }
    }
}

// ══════════════════════════ кнопка ══════════════════════════

/**
 * Вне смены записывать нельзя, и кнопка это показывает собой, а не окошком
 * с отказом. Причина не в дисциплине: машина, записанная вне смены, не
 * попадает в сдачу наличных при закрытии — деньги за неё работник уносит,
 * ничего не нарушив, а владелец недосчитывается и не понимает почему.
 */
@Composable
private fun RecordButton(onShift: Boolean, label: String, onRecord: () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            /*
             * Полоса стоит ПОД списком, а не поверх него: журнал кончается
             * там, где она начинается. Растушёвки сверху поэтому нет —
             * прятать под полосой нечего, а градиент на сплошном полотне
             * читался бы грязью.
             */
            .background(Brand.board)
            /*
             * Системный отступ снизу здесь НЕ прибавляется, и это важно.
             *
             * Его уже отвёл `Scaffold`: панель вкладок сама съедает
             * навигационную полосу, а содержимому под ней отдаётся ровно
             * то, что осталось. Прибавленный второй раз, он давал щель в
             * палец между кнопкой записи и панелью — кнопка «висела», а на
             * узком экране это единственное действие мойщика.
             */
            .padding(horizontal = 12.dp)
            .padding(top = 18.dp, bottom = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (!onShift) {
            Text(
                L(R.string.work__needShift),
                fontSize = 12.5.sp,
                color = Brand.boardMuted,
            )
        }
        LimeButton(text = label, enabled = onShift, onClick = onRecord)
    }
}
