\# DaVinci Constitution for Goose2 on Windows ARM64



This file defines the local execution constitution for working on Goose2 in this repository.



It is a control-plane document, not product code.

It supplements upstream Goose2 guidance and does not replace it.



\---



\## 1. Mission



The goal is to achieve truthful, stable, architecture-correct Goose2 behavior on Windows ARM64.



Primary priorities:



1\. Preserve Goose2’s real runtime architecture.

2\. Preserve ACP as the source of truth.

3\. Preserve the Windows ARM64 sidecar lane.

4\. Prefer smallest-real-diff fixes over broad refactors.

5\. Never fake health, connectivity, persistence, or model state.



\---



\## 2. Source-of-Truth Hierarchy



When diagnosing or changing the system, use this truth order:



1\. Runtime truth

2\. ACP truth

3\. Persisted local state

4\. UI-rendered state

5\. Human assumptions



If the UI disagrees with ACP or runtime behavior, the UI is wrong until proven otherwise.



\---



\## 3. Goose2 Architecture Law



\### 3.1 ACP-first

All live AI/session/message/tool truth must flow through ACP.



Use ACP for:

\- session lifecycle

\- message lifecycle

\- tool lifecycle

\- runtime metadata

\- provider/model state that originates from the runtime



Do not replace ACP truth with:

\- browser-only guesses

\- optimistic fake completion

\- UI-generated status

\- hidden shadow state



\### 3.2 Tauri boundary

Use Tauri commands/events for:

\- settings

\- local config

\- personas

\- session listing

\- local filesystem/desktop integrations

\- bounded request/response work



Do not introduce ad hoc HTTP shims, fake service layers, or duplicate transport paths.



\### 3.3 Sidecar law

Goose2 must remain on the correct sidecar path:



Goose2 UI -> `goose.exe` sidecar -> `goose serve` -> ACP



Do not drift into:

\- `goosed.exe`

\- `goose-server`

\- Electron-era assumptions

\- legacy REST/SSE desktop architecture



\### 3.4 Windows ARM64 law

Preserve the validated Windows ARM64 lane.



Do not casually reintroduce removed native blockers or dependency paths unless explicitly requested and architecturally justified.



\---



\## 4. State Model Law



All state must fall into one of these classes:



\### A. Authoritative runtime state

Examples:

\- active ACP session id

\- message chunks

\- tool status

\- usage/token updates

\- runtime-selected provider/model



\### B. Persisted overlay state

Examples:

\- user-renamed title

\- archived flag

\- selected working directory

\- durable session metadata

\- recoverable local overlays



\### C. Ephemeral view state

Examples:

\- open panel

\- selected tab

\- hover state

\- temporary filters

\- transient UI-only selections



Do not mix these classes casually.



\### Overlay rule

Overlay state may enrich runtime truth, but must not silently replace it.



Bad examples:

\- inventing model state locally

\- preserving stale session metadata over ACP truth

\- hiding missing runtime data with fake UI fallbacks



\---



\## 5. Session and Message Law



\### 5.1 Message lifecycle

A message is complete only when the runtime indicates completion.



The UI may render:

\- pending

\- streaming

\- partial

\- completed

\- failed

\- replayed



Those states must correspond to real runtime events.



\### 5.2 Replay/live separation

Replay paths and live-stream paths must remain logically separate.



Do not collapse replay and live handling into one generic shortcut if that weakens correctness.



\### 5.3 Session metadata law

If provider/model/session metadata is missing in the UI, fix the real propagation path:



runtime/ACP -> handler/api boundary -> store -> selector -> render



Do not patch the status bar first.

Do not add UI-only guesses unless the real source is unavailable and the fallback is clearly marked as a fallback.



\---



\## 6. Health and Truth Labels



Every meaningful subsystem should be mentally classifiable as one of:



\- REAL

\- PARTIAL

\- FAKE-STUB

\- LEGACY

\- PLANNED



Do not accept unlabeled “green” behavior.



A path is healthy only if:

\- the executable path exists

\- the dependency path exists

\- the runtime responds

\- the UI reflects that truth accurately



\---



\## 7. Persistence and Recovery Law



Prefer minimal real persistence.



Order of preference:

1\. small explicit persisted records

2\. compact structured storage

3\. deterministic reload from runtime

4\. only then heavier memory systems



Avoid:

\- giant opaque state dumps

\- browser-local state becoming canonical

\- hidden persistence paths



Recovery must answer:

\- what sessions exist

\- what can be reloaded

\- what is draft-only

\- what was persisted

\- what was not recoverable



\---



\## 8. Code Change Law



\### 8.1 Smallest-real-diff

Prefer the smallest change that repairs the real boundary violation.



Do not:

\- refactor unrelated modules during a truth fix

\- introduce abstractions prematurely

\- patch symptoms if the boundary below is broken

\- widen scope unless the failure proves the architecture is wrong



\### 8.2 Boundary-first debugging

Before editing, identify:

\- source of truth

\- owning module

\- downstream consumers

\- persistence impact

\- runtime validation path



\### 8.3 No duplicate canonical definitions

A type, contract, or state model gets one canonical location.



Avoid duplicating source-of-truth concepts across:

\- UI state

\- ad hoc helper types

\- fallback caches

\- convenience wrappers



\---



\## 9. Tool Routing Law



Before acting, classify the task:



\- runtime interaction

\- repo/code inspection

\- local desktop command

\- configuration mutation

\- artifact generation

\- evaluation/benchmarking

\- persistence/recovery



Use the narrowest correct tool or path.



Do not:

\- use UI patching for runtime truth failures

\- use documentation as a substitute for reading the active codepath

\- use broad repo edits when a local boundary fix is enough



\---



\## 10. Benchmark and Evaluation Law



If work becomes:

\- multi-run

\- multi-model

\- artifact-heavy

\- comparison-oriented

\- cache-sensitive

\- telemetry-heavy



then it is now a data architecture problem, not a UI tweak.



Design eval/benchmark features around:

\- run id

\- config snapshot

\- artifact manifest

\- metrics

\- timestamps

\- pass/fail/error state

\- exportability



\---



\## 11. Memory Law



Memory must start minimal, inspectable, and real.



Preferred forms:

\- persisted notes

\- explicit overlays

\- compact local records

\- artifact-linked history



Avoid foundational reliance on opaque memory systems.



If the system “remembers” something, a developer must be able to inspect:

\- what it remembers

\- where it came from

\- why it is being used



\---



\## 12. Anti-Drift Triggers



Stop and reassess if any of these appear:



\- repeated UI patches for backend/runtime truth failures

\- multiple competing session identities

\- hidden persistence layers

\- temporary caches becoming authoritative

\- repeated “just one more fallback”

\- active feature claims with no real runtime path

\- debugging that no longer names the exact breakpoint



\---



\## 13. Local Windows ARM64 Rules



These rules are specific to this repo on this machine:



\- Preserve the validated ARM64 `goose.exe` sidecar lane.

\- Do not resume legacy `goosed.exe` work.

\- Do not introduce AppData mutation casually during validation.

\- Prefer isolated temp homes/configs during runtime verification where practical.

\- Do not rebuild Rust unless the current breakpoint requires it.

\- Runtime verification beats static reasoning once the build exists.



\---



\## 14. Execution Style



When working on Goose2 in this repo:



1\. Read the active codepath first.

2\. Name the breakpoint precisely.

3\. Patch the owning boundary.

4\. Validate with a real runtime path.

5\. Report exact files changed and exact runtime result.



Do not continue iterating once the real breakpoint is fixed unless a new verified breakpoint appears.



\---



\## 15. Current Priority



Current repository priority:



\- Finish truthful Goose2 runtime/state parity on Windows ARM64.

\- Preserve ACP-first architecture.

\- Fix only proven breakpoints.

\- Validate with real UI runs.



This constitution should be consulted before nontrivial changes.

