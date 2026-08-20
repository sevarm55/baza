package com.sevarm.tetr.feature.lock

import androidx.appcompat.app.AppCompatActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sevarm.tetr.LocalGraph
import com.sevarm.tetr.R
import com.sevarm.tetr.core.i18n.L
import com.sevarm.tetr.design.Brand
import com.sevarm.tetr.design.LimeButton
import com.sevarm.tetr.design.QuietButton
import kotlinx.coroutines.launch

/**
 * Экран замка.
 *
 * Ничего, кроме кнопки: показывать здесь цифры смысла нет — ради того,
 * чтобы их не показывать, замок и стоит.
 */
@Composable
fun LockScreen(activity: AppCompatActivity) {
    val graph = LocalGraph.current
    val lock = graph.lock
    val scope = rememberCoroutineScope()

    /**
     * Автоматически пробуем ровно один раз.
     *
     * Иначе получается ловушка: системный запрос закрывает экран целиком,
     * отказ возвращает нас сюда, и запуск тут же зовёт его снова. До
     * кнопок под ним не добраться никогда — ни до повтора, ни до выхода.
     */
    var tried by remember { mutableStateOf(false) }

    val ask: () -> Unit = {
        scope.launch {
            if (lock.authenticate(activity, L(R.string.lock__unlock))) lock.unlocked()
        }
    }

    LaunchedEffect(Unit) {
        if (!tried) {
            tried = true
            if (lock.authenticate(activity, L(R.string.lock__unlock))) lock.unlocked()
        }
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(Brand.heroGradient),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(18.dp),
            modifier = Modifier.padding(horizontal = 40.dp),
        ) {
            Icon(
                Icons.Filled.Lock,
                contentDescription = null,
                tint = Brand.lime,
                modifier = Modifier.size(44.dp),
            )

            Text(
                "TETRIN",
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 4.sp,
                color = Color.White.copy(alpha = 0.7f),
            )

            LimeButton(
                text = L(R.string.lock__unlockWith, lock.kindName),
                onClick = ask,
            )

            /*
             * Выход отсюда обязателен. Замок может не открыться по
             * причинам, которых человек не выбирал: сканер сломался, палец
             * мокрый, код устройства сменили. Без этой кнопки он заперт
             * снаружи собственного приложения — и починить это можно было
             * бы только переустановкой. Вход по телефону и PIN остаётся
             * всегда.
             */
            QuietButton(
                text = L(R.string.lock__usePhone),
                onDark = true,
                onClick = { scope.launch { graph.session.signOut() } },
            )
        }
    }
}
