package com.sevarm.tetr.design

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sevarm.tetr.R
import com.sevarm.tetr.core.i18n.L

/**
 * Отступы системных панелей.
 *
 * Приложение рисует под строкой состояния и под жестовой полосой: край в
 * край — это норма Android, и полоса своего цвета сверху выглядела бы
 * заплаткой. Но содержимое туда попадать не должно, и каждый экран
 * забирает отступы отсюда, а не считает их сам.
 */
object Insets {
    val top: PaddingValues @Composable get() = WindowInsets.statusBars.asPaddingValues()
    val bottom: PaddingValues @Composable get() = WindowInsets.navigationBars.asPaddingValues()

    /** Клавиатура. Нужна формам: кнопка не должна оказаться под ней. */
    val ime: PaddingValues @Composable get() = WindowInsets.ime.asPaddingValues()
}

/**
 * Экран продукта: полотно табло и место под системные панели.
 *
 * `topBar` рисует не Material, а мы: у продукта своя шапка — круглая
 * кнопка слева, заголовок по центру, симметричная пустота справа. Без
 * последней заголовок стоял бы по центру остатка, а не экрана, и это
 * заметно.
 */
@Composable
fun TetrinScreen(
    modifier: Modifier = Modifier,
    background: Color? = null,
    topBar: (@Composable () -> Unit)? = null,
    bottomBar: (@Composable () -> Unit)? = null,
    content: @Composable (PaddingValues) -> Unit,
) {
    val canvas = background ?: Brand.board
    Column(
        modifier
            .fillMaxSize()
            .background(canvas),
    ) {
        Spacer(Modifier.height(Insets.top.calculateTopPadding()))
        topBar?.invoke()
        Box(Modifier.weight(1f)) {
            content(PaddingValues(0.dp))
        }
        bottomBar?.invoke()
    }
}

/**
 * Шапка экрана: возврат, имя, симметрия.
 *
 * Кнопка возврата обязательна даже там, где работает системный жест: о
 * жесте от края знают не все, а экран без видимого выхода читается
 * ловушкой.
 */
@Composable
fun ScreenHeader(
    title: String,
    /**
     * Вторая строка под именем экрана.
     *
     * Заведена ради карточки дня: владелец помнит не число, а «ту субботу,
     * когда было много», и без дня недели дата из истории ни с чем не
     * связана. В шапке, а не в теле экрана, потому что это часть ответа на
     * вопрос «где я нахожусь», а не показание.
     */
    subtitle: String? = null,
    onBack: (() -> Unit)? = null,
    closeIcon: Boolean = false,
    actions: (@Composable RowScope.() -> Unit)? = null,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (onBack != null) {
            RoundIconButton(
                icon = if (closeIcon) Icons.Filled.Close else Icons.AutoMirrored.Filled.ArrowBack,
                label = L(if (closeIcon) R.string.common__close else R.string.common__back),
                onClick = onBack,
            )
        } else {
            Spacer(Modifier.size(38.dp))
        }

        Column(
            Modifier
                .weight(1f)
                .padding(horizontal = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(1.dp),
        ) {
            Text(
                title,
                fontSize = 17.sp,
                fontWeight = FontWeight.Bold,
                color = Brand.onBoard,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (!subtitle.isNullOrEmpty()) {
                Text(
                    subtitle,
                    fontSize = 11.5.sp,
                    color = Brand.boardMuted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }

        if (actions != null) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
                content = actions,
            )
        } else {
            // симметрия: без пустоты справа заголовок съезжает влево
            Spacer(Modifier.size(38.dp))
        }
    }
}

/** Круглая кнопка-значок: выход из листа, стрелка месяца, колокольчик. */
@Composable
fun RoundIconButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    modifier: Modifier = Modifier,
    tint: Color? = null,
    onClick: () -> Unit,
) {
    Box(
        modifier
            .size(38.dp)
            .clip(CircleShape)
            .background(Brand.boardInk.copy(alpha = 0.07f))
            .pressable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = label,
            tint = tint ?: Brand.onBoard,
            modifier = Modifier.size(17.dp),
        )
    }
}

/**
 * Шапка листа: крестик слева, имя по центру, пустота справа.
 *
 * Отличается от шапки экрана одним — крестиком вместо стрелки. Лист не
 * «предыдущий экран», он поверх, и стрелка обещала бы возврат туда,
 * откуда человек не уходил.
 */
@Composable
fun SheetHeader(title: String, onClose: () -> Unit, actions: (@Composable RowScope.() -> Unit)? = null) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp)
            .padding(top = 6.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RoundIconButton(Icons.Filled.Close, L(R.string.common__close), tint = Brand.boardMuted, onClick = onClose)
        Text(
            title,
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
            color = Brand.onBoard,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 8.dp),
        )
        if (actions != null) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), content = actions)
        } else {
            Spacer(Modifier.width(38.dp))
        }
    }
}

/** Подпись над группой: маленькая, приглушённая, слева. */
@Composable
fun Caption(text: String, modifier: Modifier = Modifier, top: Dp = 6.dp) {
    Text(
        text,
        fontSize = 12.5.sp,
        fontWeight = FontWeight.SemiBold,
        color = Brand.boardMuted,
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 6.dp)
            .padding(top = top),
    )
}
