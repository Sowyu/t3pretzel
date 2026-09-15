import * as Schema from "effect/Schema";
import * as Clipboard from "expo-clipboard";

import { lightImpactHaptic, selectionHaptic } from "./haptics";

export class CopyTextClipboardWriteError extends Schema.TaggedError<CopyTextClipboardWriteError>()(
  "CopyTextClipboardWriteError",
  {
    target: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to copy ${this.target} to the clipboard.`;
  }
}

interface CopyTextWithHapticOptions {
  readonly target?: string;
  readonly feedback?: "light-impact" | "selection";
}

export async function tryCopyTextWithHaptic(
  value: string,
  options: CopyTextWithHapticOptions = {},
): Promise<boolean> {
  const target = options.target ?? "text";
  const feedback = options.feedback ?? "light-impact";

  const clipboardWrite = (async () => {
    try {
      await Clipboard.setStringAsync(value);
      return true;
    } catch (cause) {
      const error = new CopyTextClipboardWriteError({ target, cause });
      console.error(error.message, { _tag: error._tag, target, stack: error.stack });
      return false;
    }
  })();

  // The helpers never reject, so the copy result is the only thing to report.
  void (feedback === "selection" ? selectionHaptic() : lightImpactHaptic());

  return await clipboardWrite;
}

export function copyTextWithHaptic(value: string, options: CopyTextWithHapticOptions = {}): void {
  void tryCopyTextWithHaptic(value, options);
}
