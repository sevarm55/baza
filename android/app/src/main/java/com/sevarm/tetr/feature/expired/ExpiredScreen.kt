package com.sevarm.tetr.feature.expired

import android.content.Intent
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import com.sevarm.tetr.LocalGraph
import com.sevarm.tetr.R
import com.sevarm.tetr.core.i18n.L
import com.sevarm.tetr.design.Brand
import com.sevarm.tetr.design.Insets
import com.sevarm.tetr.design.LimeButton
import com.sevarm.tetr.design.QuietButton
import com.sevarm.tetr.design.pressable
import com.sevarm.tetr.feature.profile.DeleteBusinessSheet
import com.sevarm.tetr.feature.profile.exportCsv
import kotlinx.coroutines.launch

/**
 * Стена: срок вышел.
 *
 * Раньше просрочка была мягкой — разделы открывались, закрывалась только
 * запись. Выглядело невнятно: продукт сообщал «время прошло» и тут же
 * пускал ходить по экранам. Теперь вместо всего продукта один экран.
 *
 * На нём сначала — что данные целы: тот, кому закрыли доступ, первым делом
 * боится потерять историю, и пока этот страх не снят, остальное он не
 * читает. Потом — забрать данные или уйти совсем.
 *
 * Обе кнопки работают: выгрузка и удаление аккаунта намеренно не смотрят
 * на состояние счёта. Держать чужую историю в заложниках у неоплаченного
 * счёта — верный способ, чтобы человек не вернулся даже заплатив.
 *
 * Как продолжить пользоваться, здесь не написано, и это не упущение:
 * внутри приложения нет ни оплаты, ни призыва оплатить снаружи. Клиент
 * попадает сюда, уже зная, с кем он договаривался.
 */
@Composable
fun ExpiredScreen() {
    val graph = LocalGraph.current
    val session = graph.session
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val me by session.me.collectAsState()
    val access by session.access.collectAsState()
    val points by session.points.collectAsState()
    val tenant by session.tenant.collectAsState()

    var exporting by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }

    val isOwner = me?.isOwner == true

    /*
     * Точку только что завели, и «срок вышел» здесь было бы прямой
     * неправдой: ничего не истекло, оплаты просто ещё не было.
     */
    val fresh = access?.state == "unpaid"
    val others = points.filter { it.id != tenant?.id }

    Box(Modifier.fillMaxSize().background(Brand.grapeDeep)) {
        Image(
            painter = painterResource(R.drawable.expired),
            contentDescription = null,
            contentScale = ContentScale.FillWidth,
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.TopCenter),
        )
        Box(
            Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        0.0f to Color.Transparent,
                        0.3f to Color.Transparent,
                        0.7f to Brand.grapeDeep.copy(alpha = 0.92f),
                        1.0f to Brand.grapeDeep,
                    )
                )
        )

        Column(
            Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .padding(horizontal = 26.dp)
                .padding(bottom = Insets.bottom.calculateBottomPadding() + 44.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(
                when {
                    !isOwner -> L(R.string.expired__blockedTitle)
                    fresh -> L(R.string.points__freshTitle)
                    else -> L(R.string.billing__expiredTitle)
                },
                fontSize = 30.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
            )

            /*
             * Владельцу — про его данные и что с ними ничего не случилось.
             * Работнику — коротко и про него: записывать сейчас нельзя,
             * решает не он. Обещать ему «ваши данные целы» бессмысленно:
             * данные не его.
             */
            Text(
                when {
                    !isOwner -> L(R.string.expired__worker)
                    fresh -> L(R.string.expired__fresh)
                    else -> L(R.string.expired__blocked)
                },
                fontSize = 15.5.sp,
                lineHeight = 22.sp,
                color = Color.White.copy(alpha = 0.8f),
            )

            /*
             * Одна закрытая точка не имеет права запирать открытую. Без
             * этого владелец, заведший вторую мойку, упирался бы в стену и
             * терял доступ к первой — работающей.
             */
            if (others.isNotEmpty()) {
                Column(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .background(Color.White.copy(alpha = 0.08f))
                        .padding(horizontal = 14.dp),
                ) {
                    others.forEachIndexed { index, point ->
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .pressable {
                                    scope.launch {
                                        runCatching { session.switchTo(point, graph.queue) }
                                    }
                                }
                                .padding(vertical = 11.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Box(
                                Modifier
                                    .size(7.dp)
                                    .clip(CircleShape)
                                    .background(if (point.canRead) Brand.lime else Brand.warnOnDark)
                            )
                            Text(
                                point.name,
                                fontSize = 15.sp,
                                color = Color.White,
                                modifier = Modifier.weight(1f),
                                maxLines = 1,
                            )
                            Icon(
                                Icons.AutoMirrored.Filled.KeyboardArrowRight,
                                contentDescription = null,
                                tint = Color.White.copy(alpha = 0.4f),
                                modifier = Modifier.size(16.dp),
                            )
                        }
                        if (index != others.lastIndex) {
                            Box(
                                Modifier
                                    .fillMaxWidth()
                                    .height(1.dp)
                                    .background(Color.White.copy(alpha = 0.12f))
                            )
                        }
                    }
                }
            }

            /*
             * Выгрузка — главное действие на этом экране. Единственное,
             * что человеку тут по-настоящему нужно: забрать своё. У новой
             * точки её нет: там пока нечего забирать.
             */
            if (isOwner && !fresh) {
                LimeButton(
                    text = if (exporting) "…" else L(R.string.billing__wallDownload),
                    enabled = !exporting,
                    loading = exporting,
                    onClick = {
                        scope.launch {
                            exporting = true
                            /*
                             * За всё время: человек уходит, и отдавать ему
                             * тридцать дней вместо всей истории было бы
                             * обманом.
                             */
                            val file = exportCsv(context, graph, days = "all")
                            exporting = false
                            file?.let { share(context, it) }
                        }
                    },
                )
            }

            /*
             * Удаление остаётся и у новой точки: её могли завести по
             * ошибке, и без него она висела бы в списке навсегда. А
             * мойщику его не показываем вовсе: бизнес не его, и сервер
             * такую попытку всё равно отвергает.
             */
            if (isOwner) {
                Text(
                    L(R.string.billing__wallDelete),
                    fontSize = 14.5.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Brand.badOnBoard,
                    modifier = Modifier
                        .pressable { deleting = true }
                        .padding(vertical = 6.dp),
                )
            }

            Spacer(Modifier.height(2.dp))
            QuietButton(
                text = L(R.string.auth__signOut),
                onDark = true,
                onClick = { scope.launch { session.signOut() } },
            )
        }
    }

    if (deleting) {
        DeleteBusinessSheet(onClose = { deleting = false })
    }
}

/**
 * Отдать файл системе.
 *
 * Дальше человек сам решает — отправить себе в почту, положить в
 * «Файлы», открыть в таблицах. Приложению не нужно знать, что он с ним
 * сделает.
 */
fun share(context: android.content.Context, file: java.io.File) {
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/csv"
        putExtra(Intent.EXTRA_STREAM, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    context.startActivity(Intent.createChooser(intent, null))
}
