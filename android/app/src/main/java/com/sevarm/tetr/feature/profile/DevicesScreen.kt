package com.sevarm.tetr.feature.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sevarm.tetr.LocalGraph
import com.sevarm.tetr.R
import com.sevarm.tetr.core.api.Device
import com.sevarm.tetr.core.i18n.Dates
import com.sevarm.tetr.core.i18n.L
import com.sevarm.tetr.core.ui.lang
import com.sevarm.tetr.core.ui.zone
import com.sevarm.tetr.design.Brand
import com.sevarm.tetr.design.DelayedContent
import com.sevarm.tetr.design.EmptyState
import com.sevarm.tetr.design.HairLine
import com.sevarm.tetr.design.Insets
import com.sevarm.tetr.design.ScreenHeader
import com.sevarm.tetr.design.TetrSkeletonList
import com.sevarm.tetr.design.pressable
import com.sevarm.tetr.design.surfaceCard
import kotlinx.coroutines.launch

/**
 * Откуда сейчас открыт вход.
 *
 * Телефон на мойке общий и переходит из рук в руки, а пара токенов живёт
 * тридцать дней. Пока этого списка не было, погасить чужой вход можно было
 * только сменой кода — то есть вылетев самому.
 *
 * Список свой, а не всего бизнеса: сессии сотрудников владелец здесь не
 * видит. Уволить человека он и так может — это гасит его входы разом, — а
 * разглядывать его устройства оснований нет.
 */
@Composable
fun DevicesScreen(onBack: () -> Unit) {
    val graph = LocalGraph.current
    val session = graph.session
    val scope = rememberCoroutineScope()
    val lang = lang()
    val zone = zone()

    var devices by remember { mutableStateOf<List<Device>>(emptyList()) }
    var loaded by remember { mutableStateOf(false) }
    var revoking by remember { mutableStateOf<Device?>(null) }

    suspend fun reload() {
        devices = runCatching { session.devices() }.getOrDefault(emptyList())
        loaded = true
    }

    LaunchedEffect(Unit) { reload() }

    Column(
        Modifier
            .fillMaxSize()
            .background(Brand.board)
            .padding(top = Insets.top.calculateTopPadding()),
    ) {
        ScreenHeader(L(R.string.profile__devices), onBack = onBack)

        if (!loaded) {
            DelayedContent(true) {
                TetrSkeletonList(
                    rows = 3,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 12.dp),
                )
            }
        } else if (devices.isEmpty()) {
            EmptyState(L(R.string.common__empty))
        } else {
            LazyColumn(contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp)) {
                item {
                    Column(Modifier.fillMaxWidth().surfaceCard(20.dp)) {
                        devices.forEachIndexed { index, device ->
                            if (index > 0) HairLine(inset = 14.dp)
                            DeviceRow(device, lang, zone) { revoking = device }
                        }
                    }
                }
                item {
                    Text(
                        L(R.string.profile__devicesNote),
                        fontSize = 11.5.sp,
                        color = Brand.boardMuted,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 12.dp),
                    )
                }
            }
        }
    }

    revoking?.let { device ->
        AlertDialog(
            onDismissRequest = { revoking = null },
            containerColor = Brand.boardSurface,
            title = { Text(L(R.string.profile__deviceRevoke), color = Brand.onBoard) },
            text = { Text(L(R.string.profile__devicesNote), color = Brand.boardMuted) },
            confirmButton = {
                TextButton(onClick = {
                    revoking = null
                    scope.launch {
                        runCatching { session.revokeDevice(device.id) }
                        reload()
                    }
                }) { Text(L(R.string.profile__deviceRevoke), color = Brand.badOnBoard) }
            },
            dismissButton = {
                TextButton(onClick = { revoking = null }) {
                    Text(L(R.string.common__cancel), color = Brand.boardMuted)
                }
            },
        )
    }
}

@Composable
private fun DeviceRow(
    device: Device,
    lang: com.sevarm.tetr.core.i18n.Lang,
    zone: java.time.ZoneId,
    onRevoke: () -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            Modifier
                .size(36.dp)
                .clip(CircleShape)
                .background(Brand.boardInk.copy(alpha = 0.07f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                if (device.isApp) Icons.Filled.PhoneAndroid else Icons.Filled.Language,
                contentDescription = null,
                tint = Brand.grape,
                modifier = Modifier.size(16.dp),
            )
        }

        Column(Modifier.weight(1f)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(
                    /*
                     * Метка устройства, как её назвал клиент. У старых
                     * сессий её нет вовсе — тогда честнее сказать «браузер»
                     * или «приложение», чем выдумать модель телефона.
                     */
                    device.device?.takeIf { it.isNotBlank() }
                        ?: if (device.isApp) {
                            L(R.string.profile__deviceApp)
                        } else {
                            L(R.string.profile__deviceWeb)
                        },
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Brand.onBoard,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (device.current) {
                    Text(
                        L(R.string.profile__deviceThis),
                        fontSize = 10.5.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Brand.goodOnBoard,
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(Brand.goodOnBoard.copy(alpha = 0.16f))
                            .padding(horizontal = 6.dp, vertical = 1.dp),
                    )
                }
            }
            Text(
                L(R.string.profile__deviceLastSeen, Dates.stamp(device.lastSeenAt, lang, zone)),
                fontSize = 11.5.sp,
                color = Brand.boardMuted,
            )
        }

        /*
         * Своё устройство не гасим отсюда: для этого есть выход в профиле,
         * и он честнее — «погасить себя» кнопкой в списке читается как
         * что-то другое.
         */
        if (!device.current) {
            Text(
                L(R.string.profile__deviceRevoke),
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = Brand.badOnBoard,
                modifier = Modifier
                    .pressable(onClick = onRevoke)
                    .padding(6.dp),
            )
        }
    }
}
