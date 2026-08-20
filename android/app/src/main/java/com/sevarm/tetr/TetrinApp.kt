package com.sevarm.tetr

import android.app.Application
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import androidx.work.Configuration
import com.sevarm.tetr.core.session.Session
import com.sevarm.tetr.core.work.QueueFlushWorker

/**
 * Приложение целиком.
 *
 * Держит граф зависимостей и два наблюдения за жизнью процесса: замок при
 * уходе в фон и досылку очереди оттуда же. Оба живут здесь, а не в
 * Activity, ровно потому, что Activity пересоздаётся при повороте и при
 * смене темы, а смена и очередь от этого зависеть не должны.
 */
class TetrinApp : Application(), Configuration.Provider {

    lateinit var graph: AppGraph
        private set

    override fun onCreate() {
        super.onCreate()
        graph = AppGraph(this)
        graph.start()

        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStop(owner: LifecycleOwner) {
                /*
                 * Ушли в фон — закрываем замок и просим систему досылать.
                 * Порядок не важен, а вот то, что это происходит именно
                 * здесь, важно: человек может уйти в камеру и вернуться, и
                 * пересоздание Activity этого события не даёт.
                 */
                graph.lock.lockIfNeeded(
                    hasSession = graph.session.state.value == Session.State.SIGNED_IN
                )
                if (graph.queue.waiting(graph.session.tenant.value?.id).isNotEmpty()) {
                    QueueFlushWorker.now(this@TetrinApp)
                }
            }
        })
    }

    /**
     * Своя настройка WorkManager: штатный инициализатор выключен в
     * манифесте, потому что очередь заводится вместе с приложением, а не
     * при первом обращении к системе.
     */
    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setMinimumLoggingLevel(if (BuildConfig.DEBUG) android.util.Log.DEBUG else android.util.Log.ERROR)
            .build()
}
