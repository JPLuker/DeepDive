// Verify the *finished* APK against the configured key, not merely the
// presence of a Gradle signing block. Prints only public certificate data.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function checkApkCertificate(output, expected) {
  const certificates = [...output.matchAll(/^Signer #\d+ certificate SHA-256 digest:\s*([a-fA-F0-9:]+)\s*$/gm)]
    .map(match => match[1].replaceAll(':', '').toLowerCase());
  if (certificates.length !== 1 || certificates[0] !== expected.toLowerCase()) {
    throw new Error('APK certificate does not match the permanent Android signing key. Refusing to publish.');
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
  const fingerprint = createHash('sha256').update(cert).digest('hex');
  const output = execFileSync(join(root,version,'apksigner'), ['verify','--verbose','--print-certs',apk], { encoding:'utf8' });
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
