/**
 * What a released pan commits. null when the pan never activated: that touch
 * was a tap, and the Pressable's onPress already toggles it. A drag lands on
 * the nearer side; a cancelled drag springs back to the current value.
 */
export function panReleaseValue(release: {
  readonly activated: boolean;
  readonly success: boolean;
  readonly progress: number;
  readonly value: boolean;
}): boolean | null {
  if (!release.activated) return null;
  return release.success ? release.progress >= 0.5 : release.value;
}
