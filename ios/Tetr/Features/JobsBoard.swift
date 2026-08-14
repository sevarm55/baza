import SwiftUI

/**
 * Очередь мойки глазами владельца: кто что моет прямо сейчас.
 *
 * До этого продукт знал только результат — вымытые машины за день. Что
 * стоит во дворе и кто чем занят, жило в голове владельца и в криках
 * через двор. Здесь очередь становится предметом, на который можно
 * посмотреть.
 *
 * В очереди только ждущие: переданные и взятые. Начатая машина отсюда
 * уходит в ленту — она уже не ждёт, и держать её здесь значит показывать
 * очередь длиннее настоящей.
 */
struct JobsBoard: View {
    let jobs: [API.Job]
    let cancel: (API.Job) async -> Void

    private var waiting: [API.Job] { jobs.filter { $0.status != "started" } }

    /**
     Пустой очереди на экране нет.

     Блок, который в спокойный день говорит «машин не назначено»,
     занимает место ровно тогда, когда сказать ему нечего, — а сводка и
     без него перегружена. Появляется он вместе с первой машиной во
     дворе и исчезает с последней.

     Приём машины при этом доступен всегда: он ушёл плюсом в верхнюю
     строку, рядом с колокольчиком, и от наличия очереди не зависит.
     */
    var body: some View {
        if !waiting.isEmpty {
            VStack(spacing: 0) {
                HStack {
                    Text("Հերթ")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Brand.boardMuted)
                    Text("\(waiting.count)")
                        .font(.system(size: 12))
                        .monospacedDigit()
                        .foregroundStyle(Brand.boardMuted.opacity(0.7))

                    Spacer()
                }
                .padding(.horizontal, 6)
                .padding(.top, 14)
                .padding(.bottom, 6)

                ForEach(waiting) { job in
                    JobBoardRow(job: job, cancel: cancel)
                    if job.id != waiting.last?.id {
                        Divider().overlay(Brand.boardInk.opacity(0.07))
                    }
                }
            }
            .padding(.horizontal, 10)
            .background(Brand.boardSurface, in: .rect(cornerRadius: 18))
            .overlay {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .strokeBorder(Brand.boardInk.opacity(0.07), lineWidth: 0.8)
            }
        }
    }
}

private struct JobBoardRow: View {
    let job: API.Job
    let cancel: (API.Job) async -> Void

    @State private var busy = false

    private var state: String { job.status == "accepted" ? "Ընդունված է" : "Սպասում է" }

    private var waited: String {
        let m = job.waitedMinutes
        if m < 1 { return "հենց նոր" }
        if m < 60 { return "\(m) րոպե առաջ" }
        return "\(m / 60) ժամ առաջ"
    }

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(job.clientKey)
                    .font(.system(size: 15, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(Brand.onBoard)
                    .lineLimit(1)
                Text([job.staffName, job.serviceName].compactMap { $0 }.joined(separator: " · "))
                    .font(.system(size: 12))
                    .foregroundStyle(Brand.boardMuted)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            VStack(alignment: .trailing, spacing: 2) {
                Text(state)
                    .font(.system(size: 12.5, weight: .medium))
                    .foregroundStyle(Brand.onBoard)
                Text(waited)
                    .font(.system(size: 12))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)
            }

            /* Снять с очереди может только владелец: машина уехала, не
               дождавшись, — его решение, а не мойщика, которому просто не
               хочется её мыть. */
            Button {
                guard !busy else { return }
                busy = true
                Task { await cancel(job); busy = false }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .semibold))
                    .frame(width: 28, height: 28)
            }
            .buttonStyle(PressStyle())
            .foregroundStyle(Brand.boardMuted)
            .disabled(busy)
            .accessibilityLabel("Հանել հերթից")
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 11)
    }
}

/**
 * Приём машины — на языке продукта, а не системной формы.
 *
 * Первый вариант был обычной формой iOS: серые секции, заголовки над
 * ними, развёрнутый список людей. Она работала и выглядела чужой — рядом
 * с экраном записи машины, собранным как приборная панель, эта форма
 * читалась как настройки, а не как действие мойки.
 *
 * Здесь то же табло: номер крупно, люди и услуги плитками, одно действие
 * внизу. Заполнять нечего, кроме номера: мойщик уже выбран в меню, услуга
 * необязательна — владелец часто ещё торгуется о цене, и последнее слово
 * всё равно останется за записью.
 */
struct AssignJobSheet: View {
    let staff: [API.StaffMember]
    let services: [API.Service]
    let unitOne: String
    let clientIdLabel: String
    /// Мойщик, выбранный ещё в меню: в листе его переспрашивать незачем.
    let preselected: String
    /// Принять машину. Возвращает текст ошибки или `nil`, если вышло.
    let assign: (String, String, String?, String?) async -> String?

    @Environment(\.dismiss) private var dismiss

    @State private var clientKey = ""
    @State private var staffId: String
    @State private var serviceId = ""
    @State private var busy = false
    /// Не вышло. Лист остаётся открытым: набранное не должно пропасть.
    @State private var failure: String?
    @FocusState private var typing: Bool

    init(
        staff: [API.StaffMember],
        services: [API.Service],
        unitOne: String,
        clientIdLabel: String,
        preselected: String,
        assign: @escaping (String, String, String?, String?) async -> String?
    ) {
        self.staff = staff
        self.services = services
        self.unitOne = unitOne
        self.clientIdLabel = clientIdLabel
        self.preselected = preselected
        self.assign = assign
        _staffId = State(initialValue: preselected)
    }

    private var ready: Bool { !clientKey.isEmpty && !staffId.isEmpty }

    var body: some View {
        VStack(spacing: 16) {
            handle

            /* Номер — единственное, ради чего лист открывают, поэтому он
               крупный, по центру и с курсором в нём с первой секунды. */
            TextField(clientIdLabel, text: $clientKey)
                .focused($typing)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                .multilineTextAlignment(.center)
                .font(.system(size: 30, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)
                /* Пробел и дефис не принимаем вовсе: номер один и вид у
                   него один — как на пластине, слитно. */
                .onChange(of: clientKey) { _, value in
                    let clean = value.uppercased().filter { !$0.isWhitespace && $0 != "-" }
                    if clean != value { clientKey = clean }
                }
                .padding(.vertical, 18)
                .frame(maxWidth: .infinity)
                .background(Brand.boardSurface, in: .rect(cornerRadius: 18))

            people
            offers

            if let failure {
                Text(failure)
                    .font(.system(size: 13))
                    .foregroundStyle(Brand.warnOnBoard)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)

            Button {
                guard !busy, ready else { return }
                busy = true
                failure = nil
                Task {
                    let problem = await assign(clientKey, staffId, serviceId.isEmpty ? nil : serviceId, nil)
                    busy = false
                    /* Закрываем только на успехе: закрытый лист после
                       неудачи означает потерянный набор и ложное «готово». */
                    if let problem { failure = problem } else { dismiss() }
                }
            } label: {
                Text(busy ? "…" : "Ընդունել \(unitOne)")
                    .font(.system(size: 16, weight: .bold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
            }
            .buttonStyle(PressStyle())
            .foregroundStyle(ready ? Brand.onLime : Brand.boardMuted)
            .background(
                ready ? Brand.lime : Brand.boardInk.opacity(0.08),
                in: .rect(cornerRadius: 16)
            )
            .disabled(!ready || busy)
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Brand.board.ignoresSafeArea())
        .presentationDetents([.height(430)])
        .presentationDragIndicator(.hidden)
        .onAppear { typing = true }
    }

    // ──────────────────────────── части ────────────────────────────

    private var handle: some View {
        HStack {
            Text("Ընդունել \(unitOne)")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Brand.onBoard)
            Spacer()
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .bold))
                    .frame(width: 30, height: 30)
            }
            .buttonStyle(PressStyle())
            .foregroundStyle(Brand.boardMuted)
            .accessibilityLabel("Փակել")
        }
        .padding(.top, 18)
    }

    /// Люди плитками: выбранный уже подсвечен, сменить — одно касание.
    @ViewBuilder
    private var people: some View {
        if staff.count > 1 {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(staff) { person in
                        chip(person.name, on: staffId == person.id) { staffId = person.id }
                    }
                }
                .padding(.horizontal, 2)
            }
        }
    }

    /// Услуга необязательна, поэтому повторное касание её снимает.
    @ViewBuilder
    private var offers: some View {
        if !services.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(services) { service in
                        chip(service.name, on: serviceId == service.id) {
                            serviceId = serviceId == service.id ? "" : service.id
                        }
                    }
                }
                .padding(.horizontal, 2)
            }
        }
    }

    private func chip(_ title: String, on: Bool, tap: @escaping () -> Void) -> some View {
        Button(action: tap) {
            Text(title)
                .font(.system(size: 14, weight: .semibold))
                .lineLimit(1)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
        }
        .buttonStyle(PressStyle())
        .foregroundStyle(on ? Brand.onLime : Brand.onBoard)
        .background(on ? Brand.lime : Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 12))
    }
}
