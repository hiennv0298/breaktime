// scripts/lib/dnsCheck.mjs — DNS preflight before site activation (RESEARCH Pattern 12, T-01-07-03).
// Let's Encrypt locks an identifier out after repeated failed authorizations, so the new host must
// resolve to the VPS on independent public resolvers before Caddy is asked to issue a certificate.
import { promises as dnsPromises } from 'node:dns';

const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;

/**
 * Pure: true only when there is at least one resolver and every resolver returned a non-empty
 * address list whose entries are all the expected IP. An error string or any other A record fails.
 * @param {Record<string, string[] | string>} results
 * @param {string} expectedIp
 * @returns {boolean}
 */
export function evaluateDnsResults(results, expectedIp) {
  if (typeof expectedIp !== 'string' || !IPV4_RE.test(expectedIp)) return false;
  if (!results || typeof results !== 'object') return false;
  const entries = Object.entries(results);
  if (entries.length === 0) return false;
  return entries.every(
    ([, addrs]) => Array.isArray(addrs) && addrs.length > 0 && addrs.every((a) => a === expectedIp),
  );
}

/**
 * Resolve an A record on each server separately.
 * @param {string} host
 * @param {string} expectedIp
 * @param {string[]} [servers]
 * @returns {Promise<{ ok: boolean, results: Record<string, string[] | string> }>}
 */
export async function checkDns(host, expectedIp, servers = ['1.1.1.1', '8.8.8.8']) {
  /** @type {Record<string, string[] | string>} */
  const results = {};
  await Promise.all(
    servers.map(async (server) => {
      const resolver = new dnsPromises.Resolver({ timeout: 5000, tries: 2 });
      resolver.setServers([server]);
      try {
        results[server] = await resolver.resolve4(host);
      } catch (e) {
        results[server] = String(e?.code ?? e?.message ?? e);
      }
    }),
  );
  return { ok: evaluateDnsResults(results, expectedIp), results };
}
