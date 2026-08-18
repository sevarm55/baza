import SwiftUI

/**
 * Один день из истории — тот же экран, что сегодняшний, только в прошлом.
 *
 * Раньше он был устроен иначе: цветные плитки с градиентами наверху,
 * фиолетовые кирпичи под каждым, кто стоял на смене, и журнал строками
 * внизу. Плитки отвечали на два вопроса — «выручка» и «сколько машин», — и
 * оба уже стояли на экране в другом месте: выручка звучит в разрезе денег,
 * а число машин подписано над журналом. То есть половину высоты занимало
 * повторение, набранное самым громким, что есть в продукте.
 *
 * Композиция теперь та же, что в кабинете за сегодня, и это главное: день
 * из календаря и день текущий — одно и то же событие, разведённое во
 * времени, и читаться они обязаны одинаково.
 *
 *   1. сколько осталось          → число;
 *   2. из чего оно вышло         → полоса, разрезанная по долям;
 *   3. кто стоял и что сдал      → смены;
 *   4. что именно было           → журнал.
 *
 * Смены стоят перед записями и не сворачиваются. Человек мог отстоять день
 * и не намыть ничего — по одним записям этого не увидеть, а владельцу важно
 * именно это.
 *
 * Цвет из заливок ушёл в кружки с буквой: он и здесь работает именем, как в
 * команде, в зарплатах и в ленте смены. Два человека подряд, набранные
 * сплошной заливкой, читались двумя одинаковыми кирпичами, а не двумя
 * разными людьми.
 */
struct DayView: View {
    let date: String

    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss

    @State private var day: API.Day?
    @State private var loading = true
    /// Почему день не открылся. Раньше отказ глотался вместе с ошибкой
    /// разбора, и человек видел белый лист без единого слова.
    @State private var failure: String?

    private var currency: String { session.tenant?.currency ?? "AMD" }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                if let failure {
                    problem(failure)
                } else if let day {
                    reading(day)
                    crew(day.shifts)
                    if day.feed.isEmpty { empty } else { records(day.feed) }
                } else if loading {
                    TetrLoader(size: 34, tint: Brand.grape).padding(.vertical, 80)
                }
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 28)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.board.ignoresSafeArea())
        .safeAreaInset(edge: .top) { header }
        .task { await load() }
        .refreshable { await load() }
        .presentationDragIndicator(.hidden)
    }

    // ══════════════════════════ шапка ══════════════════════════

    /**
     * Дата и день недели.
     *
     * День недели поставлен под числом намеренно: владелец помнит не «18
     * августа», а «та суббота, когда было много». Календарь, из которого
     * сюда заходят, расставляет дни по числам и этого не говорит, поэтому
     * первое, что должна сообщить карточка, — какой это был день.
     */
    private var header: some View {
        HStack {
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Brand.boardMuted)
                    .frame(width: 38, height: 38)
                    .background(Brand.boardInk.opacity(0.07), in: .circle)
            }
            .buttonStyle(.press)
            .accessibilityLabel(L("common.close"))

            Spacer()

            VStack(spacing: 1) {
                Text(Self.title(date))
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Brand.onBoard)
                if let weekday = Self.weekday(date) {
                    Text(weekday)
                        .font(.system(size: 11.5))
                        .foregroundStyle(Brand.boardMuted)
                }
            }

            Spacer()

            // симметрия: без пустого кружка справа заголовок стоял бы не по
            // центру экрана, а по центру остатка, и это заметно
            Color.clear.frame(width: 38, height: 38)
        }
        .padding(.horizontal, 12)
        .padding(.top, 10)
        .padding(.bottom, 10)
        .background(Brand.board.ignoresSafeArea(edges: .top))
    }

    // ══════════════════════════ показание ══════════════════════════

    /**
     * Наверху прибыль, а не выручка.
     *
     * Карточку дня открывают из календаря, где уже видели, насколько день
     * был густым; вопрос, с которым сюда заходят, другой — сколько с него
     * осталось.
     */
    private func reading(_ day: API.Day) -> some View {
        VStack(spacing: 0) {
            Text(day.profit >= 0 ? L("day.kept") : L("day.red"))
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Brand.onBoard.opacity(0.85))

            /* Минус настоящий, U+2212: дефис на таком кегле читается точкой.
               Убыток жёлтым, не красным — красный в продукте значит
               «удалить». */
            Text((day.profit < 0 ? "−" : "") + money(abs(day.profit), currency))
                .font(.system(size: 46, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(day.profit < 0 ? Brand.warnOnBoard : Brand.onBoard)
                .lineLimit(1)
                .minimumScaleFactor(0.45)

            totals(day)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 4)
    }

    /**
     * Итоги дня лентой чисел, а не цветными плитками.
     *
     * Плиток было две, и обе повторяли то, что на экране уже есть: выручку
     * объясняет журнал построчно, число машин подписано над ним. Читались
     * они при этом громче всего остального — тёмная заливка со свечением
     * рядом с чёрным числом на светлом полотне забирает взгляд первой.
     *
     * Лента называет цепочку целиком: пришло, ушло людям, ушло на расходы.
     * Это те самые три числа, из которых вышло большое число сверху, — и
     * стоят они на своём месте, сразу под ним, без коробок и без цвета.
     * Число машин отсюда убрано намеренно: оно живёт над журналом, где
     * отвечает за длину списка.
     */
    @ViewBuilder
    private func totals(_ day: API.Day) -> some View {
        if day.stats.revenue > 0 || day.costs.total > 0 {
            StatCards(items: [
                Stat(
                    id: "revenue",
                    label: L("owner.revenue"),
                    value: money(day.stats.revenue, currency),
                    tint: .mint
                ),
                Stat(
                    id: "staff",
                    label: L("summary.toStaff"),
                    value: money(day.stats.payroll, currency),
                    tint: .lavender
                ),
                Stat(
                    id: "costs",
                    label: L("expenses.title"),
                    value: money(day.costs.total, currency),
                    tint: .sand
                ),
            ])
            .padding(.top, 18)
        }
    }

    // ══════════════════════════ смены ══════════════════════════

    /**
     * Кто стоял на смене — одной белой коробкой, а не плиткой на человека.
     *
     * Смена это отрезок времени и деньги, которые за него прошли через
     * руки. Обе вещи текстовые, и сплошная заливка цветом человека их
     * только глушила: белый по фиолетовому в двенадцать пунктов читается
     * хуже, чем чернила по бумаге, а строку про сдачу наличных читают
     * внимательно.
     *
     * Себя владелец в этом списке не видит — то же правило, что в сводке
     * за сегодня. Он и так знает, что был на площадке; зато его собственные
     * смены дробятся на куски при каждом заходе в приложение, и «Севак» два
     * раза подряд читался двумя людьми. Список отвечает на вопрос «кто у
     * меня работал», а себя в этот вопрос не включают.
     */
    @ViewBuilder
    private func crew(_ all: [API.DayShift]) -> some View {
        let shifts = all.filter { $0.userId != session.me?.id }

        if !shifts.isEmpty {
            VStack(spacing: 0) {
                section(L("owner.onShift"), trailing: "\(shifts.count)")

                VStack(spacing: 0) {
                    ForEach(Array(shifts.enumerated()), id: \.element.id) { index, s in
                        if index > 0 { separator }
                        shiftRow(s)
                    }
                }
                .background(Brand.boardSurface, in: .rect(cornerRadius: 22, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .strokeBorder(Brand.boardInk.opacity(0.07), lineWidth: 0.8)
                }
            }
        }
    }

    private func shiftRow(_ s: API.DayShift) -> some View {
        let tone = Brand.personTone(s.name)
        let open = s.closedAt == nil

        return HStack(alignment: .top, spacing: 12) {
            ZStack(alignment: .bottomTrailing) {
                Text(String(s.name.prefix(1)))
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 34, height: 34)
                    .background(tone.base, in: .circle)

                /* Незакрытая смена помечена той же зелёной точкой, что
                   человек на площадке в кабинете. В истории она значит не
                   «работает сейчас», а «смену не закрыли», и это тот
                   случай, когда одного слова мало: пропуск в учёте видно
                   раньше, чем прочитан диапазон времени. */
                if open {
                    Circle()
                        .fill(Brand.goodOnBoard)
                        .frame(width: 11, height: 11)
                        .overlay(Circle().strokeBorder(Brand.boardSurface, lineWidth: 2))
                        .offset(x: 1, y: 1)
                }
            }

            VStack(alignment: .leading, spacing: 5) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(s.name)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Brand.onBoard)
                        .lineLimit(1)

                    Spacer(minLength: 4)

                    Text(span(s))
                        .font(.system(size: 12.5))
                        .monospacedDigit()
                        .foregroundStyle(Brand.boardMuted)
                        .lineLimit(1)
                }

                if let expected = s.cashExpected, expected > 0 || s.cashDeclared != nil {
                    cash(expected: expected, declared: s.cashDeclared)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .accessibilityElement(children: .combine)
    }

    /**
     * Наличные: сколько набралось и сколько сдал.
     *
     * «Сдал ноль» и «не отметил» показываются по-разному, и это не
     * придирка. Первое значит, что денег не было. Второе — что человек не
     * дошёл до экрана сдачи: приложение о деньгах ничего не знает и не
     * вправе делать вид, что знает.
     *
     * Поэтому формулировка безличная — «сдача не отмечена», а не «не
     * отметил»: второе звучит претензией к человеку там, где утверждать
     * нечего. И жёлтым, а не лаймом: лайм в продукте значит «хорошо», а
     * это пропуск в учёте, который надо закрыть, а не достижение.
     *
     * Плашки под строкой больше нет. На тёмной плитке она отделяла деньги
     * от имени, на белой коробке отделять нечего: строка и так вторая, и
     * серый прямоугольник внутри белого читался вложенной карточкой,
     * которой здесь нет.
     */
    private func cash(expected: Int, declared: Int?) -> some View {
        HStack(spacing: 5) {
            Text(L("day.cashInShift", money(expected, currency)))
                .foregroundStyle(Brand.boardMuted)

            if let declared {
                Text(L("day.handedOver", money(declared, currency)))
                    .foregroundStyle(Brand.boardMuted)

                let diff = declared - expected
                if diff != 0 {
                    Text(diff < 0
                         ? "· −\(money(-diff, currency))"
                         : "· +\(money(diff, currency))")
                        .fontWeight(.bold)
                        .foregroundStyle(Brand.warnOnBoard)
                }
            } else {
                Text(L("day.notDeclared"))
                    .foregroundStyle(Brand.warnOnBoard)
            }

            Spacer(minLength: 0)
        }
        .font(.system(size: 12))
        .monospacedDigit()
        .lineLimit(1)
        .minimumScaleFactor(0.75)
    }

    // ══════════════════════════ журнал ══════════════════════════

    /**
     * Записи — строками прямо на табло, без карточки, как в кабинете.
     *
     * Номер машины первым и крупнее остального: это единственный
     * опознавательный знак записи. Время ушло из левой колонки вниз, в
     * самое тихое место строки, — колонка одинаковых «12:20» забирала вход
     * в строку у того, ради чего в неё смотрят.
     *
     * Кто помыл — кружком его цвета, а не именем через точку. Тот же
     * кружок стоит у этого человека в смене над журналом и в команде;
     * список не читают, его просматривают, и цвет опознаётся раньше слова.
     */
    private func records(_ feed: [API.FeedItem]) -> some View {
        VStack(spacing: 0) {
            section(
                L("day.records"),
                trailing: Terms.units(feed.count, session.tenant?.unitOne ?? "")
                    .trimmingCharacters(in: .whitespaces)
            )

            ForEach(feed) { item in
                recordRow(item)
                if item.id != feed.last?.id { separator }
            }
        }
    }

    private func recordRow(_ item: API.FeedItem) -> some View {
        let who = item.staffName ?? "—"
        let tone = Brand.personTone(who)

        return HStack(alignment: .top, spacing: 12) {
            Text(String(who.prefix(1)))
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 34, height: 34)
                .background(who == "—" ? Brand.boardInk.opacity(0.18) : tone.base, in: .circle)
                .padding(.top, 1)

            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.clientKey ?? "—")
                        .font(.system(size: 16, weight: .semibold, design: .rounded))
                        .foregroundStyle(Brand.onBoard)
                        .lineLimit(1)

                    /* Услуга — потому что без неё цена необъяснима: 2 500 и
                       12 000 в соседних строках выглядят ошибкой, пока не
                       видно, что одно кузов, а другое химчистка. Способ
                       оплаты словом, а не значком: значок карты и значок
                       перевода на десяти точках различаются, только если
                       знать, что они разные. */
                    Text("\(item.serviceName) · \(paymentLabel(item.payment).lowercased())")
                        .font(.system(size: 12))
                        .foregroundStyle(Brand.boardMuted)
                        .lineLimit(1)
                        .truncationMode(.tail)

                    Text(hhmm(item.createdAt))
                        .font(.system(size: 11.5))
                        .monospacedDigit()
                        .foregroundStyle(Brand.boardMuted.opacity(0.75))
                }

                Spacer(minLength: 4)

                VStack(alignment: .trailing, spacing: 2) {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        /* Скидка: зачёркнутый прайс рядом со взятым. Без
                           него «6 500» не отличить от обычной цены, и о
                           скидке владелец не узнаёт вовсе — в истории дня
                           её было не видно ни одним способом. */
                        if let list = item.listPrice, list > item.price {
                            Text(money(list, currency))
                                .font(.system(size: 12))
                                .monospacedDigit()
                                .strikethrough()
                                .foregroundStyle(Brand.boardMuted)
                        }
                        Text(money(item.price, currency))
                            .font(.system(size: 15, weight: .semibold))
                            .monospacedDigit()
                            .foregroundStyle(Brand.onBoard)
                    }

                    /* При нулевой ставке строки долей нет вовсе: у
                       владельца, который записывает сам, процента нет, и
                       «ему 0 ֏» в каждой записи — шум. */
                    if (item.staffPercent ?? 0) > 0 {
                        Text(L("summary.toBusiness", money(item.price - item.earned, currency)))
                            .font(.system(size: 12))
                            .monospacedDigit()
                            .foregroundStyle(Brand.boardMuted)
                            .lineLimit(1)

                        Text(L("summary.share", money(item.earned, currency)))
                            .font(.system(size: 11.5))
                            .monospacedDigit()
                            .foregroundStyle(Brand.boardMuted.opacity(0.75))
                            .lineLimit(1)
                    }
                }
            }
        }
        .padding(.horizontal, 4)
        .padding(.vertical, 10)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(who), \(item.clientKey ?? "")")
    }

    // ══════════════════════════ мелочи ══════════════════════════

    /// Подпись раздела: слово слева, счёт справа. Одна на оба списка —
    /// именно повтор и делает их двумя частями одного экрана.
    private func section(_ title: String, trailing: String?) -> some View {
        HStack {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Brand.boardMuted)
            Spacer()
            if let trailing {
                Text(trailing)
                    .font(.system(size: 12))
                    .monospacedDigit()
                    .foregroundStyle(Brand.boardMuted)
            }
        }
        .padding(.horizontal, 4)
        .padding(.top, 22)
        .padding(.bottom, 6)
    }

    private var separator: some View {
        Rectangle()
            .fill(Brand.boardInk.opacity(0.07))
            .frame(height: 1)
    }

    private var empty: some View {
        Text(L("day.empty"))
            .font(.system(size: 14))
            .foregroundStyle(Brand.boardMuted)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 40)
    }

    /// «09:40 — 19:12» или «с 09:40», если смену не закрыли.
    private func span(_ s: API.DayShift) -> String {
        guard let closed = s.closedAt else { return L("summary.since", hhmm(s.openedAt)) }
        return "\(hhmm(s.openedAt)) — \(hhmm(closed))"
    }

    /// Время в зоне бизнеса, а не устройства: владелец в поездке видел
    /// смену, начатую в шесть утра.
    private func hhmm(_ at: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        if let tz = session.tenant?.timezone, let zone = TimeZone(identifier: tz) {
            f.timeZone = zone
        }
        return f.string(from: at)
    }

    /**
     * Ничего не пришло — говорим, что именно, и даём повторить.
     *
     * До этого экран с отказом оставался пустым: `problem` был написан, но
     * в разметку не поставлен, и человек видел ровно белый лист — то, от
     * чего этот кусок кода и должен был спасать.
     */
    private func problem(_ text: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 26))
                .foregroundStyle(Brand.grape)
            Text(text)
                .font(.system(size: 14))
                .multilineTextAlignment(.center)
                .foregroundStyle(Brand.boardMuted)
            Button(L("common.retry")) { Task { await load() } }
                .buttonStyle(.glass)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 60)
    }

    private func load() async {
        loading = true
        defer { loading = false }

        do {
            day = try await session.authed { token in
                try await APIClient.shared.send("day?date=\(date)", token: token, as: API.Day.self)
            }
            failure = nil
        } catch is CancellationError {
            return
        } catch let error as APIError {
            failure = error.isOffline
                ? L("errors.offline")
                : L("errors.server", "\(error.status) \(error.code ?? "—")")
        } catch {
            /* Разбор ответа: показываем как есть — это баг, а не сбой сети.
               Прятать его за «попробуйте позже» значит никогда не найти:
               ровно так белый экран дня и прожил незамеченным. */
            failure = Failure.text(error)
        }
    }

    static func title(_ date: String) -> String {
        guard let at = LocalDate.fromYMD(date) else { return date }
        return LocalDate.longDay(at)
    }

    private static func weekday(_ date: String) -> String? {
        guard let at = LocalDate.fromYMD(date) else { return nil }
        return LocalDate.weekday(at)
    }
}
