import Foundation

/// Ответы сервера.
///
/// Деньги везде целые и в минимальных единицах — драмах. Так они лежат в
/// базе, так уходят по сети, и нигде по дороге не превращаются в Double:
/// сумма зарплаты, посчитанная через плавающую точку, однажды разойдётся
/// с той, что видит владелец, и объяснить это будет нечем.
enum API {
    /**
     * Через сколько дней молчания клиент считается потерянным.
     *
     * То же число, что в кабинете (`LOST_AFTER_DAYS` в `lib/alerts.ts`),
     * и по нему же загорается повод в колокольчике. Здесь оно одно на всё
     * приложение: раньше двадцать один стоял в списке клиентов и ещё раз
     * в карточке, и держались они согласованными только пока никто не
     * трогал одно из двух.
     *
     * Сервер его не присылает намеренно: это порог подачи, а не данные, —
     * решает его тот, кто рисует список.
     */
    static let lostAfterDays = 21

    /**
     * Сколько цифр в коде.
     *
     * То же число, что на сервере (`PIN_LENGTH` в `lib/phone.ts`), и по
     * нему же сервер отказывает: `isValidPin` требует ровно столько.
     *
     * Здесь оно одно на всё приложение, и это не аккуратность. Четвёрка
     * стояла в трёх формах руками — найм, смена кода, удаление бизнеса, —
     * и все три молча отправляли на сервер заведомо негодный код: найм не
     * работал никогда, а смена и удаление перестали работать в тот день,
     * когда код стал шестизначным. Ни одна из форм об этом не сообщала:
     * снаружи это выглядело как «сервер отказал».
     *
     * ВВОД существующего кода этой длиной не ограничивается: у заведённых
     * до перехода на шесть цифр их четыре, и требовать шесть значило бы
     * запереть их снаружи. Минимум для ввода — `pinMinLength`.
     */
    static let pinLength = 6

    /// Сколько цифр достаточно, чтобы ПОПРОБОВАТЬ войти. Столько их у
    /// всех, кто завёл аккаунт до перехода на шестизначный код.
    static let pinMinLength = 4

    /// Длина кода из SMS. То же, что `CODE_LENGTH` в `lib/otp-shared.ts`.
    static let codeLength = 6

    struct Tenant: Decodable {
        let id: String
        let name: String
        let currency: String
        let timezone: String
        /// «Պետհամարանիշ» или «Հեռախոս» — приложение не знает про ниши,
        /// для него это просто слово, которое прислал сервер
        let clientIdLabel: String
        let clientIdType: String
        let staffRole: String
        let unitOne: String

        /**
         * Тарифные варианты: у мойки это класс машины.
         *
         * Необязательные намеренно. Приложение стоит на чужих телефонах и
         * обновляется само по себе — оно всегда может оказаться новее
         * сервера. Обязательное поле в такой паре это экран с ошибкой
         * разбора вместо смены у каждого, кто обновился первым.
         *
         * Пусто — свойства нет, и ни ряда классов, ни второй цены человек
         * не увидит. Продукт мультинишевый: «седаны» приходят с сервера
         * словами, которые придумал владелец.
         */
        let tierLabel: String?
        let tiers: [String]?
    }

    struct Me: Decodable {
        let id: String
        let name: String
        let role: String
        let percent: Int
        /// Слать ли владельцу уведомление о каждой записи.
        let notifyOrders: Bool?
        /// Он же логин.
        let phone: String?
        /**
         * Читал ли человек приветствие первого входа.
         *
         * Признак с сервера, а не из памяти телефона. `UserDefaults`
         * отвечал бы на другой вопрос — «показывали ли на ЭТОМ
         * устройстве», — и владелец, заведший мойку в браузере,
         * знакомился бы с продуктом второй раз, а переустановивший
         * приложение — третий.
         *
         * Необязательное: приложение обновляется само по себе и всегда
         * может оказаться новее сервера. Нет поля — считаем, что читал:
         * не показать приветствие однажды лучше, чем показать его тому,
         * кто работает в продукте полгода.
         */
        let welcomeSeen: Bool?
        /// Убрано ли «Начало работы» с главной. Нужно разделам: сама
        /// настройка приезжает со сводкой, а до сводки оттуда не идут.
        let setupHidden: Bool?

        /**
         * Есть ли у человека PIN вообще.
         *
         * У заведённых по коду из SMS его нет: входят они кодом, и в
         * `pin_hash` у них стоит метка «кода нет». Приложению это нужно в
         * двух местах, и без признака оба задают неотвечаемый вопрос: в
         * профиле у такого человека «задать код», а не «сменить», и
         * текущий у него не спрашивают, потому что спрашивать нечего; а
         * удаление бизнеса он подтверждает кодом из SMS, а не PIN-ом.
         *
         * Необязательное по общему правилу этого файла: приложение стоит
         * на чужих телефонах и может оказаться новее сервера. Нет поля —
         * считаем, что код есть: так экраны ведут себя как раньше.
         */
        let hasPin: Bool?

        /**
         * До какого момента действует ВРЕМЕННЫЙ ПИН.
         *
         * Его выдаёт админ платформы, когда человеку нечем войти: код
         * забыт, а SMS не доходит. Работает такой код как обычный, но
         * сгорает в свой срок — и человек останется без входа посреди
         * смены, если не задаст свой. Поэтому приложение об этом
         * напоминает, пока метка стоит.
         *
         * Строка ISO, а не дата: даты в этом файле разбираются вручную
         * там, где они нужны, и лишний форматтер ради одного напоминания
         * не заводим. Необязательное по общему правилу: приложение
         * стоит на чужих телефонах и бывает новее сервера.
         */
        let tempAccess: String?

        /**
         * Доказан ли номер кодом из SMS.
         *
         * Значит ровно одно, и оно важное: восстановить доступ по SMS
         * можно только по подтверждённому номеру. У сотрудников, которым
         * аккаунт завёл владелец, он не подтверждён — и пока это так,
         * забытый код для них тупик.
         *
         * Необязательное: нет поля — считаем подтверждённым и не
         * предлагаем ничего. Показать предложение тому, у кого всё в
         * порядке, хуже, чем не показать однажды.
         */
        let phoneVerified: Bool?

        var isOwner: Bool { role == "owner" }
        var pinSet: Bool { hasPin ?? true }
        var phoneProven: Bool { phoneVerified ?? true }

        /// Срок временного кода как дата. Nil — код свой, обычный.
        var tempAccessUntil: Date? {
            guard let tempAccess else { return nil }
            return ISO8601DateFormatter.withFraction.date(from: tempAccess)
                ?? ISO8601DateFormatter.plain.date(from: tempAccess)
        }
    }

    /**
     * Шаг настройки первого дня.
     *
     * Ключом, а не подписью: слова у приложения свои и на своём языке.
     * Считается всё на сервере по данным бизнеса (`lib/onboarding.ts`) —
     * есть ли свои цены, есть ли мойщик, есть ли первая запись, — и
     * приложение ничего из этого не проверяет само: два разных счёта
     * одного и того же разошлись бы на первой же правке.
     */
    struct SetupStep: Decodable, Identifiable, Hashable {
        /// business | services | staff | firstOrder
        let key: String
        let done: Bool

        var id: String { key }
    }

    struct Setup: Decodable {
        /// Показывать ли блок вообще. Ложь — человек его убрал или мойка
        /// уже работает; разбираться, что именно, приложению незачем.
        let visible: Bool
        let complete: Bool
        let done: Int
        let total: Int
        let steps: [SetupStep]
        /// Ключ первого невыполненного шага.
        let next: String?
    }

    struct Access: Decodable {
        let state: String
        let daysLeft: Int
        let canRead: Bool
        let canWrite: Bool
        let warn: Bool
    }

    struct Service: Decodable, Identifiable, Hashable {
        let id: String
        let name: String
        let price: Int
        /// Цены по тарифам в порядке `tenant.tiers`. Нет своей — базовая.
        let tierPrices: [Int]?

        /// Цена для выбранного тарифа. Единственное место, где это
        /// считается на клиенте, — и правило то же, что на сервере.
        func price(tier: Int?) -> Int {
            guard let tier, tier >= 0, let own = tierPrices?[safe: tier], own > 0 else { return price }
            return own
        }
    }

    /// Точка, где человек работает.
    ///
    /// Отдельно от `Tenant`: тот — про бизнес целиком, со всеми его
    /// терминами и услугами, а здесь ровно то, что нужно строке в списке.
    struct Point: Decodable, Identifiable, Hashable {
        let id: String
        let name: String
        /// owner | staff — на разных мойках роль может отличаться
        let role: String
        let state: String
        let canRead: Bool
        /// Необязательное: сервер может оказаться старее приложения.
        let daysLeft: Int?
    }

    /// Человек, которого можно отметить участником совместной работы.
    struct CrewMate: Decodable, Identifiable, Hashable {
        let id: String
        let name: String
        /**
         * Стоит ли он сейчас на смене.
         *
         * Отметить участником можно только его: не встал на смену —
         * значит сегодня не работал, и начислять ему за чужую машину не
         * за что. То же правило проверяет сервер при записи.
         *
         * Признак, а не отфильтрованный сервером список: «коллег нет
         * вовсе» и «все ушли домой» — разные ответы, и экран записи
         * обязан их различать. Необязательное по общему правилу файла:
         * старый сервер его не шлёт, и тогда список остаётся полным, как
         * и был.
         */
        let onShift: Bool?

        /// Старый сервер признака не шлёт: там выбирать можно любого.
        var working: Bool { onShift ?? true }
    }

    /**
     * Совместная работа: одну машину моют вдвоём-втроём.
     *
     * `percent` — ставка на ВСЮ команду, а не каждому: цена × процент
     * даёт фонд, фонд делится поровну между участниками. Пусто — свойство
     * у бизнеса выключено, и приложение не показывает ни одного нового
     * пикселя, ровно как с тарифами.
     *
     * `members` — активные люди точки, включая смотрящего. Убирать себя
     * обязан тот, кто рисует список: автор записи участник по
     * определению, и галочка напротив собственного имени была бы способом
     * однажды остаться без денег за свою же работу. Кто из них на смене,
     * говорит `CrewMate.onShift`.
     */
    struct Crew: Decodable {
        let percent: Int?
        let members: [CrewMate]?
    }

    /// Последняя версия приложения, опубликованная в App Store.
    /// Число живёт на сервере (`lib/plan.ts`), а не в магазине: сервер
    /// знает его мгновенно и офлайн-кэш bootstrap работает как обычно.
    struct AppRelease: Decodable {
        let iosLatest: String?
    }

    struct Bootstrap: Decodable {
        let tenant: Tenant
        let me: Me
        let access: Access
        let services: [Service]
        /// Необязательное: приложение может оказаться новее сервера.
        let points: [Point]?
        /// Совместная работа. Необязательное по общему правилу файла.
        let crew: Crew?
        /// Версии. Старый сервер поля не шлёт — тогда стены обновления нет.
        let app: AppRelease?
    }

    struct Tokens: Decodable {
        let access: String
        let refresh: String
        let expiresIn: Int
    }

    /// Ответ перехода на другую точку — та же пара токенов и новый список.
    struct Switched: Decodable {
        let access: String
        let refresh: String
        let expiresIn: Int
        let tenantId: String
        let points: [Point]?
    }

    struct LoginResult: Decodable {
        let access: String
        let refresh: String
        let expiresIn: Int
        let user: Me
        let tenantId: String?
        let points: [Point]?
    }

    /**
     * Заявка на код из SMS.
     *
     * Один и тот же ответ у всех поводов: вход по коду, восстановление
     * кода, подтверждение удаления бизнеса. Заявка сама знает, зачем её
     * заводили, поэтому повод в ней и не назван.
     *
     * `phone` приходит закрытым (`+374 •• ••• •• 56`): экран обязан
     * сказать, куда ушёл код, но показывать номер целиком человеку,
     * который его ещё не доказал, незачем.
     */
    struct Challenge: Decodable {
        let challengeId: String
        /// Закрытый номер. Необязательный: повтор отправки его не шлёт.
        let phone: String?
        /// Раньше этого момента повторная отправка не сработает.
        let resendAt: Date
        let expiresAt: Date
        /// Сколько повторов осталось. Приходит только в ответе на повтор.
        let resendsLeft: Int?
    }

    /**
     * Ответ второго шага главного входа.
     *
     * Либо пара токенов — номер знакомый, человек внутри; либо пропуск —
     * номер свободен, и бизнес под него ещё не заведён. Приложение
     * бизнесы не заводит (об этом ниже, в `LoginView`), поэтому пропуск
     * ему нужен ровно для того, чтобы отличить одно от другого.
     */
    struct EntryResult: Decodable {
        let access: String?
        let refresh: String?
        let expiresIn: Int?
        let user: Me?
        let points: [Point]?
        /// Пропуск на создание мойки. Не пусто — номер свободен.
        let ticket: String?
    }

    /// Пропуск на смену кода: выдаётся, когда код восстановления сошёлся.
    struct ResetTicket: Decodable {
        let ticket: String
    }

    /**
     * Заявка нулевого шага смены номера: код на СВОЙ номер.
     *
     * Отдельный тип, а не `Challenge`, потому что и поле названо иначе —
     * `proofId`. Разница не косметическая: этот идентификатор
     * доказывает хозяина и уезжает обратно вместе с новым номером, тогда
     * как `challengeId` последнего шага доказывает новый номер. Одно имя
     * на оба означало бы, что их можно перепутать местами, а перепутать
     * их нельзя.
     */
    struct PhoneProof: Decodable {
        let proofId: String
        /// Закрытый текущий номер: куда ушёл код.
        let phone: String?
        let resendAt: Date
        let expiresAt: Date
    }

    /**
     * Устройство, с которого сейчас открыт вход.
     *
     * Список свой, а не всего бизнеса: сессии сотрудников владелец здесь
     * не видит. Уволить человека он и так может — это гасит его входы
     * разом, — а разглядывать его устройства оснований нет.
     */
    struct Device: Decodable, Identifiable {
        let id: String
        /// web | app — чем человек вошёл
        let kind: String
        /// метка устройства, как её назвал клиент; пусто у старых сессий
        let device: String?
        let createdAt: Date
        let lastSeenAt: Date
        /// это устройство, с которого смотрят прямо сейчас
        let current: Bool

        var isApp: Bool { kind == "app" }
    }

    struct Devices: Decodable {
        let devices: [Device]
    }

    struct ShiftOrder: Decodable, Identifiable {
        let id: String
        /// Номер машины. В журнале смены он важнее названия услуги: «Комплекс»
        /// за день встречается двадцать раз, номер — один, и свою ошибку ищут
        /// по нему. Пусто только у записи, чьего клиента удалили.
        let clientKey: String?
        let serviceName: String
        let price: Int
        let payment: String
        let createdAt: Date

        /**
         * Сколько причитается СМОТРЯЩЕМУ за эту машину и сколько человек
         * её мыли.
         *
         * До совместной работы первое считалось из цены и ставки, а
         * второе всегда равнялось единице. Теперь оба приходят с сервера:
         * доля у совместной машины не выводится ни из цены, ни из
         * процента — она посчитана и записана в момент записи.
         *
         * Необязательные по общему правилу файла: приложение стоит на
         * чужих телефонах и может оказаться новее сервера. Пусто — старый
         * сервер, и тогда машина одиночная, как и была.
         */
        let earned: Int?
        let crew: Int?

        /// Мыли вместе. Один участник — обычная запись, какой она была всегда.
        var shared: Bool { (crew ?? 1) > 1 }
    }

    /// Смена, которую человек сегодня уже закрыл.
    struct ClosedShift: Decodable {
        let openedAt: Date
        let closedAt: Date
    }

    struct Shift: Decodable {
        let count: Int
        let revenue: Int
        let earned: Int
        let percent: Int
        let orders: [ShiftOrder]
        /// Встал ли человек на смену переключателем.
        let onShift: Bool
        let openedAt: Date?
        /// Сегодняшняя закрытая смена. «Ещё не вставал» и «отработал и
        /// закрылся» — разные состояния одного дня, и различить их можно
        /// только так: открытой смены нет ни там, ни там.
        let closedToday: ClosedShift?
        /// Сколько наличных набралось с начала смены — подставляется при сдаче.
        let cashSoFar: Int
    }

    /// Ответ на включение и выключение переключателя.
    struct ShiftState: Decodable {
        let onShift: Bool
        let openedAt: Date?
        let cashExpected: Int?
        let cashDeclared: Int?
    }

    struct MonthDay: Decodable, Identifiable {
        let date: String
        let revenue: Int
        let count: Int
        var id: String { date }
    }

    struct MonthTotal: Decodable {
        let revenue: Int
        let serviceRevenue: Int
        let count: Int
        let payroll: Int
        let expenses: Int
        let profit: Int
    }

    struct Month: Decodable {
        let month: String
        let days: [MonthDay]
        let total: MonthTotal
    }

    struct DayShift: Decodable, Identifiable {
        let userId: String
        let name: String
        let openedAt: Date
        let closedAt: Date?
        /// Сколько наличных намыл и сколько сдал. null — не отмечал.
        let cashExpected: Int?
        let cashDeclared: Int?
        // человек мог отстоять две смены за день — одного userId мало
        var id: String { "\(userId)-\(openedAt.timeIntervalSince1970)" }
    }

    struct Day: Decodable {
        let date: String
        let stats: Stats
        let costs: Costs
        let profit: Int
        /**
         * Сравнение с предыдущим отрезком. Необязательное: маршрут дня его
         * не присылает — карточку дня открывают из календаря, где соседние
         * дни уже видны рядом.
         *
         * Было объявлено обязательным, и разбор всего дня падал на
         * отсутствующем ключе. Ошибку глотал `try?`, поэтому экран не
         * ругался, а просто оставался пустым: белый лист вместо дня, в
         * котором была работа.
         *
         * Отсюда правило для всей этой структуры: любое поле, которого
         * может не быть хоть в одном ответе, объявляется необязательным.
         */
        let previous: Previous?
        let shifts: [DayShift]
        let feed: [FeedItem]
    }

    /// Кто сейчас на мойке — для экрана владельца.
    struct Present: Decodable, Identifiable {
        let userId: String
        let name: String
        let openedAt: Date
        var id: String { userId }
    }

    struct KnownClient: Decodable {
        let key: String
        let visits: Int
        let total: Int
        let lastSeenAt: Date
        /// Каким классом эту машину записывали в прошлый раз: джип не
        /// станет седаном между мойками, поэтому выбор подставляется сам.
        let lastTier: String?
    }

    struct Lookup: Decodable {
        let known: KnownClient?
    }

    struct Stats: Decodable {
        let revenue: Int
        let count: Int
        let cash: Int
        /**
         * Скидок дано за период.
         *
         * Не расход и не убыток: деньги, которых бизнес решил не брать.
         * Считает сервер тем же запросом, что выручку. Молчим, когда
         * ноль: «скидок 0 ֏» сообщает то же, что их отсутствие.
         */
        let discounts: Int?
        let avgCheck: Int
        /// Начислено исполнителям за период — не выплачено, а именно начислено.
        let payroll: Int
        /**
         * Кто сколько намыл и сколько ему за это причитается.
         *
         * Сервер отдавал это поле и раньше, просто приложение его не
         * читало: сводка знала только сумму зарплаты целиком и не могла
         * разложить её по именам. Кабинет теперь показывает список людей
         * с машинами и заработком, и телефон обязан отвечать так же.
         *
         * Optional — по общему правилу этого файла: приложение стоит на
         * чужих телефонах и обновляется само по себе, оно всегда может
         * оказаться новее сервера.
         */
        let byStaff: [StaffLine]?
    }

    struct Costs: Decodable {
        let oneOff: Int
        let monthlyShare: Int
        let total: Int
    }

    struct Expense: Decodable, Identifiable {
        let id: String
        let amount: Int
        let category: String
        let note: String?
        let monthly: Bool
        let at: Date
        /// Заполнено только у завершённого постоянного расхода.
        let endedAt: Date?
        /**
         * Во что эта строка обошлась за выбранный месяц.
         *
         * Постоянный расход платят раз в месяц, а живёт он каждый день:
         * десятого числа от аренды набежала треть. Без этого числа
         * «300 000» в списке читается как «я потратил триста тысяч».
         *
         * Считает база — тем же выражением, что итог наверху. Приложение
         * это делить не должно: свой счёт разошёлся бы с серверным на
         * границах месяца и после правки суммы.
         */
        let share: Int?
        /// Дневная доля постоянного; у разового ноль. Тоже с сервера —
        /// знаменатель здесь длина месяца ПЕРИОДА, а не текущего.
        let perDay: Int?
    }

    struct Expenses: Decodable {
        let hints: [String]
        let expenses: [Expense]
        /// Optional: старое приложение продолжает работать со старым сервером.
        let costs: Costs?
        /// Выручка того же периода: расход сам по себе не плохой и не
        /// хороший, оценивают его долей в приходе.
        let revenue: Int?
        /// Средний расход в день — по прожитым дням периода. Считает
        /// сервер: «сколько дней прожито» знает только он.
        let perDayAvg: Int?
    }

    struct FeedItem: Decodable, Identifiable {
        let id: String
        let clientKey: String?
        let serviceName: String
        let staffName: String?
        /**
         * Снимок процента в самой записи, а не текущая ставка человека.
         *
         * Необязательное намеренно. Приложение стоит на чужих телефонах и
         * обновляется само по себе: оно всегда может оказаться новее
         * сервера. Обязательное поле в такой паре — это экран с ошибкой
         * декодирования вместо выручки у каждого, кто обновился первым.
         * Любое новое поле здесь приходит optional.
         */
        let staffPercent: Int?
        let price: Int
        /**
         * Цена по прайсу — только когда взяли меньше.
         *
         * Пусто, когда скидки не было. До этого поля скидку было видно
         * ровно в одном месте: в уведомлении в момент записи. Владелец,
         * пропустивший его, не узнавал о ней никогда — ни в ленте, ни в
         * истории машины, ни в отчёте.
         *
         * Необязательное по общему правилу этого файла: приложение
         * стоит на чужих телефонах и может оказаться новее сервера.
         */
        let listPrice: Int?
        let payment: String
        let createdAt: Date

        /**
         * Кто работал — все, а не автор записи.
         *
         * `staffName` выше остаётся тем, КТО ВНЁС запись: у одиночной
         * мойки это тот же человек, у совместной — один из бригады.
         * Владельцу нужны оба ответа, но по разным поводам: состав он
         * читает всегда, автора — когда разбирается, откуда взялась
         * запись.
         *
         * Необязательное по общему правилу файла.
         */
        let crew: [FeedWorker]?

        /// Мыли вместе. Один участник — обычная запись, какой она была всегда.
        var shared: Bool { (crew?.count ?? 1) > 1 }

        /// «Արման · Դավիթ · Կարեն», а у одиночной — одно имя.
        var crewNames: String {
            let names = (crew ?? []).compactMap(\.name)
            return names.isEmpty ? (staffName ?? "—") : names.joined(separator: " · ")
        }

        /**
         * Сколько с этой машины ушло исполнителям — ВСЕМ вместе.
         *
         * У совместной это фонд команды, а не доля одного: `staffPercent`
         * там означает ставку на всю машину. Ровно поэтому «осталось
         * бизнесу» считается верно в обоих случаях одной формулой.
         * Округление то же, что на сервере (`staffShare`), иначе в
         * приложении и в ведомости стояли бы разные драмы.
         */
        var earned: Int { price * (staffPercent ?? 0) / 100 }
    }

    /// Участник работы в ленте: кто мыл и сколько ему за это начислено.
    struct FeedWorker: Decodable, Identifiable, Hashable {
        let staffId: String?
        let name: String?
        let earned: Int
        var id: String { staffId ?? (name ?? "—") }
    }

    /// Столбик графика. Ключ приходит строкой «2026-07-29 16», а не датой:
    /// timestamp без зоны при разборе трактуется как время клиента, и
    /// график съезжает на разницу часовых поясов.
    struct SeriesPoint: Decodable, Identifiable {
        let key: String
        let revenue: Int
        var id: String { key }

        /* Ключ приходит в виде «2026-07-02 00» и ВСЕГДА кончается часом —
           даже когда ряд дневной. Брать две последние цифры годилось только
           для часов: на тридцати днях все подписи выходили «00». */
        var hourLabel: String { String(key.suffix(2)) }
        var dayLabel: String { String(key.dropFirst(8).prefix(2)) }
    }

    struct SplitSegment: Decodable, Identifiable {
        let payment: String
        let revenue: Int
        var id: String { payment }
    }

    struct StaffLine: Decodable, Identifiable {
        let staffId: String?
        let name: String?
        let count: Int
        let revenue: Int
        let earned: Int
        var id: String { staffId ?? "—" }
    }

    struct Summary: Decodable {
        /// Начало периода. Нужно, чтобы подписать цифру датой: без неё
        /// «Հասույթ» — число без привязки, и понять, за что оно, можно
        /// только вспомнив, какую кнопку нажал.
        let from: Date
        /// Верхняя граница периода. У закрытого прошлого месяца она в
        /// прошлом, и подписывать его сегодняшним числом было бы враньём.
        /// Optional: приложение обновляется отдельно от сервера.
        let to: Date?
        let stats: Stats
        /* Прибыль считает сервер: формула одна на приложение и кабинет,
           и разъехаться между ними она не должна — это та цифра, из-за
           которой продукту верят. */
        let costs: Costs
        let profit: Int
        /// Тот же отрезок непосредственно перед текущим — не с чем иначе
        /// сравнить: вчерашнюю прибыль владелец в уме не считает.
        let previous: Previous
        let onShift: [Present]
        let series: [SeriesPoint]
        let split: [SplitSegment]
        let feed: [FeedItem]
        /**
         * Настройка первого дня.
         *
         * Едет вместе со сводкой, а не отдельным запросом: экран
         * обновляют потягиванием вниз, и второй round-trip по мобильной
         * сети либо задержал бы его, либо оборвался — а «Начало работы»
         * разошлось бы с числами на том же экране.
         *
         * Необязательное: приложение может оказаться новее сервера.
         */
        let setup: Setup?
    }

    struct Previous: Decodable {
        /// Границы базы: подпись обязана назвать даты, иначе «к прошлому
        /// периоду» не сообщает ничего.
        let from: Date?
        let to: Date?
        let revenue: Int
        let profit: Int
        /// Ноль записей — сравнивать не с чем, и клиент молчит вместо
        /// «+100 %» от пустоты.
        let count: Int?
    }

    struct PayrollDay: Decodable, Identifiable {
        /// день в часовом поясе мойки, `YYYY-MM-DD`
        let day: String
        let count: Int
        let revenue: Int
        let earned: Int
        var id: String { day }
    }

    struct PayrollDue: Decodable, Identifiable {
        let staffId: String?
        let name: String?
        /// текущая ставка человека — НЕ та, по которой посчитано
        let percent: Int
        /* Ставки, по которым деньги посчитаны на самом деле. Каждая
           запись хранит процент, который стоял в момент записи, поэтому
           после смены ставки `percent` перестаёт объяснять `earned`.
           Показывать надо эти две, а вилку — когда они разошлись. */
        let pctFrom: Int?
        let pctTo: Int?
        let count: Int
        let revenue: Int
        let earned: Int
        /// то же неоплаченное, разложенное по дням
        let days: [PayrollDay]?
        var id: String { staffId ?? "—" }

        /// Ставка строкой: одно число, если не менялась, иначе вилка.
        var rateLabel: String {
            guard let from = pctFrom, let to = pctTo else { return "\(percent)%" }
            return from == to ? "\(from)%" : "\(from)–\(to)%"
        }
    }

    struct Payout: Decodable, Identifiable {
        let id: String
        let amount: Int
        let paidAt: Date
        let staffName: String?
    }

    /* ─────────────────── лист по рабочим дням ───────────────────

       То же, что показывает кабинет, и посчитанное тем же кодом на
       сервере (`lib/payroll-board.ts`). Отличие от `due` не в
       оформлении: там сумма по человеку с границей «всё, что раньше
       последней выплаты», здесь — остаток по каждому дню отдельно,
       вместе с тем, что за этот день уже отдано и когда.

       Считать это на телефоне нельзя было бы даже при желании: по
       `due` закрытый день не отличить от дня, в котором человек мыл по
       нулевой ставке, — оба приходят нулём. */

    /// Машина, из которой сложилась дневная доля.
    struct PayrollLine: Decodable, Identifiable {
        let id: String
        /// «34 AA 555 · Կոմպլեքս» — чем запись названа в ленте
        let title: String
        let price: Int
        /// ставка на всю машину: у совместной — процент команды
        let percent: Int
        /// начислено этому человеку за эту машину
        let earned: Int
        /**
         * Сколько человек мыли машину.
         *
         * Без этого числа строка совместной работы читается как ошибка:
         * под машиной за 12 000 стоит «45 %» и «1 800 ֏», и первое со
         * вторым не сходится, пока не сказано, что фонд делили на троих.
         *
         * Необязательное по общему правилу файла: старый сервер его не
         * шлёт, и там любая машина одиночная.
         */
        let crew: Int?

        /// «12 000 ֏ × 45%» — и «÷ 3», когда мыли вместе.
        func formula(_ price: String) -> String {
            let base = "\(price) × \(percent)%"
            return (crew ?? 1) > 1 ? "\(base) ÷ \(crew ?? 1)" : base
        }
    }

    /// Человек внутри рабочего дня.
    struct PayrollPerson: Decodable, Identifiable {
        /// пусто у записей без исполнителя: платить по ним некому
        let staffId: String?
        let name: String?
        let count: Int
        /// сколько за этот день ещё должны
        let earned: Int
        /// сколько за этот день уже отдано
        let paid: Int
        /// когда отдали в последний раз
        let paidAt: Date?
        let pctFrom: Int?
        let pctTo: Int?
        /// пусто, если полного разложения нет: половина машин под суммой
        /// читается как полная и не сходится
        let lines: [PayrollLine]?

        var id: String { staffId ?? "—" }

        /// Ставка, по которой посчитано: одно число, а после смены — вилка.
        var rateLabel: String? {
            guard let from = pctFrom, let to = pctTo else { return nil }
            return from == to ? "\(from)%" : "\(from)–\(to)%"
        }
    }

    /// Рабочий день целиком: и долг, и уже закрытое.
    struct PayrollBoardDay: Decodable, Identifiable {
        /// `YYYY-MM-DD` в часовом поясе мойки
        let day: String
        let units: Int
        let outstanding: Int
        let paid: Int
        let people: [PayrollPerson]

        var id: String { day }
    }

    struct PayrollPaymentRow: Decodable, Identifiable {
        let id: String
        let staffId: String?
        let name: String?
        let amount: Int
    }

    /// Одна выдача: сколько человек за раз получили деньги из рук в руки.
    struct PayrollPayment: Decodable, Identifiable {
        let key: String
        let paidAt: Date
        /// за какой рабочий день; пусто у старых выплат — там только отрезок
        let day: String?
        let periodFrom: Date
        let periodTo: Date
        /// машин за тот рабочий день, если это ещё известно
        let units: Int?
        let total: Int
        let rows: [PayrollPaymentRow]

        var id: String { key }
    }

    struct PayrollTotals: Decodable {
        /// сколько сейчас нужно раздать
        let outstanding: Int
        /// скольким людям
        let owedTo: Int
        let accrued: Int
        let settled: Int
        let units: Int
    }

    struct PayrollBoard: Decodable {
        let days: [PayrollBoardDay]
        let payments: [PayrollPayment]
        let totals: PayrollTotals
        let lastPaidAt: Date?
    }

    struct Payroll: Decodable {
        let due: [PayrollDue]
        let payouts: [Payout]
        /**
         * Необязательный намеренно.
         *
         * Приложение стоит на чужих телефонах и обновляется само по себе —
         * оно всегда может оказаться новее сервера. Обязательное поле в
         * такой паре это экран с ошибкой разбора вместо зарплат у всех,
         * кто обновился первым.
         */
        let board: PayrollBoard?
    }

    struct Client: Decodable, Identifiable {
        let id: String
        let key: String
        let name: String?
        /* Телефон вписывает владелец из карточки — при записи машины его
           не спрашивают. Необязательное: сервер может оказаться старше
           приложения, а на пустом поле экран падать не должен. */
        let phone: String?
        let visits: Int
        let total: Int
        /// Дней с последнего визита. Считает база и обрезает нулём:
        /// отрицательной давности не бывает, а запись может прийти
        /// завтрашним числом с телефона со спешащими часами.
        let daysSince: Int
        /* Когда приехал впервые. Приходит только в карточке — в списке
           сравнивают давность последнего визита. Необязательное: сервер
           может оказаться старше приложения. */
        let firstSeenAt: Date?
    }

    struct ClientOrder: Decodable, Identifiable {
        let id: String
        let createdAt: String
        let price: Int
        /// Прайс — только когда взяли меньше. Необязательное: сервер
        /// может оказаться старее приложения.
        let listPrice: Int?
        let serviceName: String
        let payment: String
        let staffName: String?
    }

    /// Одна машина и всё, что она у нас мыла.
    struct ClientHistory: Decodable {
        let client: Client
        let orders: [ClientOrder]
    }

    struct Clients: Decodable {
        let clients: [Client]
    }

    /**
     * Повод для колокольчика.
     *
     * Не событие, а состояние мойки: «пятеро не были три недели» правда,
     * пока они не приедут. Считает его сервер — той же сборкой, что и
     * кабинет в браузере: два места, считающие поводы по-разному, врут
     * в одном из двух.
     */
    struct Alert: Decodable, Identifiable {
        let key: String
        let title: String
        let note: String
        let action: String
        /// `warn` — то, что теряет деньги прямо сейчас
        let tone: String
        var id: String { key }
    }

    struct Alerts: Decodable {
        let alerts: [Alert]
    }

    struct StaffMember: Decodable, Identifiable {
        let id: String
        let name: String
        let phone: String
        let role: String
        let percent: Int
        let isMe: Bool
        /* Что человек сделал за этот месяц. Необязательные: сервер может
           оказаться старше приложения, а список людей должен работать и
           без чисел. */
        let cars: Int?
        let earned: Int?
        /* Стоит ли он на смене прямо сейчас — вопрос про площадку, а не
           про месяц, поэтому отсчёт другой. */
        let onShift: Bool?
        let openedAt: Date?
        /**
         * Сколько ему сейчас должны.
         *
         * Считает тот же лист, которым живут зарплаты, а не отдельная
         * формула: второй счёт долга разошёлся бы с ведомостью на первой
         * же отменённой машине.
         */
        let due: Int?
    }

    struct Staff: Decodable {
        let staff: [StaffMember]
    }

    struct Services: Decodable {
        let services: [Service]
    }

    struct CreatedOrder: Decodable {
        let duplicate: Bool
        /**
         * Кому сколько досталось.
         *
         * Приезжает сразу с ответом на запись, а не запросом следом:
         * участник совместной работы должен увидеть СВОЮ долю в ту же
         * секунду, а не вечером в ведомости. Пусто у повторной досылки —
         * она ничего не создавала.
         */
        let crew: [FeedWorker]?
    }

    /* ─────────────────────── отчёт по месяцам ───────────────────────

       Тот же разбор, что в кабинете, и посчитанный тем же кодом на
       сервере (`lib/reports.ts`). Сводка отвечает «сколько за месяц»;
       отчёт отвечает на следующий вопрос — стало лучше или хуже и
       почему, — и до сих пор этот ответ был только в браузере. */

    /// Месяц в ряду: то, из чего собирается выбор и сравнение соседних.
    struct ReportMonth: Decodable, Identifiable {
        /// сколько месяцев назад: 0 — текущий
        let back: Int
        let from: Date
        let to: Date
        let count: Int
        let revenue: Int
        let payroll: Int
        let costs: Int
        let discounts: Int
        let avgCheck: Int
        let profit: Int
        /// какая доля прихода осталась владельцу, в процентах
        let kept: Int

        var id: Int { back }
    }

    /// Открытый месяц целиком.
    struct ReportCurrent: Decodable {
        let back: Int
        let from: Date
        let to: Date
        let count: Int
        let revenue: Int
        let payroll: Int
        let costs: Int
        let oneOff: Int
        let monthlyShare: Int
        let discounts: Int
        let avgCheck: Int
        let profit: Int
        let kept: Int
        let byStaff: [StaffLine]
    }

    /// С чем сравниваем: тот же отрезок прошлого месяца.
    struct ReportBase: Decodable {
        let revenue: Int
        let profit: Int
    }

    /// Строка разреза: услуга или категория расхода.
    struct ReportLine: Decodable, Identifiable {
        /// у услуг — её название, у расходов — категория
        let name: String
        /// сколько раз брали; у расходов не приходит
        let count: Int?
        /// сколько принесла; у расходов — сколько потрачено
        let revenue: Int?
        let amount: Int?
        /// постоянный ли расход; у услуг не приходит
        let monthly: Bool?

        var id: String { "\(name)-\(monthly ?? false)" }
        /// Деньги строки, как бы поле ни называлось на своей стороне.
        var value: Int { revenue ?? amount ?? 0 }
    }

    struct Report: Decodable {
        let months: [ReportMonth]
        let current: ReportCurrent
        let base: ReportBase?
        let services: [ReportLine]
        let costsByCategory: [ReportLine]
        let split: [SplitSegment]
    }
}

/// Ошибка запроса.
///
/// `code` — то, что прислал сервер: WRONG_CREDENTIALS, PASS_UNAVAILABLE и
/// прочие. Приложение переводит их само, поэтому сервер шлёт код, а не
/// готовую строку.
struct APIError: Error {
    let status: Int
    let code: String?
    let retryAfter: Int?

    /// Заявка на код из SMS — приходит вместе с `STEP_UP_REQUIRED`.
    ///
    /// Отказ здесь не окончательный: PIN подошёл, но вход идёт с
    /// незнакомого устройства, и сервер ждёт код. Без этих двух полей
    /// экрану не с чем открыть ввод кода, и «дополнительная проверка»
    /// выглядела бы просто отказом.
    var challengeId: String? = nil
    var maskedPhone: String? = nil

    /**
     * Уточнение к коду ответа.
     *
     * Сервер кладёт его туда, где одного кода мало, чтобы сказать
     * человеку правду: `PIN_WEAK` бывает и «мало цифр», и «слишком
     * очевидный», а это разные беды, и общий ответ на них заставляет
     * гадать, что не так с кодом, который только что придумали.
     */
    var reason: String? = nil

    /// Сеть не ответила вовсе — запись уйдёт в очередь, а не потеряется.
    var isOffline: Bool { status == 0 }
    var isUnauthorized: Bool { status == 401 }

    /// Протух токен — и только это.
    ///
    /// 401 приходит и по другому поводу: сервер понял, кто пришёл, и
    /// отказал по существу — например не сошёлся PIN при удалении
    /// бизнеса. Обновлять токен там бессмысленно, а молчаливый повтор
    /// запроса списал бы у человека вторую попытку из лимита за одну
    /// опечатку.
    var isStaleToken: Bool { status == 401 && (code == nil || code == "UNAUTHORIZED") }
}

/// Клиент HTTP.
///
/// Без сторонних библиотек: запросов полтора десятка, а URLSession умеет
/// всё, что для них нужно. Каждая зависимость — это ещё и её обновления,
/// её несовместимости и её сопровождение.
actor APIClient {
    static let shared = APIClient()

    /// Косая черта на конце обязательна: без неё относительный путь
    /// заменяет последний сегмент, и `summary` уезжает в `/api/summary`.
    /* Свой домен. Прежний baziss.duckdns.org сервер обслуживает по-прежнему
       и обрывать его нельзя: на телефонах стоят сборки, которые ходят
       именно туда, и для них смена адреса означала бы мёртвое приложение
       до следующего обновления. */
    private let base = APIClient.baseURL()

    /// Боевой адрес. Единственное место, где он написан.
    static let production = URL(string: "https://tetrin.pro/api/v1/")!

    /// Куда ходит отладочная сборка, если её не попросили о другом.
    static let development = URL(string: "http://localhost:3100/api/v1/")!

    /**
     * Адрес сервера.
     *
     * Отладочная сборка ходит на свой компьютер, магазинная — на боевой
     * сервер. Иначе не бывает: обратное означало бы, что проверка нового
     * экрана идёт по живым клиентам — заводит им машины, тратит их
     * абонементы и портит им зарплату за месяц. Такую ошибку нельзя
     * заметить вовремя, потому что выглядит она как работающее приложение.
     *
     * Раньше умолчанием здесь был как раз прод: `TETR_API` подменял адрес,
     * но переменную надо было не забыть, а забывается она молча. Теперь
     * забыть можно только в безопасную сторону — сборка с отладкой упрётся
     * в «нет связи», если сервер не поднят, и это видно сразу.
     *
     * Переменная осталась, и смысла у неё три:
     *
     *     TETR_API=http://192.168.1.5:3100/api/v1/   телефон в той же сети
     *     TETR_API=prod                              осознанно по бою
     *     TETR_API=<пусто>                           localhost, как обычно
     *
     * Ставится в схеме Xcode (она описана в `ios/project.yml`, галочка
     * рядом со значением) или при запуске:
     *
     *     xcrun simctl launch --console <udid> com.sevarm.tetr \
     *       --setenv TETR_API http://localhost:3100/api/v1/
     */
    #if DEBUG
    /**
     * Куда эта сборка ходит прямо сейчас.
     *
     * Нужен ровно для одного вопроса, который повторяется каждый раз при
     * запуске на живом телефоне: «почему нет связи». Причина почти всегда
     * одна и та же и не видна ниоткуда — приложение подняли с домашнего
     * экрана, а не из Xcode, переменной `TETR_API` в процессе нет, и
     * сборка честно стучится в `localhost` самого телефона.
     *
     * Поэтому адрес показан на экране входа, а не напечатан в консоль:
     * консоль есть только у запуска из Xcode, то есть ровно у того
     * случая, когда всё и так работает.
     */
    static var debugAddress: String { baseURL().absoluteString }
    #endif

    private static func baseURL() -> URL {
        #if DEBUG
        let raw = ProcessInfo.processInfo.environment["TETR_API"]?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        if raw.isEmpty { return development }
        if raw == "prod" || raw == "production" { return production }

        /* Пустой хост — это опечатка вроде «localhost:3100/api/v1/» без
           схемы: URL такую строку принимает, а запрос по ней не уходит
           никуда. Молча падать в прод на опечатке нельзя, поэтому
           остаёмся на своей машине. */
        guard let url = URL(string: raw), url.host != nil else { return development }
        return url
        #else
        /* Магазинная сборка адрес не выбирает: переменные окружения
           задаются тем, кто запускает процесс, и на чужом устройстве это
           не мы. */
        return production
        #endif
    }
    private let session: URLSession

    private lazy var decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { decoder in
            let text = try decoder.singleValueContainer().decode(String.self)
            if let date = ISO8601DateFormatter.withFraction.date(from: text) { return date }
            if let date = ISO8601DateFormatter.plain.date(from: text) { return date }
            throw DecodingError.dataCorrupted(
                .init(codingPath: decoder.codingPath, debugDescription: "дата: \(text)")
            )
        }
        return d
    }()

    init() {
        let config = URLSessionConfiguration.default
        // Во дворе мойки связь пропадает. Долгое ожидание бессмысленно:
        // запись всё равно ляжет в очередь и уйдёт, когда связь вернётся.
        config.timeoutIntervalForRequest = 12
        config.waitsForConnectivity = false
        session = URLSession(configuration: config)
    }

    func send<T: Decodable>(
        _ path: String,
        method: String = "GET",
        body: [String: Any]? = nil,
        token: String? = nil,
        as type: T.Type
    ) async throws -> T {
        let data = try await raw(path, method: method, body: body, token: token)
        if data.isEmpty, let empty = Empty() as? T { return empty }
        return try decoder.decode(T.self, from: data)
    }

    @discardableResult
    func raw(
        _ path: String,
        method: String = "GET",
        body: [String: Any]? = nil,
        token: String? = nil
    ) async throws -> Data {
        /* Не appendingPathComponent: он считает весь аргумент именем
           сегмента и кодирует «?» как часть пути. Запрос уходил на
           /summary%3Fperiod=today и возвращал 404 — сборка при этом
           проходила, и увидеть это можно было только запустив. */
        guard let url = URL(string: path, relativeTo: base) else {
            throw APIError(status: 0, code: nil, retryAfter: nil)
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        /* Язык интерфейса — тем же заголовком, каким его шлёт любой
           браузер. Сервер отвечает на нём там, где слова собирает он:
           заводские термины ниши («мойщик», «машина»), поводы для
           колокольчика, шапка выгрузки. Токен при этом не трогается —
           язык меняют в настройках, а не перевходом. */
        request.setValue(LangStore.currentLang.rawValue, forHTTPHeaderField: "Accept-Language")
        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch let error as URLError where error.code == .cancelled {
            /* Отмена — НЕ отсутствие связи.
               SwiftUI снимает задачу `refreshable`, и запрос обрывается на
               полпути. Раньше это приходило сюда наравне с обрывом сети и
               превращалось в «Կապ չկա» — экран сообщал о поломке там, где
               ничего не сломалось: каждое потягивание вниз в сводке давало
               ошибку. Отмену обязан обрабатывать тот, кто её вызвал. */
            throw CancellationError()
        } catch is CancellationError {
            throw CancellationError()
        } catch let error as URLError {
            /* Отличаем «сети нет» от «сервер ответил плохо»: в первом
               случае запись ждёт в очереди, во втором ждать нечего.
               Код URLError кладём в `code` — без него все сетевые беды
               выглядели одинаково, и разобрать их было нечем. */
            throw APIError(status: 0, code: "URL \(error.code.rawValue)", retryAfter: nil)
        } catch {
            throw APIError(status: 0, code: nil, retryAfter: nil)
        }

        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            throw APIError(
                status: status,
                code: json?["error"] as? String,
                retryAfter: json?["retryAfter"] as? Int,
                challengeId: json?["challengeId"] as? String,
                maskedPhone: json?["phone"] as? String,
                reason: json?["reason"] as? String
            )
        }
        return data
    }

    struct Empty: Decodable {}
}

extension ISO8601DateFormatter {
    static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    static let plain = ISO8601DateFormatter()
}

extension Array {
    /// Обращение по номеру, которого может не быть.
    ///
    /// Нужно там, где список приходит с сервера и короче ожидаемого:
    /// владелец добавил четвёртый класс, а цены в услуге пока на три.
    /// Падение приложения из-за этого недопустимо.
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
