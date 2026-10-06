package vn.moneytracker.bankcapture

import android.content.Context
import android.os.Build
import org.json.JSONObject
import java.io.IOException
import java.time.Instant
import java.util.concurrent.Executors

/** Sends pending captured items to Firestore (REST) as documents in [Config.INBOX_COLLECTION]. */
object Uploader {
    // Single thread so the listener and the retry job never upload the same item concurrently.
    private val executor = Executors.newSingleThreadExecutor()

    /** Upload in the background now; if anything is left (e.g. offline), schedule a retry job. */
    fun kick(ctx: Context) {
        val app = ctx.applicationContext
        executor.execute {
            if (!uploadPending(app)) UploadJobService.schedule(app)
        }
    }

    fun runInBackground(task: () -> Unit) = executor.execute(task)

    /**
     * Blocking. Returns true when there is nothing worth retrying: everything was sent,
     * or the user must sign in again first (signing in kicks a new upload).
     */
    fun uploadPending(ctx: Context): Boolean {
        val items = InboxStore.pending(ctx)
        if (items.isEmpty() || !Auth.isSignedIn(ctx)) return true

        val token = try {
            Auth.idToken(ctx)
        } catch (e: AuthException) {
            items.forEach { InboxStore.markError(ctx, it.id, e.message ?: ctx.getString(R.string.err_sign_in_unknown)) }
            return true
        } catch (e: IOException) {
            return false
        }
        val uid = Auth.uid(ctx) ?: return true

        for (item in items) {
            try {
                val res = Http.post(documentUrl(item.id), toFirestoreDoc(uid, item).toString(), bearer = token)
                when (res.code) {
                    in 200..299, 409 -> InboxStore.markSent(ctx, item.id) // 409 = already uploaded
                    403 -> InboxStore.markError(ctx, item.id, ctx.getString(R.string.err_rules))
                    else -> InboxStore.markError(ctx, item.id, ctx.getString(R.string.err_server, res.code))
                }
            } catch (e: IOException) {
                InboxStore.markError(ctx, item.id, ctx.getString(R.string.err_offline))
                return false
            }
        }
        return InboxStore.pending(ctx).isEmpty()
    }

    private fun documentUrl(id: String) =
        "https://firestore.googleapis.com/v1/projects/${Config.FIREBASE_PROJECT_ID}" +
            "/databases/(default)/documents/${Config.INBOX_COLLECTION}?documentId=$id"

    private fun toFirestoreDoc(uid: String, item: CapturedItem): JSONObject {
        fun str(v: String) = JSONObject().put("stringValue", v)
        fun time(ms: Long) = JSONObject().put("timestampValue", Instant.ofEpochMilli(ms).toString())
        fun bool(v: Boolean) = JSONObject().put("booleanValue", v)

        val fields = JSONObject()
            .put("userId", str(uid))
            .put("status", str("new"))
            .put("source", str("android"))
            .put("device", str(Build.MODEL))
            .put("packageName", str(item.packageName))
            .put("appName", str(item.appName))
            .put("title", str(item.title))
            .put("text", str(item.text))
            .put("bigText", str(item.bigText))
            .put("postedAt", time(item.postedAt))
            .put("capturedAt", time(item.capturedAt))
            .put("isTest", bool(item.packageName == Config.TEST_PACKAGE))
        return JSONObject().put("fields", fields)
    }
}
