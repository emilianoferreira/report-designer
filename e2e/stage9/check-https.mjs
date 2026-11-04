import assert from 'node:assert/strict';
import https from 'node:https';
import tls from 'node:tls';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

function certificateRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { rejectUnauthorized: true, ...options }, response => {
      response.resume(); response.once('end', () => resolve(response.statusCode));
    });
    request.once('error', reject);
  });
}
function protocol(url, ca, version) {
  return new Promise((resolve, reject) => {
    const address = new URL(url);
    const socket = tls.connect({ host: address.hostname, port: Number(address.port), servername: 'localhost', ca,
      rejectUnauthorized: true, minVersion: version, maxVersion: version, ciphers: 'DEFAULT:@SECLEVEL=0' }, () => {
      const result = { protocol: socket.getProtocol(), authorized: socket.authorized };
      socket.end(); resolve(result);
    });
    socket.setTimeout(5000, () => socket.destroy(new Error('TLS probe timeout')));
    socket.once('error', reject);
  });
}
export async function checkHttps({ url, httpUrl, ca, fetcher, resultsDir }) {
  assert.equal(await certificateRequest(url + '/health/ready', { ca }), 200);
  await assert.rejects(certificateRequest(url + '/health/ready'), error =>
    ['UNABLE_TO_VERIFY_LEAF_SIGNATURE','SELF_SIGNED_CERT_IN_CHAIN','DEPTH_ZERO_SELF_SIGNED_CERT'].includes(error.code));
  await assert.rejects(certificateRequest(url + '/health/ready', { ca, servername: 'wrong.stage9.invalid' }),
    error => error.code === 'ERR_TLS_CERT_ALTNAME_INVALID');
  const versions = [];
  for (const version of ['TLSv1.2','TLSv1.3']) {
    const result = await protocol(url, ca, version);
    assert.equal(result.protocol,version); assert.equal(result.authorized,true); versions.push(result);
  }
  for (const version of ['TLSv1','TLSv1.1'])
    await assert.rejects(protocol(url,ca,version), error => /alert protocol version/i.test(error.message));
  const redirected = await fetcher(httpUrl + '/templates?stage9=redirect', {redirect:'manual'});
  assert.equal(redirected.status,308);
  assert.equal(redirected.headers.get('location'),url+'/templates?stage9=redirect');
  const blocked = await fetcher(httpUrl + '/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':'login'},body:'{}'});
  assert.equal(blocked.status,426); assert.equal(blocked.headers.get('set-cookie'),null);
  assert.deepEqual(await blocked.json(),{statusCode:426,message:'HTTPS required'});
  const response = await fetcher(url+'/api/templates');
  assert.equal(response.status,401); assert.match(response.headers.get('strict-transport-security'),/max-age=86400/);
  await writeFile(path.join(resultsDir,'https.json'),JSON.stringify({passed:true,trustedCertificate:true,
    untrustedCaRejected:true,wrongHostnameRejected:true,protocols:versions,obsoleteTlsRejected:true,
    redirect:308,httpApiRejected:426,hsts:true},null,2));
}
