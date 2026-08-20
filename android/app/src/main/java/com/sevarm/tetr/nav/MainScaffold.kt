package com.sevarm.tetr.nav

import androidx.appcompat.app.AppCompatActivity
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.PendingActions
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.sevarm.tetr.LocalGraph
import com.sevarm.tetr.R
import com.sevarm.tetr.core.i18n.L
import com.sevarm.tetr.design.Brand
import com.sevarm.tetr.feature.calendar.CalendarScreen
import com.sevarm.tetr.feature.calendar.DayScreen
import com.sevarm.tetr.feature.clients.ClientsScreen
import com.sevarm.tetr.feature.expenses.ExpensesScreen
import com.sevarm.tetr.feature.more.MoreScreen
import com.sevarm.tetr.feature.owner.OwnerScreen
import com.sevarm.tetr.feature.payroll.PayrollScreen
import com.sevarm.tetr.feature.points.PointsScreen
import com.sevarm.tetr.feature.profile.DevicesScreen
import com.sevarm.tetr.feature.profile.ProfileScreen
import com.sevarm.tetr.feature.report.ReportScreen
import com.sevarm.tetr.feature.services.ServicesScreen
import com.sevarm.tetr.feature.staff.StaffScreen
import com.sevarm.tetr.feature.shift.ShiftScreen

/**
 * Разделы продукта.
 *
 * Строкой, а не объектом: маршруты приходят снаружи — из уведомления и из
 * входящей ссылки, — и сопоставлять их с типом пришлось бы всё равно.
 *
 * ЧТО ЗДЕСЬ ЕСТЬ И ЧЕГО НЕТ. Перечислены все разделы продукта, включая те,
 * что ещё не перенесены с iOS: список маршрутов — это карта продукта, и
 * читать её надо целиком, а не по тому, что успели написать. Незанятые
 * маршруты помечены ниже, в `pending`, и навигация в них не ведёт: экран,
 * который открывается пустым, хуже отсутствующего пункта меню.
 */
object Routes {
    const val SHIFT = "shift"
    const val SUMMARY = "summary"
    const val PAYROLL = "payroll"
    const val MORE = "more"

    const val CLIENTS = "clients"
    const val SERVICES = "services"
    const val EXPENSES = "expenses"
    const val REPORT = "report"
    const val STAFF = "staff"
    const val POINTS = "points"
    const val PROFILE = "profile"
    const val DEVICES = "devices"
    const val CALENDAR = "calendar"
    const val DAY = "day/{date}"

    fun day(date: String) = "day/$date"

    /** Вкладки нижней панели: у них своя полоса и свой возврат. */
    val tabs = setOf(SHIFT, SUMMARY, PAYROLL, MORE)

    /**
     * Разделы кабинета владельца, ещё не перенесённые с iOS.
     *
     * Держим списком, а не «забыли добавить»: пока раздел здесь, меню его
     * не открывает и уведомление в него не ведёт. Переносится раздел —
     * строка отсюда уходит, и он оживает во всех трёх местах разом.
     */
    /*
     * Пусто: все разделы iOS перенесены. Список оставлен намеренно — он
     * механизм, а не остаток работы: следующий новый экран сначала
     * появляется здесь и только потом в меню.
     */
    val pending = emptySet<String>()
}

/**
 * Продукт целиком: нижняя панель и всё, что под ней.
 *
 * Панель показывается только на самих вкладках: на вложенном экране она
 * предлагала бы уйти оттуда, куда человек только что зашёл, и отнимала бы
 * место у списка.
 */
@Composable
fun MainScaffold(
    activity: AppCompatActivity,
    requestedRoute: String?,
    onRouteHandled: () -> Unit,
) {
    val graph = LocalGraph.current
    val me by graph.session.me.collectAsState()
    val isOwner = me?.isOwner == true

    val nav = rememberNavController()
    val entry by nav.currentBackStackEntryAsState()
    val current = entry?.destination?.route

    /*
     * Уведомление или ссылка попросили раздел. Мойщику разделы владельца
     * не открываем: сервер на них всё равно ответит отказом, а человек
     * увидел бы пустой экран вместо своей смены.
     */
    LaunchedEffect(requestedRoute, isOwner) {
        val route = requestedRoute ?: return@LaunchedEffect
        val known = route !in Routes.pending
        val allowed = known && (isOwner || route == Routes.SHIFT)
        if (allowed) {
            nav.navigate(route) {
                launchSingleTop = true
                popUpTo(Routes.SHIFT)
            }
        }
        onRouteHandled()
    }

    Scaffold(
        containerColor = Brand.board,
        contentColor = Brand.onBoard,
        bottomBar = {
            AnimatedVisibility(
                visible = isOwner && current in Routes.tabs,
                enter = slideInVertically { it },
                exit = slideOutVertically { it },
            ) {
                BottomBar(nav = nav, current = current)
            }
        },
    ) { padding ->
        Box(
            Modifier
                .fillMaxSize()
                .background(Brand.board)
                .padding(bottom = padding.calculateBottomPadding()),
        ) {
            NavHost(navController = nav, startDestination = Routes.SHIFT) {
                tetrinGraph(nav, activity)
            }
        }
    }
}

/**
 * Переход в раздел, которого может ещё не быть.
 *
 * Пока раздел в `pending`, нажатие не делает ничего — и это лучше, чем
 * пустой экран: незаконченное не должно выглядеть сломанным.
 */
private fun open(nav: NavHostController, route: String) {
    if (route !in Routes.pending) nav.navigate(route)
}

private fun NavGraphBuilder.tetrinGraph(nav: NavHostController, activity: AppCompatActivity) {
    composable(Routes.SHIFT) { ShiftScreen() }

    composable(Routes.SUMMARY) {
        OwnerScreen(
            /*
             * Последний шаг настройки — записать машину, а она живёт в
             * своей вкладке: экран смены корневой, и второй его копии
             * поверх сводки быть не должно.
             */
            goToShift = { nav.navigate(Routes.SHIFT) { launchSingleTop = true } },
            goToPayroll = { open(nav, Routes.PAYROLL) },
            goToServices = { open(nav, Routes.SERVICES) },
            goToStaff = { open(nav, Routes.STAFF) },
            goToClients = { open(nav, Routes.CLIENTS) },
        )
    }
    composable(Routes.PAYROLL) { PayrollScreen() }
    composable(Routes.SERVICES) { ServicesScreen(onBack = { nav.popBackStack() }) }
    composable(Routes.EXPENSES) { ExpensesScreen(onBack = { nav.popBackStack() }) }
    composable(Routes.STAFF) { StaffScreen(onBack = { nav.popBackStack() }) }
    composable(Routes.CLIENTS) { ClientsScreen(onBack = { nav.popBackStack() }) }
    composable(Routes.REPORT) { ReportScreen(onBack = { nav.popBackStack() }) }
    composable(Routes.DEVICES) { DevicesScreen(onBack = { nav.popBackStack() }) }

    composable(Routes.PROFILE) {
        ProfileScreen(
            activity = activity,
            onBack = { nav.popBackStack() },
            onDevices = { nav.navigate(Routes.DEVICES) },
        )
    }

    composable(Routes.CALENDAR) {
        CalendarScreen(
            onBack = { nav.popBackStack() },
            onDay = { date -> nav.navigate(Routes.day(date)) },
        )
    }
    composable(Routes.DAY) { entry ->
        DayScreen(
            date = entry.arguments?.getString("date").orEmpty(),
            onBack = { nav.popBackStack() },
        )
    }
    composable(Routes.MORE) { MoreScreen(onOpen = { route -> open(nav, route) }) }
    composable(Routes.POINTS) { PointsScreen(onBack = { nav.popBackStack() }) }
}

/**
 * Нижняя панель.
 *
 * Вкладок столько, сколько экранов открывают каждый день. Прайс правят раз
 * в месяц — ему в панели не место, он живёт в «Ավելին».
 */
@Composable
private fun BottomBar(nav: NavHostController, current: String?) {
    /*
     * Панель ниже материаловской.
     *
     * По умолчанию Material отводит ей восемьдесят точек и сверх того
     * навигационную полосу системы: на телефоне с тремя кнопками это
     * почти шестая часть экрана под двумя словами. Экран смены живёт
     * списком записей, и отдавать столько места постоянной навигации
     * нельзя.
     *
     * Шестьдесят четыре — это всё ещё больше сорока восьми, ниже которых
     * пальцем не целятся. Системную полосу отводим сами, снаружи: иначе
     * заданная высота съела бы её, и подписи налезли бы на кнопки
     * телефона.
     */
    Box(Modifier.navigationBarsPadding()) {
        NavigationBar(
            modifier = Modifier.height(64.dp),
            windowInsets = WindowInsets(0),
            containerColor = Brand.boardSurface,
            contentColor = Brand.onBoard,
        ) {
            tab(nav, current, Routes.SHIFT, L(R.string.tab__shift), Icons.Filled.PendingActions)
            tab(nav, current, Routes.SUMMARY, L(R.string.tab__summary), Icons.Filled.BarChart)
            tab(nav, current, Routes.PAYROLL, L(R.string.tab__payroll), Icons.Filled.Payments)
            tab(nav, current, Routes.MORE, L(R.string.tab__more), Icons.Filled.MoreHoriz)
        }
    }
}

@Composable
private fun RowScope.tab(
    nav: NavHostController,
    current: String?,
    route: String,
    label: String,
    icon: ImageVector,
) {
    val selected = current == route
    NavigationBarItem(
        selected = selected,
        onClick = {
            if (!selected) {
                nav.navigate(route) {
                    /*
                     * Возврат на первую вкладку, а не накопление стопки:
                     * иначе системная кнопка «назад» уводила бы по истории
                     * переключений, а человек ждёт от неё выход из
                     * приложения.
                     */
                    popUpTo(Routes.SHIFT) { saveState = true }
                    launchSingleTop = true
                    restoreState = true
                }
            }
        },
        icon = { Icon(icon, contentDescription = null) },
        label = {
            Text(
                label,
                fontSize = 11.sp,
                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                maxLines = 1,
            )
        },
        colors = NavigationBarItemDefaults.colors(
            selectedIconColor = Brand.grape,
            selectedTextColor = Brand.grape,
            unselectedIconColor = Brand.boardMuted,
            unselectedTextColor = Brand.boardMuted,
            /*
             * Сирень под выбранной вкладкой, а не системная серая: значок и
             * подпись на ней и так грейповые, и серая подложка под ними
             * была бы единственным местом внизу экрана, где марки нет.
             */
            indicatorColor = Brand.grape.copy(alpha = 0.14f),
        ),
    )
}
