import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

type Support = { installed: string[]; pending: string[]; supported: string[] };

const mocks = vi.hoisted(() => ({
  native: null as null | {
    isAvailable: ReturnType<typeof vi.fn<() => boolean>>;
    getSupport: ReturnType<typeof vi.fn<(id: number, locale: string) => Promise<Support>>>;
    downloadModel: ReturnType<
      typeof vi.fn<(id: number, locale: string) => Promise<"installed" | "pending">>
    >;
    transcribe: ReturnType<
      typeof vi.fn<(id: number, uri: string, locale: string) => Promise<string>>
    >;
    cancel: ReturnType<typeof vi.fn<(id: number) => void>>;
  },
}));

vi.mock("expo", () => ({ requireOptionalNativeModule: () => mocks.native }));

function nativeError(code: string) {
  return Object.assign(new Error(code), { code });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

async function load() {
  vi.resetModules();
  return import("./voiceTranscription.android");
}

const signal = () => ({ signal: new AbortController().signal });

beforeEach(() => {
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
    ...new Intl.DateTimeFormat("en").resolvedOptions(),
    locale: "sv-FI",
  });
  mocks.native = {
    isAvailable: vi.fn(() => true),
    getSupport: vi.fn(async () => ({ installed: ["sv-SE"], pending: [], supported: ["sv-SE"] })),
    downloadModel: vi.fn(async () => "installed" as const),
    transcribe: vi.fn(async () => " Hej världen. "),
    cancel: vi.fn(),
  };
});

describe("resolveRecognizerLocale", () => {
  it("prefers an exact tag, then an installed tag of the same language", async () => {
    const { resolveRecognizerLocale } = await load();
    const support = { installed: ["en-GB"], pending: [], supported: ["en-US", "en_GB"] };
    expect(resolveRecognizerLocale("en_us", support)).toEqual({
      locale: "en-US",
      installed: false,
    });
    expect(resolveRecognizerLocale("en-AU", support)).toEqual({ locale: "en-GB", installed: true });
    expect(resolveRecognizerLocale("fi-FI", support)).toBeNull();
  });
});

describe("getLocalVoiceTranscriber", () => {
  it("hides the mic without the native module or on-device file recognition", async () => {
    mocks.native!.isAvailable.mockReturnValue(false);
    expect((await load()).getLocalVoiceTranscriber()).toBeNull();
    mocks.native = null;
    expect((await load()).getLocalVoiceTranscriber()).toBeNull();
  });

  it("hides the mic once the background check finds no model for the language", async () => {
    mocks.native!.getSupport.mockResolvedValue({
      installed: [],
      pending: [],
      supported: ["de-DE"],
    });
    const { getLocalVoiceTranscriber } = await load();
    expect(getLocalVoiceTranscriber()).not.toBeNull();
    await vi.waitFor(() => expect(getLocalVoiceTranscriber()).toBeNull());
    expect(mocks.native!.getSupport).toHaveBeenCalledTimes(1);
  });

  it("transcribes with the recognizer's tag for the device language", async () => {
    const prepared = await (await load()).getLocalVoiceTranscriber()!.prepare(signal());
    expect(prepared.locale).toBe("sv-SE");
    await expect(prepared.transcribe("file:///voice.m4a", signal())).resolves.toBe("Hej världen.");
    expect(mocks.native!.transcribe).toHaveBeenCalledWith(
      expect.any(Number),
      "file:///voice.m4a",
      "sv-SE",
    );
    expect(mocks.native!.downloadModel).not.toHaveBeenCalled();
  });

  it("downloads a missing model and fails preparation while it is still pending", async () => {
    mocks.native!.getSupport.mockResolvedValue({
      installed: [],
      pending: [],
      supported: ["sv-SE"],
    });
    mocks.native!.downloadModel.mockResolvedValue("pending");
    const error = await (
      await load()
    )
      .getLocalVoiceTranscriber()!
      .prepare(signal())
      .catch((e: unknown) => e);
    expect(mocks.native!.downloadModel).toHaveBeenCalledWith(expect.any(Number), "sv-SE");
    expect(error).toMatchObject({ code: "preparation-failed" });
  });

  it("falls back to the device locale when the recognizer cannot list languages", async () => {
    mocks.native!.getSupport.mockRejectedValue(nativeError("ERR_RECOGNIZER_14"));
    const prepared = await (await load()).getLocalVoiceTranscriber()!.prepare(signal());
    expect(prepared.locale).toBe("sv-FI");
  });

  it.each([
    ["ERR_RECOGNIZER_12", "unsupported-locale"],
    ["ERR_RECOGNIZER_5", "transcription-failed"],
    ["ERR_DECODE", "transcription-failed"],
    ["ERR_UNAVAILABLE", "unavailable"],
    ["ERR_CANCELLED", "cancelled"],
  ])("maps native %s to %s", async (code, expected) => {
    mocks.native!.transcribe.mockRejectedValue(nativeError(code));
    const prepared = await (await load()).getLocalVoiceTranscriber()!.prepare(signal());
    const error = await prepared.transcribe("file:///voice.m4a", signal()).catch((e: unknown) => e);
    // vi.resetModules gives each test its own VoiceTranscriptionError class.
    expect(error).toMatchObject({ name: "VoiceTranscriptionError", code: expected });
  });

  it("cancels native transcription on abort and settles only after native does", async () => {
    const native = deferred<string>();
    mocks.native!.transcribe.mockImplementation(() => native.promise);
    const prepared = await (await load()).getLocalVoiceTranscriber()!.prepare(signal());
    const controller = new AbortController();
    const settled = vi.fn((value: unknown) => value);
    const result = prepared
      .transcribe("file:///voice.m4a", { signal: controller.signal })
      .then(settled, settled);

    await vi.waitFor(() => expect(mocks.native!.transcribe).toHaveBeenCalled());
    const [id] = mocks.native!.transcribe.mock.calls[0]!;
    controller.abort();
    expect(mocks.native!.cancel).toHaveBeenCalledWith(id);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(settled).not.toHaveBeenCalled();
    native.reject(nativeError("ERR_CANCELLED"));

    expect(await result).toMatchObject({ code: "cancelled" });
  });

  it("does not start native work after an earlier abort", async () => {
    const prepared = await (await load()).getLocalVoiceTranscriber()!.prepare(signal());
    const controller = new AbortController();
    controller.abort();
    const error = await prepared
      .transcribe("file:///voice.m4a", { signal: controller.signal })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "cancelled" });
    expect(mocks.native!.transcribe).not.toHaveBeenCalled();
  });
});
