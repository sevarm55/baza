package com.sevarm.tetr.feature.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sevarm.tetr.LocalGraph
import com.sevarm.tetr.R
import com.sevarm.tetr.core.api.Api
import com.sevarm.tetr.core.api.ApiException
import com.sevarm.tetr.core.api.Failure
import com.sevarm.tetr.core.i18n.L
import com.sevarm.tetr.design.Brand
import com.sevarm.tetr.design.Caption
import com.sevarm.tetr.design.CodeCells
import com.sevarm.tetr.design.Insets
import com.sevarm.tetr.design.LimeButton
import com.sevarm.tetr.design.QuietButton
import com.sevarm.tetr.design.SheetHeader
import com.sevarm.tetr.feature.expired.share
import kotlinx.coroutines.launch

/**
 * Удаление бизнеса.
 *
 * Существует потому, что заведённый с телефона аккаунт должен с телефона и
 * удаляться. Отправить владельца писать письмо — значит сделать выход
 * сложнее входа, а магазины такое приложение просто не пропустят.
 *
 * Главное решение экрана — выбор из двух кнопок, а не галочка «я
 * понимаю». Галочку прожимают не читая; выбор между «забрать данные» и
 * «уйти без них» прочитать приходится, потому что кнопки разные.
 *
 * Чем подтверждают, решает СЕРВЕР по состоянию аккаунта: PIN у тех, у кого
 * он есть, и код из SMS у заведённых по коду. Присланный приложением
 * признак «у меня нет PIN» был бы способом обойти PIN.
 */
@Composable
fun DeleteBusinessSheet(onClose: () -> Unit) {
    val graph = LocalGraph.current
    val session = graph.session
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val tenant by session.tenant.collectAsState()

    val byCode = !session.hasPin

    var pin by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var challengeId by remember { mutableStateOf<String?>(null) }
    var sentTo by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    /** Копию уже забрали — второй заход её заново не гоняет. */
    var saved by remember { mutableStateOf(false) }

    val asksCode = byCode && challengeId != null
    val ready = !busy && if (byCode) {
        asksCode && code.length == Api.CODE_LENGTH
    } else {
        /*
         * Минимум четыре: у заведённых до перехода на шестизначный код их
         * столько. «Ровно четыре» ломало удаление у всех, чей код длиннее.
         */
        pin.length >= Api.PIN_MIN_LENGTH
    }

    suspend fun wipe() {
        busy = true
        error = try {
            session.deleteBusiness(
                pin = if (byCode) "" else pin,
                challengeId = challengeId.orEmpty(),
                code = code,
            )
            null
        } catch (e: ApiException) {
            pin = ""
            code = ""
            /*
             * Заявка сгорела: возвращаем к «выслать код». Оставить поле с
             * мёртвым идентификатором значит предложить вводить то, что уже
             * не примут.
             */
            if (e.code == "OTP_EXPIRED" || e.code == "OTP_TOO_MANY") challengeId = null
            Failure.auth(e)
        } catch (e: Exception) {
            Failure.text(e)
        }
        busy = false
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
                .padding(horizontal = 12.dp)
                .padding(bottom = Insets.bottom.calculateBottomPadding() + 12.dp),
        ) {
            SheetHeader(L(R.string.billing__wallDelete), onClose = onClose)

            Caption(tenant?.name.orEmpty())
            Text(
                L(R.string.delete__what),
                fontSize = 14.5.sp,
                color = Brand.onBoard,
                modifier = Modifier.padding(horizontal = 6.dp, vertical = 6.dp),
            )
            Text(
                L(R.string.delete__staffNote),
                fontSize = 14.sp,
                color = Brand.boardMuted,
                modifier = Modifier.padding(horizontal = 6.dp),
            )
            Text(
                L(R.string.settings__deleteNoWayBack),
                fontSize = 13.sp,
                color = Brand.badOnBoard,
                modifier = Modifier.padding(horizontal = 6.dp, vertical = 10.dp),
            )

            if (asksCode) {
                Caption(L(R.string.delete__codeAsk))
                Spacer(Modifier.height(8.dp))
                CodeCells(
                    value = code,
                    onValue = { code = it },
                    length = Api.CODE_LENGTH,
                    label = L(R.string.auth__otpCode),
                    contentType = androidx.compose.ui.autofill.ContentType.SmsOtpCode,
                )
                Text(
                    L(R.string.delete__codeSent, sentTo),
                    fontSize = 12.sp,
                    color = Brand.boardMuted,
                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 8.dp),
                )
            } else if (!byCode) {
                Caption(L(R.string.settings__deletePin))
                Spacer(Modifier.height(8.dp))
                CodeCells(
                    value = pin,
                    onValue = { pin = it },
                    length = Api.PIN_LENGTH,
                    label = L(R.string.auth__pin),
                    secure = true,
                    contentType = androidx.compose.ui.autofill.ContentType.Password,
                )
            }

            error?.let {
                Text(
                    it,
                    fontSize = 13.sp,
                    color = Brand.badOnBoard,
                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 8.dp),
                )
            }

            Spacer(Modifier.height(14.dp))

            if (byCode && challengeId == null) {
                /*
                 * Первый шаг ничего не удаляет: он высылает код. Поэтому
                 * одна кнопка, и она не разрушительная — два выхода
                 * появятся, когда будет чем подтвердить.
                 */
                LimeButton(
                    text = L(R.string.delete__sendCode),
                    busyTitle = L(R.string.auth__sending),
                    enabled = !busy,
                    loading = busy,
                    onClick = {
                        scope.launch {
                            busy = true
                            error = try {
                                val started = session.startDeleteCode()
                                challengeId = started.challengeId
                                sentTo = started.phone.orEmpty()
                                null
                            } catch (e: Exception) {
                                Failure.auth(e)
                            }
                            busy = false
                        }
                    },
                )
            } else {
                /*
                 * Сохраняющий путь стоит первым: по умолчанию человек
                 * должен уносить свои данные с собой, а не терять их молча.
                 * Порядок «сначала архив, потом удаление» единственно
                 * возможный: после удаления выгружать уже нечего.
                 */
                LimeButton(
                    text = if (saved) L(R.string.billing__wallDelete) else L(R.string.settings__deleteKeep),
                    busyTitle = L(R.string.common__deleting),
                    enabled = ready,
                    loading = busy,
                    onClick = {
                        scope.launch {
                            if (saved) {
                                wipe()
                            } else {
                                busy = true
                                val file = exportCsv(context, graph, days = "all")
                                busy = false
                                if (file == null) {
                                    error = L(R.string.delete__downloadFailed)
                                } else {
                                    share(context, file)
                                    saved = true
                                }
                            }
                        }
                    },
                )
                Spacer(Modifier.height(10.dp))
                QuietButton(
                    text = L(R.string.settings__deleteWipe),
                    enabled = ready,
                    modifier = Modifier.fillMaxWidth(),
                    onClick = { scope.launch { wipe() } },
                )
                Text(
                    if (saved) L(R.string.delete__downloaded) else L(R.string.delete__fileNote),
                    fontSize = 12.sp,
                    color = Brand.boardMuted,
                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 8.dp),
                )
            }
        }
    }
}
