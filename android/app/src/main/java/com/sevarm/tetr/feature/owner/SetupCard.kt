package com.sevarm.tetr.feature.owner

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sevarm.tetr.R
import com.sevarm.tetr.core.api.Setup
import com.sevarm.tetr.core.api.SetupStep
import com.sevarm.tetr.core.i18n.L
import com.sevarm.tetr.design.Brand
import com.sevarm.tetr.design.HairLine
import com.sevarm.tetr.design.pressable

/**
 * Начало работы — первый день внутри продукта.
 *
 * Не тур по вкладкам и не мастер из четырнадцати экранов, а ответ на один
 * вопрос: что сделать прямо сейчас. Продукт приходит настроенным — при
 * регистрации бизнес получает свои услуги, термины и роль исполнителя, —
 * поэтому объяснять здесь нечего, кроме следующего шага.
 *
 * Что выполнено, решает СЕРВЕР по данным бизнеса, а не приложение по
 * нажатиям: свои ли цены, есть ли мойщик, есть ли первая запись. Поэтому
 * шаг закрывается сам — и когда мойщика завели с сайта, и когда машину
 * записал не владелец.
 *
 * Своего вида у настройки нет намеренно: она живёт неделю, и продукт не
 * должен на эту неделю выглядеть иначе.
 */
@Composable
fun SetupCard(
    setup: Setup,
    onSkip: () -> Unit,
    onStep: (String) -> Unit,
) {
    Column(
        Modifier
            .fillMaxWidth()
            .padding(top = 10.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(Brand.boardSurface)
            .border(0.8.dp, Brand.boardInk.copy(alpha = 0.07f), RoundedCornerShape(18.dp))
            .padding(horizontal = 12.dp, vertical = 0.dp),
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp)
                .padding(top = 14.dp, bottom = if (setup.complete) 6.dp else 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                if (setup.complete) L(R.string.setup__doneTitle) else L(R.string.setup__title),
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                color = Brand.onBoard,
            )

            if (!setup.complete) {
                Text(
                    L(R.string.setup__progress, setup.done, setup.total),
                    fontSize = 12.sp,
                    color = Brand.boardMuted,
                )
                /*
                 * Полоса — волосок, а не индикатор загрузки. Толстая
                 * поперёк карточки превратила бы список дел в игру с
                 * очками; здесь она отвечает боковым зрением на один
                 * вопрос — далеко ли до конца, — а точное число стоит
                 * рядом словами.
                 */
                val share = if (setup.total > 0) setup.done.toFloat() / setup.total else 0f
                Box(
                    Modifier
                        .width(46.dp)
                        .height(3.dp)
                        .clip(CircleShape)
                        .background(Brand.boardInk.copy(alpha = 0.12f)),
                ) {
                    Box(
                        Modifier
                            .fillMaxWidth(share)
                            .height(3.dp)
                            .clip(CircleShape)
                            .background(Brand.goodOnBoard)
                    )
                }
            }

            Spacer(Modifier.weight(1f))

            /*
             * Убрать блок — тихая кнопка в углу, а не действие наравне с
             * шагами: она ничего не делает с бизнесом. Страшного
             * подтверждения нет, настройку всегда можно вернуть из
             * разделов.
             */
            Text(
                if (setup.complete) L(R.string.setup__doneHide) else L(R.string.setup__skip),
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = Brand.boardMuted,
                modifier = Modifier
                    .pressable(onClick = onSkip)
                    .padding(vertical = 4.dp),
            )
        }

        if (setup.complete) {
            WhatIsNext()
        } else {
            setup.steps.forEachIndexed { index, step ->
                if (index > 0) HairLine()
                StepRow(
                    step = step,
                    number = index + 1,
                    now = !step.done && setup.next == step.key,
                    onStep = onStep,
                )
            }
        }
    }
}

@Composable
private fun StepRow(step: SetupStep, number: Int, now: Boolean, onStep: (String) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 4.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        /*
         * Номер до выполнения, галочка после. Одного цвета для этой разницы
         * мало: приложение открывают и на солнце.
         */
        Box(Modifier.size(22.dp), contentAlignment = Alignment.Center) {
            if (step.done) {
                Box(
                    Modifier
                        .size(22.dp)
                        .clip(CircleShape)
                        .background(Brand.goodOnBoard.copy(alpha = 0.16f))
                )
                Icon(
                    Icons.Filled.Check,
                    contentDescription = null,
                    tint = Brand.goodOnBoard,
                    modifier = Modifier.size(12.dp),
                )
            } else {
                Box(
                    Modifier
                        .size(22.dp)
                        .clip(CircleShape)
                        .border(1.5.dp, Brand.boardInk.copy(alpha = 0.2f), CircleShape)
                )
                Text(
                    "$number",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = Brand.boardMuted,
                )
            }
        }

        Column(Modifier.weight(1f)) {
            Text(
                nameOf(step.key),
                fontSize = 14.sp,
                fontWeight = if (step.done) FontWeight.Medium else FontWeight.SemiBold,
                /*
                 * Выполненное гаснет, но не зачёркивается: зачёркнутый
                 * текст читается как ошибочный, а шаг сделан правильно.
                 */
                color = if (step.done) Brand.boardMuted else Brand.onBoard,
            )
            /*
             * Объяснение только у следующего шага — того единственного, к
             * которому оно относится сейчас. Развернуть все четыре значило
             * бы поставить на главный экран стену текста в тот
             * единственный день, когда человек ещё ничего про продукт не
             * знает.
             */
            if (now) {
                Text(noteOf(step.key), fontSize = 12.5.sp, color = Brand.boardMuted)
            }
        }

        if (!step.done) {
            val cta = ctaOf(step.key)
            if (cta != null) {
                /*
                 * Подпись действия: лаймовая у следующего шага, тихая у
                 * остальных. Одного размера у обоих — разный размер объявил
                 * бы один из них ошибкой.
                 */
                Text(
                    cta,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = if (now) Brand.onLime else Brand.onBoard,
                    maxLines = 1,
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(if (now) Brand.lime else Brand.boardInk.copy(alpha = 0.06f))
                        .pressable { onStep(step.key) }
                        .padding(horizontal = 11.dp, vertical = 7.dp),
                )
            }
        }
    }
}

/**
 * Конец настройки.
 *
 * Не праздник с конфетти, а сообщение о том, что дальше продукт работает
 * сам. Это последнее, что настройка говорит владельцу, и сказать она
 * обязана не про кнопки, а про то, как теперь устроен его день.
 */
@Composable
private fun WhatIsNext() {
    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 4.dp)
            .padding(bottom = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(L(R.string.setup__doneNote), fontSize = 13.sp, color = Brand.boardMuted)

        listOf(
            L(R.string.setup__nextWork) to L(R.string.setup__nextWorkNote),
            L(R.string.setup__nextMoney) to L(R.string.setup__nextMoneyNote),
            L(R.string.setup__nextControl) to L(R.string.setup__nextControlNote),
            L(R.string.setup__nextReports) to L(R.string.setup__nextReportsNote),
        ).forEach { (title, note) ->
            Column {
                Text(title, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Brand.onBoard)
                Text(note, fontSize = 12.5.sp, color = Brand.boardMuted)
            }
        }
    }
}

@Composable
private fun nameOf(key: String): String = when (key) {
    "business" -> L(R.string.setup__stepBusiness)
    "services" -> L(R.string.setup__stepServices)
    "staff" -> L(R.string.setup__stepStaff)
    else -> L(R.string.setup__stepFirst)
}

@Composable
private fun noteOf(key: String): String = when (key) {
    "business" -> L(R.string.setup__stepBusinessNote)
    "services" -> L(R.string.setup__stepServicesNote)
    "staff" -> L(R.string.setup__stepStaffNote)
    else -> L(R.string.setup__stepFirstNote)
}

/**
 * Действие шага.
 *
 * Ведёт в настоящий раздел приложения, а не на следующий экран мастера:
 * цены правят там же, где их будут править каждый месяц. У шага «бизнес»
 * действия нет вовсе — он закрывается сам при регистрации.
 */
@Composable
private fun ctaOf(key: String): String? = when (key) {
    "services" -> L(R.string.setup__stepServicesCta)
    "staff" -> L(R.string.setup__stepStaffCta)
    "firstOrder" -> L(R.string.setup__stepFirstCta)
    else -> null
}
