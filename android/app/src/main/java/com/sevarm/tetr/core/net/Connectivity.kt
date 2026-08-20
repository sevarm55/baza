package com.sevarm.tetr.core.net

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Наблюдение за связью.
 *
 * Нужно ради одного момента: мойщик вышел из подвала, связь появилась — и
 * очередь должна уйти тогда же, а не когда он в следующий раз откроет
 * экран. Ждать системного пробуждения тут глупо: приложение и так на
 * экране.
 *
 * `onReturn` зовётся в момент, когда связь ВЕРНУЛАСЬ, а не при каждом
 * изменении: иначе досылка запускалась бы и на её пропадании.
 */
class Connectivity(context: Context) {

    private val manager = context.getSystemService(ConnectivityManager::class.java)

    private val _online = MutableStateFlow(true)
    val online: StateFlow<Boolean> = _online.asStateFlow()

    var onReturn: (() -> Unit)? = null

    private val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) = update(true)
        override fun onLost(network: Network) = update(hasInternet())
        override fun onUnavailable() = update(false)
    }

    init {
        _online.value = hasInternet()
        runCatching {
            manager?.registerNetworkCallback(
                NetworkRequest.Builder()
                    .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    .build(),
                callback,
            )
        }
    }

    private fun update(now: Boolean) {
        val returned = now && !_online.value
        _online.value = now
        if (returned) onReturn?.invoke()
    }

    private fun hasInternet(): Boolean {
        val active = manager?.activeNetwork ?: return false
        val caps = manager.getNetworkCapabilities(active) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }
}
