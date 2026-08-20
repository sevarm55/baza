package com.sevarm.tetr

import com.sevarm.tetr.core.i18n.Lang
import com.sevarm.tetr.core.i18n.Terms
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Заводские слова ниши.
 *
 * Проверяем ровно то, из-за чего таблица вообще существует: русские формы
 * после числительного, обратный поиск по уже переведённому слову и то, что
 * слово владельца не склоняется.
 */
class TermsTest {

    @Test
    fun `русские формы после числительного`() {
        assertEquals("0 машин", Terms.units(0, "մեքենա", Lang.RU))
        assertEquals("1 машина", Terms.units(1, "մեքենա", Lang.RU))
        assertEquals("3 машины", Terms.units(3, "մեքենա", Lang.RU))
        assertEquals("5 машин", Terms.units(5, "մեքենա", Lang.RU))
        assertEquals("11 машин", Terms.units(11, "մեքենա", Lang.RU))
        assertEquals("22 машины", Terms.units(22, "մեքենա", Lang.RU))
    }

    @Test
    fun `армянский после числительного всегда единственное`() {
        assertEquals("5 մեքենա", Terms.units(5, "մեքենա", Lang.HY))
        assertEquals("1 մեքենա", Terms.units(1, "մեքենա", Lang.HY))
    }

    @Test
    fun `английский различает только один и остальные`() {
        assertEquals("1 car", Terms.units(1, "մեքենա", Lang.EN))
        assertEquals("2 cars", Terms.units(2, "մեքենա", Lang.EN))
    }

    @Test
    fun `слово приходит уже переведённым — узнаём и переводим дальше`() {
        // сервер отдал термин по Accept-Language: в сессии лежит «машина»,
        // а человек переключил интерфейс на английский
        assertEquals("2 cars", Terms.units(2, "машина", Lang.EN))
        assertEquals("2 մեքենա", Terms.units(2, "cars", Lang.HY))
    }

    @Test
    fun `слово владельца не склоняется`() {
        // «5 тачкы» хуже, чем «5 тачка»: придумывать за человека
        // множественное число мы права не имеем
        assertEquals("5 тачка", Terms.units(5, "тачка", Lang.RU))
        assertEquals("тачка", Terms.unit("тачка", Lang.RU).acc)
    }

    @Test
    fun `винительный для кнопки записи`() {
        assertEquals("машину", Terms.unit("մեքենա", Lang.RU).acc)
        assertEquals("car", Terms.unit("մեքենա", Lang.EN).acc)
    }

    @Test
    fun `по чему узнают клиента`() {
        assertEquals("Госномер", Terms.clientId("Պետհամարանիշ", Lang.RU))
        assertEquals("Plate", Terms.clientId("Госномер", Lang.EN))
        // чужое слово остаётся собой
        assertEquals("Артикул", Terms.clientId("Артикул", Lang.EN))
    }

    @Test
    fun `исполнитель во всех формах`() {
        assertEquals("Мойщик", Terms.staff("Լվացող", Lang.RU).nom)
        assertEquals("Мойщиков", Terms.staff("Լվացող", Lang.RU).count(5).substringAfter(' '))
        assertEquals("3 мойщика", Terms.staffCount(3, "Լվացող", Lang.RU))
    }

    // ─────────────────────── названия услуг ───────────────────────

    @Test
    fun `заводская услуга переводится на язык смотрящего`() {
        assertEquals("Комплекс", Terms.service("Կոմպլեքս", Lang.RU))
        assertEquals("Full wash", Terms.service("Կոմպլեքս", Lang.EN))
        assertEquals("Կոմպլեքս", Terms.service("Կոմպլեքս", Lang.HY))
    }

    @Test
    fun `слово владельца проходит насквозь`() {
        /*
         * «Мойка дисков» в конфиге ниши не значится — придумывать за
         * человека перевод его собственного слова мы права не имеем.
         */
        assertEquals("Мойка дисков", Terms.service("Мойка дисков", Lang.EN))
        assertEquals("Мойка дисков", Terms.service("Мойка дисков", Lang.HY))
    }

    @Test
    fun `услуга узнаётся и переведённой`() {
        /*
         * Прайс правят руками: открыл на русском, поменял цену и сохранил —
         * на сервер ушло «Комплекс». Армянский экран после этого обязан
         * остаться армянским.
         */
        assertEquals("Կոմպլեքս", Terms.service("Комплекс", Lang.HY))
        assertEquals("Full wash", Terms.service("Комплекс", Lang.EN))
    }

    @Test
    fun `составная запись разбирается по частям`() {
        assertEquals("Комплекс + Кузов", Terms.service("Կոմպլեքս + Թափք", Lang.RU))
        assertEquals(
            "Комплекс + Мойка дисков",
            Terms.service("Կոմպլեքս + Мойка дисков", Lang.RU),
        )
    }
}
