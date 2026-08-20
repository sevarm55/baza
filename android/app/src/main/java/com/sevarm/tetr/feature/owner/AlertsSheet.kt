package com.sevarm.tetr.feature.owner

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sevarm.tetr.R
import com.sevarm.tetr.core.api.Alert
import com.sevarm.tetr.core.i18n.L
import com.sevarm.tetr.design.Brand
import com.sevarm.tetr.design.EmptyState
import com.sevarm.tetr.design.HairLine
import com.sevarm.tetr.design.Insets
import com.sevarm.tetr.design.SheetHeader
import com.sevarm.tetr.design.pressable

/**
 * Что требует внимания.
 *
 * Не лента событий, а список поводов — состояний мойки, каждое из которых
 * требует одного конкретного действия: клиенты, которые давно не были, и
 * зарплата, которая копится неделю. Считает их сервер, той же сборкой, что
 * и кабинет в браузере: два места, считающие поводы по-разному, врут в
 * одном из двух.
 *
 * «Прочитано» здесь нет вовсе. Повод — состояние: «пятеро не были три
 * недели» правда, пока они не приедут, и отмечать её прочитанной значит
 * врать себе. Есть только «Потом» — повод замолкает на неделю и
 * возвращается, если ничего не изменилось.
 */
@Composable
fun AlertsSheet(
    alerts: List<Alert>,
    onOpen: (String) -> Unit,
    onSnooze: (String) -> Unit,
    onClose: () -> Unit,
) {
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)

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
            SheetHeader(L(R.string.alerts__title), onClose = onClose)

            if (alerts.isEmpty()) {
                EmptyState(
                    title = L(R.string.alerts__empty),
                    note = L(R.string.alerts__emptyNote),
                )
            } else {
                alerts.forEachIndexed { index, alert ->
                    if (index > 0) HairLine()
                    AlertRow(
                        alert = alert,
                        onOpen = {
                            onOpen(alert.key)
                            onClose()
                        },
                        onSnooze = { onSnooze(alert.key) },
                    )
                }
            }
        }
    }
}

/**
 * Повод строкой, а не карточкой: значок, две строки текста, шеврон — тот
 * же вид, что у списка машин и у людей. Карточка с цветной полосой и парой
 * кнопок читалась бы вставкой из чужого приложения.
 */
@Composable
private fun AlertRow(alert: Alert, onOpen: () -> Unit, onSnooze: () -> Unit) {
    val warn = alert.tone == "warn"
    val tint = if (warn) Brand.warnOnBoard else Brand.grape

    Column(Modifier.fillMaxWidth()) {
        Row(
            Modifier
                .fillMaxWidth()
                .pressable(onClick = onOpen)
                .padding(vertical = 11.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(
                Modifier
                    .size(34.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(tint.copy(alpha = 0.14f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    if (alert.key == "payroll-due") Icons.Filled.Payments else Icons.Filled.AccessTime,
                    contentDescription = null,
                    tint = tint,
                    modifier = Modifier.size(16.dp),
                )
            }

            Column(Modifier.weight(1f)) {
                Text(
                    alert.title,
                    fontSize = 14.5.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Brand.onBoard,
                )
                Text(alert.note, fontSize = 12.5.sp, color = Brand.boardMuted)
            }

            Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = Brand.boardMuted.copy(alpha = 0.6f),
                modifier = Modifier.size(16.dp),
            )
        }

        /*
         * «Потом» — отказ, а не равноправный выбор: тихой подписью под
         * строкой, а не второй кнопкой рядом.
         */
        Text(
            L(R.string.alerts__later),
            fontSize = 12.5.sp,
            color = Brand.boardMuted,
            modifier = Modifier
                .padding(start = 46.dp)
                .pressable(onClick = onSnooze)
                .padding(bottom = 10.dp, top = 2.dp),
        )
    }
}
