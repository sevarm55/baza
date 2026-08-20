@file:Suppress("unused")

package com.sevarm.tetr.core.api

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import java.time.Instant
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter

/**
 * Ответы сервера.
 *
 * Деньги везде целые и в минимальных единицах — драмах. Так они лежат в
 * базе, так уходят по сети, и нигде по дороге не превращаются в Double:
 * сумма зарплаты, посчитанная через плавающую точку, однажды разойдётся
 * с той, что видит владелец, и объяснить это будет нечем.
 *
 * ГЛАВНОЕ ПРАВИЛО ЭТОГО ФАЙЛА. Любое поле, которого может не быть хоть в
 * одном ответе, объявляется необязательным со значением по умолчанию.
 * Приложение стоит на чужих телефонах и обновляется само по себе — оно
 * всегда может оказаться новее сервера, а обязательное поле в такой паре
 * это экран с ошибкой разбора вместо выручки у каждого, кто обновился
 * первым.
 */
object Api {
    /**
     * Через сколько дней молчания клиент считается потерянным.
     *
     * То же число, что в кабинете (`LOST_AFTER_DAYS` в `lib/alerts.ts`), и
     * по нему же загорается повод в колокольчике. Сервер его не присылает
     * намеренно: это порог подачи, а не данные.
     */
    const val LOST_AFTER_DAYS = 21

    /**
     * Сколько цифр в коде.
     *
     * То же число, что на сервере (`PIN_LENGTH` в `lib/phone.ts`).
     * ВВОД существующего кода этой длиной не ограничивается: у заведённых
     * до перехода на шесть цифр их четыре, и требовать шесть значило бы
     * запереть их снаружи. Минимум для ввода — `PIN_MIN_LENGTH`.
     */
    const val PIN_LENGTH = 6

    /** Сколько цифр достаточно, чтобы ПОПРОБОВАТЬ войти. */
    const val PIN_MIN_LENGTH = 4

    /** Длина кода из SMS. То же, что `CODE_LENGTH` в `lib/otp-shared.ts`. */
    const val CODE_LENGTH = 6
}

/**
 * Момент времени из ISO-строки.
 *
 * Сервер шлёт и с долями секунды, и без; принимаем оба, иначе разбор
 * падает на первом же ответе, где формат другой.
 */
object InstantSerializer : KSerializer<Instant> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("Instant", PrimitiveKind.STRING)

    override fun deserialize(decoder: Decoder): Instant {
        val text = decoder.decodeString()
        return runCatching { Instant.parse(text) }
            .recoverCatching { OffsetDateTime.parse(text).toInstant() }
            .getOrElse { throw IllegalArgumentException("дата: $text") }
    }

    override fun serialize(encoder: Encoder, value: Instant) {
        encoder.encodeString(DateTimeFormatter.ISO_INSTANT.format(value))
    }
}

typealias Ts = @Serializable(InstantSerializer::class) Instant

// ═══════════════════════════ бизнес и человек ═══════════════════════════

@Serializable
data class Tenant(
    val id: String,
    val name: String,
    val currency: String,
    val timezone: String,
    /**
     * «Պետհամարանիշ» или «Հեռախոս» — приложение не знает про ниши, для
     * него это просто слово, которое прислал сервер.
     */
    val clientIdLabel: String,
    val clientIdType: String,
    val staffRole: String,
    val unitOne: String,
    /**
     * Тарифные варианты: у мойки это класс машины.
     *
     * Пусто — свойства нет, и ни ряда классов, ни второй цены человек не
     * увидит. Продукт мультинишевый: «седаны» приходят с сервера словами,
     * которые придумал владелец.
     */
    val tierLabel: String? = null,
    val tiers: List<String>? = null,
)

@Serializable
data class Me(
    val id: String,
    val name: String,
    val role: String,
    val percent: Int,
    /** Слать ли владельцу уведомление о каждой записи. */
    val notifyOrders: Boolean? = null,
    /** Он же логин. */
    val phone: String? = null,
    /**
     * Читал ли человек приветствие первого входа.
     *
     * Признак с сервера, а не из памяти телефона: иначе владелец, заведший
     * мойку в браузере, знакомился бы с продуктом второй раз, а
     * переустановивший приложение — третий.
     */
    val welcomeSeen: Boolean? = null,
    /** Убрано ли «Начало работы» с главной. */
    val setupHidden: Boolean? = null,
    /**
     * Есть ли у человека PIN вообще.
     *
     * У заведённых по коду из SMS его нет: входят они кодом. Нет поля —
     * считаем, что код есть: так экраны ведут себя как раньше.
     */
    val hasPin: Boolean? = null,
    /**
     * Доказан ли номер кодом из SMS.
     *
     * Восстановить доступ по SMS можно только по подтверждённому номеру.
     * Нет поля — считаем подтверждённым и не предлагаем ничего.
     */
    val phoneVerified: Boolean? = null,
) {
    val isOwner: Boolean get() = role == "owner"
    val pinSet: Boolean get() = hasPin ?: true
    val phoneProven: Boolean get() = phoneVerified ?: true
}

/**
 * Шаг настройки первого дня.
 *
 * Ключом, а не подписью: слова у приложения свои и на своём языке.
 * Считает всё сервер по данным бизнеса (`lib/onboarding.ts`), и
 * приложение ничего из этого не проверяет само: два разных счёта одного и
 * того же разошлись бы на первой же правке.
 */
@Serializable
data class SetupStep(val key: String, val done: Boolean)

@Serializable
data class Setup(
    /** Показывать ли блок вообще. */
    val visible: Boolean,
    val complete: Boolean,
    val done: Int,
    val total: Int,
    val steps: List<SetupStep> = emptyList(),
    /** Ключ первого невыполненного шага. */
    val next: String? = null,
)

@Serializable
data class Access(
    val state: String,
    val daysLeft: Int,
    val canRead: Boolean,
    val canWrite: Boolean,
    val warn: Boolean,
)

@Serializable
data class Service(
    val id: String,
    val name: String,
    val price: Int,
    /** Цены по тарифам в порядке `tenant.tiers`. Нет своей — базовая. */
    val tierPrices: List<Int>? = null,
) {
    /**
     * Цена для выбранного тарифа. Единственное место, где это считается на
     * клиенте, — и правило то же, что на сервере.
     */
    fun priceFor(tier: Int?): Int {
        if (tier == null || tier < 0) return price
        val own = tierPrices?.getOrNull(tier) ?: return price
        return if (own > 0) own else price
    }
}

/**
 * Точка, где человек работает.
 *
 * Отдельно от `Tenant`: тот — про бизнес целиком, а здесь ровно то, что
 * нужно строке в списке.
 */
@Serializable
data class Point(
    val id: String,
    val name: String,
    /** owner | staff — на разных мойках роль может отличаться. */
    val role: String,
    val state: String,
    val canRead: Boolean,
    val daysLeft: Int? = null,
)

/**
 * Коллега, которого можно отметить участником работы.
 *
 * Только имя и признак смены. Ни телефона, ни ставки, ни долга: мойщику
 * нужно отметить, с кем он работал, а не изучать чужие условия.
 */
@Serializable
data class CrewMate(
    val id: String,
    val name: String,
    /**
     * Стоит ли человек на смене прямо сейчас.
     *
     * Отметить участником можно только его: не встал на смену — значит
     * сегодня не работал, и начислять ему за чужую машину не за что. То же
     * правило проверяет сервер при записи.
     *
     * Признак, а не отфильтрованный сервером список: «коллег нет вовсе» и
     * «все ушли домой» — разные ответы, и экран записи обязан их
     * различать. Необязательное: приложение может оказаться новее сервера,
     * и тогда список остаётся полным, как и был.
     */
    val onShift: Boolean? = null,
) {
    /** Старый сервер признака не шлёт: там выбирать можно любого. */
    val working: Boolean get() = onShift ?: true
}

/**
 * Совместная работа: одну машину моют вдвоём-втроём.
 *
 * `percent` — ставка на ВСЮ команду, а не каждому: цена × процент даёт
 * фонд, фонд делится поровну между участниками. Пусто — свойство у
 * бизнеса выключено, и приложение не показывает ни одного нового пикселя,
 * ровно как с классами машин.
 *
 * `members` — активные люди точки, ВКЛЮЧАЯ смотрящего. Убирать себя
 * обязан тот, кто рисует список: автор записи участник по определению, и
 * галочка напротив собственного имени была бы способом однажды остаться
 * без денег за свою же работу.
 */
@Serializable
data class CrewSetup(
    val percent: Int? = null,
    val members: List<CrewMate> = emptyList(),
)

@Serializable
data class Bootstrap(
    val tenant: Tenant,
    val me: Me,
    val access: Access,
    val services: List<Service> = emptyList(),
    val points: List<Point>? = null,
    /** Совместная работа. Необязательное по общему правилу файла. */
    val crew: CrewSetup? = null,
)

// ═══════════════════════════ вход ═══════════════════════════

@Serializable
data class Tokens(val access: String, val refresh: String, val expiresIn: Int = 0)

/** Ответ перехода на другую точку — та же пара токенов и новый список. */
@Serializable
data class Switched(
    val access: String,
    val refresh: String,
    val expiresIn: Int = 0,
    val tenantId: String? = null,
    val points: List<Point>? = null,
)

@Serializable
data class LoginResult(
    val access: String,
    val refresh: String,
    val expiresIn: Int = 0,
    val user: Me? = null,
    val tenantId: String? = null,
    val points: List<Point>? = null,
)

/**
 * Заявка на код из SMS.
 *
 * Один и тот же ответ у всех поводов: вход по коду, восстановление кода,
 * подтверждение удаления бизнеса. Заявка сама знает, зачем её заводили,
 * поэтому повод в ней и не назван.
 *
 * `phone` приходит закрытым (`+374 •• ••• •• 56`): экран обязан сказать,
 * куда ушёл код, но показывать номер целиком человеку, который его ещё не
 * доказал, незачем.
 */
@Serializable
data class Challenge(
    val challengeId: String,
    val phone: String? = null,
    /** Раньше этого момента повторная отправка не сработает. */
    val resendAt: Ts,
    val expiresAt: Ts? = null,
    /** Сколько повторов осталось. Приходит только в ответе на повтор. */
    val resendsLeft: Int? = null,
)

/**
 * Ответ второго шага главного входа.
 *
 * Либо пара токенов — номер знакомый, человек внутри; либо пропуск —
 * номер свободен, и бизнес под него ещё не заведён.
 */
@Serializable
data class EntryResult(
    val access: String? = null,
    val refresh: String? = null,
    val expiresIn: Int? = null,
    val user: Me? = null,
    val points: List<Point>? = null,
    /** Пропуск на создание мойки. Не пусто — номер свободен. */
    val ticket: String? = null,
)

/** Пропуск на смену кода: выдаётся, когда код восстановления сошёлся. */
@Serializable
data class ResetTicket(val ticket: String)

/**
 * Заявка нулевого шага смены номера: код на СВОЙ номер.
 *
 * Отдельный тип, а не `Challenge`, потому что и поле названо иначе —
 * `proofId`. Разница не косметическая: этот идентификатор доказывает
 * хозяина, тогда как `challengeId` последнего шага доказывает новый
 * номер. Одно имя на оба означало бы, что их можно перепутать местами.
 */
@Serializable
data class PhoneProof(
    val proofId: String,
    val phone: String? = null,
    val resendAt: Ts,
    val expiresAt: Ts? = null,
)

/**
 * Устройство, с которого сейчас открыт вход.
 *
 * Список свой, а не всего бизнеса: сессии сотрудников владелец здесь не
 * видит. Уволить человека он и так может — это гасит его входы разом.
 */
@Serializable
data class Device(
    val id: String,
    /** web | app — чем человек вошёл. */
    val kind: String,
    val device: String? = null,
    val createdAt: Ts,
    val lastSeenAt: Ts,
    val current: Boolean = false,
) {
    val isApp: Boolean get() = kind == "app"
}

@Serializable
data class Devices(val devices: List<Device> = emptyList())

// ═══════════════════════════ смена ═══════════════════════════

@Serializable
data class ShiftOrder(
    val id: String,
    /**
     * Номер машины. В журнале смены он важнее названия услуги: «Комплекс»
     * за день встречается двадцать раз, номер — один, и свою ошибку ищут
     * по нему. Пусто только у записи, чьего клиента удалили.
     */
    val clientKey: String? = null,
    val serviceName: String,
    val price: Int,
    val payment: String,
    val createdAt: Ts,
    /**
     * Сколько причитается СМОТРЯЩЕМУ за эту машину и сколько человек её
     * мыли.
     *
     * У одиночной мойки участник один, и заработок тот же, что считался
     * всегда; у совместной без этих двух чисел строка нечитаема — цена
     * 12 000, а заработок 1 800, и почему, неизвестно.
     *
     * Доля не выводится ни из цены, ни из процента: она посчитана и
     * записана в момент записи. Необязательные по общему правилу файла:
     * пусто — старый сервер, и машина одиночная, как и была.
     */
    val earned: Int? = null,
    val crew: Int? = null,
) {
    /** Мыли вместе. Один участник — обычная запись, какой она была всегда. */
    val shared: Boolean get() = (crew ?: 1) > 1
}

/** Смена, которую человек сегодня уже закрыл. */
@Serializable
data class ClosedShift(val openedAt: Ts, val closedAt: Ts)

@Serializable
data class Shift(
    val count: Int = 0,
    val revenue: Int = 0,
    val earned: Int = 0,
    val percent: Int = 0,
    val orders: List<ShiftOrder> = emptyList(),
    /** Встал ли человек на смену переключателем. */
    val onShift: Boolean = false,
    val openedAt: Ts? = null,
    /**
     * Сегодняшняя закрытая смена. «Ещё не вставал» и «отработал и
     * закрылся» — разные состояния одного дня, и различить их можно только
     * так: открытой смены нет ни там, ни там.
     */
    val closedToday: ClosedShift? = null,
    /** Сколько наличных набралось с начала смены. */
    val cashSoFar: Int = 0,
)

/** Ответ на включение и выключение переключателя. */
@Serializable
data class ShiftState(
    val onShift: Boolean,
    val openedAt: Ts? = null,
    val cashExpected: Int? = null,
    val cashDeclared: Int? = null,
)

// ═══════════════════════════ сводка и день ═══════════════════════════

@Serializable
data class StaffLine(
    val staffId: String? = null,
    val name: String? = null,
    val count: Int = 0,
    val revenue: Int = 0,
    val earned: Int = 0,
)

@Serializable
data class Stats(
    val revenue: Int = 0,
    val count: Int = 0,
    val cash: Int = 0,
    /**
     * Скидок дано за период. Не расход и не убыток: деньги, которых
     * бизнес решил не брать. Молчим, когда ноль.
     */
    val discounts: Int? = null,
    val avgCheck: Int = 0,
    /** Начислено исполнителям за период — не выплачено, а именно начислено. */
    val payroll: Int = 0,
    /** Кто сколько намыл и сколько ему за это причитается. */
    val byStaff: List<StaffLine>? = null,
)

@Serializable
data class Costs(val oneOff: Int = 0, val monthlyShare: Int = 0, val total: Int = 0)

@Serializable
data class Previous(
    val from: Ts? = null,
    val to: Ts? = null,
    val revenue: Int = 0,
    val profit: Int = 0,
    /** Ноль записей — сравнивать не с чем, и клиент молчит. */
    val count: Int? = null,
)

/** Кто сейчас на мойке — для экрана владельца. */
@Serializable
data class Present(val userId: String, val name: String, val openedAt: Ts)

/**
 * Столбик графика.
 *
 * Ключ приходит строкой «2026-07-29 16», а не датой: timestamp без зоны
 * при разборе трактуется как время клиента, и график съезжает на разницу
 * часовых поясов.
 */
@Serializable
data class SeriesPoint(val key: String, val revenue: Int) {
    /*
     * Ключ ВСЕГДА кончается часом — даже когда ряд дневной. Брать две
     * последние цифры годилось только для часов: на тридцати днях все
     * подписи выходили «00».
     */
    val hourLabel: String get() = key.takeLast(2)
    val dayLabel: String get() = key.drop(8).take(2)
}

@Serializable
data class SplitSegment(val payment: String, val revenue: Int)

/** Участник работы в ленте: кто мыл и сколько ему за это начислено. */
@Serializable
data class FeedWorker(
    val staffId: String? = null,
    val name: String? = null,
    val earned: Int = 0,
)

@Serializable
data class FeedItem(
    val id: String,
    val clientKey: String? = null,
    val serviceName: String,
    val staffName: String? = null,
    /**
     * Ставка, применённая ко ВСЕЙ записи.
     *
     * У одиночной мойки это процент исполнителя, как и было всегда; у
     * совместной — процент команды, то есть весь зарплатный фонд машины.
     * Доля бизнеса («осталось») по нему считается верно в обоих случаях.
     *
     * Снимок в самой записи, а не текущая ставка человека: владелец
     * поднимет процент в марте, а посчитанное в феврале обязано остаться
     * посчитанным по-февральски.
     */
    val staffPercent: Int? = null,
    val price: Int,
    /**
     * Цена по прайсу — только когда взяли меньше. До этого поля скидку
     * было видно ровно в одном месте: в уведомлении в момент записи.
     */
    val listPrice: Int? = null,
    val payment: String,
    val createdAt: Ts,
    /**
     * Состав работы и доля каждого. У одиночной мойки ровно один человек,
     * и экран рисует его как рисовал.
     *
     * Необязательное: приложение стоит на чужих телефонах и может
     * оказаться новее сервера. Пусто — старый сервер, машина одиночная.
     */
    val crew: List<FeedWorker>? = null,
) {
    /** Мыли вместе. Один участник — обычная запись, какой она была всегда. */
    val shared: Boolean get() = (crew?.size ?: 1) > 1

    /**
     * Сколько с этой машины ушло исполнителям — ВСЕМ вместе.
     *
     * У совместной это фонд команды, а не доля одного: `staffPercent` там
     * означает ставку на всю машину. Ровно поэтому «осталось бизнесу»
     * считается верно в обоих случаях одной формулой.
     *
     * Ценой и процентом, а не сложением присланных долей, — хотя фонд по
     * построению равен их сумме. Формула здесь ровно та же, что на сервере
     * и в iOS, и держать её одной важнее, чем подстраховаться от
     * несуществующего расхождения: разойдись клиенты в этом числе, у
     * владельца разъедется «осталось мойке» — и разъедется молча.
     */
    val earned: Int get() = price * (staffPercent ?: 0) / 100

    /** «Արման · Դավիթ · Կարեն», а у одиночной — одно имя. */
    val crewNames: String
        get() = crew.orEmpty().mapNotNull { it.name }
            .ifEmpty { listOfNotNull(staffName) }
            .joinToString(" · ")
}

@Serializable
data class Summary(
    /** Начало периода: без даты «Հասույթ» — число без привязки. */
    val from: Ts,
    /** Верхняя граница. У закрытого прошлого месяца она в прошлом. */
    val to: Ts? = null,
    val stats: Stats,
    val costs: Costs,
    /* Прибыль считает сервер: формула одна на приложение и кабинет. */
    val profit: Int,
    val previous: Previous = Previous(),
    val onShift: List<Present> = emptyList(),
    val series: List<SeriesPoint> = emptyList(),
    val split: List<SplitSegment> = emptyList(),
    val feed: List<FeedItem> = emptyList(),
    /** Настройка первого дня. Едет вместе со сводкой, а не отдельным запросом. */
    val setup: Setup? = null,
)

@Serializable
data class DayShift(
    val userId: String,
    val name: String,
    val openedAt: Ts,
    val closedAt: Ts? = null,
    /** Сколько наличных намыл и сколько сдал. null — не отмечал. */
    val cashExpected: Int? = null,
    val cashDeclared: Int? = null,
) {
    // человек мог отстоять две смены за день — одного userId мало
    val id: String get() = "$userId-${openedAt.epochSecond}"
}

@Serializable
data class Day(
    val date: String,
    val stats: Stats,
    val costs: Costs,
    val profit: Int,
    /** Маршрут дня его не присылает — карточку открывают из календаря. */
    val previous: Previous? = null,
    val shifts: List<DayShift> = emptyList(),
    val feed: List<FeedItem> = emptyList(),
)

@Serializable
data class MonthDay(val date: String, val revenue: Int, val count: Int)

@Serializable
data class MonthTotal(
    val revenue: Int = 0,
    val serviceRevenue: Int = 0,
    val count: Int = 0,
    val payroll: Int = 0,
    val expenses: Int = 0,
    val profit: Int = 0,
)

@Serializable
data class Month(val month: String, val days: List<MonthDay> = emptyList(), val total: MonthTotal)

// ═══════════════════════════ клиенты ═══════════════════════════

@Serializable
data class KnownClient(
    val key: String,
    val visits: Int,
    val total: Int,
    val lastSeenAt: Ts? = null,
    /**
     * Каким классом эту машину записывали в прошлый раз: джип не станет
     * седаном между мойками, поэтому выбор подставляется сам.
     */
    val lastTier: String? = null,
)

@Serializable
data class Lookup(val known: KnownClient? = null)

@Serializable
data class Client(
    val id: String,
    val key: String,
    val name: String? = null,
    /** Телефон вписывает владелец из карточки — при записи его не спрашивают. */
    val phone: String? = null,
    val visits: Int = 0,
    val total: Int = 0,
    /** Дней с последнего визита. Считает база и обрезает нулём. */
    val daysSince: Int = 0,
    /** Когда приехал впервые. Приходит только в карточке. */
    val firstSeenAt: Ts? = null,
)

@Serializable
data class ClientOrder(
    val id: String,
    val createdAt: String,
    val price: Int,
    val listPrice: Int? = null,
    val serviceName: String,
    val payment: String,
    val staffName: String? = null,
)

/** Одна машина и всё, что она у нас мыла. */
@Serializable
data class ClientHistory(val client: Client, val orders: List<ClientOrder> = emptyList())

@Serializable
data class Clients(val clients: List<Client> = emptyList())

// ═══════════════════════════ поводы ═══════════════════════════

/**
 * Повод для колокольчика.
 *
 * Не событие, а состояние мойки: «пятеро не были три недели» правда, пока
 * они не приедут. Считает его сервер — той же сборкой, что и кабинет.
 */
@Serializable
data class Alert(
    val key: String,
    val title: String,
    val note: String,
    val action: String = "",
    /** `warn` — то, что теряет деньги прямо сейчас. */
    val tone: String = "",
)

@Serializable
data class Alerts(val alerts: List<Alert> = emptyList())

// ═══════════════════════════ люди и услуги ═══════════════════════════

@Serializable
data class StaffMember(
    val id: String,
    val name: String,
    val phone: String = "",
    val role: String,
    val percent: Int = 0,
    val isMe: Boolean = false,
    /** Что человек сделал за этот месяц. */
    val cars: Int? = null,
    val earned: Int? = null,
    /** Стоит ли он на смене прямо сейчас — вопрос про площадку. */
    val onShift: Boolean? = null,
    val openedAt: Ts? = null,
    /** Сколько ему сейчас должны. Считает тот же лист, что и зарплаты. */
    val due: Int? = null,
)

@Serializable
data class Staff(val staff: List<StaffMember> = emptyList())

@Serializable
data class Services(val services: List<Service> = emptyList())

@Serializable
data class CreatedOrder(
    val duplicate: Boolean = false,
    /**
     * Кому сколько досталось.
     *
     * Показывается сразу после записи: участник должен увидеть СВОЮ долю в
     * тот же момент, а не вечером в ведомости. Пусто у повторной досылки —
     * она ничего не создавала.
     */
    val crew: List<FeedWorker> = emptyList(),
)

// ═══════════════════════════ расходы ═══════════════════════════

@Serializable
data class Expense(
    val id: String,
    val amount: Int,
    val category: String,
    val note: String? = null,
    val monthly: Boolean = false,
    val at: Ts,
    /** Заполнено только у завершённого постоянного расхода. */
    val endedAt: Ts? = null,
    /**
     * Во что эта строка обошлась за выбранный месяц.
     *
     * Постоянный расход платят раз в месяц, а живёт он каждый день:
     * десятого числа от аренды набежала треть. Считает база — тем же
     * выражением, что итог наверху.
     */
    val share: Int? = null,
    /** Дневная доля постоянного; у разового ноль. Тоже с сервера. */
    val perDay: Int? = null,
)

@Serializable
data class Expenses(
    val hints: List<String> = emptyList(),
    val expenses: List<Expense> = emptyList(),
    val costs: Costs? = null,
    /** Выручка того же периода: расход оценивают долей в приходе. */
    val revenue: Int? = null,
    /** Средний расход в день — по прожитым дням периода. */
    val perDayAvg: Int? = null,
)

// ═══════════════════════════ зарплаты ═══════════════════════════

@Serializable
data class PayrollDay(val day: String, val count: Int, val revenue: Int, val earned: Int)

@Serializable
data class PayrollDue(
    val staffId: String? = null,
    val name: String? = null,
    /** текущая ставка человека — НЕ та, по которой посчитано */
    val percent: Int = 0,
    val pctFrom: Int? = null,
    val pctTo: Int? = null,
    val count: Int = 0,
    val revenue: Int = 0,
    val earned: Int = 0,
    val days: List<PayrollDay>? = null,
)

@Serializable
data class Payout(val id: String, val amount: Int, val paidAt: Ts, val staffName: String? = null)

/** Машина, из которой сложилась дневная доля. */
@Serializable
data class PayrollLine(
    val id: String,
    /** «34 AA 555 · Կոմպլեքս» — чем запись названа в ленте. */
    val title: String,
    val price: Int,
    val percent: Int,
    val earned: Int,
    /**
     * Сколько человек мыли эту машину.
     *
     * Без этого числа строка совместной работы читается как ошибка: под
     * машиной за 12 000 стоит «45 %» и «1 800 ֏», и первое со вторым не
     * сходится, пока не сказано, что фонд делили на троих.
     *
     * Необязательное по общему правилу файла: старый сервер его не шлёт, и
     * там любая машина одиночная.
     */
    val crew: Int? = null,
) {
    /** «12 000 ֏ × 45 %» — и «÷ 3», когда мыли вместе. */
    fun formula(price: String): String {
        val base = "$price × $percent%"
        val people = crew ?: 1
        return if (people > 1) "$base ÷ $people" else base
    }
}

/** Человек внутри рабочего дня. */
@Serializable
data class PayrollPerson(
    /** пусто у записей без исполнителя: платить по ним некому */
    val staffId: String? = null,
    val name: String? = null,
    val count: Int = 0,
    /** сколько за этот день ещё должны */
    val earned: Int = 0,
    /** сколько за этот день уже отдано */
    val paid: Int = 0,
    val paidAt: Ts? = null,
    val pctFrom: Int? = null,
    val pctTo: Int? = null,
    /**
     * Пусто, если полного разложения нет: половина машин под суммой
     * читается как полная и не сходится.
     */
    val lines: List<PayrollLine>? = null,
) {
    val rowId: String get() = staffId ?: "—"

    /** Ставка, по которой посчитано: одно число, а после смены — вилка. */
    val rateLabel: String?
        get() {
            val from = pctFrom ?: return null
            val to = pctTo ?: return null
            return if (from == to) "$from%" else "$from–$to%"
        }
}

/** Рабочий день целиком: и долг, и уже закрытое. */
@Serializable
data class PayrollBoardDay(
    val day: String,
    val units: Int = 0,
    val outstanding: Int = 0,
    val paid: Int = 0,
    val people: List<PayrollPerson> = emptyList(),
)

@Serializable
data class PayrollPaymentRow(
    val id: String,
    val staffId: String? = null,
    val name: String? = null,
    val amount: Int,
)

/** Одна выдача: сколько человек за раз получили деньги из рук в руки. */
@Serializable
data class PayrollPayment(
    val key: String,
    val paidAt: Ts,
    /** за какой рабочий день; пусто у старых выплат */
    val day: String? = null,
    val periodFrom: Ts,
    val periodTo: Ts,
    val units: Int? = null,
    val total: Int,
    val rows: List<PayrollPaymentRow> = emptyList(),
)

@Serializable
data class PayrollTotals(
    /** сколько сейчас нужно раздать */
    val outstanding: Int = 0,
    /** скольким людям */
    val owedTo: Int = 0,
    val accrued: Int = 0,
    val settled: Int = 0,
    val units: Int = 0,
)

@Serializable
data class PayrollBoard(
    val days: List<PayrollBoardDay> = emptyList(),
    val payments: List<PayrollPayment> = emptyList(),
    val totals: PayrollTotals = PayrollTotals(),
    val lastPaidAt: Ts? = null,
)

@Serializable
data class Payroll(
    val due: List<PayrollDue> = emptyList(),
    val payouts: List<Payout> = emptyList(),
    /** Необязательный намеренно: приложение может быть новее сервера. */
    val board: PayrollBoard? = null,
)

// ═══════════════════════════ отчёт по месяцам ═══════════════════════════

/** Месяц в ряду: то, из чего собирается выбор и сравнение соседних. */
@Serializable
data class ReportMonth(
    /** сколько месяцев назад: 0 — текущий */
    val back: Int,
    val from: Ts,
    val to: Ts,
    val count: Int = 0,
    val revenue: Int = 0,
    val payroll: Int = 0,
    val costs: Int = 0,
    val discounts: Int = 0,
    val avgCheck: Int = 0,
    val profit: Int = 0,
    /** какая доля прихода осталась владельцу, в процентах */
    val kept: Int = 0,
)

/** Открытый месяц целиком. */
@Serializable
data class ReportCurrent(
    val back: Int,
    val from: Ts,
    val to: Ts,
    val count: Int = 0,
    val revenue: Int = 0,
    val payroll: Int = 0,
    val costs: Int = 0,
    val oneOff: Int = 0,
    val monthlyShare: Int = 0,
    val discounts: Int = 0,
    val avgCheck: Int = 0,
    val profit: Int = 0,
    val kept: Int = 0,
    val byStaff: List<StaffLine> = emptyList(),
)

/** С чем сравниваем: тот же отрезок прошлого месяца. */
@Serializable
data class ReportBase(val revenue: Int = 0, val profit: Int = 0)

/** Строка разреза: услуга или категория расхода. */
@Serializable
data class ReportLine(
    /** у услуг — её название, у расходов — категория */
    val name: String,
    /** сколько раз брали; у расходов не приходит */
    val count: Int? = null,
    val revenue: Int? = null,
    val amount: Int? = null,
    /** постоянный ли расход; у услуг не приходит */
    val monthly: Boolean? = null,
) {
    /** Деньги строки, как бы поле ни называлось на своей стороне. */
    val value: Int get() = revenue ?: amount ?: 0
    val rowId: String get() = "$name-${monthly ?: false}"
}

@Serializable
data class Report(
    val months: List<ReportMonth> = emptyList(),
    val current: ReportCurrent,
    val base: ReportBase? = null,
    val services: List<ReportLine> = emptyList(),
    val costsByCategory: List<ReportLine> = emptyList(),
    val split: List<SplitSegment> = emptyList(),
)
