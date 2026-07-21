#!/bin/sh
# Mimir installer — https://github.com/tanuj24/mimir
#
#   curl -fsSL https://tanuj24.github.io/mimir/install.sh | sh
#
# Installs the `mimir` CLI to /usr/local/bin (or ~/.local/bin without sudo).
set -eu

RAW_URL="${MIMIR_CLI_URL:-https://tanuj24.github.io/mimir/mimir}"

say() { printf '%s\n' "$*"; }
die() { printf 'install: %s\n' "$*" >&2; exit 1; }

case "$(uname -s)" in
  Darwin|Linux) : ;;
  *) die "unsupported OS: $(uname -s). On Windows, run Mimir via Docker Desktop + WSL for now." ;;
esac

command -v curl >/dev/null 2>&1 || die "curl is required"

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
say "downloading mimir CLI…"
curl -fsSL "$RAW_URL" -o "$tmp" || die "download failed"
head -2 "$tmp" | grep -q "mimir" || die "downloaded file doesn't look right; aborting"
chmod +x "$tmp"

target=""
if [ -w /usr/local/bin ]; then
  target=/usr/local/bin/mimir
elif command -v sudo >/dev/null 2>&1 && [ -d /usr/local/bin ]; then
  say "installing to /usr/local/bin (sudo may prompt)…"
  sudo mv "$tmp" /usr/local/bin/mimir && sudo chmod +x /usr/local/bin/mimir && target=/usr/local/bin/mimir
  trap - EXIT
fi
if [ -z "$target" ]; then
  mkdir -p "$HOME/.local/bin"
  mv "$tmp" "$HOME/.local/bin/mimir"
  trap - EXIT
  target="$HOME/.local/bin/mimir"
  case ":$PATH:" in
    *":$HOME/.local/bin:"*) : ;;
    *) say ""; say "NOTE: add ~/.local/bin to your PATH:"; say '  export PATH="$HOME/.local/bin:$PATH"' ;;
  esac
elif [ -f "$tmp" ]; then
  mv "$tmp" "$target"
  trap - EXIT
  chmod +x "$target"
fi

say ""
say "installed: $target"
say ""
say "Get started:"
say "  mimir start"
