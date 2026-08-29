import SwiftUI

/**
 * Подтвердить свой номер.
 *
 * ЗАЧЕМ. Восстановить доступ по SMS можно только по подтверждённому
 * номеру: иначе восстановление само стало бы способом забрать чужой
 * непроверенный аккаунт — кто угодно вводит чужой номер и получает код.
 * У тех, кому аккаунт завёл владелец, номер не подтверждён, и пока это
 * так, забытый код для них тупик.
 *
 * Силой не требуется и стеной не показывается: остановить мойщику работу
 * посреди дня из-за нашего переезда — не тот размен. Это строка в
 * профиле, отказ ничего не ломает, вернуться можно когда угодно.
 *
 * Тот же сценарий и те же два шага, что в кабинете (`verifyOwnPhoneAction`),
 * и тот же серверный маршрут. Номер берётся из аккаунта, а не из формы:
 * присланный означал бы, что подтвердить можно что угодно, и
 * восстановление, которое на это подтверждение опирается, потеряло бы
 * смысл целиком.
 */
struct VerifyPhoneView: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss

    @State private var challengeId: String?
    @State private var sentTo = ""
    @State private var code = ""
    @State private var busy = false
    @State private var error: String?
    /// Когда можно попросить код ещё раз. Без повтора протухший код был
    /// тупиком: закрыть лист и открыть заново — не выход, а лазейка.
    @State private var resendAt = Date()

    private enum Focus { case code }
    @FocusState private var focus: Focus?

    var body: some View {
        NavigationStack {
            ZStack {
                Brand.board.ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        VStack(alignment: .leading, spacing: 12) {
                            ZStack {
                                RoundedRectangle(cornerRadius: 18, style: .continuous)
                                    .fill(Brand.grape.opacity(0.12))
                                    .frame(width: 58, height: 58)
                                Image(systemName: challengeId == nil ? "checkmark.shield" : "message.badge")
                                    .font(.system(size: 24, weight: .semibold))
                                    .foregroundStyle(Brand.grape)
                            }

                            Text(challengeId == nil ? L("auth.verifyPhone") : L("auth.otpCode"))
                                .font(.system(size: 27, weight: .bold, design: .rounded))
                                .foregroundStyle(Brand.onBoard)

                    Text(L("auth.verifyPhoneWhy"))
                                .font(.system(size: 15))
                                .foregroundStyle(Brand.boardMuted)
                                .fixedSize(horizontal: false, vertical: true)

                            Label(session.me?.phone ?? "", systemImage: "iphone")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(Brand.onBoard)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(Brand.boardInk.opacity(0.06), in: Capsule())
                        }

                if let challengeId {
                            VStack(alignment: .leading, spacing: 9) {
                                Text(L("auth.otpCode"))
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundStyle(Brand.boardMuted)
                        /* Те же клетки, что на входе: одно поле кода на
                           весь продукт, а не второй, голый вариант. */
                        CodeCells(
                            text: $code,
                            focus: $focus,
                            field: Focus.code,
                            length: API.codeLength,
                            label: L("auth.otpCode"),
                            contentType: .oneTimeCode,
                            skin: .board,
                            onComplete: { Task { await confirm(challengeId) } }
                        )
                                Text(L("auth.otpSent", sentTo))
                                    .font(.system(size: 13))
                                    .foregroundStyle(Brand.boardMuted)

                                resendRow
                            }
                            .padding(18)
                            .background(Brand.boardSurface, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                            .overlay {
                                RoundedRectangle(cornerRadius: 22, style: .continuous)
                                    .strokeBorder(Brand.boardInk.opacity(0.07))
                            }
                    }

                if let error {
                            Label(error, systemImage: "exclamationmark.circle.fill")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(Brand.badOnBoard)
                                .padding(16)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Brand.badOnBoard.opacity(0.09), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        }

                        Spacer(minLength: 24)
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 18)
                    .padding(.bottom, 116)
                }
                .scrollDismissesKeyboard(.interactively)
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                Group {
                    if let challengeId {
                        Button(L("auth.otpVerify")) { Task { await confirm(challengeId) } }
                            .disabled(busy || code.count < API.codeLength)
                    } else {
                        Button(L("auth.verifyPhoneSend")) { Task { await send() } }
                            .disabled(busy)
                    }
                }
                .buttonStyle(LimeButton(loading: busy, busyTitle: L("auth.checking")))
                /* Погашенное состояние видно, а не только не отвечает:
                   пока код короче шести цифр, кнопка тусклая. Занятая —
                   в полный цвет, ответ на палец уже дан признаком работы. */
                .opacity(!busy && challengeId != nil && code.count < API.codeLength ? 0.45 : 1)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(.ultraThinMaterial)
            }
            .navigationTitle(L("auth.verifyPhone"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L("common.close")) { dismiss() }.disabled(busy)
                }
            }
        }
    }

    private func send() async {
        busy = true
        defer { busy = false }
        error = nil

        do {
            let started = try await session.startPhoneProof()
            challengeId = started.challengeId
            sentTo = started.phone ?? (session.me?.phone ?? "")
            code = ""
            resendAt = Date().addingTimeInterval(45)
            // клавиатура сразу в клетках: код уже летит в SMS
            focus = .code
        } catch let e as APIError {
            error = message(for: e)
        } catch {
            self.error = L("payroll.failed")
        }
    }

    private func confirm(_ id: String) async {
        guard !busy, code.count == API.codeLength else { return }
        busy = true
        defer { busy = false }
        error = nil

        do {
            try await session.confirmPhone(challengeId: id, code: code)
            dismiss()
        } catch let e as APIError {
            code = ""
            error = message(for: e)
        } catch {
            self.error = L("payroll.failed")
        }
    }

    /**
     * «Отправить снова» с отсчётом — тот же орган, что на входе.
     *
     * Сервер и так замедляет повторы; подсказка нужна, чтобы кнопка не
     * выглядела рабочей, отвечая отказом. `TimelineView`, а не таймер в
     * состоянии: секунда тикает сама, не будя весь экран.
     */
    private var resendRow: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let left = max(0, Int(resendAt.timeIntervalSince(context.date).rounded(.up)))
            Button {
                Task { await send() }
            } label: {
                Text(left > 0 ? L("auth.otpResendIn", mmss(left)) : L("auth.otpResend"))
                    .font(.system(size: 13, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(left > 0 ? Brand.boardMuted.opacity(0.7) : Brand.grape)
                    .frame(minHeight: 44, alignment: .leading)
                    .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .disabled(busy || left > 0)
        }
    }

    private func mmss(_ seconds: Int) -> String {
        String(format: "%d:%02d", seconds / 60, seconds % 60)
    }

    private func message(for e: APIError) -> String {
        if e.isOffline { return L("errors.offline") }
        switch e.code {
        case "OTP_INVALID": return L("auth.otpInvalid")
        case "OTP_EXPIRED": return L("auth.otpExpired")
        case "OTP_TOO_MANY": return L("auth.otpTooMany")
        case "TOO_MANY_TRIES": return L("auth.throttled")
        case "SMS_FAILED": return L("auth.smsFailed")
        default: return L("payroll.failed")
        }
    }
}
