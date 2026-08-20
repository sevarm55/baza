# Tetrin для Android: карта переноса

Источник правды — iOS-приложение (`ios/Tetr`). Этот файл существует ровно
затем, чтобы «что уже перенесено» нельзя было выяснять чтением кода: пока
раздел в таблице не отмечен, он не отмечен и в навигации (`Routes.pending`),
и пункт меню в него не ведёт.

Правило одно: пункт меню, за которым нет экрана, хуже отсутствующего — по
нему жмут и решают, что продукт сломан. Поэтому недоделанного в интерфейсе
не видно вовсе.

---

## Что уже сделано

### Основание

| Слой | Файл | Соответствие в iOS |
|---|---|---|
| HTTP-клиент, разбор отказов, язык заголовком | `core/api/ApiClient.kt` | `Core/API.swift` |
| Модели ответов | `core/api/Dto.kt` | `Core/API.swift` |
| Сессия, токены, single-flight refresh, точки | `core/session/Session.kt` | `Core/Session.swift` |
| Хранилище токенов на Keystore AES/GCM | `core/session/SecureStore.kt` | `Core/Keychain.swift` |
| Очередь офлайн-записей | `core/queue/OrderQueue.kt` | `Core/OrderQueue.swift` |
| Возврат связи | `core/net/Connectivity.kt` | `Core/BackgroundSync.swift` |
| Фоновая досылка | `core/work/QueueFlushWorker.kt` | `BGTaskScheduler` там же |
| Язык, словарь, склонения | `core/i18n/*` | `Core/Lang.swift`, `Core/Terms.swift` |
| Даты и деньги | `core/i18n/Dates.kt`, `Money.kt` | `LocalDate`, `money()` |
| Замок приложения | `core/lock/BiometricLock.kt` | `Core/BiometricLock.swift` |
| Уведомления, каналы, токен | `core/push/Push.kt` | `Core/Push.swift` |
| Открытая смена в шторке | `core/push/ShiftBoard.kt` | `Core/ShiftLiveActivity.swift` |
| Разбор номера | `core/plate/PlateReader.kt` | `Features/PlateScanner.swift` |
| Коды стран | `core/phone/Countries.kt` | `Core/Countries.swift` |
| Дизайн-система | `design/*` | `Design/Theme.swift`, `CodeCells.swift`, `Wordmark.swift` |
| Граф зависимостей | `AppGraph.kt` | окружение SwiftUI |

Строки продукта — 466 ключей на трёх языках — собираются из
`ios/Tetr/Localizable.xcstrings` скриптом, а не переписываются руками:
источник один на все клиенты, иначе они разойдутся. Ключи совпадают буква
в букву (`auth.phone` → `auth__phone`).

### Экраны

| iOS | Android | Готово | Проверено |
|---|---|---|---|
| `LoginView` (SMS, PIN, step-up, сброс, регистрация, сохранённый вход) | `feature/login/*` | да | на устройстве |
| `LockView` | `feature/lock/LockScreen.kt` | да | сборка |
| `OnboardingView` + `WorkerWelcomeSheet` | `feature/onboarding/*` | да | сборка |
| `ExpiredView` | `feature/expired/ExpiredScreen.kt` | да | сборка |
| `ShiftView` | `feature/shift/ShiftScreen.kt` | да | на устройстве |
| `OrderFlowView` | `feature/shift/OrderFlowSheet.kt` | да | на устройстве |
| `PlateScanner` (CameraX + ML Kit, затвор с отсчётом) | `feature/shift/PlateCameraPanel.kt` | да | сборка |
| `HandoverView` | `feature/shift/HandoverSheet.kt` | да | на устройстве |
| `OwnerView` + `SetupCard` + `RevenueChart` | `feature/owner/*` | да | на устройстве |
| `AlertsView` | `feature/owner/AlertsSheet.kt` | да | сборка |
| `PayrollView` (лист по дням, причал, история) | `feature/payroll/*` | да | на устройстве |
| `ExpensesView` + `ExpenseEditor` | `feature/expenses/ExpensesScreen.kt` | да | на устройстве |
| `ServicesView` + `ServiceEditor` + `TierEditor` | `feature/services/ServicesScreen.kt` | да | на устройстве |
| `StaffView` + `StaffEditor` | `feature/staff/StaffScreen.kt` | да | на устройстве |
| `ClientsView` + `ClientHistoryView` + `ClientGroupView` | `feature/clients/ClientsScreen.kt` | да | на устройстве |
| `CalendarView` | `feature/calendar/CalendarScreen.kt` | да | сборка |
| `DayView` | `feature/calendar/DayScreen.kt` | да | сборка |
| `ReportView` | `feature/report/ReportScreen.kt` | да | сборка |
| `ProfileView` + `PinChangeView` + `VerifyPhoneView` + `ChangePhoneView` | `feature/profile/ProfileScreen.kt` | да | сборка |
| `DevicesView` | `feature/profile/DevicesScreen.kt` | да | сборка |
| `DeleteBusinessView` | `feature/profile/DeleteBusinessSheet.kt` | да | сборка |
| `PointsView` + `PointMenu` | `feature/points/PointsScreen.kt` | да | сборка |
| выгрузка CSV | `feature/profile/Export.kt` | да | сборка |

### Использованные endpoint

Все, которыми пользуется iOS: `auth/*` (entry, verify, login, step-up,
resend, pin/reset, refresh, logout, switch, devices, verify-phone, phone),
`bootstrap`, `setup`, `shift`, `orders`, `orders/{id}/cancel`,
`clients`, `clients/{key}`, `clients/{key}/contact`, `clients/lookup`,
`summary`, `day`, `calendar`, `report`, `payroll`, `payouts`, `expenses`,
`services`, `tiers`, `staff`, `staff/{id}`, `staff/{id}/pin`, `alerts`,
`profile`, `profile/pin`, `account`, `export`, `push/token`,
`push/settings`.

## Чего ещё нет

Разделов iOS без Android-аналога не осталось: `Routes.pending` пуст.
Список оставлен намеренно — он механизм, а не остаток работы: следующий
новый экран сначала появляется там и только потом в меню.

Не проверено на устройстве: календарь, день, отчёт, профиль с подэкранами,
филиалы, стена «срок вышел», замок и сканер номера. Собираются и
компилируются, но руками по ним не ходили.

### Перенесено с коммита `1459a22` («Экраны приложения пересобраны»)

| Что | Где в Android |
|---|---|
| Полоса долей вместо трёх колонок «заплатили / сотрудникам / расходы», над ней общая сумма | `feature/owner/OwnerScreen.kt`, `Breakdown` + `SplitBar` |
| Разрез оплат одной общей полосой и только в месяце | там же, `PaymentBreakdown` |
| Средний чек убран из дня, остался в месяце | там же, `TodaySnapshot` |
| Себя владелец не видит ни в плашке у даты, ни в списке работающих | `CrewChip`, `OwnerViewModel.crew()` |
| Три числа записи собраны колонкой у правого края | `JournalRow` |
| Лента последних семи дней вместо рисунка календаря; клетка открывает свой день | `feature/more/MoreScreen.kt`, `CalendarCard` |
| Выход переехал из профиля в «Ավելին» последней строкой, знак приглушённый | `MoreScreen.kt` / `ProfileScreen.kt` |
| Вторые строки убраны у всех пунктов меню | `MoreScreen.kt` |
| Одна белая коробка вместо плитки на человека; цвет ушёл в кружок, «на смене» стало точкой | `feature/staff/StaffScreen.kt`, `PersonRow` |
| Грейповая обложка прайса заменена бумагой | `feature/services/ServicesScreen.kt`, `Cover` |
| Листы правки услуг и работника открываются на половину экрана | `ServicesScreen.kt`, `StaffScreen.kt` |
| Поля ввода: подпись сверху, набор слева, касание всей строкой | `design/Inputs.kt`, `FieldRow` |
| Крупные полосы суммы и цены ловят касание целиком | `ExpensesScreen.kt`, `ServicesScreen.kt` |
| Поиск клиентов, номер машины и скидка ловят касание всей строкой | `ClientsScreen.kt`, `OrderFlowSheet.kt` |

Полулисты в клиентах и сдаче кассы не заведены намеренно: в iOS их нет,
и расхождение здесь было бы не платформенным, а случайным.

### Перенесено с коммитов `ad9ff21`…`ee03965`

| Коммит | Что | Где в Android |
|---|---|---|
| `ad9ff21` | «Сегодня работают» лентой карточек, журнал кружком слева и деньгами колонкой, зарплаты стопкой лиц, показатели смены строкой | `OwnerScreen.kt`, `PayrollScreen.kt`, `ShiftScreen.kt` |
| `d19c3e6` | День и календарь мягкими карточками вместо тёмных плит, смены белой коробкой, записи журналом, день недели в шапке | `DayScreen.kt`, `CalendarScreen.kt`, `Components.kt` (`StatCards`) |
| `4642940` | Отчёт: месяцы графиком, доля кольцом, разрезы залиты в строку, оплаты метрами при приходе | `ReportScreen.kt` |
| `dc9a59c` | Совместная мойка: одна машина, несколько исполнителей | `core/money/Crew.kt`, `Dto.kt`, `Session.kt`, `OrderQueue.kt`, `OrderFlowSheet.kt`, `StaffScreen.kt` |
| `ef33896` | Словарь пересобран из свежего каталога iOS | `res/values*/strings.xml`, `tools/strings.py` |
| `c3d1e6d` | Код из SMS и код доступа разведены; вход спрашивает роль, а не способ; удаление кода доступа | `LoginViewModel.kt`, `LoginScreen.kt`, `ProfileScreen.kt`, `Session.kt` |
| `3162154` | Знак денежного числа считает одно место | `Brand.sign()` |
| `69a2f2f` | В профиле лицо вместо буквы, раскрывается нажатием | `ProfileScreen.kt`, `res/drawable-nodpi/avatar.jpg` |
| `ee03965` | Заводские услуги на языке смотрящего | `core/i18n/Terms.kt` |

Строки собираются одной командой и больше не переписываются руками:

```bash
python3 android/tools/strings.py
```

## Отличия, оставленные намеренно

| Что | Почему |
|---|---|
| Правки состава уже записанной машины нет | Её нет и в iOS: она живёт только в кабинете. Опередить iOS значило бы развести клиенты. |
| Лицо в профиле раскрывается нажатием, а не оттяжкой вниз | Жест оттяжки в Android занят системными панелями, и свой в глубине экрана спорил бы с ним за то же движение. |
| Окно отмены записи не переставлялось | Баг iOS был в всплывашке с якорем на прокрутке; в Android это модальный `AlertDialog` по центру, и такого положения там не бывает. |

## Уведомления

Доставка на Android работает: сервер шлёт двумя ветками — APNs для iOS и
FCM HTTP v1 для Android, — и платформу помнит в колонке `push_tokens.platform`
со значением по умолчанию `apns`.

Приложение получает токен FCM, отправляет его в `push/token` вместе с
`platform: "android"` и отзывает при выходе. Каналов два: `tetrin.orders`
и `tetrin.shift`; сервер называет первый явно, иначе Android положил бы
уведомление в канал по умолчанию и настройка «не звенеть» перестала бы
действовать.

Что нужно, чтобы это собралось у другого человека:

1. `app/google-services.json` из проекта Firebase, с ДВУМЯ приложениями —
   `com.sevarm.tetr` и `com.sevarm.tetr.debug`. Второе обязательно: у
   отладочной сборки имя пакета с суффиксом, и без него уведомления
   проверить негде. Без файла сборка проходит, просто без регистрации
   токена (см. `core/push/Push.kt`).
2. На сервере — `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` из
   ключа сервисного аккаунта. Пусто — ветка Android молчит, эппловская
   доставка от этого не страдает.

---

## Осознанные отличия от iOS

Не упрощения, а платформенные решения. Продукт одинаковый, средства разные.

| Что | В iOS | В Android | Почему |
|---|---|---|---|
| Открытая смена | Live Activity + Dynamic Island | постоянное уведомление в шторке | На Android нет Live Activity. Foreground service дал бы то же, но стоил бы разрешения, типа службы и обоснования перед магазином, охраняя процесс, которому нечего делать в фоне. |
| Фоновая досылка | `BGTaskScheduler` | `WorkManager`, периодическая + разовая по возврату связи | Штатный механизм платформы. |
| Замок | Face ID / Touch ID / код-пароль | `BiometricPrompt`, класс WEAK + код устройства | Android не сообщает, отпечаток настроен или лицо, — поэтому слово общее, а не выдуманное «Face ID». |
| Хранилище токенов | Keychain `ThisDeviceOnly` | AndroidKeystore AES/GCM + `allowBackup=false` | Ключ не покидает аппаратный модуль, копия бэкапа на другом телефоне не расшифруется. |
| Заставка | видеоролик | системная `SplashScreen` с знаком марки | Видео на старте Android — это лишние мегабайты и вторая вспышка поверх системной заставки, которую всё равно не убрать. |
| Выбор языка | пересборка дерева по `.id(lang)` | то же через `key(lang)` + свои `Resources` | Совпадает: язык меняется мгновенно, ввод не теряется. |
| Отмена записи | `confirmationDialog` | `AlertDialog` | Родной орган платформы, поведение то же. |
| Кнопка «назад» | жест от края | системная кнопка и жест, `enableOnBackInvokedCallback` | На Android возврат — это часть системы, и он обязан работать везде. |

---

## Как собрать

```bash
cd android && ./gradlew assembleDebug
```

Отладочная сборка ходит на `tetrin.api.development` из
`gradle.properties` (по умолчанию `http://10.0.2.2:3100/api/v1/` — это
`localhost` компьютера с точки зрения эмулятора). Магазинная — только на
`https://tetrin.pro/api/v1/`, и переменными это не подменяется.

Подпись релиза берётся из `keystore.properties` в корне `android/`; без
него `assembleRelease` собирает неподписанный APK.
