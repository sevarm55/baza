package com.sevarm.tetr.core.ui

import androidx.compose.runtime.Composable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.sevarm.tetr.AppGraph
import com.sevarm.tetr.LocalGraph

/**
 * Модель экрана, собранная из графа.
 *
 * Всё, что нужно модели, приходит через конструктор — она не достаёт
 * зависимости сама и не знает ни про Android-контекст, ни про то, откуда
 * взялся граф. В проверке это подменяется одной строкой: собрать модель с
 * поддельным клиентом и убедиться, что состояние меняется как надо.
 */
@Composable
inline fun <reified VM : ViewModel> graphViewModel(
    key: String? = null,
    crossinline create: (AppGraph) -> VM,
): VM {
    val graph = LocalGraph.current
    return viewModel(
        key = key,
        factory = viewModelFactory { initializer { create(graph) } },
    )
}
