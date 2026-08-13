import ActivityKit
import Foundation

/// Единственный хозяин Live Activity открытой смены.
///
/// Экран смены сообщает сюда серверный снимок и локальную очередь. Поэтому
/// Dynamic Island не врёт при пропавшей связи: только что записанная машина
/// сразу прибавляется к счётчику и помечается как ожидающая синхронизации.
@MainActor
final class ShiftLiveActivity {
    static let shared = ShiftLiveActivity()

    private init() {}

    /// Запускает нулевое табло сразу после подтверждения сервера. Полный
    /// снимок смены приедет следом, но Live Activity не должна зависеть от
    /// второго GET: сеть может исчезнуть ровно между этими запросами.
    func start(
        openedAt: Date,
        tenant: API.Tenant,
        worker: API.Me?
    ) async {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }

        for activity in Activity<ShiftActivityAttributes>.activities
        where activity.attributes.tenantID != tenant.id {
            await activity.end(nil, dismissalPolicy: .immediate)
        }

        guard activity(for: tenant.id) == nil else { return }
        await request(
            state: .init(count: 0, revenue: 0, cash: 0, pending: 0),
            openedAt: openedAt,
            tenant: tenant,
            worker: worker
        )
    }

    func sync(
        shift: API.Shift,
        tenant: API.Tenant,
        worker: API.Me?,
        pending: [OrderQueue.Item]
    ) async {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }

        // После переключения мойки старая смена не должна оставаться в
        // Dynamic Island рядом с данными новой точки.
        for activity in Activity<ShiftActivityAttributes>.activities
        where activity.attributes.tenantID != tenant.id {
            await activity.end(nil, dismissalPolicy: .immediate)
        }

        guard shift.onShift, let openedAt = shift.openedAt else {
            await end(for: tenant.id)
            return
        }

        let pendingRevenue = pending.reduce(0) { $0 + $1.price }
        let pendingCash = pending
            .filter { $0.payment == "cash" }
            .reduce(0) { $0 + $1.price }
        let state = ShiftActivityAttributes.ContentState(
            count: shift.count + pending.count,
            revenue: shift.revenue + pendingRevenue,
            cash: shift.cashSoFar + pendingCash,
            pending: pending.count
        )
        let content = ActivityContent(
            state: state,
            staleDate: Date().addingTimeInterval(15 * 60),
            relevanceScore: 80
        )

        if let current = activity(for: tenant.id) {
            await current.update(content)
            return
        }

        await request(
            state: state,
            openedAt: openedAt,
            tenant: tenant,
            worker: worker
        )
    }

    private func request(
        state: ShiftActivityAttributes.ContentState,
        openedAt: Date,
        tenant: API.Tenant,
        worker: API.Me?
    ) async {
        let attributes = ShiftActivityAttributes(
            tenantID: tenant.id,
            tenantName: tenant.name,
            workerName: worker?.name ?? "Tetrin",
            currency: tenant.currency,
            unitName: tenant.unitOne,
            openedAt: openedAt
        )
        let content = ActivityContent(
            state: state,
            staleDate: Date().addingTimeInterval(15 * 60),
            relevanceScore: 80
        )

        do {
            _ = try Activity.request(
                attributes: attributes,
                content: content,
                pushType: nil
            )
        } catch {
            // Live Activity — дополнение, а не условие работы смены.
            // Ошибка разрешения или системный лимит не должны блокировать
            // запись машины.
            print("[live-activity] не удалось запустить: \(error.localizedDescription)")
        }
    }

    func end(for tenantID: String) async {
        for activity in Activity<ShiftActivityAttributes>.activities
        where activity.attributes.tenantID == tenantID {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }

    func endAll() async {
        for activity in Activity<ShiftActivityAttributes>.activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }

    private func activity(for tenantID: String) -> Activity<ShiftActivityAttributes>? {
        Activity<ShiftActivityAttributes>.activities.first {
            $0.attributes.tenantID == tenantID
        }
    }
}
