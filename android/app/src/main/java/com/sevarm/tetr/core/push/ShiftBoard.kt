package com.sevarm.tetr.core.push

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.sevarm.tetr.MainActivity
import com.sevarm.tetr.R
import com.sevarm.tetr.core.api.Shift
import com.sevarm.tetr.core.api.Tenant
import com.sevarm.tetr.core.i18n.L
import com.sevarm.tetr.core.i18n.LangStore
import com.sevarm.tetr.core.i18n.Ln
import com.sevarm.tetr.core.i18n.Terms
import com.sevarm.tetr.core.i18n.money
import com.sevarm.tetr.core.queue.OrderQueue
import com.sevarm.tetr.core.session.Session

/**
 * Открытая смена в шторке.
 *
 * Это тот же ответ, что Live Activity в iOS, только средствами Android:
 * постоянное уведомление, которое живёт, пока смена открыта, и обновляется
 * после каждой машины. Мойщик держит телефон в кармане мокрыми руками —
 * ему нужно видеть выручку и наличные, не разблокируя экран.
 *
 * ПОЧЕМУ НЕ ФОНОВАЯ СЛУЖБА. Foreground service дал бы то же самое, но
 * стоил бы разрешения `FOREGROUND_SERVICE`, объявления типа службы и — с
 * Android 14 — обоснования перед магазином. Смена при этом не считает
 * ничего в фоне: цифры приходят с сервера, когда приложение живо. Служба
 * охраняла бы процесс, которому нечего делать.
 *
 * Табло не врёт при пропавшей связи: только что записанная машина сразу
 * прибавляется к счётчику из локальной очереди и помечается ожидающей.
 */
class ShiftBoard(
    private val context: Context,
    private val langStore: LangStore,
) : Session.ShiftBoardHooks {

    private val manager = NotificationManagerCompat.from(context)

    /**
     * Чья смена сейчас на табло. Нужно, чтобы после перехода на другую
     * точку в шторке не осталась смена прежней мойки с её цифрами.
     */
    private var shownFor: String? = null

    fun sync(shift: Shift, tenant: Tenant, pending: List<OrderQueue.Item>) {
        if (shownFor != null && shownFor != tenant.id) end()

        if (!shift.onShift) {
            end()
            return
        }
        if (!manager.areNotificationsEnabled()) return

        val lang = langStore.current.value
        val pendingRevenue = pending.sumOf { it.price }
        val pendingCash = pending.filter { it.payment == "cash" }.sumOf { it.price }

        val count = shift.count + pending.size
        val revenue = shift.revenue + pendingRevenue
        val cash = shift.cashSoFar + pendingCash

        val unit = Terms.unitWord(count, tenant.unitOne, lang)
        val title = "${tenant.name} · ${L(R.string.work__onShift)}"
        val line = buildString {
            append("$count $unit")
            append(" · ")
            append(money(revenue, tenant.currency, lang))
            if (cash > 0) {
                append(" · ")
                append("${L(R.string.payment__cash)} ${money(cash, tenant.currency, lang)}")
            }
        }
        val extra = if (pending.isNotEmpty()) Ln(R.plurals.shift__waitingToSend, pending.size) else null

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(MainActivity.EXTRA_ROUTE, "shift")
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            1,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val built = NotificationCompat.Builder(context, context.getString(R.string.notif_channel_shift_id))
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(context.getColor(R.color.brand_grape_deep))
            .setContentTitle(title)
            .setContentText(line)
            .apply { extra?.let { setSubText(it) } }
            /*
             * Постоянное: смена идёт, и смахнуть её из шторки нельзя —
             * иначе мойщик решит, что закрыл смену, а она открыта.
             */
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(pendingIntent)
            .build()

        runCatching { manager.notify(SHIFT_ID, built) }
        shownFor = tenant.id
    }

    /** Смена закрыта — табло снимаем сразу, не дожидаясь ответа сервера. */
    fun end() {
        runCatching { manager.cancel(SHIFT_ID) }
        shownFor = null
    }

    override fun endAll() = end()

    private companion object {
        const val SHIFT_ID = 1002
    }
}
