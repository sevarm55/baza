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

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(L("auth.verifyPhoneWhy"))
                        .font(.system(size: 14.5))
                } header: {
                    Text(session.me?.phone ?? "")
                }

                if let challengeId {
                    Section {
                        TextField("••••••", text: $code)
                            .keyboardType(.numberPad)
                            // система сама подставит код из пришедшей SMS
                            .textContentType(.oneTimeCode)
                            .font(.system(size: 20, weight: .semibold))
                            .monospaced()
                            .onChange(of: code) { _, v in
                                let clean = String(v.filter(\.isNumber).prefix(API.codeLength))
                                if clean != v { code = clean }
                                if code.count == API.codeLength {
                                    Task { await confirm(challengeId) }
                                }
                            }
                    } header: {
                        Text(L("auth.otpCode"))
                    } footer: {
                        Text(L("auth.otpSent", sentTo))
                    }
                }

                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }

                Section {
                    if let challengeId {
                        Button(L("auth.otpVerify")) { Task { await confirm(challengeId) } }
                            .loading(busy, tint: Brand.grape, size: 18, title: L("auth.checking"))
                            .disabled(busy || code.count < API.codeLength)
                    } else {
                        Button(L("auth.verifyPhoneSend")) { Task { await send() } }
                            .loading(busy, tint: Brand.grape, size: 18, title: L("auth.checking"))
                            .disabled(busy)
                    }
                }
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
