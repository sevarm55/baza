package com.sevarm.tetr.core.push

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.util.Log
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessaging
import com.sevarm.tetr.R
import com.sevarm.tetr.core.api.ApiClient
import com.sevarm.tetr.core.api.field
import com.sevarm.tetr.core.api.jsonBody
import com.sevarm.tetr.core.i18n.L
import com.sevarm.tetr.core.session.Session
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * Уведомления.
 *
 * Разрешение спрашиваем не на запуске, а после входа и только у владельца:
 * мойщику уведомления не приходят вовсе, а системный запрос без объяснения
 * на первом экране отклоняют не глядя — и вернуть его потом можно только
 * через настройки телефона.
 *
 * ПОЧЕМУ ТОКЕН МОЖЕТ НЕ ПОЯВИТЬСЯ. Firebase поднимается из
 * `google-services.json`, которого в репозитории нет: это чужой ключ.
 * Пока его не положили рядом с `app/build.gradle.kts`, `FirebaseMessaging`
 * бросает при первом же обращении, мы это глотаем, и приложение работает
 * целиком — просто молча. Появился файл — появились и уведомления, без
 * единой правки кода.
 *
 * ПРО СЕРВЕР. Маршрут `push/token` сегодня рассылает только через APNs
 * (`lib/push.ts`), то есть на iOS. Android присылает свой токен с пометкой
 * `platform: "android"` — лишнее поле сервер игнорирует, ничего не ломая,
 * — но доставка заработает только после того, как на сервере появится
 * ветка FCM. Это единственное место продукта, где Android ждёт сервер.
 */
class Push(
    private val context: Context,
    private val api: ApiClient,
    private val scope: CoroutineScope,
) : Session.PushHooks {

    /** Токен, который выдала система. Держим, чтобы отозвать при выходе. */
    private var deviceToken: String? = null

    private var session: Session? = null

    fun use(session: Session) {
        this.session = session
        session.push = this
        // токен мог прийти раньше, чем поднялась сессия
        if (deviceToken != null) upload()
    }

    /** Разрешение уже дано системой. */
    val granted: Boolean
        get() = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED

    /**
     * Каналы. Их два, и это не формальность: «новая запись» приходит сорок
     * раз за смену и должна молчать, а открытая смена вообще не событие —
     * она висит в шторке, пока идёт.
     */
    fun ensureChannels() {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        manager.createNotificationChannel(
            NotificationChannel(
                context.getString(R.string.notif_channel_orders_id),
                L(R.string.notif__ordersChannel),
                NotificationManager.IMPORTANCE_DEFAULT,
            )
        )
        manager.createNotificationChannel(
            NotificationChannel(
                context.getString(R.string.notif_channel_shift_id),
                L(R.string.notif__shiftChannel),
                // Открытая смена не звенит: она справка, а не событие.
                NotificationManager.IMPORTANCE_LOW,
            ).apply { setShowBadge(false) }
        )
    }

    /**
     * Забрать токен и отдать его серверу.
     *
     * Зовётся после того, как человек ответил на системный запрос: без
     * разрешения токен всё равно выдадут, но показывать по нему нечего.
     */
    fun register() {
        scope.launch {
            val token = fetchToken() ?: return@launch
            deviceToken = token
            upload()
        }
    }

    private suspend fun fetchToken(): String? = suspendCancellableCoroutine { cont ->
        runCatching {
            FirebaseMessaging.getInstance().token
                .addOnSuccessListener { if (cont.isActive) cont.resume(it) }
                .addOnFailureListener {
                    Log.w(TAG, "токен не выдан: ${it.javaClass.simpleName}")
                    if (cont.isActive) cont.resume(null)
                }
        }.onFailure {
            // Firebase не настроен — приложение работает без уведомлений
            Log.w(TAG, "Firebase не поднят: ${it.javaClass.simpleName}")
            if (cont.isActive) cont.resume(null)
        }
    }

    /** Система выдала новый токен — старый уже недействителен. */
    fun onNewToken(token: String) {
        deviceToken = token
        upload()
    }

    private fun upload() {
        val session = session ?: return
        val token = deviceToken ?: return
        scope.launch {
            runCatching {
                session.authed { access ->
                    api.call(
                        "push/token",
                        method = "POST",
                        body = jsonBody {
                            field("token", token)
                            /*
                             * `sandbox` — понятие APNs, у FCM его нет.
                             * Шлём `false`, чтобы старый сервер не решил,
                             * что это тестовый токен Apple, и не пытался
                             * достучаться в песочницу.
                             */
                            field("sandbox", false)
                            /*
                             * Лишнее для сегодняшнего сервера поле: он
                             * читает только `token` и `sandbox`. Нужно
                             * тому серверу, который научится FCM, — чтобы
                             * различать, куда слать.
                             */
                            field("platform", "android")
                        },
                        token = access,
                    )
                }
            }
        }
    }

    /**
     * Заново привязать токен после перехода на другую точку.
     *
     * Запись о токене принадлежит участию, а не телефону: у владельца двух
     * моек их две, по одной на каждую, и уведомления идут с обеих. Пока
     * приложение не заявит себя на новой точке, она молчит — а тишину
     * человек воспринимает не как поломку, а как «уведомлений не было».
     */
    override suspend fun reupload() {
        if (deviceToken != null) upload()
    }

    /**
     * Отозвать токен при выходе.
     *
     * Иначе на телефон, с которого человек вышел, продолжали бы приходить
     * уведомления о чужой выручке — а телефон на мойке переходит из рук в
     * руки.
     */
    override suspend fun revoke() {
        val session = session ?: return
        val token = deviceToken ?: return
        runCatching {
            session.authed { access ->
                api.call(
                    "push/token",
                    method = "DELETE",
                    body = jsonBody { field("token", token) },
                    token = access,
                )
            }
        }
        deviceToken = null
    }

    private companion object {
        const val TAG = "tetrin.push"
    }
}
