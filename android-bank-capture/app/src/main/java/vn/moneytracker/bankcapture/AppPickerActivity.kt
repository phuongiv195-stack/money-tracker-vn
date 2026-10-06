package vn.moneytracker.bankcapture

import android.app.Activity
import android.os.Bundle
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.ListView

/** Lets the user tick which apps count as bank apps. Saved on every tap. */
class AppPickerActivity : Activity() {
    private lateinit var list: ListView
    private var apps: List<BankApps.InstalledApp> = emptyList()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_app_picker)
        list = findViewById(R.id.appList)
        list.choiceMode = ListView.CHOICE_MODE_MULTIPLE
        list.setOnItemClickListener { _, _, _, _ -> save() }
        findViewById<Button>(R.id.doneButton).setOnClickListener { finish() }

        Thread {
            val installed = BankApps.installed(this)
            runOnUiThread { show(installed) }
        }.start()
    }

    private fun show(installed: List<BankApps.InstalledApp>) {
        apps = installed
        list.adapter = ArrayAdapter(this, android.R.layout.simple_list_item_multiple_choice, apps.map { it.label })
        val selected = BankApps.selected(this)
        apps.forEachIndexed { i, app -> list.setItemChecked(i, app.packageName in selected) }
    }

    private fun save() {
        val chosen = apps.filterIndexed { i, _ -> list.isItemChecked(i) }.map { it.packageName }.toSet()
        BankApps.setSelected(this, chosen)
    }
}
