#!/bin/sh
# =============================================================================
#  Strapi Remote Backup Pro - installer for macOS and Linux
#
#  Written for someone who has never opened a terminal on purpose. One command,
#  no admin password, nothing touched outside their home directory:
#
#      curl -fsSL https://tech-style.co/install/strapi-remote-backup-pro.sh | sh
#
#  Each choice here is deliberate:
#
#  * It stages its own pinned Node runtime rather than asking for one. "Install
#    Node first" is where a non-technical install ends, and a runtime we did not
#    pin is a runtime we cannot support - the same reasoning that makes the
#    desktop installer carry one (docs/adr/0004-sidecar-contract.md).
#  * It installs under $HOME only. No sudo, so a password prompt can never be
#    the thing that stops someone trying the product.
#  * It verifies the runtime download against the checksums nodejs.org
#    publishes. An installer piped from the internet that skips this hands
#    anyone who can intercept the connection a shell on the customer's machine.
#  * It finishes by running the tool and reporting what actually happened,
#    instead of printing "success" because files copied. A customer discovering
#    on their own that the thing does nothing is a support ticket we wrote.
#
#  Re-running upgrades in place. `--uninstall` removes everything it created.
# =============================================================================

set -eu

# Pinned deliberately. build/scripts/bundle-runtime.ps1 must stage this exact
# version - a customer whose CLI runs on a different runtime from the one we
# tested is a bug report nobody can reproduce.
NODE_VERSION="22.21.1"

PKG="strapi-remote-backup-pro"
PRODUCT="Strapi Remote Backup Pro"
REPO="eharain/strapi-remote-backup-pro"
SUPPORT="https://tech-style.co/products.html#remote-backup"

CHANNEL="auto"
WANTED_VERSION="latest"
PREFIX=""
MAKE_SHORTCUT=1
MAKE_PATH=1
UNINSTALL=0

# ---------------------------------------------------------------- output ----
# Everything the customer sees goes through here, and all of it is appended to
# the log. When someone says "it didn't work", the log is the whole conversation.
LOG=""

say()  { printf '%s\n' "$*"; if [ -n "$LOG" ]; then printf '%s\n' "$*" >> "$LOG"; fi; }
step() { printf '\n==> %s\n' "$*"; if [ -n "$LOG" ]; then printf '\n==> %s\n' "$*" >> "$LOG"; fi; }
note() { printf '    %s\n' "$*"; if [ -n "$LOG" ]; then printf '    %s\n' "$*" >> "$LOG"; fi; }

die() {
  printf '\n%s could not be installed.\n\n  %s\n\n' "$PRODUCT" "$*" >&2
  if [ -n "$LOG" ]; then
    printf '  The full log is at %s\n' "$LOG" >&2
    printf '  Send it to us and we will tell you what happened: %s\n\n' "$SUPPORT" >&2
  fi
  exit 1
}

usage() {
  cat <<'USAGE'
Strapi Remote Backup Pro installer

  curl -fsSL <url>/install.sh | sh
  curl -fsSL <url>/install.sh | sh -s -- [options]

Options
  --channel release|source  where to get the program
                            (default: try the release, fall back to source)
  --version <v>             a specific version or git tag (default: latest)
  --prefix <dir>            install somewhere other than the default location
  --no-shortcut             do not put anything on the desktop
  --no-path                 do not add the command to PATH
  --uninstall               remove everything this installer created
  --help                    show this
USAGE
  exit 0
}

while [ $# -gt 0 ]; do
  case "$1" in
    --channel)     CHANNEL="${2:-}"; shift 2 ;;
    --version)     WANTED_VERSION="${2:-}"; shift 2 ;;
    --prefix)      PREFIX="${2:-}"; shift 2 ;;
    --no-shortcut) MAKE_SHORTCUT=0; shift ;;
    --no-path)     MAKE_PATH=0; shift ;;
    --uninstall)   UNINSTALL=1; shift ;;
    --help|-h)     usage ;;
    *)             die "I do not understand the option '$1'. Run with --help to see what is available." ;;
  esac
done

# ------------------------------------------------------- where things go ----
case "$(uname -s)" in
  Darwin)
    OS="darwin"
    DEFAULT_PREFIX="$HOME/Library/Application Support/StrapiRemoteBackupPro"
    ;;
  Linux)
    OS="linux"
    DEFAULT_PREFIX="${XDG_DATA_HOME:-$HOME/.local/share}/strapi-remote-backup-pro"
    ;;
  *)
    die "This installer covers macOS and Linux. On Windows use the PowerShell installer instead - see $SUPPORT"
    ;;
esac

case "$(uname -m)" in
  x86_64|amd64)  ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *)             die "There is no build for this processor type ($(uname -m)). Get in touch and we will look at it: $SUPPORT" ;;
esac

ROOT="${PREFIX:-$DEFAULT_PREFIX}"
RUNTIME="$ROOT/runtime"
APP="$ROOT/app"
SHIM_DIR="$HOME/.local/bin"
SHIM="$SHIM_DIR/strapi-backup"

# ------------------------------------------------------------- uninstall ----
if [ "$UNINSTALL" -eq 1 ]; then
  step "Removing $PRODUCT"
  if [ -d "$ROOT" ]; then rm -rf "$ROOT"; note "removed $ROOT"; fi
  if [ -f "$SHIM" ]; then rm -f "$SHIM"; note "removed $SHIM"; fi
  rm -f "$HOME/Desktop/$PRODUCT.command" 2>/dev/null || true
  rm -f "$HOME/.local/share/applications/strapi-remote-backup-pro.desktop" 2>/dev/null || true
  rm -f "$HOME/Desktop/strapi-remote-backup-pro.desktop" 2>/dev/null || true
  note "removed desktop shortcuts"
  say ""
  say "Done. Your backup archives were not touched - they are wherever you saved them."
  say "The PATH line in your shell profile is harmless, but you can delete the"
  say "'Strapi Remote Backup Pro' block from it if you like."
  exit 0
fi

mkdir -p "$ROOT"
LOG="$ROOT/install.log"
: > "$LOG"

say ""
say "$PRODUCT"
say "Installing for $OS/$ARCH. This takes a couple of minutes and needs no password."

# ----------------------------------------------------------------- tools ----
if command -v curl >/dev/null 2>&1; then
  fetch()      { curl -fsSL "$1" -o "$2"; }
  fetch_text() { curl -fsSL "$1"; }
elif command -v wget >/dev/null 2>&1; then
  fetch()      { wget -qO "$2" "$1"; }
  fetch_text() { wget -qO- "$1"; }
else
  die "Neither curl nor wget is available, so nothing can be downloaded. Install either one and run this again."
fi

if command -v sha256sum >/dev/null 2>&1; then
  sha256() { sha256sum "$1" | cut -d' ' -f1; }
elif command -v shasum >/dev/null 2>&1; then
  sha256() { shasum -a 256 "$1" | cut -d' ' -f1; }
else
  die "No SHA-256 tool is available, so the download cannot be verified. Refusing to install an unverified runtime."
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT INT TERM

# -------------------------------------------------- 1. the Node runtime ----
step "Step 1 of 4 - getting the runtime the tool needs"

NODE_BIN="$RUNTIME/bin/node"
HAVE_NODE=""
if [ -x "$NODE_BIN" ]; then
  HAVE_NODE="$("$NODE_BIN" --version 2>/dev/null || echo none)"
fi

if [ "$HAVE_NODE" = "v$NODE_VERSION" ]; then
  note "already have the right one, skipping the download"
else
  NODE_DIR="node-v$NODE_VERSION-$OS-$ARCH"
  NODE_TGZ="$NODE_DIR.tar.gz"

  note "downloading $NODE_TGZ (about 40 MB)"
  fetch "https://nodejs.org/dist/v$NODE_VERSION/$NODE_TGZ" "$TMP/$NODE_TGZ" \
    || die "The runtime download failed. Check the internet connection and try again."

  note "checking the download is genuine"
  EXPECTED="$(fetch_text "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" | grep " $NODE_TGZ\$" | cut -d' ' -f1)"
  if [ -z "$EXPECTED" ]; then
    die "Could not read the published checksum for $NODE_TGZ. Refusing to install something unverified."
  fi
  ACTUAL="$(sha256 "$TMP/$NODE_TGZ")"
  # A mismatch is not a retry-worthy glitch. Either the connection was tampered
  # with or the file is corrupt, and installing either is worse than stopping.
  if [ "$EXPECTED" != "$ACTUAL" ]; then
    die "The runtime download does not match its published checksum. Nothing was installed. This can mean the connection was interfered with - try again on a different network."
  fi

  rm -rf "$RUNTIME"
  mkdir -p "$RUNTIME"
  tar -xzf "$TMP/$NODE_TGZ" -C "$RUNTIME" --strip-components=1 \
    || die "The runtime archive could not be unpacked."
  note "runtime ready"
fi

NPM_BIN="$RUNTIME/bin/npm"
if [ ! -x "$NPM_BIN" ]; then
  die "The runtime unpacked without npm in it, which should not happen. Please send us $LOG."
fi

# npm shells out to `node`, so the staged runtime has to win over any other Node
# already on this machine - otherwise we are supporting a mix we never tested.
run_npm() { PATH="$RUNTIME/bin:$PATH" "$NPM_BIN" "$@" >> "$LOG" 2>&1; }

# ------------------------------------------------------- 2. the program ----
step "Step 2 of 4 - getting $PRODUCT itself"

ENTRY=""

install_from_release() {
  note "looking for the published release"
  run_npm view "$PKG" version || return 1
  note "installing the released version"
  mkdir -p "$APP"
  if [ "$WANTED_VERSION" = "latest" ]; then
    run_npm install --prefix "$APP" --no-audit --no-fund "$PKG" || return 1
  else
    run_npm install --prefix "$APP" --no-audit --no-fund "$PKG@$WANTED_VERSION" || return 1
  fi
  ENTRY="$APP/node_modules/$PKG/bin/strapi-backup.js"
  check_entry
}

# A successful install and a runnable install are not the same thing. npm can
# unpack a package, and the source can compile, while the file package.json
# names under "bin" is simply absent - which is what happens when that file is
# not committed. Distinguishing the two here is worth the four lines: otherwise
# the customer is told the build failed when it did not, and the log is the only
# way to tell the difference.
check_entry() {
  if [ ! -f "$ENTRY" ]; then
    note "it installed, but the program's starting file is missing from it"
    note "(expected $ENTRY)"
    return 1
  fi
}

install_from_source() {
  REF="main"
  if [ "$WANTED_VERSION" != "latest" ]; then
    REF="v${WANTED_VERSION#v}"
  fi
  note "downloading the source code ($REF)"
  fetch "https://codeload.github.com/$REPO/tar.gz/refs/heads/$REF" "$TMP/src.tar.gz" 2>/dev/null \
    || fetch "https://codeload.github.com/$REPO/tar.gz/refs/tags/$REF" "$TMP/src.tar.gz" 2>/dev/null \
    || return 1

  rm -rf "$ROOT/src"
  mkdir -p "$ROOT/src"
  tar -xzf "$TMP/src.tar.gz" -C "$ROOT/src" --strip-components=1 || return 1

  # Building is the longest thing here, so say so. Two silent minutes reads as a
  # hang, and a customer who kills it half way leaves a broken install behind.
  note "building it - this is the slow part, two or three minutes"
  ( cd "$ROOT/src" && run_npm ci --no-audit --no-fund ) || return 1
  ( cd "$ROOT/src" && run_npm run build ) || return 1

  ENTRY="$ROOT/src/apps/core/bin/strapi-backup.js"
  check_entry
}

case "$CHANNEL" in
  release)
    install_from_release || die "The published release could not be installed. The log at $LOG has the detail."
    ;;
  source)
    install_from_source || die "The source code could not be downloaded or built. The log at $LOG has the detail."
    ;;
  auto)
    if ! install_from_release; then
      note "no published release yet - falling back to building from source"
      install_from_source || die "There is no published release, and the source copy did not produce something runnable. This usually means the product has not been released yet. Check $SUPPORT for where it is up to."
    fi
    ;;
  *)
    die "--channel must be 'release' or 'source', not '$CHANNEL'."
    ;;
esac

note "installed"

# ------------------------------------------------ 3. make it launchable ----
step "Step 3 of 4 - making it easy to start"

# If a future release ships the desktop app alongside the engine, the shortcut
# should open that rather than a terminal. Resolved here instead of assumed, so
# this installer keeps working the day packaging lands without a rewrite.
DESKTOP_APP=""
for candidate in "$APP/desktop/StrapiBackup" "$ROOT/desktop/StrapiBackup" "$APP/desktop/StrapiBackup.App"; do
  if [ -x "$candidate" ]; then
    DESKTOP_APP="$candidate"
    break
  fi
done

mkdir -p "$SHIM_DIR"
{
  printf '#!/bin/sh\n'
  printf '# Generated by the %s installer. Do not edit - re-running the\n' "$PRODUCT"
  printf '# installer overwrites this file.\n'
  printf 'exec "%s" "%s" "$@"\n' "$RUNTIME/bin/node" "$ENTRY"
} > "$SHIM"
chmod +x "$SHIM"
note "command installed: strapi-backup"

if [ "$MAKE_PATH" -eq 1 ]; then
  case ":$PATH:" in
    *":$SHIM_DIR:"*)
      note "PATH already includes $SHIM_DIR"
      ;;
    *)
      # Which file to write depends on the login shell, and getting it wrong
      # means the customer's terminal never finds the command.
      PROFILE="$HOME/.profile"
      case "${SHELL:-}" in
        */zsh)
          PROFILE="$HOME/.zshrc"
          ;;
        */bash)
          if [ "$OS" = "darwin" ]; then PROFILE="$HOME/.bash_profile"; else PROFILE="$HOME/.bashrc"; fi
          ;;
      esac
      if ! grep -q "Strapi Remote Backup Pro" "$PROFILE" 2>/dev/null; then
        {
          printf '\n# Strapi Remote Backup Pro\n'
          printf 'export PATH="%s:$PATH"\n' "$SHIM_DIR"
        } >> "$PROFILE"
        note "added to PATH in $(basename "$PROFILE") - new terminal windows will find it"
      fi
      ;;
  esac
fi

if [ "$MAKE_SHORTCUT" -eq 1 ] && [ -d "$HOME/Desktop" ]; then
  if [ "$OS" = "darwin" ]; then
    # A .command file is the only thing on macOS that double-clicks into a
    # Terminal window without shipping a signed .app bundle.
    LAUNCHER="$HOME/Desktop/$PRODUCT.command"
    if [ -n "$DESKTOP_APP" ]; then
      printf '#!/bin/sh\nexec "%s"\n' "$DESKTOP_APP" > "$LAUNCHER"
    else
      {
        printf '#!/bin/sh\n'
        printf 'clear\n'
        printf '"%s" --help\n' "$SHIM"
        printf 'printf "\\nType a command above, or close this window.\\n\\n"\n'
        printf 'exec "%s" -l\n' "${SHELL:-/bin/sh}"
      } > "$LAUNCHER"
    fi
    chmod +x "$LAUNCHER"
    note "shortcut on your Desktop"
  else
    mkdir -p "$HOME/.local/share/applications"
    DESKTOP_FILE="$HOME/.local/share/applications/strapi-remote-backup-pro.desktop"
    if [ -n "$DESKTOP_APP" ]; then
      EXEC_LINE="$DESKTOP_APP"
      TERM_LINE="false"
    else
      EXEC_LINE="$SHIM --help"
      TERM_LINE="true"
    fi
    {
      printf '[Desktop Entry]\n'
      printf 'Type=Application\n'
      printf 'Name=%s\n' "$PRODUCT"
      printf 'Comment=Back up and restore a Strapi site\n'
      printf 'Exec=%s\n' "$EXEC_LINE"
      printf 'Terminal=%s\n' "$TERM_LINE"
      printf 'Categories=Utility;\n'
    } > "$DESKTOP_FILE"
    chmod +x "$DESKTOP_FILE"
    cp "$DESKTOP_FILE" "$HOME/Desktop/" 2>/dev/null || true
    note "shortcut in your applications menu"
  fi
fi

# ---------------------------------------------------------- 4. self-test ----
step "Step 4 of 4 - checking it actually works"

# Copying files is not evidence. Run the thing and report honestly - including
# the case where it installs perfectly and does nothing, which is exactly where
# this product is today.
INSTALLED_VERSION="$("$SHIM" --version 2>>"$LOG" || echo "")"
if [ -z "$INSTALLED_VERSION" ]; then
  die "It installed, but will not start. The log at $LOG will say why."
fi
note "version $INSTALLED_VERSION starts correctly"

# Searching the help text for "backup" would match the program name itself and
# report a working install every time. Commander prints a "Commands:" heading
# only once at least one subcommand is registered, so that heading, and nothing
# else, is the honest signal that there is something here to run.
READY=0
if "$SHIM" --help 2>>"$LOG" | grep -q "^Commands:"; then
  READY=1
fi

say ""
if [ "$READY" -eq 1 ]; then
  say "-------------------------------------------------------------"
  say " $PRODUCT is installed and working."
  say "-------------------------------------------------------------"
  say ""
  say " Open a new terminal window and back something up:"
  say ""
  say "   strapi-backup backup --url https://your-site.com --email you@example.com"
  say ""
  say " Or just type   strapi-backup   to see everything it can do."
else
  say "-------------------------------------------------------------"
  say " Installed - but this is a preview build."
  say "-------------------------------------------------------------"
  say ""
  say " Everything is in place and the program starts, but the backup"
  say " and restore commands are not finished yet, so there is nothing"
  say " useful to run at the moment."
  say ""
  say " Re-run this installer when a release is announced and it will"
  say " upgrade itself: $SUPPORT"
fi
say ""
say " Installed in:  $ROOT"
say " Log:           $LOG"
say " To remove it:  curl -fsSL <url>/install.sh | sh -s -- --uninstall"
say ""
