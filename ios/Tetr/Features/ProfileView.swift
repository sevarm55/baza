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

    @State private var changingPassword = false
    @State private var notifyOrders = true
    @State private var deleting = false

    @State private var exporting = false
    @State private var exported: URL?
    /// Поля заполнены значениями сессии: до этого сравнивать их с ней
    /// нельзя — пустое поле не «изменение», а ещё не загруженное.
    @State private var filled = false
    /// Выгрузка не получилась. Раньше провал был молчаливым: три guard
    /// подряд выходили без единого слова, и человек не знал, ждать ли файл.
    @State private var exportFailed = false


    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dismiss) private var dismiss

    private var isOwner: Bool { session.me?.isOwner == true }

    private let gap: CGFloat = 10

    /// Высота шапки под полосой статуса: фото, имя и номер.
    private let brow: CGFloat = 114

    var body: some View {
        ScrollView {
            VStack(spacing: gap) {
                identityCard

                if let access = session.access { accessTile(access) }

                identitySettings

                if saveFailed {
                    Text(L("common.failed"))
                        .font(.system(size: 13))
                        .foregroundStyle(Brand.warnOnBoard)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 6)
                }

                switches
                actions
            }
            .padding(.horizontal, 16)
            .padding(.top, 6)
            .padding(.bottom, 28)
            .animation(reduceMotion ? nil : .spring(response: 0.32, dampingFraction: 0.86), value: changed)
            .animation(.easeOut(duration: Motion.normal), value: saved)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .meshPage()
        .brandTitleFont()
        .navigationTitle(L("more.profileLead"))
        .navigationSubtitle(session.tenant?.name ?? "")
        .toolbarTitleDisplayMode(.inlineLarge)
        /* Сохранение прижато ко дну, а не строкой посреди списка.
           Кнопка появлялась между полями и переключателями и уезжала за
           край, как только человек долистывал до устройств: правку имени
           было видно, а чем её закончить — нет. */
        .safeAreaInset(edge: .bottom) {
            if changed || saving {
                saveRow
                    .padding(.horizontal, 16)
                    .padding(.bottom, 6)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .sheet(isPresented: $changingPassword) { PasswordChangeView() }
        .sheet(isPresented: $deleting) { DeleteBusinessView() }
        .sheet(item: $exported) { url in ShareSheet(url: url) }
        .task {
            businessName = session.tenant?.name ?? ""
            myName = session.me?.name ?? ""
            notifyOrders = session.me?.notifyOrders ?? true
            filled = true
        }
    }

    // ══════════════════════════ кто я ══════════════════════════

    /**
     * Кто вошёл — карточкой в потоке, а не шапкой во весь верх.
     *
     * Фото во всю ширину с оттягиванием отсюда убрано. Профиль в этом
     * продукте не витрина человека, а место, где правят имя, язык и
     * доступ; большая фотография обещала первое, а экран делал второе, и
     * до первой настройки приходилось листать полэкрана картинки.
     *
     * Кружок остался: человека везде рисуют круглым, и по цвету его
     * узнают в ленте, на смене и в зарплатах. Своей карточки у людей
     * пока нет — вместо неё общий снимок, тёмный шёлк с лаймовой
     * полосой; заглушка стоит на месте ЧУЖОГО лица и ничего о человеке
     * не утверждает.
     */
    private var identityCard: some View {
        let name = session.me?.name ?? "—"
        return HStack(spacing: 14) {
            face(name: name, tone: Brand.personTone(name), side: 56)
                .frame(width: 56, height: 56)
                .clipShape(.circle)
                .overlay(Circle().strokeBorder(Brand.ink.opacity(0.08), lineWidth: 1))

            VStack(alignment: .leading, spacing: 2) {
                Text(name)
                    .font(.system(size: 19, weight: .bold))
                    .foregroundStyle(Brand.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                Text(meta)
                    .font(.system(size: 13))
                    .monospacedDigit()
                    .foregroundStyle(Brand.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }

            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .paperCard(24)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(name)
        .accessibilityValue(meta)
    }

    /// Логин и мойка одной строкой. Логин первым: он про человека, мойка —
    /// про место, и человек здесь главный. Правке он не поддаётся: сменить
    /// его значит сменить вход.
    ///
    /// У владельца логин это почта, у сотрудника телефон. Пока здесь стоял
    /// один телефон, владелец читал в шапке своего профиля не ту строку,
    /// которой входит.
    private var meta: String {
        [session.me?.email ?? session.me?.phone ?? "", session.tenant?.name ?? ""]
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
     * Состояние доступа — плиткой, а не строкой в списке.
     *
     * Янтарной, когда срок подходит: это единственное на экране, из-за чего
     * приложение однажды перестанет работать, и оно не должно выглядеть как
     * ещё одна настройка.
     */
    private func accessTile(_ access: API.Access) -> some View {
        let ink = access.warn ? Brand.warnOnBoard : Brand.goodOnBoard
        return HStack(spacing: 12) {
            Image(systemName: access.warn ? "exclamationmark.circle.fill" : "checkmark.circle.fill")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(ink)
            VStack(alignment: .leading, spacing: 1) {
                Text(L("auth.signInTitle"))
                    .font(.system(size: 12))
                    .foregroundStyle(access.warn ? ink.opacity(0.75) : Brand.muted)
                Text(Self.plan(access))
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(access.warn ? ink : Brand.ink)
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
                .fill(Brand.ink.opacity(0.07))
                .frame(height: 1)
                .padding(.leading, 16)
            language
        }
        .paperCard(22)
    }

    private var fields: some View {
        VStack(spacing: 0) {
            if isOwner {
                field(L("settings.business"), $businessName)
                Rectangle().fill(Brand.ink.opacity(0.07)).frame(height: 1)
            }
            field(L("owner.clientName"), $myName)

            /* Валюта: выбор, пока в мойке пусто, и надпись после.
             *
             * Спрашивается здесь, а не на регистрации. До перехода по
             * ссылке из письма мойки ещё не существует, и всё, что человек
             * выбрал до этого, пропадает вместе с заявкой, если он до
             * почты не дошёл.
             *
             * Как только записаны первые деньги — машина, расход,
             * выплата или абонемент, — выбор закрывается навсегда: все
             * суммы лежат в валюте, сменить её значило бы объявить
             * вчерашние двенадцать тысяч драм двенадцатью тысячами
             * долларов. Пересчитать не по чему, а оставить как есть —
             * смешать в одном отчёте разные деньги. Запрет держит
             * сервер; экран только перестаёт предлагать.
             */
            if isOwner, let code = session.tenant?.currency {
                Rectangle().fill(Brand.ink.opacity(0.07)).frame(height: 1)

                if session.tenant?.currencyLocked == true {
                    HStack {
                        Text(L("profile.currency"))
                            .font(.system(size: 13))
                            .foregroundStyle(Brand.muted)
                        Spacer(minLength: 8)
                        Text("\(Money.symbol(code))\u{202F}\(code)")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Brand.ink)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                } else {
                    currencyPicker(code)
                }
            }
        }
    }

    /**
     * Ряд валют, пока их ещё можно менять.
     *
     * Не выпадающий список: вариантов пять, и список ради пяти пунктов —
     * это лишнее нажатие и закрытая от глаз строка выбора. Ряд отвечает
     * на вопрос «а что вообще есть» до того, как его задали.
     *
     * Сохраняется сразу по нажатию, без общей кнопки: выбор один, и
     * заставлять человека искать «сохранить» ради одного нажатия значит
     * придумывать ему работу.
     */
    private func currencyPicker(_ current: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(L("onboarding.currency"))
                .font(.system(size: 11, weight: .semibold))
                .tracking(0.6)
                .foregroundStyle(Brand.muted)

            HStack(spacing: 6) {
                ForEach(Money.currencies, id: \.self) { code in
                    let on = code == current
                    Button {
                        Task { await pickCurrency(code) }
                    } label: {
                        VStack(spacing: 1) {
                            Text(Money.symbol(code))
                                .font(.system(size: 15, weight: .bold))
                            Text(code)
                                .font(.system(size: 9, weight: .semibold))
                                .opacity(0.7)
                        }
                        .foregroundStyle(on ? Brand.grapeDeep : Brand.ink.opacity(0.7))
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                        .background(
                            on ? Brand.lime : Brand.ink.opacity(0.06),
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
                .foregroundStyle(Brand.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }

    private func pickCurrency(_ code: String) async {
        guard code != session.tenant?.currency else { return }
        try? await session.saveProfile(name: nil, businessName: nil, currency: code)
    }

    /**
     * Поле настройки: имя слева, значение справа.
     *
     * Подсказкой внутри поля имя тут быть не может, в отличие от форм
     * заведения: эти поля всегда заполнены, и подсказка исчезла бы
     * вместе с первым же значением — остались бы два слова подряд без
     * ответа на вопрос, где имя мойки, а где имя человека. Строка «имя
     * слева, значение справа» — та же, что у валюты и языка ниже, и
     * весь блок читается одним списком настроек.
     */
    private func field(_ title: String, _ value: Binding<String>) -> some View {
        HStack(spacing: 12) {
            Text(title)
                .font(.system(size: 15))
                .foregroundStyle(Brand.muted)
                .lineLimit(1)

            Spacer(minLength: 8)

            TextField(title, text: value)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Brand.ink)
                .multilineTextAlignment(.trailing)
                .lineLimit(1)
        }
        .padding(.horizontal, 16)
        .frame(height: 56)
        .contentShape(.rect)
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
                    .font(.system(size: 15, weight: .bold))
                Text(saved && !changed ? L("settings.saved") : L("common.save"))
            }
        }
        .buttonStyle(LimeButton(loading: saving, busyTitle: L("common.saving")))
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
                Rectangle().fill(Brand.ink.opacity(0.07)).frame(height: 1)
            }
            toggleRow(
                L("profile.rememberLogin"),
                L("profile.rememberNote"),
                isOn: $session.rememberLogin
            )

            if lock.available {
                Rectangle().fill(Brand.ink.opacity(0.07)).frame(height: 1)
                toggleRow(
                    L("lock.quickSignIn", lock.kindName),
                    L("profile.lockNote"),
                    isOn: $lock.enabled
                )
            }
        }
        .paperCard(22)
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
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Brand.ink)
                Spacer(minLength: 8)
                Text(lang.current.ownName)
                    .font(.system(size: 14))
                    .foregroundStyle(Brand.muted)
                    .lineLimit(1)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Brand.muted)
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
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Brand.ink)
                Text(note)
                    .font(.system(size: 12))
                    .foregroundStyle(Brand.muted)
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
                action(L("auth.changePassword"), L("auth.passwordChangedNote"),
                       icon: "lock.rotation", danger: false) {
                    changingPassword = true
                }

                profileDivider
                NavigationLink {
                    DevicesView().navigationTitle(L("profile.devices"))
                        .navigationBarTitleDisplayMode(.inline)
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
            .paperCard(22)

            if isOwner {
                action(L("billing.wallDelete"), L("profile.deleteNote"),
                       icon: "trash", danger: true) {
                    deleting = true
                }
                .background(Brand.badOnBoard.opacity(0.075), in: .rect(cornerRadius: 22, style: .continuous))
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
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Brand.ink)
                    /* Подзаголовок и есть место ответа: не получилось —
                       строка говорит это здесь же, повтор тем же касанием. */
                    Text(exportFailed ? L("common.failed") : L("more.exportLead"))
                        .font(.system(size: 12))
                        .foregroundStyle(exportFailed ? Brand.badOnBoard : Brand.muted)
                }
                Spacer(minLength: 0)
                /* Загрузчик на месте шеврона, а не вместо надписи: надпись
                   не должна прыгать под пальцем, пока сервер собирает
                   файл. */
                if exporting { TetrLoader(size: 18, tint: Brand.grape) }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(.rect)
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
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(danger ? Brand.badOnBoard : Brand.ink)
                if !note.isEmpty {
                    Text(note)
                        .font(.system(size: 12))
                        .foregroundStyle(Brand.muted)
                        .fixedSize(horizontal: false, vertical: true)
                        .multilineTextAlignment(.leading)
                }
            }
            Spacer(minLength: 0)
            if leadsSomewhere {
                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(Brand.muted.opacity(0.6))
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(.rect)
    }

    private var profileDivider: some View {
        Rectangle()
            .fill(Brand.ink.opacity(0.07))
            .frame(height: 1)
            .padding(.leading, 50)
    }

    // ══════════════════════════ данные ══════════════════════════

    /**
     * Есть ли что сохранять.
     *
     * `filled` обязателен. До `.task` поля пустые, а имена в сессии
     * есть — то есть «изменилось» было правдой уже в первое мгновение
     * экрана, и лаймовая кнопка сохранения успевала мигнуть посреди
     * перехода. Владелец увидел это на записи: «зелёная кнопка, даже
     * непонятно какая, резко исчезает».
     */
    private var changed: Bool {
        guard filled else { return false }
        return businessName != (session.tenant?.name ?? "") || myName != (session.me?.name ?? "")
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

    /**
     * Светлый янтарь, а не тёмная плита.
     *
     * Плитка с чёрно-коричневым градиентом и свечением пришла из прежнего
     * языка приборной панели. На белом листе профиля она читалась куском
     * другого приложения: единственное тёмное пятно среди бумажных
     * карточек, и притом не самое важное на экране. Теперь это такая же
     * карточка, только залитая янтарём в одну десятую — тем же, каким на
     * смене помечено предупреждение о временном коде.
     */
    func body(content: Content) -> some View {
        content
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                warn ? AnyShapeStyle(Brand.warnOnBoard.opacity(0.10)) : AnyShapeStyle(Brand.paper),
                in: .rect(cornerRadius: 22, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .strokeBorder(
                        warn ? Brand.warnOnBoard.opacity(0.18) : Brand.ink.opacity(0.07),
                        lineWidth: 1
                    )
            }
            .shadow(color: Brand.ink.opacity(warn ? 0 : 0.05), radius: 12, y: 6)
    }
}

/**
 * Смена пароля.
 *
 * Пришла на место смены PIN. PIN был вторым ключом от входа, пока вход
 * держался на телефоне и коде из SMS; теперь входят логином и паролем, и
 * второго ключа не осталось — остался один, и меняют именно его.
 *
 * Текущий спрашивается обязательно: человек уже вошёл, но телефон лежит
 * на мойке разблокированным, и сменить чужой пароль, взяв трубку со
 * стола, было бы слишком просто.
 *
 * Повтор нового ловит опечатку. Пароль набирают вслепую, и после смены
 * все остальные устройства выходят: ошибиться здесь значит запереть себя
 * снаружи собственной мойки.
 */
struct PasswordChangeView: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss

    @State private var current = ""
    @State private var next = ""
    @State private var again = ""
    @State private var shown = false
    @State private var error: String?
    @State private var busy = false

    private var ready: Bool {
        /* Длину нового проверяет сервер — правило про восемь знаков живёт
           там. Здесь гасим кнопку только на пустых полях и на расхождении
           повтора: ругаться на четвёртом знаке значит ругаться на
           человека, который ещё печатает. */
        !busy && !current.isEmpty && !next.isEmpty && next == again
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

                            Text(L("auth.changePassword"))
                                .font(.system(size: 27, weight: .bold, design: .rounded))
                                .foregroundStyle(Brand.ink)

                            Text(L("auth.passwordChangedNote"))
                                .font(.system(size: 15))
                                .foregroundStyle(Brand.muted)
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        VStack(spacing: 0) {
                            secret(L("auth.currentPassword"), $current)
                            divider
                            secret(L("auth.newPassword"), $next)
                            divider
                            secret(L("auth.confirmPassword"), $again)
                        }
                        .padding(.horizontal, 17)
                        .background(Brand.paper, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 22, style: .continuous)
                                .strokeBorder(Brand.ink.opacity(0.07))
                        }

                        if !again.isEmpty && next != again {
                            Label(L("auth.passwordMismatch"), systemImage: "exclamationmark.circle.fill")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(Brand.badOnBoard)
                        } else {
                            Text(L("auth.passwordHint"))
                                .font(.system(size: 13))
                                .foregroundStyle(Brand.muted)
                        }

                        if let error {
                            Label(error, systemImage: "exclamationmark.circle.fill")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(Brand.badOnBoard)
                                .padding(16)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Brand.badOnBoard.opacity(0.09), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 18)
                    .padding(.bottom, 116)
                }
                .scrollDismissesKeyboard(.interactively)
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                Button(L("auth.savePassword")) {
                    Task { await change() }
                }
                .buttonStyle(LimeButton(loading: busy, busyTitle: L("common.saving")))
                .disabled(!ready)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(.ultraThinMaterial)
            }
            .navigationTitle(L("auth.changePassword"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L("common.close")) { dismiss() }.disabled(busy)
                }
                /* Глаз в панели, а не у каждого поля: полей три, и три
                   глаза в столбик читаются как три разные настройки. */
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        shown.toggle()
                    } label: {
                        Image(systemName: shown ? "eye.slash" : "eye")
                    }
                    .accessibilityLabel(L(shown ? "auth.hidePassword" : "auth.showPassword"))
                }
            }
        }
    }

    private var divider: some View {
        Rectangle()
            .fill(Brand.ink.opacity(0.07))
            .frame(height: 1)
    }

    /// Строка пароля: подпись слева, поле справа. Подпись берёт себе
    /// столько, сколько ей нужно, а поле — остаток: `LabeledContent`
    /// режет подпись многоточием ровно там, где по ней и отличают
    /// текущий пароль от нового.
    private func secret(_ title: String, _ value: Binding<String>) -> some View {
        HStack(spacing: 12) {
            Text(title)
                .lineLimit(1)
                .minimumScaleFactor(0.85)
                .layoutPriority(1)

            Group {
                if shown {
                    TextField("", text: value)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } else {
                    SecureField("", text: value)
                }
            }
            .multilineTextAlignment(.leading)
        }
        .frame(minHeight: 58)
    }

    private func change() async {
        busy = true
        error = nil
        defer { busy = false }

        do {
            try await session.changePassword(current: current, next: next)
            dismiss()
        } catch let e as APIError {
            switch e.code {
            case "WRONG_CREDENTIALS": error = L("auth.wrongPassword")
            case "PASSWORD_SHORT": error = L("auth.passwordShort")
            case "PASSWORD_COMMON": error = L("auth.passwordCommon")
            case "TOO_MANY_TRIES": error = L("auth.throttled")
            default: error = e.isOffline ? L("errors.offline") : L("payroll.failed")
            }
        } catch {
            self.error = L("payroll.failed")
        }
    }
}
