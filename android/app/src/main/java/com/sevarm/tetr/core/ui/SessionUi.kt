package com.sevarm.tetr.core.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import com.sevarm.tetr.LocalGraph
import com.sevarm.tetr.core.api.Tenant
import com.sevarm.tetr.core.i18n.Lang
import com.sevarm.tetr.core.i18n.LocalLang
import com.sevarm.tetr.core.i18n.Terms
import com.sevarm.tetr.core.i18n.money
import com.sevarm.tetr.core.session.Session
import java.time.Instant
import java.time.ZoneId

/**
 * Короткие ходы к тому, что нужно каждому экрану.
 *
 * Валюта, единица учёта, пояс мойки и язык встречаются в продукте на
 * каждой второй строке. Тянуть за ними `session.tenant.value?.currency ?:
 * "AMD"` в каждом месте — значит однажды написать это в одном месте иначе,
 * и получить два разных ответа на один вопрос.
 */
@Composable
fun session(): Session = LocalGraph.current.session

@Composable
fun tenant(): Tenant? {
    val t by session().tenant.collectAsState()
    return t
}

@Composable
fun currency(): String = tenant()?.currency ?: "AMD"

/** Слово ниши: «մեքենա», «машина», «car». */
@Composable
fun unitOne(): String = tenant()?.unitOne.orEmpty()

/** Как зовут исполнителя: «Мойщик», «Барбер». */
@Composable
fun staffRole(): String = tenant()?.staffRole.orEmpty()

/**
 * Пояс мойки, а не устройства.
 *
 * Владелец в поездке иначе увидит смену, начатую в шесть утра, и день,
 * который на мойке ещё не кончился.
 */
@Composable
fun zone(): ZoneId = com.sevarm.tetr.core.i18n.Dates.zone(tenant()?.timezone)

/** Деньги на языке интерфейса и в валюте бизнеса. */
@Composable
fun money(amount: Int): String = money(amount, currency(), LocalLang.current)

/** «3 машины» — число и слово в согласованной форме. */
@Composable
fun units(count: Int): String = Terms.units(count, unitOne(), LocalLang.current)

/** Слово под числом плитки: «6» сверху, «машин» снизу. */
@Composable
fun unitWord(count: Int): String = Terms.unitWord(count, unitOne(), LocalLang.current)

/** «3 мойщика» — счёт людей. */
@Composable
fun staffCount(count: Int): String = Terms.staffCount(count, staffRole(), LocalLang.current)

/**
 * Название услуги на языке смотрящего.
 *
 * Заводские услуги — те, что положила регистрация из конфига ниши, —
 * переводятся; слово, придуманное владельцем, проходит насквозь.
 */
@Composable
fun serviceName(value: String): String = Terms.service(value, LocalLang.current)

/** «HH:mm» в поясе мойки. */
@Composable
fun clock(at: Instant): String =
    com.sevarm.tetr.core.i18n.Dates.clock(at, LocalLang.current, zone())

@Composable
fun lang(): Lang = LocalLang.current
