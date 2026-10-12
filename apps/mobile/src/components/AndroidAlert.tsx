import { useState } from "react";
import { Modal, Pressable, StyleSheet, TextInput, View } from "react-native";

import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { cn } from "../lib/cn";
import { themeColorWithAlpha } from "../lib/mobileTheme";
import { AppText } from "./AppText";
import {
  orderAlertButtons,
  type AndroidAlertButton,
  type AndroidAlertRequest,
} from "../lib/android-alert";

export { alertRequestFromNative, type AndroidAlertRequest } from "../lib/android-alert";

/** An iOS-style alert in a transparent Modal: centered text, hairlines and a 14dp card. */
export function AndroidAlert(props: { readonly request: AndroidAlertRequest }) {
  const { request } = props;
  const { themeVariables: colors } = useAppearancePreferences();
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
        <View
          className="w-full max-w-[300px] overflow-hidden"
          style={{
            borderRadius: 14,
            backgroundColor: themeColorWithAlpha(colors["--color-card-alt"], 0.97),
          }}
        >
          <View className="items-center gap-1 px-4 pb-5 pt-5">
            <AppText accessibilityRole="header" className="text-center text-[17px] font-t3-bold">
              {request.title}
            </AppText>
            {request.message ? (
              <AppText className="text-center text-[13px] leading-[18px]">
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
                className="mt-3 w-full rounded-[7px] border-separator bg-screen px-2 py-1.5 font-sans text-sm text-foreground"
                style={{ borderWidth: StyleSheet.hairlineWidth }}
              />
            ) : null}
          </View>
          <View className={horizontal ? "flex-row" : undefined}>
            {ordered.map((button, index) => {
              const disabled = button.requiresInput === true && inputBlank;
              return (
                <Pressable
                  key={`${button.style}:${button.text}`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled }}
                  disabled={disabled}
                  onPress={() => press(button)}
                  className={cn(
                    "min-h-11 items-center justify-center border-separator px-2 active:bg-subtle",
                    horizontal && "flex-1",
                  )}
                  style={{
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderLeftWidth: horizontal && index > 0 ? StyleSheet.hairlineWidth : 0,
                  }}
                >
                  <AppText
                    numberOfLines={1}
                    className={cn(
                      "text-[17px]",
                      button === preferred && "font-t3-bold",
                      disabled
                        ? "text-foreground-tertiary"
                        : button.style === "destructive"
                          ? "text-danger-foreground"
                          : "text-foreground",
                    )}
                  >
                    {button.text}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}
