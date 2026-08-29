import SwiftUI

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
