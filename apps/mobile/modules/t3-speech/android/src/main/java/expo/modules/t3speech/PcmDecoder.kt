package expo.modules.t3speech

import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.OutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.CancellationException
import java.util.concurrent.atomic.AtomicBoolean

/** Decodes any audio file MediaExtractor reads into raw 16 kHz mono 16-bit little-endian PCM. */
internal object PcmDecoder {
  const val SAMPLE_RATE = 16_000
  private const val DEQUEUE_TIMEOUT_US = 10_000L

  /** Returns the number of PCM frames written to [output]. Throws CancellationException once [cancelled] is set. */
  fun decode(
    path: String,
    output: File,
    cancelled: AtomicBoolean,
  ): Long {
    val extractor = MediaExtractor()
    var codec: MediaCodec? = null
    try {
      extractor.setDataSource(path)
      val track =
        (0 until extractor.trackCount).firstOrNull {
          extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
        } ?: throw IOException("The recording has no audio track.")
      extractor.selectTrack(track)
      val format = extractor.getTrackFormat(track)
      val decoder = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME)!!)
      codec = decoder
      decoder.configure(format, null, null, 0)
      decoder.start()

      FileOutputStream(output).use { stream ->
        val resampler = MonoResampler(stream).apply { configure(format) }
        val info = MediaCodec.BufferInfo()
        var inputDone = false
        while (true) {
          if (cancelled.get()) throw CancellationException()
          if (!inputDone) {
            val index = decoder.dequeueInputBuffer(DEQUEUE_TIMEOUT_US)
            if (index >= 0) {
              val size = extractor.readSampleData(decoder.getInputBuffer(index)!!, 0)
              if (size < 0) {
                decoder.queueInputBuffer(index, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                inputDone = true
              } else {
                decoder.queueInputBuffer(index, 0, size, extractor.sampleTime, 0)
                extractor.advance()
              }
            }
          }
          val index = decoder.dequeueOutputBuffer(info, DEQUEUE_TIMEOUT_US)
          if (index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
            resampler.configure(decoder.outputFormat)
          } else if (index >= 0) {
            val buffer = decoder.getOutputBuffer(index)
            if (buffer != null && info.size > 0) {
              buffer.position(info.offset)
              buffer.limit(info.offset + info.size)
              resampler.write(buffer.order(ByteOrder.LITTLE_ENDIAN))
            }
            decoder.releaseOutputBuffer(index, false)
            if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) break
          }
        }
        resampler.flush()
        return resampler.frames
      }
    } finally {
      codec?.let {
        runCatching { it.stop() }
        it.release()
      }
      extractor.release()
    }
  }
}

/**
 * Downmixes interleaved PCM to mono and resamples it to 16 kHz by linear
 * interpolation. The recording is captured at 16 kHz mono, so this is
 * usually a straight copy.
 * ponytail: no low-pass before downsampling; add one if a recorder change brings back 44.1 kHz capture.
 */
private class MonoResampler(
  private val out: OutputStream,
) {
  var frames = 0L
    private set
  private var channels = 1
  private var floatSamples = false
  private var step = 1.0
  private var position = 0.0
  private var previous = 0f
  private var primed = false
  private val chunk = ByteBuffer.allocate(8192).order(ByteOrder.LITTLE_ENDIAN)

  fun configure(format: MediaFormat) {
    channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT).coerceAtLeast(1)
    step = format.getInteger(MediaFormat.KEY_SAMPLE_RATE).toDouble() / PcmDecoder.SAMPLE_RATE
    floatSamples =
      format.containsKey(MediaFormat.KEY_PCM_ENCODING) &&
      format.getInteger(MediaFormat.KEY_PCM_ENCODING) == AudioFormat.ENCODING_PCM_FLOAT
  }

  fun write(buffer: ByteBuffer) {
    val frameBytes = channels * if (floatSamples) 4 else 2
    while (buffer.remaining() >= frameBytes) {
      var sum = 0f
      repeat(channels) { sum += if (floatSamples) buffer.float * Short.MAX_VALUE else buffer.short.toFloat() }
      push(sum / channels)
    }
  }

  fun flush() {
    out.write(chunk.array(), 0, chunk.position())
    chunk.clear()
  }

  private fun push(sample: Float) {
    if (!primed) {
      previous = sample
      primed = true
      return
    }
    while (position < 1.0) {
      emit(previous + (sample - previous) * position.toFloat())
      position += step
    }
    position -= 1.0
    previous = sample
  }

  private fun emit(sample: Float) {
    if (chunk.remaining() < 2) flush()
    chunk.putShort(sample.toInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort())
    frames++
  }
}
