#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GSTACK_DIR="${HOME}/.claude/skills/gstack"

echo "== Shia Factory AI stack bootstrap =="
echo "Repo: ${REPO_ROOT}"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: required command '$1' was not found." >&2
    exit 1
  fi
}

need git
need bash
need bun

mkdir -p "$(dirname "${GSTACK_DIR}")"

if [ -d "${GSTACK_DIR}/.git" ]; then
  echo "Updating GStack..."
  git -C "${GSTACK_DIR}" pull --ff-only
else
  if [ -e "${GSTACK_DIR}" ]; then
    echo "ERROR: ${GSTACK_DIR} exists but is not a git checkout. Move it aside and retry." >&2
    exit 1
  fi
  echo "Installing GStack from garrytan/gstack..."
  git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git "${GSTACK_DIR}"
fi

install_gstack_host() {
  local host="$1"
  echo "Installing/updating GStack host profile: ${host}"
  (cd "${GSTACK_DIR}" && bash ./setup --host "${host}")
}

if command -v claude >/dev/null 2>&1; then
  install_gstack_host claude
else
  echo "Claude Code not detected; skipping Claude host profile."
fi

if command -v codex >/dev/null 2>&1; then
  install_gstack_host codex
else
  echo "Codex CLI not detected; skipping Codex host profile."
fi

if command -v hermes >/dev/null 2>&1; then
  install_gstack_host hermes
fi

if ! command -v claude >/dev/null 2>&1 && ! command -v codex >/dev/null 2>&1 && ! command -v hermes >/dev/null 2>&1; then
  echo "No supported AI host CLI was detected. GStack source is installed; rerun this script after installing a host."
fi

echo "Installing/updating GBrain from garrytan/gbrain..."
bun install -g github:garrytan/gbrain

if ! command -v gbrain >/dev/null 2>&1; then
  export PATH="${HOME}/.bun/bin:${PATH}"
fi

if ! command -v gbrain >/dev/null 2>&1; then
  echo "ERROR: gbrain was installed but is not on PATH. Add ${HOME}/.bun/bin to PATH and retry." >&2
  exit 1
fi

GBRAIN_CONFIG="${GBRAIN_HOME:-${HOME}}/.gbrain/config.json"
if [ ! -f "${GBRAIN_CONFIG}" ]; then
  echo "Initializing local PGLite GBrain..."
  gbrain init --pglite
else
  echo "Existing GBrain config detected; leaving its engine unchanged."
fi

register_mcp() {
  local host="$1"
  if ! command -v "${host}" >/dev/null 2>&1; then
    return 0
  fi

  if "${host}" mcp list 2>/dev/null | grep -qiE '(^|[[:space:]])gbrain([[:space:]]|$)'; then
    echo "GBrain MCP already registered for ${host}."
    return 0
  fi

  echo "Registering GBrain MEMORY_VERBS surface for ${host}..."
  "${host}" mcp add gbrain -- gbrain serve --surface verbs || {
    echo "WARNING: MCP registration for ${host} did not complete. Register manually with:" >&2
    echo "  ${host} mcp add gbrain -- gbrain serve --surface verbs" >&2
  }
}

register_mcp claude
register_mcp codex

echo "Running GBrain health check..."
gbrain doctor || {
  echo "WARNING: gbrain doctor reported issues. Review the output before using persistent memory." >&2
}

echo
echo "Bootstrap complete."
echo "Next: read docs/AI_STACK.md, then verify a remember -> fresh-session recall round trip."
