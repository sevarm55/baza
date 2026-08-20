package com.sevarm.tetr.feature.staff

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.heightIn
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.LockReset
import androidx.compose.material.icons.filled.PersonRemove
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sevarm.tetr.LocalGraph
import com.sevarm.tetr.R
import com.sevarm.tetr.core.api.Api
import com.sevarm.tetr.core.api.ApiException
import com.sevarm.tetr.core.api.Staff
import com.sevarm.tetr.core.api.StaffMember
import com.sevarm.tetr.core.api.field
import com.sevarm.tetr.core.api.nullField
import com.sevarm.tetr.core.api.jsonBody
import com.sevarm.tetr.core.i18n.L
import com.sevarm.tetr.core.i18n.Terms
import com.sevarm.tetr.core.ui.currency
import com.sevarm.tetr.core.ui.lang
import com.sevarm.tetr.core.money.Crew as CrewMath
import com.sevarm.tetr.core.ui.staffCount
import com.sevarm.tetr.core.ui.money
import com.sevarm.tetr.core.ui.staffRole
import com.sevarm.tetr.core.ui.tenant
import com.sevarm.tetr.core.ui.units
import com.sevarm.tetr.design.Brand
import com.sevarm.tetr.design.Caption
import com.sevarm.tetr.design.CodeCells
import com.sevarm.tetr.design.FieldRow
import com.sevarm.tetr.design.FlowRowLayout
import com.sevarm.tetr.design.HairLine
import com.sevarm.tetr.design.Insets
import com.sevarm.tetr.design.LimeButton
import com.sevarm.tetr.design.LimeChip
import com.sevarm.tetr.design.Palette
import com.sevarm.tetr.design.QuietButton
import com.sevarm.tetr.design.ScreenHeader
import com.sevarm.tetr.design.SheetHeader
import com.sevarm.tetr.design.pressable
import com.sevarm.tetr.design.sunken
import kotlinx.coroutines.launch

/**
 * Сотрудники.
 *
 * Каждый — плитка своего цвета, того же, каким его имя набрано в ленте,
 * кружок на смене и карточка в зарплатах. Цвет здесь работает именем, и
 * список людей перестаёт быть списком строк.
 *
 * Процент вынесен из строки в отдельный крупный знак: это единственное
 * число, ради которого сюда заходят, и раньше оно стояло тем же кеглем,
 * что телефон.
 *
 * Меняется процент только на будущее: в каждом заказе лежит снимок, и
 * прошлые зарплаты не пересчитываются. Иначе поднять ставку было бы
 * страшно — это переписывало бы уже согласованные суммы.
 */
@Composable
fun StaffScreen(onBack: () -> Unit) {
    val graph = LocalGraph.current
    val session = graph.session
    val scope = rememberCoroutineScope()
    val lang = lang()

    var staff by remember { mutableStateOf<List<StaffMember>>(emptyList()) }
    var editing by remember { mutableStateOf<StaffMember?>(null) }
    var adding by remember { mutableStateOf(false) }
    var teamOpen by remember { mutableStateOf(false) }
    val teamPercent by session.teamPercent.collectAsState()

    suspend fun reload() {
        val fresh = runCatching {
            session.authed { token -> graph.api.send<Staff>("staff", token = token) }
        }.getOrNull()
        if (fresh != null) staff = fresh.staff
    }

    LaunchedEffect(Unit) { reload() }

    /*
     * Порядок задан состоянием, а не тем, в каком порядке людей завели:
     * сначала те, кто стоит на мойке прямо сейчас, потом отработавшие в
     * этом месяце, потом остальные. Вопрос «кто сейчас на площадке» задают
     * чаще, чем «кто заведён раньше».
     */
    val ordered = staff.sortedWith(
        compareByDescending<StaffMember> { it.onShift == true }
            .thenByDescending { it.earned ?: 0 }
            .thenBy { it.name }
    )

    Column(
        Modifier
            .fillMaxSize()
            .background(Brand.board)
            .padding(top = Insets.top.calculateTopPadding()),
    ) {
        ScreenHeader(L(R.string.more__team), onBack = onBack)

        LazyColumn(
            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            /*
             * Одна белая коробка на всю команду, а не плитка на человека.
             *
             * Цветные плитки были тем же приёмом, что и на записи машины, —
             * но там цвет означал класс, а здесь не означал ничего: он
             * брался из имени, чтобы люди отличались друг от друга. Восемь
             * залитых прямоугольников подряд весили одинаково, и глаз не
             * находил в них ни первого, ни главного.
             *
             * Цвет никуда не делся — он ушёл в кружок с буквой, где как раз
             * и работает: имена в списке узнаются по нему раньше, чем
             * прочитаны. А список стал списком, каким он и был по смыслу.
             */
            item {
                Column(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(24.dp))
                        .background(Brand.boardSurface)
                        .border(
                            0.8.dp,
                            Brand.boardInk.copy(alpha = 0.07f),
                            RoundedCornerShape(24.dp),
                        ),
                ) {
                    ordered.forEachIndexed { index, person ->
                        /*
                         * Линия отбита под текст, а не под кружок: под
                         * кружком она разрезала бы коробку насквозь и
                         * вернула бы ощущение отдельных плиток.
                         */
                        if (index > 0) HairLine(inset = 70.dp)
                        PersonRow(person) {
                            // себя владелец не правит и не отключает
                            if (!person.isMe) editing = person
                        }
                    }

                    /*
                     * Совместная работа — строкой в том же списке, а не
                     * отдельным экраном. Свойство трогают раз в год, но
                     * искать его человек будет там же, где ставки: это
                     * условие оплаты труда, и место ему среди людей.
                     */
                    HairLine(inset = 70.dp)
                    TeamRow(teamPercent) { teamOpen = true }
                }
            }

            item {
                /*
                 * Добавление — строкой в самом списке, а не плюсиком в
                 * панели: плюсик в углу ищут глазами, строка стоит там, где
                 * список кончается, то есть ровно там, куда смотрит
                 * человек, не нашедший нужного имени.
                 */
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(top = 4.dp)
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
                        L(R.string.staff__add, Terms.staff(staffRole(), lang).acc),
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Brand.onBoard,
                    )
                }
            }
        }
    }

    if (teamOpen) {
        TeamWashEditor(onClose = { teamOpen = false })
    }

    if (adding || editing != null) {
        StaffEditor(
            person = editing,
            onClose = {
                adding = false
                editing = null
            },
            onSaved = { scope.launch { reload() } },
        )
    }
}

@Composable
private fun PersonRow(person: StaffMember, onClick: () -> Unit) {
    val tone = Palette.personTone(person.name)
    val owner = person.role == "owner"

    Row(
        Modifier
            .fillMaxWidth()
            .pressable(enabled = !person.isMe, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(contentAlignment = Alignment.BottomEnd) {
            Box(
                Modifier
                    .size(42.dp)
                    .clip(CircleShape)
                    .background(tone.base),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    person.name.take(1),
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                )
            }
            /*
             * «На смене» стало точкой на кружке вместо слова рядом с
             * именем. Слово занимало место в строке имени и вытесняло
             * оттуда «Вы»; точка сидит на самом человеке и читается без
             * чтения. Кольцо цвета коробки нужно, чтобы точка не сливалась
             * с кружком под ней.
             */
            if (person.onShift == true) {
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

        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(
                    person.name,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Brand.onBoard,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (person.isMe) Badge(L(R.string.common__you))
            }

            /*
             * Что человек сделал за месяц. Без этого экран отвечал «кто
             * заведён» и молчал о том, ради чего этих людей держат.
             */
            val cars = person.cars
            val earned = person.earned
            if (cars != null && earned != null && cars > 0) {
                Text(
                    "${units(cars)} · ${money(earned)}",
                    fontSize = 12.5.sp,
                    color = Brand.boardMuted,
                    maxLines = 1,
                )
            }

            /*
             * Телефон бледнее всего в строке: он нужен раз в месяц, когда
             * человек не вышел, — а места занимает столько же, сколько имя.
             */
            Text(
                person.phone,
                fontSize = 11.5.sp,
                color = Brand.boardMuted.copy(alpha = 0.75f),
                maxLines = 1,
            )
        }

        /*
         * Процент — крупно и с подписью. Владельцу вместо него слово: у
         * него ставка обычно нулевая, и «0 %» рядом с именем читается как
         * ошибка, а не как «долю не берёт».
         */
        Column(horizontalAlignment = Alignment.End) {
            if (owner) {
                Text(
                    L(R.string.roles__owner),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Brand.boardMuted,
                )
            } else {
                Text(
                    "${person.percent}%",
                    fontSize = 19.sp,
                    fontWeight = FontWeight.Bold,
                    color = Brand.onBoard,
                )
                Text(
                    L(R.string.staff__perRecord),
                    fontSize = 10.sp,
                    color = Brand.boardMuted,
                )
            }
            /*
             * Сколько ему сейчас должны. Считает лист зарплат — тот же,
             * которым живут сами зарплаты, — а называется здесь потому, что
             * вопрос «сколько я ему должен» задают, глядя на человека.
             */
            person.due?.takeIf { it > 0 }?.let {
                Text(
                    money(it),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Brand.boardInk,
                    modifier = Modifier.padding(top = 3.dp),
                )
            }
        }
    }
}

/** Отметка «Вы» — приглушённая: это уточнение, а не звание. */
@Composable
private fun Badge(text: String) {
    Text(
        text,
        fontSize = 10.sp,
        fontWeight = FontWeight.Bold,
        color = Brand.boardMuted,
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(Brand.boardInk.copy(alpha = 0.07f))
            .padding(horizontal = 6.dp, vertical = 2.dp),
    )
}

/**
 * Общий процент команды за совместную работу.
 *
 * Состояние стоит прямо на строке: свойство редкое, и открывать окно
 * только чтобы узнать, включено ли оно, — лишний путь на экране, куда
 * заходят за другим.
 */
@Composable
private fun TeamRow(percent: Int?, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 66.dp)
            .pressable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            Modifier
                .size(42.dp)
                .clip(CircleShape)
                .background(Brand.grape.copy(alpha = 0.10f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Filled.Groups,
                contentDescription = null,
                tint = Brand.grape,
                modifier = Modifier.size(16.dp),
            )
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                L(R.string.crew__title),
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold,
                color = Brand.onBoard,
            )
            Text(
                L(R.string.crew__lead),
                fontSize = 12.sp,
                color = Brand.boardMuted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Text(
            percent?.let { "$it%" } ?: L(R.string.crew__off),
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            color = if (percent == null) Brand.boardMuted else Brand.onBoard,
        )
    }
}

/**
 * Карточка сотрудника: заведение и правка.
 *
 * Процент набирается не с клавиатуры, а готовыми ставками. На мойке их
 * три-четыре — 35, 40, 45, 50, — и цифровая клавиатура ради одного из
 * четырёх известных чисел это лишний экран поверх экрана. Своё значение
 * всё равно можно ввести: последняя фишка открывает поле.
 */
@Composable
private fun StaffEditor(person: StaffMember?, onClose: () -> Unit, onSaved: () -> Unit) {
    val graph = LocalGraph.current
    val session = graph.session
    val scope = rememberCoroutineScope()
    /*
     * Лист открывается на половину, а не во весь экран: под ним остаётся
     * список команды, и правящий ставку видит, какая она у соседей. Развернуть
     * до конца можно тем же движением вверх.
     */
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = false)
    val lang = lang()
    val isNew = person == null

    /** Ставки, которые встречаются на мойке. Остальное — вручную. */
    val common = listOf(30, 35, 40, 45, 50)

    var name by remember { mutableStateOf(person?.name.orEmpty()) }
    var phone by remember { mutableStateOf("") }
    var pin by remember { mutableStateOf("") }
    var percent by remember { mutableStateOf(person?.percent ?: 40) }
    var custom by remember { mutableStateOf((person?.percent ?: 40) !in common) }
    var customText by remember { mutableStateOf((person?.percent ?: 40).toString()) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var firing by remember { mutableStateOf(false) }
    var resettingPin by remember { mutableStateOf(false) }
    var newPin by remember { mutableStateOf("") }
    var pinDone by remember { mutableStateOf(false) }

    /*
     * Цифры, а не длина строки. Считалась именно строка, и порог стоял в
     * девять знаков — то есть местный армянский номер из восьми цифр
     * кнопку не включал вовсе, а тот же номер с нулём впереди включал.
     * Сколько цифр в номере какой страны, знает сервер; здесь только
     * отсекается заведомо пустое.
     */
    val phoneDigits = phone.count { it.isDigit() }
    val ready = !busy && name.trim().isNotEmpty() &&
        (!isNew || (phoneDigits >= 8 && pin.length == Api.PIN_LENGTH))

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
                if (isNew) {
                    L(R.string.staff__newTitle, Terms.staff(staffRole(), lang).nom)
                } else {
                    person.name
                },
                onClose = onClose,
            )

            Column(Modifier.fillMaxWidth().sunken()) {
                FieldRow(
                    label = L(R.string.owner__clientName),
                    value = name,
                    onValue = { name = it },
                    placeholder = L(R.string.staff__namePlaceholder),
                )
                if (isNew) {
                    HairLine()
                    FieldRow(
                        label = L(R.string.auth__phone),
                        value = phone,
                        onValue = { phone = it },
                        placeholder = "+374 …",
                        keyboard = KeyboardType.Phone,
                    )
                    HairLine()
                    /*
                     * Шесть цифр, а не четыре. Стояло четыре, и найм не
                     * работал НИКОГДА: сервер требует ровно шесть и отвечал
                     * отказом на каждую попытку. Со стороны это выглядело
                     * как «сервер сломался», потому что форма отправляла
                     * заведомо негодный код и сама об этом не знала.
                     */
                    Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
                        Text(
                            L(R.string.auth__pinShort),
                            fontSize = 12.sp,
                            color = Brand.boardMuted,
                            modifier = Modifier.padding(bottom = 8.dp),
                        )
                        CodeCells(
                            value = pin,
                            onValue = { pin = it },
                            length = Api.PIN_LENGTH,
                            label = L(R.string.auth__pinShort),
                            secure = false,
                        )
                    }
                }
            }

            PercentPicker(
                common = common,
                percent = percent,
                custom = custom,
                customText = customText,
                onPick = {
                    custom = false
                    percent = it
                },
                onCustom = {
                    custom = true
                    customText = percent.toString()
                },
                onCustomText = { raw ->
                    // выше сотни ставка не бывает: работник не может
                    // забирать больше, чем стоит услуга
                    val n = minOf(100, raw.filter { it.isDigit() }.toIntOrNull() ?: 0)
                    percent = n
                    customText = if (raw.isEmpty()) "" else n.toString()
                },
            )

            error?.let {
                Text(
                    it,
                    fontSize = 13.sp,
                    color = Brand.badOnBoard,
                    modifier = Modifier.padding(horizontal = 4.dp),
                )
            }
            if (pinDone) {
                Text(
                    L(R.string.settings__pinResetDone),
                    fontSize = 13.sp,
                    color = Brand.goodOnBoard,
                    modifier = Modifier.padding(horizontal = 4.dp),
                )
            }

            /*
             * Новый код сотруднику.
             *
             * Забытый мойщиком код был тупиком: восстановить по SMS он не
             * может — номер ему заводил владелец, и подтверждённым тот не
             * стал, — а сменить его было нечем. Оставалось отключить
             * человека и завести заново на другой номер, потеряв связь с
             * его историей записей и выплат.
             *
             * Код виден открытым, и это осознанно: владелец придумывает его
             * вслух, стоя рядом с работником, и должен видеть, что набрал.
             */
            if (person != null && !person.isMe && person.role != "owner") {
                if (resettingPin) {
                    Column(
                        Modifier.fillMaxWidth().sunken().padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Text(
                            L(R.string.settings__pinReset),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Brand.boardMuted,
                        )
                        CodeCells(
                            value = newPin,
                            onValue = { newPin = it },
                            length = Api.PIN_LENGTH,
                            label = L(R.string.settings__pinReset),
                            secure = false,
                        )
                        Text(
                            L(R.string.settings__pinResetNote),
                            fontSize = 11.5.sp,
                            color = Brand.boardMuted,
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            QuietButton(
                                L(R.string.common__save),
                                enabled = !busy && newPin.length == Api.PIN_LENGTH,
                            ) {
                                scope.launch {
                                    busy = true
                                    error = try {
                                        session.authed { token ->
                                            graph.api.call(
                                                "staff/${person.id}/pin",
                                                method = "POST",
                                                body = jsonBody { field("pin", newPin) },
                                                token = token,
                                            )
                                        }
                                        resettingPin = false
                                        newPin = ""
                                        pinDone = true
                                        onSaved()
                                        null
                                    } catch (e: ApiException) {
                                        when {
                                            e.reason == "WORKS_ELSEWHERE" || e.code == "FORBIDDEN" ->
                                                L(R.string.settings__pinWorksElsewhere)

                                            e.code == "PIN_WEAK" -> L(R.string.auth__pinTrivial)
                                            else -> com.sevarm.tetr.core.api.Failure.auth(e)
                                        }
                                    } catch (e: Exception) {
                                        L(R.string.payroll__failed)
                                    }
                                    busy = false
                                }
                            }
                            QuietButton(L(R.string.common__cancel)) {
                                resettingPin = false
                                newPin = ""
                            }
                        }
                    }
                } else {
                    ActionRow(
                        icon = Icons.Filled.LockReset,
                        tint = Brand.grape,
                        title = L(R.string.settings__pinReset),
                        note = L(R.string.settings__pinResetNote),
                        enabled = !busy,
                    ) { resettingPin = true }
                }

                ActionRow(
                    icon = Icons.Filled.PersonRemove,
                    tint = Brand.badOnBoard,
                    title = L(R.string.staff__deactivateAction),
                    note = L(R.string.staff__deactivateNote),
                    enabled = !busy,
                ) { firing = true }
            }

            Spacer(Modifier.height(4.dp))
            LimeButton(
                text = L(R.string.common__save),
                enabled = ready,
                loading = busy,
                onClick = {
                    scope.launch {
                        busy = true
                        error = try {
                            session.authed { token ->
                                if (person != null) {
                                    graph.api.call(
                                        "staff/${person.id}",
                                        method = "PATCH",
                                        body = jsonBody {
                                            field("name", name.trim())
                                            field("percent", percent)
                                        },
                                        token = token,
                                    )
                                } else {
                                    graph.api.call(
                                        "staff",
                                        method = "POST",
                                        body = jsonBody {
                                            field("name", name.trim())
                                            field("phone", phone.trim())
                                            field("pin", pin)
                                            field("percent", percent)
                                        },
                                        token = token,
                                    )
                                }
                            }
                            null
                        } catch (e: ApiException) {
                            /*
                             * Отказ называется своим именем там, где человек
                             * может его исправить: номер занят, код слишком
                             * простой, номер не похож на номер. Общий
                             * «ошибка BAD_REQUEST» на форме, где три поля,
                             * не говорит, какое из них переписать.
                             */
                            when {
                                e.code == "PHONE_TAKEN" -> L(R.string.auth__phoneTaken)
                                e.reason == "TRIVIAL_PIN" || e.reason == "BAD_PIN" ->
                                    L(R.string.auth__pinTrivial)

                                e.reason == "BAD_PHONE" -> L(R.string.auth__wrongCredentials)
                                e.code == "TOO_MANY_TRIES" -> L(R.string.auth__throttled)
                                else -> com.sevarm.tetr.core.api.Failure.auth(e)
                            }
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

    if (firing && person != null) {
        AlertDialog(
            onDismissRequest = { firing = false },
            containerColor = Brand.boardSurface,
            title = { Text(L(R.string.staff__deactivateTitle), color = Brand.onBoard) },
            // это не косметика: увольнение гасит его сессии, и человек
            // теряет доступ немедленно
            text = { Text(L(R.string.staff__deactivateNote), color = Brand.boardMuted) },
            confirmButton = {
                TextButton(onClick = {
                    firing = false
                    scope.launch {
                        runCatching {
                            session.authed { token ->
                                graph.api.call("staff/${person.id}", method = "DELETE", token = token)
                            }
                        }
                        onSaved()
                        onClose()
                    }
                }) { Text(L(R.string.staff__deactivate), color = Brand.badOnBoard) }
            },
            dismissButton = {
                TextButton(onClick = { firing = false }) {
                    Text(L(R.string.common__cancel), color = Brand.boardMuted)
                }
            },
        )
    }
}

/**
 * Ставка — фишками.
 *
 * Выбранная заливается лаймом. Последняя фишка — «своё»: она открывает
 * поле, но не заменяет собой готовые значения, потому что в девяти случаях
 * из десяти ставка одна из этих четырёх.
 */
@Composable
private fun PercentPicker(
    common: List<Int>,
    percent: Int,
    custom: Boolean,
    customText: String,
    onPick: (Int) -> Unit,
    onCustom: () -> Unit,
    onCustomText: (String) -> Unit,
) {
    Column(
        Modifier.fillMaxWidth().sunken().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            L(R.string.staff__percentField),
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            color = Brand.boardMuted,
        )

        FlowRowLayout {
            common.forEach { value ->
                LimeChip("$value%", !custom && percent == value) { onPick(value) }
            }
            LimeChip(L(R.string.common__other), custom, onClick = onCustom)
        }

        if (custom) {
            Column(Modifier.fillMaxWidth().sunken(18.dp)) {
                FieldRow(
                    label = "%",
                    value = customText,
                    onValue = onCustomText,
                    placeholder = "40",
                    keyboard = KeyboardType.Number,
                )
            }
        }

        Text(
            L(R.string.staff__percentNote),
            fontSize = 11.5.sp,
            color = Brand.boardMuted,
        )
    }
}

@Composable
private fun ActionRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    tint: Color,
    title: String,
    note: String,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .sunken()
            .pressable(enabled = enabled, onClick = onClick)
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(17.dp))
        Column {
            Text(title, fontSize = 14.5.sp, fontWeight = FontWeight.SemiBold, color = tint)
            Text(note, fontSize = 11.5.sp, color = Brand.boardMuted)
        }
    }
}

/**
 * Общий процент команды за совместную работу.
 *
 * ЧТО ЗДЕСЬ ГЛАВНОЕ. Не поле ввода, а пример под ним. Число «50» само по
 * себе двусмысленно ровно в том месте, где ошибка стоит дороже всего:
 * владелец, решивший, что ставит 50 % каждому из троих, поставит 17 и
 * будет платить втрое меньше, чем собирался; понявший наоборот — втрое
 * больше. Определение эту разницу объясняет, но определения пролистывают,
 * а пример с числами читают. Поэтому пример живой: он пересчитывается,
 * пока человек набирает процент, и показывает ровно то, что произойдёт.
 *
 * Пустое поле выключает свойство: мойщику совместная работа перестаёт
 * предлагаться. Ноль этого НЕ делает — ноль означает «мойте вместе,
 * доплаты нет», и это настоящий, хоть и редкий, выбор владельца.
 *
 * Считает всё `Crew` — тот же код, которым доли посчитает экран записи, и
 * то же правило, что на сервере. Своя формула здесь разошлась бы с
 * настоящей на первом же остатке от деления.
 */
@Composable
private fun TeamWashEditor(onClose: () -> Unit) {
    val graph = LocalGraph.current
    val session = graph.session
    val scope = rememberCoroutineScope()
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = false)
    val saved by session.teamPercent.collectAsState()
    var text by remember { mutableStateOf(saved?.toString().orEmpty()) }
    var busy by remember { mutableStateOf(false) }
    var failure by remember { mutableStateOf<String?>(null) }

    /* Числа примера. Круглые нарочно: пример объясняет правило, а не
       показывает случай из жизни. */
    val examplePrice = 10_000
    val examplePeople = 2

    /** Пусто — выключить свойство. Ноль — настоящий ноль. */
    val asked: Int? = text.filter { it.isDigit() }.toIntOrNull()?.coerceAtMost(100)

    ModalBottomSheet(
        onDismissRequest = onClose,
        sheetState = sheet,
        containerColor = Brand.board,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .imePadding()
                .padding(horizontal = 16.dp)
                .padding(bottom = Insets.bottom.calculateBottomPadding() + 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            SheetHeader(L(R.string.crew__title), onClose = onClose)

            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(22.dp))
                    .background(Brand.boardInk.copy(alpha = 0.07f))
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                FieldRow(
                    label = L(R.string.crew__percentLabel),
                    value = text,
                    onValue = { raw ->
                        val clean = raw.filter { it.isDigit() }.take(3)
                        text = clean.toIntOrNull()?.coerceAtMost(100)?.toString() ?: clean
                    },
                    placeholder = L(R.string.crew__off),
                    keyboard = KeyboardType.Number,
                    modifier = Modifier
                        .clip(RoundedCornerShape(18.dp))
                        .background(Brand.boardInk.copy(alpha = 0.07f)),
                )

                Text(
                    L(R.string.crew__percentHint),
                    fontSize = 11.5.sp,
                    color = Brand.boardMuted,
                )

                /*
                 * Что произойдёт после сохранения — до нажатия, числами.
                 * Здесь и разрешается двусмысленность процента: видно, что
                 * пятьдесят на двоих дают по четверти цены каждому.
                 */
                val example = asked?.let { percent ->
                    val each = CrewMath.split(CrewMath.pool(examplePrice, percent), examplePeople)
                        .firstOrNull() ?: 0
                    L(
                        R.string.crew__example,
                        money(examplePrice),
                        percent,
                        staffCount(examplePeople),
                        money(each),
                    )
                } ?: L(R.string.crew__offNote)

                Text(
                    example,
                    fontSize = 12.5.sp,
                    fontWeight = FontWeight.Medium,
                    color = if (asked == null) Brand.boardMuted else Brand.goodOnBoard,
                )

                failure?.let {
                    Text(it, fontSize = 12.5.sp, color = Brand.badOnBoard)
                }
            }

            LimeButton(
                text = L(R.string.common__save),
                modifier = Modifier.fillMaxWidth(),
                loading = busy,
                enabled = !busy,
            ) {
                scope.launch {
                    busy = true
                    failure = null
                    val ok = runCatching {
                        session.authed { token ->
                            graph.api.call(
                                "team",
                                method = "PUT",
                                /*
                                 * Пусто и ноль — разные ответы, и `null`
                                 * отличает первое от второго: «выключить»
                                 * против «мойте вместе бесплатно».
                                 */
                                body = jsonBody {
                                    if (asked == null) nullField("percent") else field("percent", asked)
                                },
                                token = token,
                            )
                        }
                    }.isSuccess
                    busy = false
                    if (!ok) {
                        failure = L(R.string.errors__generic)
                        return@launch
                    }
                    /*
                     * Перечитываем bootstrap: от этого числа зависит,
                     * покажет ли экран записи выбор «кто мыл», и узнать об
                     * этом он должен сразу.
                     */
                    runCatching { session.loadBootstrap() }
                    onClose()
                }
            }
        }
    }
}
