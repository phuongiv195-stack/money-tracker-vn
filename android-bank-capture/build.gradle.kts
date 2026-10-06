plugins {
    id("com.android.application") version "9.4.1" apply false
}

// Keep build outputs outside Dropbox to avoid EBUSY file locks (same reason as Vite's cacheDir)
layout.buildDirectory.set(file("C:/tmp/money-tracker-android-build/root"))
