import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

/*
 * Firebase подключается, только когда рядом лежит `google-services.json`.
 *
 * Плагин без этого файла валит сборку целиком, а файл — это чужой ключ,
 * который в репозиторий не кладут. Поэтому проект собирается и без него:
 * уведомления в такой сборке просто не регистрируются, всё остальное
 * работает. Появился файл — появились и уведомления, без правки кода.
 */
val hasFirebase = file("google-services.json").exists()
if (hasFirebase) {
    apply(plugin = libs.plugins.google.services.get().pluginId)
}

/** Подпись релиза берётся из `keystore.properties`, которого в git нет. */
val signing = Properties().apply {
    val file = rootProject.file("keystore.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}

android {
    namespace = "com.sevarm.tetr"
    compileSdk = 36

    defaultConfig {
        // Тот же идентификатор, что у iOS-приложения: это один продукт.
        applicationId = "com.sevarm.tetr"
        /*
         * 26, а не 21. Ниже нет ни каналов уведомлений, ни аппаратного
         * Keystore с AES/GCM — то есть токены пришлось бы хранить слабее,
         * а это продукт про чужие деньги. Доля Android ниже 8.0 сегодня
         * меньше процента, и веб при этом работает на всём.
         */
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        // Совпадает с MARKETING_VERSION в ios/project.yml.
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        /*
         * Языки продукта. Ограничение списка не косметическое: без него
         * в APK едут ресурсы всех локалей androidx, а переключатель
         * языка предлагал бы то, чего в продукте нет.
         */
        resourceConfigurations += listOf("hy", "ru", "en")
    }

    signingConfigs {
        if (signing.isNotEmpty()) {
            create("release") {
                storeFile = file(signing.getProperty("storeFile"))
                storePassword = signing.getProperty("storePassword")
                keyAlias = signing.getProperty("keyAlias")
                keyPassword = signing.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
            isMinifyEnabled = false
            buildConfigField(
                "String",
                "API_BASE",
                "\"${providers.gradleProperty("tetrin.api.development").get()}\"",
            )
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            buildConfigField(
                "String",
                "API_BASE",
                "\"${providers.gradleProperty("tetrin.api.production").get()}\"",
            )
            if (signing.isNotEmpty()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        // java.time на minSdk 26 доступен нативно; десугаринг не нужен.
    }

    kotlin {
        compilerOptions {
            jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
            /*
             * Согласие на нестабильные части Material 3.
             *
             * Нужно ровно ради нижних листов (`ModalBottomSheet`): продукт
             * построен на них — запись машины, сдача наличных, редакторы
             * услуг и людей. Своя реализация листа стоила бы жестов,
             * инерции и поведения клавиатуры, которые система уже знает, а
             * помечены они «экспериментальными» годами.
             *
             * Здесь, а не аннотацией у каждой функции: тридцать одинаковых
             * @OptIn по файлам — это шум, который перестают читать.
             */
            optIn.addAll(
                "androidx.compose.material3.ExperimentalMaterial3Api",
                "androidx.compose.foundation.ExperimentalFoundationApi",
            )
        }
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }

    lint {
        // Сборка не должна проходить с недостающими переводами: строки —
        // это тот же продукт, а не оформление.
        warningsAsErrors = false
        abortOnError = false
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.splashscreen)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.process)

    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.foundation)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons)
    debugImplementation(libs.compose.ui.tooling)

    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.biometric)
    implementation(libs.androidx.work)

    implementation(libs.camera.core)
    implementation(libs.camera.camera2)
    implementation(libs.camera.lifecycle)
    implementation(libs.camera.view)
    implementation(libs.mlkit.text)

    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    debugImplementation(libs.okhttp.logging)

    /*
     * Firebase Messaging подключается ВСЕГДА, а плагин — только когда
     * рядом лежит `google-services.json`. Иначе сервис уведомлений просто
     * не скомпилировался бы, и приложение без ключа Firebase нельзя было
     * бы даже собрать. Без плагина FirebaseApp не поднимается, регистрация
     * токена молча не происходит, и всё остальное работает — см.
     * `core/push/Push.kt`.
     */
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    androidTestImplementation(libs.androidx.test.junit)
    androidTestImplementation(libs.espresso.core)
    androidTestImplementation(platform(libs.compose.bom))
}
