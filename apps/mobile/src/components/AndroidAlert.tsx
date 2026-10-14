import { useState } from "react";
import { Modal, Pressable, TextInput, View } from "react-native";
import Animated, { Keyframe, ReduceMotion } from "react-native-reanimated";

import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { cn } from "../lib/cn";
import { AppText } from "./AppText";
import {
  orderAlertButtons,
  type AndroidAlertButton,
  type AndroidAlertRequest,
} from "../lib/android-alert";
import { IosStatusBarOverlay } from "./IosStatusBar";

export { alertRequestFromNative, type AndroidAlertRequest } from "../lib/android-alert";

// UIAlertController grows in from slightly larger while the backdrop fades.
const ALERT_ENTER = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 1.12 }] },
  100: { opacity: 1, transform: [{ scale: 1 }] },
})
  .duration(220)
  .reduceMotion(ReduceMotion.System);

/**
 * The iOS 26 alert in a transparent Modal: a 270dp card with 34dp corners,
 * centered title and message, and capsule buttons that sit side by side for
 * two actions and stack otherwise.
 */
export function AndroidAlert(props: { readonly request: AndroidAlertRequest }) {
  const { request } = props;
  const { themeVariables: colors, themeAppearance } = useAppearancePreferences();
  const isDark = themeAppearance === "dark";
  // iOS system fill behind every alert button; the preferred action is filled with the accent.
  const buttonFill = isDark ? "rgba(120, 120, 128, 0.32)" : "rgba(120, 120, 128, 0.16)";
  const [inputValue, setInputValue] = useState(request.textInput?.initialValue ?? "");
  const { ordered, horizontal } = orderAlertButtons(request.buttons);
  const cancelButton = request.buttons.find((button) => button.style === "cancel");
  const inputBlank = request.textInput !== undefined && inputValue.trim().length === 0;
  const press = (button: AndroidAlertButton) =>
    button.onPress(request.textInput ? inputValue : undefined);
  const dismiss = () => {
    if (request.cancelable) request.onDismiss?.();
    else if (cancelButton) press(cancelButton);
  };

  const preferred =
    request.buttons.find((button) => button.isPreferred) ??
    (request.buttons.length > 1 ? cancelButton : undefined);

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={dismiss}
    >
      <View className="flex-1 items-center justify-center bg-backdrop px-8">
        {request.cancelable ? (
          <Pressable
            accessibilityLabel="Dismiss"
            className="absolute inset-0"
            onPress={() => request.onDismiss?.()}
          />
        ) : null}
        <Animated.View
          entering={ALERT_ENTER}
          accessibilityViewIsModal
          style={{
            width: 270,
            maxWidth: "100%",
            borderRadius: 34,
            padding: 16,
            paddingTop: 22,
            // Solid, a step above the screen in dark mode like the menus.
            backgroundColor: isDark ? colors["--color-grouped-card"] : colors["--color-card-alt"],
            boxShadow: "0 20px 60px rgba(0, 0, 0, 0.25)",
          }}
        >
          <View className="items-center gap-1 px-2 pb-5">
            <AppText
              accessibilityRole="header"
              className="text-center font-t3-bold"
              style={{ fontSize: 17, lineHeight: 22 }}
            >
              {request.title}
            </AppText>
            {request.message ? (
              <AppText
                className="text-center text-foreground-secondary"
                style={{ fontSize: 15, lineHeight: 20 }}
              >
                {request.message}
              </AppText>
            ) : null}
            {request.textInput ? (
              <TextInput
                accessibilityLabel={request.title}
                autoFocus
                selectTextOnFocus
                returnKeyType="done"
                value={inputValue}
                onChangeText={setInputValue}
                onSubmitEditing={() => {
                  const confirm = request.buttons.find((button) => button.requiresInput);
                  if (confirm && !inputBlank) press(confirm);
                }}
                className="mt-3 w-full rounded-xl px-3 py-2 font-sans text-base text-foreground"
                style={{ backgroundColor: buttonFill }}
              />
            ) : null}
          </View>
          <View className={horizontal ? "flex-row" : undefined} style={{ gap: 8 }}>
            {ordered.map((button) => {
              const disabled = button.requiresInput === true && inputBlank;
              const prominent = button === preferred && button.style !== "cancel" && !disabled;
              return (
                <Pressable
                  key={`${button.style}:${button.text}`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled }}
                  disabled={disabled}
                  onPress={() => press(button)}
                  className={cn(
                    "items-center justify-center px-3 active:opacity-60",
                    horizontal && "flex-1",
                  )}
                  style={{
                    minHeight: 48,
                    borderRadius: 24,
                    backgroundColor:
                      prominent && button.style !== "destructive"
                        ? colors["--color-primary"]
                        : buttonFill,
                  }}
                >
                  <AppText
                    numberOfLines={1}
                    className={cn(
                      "text-[17px]",
                      button === preferred ? "font-t3-bold" : "font-t3-medium",
                      disabled
                        ? "text-foreground-tertiary"
                        : button.style === "destructive"
                          ? "text-danger-foreground"
                          : prominent
                            ? "text-primary-foreground"
                            : "text-foreground",
                    )}
                  >
                    {button.text}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      </View>
      <IosStatusBarOverlay />
    </Modal>
  );
}
