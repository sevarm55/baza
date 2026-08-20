package com.sevarm.tetr.nav

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.sevarm.tetr.LocalGraph
import com.sevarm.tetr.core.session.Session
import com.sevarm.tetr.design.Brand
import com.sevarm.tetr.design.TetrLoader
import com.sevarm.tetr.feature.expired.ExpiredScreen
import com.sevarm.tetr.feature.lock.LockScreen
import com.sevarm.tetr.feature.login.LoginScreen

/**
 * Что показывать: замок, вход, стену или сам продукт.
 *
 * Роль приходит с сервера в `/bootstrap`, и приложение не решает её само.
 * Владелец, который сам моет машины, видит все вкладки — на маленькой
 * мойке это один и тот же человек.
 */
@Composable
fun RootScreen(
    activity: AppCompatActivity,
    requestedRoute: String?,
    onRouteHandled: () -> Unit,
) {
    val graph = LocalGraph.current
    val session = graph.session
    val state by session.state.collectAsState()
    val locked by graph.lock.locked.collectAsState()
    val access by session.access.collectAsState()
    val generation by session.generation.collectAsState()

    LaunchedEffect(Unit) {
        if (session.state.value == Session.State.CHECKING) {
            session.start()
            graph.lock.lockIfNeeded(hasSession = session.state.value == Session.State.SIGNED_IN)
        }
    }

    when (state) {
        /*
         * Единственный экран продукта, который отбирает всё сразу, и
         * единственный повод для этого: приложение ещё не знает, чьё оно
         * и что показывать. Всё остальное ожидание живёт в скелете
         * раздела или в занятой кнопке.
         *
         * Подписи под фигурой нет. «Բեռնվում է…» под движущимся
         * загрузчиком не добавляет ни одного факта, а занимает строку и
         * задаёт вопрос «а сколько ещё».
         */
        Session.State.CHECKING -> Box(
            Modifier
                .fillMaxSize()
                .background(Brand.grapeDeep)
                .background(Brand.splashGlow),
            contentAlignment = Alignment.Center,
        ) { TetrLoader(size = 40.dp, tint = Brand.lime) }

        Session.State.SIGNED_OUT -> LoginScreen(activity = activity)

        Session.State.SIGNED_IN -> when {
            locked -> LockScreen(activity = activity)

            /*
             * Срок вышел — вместо всего продукта один экран. Стоит выше
             * замка по смыслу, но ниже по порядку: сначала человек
             * доказывает, что это его телефон, и только потом узнаёт про
             * счёт.
             */
            access?.canRead == false -> ExpiredScreen()

            else -> {
                /*
                 * Разрешение на уведомления спрашиваем ЗДЕСЬ, а не на
                 * запуске: человек уже внутри, и системное окно приходит к
                 * тому, кто понимает, о чём его спрашивают. Запрос без
                 * объяснения на первом экране отклоняют не глядя, а вернуть
                 * его потом можно только через настройки телефона.
                 *
                 * Спрашиваем у всех, а не только у владельца, как в iOS: там
                 * открытая смена живёт в Live Activity, которой разрешение не
                 * нужно, а здесь она живёт постоянным уведомлением в шторке —
                 * то есть без разрешения мойщик остался бы без неё.
                 */
                AskNotifications()

                /*
                 * Смена точки пересоздаёт всё дерево: состояние экранов
                 * обнуляется, загрузки перезапускаются, ответы прежней
                 * мойки приземляются в выброшенный вид. Без этого на
                 * экране остались бы правильные цифры чужой мойки — а это
                 * не выглядит ошибкой вовсе.
                 */
                androidx.compose.runtime.key(generation) {
                    MainScaffold(
                        activity = activity,
                        requestedRoute = requestedRoute,
                        onRouteHandled = onRouteHandled,
                    )
                }
            }
        }
    }
}

/**
 * Один системный запрос на уведомления и регистрация токена следом.
 *
 * Спрашиваем ровно один раз за запуск: система сама перестаёт показывать
 * окно после двух отказов, и долбить её тем же запросом при каждом
 * возвращении на экран бессмысленно — человек увидит не окно, а ничего.
 *
 * Отказ ничего не ломает. Без разрешения не будет двух вещей: уведомлений
 * о записях у владельца и открытой смены в шторке у мойщика. Всё
 * остальное работает как работало, и просить второй раз мы не станем.
 *
 * До Android 13 разрешения не существует вовсе: там уведомления включены
 * по умолчанию, и спрашивать нечего — сразу забираем токен.
 */
@Composable
private fun AskNotifications() {
    val graph = LocalGraph.current
    var asked by rememberSaveable { mutableStateOf(false) }

    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) {
        /*
         * Токен забираем при любом ответе. Отказ касается показа, а не
         * доставки: человек может включить уведомления в настройках
         * телефона позже, и тогда сервер уже должен знать это устройство.
         */
        graph.push.register()
    }

    LaunchedEffect(asked) {
        if (asked) return@LaunchedEffect
        asked = true
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !graph.push.granted) {
            launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            graph.push.register()
        }
    }
}
