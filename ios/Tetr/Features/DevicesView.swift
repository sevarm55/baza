import SwiftUI

/**
 * Устройства, с которых открыт вход.
 *
 * ЗАЧЕМ ЭТОТ ЭКРАН. Телефон на мойке общий и переходит из рук в руки, а
 * пара токенов живёт тридцать дней. Пока списка не было, погасить чужой
 * вход можно было только сменой PIN — то есть вылетев самому и заодно
 * выкинув себя со всех своих устройств. Наказание за потерянный телефон
 * выходило больше самой потери, и им не пользовались.
 *
 * Своё устройство помечено и кнопки не имеет. Не из вежливости: человек,
 * погасивший вход, из которого смотрит, увидит экран входа посреди работы
 * и решит, что продукт сломался. Выйти отсюда есть чем — «выйти» стоит в
 * профиле и называет себя выходом.
 *
 * Список свой, а не всего бизнеса: тот же ответ, что в кабинете, и тем же
 * кодом на сервере (`lib/devices.ts`).
 */
struct DevicesView: View {
    @EnvironmentObject private var session: Session

    @State private var rows: [API.Device] = []
    @State private var loaded = false
    @State private var busy: String?
    @State private var error: String?
    /// Какой вход собираются погасить. Пусто — вопроса нет.
    @State private var closing: API.Device?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if let error, rows.isEmpty {
                    /* Полноэкранный отказ — только пока показывать нечего.
                       Раньше он стоял первой веткой безусловно, и
                       неудачный pull-to-refresh стирал уже загруженный
                       список целиком. */
                    problem(error)
                } else if !loaded {
                    Delayed(active: true) {
                        TetrSkeletonList(rows: 3)
                            .padding(.top, 10)
                            .padding(.horizontal, 4)
                    }
                } else if rows.count <= 1, error == nil {
                    /* Один вход и он же этот — говорить не о чем: строка
                       «это устройство», у которой нечего погасить, не
                       отвечает ни на один вопрос. */
                    singleDeviceState
                } else {
                    if let error {
                        HStack(spacing: 10) {
                            Text(error)
                                .font(.system(size: 13))
                                .foregroundStyle(Brand.badOnBoard)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 8)
                            Button(L("common.retry")) { Task { await reload() } }
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(Brand.grape)
                        }
                        .padding(12)
                        .background(Brand.badOnBoard.opacity(0.09), in: .rect(cornerRadius: 14, style: .continuous))
                        .padding(.bottom, 12)
                    }

                    Text(L("profile.devicesNote"))
                        .font(.system(size: 13))
                        .foregroundStyle(Brand.boardMuted)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.bottom, 14)

                    VStack(spacing: 0) {
                        ForEach(rows) { row in
                            deviceRow(row)
                            if row.id != rows.last?.id {
                                Divider().overlay(Brand.boardInk.opacity(0.07))
                            }
                        }
                    }
                    .padding(.horizontal, 12)
                    .background(Brand.boardSurface, in: .rect(cornerRadius: 22, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .strokeBorder(Brand.boardInk.opacity(0.07), lineWidth: 0.8)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.board.ignoresSafeArea())
        .task { await reload() }
        .refreshable { await reload() }
        /* Спрашиваем, потому что вернуть нельзя: тому, кого выгнали,
           придётся входить заново, а на мойке это может быть человек,
           стоящий сейчас с машиной. */
        .confirmationDialog(
            L("profile.deviceRevoke"),
            isPresented: .init(get: { closing != nil }, set: { if !$0 { closing = nil } }),
            titleVisibility: .visible,
            presenting: closing
        ) { row in
            Button(L("profile.deviceRevoke"), role: .destructive) {
                Task { await revoke(row) }
            }
            Button(L("common.cancel"), role: .cancel) {}
        } message: { row in
            Text(name(row))
        }
    }

    private var singleDeviceState: some View {
        VStack(spacing: 15) {
            ZStack {
                Circle()
                    .fill(Brand.mintInk.opacity(0.08))
                    .frame(width: 104, height: 104)
                Circle()
                    .strokeBorder(Brand.mintInk.opacity(0.16), lineWidth: 1)
                    .frame(width: 76, height: 76)
                Image(systemName: "iphone.gen3.badge.checkmark")
                    .font(.system(size: 31, weight: .medium))
                    .foregroundStyle(Brand.mintInk)
            }

            Text(L("profile.devicesOne"))
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Brand.onBoard)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 34)
        .background(Brand.boardSurface, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .strokeBorder(Brand.boardInk.opacity(0.07))
        }
    }

    private func deviceRow(_ row: API.Device) -> some View {
        HStack(spacing: 11) {
            Image(systemName: row.isApp ? "iphone" : "desktopcomputer")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(row.isApp ? Brand.mintInk : Brand.lavenderInk)
                .frame(width: 36, height: 36)
                .background(
                    (row.isApp ? Brand.mintCard : Brand.lavenderCard),
                    in: .rect(cornerRadius: 10, style: .continuous)
                )

            VStack(alignment: .leading, spacing: 2) {
                Text(name(row))
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Brand.onBoard)
                    .lineLimit(1)
                Text(row.current ? L("profile.deviceThis") : L("profile.deviceLastSeen", when(row.lastSeenAt)))
                    .font(.system(size: 13))
                    .foregroundStyle(row.current ? Brand.goodOnBoard : Brand.boardMuted)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            // своё устройство гасить нечем: для этого есть «выйти»
            if !row.current {
                if busy == row.id {
                    TetrLoader(size: 18, tint: Brand.grape)
                } else {
                    Button {
                        closing = row
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(Brand.warnOnBoard)
                            /* Единственный способ погасить чужой вход —
                               цель полного размера, а не 32 точки. */
                            .frame(width: 44, height: 44)
                            .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(L("profile.deviceRevoke"))
                }
            }
        }
        .padding(.vertical, 11)
        .accessibilityElement(children: .combine)
    }

    private func problem(_ text: String) -> some View {
        VStack(spacing: 12) {
            Text(text)
                .font(.system(size: 14))
                .multilineTextAlignment(.center)
                .foregroundStyle(Brand.boardMuted)
            Button(L("common.retry")) { Task { await reload() } }
                .buttonStyle(.glass)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 60)
    }

    /// Чем назвать вход, если клиент своей метки не прислал.
    private func name(_ row: API.Device) -> String {
        if let device = row.device, !device.isEmpty { return device }
        return row.isApp ? L("profile.deviceApp") : L("profile.deviceWeb")
    }

    /**
     * Когда последний раз видели этот вход.
     *
     * «Сегодня, 12:24» вместо полной даты: строка отвечает на вопрос
     * «давно ли», а не «какого числа». Точное число появляется у того,
     * что старше вчера, — там его как раз и спрашивают.
     *
     * Время в поясе бизнеса, а не устройства: владелец в поездке иначе
     * увидит вход, сделанный в шесть утра.
     */
    private func when(_ date: Date) -> String {
        var calendar = Calendar(identifier: .gregorian)
        if let tz = session.tenant?.timezone, let zone = TimeZone(identifier: tz) {
            calendar.timeZone = zone
        }

        let clock = DateFormatter()
        clock.locale = LangStore.currentLang.locale
        clock.dateFormat = "HH:mm"
        clock.timeZone = calendar.timeZone
        let time = clock.string(from: date)

        if calendar.isDateInToday(date) { return "\(L("common.today")), \(time)" }
        if calendar.isDateInYesterday(date) { return "\(L("common.yesterday")), \(time)" }

        let day = DateFormatter()
        day.locale = clock.locale
        day.timeZone = calendar.timeZone
        day.setLocalizedDateFormatFromTemplate("d MMMM")
        return "\(day.string(from: date)), \(time)"
    }

    private func reload() async {
        error = nil
        do {
            rows = try await session.devices()
        } catch let e as APIError {
            error = e.isOffline ? L("errors.offline") : L("errors.failedCode", e.code ?? "\(e.status)")
        } catch {
            // `self`, потому что имя занято поймавшимся `error`
            self.error = L("payroll.failed")
        }
        loaded = true
    }

    private func revoke(_ row: API.Device) async {
        busy = row.id
        defer { busy = nil }
        closing = nil

        do {
            try await session.revokeDevice(row.id)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            /* Перечитываем целиком, а не убираем строку на месте: сервер
               мог уже погасить и что-то ещё — например при смене кода, —
               и список обязан сойтись с ним, а не с нашим представлением
               о нём. */
            await reload()
        } catch let e as APIError {
            error = e.isOffline ? L("errors.offline") : L("errors.failedCode", e.code ?? "\(e.status)")
        } catch {
            // `self`, потому что имя занято поймавшимся `error`
            self.error = L("payroll.failed")
        }
    }
}
