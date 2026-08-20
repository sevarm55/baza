# Правила релизной сборки.
#
# Их немного намеренно: чем меньше исключений из минификации, тем меньше
# кода уезжает в APK. Всё, что здесь есть, — это места, где R8 не видит
# использования через рефлексию и вырезал бы нужное молча.

# ── kotlinx.serialization ────────────────────────────────────────────
#
# Сериализаторы генерируются на компиляции и находятся по имени класса.
# Без этих правил разбор ответа сервера падает в релизе и работает в
# отладке — то есть ломается ровно там, где это заметит клиент.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**

-keepclassmembers class ** {
    *** Companion;
}
-keepclasseswithmembers class ** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.sevarm.tetr.core.api.**$$serializer { *; }
-keepclassmembers class com.sevarm.tetr.core.api.** {
    *** Companion;
}
-keep class com.sevarm.tetr.core.api.** { *; }
-keep class com.sevarm.tetr.core.queue.QueuedOrder { *; }
-keep class com.sevarm.tetr.core.session.RememberedAccount { *; }

# ── OkHttp ───────────────────────────────────────────────────────────
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# ── Firebase ─────────────────────────────────────────────────────────
#
# Подключается только когда рядом лежит google-services.json; правила
# безвредны и без него.
-dontwarn com.google.firebase.**
-keep class com.sevarm.tetr.core.push.TetrinMessagingService { *; }

# ── ML Kit ───────────────────────────────────────────────────────────
-keep class com.google.mlkit.** { *; }
-dontwarn com.google.mlkit.**

# ── Логи ─────────────────────────────────────────────────────────────
#
# В релизе не должно остаться ни одной строки отладочного вывода: через
# них когда-нибудь уедет то, чего в logcat быть не должно, — токен,
# заголовок авторизации или номер клиента. Проще вырезать весь канал,
# чем каждый раз проверять, что именно в него пишут.
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
    public static int i(...);
    public static int w(...);
}
