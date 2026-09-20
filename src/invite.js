// Prefer the address already used to reach the app. A localhost URL cannot be
// scanned by another phone; discovered addresses must be ordinary LAN IPv4s.
export function inviteAddresses(origin, discovered = []) {
  const current = new URL(origin);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(current.hostname) && !current.hostname.endsWith(".localhost")) {
    return [`${current.origin}/`];
  }
  return [...new Set(discovered.flatMap(value => {
    try {
      const url = new URL(value);
      const octets = url.hostname.split(".").map(Number);
      const privateIp = octets.length === 4 && octets.every(n => Number.isInteger(n) && n >= 0 && n <= 255) &&
        (octets[0] === 10 || (octets[0] === 192 && octets[1] === 168) ||
          (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31));
      return privateIp && ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? [`${url.origin}/`] : [];
    } catch { return []; }
  }))];
}
