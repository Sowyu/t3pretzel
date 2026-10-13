package expo.modules.t3backgroundrefresh

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class T3BackgroundRefreshModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("T3BackgroundRefresh")

    // Every launch, UI or headless, re-arms the schedule if it is on.
    OnCreate {
      context()?.let { BackgroundRefresh.rearm(it) }
    }

    Function("setEnabled") { enabled: Boolean ->
      context()?.let { BackgroundRefresh.setEnabled(it, enabled) }
    }

    AsyncFunction("getStatus") {
      context()?.let { BackgroundRefresh.status(it) }
    }

    Function("saveRecord") { json: String ->
      context()?.let { BackgroundRefresh.saveRecord(it, json) }
    }

    Function("runNow") {
      context()?.let { BackgroundRefresh.runNow(it) }
    }

    Function("requestUnrestrictedBattery") {
      context()?.let { BackgroundRefresh.requestUnrestrictedBattery(it) }
    }
  }

  private fun context(): Context? = appContext.reactContext?.applicationContext
}
