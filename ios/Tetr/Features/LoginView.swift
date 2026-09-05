import SwiftUI

/**
 * Вход.
 *
 * ОДНО ПОЛЕ ЛОГИНА, А НЕ ВЫБОР РОЛИ.
 *
 * Раньше экран первым делом спрашивал, кто пришёл: у владельца и у
 * мойщика были разные двери и разный состав полей. Теперь дверь одна.
 * Логин у владельца — почта, у сотрудника — телефон, и какой перед нами,
 * решает сервер, а не человек и не приложение. Спрашивать роль стало не
 * за чем: от неё больше ничего не зависит.
 *
 * КОДОВ ИЗ SMS БОЛЬШЕ НЕТ. Не из моды: армянский оператор перестал
 * пропускать буквенного отправителя молча — квитанция о доставке
 * приходила, сообщение до трубки не доходило. Вход, который держится на
 * чужом усмотрении, не вход. Вместе с SMS ушли шаги «введите код»,
 * «повторить отправку» и «придумайте ПИН»: их место заняла ссылка в
 * письме, а ссылка это не шаг разговора, а уход и возвращение.
 *
 * ПОЧЕМУ ССЫЛКУ ОТКРЫВАЕТ БРАУЗЕР. Подтверждение почты и новый пароль
 * живут на вебе. Тащить их в приложение незачем: письмо и так открывают
 * почтовым клиентом, то есть браузером, и человек уже там. Приложению
 * остаётся сказать «проверьте почту» и ждать, когда он вернётся.
 *
 * ЧЕТЫРЕ СОСТОЯНИЯ, ОДНА ФОРМА. Вход, восстановление, регистрация и
 * «письмо ушло» — это одна и та же колонка с разным набором частей, а не
 * четыре экрана. Разными экранами каждая смена шага стоила бы полной
 * пересборки, и клавиатура схлопывалась бы на каждом переходе.
 *
 * ── ПРО КЛАВИАТУРУ И ПЕРЕСБОРКУ ЭКРАНА ──
 *
 * Форма собрана ОДНИМ плоским столбцом, где каждая часть стоит под своим
 * `if`. Раньше здесь был `switch stage`, и каждая ветка рисовала СВОЁ
 * поле: для SwiftUI это разные виды, и переход между шагами уничтожал
 * поле вместе с его первым ответчиком. Клавиатура успевала открыться и
 * тут же схлопывалась, набранное стиралось. Поле логина объявлено здесь
 * ровно один раз и переживает любую смену состояния — с текстом, фокусом
 * и открытой клавиатурой.
 *
 * В покое форма оптически центрируется в свободном месте под шапкой. Не
 * `Spacer`ами, которые пересобирали раскладку при каждом изменении высоты,
 * а рамкой высотой с видимую область `ScrollView`. Как только поле получает
 * фокус, та же рамка выравнивает форму наверх: клавиатура открывается без
 * прыжка, а содержимое остаётся прокручиваемым на маленьком экране и при
 * крупном системном шрифте.
 *
 * ПРО ПРАВИЛА МАГАЗИНА. 3.1.3(f) разрешает бесплатное
 * приложение-компаньон к платному веб-сервису ровно при двух условиях:
 * внутри ничего не продаётся и наружу платить не зовут. Регистрация
 * покупкой не является и под запрет не подпадает. Ни здесь, ни на стене
 * «срок вышел» нет ни цены, ни срока, ни ссылки на оплату, и добавлять их
 * сюда нельзя.
 */
struct LoginView: View {
    @EnvironmentObject private var session: Session
    @EnvironmentObject private var lock: BiometricLock
    @EnvironmentObject private var lang: LangStore

    /// Почта владельца или телефон сотрудника — одной строкой.
    @State private var login = LoginView.prefilled("TETR_LOGIN")
    @State private var password = LoginView.prefilled("TETR_PASSWORD")
    /// Показывать ли пароль. Мойщику диктуют пароль вслух, и набрать его
    /// вслепую с чужого голоса — верный способ ошибиться трижды подряд.
    @State private var shown = false

    /// Регистрация и восстановление: адрес, на который уйдёт письмо.
    @State private var email = ""
    @State private var businessName = ""
    /// Код страны нужен телефонному логину сотрудника: он набирает
    /// национальную часть, а сверяет сервер по E.164.
    @State private var country = Countries.default

    @State private var stage: Stage = .entry
    @State private var error: String?
    @State private var busy = false
    /// Человек попросил другой аккаунт: сохранённый профиль больше не
    /// показываем до следующего запуска.
    @State private var manual = false

    @FocusState private var focus: Field?

    private enum Field { case login, password, email, businessName }

    /// Что сейчас на экране.
    private enum Stage: Equatable {
        /// логин и пароль
        case entry
        /// забыл пароль: почта, чтобы выслать ссылку
        case reset
        /// новая мойка: название, имя, почта, пароль, телефон, валюта
        case register
        /// письмо ушло на этот адрес; дальше человек идёт в почту
        case sent(String)
    }

    /**
     * Предзаполнение формы для проверки на локальном сервере.
     *
     * Только в отладочной сборке и только из переменных запуска — рядом с
     * `TETR_API`. Причина та же: без этого приложение проверяется лишь на
     * боевом сервере, то есть на живых клиентах.
     *
     *     SIMCTL_CHILD_TETR_API=http://localhost:3100/api/v1/ \
     *     SIMCTL_CHILD_TETR_LOGIN=sevak@tetrin.pro SIMCTL_CHILD_TETR_PASSWORD=parol \
     *       xcrun simctl launch <udid> com.sevarm.tetr
     */
    private static func prefilled(_ key: String) -> String {
        #if DEBUG
        return ProcessInfo.processInfo.environment[key] ?? ""
        #else
        return ""
        #endif
    }


    // ══════════════════════════ полотно ══════════════════════════

    /**
     * КАК СОБРАН КАДР.
     *
     * Полотно то же, что на заставке и в знакомстве: глубокий грейп и свет
     * из центра. Экран входа открывается сразу после них, и смена света
     * читалась бы сменой приложения. Снизу добавлен слабый лаймовый
     * отсвет — он от кнопки, а не от неба, и подсказывает, где действие.
     * Поверх лежит зерно: ровная заливка на телефоне выглядит пластиком,
     * зерно делает её бумагой.
     *
     * Форма стоит в стеклянной карточке, а не рассыпана коробками по
     * фону. Карточка одна, поля в ней строками через волосяную линию:
     * так вход читается одним предметом, а не списком требований.
     *
     * За карточку держится маскот — тот же плюшевый робот, что на
     * витрине выглядывает из-за края экрана. Кромки в картинке нет, руки
     * держатся за то, что нарисует раскладка, и верхний край карточки
     * подходит для этого лучше любого другого места. Он выезжает из-за
     * карточки на появлении и ПРЯЧЕТСЯ, когда человек набирает пароль:
     * пароль набирают при чужих, и робот, который на него не смотрит,
     * говорит это без слов. Если пароль показали глазом, он выглядывает
     * обратно с прищуром: раз показали, можно и посмотреть.
     */

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Маскот уже поднялся из-за карточки. Взводится после первого кадра,
    /// чтобы подъём был виден, а не случился до появления экрана.
    @State private var risen = false

    var body: some View {
        ZStack {
            backdrop
                .contentShape(Rectangle())
                // Свободный фон — естественная кнопка «готово» для
                // цифровой клавиатуры, на которой своей кнопки нет.
                .onTapGesture { move(to: nil) }

            #if DEBUG
            /* Адрес отладочной сборки — у нижнего края и только в DEBUG.
               Без него «нет связи» на телефоне неотличимо от «сервер не
               поднят», а чаще всего значит третье: приложение открыли с
               домашнего экрана, и переменной с адресом в процессе нет.
               Магазинной сборки это не касается вовсе. */
            VStack {
                Spacer()
                Text(APIClient.debugAddress)
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(.white.opacity(0.35))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .padding(.bottom, 4)
            }
            .allowsHitTesting(false)
            #endif

            /* Центрирование в покое, верх при вводе.
             *
             * `GeometryReader` знает ровно ту высоту, которую шапка и
             * клавиатура оставили форме. Пока фокуса нет, короткая форма
             * стоит посередине этой области. При первом касании поля она
             * выравнивается наверх и перестаёт спорить за место с
             * клавиатурой.
             *
             * `basedOnSize` гасит резину, когда содержимое и так влезло:
             * форма, которую можно оттянуть вниз просто так, читается
             * недогруженной страницей. */
            VStack(spacing: 0) {
                /* Марка и язык НЕ прокручиваются: это шапка экрана, а не
                   часть формы. У марки и заголовка общий левый край. */
                HStack(alignment: .center) {
                    Wordmark(size: 19)
                    Spacer(minLength: 0)
                    languagePicker
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 12)

                GeometryReader { viewport in
                    ScrollView {
                        ZStack(alignment: focus == nil ? .center : .top) {
                            /* `ScrollView` лежит поверх фона на всю
                               свободную область, поэтому одно касание на
                               фоне не поймает пустоту внутри него. Этот
                               прозрачный слой ловит именно пустое место;
                               поля и кнопки стоят выше и получают свои
                               касания как прежде. */
                            Color.clear
                                .contentShape(Rectangle())
                                .onTapGesture { move(to: nil) }

                            form
                                .padding(.horizontal, 20)
                                /* Оптический центр выше геометрического:
                                   лишний нижний отступ в покое поднимает
                                   столбец на свою половину. При вводе и на
                                   длинной регистрации он уходит: там место
                                   над клавиатурой дороже воздуха. */
                                .padding(.bottom, focus == nil && stage != .register ? 96 : 24)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: viewport.size.height)
                        .animation(.snappy(duration: 0.32), value: focus)
                    }
                    .scrollBounceBehavior(.basedOnSize)
                    /* Клавиатура уходит по протяжке вниз, а не только по
                       нажатию на свободный фон. */
                    .scrollDismissesKeyboard(.interactively)
                    .defaultScrollAnchor(.top)
                    /* За низ держимся ТОЛЬКО пока идёт ввод: там коробку
                       ужимает клавиатура, и главное действие должно
                       остаться прямо над ней. При смене шага фокуса нет,
                       и открывшийся экран не должен выглядеть уже
                       прокрученным. */
                    .defaultScrollAnchor(focus == nil ? .top : .bottom, for: .sizeChanges)
                }
            }
        }
        .onAppear {
            if session.rememberedAccount == nil { manual = true }
            adoptPendingLogin()
        }
        .task {
            /* Подъём маскота через мгновение после первого кадра: так
               экран сначала стоит, потом на нём что-то происходит. */
            try? await Task.sleep(for: .milliseconds(160))
            risen = true
        }
        /* Ссылка могла прийти, когда экран уже открыт: человек ушёл в
           почту из этого же приложения и вернулся сюда же. */
        .onChange(of: session.pendingLogin) { _, _ in adoptPendingLogin() }
        // Экран стоит на грейпе, и он тёмный при любой теме телефона:
        // иначе строка состояния становится чёрной на тёмно-фиолетовом
        .preferredColorScheme(.dark)
    }

    /**
     * Полотно.
     *
     * Свет из центра тот же, что на заставке (`Brand.splashGlow`).
     * Лаймовый отсвет снизу слабее десятой доли: он должен читаться как
     * тепло от кнопки, а не как второй источник света.
     */
    private var backdrop: some View {
        ZStack {
            Brand.grapeDeep
            Brand.splashGlow
            RadialGradient(
                colors: [Brand.lime.opacity(0.14), Brand.lime.opacity(0)],
                center: UnitPoint(x: 0.5, y: 1.06),
                startRadius: 0,
                endRadius: 420
            )
            Grain()
        }
        .ignoresSafeArea()
    }

    /**
     * Язык — прямо на экране входа.
     *
     * Раньше сменить его можно было только в профиле, то есть уже
     * ВНУТРИ, и это была ловушка: человек, которому завели аккаунт, а
     * по-армянски он не читает, видел незнакомые слова ровно там, где от
     * него требуется действие, и до профиля добраться не мог.
     *
     * Значком, а не строкой: главных органов на экране и так три —
     * карточка, поля и кнопка. Каждый язык подписан своим словом, флагов
     * нет: флаг это страна, а не язык.
     */
    private var languagePicker: some View {
        Menu {
            Picker(L("common.language"), selection: Binding(
                get: { lang.current },
                set: { lang.set($0) }
            )) {
                ForEach(Lang.allCases, id: \.self) { option in
                    Text(option.ownName).tag(option)
                }
            }
            .pickerStyle(.inline)
        } label: {
            Image(systemName: "globe")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.white.opacity(0.86))
                .frame(width: 40, height: 40)
                .glassEffect(.regular, in: .rect(cornerRadius: 13, style: .continuous))
        }
        .accessibilityLabel(L("common.language"))
        .accessibilityValue(lang.current.ownName)
    }

    // ══════════════════════════ форма ══════════════════════════

    /**
     * Один плоский столбец на все состояния.
     *
     * Не `switch` по шагу и не отдельный вид на каждое состояние: части
     * появляются и уходят по своим условиям, а те, что остаются, остаются
     * ТЕМИ ЖЕ. Поле логина объявлено ровно один раз и переживает переход
     * к восстановлению и обратно — с текстом, фокусом и клавиатурой.
     */
    @ViewBuilder
    private var form: some View {
        if let account = session.rememberedAccount, lock.quickSignIn, !manual, stage == .entry {
            remembered(account)
        } else {
            VStack(alignment: .leading, spacing: 0) {
                Text(headline)
                    .font(.system(size: 36, weight: .bold))
                    .foregroundStyle(.white)
                    .tracking(-0.8)
                    .fixedSize(horizontal: false, vertical: true)

                if let subhead {
                    Text(subhead)
                        .font(.system(size: 15))
                        .foregroundStyle(.white.opacity(0.66))
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 8)
                }

                sheet
                    .padding(.top, 26)

                if stage == .register {
                    /* Зачем адрес и какой пароль — одной сноской под
                       карточкой, а не под каждым полем: сноска под
                       каждой строкой разрывала карточку на три. */
                    VStack(alignment: .leading, spacing: 4) {
                        Text(L("auth.registerEmailNote"))
                        Text(L("auth.passwordHint"))
                    }
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.5))
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 12)
                    .padding(.horizontal, 4)
                }

                errorLine

                primaryButton
                    .padding(.top, 22)
                    /* Кнопка светит на полотно. Гаснет вместе с ней:
                       погашенная кнопка со свечением читается включённой. */
                    .shadow(color: Brand.lime.opacity(primaryReady && !busy ? 0.3 : 0), radius: 26, y: 12)

                secondary

                if let helper {
                    Text(helper)
                        .font(.system(size: 13))
                        .foregroundStyle(.white.opacity(0.5))
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .multilineTextAlignment(.center)
                        .padding(.top, 14)
                }
            }
            /* Анимация — на состоянии, а не на каждом переходе руками.
               Так исчезновение старой части и появление новой считаются
               ОДНИМ движением, и высота столбца едет плавно вместо
               двух рывков подряд. */
            .animation(.snappy(duration: 0.28), value: stage)
            .animation(.easeOut(duration: Motion.fast), value: error)
        }
    }

    // ══════════════════════ подписи ══════════════════════

    private var headline: String {
        switch stage {
        case .entry: return L("auth.entryTitle")
        case .reset: return L("auth.resetPasswordTitle")
        case .register: return L("auth.signUpTitle")
        case .sent: return L("auth.sentTitle")
        }
    }

    private var subhead: String? {
        switch stage {
        case .entry: return L("auth.signInSub")
        case .reset: return L("auth.resetPasswordSub")
        case .register: return L("auth.signUpSub")
        /* Адрес стоит в карточке строкой с конвертом, а не подзаголовком. */
        case .sent: return nil
        }
    }

    /// Строка под кнопкой. На входе объясняет, чем входит владелец и чем
    /// сотрудник: без неё мойщик набирает почту, которой у него нет.
    private var helper: String? {
        switch stage {
        case .entry: return L("auth.loginHint")
        case .sent: return L("auth.sentNote")
        default: return nil
        }
    }

    // ══════════════════════ карточка и маскот ══════════════════════

    private enum Mascot {
        /// Ширина фигуры. Одна на покой и на ввод, и это не лень: пока
        /// размер зависел от фокуса, рамка робота ехала своей пружиной, а
        /// карточка своей, и на треть секунды он висел поверх стекла.
        /// Обе картинки одной пропорции, поэтому смена прищура на широкие
        /// глаза не меняет ни размера, ни места.
        static let width: CGFloat = 148
        static let ratio: CGFloat = 900.0 / 631.0
        static var height: CGFloat { width / ratio }
        /// На сколько пальцы заходят на карточку. Столько же, сколько на
        /// витрине: девять точек, и кромка оказывается под ладонью.
        static let overlap: CGFloat = 9
    }

    /// Робот прячется, пока набирают скрытый пароль.
    private var mascotHidden: Bool { focus == .password && !shown }

    /// Прищур — когда пароль показали и всё ещё набирают. Имена файлов те
    /// же, что на витрине: `grip` смотрит широко, `peek` щурится.
    private var mascotArt: String { focus == .password && shown ? "peek.png" : "grip.png" }

    /**
     * Карточка с маскотом над ней.
     *
     * Маскот стоит в стопке ПЕРЕД карточкой с отрицательным нижним
     * полем: раскладка отдаёт карточке место сразу под его рамкой, а
     * пальцы, нарисованные ниже рамки, ложатся на её кромку. `zIndex`
     * держит его поверх карточки, иначе кромка перекрыла бы руки.
     */
    private var sheet: some View {
        VStack(alignment: .trailing, spacing: 0) {
            mascot
                .padding(.trailing, 22)
                .padding(.bottom, -Mascot.overlap)
                .zIndex(1)

            card
        }
    }

    /// Робот на виду: поднялся и не прячется от пароля.
    private var visible: Bool { risen && !mascotHidden }

    private var mascot: some View {
        /* Порядок модификаторов здесь и есть починка. Пружины стоят на
           картинке со смещением и НЕ дотягиваются до рамки: рамка
           принадлежит раскладке и едет вместе с карточкой в одной
           транзакции, а вверх-вниз внутри рамки робот ходит своим ходом.
           Стоило повесить пружину снаружи рамки, и она подхватывала
           всё, что менялось вместе с фокусом, включая место робота на
           экране. */
        ZStack(alignment: .bottom) {
            if let art = UIImage(named: mascotArt) {
                Image(uiImage: art)
                    .resizable()
                    .scaledToFit()
                    .id(mascotArt)
                    .transition(.opacity)
            }
        }
        .offset(y: visible ? 0 : Mascot.height + Mascot.overlap + 2)
        .animation(
            reduceMotion ? nil : .spring(response: 0.52, dampingFraction: 0.86),
            value: risen
        )
        .animation(
            reduceMotion ? nil : .spring(response: 0.42, dampingFraction: 0.84),
            value: mascotHidden
        )
        .animation(.easeOut(duration: Motion.normal), value: mascotArt)
        .frame(width: Mascot.width, height: Mascot.height)
        /* Маска, а не `clipped()`, и высота у неё живая.
         *
         * Рамка робота заходит на карточку на глубину пальцев, и обрезка
         * по рамке режет его линией НИЖЕ кромки: при спуске он тонул в
         * стекло, а не уходил за него. Поэтому пока он выглядывает, маска
         * во всю рамку и пальцы лежат на кромке; как только он прячется,
         * маска за один короткий такт поджимается к самой кромке, и
         * дальше он уходит ровно за неё. Вверх маска раскрывается с
         * задержкой на длину пружины: пока робот едет, линия стоит на
         * кромке, и только когда он доехал, пальцы ложатся поверх. */
        .mask(alignment: .top) {
            Rectangle()
                .frame(height: visible ? Mascot.height : Mascot.height - Mascot.overlap)
                .animation(
                    visible
                        ? .easeOut(duration: Motion.instant).delay(0.34)
                        : .easeOut(duration: Motion.instant),
                    value: visible
                )
        }
        .accessibilityHidden(true)
    }

    /**
     * Стеклянная карточка формы.
     *
     * Строки внутри — по одной на поле, через волосяную линию, как в
     * системных настройках: рука знает этот предмет и попадает по нему
     * не глядя. Набор строк зависит от шага, а строки логина и пароля
     * объявлены по одному разу.
     */
    private var card: some View {
        VStack(spacing: 0) {
            if stage == .entry {
                loginRow
                hairline
                passwordRow(title: L("auth.passwordLabel"), fresh: false)
            }

            if stage == .reset {
                emailRow(title: L("auth.emailLabel"), last: true)
            }

            if stage == .register {
                businessRow
                hairline
                emailRow(title: L("auth.registerEmail"), last: false)
                hairline
                passwordRow(title: L("auth.registerPassword"), fresh: true)
            }

            if case .sent(let address) = stage {
                row(icon: "envelope.open.fill", title: L("auth.emailLabel"), lit: true) {
                    Text(address)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
            }
        }
        .glassEffect(.regular, in: .rect(cornerRadius: 26, style: .continuous))
        .overlay(
            /* Блик по кромке: сверху светлее, снизу гаснет. Это то, что
               делает стекло стеклом, а не серой плашкой. */
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .strokeBorder(
                    LinearGradient(
                        colors: [.white.opacity(0.32), .white.opacity(0.06)],
                        startPoint: .top,
                        endPoint: .bottom
                    ),
                    lineWidth: 1
                )
        )
        .shadow(color: Brand.grapeDeep.opacity(0.55), radius: 30, y: 18)
    }

    private var hairline: some View {
        Rectangle()
            .fill(.white.opacity(0.1))
            .frame(height: 1)
            .padding(.leading, 72)
    }

    // ══════════════════════ строки ══════════════════════

    private var loginRow: some View {
        row(icon: "person.fill", title: L("auth.loginLabel"), holds: .login, empty: login.isEmpty) {
            TextField("", text: $login)
                /* Ни заглавных, ни автоподстановки: почту телефон норовит
                   исправить на знакомое слово, а телефон — на дату. */
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.emailAddress)
                .textContentType(.username)
                .submitLabel(.next)
                .focused($focus, equals: .login)
                .onSubmit { move(to: .password) }
                .accessibilityIdentifier("login.login")
                .accessibilityLabel(L("auth.loginLabel"))
        }
    }

    /**
     * Пароль с глазом.
     *
     * Два разных поля под одним `if`, а не `SecureField` с переключением
     * `isSecureTextEntry`: SwiftUI пересоздаёт вид при смене типа, и без
     * общего `id` каретка прыгала в начало, а набранное иногда стиралось
     * целиком. Общий идентификатор говорит движку, что это одна вещь.
     *
     * `fresh` — это регистрация: поле называется «придумайте», подсказка
     * клавиатуре `newPassword`, и по «готово» ничего не отправляется.
     */
    private func passwordRow(title: String, fresh: Bool) -> some View {
        row(icon: "lock.fill", title: title, holds: .password, empty: password.isEmpty, trailing: AnyView(eye)) {
            Group {
                if shown {
                    TextField("", text: $password)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } else {
                    SecureField("", text: $password)
                }
            }
            .textContentType(fresh ? .newPassword : .password)
            .submitLabel(fresh ? .done : .go)
            .focused($focus, equals: .password)
            .onSubmit { if !fresh { Task { await runPrimary() } } }
            .accessibilityIdentifier(fresh ? "login.newPassword" : "login.password")
            .accessibilityLabel(title)
            .id("login.password.box")
        }
    }

    /// Глаз. Мойщику диктуют пароль вслух, и набрать его вслепую с чужого
    /// голоса — верный способ ошибиться трижды подряд.
    private var eye: some View {
        Button {
            /* Смена скрытого поля на открытое пересоздаёт первый ответчик,
               и фокус падает вместе с клавиатурой, хотя `id` у них общий.
               Возвращаем его следующим тактом: человек нажал глаз, чтобы
               ПРОВЕРИТЬ набранное и продолжить, а не чтобы закончить. */
            let typing = focus == .password
            shown.toggle()
            if typing {
                DispatchQueue.main.async { move(to: .password) }
            }
        } label: {
            Image(systemName: shown ? "eye.slash" : "eye")
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(.white.opacity(0.62))
                .frame(width: 44, height: 44)
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L(shown ? "auth.hidePassword" : "auth.showPassword"))
    }

    private func emailRow(title: String, last: Bool) -> some View {
        row(icon: "envelope.fill", title: title, holds: .email, empty: email.isEmpty) {
            TextField("", text: $email)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.emailAddress)
                .textContentType(.emailAddress)
                .submitLabel(last ? .go : .next)
                .focused($focus, equals: .email)
                .onSubmit {
                    if last { Task { await runPrimary() } } else { move(to: .password) }
                }
                .accessibilityIdentifier(last ? "login.email" : "login.registerEmail")
                .accessibilityLabel(title)
        }
    }

    /**
     * Регистрация: три поля и ни одного лишнего.
     *
     * Раньше их было шесть, и это была анкета. Причина не в красоте: до
     * перехода по ссылке из письма НЕ СОЗДАЁТСЯ НИЧЕГО. Всё, что человек
     * набрал, час лежит в заявке и пропадает, если он до почты не дошёл.
     * Осталось то, чем он будет входить, и то, без чего мойку не назвать.
     */
    private var businessRow: some View {
        row(icon: "building.2.fill", title: L("onboarding.bizName"), holds: .businessName, empty: businessName.isEmpty) {
            TextField("", text: $businessName)
                .textContentType(.organizationName)
                .autocorrectionDisabled()
                .submitLabel(.next)
                .focused($focus, equals: .businessName)
                .onSubmit { move(to: .email) }
                .accessibilityIdentifier("login.businessName")
                .accessibilityLabel(L("onboarding.bizName"))
        }
    }

    /**
     * Строка карточки: значок в плитке, подпись, поле.
     *
     * Строка сама ловит касание. SwiftUI отдаёт `TextField` ровно ту
     * площадь, которую занимает набранный текст: у пустого поля это
     * несколько точек возле каретки. Человек бил в строку и не понимал,
     * почему клавиатура не появляется. Цель теперь во всю строку, то есть
     * выше сорока четырёх точек, как и требует система.
     *
     * Фокус подсвечивает плитку лаймом, а не рамку: рамки у строки нет,
     * а зажечь значок — это сказать «сюда пишут» одним пятном.
     */
    @ViewBuilder
    private func row<Content: View>(
        icon: String,
        title: String,
        holds: Field? = nil,
        lit forced: Bool = false,
        /* Пустое ли поле. Пока оно пустое и без фокуса, подпись стоит в
           нём самом крупно, как подсказка; при касании или с первым
           знаком поднимается над ним мелкой. Так в пустой строке нет
           провала под подписью, а в заполненной подпись не теряется. */
        empty: Bool = false,
        trailing: AnyView? = nil,
        @ViewBuilder content: () -> Content
    ) -> some View {
        let lit = forced || (holds != nil && focus == holds)
        let raised = lit || !empty

        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(lit ? Brand.onLime : .white.opacity(0.82))
                .frame(width: 40, height: 40)
                .background(
                    lit ? Brand.lime : .white.opacity(0.1),
                    in: .rect(cornerRadius: 12, style: .continuous)
                )

            ZStack(alignment: .leading) {
                /* Подсказка в поле: крупная, пока поле пустое и спит. */
                Text(title)
                    .font(.system(size: 17, weight: .medium))
                    .foregroundStyle(.white.opacity(0.5))
                    .lineLimit(1)
                    .opacity(raised ? 0 : 1)
                    .offset(y: raised ? -10 : 0)

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(lit ? Brand.lime : .white.opacity(0.58))
                        .lineLimit(1)
                        .opacity(raised ? 1 : 0)
                        .offset(y: raised ? 0 : 8)

                    content()
                        .font(.system(size: 17, weight: .medium))
                        .foregroundStyle(.white)
                        .tint(Brand.lime)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .opacity(raised ? 1 : 0)
                }
            }

            if let trailing {
                trailing
            }
        }
        .padding(.leading, 16)
        .padding(.trailing, trailing == nil ? 16 : 6)
        .padding(.vertical, 13)
        .contentShape(Rectangle())
        .onTapGesture { if let holds { move(to: holds) } }
        .animation(.easeOut(duration: Motion.fast), value: lit)
        /* Подпись меняет место за один короткий такт: при более долгом
           перекрёстном затухании обе надписи успевали стоять друг на
           друге, и это читалось задвоением, а не движением. */
        .animation(.easeOut(duration: Motion.instant), value: raised)
    }

    // ══════════════════════ сохранённый вход ══════════════════════

    private func remembered(_ account: RememberedAccount) -> some View {
        let tone = Brand.personTone(account.name)

        return VStack(spacing: 15) {

            Button {
                Task { await quickSubmit(account) }
            } label: {
                ZStack {
                    Circle()
                        .fill(tone.base)
                        .overlay {
                            Circle()
                                .strokeBorder(.white.opacity(0.22), lineWidth: 1)
                        }
                    Text(String(account.name.prefix(1)))
                        .font(.system(size: 34, weight: .bold))
                        .foregroundStyle(.white)
                }
                .frame(width: 92, height: 92)
                .shadow(color: tone.glow.opacity(0.28), radius: 24, y: 12)
                .scaleEffect(busy ? 0.96 : 1)
                .animation(.easeOut(duration: Motion.fast), value: busy)
            }
            .buttonStyle(.plain)
            .disabled(busy)
            .accessibilityLabel(L("auth.signInAs", account.name))

            VStack(spacing: 3) {
                Text(account.name)
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(.white)
                Text(account.tenant)
                    .font(.system(size: 13))
                    .foregroundStyle(.white.opacity(0.6))
            }

            if busy {
                TetrLoader(size: 22, tint: Brand.lime)
            } else {
                Text(L("auth.tapAvatarPhone"))
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.white.opacity(0.55))
            }

            if let error {
                Text(error)
                    .font(.system(size: 13))
                    .foregroundStyle(Brand.lime)
                    .multilineTextAlignment(.center)
            }

            quiet(L("auth.anotherAccount")) {
                withAnimation(.snappy(duration: 0.28)) { manual = true }
            }
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity)
    }

    // ══════════════════════ мелочи ══════════════════════

    @ViewBuilder
    private var errorLine: some View {
        if let error {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Image(systemName: "exclamationmark.circle.fill")
                    .font(.system(size: 13, weight: .semibold))
                Text(error)
                    .font(.system(size: 14))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .foregroundStyle(Brand.lime)
            .padding(.top, 14)
            .padding(.horizontal, 4)
        }
    }

    /**
     * Тихие выходы под кнопкой.
     *
     * Надписью, а не второй заливкой: главное действие на экране одно, и
     * спорить с ним второй кнопкой нельзя. Но площадь у надписи своя, в
     * сорок четыре точки: в двадцати точках выше стоит кнопка высотой в
     * палец, и палец, нацеленный в «забыли пароль», попадал в «войти».
     */
    private func quiet(_ title: String, run: @escaping () -> Void) -> some View {
        Button(action: run) {
            Text(title)
                .font(.system(size: 14, weight: .semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .foregroundStyle(.white.opacity(0.8))
                .padding(.horizontal, 10)
                .frame(height: 44)
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .disabled(busy)
    }
    // ══════════════════════ действия ══════════════════════

    /**
     * Главное действие. Одно на все состояния, и это не экономия строк:
     * пока кнопка на экране одна и стоит на одном месте, человек не ищет
     * её заново на каждом шаге.
     */
    private var primaryButton: some View {
        Button(primaryTitle) {
            Task { await runPrimary() }
        }
        .accessibilityIdentifier(primaryIdentifier)
        .buttonStyle(LimeButton(loading: busy, busyTitle: primaryBusyTitle))
        .disabled(busy || !primaryReady)
        /* Пока форма не заполнена, кнопка стоит серым стеклом, а не
           притушенным лаймом: лайм на половине яркости читается болотом,
           а не «нельзя». Заполнили — она загорается. */
        .grayscale(primaryReady ? 0 : 1)
        .opacity(primaryReady ? 1 : 0.38)
        .animation(.easeOut(duration: Motion.normal), value: primaryReady)
    }

    private var primaryBusyTitle: String {
        switch stage {
        case .entry: return L("auth.signingIn")
        case .reset: return L("auth.sending")
        case .register: return L("common.saving")
        /* Кнопка на этом шаге уводит обратно на вход и никуда не
           обращается: занятой она не бывает. */
        case .sent: return L("common.loadingShort")
        }
    }

    private var primaryTitle: String {
        switch stage {
        case .entry: return L("auth.signIn")
        case .reset: return L("auth.resetPasswordSend")
        case .register: return L("auth.signUp")
        case .sent: return L("auth.backToSignIn")
        }
    }

    /// Имя для UI-тестов. Разное у разных дел: тест, который ищет одну
    /// кнопку на все шаги, проходит и там, где шаг не тот.
    private var primaryIdentifier: String {
        switch stage {
        case .entry: return "login.submit"
        case .reset: return "login.reset"
        case .register: return "login.create"
        case .sent: return "login.backToSignIn"
        }
    }

    private var primaryReady: Bool {
        switch stage {
        case .entry:
            return !login.trimmed.isEmpty && !password.isEmpty
        case .reset:
            return !email.trimmed.isEmpty
        case .register:
            /* Длину пароля и вид почты проверяет сервер — он же и
               отвечает за правило. Здесь гасим кнопку только там, где
               поле пустое: ругаться на четвёртом знаке пароля значит
               ругаться на человека, который ещё печатает. */
            return businessName.trimmed.count >= 2
                && !email.trimmed.isEmpty
                && !password.isEmpty
        case .sent:
            return true
        }
    }

    private func runPrimary() async {
        switch stage {
        case .entry: await submit()
        case .reset: await sendResetLink()
        case .register: await createBusiness()
        case .sent:
            password = ""
            go(.entry)
        }
    }

    /**
     * Тихие выходы под кнопкой.
     *
     * Строкой, а не второй заливкой: главное действие на экране одно, и
     * спорить с ним второй лаймовой кнопкой нельзя. Но и голой надписью
     * они быть не могут — у надписи живой площади высота строки, а в
     * двадцати точках выше стоит кнопка высотой в палец, и палец,
     * нацеленный в «забыли пароль», попадал в «войти». Поэтому у каждой
     * своя площадь в сорок четыре точки и слабая подложка, которая
     * говорит «это тоже кнопка».
     */
    @ViewBuilder
    private var secondary: some View {
        switch stage {
        case .entry:
            HStack(spacing: 2) {
                quiet(L("auth.forgotPassword")) {
                    error = nil
                    /* Почта переносится из логина: если владелец её уже
                       набрал, спрашивать второй раз незачем. Телефон
                       сотрудника сюда не годится — восстановление идёт
                       только почтой, — поэтому берём только с собакой. */
                    if login.contains("@") { email = login }
                    go(.reset)
                }
                Text("·")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.white.opacity(0.35))
                quiet(L("auth.noAccount")) {
                    error = nil
                    go(.register)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 10)

        case .reset, .register:
            quiet(L("auth.haveAccount")) {
                error = nil
                go(.entry)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 10)

        case .sent:
            EmptyView()
        }
    }

    // ══════════════════════ запросы ══════════════════════

    /**
     * Подставить логин, вернувшийся из браузера.
     *
     * Пароль намеренно не трогаем и фокус ставим на него: адрес человек
     * только что подтвердил, а пароль он придумал и помнит. Сохранённый
     * профиль убираем с дороги — он про другого человека, а этот пришёл
     * по своей ссылке.
     */
    private func adoptPendingLogin() {
        guard let arrived = session.pendingLogin else { return }
        session.pendingLogin = nil

        if !arrived.isEmpty { login = arrived }
        password = ""
        manual = true
        stage = .entry
        focus = .password
    }

    /**
     * Перенести фокус одной транзакцией.
     *
     * Смена фокуса двигает форму (центр или верх) и робота (выглянуть или
     * спрятаться). Пока фокус менялся голым присваиванием, форма
     * переезжала мгновенно, а робот ехал своей пружиной и на треть
     * секунды висел поверх карточки. Явная анимация даёт раскладке ту
     * же длительность, что и роботу, и они едут вместе.
     */
    private func move(to field: Field?) {
        withAnimation(.snappy(duration: 0.32)) { focus = field }
    }

    private func go(_ next: Stage) {
        withAnimation(.snappy(duration: 0.28)) {
            focus = nil
            stage = next
        }
    }

    private func submit() async {
        await run {
            try await session.signIn(
                login: login.trimmed,
                password: password,
                country: country.code
            )
        }
    }

    private func sendResetLink() async {
        let address = email.trimmed
        await run {
            try await session.requestPasswordReset(email: address)
            go(.sent(address))
        }
    }

    private func createBusiness() async {
        let address = email.trimmed
        await run {
            let accepted = try await session.signUp(
                /* Ниша у приложения одна: это Tetrin для моек, и
                   спрашивать её у человека, который скачал именно его,
                   значило бы спрашивать, туда ли он попал. */
                niche: "carwash",
                businessName: businessName.trimmed,
                email: address,
                password: password
            )
            password = ""
            go(.sent(accepted))
        }
    }

    /**
     * Сохранённый вход по лицу.
     *
     * Пароль здесь не участвует вовсе: в телефоне лежит сессия, а лицо
     * подтверждает, что телефон в руках хозяина. Отказ проверки —
     * не повод молчать: Face ID отказывает буднично (мокрое лицо, солнце
     * в камеру, нажали «Отмена»), и мойщик оставался бы перед экраном,
     * где единственная большая кнопка ничего не делает.
     */
    private func quickSubmit(_ account: RememberedAccount) async {
        busy = true
        error = nil
        defer { busy = false }

        /* Проверка обязательна и не зависит от настройки: сохранённый
           вход предлагается ТОЛЬКО при включённом быстром входе, а
           пускать по нажатию без лица значило бы отдать чужую кассу
           первому, кто взял телефон. */
        if lock.available {
            guard await lock.authenticate(reason: L("auth.signInAs", account.name)) else {
                fallBackToManual(account, why: L("lock.failed", lock.kindName))
                return
            }
        }

        do {
            try await session.resumeRemembered()
        } catch {
            fallBackToManual(account, why: L("auth.rememberedExpiredPin"))
        }
    }

    /// Сохранённый вход не сработал: открываем форму. Логин подставляем
    /// телефоном — им входит сотрудник, а он и есть главный пользователь
    /// быстрого входа. Владелец сотрёт и наберёт почту. Фокус не ставим:
    /// пусть сначала прочитает, почему его сюда вернули.
    private func fallBackToManual(_ account: RememberedAccount, why: String) {
        login = account.phone
        password = ""
        withAnimation(.snappy(duration: 0.28)) {
            manual = true
            stage = .entry
        }
        error = why
    }

    /// Общая обвязка запроса: занятость, гашение прежней ошибки, разбор.
    private func run(_ work: () async throws -> Void) async {
        busy = true
        error = nil
        defer { busy = false }

        do {
            try await work()
        } catch let e as APIError {
            error = message(for: e)
        } catch is CancellationError {
            // экран ушёл — жаловаться некому
        } catch {
            self.error = L("payroll.failed")
        }
    }

    private func message(for error: APIError) -> String {
        if error.isOffline { return L("errors.offline") }
        switch error.code {
        case "TOO_MANY_TRIES":
            let minutes = max(1, (error.retryAfter ?? 60) / 60)
            return Ln("auth.tooManyTries", minutes)
        case "WRONG_CREDENTIALS":
            return L("auth.wrongLogin")
        case "EMAIL_INVALID":
            return L("auth.emailInvalid")
        case "EMAIL_TAKEN":
            return L("auth.emailTaken")
        case "PHONE_INVALID":
            return L("errors.badPhone")
        case "PHONE_TAKEN":
            return L("auth.phoneTaken")
        case "PASSWORD_SHORT":
            return L("auth.passwordShort")
        case "PASSWORD_COMMON":
            return L("auth.passwordCommon")
        case "MAIL_FAILED":
            return L("auth.mailFailed")
        default:
            return L("payroll.failed")
        }
    }
}

private extension String {
    /// Пробелы по краям логина и почты — обычное дело после вставки из
    /// сообщения, и сервер такой адрес не узнает.
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}

/**
 * Зерно на полотне.
 *
 * Маленькая плитка белого шума с прозрачностью, замощённая на весь
 * экран и почти невидимая. Ровная заливка на телефоне выглядит
 * пластиком, зерно делает её бумагой. Плитка отдаётся системе в
 * масштабе 3, чтобы одно зерно было одним пикселем, а не тремя:
 * крупное зерно читается грязью.
 */
private struct Grain: View {
    private static let tile: UIImage? = {
        guard let raw = UIImage(named: "grain.png"), let cg = raw.cgImage else { return nil }
        return UIImage(cgImage: cg, scale: 3, orientation: .up)
    }()

    var body: some View {
        if let tile = Self.tile {
            Image(uiImage: tile)
                .resizable(resizingMode: .tile)
                .opacity(0.07)
                .blendMode(.plusLighter)
                .allowsHitTesting(false)
        }
    }
}
