package com.sevarm.tetr.core.api

import com.sevarm.tetr.R
import com.sevarm.tetr.core.i18n.L
import com.sevarm.tetr.core.i18n.Ln

/**
 * Ошибка запроса.
 *
 * `code` — то, что прислал сервер: WRONG_CREDENTIALS, PASS_UNAVAILABLE и
 * прочие. Приложение переводит их само, поэтому сервер шлёт код, а не
 * готовую строку: иначе показать отказ по-русски человеку с русским
 * интерфейсом можно было бы только правкой сервера.
 */
class ApiException(
    val status: Int,
    val code: String? = null,
    val retryAfter: Int? = null,
    /**
     * Заявка на код из SMS — приходит вместе с `STEP_UP_REQUIRED`.
     *
     * Отказ здесь не окончательный: PIN подошёл, но вход идёт с
     * незнакомого устройства, и сервер ждёт код. Без этих двух полей
     * экрану не с чем открыть ввод кода.
     */
    val challengeId: String? = null,
    val maskedPhone: String? = null,
    /**
     * Уточнение к коду ответа.
     *
     * Сервер кладёт его туда, где одного кода мало: `PIN_WEAK` бывает и
     * «мало цифр», и «слишком очевидный», а это разные беды.
     */
    val reason: String? = null,
) : Exception("HTTP $status ${code ?: ""}") {

    /** Сеть не ответила вовсе — запись уйдёт в очередь, а не потеряется. */
    val isOffline: Boolean get() = status == 0

    val isUnauthorized: Boolean get() = status == 401

    /**
     * Протух токен — и только это.
     *
     * 401 приходит и по другому поводу: сервер понял, кто пришёл, и
     * отказал по существу — например не сошёлся PIN при удалении бизнеса.
     * Обновлять токен там бессмысленно, а молчаливый повтор запроса списал
     * бы у человека вторую попытку из лимита за одну опечатку.
     */
    val isStaleToken: Boolean get() = status == 401 && (code == null || code == "UNAUTHORIZED")
}

/**
 * Что сказать человеку, когда экран не загрузился.
 *
 * Три случая и три разных ответа, потому что делать с ними человек должен
 * разное:
 *
 *   связи нет      — подождать и потянуть вниз; это не поломка;
 *   сервер отказал — показать код: с ним можно позвонить и назвать его;
 *   всё остальное  — «не удалось». Разбор ответа, неизвестный формат даты
 *                    — это наши беды, а не его, и переложить их на него
 *                    текстом ошибки значит попросить о помощи того, кто
 *                    пришёл за выручкой.
 */
object Failure {
    fun text(error: Throwable): String = when (error) {
        is ApiException ->
            if (error.isOffline) L(R.string.errors__offline)
            else L(R.string.errors__server, "${error.status} ${error.code ?: "—"}")

        is kotlinx.coroutines.CancellationException -> ""

        else -> L(R.string.payroll__failed)
    }

    /**
     * Отказ входа и всего, что связано с кодом.
     *
     * Один разбор на все экраны, где спрашивают PIN или код из SMS:
     * иначе «код не тот» на входе и «код не тот» при смене номера
     * разъехались бы формулировкой на первой же правке.
     */
    fun auth(error: Throwable): String {
        if (error !is ApiException) return L(R.string.payroll__failed)
        if (error.isOffline) return L(R.string.errors__offline)
        return when (error.code) {
            "TOO_MANY_TRIES" -> {
                val minutes = maxOf(1, (error.retryAfter ?: 60) / 60)
                Ln(R.plurals.auth__tooManyTries, minutes)
            }

            "WRONG_CREDENTIALS" -> L(R.string.auth__wrongCredentials)
            "OTP_INVALID" -> L(R.string.auth__otpInvalid)
            "OTP_EXPIRED" -> L(R.string.auth__otpExpired)
            "OTP_TOO_MANY" -> L(R.string.auth__otpTooMany)
            "SMS_FAILED" -> L(R.string.auth__smsFailed)
            "PHONE_TAKEN" -> L(R.string.auth__phoneTaken)
            /*
             * Сервер различает «мало цифр» и «слишком очевидный», и
             * человеку это надо сказать: он в этот момент придумывает код,
             * и общий ответ заставляет его гадать.
             */
            "PIN_WEAK" ->
                if (error.reason == "TRIVIAL_PIN") L(R.string.auth__pinTrivial)
                else L(R.string.auth__pinMemo)

            "BAD_REQUEST" ->
                if (error.reason == "SAME_PHONE") L(R.string.auth__samePhone)
                else L(R.string.errors__badPhone)

            else -> L(R.string.payroll__failed)
        }
    }
}
