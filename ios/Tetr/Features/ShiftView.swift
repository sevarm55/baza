import SwiftUI

/**
 * Смена мойщика — то же табло, что у владельца.
 *
 * Показание по оси экрана, волна под ним, сетка плиток, журнал строками.
 * Экран открывают сорок раз за смену мокрыми руками, поэтому три вещи, ради
 * которых его открывают, не уезжают за край никогда: переключатель смены
 * закреплён сверху, кнопка записи — снизу, заработок стоит между ними.
 *
 * Волна здесь считается на месте, из записей смены: сервер отдаёт список
 * заказов, а не ряд по часам. Это дешевле, чем ещё один запрос, и всегда
 * согласовано с журналом внизу — они построены на одних и тех же данных.
 */
struct ShiftView: View {
    @EnvironmentObject private var session: Session
    @EnvironmentObject private var queue: OrderQueue

    @State private var shift: API.Shift?
    /// Держим отдельно от `shift`: переключатель должен отзываться сразу,
    /// а не ждать, пока с сервера приедет вся смена целиком.
    @State private var onShift = false
    /// Открыт лист сдачи наличных.
    @State private var handingOver = false
    @State private var recording = false
    @State private var loading = false
    /// Номер обновления. Экран открывается и сразу тянут вниз — два
    /// обновления идут одновременно, и то, что стартовало раньше, может
    /// ответить позже. Без этого счётчика старый ответ затирает свежий, и
    /// только что записанная машина исчезает с экрана, хотя на сервере она
    /// есть. Ровно так это и выглядело.
    @State private var loadID = 0

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var currency: String { session.tenant?.currency ?? "AMD" }

    private let gap: CGFloat = 10

    var body: some View {
        ScrollView {
            VStack(spacing: gap) {
                reading
                wave

                if !queue.waiting.isEmpty { pending }
                ForEach(queue.rejected) { item in stuck(item) }

                grid

                if let shift, !shift.orders.isEmpty {
                    journal(shift.orders)
                } else if !loading {
                    empty
                }
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 28)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.board.ignoresSafeArea())
        // Встать на смену — первое действие дня, и оно не должно уезжать за
        // край при прокрутке.
        .safeAreaInset(edge: .top) { toggleBar }
        .safeAreaInset(edge: .bottom) { recordButton }
        .sheet(isPresented: $handingOver) {
            HandoverView(expected: shift?.cashSoFar ?? 0) { cash in
                Task { await leaveShift(cash: cash) }
            }
        }
        .fullScreenCover(isPresented: $recording) {
            OrderFlowView { await reload() }
        }
        .task { await reload() }
        .refreshable { await reload() }
    }

    /// У владельца процент обычно 0 — он не берёт долю со своей работы.
    /// Показывать ему «твой заработок: 0 ֏» самым крупным числом на экране
    /// значит показывать пустоту: цифра верная, но смысла в ней никакого.
    /// Ему важна выручка смены, и она и становится главной.
    private var takesShare: Bool { (shift?.percent ?? 0) > 0 }

    // ══════════════════════════ переключатель ══════════════════════════

    /**
     * «Я на смене».
     *
     * Владельцу он показывает, кто на мойке, ещё до того как появится первая
     * запись: человека, который вышел час назад и пока ничего не намыл, по
     * записям не видно вовсе.
     *
     * Состояние меняем сразу, не дожидаясь сервера: связь на мойке
     * пропадает, а переключатель, который «думает» секунду, жмут второй раз.
     * Не прошло — вернём обратно на следующем обновлении.
     */
    private var toggleBar: some View {
        Toggle(isOn: Binding(
            get: { onShift },
            set: { want in Task { await setOnShift(want) } }
        )) {
            HStack(spacing: 8) {
                // точка никогда не единственный носитель смысла: рядом с ней
                // всегда слово
                Circle()
                    .fill(onShift ? Brand.goodOnBoard : Brand.boardMuted.opacity(0.5))
                    .frame(width: 8, height: 8)
                Text(onShift ? "Հերթափոխին եմ" : "Հերթափոխից դուրս")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Brand.onBoard)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
        }
        .tint(Brand.good)
        .padding(.leading, 16)
        .padding(.trailing, 12)
        .padding(.vertical, 9)
        .background(Brand.boardInk.opacity(0.07), in: .capsule)
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
        .background(Brand.board.ignoresSafeArea(edges: .top))
    }

    private func setOnShift(_ want: Bool) async {
        /* Уходя со смены — спрашиваем про наличные. Это единственный момент,
           когда деньги переходят из рук в руки, и другого места спросить не
           будет. Встаём молча: на входе спрашивать нечего. */
        if !want {
            handingOver = true
            return
        }

        let previous = onShift
        onShift = true

        let done: API.ShiftState? = try? await session.authed { token in
            try await APIClient.shared.send(
                "shift", method: "POST", body: ["open": true], token: token,
                as: API.ShiftState.self
            )
        }
        // не прошло — честно откатываемся, а не делаем вид, что встали
        onShift = done?.onShift ?? previous
    }

    private func leaveShift(cash: Int?) async {
        onShift = false

        var payload: [String: Any] = ["open": false]
        if let cash { payload["cash"] = cash }

        let done: API.ShiftState? = try? await session.authed { token in
            try await APIClient.shared.send(
                "shift", method: "POST", body: payload, token: token,
                as: API.ShiftState.self
            )
        }
        if done == nil { onShift = true }
        await reload()
    }

    // ══════════════════════════ показание ══════════════════════════

    /// Приветствие по времени суток.
    ///
    /// Единственное место, где продукт обращается к человеку по имени.
    /// Стоит десять строк, а экран перестаёт быть казённым — мойщик
    /// открывает его сорок раз за смену, и каждый раз его встречала таблица.
    private var greeting: String {
        session.me.map { "\(hello), \($0.name)" } ?? hello
    }

    private var hello: String {
        switch Calendar.current.component(.hour, from: Date()) {
        case 5..<12: return "Բարի լույս"
        case 12..<18: return "Բարի օր"
        case 18..<24: return "Բարի երեկո"
        // ночью «доброй ночи» звучит прощанием, поэтому нейтральное
        default: return "Բարև"
        }
    }

    private var reading: some View {
        let value = takesShare ? (shift?.earned ?? 0) : (shift?.revenue ?? 0)
        return VStack(spacing: 0) {
            Text(greeting)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Brand.boardMuted)
                .lineLimit(1)
                .padding(.top, 10)

            Text(takesShare ? "Քո հերթափոխն այսօր" : "Հերթափոխի հասույթ")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Brand.onBoard.opacity(0.85))
                .padding(.top, 6)

            Text(money(value, currency))
                .font(.system(size: 54, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)
                .lineLimit(1)
                .minimumScaleFactor(0.42)
                .padding(.top, 2)
                // значение передаётся внутрь: по нему система понимает, в
                // какую сторону крутить разряды
                .contentTransition(.numericText(value: Double(value)))

            /* Из чего вышло число. Без этой строки «твой заработок» — сумма
               без опоры: неясно, от какой выручки и по какой ставке она
               посчитана, и проверить её нечем. */
            if takesShare {
                Text("\(money(shift?.revenue ?? 0, currency)) հասույթից քո \(shift?.percent ?? 0)%")
                    .font(.system(size: 12))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)
                    .padding(.horizontal, 11)
                    .padding(.vertical, 6)
                    .background(Brand.boardInk.opacity(0.07), in: .capsule)
                    .padding(.top, 8)
            }
        }
        .frame(maxWidth: .infinity)
    }

    // ══════════════════════════ волна ══════════════════════════

    /**
     * Ход смены одной линией.
     *
     * Считается из записей на месте: сервер отдаёт список заказов, ряда по
     * часам у него для смены нет. Часы берутся от первой записи до
     * последней, а не от полуночи — иначе линия начиналась бы восемью
     * пустыми часами и вся смена сжималась бы в правую треть.
     */
    @ViewBuilder
    private var wave: some View {
        let buckets = hourly
        if buckets.count > 1 {
            let peak = max(1, buckets.map(\.value).max() ?? 1)
            let peakIndex = buckets.firstIndex(where: { $0.value == peak }) ?? 0

            VStack(spacing: 6) {
                GeometryReader { geo in
                    let pts = points(buckets.map { Double($0.value) / Double(peak) }, in: geo.size)
                    ZStack(alignment: .topLeading) {
                        Wave(points: pts)
                            .stroke(
                                Brand.onBoard.opacity(0.55),
                                style: .init(lineWidth: 1.6, lineCap: .round, lineJoin: .round)
                            )
                        if pts.indices.contains(peakIndex) {
                            Circle()
                                .fill(Brand.lime)
                                .frame(width: 8, height: 8)
                                .position(pts[peakIndex])
                        }
                    }
                }
                .frame(height: 48)

                Text("\(hourLabel(buckets[peakIndex].hour)) · \(money(peak, currency))")
                    .font(.system(size: 11))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)
            }
            .padding(.top, 4)
            .padding(.bottom, 6)
        }
    }

    /// Выручка по часам смены, от первой записи до последней.
    private var hourly: [(hour: Int, value: Int)] {
        guard let orders = shift?.orders, !orders.isEmpty else { return [] }
        var cal = Calendar(identifier: .gregorian)
        if let tz = session.tenant?.timezone, let zone = TimeZone(identifier: tz) {
            cal.timeZone = zone
        }
        var sum: [Int: Int] = [:]
        for o in orders {
            let h = cal.component(.hour, from: o.createdAt)
            sum[h, default: 0] += o.price
        }
        guard let lo = sum.keys.min(), let hi = sum.keys.max(), hi > lo else { return [] }
        return (lo...hi).map { ($0, sum[$0] ?? 0) }
    }

    private func hourLabel(_ hour: Int) -> String { String(format: "%02d:00", hour) }

    /// Точки волны. Единственное значение не рисуется вовсе — линия по одной
    /// точке это не линия.
    private func points(_ values: [Double], in size: CGSize) -> [CGPoint] {
        guard values.count > 1 else { return [] }
        let step = size.width / CGFloat(values.count - 1)
        let top: CGFloat = 6
        let usable = size.height - top * 2
        return values.enumerated().map { i, v in
            CGPoint(x: CGFloat(i) * step, y: top + usable * (1 - CGFloat(v)))
        }
    }

    // ══════════════════════════ сетка плиток ══════════════════════════

    /**
     * Плитки смены. Ни одна не повторяет цифру наверху.
     *
     * Когда мойщик берёт процент, наверху стоит его заработок — значит
     * широкая плитка показывает выручку смены и кольцом его долю в ней.
     * Когда процента нет (владелец моет сам), наверху уже стоит выручка, и
     * широкой становится другая: наличные на руках.
     *
     * Наличные — та цифра, ради которой экран открывают во второй раз за
     * смену: столько с него спросят при закрытии, и лучше увидеть её
     * заранее, чем узнать в момент сдачи.
     */
    private var grid: some View {
        let count = shift?.count ?? 0
        let cash = shift?.cashSoFar ?? 0
        let revenue = shift?.revenue ?? 0
        let percent = shift?.percent ?? 0

        return VStack(spacing: gap) {
            if takesShare {
                wide(
                    title: "Հերթափոխի հասույթ",
                    value: money(revenue, currency),
                    foot: "քո \(percent)%",
                    animate: Double(revenue),
                    ring: Double(percent) / 100
                )
                HStack(spacing: gap) {
                    small(.lime, session.tenant?.unitOne ?? "", "\(count)", animate: Double(count))
                    small(.slate, "Կանխիկ ձեռքին", money(cash, currency), animate: Double(cash))
                }
            } else {
                wide(
                    title: "Կանխիկ ձեռքին",
                    value: money(cash, currency),
                    foot: "հանձնելու է հերթափոխի վերջում",
                    animate: Double(cash),
                    ring: nil
                )
                HStack(spacing: gap) {
                    small(.lime, session.tenant?.unitOne ?? "", "\(count)", animate: Double(count))
                    small(
                        .slate, "Միջին չեկ",
                        money(count > 0 ? revenue / count : 0, currency),
                        animate: Double(count > 0 ? revenue / count : 0)
                    )
                }
            }
        }
    }

    private func wide(
        title: String,
        value: String,
        foot: String,
        animate: Double,
        ring: Double?
    ) -> some View {
        HStack(alignment: .center, spacing: 14) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.7))
                Text(value)
                    .font(.system(size: 26, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                    .contentTransition(.numericText(value: animate))
                Text(foot)
                    .font(.system(size: 11))
                    .monospacedDigit()
                    .foregroundStyle(.white.opacity(0.7))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            Spacer(minLength: 0)
            if let ring {
                Ring(share: ring)
                    .frame(width: 62, height: 62)
                    .accessibilityHidden(true)
            }
        }
        .tile(.violet)
    }

    private func small(_ tone: Tone, _ title: String, _ value: String, animate: Double) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.system(size: 11.5))
                .foregroundStyle(tone.ink.opacity(0.72))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Spacer(minLength: 6)
            Text(value)
                .font(.system(size: 22, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(tone.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .contentTransition(.numericText(value: animate))
        }
        .frame(height: 92, alignment: .topLeading)
        .tile(tone)
        .accessibilityElement(children: .combine)
    }

    // ══════════════════════════ очередь ══════════════════════════

    /// Несинхронизированное показываем честно, но не тревожно: запись
    /// сделана и не пропадёт, просто ещё не ушла.
    private var pending: some View {
        HStack(spacing: 10) {
            Image(systemName: "arrow.triangle.2.circlepath")
                .font(.system(size: 13))
                .foregroundStyle(Brand.boardMuted)
            Text("\(queue.waiting.count) գրանցում սպասում է կապի")
                .font(.system(size: 13))
                .foregroundStyle(Brand.boardMuted)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 18))
    }

    /// Запись, которую сервер не принял.
    ///
    /// Показывается как есть, с номером машины и причиной: молча выбросить
    /// работу человека нельзя, а решить, повторить её или отменить, может
    /// только он сам.
    private func stuck(_ item: OrderQueue.Item) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 13))
                    .foregroundStyle(Brand.warnOnBoard)
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.clientKey)
                        .font(.system(size: 14, weight: .semibold, design: .rounded))
                        .foregroundStyle(Brand.onBoard)
                    Text("\(item.serviceName) · \(item.failure ?? "")")
                        .font(.system(size: 11.5))
                        .foregroundStyle(Brand.boardMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }

            HStack(spacing: 8) {
                Button("Կրկնել") { queue.retry(item.ref) }
                    .buttonStyle(.glass)
                Button("Հեռացնել") { queue.drop(item.ref) }
                    .buttonStyle(.glass)
                    .tint(Brand.muted)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Brand.boardInk.opacity(0.07), in: .rect(cornerRadius: 18))
    }

    // ══════════════════════════ журнал ══════════════════════════

    private func journal(_ orders: [API.ShiftOrder]) -> some View {
        VStack(spacing: 0) {
            HStack {
                Text("Վերջինները")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Brand.boardMuted)
                Spacer()
                Text("\(orders.count)")
                    .font(.system(size: 12))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)
            }
            .padding(.horizontal, 6)
            .padding(.top, 14)
            .padding(.bottom, 6)

            ForEach(orders) { order in
                HStack(spacing: 10) {
                    Text(at(order.createdAt))
                        .font(.system(size: 12))
                        .monospacedDigit()
                        .foregroundStyle(Brand.boardMuted)
                        .frame(width: 42, alignment: .leading)

                    Text(order.serviceName)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Brand.onBoard)
                        .lineLimit(1)

                    Image(systemName: paymentSymbol(order.payment))
                        .font(.system(size: 10.5))
                        .foregroundStyle(Brand.boardMuted)
                        .accessibilityLabel(paymentLabel(order.payment))

                    Spacer(minLength: 8)

                    Text(money(order.price, currency))
                        .font(.system(size: 14, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(Brand.onBoard)
                }
                .padding(.horizontal, 6)
                .padding(.vertical, 11)
                .accessibilityElement(children: .combine)

                if order.id != orders.last?.id {
                    Rectangle()
                        .fill(Brand.boardInk.opacity(0.07))
                        .frame(height: 1)
                }
            }
        }
    }

    private var empty: some View {
        Text("Հերթափոխը դեռ չի սկսվել")
            .font(.system(size: 14))
            .foregroundStyle(Brand.boardMuted)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 44)
    }

    // ══════════════════════════ кнопка ══════════════════════════

    /* Без подложки под кнопкой. Материал там был лишним: кнопка
       непрозрачная, закрывать ей нечего, а на тёмной теме он читался
       отдельной серой плитой от кнопки до самого низа.

       Вне смены записывать нельзя, и кнопка это показывает собой, а не
       окошком с отказом. Причина не в дисциплине: машина, записанная вне
       смены, не попадает в сдачу наличных при закрытии — деньги за неё
       работник уносит, ничего не нарушив, а владелец недосчитывается и не
       понимает почему. */
    private var recordButton: some View {
        VStack(spacing: 8) {
            if !onShift {
                Text("Գրանցելու համար միացրեք հերթափոխը")
                    .font(.system(size: 12.5))
                    .foregroundStyle(Brand.boardMuted)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Button("+ \(session.tenant?.unitOne ?? "")") {
                recording = true
            }
            .buttonStyle(LimeButton())
            .disabled(!onShift)
            .opacity(onShift ? 1 : 0.45)
        }
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
        .animation(reduceMotion ? nil : .snappy(duration: 0.25), value: onShift)
    }

    /// Время в зоне бизнеса, а не устройства: владелец в поездке видел
    /// смену, начатую в шесть утра.
    private func at(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "hy_AM")
        f.dateFormat = "HH:mm"
        if let tz = session.tenant?.timezone, let zone = TimeZone(identifier: tz) {
            f.timeZone = zone
        }
        return f.string(from: date)
    }

    private func reload() async {
        loadID += 1
        let id = loadID
        loading = true
        defer { loading = false }

        // сначала досылаем накопленное: иначе смена покажет вчерашние цифры,
        // хотя записи уже сделаны
        await queue.flush(using: session)

        let fresh = try? await session.authed { token in
            try await APIClient.shared.send("shift", token: token, as: API.Shift.self)
        }

        // применяем только если за это время не начали новое обновление
        guard id == loadID, let fresh else { return }

        /* Первая загрузка без анимации: прокрутка от нуля к сумме на старте
           читается как индикатор загрузки, а не как смысл. */
        if shift == nil || reduceMotion {
            shift = fresh
        } else {
            withAnimation(.snappy(duration: 0.45)) { shift = fresh }
        }
        onShift = fresh.onShift
    }
}

/**
 * Значок способа оплаты.
 *
 * В ленте способ стоял словом, и строка «Դավիթ · Թափք · Փոխանցում» читалась
 * целиком — а нужен из неё один взгляд: наличные это были или карта. Значок
 * отвечает на это мгновенно и занимает место одной буквы.
 */
func paymentSymbol(_ key: String) -> String {
    switch key {
    case "cash": return "banknote.fill"
    case "card": return "creditcard.fill"
    case "transfer": return "arrow.left.arrow.right"
    case "pass": return "ticket.fill"
    default: return "circle.fill"
    }
}

func paymentLabel(_ key: String) -> String {
    switch key {
    case "cash": return "Կանխիկ"
    case "card": return "Քարտ"
    case "transfer": return "Փոխանցում"
    case "pass": return "Աբոնեմենտ"
    default: return key
    }
}
