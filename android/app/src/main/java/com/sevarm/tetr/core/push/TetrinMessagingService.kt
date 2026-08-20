package com.sevarm.tetr.core.push

import android.app.PendingIntent
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.sevarm.tetr.MainActivity
import com.sevarm.tetr.R
import com.sevarm.tetr.TetrinApp

/**
 * Приём уведомлений.
 *
 * Сервер шлёт готовый текст: слова про выручку и смены собираются там же,
 * где считаются деньги, и переводить их второй раз на телефоне значило бы
 * завести второе место, где формулировка может разойтись.
 *
 * Тап открывает нужный раздел. Не «главный экран»: уведомление про
 * зарплату, открывающее смену, заставляет искать то, о чём только что
 * сообщили. Раздел приходит в `data.route` — тем же ключом, каким его
 * называет колокольчик.
 */
class TetrinMessagingService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        (application as? TetrinApp)?.graph?.push?.onNewToken(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val notification = message.notification
        val title = notification?.title ?: message.data["title"] ?: return
        val body = notification?.body ?: message.data["body"].orEmpty()

        /*
         * Разрешение могло быть отозвано после того, как токен уже уехал
         * на сервер. Публиковать в таком состоянии нечего, а падать —
         * тем более.
         */
        val manager = NotificationManagerCompat.from(this)
        if (!manager.areNotificationsEnabled()) return

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            message.data["route"]?.let { putExtra(MainActivity.EXTRA_ROUTE, it) }
        }
        val pending = PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val built = NotificationCompat.Builder(this, getString(R.string.notif_channel_orders_id))
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(getColor(R.color.brand_grape_deep))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build()

        /*
         * Один и тот же номер: уведомления о записях замещают друг друга.
         * Сорок машин за смену — это сорок строк в шторке, и владелец
         * выключит их целиком раньше, чем дочитает третью.
         */
        runCatching { manager.notify(ORDERS_ID, built) }
    }

    private companion object {
        const val ORDERS_ID = 1001
    }
}
