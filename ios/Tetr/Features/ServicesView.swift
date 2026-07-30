import SwiftUI

/// Прайс.
///
/// Правка цены не трогает прошлые записи: в каждом заказе лежит снимок.
/// Поэтому владелец может менять цены хоть каждый день — вчерашняя
/// выручка и зарплаты останутся прежними. Об этом сказано прямо на
/// экране: без этой строчки цену боятся трогать.
struct ServicesView: View {
    @EnvironmentObject private var session: Session

    @State private var services: [API.Service] = []
    @State private var editing: API.Service?
    @State private var adding = false
    @State private var busy = false

    private var currency: String { session.tenant?.currency ?? "AMD" }

    var body: some View {
        /* Список, а не прокрутка со стопкой кнопок: свайп по строке
           существует только в List. Плитки при этом остались стеклянными —
           системная подложка и разделители убраны. */
        List {
            ForEach(services) { service in
                Button {
                    editing = service
                } label: {
                    HStack {
                        Text(service.name)
                            .font(.system(size: 16, weight: .semibold))
                        Spacer()
                        Text(money(service.price, currency))
                            .font(.system(size: 15, weight: .semibold))
                            .monospacedDigit()
                            .foregroundStyle(Brand.muted)
                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Brand.muted.opacity(0.5))
                    }
                    .padding(15)
                    .frame(maxWidth: .infinity)
                    .glassEffect(.regular, in: .rect(cornerRadius: 14))
                }
                .buttonStyle(.plain)
                .foregroundStyle(Brand.ink)
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .listRowInsets(.init(top: 5, leading: 16, bottom: 5, trailing: 16))
                /* Свайп — второй путь к тому же действию, что в редакторе.
                   Подтверждения нет намеренно: система и так требует двух
                   движений — смахнуть и нажать, — а услуга не удаляется,
                   а уходит из прайса. История записей остаётся. */
                .swipeActions(edge: .trailing) {
                    Button(role: .destructive) {
                        Task { await archive(service) }
                    } label: {
                        Label("Հեռացնել", systemImage: "trash")
                    }
                    /* Красный явно: общий цвет приложения перекрывает
                       системный, и «удалить» выходит грейповым — то есть
                       неотличимым от обычного действия. Восстановить
                       услугу из приложения нельзя, и предупредить об этом
                       должен цвет, а не только текст. */
                    .tint(.red)
                }
            }

            Text("Գնի փոփոխությունը չի ազդում արդեն կատարված գրանցումների վրա։")
                .font(.system(size: 12.5))
                .foregroundStyle(Brand.muted)
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .listRowInsets(.init(top: 10, leading: 16, bottom: 5, trailing: 16))
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .screenBackground()
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { adding = true } label: {
                    Image(systemName: "plus").foregroundStyle(Brand.grape)
                }
            }
        }
        .sheet(item: $editing) { service in
            ServiceEditor(service: service, currency: currency) { await reload() }
        }
        .sheet(isPresented: $adding) {
            ServiceEditor(service: nil, currency: currency) { await reload() }
        }
        .task { await reload() }
        .refreshable { await reload() }
    }

    /// Убираем из прайса. Строка исчезает сразу, не дожидаясь сервера:
    /// иначе после смахивания она секунду стоит на месте и кажется, что
    /// не сработало. Не получилось — вернём при следующем обновлении.
    private func archive(_ service: API.Service) async {
        services.removeAll { $0.id == service.id }

        _ = try? await session.authed { token in
            try await APIClient.shared.raw("services/\(service.id)", method: "DELETE", token: token)
        }
        await reload()
    }

    private func reload() async {
        let result: API.Services? = try? await session.authed { token in
            try await APIClient.shared.send("services", token: token, as: API.Services.self)
        }
        if let result { services = result.services }
    }
}

/// Правка одной услуги. Отдельным листом, а не строкой на месте: цена —
/// то, что меняют редко и осознанно, и случайное касание менять её не должно.
struct ServiceEditor: View {
    let service: API.Service?
    let currency: String
    let onSave: () async -> Void

    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var price = ""
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Անուն", text: $name)
                    TextField("Գին", text: $price)
                        .keyboardType(.numberPad)
                }

                if service != nil {
                    Section {
                        Button("Հեռացնել գնացուցակից", role: .destructive) {
                            Task { await archive() }
                        }
                    } footer: {
                        Text("Գրանցումների պատմությունը մնում է տեղում։")
                    }
                }
            }
            .navigationTitle(service == nil ? "Նոր ծառայություն" : "Ծառայություն")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Փակել") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Պահպանել") { Task { await save() } }
                        .disabled(busy || name.isEmpty || price.isEmpty)
                }
            }
        }
        .onAppear {
            name = service?.name ?? ""
            price = service.map { String($0.price) } ?? ""
        }
    }

    private func save() async {
        busy = true
        defer { busy = false }

        var payload: [String: Any] = ["name": name, "price": Int(price) ?? 0]
        if let service { payload["id"] = service.id }

        _ = try? await session.authed { token in
            try await APIClient.shared.raw("services", method: "POST", body: payload, token: token)
        }
        await onSave()
        dismiss()
    }

    private func archive() async {
        guard let service else { return }
        busy = true
        defer { busy = false }

        _ = try? await session.authed { token in
            try await APIClient.shared.raw(
                "services/\(service.id)",
                method: "DELETE",
                token: token
            )
        }
        await onSave()
        dismiss()
    }
}
