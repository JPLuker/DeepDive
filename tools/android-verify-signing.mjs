// Verify the *finished* APK against the configured key, not merely the
// presence of a Gradle signing block. Prints only public certificate data.
import { execFileSync, spawnSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function apkSigners(output) {
  const pem = output.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) || [];
  if (pem.length) return pem.map((certificate, index) => ({
    label: `PEM certificate ${index + 1}`,
    fingerprint: new X509Certificate(certificate).fingerprint256.replaceAll(':', '').toLowerCase(),
  }));
  // apksigner v3.1 uses SDK-range labels instead of numbered signers.
  // Each range must resolve to this same permanent certificate.
  return [...output.matchAll(/^(Signer (?:#\d+|\([^\r\n]+\))) certificate SHA-256 digest:[ \t]*([a-fA-F0-9:]+)[ \t]*\r?$/gm)]
    .map(match => ({ label: match[1], fingerprint: match[2].replaceAll(':', '').toLowerCase() }));
}
export function checkApkCertificate(output, expected) {
  const rows = apkSigners(output);
  const declared = output.match(/^Number of signers:[ \t]*(\d+)[ \t]*\r?$/m);
  const numbered = rows.filter(row => /^Signer #/.test(row.label));
  if (!rows.length || (declared && Number(declared[1]) !== 1)
      || (numbered.length && rows.length !== 1)
      || rows.some(row => row.fingerprint !== expected.toLowerCase())) {
    throw new Error('APK certificate does not match the permanent Android signing key. Refusing to publish. Expected SHA-256: '
      + expected + '; found: ' + (rows.map(row => row.fingerprint).join(', ') || 'no recognized signer certificate'));
  }
}
export function verifyApk(apk, env = process.env) {
  if (!env.ANDROID_KEYSTORE_PATH || !env.ANDROID_KEYSTORE_PASSWORD || !env.ANDROID_KEY_ALIAS) {
    throw new Error('Android signing environment is missing');
  }
  const root = join(env.ANDROID_HOME || env.ANDROID_SDK_ROOT || '', 'build-tools');
  const versions = readdirSync(root).sort((a,b) => b.localeCompare(a, undefined, { numeric: true }));
  const version = versions.find(v => existsSync(join(root,v,'apksigner')));
  if (!version) throw new Error('Android SDK apksigner is unavailable');
  let cert;
  try {
    cert = execFileSync('keytool', ['-exportcert', '-keystore', env.ANDROID_KEYSTORE_PATH,
      '-storepass:env', 'ANDROID_KEYSTORE_PASSWORD', '-alias', env.ANDROID_KEY_ALIAS],
      { env, stdio: ['ignore','pipe','pipe'] });
  } catch { throw new Error('Cannot read the configured Android signing certificate'); }
  const fingerprint = new X509Certificate(cert).fingerprint256.replaceAll(':', '').toLowerCase();
  const result = spawnSync(join(root,version,'apksigner'),
    ['verify','--verbose','--print-certs','--print-certs-pem',apk], { encoding:'utf8' });
  const output = (result.stdout || '') + '\n' + (result.stderr || '');
  if (result.error || result.status !== 0) throw new Error('apksigner verification failed: ' + output);
  if (!output.includes('-----BEGIN CERTIFICATE-----')) {
    // Verification mode exposes only public APK/certificate data. Keep
    // this output so a future SDK format change is immediately visible.
    throw new Error('apksigner did not return a PEM certificate: ' + output);
  }
  console.log(JSON.stringify({ expectedFingerprint: fingerprint, apkSigners: apkSigners(output) }));
  checkApkCertificate(output, fingerprint);
  const metadata = execFileSync(join(root,version,'aapt'), ['dump','badging',apk], { encoding:'utf8' });
  const match = metadata.match(/^package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/m);
  if (!match || match[1] !== 'io.github.jpluker.deepdive' || match[3] !== env.BUILD_VERSION || Number(match[2]) <= 0) {
    throw new Error('APK package/version does not match this DeepDive release');
  }
  if (/^application-debuggable/m.test(metadata)) throw new Error('Refusing to publish a debuggable release APK');
  return { fingerprint, versionCode: match[2], versionName: match[3] };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(verifyApk(process.argv[2]))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
