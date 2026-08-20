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
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.PullToRefreshDefaults
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
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
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.sin
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Фирменный загрузчик.
 *
 * Четыре столбика — то, из чего собран весь продукт: они в графике дня,
 * в профиле недели, в значке вкладки, на плитках щита. Пока приложение
 * думает, оно показывает ту же фигуру, которой показывает деньги, и это
 * единственная причина, по которой загрузчик здесь свой.
 *
 * Что делает фигура за оборот:
 *
 *     волна  →  сходятся  →  складываются 2×2  →  вдох  →  расходятся
 *
 * Волна говорит «идёт счёт»: столбики поднимаются по очереди, как растёт
 * столбик выручки. Складывание в квадрат — момент, ради которого всё и
 * затевалось: четыре одинаковые детали на секунду становятся одним
 * знаком, и знак этот больше нигде не встречается, поэтому запоминается.
 *
 * Ни один кадр не крутится вокруг центра. Вращение — чужой язык: так
 * выглядит каждый второй индикатор, и фигура, которая крутится,
 * перестаёт быть чьей-то. По той же причине здесь нет
 * `CircularProgressIndicator`.
 *
 * Оборот кончается там же, где начался, поэтому шва между оборотами не
 * видно. Двигаются только трансформации: раскладку кадр не пересчитывает,
 * и на слабом телефоне анимация не роняет кадры.
 *
 * При «Уменьшении движения» столбики стоят лесенкой и вместо них дышит
 * прозрачность: настройка запрещает движение, а не признак работы.
 */

/** Доли оборота, на которых стоят опорные кадры. */
private val LOADER_TIMES = floatArrayOf(
    0f, 0.08f, 0.16f, 0.24f, 0.32f, 0.44f, 0.6f, 0.7f, 0.8f, 0.92f, 1f,
)

/** Кривая на каждом промежутке между опорными кадрами. */
private val LOADER_CURVES: List<(Float) -> Float> = listOf(
    Ease::inOut,  // волна: столбик 1
    Ease::inOut,  // столбик 2
    Ease::inOut,  // столбик 3
    Ease::inOut,  // столбик 4
    Ease::spring, // сходятся к центру
    Ease::soft,   // складываются в квадрат
    Ease::out,    // вдох
    Ease::inOut,  // выдох
    Ease::spring, // расходятся обратно в ряд
    Ease::linear, // пауза перед новым оборотом
)

/** Шаг между столбиками в ряду, в долях высоты фигуры. */
private const val LOADER_PITCH = 0.3f

/** Ширина столбика, в долях высоты фигуры. */
private const val LOADER_BAR = 0.17f

/**
 * Насколько ряд сжимается к центру перед складыванием.
 *
 * Не теснее: при 0.46 шаг становится меньше ширины столбика, четыре
 * детали сливаются в один прямоугольник, и вместо «сошлись» видно
 * «пропали».
 */
private const val LOADER_COMPRESS = 0.72f
private const val LOADER_GRID_X = 0.115f
private const val LOADER_GRID_Y = 0.155f

/**
 * Значение дорожки на доле оборота.
 *
 * Опорные кадры и кривые между ними — ровно те же, что в
 * `components/loading/tetrin-loader.tsx` и `ios/Tetr/Design/Theme.swift`.
 * Числа стоят рядом во всех трёх файлах и правятся вместе.
 */
private fun loaderTrack(values: FloatArray, p: Float): Float {
    if (p <= 0f) return values[0]
    for (k in 1 until LOADER_TIMES.size) {
        if (p <= LOADER_TIMES[k]) {
            val span = LOADER_TIMES[k] - LOADER_TIMES[k - 1]
            val raw = if (span <= 0f) 1f else (p - LOADER_TIMES[k - 1]) / span
            val eased = LOADER_CURVES[k - 1](raw.coerceIn(0f, 1f))
            return values[k - 1] + (values[k] - values[k - 1]) * eased
        }
    }
    return values[values.size - 1]
}

/**
 * Высота столбика на кадрах волны: свой кадр вытягивает столбик целиком,
 * соседние поднимают на треть. Отсюда бегущая волна вместо четырёх
 * одновременных морганий.
 */
private fun loaderWave(i: Int): FloatArray =
    FloatArray(5) { k ->
        val d = abs(k - (i + 1))
        val lift = if (d == 0) 1f else if (d == 1) 0.34f else 0f
        0.4f + 0.6f * lift
    }

@Composable
fun TetrLoader(size: Dp = 22.dp, tint: Color = Brand.grape, bars: Int = 4) {
    val reduce = reduceMotion()
    val transition = rememberInfiniteTransition(label = "loader")
    val p by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = Motion.LOADER_CYCLE, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "phase",
    )
    val breath by transition.animateFloat(
        initialValue = 0.45f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1200, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "breath",
    )

    val label = L(R.string.common__loadingShort)
    val px = with(LocalDensity.current) { size.toPx() }

    Box(
        modifier = Modifier
            .width(size * 1.24f)
            .height(size)
            .clearAndSetSemantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        repeat(bars) { i ->
            val rowX = (i - (bars - 1) / 2f) * LOADER_PITCH * px
            val gridX = (if (i < bars / 2) -LOADER_GRID_X else LOADER_GRID_X) * px
            val gridY = (if (i % 2 == 0) -LOADER_GRID_Y else LOADER_GRID_Y) * px
            val wave = loaderWave(i)

            Box(
                Modifier
                    .width(size * LOADER_BAR)
                    .height(size)
                    .graphicsLayer {
                        if (reduce) {
                            translationX = rowX
                            scaleY = 0.42f + 0.58f * i / max(1, bars - 1)
                            alpha = breath
                        } else {
                            /* Ряд складывается пополам: левая пара уходит
                               влево, правая вправо. Иначе третий столбик
                               пролетает сквозь второй, и вместо
                               складывания видно свалку. */
                            translationX = loaderTrack(
                                floatArrayOf(
                                    rowX, rowX, rowX, rowX, rowX,
                                    rowX * LOADER_COMPRESS,
                                    gridX, gridX, gridX, rowX, rowX,
                                ),
                                p,
                            )
                            translationY = loaderTrack(
                                floatArrayOf(0f, 0f, 0f, 0f, 0f, 0f, gridY, gridY, gridY, 0f, 0f),
                                p,
                            )
                            val pulse = loaderTrack(
                                floatArrayOf(1f, 1f, 1f, 1f, 1f, 1f, 1f, 1.055f, 1f, 1f, 1f),
                                p,
                            )
                            scaleY = loaderTrack(
                                floatArrayOf(
                                    wave[0], wave[1], wave[2], wave[3], wave[4],
                                    0.56f, 0.26f, 0.26f, 0.26f, wave[0], wave[0],
                                ),
                                p,
                            ) * pulse
                            scaleX = pulse
                        }
                    }
                    .clip(RoundedCornerShape(percent = 50))
                    .background(tint)
            )
        }
    }
}

/**
 * Малый загрузчик: та же волна, три детали.
 *
 * Живёт внутри кнопок и строк. Фирменный морф сюда не ставится
 * сознательно: кнопку «записать» жмут сорок раз за смену, и фигура,
 * которая на каждое нажатие собирается в квадрат, через неделю начинает
 * раздражать. Праздник — на запуске, в работе достаточно признака жизни.
 */
@Composable
fun TetrMiniLoader(size: Dp = 16.dp, tint: Color = Brand.grape) {
    val reduce = reduceMotion()
    val transition = rememberInfiniteTransition(label = "mini")
    val t by transition.animateFloat(
        initialValue = 0f,
        targetValue = (2 * Math.PI).toFloat(),
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1100, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "phase",
    )

    Row(
        modifier = Modifier.height(size).clearAndSetSemantics { },
        horizontalArrangement = Arrangement.spacedBy(size * 0.16f),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        repeat(3) { i ->
            val k = (sin(t - i * 0.75f) + 1f) / 2f
            Box(
                Modifier
                    .width(size * 0.22f)
                    .height(size * 0.62f)
                    .graphicsLayer {
                        if (reduce) {
                            alpha = 0.35f + 0.65f * k
                        } else {
                            scaleY = 1f + 0.38f * k
                            alpha = 0.55f + 0.45f * k
                        }
                    }
                    .clip(RoundedCornerShape(percent = 50))
                    .background(tint)
            )
        }
    }
}

/**
 * Место прибора, пока едут данные.
 *
 * По нему проходит одна очень мягкая волна света. Волна медленная и
 * слабая по контрасту: скелет обязан читаться как «сейчас будет», а не
 * как «что-то мигает». Все блоки экрана появляются одновременно, поэтому
 * их волны идут в один такт и глаз читает одно движение на весь экран, а
 * не десять независимых бликов на пустоте.
 */
@Composable
fun TetrSkeleton(
    modifier: Modifier = Modifier,
    width: Dp? = null,
    height: Dp = 14.dp,
    radius: Dp = 6.dp,
) {
    val reduce = reduceMotion()
    val transition = rememberInfiniteTransition(label = "skeleton")
    val travel by transition.animateFloat(
        initialValue = -1.5f,
        targetValue = 0.9f,
        animationSpec = infiniteRepeatable(
            /* Пауза в конце оборота — чтобы движение не читалось
               бесконечной лентой и не торопило. */
            animation = tween(durationMillis = 2600, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "sheen",
    )

    val base = modifier
        .then(if (width != null) Modifier.width(width) else Modifier)
        .height(height)
        .clip(RoundedCornerShape(radius))
        .background(Brand.onBoard.copy(alpha = 0.06f))

    if (reduce) {
        Box(base)
        return
    }

    Box(base) {
        Box(
            Modifier
                .fillMaxWidth()
                .height(height)
                .graphicsLayer { translationX = size.width * travel.coerceAtMost(0.9f) }
                .background(
                    Brush.horizontalGradient(
                        0f to Color.Transparent,
                        0.42f to Brand.onBoard.copy(alpha = 0.05f),
                        0.58f to Brand.onBoard.copy(alpha = 0.05f),
                        1f to Color.Transparent,
                    )
                )
        )
    }
}

/** Место строки списка: значок, название, число справа. */
@Composable
fun TetrSkeletonRow(index: Int = 0, avatar: Boolean = false) {
    /* Ширины подписей заданы раз и навсегда, а не случайно: случайная
       ширина меняется на каждой отрисовке, и скелет начинает дёргаться
       сам по себе. */
    val widths = listOf(112.dp, 144.dp, 96.dp, 128.dp, 160.dp, 112.dp)
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (avatar) {
            TetrSkeleton(width = 32.dp, height = 32.dp, radius = 16.dp)
        } else {
            TetrSkeleton(width = 18.dp, height = 18.dp, radius = 5.dp)
        }
        TetrSkeleton(width = widths[index % widths.size], height = 13.dp)
        Spacer(Modifier.weight(1f))
        TetrSkeleton(width = 72.dp, height = 13.dp)
    }
}

/** Место списка строк. */
@Composable
fun TetrSkeletonList(rows: Int = 4, avatar: Boolean = false, modifier: Modifier = Modifier) {
    val label = L(R.string.common__loadingShort)
    Column(
        modifier
            .fillMaxWidth()
            .semantics { contentDescription = label },
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        repeat(rows) { i -> TetrSkeletonRow(index = i, avatar = avatar) }
    }
}

/**
 * Место экрана со сводкой наверху и списком под ней.
 *
 * Форма общая для разделов, которые так и устроены: расходы, услуги,
 * люди, клиенты. Экрану с другой раскладкой нужен свой скелет: скелет,
 * показывающий не ту разметку, читается как «загрузилось неправильно», и
 * вздрагивание при подстановке заметнее, чем его отсутствие.
 */
@Composable
fun TetrScreenSkeleton(
    modifier: Modifier = Modifier,
    reading: Boolean = true,
    rows: Int = 5,
    avatar: Boolean = false,
) {
    Column(
        modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(22.dp),
    ) {
        if (reading) {
            Column(
                Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                TetrSkeleton(width = 120.dp, height = 13.dp)
                TetrSkeleton(width = 210.dp, height = 40.dp, radius = 10.dp)
                TetrSkeleton(width = 170.dp, height = 13.dp)
            }
        }
        TetrSkeleton(width = 130.dp, height = 14.dp)
        TetrSkeletonList(rows = rows, avatar = avatar)
    }
}

/**
 * Потягивание вниз — обновить.
 *
 * У Android этого жеста не было вовсе, хотя у iOS он есть с самого
 * начала: один продукт отвечал на «дай свежие цифры» по-разному в
 * зависимости от того, какой телефон в руке. Экран мойки открывают
 * десятки раз за смену, и первое, что делает рука, увидев вчерашнее
 * число, — тянет вниз.
 *
 * Индикатор системный, а не фирменный. Жест принадлежит платформе:
 * человек знает на ощупь, когда именно отпустить, и подменить эту
 * механику своей фигурой значит сломать то единственное, что в ней
 * ценно. Фирменное движение живёт там, где платформа своего не
 * предлагает, — на заставке и внутри кнопок.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Refreshable(
    refreshing: Boolean,
    modifier: Modifier = Modifier,
    onRefresh: () -> Unit,
    content: @Composable () -> Unit,
) {
    PullToRefreshBox(
        isRefreshing = refreshing,
        onRefresh = onRefresh,
        modifier = modifier,
        indicator = {
            PullToRefreshDefaults.Indicator(
                state = rememberPullToRefreshState(),
                isRefreshing = refreshing,
                modifier = Modifier.align(Alignment.TopCenter),
                containerColor = Brand.boardSurface,
                color = Brand.grape,
            )
        },
    ) { content() }
}

/**
 * Показать содержимое, только если ожидание затянулось.
 *
 * Между нажатием и ответом чаще всего проходит меньше двух десятых
 * секунды. Если на это время подставить скелет, человек увидит вспышку
 * серого и решит, что экран моргнул, — хуже, чем если бы не было
 * ничего.
 *
 * Обратный ход мгновенный: пришли данные — показываем данные. Придержать
 * готовый ответ ради красоты анимации значит соврать про скорость
 * продукта в единственном месте, где скорость видна.
 */
@Composable
fun DelayedContent(
    active: Boolean,
    delayMs: Long = Motion.LOADING_DELAY_MS,
    content: @Composable () -> Unit,
) {
    var shown by remember { mutableStateOf(false) }
    LaunchedEffect(active, delayMs) {
        if (!active) {
            shown = false
            return@LaunchedEffect
        }
        delay(delayMs)
        shown = true
    }
    if (active && shown) content()
}

/**
 * Точка рядом с заголовком: данные на экране сверяются с сервером.
 *
 * Первая загрузка и фоновое обновление — разные состояния. Когда числа
 * уже на экране, подменять их скелетом нельзя: скелет говорит «ничего
 * нет», а всё есть, просто чуть устарело.
 */
@Composable
fun TetrRefreshDot(active: Boolean, tint: Color = Brand.lime) {
    if (!active) return
    val reduce = reduceMotion()
    val transition = rememberInfiniteTransition(label = "refresh")
    val k by transition.animateFloat(
        initialValue = 0.3f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 600, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "pulse",
    )
    Box(
        Modifier
            .size(6.dp)
            .graphicsLayer {
                alpha = if (reduce) 0.8f else k
                if (!reduce) {
                    scaleX = 0.8f + 0.2f * k
                    scaleY = 0.8f + 0.2f * k
                }
            }
            .clip(CircleShape)
            .background(tint)
    )
}

/**
 * Главная кнопка: лайм под тёмным текстом, во всю ширину.
 *
 * Заливка сплошная, не полупрозрачная, и это не упущение. Стекло берёт
 * цвет от того, что под ним, — а единственное действие на экране обязано
 * выглядеть одинаково всегда, иначе перестаёт читаться как кнопка.
 *
 * Пока идёт запрос, надпись остаётся на месте и гаснет, поверх ложится
 * признак работы: подменять текст на «…» значит менять ширину кнопки под
 * пальцем и терять то, на что человек только что нажал.
 *
 * Занято и погашено — разные состояния. Погашенная кнопка бледнеет и
 * говорит «сейчас нельзя»; занятая остаётся в полном цвете и говорит
 * «принято, идёт». Человек, который видит одно и то же в обоих случаях,
 * не знает, ждать ему или дозаполнять форму.
 *
 * Слово важнее фигуры: «Պահպանվում է…» отвечает ровно на вопрос, который
 * человек задал нажатием, а один индикатор говорит только «что-то идёт».
 * Кнопка во всю ширину, поэтому длина подписи на габарит не влияет.
 */
@Composable
fun LimeButton(
    text: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
    /** «Ավելացվում է…», «Վճարվում է…» — что именно делаем. */
    busyTitle: String? = null,
    onClick: () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    Box(
        modifier = modifier
            .fillMaxWidth()
            .scale(if (pressed) 0.98f else 1f)
            /* Бледнеет только погашенная кнопка. Занятая остаётся в
               полном цвете: половина экранов считает `ready = !busy &&
               …`, и без этой оговорки кнопка выцветала ровно в тот
               момент, когда должна была сказать «принято, идёт». */
            .alpha(if (enabled || loading) 1f else 0.45f)
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
        if (loading) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(7.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TetrMiniLoader(size = 20.dp, tint = Brand.onLime)
                if (busyTitle != null) {
                    Text(
                        text = busyTitle,
                        fontSize = 17.sp,
                        fontWeight = FontWeight.Bold,
                        color = Brand.onLime,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
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
    /* Кнопка сама показывает, что повтор пошёл. Без этого человек жмёт
       её второй и третий раз, не понимая, нажалась ли она вообще, — а
       каждое нажатие уходит на сервер. */
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp, vertical = 60.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(text, fontSize = 14.sp, color = Brand.boardMuted, textAlign = TextAlign.Center)

        if (busy) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(7.dp),
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.heightIn(min = 44.dp),
            ) {
                TetrMiniLoader(size = 16.dp)
                Text(
                    L(R.string.common__retrying),
                    fontSize = 13.5.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Brand.boardMuted,
                )
            }
        } else {
            QuietButton(L(R.string.common__retry)) {
                busy = true
                scope.launch {
                    onRetry()
                    /* Полсекунды удержания: сам `onRetry` возвращается
                       мгновенно — он только просит экран перечитать
                       себя, — и без задержки признак повтора мигнул бы и
                       пропал, то есть не сказал бы ничего. */
                    delay(500)
                    busy = false
                }
            }
        }
    }
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
