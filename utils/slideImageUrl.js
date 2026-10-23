/**
 * Slide image URLs are fetched by every student's browser, straight from the
 * page, with no same-origin policy in the way. A teacher-supplied URL can
 * therefore aim a whole class at an internal service or act as a tracking
 * beacon. Public hosts keep working; loopback, private, link-local, carrier-grade
 * NAT and encoded-literal targets are refused.
 */

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".intranet", ".lan", ".home.arpa"];
const BLOCKED_EXACT_HOSTS = new Set(["localhost", "0.0.0.0"]);

const ipv4Parts = (hostname) => {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  return parts.every((part) => part <= 255) ? parts : null;
};

const inBlock = (parts, base, prefixBits) => {
  const toInt = (a, b, c, d) => ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
  const [a, b, c, d] = parts;
  const mask = prefixBits === 0 ? 0 : (0xffffffff << (32 - prefixBits)) >>> 0;
  return (toInt(a, b, c, d) & mask) === (toInt(...base) & mask);
};

const PRIVATE_V4_BLOCKS = [
  [[0, 0, 0, 0], 8],        // this-network
  [[10, 0, 0, 0], 8],       // private
  [[100, 64, 0, 0], 10],    // carrier-grade NAT
  [[127, 0, 0, 0], 8],      // loopback
  [[169, 254, 0, 0], 16],   // link-local, includes cloud metadata (169.254.169.254)
  [[172, 16, 0, 0], 12],    // private
  [[192, 0, 0, 0], 24],     // IETF protocol assignments
  [[192, 0, 2, 0], 24],     // TEST-NET-1
  [[192, 168, 0, 0], 16],   // private
  [[198, 18, 0, 0], 15],    // benchmarking
  [[198, 51, 100, 0], 24],  // TEST-NET-2
  [[203, 0, 113, 0], 24],   // TEST-NET-3
  [[224, 0, 0, 0], 4],      // multicast
  [[240, 0, 0, 0], 4],      // reserved
];

const isBlockedIpv6 = (hostname) => {
  const compressed = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!compressed.includes(":")) return false;
  if (/^::ffff:(\d{1,3}\.){3}\d{1,3}$/.test(compressed)) return isBlockedImageHost(compressed.replace(/^::ffff:/, ""));
  if (/^::1?$/.test(compressed)) return true;
  return /^(fe80|fc|fd)/.test(compressed);
};

export const isBlockedImageHost = (hostname) => {
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (BLOCKED_EXACT_HOSTS.has(host)) return true;
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  if (isBlockedIpv6(host)) return true;
  const parts = ipv4Parts(host);
  if (parts) return PRIVATE_V4_BLOCKS.some(([base, bits]) => inBlock(parts, base, bits));
  // Decimal, octal or hex encoded hosts (http://2130706433) resolve to literals in browsers.
  if (/^\d+$/.test(host) || /^0[xo][0-9a-f]+$/.test(host)) return true;
  return false;
};

/** Returns an error message, or "" when the URL is safe to render. */
export const slideImageUrlError = (value, { requireHttps = false } = {}) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.length > 2048) return "Image URL must be 2,048 characters or fewer.";
  if (/\s/.test(raw)) return "Image URL must not contain spaces.";
  let url;
  try {
    url = new URL(raw);
  } catch {
    return "Image URL must start with http:// or https://.";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "Image URL must start with http:// or https://.";
  }
  if (requireHttps && url.protocol === "http:") return "Image URL must use https://.";
  if (url.username || url.password) return "Image URL must not include credentials.";
  if (isBlockedImageHost(url.hostname)) return "Image URLs must point at a public host.";
  return "";
};
