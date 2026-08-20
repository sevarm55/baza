package com.sevarm.tetr.feature.more

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.ArrowOutward
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Insights
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PowerSettingsNew
import androidx.compose.material.icons.filled.SouthEast
import androidx.compose.material.icons.filled.Store
import androidx.compose.material.icons.filled.Undo
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sevarm.tetr.LocalGraph
import com.sevarm.tetr.R
import com.sevarm.tetr.core.api.Month
import com.sevarm.tetr.core.api.MonthDay
import com.sevarm.tetr.core.i18n.Dates
import com.sevarm.tetr.core.i18n.L
import com.sevarm.tetr.core.ui.lang
import com.sevarm.tetr.core.ui.zone
import com.sevarm.tetr.design.Brand
import com.sevarm.tetr.design.Insets
import com.sevarm.tetr.design.pressable
import com.sevarm.tetr.design.surfaceCard
import com.sevarm.tetr.nav.Routes
import java.time.Instant
import kotlin.math.sqrt
import kotlinx.coroutines.launch

/**
 * Не системное меню, а небольшая карта бизнеса.
 *
 * Экран собран сверху вниз одной композицией: шапка, один контекстный блок
 * про историю и дальше сгруппированные списки — работа, бизнес, учётка.
 * Действий на экране нет вовсе: выгрузка уехала в профиль, к смене кода,
 * устройствам и удалению бизнеса, где ей и место.
 *
 * Цветных плиток нет намеренно. Шесть залитых прямоугольников весили
 * одинаково, и приоритета не было ни у одного; цвет при этом никуда не
 * делся — он ушёл в значки.
 */
@Composable
fun MoreScreen(onOpen: (String) -> Unit) {
    /*
     * Строка показывается, только когда за ней есть экран. Пункт меню,
     * который ничего не открывает, хуже отсутствующего: по нему жмут и
     * решают, что продукт сломан.
     */
    fun ready(route: String) = route !in Routes.pending

    val graph = LocalGraph.current
    val session = graph.session
    val scope = rememberCoroutineScope()
    val points by session.points.collectAsState()
    val setupHidden by session.setupHidden.collectAsState()

    Column(
        Modifier
            .fillMaxSize()
            .background(Brand.board)
            /*
             * Отступ строки состояния — ДО прокрутки. После неё он едет
             * вместе с содержимым, и заголовок раздела налезает на часы:
             * полотно тут плоское, затемнения под строкой состояния нет, и
             * читаться такое перестаёт сразу.
             */
            .padding(top = Insets.top.calculateTopPadding())
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp)
            .padding(top = 8.dp, bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            /*
             * Имя экрана крупно, хотя оно же написано во вкладке. Повтор
             * не лишний: вкладка это где я нахожусь, заголовок это с чего
             * начинается страница.
             */
            Column(Modifier.padding(horizontal = 4.dp)) {
                Text(
                    L(R.string.more__title),
                    fontSize = 32.sp,
                    fontWeight = FontWeight.Bold,
                    color = Brand.onBoard,
                )
                Text(L(R.string.more__lead), fontSize = 15.sp, color = Brand.boardMuted)
            }

            CalendarCard(
                onOpen = { onOpen(Routes.CALENDAR) },
                onDay = { date -> onOpen(Routes.day(date)) },
            )
        }

        /*
         * Три коробки подряд, а не одна на всё: список из восьми строк
         * читается таблицей, где всё равнозначно. Разрыв между коробками и
         * есть ответ на вопрос «где работа, где бизнес, где я сам».
         */
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            // Ежедневная работа — первой коробкой: сюда заходят каждую неделю.
            val work = listOf(
                Row4(Routes.CLIENTS, Icons.Filled.People, Brand.mintInk, L(R.string.owner__tabClients), null),
                Row4(Routes.SERVICES, Icons.Filled.LocalOffer, Brand.lavenderInk, L(R.string.settings__tabServices), null),
                Row4(Routes.EXPENSES, Icons.Filled.SouthEast, Brand.sandInk, L(R.string.expenses__title), null),
                Row4(Routes.REPORT, Icons.Filled.Insights, Brand.grape, L(R.string.reports__title), null),
            ).filter { ready(it.route) }

            if (work.isNotEmpty()) {
                GroupCard {
                    work.forEachIndexed { index, row ->
                        if (index > 0) Separator()
                        NavRow(row.icon, row.tint, row.title, row.note) { onOpen(row.route) }
                    }
                }
            }

            // Команда и филиалы: не ежедневное, потому отдельной коробкой.
            GroupCard {
                if (ready(Routes.STAFF)) {
                    NavRow(Icons.Filled.Groups, Brand.mintInk, L(R.string.more__team), null) {
                        onOpen(Routes.STAFF)
                    }
                }
                // Филиалы видит только тот, у кого их больше одного:
                // остальные не должны узнать, что вторые бывают.
                if (points.size > 1) {
                    if (ready(Routes.STAFF)) Separator()
                    NavRow(
                        Icons.Filled.Store,
                        Brand.lavenderInk,
                        L(R.string.more__points),
                        null,
                    ) { onOpen(Routes.POINTS) }
                }
            }

            /*
             * Учётка отдельной коробкой от рабочих разделов: профиль это
             * не место работы, а место настройки себя.
             */
            GroupCard {
                if (ready(Routes.PROFILE)) {
                    NavRow(Icons.Filled.Person, Brand.grape, L(R.string.more__profileLead), null) {
                        onOpen(Routes.PROFILE)
                    }
                }
                /*
                 * Дверь обратно к настройке только тому, кто её убрал.
                 * Пропустить можно случайно и в первый же день, а вспомнить
                 * о ней на третий; без этой строки вернуть список было бы
                 * нечем.
                 */
                if (setupHidden) {
                    if (ready(Routes.PROFILE)) Separator()
                    NavRow(
                        Icons.Filled.Undo,
                        Brand.mintInk,
                        L(R.string.setup__resume),
                        null,
                        trailing = Icons.Filled.Undo,
                    ) { scope.launch { session.resumeSetup() } }
                }
            }

            /*
             * Выход переехал сюда из профиля, отдельной коробкой и
             * последней строкой экрана.
             *
             * В профиле он стоял между сменой кода и удалением бизнеса —
             * то есть среди настроек себя, где его не искали: человек,
             * которому надо выйти, идёт в «Ավելին», а не в анкету. И это
             * единственное на экране действие, а не переход, — потому оно
             * отделено от всего пустотой и не имеет стрелки вправо: стрелка
             * обещала бы, что откроется ещё один экран.
             *
             * Знак приглушённый, а не цветной: цвет на этом экране означает
             * раздел, и красить им действие — значит обещать ещё одно
             * место. Красным он тоже быть не может: красный в продукте
             * значит ровно «удалить», и путать эти два сигнала нельзя.
             */
            GroupCard {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 60.dp)
                        .pressable(onClick = { scope.launch { session.signOut() } })
                        .padding(horizontal = 16.dp, vertical = 11.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(13.dp),
                ) {
                    Box(Modifier.width(27.dp), contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.Filled.PowerSettingsNew,
                            contentDescription = null,
                            tint = Brand.boardMuted,
                            modifier = Modifier.size(20.dp),
                        )
                    }
                    Text(
                        L(R.string.auth__signOut),
                        fontSize = 17.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Brand.onBoard,
                    )
                }
            }
        }
    }
}

/**
 * Календарь с лентой последних семи дней.
 *
 * Раньше здесь стояла сиреневая плита с одним словом «Календарь». Она
 * занимала верх экрана и не говорила ничего: чтобы узнать, как шла неделя,
 * надо было в неё войти. Место крупное, а сообщения нет — это худший
 * обмен на экране.
 *
 * Теперь блок сам и есть неделя. Семь клеток, густота заливки — выручка
 * дня относительно лучшего дня недели; провал видно раньше, чем прочитано
 * хоть одно число, и ровно так же устроен месяц внутри. Клетка нажимается
 * и открывает свой день, шапка — весь календарь: два разных перехода в
 * одном блоке, и каждый ведёт туда, куда показывает.
 *
 * Белая, не сиреневая: заливка цветом делала её плитой-витриной, а это
 * содержимое, а не витрина.
 */
@Composable
private fun CalendarCard(onOpen: () -> Unit, onDay: (String) -> Unit) {
    val graph = LocalGraph.current
    val session = graph.session
    val zone = zone()
    val lang = lang()

    /*
     * Семь дней по сегодняшний включительно. Считаем от даты бизнеса, а не
     * от системной: сутки закрываются по его часовому поясу, и на телефоне
     * в другом городе неделя иначе разъехалась бы на день.
     */
    val today = remember(zone) { Instant.now().atZone(zone).toLocalDate() }
    val week = remember(today) { (6 downTo 0).map { today.minusDays(it.toLong()) } }

    var days by remember { mutableStateOf<Map<String, MonthDay>>(emptyMap()) }

    LaunchedEffect(today) {
        /*
         * Сервер отдаёт календарь месяцем, а неделя в начале месяца лежит
         * в двух: тогда спрашиваем оба. Ключи дат уникальны, и склейка
         * сводится к объединению карт.
         */
        val keys = week.map { "%04d-%02d".format(it.year, it.monthValue) }.distinct()
        val loaded = mutableMapOf<String, MonthDay>()
        keys.forEach { key ->
            runCatching {
                session.authed { token -> graph.api.send<Month>("calendar?month=$key", token = token) }
            }.getOrNull()?.days?.forEach { loaded[it.date] = it }
        }
        days = loaded
    }

    /*
     * Точка отсчёта — лучший день недели, а не месяца и не абсолютная
     * сумма: на мойке, где день это тридцать тысяч, шкала от ста тысяч
     * дала бы семь одинаково бледных клеток.
     */
    val peak = week.maxOf { days[it.toString()]?.revenue ?: 0 }
    val short = remember(lang) { Dates.shortWeekdays(lang) }

    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(26.dp))
            .background(Brand.boardSurface)
            .border(0.8.dp, Brand.boardInk.copy(alpha = 0.07f), RoundedCornerShape(26.dp))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .pressable(onClick = onOpen)
                .padding(horizontal = 4.dp, vertical = 2.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    "365",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = 1.4.sp,
                    color = Brand.boardMuted,
                )
                Text(
                    L(R.string.calendar__title),
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    color = Brand.onBoard,
                )
            }
            Icon(
                Icons.Filled.ArrowOutward,
                contentDescription = null,
                tint = Brand.grape,
                modifier = Modifier.size(15.dp),
            )
        }

        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            week.forEach { date ->
                val key = date.toString()
                val day = days[key]
                val revenue = day?.revenue ?: 0
                val isToday = date == today
                /*
                 * Корень доли, а не сама доля: половина выручки лучшего дня
                 * при линейной шкале даёт заливку вдвое бледнее, и обычный
                 * рабочий день читается как почти пустой. Слабейший тон
                 * держим заметным — «работали мало» и «не работали вовсе»
                 * должны отличаться.
                 */
                val share = if (peak > 0) revenue.toDouble() / peak else 0.0
                val fill = if (revenue > 0) {
                    Brand.grapeFill.copy(alpha = (0.05 + 0.19 * sqrt(share)).toFloat())
                } else {
                    Color.Transparent
                }

                Column(
                    Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(12.dp))
                        .background(fill)
                        .border(
                            /*
                             * Сегодня обведено, а не залито: заливка здесь
                             * уже занята под деньги, и второй смысл в ней
                             * не поместится.
                             */
                            width = if (isToday) 1.2.dp else 0.8.dp,
                            color = if (isToday) {
                                Brand.onBoard.copy(alpha = 0.32f)
                            } else {
                                Brand.boardInk.copy(alpha = 0.06f)
                            },
                            shape = RoundedCornerShape(12.dp),
                        )
                        .pressable(onClick = { onDay(key) })
                        /*
                         * Читалка экрана произносит дату словами: «12» без
                         * месяца и дня недели вслух не значит ничего.
                         */
                        .semantics(mergeDescendants = true) {
                            contentDescription = Dates.longDayKey(key, lang, zone)
                        }
                        /*
                         * Высота задана числом, а не содержимым: выручка
                         * приезжает после отрисовки, и от неё карточка не
                         * должна прыгать под уже занесённым пальцем.
                         */
                        .height(56.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Text(
                        short[date.dayOfWeek.value - 1],
                        fontSize = 9.5.sp,
                        color = Brand.boardMuted,
                        maxLines = 1,
                    )
                    Text(
                        "${date.dayOfMonth}",
                        fontSize = 15.sp,
                        fontWeight = if (revenue > 0) FontWeight.Bold else FontWeight.Medium,
                        color = if (revenue > 0) Brand.onBoard else Brand.boardMuted,
                        maxLines = 1,
                    )
                    /*
                     * Машины, а не деньги: пять знаков суммы в клетку
                     * шириной в палец не встают, а счёт машин — это один
                     * знак, и по нему день узнаётся не хуже.
                     */
                    Text(
                        if ((day?.count ?: 0) > 0) "${day?.count}" else " ",
                        fontSize = 9.sp,
                        color = Brand.boardMuted.copy(alpha = 0.8f),
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

/** Строка карты разделов: маршрут, знак, цвет, слова. */
private data class Row4(
    val route: String,
    val icon: ImageVector,
    val tint: Color,
    val title: String,
    val note: String?,
)

@Composable
private fun GroupCard(content: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().surfaceCard(22.dp)) { content() }
}

/**
 * Волосяная линия между строками, отбитая под текст, а не под значок:
 * линия под значком разрезала бы коробку пополам.
 */
@Composable
private fun Separator() {
    Box(
        Modifier
            .fillMaxWidth()
            .padding(start = 56.dp)
            .height(0.7.dp)
            .background(Brand.boardInk.copy(alpha = 0.07f))
    )
}

/**
 * Лицо строки списка.
 *
 * Значок без плашки под ним: плашка это ещё один прямоугольник, а их на
 * экране и так восемь штук. Вторых строк сейчас нет ни у одной — список
 * читается одними заголовками, — но поддержку оставляем: это свойство
 * строки настроек, а не временная надобность. Цвет раздела при этом
 * остаётся — он просто
 * перешёл с заливки на сам знак, и в столбце из четырёх строк по нему
 * находят нужную раньше, чем прочитано слово.
 */
@Composable
private fun NavRow(
    icon: ImageVector,
    tint: Color,
    title: String,
    note: String?,
    trailing: ImageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
    onClick: () -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 60.dp)
            .pressable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(13.dp),
    ) {
        // колонка знаков фиксированной ширины, иначе широкий значок
        // сдвинул бы заголовок своей строки относительно соседних
        Box(Modifier.width(27.dp), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
        }

        Column(Modifier.weight(1f)) {
            Text(
                title,
                fontSize = 17.sp,
                fontWeight = FontWeight.SemiBold,
                color = Brand.onBoard,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (!note.isNullOrEmpty()) {
                Text(note, fontSize = 12.5.sp, color = Brand.boardMuted, maxLines = 2)
            }
        }

        Spacer(Modifier.width(4.dp))
        Icon(trailing, contentDescription = null, tint = Brand.boardMuted, modifier = Modifier.size(15.dp))
    }
}
