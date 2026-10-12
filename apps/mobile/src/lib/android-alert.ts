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

/**
 * UIAlertController's layout: two buttons sit side by side with Cancel on
 * the left; three or more stack with Cancel at the bottom.
 */
export function orderAlertButtons(buttons: readonly AndroidAlertButton[]) {
  const cancel = buttons.filter((button) => button.style === "cancel");
  const rest = buttons.filter((button) => button.style !== "cancel");
  const ordered = buttons.length === 2 ? [...cancel, ...rest] : [...rest, ...cancel];
  return { ordered, horizontal: buttons.length === 2 };
}
