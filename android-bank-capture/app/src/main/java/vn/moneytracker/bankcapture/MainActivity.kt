package vn.moneytracker.bankcapture

import android.app.Activity
import android.app.AlertDialog
import android.app.NotificationManager
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.LayoutInflater
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : Activity() {
    private lateinit var loginSection: View
    private lateinit var setupSection: View
    private lateinit var emailInput: EditText
    private lateinit var passwordInput: EditText
    private lateinit var signInButton: Button
    private lateinit var loginMessage: TextView
    private lateinit var accountText: TextView
    private lateinit var listenerStatus: TextView
    private lateinit var listenerButton: Button
    private lateinit var batteryStatus: TextView
    private lateinit var batteryButton: Button
    private lateinit var appsStatus: TextView
    private lateinit var logList: LinearLayout
    private lateinit var logEmpty: TextView

    private val timeFormat = SimpleDateFormat("dd/MM HH:mm:ss", Locale.getDefault())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        loginSection = findViewById(R.id.loginSection)
        setupSection = findViewById(R.id.setupSection)
        emailInput = findViewById(R.id.emailInput)
        passwordInput = findViewById(R.id.passwordInput)
        signInButton = findViewById(R.id.signInButton)
        loginMessage = findViewById(R.id.loginMessage)
        accountText = findViewById(R.id.accountText)
        listenerStatus = findViewById(R.id.listenerStatus)
        listenerButton = findViewById(R.id.listenerButton)
        batteryStatus = findViewById(R.id.batteryStatus)
        batteryButton = findViewById(R.id.batteryButton)
        appsStatus = findViewById(R.id.appsStatus)
        logList = findViewById(R.id.logList)
        logEmpty = findViewById(R.id.logEmpty)

        emailInput.setText(Auth.email(this))
        signInButton.setOnClickListener { signIn() }
        findViewById<Button>(R.id.signOutButton).setOnClickListener { confirmSignOut() }
        listenerButton.setOnClickListener { openListenerSettings() }
        batteryButton.setOnClickListener { requestBatteryExemption() }
        findViewById<Button>(R.id.appsButton).setOnClickListener {
            startActivity(Intent(this, AppPickerActivity::class.java))
        }
        findViewById<Button>(R.id.testButton).setOnClickListener { sendTest() }
        findViewById<Button>(R.id.retryButton).setOnClickListener {
            Uploader.kick(this)
            Toast.makeText(this, R.string.retrying, Toast.LENGTH_SHORT).show()
        }
    }

    override fun onResume() {
        super.onResume()
        InboxStore.onChange = { renderLog() }
        render()
    }

    override fun onPause() {
        InboxStore.onChange = null
        super.onPause()
    }

    private fun render() {
        val signedIn = Auth.isSignedIn(this)
        loginSection.visibility = if (signedIn) View.GONE else View.VISIBLE
        setupSection.visibility = if (signedIn) View.VISIBLE else View.GONE
        if (!signedIn) return

        accountText.text = getString(R.string.signed_in_as, Auth.email(this))

        val listenerOn = getSystemService(NotificationManager::class.java)
            .isNotificationListenerAccessGranted(ComponentName(this, BankNotificationListener::class.java))
        listenerStatus.setText(if (listenerOn) R.string.listener_on else R.string.listener_off)
        listenerButton.visibility = if (listenerOn) View.GONE else View.VISIBLE

        val batteryOk = getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(packageName)
        batteryStatus.setText(if (batteryOk) R.string.battery_ok else R.string.battery_restricted)
        batteryButton.visibility = if (batteryOk) View.GONE else View.VISIBLE

        val selected = BankApps.selected(this)
        appsStatus.text = if (selected.isEmpty()) {
            getString(R.string.apps_none)
        } else {
            getString(R.string.apps_listening, selected.map { BankApps.label(this, it) }.sorted().joinToString(", "))
        }

        renderLog()
    }

    private fun renderLog() {
        logList.removeAllViews()
        val items = InboxStore.recent(this, 50)
        logEmpty.visibility = if (items.isEmpty()) View.VISIBLE else View.GONE
        val inflater = LayoutInflater.from(this)
        for (item in items) {
            val row = inflater.inflate(R.layout.item_log, logList, false)
            val status = when {
                item.sent -> getString(R.string.status_sent)
                item.error != null -> "⚠️ ${item.error}"
                else -> getString(R.string.status_pending)
            }
            row.findViewById<TextView>(R.id.logHeader).text =
                "${timeFormat.format(Date(item.postedAt))} · ${item.appName}\n$status"
            row.findViewById<TextView>(R.id.logBody).text =
                listOf(item.title, item.body).filter { it.isNotBlank() }.joinToString("\n")
            logList.addView(row)
        }
    }

    private fun signIn() {
        val email = emailInput.text.toString().trim()
        val password = passwordInput.text.toString()
        if (email.isEmpty() || password.isEmpty()) {
            showLoginMessage(getString(R.string.enter_email_password))
            return
        }
        signInButton.isEnabled = false
        showLoginMessage(getString(R.string.signing_in))
        Thread {
            val error = try {
                Auth.signIn(this, email, password)
                null
            } catch (e: AuthException) {
                e.message
            } catch (e: IOException) {
                getString(R.string.no_connection)
            }
            runOnUiThread {
                signInButton.isEnabled = true
                if (error != null) {
                    showLoginMessage(error)
                } else {
                    passwordInput.text.clear()
                    loginMessage.visibility = View.GONE
                    render()
                    Uploader.kick(this) // send anything captured while signed out
                }
            }
        }.start()
    }

    private fun showLoginMessage(message: String?) {
        loginMessage.text = message
        loginMessage.visibility = View.VISIBLE
    }

    private fun confirmSignOut() {
        AlertDialog.Builder(this)
            .setMessage(R.string.sign_out_confirm)
            .setPositiveButton(R.string.sign_out) { _, _ ->
                Auth.signOut(this)
                render()
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun openListenerSettings() {
        val component = ComponentName(this, BankNotificationListener::class.java).flattenToString()
        val detail = Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS)
            .putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, component)
        try {
            startActivity(detail)
        } catch (e: ActivityNotFoundException) {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }
    }

    private fun requestBatteryExemption() {
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName"))
        try {
            startActivity(intent)
        } catch (e: ActivityNotFoundException) {
            startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        }
    }

    private fun sendTest() {
        val now = System.currentTimeMillis()
        val title = getString(R.string.test_title)
        val text = getString(R.string.test_text, Build.MODEL, timeFormat.format(Date(now)))
        InboxStore.add(
            this,
            CapturedItem(
                id = CapturedItem.contentId(Config.TEST_PACKAGE, title, text),
                packageName = Config.TEST_PACKAGE,
                appName = getString(R.string.test_app_name),
                title = title,
                text = text,
                bigText = "",
                postedAt = now,
                capturedAt = now,
            ),
        )
        Uploader.kick(this)
    }
}
