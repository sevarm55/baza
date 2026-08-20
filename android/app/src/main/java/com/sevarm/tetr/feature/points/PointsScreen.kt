package com.sevarm.tetr.feature.points

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sevarm.tetr.LocalGraph
import com.sevarm.tetr.R
import com.sevarm.tetr.core.api.Point
import com.sevarm.tetr.core.i18n.L
import com.sevarm.tetr.core.i18n.Ln
import com.sevarm.tetr.design.Brand
import com.sevarm.tetr.design.Insets
import com.sevarm.tetr.design.Palette
import com.sevarm.tetr.design.ScreenHeader
import com.sevarm.tetr.design.TetrLoader
import com.sevarm.tetr.design.pressable
import com.sevarm.tetr.design.tile
import kotlinx.coroutines.launch

/**
 * Точки: где человек работает и что с каждой.
 *
 * Переключиться можно и из шапки экрана смены — там это одно нажатие.
 * Здесь другое: СОСТОЯНИЕ. Меню отвечает «куда перейти», эта страница —
 * «что у меня где»: какая оплачена, у какой кончается срок, какая ждёт
 * денег.
 */
@Composable
fun PointsScreen(onBack: () -> Unit) {
    val graph = LocalGraph.current
    val session = graph.session
    val scope = rememberCoroutineScope()
    val points by session.points.collectAsState()
    val tenant by session.tenant.collectAsState()
    var going by remember { mutableStateOf<String?>(null) }
    /*
     * Отказ переключения показываем окном, а не глотаем.
     *
     * Смена точки — это перевыпуск пары токенов на сервере, и он падает
     * ровно тогда, когда связь оборвалась или доступ к точке закрыли. Без
     * окна кнопка просто отжималась обратно, экран оставался прежним, и
     * человек нажимал её ещё раз, решив, что промахнулся пальцем.
     */
    var failed by remember { mutableStateOf(false) }

    Column(
        Modifier
            .fillMaxSize()
            .background(Brand.board)
            .padding(top = Insets.top.calculateTopPadding()),
    ) {
        ScreenHeader(L(R.string.points__title), onBack = onBack)

        Column(
            Modifier
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 12.dp)
                .padding(top = 8.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            points.forEach { point ->
                PointCard(
                    point = point,
                    here = point.id == tenant?.id,
                    busy = going == point.id,
                    disabled = going != null,
                ) {
                    going = point.id
                    scope.launch {
                        val ok = runCatching { session.switchTo(point, graph.queue) }.isSuccess
                        going = null
                        if (!ok) failed = true
                    }
                }
            }

            /*
             * Завести точку отсюда нельзя, и человек должен узнать об этом
             * здесь, а не искать кнопку: вторая точка платная сразу, а
             * платный путь внутри приложения не начинается.
             */
            Text(
                L(R.string.points__addOnWeb),
                fontSize = 12.5.sp,
                color = Brand.boardMuted,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 6.dp),
            )
        }
    }

    if (failed) {
        AlertDialog(
            onDismissRequest = { failed = false },
            containerColor = Brand.boardSurface,
            title = { Text(L(R.string.common__failed), color = Brand.onBoard) },
            text = { Text(L(R.string.points__switchFailed), color = Brand.boardMuted) },
            confirmButton = {
                TextButton(onClick = { failed = false }) {
                    Text(L(R.string.common__ok), color = Brand.grape)
                }
            },
        )
    }
}

@Composable
private fun PointCard(
    point: Point,
    here: Boolean,
    busy: Boolean,
    disabled: Boolean,
    onOpen: () -> Unit,
) {
    val tone = Palette.personTone(point.name)
    Column(
        Modifier
            .fillMaxWidth()
            .tile(tone.base, tone.glow, 22.dp)
            .padding(16.dp),
    ) {
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                Text(point.name, fontSize = 17.sp, fontWeight = FontWeight.Bold, color = Color.White, maxLines = 1)
                Text(
                    if (point.role == "owner") L(R.string.roles__owner) else L(R.string.roles__staff),
                    fontSize = 12.sp,
                    color = Color.White.copy(alpha = 0.7f),
                )
            }
            if (here) {
                Text(
                    L(R.string.points__here),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = Brand.onLime,
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(Brand.lime)
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                )
            }
        }

        /*
         * Состояние словами и цифрой. «12 օր» само по себе не говорит чего
         * именно двенадцать, а «оплачено» без срока не отвечает на вопрос,
         * ради которого сюда зашли.
         */
        Text(
            stateOf(point),
            fontSize = 13.5.sp,
            fontWeight = FontWeight.Medium,
            color = if (point.canRead) Color.White.copy(alpha = 0.85f) else Brand.warnOnDark,
            modifier = Modifier.padding(top = 12.dp),
        )

        if (!here) {
            Box(
                Modifier
                    .padding(top = 12.dp)
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(13.dp))
                    .background(Color.White.copy(alpha = 0.18f))
                    .pressable(enabled = !disabled, onClick = onOpen)
                    .padding(vertical = 11.dp),
                contentAlignment = Alignment.Center,
            ) {
                if (busy) {
                    TetrLoader(size = 16.dp, tint = Color.White)
                } else {
                    Text(
                        L(R.string.points__open),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color.White,
                    )
                }
            }
        }
    }
}

@Composable
private fun stateOf(point: Point): String {
    val days = point.daysLeft ?: 0
    return when (point.state) {
        "active" -> if (days > 0) Ln(R.plurals.points__paidDays, days) else L(R.string.payroll__paid)
        "trial" -> Ln(R.plurals.points__trialDays, days)
        "unpaid" -> L(R.string.points__awaitingPayment)
        "expired" -> L(R.string.billing__expiredTitle)
        "blocked" -> L(R.string.billing__blockedTitle)
        else -> if (point.canRead) L(R.string.points__working) else L(R.string.points__closed)
    }
}
