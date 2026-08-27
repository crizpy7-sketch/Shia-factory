$ErrorActionPreference = "Stop"

$source = "project/shia-factory"
$provenance = "Shia Factory repository gbrain/FACTORY_MEMORY_SEED.md"

$memories = @(
  "Shia Factory owns task state, risk, permissions, evidence requirements, exact-candidate acceptance, repair budgets, and escalation; AI workers are replaceable execution units.",
  "GStack is Shia Factory's upstream generic software-engineering execution layer; Shia-specific governance remains in the Shia Factory repository.",
  "GBrain is Shia Factory's persistent memory and retrieval substrate; recalled memory never silently overrides current repository truth.",
  "Shia Factory work must survive workers: checkpoints preserve task state, exact candidate, verification, evidence, receipts, repair budget, blockers, and the exact next action.",
  "Consequential Shia Factory side effects require durable operation IDs and duplicate-safe retry semantics before autonomous recovery.",
  "Reviewer steering may widen a worker's understanding but must not silently widen permissions or write authority.",
  "Shia Factory stores knowledge broadly but retrieves narrowly according to project, task, risk, provenance, confidence, model capability, and context budget.",
  "Only verified trajectories with provenance and evidence are eligible to become authoritative procedural memory or reusable Shia Factory skills.",
  "Repeated Shia Factory friction should produce the smallest durable harness improvement rather than stronger repeated prompting.",
  "Workers may propose skills, prompts, procedural memory, tests, and runbook improvements but may not self-authorize changes to Factory governance, permissions, risk, acceptance, or safety policy.",
  "Stable deterministic mechanics should bypass model reasoning when judgment is not required; read authority and write authority are separate capabilities.",
  "Runtime Wiring v1 is the current Shia Factory implementation priority before adding more conceptual Factory subsystems."
)

if (-not (Get-Command gbrain -ErrorAction SilentlyContinue)) {
  throw "gbrain is not installed or not on PATH."
}

Write-Host "Running GBrain doctor..."
gbrain doctor

foreach ($memory in $memories) {
  Write-Host "Remembering: $memory"
  gbrain remember $memory --provenance $provenance --entity $source
}

Write-Host "\nSeed complete. Recall project memory to verify:"
gbrain recall --entity $source
