plugins {
    id("com.android.application")
}

layout.buildDirectory.set(file("C:/tmp/money-tracker-android-build/app"))

android {
    namespace = "vn.moneytracker.bankcapture"
    compileSdk = 37

    defaultConfig {
        applicationId = "vn.moneytracker.bankcapture"
        minSdk = 29
        targetSdk = 36
        versionCode = 3
        versionName = "1.2"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
