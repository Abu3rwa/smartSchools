// Mirrors utils/slideImageUrl.js on the server. Lesson images are fetched by each
// student's own browser from a teacher-supplied URL, so the page refuses hosts that
// point at private or internal addresses instead of firing the request.
const BLOCKED_HOSTS = new Set(["localhost", "0.0.0.0"]);
const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".intranet", ".lan", ".home.arpa"];

const isPrivateIPv4 = (parts) => {
  const [a, b] = parts;
  if (parts.some((part) => !Number.isFinite(part) || part < 0 || part > 255)) return true;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  return a >= 224;
};

export const isBlockedMediaHost = (hostname) => {
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
  if (!host || BLOCKED_HOSTS.has(host)) return true;
  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  const bare = host.replace(/^\[|\]$/g, "");
  if (/^\d+$/.test(bare) || /^0[xo][0-9a-f]+$/i.test(bare)) return true;
  const dotted = bare.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (dotted) return isPrivateIPv4(dotted.slice(1).map(Number));
  if (bare.includes(":")) {
    const embedded = bare.match(/(\d{1,3}\.){3}\d{1,3}$/);
    if (embedded) return isPrivateIPv4(embedded[0].split(".").map(Number));
    return /^::1?$/.test(bare) || /^(fe80|fc|fd)/.test(bare);
  }
  return false;
};

/** Returns the URL to render, or "" when nothing should be fetched. */
export const renderableImageUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw || raw.length > 2048 || /\s/.test(raw)) return "";
  let url;
  try {
    url = new URL(raw);
  } catch {
    return "";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "";
  if (url.username || url.password) return "";
  if (isBlockedMediaHost(url.hostname)) return "";
  return url.toString();
};
