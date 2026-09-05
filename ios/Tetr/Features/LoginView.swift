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
    @State private var ownerName = ""
    @State private var country = Countries.default
    /// Телефон владельца при регистрации: связь, а не вход.
    @State private var phone = ""
    /// Валюта новой мойки. Выбирается здесь и больше нигде: все суммы
    /// бизнеса лежат в ней, и сменить её потом значило бы объявить
    /// вчерашние двенадцать тысяч драм двенадцатью тысячами долларов.
    @State private var currency = "AMD"

    @State private var stage: Stage = .entry
    @State private var error: String?
    @State private var busy = false
    /// Человек попросил другой аккаунт: сохранённый профиль больше не
    /// показываем до следующего запуска.
    @State private var manual = false

    @FocusState private var focus: Field?

    private enum Field { case login, password, email, businessName, ownerName, phone }

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
     *     xcrun simctl launch <udid> com.sevarm.tetr \
     *       --setenv TETR_API http://localhost:3100/api/v1/ \
     *       --setenv TETR_LOGIN sevak@tetrin.pro --setenv TETR_PASSWORD parol
     */
    private static func prefilled(_ key: String) -> String {
        #if DEBUG
        return ProcessInfo.processInfo.environment[key] ?? ""
        #else
        return ""
        #endif
    }

    // ══════════════════════════ полотно ══════════════════════════

    // ══════════════════════════ полотно ══════════════════════════

    var body: some View {
        ZStack {
            Brand.heroGradient
                .ignoresSafeArea()
                .contentShape(Rectangle())
                // Свободный фон — естественная кнопка «готово» для
                // цифровой клавиатуры, на которой своей кнопки нет.
                .onTapGesture { focus = nil }

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
             * выравнивается наверх — туда, где раньше находилась всегда, —
             * и перестаёт спорить за место с клавиатурой.
             *
             * `basedOnSize` гасит резину, когда содержимое и так влезло:
             * форма, которую можно оттянуть вниз просто так, читается
             * недогруженной страницей. */
            VStack(spacing: 0) {
                /* Выбор языка НЕ прокручивается.
                 *
                 * Он остаётся у верхнего края и не участвует в композиции
                 * формы. Марка, наоборот, теперь принадлежит форме и стоит
                 * прямо над выбором роли — так у них общий левый край и
                 * нет случайного пустого провала между ними. */
                HStack(alignment: .center) {
                    Spacer(minLength: 0)
                    languagePicker
                }
                .padding(.horizontal, 24)
                .padding(.top, 10)
                .padding(.bottom, 18)

                GeometryReader { viewport in
                    ScrollView {
                        ZStack(alignment: focus == nil ? .center : .top) {
                            /* `ScrollView` лежит поверх градиента на всю
                               свободную область, поэтому одно касание на
                               градиенте не поймает пустоту внутри него.
                               Этот прозрачный слой ловит именно пустое
                               место; поля и кнопки стоят выше и получают
                               свои касания как прежде. */
                            Color.clear
                                .contentShape(Rectangle())
                                .onTapGesture { focus = nil }

                            VStack(alignment: .leading, spacing: 0) {
                                /* В покое марка завершает композицию над
                                   табами. При вводе она мягко сворачивается:
                                   форма занимает прежнюю верхнюю позицию и
                                   не теряет место над клавиатурой. Сам вид
                                   остаётся тем же — фокус поля не роняется. */
                                /* Марка уходит и при вводе, и на длинных
                                   формах. На регистрации полей шесть, и
                                   шестьдесят точек над ними — это ровно
                                   то, из-за чего первое поле оказывается
                                   за нижним краем. */
                                Wordmark(size: 18)
                                    .frame(height: showsMark ? nil : 0, alignment: .top)
                                    .opacity(showsMark ? 1 : 0)
                                    .padding(.bottom, showsMark ? 22 : 0)
                                    .clipped()

                                form
                            }
                                .padding(.horizontal, 24)
                                /* Оптический центр выше геометрического.
                                   Ровно по середине форма читается как
                                   сползшая: сверху над ней пустая шапка с
                                   одним глобусом, снизу вообще ничего, и
                                   глаз считает середину раньше, чем её
                                   отмеряет экран. Лишний нижний отступ в
                                   покое поднимает столбец на свою половину.
                                   При вводе он уходит: там рамка и так
                                   выравнивает форму по верху, и место над
                                   клавиатурой дороже воздуха под кнопкой. */
                                /* Воздух под кнопкой — только там, где
                                   форма и так короткая и стоит по центру.
                                   На регистрации он превращается в лишний
                                   экран прокрутки. */
                                .padding(.bottom, focus == nil && stage != .register ? 112 : 24)
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
                    /* Когда клавиатура меняет высоту коробки, держимся за
                       низ: главное действие остаётся доступно прямо над
                       ней. После закрытия рамка снова центрирует форму. */
                    .defaultScrollAnchor(.top)
                    /* За низ держимся ТОЛЬКО пока идёт ввод: там коробку
                       ужимает клавиатура, и главное действие должно
                       остаться прямо над ней. При смене шага фокуса нет,
                       и держаться за низ значит выбросить человека на
                       середину формы — заголовок и первое поле остаются
                       выше края, и открывшийся экран выглядит так, будто
                       его уже прокрутили. */
                    .defaultScrollAnchor(focus == nil ? .top : .bottom, for: .sizeChanges)
                }
            }
        }
        .onAppear {
            if session.rememberedAccount == nil { manual = true }
        }
        // Экран стоит на грейпе, и он тёмный при любой теме телефона:
        // иначе строка состояния становится чёрной на тёмно-фиолетовом
        .preferredColorScheme(.dark)
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
     * переключатель роли, поля и кнопка. Каждый язык подписан своим
     * словом, флагов нет: флаг это страна, а не язык.
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
                .foregroundStyle(.white.opacity(0.82))
                .frame(width: 40, height: 40)
                .background(.white.opacity(0.12), in: .circle)
                .overlay(Circle().strokeBorder(.white.opacity(0.16), lineWidth: 1))
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
                    .font(.system(size: 30, weight: .bold))
                    .foregroundStyle(.white)
                    .tracking(-0.35)
                    .fixedSize(horizontal: false, vertical: true)

                if let subhead {
                    Text(subhead)
                        .font(.system(size: 15))
                        .foregroundStyle(.white.opacity(0.68))
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 8)
                }

                if stage == .entry {
                    loginField.padding(.top, 24)
                    passwordField.padding(.top, 16)
                }

                if stage == .reset {
                    emailField.padding(.top, 24)
                }

                if stage == .register {
                    registerFields.padding(.top, 24)
                }

                errorLine

                primaryButton.padding(.top, 26)

                secondary

                if let helper {
                    Text(helper)
                        .font(.system(size: 13))
                        .foregroundStyle(.white.opacity(0.55))
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .multilineTextAlignment(.center)
                        .padding(.top, 18)
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

    /// Марка над формой. Уходит при вводе и на регистрации: там её место
    /// нужнее полям.
    private var showsMark: Bool { focus == nil && stage != .register }

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
        case .sent(let address): return address
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

    // ══════════════════════ поля ══════════════════════

    private var loginField: some View {
        field(title: L("auth.loginLabel"), holds: .login) {
            TextField("", text: $login)
                /* Ни заглавных, ни автоподстановки: почту телефон норовит
                   исправить на знакомое слово, а телефон — на дату. */
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.emailAddress)
                .textContentType(.username)
                .submitLabel(.next)
                .focused($focus, equals: .login)
                .onSubmit { focus = .password }
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
     */
    private var passwordField: some View {
        field(title: L("auth.passwordLabel"), holds: .password) {
            HStack(spacing: 10) {
                Group {
                    if shown {
                        TextField("", text: $password)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    } else {
                        SecureField("", text: $password)
                    }
                }
                .textContentType(.password)
                .submitLabel(.go)
                .focused($focus, equals: .password)
                .onSubmit { Task { await runPrimary() } }
                .accessibilityIdentifier("login.password")
                .accessibilityLabel(L("auth.passwordLabel"))
                .id("login.password.box")

                Button {
                    shown.toggle()
                } label: {
                    Image(systemName: shown ? "eye.slash" : "eye")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(.white.opacity(0.6))
                        .frame(width: 44, height: 44)
                        .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L(shown ? "auth.hidePassword" : "auth.showPassword"))
            }
        }
    }

    private var emailField: some View {
        field(title: L("auth.emailLabel"), holds: .email) {
            TextField("", text: $email)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.emailAddress)
                .textContentType(.emailAddress)
                .submitLabel(.go)
                .focused($focus, equals: .email)
                .onSubmit { Task { await runPrimary() } }
                .accessibilityIdentifier("login.email")
                .accessibilityLabel(L("auth.emailLabel"))
        }
    }

    /**
     * Регистрация: шесть полей и ни одного лишнего.
     *
     * Порядок не случайный. Сначала о мойке, потом о человеке, потом то,
     * чем он будет входить: пока не назвал дело, вопрос «придумайте
     * пароль» звучит как анкета ради анкеты.
     */
    private var registerFields: some View {
        VStack(alignment: .leading, spacing: 14) {
            field(title: L("onboarding.bizName"), holds: .businessName) {
                TextField(L("auth.namePlaceholder"), text: $businessName)
                    .textContentType(.organizationName)
                    .autocorrectionDisabled()
                    .focused($focus, equals: .businessName)
                    .accessibilityIdentifier("login.businessName")
                    .accessibilityLabel(L("onboarding.bizName"))
            }

            field(title: L("onboarding.ownerName"), holds: .ownerName) {
                TextField(L("staff.namePlaceholder"), text: $ownerName)
                    .textContentType(.name)
                    .autocorrectionDisabled()
                    .focused($focus, equals: .ownerName)
                    .accessibilityIdentifier("login.ownerName")
                    .accessibilityLabel(L("onboarding.ownerName"))
            }

            VStack(alignment: .leading, spacing: 6) {
                field(title: L("auth.registerEmail"), holds: .email) {
                    TextField("", text: $email)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.emailAddress)
                        .textContentType(.emailAddress)
                        .focused($focus, equals: .email)
                        .accessibilityIdentifier("login.registerEmail")
                        .accessibilityLabel(L("auth.registerEmail"))
                }

                /* Зачем адрес — прямо под полем. На него придёт и
                   подтверждение, и восстановление: человек, который
                   впишет сюда чужой ящик, потеряет доступ к своей мойке. */
                Text(L("auth.registerEmailNote"))
                    .font(.system(size: 11))
                    .foregroundStyle(.white.opacity(0.45))
                    .fixedSize(horizontal: false, vertical: true)
            }

            VStack(alignment: .leading, spacing: 6) {
                passwordFieldNamed(L("auth.registerPassword"))

                Text(L("auth.passwordHint"))
                    .font(.system(size: 11))
                    .foregroundStyle(.white.opacity(0.45))
            }

            field(title: L("auth.phone"), holds: .phone) {
                CountryPhoneField(
                    country: $country,
                    number: $phone,
                    ink: .white,
                    identifier: "login.phone"
                )
                .focused($focus, equals: .phone)
            }

            currencyChoice
        }
    }

    /// То же поле пароля, но со своей подписью: на регистрации оно
    /// называется «придумайте», а не «пароль».
    private func passwordFieldNamed(_ title: String) -> some View {
        field(title: title, holds: .password) {
            HStack(spacing: 10) {
                Group {
                    if shown {
                        TextField("", text: $password)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    } else {
                        SecureField("", text: $password)
                    }
                }
                .textContentType(.newPassword)
                .focused($focus, equals: .password)
                .accessibilityIdentifier("login.newPassword")
                .accessibilityLabel(title)
                .id("login.password.box")

                Button {
                    shown.toggle()
                } label: {
                    Image(systemName: shown ? "eye.slash" : "eye")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(.white.opacity(0.6))
                        .frame(width: 44, height: 44)
                        .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L(shown ? "auth.hidePassword" : "auth.showPassword"))
            }
        }
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
            Text(error)
                .font(.system(size: 14))
                .foregroundStyle(Brand.lime)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 16)
        }
    }

    private func quiet(_ title: String, run: @escaping () -> Void) -> some View {
        Button(action: run) {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .foregroundStyle(.white.opacity(0.82))
                .padding(.horizontal, 16)
                .frame(height: 44)
                .background(.white.opacity(0.08), in: .rect(cornerRadius: 14, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .strokeBorder(.white.opacity(0.14), lineWidth: 1)
                )
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .disabled(busy)
    }


    @ViewBuilder
    private func field<Content: View>(
        title: String,
        /* Какое поле лежит в коробке. Нужно только рамке: без этого
           подсветка «сюда пишут» зажигалась на всех коробках разом,
           потому что сравнивать было не с чем. */
        holds: Field? = nil,
        /* Рисовать ли коробку поля.
         *
         * У клеток кода она своя, у каждой, и общая рамка вокруг ряда
         * оказывалась ВТОРЫМ полем на заднем плане: под шестью клетками
         * лежал ещё один прямоугольник, и ряд читался как поле внутри
         * поля. */
        framed: Bool = true,
        @ViewBuilder content: () -> Content
    ) -> some View {
        let lit = holds != nil && focus == holds

        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 11, weight: .bold))
                .tracking(1.2)
                .textCase(.uppercase)
                .foregroundStyle(.white.opacity(0.6))

            if framed {
                content()
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(.white)
                    .tint(Brand.lime)
                    .padding(.horizontal, 16)
                    .frame(height: 54)
                    .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .strokeBorder(
                                lit ? Brand.lime.opacity(0.75) : .white.opacity(0.16),
                                lineWidth: lit ? 2 : 1
                            )
                    )
                    /* Коробка сама ловит касание.
                     *
                     * SwiftUI отдаёт `TextField` ровно ту площадь, которую
                     * занимает набранный текст: у пустого поля это
                     * несколько точек возле каретки. Человек бил в
                     * коробку и не понимал, почему клавиатура не
                     * появляется, — и это выглядело как продолжение того
                     * же бага с исчезающей клавиатурой, хотя причина
                     * другая. Цель теперь во всю строку, то есть больше
                     * сорока четырёх точек, как и требует система.
                     *
                     * Меню кода страны внутри перехватывает своё касание
                     * само: вложенный жест старше внешнего. */
                    .contentShape(Rectangle())
                    .onTapGesture { if let holds { focus = holds } }
            } else {
                content()
            }
        }
    }


    // ══════════════════════ валюта ══════════════════════

    /**
     * Валюта: пять кнопок в ряд, драм выбран заранее.
     *
     * Не выпадающий список: вариантов пять, и список ради пяти пунктов
     * это лишнее нажатие и закрытая от глаз строка выбора. Ряд отвечает
     * на вопрос «а что вообще есть» до того, как его задали.
     *
     * Подпись под рядом честно говорит, что потом не поменять. Сказать
     * это здесь дешевле, чем объясняться через месяц: пересчитывать
     * прошлые суммы не по чему, а оставить их как есть значит смешать в
     * одном отчёте разные деньги.
     */
    private var currencyChoice: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(L("onboarding.currency"))
                .font(.system(size: 11, weight: .semibold))
                .tracking(0.6)
                .foregroundStyle(.white.opacity(0.55))

            HStack(spacing: 6) {
                ForEach(Money.currencies, id: \.self) { code in
                    let on = code == currency
                    Button {
                        currency = code
                    } label: {
                        VStack(spacing: 1) {
                            Text(Money.symbol(code))
                                .font(.system(size: 15, weight: .bold))
                            Text(code)
                                .font(.system(size: 9, weight: .semibold))
                                .opacity(0.7)
                        }
                        .foregroundStyle(on ? Brand.grapeDeep : .white.opacity(0.75))
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                        .background(
                            on ? Brand.lime : .white.opacity(0.08),
                            in: .rect(cornerRadius: 12, style: .continuous)
                        )
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(code)
                    .accessibilityAddTraits(on ? [.isSelected, .isButton] : .isButton)
                }
            }

            Text(L("onboarding.currencyOnce"))
                .font(.system(size: 11))
                .foregroundStyle(.white.opacity(0.45))
                .fixedSize(horizontal: false, vertical: true)
        }
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
        .opacity(primaryReady ? 1 : 0.5)
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
                && ownerName.trimmed.count >= 2
                && !email.trimmed.isEmpty
                && !password.isEmpty
                && !phone.isEmpty
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
            HStack(spacing: 10) {
                quiet(L("auth.forgotPassword")) {
                    error = nil
                    /* Почта переносится из логина: если владелец её уже
                       набрал, спрашивать второй раз незачем. Телефон
                       сотрудника сюда не годится — восстановление идёт
                       только почтой, — поэтому берём только с собакой. */
                    if login.contains("@") { email = login }
                    go(.reset)
                }
                quiet(L("auth.noAccount")) {
                    error = nil
                    go(.register)
                }
            }
            .padding(.top, 14)

        case .reset, .register:
            quiet(L("auth.haveAccount")) {
                error = nil
                go(.entry)
            }
            .padding(.top, 14)

        case .sent:
            EmptyView()
        }
    }

    // ══════════════════════ запросы ══════════════════════

    private func go(_ next: Stage) {
        focus = nil
        withAnimation(.snappy(duration: 0.28)) { stage = next }
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
                ownerName: ownerName.trimmed,
                email: address,
                password: password,
                phone: phone,
                currency: currency,
                country: country.code
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
