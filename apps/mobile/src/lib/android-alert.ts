import type { AlertButton, AlertOptions } from "react-native";

export interface AndroidAlertButton {
  readonly text: string;
  readonly style: "default" | "cancel" | "destructive";
  readonly isPreferred?: boolean;
  /** Disabled while the alert's text field is blank. */
  readonly requiresInput?: boolean;
  readonly onPress: (inputValue?: string) => void;
}

export interface AndroidAlertRequest {
  readonly id?: number;
  readonly title: string;
  readonly message?: string;
  readonly textInput?: { readonly initialValue: string };
  readonly buttons: readonly AndroidAlertButton[];
  /** Back press and a tap outside dismiss the alert, as with RN's `cancelable`. */
  readonly cancelable?: boolean;
  readonly onDismiss?: () => void;
}

let nextAlertId = 0;

/** Adapts an `Alert.alert` call; `done` runs before any button or dismiss callback. */
export function alertRequestFromNative(
  title: string | null | undefined,
  message: string | null | undefined,
  buttons: AlertButton[] | undefined,
  options: AlertOptions | undefined,
  done: () => void,
): AndroidAlertRequest {
  const source = buttons && buttons.length > 0 ? buttons : [{ text: "OK" }];
  return {
    id: nextAlertId++,
    title: title ?? "",
    message: message ?? undefined,
    cancelable: options?.cancelable,
    onDismiss: () => {
      done();
      options?.onDismiss?.();
    },
    buttons: source.map((button) => ({
      text: button.text ?? "OK",
      style: button.style ?? "default",
      isPreferred: button.isPreferred,
      onPress: () => {
        done();
        button.onPress?.();
      },
    })),
  };
}

// ponytail: character count stands in for measuring the label; measure with
// onTextLayout if a wide-glyph title still truncates.
const SIDE_BY_SIDE_MAX_TITLE_LENGTH = 11;

/**
 * UIAlertController's layout: two buttons sit side by side with Cancel on
 * the left, unless a title would not fit half the alert's width; otherwise
 * they stack with Cancel at the bottom.
 */
export function orderAlertButtons(buttons: readonly AndroidAlertButton[]) {
  const cancel = buttons.filter((button) => button.style === "cancel");
  const rest = buttons.filter((button) => button.style !== "cancel");
  const horizontal =
    buttons.length === 2 &&
    buttons.every((button) => button.text.length <= SIDE_BY_SIDE_MAX_TITLE_LENGTH);
  const ordered = horizontal ? [...cancel, ...rest] : [...rest, ...cancel];
  return { ordered, horizontal };
}
