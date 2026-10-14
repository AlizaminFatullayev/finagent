import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { BlockList, isIP } from 'node:net';
import { promisify } from 'node:util';
import { ValidationError } from './errors.js';

// Destinations a webhook must never reach: loopback, private LANs, link-local (cloud metadata
// at 169.254.169.254), CGNAT, multicast and reserved ranges.
const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(net, prefix, 'ipv6');
}

export function isPrivateAddress(ip: string): boolean {
  // IPv4-mapped IPv6 (::ffff:10.0.0.1) must be judged by its IPv4 part.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)?.[1];
  if (mapped) return blocked.check(mapped, 'ipv4');
  const family = isIP(ip);
  if (family === 0) return true;
  return blocked.check(ip, family === 4 ? 'ipv4' : 'ipv6');
}

const lookupAll = promisify(dnsLookup);

/** Rejects URLs that are not plain https (http only when allowed) or that resolve to private addresses. */
export async function assertSafeUrl(raw: string, options: { allowHttp: boolean }) {
  const invalid = (message: string) => new ValidationError([{ location: 'body', path: 'url', message }]);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw invalid('Must be a valid URL');
  }
  if (url.protocol !== 'https:' && !(options.allowHttp && url.protocol === 'http:'))
    throw invalid('Must use https');
  if (url.username || url.password) throw invalid('Must not contain credentials');

  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host)
    ? [host]
    : ((await lookupAll(host, { all: true }).catch(() => [])) as LookupAddress[]).map((a) => a.address);
  if (addresses.length === 0) throw invalid('Host does not resolve');
  if (addresses.some(isPrivateAddress))
    throw invalid('Must not point to a private, loopback or link-local address');
  return url;
}

/**
 * DNS lookup for outgoing requests that refuses private addresses at connect time. Checking only
 * when the webhook is saved is not enough: DNS can change afterwards (DNS rebinding).
 */
export const safeLookup: typeof dnsLookup = ((
  hostname: string,
  options: object,
  callback: (...args: unknown[]) => void,
) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = addresses as LookupAddress[];
    const bad = list.find((a) => isPrivateAddress(a.address));
    if (bad) return callback(new Error(`Refusing to connect to private address ${bad.address}`));
    const wantsAll = (options as { all?: boolean }).all;
    if (wantsAll) return callback(null, list);
    callback(null, list[0]!.address, list[0]!.family);
  });
}) as typeof dnsLookup;
