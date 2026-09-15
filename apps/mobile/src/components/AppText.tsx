import {
  Text as RNText,
  TextInput as RNTextInput,
  type TextInputProps as RNTextInputProps,
  type TextProps as RNTextProps,
} from "react-native";

import { cn } from "../lib/cn";

export type AppTextProps = RNTextProps & { readonly className?: string };

/**
 * Thin wrapper around RN Text with default font-family and foreground color.
 * Uses Uniwind className — no manual style parsing.
 */
export function AppText({ className, ...props }: AppTextProps) {
  return <RNText className={cn("font-sans text-foreground", className)} {...props} />;
}

/**
 * Strips the input's own pill so it can sit inside a container that already
 * draws the field: search rows, composer sheets. Without it the input paints a
 * second border, background and inset inside the outer one. Pass it first, then
 * the layout classes the call site needs: `cn(EMBEDDED_TEXT_INPUT, "flex-1")`.
 */
export const EMBEDDED_TEXT_INPUT = "min-h-0 rounded-none border-0 bg-transparent px-0 py-0";

export type AppTextInputProps = Omit<RNTextInputProps, "placeholderTextColor"> & {
  readonly className?: string;
  readonly ref?: React.Ref<RNTextInput>;
};

/**
 * Thin wrapper around RN TextInput with default input styling.
 * Uses Uniwind className — no manual style parsing.
 */
export function AppTextInput({ className, ref, ...props }: AppTextInputProps) {
  return (
    <RNTextInput
      ref={ref}
      className={cn(
        "min-h-13.5 rounded-2xl border border-input-border bg-input px-3.5 py-3 font-sans text-base text-foreground",
        className,
      )}
      placeholderTextColorClassName="accent-placeholder"
      selectionColorClassName="accent-foreground-secondary"
      cursorColorClassName="accent-foreground-secondary"
      {...props}
    />
  );
}
