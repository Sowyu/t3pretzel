import { readHostedPairingRequest } from "@t3tools/shared/remote";
import * as Schema from "effect/Schema";

const MOBILE_PAIRING_URL_PARAM = "pairingUrl";

/**
 * True for hosts that live on the user's own network: loopback, any IP
 * literal (private, link-local, Tailscale's 100.64/10, and the rare public IP
 * that also has no certificate), `localhost`, and mDNS `*.local` names.
 */
export function isLocalNetworkHost(host: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(`http://${host}`).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  } catch {
    return false;
  }
  if (hostname.includes(":")) return true;
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;
  if (hostname.endsWith(".local")) return true;
  const octets = hostname.split(".");
  return (
    octets.length === 4 && octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255)
  );
}

/**
 * Shared parsing turns a bare host into https://, and a server on the local
 * network almost never has a certificate, so those hosts get http:// here.
 */
export function withDefaultScheme(host: string): string {
  const trimmed = host.trim().replace(/^\/+/, "");
  if (trimmed === "" || /^[a-zA-Z][a-zA-Z\d+-]*:\/\//.test(trimmed)) return trimmed;
  return `${isLocalNetworkHost(trimmed) ? "http" : "https"}://${trimmed}`;
}

export class PairingQrPayloadEmptyError extends Schema.TaggedError<PairingQrPayloadEmptyError>()(
  "PairingQrPayloadEmptyError",
  {},
) {
  override get message(): string {
    return "Scanned QR code did not contain a pairing URL.";
  }
}

export function buildPairingUrl(host: string, code: string): string {
  const h = withDefaultScheme(host);
  const c = code.trim();
  if (!h) return "";
  if (!c) return h;

  try {
    const url = new URL(h);
    url.hash = new URLSearchParams([["token", c]]).toString();
    return url.toString();
  } catch {
    return `${h}#token=${c}`;
  }
}

export function parsePairingUrl(url: string): { host: string; code: string } {
  const trimmed = url.trim();
  if (!trimmed) return { host: "", code: "" };

  try {
    const parsed = new URL(trimmed);
    const hostedPairingRequest = readHostedPairingRequest(parsed);
    if (hostedPairingRequest) {
      return {
        host: hostedPairingRequest.host.replace(/\/$/, ""),
        code: hostedPairingRequest.token,
      };
    }

    const hashParams = new URLSearchParams(parsed.hash.slice(1));
    const hashToken = hashParams.get("token");
    const queryToken = parsed.searchParams.get("token");
    const code = hashToken || queryToken || "";

    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = "/";
    return { host: parsed.toString().replace(/\/$/, ""), code };
  } catch {
    return { host: trimmed, code: "" };
  }
}

export function extractPairingUrlFromQrPayload(payload: string): string {
  const trimmed = payload.trim();
  if (!trimmed) {
    throw new PairingQrPayloadEmptyError({});
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol === "t3code:") {
      const pairingUrl = url.searchParams.get(MOBILE_PAIRING_URL_PARAM)?.trim() ?? "";
      if (pairingUrl.length > 0) {
        return pairingUrl;
      }
    }
  } catch {
    // Treat non-URL payloads as raw pairing-url text so the normal input validation can decide.
  }

  return trimmed;
}

/**
 * A pairing that never reached the server says so in one sentence. The raw
 * transport error ("HttpClientError: Transport error (GET ...)") goes to the
 * log instead of the banner.
 */
export function describePairingFailure(error: unknown, pairingUrl: string): string | null {
  if (
    typeof error !== "object" ||
    error === null ||
    !("_tag" in error) ||
    error._tag !== "ConnectionTransientError" ||
    !("reason" in error) ||
    (error.reason !== "network" && error.reason !== "timeout")
  ) {
    return null;
  }
  let host = pairingUrl.trim();
  try {
    host = new URL(pairingUrl).host || host;
  } catch {
    // Keep what the user typed.
  }
  return `Couldn't reach ${host}. Check the address and that the server is running.`;
}
