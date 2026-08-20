package com.sevarm.tetr.feature.shift

import android.view.ViewGroup
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.sevarm.tetr.R
import com.sevarm.tetr.core.i18n.L
import com.sevarm.tetr.core.plate.PlateReader
import com.sevarm.tetr.design.Brand
import com.sevarm.tetr.design.pressable
import kotlinx.coroutines.delay
import java.util.concurrent.Executors

/**
 * Встроенная камера.
 *
 * Не отдельный экран, а нижняя часть той же страницы: поле ввода остаётся
 * на месте сверху, под ним раскрывается кадр. Полноэкранная камера уводила
 * бы человека со страницы и возвращала обратно — два перехода там, где
 * нужно показать одну картинку.
 *
 * Главное решение — ЗАТВОР С ОБРАТНЫМ ОТСЧЁТОМ. Сканер, срабатывающий
 * молча на первом же распознанном номере, ошибается незаметно: человек
 * узнаёт об этом уже в поле ввода. Здесь узнанный номер сначала
 * показывается, кольцо затвора заполняется за секунду с небольшим, и
 * только потом номер принимается. Видно, ЧТО будет принято, и есть время
 * остановить. Ждать не обязательно: касание затвора принимает сразу.
 */
@Composable
fun PlateCameraPanel(
    onFound: (String) -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val executor = remember { Executors.newSingleThreadExecutor() }
    val recognizer = remember { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }

    /*
     * Цвет берём заранее: `Brand` — это composable-геттер, а внутри
     * отрисовки composable-функции звать нельзя. Читать палитру в момент
     * рисования и не надо: она не меняется, пока экран открыт.
     */
    val limeInk = Brand.lime
    var candidate by remember { mutableStateOf<String?>(null) }
    var accepted by remember { mutableStateOf(false) }

    /** Сколько номер показывается, прежде чем будет принят. */
    val hold = 1200L
    val fill by animateFloatAsState(
        targetValue = if (candidate != null) 1f else 0f,
        animationSpec = tween(durationMillis = if (candidate != null) hold.toInt() else 0),
        label = "shutter",
    )

    /*
     * Отсчёт привязан к самому номеру, а не к таймеру: сменился кандидат —
     * задача снимается и заводится заново, пропал — не остаётся висеть.
     * Обратный отсчёт, переживший уход номера из кадра, принял бы то, чего
     * в кадре уже нет.
     */
    LaunchedEffect(candidate) {
        val plate = candidate ?: return@LaunchedEffect
        delay(hold)
        if (!accepted) {
            accepted = true
            onFound(plate)
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            executor.shutdown()
            runCatching { recognizer.close() }
        }
    }

    Column(
        modifier
            .clip(RoundedCornerShape(26.dp))
            .background(Color.Black),
    ) {
        Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
            AndroidView(
                factory = { ctx ->
                    val view = PreviewView(ctx).apply {
                        layoutParams = ViewGroup.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.MATCH_PARENT,
                        )
                        scaleType = PreviewView.ScaleType.FILL_CENTER
                    }

                    val future = ProcessCameraProvider.getInstance(ctx)
                    future.addListener({
                        val provider = future.get()
                        val preview = Preview.Builder().build().also {
                            it.surfaceProvider = view.surfaceProvider
                        }

                        val analysis = ImageAnalysis.Builder()
                            .setResolutionSelector(
                                ResolutionSelector.Builder()
                                    .setResolutionStrategy(ResolutionStrategy.HIGHEST_AVAILABLE_STRATEGY)
                                    .build()
                            )
                            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                            .build()

                        analysis.setAnalyzer(executor) { proxy ->
                            val media = proxy.image
                            if (media == null) {
                                proxy.close()
                                return@setAnalyzer
                            }
                            val image = InputImage.fromMediaImage(
                                media,
                                proxy.imageInfo.rotationDegrees,
                            )
                            recognizer.process(image)
                                .addOnSuccessListener { text ->
                                    /*
                                     * В кадре почти всегда есть и другой
                                     * текст — марка, реклама на стене,
                                     * наклейка. Поэтому фильтр по формату,
                                     * а не «самый крупный текст»: тот
                                     * сплошь и рядом оказывается вывеской
                                     * мойки.
                                     */
                                    val found = text.textBlocks
                                        .asSequence()
                                        .flatMap { it.lines.asSequence() }
                                        .mapNotNull { PlateReader.parse(it.text) }
                                        .firstOrNull()
                                    if (found != candidate && !accepted) candidate = found
                                }
                                .addOnCompleteListener { proxy.close() }
                        }

                        runCatching {
                            provider.unbindAll()
                            provider.bindToLifecycle(
                                lifecycleOwner,
                                CameraSelector.DEFAULT_BACK_CAMERA,
                                preview,
                                analysis,
                            )
                        }
                    }, ContextCompat.getMainExecutor(ctx))

                    view
                },
                modifier = Modifier.fillMaxSize(),
            )

            /*
             * Прицел: рамка не по всему кадру, а по той полосе, куда кладут
             * номер. Она не обрезает распознавание — она говорит, куда
             * целиться, и этого достаточно.
             */
            if (candidate == null) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 34.dp)
                        .height(84.dp)
                        .border(1.5.dp, Color.White.copy(alpha = 0.5f), RoundedCornerShape(12.dp))
                )
            } else {
                Text(
                    candidate.orEmpty(),
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    color = Brand.onLime,
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(Brand.lime)
                        .padding(horizontal = 16.dp, vertical = 9.dp),
                )
            }
        }

        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 26.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            RoundDark(Icons.Filled.Close, L(R.string.order__closeCamera), onClose)

            /*
             * Затвор. Кольцо вокруг него — это и есть обратный отсчёт: пока
             * оно заполняется, номер ещё можно не принять, уведя камеру.
             */
            Box(
                Modifier
                    .size(66.dp)
                    .pressable(enabled = candidate != null) {
                        candidate?.let {
                            accepted = true
                            onFound(it)
                        }
                    },
                contentAlignment = Alignment.Center,
            ) {
                Canvas(Modifier.size(66.dp)) {
                    val stroke = 3.dp.toPx()
                    drawArc(
                        color = Color.White.copy(alpha = 0.35f),
                        startAngle = 0f,
                        sweepAngle = 360f,
                        useCenter = false,
                        topLeft = Offset(stroke / 2, stroke / 2),
                        size = Size(size.width - stroke, size.height - stroke),
                        style = Stroke(width = stroke),
                    )
                    drawArc(
                        color = limeInk,
                        startAngle = -90f,
                        sweepAngle = 360f * fill,
                        useCenter = false,
                        topLeft = Offset(stroke / 2, stroke / 2),
                        size = Size(size.width - stroke, size.height - stroke),
                        style = Stroke(width = stroke, cap = StrokeCap.Round),
                    )
                }
                Box(
                    Modifier
                        .size(54.dp)
                        .clip(CircleShape)
                        .background(
                            if (candidate == null) Color.White.copy(alpha = 0.35f) else Brand.lime
                        )
                )
            }

            RoundDark(Icons.Filled.Close, L(R.string.scanner__manual), onClose)
        }
    }
}

@Composable
private fun RoundDark(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    onClick: () -> Unit,
) {
    Box(
        Modifier
            .size(44.dp)
            .clip(CircleShape)
            .background(Color.White.copy(alpha = 0.16f))
            .pressable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = label, tint = Color.White, modifier = Modifier.size(16.dp))
    }
}
