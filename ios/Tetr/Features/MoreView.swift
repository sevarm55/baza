import SwiftUI

/// Разделы, в которые заходят редко: клиенты, люди, прайс, выгрузка.
///
/// Отдельной вкладкой, а не пунктами в панели: вкладок должно быть
/// столько, сколько экранов открывают каждый день. Прайс правят раз в
/// месяц — ему там не место.
struct MoreView: View {
    @EnvironmentObject private var session: Session
    @EnvironmentObject private var lock: BiometricLock

    @State private var exporting = false
    @State private var exported: URL?
    @State private var deleting = false

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

                NavigationLink {
                    ExpensesView().navigationTitle("Ծախսեր")
                } label: {
                    row("cart.fill", "Ծախսեր")
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

            if lock.available {
                Section {
                    Toggle(isOn: $lock.enabled) {
                        row("faceid", "Բացել \(lock.kindName)-ով")
                    }
                } footer: {
                    Text("Հավելվածը կփակվի ամեն անգամ, երբ դուրս գաք դրանից։")
                }
            }

            Section {
                Button("Դուրս գալ", role: .destructive) {
                    Task { await session.signOut() }
                }
            }

            /* Отдельной секцией в самом низу, а не рядом с выходом:
               «выйти» и «стереть всё» не должны стоять двумя соседними
               красными строчками, где промах пальцем стоит бизнеса. */
            Section {
                Button("Ջնջել բիզնեսը", role: .destructive) { deleting = true }
            } footer: {
                Text("Բոլոր տվյալները և աշխատակիցները ջնջվում են ընդմիշտ։")
            }
        }
        .scrollContentBackground(.hidden)
        .screenBackground()
        .sheet(item: $exported) { url in
            ShareSheet(url: url)
        }
        .sheet(isPresented: $deleting) {
            DeleteBusinessView()
        }
    }

    /// Строка списка со значком.
    ///
    /// Цвет значка задан явно, а не унаследован от `.tint` приложения.
    /// Причина не косметическая: на устройстве значки в строках списка
    /// выходили системными синими, хотя текст рядом оставался грейповым, —
    /// то есть до символов общий tint не доходил, а до текста доходил.
    /// В симуляторе того же не было, так что полагаться на наследование
    /// здесь нельзя: оно зависит от версии системы. Явный цвет одинаков
    /// везде.
    private func row(_ icon: String, _ title: String) -> some View {
        Label {
            Text(title)
        } icon: {
            Image(systemName: icon).foregroundStyle(Brand.grape)
        }
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

    /// Сохранил файл или передумал.
    ///
    /// Нужно там, где за передачей файла следует необратимое действие:
    /// закрытый крестиком лист обмена не должен считаться сохранением,
    /// иначе человек лишится и данных, и копии.
    var onFinish: ((Bool) -> Void)?

    func makeUIViewController(context: Context) -> UIActivityViewController {
        let controller = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        controller.completionWithItemsHandler = { _, completed, _, _ in onFinish?(completed) }
        return controller
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
