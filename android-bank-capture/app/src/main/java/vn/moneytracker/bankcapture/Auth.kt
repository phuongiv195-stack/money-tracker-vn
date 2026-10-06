package vn.moneytracker.bankcapture

import android.content.Context
import org.json.JSONObject
import java.net.URLEncoder

class AuthException(message: String) : Exception(message)

/**
 * Firebase Auth (email/password) over REST, using the same account as the web app.
 * Only the refresh token is stored — never the password.
 */
object Auth {
    private const val PREFS = "auth"
    private const val SIGN_IN_URL =
        "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${Config.FIREBASE_API_KEY}"
    private const val REFRESH_URL =
        "https://securetoken.googleapis.com/v1/token?key=${Config.FIREBASE_API_KEY}"

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun isSignedIn(ctx: Context) = prefs(ctx).getString("refreshToken", null) != null
    fun email(ctx: Context): String? = prefs(ctx).getString("email", null)
    fun uid(ctx: Context): String? = prefs(ctx).getString("uid", null)

    /** Blocking; call off the main thread. */
    fun signIn(ctx: Context, email: String, password: String) {
        val body = JSONObject()
            .put("email", email)
            .put("password", password)
            .put("returnSecureToken", true)
        val res = Http.post(SIGN_IN_URL, body.toString())
        val json = JSONObject(res.body.ifEmpty { "{}" })
        if (res.code != 200) throw AuthException(friendlyError(ctx, json))

        prefs(ctx).edit()
            .putString("uid", json.getString("localId"))
            .putString("email", json.getString("email"))
            .putString("idToken", json.getString("idToken"))
            .putString("refreshToken", json.getString("refreshToken"))
            .putLong("expiresAt", System.currentTimeMillis() + json.getString("expiresIn").toLong() * 1000)
            .apply()
    }

    /** Returns a valid ID token, refreshing it when it expires within 5 minutes. Blocking. */
    @Synchronized
    fun idToken(ctx: Context): String {
        val p = prefs(ctx)
        val refresh = p.getString("refreshToken", null) ?: throw AuthException(ctx.getString(R.string.err_not_signed_in))
        val token = p.getString("idToken", null)
        if (token != null && System.currentTimeMillis() < p.getLong("expiresAt", 0) - 5 * 60_000) return token

        val res = Http.post(
            REFRESH_URL,
            "grant_type=refresh_token&refresh_token=" + URLEncoder.encode(refresh, "UTF-8"),
            contentType = "application/x-www-form-urlencoded",
        )
        val json = JSONObject(res.body.ifEmpty { "{}" })
        if (res.code != 200) {
            // Refresh token revoked (e.g. password changed): require a fresh sign-in, keep the email for prefill.
            if (res.code in 400..403) signOut(ctx)
            throw AuthException(ctx.getString(R.string.err_session_expired))
        }
        val newToken = json.getString("id_token")
        p.edit()
            .putString("idToken", newToken)
            .putString("refreshToken", json.getString("refresh_token"))
            .putLong("expiresAt", System.currentTimeMillis() + json.getString("expires_in").toLong() * 1000)
            .apply()
        return newToken
    }

    fun signOut(ctx: Context) {
        val email = email(ctx)
        prefs(ctx).edit().clear().putString("email", email).apply()
    }

    private fun friendlyError(ctx: Context, json: JSONObject): String {
        val code = json.optJSONObject("error")?.optString("message").orEmpty()
        return when {
            code.startsWith("INVALID_LOGIN_CREDENTIALS") || code.startsWith("INVALID_PASSWORD") ||
                code.startsWith("EMAIL_NOT_FOUND") -> ctx.getString(R.string.err_wrong_credentials)
            code.startsWith("INVALID_EMAIL") -> ctx.getString(R.string.err_invalid_email)
            code.startsWith("TOO_MANY_ATTEMPTS") -> ctx.getString(R.string.err_too_many)
            code.startsWith("USER_DISABLED") -> ctx.getString(R.string.err_disabled)
            code.isNotEmpty() -> ctx.getString(R.string.err_sign_in_code, code)
            else -> ctx.getString(R.string.err_sign_in_unknown)
        }
    }
}
