package com.sevarm.tetr.feature.profile

import androidx.appcompat.app.AppCompatActivity
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Image
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.TextButton
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sevarm.tetr.LocalGraph
import com.sevarm.tetr.R
import com.sevarm.tetr.core.api.Api
import com.sevarm.tetr.core.api.Failure
import com.sevarm.tetr.core.api.field
import com.sevarm.tetr.core.api.jsonBody
import com.sevarm.tetr.core.i18n.L
import com.sevarm.tetr.core.i18n.Lang
import com.sevarm.tetr.core.i18n.LocalLang
import com.sevarm.tetr.core.phone.Countries
import com.sevarm.tetr.core.ui.tenant
import com.sevarm.tetr.design.Brand
import com.sevarm.tetr.design.Caption
import com.sevarm.tetr.design.CodeCells
import com.sevarm.tetr.design.CountryPhoneField
import com.sevarm.tetr.design.FieldRow
import com.sevarm.tetr.design.HairLine
import com.sevarm.tetr.design.Insets
import com.sevarm.tetr.design.LimeButton
import com.sevarm.tetr.design.Palette
import com.sevarm.tetr.design.QuietButton
import com.sevarm.tetr.design.ScreenHeader
import com.sevarm.tetr.design.SheetHeader
import com.sevarm.tetr.design.reduceMotion
import com.sevarm.tetr.design.pressable
import com.sevarm.tetr.design.sunken
import com.sevarm.tetr.design.surfaceCard
import com.sevarm.tetr.feature.expired.share
import kotlinx.coroutines.launch

/**
 * Профиль: человек, его вход и его бизнес.
 *
 * Разделён на три коробки, и разрыв между ними и есть ответ на вопрос
 * «что тут про меня, что про мой вход, а что про бизнес». Опасное —
 * удаление — стоит последним и отделено от всего: рядом с ним не должно
 * оказаться ничего, что нажимают часто.
 */
@Composable
fun ProfileScreen(
    activity: AppCompatActivity,
    onBack: () -> Unit,
    onDevices: () -> Unit,
) {
    val graph = LocalGraph.current
    val session = graph.session
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val me by session.me.collectAsState()
    val tenant = tenant()
    val remember_ by session.rememberLogin.collectAsState()
    val lockEnabled by graph.lock.enabled.collectAsState()
    val lang = LocalLang.current

    var name by remember(me?.id) { mutableStateOf(me?.name.orEmpty()) }
    var businessName by remember(tenant?.id) { mutableStateOf(tenant?.name.orEmpty()) }
    var savingProfile by remember { mutableStateOf(false) }
    var savedNote by remember { mutableStateOf(false) }
    /*
     * Не сохранилось — и об этом надо сказать.
     *
     * Раньше «Сохранено» загоралось после любой попытки, включая
     * оборвавшуюся: человек видел зелёную строку, уходил с экрана, и его
     * имя оставалось прежним. Это хуже молчания — молчание заставляет
     * проверить, а ложное подтверждение отменяет саму мысль проверять.
     */
    var saveFailed by remember { mutableStateOf(false) }
    var exporting by remember { mutableStateOf(false) }

    var changingPin by remember { mutableStateOf(false) }
    var verifyingPhone by remember { mutableStateOf(false) }
    var changingPhone by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    var langOpen by remember { mutableStateOf(false) }

    val isOwner = me?.isOwner == true

    Column(
        Modifier
            .fillMaxSize()
            .background(Brand.board)
            .padding(top = Insets.top.calculateTopPadding()),
    ) {
        ScreenHeader(L(R.string.more__profileLead), onBack = onBack)

        Column(
            Modifier
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(horizontal = 12.dp)
                .padding(bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            /*
             * Лицо, а не квадратик с буквой.
             *
             * Квадратик с инициалом отвечает на вопрос «чья это строка» в
             * списке, где строк двадцать. В профиле строка одна, различать
             * её не с чем, и лицо кабинета выглядело ячейкой таблицы.
             *
             * Своих карточек у людей пока нет, вместо них общий снимок:
             * фиолетовый шёлк с лаймовой полосой света. Ни знака, ни буквы —
             * заглушка стоит на месте чужого лица и ничего о человеке не
             * утверждает. Появятся свои карточки, подменится только адрес
             * картинки.
             *
             * Нажатием, а не оттяжкой: жест раскрытия в Android живёт у
             * системных панелей, и заводить свой в глубине экрана значит
             * спорить с ним за то же движение.
             */
            var photoOpen by remember { mutableStateOf(false) }
            val height by animateDpAsState(
                targetValue = if (photoOpen) 260.dp else 64.dp,
                animationSpec = if (reduceMotion()) snap() else spring(dampingRatio = 0.84f),
                label = "photo",
            )

            Row(
                Modifier.fillMaxWidth().padding(top = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Box(
                    Modifier
                        .then(
                            if (photoOpen) Modifier.fillMaxWidth() else Modifier.size(64.dp)
                        )
                        .height(height)
                        .clip(if (photoOpen) RoundedCornerShape(24.dp) else CircleShape)
                        .pressable(onClick = { photoOpen = !photoOpen }),
                ) {
                    Image(
                        painter = painterResource(R.drawable.avatar),
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                    )
                }

                /*
                 * Раскрытому снимку имя рядом не нужно: оно стоит строкой
                 * ниже, в поле, которое человек и правит.
                 */
                if (!photoOpen) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            me?.name.orEmpty(),
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold,
                            color = Brand.onBoard,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        /*
                         * Номер и мойка одной строкой. Номер первым: он про
                         * человека, мойка — про место, и человек здесь
                         * главный.
                         */
                        Text(
                            listOf(me?.phone.orEmpty(), tenant?.name.orEmpty())
                                .filter { it.isNotEmpty() }
                                .joinToString(" · "),
                            fontSize = 13.sp,
                            color = Brand.boardMuted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }

            Column(Modifier.fillMaxWidth().sunken()) {
                FieldRow(
                    label = L(R.string.owner__clientName),
                    value = name,
                    onValue = {
                        name = it
                        savedNote = false
                        saveFailed = false
                    },
                    placeholder = L(R.string.staff__namePlaceholder),
                )
                /*
                 * Название бизнеса правит только владелец: у мойщика поле
                 * было бы кнопкой, на которую сервер отвечает отказом.
                 */
                if (isOwner) {
                    HairLine()
                    FieldRow(
                        label = L(R.string.settings__business),
                        value = businessName,
                        onValue = {
                            businessName = it
                            savedNote = false
                        saveFailed = false
                        },
                        placeholder = L(R.string.auth__namePlaceholder),
                    )
                }
            }

            if (savedNote) {
                Text(
                    L(R.string.settings__saved),
                    fontSize = 13.sp,
                    color = Brand.goodOnBoard,
                    modifier = Modifier.padding(horizontal = 6.dp),
                )
            }
            if (saveFailed) {
                Text(
                    L(R.string.common__failed),
                    fontSize = 13.sp,
                    color = Brand.warnOnBoard,
                    modifier = Modifier.padding(horizontal = 6.dp),
                )
            }

            LimeButton(
                text = L(R.string.common__save),
                enabled = !savingProfile && name.trim().isNotEmpty(),
                loading = savingProfile,
                onClick = {
                    scope.launch {
                        savingProfile = true
                        saveFailed = false
                        val ok = runCatching {
                            session.saveProfile(
                                name = name.trim(),
                                businessName = if (isOwner) businessName.trim() else null,
                            )
                        }.isSuccess
                        savingProfile = false
                        savedNote = ok
                        saveFailed = !ok
                    }
                },
            )

            // ── вход ─────────────────────────────────────────────
            Caption(L(R.string.auth__signIn))
            Column(Modifier.fillMaxWidth().surfaceCard(20.dp)) {
                /*
                 * «Задать код», а не «сменить», у тех, у кого его нет: они
                 * завели мойку по коду из SMS, и текущий у них спрашивать
                 * нечего. Признак приходит с сервера — присланный
                 * приложением был бы способом сменить чужой код, не зная
                 * старого.
                 */
                Row_(
                    icon = Icons.Filled.Lock,
                    title = if (session.hasPin) {
                        L(R.string.auth__changePin)
                    } else {
                        L(R.string.auth__setPin)
                    },
                    note = if (session.hasPin) {
                        L(R.string.profile__pinNote)
                    } else {
                        L(R.string.auth__pinNoneNote)
                    },
                ) { changingPin = true }

                /*
                 * Подтверждение номера предлагается только тем, у кого он
                 * не доказан: показать это тому, у кого всё в порядке,
                 * хуже, чем не показать однажды.
                 */
                if (!session.phoneVerified) {
                    HairLine(inset = 54.dp)
                    Row_(
                        icon = Icons.Filled.VerifiedUser,
                        title = L(R.string.auth__verifyPhone),
                        note = L(R.string.auth__verifyPhoneWhy),
                    ) { verifyingPhone = true }
                }

                HairLine(inset = 54.dp)
                Row_(
                    icon = Icons.Filled.PhoneAndroid,
                    title = L(R.string.auth__changePhone),
                    note = L(R.string.auth__changePhoneNote),
                ) { changingPhone = true }

                HairLine(inset = 54.dp)
                Row_(
                    icon = Icons.Filled.PhoneAndroid,
                    title = L(R.string.profile__devices),
                    note = L(R.string.profile__devicesNote),
                ) { onDevices() }
            }

            // ── настройки ────────────────────────────────────────
            Column(Modifier.fillMaxWidth().surfaceCard(20.dp)) {
                Box {
                    Row_(
                        icon = Icons.Filled.Language,
                        title = L(R.string.common__language),
                        note = lang.ownName,
                    ) { langOpen = true }
                    DropdownMenu(expanded = langOpen, onDismissRequest = { langOpen = false }) {
                        Lang.entries.forEach { option ->
                            DropdownMenuItem(
                                text = {
                                    Text(
                                        option.ownName,
                                        fontWeight = if (option == lang) {
                                            FontWeight.Bold
                                        } else {
                                            FontWeight.Normal
                                        },
                                    )
                                },
                                onClick = {
                                    graph.langStore.set(option)
                                    langOpen = false
                                },
                            )
                        }
                    }
                }

                HairLine(inset = 54.dp)
                ToggleRow(
                    title = L(R.string.lock__unlock),
                    note = L(R.string.profile__lockNote),
                    checked = lockEnabled,
                    onChange = { graph.lock.setEnabled(it) },
                )

                HairLine(inset = 54.dp)
                /*
                 * Быстрый возврат выключен по умолчанию: телефон на мойке
                 * нередко общий, а сохранённый вход возвращает в кабинет
                 * одним касанием. Включает это человек сам.
                 */
                ToggleRow(
                    title = L(R.string.profile__rememberLogin),
                    note = L(R.string.profile__rememberNote),
                    checked = remember_,
                    onChange = { session.setRememberLogin(it) },
                )

                /*
                 * Уведомление о каждой записи — только владельцу: мойщику
                 * они не приходят вовсе. Об открытии смены сообщаем всегда,
                 * это событие редкое и как раз то, ради чего уведомления
                 * заводились.
                 */
                if (isOwner) {
                    HairLine(inset = 54.dp)
                    var notify by remember(me?.id) { mutableStateOf(me?.notifyOrders ?: true) }
                    ToggleRow(
                        title = L(R.string.profile__pushEveryCar),
                        note = L(R.string.profile__pushShiftNote),
                        checked = notify,
                        onChange = { on ->
                            notify = on
                            scope.launch {
                                runCatching {
                                    session.authed { token ->
                                        graph.api.call(
                                            "push/settings",
                                            method = "POST",
                                            body = jsonBody { field("orders", on) },
                                            token = token,
                                        )
                                    }
                                }
                            }
                        },
                    )
                }
            }

            // ── бизнес ───────────────────────────────────────────
            if (isOwner) {
                Column(Modifier.fillMaxWidth().surfaceCard(20.dp)) {
                    Row_(
                        icon = Icons.Filled.Download,
                        title = L(R.string.billing__wallDownload),
                        note = if (exporting) L(R.string.common__preparing) else null,
                    ) {
                        scope.launch {
                            exporting = true
                            val file = exportCsv(context, graph, days = "all")
                            exporting = false
                            file?.let { share(context, it) }
                        }
                    }
                }
            }

            /*
             * Выхода здесь больше нет: он переехал в «Ավելին» последней
             * строкой. Профиль — это анкета и настройки себя, и человек,
             * которому надо выйти, в анкету не идёт. К тому же выход стоял
             * вплотную к удалению бизнеса, и два необратимых на вид
             * действия соседями — плохая пара.
             *
             * Удаление бизнеса — последним и отдельно от всего. Рядом с ним
             * не должно оказаться ничего, что нажимают часто.
             */
            if (isOwner) {
                Spacer(Modifier.height(18.dp))
                Text(
                    L(R.string.billing__wallDelete),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Brand.badOnBoard,
                    modifier = Modifier
                        .pressable { deleting = true }
                        .padding(vertical = 8.dp, horizontal = 6.dp),
                )
                Text(
                    L(R.string.profile__deleteNote),
                    fontSize = 11.5.sp,
                    color = Brand.boardMuted,
                    modifier = Modifier.padding(horizontal = 6.dp),
                )
            }
        }
    }

    if (changingPin) PinChangeSheet { changingPin = false }
    if (verifyingPhone) VerifyPhoneSheet { verifyingPhone = false }
    if (changingPhone) ChangePhoneSheet { changingPhone = false }
    if (deleting) DeleteBusinessSheet { deleting = false }
}

@Composable
private fun Row_(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    note: String?,
    onClick: () -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .pressable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(icon, contentDescription = null, tint = Brand.grape, modifier = Modifier.size(20.dp))
        Column(Modifier.weight(1f)) {
            Text(title, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Brand.onBoard)
            if (!note.isNullOrEmpty()) {
                Text(note, fontSize = 11.5.sp, color = Brand.boardMuted)
            }
        }
        Icon(
            Icons.AutoMirrored.Filled.KeyboardArrowRight,
            contentDescription = null,
            tint = Brand.boardMuted,
            modifier = Modifier.size(15.dp),
        )
    }
}

@Composable
private fun ToggleRow(title: String, note: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Brand.onBoard)
            Text(note, fontSize = 11.5.sp, color = Brand.boardMuted)
        }
        Switch(
            checked = checked,
            onCheckedChange = onChange,
            colors = SwitchDefaults.colors(
                checkedTrackColor = Brand.grape,
                checkedThumbColor = Color.White,
                checkedBorderColor = Brand.grape,
                uncheckedTrackColor = Brand.boardInk.copy(alpha = 0.14f),
                uncheckedThumbColor = Brand.boardSurface,
                uncheckedBorderColor = Brand.boardInk.copy(alpha = 0.32f),
            ),
        )
    }
}

/**
 * Смена кода — и задание его впервые, если кода не было.
 *
 * Сервер гасит все сессии — в этом смысл смены — и тут же выдаёт новую
 * пару на это устройство. Иначе человек, сменивший код, сам бы и вылетел
 * из приложения, а вышвырнуть надо было остальных.
 *
 * Повтор сервер не спрашивает: он проверяется здесь, до отправки. Опечатка
 * в единственном поле означала бы новый код, которого человек не знает.
 */
@Composable
private fun PinChangeSheet(onClose: () -> Unit) {
    val graph = LocalGraph.current
    val session = graph.session
    val scope = rememberCoroutineScope()
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val hasPin = session.hasPin

    var current by remember { mutableStateOf("") }
    var next by remember { mutableStateOf("") }
    var repeat by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var done by remember { mutableStateOf(false) }
    /** Человек нажал «удалить» и ещё не подтвердил. */
    var confirmingDelete by remember { mutableStateOf(false) }

    val mismatch = repeat.isNotEmpty() && repeat.length >= next.length && next != repeat
    val ready = !busy && next.length == Api.PIN_LENGTH && next == repeat &&
        (!hasPin || current.length >= Api.PIN_MIN_LENGTH)

    ModalBottomSheet(onDismissRequest = onClose, sheetState = sheet, containerColor = Brand.board) {
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
                if (hasPin) L(R.string.auth__changePin) else L(R.string.auth__setPin),
                onClose = onClose,
            )

            if (done) {
                Text(
                    L(R.string.profile__pinChangedNote),
                    fontSize = 14.5.sp,
                    color = Brand.goodOnBoard,
                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 20.dp),
                )
                LimeButton(text = L(R.string.common__close), onClick = onClose)
                return@Column
            }

            if (hasPin) {
                Caption(L(R.string.auth__currentPin))
                CodeCells(
                    value = current,
                    onValue = { current = it },
                    length = Api.PIN_LENGTH,
                    label = L(R.string.auth__currentPin),
                    secure = true,
                    contentType = ContentType.Password,
                )
            }

            Caption(L(R.string.auth__newPin))
            CodeCells(
                value = next,
                onValue = { next = it },
                length = Api.PIN_LENGTH,
                label = L(R.string.auth__newPin),
                secure = true,
                contentType = ContentType.NewPassword,
            )

            Caption(L(R.string.common__retry))
            CodeCells(
                value = repeat,
                onValue = { repeat = it },
                length = Api.PIN_LENGTH,
                label = L(R.string.common__retry),
                secure = true,
                contentType = ContentType.NewPassword,
            )

            val message = when {
                mismatch -> L(R.string.auth__pinMismatch)
                else -> error
            }
            message?.let {
                Text(
                    it,
                    fontSize = 13.sp,
                    color = Brand.badOnBoard,
                    modifier = Modifier.padding(horizontal = 6.dp),
                )
            }

            Text(
                L(R.string.auth__pinMemo),
                fontSize = 11.5.sp,
                color = Brand.boardMuted,
                modifier = Modifier.padding(horizontal = 6.dp),
            )

            LimeButton(
                text = L(R.string.common__save),
                enabled = ready,
                loading = busy,
                onClick = {
                    scope.launch {
                        busy = true
                        error = try {
                            session.changePin(current, next)
                            done = true
                            null
                        } catch (e: Exception) {
                            Failure.auth(e)
                        }
                        busy = false
                    }
                },
            )

            /*
             * Удаление — отдельным разделом внизу и только когда есть что
             * удалять. Красным и с переспросом: действие необратимое в том
             * смысле, что новый код придётся придумывать заново. Текущий
             * код для него уже введён выше, второго поля не заводим.
             */
            if (hasPin) {
                Spacer(Modifier.height(14.dp))
                Text(
                    L(R.string.auth__deleteAccessCode),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = if (current.length >= Api.PIN_MIN_LENGTH && !busy) {
                        Brand.badOnBoard
                    } else {
                        Brand.boardMuted
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .pressable(
                            enabled = current.length >= Api.PIN_MIN_LENGTH && !busy,
                            onClick = { confirmingDelete = true },
                        )
                        .padding(vertical = 10.dp),
                    textAlign = TextAlign.Center,
                )
                Text(
                    L(R.string.auth__deleteAccessCodeNote),
                    fontSize = 11.5.sp,
                    color = Brand.boardMuted,
                    modifier = Modifier.padding(horizontal = 6.dp),
                )
            }
        }
    }

    if (confirmingDelete) {
        AlertDialog(
            onDismissRequest = { confirmingDelete = false },
            containerColor = Brand.boardSurface,
            title = { Text(L(R.string.auth__deleteAccessCodeAsk), color = Brand.onBoard) },
            text = { Text(L(R.string.auth__deleteAccessCodeNote), color = Brand.boardMuted) },
            confirmButton = {
                TextButton(onClick = {
                    confirmingDelete = false
                    scope.launch {
                        busy = true
                        error = try {
                            session.deletePin(current)
                            done = true
                            null
                        } catch (e: Exception) {
                            Failure.auth(e)
                        }
                        busy = false
                    }
                }) { Text(L(R.string.auth__deleteAccessCode), color = Brand.badOnBoard) }
            },
            dismissButton = {
                TextButton(onClick = { confirmingDelete = false }) {
                    Text(L(R.string.common__cancel), color = Brand.boardMuted)
                }
            },
        )
    }
}

/**
 * Подтвердить свой номер.
 *
 * Восстановить доступ по SMS можно только по подтверждённому номеру: иначе
 * восстановление само стало бы способом забрать чужой непроверенный
 * аккаунт. У тех, кому аккаунт завёл владелец, номер не подтверждён, и
 * пока это так, забытый код для них тупик.
 *
 * Номер берётся из аккаунта, а не из формы: присланный означал бы, что
 * подтвердить можно что угодно.
 */
@Composable
private fun VerifyPhoneSheet(onClose: () -> Unit) {
    val session = LocalGraph.current.session
    val scope = rememberCoroutineScope()
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    var challengeId by remember { mutableStateOf<String?>(null) }
    var sentTo by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    ModalBottomSheet(onDismissRequest = onClose, sheetState = sheet, containerColor = Brand.board) {
        Column(
            Modifier
                .fillMaxWidth()
                .imePadding()
                .padding(horizontal = 12.dp)
                .padding(bottom = Insets.bottom.calculateBottomPadding() + 12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            SheetHeader(L(R.string.auth__verifyPhone), onClose = onClose)

            Text(
                L(R.string.auth__verifyPhoneWhy),
                fontSize = 14.5.sp,
                color = Brand.boardMuted,
                modifier = Modifier.padding(horizontal = 6.dp),
            )

            val id = challengeId
            if (id != null) {
                Caption(L(R.string.auth__otpCode))
                CodeCells(
                    value = code,
                    onValue = { value ->
                        code = value
                        if (value.length == Api.CODE_LENGTH && !busy) {
                            scope.launch {
                                busy = true
                                error = try {
                                    session.confirmPhone(id, value)
                                    onClose()
                                    null
                                } catch (e: Exception) {
                                    code = ""
                                    Failure.auth(e)
                                }
                                busy = false
                            }
                        }
                    },
                    length = Api.CODE_LENGTH,
                    label = L(R.string.auth__otpCode),
                    contentType = ContentType.SmsOtpCode,
                )
                Text(
                    L(R.string.auth__otpSent, sentTo),
                    fontSize = 12.sp,
                    color = Brand.boardMuted,
                    modifier = Modifier.padding(horizontal = 6.dp),
                )
            }

            error?.let {
                Text(
                    it,
                    fontSize = 13.sp,
                    color = Brand.badOnBoard,
                    modifier = Modifier.padding(horizontal = 6.dp),
                )
            }

            LimeButton(
                text = if (id == null) {
                    L(R.string.auth__verifyPhoneSend)
                } else {
                    L(R.string.auth__otpVerify)
                },
                enabled = !busy && (id == null || code.length == Api.CODE_LENGTH),
                loading = busy,
                onClick = {
                    scope.launch {
                        busy = true
                        error = try {
                            if (id == null) {
                                val started = session.startPhoneProof()
                                challengeId = started.challengeId
                                sentTo = started.phone.orEmpty()
                            } else {
                                session.confirmPhone(id, code)
                                onClose()
                            }
                            null
                        } catch (e: Exception) {
                            Failure.auth(e)
                        }
                        busy = false
                    }
                },
            )
        }
    }
}

/**
 * Смена номера телефона — три шага, и первый не у всех.
 *
 * Номер это логин, поэтому доказательств два и оба обязательные: кто ты
 * (код, а у кого его нет — код на текущий номер) и что новый номер твой
 * (код на него). Правила считает сервер тем же кодом, которым живёт
 * кабинет: приложение только спрашивает и показывает.
 */
@Composable
private fun ChangePhoneSheet(onClose: () -> Unit) {
    val session = LocalGraph.current.session
    val scope = rememberCoroutineScope()
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    val hasPin = session.hasPin

    var country by remember { mutableStateOf(Countries.default) }
    var phone by remember { mutableStateOf("") }
    var pin by remember { mutableStateOf("") }
    var proofId by remember { mutableStateOf("") }
    var proofCode by remember { mutableStateOf("") }
    var proofSentTo by remember { mutableStateOf("") }
    var challengeId by remember { mutableStateOf<String?>(null) }
    var code by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var done by remember { mutableStateOf(false) }

    ModalBottomSheet(onDismissRequest = onClose, sheetState = sheet, containerColor = Brand.board) {
        Column(
            Modifier
                .fillMaxWidth()
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 12.dp)
                .padding(bottom = Insets.bottom.calculateBottomPadding() + 12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            SheetHeader(L(R.string.auth__changePhone), onClose = onClose)

            if (done) {
                /*
                 * Сессию здесь НЕ гасим сразу, хотя на сервере она уже
                 * мертва: выход мгновенно подменил бы всё дерево видов
                 * входом, и лист со словами «номер изменён» исчез бы вместе
                 * с профилем, который его показывал. Человек видел бы, что
                 * его выкинуло, и не знал бы, почему.
                 */
                Text(
                    L(R.string.auth__changePhoneDone),
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = Brand.onBoard,
                    modifier = Modifier.padding(horizontal = 6.dp),
                )
                Text(
                    L(R.string.auth__changePhoneDoneNote),
                    fontSize = 14.sp,
                    color = Brand.boardMuted,
                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 8.dp),
                )
                LimeButton(text = L(R.string.auth__signOut)) {
                    session.leaveAfterPhoneChange()
                }
                return@Column
            }

            Text(
                L(R.string.auth__changePhoneNote),
                fontSize = 14.sp,
                color = Brand.boardMuted,
                modifier = Modifier.padding(horizontal = 6.dp),
            )

            val id = challengeId
            when {
                id != null -> {
                    Caption(L(R.string.auth__otpCode))
                    CodeCells(
                        value = code,
                        onValue = { code = it },
                        length = Api.CODE_LENGTH,
                        label = L(R.string.auth__otpCode),
                        contentType = ContentType.SmsOtpCode,
                    )
                }

                else -> {
                    Caption(L(R.string.auth__changePhoneNew))
                    Column(Modifier.fillMaxWidth().sunken().padding(horizontal = 16.dp, vertical = 12.dp)) {
                        CountryPhoneField(
                            country = country,
                            onCountry = { country = it },
                            number = phone,
                            onNumber = { phone = it },
                        )
                    }

                    /*
                     * Чем доказывают себя: код у тех, у кого он есть, и код
                     * на текущий номер у заведённых по SMS. Решает сервер по
                     * состоянию аккаунта, а не приложение.
                     */
                    if (hasPin) {
                        Caption(L(R.string.auth__pinField))
                        CodeCells(
                            value = pin,
                            onValue = { pin = it },
                            length = Api.PIN_LENGTH,
                            label = L(R.string.auth__pin),
                            secure = true,
                            contentType = ContentType.Password,
                        )
                    } else if (proofId.isEmpty()) {
                        QuietButton(
                            text = L(R.string.auth__changePhoneProof),
                            enabled = !busy,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            scope.launch {
                                busy = true
                                error = try {
                                    val started = session.startPhoneChangeProof()
                                    proofId = started.proofId
                                    proofSentTo = started.phone.orEmpty()
                                    null
                                } catch (e: Exception) {
                                    Failure.auth(e)
                                }
                                busy = false
                            }
                        }
                    } else {
                        Caption(L(R.string.auth__otpSent, proofSentTo))
                        CodeCells(
                            value = proofCode,
                            onValue = { proofCode = it },
                            length = Api.CODE_LENGTH,
                            label = L(R.string.auth__otpCode),
                            contentType = ContentType.SmsOtpCode,
                        )
                    }
                }
            }

            error?.let {
                Text(
                    it,
                    fontSize = 13.sp,
                    color = Brand.badOnBoard,
                    modifier = Modifier.padding(horizontal = 6.dp),
                )
            }

            val canSend = when {
                id != null -> code.length == Api.CODE_LENGTH
                phone.isBlank() -> false
                hasPin -> pin.length >= Api.PIN_MIN_LENGTH
                else -> proofId.isNotEmpty() && proofCode.length == Api.CODE_LENGTH
            }

            LimeButton(
                text = if (id == null) L(R.string.common__next) else L(R.string.auth__otpVerify),
                enabled = !busy && canSend,
                loading = busy,
                onClick = {
                    scope.launch {
                        busy = true
                        error = try {
                            if (id == null) {
                                val started = session.startPhoneChange(
                                    phone = country.e164(phone),
                                    pin = pin,
                                    proofId = proofId,
                                    proofCode = proofCode,
                                )
                                challengeId = started.challengeId
                            } else {
                                session.finishPhoneChange(id, code)
                                done = true
                            }
                            null
                        } catch (e: Exception) {
                            code = ""
                            Failure.auth(e)
                        }
                        busy = false
                    }
                },
            )
        }
    }
}
