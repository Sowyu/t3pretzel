# Brand icons

The three Icon Composer projects are the source of truth for the app icon:

- `dev/app-icon.icon`
- `nightly/app-icon.icon`
- `prod/app-icon.icon`

Each project uses `text.svg` for the T3 mark and `background.svg` when the background is a vector layer. The `*-ios-1024.png` files beside them are the tracked Icon Composer exports that `apps/mobile/app.config.ts` uses for the iOS icon and splash. Do not edit the PNGs directly; regenerate them from Icon Composer.

## Android launcher and splash artwork

Android masks the central 72dp of a 108dp adaptive canvas, and the Android 12+ splash screen masks
the central two thirds of a 288dp canvas, so the Icon Composer exports cannot be used directly:
their rounded-square silhouette gets framed again and the wordmark is cropped. The Android artwork
is instead rendered from the same Icon Composer SVG sources by `vp run icons:export:android`:

- `apps/mobile/assets/android-icon-foreground.png`: the shared transparent wordmark, sized to stay
  inside the safe zone
- `apps/mobile/assets/android-icon-background-dev.png` and `-nightly.png`: full-bleed variant
  artwork (blueprint grid and annotations; night sky and clouds). Production uses a solid color.
- `apps/mobile/assets/android-splash-icon-*.png`: the two layers composed into one 288dp image, so
  the splash mask reproduces the launcher icon's framing.

Rerun the export after changing a layer SVG. `android-icon-mark.png` remains a flat silhouette for
Android's monochrome themed icon.
