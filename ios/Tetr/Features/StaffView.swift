import SwiftUI

/// Сотрудники.
///
/// Процент меняется только на будущее: в каждом заказе лежит снимок, и
/// прошлые зарплаты не пересчитываются. Иначе поднять ставку было бы
/// страшно — это переписывало бы уже согласованные суммы.
struct StaffView: View {
    @EnvironmentObject private var session: Session

    @State private var staff: [API.StaffMember] = []
    @State private var editing: API.StaffMember?
    @State private var adding = false

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                ForEach(staff) { person in
                    Button {
                        // себя владелец не правит и не отключает — открывать
                        // редактор незачем
                        if !person.isMe { editing = person }
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(person.name)
                                    .font(.system(size: 16, weight: .semibold))
                                Text(person.phone)
                                    .font(.system(size: 12))
                                    .monospacedDigit()
                                    .foregroundStyle(Brand.muted)
                            }
                            Spacer()
                            Text(person.role == "owner"
                                 ? "Սեփականատեր"
                                 : "\(person.percent)%")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(Brand.muted)
                            if !person.isMe {
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundStyle(Brand.muted.opacity(0.5))
                            }
                        }
                        .padding(15)
                        .frame(maxWidth: .infinity)
                        .glassEffect(.regular, in: .rect(cornerRadius: 14))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Brand.ink)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .screenBackground()
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { adding = true } label: { Image(systemName: "plus") }
            }
        }
        .sheet(item: $editing) { person in
            StaffEditor(person: person) { await reload() }
        }
        .sheet(isPresented: $adding) {
            StaffEditor(person: nil) { await reload() }
        }
        .task { await reload() }
        .refreshable { await reload() }
    }

    private func reload() async {
        let result: API.Staff? = try? await session.authed { token in
            try await APIClient.shared.send("staff", token: token, as: API.Staff.self)
        }
        if let result { staff = result.staff }
    }
}

struct StaffEditor: View {
    let person: API.StaffMember?
    let onSave: () async -> Void

    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var phone = ""
    @State private var pin = ""
    @State private var percent = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Անուն", text: $name)
                    if person == nil {
                        TextField("Հեռախոս", text: $phone)
                            .keyboardType(.phonePad)
                        TextField("PIN · 4 նիշ", text: $pin)
                            .keyboardType(.numberPad)
                            .onChange(of: pin) { v in if v.count > 4 { pin = String(v.prefix(4)) } }
                    }
                    TextField("Տոկոս", text: $percent)
                        .keyboardType(.numberPad)
                } footer: {
                    Text("Տոկոսի փոփոխությունը գործում է նոր գրանցումների համար։")
                }

                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }

                if let person, !person.isMe {
                    Section {
                        Button("Անջատել աշխատակցին", role: .destructive) {
                            Task { await fire(person) }
                        }
                    } footer: {
                        // это не косметика: увольнение гасит его сессии,
                        // и человек теряет доступ немедленно
                        Text("Մուտքը փակվում է անմիջապես։ Պատմությունը մնում է։")
                    }
                }
            }
            .navigationTitle(person == nil ? "Նոր աշխատակից" : person!.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Փակել") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Պահպանել") { Task { await save() } }
                        .disabled(busy || name.isEmpty || percent.isEmpty)
                }
            }
        }
        .onAppear {
            name = person?.name ?? ""
            percent = person.map { String($0.percent) } ?? ""
        }
    }

    private func save() async {
        busy = true
        defer { busy = false }
        error = nil

        do {
            _ = try await session.authed { token in
                if let person {
                    return try await APIClient.shared.raw(
                        "staff/\(person.id)",
                        method: "PATCH",
                        body: ["name": name, "percent": Int(percent) ?? 0],
                        token: token
                    )
                }
                return try await APIClient.shared.raw(
                    "staff",
                    method: "POST",
                    body: [
                        "name": name,
                        "phone": phone,
                        "pin": pin,
                        "percent": Int(percent) ?? 0,
                    ],
                    token: token
                )
            }
            await onSave()
            dismiss()
        } catch let e as APIError {
            error = e.code == "PHONE_TAKEN"
                ? "Այս համարն արդեն գրանցված է"
                : "Չհաջողվեց (\(e.code ?? "\(e.status)"))"
        } catch {
            self.error = "\(error)"
        }
    }

    private func fire(_ person: API.StaffMember) async {
        busy = true
        defer { busy = false }

        _ = try? await session.authed { token in
            try await APIClient.shared.raw("staff/\(person.id)", method: "DELETE", token: token)
        }
        await onSave()
        dismiss()
    }
}
