package com.sevarm.tetr

import android.content.Intent
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.sevarm.tetr.core.i18n.LocalLang
import com.sevarm.tetr.design.TetrinTheme
import com.sevarm.tetr.nav.RootScreen

/**
 * Единственная Activity.
 *
 * Одна, а не по одной на экран: навигация живёт в Compose, а Activity
 * отвечает за то, что снаружи её нет, — заставку, края экрана, входящую
 * ссылку из уведомления и биометрический запрос, которому нужен
 * FragmentActivity.
 */
class MainActivity : AppCompatActivity() {

    /** Куда идти после запуска: приходит из уведомления или из ссылки. */
    private val pendingRoute = mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)

        /*
         * Заставка держится, пока приложение выясняет, есть ли живой вход.
         * Иначе человек видит вспышку экрана входа, которая через полсекунды
         * сменяется сменой, — и первое, что продукт про себя сообщает, это
         * «я мигаю».
         */
        val session = (application as TetrinApp).graph.session
        splash.setKeepOnScreenCondition {
            session.state.value == com.sevarm.tetr.core.session.Session.State.CHECKING
        }

        // Края экрана отдаём продукту: полотно уходит под строку состояния
        // и под жестовую полосу, а отступы разбираются самими экранами.
        enableEdgeToEdge()

        pendingRoute.value = routeOf(intent)

        setContent {
            val graph = (application as TetrinApp).graph
            val lang by graph.langStore.current.collectAsState()

            /*
             * Пересборка дерева по языку — то же, что `.id(lang)` в iOS:
             * новые строки встают на место сразу, а не на следующем
             * открытии экрана.
             */
            key(lang) {
                CompositionLocalProvider(
                    LocalGraph provides graph,
                    LocalLang provides lang,
                ) {
                    TetrinTheme {
                        val route = remember { pendingRoute }
                        RootScreen(
                            activity = this,
                            requestedRoute = route.value,
                            onRouteHandled = { route.value = null },
                        )
                    }
                }
            }
        }
    }

    /**
     * Приложение уже открыто, и пришло уведомление.
     *
     * `singleTask` в манифесте не даёт создать вторую копию, поэтому
     * маршрут приезжает сюда, а не в `onCreate`. Без этого тап по
     * уведомлению просто поднимал бы то, что было на экране.
     */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        pendingRoute.value = routeOf(intent)
    }

    /**
     * Куда ведёт то, чем нас открыли.
     *
     * Два источника и один словарь: `route` из уведомления и путь
     * входящей ссылки. Адрес кабинета при этом не переносится один в один
     * — у приложения свои разделы, и `/owner/expenses` в браузере это
     * «расходы» здесь, а не третий уровень вложенности.
     */
    private fun routeOf(intent: Intent?): String? {
        intent?.getStringExtra(EXTRA_ROUTE)?.let { return it }
        val path = intent?.data?.path ?: return null
        return when {
            path.startsWith("/work") -> "shift"
            path.startsWith("/owner/payroll") -> "payroll"
            path.startsWith("/owner/clients") -> "clients"
            path.startsWith("/owner/expenses") -> "expenses"
            path.startsWith("/owner/services") -> "services"
            path.startsWith("/owner/staff") -> "staff"
            path.startsWith("/owner/report") -> "report"
            path.startsWith("/owner") -> "summary"
            else -> null
        }
    }

    companion object {
        const val EXTRA_ROUTE = "tetrin.route"
    }
}
