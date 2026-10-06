package vn.moneytracker.bankcapture

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.AtomicFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest

/** One captured bank notification. [id] is derived from the content so re-posts dedupe. */
data class CapturedItem(
    val id: String,
    val packageName: String,
    val appName: String,
    val title: String,
    val text: String,
    val bigText: String,
    val postedAt: Long,
    val capturedAt: Long,
    val sent: Boolean = false,
    val error: String? = null,
) {
    /** The most complete version of the message body. */
    val body: String get() = bigText.ifBlank { text }

    fun toJson(): JSONObject = JSONObject()
        .put("id", id).put("packageName", packageName).put("appName", appName)
        .put("title", title).put("text", text).put("bigText", bigText)
        .put("postedAt", postedAt).put("capturedAt", capturedAt)
        .put("sent", sent).put("error", error)

    companion object {
        fun fromJson(o: JSONObject) = CapturedItem(
            id = o.getString("id"),
            packageName = o.getString("packageName"),
            appName = o.optString("appName"),
            title = o.optString("title"),
            text = o.optString("text"),
            bigText = o.optString("bigText"),
            postedAt = o.optLong("postedAt"),
            capturedAt = o.optLong("capturedAt"),
            sent = o.optBoolean("sent"),
            error = if (o.isNull("error")) null else o.optString("error"),
        )

        fun contentId(packageName: String, title: String, body: String): String {
            val digest = MessageDigest.getInstance("SHA-256")
                .digest("$packageName\n$title\n$body".toByteArray(Charsets.UTF_8))
            return digest.take(16).joinToString("") { "%02x".format(it) }
        }
    }
}

/**
 * Local log + upload queue, persisted to a JSON file so nothing is lost while offline
 * or if the process is killed. Newest items first.
 */
object InboxStore {
    private const val FILE = "inbox.json"
    private const val MAX_SENT_KEPT = 200

    private val lock = Any()
    private var items: MutableList<CapturedItem>? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    /** Called on the main thread whenever the store changes (set by the visible activity). */
    @Volatile
    var onChange: (() -> Unit)? = null

    /** Returns false if an item with the same id was already captured. */
    fun add(ctx: Context, item: CapturedItem): Boolean {
        synchronized(lock) {
            val list = load(ctx)
            if (list.any { it.id == item.id }) return false
            list.add(0, item)
            trim(list)
            save(ctx, list)
        }
        notifyChanged()
        return true
    }

    fun pending(ctx: Context): List<CapturedItem> =
        synchronized(lock) { load(ctx).filter { !it.sent }.reversed() } // oldest first

    fun recent(ctx: Context, limit: Int): List<CapturedItem> =
        synchronized(lock) { load(ctx).take(limit) }

    fun markSent(ctx: Context, id: String) = update(ctx, id) { it.copy(sent = true, error = null) }

    fun markError(ctx: Context, id: String, error: String) = update(ctx, id) { it.copy(error = error) }

    private fun update(ctx: Context, id: String, change: (CapturedItem) -> CapturedItem) {
        synchronized(lock) {
            val list = load(ctx)
            val i = list.indexOfFirst { it.id == id }
            if (i < 0) return
            list[i] = change(list[i])
            save(ctx, list)
        }
        notifyChanged()
    }

    /** Drop the oldest sent items beyond the cap; pending items are always kept. */
    private fun trim(list: MutableList<CapturedItem>) {
        var sentSeen = 0
        list.removeAll { it.sent && ++sentSeen > MAX_SENT_KEPT }
    }

    private fun load(ctx: Context): MutableList<CapturedItem> {
        items?.let { return it }
        val file = AtomicFile(File(ctx.filesDir, FILE))
        val loaded = try {
            val arr = JSONArray(String(file.readFully(), Charsets.UTF_8))
            MutableList(arr.length()) { CapturedItem.fromJson(arr.getJSONObject(it)) }
        } catch (e: Exception) {
            mutableListOf() // first run or unreadable file
        }
        items = loaded
        return loaded
    }

    private fun save(ctx: Context, list: List<CapturedItem>) {
        val file = AtomicFile(File(ctx.filesDir, FILE))
        val out = file.startWrite()
        try {
            val arr = JSONArray()
            list.forEach { arr.put(it.toJson()) }
            out.write(arr.toString().toByteArray(Charsets.UTF_8))
            file.finishWrite(out)
        } catch (e: Exception) {
            file.failWrite(out)
        }
    }

    private fun notifyChanged() {
        mainHandler.post { onChange?.invoke() }
    }
}
