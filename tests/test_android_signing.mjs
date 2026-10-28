import { signingEnvironment, configureSigning, prepareSigning } from '../tools/android-signing.mjs';
import { checkApkCertificate, verifyApk } from '../tools/android-verify-signing.mjs';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync, statSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
let pass=0, fail=0;
function check(label, ok) { if(ok) pass++; else { fail++; console.log('FAIL:',label); } }
function rejects(label, run) { let error; try { run(); } catch(e) { error=e; } check(label, !!error); return error; }
const root = mkdtempSync(join(tmpdir(),'deepdive-signing-test-'));
try {
  const key = join(root,'test.jks');
  // Intentionally include characters that would break unescaped shell
  // or Java-properties interpolation. These are disposable test keys.
  const password = 'test $ ` " \\ = : \u00e9 password';
  const env = {...process.env, ANDROID_KEYSTORE_PASSWORD:password, ANDROID_KEY_PASSWORD:'different entry password', ANDROID_KEY_ALIAS:'deepdive-test', RUNNER_TEMP:root, GITHUB_ENV:join(root,'github-env')};
  execFileSync('keytool',['-genkeypair','-keystore',key,'-storetype','JKS','-storepass:env','ANDROID_KEYSTORE_PASSWORD','-keypass:env','ANDROID_KEY_PASSWORD','-alias',env.ANDROID_KEY_ALIAS,'-keyalg','RSA','-keysize','2048','-validity','2','-dname','CN=Disposable Signing Test'], {env,stdio:['ignore','pipe','pipe']});
  env.ANDROID_KEYSTORE_BASE64=readFileSync(key).toString('base64');
  check('keystore decodes exactly', signingEnvironment(env).equals(readFileSync(key)));
  const missing=rejects('missing secrets fail closed',()=>signingEnvironment({}));
  check('missing secret message identifies only names',missing.message.includes('ANDROID_KEYSTORE_PASSWORD')&&!missing.message.includes(password));
  rejects('truncated Base64 rejected',()=>signingEnvironment({...env,ANDROID_KEYSTORE_BASE64:env.ANDROID_KEYSTORE_BASE64.slice(1)}));
  rejects('garbage Base64 rejected',()=>signingEnvironment({...env,ANDROID_KEYSTORE_BASE64:'!!!!'}));
  const template='import java.util.Properties\nandroid {\n    buildTypes {\n        getByName("debug") { isDebuggable = true }\n        getByName("release") { isMinifyEnabled = true }\n    }\n}\n';
  const gradle=join(root,'build.gradle.kts');writeFileSync(gradle,template);
  const path=prepareSigning(gradle,env);
  const configured=readFileSync(gradle,'utf8');
  check('private keystore file matches original',readFileSync(path).equals(readFileSync(key)));
  check('keystore readable only by runner user',(statSync(path).mode&0o777)===0o600);
  check('only key path exported to next build step',readFileSync(env.GITHUB_ENV,'utf8')===`ANDROID_KEYSTORE_PATH=${path}\n`);
  check('passwords stay out of Gradle/config files',!configured.includes(password)&&!configured.includes(env.ANDROID_KEY_PASSWORD));
  check('separate entry and store passwords are supported',configured.includes('System.getenv("ANDROID_KEY_PASSWORD")')&&configured.includes('System.getenv("ANDROID_KEYSTORE_PASSWORD")'));
  check('release uses permanent signing config',/getByName\("release"\) \{\s*signingConfig = signingConfigs.getByName\("deepdiveRelease"\)/.test(configured));
  check('R8 retains native JS interface',readFileSync(join(root,'deepdive-signing.pro'),'utf8').includes('@android.webkit.JavascriptInterface'));
  check('Gradle patch is idempotent',configureSigning(configured)===configured);
  rejects('changed Gradle template fails instead of guessing',()=>configureSigning('android {}'));
  const before=readdirSync(root).length;
  const bad=rejects('wrong keystore password fails during preparation',()=>prepareSigning(gradle,{...env,ANDROID_KEYSTORE_PASSWORD:'incorrect-password'}));
  check('failed preparation removes its temporary key',readdirSync(root).length===before);
  check('wrong-password diagnosis is specific', bad.message.includes('ANDROID_KEYSTORE_PASSWORD does not unlock'));
  check('failure messages do not print supplied credentials',!bad.message.includes('incorrect-password')&&!bad.message.includes(env.ANDROID_KEYSTORE_BASE64));
  const aliasError=rejects('wrong alias fails during preparation',()=>prepareSigning(gradle,{...env,ANDROID_KEY_ALIAS:'missing-alias'}));
  check('wrong-alias diagnosis is specific',aliasError.message.includes('ANDROID_KEY_ALIAS is not present'));
  const cert=execFileSync('keytool',['-exportcert','-keystore',key,'-storepass:env','ANDROID_KEYSTORE_PASSWORD','-alias',env.ANDROID_KEY_ALIAS],{env,stdio:['ignore','pipe','pipe']});
  const fingerprint=createHash('sha256').update(cert).digest('hex');
  const signer=`Signer #1 certificate SHA-256 digest: ${fingerprint}\n`;
  checkApkCertificate(signer,fingerprint);check('expected signer accepted',true);
  rejects('another signer is rejected',()=>checkApkCertificate('Signer #1 certificate SHA-256 digest: aabb\n',fingerprint));
  rejects('unsigned APK is rejected',()=>checkApkCertificate('',fingerprint));
  rejects('additional signers are rejected',()=>checkApkCertificate(signer+signer.replace('#1','#2'),fingerprint));
  // Execute the verifier with the real disposable certificate and fake
  // SDK tools. CI supplies real apksigner/aapt and the compiled APK.
  const sdk=join(root,'sdk','build-tools','36.0.0');mkdirSync(sdk,{recursive:true});
  writeFileSync(join(sdk,'apksigner'),'#!/usr/bin/env node\nprocess.stdout.write('+JSON.stringify(signer)+');\n',{mode:0o755});
  const metadata="package: name='io.github.jpluker.deepdive' versionCode='2009138' versionName='2.9.138'\n";
  const aapt=join(sdk,'aapt');
  writeFileSync(aapt,'#!/usr/bin/env node\nprocess.stdout.write('+JSON.stringify(metadata)+');\n',{mode:0o755});
  const verifyEnv={...env,ANDROID_KEYSTORE_PATH:path,ANDROID_HOME:join(root,'sdk'),BUILD_VERSION:'2.9.138'};
  check('finished APK verifier checks the real configured certificate',verifyApk('test.apk',verifyEnv).fingerprint===fingerprint);
  rejects('incorrect APK version is rejected',()=>verifyApk('test.apk',{...verifyEnv,BUILD_VERSION:'2.9.139'}));
  writeFileSync(aapt,'#!/usr/bin/env node\nprocess.stdout.write('+JSON.stringify(metadata+'application-debuggable\n')+');\n',{mode:0o755});
  rejects('debuggable APK is rejected',()=>verifyApk('test.apk',verifyEnv));
  const wf=readFileSync(new URL('../.github/workflows/native.yml',import.meta.url),'utf8');
  check('CI builds a release APK without debug fallback',/cargo tauri android build --apk\s*\n/.test(wf)&&!/cargo tauri android build --apk --debug/.test(wf));
  check('CI configures signing before compilation',wf.indexOf('node tools/android-signing.mjs \\') >= 0 && wf.indexOf('node tools/android-signing.mjs \\')<wf.indexOf('cargo tauri android build --apk'));
  check('CI verifies certificate before publishing',wf.indexOf('node tools/android-verify-signing.mjs')<wf.indexOf('bash tools/publish-android.sh'));
  check('verification step is present',wf.includes('node tools/android-verify-signing.mjs'));
  check('CI cleans up key even after failure',/name: Remove the temporary signing keystore\s*\n\s*if: always\(\)/.test(wf));
  const ignore=readFileSync(new URL('../.gitignore',import.meta.url),'utf8');
  check('signing material is excluded from commits',ignore.includes('*.jks')&&ignore.includes('*.keystore')&&ignore.includes('keystore.properties'));
} finally {rmSync(root,{recursive:true,force:true});}
console.log(`\n${pass} passed, ${fail} failed`);process.exit(fail?1:0);
