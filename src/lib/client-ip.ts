const PUBLIC_IP_TTL_MS = 30 * 60_000;
const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;
const PUBLIC_IP_URLS = ["https://ipv4.icanhazip.com", "https://api.ipify.org", "https://4.ipw.cn"];

let cachedPublicIp: { ip: string; at: number } | undefined;

export function publicClientIp(headers: Headers): string | undefined {
  const raw =
    headers.get("cf-connecting-ip")?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = normalizeIp(raw);
  if (!ip || !isPublicIpv4(ip)) return undefined;
  return ip;
}

export function allowServerIpFallback(headers: Headers): boolean {
  const hinted =
    headers.get("cf-connecting-ip")?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!hinted) return true;
  const ip = normalizeIp(hinted);
  if (!ip) return true;
  if (isPublicIpv4(ip)) return false;
  return isLoopbackOrPrivate(ip);
}

export async function publicIpv4(): Promise<string | undefined> {
  if (cachedPublicIp && Date.now() - cachedPublicIp.at < PUBLIC_IP_TTL_MS) return cachedPublicIp.ip;
  for (const source of PUBLIC_IP_URLS) {
    try {
      const response = await fetch(source, { cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (!response.ok) continue;
      const ip = (await response.text()).trim().match(/(\d{1,3}(?:\.\d{1,3}){3})/)?.[1];
      if (!ip || !isPublicIpv4(ip)) continue;
      cachedPublicIp = { ip, at: Date.now() };
      return ip;
    } catch {
      continue;
    }
  }
  return undefined;
}

function normalizeIp(raw?: string): string | undefined {
  if (!raw) return undefined;
  const mapped = raw.match(/::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped) return mapped[1];
  return raw.replace(/^\[|\]$/g, "");
}

export function isPublicIpv4(ip: string): boolean {
  if (!IPV4.test(ip)) return false;
  const parts = ip.split(".").map(Number);
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return false;
  if (a === 192 && b === 168) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  return true;
}

function isLoopbackOrPrivate(ip: string): boolean {
  if (ip === "::1" || ip === "localhost") return true;
  if (ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) return true;
  if (!IPV4.test(ip)) return false;
  return !isPublicIpv4(ip);
}
