package com.sevarm.tetr.feature.shift

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sevarm.tetr.R
import com.sevarm.tetr.core.i18n.L
import com.sevarm.tetr.core.i18n.Terms
import com.sevarm.tetr.core.ui.lang
import com.sevarm.tetr.core.ui.money
import com.sevarm.tetr.core.ui.tenant
import com.sevarm.tetr.design.Brand
import com.sevarm.tetr.design.Caption
import com.sevarm.tetr.design.FieldRow
import com.sevarm.tetr.design.Insets
import com.sevarm.tetr.design.LimeButton
import com.sevarm.tetr.design.QuietButton
import com.sevarm.tetr.design.SheetHeader
import com.sevarm.tetr.design.sunken

/**
 * Сдача наличных в конце смены.
 *
 * Единственный момент, когда деньги переходят из рук в руки, — и до сих
 * пор продукт про него не знал ничего. Он знал, сколько намыто наличными,
 * и не знал, сколько из них дошло до владельца. Разница между этими
 * числами и есть недостача, ради которой в кассовом бизнесе вообще ставят
 * учёт.
 *
 * Сумма подставлена заранее: в девяти случаях из десяти сдают ровно
 * столько, сколько намыли, и заставлять человека набирать пять цифр
 * вручную значит получить или неверные данные, или пропущенный шаг.
 *
 * Пропустить можно. Заставить отметить — значит запереть человека в
 * приложении в конце смены; уйти он должен уметь всегда, а «не отмечено»
 * владелец увидит именно как «не отмечено», а не как ноль.
 */
@Composable
fun HandoverSheet(
    expected: Int,
    count: Int,
    revenue: Int,
    earned: Int,
    takesShare: Boolean,
    onClose: () -> Unit,
    onDone: (Int?) -> Unit,
) {
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val unit = Terms.unit(tenant()?.unitOne.orEmpty(), lang()).nom

    var amount by remember { mutableStateOf(if (expected > 0) expected.toString() else "") }
    val entered = amount.toIntOrNull()
    val diff = (entered ?: expected) - expected

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
            SheetHeader(L(R.string.work__endTitle), onClose = onClose)

            /*
             * Итог дня — первым, до сдачи наличных. Смену закрывают один
             * раз за день, и после неё записывать нельзя до следующей.
             * Раньше окно спрашивало только про деньги в кармане, и человек
             * соглашался, не увидев, что именно он закрывает.
             */
            Caption(L(R.string.common__today))
            Column(Modifier.fillMaxWidth().sunken()) {
                Line(unit.ifEmpty { L(R.string.shift__record) }, "$count")
                Line(L(R.string.work__worksTotal), money(revenue))
                if (takesShare) Line(L(R.string.work__earnedToday), money(earned), strong = true)
            }
            Note(L(R.string.handover__endNote, Terms.unit(tenant()?.unitOne.orEmpty(), lang()).acc))

            Caption(L(R.string.handover__cashInShift))
            Column(Modifier.fillMaxWidth().sunken()) {
                Line(L(R.string.handover__cashInShift), money(expected))
                FieldRow(
                    label = L(R.string.handover__declaring),
                    value = amount,
                    onValue = { raw -> amount = raw.filter { it.isDigit() }.take(9) },
                    keyboard = KeyboardType.Number,
                )
            }

            /*
             * Расхождение показываем сразу, а не после отправки: чаще всего
             * это опечатка, и увидеть её надо до того, как она уедет к
             * владельцу уведомлением.
             */
            if (entered != null && diff != 0) {
                Text(
                    if (diff < 0) {
                        L(R.string.handover__short, money(-diff))
                    } else {
                        L(R.string.handover__over, money(diff))
                    },
                    fontSize = 12.5.sp,
                    color = Brand.warn,
                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 8.dp),
                )
            } else {
                Note(L(R.string.handover__cardNote))
            }

            Spacer(Modifier.height(14.dp))
            LimeButton(
                text = L(R.string.handover__submit),
                onClick = { onDone(entered ?: expected) },
            )
            Spacer(Modifier.height(10.dp))
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
            ) {
                QuietButton(L(R.string.common__skip), onClick = { onDone(null) })
                // остаться на смене — тем же словом, что в вебе
                QuietButton(L(R.string.work__endStay), onClick = onClose)
            }
        }
    }
}

@Composable
private fun Line(label: String, value: String, strong: Boolean = false) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, fontSize = 14.sp, color = Brand.boardMuted, modifier = Modifier.weight(1f))
        Text(
            value,
            fontSize = 15.sp,
            fontWeight = if (strong) FontWeight.Bold else FontWeight.Medium,
            color = if (strong) Brand.onBoard else Brand.boardMuted,
        )
    }
}

@Composable
private fun Note(text: String) {
    Text(
        text,
        fontSize = 11.5.sp,
        color = Brand.boardMuted,
        modifier = Modifier.padding(horizontal = 6.dp, vertical = 8.dp),
    )
}
