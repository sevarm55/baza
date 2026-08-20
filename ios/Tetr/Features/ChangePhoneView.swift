import SwiftUI

/**
 * Смена своего номера.
 *
 * ЗАЧЕМ. Номер — это логин. Человек меняет оператора, теряет симку,
 * переезжает в другую страну; пока сменить номер было нельзя, любое из
 * этого означало потерю бизнеса целиком, и единственным выходом
 * оставалась просьба к нам полезть в базу руками.
 *
 * Шагов до трёх, и первый появляется не у всех:
 *
 *   кто ты        — PIN у тех, у кого он есть; у заведённых по SMS его
 *                   нет вовсе, и им вместо него приходит код на ТЕКУЩИЙ
 *                   номер. Без этого шага сменить номер они не смогли бы
 *                   никогда: `verifyPin` на метке «кода нет» отказывает
 *                   всегда;
 *   новый номер   — код на него. Доказывает, что номер существует и
 *                   принадлежит тому же человеку. Без второго
 *                   доказательства сменой номера можно передать аккаунт
 *                   кому угодно.
 *
 * Чем доказывать, решает сервер по состоянию аккаунта, а не экран:
 * присланный приложением признак «у меня нет PIN» был бы способом обойти
 * PIN. `session.hasPin` здесь нужен ровно для того, чтобы знать, с
 * какого шага начинать рисовать.
 *
 * Те же три шага и тот же серверный код, что в кабинете
 * (`changePhoneAction` и `lib/phone-change.ts`).
 */
struct ChangePhoneView: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss

    /// Где мы сейчас. Порядок шагов задаёт сервер, экран его повторяет.
    private enum Stage {
        /// код на свой номер — только у кого нет PIN
        case proof
        /// новый номер (+ PIN, у кого он есть)
        case phone
        /// код с нового номера
        case code
        /// номер сменён, сессии погашены
        case done
    }

    @State private var stage: Stage = .phone
    @State private var proofId = ""
    @State private var proofCode = ""
    @State private var sentTo = ""

    @State private var country = Countries.default
    @State private var phone = ""
    @State private var pin = ""

    @State private var challengeId = ""
    @State private var code = ""

    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ZStack {
                Brand.board.ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        stageIntro

                        switch stage {
                        case .proof: proofStep
                        case .phone: phoneStep
                        case .code: codeStep
                        case .done: doneStep
                        }

                        if let error, stage != .done {
                            Label(error, systemImage: "exclamationmark.circle.fill")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(Brand.badOnBoard)
                                .padding(16)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Brand.badOnBoard.opacity(0.09), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 18)
                    .padding(.bottom, stage == .done ? 28 : 116)
                }
                .scrollDismissesKeyboard(.interactively)
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if stage != .done {
                    primaryButton
                        .buttonStyle(LimeButton())
                        .padding(.horizontal, 20)
                        .padding(.vertical, 12)
                        .background(.ultraThinMaterial)
                }
            }
            .navigationTitle(L("auth.changePhone"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    /* На последнем шаге «отмена» не отменяет ничего:
                       номер уже сменён. Слово там другое, и закрытие
                       уводит на вход, а не обратно в профиль, куда со
                       старым номером уже не пускают. */
                    Button(stage == .done ? L("common.close") : L("common.cancel")) {
                        if stage == .done { leave() } else { dismiss() }
                    }
                    .disabled(busy)
                }
            }
            .task {
                /* У кого нет PIN — сразу шлём код на свой номер: иначе
                   первый экран спрашивал бы то, чего у человека нет. */
                if !session.hasPin && stage == .phone { await sendProof() }
            }
        }
        .interactiveDismissDisabled(busy)
    }

    // ══════════════════════════ шаги ══════════════════════════

    private var stageIntro: some View {
        VStack(alignment: .leading, spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(Brand.grape.opacity(0.12))
                    .frame(width: 58, height: 58)
                Image(systemName: stage == .done ? "checkmark" : "iphone.gen3.radiowaves.left.and.right")
                    .font(.system(size: 23, weight: .semibold))
                    .foregroundStyle(stage == .done ? Brand.goodOnBoard : Brand.grape)
            }

            Text(introTitle)
                .font(.system(size: 27, weight: .bold, design: .rounded))
                .foregroundStyle(Brand.onBoard)

            Text(introNote)
                .font(.system(size: 15))
                .foregroundStyle(Brand.boardMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var introTitle: String {
        switch stage {
        case .proof: return L("auth.changePhoneProof")
        case .phone: return L("auth.changePhoneNew")
        case .code: return L("auth.otpCode")
        case .done: return L("auth.changePhoneDone")
        }
    }

    private var introNote: String {
        switch stage {
        case .proof, .code: return L("auth.otpSent", sentTo)
        case .phone: return L("auth.changePhoneNote")
        case .done: return L("auth.changePhoneDoneNote")
        }
    }

    private var proofStep: some View {
        inputSurface {
            codeField($proofCode) { Task { await sendPhone() } }
        }
    }

    @ViewBuilder
    private var phoneStep: some View {
        inputSurface {
            CountryPhoneField(country: $country, number: $phone)
        }

        /* PIN спрашивается только у тех, у кого он есть. У остальных себя
           уже доказали кодом на предыдущем шаге. */
        if session.hasPin {
            inputSurface {
                Text(L("auth.pin"))
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Brand.boardMuted)
                SecureField("••••••", text: $pin)
                    .keyboardType(.numberPad)
                    .textContentType(.password)
                    .font(.system(size: 20, weight: .semibold))
                    .monospaced()
                    .onChange(of: pin) { _, v in
                        let clean = String(v.filter(\.isNumber).prefix(API.pinLength))
                        if clean != v { pin = clean }
                    }
            }
        }
    }

    private var codeStep: some View {
        inputSurface {
            codeField($code) { Task { await finish() } }
        }
    }

    @ViewBuilder
    private var doneStep: some View {
        /* Дверь наружу здесь обязательна и она одна: сессия мертва, и
           любое другое действие в приложении упрётся в отказ сервера. */
        Button(L("auth.signOut")) { leave() }
            .buttonStyle(LimeButton())
    }

    private func inputSurface<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10, content: content)
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Brand.boardSurface, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .strokeBorder(Brand.boardInk.opacity(0.07))
            }
    }

    @ViewBuilder
    private var primaryButton: some View {
        switch stage {
        case .proof:
            Button(L("common.next")) { Task { await sendPhone() } }
                .loading(busy, tint: Brand.grape, size: 18, title: L("auth.checking"))
                .disabled(busy || proofCode.count < API.codeLength)
        case .phone:
            Button(L("auth.resetSend")) { Task { await sendPhone() } }
                .loading(busy, tint: Brand.grape, size: 18, title: L("auth.checking"))
                .disabled(busy || !canSend)
        case .code:
            Button(L("auth.otpVerify")) { Task { await finish() } }
                .loading(busy, tint: Brand.grape, size: 18, title: L("auth.checking"))
                .disabled(busy || code.count < API.codeLength)
        case .done:
            EmptyView()
        }
    }

    private var canSend: Bool {
        phone.filter(\.isNumber).count >= 6 && (!session.hasPin || pin.count >= API.pinMinLength)
    }

    /// Клетка кода: одинаковая на всех шагах и на всех экранах входа.
    private func codeField(_ text: Binding<String>, done: @escaping () -> Void) -> some View {
        TextField("••••••", text: text)
            .keyboardType(.numberPad)
            // система сама подставит код из пришедшей SMS
            .textContentType(.oneTimeCode)
            .font(.system(size: 20, weight: .semibold))
            .monospaced()
            .onChange(of: text.wrappedValue) { _, v in
                let clean = String(v.filter(\.isNumber).prefix(API.codeLength))
                if clean != v { text.wrappedValue = clean }
                if clean.count == API.codeLength { done() }
            }
    }

    // ══════════════════════════ шаги наружу ══════════════════════════

    private func sendProof() async {
        busy = true
        defer { busy = false }
        error = nil

        do {
            let started = try await session.startPhoneChangeProof()
            proofId = started.proofId
            sentTo = started.phone ?? (session.me?.phone ?? "")
            stage = .proof
        } catch let e as APIError {
            error = message(for: e)
        } catch {
            self.error = L("payroll.failed")
        }
    }

    /// Шаг первый. С кодом на свой номер или с PIN — решает сервер, мы
    /// отправляем то, что у нас есть.
    private func sendPhone() async {
        /* С экрана доказательства уходим сразу к номеру: код на свой
           номер проверяется один раз, вместе с новым номером, и второй
           раз спрашивать его нечем. */
        if stage == .proof {
            guard proofCode.count == API.codeLength else { return }
            error = nil
            stage = .phone
            return
        }

        guard !busy, canSend else { return }
        busy = true
        defer { busy = false }
        error = nil

        do {
            let started = try await session.startPhoneChange(
                phone: country.e164(phone),
                pin: pin,
                proofId: proofId,
                proofCode: proofCode
            )
            challengeId = started.challengeId
            sentTo = started.phone ?? country.e164(phone)
            code = ""
            stage = .code
        } catch let e as APIError {
            /* Просроченный или исчерпанный код на СВОЙ номер отбрасывает
               в начало: доказывать себя придётся заново, и оставаться на
               экране с мёртвым кодом в памяти значило бы показывать одну
               и ту же ошибку до закрытия окна. */
            let dead = ["OTP_INVALID", "OTP_EXPIRED", "OTP_TOO_MANY"].contains(e.code)
            if !session.hasPin && dead {
                proofCode = ""
                proofId = ""
                error = message(for: e)
                await sendProof()
                error = message(for: e)
            } else {
                error = message(for: e)
            }
        } catch {
            self.error = L("payroll.failed")
        }
    }

    private func finish() async {
        guard !busy, code.count == API.codeLength else { return }
        busy = true
        defer { busy = false }
        error = nil

        do {
            try await session.finishPhoneChange(challengeId: challengeId, code: code)
            /* Сессии погашены, включая эту: приложение уже на экране
               входа. Показываем «готово» поверх него — человек обязан
               узнать, почему его выкинуло, а причина ровно та, что он
               только что сделал сам. */
            stage = .done
        } catch let e as APIError {
            code = ""
            error = message(for: e)
        } catch {
            self.error = L("payroll.failed")
        }
    }

    /// Закрыть лист и уйти на вход. Порядок важен: сначала лист, иначе
    /// он исчезнет вместе с деревом видов, и закрытие покажет кадр
    /// пустого профиля.
    private func leave() {
        dismiss()
        session.leaveAfterPhoneChange()
    }

    private func message(for e: APIError) -> String {
        if e.isOffline { return L("errors.offline") }
        switch e.code {
        case "OTP_INVALID": return L("auth.otpInvalid")
        case "OTP_EXPIRED": return L("auth.otpExpired")
        case "OTP_TOO_MANY": return L("auth.otpTooMany")
        case "TOO_MANY_TRIES": return L("auth.throttled")
        case "SMS_FAILED": return L("auth.smsFailed")
        case "WRONG_CREDENTIALS": return L("auth.wrongPin")
        case "PHONE_TAKEN": return L("auth.phoneTaken")
        case "BAD_REQUEST":
            return e.reason == "SAME_PHONE" ? L("auth.samePhone") : L("errors.badPhone")
        default: return L("payroll.failed")
        }
    }
}
