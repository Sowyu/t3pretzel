const { withMainActivity } = require("expo/config-plugins");

// A link (a notification tap, a deep link) can reach MainActivity.onNewIntent
// while React Native is still starting. ReactHost drops it then ("Tried to
// access onNewIntent while context is not ready"), and Linking.getInitialURL()
// still returns the launch intent, so the app opened Home. Keeping the newest
// intent as the activity's intent lets the navigator's getInitialURL() find it.
// Once React Native runs, the same link also arrives as a "url" event; the app
// queues those until navigation is ready (src/lib/appLinkQueue.ts).

const MARKER = "added by withAndroidLatestLinkIntent";

const ON_NEW_INTENT = `
  // Keeps the newest link for Linking.getInitialURL() when it arrives before
  // React Native is ready; ${MARKER}.
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
  }
`;

function patchMainActivity(contents) {
  if (contents.includes(MARKER)) return contents;
  if (/override fun onNewIntent\(/.test(contents)) {
    throw new Error(
      "withAndroidLatestLinkIntent: MainActivity already overrides onNewIntent; merge setIntent(intent) into it.",
    );
  }
  const declaration = "class MainActivity : ReactActivity() {";
  const index = contents.indexOf(declaration);
  if (index === -1) {
    throw new Error(
      "withAndroidLatestLinkIntent: could not find the MainActivity class declaration; update the plugin anchor.",
    );
  }
  const end = index + declaration.length;
  let patched = contents.slice(0, end) + ON_NEW_INTENT + contents.slice(end);
  if (!patched.includes("import android.content.Intent\n")) {
    patched = patched.replace(
      "import android.os.Bundle",
      "import android.content.Intent\nimport android.os.Bundle",
    );
  }
  return patched;
}

function withAndroidLatestLinkIntent(config) {
  return withMainActivity(config, (nextConfig) => {
    if (nextConfig.modResults.language !== "kt") {
      throw new Error("withAndroidLatestLinkIntent: MainActivity must be Kotlin.");
    }
    nextConfig.modResults.contents = patchMainActivity(nextConfig.modResults.contents);
    return nextConfig;
  });
}

withAndroidLatestLinkIntent.patchMainActivity = patchMainActivity;

module.exports = withAndroidLatestLinkIntent;
