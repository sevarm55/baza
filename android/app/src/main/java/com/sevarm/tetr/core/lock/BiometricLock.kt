package com.sevarm.tetr.core.lock

import android.content.Context
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.fragment.app.FragmentActivity
import com.sevarm.tetr.R
import com.sevarm.tetr.core.i18n.L
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * Замок на приложении.
 *
 * В нём лежит выручка бизнеса и зарплаты людей, а телефон мойщика на мойке
 * живёт где придётся. PIN спрашивать при каждом запуске — значит сорок раз
 * в смену; отпечаток снимает это одним касанием.
 *
 * Разрешены и биометрия, и код устройства (`DEVICE_CREDENTIAL`), а не
 * только первая: с одной биометрией человек с мокрыми руками оказался бы
 * заперт снаружи — приложение бы работало, а войти было нельзя.
 */
class BiometricLock(private val context: Context) {

    private val prefs = context.getSharedPreferences("tetr.lock", Context.MODE_PRIVATE)

    private val _locked = MutableStateFlow(false)
    val locked: StateFlow<Boolean> = _locked.asStateFlow()

    private val _enabled = MutableStateFlow(prefs.getBoolean(KEY, true))
    val enabled: StateFlow<Boolean> = _enabled.asStateFlow()

    fun setEnabled(on: Boolean) {
        _enabled.value = on
        prefs.edit().putBoolean(KEY, on).apply()
        if (!on) _locked.value = false
    }

    /** Есть ли чем открывать: биометрия или хотя бы код устройства. */
    val available: Boolean
        get() = BiometricManager.from(context).canAuthenticate(ALLOWED) ==
            BiometricManager.BIOMETRIC_SUCCESS

    /**
     * Как назвать это человеку.
     *
     * Android не сообщает, отпечаток у телефона или лицо, — только классы
     * стойкости. Поэтому слово общее, и это честнее, чем угадывать:
     * подпись «Face ID» на телефоне со сканером пальца сбивает сильнее,
     * чем нейтральная.
     */
    val kindName: String
        get() {
            val manager = BiometricManager.from(context)
            val strong = manager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            return if (strong == BiometricManager.BIOMETRIC_SUCCESS) {
                L(R.string.lock__biometrics)
            } else {
                L(R.string.lock__code)
            }
        }

    /**
     * Закрыть, если есть что закрывать. Зовётся на запуске и при уходе
     * приложения в фон.
     */
    fun lockIfNeeded(hasSession: Boolean) {
        _locked.value = _enabled.value && available && hasSession
    }

    fun unlocked() {
        _locked.value = false
    }

    /**
     * Системная проверка.
     *
     * Тот же метод нужен быстрому сохранённому входу — иначе замок и
     * аватар разошлись бы по безопасности: один просил бы подтверждения, а
     * второй пускал бы без него.
     */
    suspend fun authenticate(activity: FragmentActivity, reason: String): Boolean =
        suspendCancellableCoroutine { cont ->
            val prompt = BiometricPrompt(
                activity,
                androidx.core.content.ContextCompat.getMainExecutor(activity),
                object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                        if (cont.isActive) cont.resume(true)
                    }

                    override fun onAuthenticationError(code: Int, message: CharSequence) {
                        if (cont.isActive) cont.resume(false)
                    }

                    /*
                     * Одна неудачная попытка — не отказ: система сама даёт
                     * приложить палец ещё раз. Отвечать здесь `false`
                     * значило бы закрывать окно на первом же смазанном
                     * отпечатке.
                     */
                    override fun onAuthenticationFailed() = Unit
                },
            )

            val info = BiometricPrompt.PromptInfo.Builder()
                .setTitle(L(R.string.app_name))
                .setSubtitle(reason)
                .setAllowedAuthenticators(ALLOWED)
                .build()

            runCatching { prompt.authenticate(info) }.onFailure {
                if (cont.isActive) cont.resume(false)
            }
            cont.invokeOnCancellation { runCatching { prompt.cancelAuthentication() } }
        }

    private companion object {
        const val KEY = "enabled"

        /**
         * Код устройства рядом с биометрией обязателен, а не «на всякий
         * случай»: без него телефон без настроенного отпечатка вообще не
         * смог бы открыть замок.
         */
        const val ALLOWED = BiometricManager.Authenticators.BIOMETRIC_WEAK or
            BiometricManager.Authenticators.DEVICE_CREDENTIAL
    }
}
