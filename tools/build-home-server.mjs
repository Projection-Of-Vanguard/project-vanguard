// Assembles the home server folder (default: ../ProjectServer) for a spare PC:
//   node tools/build-home-server.mjs [target folder]
// It needs only Node.js on that PC: no npm install, no accounts. Data, photos and settings stay in its own folder.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, '..', 'ProjectServer'));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const write = (name, text) => fs.writeFileSync(path.join(OUT, name), text.replace(/^\n/, ''));

fs.mkdirSync(path.join(OUT, 'data'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'server.mjs'), path.join(OUT, 'server.mjs'));

// Starter data (public Steam data only) so the server answers right away; kept if already there
for (const name of ['catalog.json', 'history.json', 'steamspy.json']) {
  const from = path.join(ROOT, 'data', name), to = path.join(OUT, 'data', name);
  if (fs.existsSync(from) && !fs.existsSync(to)) fs.copyFileSync(from, to);
}

if (!fs.existsSync(path.join(OUT, 'config.json'))) write('config.json', `${JSON.stringify({ port: 8787, refreshHours: 1, photoCacheGB: 4 }, null, 2)}\n`);

write('package.json', `${JSON.stringify({ name: 'project-vanguard-home-server', version: pkg.version, private: true, type: 'module', description: 'Home server for the Steam Redesigned (Project Vanguard) phone app', scripts: { start: 'node start.mjs' }, engines: { node: '>=22' } }, null, 2)}\n`);

write('start.mjs', `
// Starts the Project Vanguard home server: node start.mjs  (or double-click "Start Server.bat")
// Settings are in config.json: port, refreshHours (how often the catalog and deals refresh), photoCacheGB.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [major] = process.versions.node.split('.').map(Number);
if (major < 22) { console.error(\`Node.js 22 or newer is needed (this PC has \${process.versions.node}). Install the LTS version from https://nodejs.org\`); process.exit(1); }

let config = {};
try { config = JSON.parse(fs.readFileSync(path.join(HERE, 'config.json'), 'utf8')); } catch { /* defaults */ }
const port = Number.isInteger(config.port) && config.port > 1023 && config.port < 65536 ? config.port : 8787;
const refreshHours = Math.min(24, Math.max(1, Number(config.refreshHours) || 1));
const imageCacheGB = Math.min(500, Math.max(0.5, Number(config.photoCacheGB) || 4));

process.env.HOME_MODE = '1'; // read-only, phones on this network can connect
// It runs for weeks: log anything unexpected instead of stopping
process.on('unhandledRejection', (e) => console.error(\`\${new Date().toTimeString().slice(0, 8)} unexpected error: \${e?.message || e}\`));
const { startServer } = await import(pathToFileURL(path.join(HERE, 'server.mjs')).href);
await startServer({ port, host: '0.0.0.0', dataDir: path.join(HERE, 'data'), refreshHours, imageCacheGB });

const addresses = Object.values(os.networkInterfaces()).flat().filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => a.address);
console.log('');
console.log('  Project Vanguard home server is running.');
console.log('  In the phone app: Settings > Catalog & data > Home server, then enter one of:');
for (const a of addresses) console.log(\`      http://\${a}:\${port}\`);
console.log('  Keep this window open (or set up autostart, see README.md). Press Ctrl+C to stop.');
console.log('');
`);

write('Start Server.bat', `
@echo off
title Project Vanguard home server
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)
node start.mjs
pause
`.replace(/\n/g, '\r\n'));

write('install-autostart.ps1', `
# Starts the home server automatically when you sign in to this PC, in the background.
# Run:  powershell -ExecutionPolicy Bypass -File install-autostart.ps1
# Undo: powershell -ExecutionPolicy Bypass -File install-autostart.ps1 -Remove
param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$name = 'Project Vanguard home server'
if ($Remove) { Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue; Write-Host "Autostart removed."; exit }
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw 'Node.js is not installed. Install the LTS version from https://nodejs.org first.' }
$action = New-ScheduledTaskAction -Execute $node -Argument '"start.mjs"' -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Description 'Serves Steam Redesigned data to phones on this network' -Force | Out-Null
Start-ScheduledTask -TaskName $name
Write-Host "Autostart is on: the server runs in the background whenever you sign in. Check it at http://localhost:8787"
`.replace(/\n/g, '\r\n'));

write('allow-phones-firewall.ps1', `
# Lets phones on your home network reach the server through Windows Firewall (private networks only).
# Run once as administrator:  right-click PowerShell > Run as administrator, then
#   powershell -ExecutionPolicy Bypass -File allow-phones-firewall.ps1
$config = Get-Content (Join-Path $PSScriptRoot 'config.json') -Raw | ConvertFrom-Json
$port = if ($config.port) { [int]$config.port } else { 8787 }
Remove-NetFirewallRule -DisplayName 'Project Vanguard home server' -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName 'Project Vanguard home server' -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow -Profile Private | Out-Null
Write-Host "Phones on private (home) networks can now connect on port $port."
Write-Host "If it still doesn't connect, set your Wi-Fi to Private: Settings > Network & internet > Wi-Fi > your network > Private network."
`.replace(/\n/g, '\r\n'));

write('README.md', `
# Project Vanguard home server

Version ${pkg.version}. Keeps the Steam Redesigned store on a spare PC, so phones load games, details and
photos from it instead of from Steam on every tap, and get notified about new free games and big discounts.

## What it does
- **Refreshes every hour**: every Steam game with 100+ players (up to 10,000), with prices, discounts and player counts.
- **Fast for phones**: the catalog is kept in memory; game details, reviews, community posts and photos are saved on
  this PC's disk the first time anyone opens them. After each refresh it pre-loads details for the 300 most played
  games and every cover photo, so taps are instant.
- **Deal notifications**: after each refresh it looks for games that just became **free to keep** and new **50%+
  discounts** on the 200 most played games. Phones check the server every hour and show a notification.
  Price alerts you set on your phone also use this server's prices.
- **Safe to leave running**: read-only (phones can't change anything), only Steam's own image servers are cached,
  and only phones on your network can reach it.

## Set up on the laptop
1. Copy this whole folder to the laptop (for example to \`C:\\ProjectServer\`).
2. Install **Node.js LTS** from https://nodejs.org (version 22 or newer).
3. Double-click **Start Server.bat**. The window shows the address to use, for example \`http://192.168.1.50:8787\`.
4. Allow phones through the firewall once: right-click PowerShell, choose **Run as administrator**, then run
   \`powershell -ExecutionPolicy Bypass -File allow-phones-firewall.ps1\` in this folder.
5. Optional: start it automatically whenever you sign in:
   \`powershell -ExecutionPolicy Bypass -File install-autostart.ps1\` (undo with \`-Remove\`).

Open \`http://localhost:8787\` on the laptop to see its status.

## Connect your phone
1. Install Steam Redesigned ${pkg.version} or newer on the phone.
2. Connect the phone to the **same Wi-Fi** as the laptop.
3. In the app: **Settings > Catalog & data > Home server**, enter the address from the server window and tap **Connect**.
   The app checks the server before saving it. Clear the field to go back to the online service.

Tips: give the laptop a fixed address in your router (DHCP reservation) so the address never changes, and set its
power options so it doesn't sleep while plugged in. Away from home the app uses the online service automatically.

## Settings (config.json)
| Setting | Default | What it does |
|---|---|---|
| \`port\` | 8787 | Network port phones connect to |
| \`refreshHours\` | 1 | How often the catalog and deals refresh (1 to 24) |
| \`photoCacheGB\` | 4 | Disk space for saved photos; the least recently used are removed first |

Restart the server after changing them.

## Files
- \`data/\`: catalog, price history, deal feed, cached game details (\`cache/\`) and photos (\`img/\`). Safe to delete; it rebuilds.
- \`server.mjs\`: the server (the same one the desktop app and website use), \`start.mjs\`: starts it in home mode.
`);

console.log(`home server assembled in ${OUT}`);
