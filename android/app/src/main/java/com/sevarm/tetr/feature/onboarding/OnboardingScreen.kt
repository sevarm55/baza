package com.sevarm.tetr.feature.onboarding

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sevarm.tetr.R
import com.sevarm.tetr.core.i18n.L
import com.sevarm.tetr.design.Brand
import com.sevarm.tetr.design.Insets
import com.sevarm.tetr.design.LimeButton
import com.sevarm.tetr.design.pressable
import kotlinx.coroutines.launch

/**
 * Четыре экрана о том, как продукт считает деньги.
 *
 * Показывается владельцу один раз, после первого входа. Не мойщику: он
 * открывает приложение, чтобы записать машину, и объяснять ему устройство
 * зарплаты и расходов — значит задержать человека, у которого на площадке
 * стоит клиент.
 *
 * Текст рисуется здесь, а не впечён в картинку. Впечённый нельзя ни
 * перевести, ни увеличить вместе с системным шрифтом — а у владельца мойки
 * он часто крупный. Картинки же намеренно нарисованы с пустой нижней
 * третью: текст ложится ровно туда.
 */
@Composable
fun OnboardingScreen(onDone: () -> Unit) {
    val slides = slides()
    val pager = rememberPagerState(pageCount = { slides.size })
    val scope = rememberCoroutineScope()

    Box(
        Modifier
            .fillMaxSize()
            .background(Brand.grapeDeep),
    ) {
        HorizontalPager(state = pager, modifier = Modifier.fillMaxSize()) { page ->
            Slide(slides[page])
        }

        /*
         * Выход есть на каждом экране. Онбординг, из которого нельзя
         * выйти, — это не объяснение, а препятствие: человек уже завёл
         * бизнес и хочет работать.
         */
        Text(
            L(R.string.common__skip),
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
            color = Color.White.copy(alpha = 0.7f),
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(top = Insets.top.calculateTopPadding())
                .padding(horizontal = 22.dp, vertical = 14.dp)
                .pressable(onClick = onDone),
        )

        Column(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .padding(horizontal = 24.dp)
                .padding(bottom = Insets.bottom.calculateBottomPadding() + 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                slides.indices.forEach { i ->
                    val on = i == pager.currentPage
                    Box(
                        Modifier
                            // текущая точка вытягивается в чёрточку: так
                            // видно не только «где я», но и «сколько
                            // осталось»
                            .width(if (on) 20.dp else 7.dp)
                            .height(7.dp)
                            .clip(CircleShape)
                            .background(if (on) Brand.lime else Color.White.copy(alpha = 0.28f))
                    )
                }
            }

            LimeButton(
                text = if (pager.currentPage == slides.lastIndex) {
                    L(R.string.common__start)
                } else {
                    L(R.string.common__next)
                },
                onClick = {
                    if (pager.currentPage == slides.lastIndex) {
                        onDone()
                    } else {
                        scope.launch { pager.animateScrollToPage(pager.currentPage + 1) }
                    }
                },
            )
        }
    }
}

private data class Slide(val image: Int, val title: String, val text: String)

@Composable
private fun slides(): List<Slide> = listOf(
    Slide(R.drawable.onboarding_1, L(R.string.onboarding__s1Title), L(R.string.onboarding__s1Body)),
    Slide(R.drawable.onboarding_2, L(R.string.onboarding__s2Title), L(R.string.onboarding__s2Body)),
    Slide(R.drawable.onboarding_3, L(R.string.onboarding__s3Title), L(R.string.onboarding__s3Body)),
    Slide(R.drawable.onboarding_4, L(R.string.onboarding__s4Title), L(R.string.onboarding__s4Body)),
)

@Composable
private fun Slide(slide: Slide) {
    Box(Modifier.fillMaxSize()) {
        /*
         * Вписываем целиком и прижимаем к верху: картинка нарисована в
         * пропорции телефона, и заполнение срезало бы её по бокам — у
         * машины пропадал нос. Низ добирает тот же грейп, что и в самой
         * картинке.
         */
        Image(
            painter = painterResource(slide.image),
            contentDescription = null,
            contentScale = ContentScale.FillWidth,
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.TopCenter),
        )

        /*
         * Затемнение снизу: держит текст читаемым и заодно прячет шов,
         * который генератор оставил на своём градиенте. Начинаем выше
         * середины — растушёвка должна накрыть шов, а не начаться под ним.
         */
        Box(
            Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        0.0f to Color.Transparent,
                        0.34f to Color.Transparent,
                        0.72f to Brand.grapeDeep.copy(alpha = 0.9f),
                        1.0f to Brand.grapeDeep,
                    )
                )
        )

        Column(
            Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .padding(horizontal = 28.dp)
                // место под точки и кнопку, которые лежат поверх
                .padding(bottom = 200.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(slide.title, fontSize = 27.sp, fontWeight = FontWeight.Bold, color = Color.White)
            Text(
                slide.text,
                fontSize = 16.sp,
                lineHeight = 22.sp,
                color = Color.White.copy(alpha = 0.78f),
            )
        }
    }
}

/**
 * Первая минута мойщика.
 *
 * У него одна рабочая страница, и весь Tetrin ему объяснять не нужно — ни
 * отчёты, ни расходы, ни зарплатный лист он не откроет никогда. Нужно три
 * вещи в том порядке, в каком они случаются за смену: открыть, записывать,
 * закрыть.
 *
 * Никаких подсказок поверх кнопок после этого нет. Экран смены и так
 * состоит из одного действия за раз: вне смены на нём только «начать
 * смену», на смене — только запись.
 */
@Composable
fun WorkerWelcome(onDone: () -> Unit) {
    val steps = listOf(
        L(R.string.setup__workerOne),
        L(R.string.setup__workerTwo),
        L(R.string.setup__workerThree),
    )

    Column(
        Modifier
            .fillMaxWidth()
            .background(Brand.bg)
            .padding(22.dp),
        verticalArrangement = Arrangement.spacedBy(0.dp),
    ) {
        Text(
            L(R.string.setup__workerTitle),
            fontSize = 26.sp,
            fontWeight = FontWeight.Bold,
            color = Brand.ink,
        )
        Text(
            L(R.string.setup__workerLead),
            fontSize = 15.sp,
            color = Brand.muted,
            modifier = Modifier.padding(top = 4.dp),
        )

        Spacer(Modifier.height(26.dp))
        steps.forEachIndexed { index, step ->
            Row(
                Modifier.padding(bottom = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Box(
                    Modifier
                        .size(24.dp)
                        .clip(CircleShape)
                        .background(Brand.ink.copy(alpha = 0.08f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        "${index + 1}",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = Brand.muted,
                    )
                }
                Text(step, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Brand.ink)
            }
        }

        Spacer(Modifier.height(8.dp))
        Text(
            L(R.string.setup__workerNote),
            fontSize = 13.5.sp,
            color = Brand.muted,
        )

        Spacer(Modifier.height(24.dp))
        /*
         * Одна кнопка и никакого «пропустить»: соглашаться здесь не с чем —
         * под листом лежит тот же экран смены. Во всю ширину, потому что
         * жмут её мокрой рукой.
         */
        LimeButton(text = L(R.string.setup__workerCta), onClick = onDone)
        Spacer(Modifier.height(Insets.bottom.calculateBottomPadding()))
    }
}
