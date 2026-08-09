import SwiftUI

/**
 * Выбор точки в заголовке экрана смены.
 *
 * Название мойки уже стоит в заголовке и уже отвечает на вопрос «где я».
 * Оно и становится кнопкой — отдельного элемента рядом не появляется:
 * второй ответ на тот же вопрос только занял бы место, которого в панели
 * нет. Свободных слотов там и правда нет: справа кнопка выхода, снизу
 * капсула смены и кнопка записи.
 *
 * У кого мойка одна — этого вида не существует вовсе, и заголовок
 * остаётся обычным текстом. Проверка стоит у вызывающего, а не внутри:
 * так видно, что ветка возвращает ровно то, что было.
 */
struct PointMenu: View {
    let points: [API.Point]
    let currentId: String?
    let onPick: (API.Point) -> Void

    @State private var busy = false

    var body: some View {
        Menu {
            ForEach(points) { point in
                Button {
                    guard !busy, point.id != currentId else { return }
                    busy = true
                    onPick(point)
                } label: {
                    /* Состояние словом, а не только цветом: в меню iOS
                       цветную точку рядом с текстом не поставить, а знать,
                       что мойка закрыта, надо ДО перехода. */
                    if point.id == currentId {
                        Label(point.name, systemImage: "checkmark")
                    } else if point.canRead {
                        Text(point.name)
                    } else {
                        Text("\(point.name) · սպասում է վճարման")
                    }
                }
                .disabled(point.id == currentId)
            }
        } label: {
            HStack(spacing: 4) {
                Text(current?.name ?? "Tetrin")
                    .font(.system(size: 17, weight: .semibold))
                    .lineLimit(1)
                Image(systemName: "chevron.down")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(.secondary)
            }
            .foregroundStyle(Brand.ink)
        }
        // переход перерисовывает всё дерево, и этот вид тоже — сбрасывать
        // busy руками не нужно, его просто не станет
        .disabled(busy)
    }

    private var current: API.Point? {
        points.first { $0.id == currentId }
    }
}
