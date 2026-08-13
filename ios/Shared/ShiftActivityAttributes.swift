import ActivityKit
import Foundation

/// Данные открытой смены, которыми приложение делится с WidgetKit.
///
/// Неизменяемое лежит в attributes, текущие цифры — в ContentState:
/// ActivityKit тогда обновляет только маленькое состояние, а не пересоздаёт
/// всю Live Activity после каждой машины.
struct ShiftActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        let count: Int
        let revenue: Int
        let cash: Int
        let pending: Int
    }

    let tenantID: String
    let tenantName: String
    let workerName: String
    let currency: String
    let unitName: String
    let openedAt: Date
}
