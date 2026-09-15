// The Icon Composer projects are the source of truth; the PNGs are their tracked iOS exports.
// apps/mobile/app.config.ts reads these for the app icon and splash, and
// scripts/export-android-icons.ts renders the Android launcher layers from the .icon sources.
export const BRAND_ASSET_PATHS = {
  developmentIconComposerProject: "assets/dev/app-icon.icon",
  developmentIosIconPng: "assets/dev/blueprint-ios-1024.png",

  nightlyIconComposerProject: "assets/nightly/app-icon.icon",
  nightlyIosIconPng: "assets/nightly/nightly-ios-1024.png",

  productionIconComposerProject: "assets/prod/app-icon.icon",
  productionIosIconPng: "assets/prod/black-ios-1024.png",
} as const;
