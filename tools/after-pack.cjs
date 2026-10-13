// electron-builder afterPack hook: flips Electron "fuses" in the packaged executable to switch off
// features an attacker could abuse on a PC where the app is installed.
const fs = require('node:fs');
const path = require('node:path');
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');

exports.default = async function afterPack(context) {
  const exe = fs.readdirSync(context.appOutDir).find((f) => /\.exe$/i.test(f) && !/uninstall/i.test(f));
  if (!exe) throw new Error('afterPack: packaged executable not found');
  await flipFuses(path.join(context.appOutDir, exe), {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,                          // ELECTRON_RUN_AS_NODE cannot turn the app into a Node.js shell
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false, // NODE_OPTIONS cannot inject code
    [FuseV1Options.EnableNodeCliInspectArguments]: false,       // --inspect cannot attach a debugger
    [FuseV1Options.EnableCookieEncryption]: true,                // cookies on disk are encrypted
    [FuseV1Options.OnlyLoadAppFromAsar]: true,                   // only the packaged app archive can be loaded
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true, // a modified app archive refuses to start
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,     // file:// pages get no special powers
  });
  console.log(`  • fuses flipped on ${exe}`);
};
