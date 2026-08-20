package com.sevarm.tetr

import com.sevarm.tetr.core.money.Crew
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Деление зарплатного фонда между участниками.
 *
 * Проверяется здесь то единственное, чего нельзя заметить глазами на
 * экране: сумма долей обязана до последней единицы совпасть с фондом.
 * Расхождение в один драм не видно нигде, кроме ведомости в конце месяца,
 * и всплывает оно у владельца — ровно там, где продукт обещал порядок.
 *
 * Числа те же, что в `scripts/crew-check.ts` на сервере: сверять два
 * клиента по разным примерам значит не сверять их вовсе.
 */
class CrewTest {

    @Test
    fun `фонд считается вниз, как доля одиночного мойщика`() {
        assertEquals(5_000, Crew.pool(10_000, 50))
        // 12 345 × 45 % = 5 555.25 — четверть драма отбрасывается
        assertEquals(5_555, Crew.pool(12_345, 45))
        assertEquals(0, Crew.pool(10_000, 0))
    }

    @Test
    fun `остаток уходит первым, а не теряется`() {
        assertEquals(listOf(1_667, 1_667, 1_666), Crew.split(5_000, 3))
        assertEquals(listOf(2_500, 2_500), Crew.split(5_000, 2))
        assertEquals(listOf(5_000), Crew.split(5_000, 1))
    }

    @Test
    fun `сумма долей всегда равна фонду`() {
        for (pool in 0..3_000 step 7) {
            for (people in 1..Crew.MAX) {
                val shares = Crew.split(pool, people)
                assertEquals("фонд $pool на $people", pool, shares.sum())
                assertEquals(people, shares.size)
                // разница между самой большой и самой маленькой долей — не
                // больше драма, иначе делили не поровну
                assertTrue("делили не поровну: $shares", shares.max() - shares.min() <= 1)
            }
        }
    }

    @Test
    fun `фонда некому раздать — пустой ответ`() {
        assertEquals(emptyList<Int>(), Crew.split(5_000, 0))
        assertEquals(emptyList<Int>(), Crew.split(5_000, -1))
    }

    @Test
    fun `один моет — личная ставка, двое — командная`() {
        val alone = Crew.compute(price = 10_000, people = 1, soloPercent = 40, teamPercent = 50)
        assertEquals(40, alone.percent)
        assertEquals(4_000, alone.pool)
        assertEquals(listOf(4_000), alone.shares)

        val pair = Crew.compute(price = 10_000, people = 2, soloPercent = 40, teamPercent = 50)
        assertEquals(50, pair.percent)
        assertEquals(5_000, pair.pool)
        assertEquals(listOf(2_500, 2_500), pair.shares)
    }

    @Test
    fun `без командной ставки совместная работа не начисляет ничего`() {
        /*
         * Ноль, а не личный процент участника. Пока владелец не назначил
         * ставку команды, экран записи совместную работу не предлагает
         * вовсе — но если такая запись всё же дойдёт, придумать за
         * владельца число нельзя: это молчаливое решение о чужих деньгах.
         */
        val r = Crew.compute(price = 10_000, people = 3, soloPercent = 40, teamPercent = null)
        assertEquals(0, r.percent)
        assertEquals(0, r.pool)
        assertEquals(listOf(0, 0, 0), r.shares)
    }

    @Test
    fun `совместная на одного даёт то же, что одиночная`() {
        assertEquals(
            Crew.pool(7_777, 35),
            Crew.compute(price = 7_777, people = 1, soloPercent = 35, teamPercent = 50).pool,
        )
    }
}
