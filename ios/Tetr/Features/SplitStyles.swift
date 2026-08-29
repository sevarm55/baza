import SwiftUI

/**
 * Пять способов показать разрез денег — и переключатель между ними.
 *
 * ВРЕМЕННАЯ ВЕЩЬ. Владелец забраковал подряд несколько редакций блока
 * «Заплатили · Вы · Сотрудникам · Расходы» и попросил показать варианты
 * рядом, с кнопкой, чтобы сравнить глазами. Как только вариант выбран,
 * остальные четыре и переключатель уходят, а выбранный остаётся
 * единственным телом `breakdown` на сводке.
 *
 * Выбор живёт в `UserDefaults`, поэтому переживает перезапуск: сравнивать
 * приходится не за один присест.
 */
enum SplitStyle: Int, CaseIterable, Identifiable {
    /// Лента: полоса и подписи одной строкой под ней.
    case ribbon = 0
    /// Числа внутри самой полосы.
    case inside = 1
    /// Три плитки в ряд, без полосы.
    case tiles = 2
    /// Выписка: полоса и строки с суммами у правого края.
    case statement = 3
    /// Кольцо слева, подписи справа.
    case ring = 4

    var id: Int { rawValue }

    /// Короткое имя для переключателя — на языке разработки, не продукта:
    /// этой подписи в релизе не будет.
    var name: String {
        switch self {
        case .ribbon: return "Лента"
        case .inside: return "В полосе"
        case .tiles: return "Плитки"
        case .statement: return "Выписка"
        case .ring: return "Кольцо"
        }
    }

    static var current: SplitStyle {
        get { SplitStyle(rawValue: UserDefaults.standard.integer(forKey: key)) ?? .ribbon }
        set { UserDefaults.standard.set(newValue.rawValue, forKey: key) }
    }

    private static let key = "tetr.splitStyle"
}

/**
 * Сам разрез в выбранном виде.
 *
 * Целое (`revenue`) приходит снаружи, а не считается по кускам: в выручку
 * входит продажа абонемента, которой в разрезе нет, и сумма кусков с ней
 * не сходится.
 */
struct SplitBreakdown: View {
    let parts: [Split]
    let revenue: Int
    let currency: String
    let style: SplitStyle

    var body: some View {
        switch style {
        case .ribbon: ribbon
        case .inside: inside
        case .tiles: tiles
        case .statement: statement
        case .ring: ring
        }
    }

    // ── общее ──

    /// Строка целого: слово слева, сумма у правого края.
    private var totalRow: some View {
        HStack(spacing: 8) {
            Text(L("summary.paidIn"))
                .font(.system(size: 13))
                .foregroundStyle(Brand.boardMuted)
            Spacer(minLength: 8)
            Text(money(revenue, currency))
                .font(.system(size: 14, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(Brand.onBoard)
        }
    }

    private var total: Int { max(1, parts.reduce(0) { $0 + $1.amount }) }

    // ── 1. Лента ──

    /// Самый низкий вариант: полоса и одна строка подписей под ней.
    private var ribbon: some View {
        VStack(alignment: .leading, spacing: 8) {
            totalRow
            SplitBar(parts: parts, height: 10)
            HStack(spacing: 12) {
                ForEach(parts) { part in
                    HStack(spacing: 5) {
                        Circle()
                            .fill(part.ink)
                            .frame(width: 6, height: 6)
                        Text(part.label)
                            .font(.system(size: 11))
                            .foregroundStyle(Brand.boardMuted)
                        Text(money(part.amount, currency))
                            .font(.system(size: 11, weight: .bold))
                            .monospacedDigit()
                            .foregroundStyle(Brand.onBoard)
                    }
                }
                Spacer(minLength: 0)
            }
            .lineLimit(1)
            .minimumScaleFactor(0.6)
        }
    }

    // ── 2. В полосе ──

    /**
     * Числа стоят прямо в кусках полосы: один предмет вместо двух.
     * Подпись показывается только там, где кусок достаточно широк, —
     * иначе на узком куске остаётся сумма, а на совсем узком ничего.
     */
    private var inside: some View {
        VStack(alignment: .leading, spacing: 8) {
            totalRow

            GeometryReader { proxy in
                let gaps = CGFloat(max(0, parts.count - 1)) * 3
                let free = max(0, proxy.size.width - gaps)
                HStack(spacing: 3) {
                    ForEach(parts) { part in
                        let width = max(6, free * CGFloat(part.amount) / CGFloat(total))
                        VStack(alignment: .leading, spacing: 1) {
                            if width > 96 {
                                Text(part.label)
                                    .font(.system(size: 10))
                                    .foregroundStyle(.white.opacity(0.75))
                                    .lineLimit(1)
                            }
                            if width > 64 {
                                Text(money(part.amount, currency))
                                    .font(.system(size: 13, weight: .bold))
                                    .monospacedDigit()
                                    .foregroundStyle(.white)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.7)
                            }
                        }
                        .padding(.horizontal, 9)
                        .frame(width: width, height: 46, alignment: .leading)
                        .background(part.ink, in: .rect(cornerRadius: 12, style: .continuous))
                    }
                    Spacer(minLength: 0)
                }
            }
            .frame(height: 46)
        }
    }

    // ── 3. Плитки ──

    /// Три плитки в ряд. Полосы нет вовсе: доля читается величиной числа,
    /// а не длиной куска.
    private var tiles: some View {
        VStack(alignment: .leading, spacing: 9) {
            totalRow
            HStack(spacing: 7) {
                ForEach(parts) { part in
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(spacing: 5) {
                            Circle()
                                .fill(part.ink)
                                .frame(width: 6, height: 6)
                            Text(part.label)
                                .font(.system(size: 11))
                                .foregroundStyle(Brand.boardMuted)
                                .lineLimit(1)
                                .minimumScaleFactor(0.7)
                        }
                        Text(money(part.amount, currency))
                            .font(.system(size: 14, weight: .bold))
                            .monospacedDigit()
                            .foregroundStyle(Brand.onBoard)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 9)
                    .background(part.ink.opacity(0.09), in: .rect(cornerRadius: 14, style: .continuous))
                }
            }
        }
    }

    // ── 4. Выписка ──

    /// Полоса и строки с суммами у общего правого края.
    private var statement: some View {
        VStack(spacing: 0) {
            totalRow
                .padding(.bottom, 9)
            SplitBar(parts: parts, height: 10)
                .padding(.bottom, 4)
            SplitLegend(parts: parts, currency: currency)
        }
    }

    // ── 5. Кольцо ──

    /// Кольцо слева, подписи справа: доля читается дугой, а не длиной.
    private var ring: some View {
        HStack(alignment: .center, spacing: 16) {
            SplitRing(parts: parts, total: total)
                .frame(width: 78, height: 78)

            VStack(alignment: .leading, spacing: 7) {
                HStack(spacing: 8) {
                    Text(L("summary.paidIn"))
                        .font(.system(size: 11))
                        .foregroundStyle(Brand.boardMuted)
                    Spacer(minLength: 6)
                    Text(money(revenue, currency))
                        .font(.system(size: 12, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(Brand.onBoard)
                }

                ForEach(parts) { part in
                    HStack(spacing: 7) {
                        Circle()
                            .fill(part.ink)
                            .frame(width: 6, height: 6)
                        Text(part.label)
                            .font(.system(size: 12))
                            .foregroundStyle(Brand.boardMuted)
                            .lineLimit(1)
                        Spacer(minLength: 6)
                        Text(money(part.amount, currency))
                            .font(.system(size: 13, weight: .semibold))
                            .monospacedDigit()
                            .foregroundStyle(Brand.onBoard)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                }
            }
        }
    }
}

/**
 * Кольцо разреза: дуги по долям, просвет вместо обводки.
 *
 * `lineCap: .butt`, потому что скруглённые концы врут о доле тем сильнее,
 * чем меньше кусок, — то же правило, что у кольца в отчёте.
 */
private struct SplitRing: View {
    let parts: [Split]
    let total: Int

    var body: some View {
        ZStack {
            Circle()
                .stroke(Brand.boardInk.opacity(0.07), lineWidth: 12)

            ForEach(Array(offsets.enumerated()), id: \.offset) { index, span in
                Circle()
                    .trim(from: span.from, to: span.to)
                    .stroke(parts[index].ink, style: .init(lineWidth: 12, lineCap: .butt))
                    .rotationEffect(.degrees(-90))
            }
        }
        .padding(6)
    }

    /// Границы дуг с просветом в один процент между кусками.
    private var offsets: [(from: CGFloat, to: CGFloat)] {
        var out: [(CGFloat, CGFloat)] = []
        var cursor: CGFloat = 0
        for part in parts {
            let share = CGFloat(part.amount) / CGFloat(total)
            let end = min(1, cursor + share)
            out.append((cursor, max(cursor, end - 0.008)))
            cursor = end
        }
        return out
    }
}

/**
 * Переключатель вариантов — временный орган выбора.
 *
 * Стоит в самой карточке, чтобы сравнивать без выхода с экрана: нажатие
 * ставит следующий вид и запоминает его. Уйдёт вместе с четырьмя
 * невыбранными вариантами.
 */
struct SplitStyleSwitch: View {
    @Binding var style: SplitStyle

    var body: some View {
        Button {
            let all = SplitStyle.allCases
            let next = all[(all.firstIndex(of: style).map { $0 + 1 } ?? 0) % all.count]
            style = next
            SplitStyle.current = next
            UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        } label: {
            HStack(spacing: 5) {
                Text("\(style.rawValue + 1)/\(SplitStyle.allCases.count)")
                    .font(.system(size: 10, weight: .bold))
                    .monospacedDigit()
                Text(style.name)
                    .font(.system(size: 10, weight: .semibold))
                Image(systemName: "arrow.trianglehead.2.clockwise")
                    .font(.system(size: 9, weight: .bold))
            }
            .foregroundStyle(Brand.grape)
            .padding(.horizontal, 9)
            .frame(minHeight: 28)
            .background(Brand.grape.opacity(0.10), in: .capsule)
            .contentShape(.rect)
        }
        .buttonStyle(.press)
        .accessibilityLabel("Вариант разреза: \(style.name)")
    }
}
