package com.sevarm.tetr.feature.shift

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
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
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.sevarm.tetr.LocalGraph
import com.sevarm.tetr.R
import com.sevarm.tetr.core.api.Lookup
import com.sevarm.tetr.core.api.Service
import com.sevarm.tetr.core.i18n.L
import com.sevarm.tetr.core.i18n.Terms
import com.sevarm.tetr.core.plate.PlateReader
import com.sevarm.tetr.core.queue.OrderQueue
import com.sevarm.tetr.core.ui.currency
import com.sevarm.tetr.core.ui.lang
import com.sevarm.tetr.core.ui.money
import com.sevarm.tetr.core.ui.serviceName
import com.sevarm.tetr.core.ui.paymentIcon
import com.sevarm.tetr.core.ui.paymentLabel
import com.sevarm.tetr.core.ui.tenant
import com.sevarm.tetr.core.money.Crew as CrewMath
import com.sevarm.tetr.core.ui.staffCount
import com.sevarm.tetr.design.Brand
import com.sevarm.tetr.design.Caption
import com.sevarm.tetr.design.FlowRowLayout
import com.sevarm.tetr.design.Insets
import com.sevarm.tetr.design.LimeButton
import com.sevarm.tetr.design.LimeChip
import com.sevarm.tetr.design.SheetHeader
import com.sevarm.tetr.design.pressable
import com.sevarm.tetr.design.sunken
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.net.URLEncoder
import java.util.UUID

/**
 * Запись машины — одним листом.
 *
 * Мастера из трёх шагов больше нет. Он стоил тех же трёх касаний, но между
 * ними были три смены страницы: человек не видел, что уже выбрал, не мог
 * поправить номер, не вернувшись назад, и не знал суммы, пока не дошёл до
 * оплаты. Здесь всё три вещи на виду сразу — номер, услуги, оплата.
 *
 * Порядок сверху вниз повторяет порядок работы: сначала подъехала машина,
 * потом решили, что с ней делают, потом взяли деньги.
 *
 * Запись всегда ложится в очередь и всегда показывает успех сразу.
 * Отправка — отдельная забота: сеть во дворе мойки пропадает, но человек
 * уже отпустил машину и к телефону не вернётся.
 */
@Composable
fun OrderFlowSheet(onClose: () -> Unit, onDone: suspend () -> Unit) {
    val graph = LocalGraph.current
    val session = graph.session
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    val tenant = tenant()
    val services by session.services.collectAsState()
    val tiers = tenant?.tiers.orEmpty()
    val currency = currency()
    val lang = lang()

    var clientKey by remember { mutableStateOf("") }
    var chosen by remember { mutableStateOf<List<Service>>(emptyList()) }
    var known by remember { mutableStateOf<com.sevarm.tetr.core.api.KnownClient?>(null) }
    var tier by remember { mutableStateOf<Int?>(null) }
    var payment by remember { mutableStateOf<String?>(null) }
    var showDiscount by remember { mutableStateOf(false) }
    var discountText by remember { mutableStateOf("") }
    /*
     * Мыли вместе.
     *
     * Выключено по умолчанию, и это не мелочь: девять записей из десяти
     * одиночные, и лишнее касание на них стоило бы сорока касаний за
     * смену ради одного случая.
     *
     * Переключатель отдельно от списка отмеченных: человек выбирает
     * «вместе с коллегами» раньше, чем успевает кого-то отметить, и до
     * первой галочки экран обязан показывать выбор, а не молчать.
     */
    var together by remember { mutableStateOf(false) }
    var helpers by remember { mutableStateOf(setOf<String>()) }

    var sending by remember { mutableStateOf(false) }
    var scanning by remember { mutableStateOf(false) }
    var cameraDenied by remember { mutableStateOf(false) }

    val plateBusiness = tenant?.clientIdType == "plate"

    fun normalized(raw: String): String =
        if (plateBusiness) PlateReader.canonical(raw) else raw.trim().uppercase()

    val listTotal = chosen.sumOf { it.priceFor(tier) }
    val charged = if (showDiscount) minOf(discountText.toIntOrNull() ?: listTotal, listTotal) else listTotal
    val discounted = charged < listTotal
    /* Коллеги точки. Себя из списка убрала сессия: автор записи участник
       по определению. */
    val mates by session.mates.collectAsState()
    val teamPercent by session.teamPercent.collectAsState()

    /* Выбирать можно только тех, кто на смене. Остальные в списке не
       стоят: сервер такую запись всё равно не примет, и показывать имя, по
       которому придёт отказ, значит обещать несуществующее. */
    val working = mates.filter { it.working }

    /*
     * Совместная работа предлагается, только когда её есть с кем делать и
     * когда владелец назначил общий процент. Иначе выбор «кто мыл» —
     * управление, которое ничего не меняет: его придётся прочитать, чтобы
     * это понять, а читают его сорок раз за смену.
     */
    val canShare = teamPercent != null && mates.isNotEmpty()

    /* Отмеченные, оставшиеся в списке: владелец мог уволить человека, пока
       экран открыт, — считаем по тому, что видно. */
    val crewIds = if (canShare && together) {
        working.map { it.id }.filter { it in helpers }
    } else {
        emptyList()
    }
    val crewSize = crewIds.size + 1

    val canRecord = normalized(clientKey).isNotEmpty() && chosen.isNotEmpty() && payment != null

    val cameraPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) scanning = true else cameraDenied = true
    }

    /*
     * Подсказка «этот клиент уже был» — то, ради чего экран и существует.
     * Ищем с трёх символов: короче номер не бывает, а запрос на каждую
     * букву стоил бы сорока запросов за смену впустую.
     */
    LaunchedEffect(clientKey) {
        val key = normalized(clientKey)
        if (key.length < 3) {
            known = null
            return@LaunchedEffect
        }
        delay(250)
        val result = runCatching {
            session.authed { token ->
                graph.api.send<Lookup>(
                    "clients/lookup?key=${URLEncoder.encode(key, "UTF-8")}",
                    token = token,
                )
            }
        }.getOrNull()
        known = result?.known

        /*
         * Класс из прошлой записи этой машины. Только если человек ещё не
         * выбрал сам: подсказка не имеет права переспорить решение.
         */
        if (tier == null) {
            val last = result?.known?.lastTier
            val index = tiers.indexOfFirst { it.equals(last, ignoreCase = true) }
            if (index >= 0) tier = index
        }
    }

    ModalBottomSheet(
        onDismissRequest = onClose,
        sheetState = sheet,
        containerColor = Brand.board,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .imePadding(),
        ) {
            SheetHeader(
                L(R.string.order__newUnit, Terms.unit(tenant?.unitOne.orEmpty(), lang).acc),
                onClose = onClose,
            )

            Column(
                Modifier
                    .weight(1f, fill = false)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp),
            ) {
                // ── номер ──────────────────────────────────────────
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    /*
                     * Касание ловит вся коробка номера, а не полоска
                     * набранного текста внутри. У пустого поля она шириной
                     * в каретку, и палец мимо неё промахивается — а это
                     * первое, что нажимают на экране записи.
                     */
                    val plateFocus = remember { FocusRequester() }
                    Box(
                        Modifier
                            .weight(1f)
                            .height(60.dp)
                            .clip(RoundedCornerShape(18.dp))
                            .background(Brand.boardInk.copy(alpha = 0.07f))
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null,
                            ) { plateFocus.requestFocus() }
                            .padding(horizontal = 16.dp),
                        contentAlignment = Alignment.CenterStart,
                    ) {
                        BasicTextField(
                            value = clientKey,
                            onValueChange = { raw ->
                                /*
                                 * Как только ручной ввод стал полноценным
                                 * номером, показываем его так же, как
                                 * результат камеры: очередь и поиск
                                 * получают один и тот же ключ.
                                 */
                                clientKey = if (plateBusiness) {
                                    PlateReader.parse(raw) ?: raw.uppercase()
                                } else {
                                    raw
                                }
                            },
                            textStyle = TextStyle(
                                color = Brand.onBoard,
                                fontSize = 24.sp,
                                fontWeight = FontWeight.Bold,
                            ),
                            cursorBrush = SolidColor(Brand.grape),
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(
                                capitalization = KeyboardCapitalization.Characters,
                                autoCorrectEnabled = false,
                                keyboardType = if (tenant?.clientIdType == "phone") {
                                    KeyboardType.Phone
                                } else {
                                    KeyboardType.Text
                                },
                                imeAction = ImeAction.Done,
                            ),
                            modifier = Modifier.fillMaxWidth().focusRequester(plateFocus),
                            decorationBox = { inner ->
                                if (clientKey.isEmpty()) {
                                    Text(
                                        Terms.clientId(tenant?.clientIdLabel.orEmpty(), lang),
                                        fontSize = 24.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Brand.boardMuted.copy(alpha = 0.55f),
                                        maxLines = 1,
                                    )
                                }
                                inner()
                            },
                        )
                    }

                    /*
                     * Камера — только для номеров. Ручной ввод остаётся
                     * рядом всегда: номер бывает грязный, гнутый или
                     * иностранный, и воевать с камерой вместо восьми
                     * символов человек не должен.
                     */
                    if (plateBusiness) {
                        Box(
                            Modifier
                                .size(60.dp)
                                .clip(RoundedCornerShape(18.dp))
                                .background(
                                    if (scanning) Brand.boardInk.copy(alpha = 0.12f)
                                    else Brand.grape.copy(alpha = 0.08f)
                                )
                                .pressable {
                                    if (scanning) {
                                        scanning = false
                                    } else {
                                        val granted = ContextCompat.checkSelfPermission(
                                            context,
                                            Manifest.permission.CAMERA,
                                        ) == PackageManager.PERMISSION_GRANTED
                                        if (granted) {
                                            scanning = true
                                        } else {
                                            cameraPermission.launch(Manifest.permission.CAMERA)
                                        }
                                    }
                                },
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                if (scanning) Icons.Filled.Close else Icons.Filled.PhotoCamera,
                                contentDescription = L(
                                    if (scanning) R.string.order__closeCamera
                                    else R.string.order__openCamera
                                ),
                                tint = if (scanning) Brand.onBoard else Brand.grape,
                                modifier = Modifier.size(22.dp),
                            )
                        }
                    }
                }

                if (cameraDenied) {
                    Text(
                        L(R.string.camera__denied),
                        fontSize = 12.5.sp,
                        color = Brand.warnOnBoard,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }

                known?.let { client ->
                    // узнавание постоянного клиента прямо при вводе
                    Text(
                        L(R.string.order__knownClient, client.visits, money(client.total)),
                        fontSize = 12.5.sp,
                        fontWeight = FontWeight.Medium,
                        color = Brand.goodOnBoard,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }

                /*
                 * Класс машины — ряд чипов сразу под номером. Класс
                 * принадлежит МАШИНЕ, а не услуге: «джип по комплексу,
                 * седан по химчистке» — не бизнес-случай, а способ
                 * ошибиться. Выбирается один раз на заезд, и цены всех
                 * услуг ниже сразу пересчитываются.
                 */
                if (tiers.isNotEmpty()) {
                    Spacer(Modifier.height(18.dp))
                    Caption(tenant?.tierLabel ?: L(R.string.work__tier), top = 0.dp)
                    Spacer(Modifier.height(8.dp))
                    FlowRowLayout {
                        tiers.forEachIndexed { index, name ->
                            LimeChip(
                                label = name,
                                selected = tier == index,
                                onClick = { tier = index },
                            )
                        }
                    }
                }

                if (scanning) {
                    Spacer(Modifier.height(12.dp))
                    PlateCameraPanel(
                        onFound = { plate ->
                            clientKey = PlateReader.canonical(plate)
                            scanning = false
                        },
                        onClose = { scanning = false },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(320.dp),
                    )
                }

                // ── услуги ─────────────────────────────────────────
                Spacer(Modifier.height(22.dp))
                Caption(L(R.string.owner__colService), top = 0.dp)
                Spacer(Modifier.height(10.dp))
                FlowRowLayout {
                    services.forEach { item ->
                        val on = chosen.any { it.id == item.id }
                        ServiceChip(
                            name = serviceName(item.name),
                            price = money(item.priceFor(tier)),
                            selected = on,
                            onClick = {
                                // повторное касание снимает выбор
                                chosen = if (on) chosen.filterNot { it.id == item.id }
                                else chosen + item
                            },
                        )
                    }
                }

                // ── кто мыл ────────────────────────────────────────
                if (canShare) {
                    Spacer(Modifier.height(22.dp))
                    Caption(L(R.string.crew__who), top = 0.dp)
                    Spacer(Modifier.height(8.dp))

                    /*
                     * Два равноправных выхода одного размера, разница
                     * только в заливке: «только я» — не отказ от чего-то, а
                     * обычный ход дел, и выглядеть тише второго он не
                     * должен.
                     */
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        CrewChoice(
                            label = L(R.string.crew__onlyMe),
                            on = !together,
                            modifier = Modifier.weight(1f),
                        ) {
                            together = false
                            /*
                             * Отметки снимаем сразу. Оставленные «на потом»
                             * они не видны — список свёрнут, — а уходят на
                             * сервер и делят деньги молча.
                             */
                            helpers = emptySet()
                        }
                        CrewChoice(
                            label = L(R.string.crew__together),
                            on = together,
                            modifier = Modifier.weight(1f),
                        ) { together = true }
                    }

                    if (together) {
                        Spacer(Modifier.height(10.dp))
                        FlowRowLayout {
                            working.forEach { mate ->
                                val on = mate.id in helpers
                                MateChip(mate.name, on) {
                                    helpers = if (on) {
                                        helpers - mate.id
                                    } else if (crewSize < CrewMath.MAX) {
                                        helpers + mate.id
                                    } else {
                                        helpers
                                    }
                                }
                            }
                        }

                        Spacer(Modifier.height(10.dp))
                        /*
                         * Что получится — числами и до нажатия.
                         *
                         * Главное место всей затеи. Мойщик должен увидеть
                         * СВОЮ долю раньше, чем согласится на совместную
                         * запись, иначе вечером он узнает её из ведомости и
                         * решит, что его обсчитали.
                         *
                         * Пока никого не отметили — подсказка, а не расчёт:
                         * «фонд 5 000, каждому 5 000» на одном участнике не
                         * считает, а путает.
                         */
                        when {
                            /*
                             * Коллеги в бизнесе есть, но все вне смены.
                             * Молчать здесь нельзя: пустой список читается
                             * как поломка, а причина у него рабочая и
                             * поправимая — человеку надо встать на смену на
                             * своём телефоне.
                             */
                            working.isEmpty() -> Text(
                                L(R.string.crew__nobodyOnShift),
                                fontSize = 12.5.sp,
                                fontWeight = FontWeight.Medium,
                                color = Brand.warnOnBoard,
                            )

                            crewIds.isEmpty() -> Text(
                                L(R.string.crew__percentHint),
                                fontSize = 12.5.sp,
                                fontWeight = FontWeight.Medium,
                                color = Brand.boardMuted,
                            )

                            else -> {
                                val rate = teamPercent ?: 0
                                val pool = CrewMath.pool(charged, rate)
                                /* Своя доля — тем же кодом, которым её
                                   посчитает сервер. */
                                val mine = CrewMath.split(pool, crewSize).firstOrNull() ?: 0
                                Text(
                                    staffCount(crewSize) +
                                        " · " + L(R.string.crew__teamPercent) + " $rate%\n" +
                                        L(R.string.crew__pool) + " " + money(pool) +
                                        " · " + L(R.string.crew__yours) + " " + money(mine),
                                    fontSize = 12.5.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = Brand.goodOnBoard,
                                )
                            }
                        }
                    }
                }

                /*
                 * Скидка. Свёрнута по умолчанию и стоит под услугами, а не
                 * полем цены в шапке: скидка — исключение, и вводить её
                 * должен тот, кто её действительно даёт.
                 */
                if (showDiscount) {
                    Spacer(Modifier.height(12.dp))
                    /*
                     * Подпись сверху, сумма слева, касание всей строкой —
                     * как во всех полях продукта. Раньше слово стояло
                     * слева, а число прижималось к правому краю: каретка
                     * оказывалась в единственном на весь продукт месте, и
                     * попасть в неё пальцем было отдельной задачей.
                     */
                    val discountFocus = remember { FocusRequester() }
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .sunken(18.dp)
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null,
                            ) { discountFocus.requestFocus() }
                            .padding(horizontal = 14.dp, vertical = 12.dp),
                        verticalArrangement = Arrangement.spacedBy(3.dp),
                    ) {
                        Text(
                            L(R.string.order__discounted),
                            fontSize = 12.sp,
                            color = Brand.boardMuted,
                        )
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            BasicTextField(
                                value = discountText,
                                onValueChange = { raw ->
                                    val digits = raw.filter { it.isDigit() }.take(9)
                                    val n = digits.toIntOrNull()
                                    // выше прайса не пускаем прямо в поле
                                    discountText = if (n != null && n > listTotal) {
                                        listTotal.toString()
                                    } else {
                                        digits
                                    }
                                },
                                textStyle = TextStyle(
                                    color = Brand.onBoard,
                                    fontSize = 16.sp,
                                    fontWeight = FontWeight.SemiBold,
                                ),
                                cursorBrush = SolidColor(Brand.grape),
                                keyboardOptions = KeyboardOptions(
                                    keyboardType = KeyboardType.Number,
                                    imeAction = ImeAction.Done,
                                ),
                                singleLine = true,
                                modifier = Modifier.weight(1f).focusRequester(discountFocus),
                                decorationBox = { inner ->
                                    if (discountText.isEmpty()) {
                                        Text(
                                            listTotal.toString(),
                                            fontSize = 16.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            color = Brand.boardMuted.copy(alpha = 0.6f),
                                        )
                                    }
                                    inner()
                                },
                            )
                            Text(
                                if (currency == "AMD") "֏" else currency,
                                fontSize = 14.sp,
                                color = Brand.boardMuted,
                            )
                        }
                    }
                } else if (chosen.isNotEmpty()) {
                    Text(
                        L(R.string.order__giveDiscount),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Brand.grape,
                        modifier = Modifier
                            .padding(top = 14.dp)
                            .pressable { showDiscount = true }
                            .padding(vertical = 6.dp),
                    )
                }

                Spacer(Modifier.height(20.dp))
            }

            // ── оплата ─────────────────────────────────────────────
            Column(
                Modifier
                    .fillMaxWidth()
                    .background(Brand.board)
                    .padding(horizontal = 16.dp)
                    .padding(top = 12.dp, bottom = Insets.bottom.calculateBottomPadding() + 8.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(
                        L(R.string.work__toPay),
                        fontSize = 13.sp,
                        color = Brand.boardMuted,
                        modifier = Modifier.weight(1f),
                    )
                    if (discounted) {
                        Text(
                            money(listTotal),
                            fontSize = 14.sp,
                            color = Brand.boardMuted,
                            textDecoration = TextDecoration.LineThrough,
                            modifier = Modifier.padding(end = 8.dp),
                        )
                    }
                    Text(
                        money(charged),
                        fontSize = 26.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (discounted) Brand.warnOnBoard else Brand.onBoard,
                    )
                }

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    /*
                     * Способы оплаты одним тоном, а не тремя разными.
                     * Пятна и правда видно, но горели все три и всегда, а
                     * выбранный не отличался от невыбранного ничем: экран
                     * отвечал «вот три кнопки» вместо «вот что вы выбрали».
                     */
                    listOf("cash", "card", "transfer").forEach { key ->
                        val on = payment == key
                        Column(
                            Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(18.dp))
                                .background(
                                    if (on) Brand.boardInk else Brand.boardInk.copy(alpha = 0.07f)
                                )
                                .pressable { payment = key }
                                .padding(vertical = 14.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Icon(
                                paymentIcon(key),
                                contentDescription = null,
                                tint = if (on) Brand.board else Brand.onBoard,
                                modifier = Modifier.size(18.dp),
                            )
                            Text(
                                paymentLabel(key),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = if (on) Brand.board else Brand.onBoard,
                                maxLines = 1,
                            )
                        }
                    }
                }

                /*
                 * Последнее движение — отдельная кнопка, и на ней написано,
                 * что произойдёт и за сколько. Раньше запись делало касание
                 * по способу оплаты: экономило одно движение и стоило
                 * дорого — промах по соседней плитке записывал не тот
                 * способ и правился только отменой всей записи.
                 *
                 * ПОСЛЕ ЗАПИСИ ЛИСТ ЗАКРЫВАЕТСЯ: подтверждение, которому
                 * верят, — это машина в журнале смены, а не пустая форма на
                 * её месте.
                 */
                /* Занято и погашено — разные состояния. Бледнеет
                   только неполная запись («дозаполни»); занятая кнопка
                   остаётся в полном цвете и называет, что делает
                   («принято, идёт»). Мойщик, который видит одно и то же
                   в обоих случаях, начинает жать ещё раз. */
                LimeButton(
                    text = L(
                        R.string.work__addFor,
                        Terms.unit(tenant?.unitOne.orEmpty(), lang).acc,
                        money(charged),
                    ),
                    busyTitle = L(R.string.order__saving),
                    enabled = canRecord && !sending,
                    loading = sending,
                    onClick = {
                        /*
                         * Засов не про сеть, а про палец: кнопку жмут
                         * мокрой рукой, и второе касание приходит раньше,
                         * чем экран успевает перерисоваться. Две одинаковые
                         * машины в отчёте владелец считает ошибкой
                         * продукта, и он прав.
                         */
                        if (sending) return@LimeButton
                        val first = chosen.firstOrNull() ?: return@LimeButton
                        val method = payment ?: return@LimeButton
                        sending = true

                        graph.queue.add(
                            OrderQueue.Item(
                                ref = UUID.randomUUID().toString(),
                                clientKey = normalized(clientKey),
                                // старое поле заполняем всегда: очередь
                                // могла быть записана этой версией, а
                                // отправлена — после отката на прежнюю
                                serviceId = first.id,
                                serviceIds = chosen.map { it.id },
                                serviceName = chosen.joinToString(" + ") { it.name },
                                price = charged,
                                listPrice = listTotal,
                                payment = method,
                                // словом, а не номером: список классов мог
                                // смениться, пока запись лежала без связи
                                tier = tier?.let { tiers.getOrNull(it) },
                                // чья мойка: очередь переживает переход
                                tenantId = tenant?.id,
                                // кто ещё мыл; пусто — одиночная запись
                                participants = crewIds.ifEmpty { null },
                                at = System.currentTimeMillis(),
                            )
                        )

                        scope.launch {
                            /*
                             * Сначала перечитываем смену, потом закрываем
                             * лист: иначе человек на мгновение увидит
                             * журнал БЕЗ своей машины — то есть ровно то,
                             * чего боится, нажимая кнопку.
                             */
                            onDone()
                            sending = false
                            onClose()
                        }
                    },
                )
            }
        }
    }
}

@Composable
private fun ServiceChip(name: String, price: String, selected: Boolean, onClick: () -> Unit) {
    Column(
        Modifier
            .clip(RoundedCornerShape(16.dp))
            .background(if (selected) Brand.lime else Brand.boardInk.copy(alpha = 0.07f))
            .pressable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 11.dp),
    ) {
        Text(
            name,
            fontSize = 14.5.sp,
            fontWeight = FontWeight.SemiBold,
            color = if (selected) Brand.onLime else Brand.onBoard,
        )
        Text(
            price,
            fontSize = 12.sp,
            color = if (selected) Brand.onLime.copy(alpha = 0.7f) else Brand.boardMuted,
        )
    }
}

/**
 * Один из двух равноправных выходов: «только я» и «вместе с коллегами».
 *
 * Одного размера, разница только в заливке. «Только я» — не отказ от
 * возможности, а обычный ход дел, и выглядеть тише второго он не должен.
 */
@Composable
private fun CrewChoice(
    label: String,
    on: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Box(
        modifier
            .height(48.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(if (on) Brand.lime else Brand.boardInk.copy(alpha = 0.07f))
            .pressable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            color = if (on) Brand.onLime else Brand.onBoard,
        )
    }
}

/**
 * Коллега в списке: точка его цвета и имя.
 *
 * Цвет тот же, которым человек подписан в журнале и в ведомости, — по
 * нему имя узнают раньше, чем прочитают. Ростом сорок восемь точек: по
 * фишкам целятся мокрым пальцем, стоя у машины.
 */
@Composable
private fun MateChip(name: String, on: Boolean, onClick: () -> Unit) {
    Row(
        Modifier
            .height(44.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(if (on) Brand.lime else Brand.boardInk.copy(alpha = 0.07f))
            .pressable(onClick = onClick)
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        Box(
            Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(Brand.person(name))
        )
        Text(
            name,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            color = if (on) Brand.onLime else Brand.onBoard,
            maxLines = 1,
        )
    }
}
