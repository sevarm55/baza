package com.sevarm.tetr.core.i18n

import com.sevarm.tetr.R
import kotlin.math.absoluteValue

/**
 * Деньги.
 *
 * Целые в минимальных единицах — так они пришли с сервера и так же уходят
 * обратно. Через плавающую точку сумма зарплаты однажды разойдётся с той,
 * что видит владелец, и объяснить это будет нечем.
 *
 * Разряды по языку интерфейса, а не по языку телефона: сумма обязана
 * выглядеть одинаково в приложении и в браузере до символа. Валюта от
 * языка НЕ зависит — мойка в Ереване берёт драмы, на каком бы языке
 * владелец ни читал экран.
 */
fun money(amount: Int, currency: String = "AMD", lang: Lang): String {
    val symbol = if (currency == "AMD") "֏" else currency
    return "${grouped(amount, lang)} $symbol"
}

/** Число без валюты — для строки вычитания под главным показанием. */
fun plainAmount(amount: Int, lang: Lang): String = grouped(amount, lang)

private fun grouped(amount: Int, lang: Lang): String {
    val negative = amount < 0
    val digits = amount.absoluteValue.toString()
    val out = StringBuilder()
    for ((i, ch) in digits.withIndex()) {
        if (i > 0 && (digits.length - i) % 3 == 0) out.append(lang.groupSeparator)
        out.append(ch)
    }
    // Минус настоящий, U+2212: дефис на крупном кегле читается точкой.
    return if (negative) "−$out" else out.toString()
}

/**
 * «с одной машины» — единица учёта в нужной форме.
 *
 * Единица приходит с сервера словом: у мойки машина, у барбера клиент, —
 * и рамка вокруг него у каждого языка своя.
 *
 * По-армянски это отложительный падеж, и склеить его дефисом нельзя:
 * «մեքենա-ից» читается опечаткой, а не словом. Правило языка простое и
 * верное для любого армянского слова, включая придуманное владельцем:
 * после гласной между основой и окончанием встаёт «յ», после согласной —
 * ничего.
 *
 * По-русски и по-английски падеж чужого слова не построить вовсе — там
 * рамка обходится без него, а само слово идёт как пришло.
 */
fun perOneUnit(word: String, lang: Lang): String {
    if (word.isEmpty()) return word
    return when (lang) {
        Lang.HY -> {
            val vowels = setOf('ա', 'ե', 'է', 'ը', 'ի', 'ո', 'օ')
            val tail = if (vowels.contains(word.last())) "յից" else "ից"
            L(R.string.summary__perOne, "$word$tail")
        }

        Lang.RU, Lang.EN -> L(R.string.summary__perOne, word)
    }
}
