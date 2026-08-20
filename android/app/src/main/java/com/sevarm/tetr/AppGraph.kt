package com.sevarm.tetr

import android.content.Context
import androidx.compose.runtime.staticCompositionLocalOf
import com.sevarm.tetr.core.api.ApiClient
import com.sevarm.tetr.core.i18n.LangStore
import com.sevarm.tetr.core.lock.BiometricLock
import com.sevarm.tetr.core.net.Connectivity
import com.sevarm.tetr.core.push.Push
import com.sevarm.tetr.core.push.ShiftBoard
import com.sevarm.tetr.core.queue.OrderQueue
import com.sevarm.tetr.core.session.SecureStore
import com.sevarm.tetr.core.session.Session
import com.sevarm.tetr.core.work.QueueFlushWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.Dispatchers

/**
 * Граф зависимостей приложения.
 *
 * Собран руками, а не генератором. Причина не в нелюбви к Hilt, а в
 * размере: зависимостей здесь девять, живут они все ровно столько же,
 * сколько процесс, и ни у одной нет двух реализаций. Генератор в такой
 * задаче добавляет обработчик аннотаций, свою версию, привязанную к
 * версии Kotlin, и слой сгенерированных классов между причиной и
 * следствием — а взамен экономит вот этот один файл.
 *
 * Правило при этом соблюдается то же, ради которого DI и заводят: ни один
 * экран и ни одна модель не достают зависимость сами. Всё приходит через
 * конструктор или через `LocalGraph`, и в тесте подменяется одной
 * строчкой.
 */
class AppGraph(private val app: Context) {

    /** Свой поток жизни: он переживает любую Activity и любой экран. */
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    val langStore = LangStore(app)
    val api = ApiClient(langStore)
    val secure = SecureStore(app)
    val queue = OrderQueue(app, api)
    val lock = BiometricLock(app)
    val connectivity = Connectivity(app)

    val session = Session(
        context = app,
        api = api,
        secure = secure,
        langStore = langStore,
        scope = scope,
    )

    val push = Push(app, api, scope)
    val shiftBoard = ShiftBoard(app, langStore)

    fun start() {
        langStore.warmUp()

        push.use(session)
        session.shiftBoard = shiftBoard
        push.ensureChannels()

        /*
         * Связь вернулась — досылаем тут же, не дожидаясь, пока человек
         * снова откроет экран смены.
         */
        connectivity.onReturn = { QueueFlushWorker.now(app) }
        QueueFlushWorker.schedule(app)
    }

    fun stop() = scope.cancel()
}

/**
 * Граф внутри дерева видов.
 *
 * `staticCompositionLocalOf`, а не `compositionLocalOf`: значение не
 * меняется за жизнь процесса, и перерисовывать по нему нечего.
 */
val LocalGraph = staticCompositionLocalOf<AppGraph> {
    error("AppGraph не предоставлен: обёртка TetrinTheme стоит выше по дереву")
}
