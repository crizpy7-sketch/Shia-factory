#!/bin/bash
# Generated from the upstream gstack team-mode contract and kept intentionally small.
# Block Claude skill usage when no valid global GStack install can be resolved.

_GSTACK_ROOT=""
for _D in "${GSTACK_ROOT:-}" "$HOME/.claude/skills/gstack" "$HOME/.codex/skills/gstack" "$HOME/.factory/skills/gstack" "$HOME/.kiro/skills/gstack" "$HOME/.config/opencode/skills/gstack" "$HOME/.slate/skills/gstack" "$HOME/.cursor/skills/gstack" "$HOME/.openclaw/skills/gstack" "$HOME/.hermes/skills/gstack" "$HOME/.gbrain/skills/gstack" "$HOME/.gstack/repos/gstack"; do
  [ -z "$_GSTACK_ROOT" ] && [ -n "$_D" ] && [ -d "$_D/bin" ] && _GSTACK_ROOT="$_D"
done

if [ -z "$_GSTACK_ROOT" ]; then
  cat >&2 <<'MSG'
BLOCKED: gstack is not installed globally.

Shia Factory requires upstream gstack for AI-assisted engineering workflows.
Run one of the repo bootstrap scripts:
  bash scripts/bootstrap-ai-stack.sh
  powershell -ExecutionPolicy Bypass -File scripts/bootstrap-ai-stack.ps1

Then restart the AI coding tool.
MSG
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"gstack is required but not installed. Run the Shia Factory AI stack bootstrap."}}'
  exit 2
fi

echo '{}'
