package com.sevarm.tetr.feature.services

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.RemoveCircle
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
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
import com.sevarm.tetr.core.api.Service
import com.sevarm.tetr.core.api.Services
import com.sevarm.tetr.core.api.field
import com.sevarm.tetr.core.api.jsonBody
import com.sevarm.tetr.core.i18n.L
import com.sevarm.tetr.core.i18n.Ln
import com.sevarm.tetr.core.ui.currency
import com.sevarm.tetr.core.ui.money
import com.sevarm.tetr.core.ui.serviceName
import com.sevarm.tetr.core.ui.tenant
import com.sevarm.tetr.design.Brand
import com.sevarm.tetr.design.Caption
import com.sevarm.tetr.design.DelayedContent
import com.sevarm.tetr.design.ErrorState
import com.sevarm.tetr.design.FieldRow
import com.sevarm.tetr.design.HairLine
import com.sevarm.tetr.design.Insets
import com.sevarm.tetr.design.LimeButton
import com.sevarm.tetr.design.ScreenHeader
import com.sevarm.tetr.design.SheetHeader
import com.sevarm.tetr.design.TetrSkeletonList
import com.sevarm.tetr.design.pressable
import com.sevarm.tetr.design.sunken
import com.sevarm.tetr.design.surfaceCard
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive

/**
 * Прайс.
 *
 * Правка цены не трогает прошлые записи: в каждом заказе лежит снимок.
 * Поэтому цены можно менять хоть каждый день — вчерашняя выручка и
 * зарплаты останутся прежними. Об этом сказано прямо на экране: без этой
 * строчки цену боятся трогать.
 *
 * Список сверху вниз, а не лента вбок: прайс читают столбиком, сравнивая
 * цены; вбок его не читает никто.
 */
@Composable
fun ServicesScreen(onBack: () -> Unit) {
    val graph = LocalGraph.current
    val session = graph.session
    val scope = rememberCoroutineScope()

    var services by remember { mutableStateOf<List<Service>>(emptyList()) }
    var loaded by remember { mutableStateOf(false) }
    /**
     * Почему список пуст.
     *
     * Пусто и «не доехало» — разные ответы: первое зовёт завести строку,
     * второе ждать связь. Экран, который на отказ пишет «пока ничего
     * нет», отправляет заводить заново то, что уже заведено.
     */
    var failed by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<Service?>(null) }
    var adding by remember { mutableStateOf(false) }
    var editingTiers by remember { mutableStateOf(false) }

    val tenant = tenant()
    val tiers = tenant?.tiers.orEmpty()

    suspend fun reload() {
        val result = runCatching {
            session.authed { token -> graph.api.send<Services>("services", token = token) }
        }.getOrNull()
        if (result != null) services = result.services
        failed = result == null
        loaded = true
    }

    LaunchedEffect(Unit) { reload() }

    Column(
        Modifier
            .fillMaxSize()
            .background(Brand.board)
            .padding(top = Insets.top.calculateTopPadding()),
    ) {
        ScreenHeader(L(R.string.settings__services), onBack = onBack)

        Column(
            Modifier
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp)
                .padding(top = 8.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            if (loaded) Cover(services)

            /*
             * Добавление — последней строкой списка, а не отдельной
             * плиткой: новая услуга встаёт туда же, где уже стоят
             * остальные, и глазу не нужно искать другое место.
             */
            Column(Modifier.fillMaxWidth().surfaceCard(20.dp)) {
                services.forEachIndexed { index, service ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .heightIn(min = 54.dp)
                            .pressable { editing = service }
                            .padding(horizontal = 14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text(
                            serviceName(service.name),
                            fontSize = 15.5.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Brand.onBoard,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f),
                        )
                        /*
                         * Диапазон, а не первая цена: список должен
                         * показывать, что цена не одна, — иначе владелец
                         * правит седан и думает, что поправил всё.
                         */
                        Text(
                            priceLabel(service, tiers.size),
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = Brand.onBoard,
                            maxLines = 1,
                        )
                        Icon(
                            Icons.AutoMirrored.Filled.KeyboardArrowRight,
                            contentDescription = null,
                            tint = Brand.boardMuted,
                            modifier = Modifier.size(14.dp),
                        )
                    }
                    if (index < services.lastIndex) HairLine(inset = 14.dp)
                }

                if (services.isNotEmpty()) HairLine(inset = 14.dp)

                Row(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 52.dp)
                        .pressable { adding = true }
                        .padding(horizontal = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Icon(
                        Icons.Filled.Add,
                        contentDescription = null,
                        tint = Brand.grape,
                        modifier = Modifier.size(16.dp),
                    )
                    Text(
                        L(R.string.settings__newService),
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Brand.grape,
                    )
                }
            }

            if (!loaded) {
                DelayedContent(true) { TetrSkeletonList(rows = 5) }
            } else if (failed && services.isEmpty()) {
                ErrorState(L(R.string.common__loadFailed)) { scope.launch { reload() } }
            } else if (services.isEmpty()) {
                Text(
                    L(R.string.services__empty),
                    fontSize = 14.sp,
                    color = Brand.boardMuted,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 20.dp),
                )
            }

            TiersButton(tiers, tenant?.tierLabel) { editingTiers = true }

            Text(
                L(R.string.services__priceNote),
                fontSize = 11.5.sp,
                color = Brand.boardMuted,
                modifier = Modifier.padding(horizontal = 6.dp),
            )
        }
    }

    if (adding || editing != null) {
        ServiceEditor(
            service = editing,
            onClose = {
                adding = false
                editing = null
            },
            onSaved = { scope.launch { reload() } },
        )
    }

    if (editingTiers) {
        TierEditor(
            onClose = { editingTiers = false },
            onSaved = { scope.launch { reload() } },
        )
    }
}

/**
 * Обложка прайса: это один документ, а не набор случайных настроек.
 *
 * Бумага, а не грейповая плита. Плита была самым тёмным пятном экрана и
 * держала верх с силой заголовка, хотя говорила только «Прайс» и средний
 * чек: имя раздела уже написано в шапке, а цену человек пришёл смотреть в
 * списке ниже. Всё внимание уходило на то, что читают один раз.
 *
 * На бумаге тот же текст занимает то же место и сообщает то же самое, но
 * не спорит со списком за первый взгляд. Цвет остался в цифре среднего
 * чека — там он и работает.
 */
@Composable
private fun Cover(services: List<Service>) {
    val avg = if (services.isEmpty()) 0 else services.sumOf { it.price } / services.size
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 120.dp)
            .clip(RoundedCornerShape(26.dp))
            .background(Brand.boardSurface)
            .border(0.8.dp, Brand.boardInk.copy(alpha = 0.07f), RoundedCornerShape(26.dp))
            .padding(18.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                L(R.string.services__header),
                fontSize = 10.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = 1.5.sp,
                color = Brand.grape.copy(alpha = 0.75f),
            )
            Text(
                L(R.string.settings__tabServices),
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                color = Brand.onBoard,
            )
            Text(
                Ln(R.plurals.services__count, services.size),
                fontSize = 12.sp,
                color = Brand.boardMuted,
            )
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(
                L(R.string.services__avgPrice),
                fontSize = 10.5.sp,
                fontWeight = FontWeight.Medium,
                color = Brand.boardMuted,
            )
            Text(
                money(avg),
                fontSize = 25.sp,
                fontWeight = FontWeight.Bold,
                color = Brand.grape,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun TiersButton(tiers: List<String>, label: String?, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .surfaceCard(22.dp)
            .pressable(onClick = onClick)
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
                Icons.Filled.Layers,
                contentDescription = null,
                tint = Brand.grape,
                modifier = Modifier.size(17.dp),
            )
        }
        Column(Modifier.weight(1f)) {
            Text(
                if (tiers.isEmpty()) {
                    L(R.string.services__addTiers)
                } else {
                    "${label ?: L(R.string.work__tier)} · ${tiers.joinToString(", ")}"
                },
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                color = Brand.onBoard,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                if (tiers.isEmpty()) {
                    L(R.string.services__tiersExample)
                } else {
                    L(R.string.services__tiersNote)
                },
                fontSize = 11.5.sp,
                color = Brand.boardMuted,
                maxLines = 1,
            )
        }
    }
}

/** «5 000 — 9 000 ֏», когда у услуги разные цены по классам. */
@Composable
private fun priceLabel(service: Service, tierCount: Int): String {
    val all = (0 until maxOf(1, tierCount)).map {
        service.priceFor(if (tierCount == 0) null else it)
    }
    val low = all.min()
    val high = all.max()
    return if (low == high) money(low) else "${money(low)} — ${money(high)}"
}

/**
 * Правка одной услуги.
 *
 * Отдельным листом, а не строкой на месте: цена — то, что меняют редко и
 * осознанно, и случайное касание менять её не должно.
 */
@Composable
private fun ServiceEditor(service: Service?, onClose: () -> Unit, onSaved: () -> Unit) {
    val graph = LocalGraph.current
    val session = graph.session
    val scope = rememberCoroutineScope()
    /*
     * Лист открывается на половину: под ним остаётся сам прайс, и цена
     * правится, когда соседние видно. Развернуть до конца можно тем же
     * движением вверх.
     */
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = false)
    val tenant = tenant()
    val tiers = tenant?.tiers.orEmpty()
    val currency = currency()
    val isNew = service == null

    var name by remember { mutableStateOf(service?.name.orEmpty()) }
    var price by remember { mutableStateOf(service?.price?.toString().orEmpty()) }
    /*
     * Пустая цена класса означает «как базовая» — так её и показываем: не
     * подставляем базовую цифрой, иначе владелец решит, что назначил её сам.
     */
    var tierPrices by remember {
        mutableStateOf(
            (0 until tiers.size).map { i ->
                val own = service?.tierPrices?.getOrNull(i) ?: 0
                if (own > 0) own.toString() else if (i == 0) service?.price?.toString().orEmpty() else ""
            }
        )
    }
    var busy by remember { mutableStateOf(false) }
    var archiving by remember { mutableStateOf(false) }

    /** Базовая цена: при включённых классах это цена первого из них. */
    val value = if (tiers.isEmpty()) {
        price.filter { it.isDigit() }.toIntOrNull() ?: 0
    } else {
        tierPrices.firstOrNull()?.filter { it.isDigit() }?.toIntOrNull() ?: 0
    }
    val ready = !busy && name.trim().isNotEmpty() && value > 0

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
        ) {
            SheetHeader(
                if (isNew) L(R.string.settings__newService) else L(R.string.owner__colService),
                onClose = onClose,
            )

            /*
             * Два вопроса — две группы, и порядок в них тот же, в каком их
             * задают: сначала «что это за услуга», потом «сколько она
             * стоит».
             */
            Caption(L(R.string.services__nameField))
            Column(Modifier.fillMaxWidth().sunken()) {
                FieldRow(
                    label = L(R.string.owner__clientName),
                    value = name,
                    onValue = { name = it },
                    placeholder = L(R.string.services__namePlaceholder),
                )
            }

            Caption(
                if (tiers.isEmpty()) L(R.string.services__priceTitle) else L(R.string.services__priceByTier)
            )
            Column(Modifier.fillMaxWidth().sunken()) {
                if (tiers.isEmpty()) {
                    /*
                     * Касание по всей полосе, а не по цифрам в её середине:
                     * у пустой цены поле шириной в каретку.
                     */
                    val priceFocus = remember { FocusRequester() }
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null,
                            ) { priceFocus.requestFocus() }
                            .padding(vertical = 18.dp),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.Bottom,
                    ) {
                        BasicTextField(
                            value = price,
                            onValueChange = { price = it.filter { c -> c.isDigit() }.take(9) },
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
                            modifier = Modifier.focusRequester(priceFocus),
                            decorationBox = { inner ->
                                Box(contentAlignment = Alignment.Center) {
                                    if (price.isEmpty()) {
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
                } else {
                    /*
                     * По строке на класс. Крупного поля здесь нет
                     * намеренно: когда цен три, ни одна из них не главная,
                     * и выделять первую значило бы врать.
                     */
                    tiers.forEachIndexed { i, tierName ->
                        if (i > 0) HairLine()
                        FieldRow(
                            label = tierName,
                            value = tierPrices.getOrElse(i) { "" },
                            onValue = { raw ->
                                val clean = raw.filter { it.isDigit() }.take(9)
                                tierPrices = tierPrices.toMutableList().also { list ->
                                    while (list.size <= i) list.add("")
                                    list[i] = clean
                                }
                            },
                            placeholder = "0",
                            keyboard = KeyboardType.Number,
                        )
                    }
                }
            }

            if (!isNew) {
                Spacer(Modifier.height(14.dp))
                Row(
                    Modifier
                        .fillMaxWidth()
                        .sunken()
                        .pressable(enabled = !busy) { archiving = true }
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Icon(
                        Icons.Filled.Archive,
                        contentDescription = null,
                        tint = Brand.badOnBoard,
                        modifier = Modifier.size(17.dp),
                    )
                    Column {
                        Text(
                            L(R.string.services__remove),
                            fontSize = 14.5.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Brand.badOnBoard,
                        )
                        Text(
                            L(R.string.services__removeNoteShort),
                            fontSize = 11.5.sp,
                            color = Brand.boardMuted,
                        )
                    }
                }
            }

            Spacer(Modifier.height(16.dp))
            LimeButton(
                text = L(R.string.common__save),
                enabled = ready,
                loading = busy,
                onClick = {
                    scope.launch {
                        busy = true
                        runCatching {
                            session.authed { token ->
                                graph.api.call(
                                    "services",
                                    method = "POST",
                                    body = jsonBody {
                                        field("name", name.trim())
                                        field("price", value)
                                        service?.let { field("id", it.id) }
                                        if (tiers.isNotEmpty()) {
                                            // ноль — «как базовая»; сервер так это и понимает
                                            field(
                                                "tierPrices",
                                                JsonArray(
                                                    tiers.indices.map { i ->
                                                        JsonPrimitive(
                                                            tierPrices.getOrElse(i) { "" }
                                                                .filter { c -> c.isDigit() }
                                                                .toIntOrNull() ?: 0
                                                        )
                                                    }
                                                ),
                                            )
                                        }
                                    },
                                    token = token,
                                )
                            }
                        }
                        /*
                         * Перечитываем bootstrap, а не только свой список.
                         *
                         * Услуги для записи машины живут в сессии — они
                         * приезжают при входе вместе с бизнесом. Правка
                         * прайса, обновившая один этот экран, оставляла
                         * запись машины со старым набором: новая услуга
                         * была в прайсе и её не было там, где её выбирают.
                         * Это же место чинит и цену: мойщик выбирал бы
                         * прежнюю до перезапуска приложения.
                         */
                        runCatching { session.loadBootstrap() }
                        busy = false
                        onSaved()
                        onClose()
                    }
                },
            )
        }
    }

    if (archiving && service != null) {
        AlertDialog(
            onDismissRequest = { archiving = false },
            containerColor = Brand.boardSurface,
            title = { Text(L(R.string.services__removeTitle), color = Brand.onBoard) },
            text = { Text(L(R.string.services__removeNote), color = Brand.boardMuted) },
            confirmButton = {
                TextButton(onClick = {
                    archiving = false
                    scope.launch {
                        runCatching {
                            session.authed { token ->
                                graph.api.call("services/${service.id}", method = "DELETE", token = token)
                            }
                        }
                        // та же причина, что и у сохранения: убранная услуга
                        // обязана пропасть и из записи машины
                        runCatching { session.loadBootstrap() }
                        onSaved()
                        onClose()
                    }
                }) { Text(L(R.string.expenses__remove), color = Brand.badOnBoard) }
            },
            dismissButton = {
                TextButton(onClick = { archiving = false }) {
                    Text(L(R.string.common__cancel), color = Brand.boardMuted)
                }
            },
        )
    }
}

/**
 * Классы бизнеса.
 *
 * У мойки это седан, кроссовер, джип. У барбершопа их может не быть вовсе,
 * а у клиники они называются иначе — поэтому здесь только слова, которые
 * владелец придумал сам, и слово, которым он их называет.
 *
 * Один класс запрещён: один вариант — это отсутствие вариантов, поданное
 * как выбор, и мойщик жал бы единственную кнопку сорок раз за смену.
 * Убрать все — выключить свойство: прайс возвращается к одной цене. Цены
 * услуг при этом не стираются — класс вернут, вернутся и они.
 */
@Composable
private fun TierEditor(onClose: () -> Unit, onSaved: () -> Unit) {
    val graph = LocalGraph.current
    val session = graph.session
    val scope = rememberCoroutineScope()
    /*
     * Лист открывается на половину: под ним остаётся сам прайс, и цена
     * правится, когда соседние видно. Развернуть до конца можно тем же
     * движением вверх.
     */
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = false)
    val tenant = tenant()

    var label by remember { mutableStateOf(tenant?.tierLabel ?: "") }
    var names by remember { mutableStateOf(tenant?.tiers.orEmpty()) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    /** Больше шести классов — это уже не выбор, а список. */
    val limit = 6
    val clean = names.map { it.trim() }.filter { it.isNotEmpty() }
    val ready = !busy && clean.size != 1

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
        ) {
            SheetHeader(L(R.string.services__tiers), onClose = onClose)

            Column(Modifier.fillMaxWidth().sunken()) {
                FieldRow(
                    label = L(R.string.services__tierNameField),
                    value = label,
                    onValue = { label = it },
                    placeholder = L(R.string.work__tier),
                )
            }

            Spacer(Modifier.height(10.dp))
            Column(Modifier.fillMaxWidth().sunken()) {
                names.forEachIndexed { i, value ->
                    if (i > 0) HairLine()
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 13.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text(
                            "${i + 1}",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Brand.boardMuted,
                        )
                        BasicTextField(
                            value = value,
                            onValueChange = { raw ->
                                names = names.toMutableList().also { it[i] = raw }
                            },
                            textStyle = TextStyle(
                                color = Brand.onBoard,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.SemiBold,
                            ),
                            cursorBrush = SolidColor(Brand.grape),
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                            decorationBox = { inner ->
                                if (value.isEmpty()) {
                                    Text(
                                        L(R.string.services__tierPlaceholder),
                                        fontSize = 15.sp,
                                        color = Brand.boardMuted.copy(alpha = 0.6f),
                                    )
                                }
                                inner()
                            },
                        )
                        Icon(
                            Icons.Filled.RemoveCircle,
                            contentDescription = L(R.string.expenses__remove),
                            tint = Brand.boardMuted.copy(alpha = 0.6f),
                            modifier = Modifier
                                .size(19.dp)
                                .pressable { names = names.filterIndexed { j, _ -> j != i } },
                        )
                    }
                }

                if (names.size < limit) {
                    if (names.isNotEmpty()) HairLine()
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .pressable { names = names + "" }
                            .padding(horizontal = 16.dp, vertical = 14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Icon(
                            Icons.Filled.Add,
                            contentDescription = null,
                            tint = Brand.grape,
                            modifier = Modifier.size(15.dp),
                        )
                        Text(
                            L(R.string.services__addTier),
                            fontSize = 14.5.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Brand.grape,
                        )
                    }
                }
            }

            error?.let {
                Text(
                    it,
                    fontSize = 13.sp,
                    color = Brand.badOnBoard,
                    modifier = Modifier.padding(horizontal = 4.dp, vertical = 8.dp),
                )
            }

            Text(
                if (clean.isEmpty()) {
                    L(R.string.services__noTiersNote)
                } else {
                    Ln(R.plurals.services__tiersApplyNote, clean.size)
                },
                fontSize = 11.5.sp,
                color = Brand.boardMuted,
                modifier = Modifier.padding(horizontal = 6.dp, vertical = 8.dp),
            )

            LimeButton(
                text = L(R.string.common__save),
                enabled = ready,
                loading = busy,
                onClick = {
                    scope.launch {
                        busy = true
                        error = try {
                            session.authed { token ->
                                graph.api.call(
                                    "tiers",
                                    method = "POST",
                                    body = jsonBody {
                                        field("label", label.trim())
                                        field("tiers", JsonArray(clean.map { JsonPrimitive(it) }))
                                    },
                                    token = token,
                                )
                            }
                            /*
                             * Перечитываем весь bootstrap, а не только
                             * классы: список меняет прайс, и услуги в
                             * памяти приложения обязаны приехать заново
                             * вместе с ним.
                             */
                            runCatching { session.loadBootstrap() }
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
}
