package com.sevarm.tetr.feature.profile

import android.content.Context
import com.sevarm.tetr.AppGraph
import java.io.File

/**
 * Выгрузка данных в CSV.
 *
 * Файл отдаётся системе: дальше человек сам решает — отправить себе в
 * почту, положить в «Файлы», открыть в таблицах. Приложению не нужно
 * знать, что он с ним сделает.
 *
 * `days = "all"` там, где человек уходит совсем: прощальный архив за
 * тридцать дней был бы обманом.
 *
 * Кладём в кэш, а не в общие «Загрузки»: файл нужен ровно на время
 * передачи, и оставлять кассу мойки лежать в открытой папке телефона,
 * который переходит из рук в руки, незачем. Наружу его открывает
 * FileProvider ровно на одно действие.
 */
suspend fun exportCsv(context: Context, graph: AppGraph, days: String = "30"): File? {
    val bytes = runCatching {
        graph.session.authed { token -> graph.api.raw("export?days=$days", token = token) }
    }.getOrNull() ?: return null

    val dir = File(context.cacheDir, "export").apply { mkdirs() }
    // старое стираем: два архива подряд отличаются только временем, и
    // человек однажды отправит не тот
    dir.listFiles()?.forEach { it.delete() }

    val file = File(dir, "tetrin-${System.currentTimeMillis() / 1000}.csv")
    return runCatching {
        file.writeBytes(bytes)
        file
    }.getOrNull()
}
