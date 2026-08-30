import SwiftUI

/**
 * Оформление: каким значком приложение стоит на телефоне.
 *
 * Значков два, и оба нарисованы одной рукой — это не тема и не скин, а
 * выбор между двумя лицами марки. Тёмный и подкрашенный виды система
 * подставляет сама по настройкам телефона: у каждого значка в каталоге
 * лежат три файла, и выбирать между ними человеку не нужно.
 *
 * Экран заведён отдельно, а не строкой в профиле, потому что здесь со
 * временем появится и остальное оформление — тема, размер цифр. Профиль
 * же про человека и его доступ.
 */
struct AppearanceView: View {
    @Environment(\.dismiss) private var dismiss

    /// Какой значок стоит сейчас. Nil — основной.
    @State private var current: String? = UIApplication.shared.alternateIconName
    /// Идёт смена: система показывает своё окно, и второе нажатие в этот
    /// момент ей мешает.
    @State private var switching = false
    @State private var failed = false

    private var options: [AppIconOption] { AppIconOption.all }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(L("appearance.iconNote"))
                    .font(.system(size: 13))
                    .foregroundStyle(Brand.boardMuted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 4)
                    .padding(.bottom, 2)

                ForEach(options) { option in
                    row(option)
                }

                if failed {
                    Text(L("appearance.iconFailed"))
                        .font(.system(size: 13))
                        .foregroundStyle(Brand.badOnBoard)
                        .padding(.horizontal, 4)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 28)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.board.ignoresSafeArea())
        .navigationTitle(L("appearance.title"))
        .navigationBarTitleDisplayMode(.inline)
    }

    /**
     * Один значок строкой: картинка, имя, отметка выбранного.
     *
     * Картинка — тот же файл, что уходит на домашний экран, только
     * маленький: выбирать значок по описанию словами нельзя, его надо
     * видеть.
     */
    private func row(_ option: AppIconOption) -> some View {
        let on = current == option.alternateName

        return Button {
            choose(option)
        } label: {
            HStack(spacing: 14) {
                Image(option.preview)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 60, height: 60)
                    /* Скругление как у домашнего экрана: квадратная
                       картинка рядом со скруглённой читается другим
                       значком, а он тот же самый. */
                    .clipShape(.rect(cornerRadius: 14, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .strokeBorder(Brand.boardInk.opacity(0.10), lineWidth: 0.8)
                    }

                VStack(alignment: .leading, spacing: 2) {
                    Text(option.title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Brand.onBoard)
                    Text(option.note)
                        .font(.system(size: 12))
                        .foregroundStyle(Brand.boardMuted)
                        .fixedSize(horizontal: false, vertical: true)
                        .multilineTextAlignment(.leading)
                }

                Spacer(minLength: 6)

                Image(systemName: on ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(on ? Brand.grape : Brand.boardInk.opacity(0.18))
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .boardCard(R.card)
            .contentShape(.rect)
        }
        .buttonStyle(.press)
        .disabled(switching)
        .accessibilityAddTraits(on ? [.isSelected] : [])
    }

    /**
     * Сменить значок.
     *
     * Система сама показывает своё окно «значок изменён» — своего мы не
     * рисуем: два подтверждения подряд на одно действие читаются сбоем.
     *
     * Ошибку из обработчика не слушаем, а переспрашиваем систему, какой
     * значок стоит сейчас. Причина конкретная: отказ приходит и тогда,
     * когда значок сменился, — системе не удалось показать то самое
     * окно, и она сообщает об этом как об ошибке всей операции. В
     * симуляторе так происходит всегда. Верить ошибке значит краснеть
     * над сделанной работой; верить состоянию — значит говорить правду
     * в обоих случаях.
     */
    private func choose(_ option: AppIconOption) {
        guard !switching, current != option.alternateName else { return }
        switching = true
        failed = false

        UIApplication.shared.setAlternateIconName(option.alternateName) { _ in
            Task { @MainActor in
                switching = false
                current = UIApplication.shared.alternateIconName
                if current == option.alternateName {
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                } else {
                    failed = true
                }
            }
        }
    }
}

/**
 * Значок как вариант выбора.
 *
 * `alternateName` — ровно то имя, под которым набор лежит в каталоге
 * ассетов и стоит в `ALTERNATE_APPICON_NAMES`. Nil означает основной:
 * так его называет сама система, и переводить это в свой словарь
 * значений незачем.
 */
struct AppIconOption: Identifiable {
    let id: String
    /// Имя для `setAlternateIconName`. Nil — основной значок.
    let alternateName: String?
    /// Имя картинки для предпросмотра в списке.
    let preview: String
    let title: String
    let note: String

    static var all: [AppIconOption] {
        [
            AppIconOption(
                id: "default",
                alternateName: nil,
                preview: "IconPreviewDefault",
                title: L("appearance.iconMain"),
                note: L("appearance.iconMainNote")
            ),
            AppIconOption(
                id: "glass",
                alternateName: "AppIconGlass",
                preview: "IconPreviewGlass",
                title: L("appearance.iconGlass"),
                note: L("appearance.iconGlassNote")
            ),
        ]
    }
}
