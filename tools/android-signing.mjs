// Configure the generated Android project without putting passwords in
// source, properties files, command arguments or console output.
import { readFileSync, writeFileSync, mkdtempSync, appendFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function signingEnvironment(env) {
  const names = ['ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD'];
  const missing = names.filter(name => !env[name]);
  if (missing.length) throw new Error('Missing Android signing secrets: ' + missing.join(', '));
  const encoded = env.ANDROID_KEYSTORE_BASE64.replace(/\s/g, '');
  if (!encoded || encoded.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
      || Buffer.from(encoded, 'base64').toString('base64') !== encoded) {
    throw new Error('ANDROID_KEYSTORE_BASE64 is not valid Base64. Copy the entire encoded keystore.');
  }
  return Buffer.from(encoded, 'base64');
}

export function configureSigning(gradle) {
  if (gradle.includes('// DeepDive permanent signing')) return gradle;
  if (!/^import java\.util\.Properties/m.test(gradle)) throw new Error('Unexpected Android Gradle template: Properties import missing');
  if ((gradle.match(/\bbuildTypes\s*\{/g) || []).length !== 1
      || (gradle.match(/getByName\("release"\)\s*\{/g) || []).length !== 1) {
    throw new Error('Unexpected Android Gradle template: one buildTypes and release block required');
  }
  return gradle.replace(/(\s*)buildTypes\s*\{/, `$1// DeepDive permanent signing: values come only from CI environment.
    signingConfigs {
        create("deepdiveRelease") {
            storeFile = file(requireNotNull(System.getenv("ANDROID_KEYSTORE_PATH")) { "Missing Android signing keystore" })
            storePassword = requireNotNull(System.getenv("ANDROID_KEYSTORE_PASSWORD")) { "Missing Android keystore password" }
            keyAlias = requireNotNull(System.getenv("ANDROID_KEY_ALIAS")) { "Missing Android signing alias" }
            keyPassword = requireNotNull(System.getenv("ANDROID_KEY_PASSWORD")) { "Missing Android key password" }
        }
    }

    buildTypes {`).replace('getByName("release") {', `getByName("release") {
            signingConfig = signingConfigs.getByName("deepdiveRelease")
            // Keep the background-work JS bridge callable after R8.
            proguardFiles(file("deepdive-signing.pro"))`);
}

export function validateKeystore(key, env) {
  try {
    execFileSync('keytool', ['-list', '-keystore', key, '-storepass:env', 'ANDROID_KEYSTORE_PASSWORD', '-alias', env.ANDROID_KEY_ALIAS],
      { env, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    // Inspect tool output privately, then emit a fixed diagnosis only.
    // Never print raw keytool output, the alias, or supplied credentials.
    const detail = String(error.stdout || '') + String(error.stderr || '');
    if (/password was incorrect|password verification failed|password is incorrect/i.test(detail)) {
      throw new Error('ANDROID_KEYSTORE_PASSWORD does not unlock the uploaded keystore. Update that GitHub secret with the original keystore password.');
    }
    if (/alias .* does not exist|alias .* not found/i.test(detail)) {
      throw new Error('ANDROID_KEY_ALIAS is not present in the uploaded keystore. Check that secret against the alias used when generating the key.');
    }
    if (/invalid keystore format|unrecognized keystore format|keystore file does not exist|keystore was tampered/i.test(detail)) {
      throw new Error('The uploaded keystore cannot be read. Re-encode the original JKS and replace ANDROID_KEYSTORE_BASE64.');
    }
    throw new Error('keytool could not validate the Android keystore. Check the same file, password and alias locally.');
  }
}

export function checkSigningKey(env = process.env) {
  const bytes = signingEnvironment(env);
  const dir = mkdtempSync(join(env.RUNNER_TEMP || tmpdir(), 'deepdive-signing-check-'));
  try {
    const key = join(dir, 'release.jks');
    writeFileSync(key, bytes, { mode: 0o600 });
    validateKeystore(key, env);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

export function prepareSigning(gradlePath, env = process.env) {
  const bytes = signingEnvironment(env);
  const original = readFileSync(gradlePath, 'utf8');
  const configured = configureSigning(original);
  if (!env.GITHUB_ENV) throw new Error('GITHUB_ENV is required for the signing keystore path');
  const dir = mkdtempSync(join(env.RUNNER_TEMP || tmpdir(), 'deepdive-signing-'));
  const key = join(dir, 'release.jks');
  try {
    writeFileSync(key, bytes, { mode: 0o600 });
    // keytool validates both the password and alias, without printing
    // keystore contents or passing a password on its command line.
    validateKeystore(key, env);
    writeFileSync(gradlePath, configured);
    writeFileSync(join(resolve(gradlePath, '..'), 'deepdive-signing.pro'),
      '-keepclassmembers class * { @android.webkit.JavascriptInterface <methods>; }\n');
    appendFileSync(env.GITHUB_ENV, `ANDROID_KEYSTORE_PATH=${key}\n`);
    return key;
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === '--check') checkSigningKey(process.env);
    else prepareSigning(process.argv[2]);
    console.log('Android signing credentials validated' + (process.argv[2] === '--check' ? '' : '; release signing configured'));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
