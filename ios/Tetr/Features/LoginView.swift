import SwiftUI

/**
 * Вход.
 *
 * ПЕРВЫЙ ВОПРОС ЭКРАНА — «КТО ВЫ», А НЕ «КАКИМ КОДОМ».
 *
 * Кодов в продукте два, и до этой переделки оба назывались PIN. Владельцу
 * приходил код из SMS; себе он мог завести постоянный; сотруднику
 * постоянный выдавал хозяин мойки. Три разные вещи, одно слово — и
 * человек, которому пришло сообщение, искал в нём тот код, который ему
 * когда-то продиктовали.
 *
 * Теперь у кодов разные имена. «Код из SMS» приходит сообщением и живёт
 * минуты. «ПИН» постоянный: владелец заводит его себе сам, а
 * сотруднику выдаёт вместе с номером. Слова «PIN» на экранах больше нет
 * нигде; внутри системы поле по-прежнему называется `pin`, и менять его
 * имя в базе ради подписи было бы миграцией без причины.
 *
 * ДВЕРЕЙ ПО-ПРЕЖНЕМУ ДВЕ, И ОНИ НЕ РАВНЫ. Главная у владельца — телефон и
 * код из SMS: ею входят и ею же регистрируются. Вторая — телефон и код
 * доступа: ею входит сотрудник, которому аккаунт завёл владелец, и ею же
 * входит владелец, когда SMS не идёт. Единственной дверью код из SMS
 * делать нельзя: оператор ложится, роуминг отваливается, а мойка в этот
 * момент не должна закрываться.
 *
 * ПОЧЕМУ ПЕРЕКЛЮЧАТЕЛЬ, А НЕ ССЫЛКА ВНИЗУ. Раньше сотрудник начинал путь
 * с экрана, который просил у него номер ради SMS, которую он не ждёт, а
 * его дверь пряталась строкой под кнопкой. Роль это не оформление: от неё
 * зависит СОСТАВ полей, и спросить её надо первой. Двух разных дизайнов
 * при этом нет — переключатель меняет содержимое одной и той же формы.
 *
 * СОТРУДНИКУ НЕ ПОКАЗЫВАЕМ НИ SMS, НИ ВОССТАНОВЛЕНИЯ, и это не упрощение
 * картинки, а правда о системе: номер сотруднику заводит владелец,
 * подтверждённым этот номер не становится (см. `claimAccount` на
 * сервере), а восстановление работает только по подтверждённому. Кнопка
 * «забыли код» ответила бы ему молчанием. Забытый ПИН сотруднику
 * выдаёт заново тот же владелец, из карточки сотрудника.
 *
 * ── ПРО КЛАВИАТУРУ И ПЕРЕСБОРКУ ЭКРАНА ──
 *
 * Форма собрана ОДНИМ плоским столбцом, где каждая часть стоит под своим
 * `if`. Раньше здесь был `switch stage`, и каждая ветка рисовала СВОЁ
 * поле телефона: для SwiftUI это разные виды, и переход «войти по коду
 * доступа» уничтожал поле вместе с его первым ответчиком. Клавиатура
 * успевала открыться и тут же схлопывалась, номер стирался, а `Spacer`ы
 * по краям столбца перераспределяли высоту — экран прыгал.
 *
 * Теперь поле телефона объявлено ровно один раз и живёт всё время, пока
 * оно на экране нужно: при смене роли и способа оно не пересоздаётся, а
 * значит не теряет ни текста, ни фокуса, ни клавиатуры.
 *
 * Фокус САМИ не двигаем нигде, кроме одного места — ряда клеток кода из
 * SMS. Там экран состоит из одного поля, и без фокуса не работает
 * подстановка кода системой, ради которой всё и сделано одним полем.
 * Ставится он в `onAppear` самого ряда, то есть в том же цикле, в котором
 * ряд появляется: перенос ответчика внутри одного обновления клавиатуру
 * не роняет.
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

    @State private var country = Countries.default
    @State private var phone = LoginView.prefilled("TETR_PHONE")
    @State private var pin = LoginView.prefilled("TETR_PIN")
    @State private var code = ""
    @State private var newPin = ""
    @State private var repeatPin = ""
    @State private var businessName = ""
    /// Валюта новой мойки. Выбирается здесь и больше нигде: все суммы
    /// бизнеса лежат в ней, и сменить её потом значило бы объявить
    /// вчерашние двенадцать тысяч драм двенадцатью тысячами долларов.
    @State private var currency = "AMD"
    @State private var ownerName = ""

    @State private var who: Who = .owner
    @State private var method: Method = .sms
    @State private var stage: Stage = .entry
    @State private var error: String?
    @State private var busy = false
    /// Человек попросил другой аккаунт: сохранённый профиль больше не
    /// показываем до следующего запуска.
    @State private var manual = false

    @FocusState private var focus: Field?

    private enum Field { case phone, pin, code, newPin, repeatPin, businessName, ownerName }

    /// Кто пришёл. Регистрация это всегда владелец: сотрудника заводит
    /// хозяин мойки, сам себя он завести не может.
    private enum Who { case owner, staff }

    /// Чем входит владелец. У сотрудника способ один, и переключать ему
    /// нечего.
    private enum Method { case sms, code }

    /// Что сейчас на экране.
    private enum Stage: Equatable {
        /// учётные данные: роль, номер и, если надо, ПИН
        case entry
        /// забыл ПИН: телефон, чтобы выслать SMS
        case reset
        /// ждём шесть цифр из сообщения
        case code(Waiting)
        /// код восстановления сошёлся, осталось придумать новый
        case newPin(ticket: String)
        /// номер свободен: осталось назвать мойку
        case name(ticket: String)
        /// ПИН сменён, входить надо им
        case done
    }

    /// Заявка на код: чем подтверждать и зачем её заводили.
    private struct Waiting: Equatable {
        enum Purpose { case entry, stepUp, reset }
        let purpose: Purpose
        let id: String
        /// куда ушёл код — номер закрытый, как его прислал сервер
        let phone: String
        /// раньше этого момента повтор не сработает; правило держит сервер
        var resendAt: Date
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
     *       --setenv TETR_PHONE 77000001 --setenv TETR_PIN 111111
     */
    private static func prefilled(_ key: String) -> String {
        #if DEBUG
        return ProcessInfo.processInfo.environment[key] ?? ""
        #else
        return ""
        #endif
    }

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
                                Wordmark(size: 18)
                                    .frame(height: focus == nil ? nil : 0, alignment: .top)
                                    .opacity(focus == nil ? 1 : 0)
                                    .padding(.bottom, focus == nil ? 22 : 0)
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
                                .padding(.bottom, focus == nil ? 112 : 24)
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
                    .defaultScrollAnchor(.bottom, for: .sizeChanges)
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
     * Не `switch` по шагу и не отдельный вид на каждую дверь: части
     * появляются и уходят по своим условиям, а те, что остаются, остаются
     * ТЕМИ ЖЕ. Поле телефона объявлено здесь ровно один раз и переживает
     * и смену роли, и смену способа входа — с текстом, фокусом и
     * открытой клавиатурой.
     */
    @ViewBuilder
    private var form: some View {
        if let account = session.rememberedAccount, lock.quickSignIn, !manual, stage == .entry {
            remembered(account)
        } else {
            VStack(alignment: .leading, spacing: 0) {
                /* Переключатель ВЫШЕ заголовка, а не под ним.
                 *
                 * Заголовок здесь — ответ на вопрос переключателя: «Вход
                 * владельца», «Вход сотрудника». Стой он первым, экран
                 * объявлял бы роль раньше, чем человек её выбрал, а сам
                 * выбор оказывался бы вставленным между описанием и
                 * полем, к которому он не относится. */
                if showsRoles {
                    roleSwitch
                }

                Text(headline)
                    .font(.system(size: 30, weight: .bold))
                    .foregroundStyle(.white)
                    .tracking(-0.35)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, showsRoles ? 22 : 0)

                if let subhead {
                    Text(subhead)
                        .font(.system(size: 15))
                        .foregroundStyle(.white.opacity(0.68))
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 8)
                }

                if needsPhone {
                    phoneField.padding(.top, 24)
                }

                if needsAccessCode {
                    accessCodeField.padding(.top, 16)
                }

                if case .code(let waiting) = stage {
                    smsCodeField(waiting).padding(.top, 26)
                }

                if case .newPin = stage {
                    newPinFields.padding(.top, 26)
                }

                if case .name = stage {
                    nameFields.padding(.top, 26)
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
            .animation(.snappy(duration: 0.28), value: who)
            .animation(.snappy(duration: 0.28), value: method)
            .animation(.easeOut(duration: Motion.fast), value: error)
        }
    }

    // ══════════════════════ кто входит ══════════════════════

    /**
     * Владелец или сотрудник.
     *
     * Тот же жёлоб с переезжающей плашкой, что в кабинете, только здесь
     * он собран на `matchedGeometryEffect`: плашка нарисована под
     * выбранным пунктом, и когда выбранным становится сосед, движок сам
     * ведёт её из старого места в новое. Гаснущая слева и загорающаяся
     * справа плашка читалась бы двумя разными вспышками, а не одной
     * вещью, сменившей место.
     *
     * Пружина без отскока: переключатель роли жмут в спешке у ворот
     * мойки, и качающаяся плашка ничего к этому не добавляет.
     */
    private var roleSwitch: some View {
        HStack(spacing: 2) {
            roleTab(.owner, L("roles.owner"))
            roleTab(.staff, L("roles.staff"))
        }
        .padding(3)
        .background(.white.opacity(0.10), in: .rect(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(.white.opacity(0.12), lineWidth: 1))
        .accessibilityElement(children: .contain)
    }

    @Namespace private var roleMark

    private func roleTab(_ value: Who, _ title: String) -> some View {
        Button {
            guard who != value else { return }
            /* Фокус НЕ трогаем. Поле телефона одно на оба состояния и
               никуда не девается: если клавиатура была открыта, она
               такой и остаётся, а номер остаётся набранным. */
            withAnimation(.spring(response: 0.32, dampingFraction: 1)) {
                who = value
                /* Сотрудник входит ПИНом всегда. Возвращаясь к
                   владельцу, отдаём ему главную дверь: код придёт сам. */
                method = value == .staff ? .code : .sms
            }
            error = nil
            pin = ""
        } label: {
            Text(title)
                .font(.system(size: 14, weight: .semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                /* Плашка светлая, а не лаймовая, и это правило, а не
                   вкус: лайм на этом экране означает главное действие, и
                   второй лаймовой заливкой переключатель отбирал бы у
                   кнопки «Получить код» её единственность. Выбранное
                   здесь не ярче соседа, а ближе к смотрящему. */
                .foregroundStyle(who == value ? .white : .white.opacity(0.6))
                .frame(maxWidth: .infinity)
                .frame(height: 38)
                .background {
                    if who == value {
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(.white.opacity(0.20))
                            .overlay(
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .strokeBorder(.white.opacity(0.22), lineWidth: 1)
                            )
                            .matchedGeometryEffect(id: "role", in: roleMark)
                    }
                }
                /* Нажимается вся плашка, а не буквы на ней. Без этой
                   строки SwiftUI считает целью только сам текст: пустое
                   поле внутри рамки и заливка под ней целями не
                   являются, и человек, попавший рядом с подписью,
                   получает молчание вместо переключения. */
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .disabled(busy)
        .accessibilityAddTraits(who == value ? [.isSelected, .isButton] : .isButton)
    }

    // ══════════════════════ что показываем ══════════════════════

    /// Виден ли переключатель роли. Только пока спрашивают учётные
    /// данные: на экране кода из SMS менять роль уже не о чем, заявка
    /// заведена на конкретный номер.
    private var showsRoles: Bool { stage == .entry }

    private var needsPhone: Bool { stage == .entry || stage == .reset }

    /// Ряд клеток ПИНа. У сотрудника всегда, у владельца по
    /// выбору. Одно условие на оба случая — значит одно и то же поле, и
    /// смена роли его не пересоздаёт.
    private var needsAccessCode: Bool { stage == .entry && method == .code }

    private var headline: String {
        switch stage {
        case .code(let waiting):
            return waiting.purpose == .stepUp ? L("auth.stepUpTitle") : L("auth.otpTitle")
        case .newPin: return L("auth.newPin")
        case .name: return L("auth.nameTitle")
        case .done: return L("auth.resetDone")
        case .reset: return L("auth.resetTitle")
        case .entry:
            return who == .staff ? L("auth.staffTitle") : L("auth.ownerTitle")
        }
    }

    /// Строка под заголовком. У кода из SMS её нет: там всё нужное
    /// стоит ПОД клетками, рядом с повтором, — куда человек и смотрит,
    /// набрав шесть цифр.
    private var subhead: String? {
        switch stage {
        case .code(let waiting):
            return waiting.purpose == .stepUp ? L("auth.stepUpSub", waiting.phone) : nil
        case .newPin: return L("auth.pinMemo")
        case .name: return L("auth.nameSub")
        case .done: return L("auth.resetDoneNote")
        case .reset: return L("auth.resetSub")
        case .entry:
            return who == .owner && method == .sms ? L("auth.entrySub") : nil
        }
    }

    /// Тихая строка под всеми действиями: откуда взять код.
    private var helper: String? {
        guard stage == .entry else { return nil }
        return who == .staff ? L("auth.staffHelper") : (method == .code ? L("auth.ownerCodeHelper") : nil)
    }

    // ══════════════════════ поля ══════════════════════

    /**
     * Телефон — с выбором кода страны, как в кабинете.
     *
     * Объявлен ровно один раз на весь экран. Пока он нужен, он ЖИВЁТ:
     * смена роли, смена способа входа и уход в восстановление его не
     * пересоздают, а значит не стирают набранное и не роняют клавиатуру.
     * Именно на этом ломался прежний экран.
     *
     * Номер, набранный по привычке целиком — с плюсом, с кодом страны или
     * с ведущим нулём, — поле принимает: лишнее отрезается само
     * (`Country.national`).
     */
    private var phoneField: some View {
        field(title: L("auth.phone"), holds: .phone) {
            CountryPhoneField(
                country: $country,
                number: $phone,
                ink: .white,
                identifier: "login.phone"
            )
            .focused($focus, equals: .phone)
        }
    }

    /// Постоянный код. Подпись говорит и что это, и сколько цифр: у
    /// человека в этот момент два разных кода на выбор, и «6 цифр» —
    /// самая дешёвая подсказка, какой из них имеется в виду.
    private var accessCodeField: some View {
        field(title: L("auth.pinField"), framed: false) {
            CodeCells(
                text: $pin,
                focus: $focus,
                field: .pin,
                length: API.pinLength,
                label: L("auth.pin"),
                identifier: "login.pin",
                secure: true,
                contentType: .password
            )
        }
    }

    /**
     * Шесть цифр из сообщения.
     *
     * Единственное место, где фокус ставится сам, и ставится он в
     * `onAppear` самого ряда — то есть в том же обновлении, в котором ряд
     * появляется. Перенос первого ответчика внутри одного цикла
     * клавиатуру не роняет, а без фокуса не работает системная
     * подстановка кода из только что пришедшей SMS, ради которой ряд и
     * сделан ОДНИМ полем.
     */
    private func smsCodeField(_ waiting: Waiting) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            CodeCells(
                text: $code,
                focus: $focus,
                field: .code,
                length: API.codeLength,
                label: L("auth.otpCode"),
                identifier: "login.code",
                /* Код из SMS не прячем: он только что пришёл человеку в
                   открытом сообщении, и точки вместо цифр мешали бы
                   сверить набранное с тем, что видно в шторке. */
                secure: false,
                contentType: .oneTimeCode,
                // шесть цифр — отправляем сами, лишнее нажатие тут ни к чему
                onComplete: { Task { await confirm(waiting) } }
            )

            /* Куда ушёл код и когда можно просить ещё — под клетками, а
               не над ними: набрав шестую цифру, человек смотрит сюда, и
               оба ответа на его вопросы стоят рядом. */
            Text(L("auth.otpSent", waiting.phone))
                .font(.system(size: 13))
                .foregroundStyle(.white.opacity(0.62))
                .padding(.top, 14)

            resendButton(waiting)
                .padding(.top, 4)
        }
        .onAppear { focus = .code }
    }

    private var newPinFields: some View {
        VStack(alignment: .leading, spacing: 14) {
            field(title: L("auth.pinField"), framed: false) {
                CodeCells(
                    text: $newPin,
                    focus: $focus,
                    field: .newPin,
                    length: API.pinLength,
                    label: L("auth.newPin"),
                    secure: true,
                    contentType: .newPassword
                )
            }

            /* Повтор сервер не спрашивает и знать о нём не должен: он
               проверяется здесь, до отправки. Причина в последствии —
               опечатка в единственном поле означала бы код, которого
               человек не знает, и вход только через ещё одну SMS. */
            field(title: L("common.retry"), framed: false) {
                CodeCells(
                    text: $repeatPin,
                    focus: $focus,
                    field: .repeatPin,
                    length: API.pinLength,
                    label: L("common.retry"),
                    secure: true,
                    contentType: .newPassword
                )
            }

            if mismatch {
                Text(L("auth.pinMismatch"))
                    .font(.system(size: 14))
                    .foregroundStyle(Brand.lime)
            }
        }
    }

    /**
     * Последний шаг новичка: как называется мойка и как зовут владельца.
     *
     * ПИН здесь не спрашивается — входить он будет кодом из SMS,
     * а постоянный заведёт себе сам, если захочет. Два поля, и это
     * единственный экран, который человек видит один раз в жизни.
     *
     * Ни цены, ни срока, ни слова «бесплатно»: заводить аккаунт правила
     * магазина не запрещают, запрещают продавать внутри и звать платить
     * наружу.
     */
    private var nameFields: some View {
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

            currencyChoice
        }
    }

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

    /**
     * Что делает кнопка, пока запрос летит.
     *
     * Своё слово на каждый шаг, а не «Բեռնվում է…» на все. Между «код
     * ушёл на телефон» и «проверяем набранное» разница есть, и человек,
     * который ждёт SMS, должен видеть именно первое: иначе он ищет
     * сообщение раньше, чем оно отправлено.
     */
    private var primaryBusyTitle: String {
        switch stage {
        case .entry: return method == .sms ? L("auth.sending") : L("auth.signingIn")
        case .reset: return L("auth.sending")
        case .code: return L("auth.checking")
        case .newPin: return L("common.saving")
        /* Имя владельца — последний шаг регистрации: после него
           заводится бизнес, и это дольше остальных запросов. */
        case .name: return L("common.saving")
        /* Кнопка на этом шаге уводит обратно на вход и никуда не
           обращается: занятой она не бывает. */
        case .done: return L("common.loadingShort")
        }
    }

    private var primaryTitle: String {
        switch stage {
        case .entry: return method == .sms ? L("auth.entrySend") : L("auth.signIn")
        case .reset: return L("auth.resetSend")
        case .code: return L("auth.otpVerify")
        case .newPin: return L("auth.resetSave")
        case .name: return L("auth.nameCreate")
        case .done: return L("auth.backToSignIn")
        }
    }

    /// Имя для UI-тестов. Разное у разных дел: тест, который ищет одну
    /// кнопку на все шаги, проходит и там, где шаг не тот.
    private var primaryIdentifier: String {
        switch stage {
        case .entry: return method == .sms ? "login.send" : "login.submit"
        case .reset: return "login.reset"
        case .code: return "login.confirm"
        case .newPin: return "login.savePin"
        case .name: return "login.create"
        case .done: return "login.backToSignIn"
        }
    }

    private var primaryReady: Bool {
        switch stage {
        case .entry:
            guard !phone.isEmpty else { return false }
            /* Минимум четыре, а не шесть: столько цифр у всех, кто завёл
               аккаунт до перехода на шестизначный код. Требовать шесть
               значило бы запереть их снаружи. Длину НОВОГО кода проверяет
               сервер; здесь код только вводят. */
            return method == .sms || pin.count >= API.pinMinLength
        case .reset: return !phone.isEmpty
        case .code: return code.count == API.codeLength
        case .newPin: return newPin.count == API.pinLength && newPin == repeatPin
        case .name: return namesReady
        case .done: return true
        }
    }

    private func runPrimary() async {
        switch stage {
        case .entry: method == .sms ? await sendEntryCode() : await submitPin()
        case .reset: await sendResetCode()
        case .code(let waiting): await confirm(waiting)
        case .newPin(let ticket): await saveNewPin(ticket)
        case .name(let ticket): await createBusiness(ticket)
        case .done:
            pin = ""
            method = .code
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
     * нацеленный в «войти по ПИНу», попадал в «получить код».
     * Поэтому у каждой своя площадь в сорок четыре точки и слабая
     * подложка, которая говорит «это тоже кнопка».
     */
    @ViewBuilder
    private var secondary: some View {
        switch stage {
        case .entry where who == .owner && method == .sms:
            quiet(L("auth.entryPinDoor")) { switchMethod(to: .code) }
                .accessibilityIdentifier("login.pinDoor")
                .frame(maxWidth: .infinity)
                .padding(.top, 14)

        case .entry where who == .owner && method == .code:
            HStack(spacing: 10) {
                quiet(L("auth.entrySmsDoor")) { switchMethod(to: .sms) }
                    .accessibilityIdentifier("login.smsDoor")
                quiet(L("auth.forgotPin")) { go(.reset) }
                    .accessibilityIdentifier("login.forgot")
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 14)

        case .reset:
            quiet(L("auth.backToSignIn")) {
                method = .code
                go(.entry)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 14)

        case .code(let waiting):
            quiet(L("common.back")) { backFromCode(waiting) }
                .frame(maxWidth: .infinity)
                .padding(.top, 14)

        default:
            EmptyView()
        }
    }

    /**
     * Сменить способ входа владельца.
     *
     * Номер НЕ трогаем и фокус НЕ двигаем: поле телефона одно на оба
     * способа и остаётся на месте вместе с набранным и с клавиатурой.
     * Ради этого весь экран и собран одним столбцом.
     */
    private func switchMethod(to next: Method) {
        withAnimation(.snappy(duration: 0.28)) { method = next }
        error = nil
        pin = ""
    }

    /**
     * Повтор с обратным отсчётом.
     *
     * Отсчёт — подсказка человеку, а не правило: правило держит сервер
     * (45 → 90 → 180 секунд, не больше трёх повторов). Но без подсказки
     * кнопка выглядит рабочей и отвечает отказом, то есть продукт
     * предлагает нажать и ругается за нажатие.
     *
     * `TimelineView`, а не таймер в состоянии: секунда обязана тикать
     * сама, но будить весь экран ради подписи одной кнопки незачем.
     */
    private func resendButton(_ waiting: Waiting) -> some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let left = max(0, Int(waiting.resendAt.timeIntervalSince(context.date).rounded(.up)))
            Button {
                Task { await resend(waiting) }
            } label: {
                Text(left > 0 ? L("auth.otpResendIn", mmss(left)) : L("auth.otpResend"))
                    .font(.system(size: 13, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(left > 0 ? .white.opacity(0.4) : Brand.lime)
                    .frame(height: 36, alignment: .leading)
                    .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .disabled(busy || left > 0)
        }
    }

    // ══════════════════════ сохранённый профиль ══════════════════════

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

    /// Расходятся ли уже набранные части. Пока повтор короче нового,
    /// молчим: ругаться на второй цифре из шести значит ругаться на
    /// человека, который ещё печатает.
    private var mismatch: Bool {
        !repeatPin.isEmpty && repeatPin.count >= newPin.count && newPin != repeatPin
    }

    /// Имя короче двух знаков сервер не примет — гасим кнопку здесь,
    /// чтобы отказ не приходил после нажатия.
    private var namesReady: Bool {
        businessName.trimmingCharacters(in: .whitespaces).count >= 2
            && ownerName.trimmingCharacters(in: .whitespaces).count >= 2
    }

    @ViewBuilder
    private var errorLine: some View {
        if let error, !mismatch {
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

    private func mmss(_ total: Int) -> String {
        String(format: "%02d:%02d", total / 60, total % 60)
    }

    /// Сменить шаг, погасив то, что от прежнего осталось.
    private func go(_ next: Stage) {
        withAnimation(.snappy(duration: 0.28)) {
            stage = next
        }
        error = nil
        code = ""
        if next != .entry { pin = "" }
        newPin = ""
        repeatPin = ""
        /* Названия держим, пока человек на своём шаге: отказ сервера по
           одному из полей не должен стирать оба. */
        if case .name = next {} else {
            businessName = ""
            ownerName = ""
        }
    }

    private func backFromCode(_ waiting: Waiting) {
        /* Досдача кода после ПИНа возвращает к нему же, всё
           остальное — к началу своей двери. Возврат «куда-нибудь»
           заставил бы человека проходить сценарий заново из-за одного
           нажатия. */
        switch waiting.purpose {
        case .stepUp: method = .code; go(.entry)
        case .entry: method = .sms; go(.entry)
        case .reset: go(.reset)
        }
    }

    // ══════════════════════ запросы ══════════════════════

    private func sendEntryCode() async {
        await run {
            let started = try await session.beginEntry(phone: country.e164(phone))
            go(.code(Waiting(
                purpose: .entry,
                id: started.challengeId,
                phone: started.phone ?? "",
                resendAt: started.resendAt
            )))
        }
    }

    private func sendResetCode() async {
        await run {
            let started = try await session.beginPinReset(phone: country.e164(phone))
            go(.code(Waiting(
                purpose: .reset,
                id: started.challengeId,
                phone: started.phone ?? "",
                resendAt: started.resendAt
            )))
        }
    }

    private func submitPin() async {
        busy = true
        error = nil
        defer { busy = false }

        do {
            try await session.signIn(phone: country.e164(phone), pin: pin)
        } catch let e as APIError {
            /* Не отказ, а второй шаг: код подошёл, устройство сервер
               видит впервые. Экран меняется, а не показывает ошибку —
               человек всё сделал правильно. */
            if e.code == "STEP_UP_REQUIRED", let id = e.challengeId {
                go(.code(Waiting(
                    purpose: .stepUp,
                    id: id,
                    phone: e.maskedPhone ?? "",
                    /* Сервер прислал заявку, но не сказал, когда можно
                       повторить: у входа поле не предусмотрено. Берём
                       первую паузу — ту же, что стоит на сервере. */
                    resendAt: Date().addingTimeInterval(45)
                )))
                return
            }
            pin = ""
            error = message(for: e)
        } catch {
            self.error = L("payroll.failed")
        }
    }

    private func confirm(_ waiting: Waiting) async {
        guard !busy, code.count == API.codeLength else { return }
        busy = true
        error = nil
        defer { busy = false }

        do {
            switch waiting.purpose {
            case .stepUp:
                try await session.completeStepUp(challengeId: waiting.id, code: code)
            case .entry:
                /* Пропуск означает, что номер свободен: аккаунта под него
                   нет, и осталось спросить название мойки. Пусто —
                   человек уже внутри. */
                if let ticket = try await session.completeEntry(challengeId: waiting.id, code: code) {
                    go(.name(ticket: ticket))
                }
            case .reset:
                let ticket = try await session.checkResetCode(challengeId: waiting.id, code: code)
                go(.newPin(ticket: ticket))
            }
        } catch let e as APIError {
            code = ""
            error = message(for: e)
            /* Заявка сгорела — возвращаем к началу: другого честного
               пути отсюда нет, код нужен новый. */
            if e.code == "OTP_EXPIRED" || e.code == "OTP_TOO_MANY" {
                let text = error
                backFromCode(waiting)
                error = text
            }
        } catch {
            self.error = L("payroll.failed")
        }
    }

    private func saveNewPin(_ ticket: String) async {
        await run {
            try await session.completePinReset(ticket: ticket, pin: newPin)
            go(.done)
        }
    }

    /// Завести мойку. Успех сам сменит экран: `session.state` станет
    /// `.signedIn`, и корневой вид покажет продукт вместо входа.
    private func createBusiness(_ ticket: String) async {
        await run {
            try await session.completeSignUp(
                ticket: ticket,
                businessName: businessName.trimmingCharacters(in: .whitespaces),
                ownerName: ownerName.trimmingCharacters(in: .whitespaces),
                currency: currency
            )
        }
    }

    private func resend(_ waiting: Waiting) async {
        busy = true
        error = nil
        defer { busy = false }

        do {
            let again = try await session.resendCode(challengeId: waiting.id)
            /* Новая заявка приходит со своим идентификатором: у старой
               код уже погашен, и подтверждать её нечем. Меняем шаг БЕЗ
               анимации и без `go`: ряд клеток на экране тот же самый, и
               пересобирать его ради нового идентификатора значило бы
               уронить клавиатуру там, где человек ждёт сообщения. */
            stage = .code(Waiting(
                purpose: waiting.purpose,
                id: again.challengeId,
                phone: waiting.phone,
                resendAt: again.resendAt
            ))
            code = ""
        } catch let e as APIError {
            error = message(for: e)
        } catch {
            self.error = L("payroll.failed")
        }
    }

    private func quickSubmit(_ account: RememberedAccount) async {
        busy = true
        error = nil
        defer { busy = false }

        /* Face ID не сработал — это не повод молчать.
         *
         * Здесь стоял просто `return`: касание по аватару не давало ни
         * входа, ни строчки объяснения. Face ID отказывает буднично —
         * мокрое лицо, солнце в камеру, человек нажал «Отмена», код-пароль
         * не задан вовсе, — и мойщик оставался перед экраном, где
         * единственная большая кнопка ничего не делает.
         *
         * Теперь отказ проверки открывает форму с ПИНом — тем же
         * путём, что и просроченный сохранённый вход. Пароль от телефона
         * мойщик может не знать, свой ПИН знает всегда.
         */
        /* Проверка обязательна и не зависит от настройки: сохранённый
           вход предлагается ТОЛЬКО при включённом быстром входе, а
           пускать по нажатию без лица значило бы отдать чужой кассе
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

    /// Сохранённый вход не сработал: открываем форму с уже подставленным
    /// номером и с ПИНом. Человек, у которого сохранён вход, свой
    /// код знает, и лишняя SMS ему ни к чему. Фокус не ставим: пусть
    /// сначала прочитает, почему его сюда вернули.
    private func fallBackToManual(_ account: RememberedAccount, why: String) {
        phone = account.phone
        pin = ""
        withAnimation(.snappy(duration: 0.28)) {
            manual = true
            method = .code
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
            return L("auth.wrongCredentials")
        case "OTP_INVALID":
            return L("auth.otpInvalid")
        case "OTP_EXPIRED":
            return L("auth.otpExpired")
        case "OTP_TOO_MANY":
            return L("auth.otpTooMany")
        case "SMS_FAILED":
            return L("auth.smsFailed")
        case "PIN_WEAK":
            /* Сервер различает «мало цифр» и «слишком очевидный», и
               человеку это надо сказать: он в этот момент придумывает
               код, и общий ответ заставляет его гадать. */
            return error.reason == "TRIVIAL_PIN" ? L("auth.pinTrivial") : L("auth.pinMemo")
        default:
            return L("payroll.failed")
        }
    }
}
