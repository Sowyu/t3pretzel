package expo.modules.t3appupdater

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class T3AppUpdaterModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("T3AppUpdater")

    Function("getInstallInfo") {
      AppUpdater.installInfo(context())
    }

    AsyncFunction("inspectApk") { path: String ->
      AppUpdater.inspectApk(context(), path)
    }

    Function("openInstallPermissionSettings") {
      AppUpdater.openInstallPermissionSettings(context())
    }

    // `expected` carries { commit, sha256 } so a killed process can report what
    // it was installing on the next launch.
    AsyncFunction("install") { path: String, expected: Map<String, String> ->
      AppUpdater.install(context(), path, expected)
    }

    Function("readPendingUpdate") {
      AppUpdater.readPendingUpdate(context())
    }

    Function("clearPendingUpdate") {
      AppUpdater.clearPendingUpdate(context())
    }
  }

  private fun context(): Context = appContext.reactContext ?: error("The app is not active.")
}
