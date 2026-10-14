# ============================================================
# One-click build of the "Shouna Album" Android app
# (self-contained offline WebView shell embedding dist/)
# Usage:  pwsh -File scripts\build-apk.ps1 [-Install] [-SkipWebBuild]
#   -Install      also install to the USB device and launch
#   -SkipWebBuild reuse existing dist/ (skip `npm run build`)
# ============================================================
param(
  [switch]$Install,
  [switch]$SkipWebBuild
)

# Note: use Continue (not Stop) so native-command stderr never becomes a
# terminating error in PS7 ($PSNativeCommandUseErrorActionPreference);
# failures are caught via explicit $LASTEXITCODE checks.
$ErrorActionPreference = 'Continue'

$root      = Split-Path $PSScriptRoot -Parent
$sdk       = 'D:\AndroidStudioSDK'
$bt        = Join-Path $sdk 'build-tools\36.1.0'
$platform  = Join-Path $sdk 'platforms\android-35'
$jdk       = 'D:\jdk11'
$adb       = Join-Path $sdk 'platform-tools\adb.exe'

$env:JAVA_HOME = $jdk
$env:PATH = "$jdk\bin;$env:PATH"

$aapt2      = Join-Path $bt 'aapt2.exe'
$d8         = Join-Path $bt 'd8.bat'
$zipalign   = Join-Path $bt 'zipalign.exe'
$apksigner  = Join-Path $bt 'apksigner.bat'
$androidJar = Join-Path $platform 'android.jar'

$build      = Join-Path $root 'android\build'
$resRoot    = Join-Path $build 'res'
$resDir     = Join-Path $resRoot 'drawable'
$apkAssets  = Join-Path $build 'apk-assets'   # staged root; jar adds its 'assets' subtree into the APK
$assetsOut  = Join-Path $apkAssets 'assets\www'  # web root embedded as assets/www
$genOut     = Join-Path $build 'gen'
$classOut   = Join-Path $build 'classes'
$dexOut     = Join-Path $build 'dex'
$keystore   = Join-Path $build 'shouna.keystore'
$apkOut     = Join-Path $build 'cyberalbum-v1.0.0.apk'

foreach ($d in @($build, $resRoot, $resDir, $apkAssets, $assetsOut, $genOut, $classOut, $dexOut)) {
  New-Item -ItemType Directory -Force -Path $d | Out-Null
}

# ---------- 1. Build web assets ----------
if (-not $SkipWebBuild) {
  Write-Host '==> npm run build'
  Push-Location $root
  try { npm run build 2>$null | Out-String | Write-Host }
  finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw 'npm build failed' }
}
$dist = Join-Path $root 'dist'
if (-not (Test-Path (Join-Path $dist 'index.html'))) { throw 'dist/index.html missing - run npm run build first' }

# ---------- 2. Prepare res + staged assets (embed dist, strip ESM attrs) ----------
Write-Host '==> prepare res / staged assets'
Copy-Item (Join-Path $root 'public\icons\icon-512.png') (Join-Path $resDir 'ic_launcher.png') -Force

if (Test-Path $assetsOut) { Remove-Item $assetsOut -Recurse -Force }
New-Item -ItemType Directory -Force -Path $assetsOut | Out-Null
# copy the CONTENTS of dist/ directly into www/
Copy-Item -Path (Join-Path $dist '*') -Destination $assetsOut -Recurse -Force
# ES modules are blocked by CORS on file://, so switch to a classic script;
# the bundle sits in <head> (vite output), so it MUST stay deferred
# (module scripts are deferred by default; a plain classic script in <head>
# would run before <div id="root"> exists and crash createRoot).
$html = Join-Path $assetsOut 'index.html'
if (-not (Test-Path $html)) { throw "staged index.html missing at $html" }
$text = [System.IO.File]::ReadAllText($html)
$text = $text -replace ' type="module"', ' defer'
$text = $text -replace ' crossorigin', ''
[System.IO.File]::WriteAllText($html, $text)
Write-Host '  embedded index.html rewritten (defer classic script) for file:// loading'

# ---------- 3. Compile resources & link APK (no assets - added later) ----------
Write-Host '==> aapt2 compile / link'
$flata = Join-Path $build 'res.flata'
& $aapt2 compile --dir $resRoot -o $flata
if ($LASTEXITCODE -ne 0) { throw 'aapt2 compile failed' }

$baseApk = Join-Path $build 'base.apk'
& $aapt2 link -o $baseApk -I $androidJar --manifest (Join-Path $root 'android\AndroidManifest.xml') `
  --java $genOut --min-sdk-version 24 --target-sdk-version 35 `
  --version-code 1 --version-name 1.0.0 $flata
if ($LASTEXITCODE -ne 0) { throw 'aapt2 link failed' }

# ---------- 4. Compile Java ----------
Write-Host '==> javac'
$rjava = @(Get-ChildItem -Recurse $genOut -Filter '*.java' | ForEach-Object { $_.FullName })
$sjava = @(Get-ChildItem -Recurse (Join-Path $root 'android\src') -Filter '*.java' | ForEach-Object { $_.FullName })
& "$jdk\bin\javac.exe" -source 11 -target 11 -encoding UTF-8 -classpath $androidJar -d $classOut ($rjava + $sjava)
if ($LASTEXITCODE -ne 0) { throw 'javac failed' }

# ---------- 5. d8 -> dex ----------
Write-Host '==> d8'
$classes = @(Get-ChildItem -Recurse $classOut -Filter '*.class' | ForEach-Object { $_.FullName })
& $d8 --release --lib $androidJar --output $dexOut $classes
if ($LASTEXITCODE -ne 0) { throw 'd8 failed' }

# ---------- 6. Assemble: dex + embedded assets (jar writes both, forward-slash names), then zipalign ----------
Write-Host '==> assemble APK'
# jar (standard Java zip writer) adds assets/ tree and classes.dex in one pass;
# avoid .NET ZipArchive here - its rewrite of a dex entry breaks class loading on ART.
& "$jdk\bin\jar.exe" uf $baseApk -C $apkAssets assets -C $dexOut classes.dex
if ($LASTEXITCODE -ne 0) { throw 'jar (dex+assets) failed' }
$aligned = Join-Path $build 'aligned.apk'
& $zipalign -f 4 $baseApk $aligned
if ($LASTEXITCODE -ne 0) { throw 'zipalign failed' }

# ---------- 7. Sign ----------
if (-not (Test-Path $keystore)) {
  Write-Host '==> generate debug keystore'
  & "$jdk\bin\keytool.exe" -genkeypair -v -keystore $keystore -storepass shouna123 -keypass shouna123 `
    -alias shouna -keyalg RSA -keysize 2048 -validity 10950 -dname 'CN=Shouna, OU=dev, O=Shouna, C=CN' 2>$null
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $keystore)) { throw 'keytool failed' }
}
Write-Host '==> apksigner'
& $apksigner sign --ks $keystore --ks-pass pass:shouna123 --key-pass pass:shouna123 --out $apkOut $aligned
if ($LASTEXITCODE -ne 0) { throw 'apksigner failed' }
& $apksigner verify --print-certs $apkOut | Select-Object -First 3

Write-Host ''
Write-Host "APK ready: $apkOut"

# ---------- 8. Optional: install to USB device + launch ----------
if ($Install) {
  $devices = & $adb devices | Select-String '^\S+\s+device\b'
  if (-not $devices) { throw 'No authorized USB Android device found' }
  $serial = ($devices[0] -split '\s+')[0]
  Write-Host "==> fresh install to $serial (uninstall first, avoids MIUI incremental-install corruption)"
  & $adb -s $serial uninstall com.shouna.app 2>$null
  & $adb -s $serial install $apkOut
  if ($LASTEXITCODE -ne 0) { throw 'adb install failed' }
  Write-Host '==> launch app'
  & $adb -s $serial shell am start -n com.shouna.app/.MainActivity
  Write-Host 'Launched OK'
}
