package com.sevarm.tetr.core.session

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Хранилище токенов.
 *
 * Аналог Keychain из iOS, и по тем же причинам: refresh живёт тридцать
 * дней и даёт полный доступ к бизнесу, а обычный `SharedPreferences` —
 * это файл в песочнице, который на рутованном телефоне читается как
 * простой XML.
 *
 * Ключ живёт в аппаратном Keystore и наружу не выходит вовсе: шифрование
 * и расшифровка происходят внутри него, приложение получает только
 * результат. `setUserAuthenticationRequired` НЕ ставим намеренно — иначе
 * фоновая досылка очереди на заблокированном телефоне не смогла бы
 * прочитать токен, а она обязана уходить, пока мойщик занят машиной.
 * Замок на само приложение при этом есть — см. `BiometricLock`.
 *
 * `AndroidKeyStore` привязан к устройству: копия резервного архива,
 * распакованная на другом телефоне, не расшифруется. Это то же самое
 * `ThisDeviceOnly`, что стоит у iOS, и то же обоснование — человек войдёт
 * заново, это три касания.
 */
class SecureStore(context: Context) {

    private val prefs = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    private val key: SecretKey by lazy { loadOrCreateKey() }

    operator fun get(name: String): String? {
        val stored = prefs.getString(name, null) ?: return null
        return runCatching { decrypt(stored) }.getOrElse {
            /*
             * Расшифровать нечем: ключ пропал вместе со сменой блокировки
             * экрана или переносом на другой телефон. Молча забываем —
             * человек войдёт заново, а мёртвая строка в хранилище будет
             * ломать чтение при каждом запуске.
             */
            prefs.edit().remove(name).apply()
            null
        }
    }

    operator fun set(name: String, value: String?) {
        val editor = prefs.edit()
        if (value == null) editor.remove(name) else editor.putString(name, encrypt(value))
        editor.apply()
    }

    fun clear(vararg names: String) {
        val editor = prefs.edit()
        names.forEach { editor.remove(it) }
        editor.apply()
    }

    // ─────────────────────────── ключ и шифр ───────────────────────────

    private fun loadOrCreateKey(): SecretKey {
        val store = KeyStore.getInstance(PROVIDER).apply { load(null) }
        (store.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, PROVIDER)
        generator.init(
            KeyGenParameterSpec.Builder(
                ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return generator.generateKey()
    }

    /** Вектор инициализации кладём рядом с шифротекстом: он не секрет. */
    private fun encrypt(value: String): String {
        val cipher = Cipher.getInstance(TRANSFORM)
        cipher.init(Cipher.ENCRYPT_MODE, key)
        val iv = cipher.iv
        val data = cipher.doFinal(value.toByteArray())
        return "${iv.b64()}:${data.b64()}"
    }

    private fun decrypt(stored: String): String {
        val (ivPart, dataPart) = stored.split(':', limit = 2)
        val cipher = Cipher.getInstance(TRANSFORM)
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(TAG_BITS, ivPart.unb64()))
        return cipher.doFinal(dataPart.unb64()).decodeToString()
    }

    private fun ByteArray.b64() = Base64.encodeToString(this, Base64.NO_WRAP)
    private fun String.unb64() = Base64.decode(this, Base64.NO_WRAP)

    private companion object {
        const val FILE = "tetr.secure"
        const val PROVIDER = "AndroidKeyStore"
        const val ALIAS = "com.sevarm.tetr.tokens"
        const val TRANSFORM = "AES/GCM/NoPadding"
        const val TAG_BITS = 128
    }
}
