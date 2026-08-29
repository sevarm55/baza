import SwiftUI

/**
 * Показания для четырёх экранов знакомства.
 *
 * ГЛАВНОЕ РЕШЕНИЕ: это не картинки, а сам продукт, собранный в миниатюре
 * и приведённый в движение. Раньше здесь лежали четыре нарисованных jpg —
 * машина с листком, кошелёк, — и они рассказывали ПРО приложение, стоя
 * снаружи него. Такой экран нечем отличить от рекламной страницы, и
 * человек листает его не читая.
 *
 * Показание, собранное из настоящих видов, отвечает на тот же вопрос
 * иначе: вот запись машины, вот из неё считается процент, вот что
 * остаётся. Владелец видит свой рабочий экран за секунду до того, как
 * впервые его откроет, и слайд перестаёт быть обещанием.
 *
 * ЧИСЛА ВО ВСЕХ ЧЕТЫРЁХ СХОДЯТСЯ. Три машины на 46 000, сорок процентов
 * мойщику это 18 400, расходы 9 000, владельцу остаётся 18 600. Продукт
 * про точность в деньгах не имеет права показывать демонстрацию, в
 * которой сумма не бьётся: первый же владелец, который сложит столбик,
 * поймает нас на выдуманных цифрах.
 *
 * СЛОВ НОВЫХ НЕТ НИ ОДНОГО. Каждая подпись здесь — существующий ключ
 * словаря, который уже переведён на три языка и уже стоит на живом
 * экране. Демонстрация, ради которой заводят десяток новых строк, живёт
 * до первой правки: переводы отстают, и на армянском вылезают голые
 * ключи.
 */

// MARK: - Общие части

/// Демонстрационная запись: та же тройка во всех показаниях.
private struct Demo {
    let plate: String
    let payment: String
    let time: String
    let price: Int

    static let orders: [Demo] = [
        Demo(plate: "34SS567", payment: "cash", time: "18:04", price: 12_000),
        Demo(plate: "77GG477", payment: "card", time: "18:41", price: 18_000),
        Demo(plate: "12AB345", payment: "cash", time: "19:12", price: 16_000),
    ]

    /// Доля мойщика с этой машины. Сорок процентов — те же, что в тексте
    /// слайда про зарплату.
    var share: Int { price * 40 / 100 }
}

/**
 * Белая карточка показания.
 *
 * Внутри принудительно светлая тема, и это не косметика. Цвета продукта
 * адаптивные: `Brand.onBoard` на тёмной теме становится почти белым. На
 * онбординге тема принудительно тёмная (полотно грейповое), и настоящие
 * строки ленты на белой карточке оказались бы белым по белому. Светлая
 * тема в поддереве возвращает им их же светлые значения — и внутрь можно
 * класть настоящие виды продукта, не переписывая им краски.
 */
private struct Paper<Content: View>: View {
    var pad: CGFloat = 15
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) { content }
            .padding(pad)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white, in: .rect(cornerRadius: 24, style: .continuous))
            .shadow(color: .black.opacity(0.3), radius: 20, y: 10)
            .environment(\.colorScheme, .light)
    }
}

/// Надпись над показанием: мелкие прописные с разрядкой.
private struct Eyebrow: View {
    let text: String

    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 10, weight: .bold))
            .tracking(1.1)
            .foregroundStyle(Brand.boardMuted)
            .lineLimit(1)
    }
}

/**
 * Строка ленты смены.
 *
 * Набрана теми же размерами и в том же порядке, что настоящая в
 * `ShiftView.journal`: номер крупно, под ним оплата и время, справа
 * сумма. Расхождение здесь стоило бы дороже, чем кажется: человек
 * запоминает вид строки на онбординге и ищет глазами её же на рабочем
 * экране.
 */
private struct Row: View {
    let demo: Demo
    /// Свежая запись: вместо значка оплаты стоит галочка.
    var fresh = false

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(demo.plate)
                        .font(.system(size: 14.5, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(Brand.onBoard)

                    Image(systemName: fresh ? "checkmark" : paymentSymbol(demo.payment))
                        .font(.system(size: 10.5, weight: fresh ? .bold : .regular))
                        .foregroundStyle(fresh ? Brand.goodOnBoard : Brand.boardMuted)
                        .contentTransition(.symbolEffect(.replace))
                }

                Text("\(paymentLabel(demo.payment)) · \(demo.time)")
                    .font(.system(size: 12))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            Text(money(demo.price))
                .font(.system(size: 14, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)
        }
        .padding(.vertical, 9)
    }
}

/// Волосяная линия между строками.
private struct Hair: View {
    var body: some View {
        Rectangle()
            .fill(Brand.line)
            .frame(height: 1)
    }
}

// MARK: - 1. Каждая машина записана

/**
 * Запись машины в три касания, показанная этими же тремя касаниями.
 *
 * Номер набирается по знаку, отмечается оплата, и запись падает в ленту
 * с галочкой. Цикл повторяется, пока экран открыт: слайд читают дольше,
 * чем идёт одна запись, и застывшая демонстрация к концу чтения
 * превращается в ту же картинку, от которой мы ушли.
 */
struct RecordHero: View {
    let beat: Beat

    @Environment(\.accessibilityReduceMotion) private var calm

    /// Сколько знаков номера уже набрано.
    @State private var typed = 0
    /// Отмечен ли способ оплаты.
    @State private var paid = false
    /// Легла ли запись в ленту.
    @State private var landed = false

    private var fresh: Demo { Demo.orders[0] }
    private var older: Demo { Demo.orders[1] }

    var body: some View {
        Paper {
            Eyebrow(text: L("shift.record"))
                .padding(.bottom, 9)
                .reveal(beat, step: 1)

            plate
                .reveal(beat, step: 2)

            payments
                .padding(.top, 9)
                .reveal(beat, step: 3)

            Hair()
                .padding(.top, 13)
                .reveal(beat, step: 4)

            Eyebrow(text: L("shift.latest"))
                .padding(.top, 11)
                .reveal(beat, step: 4)

            /* Свежая строка не появляется, а раздвигает ленту: так видно,
               что запись встала В список, а не легла поверх него. */
            VStack(spacing: 0) {
                if landed || calm {
                    Row(demo: fresh, fresh: true)
                        .transition(.move(edge: .top).combined(with: .opacity))
                    Hair()
                }
                Row(demo: older)
            }
            .clipped()
            .reveal(beat, step: 4)
        }
        .reveal(beat, step: 0)
        .task(id: beat) { try? await play() }
        .onAppear {
            /* Без движения показание стоит собранным, а не пустым: номер
               набран, оплата отмечена, запись в ленте. Иначе человек с
               выключенной анимацией видел бы пустое поле и галочку под
               ним — то есть кадр посреди истории. */
            if calm {
                typed = fresh.plate.count
                paid = true
                landed = true
            }
        }
    }

    /// Поле номера. Клетки не рисуем: в продукте номер набирают обычным
    /// полем, а клетки стоят только у кода из SMS.
    private var plate: some View {
        HStack(spacing: 1) {
            Text(String(fresh.plate.prefix(typed)))
                .font(.system(size: 19, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)

            /* Каретка мигает от часов, а не от бесконечной анимации:
               `repeatForever` продолжает считать кадры и после ухода
               экрана, а `TimelineView` останавливается вместе с ним. */
            TimelineView(.periodic(from: .now, by: 0.5)) { ctx in
                Rectangle()
                    .fill(Brand.grapeFill)
                    .frame(width: 2, height: 21)
                    .opacity(blink(ctx.date) ? 1 : 0.12)
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 13)
        .frame(height: 50)
        .background(Brand.track, in: .rect(cornerRadius: 14, style: .continuous))
    }

    private func blink(_ date: Date) -> Bool {
        guard !calm else { return true }
        return Int(date.timeIntervalSinceReferenceDate * 2) % 2 == 0
    }

    private var payments: some View {
        HStack(spacing: 7) {
            chip("cash", on: paid)
            chip("card", on: false)
            Spacer(minLength: 0)
        }
    }

    private func chip(_ key: String, on: Bool) -> some View {
        HStack(spacing: 5) {
            Image(systemName: paymentSymbol(key))
                .font(.system(size: 10))
            Text(paymentLabel(key))
                .font(.system(size: 12.5, weight: .semibold))
        }
        .foregroundStyle(on ? Brand.onLime : Brand.boardMuted)
        .padding(.horizontal, 11)
        .padding(.vertical, 8)
        .background(on ? Brand.lime : Brand.track, in: .rect(cornerRadius: 10, style: .continuous))
        .scaleEffect(on ? 1 : 0.98)
    }

    /**
     * Ход демонстрации.
     *
     * Времена подобраны под чтение, а не под скорость набора: настоящий
     * номер вводят быстрее, но здесь важно, чтобы глаз успел заметить
     * каждый из трёх шагов по отдельности.
     */
    private func play() async throws {
        guard beat == .here, !calm else { return }

        while !Task.isCancelled {
            for i in 1...fresh.plate.count {
                try await Task.sleep(for: .milliseconds(72))
                withAnimation(.easeOut(duration: Motion.instant)) { typed = i }
            }
            try await Task.sleep(for: .milliseconds(280))
            withAnimation(Motion.springSnap) { paid = true }

            try await Task.sleep(for: .milliseconds(360))
            withAnimation(Motion.springSoft) { landed = true }

            try await Task.sleep(for: .milliseconds(2400))
            withAnimation(.easeOut(duration: Motion.normal)) {
                typed = 0
                paid = false
                landed = false
            }
            try await Task.sleep(for: .milliseconds(560))
        }
    }
}

// MARK: - 2. Зарплата считается сама

/**
 * Процент, отделяющийся от каждой машины.
 *
 * Строки те же, что в ленте, но у каждой справа зажигается доля, и
 * итог внизу дорастает ровно на неё. Показано именно сложение: слайд
 * говорит «считается сама», и единственный способ это показать —
 * показать, ИЗ ЧЕГО складывается.
 */
struct PayrollHero: View {
    let beat: Beat

    @Environment(\.accessibilityReduceMotion) private var calm

    /// Сколько строк уже отдали свою долю.
    @State private var counted = 0

    private var total: Int {
        Demo.orders.prefix(counted).reduce(0) { $0 + $1.share }
    }

    var body: some View {
        Paper {
            Eyebrow(text: L("payroll.dueHeader"))
                .padding(.bottom, 4)
                .reveal(beat, step: 1)

            ForEach(Array(Demo.orders.enumerated()), id: \.offset) { i, demo in
                if i > 0 { Hair() }
                HStack(spacing: 10) {
                    Row(demo: demo)
                    percent(demo.share, on: i < counted)
                }
                .reveal(beat, step: 2 + i)
            }

            /* Итог отделён от строк не линией, а лаймом: это не ещё одна
               строка списка, а ответ, ради которого список показан. */
            HStack(spacing: 10) {
                Text(L("summary.toStaff"))
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Brand.onLime.opacity(0.7))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)

                Spacer(minLength: 8)

                Text(money(total))
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Brand.onLime)
                    .contentTransition(.numericText(value: Double(total)))
            }
            .padding(.horizontal, 13)
            .padding(.vertical, 12)
            .background(Brand.lime, in: .rect(cornerRadius: 16, style: .continuous))
            .padding(.top, 13)
            .reveal(beat, step: 5)
        }
        .reveal(beat, step: 0)
        .task(id: beat) { try? await play() }
        .onAppear { if calm { counted = Demo.orders.count } }
    }

    /// Доля с машины. Не «×40%», а сама сумма: процент назван в тексте
    /// слайда, а на экране владельца интересуют драмы.
    private func percent(_ amount: Int, on: Bool) -> some View {
        Text("+\(money(amount))")
            .font(.system(size: 12.5, weight: .bold))
            .monospacedDigit()
            .foregroundStyle(Brand.grapeFill)
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(Brand.grapeFill.opacity(0.1), in: .rect(cornerRadius: 9, style: .continuous))
            /* Плашка гаснет целиком, а не обнуляется числом: доля либо
               посчитана, либо её ещё нет, промежуточного значения у неё
               не бывает. */
            .opacity(on ? 1 : 0)
            .scaleEffect(on ? 1 : 0.86)
    }

    private func play() async throws {
        guard beat == .here, !calm else { return }

        while !Task.isCancelled {
            try await Task.sleep(for: .milliseconds(620))
            for i in 1...Demo.orders.count {
                withAnimation(Motion.springSnap) { counted = i }
                try await Task.sleep(for: .milliseconds(520))
            }
            try await Task.sleep(for: .milliseconds(2200))
            withAnimation(.easeOut(duration: Motion.normal)) { counted = 0 }
            try await Task.sleep(for: .milliseconds(400))
        }
    }
}

// MARK: - 3. Видно, сколько остаётся

/**
 * Разрез денег дня настоящей полосой продукта.
 *
 * `SplitBar` и `SplitLegend` взяты как есть, без единой правки: это тот
 * же орган, который стоит на экране сводки. Поэтому показание не нужно
 * поддерживать отдельно — поменяется полоса в продукте, поменяется и
 * здесь.
 *
 * Играет один раз, а не по кругу. Здесь нет истории из шагов, есть один
 * ответ; повторять его каждые три секунды значит мигать в лицо тому, кто
 * читает абзац под показанием.
 */
struct SplitHero: View {
    let beat: Beat

    @Environment(\.accessibilityReduceMotion) private var calm

    @State private var grown = false

    private var revenue: Int { Demo.orders.reduce(0) { $0 + $1.price } }
    private var staff: Int { Demo.orders.reduce(0) { $0 + $1.share } }
    private let costs = 9_000
    private var mine: Int { revenue - staff - costs }

    private var parts: [Split] {
        Split.money(mine: mine, staff: staff, costs: costs)
    }

    var body: some View {
        /* Порядок частей и все кегли взяты с настоящего экрана владельца
           (`OwnerView.reading`) и не подобраны заново: период, подпись,
           число по оси, под ним выручка и полоса. Показание, набранное
           «примерно так же», хуже точного — человек открывает продукт и
           не узнаёт то, что ему показывали минуту назад. */
        Paper(pad: 19) {
            Text(L("common.today"))
                .font(.system(size: 12.5, weight: .semibold))
                .foregroundStyle(Brand.boardMuted)
                .padding(.bottom, 17)
                .reveal(beat, step: 1)

            Text(L("summary.keptToday"))
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Brand.boardMuted)
                .fixedSize(horizontal: false, vertical: true)
                .reveal(beat, step: 2)

            /* Цвет по знаку — то же правило `Brand.sign`, что на всех
               денежных экранах: заработок зелёным. */
            Text(money(grown ? mine : 0))
                .font(.system(size: 42, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Brand.sign(mine))
                .lineLimit(1)
                .minimumScaleFactor(0.42)
                .contentTransition(.numericText(value: Double(grown ? mine : 0)))
                .padding(.top, 2)
                .reveal(beat, step: 2)

            VStack(alignment: .leading, spacing: 7) {
                /* Целое, из которого вышел остаток. Без него полоса
                   показывает доли неизвестно от чего. */
                HStack(spacing: 6) {
                    Text(L("summary.paidIn"))
                        .font(.system(size: 11.5))
                        .foregroundStyle(Brand.boardMuted)
                    Text(money(revenue))
                        .font(.system(size: 13, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(Brand.onBoard)
                    Spacer(minLength: 0)
                }

                SplitBar(parts: parts, height: 12)
                    .scaleEffect(x: grown ? 1 : 0.001, anchor: .leading)

                SplitLegend(parts: parts, currency: "AMD")
                    .opacity(grown ? 1 : 0)
            }
            .padding(.top, 16)
            .reveal(beat, step: 3)
        }
        .reveal(beat, step: 0)
        .task(id: beat) { try? await play() }
    }

    private func play() async throws {
        guard beat == .here else { return }
        guard !calm else { grown = true; return }

        try await Task.sleep(for: .milliseconds(560))
        withAnimation(.timingCurve(0.16, 1, 0.3, 1, duration: 0.8)) { grown = true }
    }
}

// MARK: - 4. Данные ваши

/**
 * Выгрузка и очередь записей, которые ушли сами.
 *
 * Две мысли слайда показаны двумя вещами: белый лист таблицы — то, что
 * можно унести, полоса под ним — то, что происходит без связи. Полоса
 * стоит НЕ на белом, а прямо на полотне: она про состояние телефона, а
 * не про содержимое файла.
 */
struct ExportHero: View {
    let beat: Beat

    @Environment(\.accessibilityReduceMotion) private var calm

    /// Вернулась ли связь и ушла ли очередь.
    @State private var sent = false

    var body: some View {
        VStack(spacing: 13) {
            Paper {
                HStack(spacing: 9) {
                    Image(systemName: "tablecells")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Brand.goodOnBoard)

                    VStack(alignment: .leading, spacing: 1) {
                        Text(L("more.export"))
                            .font(.system(size: 13.5, weight: .semibold))
                            .foregroundStyle(Brand.onBoard)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                        Text(L("more.exportLead"))
                            .font(.system(size: 11.5))
                            .foregroundStyle(Brand.boardMuted)
                            .lineLimit(1)
                    }

                    Spacer(minLength: 6)

                    Text("XLSX")
                        .font(.system(size: 10, weight: .bold))
                        .tracking(0.6)
                        .foregroundStyle(Brand.goodOnBoard)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 4)
                        .background(
                            Brand.goodOnBoard.opacity(0.12),
                            in: .rect(cornerRadius: 8, style: .continuous)
                        )
                }
                .padding(.bottom, 11)
                .reveal(beat, step: 1)

                ForEach(Array(Demo.orders.enumerated()), id: \.offset) { i, demo in
                    if i > 0 { Hair() }
                    sheetRow(demo)
                        .reveal(beat, step: 2 + i)
                }
            }
            .reveal(beat, step: 0)

            queue
                .reveal(beat, step: 5)
        }
        .task(id: beat) { try? await play() }
    }

    /// Строка таблицы: три столбца, как в выгруженном файле.
    private func sheetRow(_ demo: Demo) -> some View {
        HStack(spacing: 10) {
            Text(demo.time)
                .foregroundStyle(Brand.boardMuted)
                .frame(width: 44, alignment: .leading)

            Text(demo.plate)
                .foregroundStyle(Brand.onBoard)

            Spacer(minLength: 8)

            Text(money(demo.price))
                .foregroundStyle(Brand.onBoard)
        }
        .font(.system(size: 12.5, weight: .medium, design: .rounded))
        .monospacedDigit()
        .lineLimit(1)
        .padding(.vertical, 8)
    }

    /// Полоса состояния связи на самом полотне.
    private var queue: some View {
        HStack(spacing: 9) {
            Image(systemName: sent ? "checkmark.circle.fill" : "wifi.slash")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(sent ? Brand.lime : .white.opacity(0.6))
                .contentTransition(.symbolEffect(.replace))

            Text(sent ? L("common.added") : L("common.offline"))
                .font(.system(size: 12.5, weight: .semibold))
                .foregroundStyle(sent ? .white : .white.opacity(0.7))
                .lineLimit(1)
                .minimumScaleFactor(0.7)

            Spacer(minLength: 8)

            Text("\(Demo.orders.count)")
                .font(.system(size: 12, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(sent ? Brand.onLime : .white.opacity(0.75))
                .frame(minWidth: 20)
                .padding(.vertical, 3)
                .background(
                    sent ? Brand.lime : Color.white.opacity(0.14),
                    in: .rect(cornerRadius: 8, style: .continuous)
                )
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(.white.opacity(0.09), in: .rect(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(.white.opacity(0.12), lineWidth: 1)
        )
    }

    private func play() async throws {
        guard beat == .here else { return }
        guard !calm else { sent = true; return }

        while !Task.isCancelled {
            try await Task.sleep(for: .milliseconds(1700))
            withAnimation(Motion.springSnap) { sent = true }
            try await Task.sleep(for: .milliseconds(2600))
            withAnimation(.easeOut(duration: Motion.normal)) { sent = false }
        }
    }
}
