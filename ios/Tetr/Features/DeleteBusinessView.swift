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
    @State private var code = ""
    @State private var error: String?
    @State private var busy = false

    /// Заявка на код подтверждения — у тех, у кого PIN нет вовсе.
    /// Пусто — код ещё не высылали.
    @State private var challengeId: String?
    /// Куда ушёл код: закрытый номер, как его прислал сервер.
    @State private var sentTo = ""

    /// Готовый архив ждёт, пока человек его сохранит. Пока ждёт —
    /// не удаляем ничего.
    @State private var archive: URL?

    /// Копию уже забрали. Тогда второй заход (например после опечатки в
    /// PIN) не должен заново гонять выгрузку — файл у человека на руках.
    @State private var saved = false

    /**
     * Чем подтверждают удаление.
     *
     * У кого есть PIN — PIN. У заведённых по коду из SMS его нет вовсе, и
     * `verifyPin` на метке «кода нет» отказывает всегда: такой владелец не
     * мог удалить свой бизнес НИКОГДА — ни отсюда, ни с сайта. Выход
     * оказывался сложнее входа, а данные заперты у нас.
     *
     * Решает не экран, а сервер: присланный нами признак «у меня нет PIN»
     * был бы способом обойти PIN. Здесь он только показывается.
     */
    private var byCode: Bool { !session.hasPin }

    /// Код выслан — значит спрашиваем шесть цифр, а не PIN.
    private var asksCode: Bool { byCode && challengeId != nil }

    private var ready: Bool {
        guard !busy else { return false }
        if byCode { return asksCode && code.count == API.codeLength }
        /* Минимум четыре: у заведённых до перехода на шестизначный код их
           столько. Стояло «ровно четыре», и удаление перестало работать у
           всех, чей код длиннее, — форма просто не давала его набрать. */
        return pin.count >= API.pinMinLength
    }

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

                if asksCode {
                    Section {
                        TextField("••••••", text: $code)
                            .keyboardType(.numberPad)
                            /* Тот же контент-тип, что на входе: система
                               подставляет код из только что пришедшей
                               SMS сама. */
                            .textContentType(.oneTimeCode)
                            .font(.system(size: 20, weight: .semibold))
                            .monospaced()
                            .onChange(of: code) { _, v in
                                let clean = String(v.filter(\.isNumber).prefix(API.codeLength))
                                if clean != v { code = clean }
                            }
                    } header: {
                        Text(L("delete.codeAsk"))
                    } footer: {
                        Text(L("delete.codeSent", sentTo))
                    }
                } else if !byCode {
                    Section {
                        SecureField("••••••", text: $pin)
                            .keyboardType(.numberPad)
                            .font(.system(size: 20, weight: .semibold))
                            .monospaced()
                            .onChange(of: pin) { _, v in
                                let clean = String(v.filter(\.isNumber).prefix(API.pinLength))
                                if clean != v { pin = clean }
                            }
                    } header: {
                        Text(L("settings.deletePin"))
                    }
                }

                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }

                if byCode && challengeId == nil {
                    /* Первый шаг ничего не удаляет: он высылает код.
                       Поэтому одна кнопка, и она не разрушительная —
                       два выхода появятся, когда будет чем подтвердить. */
                    Section {
                        Button(L("delete.sendCode")) { Task { await sendCode() } }
                            .disabled(busy)
                    } footer: {
                        Text(L("delete.codeAsk"))
                    }
                } else {
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

    /// Выслать код подтверждения. Ничего не удаляет.
    private func sendCode() async {
        busy = true
        defer { busy = false }
        error = nil

        do {
            let started = try await session.startDeleteCode()
            challengeId = started.challengeId
            sentTo = started.phone ?? ""
        } catch let e as APIError {
            switch e.code {
            case "TOO_MANY_TRIES": error = L("auth.throttled")
            case "SMS_FAILED": error = L("auth.smsFailed")
            default: error = e.isOffline ? L("errors.offline") : L("payroll.failed")
            }
        } catch {
            self.error = L("payroll.failed")
        }
    }

    private func wipe() async {
        busy = true
        defer { busy = false }
        error = nil

        do {
            try await session.deleteBusiness(
                pin: byCode ? "" : pin,
                challengeId: challengeId ?? "",
                code: code
            )
            // экран закроется сам: RootView увидит выход и покажет вход
        } catch let e as APIError {
            pin = ""
            code = ""
            switch e.code {
            case "WRONG_CREDENTIALS": error = L("auth.pinWrong")
            case "TOO_MANY_TRIES": error = L("auth.throttled")
            case "OTP_INVALID": error = L("auth.otpInvalid")
            case "OTP_EXPIRED", "OTP_TOO_MANY":
                /* Заявка сгорела: возвращаем к «выслать код». Оставить
                   поле с мёртвым идентификатором значит предложить
                   вводить то, что уже не примут. */
                error = L("auth.otpExpired")
                challengeId = nil
            default: error = e.isOffline ? L("errors.offline") : L("payroll.failed")
            }
        } catch {
            self.error = L("payroll.failed")
        }
    }
}
