package com.sevarm.tetr.feature.clients

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
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
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.net.toUri
import com.sevarm.tetr.LocalGraph
import com.sevarm.tetr.R
import com.sevarm.tetr.core.api.Api
import com.sevarm.tetr.core.api.Client
import com.sevarm.tetr.core.api.ClientHistory
import com.sevarm.tetr.core.api.ClientOrder
import com.sevarm.tetr.core.api.Clients
import com.sevarm.tetr.core.api.field
import com.sevarm.tetr.core.api.jsonBody
import com.sevarm.tetr.core.i18n.Dates
import com.sevarm.tetr.core.i18n.L
import com.sevarm.tetr.core.i18n.Ln
import com.sevarm.tetr.core.ui.lang
import com.sevarm.tetr.core.ui.money
import com.sevarm.tetr.core.ui.serviceName
import com.sevarm.tetr.core.ui.paymentLabel
import com.sevarm.tetr.core.ui.zone
import com.sevarm.tetr.design.Brand
import com.sevarm.tetr.design.EmptyState
import com.sevarm.tetr.design.FieldRow
import com.sevarm.tetr.design.HairLine
import com.sevarm.tetr.design.Insets
import com.sevarm.tetr.design.ScreenHeader
import com.sevarm.tetr.design.SelectChip
import com.sevarm.tetr.design.SheetHeader
import com.sevarm.tetr.design.Tone
import com.sevarm.tetr.design.pressable
import com.sevarm.tetr.design.sunken
import com.sevarm.tetr.design.tile
import kotlinx.coroutines.launch
import java.net.URLEncoder

/**
 * База клиентов.
 *
 * Наверху — те, кто давно не был. Это не сортировка ради сортировки:
 * вернуть старого клиента дешевле, чем привести нового, и список нужен
 * ровно для одного действия — позвонить.
 *
 * Счётчики в шапке считают по всей базе, а не по найденному: это показания
 * продукта, и они не должны меняться от того, что человек набрал в поиске
 * три буквы. Деление списка ниже, наоборот, идёт по найденному.
 */
@Composable
fun ClientsScreen(onBack: () -> Unit) {
    val graph = LocalGraph.current
    val session = graph.session

    var clients by remember { mutableStateOf<List<Client>>(emptyList()) }
    var loaded by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    var sort by remember { mutableStateOf(Sort.RECENT) }
    var opened by remember { mutableStateOf<Client?>(null) }
    var group by remember { mutableStateOf<Group?>(null) }

    LaunchedEffect(Unit) {
        val fresh = runCatching {
            session.authed { token -> graph.api.send<Clients>("clients", token = token) }
        }.getOrNull()
        if (fresh != null) clients = fresh.clients
        loaded = true
    }

    /*
     * Поиск по номеру, имени и телефону. Пробелы и регистр не в счёт:
     * номер диктуют вслух и записывают как придётся — «93LM227» и
     * «93 lm 227» это одна машина.
     */
    val found = remember(clients, query, sort) {
        val q = query.replace(" ", "").uppercase()
        val base = if (q.isEmpty()) {
            clients
        } else {
            clients.filter { client ->
                listOf(client.key, client.name.orEmpty(), client.phone.orEmpty())
                    .any { it.replace(" ", "").uppercase().contains(q) }
            }
        }
        when (sort) {
            Sort.RECENT -> base.sortedBy { it.daysSince }
            Sort.OFTEN -> base.sortedByDescending { it.visits }
            Sort.RICHEST -> base.sortedByDescending { it.total }
        }
    }

    val lostAfter = Api.LOST_AFTER_DAYS
    val lost = found.filter { it.daysSince > lostAfter }
    val rest = found.filter { it.daysSince <= lostAfter }

    /*
     * Разделять на «стоит позвонить» и остальных имеет смысл только в
     * полном списке по умолчанию. При поиске или другом порядке человек уже
     * сказал, что ищет, и деление мешает.
     */
    val grouped = query.isEmpty() && sort == Sort.RECENT

    Column(
        Modifier
            .fillMaxSize()
            .background(Brand.board)
            .padding(top = Insets.top.calculateTopPadding()),
    ) {
        ScreenHeader(L(R.string.owner__tabClients), onBack = onBack)

        LazyColumn(
            contentPadding = PaddingValues(horizontal = 12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (loaded) {
                item {
                    Head(
                        clients = clients,
                        lostAfter = lostAfter,
                        query = query,
                        onQuery = { query = it },
                        sort = sort,
                        onSort = { sort = it },
                        onGroup = { group = it },
                    )
                }
            }

            if (grouped) {
                if (lost.isNotEmpty()) {
                    item { GroupHeader(L(R.string.clients__worthCalling), lost.size, warn = true) }
                    items(lost, key = { it.id }) { client ->
                        /*
                         * Потерянные — на янтарной плитке, остальные
                         * строками. Разный носитель, а не разный заголовок:
                         * список из двух одинаковых секций читается одним
                         * списком, и «кому позвонить» тонет во «всех».
                         */
                        LostRow(client) { opened = client }
                    }
                }
                if (rest.isNotEmpty()) {
                    item { GroupHeader(L(R.string.owner__allClients), rest.size, warn = false) }
                    items(rest, key = { it.id }) { client ->
                        PlainRow(client, lostAfter) { opened = client }
                        if (client.id != rest.last().id) HairLine()
                    }
                }
            } else if (found.isNotEmpty()) {
                item { GroupHeader(sortLabel(sort), found.size, warn = false) }
                items(found, key = { it.id }) { client ->
                    PlainRow(client, lostAfter) { opened = client }
                    if (client.id != found.last().id) HairLine()
                }
            }

            if (loaded && clients.isEmpty()) {
                item { EmptyState(L(R.string.common__empty)) }
            } else if (loaded && found.isEmpty()) {
                item { EmptyState(L(R.string.owner__clientsNotFound)) }
            }
        }
    }

    opened?.let { client ->
        ClientHistorySheet(client = client, onClose = { opened = null })
    }

    group?.let { which ->
        ClientGroupSheet(
            group = which,
            clients = clients,
            lostAfter = lostAfter,
            onOpen = { opened = it },
            onClose = { group = null },
        )
    }
}

/**
 * Чем упорядочен список.
 *
 * Это порядок, а не отбор: ни один клиент не пропадает, меняется только
 * кто наверху. Отбор здесь был бы вреден — владелец ищет конкретную
 * машину, а не подмножество.
 */
enum class Sort { RECENT, OFTEN, RICHEST }

@Composable
private fun sortLabel(sort: Sort): String = when (sort) {
    Sort.RECENT -> L(R.string.owner__lastVisit)
    Sort.OFTEN -> L(R.string.owner__sortOften)
    Sort.RICHEST -> L(R.string.owner__sortRichest)
}

/** Какая группа открыта поверх списка. */
enum class Group { ALL, LOYAL, FRESH, LOST }

@Composable
private fun groupTitle(group: Group): String = when (group) {
    Group.ALL -> L(R.string.owner__clientsTotal)
    Group.LOYAL -> L(R.string.owner__clientsLoyal)
    Group.FRESH -> L(R.string.owner__clientsFresh)
    Group.LOST -> L(R.string.owner__clientsLost)
}

/**
 * Шапка: сколько их, поиск, порядок.
 *
 * Показание уместно там, где число само по себе ответ: выручка, зарплата к
 * выдаче. «Сколько у меня машин в базе» такой вопрос не задаёт — с этим
 * экраном приходят искать конкретную. Поэтому строка вместо плаката, а
 * освободившееся место отдано поиску.
 */
@Composable
private fun Head(
    clients: List<Client>,
    lostAfter: Int,
    query: String,
    onQuery: (String) -> Unit,
    sort: Sort,
    onSort: (Sort) -> Unit,
    onGroup: (Group) -> Unit,
) {
    val loyal = clients.count { it.visits > 1 }
    /*
     * Был ровно один раз: вернётся или нет — ещё неизвестно. Тот же порог,
     * что в кабинете; выдумывать здесь своё значило бы, что продукт считает
     * постоянных по-разному на двух экранах.
     */
    val fresh = clients.count { it.visits == 1 }
    val lost = clients.count { it.daysSince > lostAfter }

    Column(
        Modifier.padding(horizontal = 4.dp, vertical = 6.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Counter(L(R.string.owner__clientsTotal), clients.size, Brand.onBoard, Modifier.weight(1f)) {
                onGroup(Group.ALL)
            }
            Counter(L(R.string.owner__clientsLoyal), loyal, Brand.goodOnBoard, Modifier.weight(1f)) {
                onGroup(Group.LOYAL)
            }
            Counter(L(R.string.owner__clientsFresh), fresh, Brand.onBoard, Modifier.weight(1f)) {
                onGroup(Group.FRESH)
            }
            Counter(
                L(R.string.owner__clientsLost),
                lost,
                if (lost == 0) Brand.onBoard else Brand.warnOnBoard,
                Modifier.weight(1f),
            ) { onGroup(Group.LOST) }
        }

        /*
         * Касание ловит вся строка поиска, а не полоска текста внутри неё.
         * Пустое поле Compose меряет по набранному тексту — то есть в
         * несколько точек у каретки; лупа, отступы и правая половина
         * строки касание не принимали вовсе, и человек жал в коробку, а
         * клавиатура не появлялась.
         */
        val focus = remember { FocusRequester() }
        Row(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(Brand.boardInk.copy(alpha = 0.07f))
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                ) { focus.requestFocus() }
                .padding(horizontal = 12.dp, vertical = 11.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(
                Icons.Filled.Search,
                contentDescription = null,
                tint = Brand.boardMuted,
                modifier = Modifier.size(16.dp),
            )
            BasicTextField(
                value = query,
                onValueChange = onQuery,
                textStyle = TextStyle(color = Brand.onBoard, fontSize = 15.sp),
                cursorBrush = SolidColor(Brand.grape),
                keyboardOptions = KeyboardOptions(
                    capitalization = KeyboardCapitalization.Characters,
                    autoCorrectEnabled = false,
                    imeAction = ImeAction.Search,
                ),
                singleLine = true,
                modifier = Modifier.weight(1f).focusRequester(focus),
                decorationBox = { inner ->
                    // подсказка называет всё, по чему ищут: имя, вписанное
                    // вчера, искали номером и не находили
                    if (query.isEmpty()) {
                        Text(
                            L(R.string.owner__clientsSearch),
                            fontSize = 15.sp,
                            color = Brand.boardMuted.copy(alpha = 0.7f),
                            maxLines = 1,
                        )
                    }
                    inner()
                },
            )
            if (query.isNotEmpty()) {
                Icon(
                    Icons.Filled.Cancel,
                    contentDescription = L(R.string.common__close),
                    tint = Brand.boardMuted,
                    modifier = Modifier
                        .size(18.dp)
                        .pressable { onQuery("") },
                )
            }
        }

        /*
         * Порядок — прокруткой вбок: три слова по-армянски в строку не
         * помещаются, а перенос превратил бы переключатель в абзац.
         */
        Row(
            Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Sort.entries.forEach { option ->
                SelectChip(sortLabel(option), sort == option) { onSort(option) }
            }
        }
    }
}

/**
 * Число со своим списком за ним.
 *
 * Число без списка — тупик: «постоянных 12» видно, а кто эти двенадцать —
 * нет, и владелец шёл сортировать список и считать строки глазами.
 *
 * За нулём списка нет, и такой счётчик не нажимается: кнопка, которая
 * ничего не открывает, хуже обычного текста — по ней жмут и не понимают,
 * сломалось или так задумано.
 */
@Composable
private fun Counter(
    label: String,
    value: Int,
    tone: androidx.compose.ui.graphics.Color,
    modifier: Modifier,
    onClick: () -> Unit,
) {
    val live = value > 0
    Column(
        modifier
            .clip(RoundedCornerShape(12.dp))
            .background(Brand.boardInk.copy(alpha = 0.05f))
            .pressable(enabled = live, onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 9.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                label,
                fontSize = 11.sp,
                color = Brand.boardMuted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            if (live) {
                Icon(
                    Icons.AutoMirrored.Filled.KeyboardArrowRight,
                    contentDescription = null,
                    tint = Brand.boardMuted.copy(alpha = 0.55f),
                    modifier = Modifier.size(11.dp),
                )
            }
        }
        Text("$value", fontSize = 19.sp, fontWeight = FontWeight.Bold, color = tone)
    }
}

@Composable
private fun GroupHeader(title: String, count: Int, warn: Boolean) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 6.dp)
            .padding(top = 14.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            title,
            fontSize = 14.5.sp,
            fontWeight = FontWeight.SemiBold,
            color = if (warn) Brand.warnOnBoard else Brand.boardMuted,
            modifier = Modifier.weight(1f),
        )
        Text("$count", fontSize = 12.sp, color = Brand.boardMuted)
    }
}

@Composable
private fun LostRow(client: Client, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .tile(Tone.AMBER, 20.dp)
            .pressable(onClick = onClick)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                client.key,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = Tone.AMBER.ink,
                maxLines = 1,
            )
            Text(
                visitLine(client),
                fontSize = 11.5.sp,
                color = Tone.AMBER.ink.copy(alpha = 0.72f),
            )
        }
        Text(
            money(client.total),
            fontSize = 17.sp,
            fontWeight = FontWeight.Bold,
            color = Tone.AMBER.ink,
            maxLines = 1,
        )
        Icon(
            Icons.AutoMirrored.Filled.KeyboardArrowRight,
            contentDescription = null,
            tint = Tone.AMBER.ink.copy(alpha = 0.45f),
            modifier = Modifier.size(14.dp),
        )
    }
}

@Composable
private fun PlainRow(client: Client, lostAfter: Int, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .pressable(onClick = onClick)
            .padding(horizontal = 6.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(
                    client.key,
                    fontSize = 14.5.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Brand.onBoard,
                    maxLines = 1,
                )
                /*
                 * Метка постоянного. До неё это читалось только счётчиком
                 * визитов, а «сколько раз был» и «свой ли это человек» —
                 * разные вопросы, и второй решается взглядом.
                 */
                if (client.visits > 1) {
                    Text(
                        L(R.string.owner__clientLoyal),
                        fontSize = 10.5.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Brand.goodOnBoard,
                        modifier = Modifier
                            .clip(RoundedCornerShape(5.dp))
                            .background(Brand.goodOnBoard.copy(alpha = 0.16f))
                            .padding(horizontal = 5.dp, vertical = 1.dp),
                    )
                }
                /*
                 * Имя рядом с номером, а не строкой под ним: строкой оно
                 * делало запись с контактами выше соседних, и список
                 * получался рваным.
                 */
                client.name?.takeIf { it.isNotEmpty() }?.let {
                    Text(
                        it,
                        fontSize = 12.sp,
                        color = Brand.boardMuted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Text(
                visitLine(client),
                fontSize = 11.5.sp,
                color = if (client.daysSince > lostAfter) Brand.warnOnBoard else Brand.boardMuted,
            )
        }
        Text(
            money(client.total),
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            color = Brand.onBoard,
            maxLines = 1,
        )
        Icon(
            Icons.AutoMirrored.Filled.KeyboardArrowRight,
            contentDescription = null,
            tint = Brand.boardMuted.copy(alpha = 0.6f),
            modifier = Modifier.size(14.dp),
        )
    }
}

/**
 * «213 визитов · последний 3 дня назад».
 *
 * Слово «последний» обязательно. Без него «3 дня назад» стоит рядом с
 * числом визитов и читается чем угодно — сроком, промежутком, давностью
 * первого приезда.
 */
@Composable
private fun visitLine(client: Client): String {
    val visits = Ln(R.plurals.clients__visitsCount, client.visits)
    if (client.daysSince == 0) return L(R.string.clients__visitsLastToday, visits)
    return L(
        R.string.clients__visitsLastAgo,
        visits,
        Ln(R.plurals.clients__daysAgo, client.daysSince),
    )
}

/**
 * Кто именно стоит за числом в шапке.
 *
 * Листом поверх списка, а не переходом: закрыл — вернулся на то же место,
 * с тем же набранным поиском. Порядок свой у каждой группы: в
 * «пропавших» сверху нужен тот, кто молчит дольше всех, в «постоянных» —
 * кто ходит чаще, в «базе» — кто был недавно.
 */
@Composable
private fun ClientGroupSheet(
    group: Group,
    clients: List<Client>,
    lostAfter: Int,
    onOpen: (Client) -> Unit,
    onClose: () -> Unit,
) {
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val list = when (group) {
        Group.ALL -> clients
        Group.LOYAL -> clients.filter { it.visits > 1 }
        Group.FRESH -> clients.filter { it.visits == 1 }
        Group.LOST -> clients.filter { it.daysSince > lostAfter }
    }
    val sorted = when (group) {
        // у новых наверху тот, кто приехал последним: за ним и звонить,
        // пока он помнит мойку
        Group.ALL, Group.FRESH -> list.sortedBy { it.daysSince }
        Group.LOYAL -> list.sortedByDescending { it.visits }
        Group.LOST -> list.sortedByDescending { it.daysSince }
    }

    ModalBottomSheet(
        onDismissRequest = onClose,
        sheetState = sheet,
        containerColor = Brand.board,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp)
                .padding(bottom = Insets.bottom.calculateBottomPadding() + 12.dp),
        ) {
            SheetHeader(groupTitle(group), onClose = onClose) {
                Text("${sorted.size}", fontSize = 13.sp, color = Brand.boardMuted)
            }

            if (sorted.isEmpty()) {
                EmptyState(L(R.string.common__empty))
            } else {
                LazyColumn(Modifier.height(520.dp)) {
                    items(sorted, key = { it.id }) { client ->
                        PlainRow(client, lostAfter) {
                            onClose()
                            onOpen(client)
                        }
                        if (client.id != sorted.last().id) HairLine()
                    }
                }
            }
        }
    }
}

/**
 * История одной машины.
 *
 * Список клиентов отвечает «кто это и сколько принёс». Следующий вопрос
 * владельца всегда один и тот же: ЧТО ИМЕННО ОН БРАЛ — и без ответа строка
 * списка тупик, а сам список превращается в счётчик, по которому ничего
 * нельзя решить.
 *
 * Отменённых записей здесь нет: клиент за них не платил, и покажи мы их,
 * сумма в шапке перестала бы сходиться с лентой под ней.
 */
@Composable
private fun ClientHistorySheet(client: Client, onClose: () -> Unit) {
    val graph = LocalGraph.current
    val session = graph.session
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val lang = lang()
    val zone = zone()

    var orders by remember { mutableStateOf<List<ClientOrder>>(emptyList()) }
    var loaded by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf(client.name.orEmpty()) }
    var phone by remember { mutableStateOf(client.phone.orEmpty()) }
    var firstSeen by remember { mutableStateOf(client.firstSeenAt) }
    var editing by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }

    val escaped = remember(client.key) { URLEncoder.encode(client.key, "UTF-8") }

    LaunchedEffect(client.key) {
        val fresh = runCatching {
            session.authed { token ->
                graph.api.send<ClientHistory>("clients/$escaped", token = token)
            }
        }.getOrNull()
        if (fresh != null) {
            orders = fresh.orders
            name = fresh.client.name.orEmpty()
            phone = fresh.client.phone.orEmpty()
            firstSeen = fresh.client.firstSeenAt
        }
        loaded = true
    }

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
            SheetHeader(client.key, onClose = onClose)

            /*
             * Средний чек здесь считается, а не приходит с сервера: он и
             * есть частное двух чисел, которые уже на экране, и лишнее поле
             * в ответе ради деления было бы ещё одним местом, где два счёта
             * могут разойтись.
             */
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    L(R.string.common__total),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    color = Brand.onBoard.copy(alpha = 0.85f),
                )
                Text(
                    money(client.total),
                    fontSize = 44.sp,
                    fontWeight = FontWeight.Bold,
                    color = Brand.onBoard,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    L(
                        R.string.clients__summaryLine,
                        Ln(R.plurals.clients__visitsCount, client.visits),
                        money(if (client.visits > 0) client.total / client.visits else 0),
                        if (client.daysSince == 0) {
                            L(R.string.owner__lastVisitToday)
                        } else {
                            Ln(R.plurals.clients__daysAgo, client.daysSince)
                        },
                    ),
                    fontSize = 12.sp,
                    color = Brand.boardMuted,
                    modifier = Modifier.padding(top = 6.dp),
                )
            }

            /*
             * Привычки клиента: три-четыре факта, из-за которых карточку и
             * открывают перед разговором. Считается из уже приехавшей
             * истории, а не отдельным запросом: список визитов и так лежит
             * перед глазами.
             *
             * У приезжавшего один раз привычек нет: и «первый визит», и
             * «обычно берёт» пересказали бы ту единственную строку, что
             * стоит ниже.
             */
            if (orders.size > 1) {
                Column(Modifier.fillMaxWidth().sunken(16.dp, alpha = 0.05f)) {
                    firstSeen?.let {
                        Fact(L(R.string.owner__clientFirstVisit), Dates.longDayYear(it, lang, zone))
                    }
                    topOf(orders.map { serviceName(it.serviceName) })?.let {
                        Fact(L(R.string.owner__clientOftenTakes), it)
                    }
                    topOf(orders.map { paymentLabel(it.payment) })?.let {
                        Fact(L(R.string.owner__clientOftenPays), it)
                    }
                    topOf(orders.mapNotNull { it.staffName })?.let {
                        Fact(L(R.string.owner__clientOftenServed), it)
                    }
                }
            }

            /*
             * Телефон при записи машины не спрашивают и не будут: мойщик
             * вводит номер, услугу и оплату мокрыми руками, с очередью за
             * спиной. Владелец заходит в карточку спокойно — вот здесь
             * номер и вписывается, чтобы потом было куда позвонить.
             */
            Column(
                Modifier.fillMaxWidth().sunken(16.dp, alpha = 0.05f).padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                if (editing) {
                    Column(Modifier.fillMaxWidth().sunken(10.dp)) {
                        /*
                         * Подпись сверху, а не подсказкой внутри поля:
                         * подсказка исчезает, как только начали набирать, и
                         * заполненная карточка становится двумя строками
                         * без имён — что из них имя, а что телефон, видно
                         * только по написанному.
                         */
                        FieldRow(
                            label = L(R.string.owner__clientName),
                            value = name,
                            onValue = { name = it },
                        )
                    }
                    Column(Modifier.fillMaxWidth().sunken(10.dp)) {
                        FieldRow(
                            label = L(R.string.auth__phone),
                            value = phone,
                            onValue = { phone = it },
                            placeholder = "+374 77 123 456",
                            keyboard = KeyboardType.Phone,
                        )
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            if (saving) "…" else L(R.string.common__save),
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Brand.onLime,
                            modifier = Modifier
                                .clip(RoundedCornerShape(10.dp))
                                .background(Brand.lime)
                                .pressable(enabled = !saving) {
                                    scope.launch {
                                        saving = true
                                        runCatching {
                                            session.authed { token ->
                                                graph.api.call(
                                                    "clients/$escaped/contact",
                                                    method = "PATCH",
                                                    body = jsonBody {
                                                        field("name", name)
                                                        field("phone", phone)
                                                    },
                                                    token = token,
                                                )
                                            }
                                        }
                                        saving = false
                                        editing = false
                                    }
                                }
                                .padding(horizontal = 16.dp, vertical = 9.dp),
                        )
                        Text(
                            L(R.string.common__cancel),
                            fontSize = 14.sp,
                            color = Brand.boardMuted,
                            modifier = Modifier
                                .pressable { editing = false }
                                .padding(horizontal = 8.dp, vertical = 9.dp),
                        )
                    }
                } else {
                    Row(verticalAlignment = Alignment.Top) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                L(R.string.owner__clientContacts),
                                fontSize = 12.sp,
                                color = Brand.boardMuted,
                            )
                            Text(
                                name.ifEmpty { client.key },
                                fontSize = 15.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = Brand.onBoard,
                            )
                            Text(
                                phone.ifEmpty { L(R.string.owner__clientNoPhone) },
                                fontSize = 13.sp,
                                color = Brand.boardMuted,
                            )
                        }
                        Text(
                            L(R.string.common__edit),
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Brand.boardMuted,
                            modifier = Modifier
                                .pressable { editing = true }
                                .padding(6.dp),
                        )
                    }

                    /*
                     * «Позвонить» и «Написать» открывают телефон и
                     * сообщения: звонить и писать умеет сам аппарат, своего
                     * набора номера продукту заводить незачем.
                     */
                    if (phone.isNotEmpty()) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            ContactLink(L(R.string.owner__clientCall), filled = true) {
                                context.startActivity(
                                    Intent(Intent.ACTION_DIAL, "tel:$phone".toUri())
                                )
                            }
                            ContactLink(L(R.string.owner__clientWrite), filled = false) {
                                context.startActivity(
                                    Intent(Intent.ACTION_SENDTO, "smsto:$phone".toUri())
                                )
                            }
                        }
                    }

                    // подсказка только пропавшему: у того, кто был вчера,
                    // она превратилась бы в фон, который перестают замечать
                    if (client.daysSince > Api.LOST_AFTER_DAYS) {
                        Text(
                            L(R.string.owner__clientLostHint),
                            fontSize = 12.5.sp,
                            color = Brand.warnOnBoard,
                        )
                    }
                }
            }

            if (orders.isNotEmpty()) {
                orders.forEachIndexed { index, order ->
                    if (index > 0) HairLine()
                    OrderRow(order)
                }
            } else if (loaded) {
                EmptyState(L(R.string.today__noRecords))
            }
        }
    }
}

@Composable
private fun Fact(title: String, value: String) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, fontSize = 13.sp, color = Brand.boardMuted, modifier = Modifier.weight(1f))
        Text(
            value,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            color = Brand.onBoard,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/** Что встречается чаще всего. Пусто, когда выбирать не из чего. */
private fun topOf(values: List<String>): String? {
    if (values.size <= 1) return null
    return values.groupingBy { it }.eachCount().maxByOrNull { it.value }?.key
}

@Composable
private fun OrderRow(order: ClientOrder) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 6.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                serviceName(order.serviceName),
                fontSize = 14.5.sp,
                fontWeight = FontWeight.SemiBold,
                color = Brand.onBoard,
                maxLines = 1,
            )
            Text(
                buildList {
                    // дата из строки без разбора: нужен только день и месяц
                    val head = order.createdAt.take(10).split("-")
                    add(if (head.size == 3) "${head[2]}.${head[1]}" else order.createdAt.take(10))
                    add(paymentLabel(order.payment))
                    order.staffName?.let { add(it) }
                }.joinToString(" · "),
                fontSize = 11.5.sp,
                color = Brand.boardMuted,
                maxLines = 1,
            )
        }
        /*
         * Скидка видна и в истории машины: постоянному её дают не один раз,
         * и «сколько всего оставил» без неё читается неправдой в обе
         * стороны.
         */
        order.listPrice?.takeIf { it > order.price }?.let {
            Text(
                money(it),
                fontSize = 11.5.sp,
                color = Brand.boardMuted,
                textDecoration = TextDecoration.LineThrough,
            )
        }
        Text(
            money(order.price),
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            color = Brand.onBoard,
        )
    }
}

@Composable
private fun ContactLink(title: String, filled: Boolean, onClick: () -> Unit) {
    Text(
        title,
        fontSize = 14.sp,
        fontWeight = FontWeight.SemiBold,
        color = if (filled) Brand.onLime else Brand.onBoard,
        modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(if (filled) Brand.lime else Brand.boardInk.copy(alpha = 0.09f))
            .pressable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 9.dp),
    )
}

