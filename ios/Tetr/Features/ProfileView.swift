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

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var isOwner: Bool { session.me?.isOwner == true }

    private let gap: CGFloat = 10

    var body: some View {
        ScrollView {
            VStack(spacing: gap) {
                card
                if let access = session.access { accessTile(access) }
                fields
                if changed || saved { saveRow }
                if saveFailed {
                    Text(L("common.failed"))
                        .font(.system(size: 13))
                        .foregroundStyle(Brand.warnOnBoard)
                        .padding(.horizontal, 6)
                }
                language
                switches
                actions
            }
            .padding(.horizontal, 12)
            .padding(.top, 8)
            .padding(.bottom, 28)
            .animation(reduceMotion ? nil : .spring(response: 0.32, dampingFraction: 0.86), value: changed)
            .animation(.easeOut(duration: 0.2), value: saved)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.board.ignoresSafeArea())
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

    /// Карточка человека цветом самого человека — тем же, каким его имя
    /// набрано в ленте и кружок на смене.
    private var card: some View {
        let name = session.me?.name ?? "—"
        let tone = Brand.personTone(name)

        return HStack(spacing: 14) {
            Text(String(name.prefix(1)))
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 56, height: 56)
                .background(.white.opacity(0.22), in: .circle)

            VStack(alignment: .leading, spacing: 2) {
                Text(name)
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Text(session.tenant?.name ?? "Tetrin")
                    .font(.system(size: 13))
                    .foregroundStyle(.white.opacity(0.75))
                    .lineLimit(1)
                // телефон не правится: это логин, и смена сломала бы вход
                Text(session.me?.phone ?? "—")
                    .font(.system(size: 12))
                    .monospacedDigit()
                    .foregroundStyle(.white.opacity(0.6))
            }
            Spacer(minLength: 0)
        }
        .tile(base: tone.base, glow: tone.glow, radius: 24, pad: 18)
        .accessibilityElement(children: .combine)
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

    private var fields: some View {
        VStack(spacing: 0) {
            if isOwner {
                field(L("settings.business"), $businessName)
                Rectangle().fill(Brand.boardInk.opacity(0.07)).frame(height: 1)
            }
            field(L("owner.clientName"), $myName)
        }
        .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 22))
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
            .loading(saving, tint: Brand.onLime, size: 20)
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
            .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 22))
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
        VStack(spacing: gap) {
            /* «Задать», а не «сменить», у тех, у кого кода нет вовсе:
               заведённые по SMS входят кодом из сообщения, и слово
               «сменить» обещало бы им вопрос про текущий код, которого
               не существует. Признак приходит с сервера, по хешу в базе
               (см. `hasPin` в bootstrap). */
            /* Неподтверждённый номер — дыра именно в безопасности: без
               него код не восстановить. Поэтому строка стоит НАД самим
               кодом, а не отдельным разделом в стороне. У подтверждённых
               здесь ни одного нового пикселя. */
            if !session.phoneVerified {
                action(L("auth.verifyPhone"), L("auth.verifyPhoneWhy"),
                       icon: "checkmark.shield", danger: false) {
                    verifyingPhone = true
                }
            }

            action(session.hasPin ? L("auth.changePin") : L("auth.setPin"),
                   session.hasPin ? L("profile.pinNote") : L("auth.pinNoneNote"),
                   icon: "lock.rotation", danger: false) {
                changingPin = true
            }

            /* Номер стоит здесь же, под кодом: это второй ключ от входа,
               а не строка личных данных. В карточке выше он показан
               просто значением — там отвечают на вопрос «как со мной
               связаться». */
            action(L("auth.changePhone"), L("auth.changePhoneNote"),
                   icon: "phone.arrow.up.right", danger: false) {
                changingPhone = true
            }

            /* Устройства стоят перед «выйти», а не после: сначала то, что
               можно закрыть у других, потом то, что закрывает себя. */
            NavigationLink {
                DevicesView().navigationTitle(L("profile.devices"))
            } label: {
                actionFace(L("profile.devices"), L("profile.devicesNote"),
                           icon: "laptopcomputer.and.iphone", danger: false,
                           leadsSomewhere: true)
            }
            .buttonStyle(.press)

            /* Копия данных стоит перед выходом и удалением, а не после:
               забрать её нужно ДО того, как закрылась дверь. */
            if isOwner { exportRow }

            if isOwner {
                /* С воздухом сверху: «стереть всё» не должно стоять
                   соседней строчкой ни к чему, где промах пальцем стоит
                   бизнеса. */
                action(L("billing.wallDelete"), L("profile.deleteNote"),
                       icon: "trash", danger: true) {
                    deleting = true
                }
                .padding(.top, 14)
            }

            /* Выхода здесь больше нет: он переехал на карту разделов, в
               самый низ. Причина простая — до профиля за ним нужно было
               заходить, а это два нажатия ради того, чем пользуются с
               чужого телефона и в спешке. Здесь остаётся то, что про
               учётку: код, номер, устройства, копия данных, удаление. */
        }
        .padding(.top, 4)
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
                    Text(L("more.exportLead"))
                        .font(.system(size: 11.5))
                        .foregroundStyle(Brand.boardMuted)
                }
                Spacer(minLength: 0)
                /* Загрузчик на месте шеврона, а не вместо надписи: надпись
                   не должна прыгать под пальцем, пока сервер собирает
                   файл. */
                if exporting { TetrLoader(size: 18, tint: Brand.grape) }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 22))
        }
        .buttonStyle(.press)
        .disabled(exporting)
    }

    private func exportCsv() async {
        exporting = true
        defer { exporting = false }

        guard let data = try? await session.authed({ token in
            try await APIClient.shared.raw("export?days=30", token: token)
        }) else { return }

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("tetr-\(Int(Date().timeIntervalSince1970)).csv")
        guard (try? data.write(to: url)) != nil else { return }
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
                .foregroundStyle(danger ? .red : Brand.grape)
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .font(.system(size: 14.5, weight: .semibold))
                    .foregroundStyle(danger ? .red : Brand.onBoard)
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
        .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 22))
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
        _ = try? await session.authed { token in
            try await APIClient.shared.raw(
                "push/settings",
                method: "POST",
                body: ["orders": on],
                token: token
            )
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
 * Смена PIN. И его установка впервые.
 *
 * Старый спрашивается обязательно: телефон может лежать разблокированным
 * на столе, и смена без подтверждения означала бы, что случайный человек
 * рядом отбирает аккаунт целиком.
 *
 * ОДНО ИСКЛЮЧЕНИЕ: кода нет вовсе. Так живут заведённые по коду из SMS —
 * входят они кодом, и `pin_hash` у них помечен «кода нет». Спрашивать у
 * них текущий значит задать вопрос без верного ответа, и второй двери у
 * них не появилось бы никогда. Решает не этот экран, а сервер — по хешу
 * в базе; экран лишь не показывает поле, которого не заполнить.
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

    /// Есть ли что менять. Нет — экран задаёт код впервые.
    private var changing: Bool { session.hasPin }

    private var ready: Bool {
        guard !busy, next.count == API.pinLength, next == again else { return false }
        /* Ввод СУЩЕСТВУЮЩЕГО кода не ограничен шестью: у заведённых до
           перехода их четыре, и требовать шесть значило бы запереть их
           снаружи собственного профиля. */
        return changing ? current.count >= API.pinMinLength : true
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    if changing { pin(L("auth.currentPin"), $current) }
                    pin(L("auth.newPin"), $next)
                    pin(L("common.retry"), $again)
                } footer: {
                    if !again.isEmpty && next != again {
                        Text(L("auth.pinMismatch")).foregroundStyle(.red)
                    } else if !changing {
                        Text(L("auth.pinNoneNote"))
                    }
                }

                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }

                Section {
                    Button(changing ? L("common.edit") : L("common.save")) {
                        Task { await change() }
                    }
                    .loading(busy, tint: Brand.grape, size: 18)
                    .disabled(!ready)
                } footer: {
                    /* Гашение сессий — следствие СМЕНЫ, а не установки.
                       Когда кода не было вовсе, отбирать нечего: человек
                       просто завёл себе вторую дверь, и обещать ему выход
                       со всех устройств было бы неправдой. */
                    Text(changing ? L("profile.pinChangedNote") : L("auth.pinMemo"))
                }
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

    private func pin(_ title: String, _ value: Binding<String>) -> some View {
        LabeledContent(title) {
            SecureField("••••••", text: value)
                .keyboardType(.numberPad)
                .multilineTextAlignment(.trailing)
                .monospaced()
                .onChange(of: value.wrappedValue) { _, v in
                    let clean = String(v.filter(\.isNumber).prefix(API.pinLength))
                    if clean != v { value.wrappedValue = clean }
                }
        }
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
}
