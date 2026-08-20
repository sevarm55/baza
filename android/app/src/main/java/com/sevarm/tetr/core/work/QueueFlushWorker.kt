package com.sevarm.tetr.core.work

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.sevarm.tetr.TetrinApp
import java.util.concurrent.TimeUnit

/**
 * Досылка очереди, когда приложение закрыто.
 *
 * Без неё обещание «не потеряется» держалось бы на честном слове: запись,
 * сделанная во дворе без связи, лежала бы в телефоне до тех пор, пока
 * мойщик снова не откроет экран смены. А он не откроет — он пошёл к
 * следующей машине, а к телефону вернётся вечером.
 *
 * Два пути, и они дополняют друг друга:
 *
 *   система будит по расписанию — работает и с закрытым приложением, но
 *                                 когда сочтёт нужным;
 *   связь вернулась             — сразу, но только пока приложение живо.
 *
 * Ни один из них не гарантирован сам по себе, поэтому оба. Это тот же
 * расклад, что `BGTaskScheduler` плюс `NWPathMonitor` в iOS.
 */
class QueueFlushWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val graph = (applicationContext as? TetrinApp)?.graph ?: return Result.success()
        val session = graph.session
        val queue = graph.queue

        /*
         * Не вошли — досылать нечего и некуда. Это не ошибка: человек мог
         * выйти между записью и пробуждением.
         */
        if (session.state.value != com.sevarm.tetr.core.session.Session.State.SIGNED_IN) {
            return Result.success()
        }

        queue.reload()
        if (queue.waiting(session.tenant.value?.id).isEmpty()) return Result.success()

        val sent = queue.flush(session)
        /*
         * Ничего не ушло при живой сети — значит сервер отказал, и
         * повторять тем же телом бессмысленно: отвергнутые записи уже
         * помечены и ждут решения человека.
         */
        return if (sent > 0) Result.success() else Result.retry()
    }

    companion object {
        private const val PERIODIC = "tetrin.queue.periodic"
        private const val ONE_SHOT = "tetrin.queue.now"

        private val onlyWithNetwork = Constraints.Builder()
            // без сети досылать нечего, и будить телефон незачем
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        /**
         * Постоянная заявка. Пятнадцать минут — системный минимум для
         * периодических задач; просить чаще нельзя, а реже незачем.
         */
        fun schedule(context: Context) {
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                PERIODIC,
                ExistingPeriodicWorkPolicy.KEEP,
                PeriodicWorkRequestBuilder<QueueFlushWorker>(15, TimeUnit.MINUTES)
                    .setConstraints(onlyWithNetwork)
                    .build(),
            )
        }

        /** Связь вернулась или приложение уходит в фон с непустой очередью. */
        fun now(context: Context) {
            WorkManager.getInstance(context).enqueueUniqueWork(
                ONE_SHOT,
                ExistingWorkPolicy.REPLACE,
                OneTimeWorkRequestBuilder<QueueFlushWorker>()
                    .setConstraints(onlyWithNetwork)
                    .build(),
            )
        }
    }
}
