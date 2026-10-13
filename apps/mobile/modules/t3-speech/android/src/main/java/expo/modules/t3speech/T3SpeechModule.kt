package expo.modules.t3speech

import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.speech.SpeechRecognizer
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * On-device file transcription for composer dictation. JS passes an `id` with
 * every async call so `cancel(id)` can stop that call. Every call settles once,
 * after its recognizer is destroyed. Rejection codes are `ERR_RECOGNIZER_<n>`
 * (a SpeechRecognizer.ERROR_* value), `ERR_DECODE`, `ERR_TIMEOUT`,
 * `ERR_START`, `ERR_CANCELLED` and `ERR_UNAVAILABLE`.
 */
class T3SpeechModule : Module() {
  private val main = Handler(Looper.getMainLooper())

  // Main thread only.
  private val operations = mutableMapOf<Int, SpeechOperation>()

  override fun definition() = ModuleDefinition {
    Name("T3Speech")

    // Android 13 is the first release that accepts a recording through EXTRA_AUDIO_SOURCE.
    Function("isAvailable") {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
        SpeechRecognizer.isOnDeviceRecognitionAvailable(context())
    }

    // Resolves { installed, pending, supported } on-device language tags.
    AsyncFunction("getSupport") { id: Int, locale: String, promise: Promise ->
      start(id, promise) { SupportCheck(context(), locale, promise) }
    }

    // Resolves "installed" once the model is ready, or "pending" while the system downloads it.
    AsyncFunction("downloadModel") { id: Int, locale: String, promise: Promise ->
      start(id, promise) { ModelDownload(context(), locale, promise) }
    }

    AsyncFunction("transcribe") { id: Int, uri: String, locale: String, promise: Promise ->
      start(id, promise) { FileTranscription(context(), uri, locale, promise) }
    }

    Function("cancel") { id: Int ->
      main.post { operations[id]?.cancel() }
    }

    OnDestroy {
      main.post { operations.values.toList().forEach { it.cancel() } }
    }
  }

  private fun start(id: Int, promise: Promise, create: () -> SpeechOperation) {
    main.post {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
        promise.reject("ERR_UNAVAILABLE", "On-device speech recognition needs Android 13 or later.", null)
        return@post
      }
      val operation =
        runCatching(create).getOrElse { error ->
          promise.reject("ERR_UNAVAILABLE", error.message ?: "Speech recognition is unavailable.", error)
          return@post
        }
      operations[id] = operation
      operation.onSettled = { operations.remove(id) }
      operation.run()
    }
  }

  private fun context(): Context = appContext.reactContext ?: error("The app is not active.")
}
