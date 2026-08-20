package com.sevarm.tetr.feature.calendar

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sevarm.tetr.LocalGraph
import com.sevarm.tetr.R
import com.sevarm.tetr.core.api.Day
import com.sevarm.tetr.core.api.DayShift
import com.sevarm.tetr.core.api.FeedItem
import com.sevarm.tetr.core.i18n.Dates
import com.sevarm.tetr.core.i18n.L
import com.sevarm.tetr.core.ui.clock
import com.sevarm.tetr.core.ui.graphViewModel
import com.sevarm.tetr.core.ui.lang
import com.sevarm.tetr.core.ui.money
import com.sevarm.tetr.core.ui.paymentIcon
import com.sevarm.tetr.core.ui.paymentLabel
import com.sevarm.tetr.core.ui.serviceName
import com.sevarm.tetr.core.ui.unitWord
import com.sevarm.tetr.core.ui.zone
import com.sevarm.tetr.design.Brand
import com.sevarm.tetr.design.DelayedContent
import com.sevarm.tetr.design.EmptyState
import com.sevarm.tetr.design.ErrorState
import com.sevarm.tetr.design.HairLine
import com.sevarm.tetr.design.Insets
import com.sevarm.tetr.design.Palette
import com.sevarm.tetr.design.ScreenHeader
import com.sevarm.tetr.design.Stat
import com.sevarm.tetr.design.StatCards
import com.sevarm.tetr.design.StatTint
import com.sevarm.tetr.design.TetrScreenSkeleton
import com.sevarm.tetr.design.Tone
import com.sevarm.tetr.design.tile
import kotlinx.coroutines.launch

/**
 * Один день из истории — то же табло, что везде.
 *
 * Наверху прибыль, а не выручка: карточку дня открывают из календаря, где
 * уже видели, насколько день был густым; вопрос, с которым сюда заходят,
 * другой — сколько с него осталось.
 *
 * Смены стоят отдельно от записей и первыми. Человек мог отстоять день и
 * не намыть ничего — по одним записям этого не увидеть, а владельцу важно
 * именно это.
 */
@Composable
fun DayScreen(date: String, onBack: () -> Unit) {
    val graph = LocalGraph.current
    val session = graph.session
    val me by session.me.collectAsState()
    val lang = lang()
    val zone = zone()

    val scope = rememberCoroutineScope()

    var day by remember { mutableStateOf<Day?>(null) }
    var loading by remember { mutableStateOf(true) }
    var failure by remember { mutableStateOf<String?>(null) }

    suspend fun load() {
        loading = true
        try {
            day = session.authed { token -> graph.api.send<Day>("day?date=$date", token = token) }
            failure = null
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            /*
             * Раньше отказ глотался вместе с ошибкой разбора, и человек
             * видел белый лист без единого слова: день, в котором была
             * работа, выглядел пустым.
             */
            failure = com.sevarm.tetr.core.api.Failure.text(e)
        }
        loading = false
    }

    LaunchedEffect(date) { load() }

    Column(
        Modifier
            .fillMaxSize()
            .background(Brand.board)
            .padding(top = Insets.top.calculateTopPadding()),
    ) {
        ScreenHeader(
            Dates.longDayKey(date, lang, zone),
            subtitle = Dates.weekdayKey(date, lang),
            onBack = onBack,
            closeIcon = true,
        )

        val loaded = day
        when {
            /*
             * Повтор действительно повторяет. Кнопка висела на пустом
             * действии: она нажималась, гасла и не делала ничего — то есть
             * обещала выход из положения, которого не давала.
             */
            failure != null -> ErrorState(failure!!) { scope.launch { load() } }
            loading && loaded == null -> DelayedContent(true) {
                TetrScreenSkeleton(rows = 5, avatar = true)
            }
            loaded == null -> Unit
            else -> LazyColumn(
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                item { Reading(loaded) }
                item { Tiles(loaded) }

                /*
                 * Себя владелец в этом списке не видит — то же правило, что
                 * в сводке за сегодня. Он и так знает, что был на площадке;
                 * зато его собственные смены дробятся на куски при каждом
                 * заходе в приложение, и одно имя дважды подряд читалось
                 * двумя людьми. Список отвечает на вопрос «кто у меня
                 * работал», а себя в этот вопрос не включают.
                 */
                val crew = loaded.shifts.filter { it.userId != me?.id }
                if (crew.isNotEmpty()) {
                    item { SectionHeader(L(R.string.owner__onShift), crew.size) }
                    item {
                        Column(
                            Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(22.dp))
                                .background(Brand.boardSurface)
                                .border(
                                    0.8.dp,
                                    Brand.boardInk.copy(alpha = 0.07f),
                                    RoundedCornerShape(22.dp),
                                ),
                        ) {
                            crew.forEachIndexed { index, shift ->
                                if (index > 0) HairLine(inset = 60.dp)
                                CrewCard(shift)
                            }
                        }
                    }
                }

                if (loaded.feed.isEmpty()) {
                    item { EmptyState(L(R.string.day__empty)) }
                } else {
                    item { SectionHeader(L(R.string.day__records), loaded.feed.size) }
                    items(loaded.feed, key = { it.id }) { item ->
                        RecordRow(item)
                        if (item.id != loaded.feed.last().id) HairLine()
                    }
                }
            }
        }
    }
}

@Composable
private fun Reading(day: Day) {
    Column(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            if (day.profit >= 0) L(R.string.day__kept) else L(R.string.day__red),
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            color = Brand.onBoard.copy(alpha = 0.85f),
        )
        /*
         * Убыток жёлтым, не красным: красный в продукте значит «удалить», и
         * путать эти два сигнала нельзя.
         */
        Text(
            money(day.profit),
            fontSize = 48.sp,
            fontWeight = FontWeight.Bold,
            color = Brand.sign(day.profit),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/**
 * Итоги дня рядом мягких карточек, а не цветными плитками.
 *
 * Плиток было две, и обе повторяли то, что на экране уже есть: выручку
 * объясняет журнал построчно, число машин подписано над ним. Читались они
 * при этом громче всего остального — тёмная заливка со свечением рядом с
 * чёрным числом на светлом полотне забирает взгляд первой.
 *
 * Ряд называет цепочку целиком: пришло, ушло людям, ушло на расходы. Это
 * те самые три числа, из которых вышло большое число сверху, — и стоят они
 * на своём месте, сразу под ним, без свечения и без спора за внимание.
 * Число машин отсюда убрано намеренно: оно живёт над журналом, где
 * отвечает за длину списка.
 */
@Composable
private fun Tiles(day: Day) {
    if (day.stats.revenue == 0 && day.costs.total == 0) return

    StatCards(
        listOf(
            Stat(L(R.string.owner__revenue), money(day.stats.revenue), StatTint.MINT),
            Stat(L(R.string.summary__toStaff), money(day.stats.payroll), StatTint.LAVENDER),
            Stat(L(R.string.expenses__title), money(day.costs.total), StatTint.SAND),
        ),
        modifier = Modifier.padding(top = 18.dp),
    )
}

@Composable
private fun SectionHeader(title: String, count: Int? = null) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 6.dp)
            .padding(top = 12.dp, bottom = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            title,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            color = Brand.boardMuted,
            modifier = Modifier.weight(1f),
        )
        if (count != null) Text("$count", fontSize = 12.sp, color = Brand.boardMuted)
    }
}

/**
 * Кто стоял на смене — строкой в белой коробке, а не плиткой на человека.
 *
 * Смена это отрезок времени и деньги, которые за него прошли через руки.
 * Обе вещи текстовые, и сплошная заливка цветом человека их только
 * глушила: белый по фиолетовому в двенадцать пунктов читается хуже, чем
 * чернила по бумаге, а строку про сдачу наличных читают внимательно.
 */
@Composable
private fun CrewCard(shift: DayShift) {
    val tone = Palette.personTone(shift.name)
    val open = shift.closedAt == null

    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(contentAlignment = Alignment.BottomEnd) {
            Box(
                Modifier
                    .size(34.dp)
                    .clip(CircleShape)
                    .background(tone.base),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    shift.name.take(1),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                )
            }
            /*
             * Незакрытая смена помечена той же зелёной точкой, что человек
             * на площадке в кабинете. В истории она значит не «работает
             * сейчас», а «смену не закрыли», и это тот случай, когда одного
             * слова мало: пропуск в учёте видно раньше, чем прочитан
             * диапазон времени.
             */
            if (open) {
                Box(
                    Modifier
                        .size(11.dp)
                        .clip(CircleShape)
                        .background(Brand.boardSurface),
                    contentAlignment = Alignment.Center,
                ) {
                    Box(
                        Modifier
                            .size(7.dp)
                            .clip(CircleShape)
                            .background(Brand.goodOnBoard)
                    )
                }
            }
        }

        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    shift.name,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Brand.onBoard,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                Spacer(Modifier.weight(1f))
                Text(
                    /*
                     * Отрезок времени, а не одна отметка: смена это «с
                     * девяти до семи», и по открытой видно только начало —
                     * дописывать ей конец нечем и незачем.
                     */
                    listOfNotNull(clock(shift.openedAt), shift.closedAt?.let { clock(it) })
                        .joinToString(" — "),
                    fontSize = 12.5.sp,
                    color = Brand.boardMuted,
                    maxLines = 1,
                )
            }

            /*
             * Наличные: сколько набралось и сколько сдал.
             *
             * «Сдал ноль» и «не отметил» показываются по-разному, и это не
             * придирка. Первое значит, что денег не было. Второе — что
             * человек не дошёл до экрана сдачи: приложение о деньгах ничего
             * не знает и не вправе делать вид, что знает. Поэтому
             * формулировка безличная — «сдача не отмечена», а не «не
             * отметил»: второе звучит претензией к человеку там, где
             * утверждать нечего.
             *
             * Плашки под строкой больше нет. На тёмной плитке она отделяла
             * деньги от имени, на белой коробке отделять нечего: строка и
             * так вторая, и серый прямоугольник внутри белого читался
             * вложенной карточкой, которой здесь нет.
             */
            val expected = shift.cashExpected
            if (expected != null && (expected > 0 || shift.cashDeclared != null)) {
                Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    Text(
                        L(R.string.day__cashInShift, money(expected)),
                        fontSize = 12.sp,
                        color = Brand.boardMuted,
                    )
                    val declared = shift.cashDeclared
                    if (declared != null) {
                        Text(
                            L(R.string.day__handedOver, money(declared)),
                            fontSize = 12.sp,
                            color = Brand.boardMuted,
                        )
                        val diff = declared - expected
                        if (diff != 0) {
                            Text(
                                "· ${if (diff > 0) "+" else ""}${money(diff)}",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = Brand.warnOnBoard,
                            )
                        }
                    } else {
                        Text(
                            L(R.string.day__notDeclared),
                            fontSize = 12.sp,
                            color = Brand.warnOnBoard,
                        )
                    }
                }
            }
        }
    }
}

/**
 * Записи — тем же журналом, что в сводке.
 *
 * Кружок мойщика слева, номер крупно, услуга и способ оплаты словом, время
 * в самом тихом месте строки; справа колонка: цена, доля мойки, доля
 * человека. Два экрана показывают одни и те же записи, и разговаривать о
 * них они обязаны одинаково — иначе владелец, привыкший к сводке, читает
 * историю заново.
 *
 * Скидка зачёркнутым прайсом: в истории дня её не было видно ни одним
 * способом, и «6 500» не отличалось от обычной цены.
 */
@Composable
private fun RecordRow(item: FeedItem) {
    val who = item.crewNames.ifEmpty { "\u2014" }
    val face = item.crew?.firstOrNull()?.name ?: item.staffName ?: "\u2014"
    val tone = Palette.personTone(face)

    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 4.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            Modifier
                .padding(top = 1.dp)
                .size(34.dp)
                .clip(CircleShape)
                .background(tone.base),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                face.take(1),
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
            )
        }

        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                item.clientKey ?: "\u2014",
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold,
                color = Brand.onBoard,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                if (item.shared) {
                    serviceName(item.serviceName) + " \u00B7 " + who
                } else {
                    serviceName(item.serviceName) + " \u00B7 " + paymentLabel(item.payment).lowercase()
                },
                fontSize = 12.5.sp,
                color = Brand.boardMuted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                clock(item.createdAt),
                fontSize = 11.5.sp,
                color = Brand.boardMuted.copy(alpha = 0.75f),
                maxLines = 1,
            )
        }

        Column(
            horizontalAlignment = Alignment.End,
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                item.listPrice?.takeIf { it > item.price }?.let { list ->
                    Text(
                        money(list),
                        fontSize = 12.sp,
                        color = Brand.boardMuted,
                        textDecoration = TextDecoration.LineThrough,
                    )
                }
                Text(
                    money(item.price),
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Brand.onBoard,
                    maxLines = 1,
                )
            }
            Text(
                L(R.string.summary__toBusiness, money(item.price - item.earned)),
                fontSize = 12.sp,
                color = Brand.boardMuted,
                maxLines = 1,
            )
            if ((item.staffPercent ?: 0) > 0) {
                Text(
                    L(R.string.summary__share, money(item.earned)),
                    fontSize = 11.5.sp,
                    color = Brand.boardMuted.copy(alpha = 0.75f),
                    maxLines = 1,
                )
            }
        }
    }
}
