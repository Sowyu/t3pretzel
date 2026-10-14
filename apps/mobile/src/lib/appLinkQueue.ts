type LinkListener = (url: string) => void;

/**
 * Holds app links (notification taps, deep links) until the navigator can take
 * them. React Navigation drops a link that arrives before it subscribes or
 * while it has no navigator, which is the first seconds of a cold start.
 */
export function createAppLinkQueue() {
  const pending: string[] = [];
  let listener: LinkListener | null = null;
  let ready = false;
  const flush = () => {
    if (!ready || listener === null) return;
    for (const url of pending.splice(0)) listener(url);
  };
  return {
    push: (url: string) => {
      pending.push(url);
      flush();
    },
    subscribe: (next: LinkListener) => {
      listener = next;
      flush();
      return () => {
        if (listener === next) listener = null;
      };
    },
    /** Call from the navigation container's onReady. */
    markReady: () => {
      ready = true;
      flush();
    },
  };
}

/**
 * React Navigation gives the launch URL 150 ms and then opens Home, and a busy
 * cold start often needs longer. This waits for the URL, with a deadline only
 * so a native call that never answers cannot keep the app blank.
 */
export function readInitialAppLink(
  getInitialURL: () => Promise<string | null>,
  timeoutMs = 3_000,
): Promise<string | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    getInitialURL().then(
      (url) => {
        clearTimeout(timer);
        resolve(url);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}
