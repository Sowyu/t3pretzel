import { requireOptionalNativeModule } from "expo";

import {
  VoiceTranscriptionError,
  throwIfVoiceTranscriptionAborted,
  type PreparedVoiceTranscription,
  type VoiceTranscriber,
  type VoiceTranscriptionOptions,
} from "@t3tools/client-runtime/voice-input";

type LanguageSupport = {
  readonly installed: readonly string[];
  readonly pending: readonly string[];
  readonly supported: readonly string[];
};

/** `modules/t3-speech`. Each async call takes an id that `cancel(id)` stops. */
interface T3SpeechModule {
  isAvailable(): boolean;
  getSupport(id: number, locale: string): Promise<LanguageSupport>;
  downloadModel(id: number, locale: string): Promise<"installed" | "pending">;
  transcribe(id: number, uri: string, locale: string): Promise<string>;
  cancel(id: number): void;
}

// SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED and ERROR_CANNOT_CHECK_SUPPORT.
const ERROR_LANGUAGE_NOT_SUPPORTED = 12;
const ERROR_CANNOT_CHECK_SUPPORT = 14;

const native = requireOptionalNativeModule<T3SpeechModule>("T3Speech");
let nextOperationId = 0;
let deviceSupportsFiles: boolean | undefined;
// Locale -> whether an on-device model exists for it. Filled in the background
// so the mic hides for unsupported languages without blocking render.
const localeSupport = new Map<string, boolean | "checking">();

function getDeviceLocale(): string {
  return Intl.DateTimeFormat().resolvedOptions().locale;
}

function getNativeErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

function recognizerError(error: unknown): number | undefined {
  const match = /^ERR_RECOGNIZER_(\d+)$/.exec(getNativeErrorCode(error) ?? "");
  return match ? Number(match[1]) : undefined;
}

function toVoiceError(
  fallback: "preparation-failed" | "transcription-failed",
  message: string,
  error: unknown,
): VoiceTranscriptionError {
  if (error instanceof VoiceTranscriptionError) return error;
  const code = getNativeErrorCode(error);
  if (code === "ERR_CANCELLED") {
    return new VoiceTranscriptionError("cancelled", "Voice transcription was cancelled.", {
      cause: error,
    });
  }
  if (code === "ERR_UNAVAILABLE") {
    return new VoiceTranscriptionError(
      "unavailable",
      "Voice transcription requires on-device speech recognition on Android 13 or later.",
      { cause: error },
    );
  }
  if (recognizerError(error) === ERROR_LANGUAGE_NOT_SUPPORTED) {
    return new VoiceTranscriptionError(
      "unsupported-locale",
      "Voice transcription does not support this device language.",
      { cause: error },
    );
  }
  return new VoiceTranscriptionError(fallback, message, { cause: error });
}

/** Runs one native call and cancels it on abort. Settles only after native settles. */
async function runNative<T>(
  module: T3SpeechModule,
  signal: AbortSignal,
  start: (id: number) => Promise<T>,
): Promise<T> {
  throwIfVoiceTranscriptionAborted(signal);
  const id = ++nextOperationId;
  const cancel = () => module.cancel(id);
  signal.addEventListener("abort", cancel, { once: true });
  try {
    return await start(id);
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}

function normalizeTag(tag: string): string {
  return tag.replaceAll("_", "-").toLowerCase();
}

/**
 * Picks the recognizer's tag for the device locale: the exact tag first, then
 * any tag of the same language, preferring models already on the device.
 */
export function resolveRecognizerLocale(
  locale: string,
  support: LanguageSupport,
): { readonly locale: string; readonly installed: boolean } | null {
  const wanted = normalizeTag(locale);
  const language = wanted.split("-")[0];
  const groups = [
    { tags: support.installed, installed: true },
    { tags: support.pending, installed: false },
    { tags: support.supported, installed: false },
  ];
  const matchers = [
    (tag: string) => normalizeTag(tag) === wanted,
    (tag: string) => normalizeTag(tag).split("-")[0] === language,
  ];
  for (const matches of matchers) {
    for (const { tags, installed } of groups) {
      const tag = tags.find(matches);
      if (tag !== undefined) return { locale: tag, installed };
    }
  }
  return null;
}

function checkLocaleInBackground(module: T3SpeechModule, locale: string): void {
  localeSupport.set(locale, "checking");
  runNative(module, new AbortController().signal, (id) => module.getSupport(id, locale)).then(
    (support) => localeSupport.set(locale, resolveRecognizerLocale(locale, support) !== null),
    // Unknown support: keep the mic. `prepare` reports a real failure.
    () => localeSupport.set(locale, true),
  );
}

export function getLocalVoiceTranscriber(): VoiceTranscriber | null {
  if (!native) return null;
  deviceSupportsFiles ??= native.isAvailable();
  if (!deviceSupportsFiles) return null;
  const locale = getDeviceLocale();
  const supported = localeSupport.get(locale);
  if (supported === false) return null;
  if (supported === undefined) checkLocaleInBackground(native, locale);
  return { prepare: (options) => prepareVoiceTranscription(native, locale, options) };
}

async function prepareVoiceTranscription(
  module: T3SpeechModule,
  deviceLocale: string,
  { signal }: VoiceTranscriptionOptions,
): Promise<PreparedVoiceTranscription> {
  try {
    let resolved: { readonly locale: string; readonly installed: boolean } | null;
    try {
      const support = await runNative(module, signal, (id) => module.getSupport(id, deviceLocale));
      resolved = resolveRecognizerLocale(deviceLocale, support);
    } catch (error) {
      // Some recognizers cannot list languages. Try the device locale as is.
      if (recognizerError(error) !== ERROR_CANNOT_CHECK_SUPPORT) throw error;
      resolved = { locale: deviceLocale, installed: true };
    }
    throwIfVoiceTranscriptionAborted(signal);
    localeSupport.set(deviceLocale, resolved !== null);
    if (!resolved) {
      throw new VoiceTranscriptionError(
        "unsupported-locale",
        "Voice transcription does not support this device language.",
      );
    }

    if (!resolved.installed) {
      const { locale } = resolved;
      const status = await runNative(module, signal, (id) => module.downloadModel(id, locale));
      throwIfVoiceTranscriptionAborted(signal);
      if (status !== "installed") {
        throw new VoiceTranscriptionError(
          "preparation-failed",
          "The speech model for this language is still downloading. Try again shortly.",
        );
      }
    }

    const { locale } = resolved;
    return {
      locale,
      transcribe: (uri, options) => transcribeVoiceRecording(module, uri, locale, options),
    };
  } catch (error) {
    throwIfVoiceTranscriptionAborted(signal);
    throw toVoiceError(
      "preparation-failed",
      "Voice transcription could not prepare this language.",
      error,
    );
  }
}

async function transcribeVoiceRecording(
  module: T3SpeechModule,
  uri: string,
  locale: string,
  { signal }: VoiceTranscriptionOptions,
): Promise<string> {
  try {
    const transcript = await runNative(module, signal, (id) => module.transcribe(id, uri, locale));
    throwIfVoiceTranscriptionAborted(signal);
    return transcript.trim();
  } catch (error) {
    throwIfVoiceTranscriptionAborted(signal);
    throw toVoiceError("transcription-failed", "Voice transcription failed.", error);
  }
}
