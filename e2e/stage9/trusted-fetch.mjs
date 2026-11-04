import http from 'node:http';
import https from 'node:https';

// Small test transport with explicit CA trust. Never change global TLS verification.
export function createTrustedFetch(ca) {
  return async (input, options = {}) => {
    const url = new URL(input);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported test protocol');
    const response = await new Promise((resolve, reject) => {
      const request = (url.protocol === 'https:' ? https : http).request(url, {
        method: options.method || 'GET', headers: options.headers, signal: options.signal,
        ...(url.protocol === 'https:' ? { ca, rejectUnauthorized: true } : {}),
      }, incoming => {
        const chunks = [];
        incoming.on('data', chunk => chunks.push(chunk));
        incoming.on('error', reject);
        incoming.on('end', () => {
          const headers = new Headers();
          for (const [name, value] of Object.entries(incoming.headers))
            for (const entry of Array.isArray(value) ? value : [value]) if (entry !== undefined) headers.append(name, entry);
          resolve(new Response(incoming.statusCode === 204 || options.method === 'HEAD' ? null : Buffer.concat(chunks), {
            status: incoming.statusCode, headers,
          }));
        });
      });
      request.on('error', reject);
      request.end(options.body);
    });
    // Redirect checks use manual mode. Other calls must never silently replay a write.
    if (response.status >= 300 && response.status < 400 && options.redirect !== 'manual')
      throw new Error('Unexpected redirect in isolated API transport');
    return response;
  };
}
