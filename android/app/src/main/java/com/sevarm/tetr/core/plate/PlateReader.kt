package com.sevarm.tetr.core.plate

/**
 * Разбор номера из того, что увидела камера.
 *
 * Отдельно от экрана и без единого вида — чтобы проверять её можно было
 * обычными тестами, а не наводя телефон на машину.
 *
 * Армянский формат: две цифры, две буквы, три цифры — 12 AB 345. Камера
 * читает это как текст и ошибается предсказуемо: O вместо нуля, I вместо
 * единицы, S вместо пятёрки. Ошибается она ровно там, где буква и цифра
 * похожи, и позиция в номере говорит, что из них правильно. Без этой
 * поправки сканер бесполезен: «77FF477» приезжает как «7TFF4T7».
 */
object PlateReader {

    /**
     * Единая форма для ручного ввода, камеры, очереди и поиска.
     *
     * Если это не армянский госномер, сохраняем введённый идентификатор,
     * только убирая случайные края и повторные пробелы: двух написаний
     * одного ключа в продукте быть не должно.
     */
    fun canonical(raw: String): String =
        parse(raw) ?: raw.uppercase().filter { !it.isWhitespace() && it != '-' }

    /** Похоже ли на номер и как он выглядит в нормальном виде. */
    fun parse(raw: String): String? {
        val cleaned = raw.uppercase().filter { it.isLetter() || it.isDigit() }
        if (cleaned.length != 7) return null

        val out = StringBuilder(7)
        for ((i, c) in cleaned.withIndex()) {
            // позиции 0,1 и 4,5,6 — цифры; 2,3 — буквы
            val wantsDigit = i < 2 || i >= 4
            out.append(if (wantsDigit) asDigit(c) else asLetter(c))
        }

        val fixed = out.toString()
        val digitsOk = fixed[0].isDigit() && fixed[1].isDigit() &&
            fixed[4].isDigit() && fixed[5].isDigit() && fixed[6].isDigit()
        val lettersOk = fixed[2].isLetter() && fixed[3].isLetter()
        if (!digitsOk || !lettersOk) return null

        /*
         * Слитно, без пробелов — тот же вид, что на самой пластине и что в
         * базе. Красивая форма `77 GG 477` тут была и оказалась хуже:
         * мойщик набирает слитно, а продукт показывал иначе, чем он ввёл, и
         * в списке из сорока строк глаз спотыкался о собственную же машину.
         */
        return fixed
    }

    private fun asDigit(c: Char): Char = when (c) {
        'O', 'Q', 'D' -> '0'
        'I', 'L', 'T' -> '1'
        'Z' -> '2'
        'S' -> '5'
        'G' -> '6'
        'B' -> '8'
        else -> c
    }

    private fun asLetter(c: Char): Char = when (c) {
        '0' -> 'O'
        '1' -> 'I'
        '5' -> 'S'
        '8' -> 'B'
        '6' -> 'G'
        else -> c
    }
}
