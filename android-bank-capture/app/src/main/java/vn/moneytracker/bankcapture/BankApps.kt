package vn.moneytracker.bankcapture

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager

/** The apps whose notifications are captured, chosen by the user. Everything else is ignored. */
object BankApps {
    private const val PREFS = "settings"
    private const val KEY = "bankPackages"

    /** Labels that look like a bank app float to the top of the picker. */
    private val LIKELY_BANK = Regex("(?i)vcb|vietcombank|timo|ocb|digimi|bv ?bank|bản việt|bank|gmail")

    fun selected(ctx: Context): Set<String> =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getStringSet(KEY, emptySet()) ?: emptySet()

    fun setSelected(ctx: Context, packages: Set<String>) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putStringSet(KEY, packages.toSet()).apply()
    }

    fun label(ctx: Context, packageName: String): String = try {
        val pm = ctx.packageManager
        pm.getApplicationLabel(pm.getApplicationInfo(packageName, 0)).toString()
    } catch (e: PackageManager.NameNotFoundException) {
        packageName
    }

    data class InstalledApp(val packageName: String, val label: String)

    /** Launchable apps, likely bank apps first, then alphabetical. */
    fun installed(ctx: Context): List<InstalledApp> {
        val pm = ctx.packageManager
        val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        return pm.queryIntentActivities(launcher, 0)
            .map { it.activityInfo.packageName }
            .distinct()
            .filter { it != ctx.packageName }
            .map { InstalledApp(it, label(ctx, it)) }
            .sortedWith(compareBy({ !LIKELY_BANK.containsMatchIn(it.label) }, { it.label.lowercase() }))
    }
}
