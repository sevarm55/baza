import Foundation
import Security

/// Хранилище токенов.
///
/// Keychain, а не UserDefaults: refresh живёт два месяца и даёт полный
/// доступ к бизнесу. UserDefaults — это файл в песочнице, который уезжает
/// в резервную копию и читается с разлоченного устройства как обычный
/// plist.
///
/// `ThisDeviceOnly` намеренно: токен не должен переезжать в резервной
/// копии на другой телефон. Человек войдёт заново — это три касания,
/// а украденная копия бэкапа не даст доступа.
enum Keychain {
    private static let service = "com.sevarm.tetr.tokens"

    static func set(_ value: String?, for key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)

        guard let value, let data = value.data(using: .utf8) else { return }

        var add = query
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(add as CFDictionary, nil)
    }

    static func get(_ key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data
        else { return nil }
        return String(data: data, encoding: .utf8)
    }
}
