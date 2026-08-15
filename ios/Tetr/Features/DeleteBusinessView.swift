import SwiftUI

/// Удаление бизнеса.
///
/// Существует потому, что заведённый с телефона аккаунт должен с телефона
/// и удаляться. Отправить владельца писать письмо — значит сделать выход
/// сложнее входа, а Apple такое приложение просто не пропустит.
///
/// Отдельного удаления для сотрудника нет: его заводит и отключает
/// владелец, своей учётной записью работник не распоряжается. Здесь
/// сотрудники исчезают вместе с бизнесом, одним движением.
///
/// Главное решение экрана — выбор из двух кнопок, а не галочка «я
/// понимаю». Галочку прожимают не читая; выбор между «забрать данные» и
/// «уйти без них» прочитать приходится, потому что кнопки разные.
struct DeleteBusinessView: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss

    @State private var pin = ""
    @State private var error: String?
    @State private var busy = false

    /// Готовый архив ждёт, пока человек его сохранит. Пока ждёт —
    /// не удаляем ничего.
    @State private var archive: URL?

    /// Копию уже забрали. Тогда второй заход (например после опечатки в
    /// PIN) не должен заново гонять выгрузку — файл у человека на руках.
    @State private var saved = false

    private var ready: Bool { pin.count == 4 && !busy }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(L("delete.what"))
                        .font(.system(size: 14.5))
                    Text(L("delete.staffNote"))
                        .font(.system(size: 14.5))
                        .foregroundStyle(Brand.boardMuted)
                } header: {
                    Text(session.tenant?.name ?? "")
                } footer: {
                    Text(L("settings.deleteNoWayBack"))
                        .foregroundStyle(.red)
                }

                Section {
                    SecureField("••••", text: $pin)
                        .keyboardType(.numberPad)
                        .font(.system(size: 20, weight: .semibold))
                        .monospaced()
                        .onChange(of: pin) { _, v in
                            if v.count > 4 { pin = String(v.prefix(4)) }
                        }
                } header: {
                    Text(L("settings.deletePin"))
                }

                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }

                Section {
                    /* Сохраняющий путь стоит первым и без роли
                       destructive: по умолчанию человек должен уносить
                       свои данные с собой, а не терять их молча. */
                    Button(saved ? L("billing.wallDelete") : L("settings.deleteKeep")) {
                        Task { saved ? await wipe() : await archiveThenWipe() }
                    }
                    .disabled(!ready)

                    Button(L("settings.deleteWipe"), role: .destructive) {
                        Task { await wipe() }
                    }
                    .disabled(!ready)
                } footer: {
                    Text(saved
                         ? L("delete.downloaded")
                         : L("delete.fileNote"))
                }
            }
            .navigationTitle(L("billing.wallDelete"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L("common.close")) { dismiss() }.disabled(busy)
                }
            }
            .disabled(busy)
        }
        .sheet(item: $archive) { url in
            ShareSheet(url: url) { kept in
                archive = nil
                // передумал сохранять — бизнес остаётся на месте
                guard kept else { return }
                saved = true
                Task { await wipe() }
            }
        }
    }

    /// Сначала архив, и только потом удаление.
    ///
    /// Порядок здесь единственно возможный: после удаления выгружать
    /// уже нечего. Если человек закроет лист обмена, не сохранив, мы
    /// остановимся — данные важнее доведённого до конца сценария.
    private func archiveThenWipe() async {
        busy = true
        defer { busy = false }
        error = nil

        guard let data = try? await session.authed({ token in
            // days=all: прощальный архив за тридцать дней был бы обманом
            try await APIClient.shared.raw("export?days=all", token: token)
        }) else {
            error = L("delete.downloadFailed")
            return
        }

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("tetr-\(Int(Date().timeIntervalSince1970)).csv")
        guard (try? data.write(to: url)) != nil else {
            error = L("delete.saveFailed")
            return
        }
        archive = url
    }

    private func wipe() async {
        busy = true
        defer { busy = false }
        error = nil

        do {
            try await session.deleteBusiness(pin: pin)
            // экран закроется сам: RootView увидит выход и покажет вход
        } catch let e as APIError {
            pin = ""
            switch e.code {
            case "WRONG_CREDENTIALS": error = L("auth.pinWrong")
            case "TOO_MANY_TRIES": error = L("auth.throttled")
            default: error = e.isOffline ? L("errors.offline") : L("payroll.failed")
            }
        } catch {
            self.error = L("payroll.failed")
        }
    }
}
