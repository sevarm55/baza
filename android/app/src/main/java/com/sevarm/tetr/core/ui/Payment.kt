package com.sevarm.tetr.core.ui

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Circle
import androidx.compose.material.icons.filled.ConfirmationNumber
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import com.sevarm.tetr.R
import com.sevarm.tetr.core.i18n.L
import com.sevarm.tetr.design.Brand

/**
 * Способ оплаты словом и значком.
 *
 * В ленте способ стоял словом, и строка «Դավիթ · Թափք · Փոխանցում»
 * читалась целиком — а нужен из неё один взгляд: наличные это были или
 * карта. Значок отвечает на это мгновенно и занимает место одной буквы.
 * Там, где строка и так короткая, остаётся слово: значок карты и значок
 * перевода на десяти точках различаются только если знать, что они разные.
 */
@Composable
fun paymentLabel(key: String): String = when (key) {
    "cash" -> L(R.string.payment__cash)
    "card" -> L(R.string.payment__card)
    "transfer" -> L(R.string.payment__transfer)
    "pass" -> L(R.string.payment__pass)
    else -> key
}

fun paymentIcon(key: String): ImageVector = when (key) {
    "cash" -> Icons.Filled.Payments
    "card" -> Icons.Filled.CreditCard
    "transfer" -> Icons.Filled.SwapHoriz
    "pass" -> Icons.Filled.ConfirmationNumber
    else -> Icons.Filled.Circle
}

/**
 * Цвет способа оплаты в разрезе.
 *
 * Из той же спокойной семьи, что и карточки показателей: мята, лаванда,
 * песок. Новых акцентов здесь не заводится — лайм и грейп в продукте уже
 * значат другое.
 */
@Composable
fun paymentInk(key: String): Color = when (key) {
    "cash" -> Brand.mintInk
    "card" -> Brand.lavenderInk
    "transfer" -> Brand.sandInk
    "pass" -> Brand.grape
    else -> Brand.boardMuted
}
