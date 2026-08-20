package com.sevarm.tetr.feature.expenses

import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Autorenew
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sevarm.tetr.LocalGraph
import com.sevarm.tetr.R
import com.sevarm.tetr.core.api.Expense
import com.sevarm.tetr.core.api.Expenses
import com.sevarm.tetr.core.api.field
import com.sevarm.tetr.core.api.jsonBody
import com.sevarm.tetr.core.i18n.Dates
import com.sevarm.tetr.core.i18n.L
import com.sevarm.tetr.core.ui.currency
import com.sevarm.tetr.core.ui.lang
import com.sevarm.tetr.core.ui.money
import com.sevarm.tetr.core.ui.zone
import com.sevarm.tetr.design.Brand
import com.sevarm.tetr.design.Caption
import com.sevarm.tetr.design.FieldRow
import com.sevarm.tetr.design.FlowRowLayout
import com.sevarm.tetr.design.Insets
import com.sevarm.tetr.design.HairLine
import com.sevarm.tetr.design.LimeButton
import com.sevarm.tetr.design.LimeChip
import com.sevarm.tetr.design.ScreenHeader
import com.sevarm.tetr.design.SelectChip
import com.sevarm.tetr.design.SheetHeader
import com.sevarm.tetr.design.pressable
import com.sevarm.tetr.design.sunken
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

/**
 * Расходы бизнеса.
 *
 * Выручка отвечала на вопрос «сколько намыли», а владелец спрашивает
 * «сколько осталось». Половина ответа — зарплата — считалась и раньше;
 * вторая заводится здесь.
 *
 * Два вида расходов разведены не подписью, а РАЗНЫМИ СПИСКАМИ. Раньше они
 * лежали вперемешку и различались словом «ежемесячный» мелким шрифтом под
 * названием — то есть не различались вовсе. Постоянные наверху: это и есть
 * то, что съедает прибыль каждый день.
 *
 * Постоянный расход относится ко всем дням месяца сразу, и в прибыли за
 * день от него берётся доля. Свалить аренду одним днём значило бы показать
 * первое число месяца глубоко убыточным, а второе — прибыльным сверх меры.
 */
@Composable
fun ExpensesScreen(onBack: () -> Unit) {
    val graph = LocalGraph.current
    val session = graph.session
    val scope = rememberCoroutineScope()

    var data by remember { mutableStateOf<Expenses?>(null) }
    var loaded by remember { mutableStateOf(false) }
    var month by remember { mutableStateOf("current") }
    var adding by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<Expense?>(null) }
    var removing by remember { mutableStateOf<Expense?>(null) }

    suspend fun reload() {
        val fresh = runCatching {
            session.authed { token ->
                graph.api.send<Expenses>("expenses?month=$month", token = token)
            }
        }.getOrNull()
        if (fresh != null) data = fresh
        loaded = true
    }

    LaunchedEffect(month) { reload() }

    val items = data?.expenses.orEmpty()
    val monthlyOnes = items.filter { it.monthly }
    val oneOffs = items.filterNot { it.monthly }
    val current = month == "current"

    Column(
        Modifier
            .fillMaxSize()
            .background(Brand.board)
            .padding(top = Insets.top.calculateTopPadding()),
    ) {
        ScreenHeader(L(R.string.expenses__title), onBack = onBack)

        LazyColumn(
            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            /*
             * Шапка есть, только когда есть чем её заполнить: итог и его
             * части считает сервер, и без них показывать здесь нечего — ноль
             * на месте расходов читается как «ничего не тратил».
             */
            val costs = data?.costs
            if (loaded && costs != null) {
                item { Reading(data!!, month) { month = it } }
            }

            if (monthlyOnes.isNotEmpty()) {
                item { Heading(L(R.string.expenses__monthlyOnes), monthlyOnes.size) }
                items(monthlyOnes, key = { it.id }) { item ->
                    ExpenseRow(
                        title = item.category,
                        badge = L(R.string.expenses__perMonth),
                        note = monthlyNote(item),
                        amount = item.amount,
                        // правится только в текущем месяце: прошлое закрыто
                        onClick = if (current && item.endedAt == null) {
                            { editing = item }
                        } else {
                            null
                        },
                        onRemove = if (current) {
                            { removing = item }
                        } else {
                            null
                        },
                    )
                }
            }

            if (oneOffs.isNotEmpty()) {
                item { Heading(L(R.string.expenses__oneOffs), oneOffs.size) }
                items(oneOffs, key = { it.id }) { item ->
                    ExpenseRow(
                        title = item.category,
                        badge = null,
                        note = dayLabel(item.at),
                        amount = item.amount,
                        onClick = if (current) {
                            { editing = item }
                        } else {
                            null
                        },
                        onRemove = if (current) {
                            { removing = item }
                        } else {
                            null
                        },
                    )
                }
            }

            if (loaded && items.isEmpty()) {
                item {
                    Text(
                        L(R.string.expenses__empty),
                        fontSize = 14.sp,
                        color = Brand.boardMuted,
                        textAlign = TextAlign.Center,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 44.dp),
                    )
                }
            }

            item {
                /*
                 * Добавление — строкой в самом списке, а не плюсиком в
                 * панели: плюсик в углу ищут глазами, строка стоит там,
                 * куда смотрит человек.
                 */
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(top = 10.dp)
                        .clip(RoundedCornerShape(24.dp))
                        .background(Brand.boardInk.copy(alpha = 0.07f))
                        .pressable { adding = true }
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Box(
                        Modifier
                            .size(44.dp)
                            .clip(CircleShape)
                            .background(Brand.boardInk.copy(alpha = 0.07f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            Icons.Filled.Add,
                            contentDescription = null,
                            tint = Brand.grape,
                            modifier = Modifier.size(17.dp),
                        )
                    }
                    Text(
                        L(R.string.expenses__addExpense),
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Brand.onBoard,
                    )
                }
            }

            item {
                // те же слова, что в кабинете: одно и то же правило,
                // объяснённое двумя фразами, читается как два разных
                Text(
                    L(R.string.expenses__note),
                    fontSize = 11.5.sp,
                    color = Brand.boardMuted,
                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 10.dp),
                )
            }
        }
    }

    if (adding || editing != null) {
        ExpenseEditor(
            editing = editing,
            hints = data?.hints.orEmpty(),
            onClose = {
                adding = false
                editing = null
            },
            onSaved = { scope.launch { reload() } },
        )
    }

    removing?.let { item ->
        /*
         * Спрашиваем, потому что постоянный расход влияет на прибыль
         * каждого следующего дня, а прожитые дни остаются в истории:
         * удаление аренды не должно задним числом увеличивать прибыль
         * прошлых дней.
         */
        AlertDialog(
            onDismissRequest = { removing = null },
            containerColor = Brand.boardSurface,
            title = { Text(L(R.string.expenses__removeTitle), color = Brand.onBoard) },
            text = {
                Text(
                    if (item.monthly) {
                        L(R.string.expenses__removeMonthlyNote)
                    } else {
                        L(R.string.expenses__removeOneOffNote)
                    },
                    color = Brand.boardMuted,
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    removing = null
                    scope.launch {
                        runCatching {
                            session.authed { token ->
                                graph.api.call("expenses/${item.id}", method = "DELETE", token = token)
                            }
                        }
                        reload()
                    }
                }) { Text(L(R.string.expenses__remove), color = Brand.badOnBoard) }
            },
            dismissButton = {
                TextButton(onClick = { removing = null }) {
                    Text(L(R.string.common__cancel), color = Brand.boardMuted)
                }
            },
        )
    }
}

/**
 * Сколько ушло за тот период, который показан ниже.
 *
 * Стояло «Ежемесячный расход 345 000 ֏», а под ним лежали ещё и разовые на
 * 42 000: число в шапке отвечало не на тот вопрос, с которым сюда заходят.
 *
 * Под итогом — доля в выручке и из чего итог сложился. Сумма сама по себе
 * не плохая и не хорошая: сто тысяч при выручке в миллион это обычный
 * месяц, а при выручке в двести — беда. Оба числа приходят с сервера:
 * считать их второй раз на телефоне значило бы завести второй источник
 * правды для денег.
 */
@Composable
private fun Reading(data: Expenses, month: String, onMonth: (String) -> Unit) {
    val costs = data.costs ?: return
    val revenue = data.revenue ?: 0
    val perDay = data.perDayAvg ?: 0

    Column(
        Modifier
            .fillMaxWidth()
            .padding(bottom = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            if (month == "current") L(R.string.owner__periodMonth) else L(R.string.owner__periodPrevMonth),
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            color = Brand.onBoard.copy(alpha = 0.85f),
            modifier = Modifier.padding(top = 6.dp),
        )
        Text(
            money(costs.total),
            fontSize = 46.sp,
            fontWeight = FontWeight.Bold,
            color = Brand.onBoard,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )

        /*
         * Округлённый ноль — не ответ: двенадцать тысяч при выручке в
         * четырнадцать миллионов это восемь сотых процента, и «0 %» под
         * ними читается как поломка.
         */
        if (revenue > 0 && costs.total > 0) {
            val exact = costs.total.toDouble() / revenue * 100
            val share = if (exact < 1) "<1" else Math.round(exact).toString()
            Text(
                L(R.string.expenses__shareOfRevenue, share),
                fontSize = 12.sp,
                color = Brand.boardMuted,
                modifier = Modifier.padding(top = 4.dp),
            )
        }

        if (costs.monthlyShare > 0 || costs.oneOff > 0) {
            val parts = buildList {
                add(L(R.string.expenses__monthlySpent, money(costs.monthlyShare)))
                add(L(R.string.expenses__oneOffSpent, money(costs.oneOff)))
                if (perDay > 0) add(L(R.string.expenses__perDay, money(perDay)))
            }
            Text(
                parts.joinToString(" · "),
                fontSize = 12.sp,
                color = Brand.boardMuted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 6.dp),
            )
        }

        /*
         * Переключатель месяца рядом с итогом, а не в заголовке экрана: он
         * меняет именно это число, и стоять должен там, где на него
         * смотрят.
         */
        Row(
            Modifier.padding(top = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            SelectChip(L(R.string.owner__periodMonth), month == "current") { onMonth("current") }
            SelectChip(L(R.string.owner__periodPrevMonth), month == "prev") { onMonth("prev") }
        }
    }
}

@Composable
private fun Heading(title: String, count: Int) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 6.dp)
            .padding(top = 14.dp, bottom = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            title,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            color = Brand.boardMuted,
            modifier = Modifier.weight(1f),
        )
        Text("$count", fontSize = 12.sp, color = Brand.boardMuted)
    }
}

/**
 * Общая строка расхода. Одна на оба вида — в этом весь смысл.
 *
 * Постоянный расход была плитка с тоном и свечением, и она весила на
 * экране втрое больше строки. Но это не разные вещи, а одна — деньги,
 * ушедшие из кассы, — и разный носитель говорил, что аренда важнее химии,
 * которой за месяц набирается на столько же. Разницу несёт значок-слово
 * «ежемесячный», а не размер.
 */
@Composable
private fun ExpenseRow(
    title: String,
    badge: String?,
    note: String?,
    amount: Int,
    onClick: (() -> Unit)?,
    onRemove: (() -> Unit)?,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(Brand.boardInk.copy(alpha = 0.06f))
            .then(if (onClick != null) Modifier.pressable(onClick = onClick) else Modifier)
            .padding(horizontal = 13.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(
                    title,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Brand.onBoard,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (badge != null) {
                    Text(
                        badge,
                        fontSize = 10.5.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Brand.boardMuted,
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(Brand.boardInk.copy(alpha = 0.09f))
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                    )
                }
            }
            if (!note.isNullOrEmpty()) {
                Text(note, fontSize = 11.5.sp, color = Brand.boardMuted)
            }
        }

        Text(
            money(amount),
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
            color = Brand.onBoard,
            maxLines = 1,
        )

        /*
         * Удаление — отдельной кнопкой, а не смахиванием.
         *
         * Смахивание в iOS даёт системный список; здесь его пришлось бы
         * писать руками, и палец замечает расхождение с системными
         * повадками раньше, чем глаз. Крестик честнее: он виден, по нему
         * не промахиваются вслепую, и подтверждение всё равно спрашивается.
         */
        if (onRemove != null) {
            Icon(
                Icons.Filled.Close,
                contentDescription = L(R.string.common__delete),
                tint = Brand.boardMuted.copy(alpha = 0.7f),
                modifier = Modifier
                    .size(30.dp)
                    .pressable(onClick = onRemove)
                    .padding(7.dp),
            )
        }
    }
}

/**
 * Что стоит под названием постоянного расхода.
 *
 * Справа — номинал, то, о чём договорились с арендодателем. Здесь —
 * сколько из него уже набежало за этот месяц и сколько это в сутки. Оба
 * числа приходят с сервера: раньше дневная доля делилась прямо здесь, на
 * длину ТЕКУЩЕГО месяца, и в прошлом месяце тридцать один день делился на
 * тридцать.
 */
@Composable
private fun monthlyNote(item: Expense): String {
    item.endedAt?.let { return L(R.string.expenses__stoppedOn, dayLabel(it)) }
    val parts = buildList {
        item.share?.let { add(L(R.string.expenses__accruedSum, money(it))) }
        item.perDay?.takeIf { it > 0 }?.let { add(L(R.string.expenses__perDay, money(it))) }
    }
    return parts.joinToString(" · ")
}

/**
 * Когда потратили.
 *
 * Ближние два дня называются словом, а не числом: «сколько я потратил
 * вчера» — вопрос, который задают вслух, и дата в нём не звучит. Сравнение
 * идёт по календарю бизнеса, а не по разнице в секундах: запись, сделанная
 * в половине первого ночи, вчерашней не была.
 */
@Composable
private fun dayLabel(at: Instant): String {
    val zone = zone()
    val lang = lang()
    return when {
        Dates.isToday(at, zone) -> L(R.string.common__today)
        Dates.isYesterday(at, zone) -> L(R.string.common__yesterday)
        else -> Dates.longDay(at, lang, zone)
    }
}

/**
 * Расход: новый или правка существующего.
 *
 * Форма одна на оба случая. Разница только в том, что у правки уже есть id
 * и заполненные поля, — заводить ради этого второй экран значило бы
 * держать две формы, которые обязаны расходиться только заголовком.
 *
 * Вид расхода выбирается двумя крупными карточками, а не переключателем:
 * переключатель требовал прочитать подпись под ним, чтобы понять, что
 * будет, — здесь у каждого выбора своё объяснение прямо в карточке.
 */
@Composable
private fun ExpenseEditor(
    editing: Expense?,
    hints: List<String>,
    onClose: () -> Unit,
    onSaved: () -> Unit,
) {
    val graph = LocalGraph.current
    val session = graph.session
    val scope = rememberCoroutineScope()
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val currency = currency()
    val zone = zone()
    val isNew = editing == null

    var category by remember { mutableStateOf(editing?.category.orEmpty()) }
    var amount by remember { mutableStateOf(editing?.amount?.toString().orEmpty()) }
    var monthly by remember { mutableStateOf(editing?.monthly ?: false) }
    var at by remember {
        mutableStateOf(editing?.at ?: Instant.now())
    }
    var pickingDay by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val value = amount.filter { it.isDigit() }.toIntOrNull() ?: 0
    val ready = !busy && category.trim().isNotEmpty() && value > 0

    /*
     * Сумма постоянного расхода не переписывает прошлое: старый
     * закрывается сегодняшним днём, новый с него же начинается. Сказать это
     * надо ДО нажатия «сохранить», а не после — иначе владелец ждёт, что
     * прошлый месяц пересчитается, и не понимает, почему нет.
     */
    val amountChanged = editing != null && editing.monthly && value != editing.amount

    ModalBottomSheet(
        onDismissRequest = onClose,
        sheetState = sheet,
        containerColor = Brand.board,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 12.dp)
                .padding(bottom = Insets.bottom.calculateBottomPadding() + 12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            SheetHeader(
                if (isNew) L(R.string.expenses__newTitle) else L(R.string.expenses__one),
                onClose = onClose,
            )

            /*
             * Сумма — крупно и первой: расход заводят, держа в руке чек, и
             * первое, что с него переписывают, это цифра.
             */
            val amountFocus = remember { FocusRequester() }
            Column(Modifier.fillMaxWidth().sunken()) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        /*
                         * Касание по всей полосе, а не по трём цифрам в её
                         * середине: у пустой суммы поле шириной в каретку,
                         * и попасть в него с чеком в руке нечем.
                         */
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                        ) { amountFocus.requestFocus() }
                        .padding(top = 18.dp, bottom = 14.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.Bottom,
                ) {
                    BasicTextField(
                        value = amount,
                        onValueChange = { amount = it.filter { c -> c.isDigit() }.take(9) },
                        textStyle = TextStyle(
                            color = Brand.onBoard,
                            fontSize = 40.sp,
                            fontWeight = FontWeight.Bold,
                            textAlign = TextAlign.Center,
                        ),
                        cursorBrush = SolidColor(Brand.grape),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Number,
                            imeAction = ImeAction.Done,
                        ),
                        singleLine = true,
                        modifier = Modifier.focusRequester(amountFocus),
                        decorationBox = { inner ->
                            Box(contentAlignment = Alignment.Center) {
                                if (amount.isEmpty()) {
                                    Text(
                                        "0",
                                        fontSize = 40.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Brand.boardMuted.copy(alpha = 0.5f),
                                    )
                                }
                                inner()
                            }
                        },
                    )
                    Spacer(Modifier.size(6.dp))
                    Text(
                        if (currency == "AMD") "֏" else currency,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Brand.boardMuted,
                    )
                }

                HairLine()

                FieldRow(
                    label = L(R.string.expenses__category),
                    value = category,
                    onValue = { category = it },
                    placeholder = L(R.string.expenses__categoryPlaceholder),
                )
            }

            /*
             * Подсказки фишками, а не выпадающим списком: их шесть, и
             * нажать готовое быстрее, чем набирать слово. Своё при этом
             * никто не запрещает.
             */
            if (hints.isNotEmpty() && isNew) {
                FlowRowLayout(Modifier.padding(horizontal = 2.dp)) {
                    hints.forEach { hint ->
                        LimeChip(hint, category == hint) { category = hint }
                    }
                }
            }

            /*
             * Вид расхода у существующего не меняется: превращать разовую
             * канистру химии в аренду нечем — это другой расход, и
             * заводится он заново.
             */
            if (isNew) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    KindCard(
                        title = L(R.string.expenses__oneOff),
                        note = L(R.string.expenses__kindOneNote),
                        icon = Icons.Filled.ShoppingCart,
                        on = !monthly,
                        modifier = Modifier.weight(1f),
                    ) { monthly = false }
                    KindCard(
                        title = L(R.string.expenses__monthly),
                        note = L(R.string.expenses__kindMonthlyNote),
                        icon = Icons.Filled.Autorenew,
                        on = monthly,
                        modifier = Modifier.weight(1f),
                    ) { monthly = true }
                }
            } else if (amountChanged) {
                Note(L(R.string.expenses__changeNote))
            }

            /*
             * Разовый спрашивает день, постоянный — нет: у него это дата
             * начала действия, и сдвинуть её значит переписать прибыль за
             * уже прожитые дни.
             */
            if (monthly) {
                if (isNew) Note(L(R.string.expenses__monthlyStartNote))
            } else {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .sunken()
                        .pressable { pickingDay = true }
                        .padding(horizontal = 16.dp, vertical = 15.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(
                        L(R.string.expenses__date),
                        fontSize = 14.sp,
                        color = Brand.boardMuted,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        dayLabel(at),
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Brand.onBoard,
                    )
                    Icon(
                        Icons.Filled.DateRange,
                        contentDescription = null,
                        tint = Brand.boardMuted,
                        modifier = Modifier.size(16.dp),
                    )
                }
            }

            error?.let {
                Text(
                    it,
                    fontSize = 13.sp,
                    color = Brand.badOnBoard,
                    modifier = Modifier.padding(horizontal = 4.dp),
                )
            }

            LimeButton(
                text = L(R.string.common__save),
                enabled = ready,
                loading = busy,
                onClick = {
                    scope.launch {
                        busy = true
                        /*
                         * День отправляем строкой в календаре мойки — ровно
                         * тот, который выбрали и увидели. Момент собирает
                         * сервер, в своём поясе: посылать сюда готовую
                         * метку значило бы решать за него, где полночь.
                         */
                        val dayKey = Dates.dayKey(at, zone)
                        error = try {
                            session.authed { token ->
                                if (editing != null) {
                                    graph.api.call(
                                        "expenses/${editing.id}",
                                        method = "PATCH",
                                        body = jsonBody {
                                            field("amount", value)
                                            field("category", category.trim())
                                            // день правит только разовый
                                            if (!editing.monthly) field("at", dayKey)
                                        },
                                        token = token,
                                    )
                                } else {
                                    graph.api.call(
                                        "expenses",
                                        method = "POST",
                                        body = jsonBody {
                                            field("amount", value)
                                            field("category", category.trim())
                                            field("monthly", monthly)
                                            if (!monthly) field("at", dayKey)
                                        },
                                        token = token,
                                    )
                                }
                            }
                            null
                        } catch (e: Exception) {
                            L(R.string.payroll__failed)
                        }
                        busy = false
                        if (error == null) {
                            onSaved()
                            onClose()
                        }
                    }
                },
            )
        }
    }

    if (pickingDay) {
        /*
         * Родной выбор даты Android, а не свой календарь: система знает
         * про первый день недели, про язык и про то, как этот выбор
         * привыкли делать на телефоне.
         */
        val state = rememberDatePickerState(
            initialSelectedDateMillis = at.toEpochMilli(),
            // вперёд не пускаем: траты, которой ещё не было, не бывает
            selectableDates = object : androidx.compose.material3.SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long): Boolean =
                    utcTimeMillis <= System.currentTimeMillis()
            },
        )
        DatePickerDialog(
            onDismissRequest = { pickingDay = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { millis ->
                        val date = Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate()
                        at = date.atStartOfDay(zone).toInstant()
                    }
                    pickingDay = false
                }) { Text(L(R.string.common__ok)) }
            },
            dismissButton = {
                TextButton(onClick = { pickingDay = false }) { Text(L(R.string.common__cancel)) }
            },
        ) { DatePicker(state = state) }
    }
}

@Composable
private fun KindCard(
    title: String,
    note: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    on: Boolean,
    modifier: Modifier,
    onClick: () -> Unit,
) {
    Column(
        modifier
            .height(108.dp)
            .clip(RoundedCornerShape(22.dp))
            .background(if (on) Brand.lime else Brand.boardInk.copy(alpha = 0.07f))
            .pressable(onClick = onClick)
            .padding(15.dp),
    ) {
        Icon(
            icon,
            contentDescription = null,
            tint = if (on) Brand.onLime else Brand.grape,
            modifier = Modifier.size(17.dp),
        )
        Spacer(Modifier.weight(1f))
        Text(
            title,
            fontSize = 15.sp,
            fontWeight = FontWeight.Bold,
            color = if (on) Brand.onLime else Brand.onBoard,
        )
        Text(
            note,
            fontSize = 11.sp,
            color = if (on) Brand.onLime.copy(alpha = 0.7f) else Brand.boardMuted,
        )
    }
}

@Composable
private fun Note(text: String) {
    Text(
        text,
        fontSize = 12.5.sp,
        color = Brand.boardMuted,
        modifier = Modifier
            .fillMaxWidth()
            .sunken()
            .padding(16.dp),
    )
}
