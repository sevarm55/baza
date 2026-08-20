package com.sevarm.tetr.feature.login

import androidx.appcompat.app.AppCompatActivity
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
import androidx.compose.material.icons.filled.Language
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
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
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sevarm.tetr.LocalGraph
import com.sevarm.tetr.R
import com.sevarm.tetr.core.api.Api
import com.sevarm.tetr.core.i18n.L
import com.sevarm.tetr.core.i18n.Lang
import com.sevarm.tetr.core.i18n.LocalLang
import com.sevarm.tetr.core.session.RememberedAccount
import com.sevarm.tetr.core.ui.graphViewModel
import com.sevarm.tetr.design.Brand
import com.sevarm.tetr.design.CodeCells
import com.sevarm.tetr.design.CountryPhoneField
import com.sevarm.tetr.design.Insets
import com.sevarm.tetr.design.LimeButton
import com.sevarm.tetr.design.Palette
import com.sevarm.tetr.design.QuietButton
import com.sevarm.tetr.design.TetrLoader
import com.sevarm.tetr.design.Wordmark
import com.sevarm.tetr.design.pressable
import kotlinx.coroutines.launch
import java.time.Instant
import kotlinx.coroutines.delay

/**
 * Экран входа.
 *
 * Стоит на грейпе, и он тёмный при любой теме телефона: иначе строка
 * состояния становится чёрной на тёмно-фиолетовом.
 *
 * ПРО ПРАВИЛА МАГАЗИНОВ. Здесь нет ни цены, ни срока, ни слова
 * «бесплатно», ни ссылки на оплату — и на стене «срок вышел» их тоже нет.
 * Заводить аккаунт правила не запрещают; запрещают продавать внутри и
 * звать платить наружу. Прежний экран регистрации нарушал правило не тем,
 * что регистрировал, а тем, что обещал «шесть дней бесплатно».
 */
@Composable
fun LoginScreen(activity: AppCompatActivity) {
    val graph = LocalGraph.current
    val vm = graphViewModel { LoginViewModel(it) }
    val ui by vm.ui.collectAsState()
    val remembered by vm.rememberedAccount.collectAsState()
    val scope = rememberCoroutineScope()

    val phoneFocus = remember { FocusRequester() }
    val codeFocus = remember { FocusRequester() }

    Box(
        Modifier
            .fillMaxSize()
            .background(Brand.heroGradient),
    ) {
        Column(
            Modifier
                .fillMaxSize()
                /*
                 * Отступы системных панелей и клавиатуры — ДО прокрутки, а
                 * не после.
                 *
                 * Порядок здесь не косметика. Поставленные после
                 * `verticalScroll` они становятся частью прокручиваемого
                 * содержимого и уезжают вместе с ним: стоило открыться
                 * клавиатуре, и марка налезала на часы в строке состояния.
                 * Снаружи прокрутки они держат края экрана, а ездит только
                 * то, что внутри.
                 */
                .padding(top = Insets.top.calculateTopPadding())
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            Spacer(Modifier.height(64.dp))

            Wordmark()

            Text(
                headline(ui, remembered != null),
                fontSize = 40.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
                modifier = Modifier.padding(top = 10.dp),
            )

            Spacer(Modifier.height(34.dp))

            when (val stage = ui.stage) {
                is LoginViewModel.Stage.Code -> CodeForm(vm, ui, stage.waiting, codeFocus)
                is LoginViewModel.Stage.NewPin -> NewPinForm(vm, ui, stage.ticket)
                is LoginViewModel.Stage.Name -> NameForm(vm, ui, stage.ticket)
                LoginViewModel.Stage.Done -> ResetDone(vm)
                LoginViewModel.Stage.Reset -> ResetForm(vm, ui, phoneFocus)
                LoginViewModel.Stage.Entry -> {
                    val account = remembered
                    if (account != null && !ui.manual && ui.method == LoginViewModel.Method.SMS) {
                        RememberedFace(
                            account = account,
                            busy = ui.busy,
                            error = ui.error,
                            onTap = {
                                scope.launch {
                                    /*
                                     * Сохранённый вход — это дверь без
                                     * кода, и открывать её должен тот, чей
                                     * это телефон. Отказ проверки не
                                     * тупик: открываем форму с PIN — свой
                                     * код мойщик знает всегда, а пароль от
                                     * чужого телефона может и не знать.
                                     */
                                    val lock = graph.lock
                                    val ok = !lock.available ||
                                        lock.authenticate(
                                            activity,
                                            L(R.string.auth__signInAs, account.name),
                                        )
                                    if (ok) {
                                        vm.resumeRemembered(account) { vm.showError(it) }
                                    } else {
                                        vm.fallBackToManual(
                                            account,
                                            L(R.string.lock__failed, lock.kindName),
                                        )
                                    }
                                }
                            },
                            onAnother = {
                                vm.useAnotherAccount()
                            },
                        )
                    } else {
                        EntryForm(vm, ui, phoneFocus)
                    }
                }
            }

            Spacer(Modifier.height(80.dp))
        }

        LanguagePicker(
            Modifier
                .align(Alignment.TopEnd)
                .padding(top = Insets.top.calculateTopPadding())
                .padding(end = 18.dp, top = 6.dp)
        )
    }
}

@Composable
private fun headline(ui: LoginViewModel.UiState, hasRemembered: Boolean): String = when (ui.stage) {
    is LoginViewModel.Stage.Code ->
        if ((ui.stage as LoginViewModel.Stage.Code).waiting.purpose ==
            LoginViewModel.Waiting.Purpose.STEP_UP
        ) L(R.string.auth__stepUpTitle) else L(R.string.auth__otpTitle)

    is LoginViewModel.Stage.NewPin -> L(R.string.auth__newPin)
    is LoginViewModel.Stage.Name -> L(R.string.auth__nameTitle)
    LoginViewModel.Stage.Done -> L(R.string.auth__resetDone)
    LoginViewModel.Stage.Reset -> L(R.string.auth__resetTitle)
    LoginViewModel.Stage.Entry -> when {
        hasRemembered && !ui.manual && ui.method == LoginViewModel.Method.SMS ->
            L(R.string.auth__welcomeBack)
        ui.who == LoginViewModel.Who.STAFF -> L(R.string.auth__staffTitle)
        else -> L(R.string.auth__ownerTitle)
    }
}

// ══════════════════════ сохранённый профиль ══════════════════════

@Composable
private fun RememberedFace(
    account: RememberedAccount,
    busy: Boolean,
    error: String?,
    onTap: () -> Unit,
    onAnother: () -> Unit,
) {
    val tone = Palette.personTone(account.name)
    Column(
        Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(15.dp),
    ) {
        Box(
            Modifier
                .size(92.dp)
                .clip(CircleShape)
                .background(tone.base)
                .border(1.dp, Color.White.copy(alpha = 0.22f), CircleShape)
                .pressable(enabled = !busy, onClick = onTap),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                account.name.take(1),
                fontSize = 34.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
            )
        }

        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(account.name, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color.White)
            Text(account.tenant, fontSize = 13.sp, color = Color.White.copy(alpha = 0.6f))
        }

        if (busy) {
            TetrLoader(size = 22.dp, tint = Brand.lime)
        } else {
            Text(
                L(R.string.auth__tapAvatarPhone),
                fontSize = 12.5.sp,
                fontWeight = FontWeight.Medium,
                color = Color.White.copy(alpha = 0.55f),
                textAlign = TextAlign.Center,
            )
        }

        if (error != null) {
            Text(error, fontSize = 13.5.sp, color = Brand.lime, textAlign = TextAlign.Center)
        }

        QuietButton(L(R.string.auth__anotherAccount), onDark = true, onClick = onAnother)
    }
}

// ══════════════════════ учётные данные ══════════════════════

/**
 * Одна форма на обе роли.
 *
 * Первый вопрос экрана поменялся с «каким кодом» на «кто вы». Владелец и
 * Сотрудник — не два дизайна, а одна форма, у которой от роли зависит
 * состав полей: владельцу по умолчанию шлём код из SMS, потому что помнить
 * ему нечего; сотруднику сразу показываем оба поля, потому что код доступа
 * ему уже выдали.
 *
 * Сотруднику не предлагаем ни SMS, ни восстановления, и это не упрощение
 * картинки: номер ему заводит владелец, подтверждённым тот не становится, а
 * восстановление работает только по подтверждённому — то есть кнопка
 * «забыли» ответила бы ему молчанием.
 *
 * Поле телефона объявлено ровно один раз и живёт всё время, пока нужно:
 * смена роли и смена двери его не пересоздают, а значит не стирают
 * набранное и не роняют клавиатуру.
 */
@Composable
private fun EntryForm(
    vm: LoginViewModel,
    ui: LoginViewModel.UiState,
    phoneFocus: FocusRequester,
) {
    val owner = ui.who == LoginViewModel.Who.OWNER
    val needsCode = ui.method == LoginViewModel.Method.CODE

    Column(Modifier.fillMaxWidth()) {
        RoleSwitch(ui.who, enabled = !ui.busy) { vm.setWho(it) }

        /*
         * Подпись только там, где она отвечает на вопрос. У кода доступа
         * её нет: под полем и так стоит тихая строка о том, откуда код
         * взять.
         */
        if (owner && !needsCode) {
            Spacer(Modifier.height(20.dp))
            Text(
                L(R.string.auth__entrySub),
                fontSize = 14.sp,
                color = Color.White.copy(alpha = 0.7f),
            )
        }

        Spacer(Modifier.height(if (owner && !needsCode) 20.dp else 26.dp))
        PhoneField(vm, ui, phoneFocus)

        if (needsCode) {
            Spacer(Modifier.height(20.dp))
            /*
             * Подпись говорит и что это, и сколько цифр: у человека в этот
             * момент два разных кода на выбор, и «6 цифр» — самая дешёвая
             * подсказка, какой из них имеется в виду.
             */
            Text(
                L(R.string.auth__pinField),
                fontSize = 12.5.sp,
                color = Color.White.copy(alpha = 0.6f),
            )
            Spacer(Modifier.height(10.dp))
            CodeCells(
                value = ui.pin,
                onValue = vm::setPin,
                length = Api.PIN_LENGTH,
                label = L(R.string.auth__pin),
                secure = true,
                onDark = true,
            )
        }

        ErrorLine(ui.error)

        Spacer(Modifier.height(28.dp))
        if (needsCode) {
            LimeButton(
                text = L(R.string.auth__signIn),
                enabled = ui.canSubmitPin,
                loading = ui.busy,
                onClick = vm::submitPin,
            )
        } else {
            LimeButton(
                text = L(R.string.auth__entrySend),
                enabled = ui.canSendPhone,
                loading = ui.busy,
                onClick = vm::sendEntryCode,
            )
        }

        /*
         * Тихие выходы под кнопкой — строкой, а не второй заливкой:
         * главное действие на экране одно, и спорить с ним второй лаймовой
         * кнопкой нельзя.
         */
        if (owner) {
            Spacer(Modifier.height(26.dp))
            if (needsCode) {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
                ) {
                    QuietButton(
                        L(R.string.auth__entrySmsDoor),
                        onDark = true,
                        enabled = !ui.busy,
                        onClick = { vm.setMethod(LoginViewModel.Method.SMS) },
                    )
                    QuietButton(
                        L(R.string.auth__forgotPin),
                        onDark = true,
                        enabled = !ui.busy,
                        onClick = { vm.go(LoginViewModel.Stage.Reset) },
                    )
                }
            } else {
                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    QuietButton(
                        L(R.string.auth__entryPinDoor),
                        onDark = true,
                        enabled = !ui.busy,
                        onClick = { vm.setMethod(LoginViewModel.Method.CODE) },
                    )
                }
            }
        }

        /* Тихая строка под всеми действиями: откуда взять код. */
        val helper = when {
            !owner -> L(R.string.auth__staffHelper)
            needsCode -> L(R.string.auth__ownerCodeHelper)
            else -> null
        }
        if (helper != null) {
            Spacer(Modifier.height(18.dp))
            Text(
                helper,
                fontSize = 13.sp,
                color = Color.White.copy(alpha = 0.6f),
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

/**
 * Кто пришёл: владелец или сотрудник.
 *
 * Плашка светлая, а не лаймовая, и это правило, а не вкус: лайм на этом
 * экране означает главное действие, и второй лаймовой заливкой
 * переключатель отбирал бы у кнопки «Получить код» её единственность.
 * Выбранное здесь не ярче соседа, а ближе к смотрящему.
 */
@Composable
private fun RoleSwitch(
    who: LoginViewModel.Who,
    enabled: Boolean,
    onPick: (LoginViewModel.Who) -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(15.dp))
            .background(Color.White.copy(alpha = 0.10f))
            .border(1.dp, Color.White.copy(alpha = 0.12f), RoundedCornerShape(15.dp))
            .padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        RoleTab(L(R.string.roles__owner), who == LoginViewModel.Who.OWNER, enabled, Modifier.weight(1f)) {
            onPick(LoginViewModel.Who.OWNER)
        }
        RoleTab(L(R.string.roles__staff), who == LoginViewModel.Who.STAFF, enabled, Modifier.weight(1f)) {
            onPick(LoginViewModel.Who.STAFF)
        }
    }
}

@Composable
private fun RoleTab(
    title: String,
    on: Boolean,
    enabled: Boolean,
    modifier: Modifier,
    onClick: () -> Unit,
) {
    Box(
        modifier
            .height(38.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(if (on) Color.White.copy(alpha = 0.20f) else Color.Transparent)
            .pressable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            title,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            color = if (on) Color.White else Color.White.copy(alpha = 0.6f),
            maxLines = 1,
        )
    }
}

// ══════════════════════ забыл код ══════════════════════

@Composable
private fun ResetForm(
    vm: LoginViewModel,
    ui: LoginViewModel.UiState,
    phoneFocus: FocusRequester,
) {
    Column(Modifier.fillMaxWidth()) {
        Text(L(R.string.auth__resetSub), fontSize = 14.sp, color = Color.White.copy(alpha = 0.7f))

        Spacer(Modifier.height(30.dp))
        PhoneField(vm, ui, phoneFocus)

        ErrorLine(ui.error)

        Spacer(Modifier.height(28.dp))
        LimeButton(
            text = L(R.string.auth__resetSend),
            enabled = ui.canSendPhone,
            loading = ui.busy,
            onClick = vm::sendResetCode,
        )

        Spacer(Modifier.height(30.dp))
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            QuietButton(
                L(R.string.auth__backToSignIn),
                onDark = true,
                enabled = !ui.busy,
                onClick = {
                    vm.setMethod(LoginViewModel.Method.CODE)
                    vm.go(LoginViewModel.Stage.Entry)
                },
            )
        }
    }
}

// ══════════════════════ шесть цифр ══════════════════════

@Composable
private fun CodeForm(
    vm: LoginViewModel,
    ui: LoginViewModel.UiState,
    waiting: LoginViewModel.Waiting,
    codeFocus: FocusRequester,
) {
    Column(Modifier.fillMaxWidth()) {
        Text(
            if (waiting.purpose == LoginViewModel.Waiting.Purpose.STEP_UP) {
                L(R.string.auth__stepUpSub, waiting.phone)
            } else {
                L(R.string.auth__otpSent, waiting.phone)
            },
            fontSize = 14.sp,
            color = Color.White.copy(alpha = 0.7f),
        )

        Spacer(Modifier.height(30.dp))
        FieldLabel(L(R.string.auth__otpCode))
        Spacer(Modifier.height(8.dp))
        CodeCells(
            value = ui.code,
            onValue = vm::setCode,
            length = Api.CODE_LENGTH,
            label = L(R.string.auth__otpCode),
            /*
             * Код из SMS не прячем: он только что пришёл человеку в
             * открытом сообщении, и точки вместо цифр мешали бы сверить
             * набранное с тем, что видно в шторке.
             */
            secure = false,
            onDark = true,
            contentType = ContentType.SmsOtpCode,
            focusRequester = codeFocus,
            // шесть цифр — отправляем сами, лишнее нажатие тут ни к чему
            onComplete = { vm.confirm(waiting) },
        )

        ErrorLine(ui.error)

        Spacer(Modifier.height(26.dp))
        LimeButton(
            text = L(R.string.auth__otpVerify),
            enabled = ui.canConfirmCode,
            loading = ui.busy,
            onClick = { vm.confirm(waiting) },
        )

        /*
         * Повтор и возврат друг под другом, а не в строку.
         *
         * В строку они и стояли, и на узком экране «Отправить повторно
         * через 00:31» забирало всю ширину, а от «Назад» оставалась одна
         * буква «Н». Растягивать одну и жать другую нечестно: обе строки
         * переменной длины — в них тикает счётчик, а слова у трёх языков
         * разные, и при увеличенном системном шрифте не помещается уже
         * любая пара. Столбиком не помещаться нечему.
         */
        Spacer(Modifier.height(18.dp))
        Column(
            Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            ResendButton(waiting, ui.busy) { vm.resend(waiting) }
            QuietButton(
                L(R.string.common__back),
                onDark = true,
                enabled = !ui.busy,
                onClick = { vm.backFromCode(waiting) },
            )
        }
    }

    LaunchedEffect(waiting.id) { codeFocus.requestFocus() }
}

/**
 * Повтор с обратным отсчётом.
 *
 * Отсчёт — подсказка человеку, а не правило: правило держит сервер
 * (45 → 90 → 180 секунд, не больше трёх повторов). Но без подсказки кнопка
 * выглядит рабочей и отвечает отказом, то есть продукт предлагает нажать и
 * ругается за нажатие.
 */
@Composable
private fun ResendButton(
    waiting: LoginViewModel.Waiting,
    busy: Boolean,
    onResend: () -> Unit,
) {
    var left by remember(waiting.id) {
        mutableStateOf(secondsLeft(waiting.resendAt))
    }
    LaunchedEffect(waiting.id) {
        while (true) {
            left = secondsLeft(waiting.resendAt)
            if (left <= 0) break
            delay(1000)
        }
    }

    QuietButton(
        text = if (left > 0) L(R.string.auth__otpResendIn, mmss(left)) else L(R.string.auth__otpResend),
        onDark = true,
        enabled = !busy && left <= 0,
        onClick = onResend,
    )
}

private fun secondsLeft(at: Instant): Int =
    maxOf(0, ((at.toEpochMilli() - System.currentTimeMillis() + 999) / 1000).toInt())

private fun mmss(total: Int): String = "%02d:%02d".format(total / 60, total % 60)

// ══════════════════════ новый код ══════════════════════

@Composable
private fun NewPinForm(vm: LoginViewModel, ui: LoginViewModel.UiState, ticket: String) {
    Column(Modifier.fillMaxWidth()) {
        Text(L(R.string.auth__pinMemo), fontSize = 14.sp, color = Color.White.copy(alpha = 0.7f))

        Spacer(Modifier.height(30.dp))
        FieldLabel(L(R.string.auth__newPin))
        Spacer(Modifier.height(8.dp))
        CodeCells(
            value = ui.newPin,
            onValue = vm::setNewPin,
            length = Api.PIN_LENGTH,
            label = L(R.string.auth__newPin),
            secure = true,
            onDark = true,
            contentType = ContentType.NewPassword,
        )

        /*
         * Повтор сервер не спрашивает и знать о нём не должен: он
         * проверяется здесь, до отправки. Причина в последствии — опечатка
         * в единственном поле означала бы новый код, которого человек не
         * знает, и вход только через ещё одну SMS. Второе поле стоит одного
         * лишнего движения раз в год.
         */
        Spacer(Modifier.height(14.dp))
        FieldLabel(L(R.string.common__retry))
        Spacer(Modifier.height(8.dp))
        CodeCells(
            value = ui.repeatPin,
            onValue = vm::setRepeatPin,
            length = Api.PIN_LENGTH,
            label = L(R.string.common__retry),
            secure = true,
            onDark = true,
            contentType = ContentType.NewPassword,
        )

        if (ui.mismatch) {
            Spacer(Modifier.height(14.dp))
            Text(L(R.string.auth__pinMismatch), fontSize = 14.sp, color = Brand.lime)
        } else {
            ErrorLine(ui.error)
        }

        Spacer(Modifier.height(26.dp))
        LimeButton(
            text = L(R.string.auth__resetSave),
            enabled = ui.canSaveNewPin,
            loading = ui.busy,
            onClick = { vm.saveNewPin(ticket) },
        )
    }
}

// ══════════════════════ исходы ══════════════════════

/**
 * Последний шаг новичка: как называется мойка и как зовут владельца.
 *
 * PIN здесь не спрашивается — входить он будет кодом. Два поля, и это
 * единственный экран, который человек видит один раз в жизни.
 */
@Composable
private fun NameForm(vm: LoginViewModel, ui: LoginViewModel.UiState, ticket: String) {
    Column(Modifier.fillMaxWidth()) {
        Text(L(R.string.auth__nameSub), fontSize = 14.sp, color = Color.White.copy(alpha = 0.7f))

        Spacer(Modifier.height(30.dp))
        DarkField(
            title = L(R.string.onboarding__bizName),
            value = ui.businessName,
            placeholder = L(R.string.auth__namePlaceholder),
            onValue = vm::setBusinessName,
        )

        Spacer(Modifier.height(14.dp))
        DarkField(
            title = L(R.string.onboarding__ownerName),
            value = ui.ownerName,
            placeholder = L(R.string.staff__namePlaceholder),
            onValue = vm::setOwnerName,
        )

        ErrorLine(ui.error)

        Spacer(Modifier.height(26.dp))
        LimeButton(
            text = L(R.string.auth__nameCreate),
            enabled = ui.namesReady && !ui.busy,
            loading = ui.busy,
            onClick = { vm.createBusiness(ticket) },
        )
    }
}

@Composable
private fun ResetDone(vm: LoginViewModel) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text(
            L(R.string.auth__resetDoneNote),
            fontSize = 15.sp,
            color = Color.White.copy(alpha = 0.75f),
        )
        LimeButton(
            text = L(R.string.auth__backToSignIn),
            onClick = {
                vm.setMethod(LoginViewModel.Method.CODE)
                vm.go(LoginViewModel.Stage.Entry)
            },
        )
    }
}

// ══════════════════════ мелочи ══════════════════════

@Composable
private fun PhoneField(
    vm: LoginViewModel,
    ui: LoginViewModel.UiState,
    focus: FocusRequester,
) {
    Column {
        FieldLabel(L(R.string.auth__phone))
        Spacer(Modifier.height(8.dp))
        Box(
            Modifier
                .fillMaxWidth()
                .height(54.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(Color.White.copy(alpha = 0.08f))
                .border(1.dp, Color.White.copy(alpha = 0.16f), RoundedCornerShape(14.dp))
                .padding(horizontal = 16.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            CountryPhoneField(
                country = ui.country,
                onCountry = vm::setCountry,
                number = ui.phone,
                onNumber = vm::setPhone,
                ink = Color.White,
                focusRequester = focus,
            )
        }
    }
}

@Composable
private fun FieldLabel(text: String) {
    Text(
        text.uppercase(LocalLang.current.locale),
        fontSize = 11.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 1.2.sp,
        color = Color.White.copy(alpha = 0.6f),
    )
}

@Composable
private fun DarkField(
    title: String,
    value: String,
    placeholder: String,
    onValue: (String) -> Unit,
) {
    Column {
        FieldLabel(title)
        Spacer(Modifier.height(8.dp))
        Box(
            Modifier
                .fillMaxWidth()
                .height(54.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(Color.White.copy(alpha = 0.08f))
                .border(1.dp, Color.White.copy(alpha = 0.16f), RoundedCornerShape(14.dp))
                .padding(horizontal = 16.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            BasicTextField(
                value = value,
                onValueChange = onValue,
                textStyle = TextStyle(
                    color = Color.White,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Medium,
                ),
                cursorBrush = SolidColor(Brand.lime),
                keyboardOptions = KeyboardOptions(
                    imeAction = androidx.compose.ui.text.input.ImeAction.Done,
                ),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                decorationBox = { inner ->
                    if (value.isEmpty()) {
                        Text(
                            placeholder,
                            fontSize = 18.sp,
                            color = Color.White.copy(alpha = 0.4f),
                        )
                    }
                    inner()
                },
            )
        }
    }
}

@Composable
private fun ErrorLine(error: String?) {
    if (error.isNullOrEmpty()) return
    Spacer(Modifier.height(14.dp))
    Text(error, fontSize = 14.sp, color = Brand.lime)
}

/**
 * Язык — прямо на экране входа.
 *
 * Раньше сменить его можно было только в профиле, то есть уже ВНУТРИ, и
 * это была ловушка: человек, которому завели аккаунт, а по-армянски он не
 * читает, видел незнакомые слова ровно там, где от него требуется
 * действие, и до профиля добраться не мог.
 *
 * Значком, а не строкой: экран входа — это заголовок, поле и кнопка, и
 * четвёртый крупный орган на нём спорил бы с ними за внимание. Каждый язык
 * подписан своим словом, флагов нет: флаг это страна, а не язык.
 */
@Composable
private fun LanguagePicker(modifier: Modifier = Modifier) {
    val graph = LocalGraph.current
    val current = LocalLang.current
    var open by remember { mutableStateOf(false) }

    Box(modifier) {
        Box(
            Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(Color.White.copy(alpha = 0.12f))
                .pressable { open = true },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Filled.Language,
                contentDescription = L(R.string.common__language),
                tint = Color.White.copy(alpha = 0.8f),
                modifier = Modifier.size(18.dp),
            )
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            Lang.entries.forEach { option ->
                DropdownMenuItem(
                    text = {
                        Text(
                            option.ownName,
                            fontWeight = if (option == current) FontWeight.Bold else FontWeight.Normal,
                        )
                    },
                    onClick = {
                        graph.langStore.set(option)
                        open = false
                    },
                )
            }
        }
    }
}
