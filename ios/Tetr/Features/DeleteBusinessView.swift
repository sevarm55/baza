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

    @State private var password = ""
    @State private var error: String?
    @State private var busy = false

    /// Заявка на код подтверждения — у тех, у кого PIN нет вовсе.
    /// Пусто — код ещё не высылали.
    /// Куда ушёл код: закрытый номер, как его прислал сервер.

    /// Готовый архив ждёт, пока человек его сохранит. Пока ждёт —
    /// не удаляем ничего.
    @State private var archive: URL?

    /// Копию уже забрали. Тогда второй заход (например после опечатки в
    /// PIN) не должен заново гонять выгрузку — файл у человека на руках.
    @State private var saved = false

    /// Открыт последний вопрос перед необратимым удалением.
    @State private var confirmingWipe = false

    private enum Focus { case password }
    @FocusState private var focus: Focus?

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
    private var ready: Bool {
        guard !busy else { return false }
        /* Длину пароля не проверяем: правило про восемь знаков живёт на
           сервере, а у заведённых раньше пароль может быть любым. Здесь
           гасим кнопку только на пустом поле. */
        return !password.isEmpty
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Brand.board.ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        VStack(alignment: .leading, spacing: 12) {
                            ZStack {
                                RoundedRectangle(cornerRadius: 18, style: .continuous)
                                    .fill(Brand.badOnBoard.opacity(0.10))
                                    .frame(width: 58, height: 58)
                                Image(systemName: "building.2.crop.circle")
                                    .font(.system(size: 24, weight: .semibold))
                                    .foregroundStyle(Brand.badOnBoard)
                            }

                            Text(session.tenant?.name ?? L("billing.wallDelete"))
                                .font(.system(size: 27, weight: .bold, design: .rounded))
                                .foregroundStyle(Brand.onBoard)

                            Text(L("delete.what"))
                                .font(.system(size: 15))
                                .foregroundStyle(Brand.onBoard)
                                .fixedSize(horizontal: false, vertical: true)

                    Text(L("delete.staffNote"))
                                .font(.system(size: 14))
                                .foregroundStyle(Brand.boardMuted)
                                .fixedSize(horizontal: false, vertical: true)

                            Label(L("settings.deleteNoWayBack"), systemImage: "exclamationmark.triangle.fill")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(Brand.badOnBoard)
                        }
                        .padding(18)
                        .background(Brand.badOnBoard.opacity(0.055), in: RoundedRectangle(cornerRadius: 28, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 28, style: .continuous)
                                .strokeBorder(Brand.badOnBoard.opacity(0.13))
                        }

                credentialSurface(title: L("auth.passwordLabel"), note: nil) {
                    /* Пароль, а не код и не PIN. Кодов из SMS у продукта
                       больше нет, а PIN перестал быть входом. Между
                       «зашёл посмотреть выручку» и «стёр всё» должно
                       стоять то, чего случайный человек рядом не знает, —
                       и это ровно то, чем владелец входит. */
                    SecureField("", text: $password)
                        .textContentType(.password)
                        .font(.system(size: 18, weight: .semibold))
                        .focused($focus, equals: .password)
                }

                if let error {
                            Label(error, systemImage: "exclamationmark.circle.fill")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(Brand.badOnBoard)
                                .padding(16)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Brand.badOnBoard.opacity(0.09), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                }

                        Group {
                            Text(saved ? L("delete.downloaded") : L("delete.fileNote"))
                                .font(.system(size: 13))
                                .foregroundStyle(Brand.boardMuted)
                                .fixedSize(horizontal: false, vertical: true)
                    }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 18)
                    .padding(.bottom, 154)
                }
                .scrollDismissesKeyboard(.interactively)
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                VStack(spacing: 9) {
                    Group {
                        Button(saved ? L("billing.wallDelete") : L("settings.deleteKeep")) {
                            /* Путь с выгрузкой подтверждает себя сам:
                               человек жмёт «сохранить и удалить», сохраняет
                               файл — и только это запускает удаление.
                               Прямое удаление идёт через вопрос. */
                            if saved {
                                confirmingWipe = true
                            } else {
                                Task { await archiveThenWipe() }
                            }
                        }
                        .buttonStyle(LimeButton(loading: busy, busyTitle: L("common.saving")))
                        .disabled(!ready)
                        .opacity(busy || ready ? 1 : 0.45)

                        /* Самое необратимое действие продукта шло в одно
                           касание по цели в восемнадцать точек — при том
                           что отзыв устройства (обратимый) спрашивал.
                           Теперь вопрос обязателен, а цель полная. */
                        Button(role: .destructive) {
                            confirmingWipe = true
                        } label: {
                            Text(L("settings.deleteWipe"))
                                .font(.system(size: 14, weight: .semibold))
                                .frame(maxWidth: .infinity, minHeight: 44)
                                .contentShape(.rect)
                        }
                        .disabled(!ready)
                        .opacity(ready ? 1 : 0.45)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(.ultraThinMaterial)
            }
            .navigationTitle(L("billing.wallDelete"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L("common.close")) { dismiss() }.disabled(busy)
                }
            }
            .disabled(busy)
            .confirmationDialog(
                L("delete.confirmTitle"),
                isPresented: $confirmingWipe,
                titleVisibility: .visible
            ) {
                Button(L("billing.wallDelete"), role: .destructive) {
                    Task { await wipe() }
                }
                Button(L("common.cancel"), role: .cancel) {}
            } message: {
                Text("\(session.tenant?.name ?? "") · \(L("settings.deleteNoWayBack"))")
            }
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

    private func credentialSurface<Content: View>(
        title: String,
        note: String?,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Brand.boardMuted)
            content()
            if let note {
                Text(note)
                    .font(.system(size: 13))
                    .foregroundStyle(Brand.boardMuted)
            }
        }
        .padding(18)
        .background(Brand.boardSurface, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .strokeBorder(Brand.boardInk.opacity(0.07))
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
            try await session.deleteBusiness(password: password)
            // экран закроется сам: RootView увидит выход и покажет вход
        } catch let e as APIError {
            password = ""
            switch e.code {
            case "WRONG_CREDENTIALS": error = L("auth.wrongPassword")
            case "TOO_MANY_TRIES": error = L("auth.throttled")
            default: error = e.isOffline ? L("errors.offline") : L("payroll.failed")
            }
        } catch {
            self.error = L("payroll.failed")
        }
    }
}
