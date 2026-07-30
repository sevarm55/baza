import SwiftUI

/// Разделы, в которые заходят редко: клиенты, люди, прайс, выгрузка.
///
/// Отдельной вкладкой, а не пунктами в панели: вкладок должно быть
/// столько, сколько экранов открывают каждый день. Прайс правят раз в
/// месяц — ему там не место.
struct MoreView: View {
    @EnvironmentObject private var session: Session

    @State private var exporting = false
    @State private var exported: URL?

    var body: some View {
        List {
            Section {
                NavigationLink {
                    ClientsView().navigationTitle("Հաճախորդներ")
                } label: {
                    row("person.2.fill", "Հաճախորդներ")
                }

                NavigationLink {
                    StaffView().navigationTitle(session.tenant?.staffRole ?? "Աշխատակիցներ")
                } label: {
                    row("person.badge.key.fill", session.tenant?.staffRole ?? "Աշխատակիցներ")
                }

                NavigationLink {
                    ServicesView().navigationTitle("Ծառայություններ և գներ")
                } label: {
                    row("tag.fill", "Ծառայություններ և գներ")
                }
            }

            Section {
                Button {
                    Task { await exportCsv() }
                } label: {
                    row("square.and.arrow.up.fill", exporting ? "…" : "Ներբեռնել 30 օրվա տվյալները")
                }
                .disabled(exporting)
            } footer: {
                Text("Ձեր տվյալները ձերն են՝ ցանկացած պահի։")
            }

            Section {
                Button("Դուրս գալ", role: .destructive) {
                    Task { await session.signOut() }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .screenBackground()
        .sheet(item: $exported) { url in
            ShareSheet(url: url)
        }
    }

    private func row(_ icon: String, _ title: String) -> some View {
        Label(title, systemImage: icon)
            .font(.system(size: 16))
    }

    /// Выгрузка приходит файлом и отдаётся системе: дальше человек сам
    /// решает — отправить себе в почту, положить в «Файлы», открыть в
    /// Excel. Приложению не нужно знать, что он с ней сделает.
    private func exportCsv() async {
        exporting = true
        defer { exporting = false }

        guard let data = try? await session.authed({ token in
            try await APIClient.shared.raw("export?days=30", token: token)
        }) else { return }

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("tetr-\(Int(Date().timeIntervalSince1970)).csv")
        guard (try? data.write(to: url)) != nil else { return }
        exported = url
    }
}

extension URL: @retroactive Identifiable {
    public var id: String { absoluteString }
}

struct ShareSheet: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
