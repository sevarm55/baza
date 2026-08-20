package com.sevarm.tetr.design

import android.provider.Settings
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext

/**
 * Выключил ли человек анимации.
 *
 * Android держит это тремя шкалами в настройках разработчика и одним
 * переключателем «Удалить анимацию» в специальных возможностях; все они
 * сводятся к нулю в `Settings.Global.ANIMATOR_DURATION_SCALE`. Compose сам
 * это не учитывает — анимации отрабатывают как обычно, — и без явной
 * проверки настройка, которую человек включил не просто так, ничего бы не
 * меняла.
 *
 * Признак работы при этом остаётся: загрузчик не замирает, он дышит
 * прозрачностью. Настройка запрещает движение, а не сообщение о том, что
 * приложение занято.
 */
@Composable
fun reduceMotion(): Boolean {
    val context = LocalContext.current
    return remember(context) {
        runCatching {
            Settings.Global.getFloat(
                context.contentResolver,
                Settings.Global.ANIMATOR_DURATION_SCALE,
                1f,
            ) == 0f
        }.getOrDefault(false)
    }
}
