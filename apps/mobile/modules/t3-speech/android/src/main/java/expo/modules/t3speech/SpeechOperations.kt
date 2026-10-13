package expo.modules.t3speech

import android.annotation.TargetApi
import android.content.Context
import android.content.Intent
import android.media.AudioFormat
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.speech.ModelDownloadListener
import android.speech.RecognitionListener
import android.speech.RecognitionSupport
import android.speech.RecognitionSupportCallback
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import expo.modules.kotlin.Promise
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

/** One promise-backed recognizer call. Created, run and settled on the main thread. */
internal abstract class SpeechOperation(private val promise: Promise) {
  protected val main = Handler(Looper.getMainLooper())
  var onSettled: (() -> Unit)? = null
  private var settled = false
  private val timeout = Runnable { reject("ERR_TIMEOUT", "Speech recognition timed out.") }

  protected abstract fun start()

  fun run() {
    try {
      start()
    } catch (error: Exception) {
      reject("ERR_START", error.message ?: "Speech recognition could not start.", error)
    }
  }

  open fun cancel() = rejectCancelled()

  protected fun rejectCancelled() = reject("ERR_CANCELLED", "Speech recognition was cancelled.")

  /** Stops native work. Runs once, before the promise settles. */
  protected open fun release() {}

  protected fun timeoutAfter(millis: Long) {
    main.removeCallbacks(timeout)
    main.postDelayed(timeout, millis)
  }

  protected fun resolve(value: Any?) {
    if (settle()) promise.resolve(value)
  }

  protected fun reject(code: String, message: String, cause: Throwable? = null) {
    if (settle()) promise.reject(code, message, cause)
  }

  protected fun rejectRecognizer(error: Int) =
    reject("ERR_RECOGNIZER_$error", "Speech recognition failed with error $error.")

  private fun settle(): Boolean {
    if (settled) return false
    settled = true
    main.removeCallbacks(timeout)
    runCatching { release() }
    onSettled?.invoke()
    return true
  }
}

private fun recognizerIntent(locale: String) =
  Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
    putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale)
    putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
  }

@TargetApi(Build.VERSION_CODES.TIRAMISU)
internal class SupportCheck(
  private val context: Context,
  private val locale: String,
  promise: Promise,
) : SpeechOperation(promise) {
  private var recognizer: SpeechRecognizer? = null

  override fun start() {
    val recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(context).also { recognizer = it }
    timeoutAfter(CHECK_TIMEOUT_MS)
    recognizer.checkRecognitionSupport(
      recognizerIntent(locale),
      context.mainExecutor,
      object : RecognitionSupportCallback {
        override fun onSupportResult(support: RecognitionSupport) {
          resolve(
            mapOf(
              "installed" to support.installedOnDeviceLanguages,
              "pending" to support.pendingOnDeviceLanguages,
              "supported" to support.supportedOnDeviceLanguages,
            ),
          )
        }

        override fun onError(error: Int) = rejectRecognizer(error)
      },
    )
  }

  override fun release() {
    recognizer?.let { main.post { it.destroy() } }
    recognizer = null
  }
}

@TargetApi(Build.VERSION_CODES.TIRAMISU)
internal class ModelDownload(
  private val context: Context,
  private val locale: String,
  promise: Promise,
) : SpeechOperation(promise) {
  private var recognizer: SpeechRecognizer? = null

  override fun start() {
    val recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(context).also { recognizer = it }
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      // Android 13 reports no download progress. The system keeps downloading after this.
      recognizer.triggerModelDownload(recognizerIntent(locale))
      resolve("pending")
      return
    }
    timeoutAfter(DOWNLOAD_WAIT_MS)
    recognizer.triggerModelDownload(
      recognizerIntent(locale),
      context.mainExecutor,
      object : ModelDownloadListener {
        override fun onProgress(completedPercent: Int) {}

        override fun onSuccess() = resolve("installed")

        override fun onScheduled() = resolve("pending")

        override fun onError(error: Int) = rejectRecognizer(error)
      },
    )
  }

  override fun release() {
    recognizer?.let { main.post { it.destroy() } }
    recognizer = null
  }
}

/**
 * Decodes the recording to 16 kHz mono PCM off the main thread, then feeds it
 * to the on-device recognizer as one segmented session, so pauses in speech
 * do not end recognition before the file does.
 */
@TargetApi(Build.VERSION_CODES.TIRAMISU)
internal class FileTranscription(
  private val context: Context,
  private val uri: String,
  private val locale: String,
  promise: Promise,
) : SpeechOperation(promise),
  RecognitionListener {
  private val cancelled = AtomicBoolean(false)
  private var decoding = false
  private var pcm: File? = null
  private var audio: ParcelFileDescriptor? = null
  private var recognizer: SpeechRecognizer? = null
  private val segments = mutableListOf<String>()
  private var partial = ""

  override fun start() {
    val path = Uri.parse(uri).path ?: uri
    val output = File.createTempFile("t3-dictation", ".pcm", context.cacheDir).also { pcm = it }
    decoding = true
    thread(name = "T3SpeechDecoder") {
      val result = runCatching { PcmDecoder.decode(path, output, cancelled) }
      main.post {
        decoding = false
        result
          .onSuccess { frames ->
            runCatching { recognize(output, frames) }
              .onFailure { reject("ERR_START", "Speech recognition could not start.", it) }
          }
          .onFailure { error ->
            if (cancelled.get()) {
              rejectCancelled()
            } else {
              reject("ERR_DECODE", "The recording could not be decoded.", error)
            }
          }
      }
    }
  }

  override fun cancel() {
    cancelled.set(true)
    // The decoder thread settles the promise once it has stopped writing the file.
    if (!decoding) rejectCancelled()
  }

  private fun recognize(file: File, frames: Long) {
    if (cancelled.get()) return rejectCancelled()
    if (frames == 0L) return resolve("")
    val audio = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).also { audio = it }
    val intent =
      recognizerIntent(locale).apply {
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE, audio)
        putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_ENCODING, AudioFormat.ENCODING_PCM_16BIT)
        putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_SAMPLING_RATE, PcmDecoder.SAMPLE_RATE)
        putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_CHANNEL_COUNT, 1)
        putExtra(RecognizerIntent.EXTRA_SEGMENTED_SESSION, RecognizerIntent.EXTRA_AUDIO_SOURCE)
      }
    val seconds = frames / PcmDecoder.SAMPLE_RATE
    timeoutAfter(TRANSCRIBE_BASE_TIMEOUT_MS + seconds * TRANSCRIBE_MS_PER_AUDIO_SECOND)
    recognizer =
      SpeechRecognizer.createOnDeviceSpeechRecognizer(context).apply {
        setRecognitionListener(this@FileTranscription)
        startListening(intent)
      }
  }

  private fun transcript() =
    (segments + partial).filter { it.isNotBlank() }.joinToString(" ") { it.trim() }

  private fun firstResult(bundle: Bundle?) =
    bundle?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()

  override fun onPartialResults(partialResults: Bundle?) {
    partial = firstResult(partialResults)
  }

  override fun onSegmentResults(segmentResults: Bundle) {
    segments += firstResult(segmentResults)
    partial = ""
  }

  override fun onEndOfSegmentedSession() = resolve(transcript())

  // Recognizers that ignore EXTRA_SEGMENTED_SESSION end here instead.
  // ponytail: such a recognizer stops at the first long pause; split the PCM at silences if devices do that.
  override fun onResults(results: Bundle?) {
    segments += firstResult(results)
    partial = ""
    resolve(transcript())
  }

  override fun onError(error: Int) {
    when (error) {
      // Silence or unintelligible audio. Keep whatever was recognized before it.
      SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> resolve(transcript())
      else -> rejectRecognizer(error)
    }
  }

  override fun onReadyForSpeech(params: Bundle?) {}

  override fun onBeginningOfSpeech() {}

  override fun onRmsChanged(rmsdB: Float) {}

  override fun onBufferReceived(buffer: ByteArray?) {}

  override fun onEndOfSpeech() {}

  override fun onEvent(
    eventType: Int,
    params: Bundle?,
  ) {}

  override fun release() {
    recognizer?.let {
      it.cancel()
      // Settling can happen inside a listener callback. Destroy after it returns.
      main.post { it.destroy() }
    }
    recognizer = null
    runCatching { audio?.close() }
    audio = null
    pcm?.delete()
    pcm = null
  }
}

private const val CHECK_TIMEOUT_MS = 10_000L
private const val DOWNLOAD_WAIT_MS = 60_000L
private const val TRANSCRIBE_BASE_TIMEOUT_MS = 20_000L
private const val TRANSCRIBE_MS_PER_AUDIO_SECOND = 2_000L
