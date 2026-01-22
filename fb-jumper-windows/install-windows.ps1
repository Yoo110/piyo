param(
    [string]$ZipPath,
    [string]$SourceDir,
    [switch]$AllUsers
)

$ErrorActionPreference = "Stop"

$extensionId = "com.yasu.fbjumper"
$extensionFolder = "premiere-fb-jumper"
$panelId = "com.yasu.fbjumper.panel"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$logRoot = if ($env:TEMP) { $env:TEMP } else { $scriptDir }
$logPath = Join-Path $logRoot "fb-jumper-install.log"
$cleanupPaths = New-Object System.Collections.Generic.List[string]

function Write-Log($level, $message) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp][$level] $message"
    Write-Host $line
    Add-Content -Path $logPath -Value $line -Encoding UTF8
}

function Write-Info($message) {
    Write-Log "INFO" $message
}

function Write-Warn($message) {
    Write-Log "WARN" $message
}

function Fail($message) {
    Write-Log "ERROR" $message
    Write-Log "INFO" "Log: $logPath"
    exit 1
}

function Test-IsAdmin() {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
}

function Enable-PlayerDebugMode($version) {
    $key = "HKCU:\Software\Adobe\CSXS.$version"
    New-Item -Path $key -Force | Out-Null
    try {
        if (Get-ItemProperty -Path $key -Name PlayerDebugMode -ErrorAction SilentlyContinue) {
            Remove-ItemProperty -Path $key -Name PlayerDebugMode -ErrorAction SilentlyContinue
        }
        New-ItemProperty -Path $key -Name PlayerDebugMode -PropertyType String -Value "1" -Force | Out-Null
    } catch {
        New-ItemProperty -Path $key -Name PlayerDebugMode -PropertyType DWord -Value 1 -Force | Out-Null
    }
}

function Clear-CepCache($id, $folderName) {
    $roots = @()
    if ($env:TEMP) {
        $roots += (Join-Path $env:TEMP "cep_cache")
    }
    if ($env:LOCALAPPDATA) {
        $roots += (Join-Path $env:LOCALAPPDATA "Adobe\CEP\Cache")
        $roots += (Join-Path $env:LOCALAPPDATA "Adobe\CEP\cache")
        $roots += (Join-Path $env:LOCALAPPDATA "Adobe\CEP")
    }
    if ($env:APPDATA) {
        $roots += (Join-Path $env:APPDATA "Adobe\CEP\Cache")
        $roots += (Join-Path $env:APPDATA "Adobe\CEP\cache")
        $roots += (Join-Path $env:APPDATA "Adobe\CEP")
    }
    foreach ($root in $roots) {
        if (!(Test-Path $root)) {
            continue
        }
        Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -like "*$id*" -or $_.Name -like "*$folderName*" } |
            ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
    }
}

function Get-ExtensionRoot($baseDir) {
    if (!(Test-Path $baseDir)) {
        return $null
    }
    if ((Test-Path (Join-Path $baseDir "CSXS\manifest.xml")) -and (Test-Path (Join-Path $baseDir "index.html"))) {
        return $baseDir
    }
    $manifest = Get-ChildItem -Path $baseDir -Recurse -Filter "manifest.xml" -File -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -match "\\CSXS\\manifest.xml$" } |
        Select-Object -First 1
    if ($manifest) {
        $root = Split-Path -Parent (Split-Path -Parent $manifest.FullName)
        if (Test-Path (Join-Path $root "index.html")) {
            return $root
        }
    }
    return $null
}

function Resolve-SourceRoot() {
    if ($SourceDir) {
        $root = Get-ExtensionRoot $SourceDir
        if ($root) {
            return $root
        }
        Fail "SourceDir does not contain FB Jumper files: $SourceDir"
    }

    if ($ZipPath) {
        if (!(Test-Path $ZipPath)) {
            Fail "Zip not found: $ZipPath"
        }
        if (-not $env:TEMP) {
            Fail "TEMP is not set. Provide -SourceDir instead."
        }
        $tmp = Join-Path $env:TEMP ("fb-jumper-" + [Guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Force -Path $tmp | Out-Null
        Expand-Archive -Force -LiteralPath $ZipPath -DestinationPath $tmp
        $cleanupPaths.Add($tmp) | Out-Null
        $root = Get-ExtensionRoot $tmp
        if ($root) {
            return $root
        }
        Fail "Could not locate extension files inside zip: $ZipPath"
    }

    $root = Get-ExtensionRoot $scriptDir
    if ($root) {
        return $root
    }

    $downloads = if ($env:USERPROFILE) { Join-Path $env:USERPROFILE "Downloads" } else { $null }
    if ($downloads -and (Test-Path $downloads)) {
        $zip = Get-ChildItem -Path $downloads -Filter "FB-Jumper*.zip" -File -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1
        if ($zip) {
            $ZipPath = $zip.FullName
            if (-not $env:TEMP) {
                Fail "TEMP is not set. Provide -SourceDir instead."
            }
            $tmp = Join-Path $env:TEMP ("fb-jumper-" + [Guid]::NewGuid().ToString("N"))
            New-Item -ItemType Directory -Force -Path $tmp | Out-Null
            Expand-Archive -Force -LiteralPath $ZipPath -DestinationPath $tmp
            $cleanupPaths.Add($tmp) | Out-Null
            $root = Get-ExtensionRoot $tmp
            if ($root) {
                return $root
            }
        }
    }

    Fail "No source found. Place this script in the extracted folder, or pass -SourceDir or -ZipPath."
}

function Assert-RequiredFile($baseDir, $relativePath) {
    $path = Join-Path $baseDir $relativePath
    if (!(Test-Path $path)) {
        Fail "Required file missing: $path"
    }
}

if (-not $env:APPDATA) {
    Fail "APPDATA is not set. This script must run on Windows."
}

try {
    $premiere = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like "Adobe Premiere Pro*" }
    if ($premiere) {
        Fail "Adobe Premiere Pro is running. Close it before installing."
    }

    $sourceRoot = Resolve-SourceRoot
    Write-Info "Source: $sourceRoot"

    $programFilesX86 = ${env:ProgramFiles(x86)}
    if (-not $programFilesX86) {
        $programFilesX86 = $env:ProgramFiles
    }

    $userDest = Join-Path $env:APPDATA "Adobe\CEP\extensions\$extensionFolder"
    $allUsersDest = if ($programFilesX86) { Join-Path $programFilesX86 "Common Files\Adobe\CEP\extensions\$extensionFolder" } else { $null }

    if ($AllUsers) {
        if (-not (Test-IsAdmin)) {
            Fail "AllUsers requires administrator privileges."
        }
        if (-not $allUsersDest) {
            Fail "Program Files path not found for AllUsers install."
        }
        $destDir = $allUsersDest
    } else {
        $destDir = $userDest
    }

    Write-Info "Dest:   $destDir"

    if (Test-Path $destDir) {
        Write-Info "Removing existing install..."
        Remove-Item -LiteralPath $destDir -Recurse -Force
    }

    New-Item -ItemType Directory -Force -Path $destDir | Out-Null
    Copy-Item -Path (Join-Path $sourceRoot "*") -Destination $destDir -Recurse -Force

    $requiredFiles = @(
        "index.html",
        "css\panel.css",
        "js\panel.js",
        "host\host.jsx",
        "lib\CSInterface.js",
        "CSXS\manifest.xml"
    )
    foreach ($file in $requiredFiles) {
        Assert-RequiredFile $destDir $file
    }

    if ($AllUsers -and (Test-Path $userDest)) {
        Write-Warn "User install exists at $userDest. Remove it to avoid conflicts."
    }
    if ((-not $AllUsers) -and $allUsersDest -and (Test-Path $allUsersDest)) {
        Write-Warn "All users install exists at $allUsersDest. Remove it to avoid conflicts."
    }

    foreach ($v in 9..16) {
        Enable-PlayerDebugMode $v
    }

    $debugPath = Join-Path $destDir ".debug"
    @"
<?xml version="1.0" encoding="UTF-8"?>
<ExtensionList>
    <Extension Id="$panelId">
        <HostList>
            <Host Name="PPRO" Port="8092"/>
        </HostList>
    </Extension>
</ExtensionList>
"@ | Set-Content -Path $debugPath -Encoding UTF8

    Write-Info "Clearing CEP cache..."
    Clear-CepCache $extensionId $extensionFolder

    Write-Host ""
    Write-Host "Install complete."
    Write-Host "Log: $logPath"
    Write-Host "Restart Premiere Pro, then open:"
    Write-Host "Window > Extensions (Legacy) > FB Jumper"
} finally {
    foreach ($path in $cleanupPaths) {
        if (Test-Path $path) {
            Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}
