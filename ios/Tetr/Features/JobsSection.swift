import SwiftUI

/**
 * Машины, переданные мойщику.
 *
 * Стоит выше заработка и выше всего остального на экране смены — вопреки
 * порядку «по частоте», которым здесь расставлено всё. Частота тут ни при
 * чём: когда владелец отдал машину, это единственная причина, по которой
 * человек взял телефон в руки. Когда назначенных нет, блока нет вовсе, и
 * экран возвращается к прежнему порядку.
 *
 * Кнопка на строке всегда одна. Два действия рядом заставляют выбирать, а
 * выбора нет: не взял — «Ընդունել», взял — «Սկսել», моет — ничего, дальше
 * его ведёт кнопка записи внизу экрана.
 */
struct JobsSection: View {
    let jobs: [API.Job]
    /// Двинуть наряд: `accept` или `start`. Возврат — обновить список.
    let move: (API.Job, String) async -> Void

    /* Начатая машина отсюда уходит: блок отвечает на вопрос «что мне
       сейчас взять», а у начатой ответа больше нет — строка осталась бы
       без единственной кнопки и висела мёртвым грузом над деньгами.
       Дальше человека ведёт кнопка записи внизу, она же закроет наряд. */
    private var waiting: [API.Job] { jobs.filter { $0.status != "started" } }

    var body: some View {
        if !waiting.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Text("Ձեր մեքենաները")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Brand.boardMuted)
                    Text("\(waiting.count)")
                        .font(.system(size: 13))
                        .monospacedDigit()
                        .foregroundStyle(Brand.boardMuted.opacity(0.7))
                }
                .padding(.leading, 4)

                ForEach(waiting) { job in
                    JobRow(job: job, move: move)
                }
            }
        }
    }
}

private struct JobRow: View {
    let job: API.Job
    let move: (API.Job, String) async -> Void

    @State private var busy = false

    /* Состояние словом, а не цветом: экран смотрят на мокром телефоне под
       ереванским солнцем, и оттенок плашки там не различить. */
    private var state: String {
        switch job.status {
        case "started": return "Լվացվում է"
        case "accepted": return "Ընդունված է"
        default: return "Սպասում է"
        }
    }

    /* Фразой целиком, а не числом с приставкой: «0 ր առաջ» — не срок, а
       его отсутствие, и читается как поломка. Единицы словом: сокращение
       «ր» на строке рядом с часами принимают за дни. Минуты после часа
       отбрасываем — решения между «2 часа» и «2 часа 10 минут» нет. */
    private var waited: String {
        let m = job.waitedMinutes
        if m < 1 { return "հենց նոր" }
        if m < 60 { return "\(m) րոպե առաջ" }
        return "\(m / 60) ժամ առաջ"
    }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "car.fill")
                .font(.system(size: 15))
                .foregroundStyle(Brand.mintInk)
                .frame(width: 36, height: 36)
                .background(Brand.mintInk.opacity(0.16), in: .rect(cornerRadius: 10))

            VStack(alignment: .leading, spacing: 2) {
                Text(job.clientKey)
                    .font(.system(size: 16, weight: .bold))
                    .monospacedDigit()
                    .lineLimit(1)
                Text([job.serviceName, state, waited].compactMap { $0 }.joined(separator: " · "))
                    .font(.system(size: 12.5))
                    .foregroundStyle(Brand.boardMuted)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            if job.status != "started" {
                Button {
                    guard !busy else { return }
                    busy = true
                    Task {
                        await move(job, job.status == "assigned" ? "accept" : "start")
                        busy = false
                    }
                } label: {
                    Label(
                        job.status == "assigned" ? "Ընդունել" : "Սկսել",
                        systemImage: job.status == "assigned" ? "checkmark" : "play.fill"
                    )
                    .font(.system(size: 13.5, weight: .semibold))
                    .labelStyle(.titleAndIcon)
                }
                .buttonStyle(PressStyle())
                .disabled(busy)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .foregroundStyle(Brand.onLime)
                .background(Brand.lime, in: .rect(cornerRadius: 10))
                .opacity(busy ? 0.5 : 1)
            }
        }
        .padding(12)
        .background(Brand.boardSurface, in: .rect(cornerRadius: 14))
        .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(Brand.boardInk.opacity(0.07), lineWidth: 0.8)
        }
    }
}
