package com.sevarm.tetr.feature.payroll

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckBox
import androidx.compose.material.icons.filled.CheckBoxOutlineBlank
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.Remove
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sevarm.tetr.R
import com.sevarm.tetr.core.api.PayrollBoard
import com.sevarm.tetr.core.api.PayrollBoardDay
import com.sevarm.tetr.core.api.PayrollPayment
import com.sevarm.tetr.core.api.PayrollPerson
import com.sevarm.tetr.core.i18n.Dates
import com.sevarm.tetr.core.i18n.L
import com.sevarm.tetr.core.i18n.Ln
import com.sevarm.tetr.core.i18n.Terms
import com.sevarm.tetr.core.ui.clock
import com.sevarm.tetr.core.ui.currency
import com.sevarm.tetr.core.ui.graphViewModel
import com.sevarm.tetr.core.ui.lang
import com.sevarm.tetr.core.ui.money
import com.sevarm.tetr.core.ui.staffCount
import com.sevarm.tetr.core.ui.tenant
import com.sevarm.tetr.core.ui.unitWord
import com.sevarm.tetr.core.ui.units
import com.sevarm.tetr.core.ui.zone
import com.sevarm.tetr.design.Brand
import com.sevarm.tetr.design.DelayedContent
import com.sevarm.tetr.design.EmptyState
import com.sevarm.tetr.design.ErrorState
import com.sevarm.tetr.design.HairLine
import com.sevarm.tetr.design.Insets
import com.sevarm.tetr.design.LimeButton
import com.sevarm.tetr.design.Palette
import com.sevarm.tetr.design.QuietButton
import com.sevarm.tetr.design.Refreshable
import com.sevarm.tetr.design.TetrScreenSkeleton
import com.sevarm.tetr.design.VerticalHair
import com.sevarm.tetr.design.pressable
import java.time.Instant

/**
 * Зарплаты: сколько раздать, кому и за какой день.
 *
 * Порядок чтения задан вопросами, с которыми сюда заходят:
 *
 *   1. сколько всего раздать сейчас   → плита наверху;
 *   2. кому                           → строки внутри дня;
 *   3. за какой день                  → сам блок дня;
 *   4. почему столько                 → разложение по машинам в строке;
 *   5. что уже отдано                 → вкладка «История».
 *
 * Пятое живёт отдельной вкладкой, а не в конце того же списка: долг и уже
 * отданное — разные вопросы, и один список, где они перемешаны, не
 * отвечает ни на один.
 */
@Composable
fun PayrollScreen() {
    val vm = graphViewModel { PayrollViewModel(it) }
    val ui by vm.ui.collectAsState()
    val currency = currency()
    val lang = lang()

    var asking by remember { mutableStateOf<List<PayrollViewModel.Pick>?>(null) }

    LaunchedEffect(Unit) { vm.reloadNow() }

    Box(
        Modifier
            .fillMaxSize()
            .background(Brand.board)
            .padding(top = Insets.top.calculateTopPadding()),
    ) {
        val board = ui.payroll?.board
        /* Жест обновления, которого у Android не было вовсе. Сверка,
           а не первая загрузка: долг остаётся на экране. */
        Refreshable(
            refreshing = ui.refreshing && ui.payroll != null,
            onRefresh = { vm.reload() },
        ) {
            when {
                ui.failure != null -> ErrorState(ui.failure!!) { vm.reload() }
                /* Места рабочих дней со строками людей, а не кружок:
                   скелет говорит, что сейчас появится, кружок — только
                   «ждите». */
                !ui.loaded -> DelayedContent(true) {
                    TetrScreenSkeleton(rows = 5, avatar = true)
                }
                board == null -> Outdated { vm.reload() }
                else -> Board(vm = vm, ui = ui, board = board)
            }
        }

        /*
         * Причал у нижнего края: отмеченное в разных днях остаётся под
         * рукой, даже когда сам день уехал за верхний край.
         */
        val picked = vm.allPicked()
        if (picked.isNotEmpty()) {
            Dock(
                count = picked.size,
                total = picked.sumOf { it.amount },
                busy = ui.settling,
                modifier = Modifier.align(Alignment.BottomCenter),
                onPay = { asking = picked },
            )
        }

        ui.note?.let { note ->
            Text(
                note,
                fontSize = 13.5.sp,
                fontWeight = FontWeight.SemiBold,
                color = Brand.board,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 96.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(Brand.onBoard)
                    .padding(horizontal = 14.dp, vertical = 10.dp),
            )
        }
    }

    asking?.let { items ->
        /*
         * В окне стоит ровно то, что произойдёт: кому, сколько и за какой
         * день. Расчёт закрывает день, и следующий пойдёт от него;
         * подтверждение без имён и сумм — это кнопка «да», которую жмут не
         * глядя.
         */
        val zone = zone()
        val days = items.map { it.day }.distinct()
        val when_ = if (days.size == 1) dayTitle(days[0], vm.today(), lang, zone) else null
        val lines = buildList {
            when_?.let { add(it) }
            items.forEach { add("${it.name} · ${money(it.amount)}") }
            if (items.size > 1) add(L(R.string.payroll__feedTotal, money(items.sumOf { it.amount })))
        }

        AlertDialog(
            onDismissRequest = { asking = null },
            containerColor = Brand.boardSurface,
            title = { Text(L(R.string.payroll__confirmTitle), color = Brand.onBoard) },
            text = { Text(lines.joinToString("\n"), color = Brand.boardMuted) },
            confirmButton = {
                TextButton(onClick = {
                    vm.settle(items, currency, lang)
                    asking = null
                }) { Text(L(R.string.payroll__confirm), color = Brand.grape) }
            },
            dismissButton = {
                TextButton(onClick = { asking = null }) {
                    Text(L(R.string.common__cancel), color = Brand.boardMuted)
                }
            },
        )
    }
}

@Composable
private fun Board(vm: PayrollViewModel, ui: PayrollViewModel.UiState, board: PayrollBoard) {
    val today = vm.today()
    val lang = lang()
    val zone = zone()

    /*
     * Дни с долгом — и сегодняшний, даже если он уже закрыт: сегодня ещё
     * растёт, и владельцу нужно видеть, что там происходит. Когда долга нет
     * вовсе, под чертой оказываются все дни: наверху стоит ответ «всё
     * выплачено», и единственная карточка рядом с ним читалась бы
     * исключением из него.
     */
    val open = if (board.totals.outstanding > 0) {
        board.days.filter { it.outstanding > 0 || it.day == today }
    } else {
        emptyList()
    }
    val closed = board.days.filter { day -> open.none { it.day == day.day } }

    LazyColumn(
        contentPadding = PaddingValues(
            start = 12.dp,
            end = 12.dp,
            bottom = if (ui.settling || ui.picked.isNotEmpty()) 96.dp else 28.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item { Hero(board) }
        item { Tabs(vm, ui, board) }

        if (ui.tab == PayrollViewModel.Tab.DUE) {
            if (board.totals.outstanding == 0) {
                item { Settled(board.payments.isNotEmpty()) { vm.setTab(PayrollViewModel.Tab.HISTORY) } }
            } else {
                if (open.none { it.day == today }) {
                    item { EmptyToday(dayTitle(today, today, lang, zone)) }
                }
                items(open.size, key = { open[it].day }) { i ->
                    DayCard(vm, ui, open[i], today)
                }
            }

            if (closed.isNotEmpty()) {
                item {
                    Text(
                        if (ui.showClosed) {
                            L(R.string.payroll__hidePaidDays)
                        } else {
                            Ln(R.plurals.payroll__showPaidDays, closed.size)
                        },
                        fontSize = 12.5.sp,
                        fontWeight = FontWeight.Medium,
                        color = Brand.boardMuted,
                        modifier = Modifier
                            .fillMaxWidth()
                            .pressable { vm.toggleClosed() }
                            .padding(horizontal = 6.dp, vertical = 8.dp),
                    )
                }
                if (ui.showClosed) {
                    items(closed.size, key = { "closed-${closed[it].day}" }) { i ->
                        val day = closed[i]
                        /*
                         * Развёрнутый закрытый день — обычная карточка:
                         * ничего особенного в нём нет, кроме того, что он
                         * закрыт.
                         */
                        if (day.day in ui.openedDays) {
                            DayCard(vm, ui, day, today)
                        } else {
                            ClosedCard(day, today) { vm.openDay(day.day) }
                        }
                    }
                }
            }
        } else {
            History(board.payments, today)
        }
    }
}

// ══════════════════════════ показания ══════════════════════════

/**
 * Сколько всего раздать — и кому.
 *
 * Грейповой плиты здесь больше нет: она была самой яркой вещью на экране,
 * но говорила ровно одно число, а следом шла белая полоска из трёх
 * показателей, где первым стояло начисление — та же самая сумма второй раз
 * подряд.
 *
 * И голое число по центру тоже не годится: ровно так начинается сводка, и
 * два разных экрана открывались бы одинаково. Разница между ними
 * существенная. Сводка отвечает «сколько получилось» — это показание
 * прибора, и место ему по оси. Зарплаты отвечают «кому раздать» — это
 * список людей, и начинаться он должен с людей.
 *
 * Поэтому наверху стопка кружков: те, кому сейчас должны, каждый своим
 * цветом — тем же, каким его имя набрано в журнале, в команде и в строке
 * ниже. Кружки перекрывают друг друга, как принято показывать группу, и
 * при пятерых и больше последним встаёт счётчик остатка. Блок прижат
 * влево, а не выровнен по центру: асимметрия и есть то, чем этот экран
 * отличается от сводки с первого взгляда.
 */
@Composable
private fun Hero(board: PayrollBoard) {
    val total = board.totals.outstanding
    val owed = owedPeople(board)

    val parts = buildList {
        if (total > 0) add(staffCount(board.totals.owedTo))
        add(units(board.totals.units))
        if (board.totals.settled > 0) {
            add(L(R.string.owner__payrollAccrued) + " " + money(board.totals.accrued))
            add(L(R.string.payroll__paid) + " " + money(board.totals.settled))
        }
    }

    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 4.dp)
            .padding(top = 10.dp, bottom = 8.dp),
    ) {
        if (owed.isNotEmpty()) {
            Faces(owed)
            Spacer(Modifier.height(12.dp))
        }

        Text(
            L(R.string.payroll__dueHeader),
            fontSize = 10.sp,
            fontWeight = FontWeight.Black,
            letterSpacing = 1.35.sp,
            color = Brand.boardMuted,
        )
        /*
         * Долг набран чернилами, а не грейпом: это показание, а не
         * действие, и красить его фирменным цветом значит обещать нажатие,
         * которого нет.
         */
        Text(
            money(total),
            fontSize = 44.sp,
            fontWeight = FontWeight.Bold,
            color = Brand.onBoard,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 2.dp),
        )
        Text(
            if (total > 0) parts.joinToString(" · ") else L(R.string.payroll__dayAllPaid),
            fontSize = 12.5.sp,
            color = Brand.boardMuted,
            modifier = Modifier.padding(top = 3.dp),
        )
    }
}

/**
 * Кому должны, от большего долга к меньшему.
 *
 * Один человек может стоять в нескольких днях; здесь он один и с общим
 * долгом, иначе в стопке появились бы два одинаковых кружка.
 */
private fun owedPeople(board: PayrollBoard): List<Pair<String, Int>> {
    val sums = LinkedHashMap<String, Int>()
    board.days.orEmpty().forEach { day ->
        day.people.forEach { person ->
            val name = person.name
            if (person.earned > 0 && !name.isNullOrEmpty()) {
                sums[name] = (sums[name] ?: 0) + person.earned
            }
        }
    }
    return sums.toList().sortedByDescending { it.second }
}

/**
 * Стопка кружков: четверо в лицо, остальные счётчиком.
 *
 * Кольцо цвета полотна вокруг каждого — не украшение: без него два тёмных
 * кружка внахлёст сливаются в одно пятно, и стопка перестаёт читаться
 * количеством.
 */
@Composable
private fun Faces(people: List<Pair<String, Int>>) {
    val shown = people.take(4)
    val rest = people.size - shown.size

    Row(
        horizontalArrangement = Arrangement.spacedBy((-11).dp),
        modifier = Modifier.clearAndSetSemantics { },
    ) {
        shown.forEach { (name, _) ->
            Box(
                Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(Brand.board)
                    .padding(2.5.dp)
                    .clip(CircleShape)
                    .background(Palette.personTone(name).base),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    name.take(1),
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                )
            }
        }
        if (rest > 0) {
            Box(
                Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(Brand.board)
                    .padding(2.5.dp)
                    .clip(CircleShape)
                    .background(Brand.boardInk.copy(alpha = 0.09f)),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    "+$rest",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = Brand.boardMuted,
                )
            }
        }
    }
}

/**
 * Долг и история — под переключателем, а не в одном списке.
 *
 * Суммы на вкладке нет, хотя в кабинете она есть: сегмент ужимает надпись,
 * и узкие пробелы между разрядами схлопываются — «1 266 750» превращается
 * в число, которое читают по одной цифре. Та же сумма стоит строкой выше,
 * в плите, кеглем в сорок три.
 */
@Composable
private fun Tabs(vm: PayrollViewModel, ui: PayrollViewModel.UiState, board: PayrollBoard) {
    val labels = listOf(
        PayrollViewModel.Tab.DUE to if (board.totals.outstanding > 0) {
            L(R.string.owner__toPay)
        } else {
            L(R.string.payroll__allPaidMark)
        },
        PayrollViewModel.Tab.HISTORY to L(R.string.payroll__tabHistory),
    )
    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
        labels.forEachIndexed { index, (tab, label) ->
            SegmentedButton(
                selected = ui.tab == tab,
                onClick = { vm.setTab(tab) },
                shape = SegmentedButtonDefaults.itemShape(index, labels.size),
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
                Text(label, fontSize = 13.sp, maxLines = 1)
            }
        }
    }
}

// ══════════════════════════ рабочие дни ══════════════════════════

/**
 * Рабочий день блоком.
 *
 * В шапке стоит то, ради чего блок читают: сколько по этому дню осталось
 * отдать. Не «начислено за день» и не «выплачено» — именно долг: два
 * других числа справочные, и ставить их на то же место значит заставлять
 * выбирать, какое из трёх сейчас важно.
 */
@Composable
private fun DayCard(
    vm: PayrollViewModel,
    ui: PayrollViewModel.UiState,
    day: PayrollBoardDay,
    today: String,
) {
    val lang = lang()
    val zone = zone()
    val payable = day.people.filter { it.staffId != null && it.earned > 0 }
    val mine = payable.filter { vm.key(day.day, it) in ui.picked }

    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(22.dp))
            .background(Brand.boardSurface)
            .padding(16.dp),
    ) {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.weight(1f)) {
                Text(
                    dayTitle(day.day, today, lang, zone),
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = Brand.onBoard,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    "${staffCount(day.people.size)} · ${units(day.units)}",
                    fontSize = 11.5.sp,
                    color = Brand.boardMuted,
                )
            }

            if (day.outstanding > 0) {
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        money(day.outstanding),
                        fontSize = 19.sp,
                        fontWeight = FontWeight.Bold,
                        color = Brand.onBoard,
                        maxLines = 1,
                    )
                    Text(L(R.string.payroll__dayToPay), fontSize = 10.5.sp, color = Brand.boardMuted)
                }
            } else {
                /*
                 * Коротко: полная фраза рядом с датой ломала заголовок на
                 * две строки — на телефоне на эту полку не помещаются две
                 * фразы сразу.
                 */
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Filled.Check,
                        contentDescription = null,
                        tint = Brand.goodOnBoard,
                        modifier = Modifier.size(13.dp),
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(
                        L(R.string.payroll__paid),
                        fontSize = 12.5.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Brand.goodOnBoard,
                    )
                }
            }
        }

        /*
         * «Выбрать всех» — тихой подписью, а не второй кнопкой рядом с
         * расчётом: закрыть день целиком нужно часто, но выбор делает
         * человек, и по умолчанию не отмечено ничего.
         */
        if (payable.size > 1 && mine.size < payable.size) {
            Text(
                L(R.string.payroll__selectAll),
                fontSize = 12.5.sp,
                fontWeight = FontWeight.Medium,
                color = Brand.grape,
                modifier = Modifier
                    .padding(top = 10.dp)
                    .pressable { vm.pickAll(payable.map { vm.key(day.day, it) }) }
                    .padding(vertical = 4.dp),
            )
        }

        Spacer(Modifier.height(6.dp))
        day.people.forEachIndexed { index, person ->
            // линия между строками, но не над первой: список должен
            // начинаться содержимым, а не чертой
            if (index > 0) HairLine()
            PersonRow(vm, ui, person, day.day)
        }
    }
}

/**
 * Человек внутри дня.
 *
 * Строка, а не карточка с кнопкой во всю ширину. Прежде под каждым именем
 * лежала лаймовая полоса «отметить выплаченным», и лист из пяти человек
 * читался пятью призывами нажать; кто из них сколько получит, приходилось
 * искать между кнопками.
 */
@Composable
private fun PersonRow(
    vm: PayrollViewModel,
    ui: PayrollViewModel.UiState,
    person: PayrollPerson,
    day: String,
) {
    val id = vm.key(day, person)
    val owed = person.earned > 0
    val closed = !owed && person.paid > 0
    val name = person.name ?: "—"
    val tone = Palette.personTone(name)
    val isOpen = id in ui.opened
    val lang = lang()
    val zone = zone()

    Column {
        Row(
            Modifier
                .fillMaxWidth()
                .pressable(enabled = person.lines != null) { vm.toggleOpen(id) }
                .padding(vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            /*
             * Флажок у того, кому ещё должны; галка у того, с кем уже
             * рассчитались. Одно место, два состояния — по нему день и
             * читается сверху вниз, без чтения сумм.
             */
            Box(Modifier.size(30.dp), contentAlignment = Alignment.Center) {
                when {
                    owed && person.staffId != null -> Icon(
                        if (id in ui.picked) Icons.Filled.CheckBox else Icons.Filled.CheckBoxOutlineBlank,
                        contentDescription = "$name · ${money(person.earned)}",
                        tint = if (id in ui.picked) Brand.grape else Brand.boardMuted,
                        modifier = Modifier
                            .size(21.dp)
                            .pressable(enabled = !ui.settling) { vm.togglePick(id) },
                    )

                    else -> Icon(
                        if (closed) Icons.Filled.Check else Icons.Filled.Remove,
                        contentDescription = null,
                        tint = if (closed) Brand.goodOnBoard else Brand.boardMuted.copy(alpha = 0.5f),
                        modifier = Modifier.size(14.dp),
                    )
                }
            }

            Box(
                Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(tone.base)
            )

            Column(Modifier.weight(1f)) {
                Text(
                    name,
                    fontSize = 14.5.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = if (closed) Brand.boardMuted else Brand.onBoard,
                    maxLines = 1,
                )
                Text(
                    facts(person),
                    fontSize = 11.5.sp,
                    color = Brand.boardMuted,
                    maxLines = 1,
                )
            }

            Column(horizontalAlignment = Alignment.End) {
                Text(
                    money(if (owed) person.earned else person.paid),
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = if (closed) Brand.boardMuted else Brand.onBoard,
                    maxLines = 1,
                )
                when {
                    closed && person.paidAt != null -> Text(
                        Dates.stamp(person.paidAt!!, lang, zone),
                        fontSize = 11.sp,
                        color = Brand.goodOnBoard,
                    )
                    /*
                     * День, за который заплатили днём, а вечером намыли
                     * ещё, иначе выглядит неоплаченным целиком.
                     */
                    owed && person.paid > 0 -> Text(
                        L(R.string.payroll__alreadyPaid, money(person.paid)),
                        fontSize = 11.sp,
                        color = Brand.boardMuted,
                    )

                    owed -> Text(
                        L(R.string.payroll__unpaid),
                        fontSize = 11.sp,
                        color = Brand.boardMuted,
                    )
                }
            }

            if (person.lines != null) {
                Icon(
                    Icons.AutoMirrored.Filled.KeyboardArrowRight,
                    contentDescription = null,
                    tint = Brand.boardMuted.copy(alpha = 0.7f),
                    modifier = Modifier.size(16.dp),
                )
            } else {
                Spacer(Modifier.width(16.dp))
            }
        }

        /*
         * Разложение суммы. Оно и есть ответ на вопрос «почему столько»:
         * цена машины, ставка в момент записи и доля с неё. Ставка берётся
         * из самой записи — после смены процента текущая её уже не
         * объясняет.
         */
        if (isOpen) {
            person.lines?.forEach { line ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(start = 48.dp, bottom = 3.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        line.title,
                        fontSize = 11.5.sp,
                        color = Brand.boardMuted,
                        maxLines = 1,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        /*
                         * Совместная работа дописывает делитель. Без него
                         * строка «12 000 ֏ × 45 % → 1 800 ֏» врёт на
                         * глазах: сорок пять процентов от двенадцати тысяч
                         * это пять четыреста. Деление на число участников и
                         * есть недостающее звено — процент здесь общий на
                         * команду, а получает человек свою часть фонда.
                         */
                        line.formula(money(line.price)),
                        fontSize = 11.5.sp,
                        color = Brand.boardMuted.copy(alpha = 0.85f),
                        maxLines = 1,
                    )
                    Text(
                        money(line.earned),
                        fontSize = 11.5.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Brand.onBoard,
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}

@Composable
private fun facts(person: PayrollPerson): String {
    val left = units(person.count)
    val rate = person.rateLabel ?: return left
    return "$left · $rate"
}

/**
 * Закрытый день ничего не требует и занимает столько места, сколько стоит
 * ответ «здесь всё».
 */
@Composable
private fun ClosedCard(day: PayrollBoardDay, today: String, onOpen: () -> Unit) {
    val lang = lang()
    val zone = zone()
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(Brand.boardSurface)
            .pressable(onClick = onOpen)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            dayTitle(day.day, today, lang, zone),
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
            color = Brand.onBoard,
        )
        Icon(
            Icons.Filled.Check,
            contentDescription = null,
            tint = Brand.goodOnBoard,
            modifier = Modifier.size(13.dp),
        )
        Text(
            L(R.string.payroll__paid),
            fontSize = 11.5.sp,
            fontWeight = FontWeight.SemiBold,
            color = Brand.goodOnBoard,
            modifier = Modifier.weight(1f),
        )
        Text(
            money(day.paid),
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
            color = Brand.onBoard,
        )
        Icon(
            Icons.AutoMirrored.Filled.KeyboardArrowRight,
            contentDescription = null,
            tint = Brand.boardMuted,
            modifier = Modifier.size(14.dp),
        )
    }
}

// ══════════════════════════ пусто и сломалось ══════════════════════

@Composable
private fun Settled(hasHistory: Boolean, onHistory: () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(22.dp))
            .background(Brand.boardSurface)
            .padding(vertical = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(
            Icons.Filled.Check,
            contentDescription = null,
            tint = Brand.goodOnBoard,
            modifier = Modifier.size(22.dp),
        )
        Text(
            L(R.string.payroll__dayAllPaid),
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
            color = Brand.onBoard,
        )
        Text(L(R.string.payroll__nothingUnpaid), fontSize = 13.sp, color = Brand.boardMuted)
        if (hasHistory) {
            Spacer(Modifier.height(8.dp))
            QuietButton(L(R.string.payroll__openHistory), onClick = onHistory)
        }
    }
}

/** Сегодня ещё не мыли. Пустой сегодняшний день — это ответ. */
@Composable
private fun EmptyToday(title: String) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(22.dp))
            .background(Brand.boardSurface)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(title, fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Brand.onBoard)
        Text(
            L(R.string.payroll__dayEmpty),
            fontSize = 13.sp,
            color = Brand.boardMuted,
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 12.dp),
        )
    }
}

/**
 * Сервер старше приложения: дневного листа он ещё не отдаёт.
 *
 * Винить приложение здесь нельзя — обновлять надо не его, и надпись
 * «обновите приложение» отправила бы человека в магазин, где для него
 * ничего нет.
 */
@Composable
private fun Outdated(onRetry: () -> Unit) {
    Column(
        Modifier
            .fillMaxSize()
            .padding(horizontal = 24.dp, vertical = 44.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            L(R.string.payroll__notOnServer),
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            color = Brand.onBoard,
        )
        Text(L(R.string.errors__appNewer), fontSize = 13.sp, color = Brand.boardMuted)
        Spacer(Modifier.height(6.dp))
        QuietButton(L(R.string.common__retry), onClick = onRetry)
    }
}

// ══════════════════════════ история ══════════════════════════

/**
 * Что уже отдано.
 *
 * Две разные сущности названы двумя разными способами и стоят в разных
 * местах: когда отдали — заголовок дня и время слева, за что отдали —
 * подпись «за работу такого-то» под суммой.
 *
 * Группировка идёт по дню ВЫПЛАТЫ: сюда приходят с вопросом «когда я
 * реально отдал деньги». Расчёт с тремя людьми, сделанный одним нажатием,
 * показан одной записью — тем, чем он и был.
 */
private fun androidx.compose.foundation.lazy.LazyListScope.History(
    payments: List<PayrollPayment>,
    today: String,
) {
    if (payments.isEmpty()) {
        item {
            EmptyState(title = L(R.string.payroll__historyEmpty))
        }
        return
    }

    item {
        val lang = lang()
        val zone = zone()
        val groups = payments.groupBy { Dates.dayKey(it.paidAt, zone) }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            groups.keys.sortedDescending().forEach { key ->
                Text(
                    dayTitle(key, today, lang, zone),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Brand.boardMuted,
                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 6.dp),
                )
                groups[key]?.forEach { payment -> PaymentCard(payment) }
            }
        }
    }
}

@Composable
private fun PaymentCard(payment: PayrollPayment) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(bottom = 8.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(Brand.boardSurface)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            clock(payment.paidAt),
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            color = Brand.boardMuted,
        )

        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            payment.rows.forEach { line ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Box(
                        Modifier
                            .size(7.dp)
                            .clip(CircleShape)
                            .background(Palette.personTone(line.name ?: "—").base)
                    )
                    Text(
                        line.name ?: "—",
                        fontSize = 14.sp,
                        color = Brand.onBoard,
                        maxLines = 1,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        money(line.amount),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Brand.onBoard,
                    )
                }
            }

            // итог — только когда людей несколько: под одной строкой он
            // повторял бы её же число
            if (payment.rows.size > 1) {
                HairLine()
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        L(R.string.common__total),
                        fontSize = 12.sp,
                        color = Brand.boardMuted,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        money(payment.total),
                        fontSize = 14.5.sp,
                        fontWeight = FontWeight.Bold,
                        color = Brand.onBoard,
                    )
                }
            }

            Text(workLabel(payment), fontSize = 11.5.sp, color = Brand.boardMuted)
        }
    }
}

/**
 * За какой рабочий день отданы деньги — словами, а не второй датой: две
 * даты подряд снова пришлось бы различать по порядку, а не по смыслу.
 */
@Composable
private fun workLabel(payment: PayrollPayment): String {
    val lang = lang()
    val zone = zone()
    var line = payment.day?.let { L(R.string.payroll__forWork, Dates.longDayKey(it, lang, zone)) }
        ?: run {
            /*
             * Старая выплата: она закрывала отрезок целиком, и разложить её
             * обратно по дням честно нельзя. Верхняя граница — полночь
             * следующих суток, поэтому последний рабочий день на миг раньше.
             */
            val last = Dates.dayKey(payment.periodTo.minusMillis(1), zone)
            if (payment.periodFrom.epochSecond <= 0) {
                L(R.string.payroll__forWorkUpTo, Dates.longDayKey(last, lang, zone))
            } else {
                val first = Dates.dayKey(payment.periodFrom, zone)
                if (first == last) {
                    L(R.string.payroll__forWork, Dates.longDayKey(first, lang, zone))
                } else {
                    L(
                        R.string.payroll__forWorkRange,
                        Dates.longDayKey(first, lang, zone),
                        Dates.longDayKey(last, lang, zone),
                    )
                }
            }
        }
    payment.units?.takeIf { it > 0 }?.let { line += " · ${units(it)}" }
    return line
}

// ══════════════════════════ расчёт ══════════════════════════

@Composable
private fun Dock(
    count: Int,
    total: Int,
    busy: Boolean,
    modifier: Modifier,
    onPay: () -> Unit,
) {
    Row(
        modifier
            .fillMaxWidth()
            .background(Brand.boardSurface)
            .padding(horizontal = 16.dp)
            .padding(top = 10.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            Ln(R.plurals.payroll__selected, count),
            fontSize = 13.sp,
            color = Brand.boardMuted,
            modifier = Modifier.weight(1f),
        )
        Box(Modifier.width(180.dp)) {
            LimeButton(
                text = L(R.string.payroll__paySum, money(total)),
                enabled = !busy,
                loading = busy,
                onClick = onPay,
            )
        }
    }
}

/** `2026-08-13` → «13 августа», а сегодняшний день назван сегодняшним. */
@Composable
private fun dayTitle(
    day: String,
    today: String,
    lang: com.sevarm.tetr.core.i18n.Lang,
    zone: java.time.ZoneId,
): String {
    val long = Dates.longDayKey(day, lang, zone, Instant.now())
    return if (day == today) L(R.string.payroll__todayDay, long) else long
}
