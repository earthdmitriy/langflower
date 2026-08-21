# Install Langflower

Self-contained installers that ensure **Node.js ≥ 22.22.3** (installing the
**latest LTS** only when Node is missing or too old) and install or update the
global `langflower` CLI.

Download **one** file for your OS — no other repo files are required.

| OS | Script |
| --- | --- |
| Windows | [windows.ps1](windows.ps1) |
| Linux | [linux.sh](linux.sh) |
| macOS | [macos.sh](macos.sh) |

## What the script does

1. If `node` is on `PATH` and meets `>=22.22.3`, leave Node alone.
2. Otherwise install the latest Node.js LTS (winget on Windows; nvm on
   Linux/macOS).
3. If `langflower` is not installed globally: `npm install -g langflower`.
4. If it is installed: upgrade when a newer version exists on the npm registry.

## Run

### Windows (PowerShell)

Download `windows.ps1`, then:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\windows.ps1
```

Requires [winget](https://learn.microsoft.com/en-us/windows/package-manager/winget/)
when Node must be installed.

### Linux / macOS

Download `linux.sh` or `macos.sh`, then:

```bash
chmod +x linux.sh   # or macos.sh
./linux.sh
```

When Node must be installed, the script uses
[nvm](https://github.com/nvm-sh/nvm) (installed into `~/.nvm` if missing).

## After install

```bash
langflower
# or
langflower ./my-project
```

Walkthrough: [Getting started](../docs/public/getting-started.md).
