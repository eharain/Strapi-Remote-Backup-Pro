<#
=============================================================================
 Strapi Remote Backup Pro - installer for Windows

 Written for someone who has never opened a terminal on purpose. One command,
 no administrator prompt, nothing written outside their own user profile:

     irm https://tech-style.co/install/strapi-remote-backup-pro.ps1 | iex

 With options, since `iex` cannot pass arguments to a piped script:

     & ([scriptblock]::Create((irm https://tech-style.co/install/strapi-remote-backup-pro.ps1))) -Uninstall

 Each choice here is deliberate:

 * It stages its own pinned Node runtime rather than asking for one. "Install
   Node first" is where a non-technical install ends, and a runtime we did not
   pin is a runtime we cannot support - the same reasoning that makes the
   desktop installer carry one (docs/adr/0004-sidecar-contract.md).
 * It installs under %LOCALAPPDATA% only. No elevation, so a UAC prompt can
   never be the thing that stops someone trying the product, and a locked-down
   corporate machine is not excluded.
 * It verifies the runtime download against the checksums nodejs.org publishes.
   An installer piped from the internet that skips this hands anyone who can
   intercept the connection a shell on the customer's machine.
 * It finishes by running the tool and reporting what actually happened,
   instead of printing "success" because files copied. A customer discovering
   on their own that the thing does nothing is a support ticket we wrote.

 Re-running upgrades in place. -Uninstall removes everything it created.

 Targets Windows PowerShell 5.1, which is what ships in the box. Nothing here
 may use PowerShell 7 syntax - a customer who has to install PowerShell first
 is a customer who has already given up.
=============================================================================
#>

[CmdletBinding()]
param(
  # release | source - where to get the program. Default tries the published
  # release and falls back to building from source.
  [ValidateSet('auto', 'release', 'source')]
  [string] $Channel = 'auto',

  [string] $Version = 'latest',
  [string] $Prefix = '',
  [switch] $NoShortcut,
  [switch] $NoPath,
  [switch] $Uninstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Invoke-WebRequest draws a progress bar that costs more time than the download
# on a 40 MB file. Off before anything is fetched.
$ProgressPreference = 'SilentlyContinue'

# Windows PowerShell 5.1 still negotiates TLS 1.0 by default on older builds,
# and nodejs.org refuses it.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Pinned deliberately. build/scripts/bundle-runtime.ps1 must stage this exact
# version - a customer whose CLI runs on a different runtime from the one we
# tested is a bug report nobody can reproduce.
$NodeVersion = '22.21.1'

$Pkg     = 'strapi-remote-backup-pro'
$Product = 'Strapi Remote Backup Pro'
$Repo    = 'eharain/strapi-remote-backup-pro'
$Support = 'https://tech-style.co/products.html#remote-backup'

$Root    = if ($Prefix) { $Prefix } else { Join-Path $env:LOCALAPPDATA 'StrapiRemoteBackupPro' }
$Runtime = Join-Path $Root 'runtime'
$App     = Join-Path $Root 'app'
$BinDir  = Join-Path $Root 'bin'
$Shim    = Join-Path $BinDir 'strapi-backup.cmd'
$LogPath = Join-Path $Root 'install.log'

# ---------------------------------------------------------------- output ----
# Everything the customer sees goes through here, and all of it is appended to
# the log. When someone says "it didn't work", the log is the whole conversation.

function Write-Log([string] $Text) {
  if (Test-Path -LiteralPath $Root) {
    Add-Content -LiteralPath $LogPath -Value $Text -Encoding utf8
  }
}
function Say([string] $Text)  { Write-Host $Text;                 Write-Log $Text }
function Step([string] $Text) { Write-Host ''; Write-Host "==> $Text" -ForegroundColor Cyan; Write-Log "==> $Text" }
function Note([string] $Text) { Write-Host "    $Text";           Write-Log "    $Text" }

function Fail([string] $Text) {
  Write-Host ''
  Write-Host "$Product could not be installed." -ForegroundColor Red
  Write-Host ''
  Write-Host "  $Text"
  Write-Host ''
  if (Test-Path -LiteralPath $LogPath) {
    Write-Host "  The full log is at $LogPath"
    Write-Host "  Send it to us and we will tell you what happened: $Support"
    Write-Host ''
  }
  exit 1
}

# Windows still enforces MAX_PATH in the file APIs PowerShell 5.1 sits on, and
# node_modules routinely nests past 260 characters - the AWS SDK on its own gets
# there. Both `Remove-Item -Recurse` and `rd /s /q` give up part way and leave a
# half-deleted tree, which turns every upgrade and every uninstall into a
# failure the customer cannot clear by hand either. Mirroring an empty directory
# over the target is the one method that reliably reaches those paths, so it is
# the fallback rather than the first attempt only because it is slower.
function Remove-Tree([string] $Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return }
  try {
    Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
    return
  } catch { }

  $empty = Join-Path ([IO.Path]::GetTempPath()) ('srbp-empty-' + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force -Path $empty | Out-Null
  try {
    & robocopy.exe $empty $Path /MIR /NFL /NDL /NJH /NJS /NC /NS | Out-Null
    Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue
  } finally {
    Remove-Item -LiteralPath $empty -Recurse -Force -ErrorAction SilentlyContinue
  }
}

# npm is a .cmd batch file, and PowerShell 5.1 turns a native command's stderr
# into error records that trip $ErrorActionPreference even on a clean exit.
# Routing through cmd.exe sidesteps the whole problem and appends cleanly.
function Invoke-Npm {
  param([string[]] $Arguments, [string] $WorkingDirectory = $null)

  $npm = Join-Path $Runtime 'npm.cmd'
  $quoted = ($Arguments | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } }) -join ' '
  $line = '"' + $npm + '" ' + $quoted + ' >> "' + $LogPath + '" 2>&1'

  $previous = Get-Location
  try {
    if ($WorkingDirectory) { Set-Location -LiteralPath $WorkingDirectory }
    # The staged runtime has to win over any other Node already on this machine,
    # otherwise we are supporting a mix we never tested.
    $savedPath = $env:Path
    $env:Path = "$Runtime;$env:Path"
    & cmd.exe /c $line | Out-Null
    return ($LASTEXITCODE -eq 0)
  } finally {
    $env:Path = $savedPath
    Set-Location -LiteralPath $previous
  }
}

# ------------------------------------------------------------- uninstall ----
if ($Uninstall) {
  Step "Removing $Product"

  $desktop   = [Environment]::GetFolderPath('Desktop')
  $startMenu = [Environment]::GetFolderPath('Programs')
  foreach ($link in @((Join-Path $desktop "$Product.lnk"), (Join-Path $startMenu "$Product.lnk"))) {
    if (Test-Path -LiteralPath $link) { Remove-Item -LiteralPath $link -Force; Note "removed $link" }
  }

  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if ($userPath -and $userPath.Split(';') -contains $BinDir) {
    $kept = ($userPath.Split(';') | Where-Object { $_ -and $_ -ne $BinDir }) -join ';'
    [Environment]::SetEnvironmentVariable('Path', $kept, 'User')
    Note 'removed from PATH'
  }

  if (Test-Path -LiteralPath $Root) { Remove-Tree $Root; Note "removed $Root" }

  Write-Host ''
  Write-Host 'Done. Your backup archives were not touched - they are wherever you saved them.'
  Write-Host ''
  exit 0
}

# ------------------------------------------------------ what machine is this ----
$arch = $env:PROCESSOR_ARCHITECTURE
if ($env:PROCESSOR_ARCHITEW6432) { $arch = $env:PROCESSOR_ARCHITEW6432 }
switch ($arch) {
  'AMD64' { $NodeArch = 'x64' }
  'ARM64' { $NodeArch = 'arm64' }
  default { Fail "There is no build for this processor type ($arch). Get in touch and we will look at it: $Support" }
}

New-Item -ItemType Directory -Force -Path $Root | Out-Null
Set-Content -LiteralPath $LogPath -Value "$Product install log" -Encoding utf8

Say ''
Say $Product
Say "Installing for Windows/$NodeArch. This takes a couple of minutes and needs no administrator password."

$Tmp = Join-Path ([IO.Path]::GetTempPath()) ('srbp-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $Tmp | Out-Null

try {
  # ------------------------------------------------ 1. the Node runtime ----
  Step 'Step 1 of 4 - getting the runtime the tool needs'

  $nodeExe = Join-Path $Runtime 'node.exe'
  $haveNode = ''
  if (Test-Path -LiteralPath $nodeExe) {
    try { $haveNode = (& $nodeExe --version) } catch { $haveNode = '' }
  }

  if ($haveNode -eq "v$NodeVersion") {
    Note 'already have the right one, skipping the download'
  } else {
    $nodeZip = "node-v$NodeVersion-win-$NodeArch.zip"
    $zipPath = Join-Path $Tmp $nodeZip

    Note "downloading $nodeZip (about 30 MB)"
    try {
      Invoke-WebRequest -Uri "https://nodejs.org/dist/v$NodeVersion/$nodeZip" -OutFile $zipPath -UseBasicParsing
    } catch {
      Fail 'The runtime download failed. Check the internet connection and try again.'
    }

    Note 'checking the download is genuine'
    $sums = (Invoke-WebRequest -Uri "https://nodejs.org/dist/v$NodeVersion/SHASUMS256.txt" -UseBasicParsing).Content
    $expected = ($sums -split "`n" | Where-Object { $_ -match [Regex]::Escape($nodeZip) + '\s*$' } | Select-Object -First 1)
    if (-not $expected) {
      Fail "Could not read the published checksum for $nodeZip. Refusing to install something unverified."
    }
    $expected = ($expected -split '\s+')[0]
    $actual = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLower()
    # A mismatch is not a retry-worthy glitch. Either the connection was tampered
    # with or the file is corrupt, and installing either is worse than stopping.
    if ($expected.ToLower() -ne $actual) {
      Fail 'The runtime download does not match its published checksum. Nothing was installed. This can mean the connection was interfered with - try again on a different network.'
    }

    Remove-Tree $Runtime
    Note 'unpacking'
    Expand-Archive -LiteralPath $zipPath -DestinationPath $Tmp -Force
    Move-Item -LiteralPath (Join-Path $Tmp "node-v$NodeVersion-win-$NodeArch") -Destination $Runtime
    Note 'runtime ready'
  }

  if (-not (Test-Path -LiteralPath (Join-Path $Runtime 'npm.cmd'))) {
    Fail "The runtime unpacked without npm in it, which should not happen. Please send us $LogPath."
  }

  # ----------------------------------------------------- 2. the program ----
  Step "Step 2 of 4 - getting $Product itself"

  $entry = ''

  # A successful install and a runnable install are not the same thing. npm can
  # unpack a package, and the source can compile, while the file package.json
  # names under "bin" is simply absent - which is what happens when that file is
  # not committed. Distinguishing the two is worth the four lines: otherwise the
  # customer is told the build failed when it did not, and the log is the only
  # way to tell the difference.
  function Resolve-Entry([string] $Candidate) {
    if (Test-Path -LiteralPath $Candidate) { return $Candidate }
    Note "it installed, but the program's starting file is missing from it"
    Note "(expected $Candidate)"
    return ''
  }

  function Install-FromRelease {
    Note 'looking for the published release'
    if (-not (Invoke-Npm @('view', $Pkg, 'version'))) { return '' }

    Note 'installing the released version'
    New-Item -ItemType Directory -Force -Path $App | Out-Null
    $spec = if ($Version -eq 'latest') { $Pkg } else { "$Pkg@$Version" }
    if (-not (Invoke-Npm @('install', '--prefix', $App, '--no-audit', '--no-fund', $spec))) { return '' }

    return (Resolve-Entry (Join-Path $App "node_modules\$Pkg\bin\strapi-backup.js"))
  }

  function Install-FromSource {
    $ref = if ($Version -eq 'latest') { 'main' } else { 'v' + $Version.TrimStart('v') }
    Note "downloading the source code ($ref)"

    $srcZip = Join-Path $Tmp 'src.zip'
    $got = $false
    foreach ($url in @("https://codeload.github.com/$Repo/zip/refs/heads/$ref",
                       "https://codeload.github.com/$Repo/zip/refs/tags/$ref")) {
      try {
        Invoke-WebRequest -Uri $url -OutFile $srcZip -UseBasicParsing
        $got = $true
        break
      } catch { }
    }
    if (-not $got) { return '' }

    $srcRoot = Join-Path $Root 'src'
    Remove-Tree $srcRoot
    $unzipped = Join-Path $Tmp 'src'
    Expand-Archive -LiteralPath $srcZip -DestinationPath $unzipped -Force
    $inner = Get-ChildItem -LiteralPath $unzipped -Directory | Select-Object -First 1
    if (-not $inner) { return '' }
    Move-Item -LiteralPath $inner.FullName -Destination $srcRoot

    # Building is the longest thing here, so say so. Two silent minutes reads as
    # a hang, and a customer who kills it half way leaves a broken install behind.
    Note 'building it - this is the slow part, two or three minutes'
    if (-not (Invoke-Npm -Arguments @('ci', '--no-audit', '--no-fund') -WorkingDirectory $srcRoot)) { return '' }
    if (-not (Invoke-Npm -Arguments @('run', 'build') -WorkingDirectory $srcRoot)) { return '' }

    return (Resolve-Entry (Join-Path $srcRoot 'apps\core\bin\strapi-backup.js'))
  }

  switch ($Channel) {
    'release' {
      $entry = Install-FromRelease
      if (-not $entry) { Fail "The published release could not be installed. The log at $LogPath has the detail." }
    }
    'source' {
      $entry = Install-FromSource
      if (-not $entry) { Fail "The source code could not be downloaded or built. The log at $LogPath has the detail." }
    }
    'auto' {
      $entry = Install-FromRelease
      if (-not $entry) {
        Note 'no published release yet - falling back to building from source'
        $entry = Install-FromSource
      }
      if (-not $entry) {
        Fail "There is no published release, and the source copy did not produce something runnable. This usually means the product has not been released yet. Check $Support for where it is up to."
      }
    }
  }

  Note 'installed'

  # ---------------------------------------------- 3. make it launchable ----
  Step 'Step 3 of 4 - making it easy to start'

  # If a future release ships the desktop app alongside the engine, the shortcut
  # should open that rather than a console window. Resolved here instead of
  # assumed, so this installer keeps working the day packaging lands.
  $desktopApp = ''
  foreach ($candidate in @((Join-Path $App 'desktop\StrapiBackup.App.exe'),
                           (Join-Path $Root 'desktop\StrapiBackup.App.exe'))) {
    if (Test-Path -LiteralPath $candidate) { $desktopApp = $candidate; break }
  }

  New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
  $shimBody = @"
@echo off
rem Generated by the $Product installer. Do not edit - re-running the
rem installer overwrites this file.
"$Runtime\node.exe" "$entry" %*
"@
  Set-Content -LiteralPath $Shim -Value $shimBody -Encoding ascii
  Note 'command installed: strapi-backup'

  if (-not $NoPath) {
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    if (-not $userPath) { $userPath = '' }
    if ($userPath.Split(';') -contains $BinDir) {
      Note 'PATH already includes the command'
    } else {
      # The User scope needs no elevation, and it survives a reboot. Editing the
      # Machine scope here would require the UAC prompt this installer exists to
      # avoid.
      $joined = if ($userPath) { "$userPath;$BinDir" } else { $BinDir }
      [Environment]::SetEnvironmentVariable('Path', $joined, 'User')
      $env:Path = "$env:Path;$BinDir"
      Note 'added to PATH - new Command Prompt windows will find it'
    }
  }

  if (-not $NoShortcut) {
    if ($desktopApp) {
      $target = $desktopApp
      $arguments = ''
    } else {
      # No GUI yet, so the shortcut opens a console window that shows what the
      # tool can do and stays open. /k rather than /c: a window that closes
      # instantly is indistinguishable from one that crashed.
      $target = "$env:ComSpec"
      $arguments = "/k `"$Shim`" --help"
    }

    $shell = New-Object -ComObject WScript.Shell
    foreach ($dir in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
      $lnk = $shell.CreateShortcut((Join-Path $dir "$Product.lnk"))
      $lnk.TargetPath = $target
      $lnk.Arguments = $arguments
      $lnk.WorkingDirectory = $Root
      $lnk.Description = 'Back up and restore a Strapi site'
      $lnk.Save()
    }
    Note 'shortcut on your Desktop and in the Start menu'
  }

  # -------------------------------------------------------- 4. self-test ----
  Step 'Step 4 of 4 - checking it actually works'

  # Copying files is not evidence. Run the thing and report honestly - including
  # the case where it installs perfectly and does nothing, which is exactly where
  # this product is today.
  $installedVersion = ''
  try { $installedVersion = (& cmd.exe /c "`"$Shim`" --version") | Select-Object -Last 1 } catch { }
  if (-not $installedVersion) {
    Fail "It installed, but will not start. The log at $LogPath will say why."
  }
  Note "version $installedVersion starts correctly"

  $help = ''
  try { $help = (& cmd.exe /c "`"$Shim`" --help") -join "`n" } catch { }
  $ready = ($help -match '(?m)^Commands:')  # see install.sh - matching 'backup' would match the program name itself

  Say ''
  if ($ready) {
    Say '-------------------------------------------------------------'
    Say " $Product is installed and working."
    Say '-------------------------------------------------------------'
    Say ''
    Say ' Open a new Command Prompt and back something up:'
    Say ''
    Say '   strapi-backup backup --url https://your-site.com --email you@example.com'
    Say ''
    Say ' Or just type   strapi-backup   to see everything it can do.'
  } else {
    Say '-------------------------------------------------------------'
    Say ' Installed - but this is a preview build.'
    Say '-------------------------------------------------------------'
    Say ''
    Say ' Everything is in place and the program starts, but the backup'
    Say ' and restore commands are not finished yet, so there is nothing'
    Say ' useful to run at the moment.'
    Say ''
    Say " Re-run this installer when a release is announced and it will"
    Say " upgrade itself: $Support"
  }
  Say ''
  Say " Installed in:  $Root"
  Say " Log:           $LogPath"
  Say ' To remove it:  & ([scriptblock]::Create((irm <url>/install.ps1))) -Uninstall'
  Say ''

} finally {
  Remove-Tree $Tmp
}
