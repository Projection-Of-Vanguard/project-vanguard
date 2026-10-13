# Creates "Steam Redesigned" shortcuts (with the app icon) in this folder, on the Desktop and in the Start menu.
# Run:  powershell -ExecutionPolicy Bypass -File tools\install-shortcuts.ps1
# Remove: delete the three "Steam Redesigned.lnk" files. (For other PCs, use the installer in dist/ instead.)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$electron = Join-Path $root 'node_modules\electron\dist\electron.exe'
$icon = Join-Path $root 'assets\icon.ico'
if (-not (Test-Path $electron)) { throw "Electron is not installed. Run 'npm install' in $root first." }

$shell = New-Object -ComObject WScript.Shell
$targets = @(
  (Join-Path $root 'Steam Redesigned.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Steam Redesigned.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Programs')) 'Steam Redesigned.lnk')
)
# Remove shortcuts from the earlier "Steam Redesign" name
foreach ($old in @((Join-Path $root 'Steam Redesign.lnk'), (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Steam Redesign.lnk'), (Join-Path ([Environment]::GetFolderPath('Programs')) 'Steam Redesign.lnk'))) {
  if (Test-Path $old) { Remove-Item $old; Write-Output "Removed $old" }
}
foreach ($path in $targets) {
  $lnk = $shell.CreateShortcut($path)
  $lnk.TargetPath = $electron
  $lnk.Arguments = '"' + $root + '"'
  $lnk.WorkingDirectory = $root
  $lnk.IconLocation = "$icon,0"
  $lnk.Description = 'Steam Redesigned (Project Vanguard)'
  $lnk.Save()
  Write-Output "Created $path"
}
