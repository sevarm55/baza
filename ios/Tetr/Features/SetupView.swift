import SwiftUI

/**
 * Начало работы — первый день внутри продукта.
 *
 * Не тур по вкладкам и не мастер из четырнадцати экранов, а ответ на
 * один вопрос: что сделать прямо сейчас. Продукт приходит настроенным —
 * при регистрации бизнес получает свои услуги, термины и роль
 * исполнителя, — поэтому объяснять здесь нечего, кроме следующего шага.
 *
 * Что выполнено, решает сервер по данным бизнеса (`lib/onboarding.ts`), а
 * не приложение по нажатиям: свои ли цены, есть ли мойщик, есть ли первая
 * запись. Поэтому шаг закрывается сам — и когда мойщика завели с сайта, и
 * когда машину записал не владелец.
 *
 * Блок собран из того же, из чего собран весь экран сводки: подложка
 * `boardSurface`, скругление 18, волосяная кромка, строки с разделителями.
 * Своего вида у онбординга нет намеренно — он живёт неделю, и продукт не
 * должен на эту неделю выглядеть иначе.
 */
struct SetupCard: View {
    let setup: API.Setup
    /// Перейти на вкладку смены: последний шаг — запись машины, а она
    /// живёт в своей вкладке, и вторую её копию поверх сводки открывать
    /// нельзя.
    let goToShift: () -> Void

    @EnvironmentObject private var session: Session

    var body: some View {
        VStack(spacing: 0) {
            head

            if setup.complete {
                whatIsNext
            } else {
                ForEach(setup.steps) { step in
                    row(step)
                    if step.id != setup.steps.last?.id {
                        Divider().overlay(Brand.boardInk.opacity(0.07))
                    }
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
        .background(Brand.boardSurface, in: .rect(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(Brand.boardInk.opacity(0.07), lineWidth: 0.8)
        }
        .padding(.top, 10)
    }

    // ─────────────────────────── шапка ───────────────────────────

    private var head: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(setup.complete ? L("setup.doneTitle") : L("setup.title"))
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Brand.onBoard)

            if !setup.complete {
                Text(L("setup.progress", setup.done, setup.total))
                    .font(.system(size: 12))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)
                bar
            }

            Spacer(minLength: 8)

            /* Убрать блок — тихая кнопка в углу, а не действие наравне с
               шагами: она ничего не делает с бизнесом. Страшного
               подтверждения нет, настройку всегда можно вернуть из
               разделов. */
            Button(setup.complete ? L("setup.doneHide") : L("setup.skip")) {
                Task { await session.hideSetup() }
            }
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(Brand.boardMuted)
            .buttonStyle(.press)
        }
        .padding(.horizontal, 4)
        .padding(.top, 14)
        .padding(.bottom, setup.complete ? 6 : 10)
    }

    /**
     * Полоса прогресса — волосок, а не индикатор загрузки.
     *
     * Толстая полоса поперёк карточки превратила бы список дел в игру с
     * очками. Здесь она отвечает боковым зрением на один вопрос — далеко
     * ли до конца, — а точное число стоит рядом словами.
     */
    private var bar: some View {
        let share = setup.total > 0 ? Double(setup.done) / Double(setup.total) : 0
        return GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Brand.boardInk.opacity(0.12))
                Capsule().fill(Brand.goodOnBoard).frame(width: geo.size.width * share)
            }
        }
        .frame(width: 46, height: 3)
    }

    // ─────────────────────────── шаги ───────────────────────────

    @ViewBuilder
    private func row(_ step: API.SetupStep) -> some View {
        let number = (setup.steps.firstIndex(of: step) ?? 0) + 1
        let now = !step.done && setup.next == step.key

        HStack(alignment: .center, spacing: 10) {
            mark(step, number: number)

            VStack(alignment: .leading, spacing: 2) {
                Text(name(step.key))
                    .font(.system(size: 14, weight: step.done ? .medium : .semibold))
                    /* Выполненное гаснет, но не зачёркивается:
                       зачёркнутый текст читается как ошибочный, а шаг
                       сделан правильно. */
                    .foregroundStyle(step.done ? Brand.boardMuted : Brand.onBoard)

                /* Объяснение только у следующего шага — того
                   единственного, к которому оно относится сейчас.
                   Развернуть все четыре значило бы поставить на главный
                   экран стену текста в тот единственный день, когда
                   человек ещё ничего про продукт не знает. */
                if now {
                    Text(note(step.key))
                        .font(.system(size: 13))
                        .foregroundStyle(Brand.boardMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            Spacer(minLength: 8)

            if !step.done {
                action(step.key, primary: now)
            }
        }
        .padding(.horizontal, 4)
        .padding(.vertical, 10)
    }

    /// Номер до выполнения, галочка после. Одного цвета для этой разницы
    /// мало: приложение открывают и на солнце.
    private func mark(_ step: API.SetupStep, number: Int) -> some View {
        ZStack {
            if step.done {
                Circle().fill(Brand.goodOnBoard.opacity(0.16))
                Image(systemName: "checkmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(Brand.goodOnBoard)
            } else {
                Circle().strokeBorder(Brand.boardInk.opacity(0.2), lineWidth: 1.5)
                Text("\(number)")
                    .font(.system(size: 11, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)
            }
        }
        .frame(width: 22, height: 22)
    }

    /**
     * Действие шага.
     *
     * Ведёт в настоящий раздел приложения, а не на следующий экран
     * мастера: цены правят там же, где их будут править каждый месяц.
     * Услуги и люди открываются переходом из этого же стека, запись
     * машины — переключением вкладки: экран смены корневой, и второй его
     * копии поверх сводки быть не должно.
     */
    @ViewBuilder
    private func action(_ key: String, primary: Bool) -> some View {
        switch key {
        case "services":
            NavigationLink {
                ServicesView().navigationTitle(L("settings.services"))
                    .navigationBarTitleDisplayMode(.inline)
            } label: {
                Text(L("setup.stepServicesCta")).modifier(SetupAction(primary: primary))
            }
            .buttonStyle(.press)

        case "staff":
            NavigationLink {
                StaffView().navigationTitle(L("more.team"))
                    .navigationBarTitleDisplayMode(.inline)
            } label: {
                Text(L("setup.stepStaffCta")).modifier(SetupAction(primary: primary))
            }
            .buttonStyle(.press)

        case "firstOrder":
            Button { goToShift() } label: {
                Text(L("setup.stepFirstCta")).modifier(SetupAction(primary: primary))
            }
            .buttonStyle(.press)

        default:
            EmptyView()
        }
    }

    // ─────────────────────── что будет дальше ───────────────────────

    /**
     * Конец настройки.
     *
     * Не праздник с конфетти, а сообщение о том, что дальше продукт
     * работает сам. Это последнее, что онбординг говорит владельцу, и
     * сказать он обязан не про кнопки, а про то, как теперь устроен его
     * день.
     */
    private var whatIsNext: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(L("setup.doneNote"))
                .font(.system(size: 13))
                .foregroundStyle(Brand.boardMuted)
                .fixedSize(horizontal: false, vertical: true)

            ForEach(nextLines, id: \.title) { line in
                VStack(alignment: .leading, spacing: 1) {
                    Text(line.title)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Brand.onBoard)
                    Text(line.note)
                        .font(.system(size: 13))
                        .foregroundStyle(Brand.boardMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 4)
        .padding(.bottom, 8)
    }

    private var nextLines: [(title: String, note: String)] {
        [
            (L("setup.nextWork"), L("setup.nextWorkNote")),
            (L("setup.nextMoney"), L("setup.nextMoneyNote")),
            (L("setup.nextControl"), L("setup.nextControlNote")),
            (L("setup.nextReports"), L("setup.nextReportsNote")),
        ]
    }

    // ─────────────────────────── слова ───────────────────────────

    private func name(_ key: String) -> String {
        switch key {
        case "business": return L("setup.stepBusiness")
        case "services": return L("setup.stepServices")
        case "staff": return L("setup.stepStaff")
        default: return L("setup.stepFirst")
        }
    }

    private func note(_ key: String) -> String {
        switch key {
        case "business": return L("setup.stepBusinessNote")
        case "services": return L("setup.stepServicesNote")
        case "staff": return L("setup.stepStaffNote")
        default: return L("setup.stepFirstNote")
        }
    }
}

/// Подпись действия: лаймовая у следующего шага, тихая у остальных.
/// Одного размера у обоих — разный размер объявил бы один из них ошибкой.
private struct SetupAction: ViewModifier {
    let primary: Bool

    func body(content: Content) -> some View {
        content
            .font(.system(size: 13, weight: .semibold))
            .lineLimit(1)
            .foregroundStyle(primary ? Brand.onLime : Brand.onBoard)
            .padding(.horizontal, 11)
            .padding(.vertical, 7)
            .background(
                primary ? Brand.lime : Brand.boardInk.opacity(0.06),
                in: .rect(cornerRadius: 10, style: .continuous)
            )
    }
}

/**
 * Первая минута владельца внутри продукта.
 *
 * Отдельна от полноэкранных приветственных слайдов: те показывают образ
 * продукта, а этот лист объясняет рабочую последовательность — настроить,
 * работать, получить расчёт и увидеть результат. Это iOS-версия того же
 * листа, который открывается новому владельцу в веб-кабинете.
 */
struct OwnerWelcomeSheet: View {
    let onLook: () -> Void
    let onStart: () -> Void

    private struct Step {
        let icon: String
        let title: String
        let note: String
    }

    var body: some View {
        /* Прокрутка обязательна: лист фиксированной высоты с четырьмя
           шагами и тремя абзацами на маленьком экране просто не влезал,
           а прокрутить было нельзя. */
        ScrollView {
        VStack(alignment: .leading, spacing: 0) {
            Text(L("setup.welcomeTitle"))
                .font(.system(size: 27, weight: .bold, design: .rounded))
                .foregroundStyle(Brand.onBoard)

            Text(L("setup.welcomeLead"))
                .font(.system(size: 15))
                .foregroundStyle(Brand.boardMuted)
                .padding(.top, 4)

            Text(L("setup.welcomeNote"))
                .font(.system(size: 14))
                .lineSpacing(2)
                .foregroundStyle(Brand.onBoard.opacity(0.82))
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 18)

            VStack(alignment: .leading, spacing: 15) {
                ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                    HStack(spacing: 12) {
                        ZStack {
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .fill(index == 0 ? Brand.lime : Brand.grape.opacity(0.09))
                            Image(systemName: step.icon)
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(index == 0 ? Brand.onLime : Brand.grape)
                        }
                        .frame(width: 36, height: 36)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(step.title)
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(Brand.onBoard)
                            Text(step.note)
                                .font(.system(size: 13))
                                .foregroundStyle(Brand.boardMuted)
                                .lineLimit(2)
                        }

                        Spacer(minLength: 0)

                        if index < steps.count - 1 {
                            Image(systemName: "chevron.down")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundStyle(Brand.boardMuted.opacity(0.45))
                        }
                    }
                }
            }
            .padding(.top, 22)

            Spacer(minLength: 22)

            /* Пара равных кнопок: одна геометрия, разница только
               заливкой, — и обе системные, а не собранные руками. */
            HStack(spacing: 10) {
                Button(L("setup.welcomeLook"), action: onLook)
                    .buttonStyle(QuietButton())

                Button(L("setup.welcomeStart"), action: onStart)
                    .buttonStyle(LimeButton())
            }
            .padding(.top, 22)
        }
        .padding(.horizontal, 16)
        .padding(.top, 22)
        .padding(.bottom, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Brand.board.ignoresSafeArea())
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private var steps: [Step] {
        [
            Step(icon: "slider.horizontal.3", title: L("setup.flowSetup"), note: L("setup.flowSetupNote")),
            Step(icon: "car.side.fill", title: L("setup.flowWork"), note: L("setup.flowWorkNote")),
            Step(icon: "function", title: L("setup.flowMoney"), note: L("setup.flowMoneyNote")),
            Step(icon: "chart.line.uptrend.xyaxis", title: L("setup.flowResult"), note: L("setup.flowResultNote")),
        ]
    }
}

/**
 * Первая минута мойщика.
 *
 * У него одна рабочая страница, и весь Tetrin ему объяснять не нужно —
 * ни отчёты, ни расходы, ни зарплатный лист он не откроет никогда. Нужно
 * три вещи в том порядке, в каком они случаются за смену: открыть,
 * записывать, закрыть.
 *
 * Никаких подсказок поверх кнопок после этого нет. Экран смены и так
 * состоит из одного действия за раз: вне смены на нём только «начать
 * смену», на смене — только запись. Объяснять нечего, если в каждый
 * момент видно ровно одно, что можно сделать.
 */
struct WorkerWelcomeSheet: View {
    let onDone: () -> Void

    var body: some View {
        ScrollView {
        VStack(alignment: .leading, spacing: 0) {
            Text(L("setup.workerTitle"))
                .font(.system(size: 26, weight: .bold))
                .foregroundStyle(Brand.onBoard)
            Text(L("setup.workerLead"))
                .font(.system(size: 15))
                .foregroundStyle(Brand.boardMuted)
                .padding(.top, 4)

            VStack(alignment: .leading, spacing: 14) {
                ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                    HStack(alignment: .center, spacing: 12) {
                        ZStack {
                            Circle().strokeBorder(Brand.onBoard.opacity(0.18), lineWidth: 1.5)
                            Text("\(index + 1)")
                                .font(.system(size: 12, weight: .bold))
                                .monospacedDigit()
                                .foregroundStyle(Brand.boardMuted)
                        }
                        .frame(width: 24, height: 24)

                        Text(step)
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Brand.onBoard)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .padding(.top, 26)

            Text(L("setup.workerNote"))
                .font(.system(size: 13))
                .foregroundStyle(Brand.boardMuted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 22)

            Spacer(minLength: 24)

            /* Одна кнопка и никакого «пропустить»: соглашаться здесь не с
               чем — под листом лежит тот же экран смены. Во всю ширину,
               потому что жмут её мокрой рукой. */
            Button(L("setup.workerCta"), action: onDone)
                .buttonStyle(LimeButton())
        }
        .padding(22)
        .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Brand.board.ignoresSafeArea())
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private var steps: [String] {
        [L("setup.workerOne"), L("setup.workerTwo"), L("setup.workerThree")]
    }
}
