package vn.moneytracker.bankcapture

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Receives every notification posted on the phone, but only keeps those from the bank apps
 * the user selected. Nothing else is stored or sent.
 */
class BankNotificationListener : NotificationListenerService() {

    override fun onListenerConnected() {
        // Pick up bank notifications that arrived while we weren't listening (first install, reboot).
        try {
            activeNotifications?.forEach { capture(it) }
        } catch (e: SecurityException) {
            // Listener access was revoked between connect and this call; nothing to do.
        }
        Uploader.kick(this)
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        capture(sbn)
    }

    private fun capture(sbn: StatusBarNotification) {
        if (sbn.packageName !in BankApps.selected(this)) return
        val notification = sbn.notification
        if (notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return

        val extras = notification.extras
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()
            ?: extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.joinToString("\n")
            ?: ""
        val body = bigText.ifBlank { text }
        if (body.isBlank() || OTP.containsMatchIn("$title\n$body")) return
        // From an email app, keep only mail from the banks (the title is the sender);
        // personal mail is never stored or sent
        if (sbn.packageName in EMAIL_APPS && !BANK_SENDER.containsMatchIn(title)) return

        val now = System.currentTimeMillis()
        val added = InboxStore.add(
            this,
            CapturedItem(
                id = CapturedItem.contentId(sbn.packageName, title, body),
                packageName = sbn.packageName,
                appName = BankApps.label(this, sbn.packageName),
                title = title,
                text = text,
                bigText = bigText,
                postedAt = sbn.postTime.takeIf { it > 0 } ?: now,
                capturedAt = now,
            ),
        )
        if (added) Uploader.kick(this)
    }

    private companion object {
        val EMAIL_APPS = setOf(
            "com.google.android.gm",
            "com.samsung.android.email.provider",
            "com.microsoft.office.outlook",
        )

        /** Sender names of bank emails, e.g. "Timo Support", "VCBDigibank", "BVBank - Ngan hang Ban Viet". */
        val BANK_SENDER = Regex("(?i)timo|vietcombank|vcbdigibank|bvbank|ban viet|bản việt")

        /** Never forward one-time passwords, even from a selected bank app. */
        val OTP = Regex("(?i)\\bOTP\\b|mã xác (thực|nhận)|ma xac (thuc|nhan)|verification code|mã kích hoạt")
    }
}
