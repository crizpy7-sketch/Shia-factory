# BORIS EXAM #001 — Runtime Handshake Loop

**Agent:** BORIS-001 · advisory · Influencers Council
**Subject:** repeated `ready` / `configure` exchange between the Factory host and the block runtimes
**Repository state examined:** `ff51d49` (merged `main`)
**Mandate:** diagnosis only. No code was modified. This document does not close any recertification gate.
**Runtime status at time of exam:** `PENDING_CLAUDE_CODE_RECERTIFICATION` — the host that produced this
diagnosis is not certified as Boris, and this exam does not certify it.

---

## VERIFIED EVIDENCE

All statements below were produced by reading the shipped source and by instrumenting the running
Factory in Chromium over a local static server. The probe registered a passive `message` listener in
the host frame and in both block frames before any page script ran; it recorded traffic and altered
nothing. Prior summaries — including the Factory's own PR notes and my own earlier advisory output —
were treated as unverified claims and re-derived from scratch. One of them turned out to be wrong
(see E5).

### Source facts

| # | Fact | Location |
| --- | --- | --- |
| S1 | The host, on any `ready`, records the instance and then posts `configure` to that frame — unconditionally. | `index.html:84–88` |
| S2 | `runtimeReady` is declared, written on every `ready`, and cleared on re-run — **never read**. Three mentions, no read site. | `index.html:34, 69, 85` |
| S3 | Forms #001 posts `ready` at the end of its script (mount) **and again at the end of its `configure` handler**. | `blocks/forms-001/index.html:54`, `:52` |
| S4 | Records #002 posts `ready` at the end of its script **and again at the end of `configure()`**. | `blocks/records-002/index.html:43`, `:36` |
| S5 | Forms #001's `configure` handler calls `render()`, which rebuilds `#fields` via `innerHTML` — destroying and recreating every input element. | `blocks/forms-001/index.html:38, 52` |
| S6 | Records #002's `configure()` calls `emit('configurationChanged')`, which unshifts into an unbounded `history` array and re-serialises the entire history into the events panel on every call. | `blocks/records-002/index.html:28, 36` |
| S7 | No frame validates `event.origin` or the sender window. Zero occurrences across the host and both blocks. | `index.html`, `blocks/*/index.html` |
| S8 | The host branch that configures on `ready` predates all agent work (`c1f5ec3`, `8d86d65`); the blocks' reply-`ready`-to-`configure` predates it too (`15da3de`, `3e98e5f`). The BORIS-001 integration added only a `readyCounts` counter. | `git log -S` |

### Measured behaviour

| # | Observation | Measurement |
| --- | --- | --- |
| E1 | The exchange never terminates. | Host inbound protocol messages: **84** at 1.2 s, **218** at 3.3 s, **320** at 5.4 s — a sustained ≈60 msg/s across two blocks (≈30/s each), with no decay. |
| E2 | Both instances loop independently and concurrently, starting immediately after mount. | First host events: `ready booking-form` at t+821 ms, then `booking-form` and `appointment-records` alternating every 1–40 ms. |
| E3 | The block side sees the mirror image. | Forms received `configure` at t+60 ms and continuously thereafter. |
| E4 | The exchange is strictly 1:1, not amplifying. | 326 `ready` received by the host; 164 `configure` received by Forms + 163 by Records = 327. One `configure` per `ready`, one `ready` per `configure`. |
| E5 | **Forms #001 is unusable for data entry while mounted.** | The `#name` input was replaced in 19 of 20 samples over 1 s; the element captured at t₀ was already detached. A value set directly was empty 400 ms later. Playwright's `fill()` resolved the element 42 times in 30 s and failed every attempt with "element was detached from the DOM, retrying". |
| E6 | Cost grows without bound inside Records #002. | Events panel content grew 137 356 → 154 966 characters in 2 s (≈9 kB/s), with the full string re-serialised on every iteration. DOM node count stayed at 87 — the leak is in retained history and repeated serialisation, not node accumulation. |
| E7 | The record transport itself still works. | A `port-output`/`submitted` emitted exactly as the block emits it was routed by the host, added by Records (`1 total`), and acknowledged — `acknowledged real addRecord` appeared in the console. |
| E8 | The host-side guard is inert. | `runtimeReady` present in source; the `configure` send is not conditional on it. |
| E9 | The host accepts unauthenticated protocol traffic. | A `ready` for `booking-form` posted from the top window — not from any block frame — was accepted and acted upon. |

**Correction to a prior claim.** The PR notes for the panel work stated that the block runtimes
"still mount and hand off records". E7 confirms the transport; E5 refutes the implied conclusion that
the blocks are usable. Mounting is not usability. Forms #001 cannot be filled in by a human while
the loop runs, which means the *documented* end-to-end path — type a booking, submit it, watch it
arrive — is currently broken in the shipped Factory. Severity: **high**.

---

## ASSUMPTIONS

Stated so they can be falsified rather than inherited.

1. **The 1:1 ratio in E4 implies causation, not merely correlation.** The code paths in S1–S4 are the
   only `ready` and `configure` emitters in the repository, so the cycle is the only available
   explanation. I did not step through with a debugger to prove each individual pairing.
2. **The observed ≈30 msg/s per block is browser- and machine-dependent.** It is bounded by task
   scheduling and by the cost of `render()`, not by anything in the protocol. On a faster machine or
   a smaller schema the rate would rise; the protocol imposes no ceiling at all.
3. **The blocks' post-`configure` `ready` was intended to mean "configuration applied".** This reads
   as the obvious intent from placement — the last statement of the configure handler, after
   `render()` — but no specification says so and no comment states it. If the intent was something
   else, the repair below still holds; only the naming changes.
4. **`ready` is not consumed by anything else.** `runtimeReady` is dead, and the label update is
   cosmetic. Nothing downstream depends on repeated readys. Removing them should be behaviour-neutral
   outside the loop.
5. **Both blocks ignore unknown message types.** Verified by inspection of their handlers, which
   test `m.type` against known values and fall through silently. This is the basis for calling an
   additive message type backward compatible; it was not tested with a synthetic unknown type.
6. **Single-origin deployment.** The Factory and its blocks are served from one origin today, so an
   origin check is currently trivial to add. If blocks are ever hosted elsewhere, the check needs an
   allowlist, not `location.origin`.

---

## ROOT CAUSE

### 1. The exact event sequence

```
Run Factory ▶
  host  creates <iframe src="blocks/<type>/index.html?instance=<id>">
  ────────────────────────────────────────────────────────────────────
  block ──► ready(id)            end of block script — "I have mounted"   [S3/S4]
  host  ──► configure(id, cfg)   host reacts to ready — unconditional     [S1]
  block     applies config, render()
  block ──► ready(id)            end of configure handler                 [S3/S4]
  host  ──► configure(id, cfg)   host reacts to ready — unconditional     [S1]
  block     applies config, render()
  block ──► ready(id)
                        ⋮  no exit condition, both instances, forever
```

Per instance, per cycle: one `configure` in, one full re-render, one `ready` out. Measured at
≈30 cycles/second/block, indefinitely (E1, E4).

### 2. Which side owns each event, and why

| Event | Owner | Correct? |
| --- | --- | --- |
| `ready` #1 (mount announcement) | **Block.** Only the block knows when its script has finished and its DOM exists. | Correct and necessary. |
| `configure` | **Host.** Only the host knows the instance's title and configuration. | Correct as a message; wrong as an unconditional reaction. |
| `ready` #2…n (post-configure) | **Block.** The block is reporting that it applied the configuration. | Correct intent, **wrong token** — it reuses the mount announcement to mean something else. |
| The decision to send `configure` | **Host.** | **Defective.** The host maintains `runtimeReady` precisely so it can tell a first mount from a repeat, and never consults it (S2, E8). |

Neither side is misbehaving by any documented rule, because there is no documented rule. Each side
implemented the only sensible local reading of an ambiguous token.

### 3. The precise root cause

> The runtime contract defines a single untyped token, `ready`, that carries two different meanings —
> *"I have mounted"* and *"I have applied your configuration"* — and defines no terminal state, no
> generation identity, and no idempotency requirement. The host therefore treats every `ready` as a
> fresh mount and answers it with `configure`; the block treats every `configure` as an event worth
> acknowledging with `ready`. Two individually correct implementations compose into a cycle with no
> exit.

The proximate implementation defect is host-side and is one condition wide: `configure` is sent
without consulting `runtimeReady`. The underlying defect is the contract.

### 4. Local implementation bug, or contract weakness?

**Both, and the contract weakness is primary.**

- It is a local bug in the sense that one host-side condition stops the loop today (S2 — the guard is
  already built and merely unused).
- It is a contract weakness in the stronger sense: *no participant violates any specification*. The
  Factory's own progress card names the missing artefact — "Block Interface Standard · Typed ports &
  manifests · 72%". The standard types the **data ports**. It does not type the **lifecycle
  protocol**. Two separately versioned blocks (Forms 1.1.0, Records 0.3.0) independently adopted the
  same reply-with-`ready` pattern, which is what a specification gap looks like from the outside.
- Decisive test of the framing: if only the host is patched, the ambiguity survives. The next block
  that legitimately needs to be re-configured — a schema edit, a theme change, a live inspector
  update — will re-enter the same class of storm through a different door, because "how do I say
  *applied*?" still has only one answer, and that answer is the same token that triggers `configure`.

---

## RECOMMENDED REPAIR

Not implemented. Boris may request rework; he does not land it. Final authority: Cristian.

### Stop-loss (smallest safe correction — host only, no block changes, no wire-format change)

Gate the `configure` send on the state the host already tracks: send `configure` only for an
instance not already in `runtimeReady`, and record membership **before** posting. Repeat `ready`
messages become idempotent no-ops.

- Touches one side, one condition. No block edits, no new message types, no payload changes.
- Backward compatible with every shipped block: they may keep sending `ready` forever; the host
  simply stops answering it.
- Sufficient to end the storm. **Not** sufficient to prevent recurrence.
- **Carries its own regression risk** — see R2 below. Do not ship it without the reload case covered.

### Contract amendment (required to close the class)

1. **Split the token by meaning.** `ready` = "mounted, unconfigured" and is emitted exactly once per
   mount. A new, additive `configured` message = "your configuration is applied". Old blocks that do
   not send `configured` remain correct because the host does not require it; old blocks that keep
   sending extra `ready` remain safe because of the idempotency guard.
2. **Give the handshake a terminal state.** Per instance: `mounted → configured`. The host sends
   `configure` on entry to `mounted` only.
3. **Add a generation token.** Each mount carries a `generation` (or `runId`) minted by the host per
   Run Factory and echoed by the block. Traffic whose generation is stale is dropped. This is what
   makes reload, re-run and in-flight messages from destroyed frames decidable rather than guessed.
4. **Validate the sender.** Accept protocol messages only from a known frame's `contentWindow` and
   from an expected origin (E9).
5. **Bound the reaction.** If a block never reports `configured`, retry `configure` a fixed number of
   times with backoff and then surface a visible runtime error. Unbounded reaction to an unbounded
   stimulus is the shape of this entire defect; the repair should not reintroduce it.
6. **Write it down.** The Block Interface Standard should carry the lifecycle state machine, not just
   port types. Neither block author did anything wrong; they had nothing to read.

---

## REGRESSION TESTS

Deterministic, runnable against the real Factory. T1–T4 fail today; T7 must pass before and after.

| # | Test | Assertion |
| --- | --- | --- |
| **T1** | **Handshake terminates.** Mount both blocks, wait 2 s, then wait 2 s more. | Exactly one `ready` and one `configure` per instance. Counts identical at both checkpoints. Fails today (E1). |
| **T2** | **Bounded traffic.** Count all protocol messages after mount. | ≤ 2 per block (+1 if `configured` is adopted). Fails today (326 in 5.4 s). |
| **T3** | **Configuration still arrives.** After the handshake settles, read the rendered title of each block. | Equals the instance title from the project graph — proves `configure` was delivered, not merely suppressed. |
| **T4** | **Form stability.** Capture `#name`, wait 1 s, set a value, wait 1 s. | Same element identity; value survives. Fails today (E5). |
| **T5** | **Reload safety.** Reload a block iframe after the handshake settles. | The block is re-configured (T3 holds again) and the handshake still terminates (T1 holds). This is the test that catches a naive `has(id)` guard. |
| **T6** | **Re-run safety.** Press Run Factory twice. | One frame per block; counters reset; no `configure` attributable to a previous generation. |
| **T7** | **Record handoff unchanged.** Submit a valid form, or emit `submitted` directly. | Host routes it, Records adds exactly one record, `ack` returns with the same `deliveryId`, latency logged. Passes today (E7) and must keep passing. |
| **T8** | **Foreign and unknown traffic rejected.** Post a `ready` from the top window; post an unknown type; post a known type with an unregistered `instanceId`. | No `configure` sent, no state change. Fails today (E9). |
| **T9** | **Idempotency.** Send five duplicate `ready` messages for one instance. | At most one `configure`. |
| **T10** | **Advisory regression.** Run `Review Runtime` after a settled mount. | `runtime-ready-storm` is absent and `readyCounts` ≤ 1 per instance. Ties the fix to the Factory's own telemetry so a recurrence is caught by the tool that found it. |

T1, T2, T4, T5, T6, T8, T9 are browser-level and need a driver; T10 runs today in the existing Node
suite against `agents/advisory.js`. The absence of a browser test harness in this repository is
itself a finding: every defect in this exam is invisible to the current test suite.

---

## What must remain unchanged

**Forms Block #001 (v1.1.0)** — the `submitted` port: message envelope
`{source:'shia-block-runtime', type:'port-output', instanceId, port:'submitted', dataType:'Record', payload}`,
emitted only on a user submit that passes validation. Field validation rules, the schema-driven
render, acceptance of `configure` with `title` / `schema` / `submitLabel` / `theme`, the self-test
list, and the version string.

**Records Block #002 (v0.3.0)** — `port-input` handling of `addRecord`, the `ack` reply carrying the
same `deliveryId`, `add()` normalisation and first-record `inferConfig`, the `ShiaRecords002` API
(`add` / `getRecords` / `clear` / `configure`), search, sort, filter and export behaviour.

**Glue Engine** — routing from `project.connections` (`submitted` → `addRecord`), type compatibility
checking at connect time, self-connection and duplicate-connection rejection, delivery latency
measurement, the `Validating → Routing → Delivering → Delivered ✓` state text, and the console audit
lines.

**Existing record handoff** — end to end, exactly as measured in E7.

**Envelope vocabulary** — `source:'shia-factory'` / `source:'shia-block-runtime'`, and the existing
types `configure`, `ready`, `port-input`, `port-output`, `ack`. Instance identity continues to come
from the `?instance=` query parameter. Any new message type must be additive and ignorable.

**Agent layer** — BORIS-001 identity, authority boundaries, routing and certification files are
outside the scope of this repair and must not be touched by it.

---

## BROADER FACTORY LESSON

1. **The Block Interface Standard types data and not lifecycle.** Ports have declared types; the
   handshake that brings a block to life has none. A protocol needs the same rigour as a port:
   distinct tokens per meaning, a terminal state, idempotent handling of repeats, a generation
   identifier, and sender validation. Until the standard says so, every new block author will guess,
   and some guesses will compose into loops.
2. **A guard that is never consulted is not a guard.** `runtimeReady` was built for exactly this
   problem and left unread. Prefer designs where the check is the only path to the action, so that
   forgetting it is a compile-or-test failure rather than an invisible one.
3. **Reacting to a signal with a signal that regenerates it is the loop shape.** Any "on X send Y"
   rule should be examined for whether Y can produce X. In this protocol it can, on both sides.
4. **Mounted is not working.** Every prior report — mine included — concluded the runtimes were fine
   because they mounted and the console said `ready`. Liveness checks that watch the transport can
   pass while the product is unusable. Test the user's path, not the framework's heartbeat.
5. **The Factory has no browser-level tests.** Every defect in this exam — the loop, the input
   churn, the unbounded history, the unauthenticated sender — is invisible to the current Node
   suite. The highest-leverage follow-up is not this fix; it is the harness that would have caught it.
6. **The telemetry-driven review earned its keep.** `Review Runtime` surfaced this from observed
   `ready` counts rather than from assumption, which is the correct direction: evidence first,
   explanation second.

---

**Authority.** Advisory only. Boris may challenge and request rework; he cannot merge, deploy or
access secrets. Final authority: Cristian.
**Certification.** This exam is diagnostic work, not evidence of runtime fidelity. No recertification
checkbox is ticked, and `agents/BORIS-001/evals/RECERTIFICATION.md` remains `Status: PENDING`.
