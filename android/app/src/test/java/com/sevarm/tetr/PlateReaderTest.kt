package com.sevarm.tetr

import com.sevarm.tetr.core.plate.PlateReader
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Разбор номера.
 *
 * Те же случаи, что проверяет iOS (`PlateReaderTests.swift`): камера
 * ошибается предсказуемо, и позиция в номере говорит, что правильно —
 * буква или цифра. Без этой поправки «77FF477» приезжает как «7TFF4T7», и
 * сканер бесполезен.
 */
class PlateReaderTest {

    @Test
    fun `чистый номер остаётся собой`() {
        assertEquals("77GG477", PlateReader.parse("77GG477"))
    }

    @Test
    fun `пробелы и регистр не в счёт`() {
        assertEquals("77GG477", PlateReader.parse("77 gg 477"))
        assertEquals("77GG477", PlateReader.parse("77-GG-477"))
    }

    @Test
    fun `буква на месте цифры чинится`() {
        // O→0, I→1, S→5, B→8, G→6 там, где ждут цифру
        assertEquals("10GG577", PlateReader.parse("IOGG577"))
        assertEquals("85GG477", PlateReader.parse("BSGG477"))
    }

    @Test
    fun `цифра на месте буквы чинится`() {
        // 0→O, 1→I, 5→S, 8→B, 6→G там, где ждут букву
        assertEquals("77OI477", PlateReader.parse("7701477"))
    }

    @Test
    fun `не номер — не выдумываем`() {
        assertNull(PlateReader.parse("КОМПЛЕКС"))
        assertNull(PlateReader.parse("123"))
        assertNull(PlateReader.parse("12345678"))
    }

    @Test
    fun `чужой идентификатор приводится к одному виду, но не ломается`() {
        // Не армянский номер — сохраняем как есть, только без краёв и
        // регистра: двух написаний одного ключа в продукте быть не должно.
        assertEquals("+37477123456", PlateReader.canonical(" +374 77 123 456 "))
        assertEquals("ABC", PlateReader.canonical("a b c"))
    }
}
