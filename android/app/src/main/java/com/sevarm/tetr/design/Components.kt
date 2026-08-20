package com.sevarm.tetr.design

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sevarm.tetr.R
import com.sevarm.tetr.core.i18n.L
import kotlin.math.max
import kotlin.math.sin

/**
 * Фирменный загрузчик.
 *
 * Не системный спиннер и не три точки. Столбики — то, из чего собран весь
 * продукт: они в графике дня, в профиле недели, в значке вкладки. Пока
 * приложение думает, оно показывает ту же фигуру, которой показывает
 * деньги, и это единственная причина, по которой загрузчик здесь свой.
 *
 * Волна, а не мигание: столбики поднимаются по очереди со сдвигом фазы,
 * поэтому фигура читается «идёт счёт», а не «что-то моргает».
 *
 * При «Уменьшении движения» столбики стоят на месте и вместо них дышит
 * прозрачность: настройка запрещает движение, а не признак работы.
 */
@Composable
fun TetrLoader(size: Dp = 22.dp, tint: Color = Brand.grape, bars: Int = 4) {
    val reduce = reduceMotion()
    val transition = rememberInfiniteTransition(label = "loader")
    val t by transition.animateFloat(
        initialValue = 0f,
        targetValue = (2 * Math.PI).toFloat(),
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 2400, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "phase",
    )

    val label = L(R.string.common__loadingShort)
    Row(
        modifier = Modifier
            .width(size * 1.2f)
            .height(size)
            .clearAndSetSemantics { contentDescription = label },
        horizontalArrangement = Arrangement.spacedBy(size * 0.15f),
        verticalAlignment = Alignment.Bottom,
    ) {
        repeat(bars) { i ->
            val h: Dp
            val a: Float
            if (reduce) {
                // неподвижная лесенка: движения нет, а фигура остаётся собой
                h = size * (0.42f + 0.58f * i / max(1, bars - 1))
                a = 0.45f + 0.55f * (sin(t * 0.6f) + 1f) / 2f
            } else {
                val k = (sin(t * 2.7f - i * 0.5f) + 1f) / 2f
                h = size * (0.32f + 0.68f * k)
                a = 1f
            }
            Box(
                Modifier
                    .width(size * 0.17f)
                    .height(h)
                    .alpha(a)
                    .clip(CircleShape)
                    .background(tint)
            )
        }
    }
}

/**
 * Главная кнопка: лайм под тёмным текстом, во всю ширину.
 *
 * Заливка сплошная, не полупрозрачная, и это не упущение. Стекло берёт
 * цвет от того, что под ним, — а единственное действие на экране обязано
 * выглядеть одинаково всегда, иначе перестаёт читаться как кнопка.
 *
 * Пока идёт запрос, надпись остаётся на месте и гаснет, поверх ложится
 * загрузчик: подменять текст на «…» значит менять ширину кнопки под
 * пальцем и терять то, на что человек только что нажал.
 */
@Composable
fun LimeButton(
    text: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
    onClick: () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    Box(
        modifier = modifier
            .fillMaxWidth()
            .scale(if (pressed) 0.98f else 1f)
            .alpha(if (enabled) 1f else 0.45f)
            .clip(RoundedCornerShape(22.dp))
            .background(Brand.lime)
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled && !loading,
                onClick = onClick,
            )
            .padding(vertical = 17.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            fontSize = 17.sp,
            fontWeight = FontWeight.Bold,
            color = Brand.onLime,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.alpha(if (loading) 0f else 1f),
        )
        if (loading) TetrLoader(size = 22.dp, tint = Brand.onLime)
    }
}

/**
 * Тихая кнопка: своя площадь, слабая подложка, тот же вес, что у текста.
 *
 * Нужна там, где действие второе по важности и спорить с главным не
 * должно: «войти по коду», «выбрать всех», «повторить». Площадь у неё
 * настоящая — сорок четыре точки: меньше этого не советуют ни для чего,
 * во что целятся пальцем на мокром экране.
 */
@Composable
fun QuietButton(
    text: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onDark: Boolean = false,
    onClick: () -> Unit,
) {
    val fill = if (onDark) Color.White.copy(alpha = 0.08f) else Brand.boardInk.copy(alpha = 0.07f)
    val edge = if (onDark) Color.White.copy(alpha = 0.14f) else Brand.boardInk.copy(alpha = 0.10f)
    val ink = if (onDark) Color.White.copy(alpha = 0.82f) else Brand.onBoard
    Box(
        modifier = modifier
            .heightIn(min = 44.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(fill)
            .border(1.dp, edge, RoundedCornerShape(14.dp))
            .pressable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold, color = ink, maxLines = 1)
    }
}

/**
 * Нажатие как у плитки, а не как у ссылки.
 *
 * Стандартная рябь Material здесь неуместна: продукт нарисован
 * поверхностями, а не Material-карточками, и круг ряби поверх лаймовой
 * плитки читается пятном. Уменьшение на два процента с короткой пружиной
 * — самый дешёвый честный ответ: он есть в момент касания, а не после
 * ответа сервера.
 */
@Composable
fun Modifier.pressable(
    enabled: Boolean = true,
    role: String? = null,
    onClick: () -> Unit,
): Modifier {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val reduce = reduceMotion()
    return this
        .scale(if (pressed && !reduce) 0.98f else 1f)
        .alpha(if (pressed) 0.9f else 1f)
        .clickable(
            interactionSource = interaction,
            indication = null,
            enabled = enabled,
            onClickLabel = role,
            onClick = onClick,
        )
}

/**
 * Раскладка в поток: плитки идут в строку, пока помещаются, потом
 * переносятся.
 *
 * Нужна там, где у элементов разной длины названия: у услуг «Քիմմաքրում»
 * и «Թափք» в равных колонках дают либо обрезанное слово, либо половину
 * пустой строки.
 */
@Composable
fun FlowRowLayout(
    modifier: Modifier = Modifier,
    spacing: Dp = 8.dp,
    content: @Composable () -> Unit,
) {
    val gap = with(LocalDensity.current) { spacing.roundToPx() }
    Layout(content = content, modifier = modifier) { measurables, constraints ->
        val maxWidth = constraints.maxWidth
        val placeables = measurables.map { it.measure(Constraints(maxWidth = maxWidth)) }

        var x = 0
        var y = 0
        var rowHeight = 0
        val positions = ArrayList<Pair<Int, Int>>(placeables.size)

        for (p in placeables) {
            if (x + p.width > maxWidth && x > 0) {
                x = 0
                y += rowHeight + gap
                rowHeight = 0
            }
            positions.add(x to y)
            x += p.width + gap
            rowHeight = max(rowHeight, p.height)
        }

        layout(maxWidth, y + rowHeight) {
            placeables.forEachIndexed { i, p ->
                p.placeRelative(positions[i].first, positions[i].second)
            }
        }
    }
}

/**
 * Марка Tetrin, набранная.
 *
 * Последние две буквы стоят в плашке: «TETR» цветом и «IN» вывороткой на
 * нём же. Приём нужен затем же, зачем он нужен любому логотипу из одного
 * слова, — чтобы слово перестало быть подписью и стало знаком.
 *
 * Шрифт тот же, что в браузере и в iOS: Unbounded Black, тот же файл. До
 * него приложение набирало марку системным шрифтом, и на двух экранах
 * одного продукта стояли два разных знака.
 */
@Composable
fun Wordmark(
    size: Dp = 15.dp,
    tint: Color = Brand.lime,
    on: Color = Brand.onLime,
) {
    val fontSize = with(LocalDensity.current) { size.toSp() }
    val family = remember { FontFamily(androidx.compose.ui.text.font.Font(R.font.unbounded_black)) }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.clearAndSetSemantics { },
    ) {
        Text(
            "TETR",
            fontFamily = family,
            fontSize = fontSize,
            color = tint,
            letterSpacing = fontSize * 0.1f,
        )
        Spacer(Modifier.width(size * 0.14f))
        Text(
            "IN",
            fontFamily = family,
            fontSize = fontSize,
            color = on,
            letterSpacing = fontSize * 0.1f,
            modifier = Modifier
                .clip(RoundedCornerShape(size * 0.22f))
                .background(tint)
                .padding(
                    start = size * 0.22f,
                    end = size * 0.12f,
                    top = size * 0.16f,
                    bottom = size * 0.16f,
                ),
        )
    }
}

/**
 * Пусто — это ответ, а не отсутствие ответа.
 *
 * Заголовок говорит, что произошло, приписка — что с этим делать. Без
 * второй строки пустой список читается как поломка продукта.
 */
@Composable
fun EmptyState(
    title: String,
    note: String? = null,
    modifier: Modifier = Modifier,
    action: (@Composable () -> Unit)? = null,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(title, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Brand.onBoard, textAlign = TextAlign.Center)
        if (!note.isNullOrEmpty()) {
            Text(note, fontSize = 13.sp, color = Brand.boardMuted, textAlign = TextAlign.Center)
        }
        action?.let {
            Spacer(Modifier.height(10.dp))
            it()
        }
    }
}

/**
 * Экран не загрузился.
 *
 * Нули вместо выручки — худшее, что можно показать: неверные данные
 * выглядят как верные, и владелец принимает решение по ним. Лучше честно
 * ничего и кнопка повтора.
 */
@Composable
fun ErrorState(text: String, modifier: Modifier = Modifier, onRetry: () -> Unit) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp, vertical = 60.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(text, fontSize = 14.sp, color = Brand.boardMuted, textAlign = TextAlign.Center)
        QuietButton(L(R.string.common__retry), onClick = onRetry)
    }
}

/** Полоса загрузки экрана целиком. */
@Composable
fun ScreenLoader(modifier: Modifier = Modifier) {
    Box(
        modifier.fillMaxWidth().padding(vertical = 80.dp),
        contentAlignment = Alignment.Center,
    ) { TetrLoader(size = 30.dp, tint = Brand.grape) }
}

/**
 * Чип выбора: тёмный, когда выбран.
 *
 * Тёмный, а не лаймовый: лайм в продукте значит главное действие, и
 * третьим значением «этот фильтр включён» он терял бы оба.
 */
@Composable
fun SelectChip(
    label: String,
    selected: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Box(
        modifier
            .clip(RoundedCornerShape(9.dp))
            .background(if (selected) Brand.onBoard else Brand.chipRest)
            .pressable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 7.dp)
            .semantics { if (selected) contentDescription = label },
    ) {
        Text(
            label,
            fontSize = 12.5.sp,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
            color = if (selected) Brand.board else Brand.boardMuted,
            maxLines = 1,
        )
    }
}

/**
 * Лаймовый чип: выбор внутри формы записи — класс машины, услуга, ставка.
 *
 * Здесь лайм на месте: это и есть выбор, ради которого экран открыт.
 */
@Composable
fun LimeChip(
    label: String,
    selected: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Box(
        modifier
            .clip(RoundedCornerShape(50))
            .background(if (selected) Brand.lime else Brand.boardInk.copy(alpha = 0.07f))
            .pressable(onClick = onClick)
            .padding(horizontal = 15.dp, vertical = 10.dp),
    ) {
        Text(
            label,
            fontSize = 14.5.sp,
            fontWeight = FontWeight.SemiBold,
            color = if (selected) Brand.onLime else Brand.onBoard,
            maxLines = 1,
        )
    }
}

/** Волосяная линия между строками списка. */
@Composable
fun HairLine(modifier: Modifier = Modifier, inset: Dp = 0.dp) {
    Box(
        modifier
            .fillMaxWidth()
            .padding(start = inset)
            .height(1.dp)
            .background(Brand.boardInk.copy(alpha = 0.07f))
    )
}

/** Разделитель-столбик между показателями в одной строке. */
@Composable
fun VerticalHair(height: Dp = 31.dp) {
    Box(Modifier.width(1.dp).height(height).background(Brand.boardInk.copy(alpha = 0.09f)))
}

/** Поля, которыми живут все экраны продукта. */
object Pad {
    val screen = PaddingValues(horizontal = 12.dp)
    val card = 16.dp
    val gap = 10.dp
}

/** Точка состояния: залита, когда «сейчас», и кольцо, когда нет. */
@Composable
fun StateDot(on: Boolean, size: Dp = 7.dp) {
    Box(
        Modifier
            .size(size)
            .clip(CircleShape)
            .background(if (on) Brand.goodOnBoard else Color.Transparent)
            .border(
                width = if (on) 0.dp else 1.5.dp,
                color = if (on) Color.Transparent else Brand.boardMuted,
                shape = CircleShape,
            )
    )
}

/**
 * Спокойная краска показания: заливка и знаки к ней.
 *
 * Это не акцентные цвета продукта — грейпом и лаймом здесь не красят
 * ничего. Мята принадлежит объёму работы, лаванда денежному контексту,
 * песок расходам, и один и тот же смысл окрашен одинаково на всех экранах:
 * увидев песочную карточку, человек ещё до чтения знает, что речь о
 * тратах.
 */
enum class StatTint {
    MINT,
    LAVENDER,
    SAND,

    /**
     * Не деньги. Бумага без краски — для счётчиков: число машин стоит в
     * одном ряду с суммами, но отвечает на другой вопрос, и красить его
     * денежной краской значит соврать глазу.
     */
    PAPER;

    val fill: Color
        @Composable @ReadOnlyComposable get() = when (this) {
            MINT -> Brand.mintCard
            LAVENDER -> Brand.lavenderCard
            SAND -> Brand.sandCard
            PAPER -> Brand.boardSurface
        }

    val ink: Color
        @Composable @ReadOnlyComposable get() = when (this) {
            MINT -> Brand.mintInk
            LAVENDER -> Brand.lavenderInk
            SAND -> Brand.sandInk
            PAPER -> Brand.onBoard
        }
}

/** Показание в ряду итогов: подпись, число и краска. */
data class Stat(val label: String, val value: String, val tint: StatTint)

/**
 * Ряд итогов: несколько мягких карточек в строку.
 *
 * Цвет остался — ушла громкость. Тёмная плитка со свечением была прибором:
 * она светилась, тянула взгляд первой и спорила с главным числом экрана,
 * хотя говорит вещи второстепенные. Эти карточки той же семьи, что
 * спокойные поверхности смены: низкая насыщенность, никакого градиента,
 * знаки цветом самой краски, а не белым по тёмному.
 *
 * Содержимое по центру карточки, а не по левому краю. Числа здесь разной
 * длины — «5» и «43 500 ֏» рядом, — и при левой выключке ряд выглядит
 * рассыпанным; по центру каждая карточка читается отдельным показанием, а
 * ряд остаётся ровным.
 *
 * Живёт в оформлении, а не на экране: тот же ряд стоит в дне и в
 * календаре, и двумя копиями они разъехались бы на первой правке.
 */
@Composable
fun StatCards(items: List<Stat>, columns: Int = 3, modifier: Modifier = Modifier) {
    if (items.isEmpty()) return

    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(9.dp)) {
        items.chunked(columns).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                row.forEach { item ->
                    StatCard(item, Modifier.weight(1f))
                }
                /*
                 * Недостающие места в последнем ряду занимает пустота той
                 * же ширины: иначе одинокая карточка растянулась бы на всю
                 * строку и прочиталась бы главной, хотя она такая же, как
                 * соседние сверху.
                 */
                repeat(columns - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

@Composable
private fun StatCard(item: Stat, modifier: Modifier) {
    val ink = item.tint.ink
    Column(
        modifier
            .clip(RoundedCornerShape(18.dp))
            .background(item.tint.fill)
            .padding(horizontal = 8.dp, vertical = 13.dp)
            .semantics(mergeDescendants = true) { },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Text(
            item.label,
            fontSize = 11.5.sp,
            color = ink.copy(alpha = 0.85f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            item.value,
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            color = ink,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
