package vn.moneytracker.bankcapture

/**
 * Same Firebase project as the Money Tracker web app (src/services/firebase.js).
 * The web API key is already public in the web bundle; data is protected by Firestore rules.
 */
object Config {
    const val FIREBASE_API_KEY = "AIzaSyA3e4bfmZev-pBM1FFb_mhh8YWe6ObboXk"
    const val FIREBASE_PROJECT_ID = "money-tracker-vn"

    /** Raw captured notifications; the web app parses them into transactions. */
    const val INBOX_COLLECTION = "bankInbox"

    /** Package name used for items created by the "Gửi thử" button. */
    const val TEST_PACKAGE = "test"
}
