import SwiftUI

/// Смена мойщика — главный экран.
///
/// Заработок крупно и первым: ради него мойщик и вбивает сам, без
/// надзора. Кнопка записи во всю ширину внизу — там, где до неё достаёт
/// большой палец руки, которой держат телефон.
struct ShiftView: View {
    @EnvironmentObject private var session: Session
    @EnvironmentObject private var queue: OrderQueue

    @State private var shift: API.Shift?
    @State private var recording = false
    @State private var loading = false
    /// Номер обновления. Экран открывается и сразу тянут вниз — два
    /// обновления идут одновременно, и то, что стартовало раньше, может
    /// ответить позже. Без этого счётчика старый ответ затирает свежий, и
    /// только что записанная машина исчезает с экрана, хотя на сервере она
    /// есть. Ровно так это и выглядело.
    @State private var loadID = 0

    private var currency: String { session.tenant?.currency ?? "AMD" }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                earnings

                if !queue.waiting.isEmpty {
                    pending
                }

                ForEach(queue.rejected) { item in
                    stuck(item)
                }

                if let shift, !shift.orders.isEmpty {
                    recent(shift.orders)
                } else if !loading {
                    empty
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 110)
        }
        .screenBackground()
        .safeAreaInset(edge: .bottom) {
            /* Без подложки под кнопкой. Материал там был лишним: кнопка
               непрозрачная, закрывать ей нечего, а на тёмной теме он
               читался отдельной серой плитой от кнопки до самого низа.
               Содержимое уезжает под кнопку — так и задумано. */
            Button("+ \(session.tenant?.unitOne ?? "")") {
                recording = true
            }
            .buttonStyle(LimeButton())
            .padding(.horizontal, 16)
            .padding(.bottom, 10)
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

    private var earnings: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(takesShare ? "Քո հերթափոխն այսօր" : "Հերթափոխի հասույթ")
                .font(.system(size: 11, weight: .bold))
                .tracking(1.2)
                .textCase(.uppercase)
                .foregroundStyle(.white.opacity(0.7))

            Text(money(takesShare ? (shift?.earned ?? 0) : (shift?.revenue ?? 0), currency))
                .font(.system(size: 40, weight: .bold))
                .foregroundStyle(.white)
                .contentTransition(.numericText())

            Text(meta)
                .font(.system(size: 13))
                .foregroundStyle(.white.opacity(0.75))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(Brand.heroGradient, in: RoundedRectangle(cornerRadius: 20))
        .padding(.top, 8)
    }

    private var meta: String {
        let cars = "\(shift?.count ?? 0) \(session.tenant?.unitOne ?? "")"
        guard takesShare else { return cars }
        return "\(cars) · \(money(shift?.revenue ?? 0, currency)) · քո \(shift?.percent ?? 0)%"
    }

    /// Несинхронизированное показываем честно, но не тревожно: запись
    /// сделана и не пропадёт, просто ещё не ушла.
    private var pending: some View {
        HStack(spacing: 10) {
            Image(systemName: "arrow.triangle.2.circlepath")
                .foregroundStyle(Brand.grape)
            Text("\(queue.waiting.count) գրանցում սպասում է կապի")
                .font(.system(size: 13.5))
                .foregroundStyle(Brand.muted)
            Spacer()
        }
        .padding(14)
        .glassEffect(.regular, in: .rect(cornerRadius: 14))
    }

    /// Запись, которую сервер не принял.
    ///
    /// Показывается как есть, с номером машины и причиной: молча выбросить
    /// работу человека нельзя, а решить, повторить её или отменить, может
    /// только он сам.
    private func stuck(_ item: OrderQueue.Item) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(Brand.grape)
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.clientKey)
                        .font(.system(size: 14.5, weight: .semibold, design: .rounded))
                    Text("\(item.serviceName) · \(item.failure ?? "")")
                        .font(.system(size: 11.5))
                        .foregroundStyle(Brand.muted)
                }
                Spacer()
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
        .glassEffect(.regular, in: .rect(cornerRadius: 14))
    }

    private func recent(_ orders: [API.ShiftOrder]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Վերջինները")
                .font(.system(size: 11, weight: .bold))
                .tracking(1.2)
                .textCase(.uppercase)
                .foregroundStyle(Brand.muted)
                .padding(.bottom, 10)

            VStack(spacing: 8) {
                ForEach(orders) { order in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(order.serviceName)
                                .font(.system(size: 14.5, weight: .semibold))
                            Text(paymentLabel(order.payment))
                                .font(.system(size: 11.5))
                                .foregroundStyle(Brand.muted)
                        }
                        Spacer()
                        Text(money(order.price, currency))
                            .font(.system(size: 14.5, weight: .semibold))
                            .monospacedDigit()
                    }
                    .padding(12)
                    .glassEffect(.regular, in: .rect(cornerRadius: 12))
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 6)
    }

    private var empty: some View {
        Text("Հերթափոխը դեռ չի սկսվել")
            .font(.system(size: 14))
            .foregroundStyle(Brand.muted)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 44)
    }

    private func reload() async {
        loadID += 1
        let id = loadID
        loading = true
        defer { loading = false }

        // сначала досылаем накопленное: иначе смена покажет вчерашние
        // цифры, хотя записи уже сделаны
        await queue.flush(using: session)

        let fresh = try? await session.authed { token in
            try await APIClient.shared.send("shift", token: token, as: API.Shift.self)
        }

        // применяем только если за это время не начали новое обновление
        guard id == loadID, let fresh else { return }
        shift = fresh
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
