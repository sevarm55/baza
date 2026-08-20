package com.sevarm.tetr.design

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sevarm.tetr.R
import com.sevarm.tetr.core.i18n.L
import com.sevarm.tetr.core.phone.Countries
import com.sevarm.tetr.core.phone.Country

/**
 * Поле для кода — PIN или код из SMS — клетками.
 *
 * ГЛАВНОЕ РЕШЕНИЕ ТО ЖЕ, ЧТО В КАБИНЕТЕ И В iOS: клеток шесть, а поле
 * одно.
 *
 * Шесть отдельных полей — самый частый способ сделать такое и самый
 * плохой. Читалка экрана произносит шесть безымянных полей вместо одного
 * кода; вставка из буфера попадает в первую клетку и обрезается; забой
 * через границу клетки не работает; а автоподстановка кода из SMS кладёт
 * ВЕСЬ код в первое поле — то есть ломается ровно то, ради чего этот экран
 * и делали.
 *
 * Здесь настоящее поле ровно одно, прозрачное, во всю площадь ряда, а
 * клетки под ним — картинка. Поэтому само собой работает всё, что работает
 * у обычного поля: вставка, забой, выделение, автоподстановка из SMS,
 * аппаратная клавиатура, увеличенный системный шрифт.
 */
@Composable
fun CodeCells(
    value: String,
    onValue: (String) -> Unit,
    length: Int,
    label: String,
    modifier: Modifier = Modifier,
    /**
     * Прятать ли набранное. У PIN — да, у кода из SMS — нет: код и так
     * только что пришёл человеку в открытом сообщении, и точки вместо цифр
     * мешали бы сверить набранное с тем, что видно в шторке.
     */
    secure: Boolean = false,
    /**
     * На каком полотне стоят клетки.
     *
     * Не тема системы, а цвет ПОВЕРХНОСТИ под ними: на экране входа это
     * грейп при любой теме телефона, в карточке сотрудника — светлое
     * табло. Клетки рисовались белым всегда, и код, который владелец
     * придумывает вслух, стоя рядом с работником, оказывался белым по
     * белому: набранного не видно, а проверить его негде.
     */
    onDark: Boolean = false,
    /** Системная подсказка автозаполнения. */
    contentType: ContentType? = null,
    focusRequester: FocusRequester? = null,
    /**
     * Набрали последнюю цифру. У входа этим отправляют форму, чтобы не
     * заставлять тянуться к кнопке ради движения, которое повторяют каждый
     * день.
     */
    onComplete: (() -> Unit)? = null,
) {
    var focused by remember { mutableStateOf(false) }
    val height = 52.dp

    val ink = if (onDark) Color.White else Brand.onBoard
    val cell = if (onDark) Color.White else Brand.boardInk
    val edge = if (onDark) Color.White else Brand.boardInk

    Box(modifier) {
        // Клетки — картинка, и читалке экрана их видеть незачем.
        Row(
            Modifier
                .fillMaxWidth()
                .semantics { },
            horizontalArrangement = Arrangement.spacedBy(7.dp),
        ) {
            repeat(length) { index ->
                val filled = index < value.length
                /*
                 * Клетка, куда попадёт следующая цифра. Когда набрано всё,
                 * подсвечиваем последнюю: иначе подсветка уезжает за ряд и
                 * «сюда пишут» не показано нигде.
                 */
                val active = focused && index == minOf(value.length, length - 1)

                Box(
                    Modifier
                        .weight(1f)
                        .height(height)
                        .clip(RoundedCornerShape(12.dp))
                        .background(cell.copy(alpha = if (filled) 0.18f else 0.08f))
                        .border(
                            width = if (active) 2.dp else 1.dp,
                            /*
                             * Рамка активной клетки на светлом — грейп, а
                             * не лайм: лайм по светлому даёт контраст 1.06,
                             * и подсветки «сюда пишут» на нём просто нет.
                             */
                            color = when {
                                active && onDark -> Brand.lime
                                active -> Brand.grape
                                else -> edge.copy(alpha = if (filled) 0.34f else 0.18f)
                            },
                            shape = RoundedCornerShape(12.dp),
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    if (filled) {
                        if (secure) {
                            Box(
                                Modifier
                                    .size(9.dp)
                                    .clip(CircleShape)
                                    .background(ink)
                            )
                        } else {
                            Text(
                                value[index].toString(),
                                fontSize = 21.sp,
                                fontWeight = FontWeight.Bold,
                                color = ink,
                            )
                        }
                    }
                }
            }
        }

        /*
         * Настоящее поле поверх ряда: прозрачное, без курсора и без
         * выделения. Нажатие в любое место ряда открывает клавиатуру,
         * потому что нажимают именно в него.
         */
        BasicTextField(
            value = value,
            onValueChange = { raw ->
                val clean = raw.filter { it.isDigit() }.take(length)
                if (clean != value) onValue(clean)
                if (clean.length == length) onComplete?.invoke()
            },
            modifier = Modifier
                .fillMaxWidth()
                .height(height)
                .then(focusRequester?.let { Modifier.focusRequester(it) } ?: Modifier)
                .onFocusChanged { focused = it.isFocused }
                .semantics {
                    contentDescription = label
                    stateDescription = L(R.string.auth__entered, value.length, length)
                    /*
                     * Ради этой строки всё и затевалось: система сама
                     * предлагает код из только что пришедшей SMS, и
                     * человеку не надо уходить в «Сообщения». Работает она
                     * только с ОДНИМ полем на код — потому клетки здесь и
                     * нарисованы, а не сделаны шестью полями.
                     */
                    contentType?.let { this.contentType = it }
                },
            textStyle = TextStyle(color = Color.Transparent),
            cursorBrush = SolidColor(Color.Transparent),
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.NumberPassword,
                imeAction = ImeAction.Done,
            ),
            singleLine = true,
            decorationBox = { inner ->
                Box(Modifier.fillMaxWidth().height(height)) { inner() }
            },
        )
    }
}

/**
 * Поле телефона: код страны меню, номер — цифрами.
 *
 * Раньше здесь стояло одно поле с подсказкой «+374 77 123 456», и человек
 * с российским или грузинским номером должен был сам догадаться набрать
 * плюс и код. В браузере код выбирается списком с первого дня, и
 * приложение оставалось единственным местом, где это надо было знать
 * заранее.
 *
 * Меню, а не барабан: стран пять, и разворачивать ради них полэкрана
 * незачем. Флаг здесь картинка; сущность — телефонный код, и он написан
 * рядом словами.
 */
@Composable
fun CountryPhoneField(
    country: Country,
    onCountry: (Country) -> Unit,
    number: String,
    onNumber: (String) -> Unit,
    modifier: Modifier = Modifier,
    ink: Color = Brand.onBoard,
    focusRequester: FocusRequester? = null,
) {
    var open by remember { mutableStateOf(false) }

    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Box {
            Row(
                Modifier
                    .clip(RoundedCornerShape(10.dp))
                    .pressable { open = true }
                    .padding(vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(country.flag, fontSize = 17.sp)
                Text(
                    "+${country.dial}",
                    fontSize = 17.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = ink,
                )
                Icon(
                    Icons.Filled.ExpandMore,
                    contentDescription = L(R.string.auth__country),
                    tint = ink,
                    modifier = Modifier.size(16.dp),
                )
            }

            DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                Countries.all.forEach { c ->
                    DropdownMenuItem(
                        text = { Text("${c.flag} ${c.code} +${c.dial}") },
                        onClick = {
                            onCountry(c)
                            open = false
                        },
                    )
                }
            }
        }

        Spacer(Modifier.width(10.dp))

        BasicTextField(
            value = number,
            /*
             * Поле НЕ переписывается на каждом нажатии, и это не лень, а
             * исправленная ошибка: разбивка на группы прямо во время
             * набора возвращала в поле новую строку после каждой цифры, и
             * цифры, набранные быстро, терялись — из восьми доезжало пять.
             * Здесь только отсекается лишнее.
             */
            onValueChange = { raw -> onNumber(country.national(raw)) },
            modifier = Modifier
                .weight(1f)
                .then(focusRequester?.let { Modifier.focusRequester(it) } ?: Modifier)
                .semantics { contentDescription = L(R.string.auth__phone) },
            textStyle = TextStyle(
                color = ink,
                fontSize = 17.sp,
                fontWeight = FontWeight.Medium,
            ),
            cursorBrush = SolidColor(Brand.lime),
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Phone,
                imeAction = ImeAction.Done,
            ),
            singleLine = true,
            decorationBox = { inner ->
                if (number.isEmpty()) {
                    Text(
                        country.example,
                        fontSize = 17.sp,
                        color = ink.copy(alpha = 0.45f),
                    )
                }
                inner()
            },
        )
    }
}

/**
 * Поле ввода, по которому попадают всей строкой.
 *
 * Compose отдаёт `BasicTextField` ровно ту площадь, которую занимает
 * набранный текст: у пустого поля это несколько точек возле каретки, и
 * промахнуться мимо них проще, чем попасть. Подпись, поля вокруг, левая
 * половина строки касание не принимали вовсе — человек тыкал в коробку и
 * не понимал, почему клавиатура не появляется.
 *
 * Здесь коробка сама ловит касание и ставит фокус руками. Цель размером во
 * всю строку, то есть больше сорока восьми точек по высоте, как и требует
 * система от любого нажимаемого места.
 *
 * Подпись сверху, а не слева, и набор идёт влево: у всех полей продукта
 * один левый край, и каретка не ищется заново на каждой строке. Раньше
 * значение прижималось вправо, и в форме из трёх полей три каретки стояли
 * в трёх разных местах.
 *
 * Заведено здесь, а не в каждом экране, потому что полей в продукте
 * дюжина: услуга, класс, работник, номер, процент, название бизнеса. Шесть
 * копий одного приёма разъезжаются на первой же правке.
 */
@Composable
fun FieldRow(
    label: String,
    value: String,
    onValue: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    keyboard: KeyboardType = KeyboardType.Text,
    enabled: Boolean = true,
) {
    val focus = remember { FocusRequester() }

    Column(
        modifier
            .fillMaxWidth()
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
            ) { focus.requestFocus() }
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Text(label, fontSize = 12.sp, color = Brand.boardMuted)
        BasicTextField(
            value = value,
            onValueChange = onValue,
            enabled = enabled,
            textStyle = TextStyle(
                color = Brand.onBoard,
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold,
            ),
            cursorBrush = SolidColor(Brand.grape),
            keyboardOptions = KeyboardOptions(keyboardType = keyboard, imeAction = ImeAction.Done),
            singleLine = true,
            modifier = Modifier
                .fillMaxWidth()
                .focusRequester(focus),
            decorationBox = { inner ->
                if (value.isEmpty() && placeholder.isNotEmpty()) {
                    Text(
                        placeholder,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Brand.boardMuted.copy(alpha = 0.6f),
                        maxLines = 1,
                    )
                }
                inner()
            },
        )
    }
}
