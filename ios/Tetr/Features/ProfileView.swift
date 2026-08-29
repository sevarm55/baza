import SwiftUI

/**
 * Профиль — то же табло: карточка человека наверху, дальше плитки.
 *
 * Появился потому, что «Ավելին» делал две несовместимые работы: держал
 * разделы, куда ходят работать, и переключатели, которые трогают раз в год.
 * Десять пунктов, где «Հաճախորդներ» стоит рядом с «Բացել Face ID-ով»,
 * читаются плохо — это разные вещи в одном ящике.
 *
 * И потому, что смены PIN до сих пор не было нигде. Механизм под неё был
 * построен с самого начала, а самой функции не существовало: PIN диктуют
 * работнику вслух, работника однажды увольняют, и закрыть доступ было
 * нечем.
 *
 * Форма заменена на карточки не ради вида. В системной `Form` кнопка
 * «Պահպանել» была строкой среди строк и терялась; здесь она появляется
 * только когда есть что сохранять, и появляется целой плашкой.
 */
struct ProfileView: View {
    @EnvironmentObject private var session: Session
    @EnvironmentObject private var lock: BiometricLock
    @EnvironmentObject private var lang: LangStore

    @State private var businessName = ""
    @State private var myName = ""
    @State private var saving = false
    @State private var saved = false
    /// Сохранение оборвалось. Отдельным состоянием, а не отсутствием
    /// `saved`: «ещё не жали» и «нажали, не вышло» — разные вещи, и
    /// второе обязано сказать о себе вслух.
    @State private var saveFailed = false

    @State private var changingPin = false
    @State private var verifyingPhone = false
    @State private var changingPhone = false
    @State private var notifyOrders = true
    @State private var deleting = false

    @State private var exporting = false
    @State private var exported: URL?
    /// Выгрузка не получилась. Раньше провал был молчаливым: три guard
    /// подряд выходили без единого слова, и человек не знал, ждать ли файл.
    @State private var exportFailed = false

    /// Фото раскрыто во всю ширину.
    @State private var photoOpen = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dismiss) private var dismiss

    private var isOwner: Bool { session.me?.isOwner == true }

    private let gap: CGFloat = 10

    var body: some View {
        GeometryReader { geo in
            ScrollView {
                VStack(spacing: 0) {
                    header(width: geo.size.width, safeTop: geo.safeAreaInsets.top)

                    VStack(spacing: gap) {
                        if let access = session.access { accessTile(access) }
                        identitySettings
                        if changed || saved { saveRow }
                        if saveFailed {
                            Text(L("common.failed"))
                                .font(.system(size: 13))
                                .foregroundStyle(Brand.warnOnBoard)
                                .padding(.horizontal, 6)
                        }
                        switches
                        actions
                    }
                    .padding(.horizontal, 12)
                    .padding(.top, 10)
                    .padding(.bottom, 28)
                    .animation(reduceMotion ? nil : .spring(response: 0.32, dampingFraction: 0.86), value: changed)
                    .animation(.easeOut(duration: 0.2), value: saved)
                }
            }
            /* Шапка больше не меняет высоту ScrollView. Порог жеста меняет
               только форму кадра внутри фиксированного места. Так быстрый разворот
               жеста не запускает цикл «новая высота → новый offset → новая высота». */
            .onScrollGeometryChange(for: CGFloat.self) {
                $0.contentOffset.y + $0.contentInsets.top
            } action: { _, y in
                if !photoOpen, -y > 74 {
                    setPhoto(true)
                } else if photoOpen, y > 38 {
                    setPhoto(false)
                }
            }
            /* Фото уходит под часы, как в мессенджерах: иначе раскрытие
               упирается в полосу статуса и читается как картинка в рамке,
               а не как верх экрана. */
            .ignoresSafeArea(edges: .top)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.board.ignoresSafeArea())
        /* Назад — глазами, а не только краевым свайпом. Панель навигации
           здесь скрыта ради фото во всю ширину, и профиль был
           единственным экраном без видимого выхода. Стекло — чтобы кнопка
           читалась и на фотографии, и на полотне. */
        .overlay(alignment: .topLeading) {
            Button { dismiss() } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 15, weight: .semibold))
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.glass)
            .buttonBorderShape(.circle)
            .accessibilityLabel(L("common.back"))
            .padding(.leading, 10)
        }
        .sheet(isPresented: $changingPin) { PinChangeView() }
        .sheet(isPresented: $verifyingPhone) { VerifyPhoneView() }
        .sheet(isPresented: $changingPhone) { ChangePhoneView() }
        .sheet(isPresented: $deleting) { DeleteBusinessView() }
        .sheet(item: $exported) { url in ShareSheet(url: url) }
        .task {
            businessName = session.tenant?.name ?? ""
            myName = session.me?.name ?? ""
            notifyOrders = session.me?.notifyOrders ?? true
        }
    }

    // ══════════════════════════ кто я ══════════════════════════

    /**
     * Шапка: фото, имя, номер. И одно движение — оттянуть.
     *
     * Раньше здесь стояла цветная плитка человека: кружок с буквой, имя,
     * мойка, номер. Плитка отвечала на вопрос «кто вошёл» — но ровно так же
     * отвечают ещё шесть плиток ниже, и лицо экрана ничем не отличалось от
     * его настроек.
     *
     * Теперь верх устроен как в мессенджерах, и не ради подражания: это
     * единственная фигура, которую человек уже умеет читать без обучения.
     * Кружок — это я; потянул вниз — фото раскрылось во всю ширину; отпустил
     * и прокрутил вверх — сложилось обратно. Отклик пальцу даёт не только
     * картинка, но и толчок: раскрытие защёлкивается, и рука это чувствует.
     *
     * Форма кружка здесь не капсула из общего запрета, а портрет: круглым
     * человека рисуют везде, и квадрат с этим спорить не станет.
     *
     * Своей карточки у людей пока нет — вместо неё общий снимок: тёмный
     * фиолетовый шёлк с лаймовой полосой света. Ни знака, ни буквы, ни
     * подписи: заглушка стоит на месте ЧУЖОГО лица и не должна ничего
     * утверждать о человеке. Абстракция ещё и переживает обрез — она
     * одинаково цела и в компактном кружке, и в широком кадре, а любой знак в
     * круге пришлось бы подрезать.
     *
     * Низ кадра тёмный намеренно: по нему в раскрытом виде идёт белое имя.
     *
     * Буква имени осталась запасным лицом на случай, если картинка не
     * приехала: пустой серый круг хуже любой заглушки.
     */
    private func header(width: CGFloat, safeTop: CGFloat) -> some View {
        let name = session.me?.name ?? "—"
        let tone = Brand.personTone(name)
        let height = safeTop + 114
        let side: CGFloat = photoOpen ? width : 82
        let tall: CGFloat = photoOpen ? height : 82
        let top: CGFloat = photoOpen ? 0 : safeTop + 14

        return ZStack(alignment: .topLeading) {
            face(name: name, tone: tone, side: side)
                .frame(width: side, height: tall)
                    /* Кадр не двигаем и не приближаем: знак стоит ровно в
                       середине квадрата, и кружок берёт его целиком. */
                    .clipShape(.rect(cornerRadius: photoOpen ? 0 : 41, style: .continuous))
                    .overlay {
                        /* Затемнение снизу — только под раскрытым фото:
                           белое имя ложится на капли, а капли светлые. */
                        LinearGradient(
                            colors: [.clear, .black.opacity(0.66)],
                            startPoint: UnitPoint(x: 0.5, y: 0.42),
                            endPoint: .bottom
                        )
                        .opacity(photoOpen ? 1 : 0)
                    }
                    .offset(x: photoOpen ? 0 : 16, y: top)
                    .contentShape(.rect)
                    .onTapGesture { setPhoto(!photoOpen) }

            titles(name: name, onPhoto: true)
                .padding(.horizontal, 20)
                .padding(.bottom, 16)
                .frame(width: width, height: height, alignment: .bottomLeading)
                .opacity(photoOpen ? 1 : 0)

            titles(name: name, onPhoto: false)
                .frame(width: max(0, width - 126), alignment: .leading)
                .offset(x: 114, y: top + 15)
                .opacity(photoOpen ? 0 : 1)
        }
            .frame(width: width, height: height, alignment: .topLeading)
            .clipped()
            .accessibilityElement(children: .combine)
            .accessibilityLabel(name)
            .accessibilityValue(meta)
    }

    /// Имя и строка под ним. Одни и те же слова в обоих состояниях —
    /// меняется только цвет и то, куда они прижаты.
    private func titles(name: String, onPhoto: Bool) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(name)
                .font(.system(size: onPhoto ? 26 : 22, weight: .bold))
                .foregroundStyle(onPhoto ? .white : Brand.onBoard)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(meta)
                .font(.system(size: onPhoto ? 14 : 13))
                .monospacedDigit()
                .foregroundStyle(onPhoto ? .white.opacity(0.78) : Brand.boardMuted)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
    }

    /// Номер и мойка одной строкой. Номер первым: он про человека, мойка —
    /// про место, и человек здесь главный. Правке номер не поддаётся — это
    /// логин, и смена сломала бы вход.
    private var meta: String {
        [session.me?.phone ?? "", session.tenant?.name ?? ""]
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }

    @ViewBuilder
    private func face(name: String, tone: (base: Color, glow: Color), side: CGFloat) -> some View {
        if let art = UIImage(named: "avatar.jpg") {
            Image(uiImage: art).resizable().scaledToFill()
        } else {
            ZStack {
                LinearGradient(
                    colors: [tone.base, tone.glow],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                Text(String(name.prefix(1)))
                    .font(.system(size: side * 0.38, weight: .bold))
                    .foregroundStyle(.white)
            }
        }
    }

    /**
     * Раскрыть или сложить фото.
     *
     * Толчок — часть ответа, а не украшение: движение пальца тут не
     * попадает по кнопке, и подтвердить его нечем, кроме как отдачей. Мягкий
     * на раскрытие, лёгкий на складывание — второе тише, потому что это
     * возврат, а не событие.
     *
     * Высота шапки не меняется: пружина работает только с формой фото.
     */
    private func setPhoto(_ open: Bool) {
        guard open != photoOpen else { return }
        UIImpactFeedbackGenerator(style: open ? .soft : .light).impactOccurred()

        if reduceMotion {
            photoOpen = open
        } else {
            /* Короткая, почти критически затухшая пружина. SwiftUI перенацеливает
               её из текущего кадра, поэтому быстрый жест назад не ждёт окончания
               предыдущей анимации. */
            withAnimation(.spring(response: 0.24, dampingFraction: 0.96)) {
                photoOpen = open
            }
        }
    }

    /**
     * Состояние доступа — плиткой, а не строкой в списке.
     *
     * Янтарной, когда срок подходит: это единственное на экране, из-за чего
     * приложение однажды перестанет работать, и оно не должно выглядеть как
     * ещё одна настройка.
     */
    private func accessTile(_ access: API.Access) -> some View {
        HStack(spacing: 12) {
            Image(systemName: access.warn ? "exclamationmark.circle.fill" : "checkmark.circle.fill")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(access.warn ? Tone.amber.ink : Brand.goodOnBoard)
            VStack(alignment: .leading, spacing: 1) {
                Text(L("auth.signInTitle"))
                    .font(.system(size: 11.5))
                    .foregroundStyle(access.warn ? Tone.amber.ink.opacity(0.72) : Brand.boardMuted)
                Text(Self.plan(access))
                    .font(.system(size: 14.5, weight: .semibold))
                    .foregroundStyle(access.warn ? Tone.amber.ink : Brand.onBoard)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
            Spacer(minLength: 0)
        }
        .modifier(AccessSkin(warn: access.warn))
    }

    // ══════════════════════════ поля ══════════════════════════

    /** Имя, бизнес и язык — одна группа личных данных, а не три карточки. */
    private var identitySettings: some View {
        VStack(spacing: 0) {
            fields
            Rectangle()
                .fill(Brand.boardInk.opacity(0.07))
                .frame(height: 1)
                .padding(.leading, 16)
            language
        }
        .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 22))
    }

    private var fields: some View {
        VStack(spacing: 0) {
            if isOwner {
                field(L("settings.business"), $businessName)
                Rectangle().fill(Brand.boardInk.opacity(0.07)).frame(height: 1)
            }
            field(L("owner.clientName"), $myName)
        }
    }

    private func field(_ title: String, _ value: Binding<String>) -> some View {
        FieldBox(title) {
            TextField("", text: value)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Brand.onBoard)
        }
    }

    /// Кнопка сохранения есть только когда есть что сохранять. В системной
    /// форме она стояла строкой всегда — то есть большую часть времени
    /// предлагала действие, которое ничего не делает.
    private var saveRow: some View {
        Button {
            Task { await save() }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: saved && !changed ? "checkmark" : "arrow.down.to.line")
                    .font(.system(size: 13, weight: .bold))
                Text(saved && !changed ? L("settings.saved") : L("common.save"))
                    .font(.system(size: 15, weight: .bold))
            }
            .foregroundStyle(Brand.onLime)
            .loading(saving, tint: Brand.onLime, size: 20, title: L("common.saving"))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .background(Brand.lime, in: .rect(cornerRadius: 20))
        }
        .buttonStyle(.press)
        .disabled(saving || !changed)
        .opacity(changed || saving ? 1 : 0.6)
        .transition(.scale(scale: 0.96).combined(with: .opacity))
    }

    // ══════════════════════════ переключатели ══════════════════════════

    private var switches: some View {
        VStack(spacing: 0) {
            if isOwner {
                toggleRow(
                    L("profile.pushEveryCar"),
                    L("profile.pushShiftNote"),
                    isOn: Binding(get: { notifyOrders }, set: { on in
                        notifyOrders = on
                        Task { await saveNotify(on) }
                    })
                )
            }

            if isOwner {
                Rectangle().fill(Brand.boardInk.opacity(0.07)).frame(height: 1)
            }
            toggleRow(
                L("profile.rememberLogin"),
                L("profile.rememberNote"),
                isOn: $session.rememberLogin
            )

            if lock.available {
                Rectangle().fill(Brand.boardInk.opacity(0.07)).frame(height: 1)
                toggleRow(
                    L("lock.unlockWith", lock.kindName),
                    L("profile.lockNote"),
                    isOn: $lock.enabled
                )
            }
        }
        .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 22))
    }

    // ══════════════════════════ язык ══════════════════════════

    /**
     * Выбор языка.
     *
     * Родной для системы `Menu` со списком и галочкой, а не ряд из трёх
     * кнопок: языков будет больше трёх раньше, чем кажется, а ряд кнопок
     * ломается уже на четвёртой.
     *
     * Каждый язык подписан своим словом — «Русский», а не «RU» и не флагом.
     * Флаг это страна, а не язык; человек, случайно попавший в чужой
     * интерфейс, ищет глазами СВОЁ слово, и перевод чужого ему не поможет.
     *
     * Переключение мгновенное: экран остаётся тот же, ввод не теряется,
     * из аккаунта никто не выходит.
     */
    private var language: some View {
        Menu {
            Picker(L("common.language"), selection: languageBinding) {
                ForEach(Lang.allCases, id: \.self) { option in
                    Text(option.ownName).tag(option)
                }
            }
            .pickerStyle(.inline)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "globe")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Brand.grape)
                Text(L("common.language"))
                    .font(.system(size: 14.5, weight: .semibold))
                    .foregroundStyle(Brand.onBoard)
                Spacer(minLength: 8)
                Text(lang.current.ownName)
                    .font(.system(size: 14))
                    .foregroundStyle(Brand.boardMuted)
                    .lineLimit(1)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Brand.boardMuted)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity)
        }
        .accessibilityLabel(L("common.language"))
        .accessibilityValue(lang.current.ownName)
    }

    private var languageBinding: Binding<Lang> {
        Binding(get: { lang.current }, set: { lang.set($0) })
    }

    private func toggleRow(_ title: String, _ note: String, isOn: Binding<Bool>) -> some View {
        Toggle(isOn: isOn) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 14.5, weight: .semibold))
                    .foregroundStyle(Brand.onBoard)
                Text(note)
                    .font(.system(size: 11.5))
                    .foregroundStyle(Brand.boardMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .tint(Brand.good)
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }

    // ══════════════════════════ действия ══════════════════════════

    private var actions: some View {
        VStack(spacing: 0) {
            /* Код, номер, устройства и выгрузка — один список учётной записи.
               Общая поверхность делает экран короче и яснее, не пряча ни одного действия. */
            VStack(spacing: 0) {
                if !session.phoneVerified {
                    action(L("auth.verifyPhone"), L("auth.verifyPhoneWhy"),
                           icon: "checkmark.shield", danger: false) {
                        verifyingPhone = true
                    }
                    profileDivider
                }

                action(session.hasPin ? L("auth.changePin") : L("auth.setPin"),
                       session.hasPin ? L("profile.pinNote") : L("auth.pinNoneNote"),
                       icon: "lock.rotation", danger: false) {
                    changingPin = true
                }

                profileDivider
                action(L("auth.changePhone"), L("auth.changePhoneNote"),
                       icon: "phone.arrow.up.right", danger: false) {
                    changingPhone = true
                }

                profileDivider
                NavigationLink {
                    DevicesView().navigationTitle(L("profile.devices"))
                } label: {
                    actionFace(L("profile.devices"), L("profile.devicesNote"),
                               icon: "laptopcomputer.and.iphone", danger: false,
                               leadsSomewhere: true)
                }
                .buttonStyle(.press)

                if isOwner {
                    profileDivider
                    exportRow
                }
            }
            .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 22))

            if isOwner {
                action(L("billing.wallDelete"), L("profile.deleteNote"),
                       icon: "trash", danger: true) {
                    deleting = true
                }
                .background(Brand.badOnBoard.opacity(0.075), in: .rect(cornerRadius: 20))
                .padding(.top, 12)
            }
        }
        .padding(.top, 2)
    }

    /**
     * Выгрузка данных.
     *
     * Переехала сюда с карты разделов. Там она была единственным действием
     * среди мест, куда переходят, и стояла последней просто потому, что
     * больше её девать было некуда. Здесь она среди своих: код, устройства,
     * выход, удаление бизнеса — всё это про учётку и то, что ей
     * принадлежит.
     *
     * Только владельцу: раздел «Ավելին» есть лишь у него, и вместе с
     * переездом строка могла бы достаться мойщику, у которого профиль тоже
     * есть. Выгрузка — это вся касса за месяц, и открывать её тому, кто
     * видит только свою смену, нельзя.
     *
     * Файл отдаётся системе: дальше человек сам решает — отправить себе в
     * почту, положить в «Файлы», открыть в Excel. Приложению не нужно
     * знать, что он с ним сделает.
     */
    private var exportRow: some View {
        Button {
            Task { await exportCsv() }
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "square.and.arrow.up")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Brand.grape)
                    .frame(width: 22)
                VStack(alignment: .leading, spacing: 1) {
                    Text(exporting ? L("common.preparing") : L("more.export"))
                        .font(.system(size: 14.5, weight: .semibold))
                        .foregroundStyle(Brand.onBoard)
                    /* Подзаголовок и есть место ответа: не получилось —
                       строка говорит это здесь же, повтор тем же касанием. */
                    Text(exportFailed ? L("common.failed") : L("more.exportLead"))
                        .font(.system(size: 11.5))
                        .foregroundStyle(exportFailed ? Brand.badOnBoard : Brand.boardMuted)
                }
                Spacer(minLength: 0)
                /* Загрузчик на месте шеврона, а не вместо надписи: надпись
                   не должна прыгать под пальцем, пока сервер собирает
                   файл. */
                if exporting { TetrLoader(size: 18, tint: Brand.grape) }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(.press)
        .disabled(exporting)
    }

    private func exportCsv() async {
        exporting = true
        exportFailed = false
        defer { exporting = false }

        /* Провал называется провалом. Молчаливый `return` оставлял
           человека гадать, готовится файл или уже нет. */
        guard let data = try? await session.authed({ token in
            try await APIClient.shared.raw("export?days=30", token: token)
        }) else {
            exportFailed = true
            return
        }

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("tetr-\(Int(Date().timeIntervalSince1970)).csv")
        guard (try? data.write(to: url)) != nil else {
            exportFailed = true
            return
        }
        exported = url
    }

    private func action(
        _ title: String,
        _ note: String,
        icon: String,
        danger: Bool,
        run: @escaping () -> Void
    ) -> some View {
        Button(action: run) {
            actionFace(title, note, icon: icon, danger: danger)
        }
        .buttonStyle(.press)
    }

    /// Лицо строки-действия, без самой кнопки.
    ///
    /// Отдельно от `action`, потому что часть строк не действия, а
    /// переходы: `NavigationLink` рисует своё нажатие сам, и обернуть его
    /// в `Button` значило бы получить две кнопки одна в другой.
    private func actionFace(
        _ title: String,
        _ note: String,
        icon: String,
        danger: Bool,
        /// Шеврон только у переходов. У «выйти» он обещал бы экран, которого
        /// нет: это действие, а не место, куда идут.
        leadsSomewhere: Bool = false
    ) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(danger ? Brand.badOnBoard : Brand.grape)
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .font(.system(size: 14.5, weight: .semibold))
                    .foregroundStyle(danger ? Brand.badOnBoard : Brand.onBoard)
                if !note.isEmpty {
                    Text(note)
                        .font(.system(size: 11.5))
                        .foregroundStyle(Brand.boardMuted)
                        .fixedSize(horizontal: false, vertical: true)
                        .multilineTextAlignment(.leading)
                }
            }
            Spacer(minLength: 0)
            if leadsSomewhere {
                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(Brand.boardMuted.opacity(0.6))
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var profileDivider: some View {
        Rectangle()
            .fill(Brand.boardInk.opacity(0.07))
            .frame(height: 1)
            .padding(.leading, 50)
    }

    // ══════════════════════════ данные ══════════════════════════

    private var changed: Bool {
        businessName != (session.tenant?.name ?? "") || myName != (session.me?.name ?? "")
    }

    private func save() async {
        saving = true
        defer { saving = false }
        saved = false
        saveFailed = false

        /*
         * Галочка только после удачи.
         *
         * Раньше `saved` вставало после любой попытки, включая
         * оборвавшуюся: человек видел «Сохранено», уходил с экрана, и имя
         * оставалось прежним. Это хуже молчания — молчание заставляет
         * проверить, а ложное подтверждение отменяет саму мысль проверять.
         */
        do {
            try await session.saveProfile(
                name: myName == (session.me?.name ?? "") ? nil : myName,
                businessName: isOwner && businessName != (session.tenant?.name ?? "")
                    ? businessName : nil
            )
            saved = true
        } catch {
            saveFailed = true
        }
    }

    private func saveNotify(_ on: Bool) async {
        /* Переключатель не имеет права остаться в положении, которое до
           сервера не доехало: молчаливый `try?` оставлял его включённым,
           а уведомления продолжали ходить по-старому. Не прошло —
           возвращаем на место; сам откат и есть видимый ответ. */
        do {
            _ = try await session.authed { token in
                try await APIClient.shared.raw(
                    "push/settings",
                    method: "POST",
                    body: ["orders": on],
                    token: token
                )
            }
        } catch {
            notifyOrders = !on
            UINotificationFeedbackGenerator().notificationOccurred(.error)
        }
    }

    /**
     * Состояние доступа — датой, а не обратным отсчётом.
     *
     * Было «Փորձնական · 6 օր»: слово «пробный» и тающий счётчик вместе
     * читаются как «скоро платить», то есть как начало платного пути внутри
     * приложения. Правила App Store (3.1.3f) разрешают держать оплату вне
     * приложения ровно при условии, что внутри нет ни покупки, ни
     * подталкивания к ней.
     *
     * Дата отвечает на тот же вопрос — до какого числа работает, — и
     * отвечает точнее: «6 дней» человек всё равно про себя переводит в
     * число. Пробный от оплаченного при этом не отличается никак, и это
     * честно: для того, кто пользуется, разницы и нет.
     */
    static func plan(_ a: API.Access) -> String {
        switch a.state {
        case "trial", "active":
            let until = Calendar.current.date(byAdding: .day, value: a.daysLeft, to: Date())
            guard let until else { return L("profile.available") }
            let f = DateFormatter()
            f.locale = LangStore.currentLang.locale
            f.setLocalizedDateFormatFromTemplate("d MMMM")
            return L("profile.availableUntil", f.string(from: until))
        case "expired": return L("billing.expiredTitle")
        default: return L("points.closed")
        }
    }
}

/**
 * Лист обмена системы.
 *
 * Живёт рядом с выгрузкой, потому что она главный его повод, но нужен ещё
 * двоим: удалению бизнеса и экрану истёкшего доступа. Там и там человеку
 * сначала отдают копию данных, и только потом закрывают дверь.
 */
extension URL: @retroactive Identifiable {
    public var id: String { absoluteString }
}

struct ShareSheet: UIViewControllerRepresentable {
    let url: URL

    /// Сохранил файл или передумал.
    ///
    /// Нужно там, где за передачей файла следует необратимое действие:
    /// закрытый крестиком лист обмена не должен считаться сохранением,
    /// иначе человек лишится и данных, и копии.
    var onFinish: ((Bool) -> Void)?

    func makeUIViewController(context: Context) -> UIActivityViewController {
        let controller = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        controller.completionWithItemsHandler = { _, completed, _, _ in onFinish?(completed) }
        return controller
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

/// Плитка доступа: янтарная, когда срок подходит, и обычная утопленная,
/// когда всё в порядке. Вынесено в модификатор, потому что `tile(_:)` и
/// `background(_:in:)` дают разные типы и в тернарнике не сходятся.
private struct AccessSkin: ViewModifier {
    let warn: Bool

    func body(content: Content) -> some View {
        if warn {
            content.tile(.amber, radius: 22, pad: 16)
        } else {
            content
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 22))
        }
    }
}

/**
 * Код доступа: создать, изменить, удалить.
 *
 * Постоянный код, которым входят без SMS. Кода из сообщения он не
 * заменяет и с ним не путается: у них разные имена, и это правило,
 * которое экран обязан держать так же, как вход.
 *
 * Текущий спрашивается обязательно и при изменении, и при удалении:
 * телефон может лежать разблокированным на столе, и оба этих действия
 * без подтверждения означали бы, что случайный человек рядом отбирает
 * аккаунт целиком.
 *
 * ОДНО ИСКЛЮЧЕНИЕ: кода нет вовсе. Так живут заведённые по коду из SMS —
 * входят они сообщением, и `pin_hash` у них помечен «кода нет».
 * Спрашивать у них текущий значит задать вопрос без верного ответа.
 * Решает не этот экран, а сервер — по хешу в базе; экран лишь не
 * показывает поле, которого не заполнить.
 *
 * Удаление возвращает человека ровно в это состояние. Запертым он не
 * остаётся: вход по коду из SMS работает на любой номер, а подтверждение
 * удаления бизнеса само переходит на SMS.
 *
 * Длина берётся из `API.pinLength`. Стояла четвёрка, а сервер требует
 * шесть: смена кода не работала ни у кого, кто завёл его после перехода
 * на шестизначный, и отвечала общей ошибкой.
 */
struct PinChangeView: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss

    @State private var current = ""
    @State private var next = ""
    @State private var again = ""
    @State private var error: String?
    @State private var busy = false
    /// Человек нажал «удалить» и ещё не подтвердил.
    @State private var confirmingDelete = false

    /// Есть ли что менять. Нет — экран создаёт код впервые.
    private var changing: Bool { session.hasPin }

    /// Достаточно ли введено, чтобы удалить: нового кода тут не нужно,
    /// нужен только текущий.
    private var readyToDelete: Bool {
        !busy && current.count >= API.pinMinLength
    }

    private var ready: Bool {
        guard !busy, next.count == API.pinLength, next == again else { return false }
        /* Ввод СУЩЕСТВУЮЩЕГО кода не ограничен шестью: у заведённых до
           перехода их четыре, и требовать шесть значило бы запереть их
           снаружи собственного профиля. */
        return changing ? current.count >= API.pinMinLength : true
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Brand.board.ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        VStack(alignment: .leading, spacing: 12) {
                            ZStack {
                                RoundedRectangle(cornerRadius: 18, style: .continuous)
                                    .fill(Brand.grape.opacity(0.12))
                                    .frame(width: 58, height: 58)
                                Image(systemName: "key.horizontal.fill")
                                    .font(.system(size: 22, weight: .semibold))
                                    .foregroundStyle(Brand.grape)
                            }

                            Text(changing ? L("auth.changePin") : L("auth.setPin"))
                                .font(.system(size: 27, weight: .bold, design: .rounded))
                                .foregroundStyle(Brand.onBoard)

                            Text(changing ? L("profile.pinChangedNote") : L("auth.pinMemo"))
                                .font(.system(size: 15))
                                .foregroundStyle(Brand.boardMuted)
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        VStack(spacing: 0) {
                            if changing {
                                pin(L("auth.currentPin"), $current)
                                divider
                            }
                            pin(L("auth.newPin"), $next)
                            divider
                            pin(L("common.retry"), $again)
                        }
                        .padding(.horizontal, 17)
                        .background(Brand.boardSurface, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 24, style: .continuous)
                                .strokeBorder(Brand.boardInk.opacity(0.07))
                        }

                        if !again.isEmpty && next != again {
                            Label(L("auth.pinMismatch"), systemImage: "exclamationmark.circle.fill")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(Brand.badOnBoard)
                        } else if !changing {
                            Text(L("auth.pinNoneNote"))
                                .font(.system(size: 13))
                                .foregroundStyle(Brand.boardMuted)
                        }

                        if let error {
                            Label(error, systemImage: "exclamationmark.circle.fill")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(Brand.badOnBoard)
                                .padding(16)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Brand.badOnBoard.opacity(0.09), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        }

                        if changing {
                            VStack(alignment: .leading, spacing: 12) {
                                Text(L("auth.deleteAccessCodeNote"))
                                    .font(.system(size: 13))
                                    .foregroundStyle(Brand.boardMuted)

                                Button(L("auth.deleteAccessCode"), role: .destructive) {
                                    confirmingDelete = true
                                }
                                .font(.system(size: 15, weight: .semibold))
                                .disabled(!readyToDelete)
                            }
                            .padding(17)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Brand.badOnBoard.opacity(0.065), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 18)
                    .padding(.bottom, 116)
                }
                .scrollDismissesKeyboard(.interactively)
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                Button(changing ? L("common.edit") : L("common.save")) {
                    Task { await change() }
                }
                .buttonStyle(LimeButton(loading: busy, busyTitle: L("common.saving")))
                .disabled(!ready)
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
                .background(.ultraThinMaterial)
            }
            .confirmationDialog(
                L("auth.deleteAccessCodeAsk"),
                isPresented: $confirmingDelete,
                titleVisibility: .visible
            ) {
                Button(L("auth.deleteAccessCode"), role: .destructive) {
                    Task { await remove() }
                }
                Button(L("common.cancel"), role: .cancel) {}
            } message: {
                Text(L("auth.deleteAccessCodeNote"))
            }
            .navigationTitle(changing ? L("auth.changePin") : L("auth.setPin"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L("common.close")) { dismiss() }.disabled(busy)
                }
            }
        }
    }

    private var divider: some View {
        Rectangle()
            .fill(Brand.boardInk.opacity(0.07))
            .frame(height: 1)
    }

    /**
     * Строка кода: подпись слева, точки справа.
     *
     * Не `LabeledContent`: он отдаёт полю фиксированную долю строки и
     * режет подпись многоточием — «Текущий код дост…». После
     * переименования PIN в код доступа подписи стали длиннее, и обрезалась
     * ровно та, по которой человек отличает текущий код от нового.
     * Здесь подпись берёт себе всё, что ей нужно, а поле — остаток.
     */
    private func pin(_ title: String, _ value: Binding<String>) -> some View {
        HStack(spacing: 12) {
            Text(title)
                .lineLimit(1)
                .minimumScaleFactor(0.85)
                .layoutPriority(1)

            SecureField("••••••", text: value)
                .keyboardType(.numberPad)
                .multilineTextAlignment(.leading)
                .monospaced()
                .onChange(of: value.wrappedValue) { _, v in
                    let clean = String(v.filter(\.isNumber).prefix(API.pinLength))
                    if clean != v { value.wrappedValue = clean }
                }
        }
        .frame(minHeight: 58)
    }

    private func change() async {
        busy = true
        defer { busy = false }
        error = nil

        do {
            try await session.changePin(current: changing ? current : "", next: next)
            dismiss()
        } catch let e as APIError {
            current = ""
            switch e.code {
            case "WRONG_CREDENTIALS": error = L("auth.wrongPin")
            case "TOO_MANY_TRIES": error = L("auth.throttled")
            case "PIN_WEAK":
                error = e.reason == "TRIVIAL_PIN" ? L("auth.pinTrivial") : L("auth.pinMemo")
            default: error = e.isOffline ? L("errors.offline") : L("payroll.failed")
            }
        } catch {
            self.error = L("payroll.failed")
        }
    }

    /// Убрать код доступа. Разбор отказов тот же, что у изменения: там и
    /// здесь сервер отвечает про один и тот же введённый код.
    private func remove() async {
        busy = true
        defer { busy = false }
        error = nil

        do {
            try await session.deletePin(current: current)
            dismiss()
        } catch let e as APIError {
            current = ""
            switch e.code {
            case "WRONG_CREDENTIALS": error = L("auth.wrongPin")
            case "TOO_MANY_TRIES": error = L("auth.throttled")
            default: error = e.isOffline ? L("errors.offline") : L("payroll.failed")
            }
        } catch {
            self.error = L("payroll.failed")
        }
    }
}
