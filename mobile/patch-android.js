// Adds EasyCut's in-app updater to the Android project that `npx cap add android` generates:
// the native plugin, its file provider and the "install apps" permission. Run from mobile/ after `cap add android`.
const fs = require('fs');
const path = require('path');

const here = __dirname;
const main = path.join(here, 'android', 'app', 'src', 'main');
const javaDir = path.join(main, 'java', 'com', 'amitoj', 'easycut');
fs.mkdirSync(javaDir, { recursive: true });
for (const f of fs.readdirSync(path.join(here, 'native', 'java'))) fs.copyFileSync(path.join(here, 'native', 'java', f), path.join(javaDir, f));
const xmlDir = path.join(main, 'res', 'xml');
fs.mkdirSync(xmlDir, { recursive: true });
fs.copyFileSync(path.join(here, 'native', 'res', 'xml', 'easycut_update_paths.xml'), path.join(xmlDir, 'easycut_update_paths.xml'));

const mf = path.join(main, 'AndroidManifest.xml');
let m = fs.readFileSync(mf, 'utf8');
if (!m.includes('REQUEST_INSTALL_PACKAGES')) m = m.replace('</manifest>', '    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />\n</manifest>');
if (!m.includes('.UpdateFileProvider')) {
  m = m.replace(/<\/application>/, `    <provider
            android:name=".UpdateFileProvider"
            android:authorities="\${applicationId}.updates"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/easycut_update_paths" />
        </provider>
    </application>`);
}
fs.writeFileSync(mf, m);
for (const need of ['REQUEST_INSTALL_PACKAGES', '.UpdateFileProvider', 'easycut_update_paths']) if (!m.includes(need)) { console.error('patch-android: missing ' + need); process.exit(1); }
console.log('patch-android: updater plugin, file provider and install permission added');
