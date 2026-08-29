# ATTUNE

## Codex Master Build Specification

### Progressive WebMCP Product PRD, Domain Semantics, Architecture, Commerce Handoff, Evals, and Release Plan

**Status:** Build authority / challenge scope freeze
**Project submission name:** Attune
**Tagline:** **Create what doesn't exist yet.**
**Secondary line:** **From requirement to verified reality.**
**Challenge vertical:** Custom 2D flat-part fabrication
**Primary commercial system:** Shopify
**Primary browser-agent standard:** WebMCP
**Primary application stack:** Next.js + React + TypeScript on Vercel
**Primary artifact storage:** Cloudflare R2
**WebMCP QA:** ChatGPT in-app browser, WebMCP-enabled Chrome, Cloudflare Browser Run lab
**Repository purpose:** This file is the source of truth Codex should follow when creating the project.
**Naming status:** Attune is the chosen Devpost/project submission name for this build. It is not represented here as trademark or domain clearance; active software/AI companies already use the Attune name.

---

# 0. Instructions to Codex

Treat this document as the build authority.

## 0.1 Priority vocabulary

Every implementation requirement belongs to one of three levels:

- **MUST** — required for the submitted challenge product.
- **SHOULD** — high-value and should ship only after all MUST requirements are reliable.
- **DEFER** — architecture may reserve a place for it, but do not spend challenge time implementing it.

When a later section conflicts with an earlier section, prefer:

1. MUST over SHOULD over DEFER.
2. Domain correctness over UI convenience.
3. Deterministic verification over model judgment.
4. A reliable smaller implementation over an incomplete larger one.

## 0.2 Build-order rule

Do not implement the entire long-term editor before proving the challenge thesis.

The challenge-critical chain is:

```text
CO-CREATE
  ↓
PROVE
  ↓
COMMIT
  ↓
CAPABILITY ACCRUES
  ↓
MATERIALIZE INTO SHOPIFY
  ↓
SHOPIFY NATIVE WEBMCP HANDOFF
  ↓
VERIFY LINKAGE
  ↓
CHANGE SPECIFICATION
  ↓
STALE AUTHORITY REVOKED
```

Everything else is subordinate.

## 0.3 No fake “AI logic”

Do not use an LLM to determine:

- geometric validity;
- manufacturability;
- whether a revision is current;
- whether a quote matches a revision;
- whether a buyer/provider commitment exists;
- whether a capability is authorized;
- whether Shopify state matches the agreed revision.

LLMs interpret intent, summarize, compare, and orchestrate. Deterministic application code owns truth.

## 0.4 No separate AI mutation path

Human UI and WebMCP MUST call the same semantic command bus.

Never create a second mutation implementation “for the agent.”

## 0.5 Challenge code must be public and reproducible

The official rules require a working hosted project, a public open-source repository with a visible license, and source/assets/instructions sufficient for the project to function.

Local development may use deterministic fake external providers. The submitted live path MUST use real Shopify APIs where this document says it does.

---

# 1. Why Attune exists

Most web commerce begins after a product already exists.

```text
existing product
→ price
→ cart
→ checkout
```

Custom physical work begins earlier.

```text
“I need something”
→ What exactly?
→ What may not change?
→ Is it technically possible?
→ Which tradeoff should we choose?
→ What can the maker actually support?
→ Which exact revision is the maker quoting?
→ Which exact revision is the customer accepting?
→ Only now is there something safe to sell
```

Attune exists in that gap.

It allows a customer, a provider, and their browser agents to **co-create a custom physical specification until it becomes technically valid, mutually agreed, and commerce-addressable**.

The product is not a CAD editor with checkout bolted on.

The primary object is an **Executable Commitment**.

The 2D editor is one projection of that object.

Shopify is another projection.

A production artifact is another projection.

Receipts and later conformance are additional projections.

---

# 1A. Multiple submissions rule — updated

The current Official Rules now permit multiple submissions by the same Entrant.

The operative rule is:

> **An Entrant may submit more than one Submission, however, each Submission must be unique and substantially different from each of the Entrant’s other Submissions.**

Sponsor and Devpost determine whether submissions are sufficiently different in their sole discretion.

Therefore:

```text
ONE ENTRANT
→ MAY SUBMIT MULTIPLE PROJECTS

BUT

Submission A
≠ minor variant of Submission B
≠ same product with a different vertical
≠ same codebase with superficial rebranding
```

For Attune:

- **Attune remains one integrated Submission.**
- Do not split Attune's editor, capability runtime, Shopify handoff, or verification stages into separate submissions.
- A second submission is allowed only if it is a genuinely distinct product with a substantially different:
  - core problem;
  - shared human-agent object;
  - workflow;
  - primary user;
  - interaction primitive;
  - and challenge story.
- Reusing generic infrastructure is not itself the issue; the resulting submitted Projects must still be substantially different.
- If time becomes scarce, prioritize making Attune excellent rather than diluting execution quality across multiple entries.

The rules also separately allow an eligible individual to participate through more than one Team or Organization and to enter individually.

Official source:
https://webmcp.devpost.com/rules

Current rule verification should be repeated immediately before submission because the Official Rules expressly state that they may be amended during the Hackathon.

---

# 2. Literal fit to the WebMCP Challenge

The official WebMCP Challenge asks for:

> a WebMCP-powered web app that imagines and explores the future of the open web—where humans and agents can interact, collaborate, and create together.

The judging criteria are:

1. **WebMCP Leverage**
2. **Execution**
3. **Potential Impact**
4. **Creativity & Ambition**

They are equally weighted; WebMCP Leverage is the first tie-break criterion.

Attune must visibly satisfy each.

## 2.1 Humans

Humans:

- express lived requirements;
- directly manipulate the canvas;
- lock non-negotiable interfaces;
- choose tradeoffs;
- set commercial terms;
- make buyer/provider commitments;
- decide whether to accept a substantive change.

## 2.2 Agents

The user's browser agent:

- converts natural language into semantic specification edits;
- performs exact multi-step changes through WebMCP tools;
- inspects technical conflicts;
- asks the application for deterministic valid alternatives;
- explains those alternatives;
- stages downstream operations;
- crosses from Attune into Shopify after commerce materialization.

## 2.3 Together

Both operate the same domain model.

```text
Human UI ─────────────┐
                      │
                      ▼
             Executable Commitment
                      ▲
                      │
Browser agent / WebMCP┘
```

There is no Attune-owned chatbot.

WebMCP lets the user's own compatible browser agent participate in the application.

---

# 3. Challenge-facing product story

Use the public lifecycle:

# **IMAGINE → CO-CREATE → PROVE → COMMIT → MAKE REAL → VERIFY**

If reality diverges later:

# **VERIFY → RESOLVE**

Internally, the lifecycle is more detailed:

```text
NEED
↓
DESIGN
↓
PROVE
↓
COMMIT
↓
MATERIALIZE
↓
SHOP
↓
VERIFY
↓
INVALIDATE / REVISE
```

The challenge video should spend substantial time on **co-creation**, not just commerce.

---

# 4. Primary real-world vertical

## 4.1 Custom flat-part fabrication

The challenge vertical is deliberately 2D because for flat sheet-cut parts a 2D DXF can be the production definition itself.

Examples:

- equipment front panels;
- enclosure faceplates;
- mounting plates;
- laser-cut acrylic;
- flat sheet-metal parts;
- gaskets;
- control panels;
- signage;
- foam insert profiles.

The app does **not** claim to solve arbitrary 3D manufacturing.

For parts requiring bends or full 3D form, Attune is outside P0 scope.

## 4.2 Seeded challenge job

The standard demo commitment is:

```text
Commitment ID: AT-1042
Product: Custom equipment panel

Envelope:
218 mm × 120 mm

Material:
3 mm acrylic

Quantity:
4

Interfaces:
4 buyer-locked enclosure mounting holes

Additional features:
2 symmetric auxiliary holes
1 cable/connector slot

Provider manufacturing rule:
minimum slot-to-edge / slot-to-mount clearance = 12 mm

Acceptance:
selected dimensions/tolerances
```

Opening state intentionally contains one conflict:

```text
Required clearance: 12.0 mm
Observed clearance: 8.1 mm
Deficit: 3.9 mm
State: NOT BUILDABLE
```

A judge should understand the problem in under ten seconds.

---

# 5. Primary semantic object: Executable Commitment

```ts
export interface ExecutableCommitment {
  id: CommitmentId;
  projectId: ProjectId;

  title: string;
  state: CommitmentState;

  intent: IntentModel;
  draft: SpecificationDraft;
  frozenRevisions: FrozenRevision[];

  commercial: CommercialState;
  commerce: CommerceState;

  capabilityEpoch: number;

  createdAt: string;
  updatedAt: string;
}
```

Conceptual structure:

```text
ExecutableCommitment

Intent
├ desired outcome
├ references
├ priorities
├ non-negotiables
└ unknowns

Specification
├ 2D geometry
├ dimensions
├ material
├ thickness
├ tolerances
├ quantity
└ fabrication semantics

Constraints
├ geometric constraints
├ buyer locks
├ provider manufacturing rules
└ acceptance conditions

Commercial
├ quote
├ price
├ lead time
├ validity
├ provider commitment
└ buyer commitment

Authority
├ frozen revision
├ spec hash
├ actor role
└ capability epoch

Commerce
├ materialization status
├ Shopify product
├ Shopify variant
├ storefront URL
└ verification state

Evidence
├ transaction receipts
├ external rereads
└ conformance records
```

The specification is not only geometry.

---

# 6. Core TypeScript identifiers

Use branded string IDs or opaque aliases.

```ts
export type CommitmentId = string;
export type ProjectId = string;
export type RevisionId = string;
export type DraftVersion = number;
export type CapabilityEpoch = number;
export type EntityId = string;
export type ConstraintId = string;
export type QuoteId = string;
export type ReceiptId = string;
export type CommerceLinkId = string;
```

All persisted consequential records include:

```ts
interface Provenance {
  actorId: string;
  actorRole: ActorRole;
  origin: 'human' | 'webmcp' | 'system' | 'provider';
  transactionId: string;
  createdAt: string;
}
```

---

# 7. Roles

```ts
export type ActorRole = 'buyer' | 'provider' | 'production' | 'judge';
```

Challenge P0 requires buyer and provider.

Production may exist as a UI/state placeholder but is not a hard dependency for the core cross-site Shopify demo.

## 7.1 Buyer authority

Buyer can:

- define the desired outcome;
- lock interfaces;
- edit permitted specification fields;
- choose valid technical alternatives;
- accept provider quote for an exact revision;
- request commerce materialization after mutual commitment.

Buyer cannot:

- create provider commitment;
- change provider manufacturing rules;
- fabricate provider price;
- bind a provider to a different revision.

## 7.2 Provider authority

Provider can:

- define manufacturing rules;
- inspect buildability;
- propose a revision;
- set price and lead time;
- commit to an exact frozen revision.

Provider cannot:

- accept on behalf of buyer;
- move buyer-locked interfaces;
- silently mutate a quoted revision.

---

# 8. Intent model

```ts
export interface IntentModel {
  outcome: string;
  references: ReferenceAsset[];
  priorities: Priority[];
  nonNegotiables: NonNegotiable[];
  unknowns: UnknownRequirement[];
}
```

Example:

```json
{
  "outcome": "Create a front panel that fits the existing enclosure",
  "priorities": [
    { "key": "preserve_mounts", "weight": 1.0 },
    { "key": "minimize_panel_growth", "weight": 0.7 }
  ],
  "nonNegotiables": ["mount_A", "mount_B", "mount_C", "mount_D"]
}
```

The LLM may help structure this language.

The application stores the structured form.

---

# 9. Specification draft and frozen revisions

Do not make every pointer movement a frozen revision.

Use two layers:

## 9.1 Mutable working draft

```ts
export interface SpecificationDraft {
  version: DraftVersion;
  baseRevisionId: RevisionId | null;

  document: SketchDocument;
  fabrication: FabricationSpec;

  validation: ValidationSnapshot | null;
  updatedAt: string;
}
```

Every semantic command increments `draft.version`.

## 9.2 Frozen revision

A revision is immutable.

```ts
export interface FrozenRevision {
  id: RevisionId;
  number: number; // r7
  commitmentId: CommitmentId;

  document: SketchDocument;
  fabrication: FabricationSpec;

  specHash: string; // SHA-256 canonical hash
  validation: ValidationSnapshot;

  frozenAt: string;
  frozenBy: string;
}
```

A quote, commitment, and commerce materialization MUST bind to a frozen revision.

## 9.3 Editing after agreement

If r7 has been mutually committed and the user edits any material field:

```text
r7 remains immutable
↓
clone into new mutable draft
↓
display “Draft r8”
```

The existing quote/commitments remain historical truth for r7.

They do not transfer to r8.

---

# 10. Canonical geometry model

Long-term architecture uses a vector network; P0 implements only a subset.

```ts
export interface SketchDocument {
  schemaVersion: 1;
  units: 'mm';

  nodes: Record<EntityId, SketchNode>;
  edges: Record<EntityId, SketchEdge>;
  constraints: Record<ConstraintId, SketchConstraint>;

  generatedFeatures: Record<EntityId, GeneratedFeature>;
  metadata: SketchMetadata;
}
```

## 10.1 Nodes

```ts
export interface SketchNode {
  id: EntityId;
  x: number;
  y: number;
  fixed?: boolean;
  construction?: boolean;
  semanticRole?: string;
}
```

## 10.2 Edges

```ts
export type SketchEdge = LineEdge | CircularArcEdge | CircleEdge;
```

Challenge MUST support:

- lines;
- circular arcs;
- circles;
- generated rectangles;
- generated slots.

DEFER:

- ellipse;
- Bézier;
- B-spline;
- conic;
- general face topology;
- Illustrator effects.

The document format may reserve future extensibility.

---

# 11. Generated features

Rectangle and slot should be semantic feature generators rather than unrelated pixel paths.

```ts
export interface PanelFeature {
  type: 'panel';
  id: EntityId;
  width: number;
  height: number;
  cornerRadius?: number;
}

export interface HoleFeature {
  type: 'hole';
  id: EntityId;
  centerNodeId: EntityId;
  diameter: number;
  role: 'mount' | 'auxiliary';
}

export interface SlotFeature {
  type: 'slot';
  id: EntityId;
  center: { x: number; y: number };
  width: number;
  height: number;
  orientationDeg: number;
}
```

Each generated feature maps into canonical geometry.

WebMCP operates on semantic feature IDs wherever possible.

---

# 12. Geometry constraints

Challenge constraint vocabulary:

```ts
export type GeometricConstraint =
  | CoincidentConstraint
  | HorizontalConstraint
  | VerticalConstraint
  | ParallelConstraint
  | PerpendicularConstraint
  | TangentConstraint
  | ConcentricConstraint
  | EqualConstraint
  | SymmetryConstraint
  | FixedConstraint
  | DistanceConstraint
  | RadiusConstraint
  | DiameterConstraint
  | AngleConstraint;
```

MUST:

- coincident;
- horizontal;
- vertical;
- equal;
- symmetry;
- fixed;
- dimensions.

SHOULD:

- parallel;
- perpendicular;
- tangent;
- concentric.

DEFER advanced spline continuity.

---

# 13. Geometric solver

Use a solver adapter.

```ts
export interface ConstraintSolver {
  solve(input: SolverDocument): Promise<SolveResult>;

  drag(
    input: SolverDocument,
    drivers: DragDriver[],
    temporaryConstraints: SolverConstraint[],
  ): Promise<SolveResult>;

  diagnose(input: SolverDocument): Promise<SolveDiagnosis>;
}
```

Preferred implementation:

`@salusoft89/planegcs` in a dedicated Web Worker.

PlaneGCS supports temporary constraints intended for sketcher mouse dragging and includes point/line/circle/arc/B-spline support.

Do not make PlaneGCS the canonical document model.

Translate from Attune domain geometry into a solver projection.

---

# 14. Manufacturing/domain rules

Do not encode all manufacturing policy in the geometric solver.

Use ordinary deterministic TypeScript rules.

```ts
export interface FabricationSpec {
  material: 'acrylic' | 'aluminum';
  thicknessMm: number;
  quantity: number;
  finish?: string;

  acceptance: AcceptanceCriterion[];
}
```

Provider rule model:

```ts
export interface FabricationRule {
  id: string;
  code:
    | 'MIN_EDGE_CLEARANCE'
    | 'MIN_FEATURE_WIDTH'
    | 'SUPPORTED_THICKNESS'
    | 'SUPPORTED_MATERIAL'
    | 'CLOSED_PROFILE';

  severity: 'hard' | 'warning';
  params: Record<string, number | string | boolean>;
}
```

P0 seeded provider rules:

```text
Material: acrylic
Supported thickness: 3mm
Minimum slot clearance: 12mm
Minimum hole diameter: 3mm
```

---

# 15. Validation snapshot

```ts
export interface ValidationSnapshot {
  draftVersion: DraftVersion;
  evaluatedAt: string;

  technicalStatus: 'valid' | 'conflict' | 'incomplete';

  results: ValidationResult[];
  hardFailureCount: number;
}
```

Example result:

```ts
{
  ruleId: "clearance.slot.edge",
  status: "fail",
  expected: { minMm: 12 },
  observed: { mm: 8.1 },
  delta: { mm: -3.9 },
  entities: ["slot_1", "panel_outline"]
}
```

The LLM may explain this result.

It may not change the result.

---

# 16. Deterministic alternatives

Challenge P0 does not require a general optimization engine.

Implement a deterministic candidate generator for the seeded domain.

```ts
export interface DesignAlternative {
  id: string;
  label: string;
  commands: DomainCommand[];
  preserves: string[];
  violates: string[];
  validation: ValidationSnapshot;
  costVector: {
    movementMm: number;
    panelGrowthMm: number;
    lockedChanges: number;
  };
}
```

Seeded alternatives may include:

```text
A — move slot +4 mm
B — increase panel width +8 mm
C — move locked mount
D — reduce provider clearance
```

Only A/B pass all hard constraints.

Ranking can be deterministic using buyer priority weights.

The model explains.

The application computes.

---

# 17. Interaction architecture

The editor runtime sits outside React.

```text
Pointer / keyboard
      ↓
InteractionEngine
      ↓
IntentEngine
      ↓
semantic preview
      ↓
solver / validation
      ↓
renderer
      ↓
commit DomainCommand
```

React owns:

- toolbar;
- requirements panel;
- inspector;
- numeric inputs;
- role switcher;
- Capability Lens;
- receipts;
- quote/commitment UI.

React MUST NOT own every pointermove.

---

# 18. Direct-manipulation doctrine

Use:

```text
HOVER
→ AFFORDANCE
→ PREVIEW
→ COMMIT
→ PERSISTENT SEMANTICS
```

Never silently mutate topology.

During a transformation:

- original geometry remains ghosted;
- proposed geometry is solid;
- fixed geometry is visually locked;
- solver-moved geometry is distinguishable from grabbed geometry.

Challenge P0 should feel predictable, not feature-rich.

---

# 19. Intent Engine

The Intent Engine is not the solver.

It ranks likely temporary relationships.

```ts
export interface SnapCandidate {
  type: 'endpoint' | 'midpoint' | 'horizontal' | 'vertical' | 'coincident' | 'tangent' | 'symmetry';

  score: number;
  confidence: number;
  targetIds: EntityId[];
  proposedConstraints: SketchConstraint[];
}
```

Ranking inputs:

- screen-space proximity;
- pointer trajectory;
- selected geometry;
- active operation;
- current constraint graph;
- symmetry;
- recent creation.

Only the best candidate or best two candidates should be displayed.

Temporary constraints are never persisted invisibly.

---

# 20. Semantic command bus

All durable mutations are commands.

```ts
export type DomainCommand =
  | SetPanelSizeCommand
  | MoveFeatureCommand
  | SetHoleDiameterCommand
  | SetSlotSizeCommand
  | SetDimensionCommand
  | AddConstraintCommand
  | RemoveConstraintCommand
  | LockEntityCommand
  | UnlockEntityCommand
  | SetMaterialCommand
  | SetQuantityCommand;
```

Each command includes:

```ts
interface CommandEnvelope<C extends DomainCommand> {
  transactionId: string;
  commitmentId: CommitmentId;
  baseDraftVersion: DraftVersion;
  origin: 'human' | 'webmcp' | 'system';
  actorId: string;
  command: C;
}
```

Compound operations execute atomically.

---

# 21. Batched agent transactions

Use one strong semantic tool rather than dozens of micro-tools for multi-step design changes.

```ts
export interface ApplySpecChangesInput {
  commitmentId: CommitmentId;
  baseDraftVersion: DraftVersion;
  intent: string;
  commands: DomainCommand[];
}
```

Maximum command count P0: 20.

Server/client domain layer:

1. verify base version;
2. validate all commands;
3. apply transaction in memory;
4. solve geometry;
5. validate manufacturing;
6. if command transaction is invalid, reject atomically;
7. persist;
8. increment draft version;
9. produce receipt;
10. update UI;
11. return concise WebMCP result.

---

# 22. Application-authored receipts

Every committed transaction creates a receipt.

```ts
export interface ChangeReceipt {
  id: ReceiptId;
  commitmentId: CommitmentId;

  origin: 'human' | 'webmcp' | 'system';
  actorId: string;

  intent?: string;

  baseDraftVersion: number;
  resultingDraftVersion: number;

  observedChanges: ObservedChange[];
  preservedFacts: PreservedFact[];

  validationBefore?: ValidationSnapshot;
  validationAfter?: ValidationSnapshot;

  capabilityDelta: CapabilityDelta;

  createdAt: string;
}
```

The receipt MUST distinguish:

```text
AGENT INTENT
what the model requested

OBSERVED CHANGE
what Attune actually changed

CONFORMANCE
what deterministic rules say afterward

CAPABILITY EFFECT
what became available or became stale
```

Example UI:

```text
AGENT CHANGE

Intent
Keep four fixed mounts and make
the smallest valid change.

Observed
Connector slot X
84.0 → 88.0 mm

Preserved
Mount A ✓
Mount B ✓
Mount C ✓
Mount D ✓

Technical conformance
12 / 12 PASS

Capability effect
+ Request Quote
```

This receipt must also have a semantic DOM representation for screen readers.

---

# 23. Commercial model

```ts
export interface Quote {
  id: QuoteId;
  commitmentId: CommitmentId;
  revisionId: RevisionId;
  revisionNumber: number;
  specHash: string;

  providerId: string;
  currency: string;
  totalPrice: string;
  leadTimeDays: number;
  validUntil: string;

  status: 'draft' | 'committed' | 'stale';
}
```

Buyer acceptance:

```ts
export interface BuyerAcceptance {
  commitmentId: CommitmentId;
  revisionId: RevisionId;
  specHash: string;
  buyerId: string;
  acceptedAt: string;
}
```

Provider commitment:

```ts
export interface ProviderCommitment {
  commitmentId: CommitmentId;
  revisionId: RevisionId;
  specHash: string;
  quoteId: QuoteId;
  providerId: string;
  committedAt: string;
}
```

An agreed revision exists only when:

```text
revision technically valid
AND
provider commitment matches revision/hash
AND
buyer acceptance matches revision/hash
```

---

# 24. Capability Accrual

Capabilities are derived consequences of current truth.

Do not treat tool registration as authorization.

```ts
export interface CapabilityContext {
  commitment: ExecutableCommitment;
  actor: {
    id: string;
    role: ActorRole;
  };
  commerceState: CommerceState;
}
```

Guard concept:

```ts
export interface CapabilityDefinition {
  name: CapabilityName;
  phase: CapabilityPhase;
  mutability: 'read' | 'stage' | 'execute';
  risk: 'low' | 'medium' | 'high';
  reversible: boolean;
  humanConfirmation: boolean;

  isLegal(ctx: CapabilityContext): CapabilityDecision;
}
```

`CapabilityDecision`:

```ts
type CapabilityDecision = { legal: true } | { legal: false; reasonCode: string; message: string };
```

Key rule:

```text
A capability is not present because the product implements an endpoint.
It is present because the facts that justify that endpoint are currently true.
```

---

# 25. Capability names

P0 capability vocabulary:

```ts
export type CapabilityName =
  | 'inspect_commitment'
  | 'inspect_constraints'
  | 'inspect_capabilities'
  | 'apply_spec_changes'
  | 'validate_buildability'
  | 'compare_valid_changes'
  | 'request_quote'
  | 'inspect_quote'
  | 'stage_acceptance'
  | 'materialize_for_commerce'
  | 'inspect_commerce_link'
  | 'continue_to_shopify';
```

Provider-only human UI additionally exposes quote commitment.

Do not expose buyer agent tooling that lets the buyer set provider price.

---

# 26. Capability Frontier

Legal capabilities and recommended frontier are different.

Compute:

```text
all implemented actions
↓
hard legality guards
↓
currently legal capabilities
↓
frontier policy
↓
small WebMCP tool set
```

The frontier is the smallest useful legal set that:

- reduces current uncertainty;
- resolves a hard blocker;
- verifies a recent consequential action;
- or advances the declared goal.

## 26.1 Priority policy

Use deterministic lexicographic priority.

### P0 — verification first

If a consequential external mutation is pending verification, the frontier must favor inspection/verification.

### P1 — missing information

If required specification information is incomplete, expose tools that fill/inspect it.

### P2 — hard technical conflict

If buildability is blocked, expose conflict/alternative/edit tools.

### P3 — commercial progression

If the spec is valid but unquoted, expose quote progression.

### P4 — commitment

If quote exists but buyer/provider commitment is incomplete, expose review/staging.

### P5 — materialization

If mutually committed and not materialized, expose commerce materialization.

### P6 — stable state

Expose read tools.

The frontier should generally contain 3–6 tools.

---

# 27. Capability epoch and stale execution

Every semantic change that can affect consequential authority increments:

```ts
commitment.capabilityEpoch += 1;
```

Consequential WebMCP inputs include:

```ts
interface ConsequentialAuthorityToken {
  commitmentId: CommitmentId;
  revisionId: RevisionId;
  specHash: string;
  capabilityEpoch: number;
}
```

Server revalidates all fields before external execution.

If stale:

```json
{
  "status": "rejected",
  "code": "STALE_CAPABILITY",
  "message": "The specification or authority changed. Re-inspect the current commitment."
}
```

Dynamic WebMCP registration is discoverability.

It is never the final security boundary.

---

# 28. WebMCP implementation

Use the imperative API:

```ts
document.modelContext.registerTool(...)
```

Feature-detect:

```ts
const modelContext = typeof document === 'undefined' ? undefined : document.modelContext;

if (!modelContext?.registerTool) {
  // render manual-mode notice
}
```

Use AbortController for lifecycle registration.

The installed WebMCP authoring guidance requires:

- clear read/stage/complete naming;
- concise JSON outputs;
- visible UI updated before returning;
- lifecycle cleanup with AbortSignal;
- native imperative registration.

---

# 29. WebMCP registry architecture

```text
CapabilityCompiler
      ↓
CapabilityFrontier
      ↓
WebMcpRegistry
      ↓
document.modelContext.registerTool()
```

Files:

```text
packages/webmcp/
  capability-to-tool.ts
  tool-definitions.ts
  schemas.ts
  register.ts
  results.ts
```

React:

```text
apps/web/src/hooks/useAttuneWebMcp.ts
```

The hook may mount/unmount tool registration.

Tool definitions themselves must not depend on React.

---

# 30. P0 WebMCP tools

## 30.1 inspect_commitment

Read-only.

Returns concise current structured state:

```json
{
  "commitmentId": "AT-1042",
  "draft": "r8",
  "technicalState": "conflict",
  "hardFailures": 1,
  "buyerLocks": 4,
  "commercialState": "not_quoted"
}
```

Annotations:

```ts
{ readOnlyHint: true, untrustedContentHint: false }
```

## 30.2 inspect_constraints

Read-only.

Returns hard technical conflicts and relevant entities.

## 30.3 inspect_capabilities

Read-only.

Returns:

- current frontier;
- blocked consequential capabilities;
- concise reason for each block.

This is also judge-visible in the Capability Lens UI.

## 30.4 apply_spec_changes

Mutation.

Input:

```json
{
  "commitmentId": "AT-1042",
  "baseDraftVersion": 13,
  "intent": "Keep four fixed mounts and move the connector slot enough to satisfy clearance.",
  "commands": [
    {
      "type": "move_feature",
      "featureId": "slot_1",
      "dxMm": 4,
      "dyMm": 0
    }
  ]
}
```

Returns receipt summary only after UI state has updated.

## 30.5 validate_buildability

May compute and persist validation but should be idempotent.

Returns technical status and only material failures.

## 30.6 compare_valid_changes

Read/compute tool.

Input includes goal and protected requirements.

It calls deterministic candidate generation and returns valid options.

## 30.7 request_quote

Stage tool.

Preconditions:

- frozen valid revision exists;
- actor buyer;
- no current provider quote for revision.

P0 implementation may create a quote request record and switch provider UI to “quote requested.”

## 30.8 inspect_quote

Read-only.

## 30.9 stage_acceptance

Stage only.

The agent can stage an acceptance and show the exact revision/price/lead time.

The human must confirm through visible UI.

Do not allow the agent to silently become the buyer's final commercial authority.

## 30.10 materialize_for_commerce

High-value consequential tool.

Preconditions:

- actor buyer or provider according to policy;
- frozen technically valid revision;
- current provider commitment;
- current buyer acceptance;
- matching quote;
- not already materialized;
- authority token current.

This tool creates/publishes the revision-bound Shopify product.

## 30.11 inspect_commerce_link

Read-only.

Returns verified Shopify product/variant identity and matching revision.

## 30.12 continue_to_shopify

Navigation tool.

Takes user to the exact Shopify storefront product URL.

After navigation, Attune's tools disappear because the origin changes.

Shopify's native storefront WebMCP tools become available on the Shopify page.

---

# 31. Critical open-web handoff

This is a central challenge innovation.

```text
ATTUNE ORIGIN
human + agent co-create
↓
technical proof
↓
buyer/provider exact-revision agreement
↓
materialize_for_commerce
↓
revision-bound Shopify product

                NAVIGATE

SHOPIFY STOREFRONT ORIGIN
Shopify-native WebMCP
↓
get_product
↓
update_cart
↓
proceed_to_checkout
```

Do not pretend Attune directly owns Shopify's WebMCP tool registry.

The user's agent navigates to Shopify and discovers the new page's native tools.

This is a **WebMCP-to-WebMCP handoff across the open web**.

Attune answers:

> What is the custom thing and why is this exact revision legitimate to sell?

Shopify answers:

> Let the shopper inspect it, add it to cart, and proceed to checkout.

---

# 32. Shopify official behavior to rely on

Shopify provides native WebMCP tools on every Liquid storefront and on Hydrogen developer-preview storefronts.

Shopify states that these tools operate on the shopper's live session, and cart changes made by the agent use standard storefront actions and update the visible tab.

Native tool families include:

```text
Catalog:
search_catalog
browse_store
get_product
show_variant

Cart:
get_cart
update_cart
cancel_cart

Checkout/order navigation:
proceed_to_checkout
manage_orders
```

This is why the preferred challenge path uses a Liquid storefront controlled by the project.

---

# 33. Shopify development environment

Use a Shopify development store controlled by the project.

Use an app and development store in the same Shopify organization.

For that case Shopify supports the client-credentials grant without a merchant redirect flow.

Challenge environment:

```text
Attune Next.js backend
↓
Shopify Admin GraphQL
↓
Attune-controlled Shopify dev store
↓
Liquid storefront with native Shopify WebMCP
```

Do not require judges to connect their own Shopify store.

---

# 34. Shopify scopes

Minimum expected Admin API scopes:

```text
write_products
read_products
write_publications
read_publications
```

If implementation later needs orders:

```text
read_orders
```

Do not request fulfillment/refund scopes for P0 unless those features are actually implemented.

---

# 35. Shopify materialization model

Use a `CommerceLink` record.

```ts
export interface CommerceLink {
  id: CommerceLinkId;
  commitmentId: CommitmentId;

  revisionId: RevisionId;
  revisionNumber: number;
  specHash: string;

  provider: 'shopify';

  productId: string;
  variantId: string;
  handle: string;
  storefrontUrl: string;

  currency: string;
  price: string;

  status: 'creating' | 'published' | 'verified' | 'provider_drift' | 'failed';

  createdAt: string;
  verifiedAt?: string;
}
```

One materialized Shopify variant corresponds to one agreed Attune revision in the challenge.

---

# 36. Shopify product identity

Use deterministic commerce identifiers.

Example:

```text
Product title:
Custom Equipment Panel — AT-1042 r7

Handle:
attune-mb-1042-r7

Variant option:
Configuration = Revision 7

SKU:
AT-1042-R7-82AA91
```

The short hash suffix is derived from `specHash`.

Shopify is linkage, not Attune's source of specification truth.

---

# 37. Shopify metafields

Write Attune linkage into Shopify product/variant metafields where practical.

Recommended product metafields:

```text
namespace: attune

commitment_id = AT-1042
revision = 7
spec_hash = <full SHA-256>
```

Also persist linkage in Attune DB.

Attune DB is authoritative for the relationship.

Metafields make the Shopify object inspectable and auditable.

---

# 38. Shopify materialization mutation

Preferred implementation is `productSet(synchronous: true)` because it can create/update product data, metafields, variants, price, and SKU as one structured mutation.

Use a product input conceptually like:

```json
{
  "title": "Custom Equipment Panel — AT-1042 r7",
  "handle": "attune-mb-1042-r7",
  "descriptionHtml": "<p>Custom configuration agreed in Attune.</p>",
  "status": "ACTIVE",
  "productOptions": [
    {
      "name": "Configuration",
      "values": [{ "name": "Revision 7" }]
    }
  ],
  "metafields": [
    {
      "namespace": "attune",
      "key": "commitment_id",
      "type": "single_line_text_field",
      "value": "AT-1042"
    },
    {
      "namespace": "attune",
      "key": "revision",
      "type": "number_integer",
      "value": "7"
    },
    {
      "namespace": "attune",
      "key": "spec_hash",
      "type": "single_line_text_field",
      "value": "<hash>"
    }
  ],
  "variants": [
    {
      "optionValues": [
        {
          "optionName": "Configuration",
          "name": "Revision 7"
        }
      ],
      "price": 2400,
      "sku": "AT-1042-R7-82AA91"
    }
  ]
}
```

Do not copy this blindly without testing against the current API schema.

The exact GraphQL operation belongs in `packages/shopify`.

---

# 39. Shopify publication

Creating an active product does not automatically guarantee it is published to the desired storefront publication.

Use `publishablePublish` with the correct Online Store publication ID.

Persist the publication ID in environment/config after setup.

After publication, reread the product and confirm it is published on the intended channel.

---

# 40. External execution reliability

Every consequential provider mutation follows:

```text
REQUEST
↓
SERVER REVALIDATE
↓
PERSIST INTENT
↓
EXTERNAL MUTATION
↓
AUTHORITATIVE REREAD
↓
EXPECTED VS OBSERVED
↓
COMMIT VERIFIED STATE
```

Never equate an HTTP/GraphQL acknowledgement with verified outcome.

Possible external mutation statuses:

```ts
type ExternalMutationStatus =
  'intent_persisted' | 'provider_acknowledged' | 'verified' | 'provider_drift' | 'failed';
```

---

# 41. Materialization execution algorithm

Pseudo-code:

```ts
async function materializeForCommerce(input, actor) {
  const ctx = await loadAuthoritativeContext(input.commitmentId);

  assertActorAuthorized(actor, ctx);
  assertCapabilityEpoch(input.capabilityEpoch, ctx.capabilityEpoch);
  assertRevision(input.revisionId, input.specHash, ctx);
  assertMutualCommitment(ctx);
  assertNotAlreadyMaterialized(ctx);

  const intent = await persistExternalMutationIntent({
    type: "SHOPIFY_MATERIALIZE",
    commitmentId: input.commitmentId,
    revisionId: input.revisionId,
    idempotencyKey: input.idempotencyKey,
  });

  const expected = buildShopifyMaterialization(ctx);

  const created = await shopify.productSet(expected);
  await shopify.publish(created.productId);

  const observed = await shopify.readProduct(created.productId);

  const conformance = compareShopifyProduct(expected, observed);

  if (!conformance.matches) {
    await markProviderDrift(intent.id, observed, conformance);
    return providerDriftResult(...);
  }

  const link = await saveVerifiedCommerceLink(...);

  await updateVisibleUIState(link);

  return conciseVerifiedResult(link);
}
```

---

# 42. Shopify verification

Authoritative reread should verify at least:

```text
product ID
variant ID
handle
status
price
SKU
attune commitment_id
attune revision
attune spec_hash
publication / storefront availability
```

Return:

```json
{
  "status": "verified",
  "productId": "gid://shopify/Product/...",
  "variantId": "gid://shopify/ProductVariant/...",
  "revision": 7,
  "specHashMatches": true,
  "storefrontUrl": "https://..."
}
```

---

# 43. Shopify native WebMCP continuation

After verified materialization, show:

```text
OPEN IN SHOPIFY
```

and expose `continue_to_shopify`.

On Shopify storefront the user can ask their browser agent:

> Show me the exact panel we just agreed to.

Expected Shopify-native tool:

```text
get_product
```

Then:

> Add four of these to my cart.

Expected:

```text
update_cart
```

Then:

> Take me to checkout.

Expected:

```text
proceed_to_checkout
```

This is Shopify's native WebMCP surface, not a Attune emulation.

---

# 44. Checkout scope

P0 challenge success does **not** require real-money completion.

A Shopify development store is a testing environment.

If test checkout is reliable, it is SHOULD.

If not, stop the live demo after native Shopify cart/checkout navigation.

Do not claim real money.

---

# 45. Revision invalidation

This is the primary negative demonstration.

State:

```text
r7 frozen
r7 technically valid
provider committed
buyer accepted
Shopify r7 product materialized
```

Then user changes:

```text
hole diameter 4mm → 6mm
```

Attune creates:

```text
Draft r8
```

Consequences:

```text
r7 remains immutable
r7 commerce link remains historical
r8 has no provider quote
r8 has no provider commitment
r8 has no buyer acceptance
materialize_for_commerce is absent for r8
```

Do not silently edit the r7 Shopify product to represent r8.

A new revision requires new proof and new commitments.

---

# 46. Stale Shopify product policy

P0:

- keep the r7 Shopify product intact as historical materialization;
- mark current Attune draft as r8;
- Attune explains that r8 is not commerce-authorized.

SHOULD after core passes:

- mark superseded materializations in Attune;
- optionally unpublish old products under explicit policy.

Do not introduce automatic Shopify unpublishing if it makes the demo fragile.

---

# 47. Accessible semantic twin

The canvas is never the only representation.

Example:

```text
Mount A
Type: Mounting hole
Diameter: 4.0 mm
Position: X20 / Y20
Authority: Buyer locked
Tolerance: ±0.2 mm

Connector slot
Width: 40 mm
Clearance: 8.1 mm
Required: 12 mm
State: Manufacturing conflict
```

This semantic DOM supports:

- screen-reader access;
- keyboard navigation;
- WebMCP inspection;
- receipts;
- debugging;
- trust.

Accessibility is part of the semantic architecture.

---

# 48. UI layout

Judge mode opens directly into the work.

```text
ATTUNE                               AT-1042 / Draft r6

Custom Equipment Panel

┌──────────────────┬───────────────────────────────┬──────────────────┐
│ REQUIREMENTS     │                               │ INSPECTOR        │
│                  │                               │                  │
│ ✓ Envelope       │            CANVAS             │ Geometry         │
│ ✓ Material       │                               │ Constraints      │
│ ✓ Fixed mounts   │    ○──────────────────○       │ Dimensions       │
│ ! Clearance      │           ┌──────┐            │                  │
│ ✓ Quantity       │           │ slot │            │                  │
│                  │    ○──────────────────○       │                  │
├──────────────────┴───────────────────────────────┴──────────────────┤
│ NOT BUILDABLE · Slot clearance 8.1 mm / required 12 mm             │
│ [Find valid changes]                                                 │
├──────────────────────────────────────────────────────────────────────┤
│ CAPABILITY FRONTIER                                                   │
│ Inspect · Compare valid changes · Edit                               │
│ Locked: Quote · Commerce                                              │
└──────────────────────────────────────────────────────────────────────┘
```

---

# 49. Capability Lens

A visible technical drawer helps judges understand the WebMCP mechanism.

```text
WEBMCP CAPABILITY LENS

Actor
Buyer

Draft
r6

Draft version
13

Capability epoch
41

Technical state
CONFLICT

FRONTIER
✓ inspect_constraints
✓ compare_valid_changes
✓ apply_spec_changes

BLOCKED
○ request_quote
  technical_conflict

○ materialize_for_commerce
  mutual_commitment_missing
```

Do not make the judge open DevTools to understand the idea.

---

# 50. Role switcher

Judge mode:

```text
Buyer | Provider | Reset
```

The role switch changes application session role for the seeded demo.

Server authorization still uses the role.

Do not implement provider tools merely as hidden buttons without server validation.

---

# 51. Provider quote UI

Provider sees:

```text
AT-1042 / Revision 7

TECHNICAL
✓ Complete
✓ Buildable
✓ Buyer locks preserved
✓ 12 / 12 hard rules pass

COMMERCIAL
Quantity: 4
Price: ₹2,400
Lead time: 3 business days
Quote validity: 48 hours

[Commit quote to r7]
```

Provider commitment is a visible human action.

---

# 52. Buyer acceptance UI

Buyer sees exact:

```text
WHAT WILL BE MADE
AT-1042 / r7

PRICE
₹2,400

QUANTITY
4

LEAD TIME
3 business days

TECHNICAL
12 / 12 hard rules pass

[Accept revision 7]
```

The browser agent may stage/describe.

The buyer clicks final acceptance.

---

# 53. Technology stack

## MUST

- Next.js App Router
- React
- TypeScript strict mode
- pnpm workspace
- Drizzle ORM
- PostgreSQL / Neon
- Cloudflare R2 for generated artifacts
- Vitest
- Playwright
- native WebMCP imperative API
- Shopify Admin GraphQL
- Shopify Liquid storefront
- Vercel deployment

## Editor

Target renderer:

- CanvasKit / Skia WASM behind a renderer adapter.

However:

> If an existing working sketcher renderer can be integrated materially faster, preserve it behind `RendererAdapter` for the challenge. Do not rewrite a working editor solely for architectural purity.

## Solver

- PlaneGCS WASM in worker.

## SHOULD

- Neon Auth / Better Auth style application auth
- Liveblocks presence/history
- Sentry
- product analytics

## DEFER

- general multiplayer editing
- Yjs/CRDT geometry merging
- advanced version branching
- billing
- enterprise org management
- plugin SDK

---

# 54. Monorepo

```text
apps/
  web/

packages/
  domain/
    commitment/
    fabrication/
    commerce/
    conformance/

  editor/
    document/
    geometry/
    topology/
    interaction/
    intent/
    constraints/
    solver/
    commands/
    renderer/

  capabilities/
  webmcp/
  shopify/
  artifacts/
  database/
  evals/
  testing/

scripts/
  seed-demo/
  reset-demo/
  browser-run/
```

Hard rule:

Packages under `domain`, `geometry`, `capabilities`, and `conformance` have zero React imports.

---

# 55. Next.js routes

```text
/
  marketing / challenge intro

/demo
  seeded judge scenario

/app
  authenticated dashboard

/app/projects/[projectId]
  project overview

/app/commitments/[commitmentId]
  primary workspace

/api/commitments/[id]/commands
/api/commitments/[id]/validate
/api/commitments/[id]/quote
/api/commitments/[id]/accept
/api/commitments/[id]/materialize

/api/shopify/callback   # only if auth approach later requires it
/api/demo/reset
```

For challenge same-org Shopify client credentials, no merchant OAuth callback is needed.

---

# 56. Server/client boundaries

## Client

- canvas;
- editor kernel;
- WebMCP registration;
- local preview;
- visible receipts;
- capability lens;
- role UI.

## Server

Owns:

- durable specification persistence;
- quote/acceptance records;
- frozen revision hashes;
- capability authorization for consequential actions;
- Shopify credentials;
- Shopify Admin API;
- materialization;
- provider reread;
- audit events;
- demo reset.

Never ship Shopify client secret to browser.

---

# 57. Database schema

Use Drizzle.

Recommended tables:

```text
projects

commitments
  id
  project_id
  title
  state
  current_draft_version
  current_base_revision_id
  capability_epoch
  draft_document_json
  fabrication_json
  created_at
  updated_at

revisions
  id
  commitment_id
  revision_number
  spec_hash
  document_json
  fabrication_json
  validation_json
  frozen_by
  frozen_at

quotes
  id
  commitment_id
  revision_id
  spec_hash
  provider_id
  currency
  total_price
  lead_time_days
  valid_until
  status
  created_at

provider_commitments
  id
  commitment_id
  revision_id
  spec_hash
  quote_id
  provider_id
  committed_at

buyer_acceptances
  id
  commitment_id
  revision_id
  spec_hash
  buyer_id
  accepted_at

commerce_links
  id
  commitment_id
  revision_id
  spec_hash
  provider
  shopify_product_id
  shopify_variant_id
  shopify_handle
  storefront_url
  currency
  price
  status
  verified_at
  created_at

external_mutations
  id
  commitment_id
  revision_id
  mutation_type
  idempotency_key
  request_json
  acknowledgement_json
  observed_json
  status
  created_at
  updated_at

receipts
  id
  commitment_id
  origin
  actor_id
  base_draft_version
  result_draft_version
  intent
  receipt_json
  created_at

audit_events
  id
  commitment_id
  actor_id
  actor_role
  origin
  event_type
  data_json
  created_at
```

Use JSONB for domain documents during challenge.

Do not prematurely normalize every geometry point into SQL.

---

# 58. Canonical hashing

Before freezing a revision:

1. normalize document;
2. remove ephemeral UI fields;
3. sort object keys deterministically;
4. normalize numeric precision;
5. serialize canonical JSON;
6. SHA-256.

```ts
const specHash = sha256(
  canonicalize({
    document,
    fabrication,
  }),
);
```

The hash is authority linkage, not a blockchain feature.

---

# 59. Environment variables

```bash
# Application
NEXT_PUBLIC_APP_URL=
APP_ENV=

# Database
DATABASE_URL=

# Shopify
SHOPIFY_SHOP=
SHOPIFY_CLIENT_ID=
SHOPIFY_CLIENT_SECRET=
SHOPIFY_API_VERSION=2026-07
SHOPIFY_ONLINE_STORE_PUBLICATION_ID=
SHOPIFY_STOREFRONT_BASE_URL=

# R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_BASE_URL=

# Demo
DEMO_RESET_SECRET=

# Optional auth
AUTH_SECRET=

# Optional observability
SENTRY_DSN=
```

Do not put secrets in `NEXT_PUBLIC_*`.

---

# 60. Local provider mode

Support:

```bash
COMMERCE_PROVIDER=fake
```

for local tests if useful.

Submitted Vercel deployment:

```bash
COMMERCE_PROVIDER=shopify
```

`FakeCommerceProvider` must implement the same interface but is never used as proof in the challenge video.

---

# 61. Commerce provider interface

```ts
export interface CommerceProvider {
  materializeRevision(input: MaterializeCommerceInput): Promise<ProviderAcknowledgement>;

  readMaterialization(externalId: string): Promise<ObservedCommerceState>;
}
```

Shopify adapter implements the interface.

---

# 62. R2 artifact strategy

P0 generated artifacts:

```text
preview.svg
part-r7.svg
part-r7.dxf
manifest.json
```

R2 key:

```text
commitments/AT-1042/revisions/r7/<hash>/part.dxf
```

`manifest.json`:

```json
{
  "commitmentId": "AT-1042",
  "revision": 7,
  "specHash": "...",
  "units": "mm",
  "generatedAt": "..."
}
```

SVG/DXF export is SHOULD for challenge polish, not a blocker for the Shopify cross-site handoff.

---

# 63. Human fallback

If WebMCP is unavailable:

```text
WebMCP is unavailable in this browser.

The full manual Attune workflow still works.
For agent collaboration use ChatGPT's in-app browser
or Chrome with WebMCP enabled.
```

Human/manual product functionality must remain coherent.

---

# 64. WebMCP security

## Rules

1. Tool registration is never authorization.
2. All consequential server actions re-check role and current state.
3. External/user-generated text cannot grant authority.
4. Read tools that return external text use `untrustedContentHint: true` where appropriate.
5. Read-only tools use `readOnlyHint: true`.
6. Keep cross-origin exposure disabled unless there is a specific requirement.
7. Validate binary domain logic in code.
8. Return concise tool outputs.
9. Update visible UI before a tool returns success.

---

# 65. WebMCP lifecycle

Tool sets change on macro semantic state.

Good:

```text
technical conflict resolved
→ request_quote becomes available

mutual commitment established
→ materialize_for_commerce becomes available

draft r8 created
→ r7-bound commerce action absent for r8
```

Bad:

```text
hover line
→ re-register tools

select circle
→ rebuild entire registry
```

Selection-specific generic editing should stay inside stable semantic tools.

---

# 66. WebMCP unsupported / errors

Tool execution errors use structured results.

Examples:

```json
{
  "status": "rejected",
  "code": "REVISION_CONFLICT",
  "currentDraftVersion": 14
}
```

```json
{
  "status": "blocked",
  "code": "TECHNICAL_CONFLICT",
  "message": "Resolve the hard clearance conflict before requesting a quote."
}
```

```json
{
  "status": "provider_drift",
  "code": "SHOPIFY_MISMATCH",
  "message": "Shopify state did not match the agreed revision after reread."
}
```

---

# 67. Required deterministic tests

## Domain

- technical validity;
- clearance calculations;
- buyer locks;
- candidate alternatives;
- frozen revision immutability;
- canonical hash stability;
- quote revision binding;
- buyer/provider commitment revision binding;
- capability accrual;
- stale capability rejection.

## Command bus

- transaction atomicity;
- base version conflict;
- receipt correctness;
- undo where applicable.

## Shopify

Using fake adapter in normal CI:

- materialization request construction;
- provider acknowledgement;
- authoritative reread mismatch;
- idempotency;
- saved commerce link.

Using live dev store in controlled test suite:

- create product;
- set price/SKU;
- publish;
- reread;
- storefront visibility.

---

# 68. Capability matrix tests

At minimum:

```text
buyer × incomplete
buyer × conflict
buyer × buildable
buyer × quote_requested
buyer × quoted
buyer × committed
buyer × materialized

provider × quote_requested
provider × quoted
provider × committed
```

Examples:

```text
buyer × conflict:
  inspect_commitment
  inspect_constraints
  inspect_capabilities
  apply_spec_changes
  compare_valid_changes
  validate_buildability
  NO request_quote
  NO materialize_for_commerce

buyer × buildable:
  + request_quote

buyer × quoted but unaccepted:
  + inspect_quote
  + stage_acceptance
  NO materialize_for_commerce

buyer × mutually committed:
  + materialize_for_commerce

buyer × r8 draft after r7 materialization:
  NO r8 materialize_for_commerce until r8 re-proven/recommitted
```

---

# 69. WebMCP eval suites

Chrome guidance explicitly calls out:

- tool-purpose understanding;
- tool selection;
- argument correctness;
- using returned information;
- correct tool sequence;
- full journey success.

Use these suites.

## 69.1 Direct selection

Prompt:

> Make the panel 20 mm wider.

Expected:

`apply_spec_changes`

## 69.2 Constraint preservation

Prompt:

> Keep these four mounts fixed and find the smallest valid change.

Expected:

`inspect_constraints` / `compare_valid_changes`, then valid `apply_spec_changes`.

## 69.3 Premature quote

State: conflict.

Prompt:

> Get me a quote.

Expected:

No quote tool available; agent explains blocker.

## 69.4 Premature commerce

State: provider committed, buyer not accepted.

Prompt:

> Put this on Shopify.

Expected:

No `materialize_for_commerce`.

## 69.5 Wrong role

Buyer prompt:

> Set the provider price to ₹1800.

Expected:

No buyer-side provider commitment mutation.

## 69.6 Stale revision

r7 materialized; r8 draft.

Prompt:

> Sell this new version too.

Expected:

No r8 materialization until re-proven/recommitted.

## 69.7 Open-web handoff

After materialization:

Prompt in Attune:

> Continue to the storefront.

Expected:

`continue_to_shopify`.

On Shopify:

> Show me the product we just made.

Expected Shopify-native `get_product`.

Then:

> Add four to cart.

Expected Shopify-native `update_cart`.

---

# 70. Release quality gates

MUST before submission:

| Gate                               |       Requirement |
| ---------------------------------- | ----------------: |
| deterministic domain tests         |              100% |
| revision/staleness tests           |              100% |
| capability matrix                  |              100% |
| wrong-role consequential mutations |                 0 |
| stale consequential execution      |                 0 |
| duplicate materialization          |                 0 |
| live Shopify materialization runs  |               5/5 |
| live Shopify reread matches        |               5/5 |
| storefront product visible         |               5/5 |
| Shopify-native WebMCP get_product  | repeatably passes |
| Shopify-native WebMCP update_cart  | repeatably passes |
| direct Attune tool selection       |              ≥95% |
| paraphrased tool selection         |              ≥90% |
| required arguments                 |              ≥95% |
| golden human path                  |               5/5 |
| golden WebMCP path                 | repeatably passes |
| production build                   |             clean |
| secret scan                        |             clean |

Do not fabricate perfect metrics.

Keep raw eval output.

---

# 71. Cloudflare Browser Run

Use Browser Run's experimental WebMCP lab only for QA.

Flow:

```text
deploy Vercel preview
↓
start Browser Run lab
↓
open Attune
↓
inspect registered tools
↓
run capability-state tests
↓
navigate to Shopify
↓
inspect Shopify native tools
↓
capture evidence
```

Do not make Browser Run a production dependency.

---

# 72. Supported challenge platforms

Primary:

- ChatGPT in-app browser with WebMCP.

Secondary:

- Google Chrome with WebMCP enabled.

QA:

- Cloudflare Browser Run WebMCP lab.

Normal browsers:

- manual Attune workflow works;
- WebMCP layer unavailable.

---

# 73. Challenge judge mode

No signup required.

Route:

```text
/demo
```

Buttons:

```text
Continue as Buyer
Continue as Provider
Reset Demo
```

Use seeded stable data.

Reset must:

- restore AT-1042 draft/conflict;
- clear quote/acceptances;
- clear Attune commerce link;
- delete or archive generated Shopify demo product if practical;
- reset capability epoch;
- preserve provider config.

If Shopify cleanup is unreliable, generate unique per-run product handles and hide old demo objects from judge flow.

---

# 74. Video plan (<3 minutes)

## 0:00–0:15

> “Agents can buy products that already exist. Custom work starts earlier—when people still have to decide what can actually be made.”

Show invalid panel.

## 0:15–0:50 — co-create

Buyer:

> “These four mounts cannot move. Find the smallest valid fix.”

Agent inspects conflict, returns deterministic alternatives.

Human chooses one.

Agent applies it.

Receipt shows fixed mounts preserved.

`request_quote` appears.

## 0:50–1:15 — multi-party commitment

Provider sets quote for r7.

Buyer accepts exact r7.

Capability Lens:

```text
+ materialize_for_commerce
```

Narration:

> “Technical proof and two independent human commitments created an action that did not exist before.”

## 1:15–1:50 — open-web commerce handoff

Invoke `materialize_for_commerce`.

Attune creates and verifies Shopify product tied to r7.

Navigate to Shopify.

User asks browser agent:

> “Show me the exact product we just created, add four to my cart, and take me to checkout.”

Shopify's own native WebMCP tools act on the visible storefront/cart.

## 1:50–2:20 — invalidation

Return to Attune.

Change hole diameter 4 → 6 mm.

Attune creates Draft r8.

Show:

```text
r7 materialization preserved
r8 not quoted
r8 not accepted
materialize_for_commerce absent
```

Narration:

> “The agent lost the action because the facts that justified it stopped being true.”

## 2:20–2:50 — receipts / verification

Show application-authored receipt and verified Shopify linkage.

Optional show SVG/DXF artifact.

## 2:50–3:00

> “Attune explores a web where humans and agents don't just operate existing objects. They progressively create the conditions that make new real-world actions possible—and then hand those objects across the open web.”

End:

```text
CO-CREATE → PROVE → COMMIT → COMMERCE
```

---

# 75. Internal challenge rubric

## WebMCP Leverage — 25

- 6: shared human/agent semantic command path
- 5: capability accrual/revocation is visible and real
- 4: capability frontier keeps tool surface semantically relevant
- 4: open-web Attune → Shopify native WebMCP handoff
- 3: stale server-side authority protection
- 3: eval evidence / tool lifecycle quality

Target: 23+

## Execution — 25

- 5: immediate judge understanding
- 5: reliable human path
- 5: reliable Attune WebMCP path
- 5: real Shopify materialization + native storefront WebMCP
- 3: accessible receipts / polished UX
- 2: reset/deployment/repo reliability

Target: 22+

## Potential Impact — 25

- 6: real custom fabrication problem
- 5: exact-revision buyer/provider agreement
- 5: real commercial Shopify state
- 4: production-ready 2D artifact / objective domain truth
- 3: lower professional-encoding barrier
- 2: evidence-backed manufacturing context

Target: 21+

## Creativity & Ambition — 25

- 7: Executable Commitment object
- 6: capability accrual/frontier
- 5: multi-party revision-bound authority
- 4: cross-site WebMCP composition
- 3: extensible physical specification architecture

Target: 23+

Internal release target: 90+/100.

---

# 76. Progressive implementation drops

## DROP 0 — infrastructure proof

MUST first:

- initialize monorepo;
- Next.js app;
- Vercel deploy;
- DB connection;
- R2 client;
- one native WebMCP test tool;
- Browser Run can see tool;
- Shopify client credentials work;
- product can be created/published/reread;
- native Shopify WebMCP visible on storefront.

Do not polish editor before this works.

## DROP 1 — domain/editor

- AT-1042 seed;
- minimal panel geometry;
- drag/move;
- dimensions;
- buyer locks;
- deterministic clearance rule;
- command bus;
- receipt system.

## DROP 2 — Attune WebMCP

- inspect tools;
- `apply_spec_changes`;
- `validate_buildability`;
- `compare_valid_changes`;
- Capability Lens;
- dynamic frontier.

## DROP 3 — commercial commitment

- freeze revision;
- provider quote;
- provider commitment;
- buyer acceptance;
- spec hash;
- stale revision behavior.

## DROP 4 — commerce materialization

- `materialize_for_commerce`;
- Shopify productSet;
- publishablePublish;
- authoritative reread;
- CommerceLink;
- `continue_to_shopify`.

## DROP 5 — native Shopify WebMCP

- storefront `get_product`;
- `update_cart`;
- `proceed_to_checkout` if reliable;
- record repeatable test evidence.

## DROP 6 — hardening

No new product features.

- evals;
- role negatives;
- stale authority;
- idempotency;
- receipts;
- accessibility;
- Browser Run;
- ChatGPT;
- Chrome;
- README;
- demo reset;
- video.

---

# 77. Non-goals before challenge submission

Do not build:

- full Illustrator clone;
- full Shapr3D clone;
- arbitrary 3D;
- full freeform vector network UI;
- G2 curve tools;
- general CPQ;
- ERPNext;
- factory hardware;
- computer vision inspection;
- multiple vertical demos;
- marketplace;
- general merchant onboarding;
- Stripe;
- fulfillment holds unless all P0 is already flawless;
- returns/refunds;
- multi-user real-time editing;
- branches/merge;
- enterprise roles;
- billing;
- plugin marketplace;
- built-in chatbot.

---

# 77A. Multiple-entry strategy

Because multiple submissions are now permitted, Attune should still be treated as the primary submission unless another concept can reach an independently strong, reliable build.

A second submission MUST NOT be:

- Attune with a different fabrication object;
- Attune without Shopify;
- Attune's editor alone;
- Attune's commerce flow alone;
- the same Capability Accrual engine with a cosmetic domain change.

A second submission MAY be considered only if it has a different primary shared object and a clearly different human-agent collaboration model.

Examples of sufficiently different conceptual directions would be evaluated independently against the official rule before submission.

Do not sacrifice Attune's Execution score merely because the rules permit multiple entries.

---

# 78. Post-challenge product progression

## P1

- richer parametric editor;
- fillet/chamfer/offset;
- more manufacturing rules;
- Shopify test order verification;
- production package;
- physical conformance.

## P2

- packaging domain pack;
- cable assembly domain pack;
- provider rule authoring;
- reusable templates;
- live buyer/provider collaboration.

## P3

- domain-pack SDK;
- multiple commerce/production connectors;
- bounded resolution / Afterstate-style recourse;
- enterprise policy.

The challenge does not need to prove the whole platform.

---

# 79. Social-impact extension

Do not bolt on a separate social-impact app.

The core inclusion principle is:

> **Reduce the professional-encoding barrier without removing professional validation.**

A user can know what they need without knowing CAD terminology, tolerancing conventions, manufacturing rules, or RFQ structure.

Their agent helps structure intent.

The provider contributes professional constraints.

The deterministic system validates.

A future non-clinical accessibility-fabrication pack could use the same runtime for items such as switch mounting plates, holders, desk interfaces, or custom organizers.

Do not claim medical-device capability.

---

# 80. Product invariants

Freeze these.

1. The Executable Commitment is the primary object.
2. Geometry is one projection, not the category.
3. Human and agent mutate through the same semantic command bus.
4. Deterministic code owns exactness.
5. Geometric solver and manufacturing rules are separate layers.
6. Agent intent is not proof of actual effect.
7. Every agent mutation creates an application-authored receipt.
8. A frozen revision is immutable.
9. Quotes and commitments bind to exact revision/hash.
10. Capability presence does not equal server authorization.
11. Capabilities accrue only when factual prerequisites hold.
12. A material edit invalidates downstream authority for the new draft.
13. Consequential provider mutations are followed by authoritative reread.
14. Shopify linkage never becomes source of specification truth.
15. Attune ends where Shopify's native commerce semantics begin.
16. The user agent can continue on the Shopify origin through Shopify's native WebMCP.
17. One deep reliable vertical beats multiple shallow claims.
18. Human fallback works without WebMCP.
19. The video depicts only reproducible functionality.
20. No new feature is worth destabilizing the golden path.

---

# 81. Definition of challenge-complete

The challenge build is complete when a judge can reliably:

1. open `/demo`;
2. understand the custom physical requirement;
3. see one deterministic technical conflict;
4. ask their agent for valid alternatives;
5. choose a human tradeoff;
6. have the agent apply the change;
7. inspect a deterministic receipt;
8. see `request_quote` accrue;
9. switch to provider;
10. commit a quote to exact r7;
11. switch to buyer;
12. accept exact r7;
13. see `materialize_for_commerce` accrue;
14. create and verify a real revision-bound Shopify product;
15. navigate to Shopify;
16. have Shopify's native WebMCP inspect the product;
17. have Shopify's native WebMCP add quantity to cart;
18. optionally proceed to test checkout;
19. return to Attune;
20. edit the specification into Draft r8;
21. see r7 preserved;
22. see r8 commercial authority absent;
23. understand why the action disappeared;
24. reset the demo and reproduce it.

If those steps work repeatedly, stop adding features.

---

# 82. README opening

```md
# Attune

## Create what doesn't exist yet.

Attune is a WebMCP workspace where a customer, a provider, and their browser agents co-create a custom physical specification until it becomes buildable, mutually agreed, and commerce-ready.

Once an exact revision is agreed, Attune materializes it into Shopify. The same user's agent can then continue through Shopify's native WebMCP storefront tools to inspect the product, update the live cart, and proceed toward checkout.

The key idea:

constraint satisfied
→ capability accrues

two humans commit
→ commerce capability accrues

revision changes
→ stale authority disappears

Attune → Shopify
→ WebMCP-to-WebMCP handoff across the open web
```

---

# 83. Challenge thesis

> **Most web apps expose a fixed set of actions over objects that already exist. Attune explores a different model: humans, agents, and providers progressively create a custom object and the conditions that make new actions legitimate. Technical proof creates quote capability. Independent human commitments create commerce capability. The agreed revision becomes real Shopify merchandise, where Shopify's own native WebMCP continues the journey in the shopper's live session. If the specification changes, stale authority disappears rather than silently carrying forward.**

That is the challenge thesis.

---

# 84. Official source references

Use these as implementation source-of-truth references.

## OpenAI / Devpost challenge

- OpenAI WebMCP Challenge
  https://openai.com/webmcp-challenge/

- Official Devpost rules
  https://webmcp.devpost.com/rules

  Multiple-submission note: the current rules allow an Entrant to submit more than one Submission, but each must be unique and substantially different from that Entrant's other Submissions, as determined by Sponsor and Devpost.

- Challenge overview/resources
  https://webmcp.devpost.com/
  https://webmcp.devpost.com/resources

Important rule interpretation:

- project must be a WebMCP-powered web app imagining a future where humans and agents interact, collaborate, and create together;
- must run consistently and behave as depicted;
- live URL must work in ChatGPT in-app browser or WebMCP-enabled Chrome;
- repository must be public and open-source;
- <3 minute public YouTube demo required;
- judges may judge from video/text rather than test everything;
- judging criteria: WebMCP Leverage, Execution, Potential Impact, Creativity & Ambition.

## Chrome WebMCP

- Imperative API
  https://developer.chrome.com/docs/ai/webmcp/imperative-api

- Best practices
  https://developer.chrome.com/docs/ai/webmcp/best-practices

- Security
  https://developer.chrome.com/docs/ai/webmcp/secure-tools

- Evals
  https://developer.chrome.com/docs/ai/webmcp/evals

Key implementation facts:

- use `document.modelContext`;
- `navigator.modelContext` is deprecated;
- use `registerTool`;
- lifecycle cleanup can use `AbortSignal`;
- `getTools()` is alphabetically ordered, so do not rely on tool order as priority;
- use a small, unambiguous tool surface;
- validate deterministic logic in code;
- use evals for tool selection/arguments/sequence.

## Shopify native WebMCP

- Shopify WebMCP tools
  https://shopify.dev/docs/api/web-mcp

Important behavior:

- Shopify provides WebMCP tools on every Liquid storefront;
- tools act on shopper's live session;
- cart operations use standard storefront actions and update the visible tab;
- native tools include `get_product`, `update_cart`, `proceed_to_checkout`.

## Shopify Admin API

- App authentication overview
  https://shopify.dev/docs/apps/build/authentication-authorization

- Client credentials for same-organization stores
  https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant

- Dev stores
  https://shopify.dev/docs/apps/build/stores/development-stores

- `productSet`
  https://shopify.dev/docs/api/admin-graphql/latest/mutations/productSet

- `ProductSetInput`
  https://shopify.dev/docs/api/admin-graphql/latest/input-objects/productSetInput

- `ProductVariantSetInput`
  https://shopify.dev/docs/api/admin-graphql/latest/input-objects/productVariantSetInput

- `publishablePublish`
  https://shopify.dev/docs/api/admin-graphql/latest/mutations/publishablePublish

## Cloudflare Browser Run

- WebMCP lab
  https://developers.cloudflare.com/browser-run/features/webmcp/

Use for QA only; lab sessions are experimental.

## Editor / solver

- PlaneGCS browser WASM package
  https://www.npmjs.com/package/@salusoft89/planegcs

- PlaneGCS source
  https://github.com/Salusoft89/planegcs

## Next.js / Vercel

- Next.js App Router
  https://nextjs.org/docs/app

- Next.js deployment
  https://nextjs.org/docs/app/getting-started/deploying

- Next.js on Vercel
  https://vercel.com/docs/frameworks/full-stack/nextjs

## Manufacturing grounding

- NIST Digital Thread for Manufacturing
  https://www.nist.gov/programs-projects/digital-thread-manufacturing

- NIST: Testing the Digital Thread in Support of Model-Based Manufacturing and Inspection
  https://www.nist.gov/publications/testing-digital-thread-support-model-based-manufacturing-and-inspection

- NIST: integrating design, manufacturing, and inspection
  https://www.nist.gov/publications/defining-requirements-integrating-information-between-design-manufacturing-and

- Xometry: DXF for sheet cutting
  https://www.xometry.com/resources/sheet/preparing-dxf-files/

---

# 85. Internal project source basis

This specification consolidates the project's prior design work, including:

- the Attune / Executable Specification / Capability Compiler product doctrine;
- the parametric sketcher architecture with Interaction Engine → Intent Engine → topology/constraints → solver → renderer;
- the Afterstate rule that execution must be followed by authoritative reread and conformance;
- the competitive conclusion that dynamic WebMCP registration alone is baseline, not novelty;
- the challenge conclusion that one deep fabrication vertical is stronger than multiple shallow domain demos;
- the newer cross-site Shopify-native WebMCP handoff.

Do not regress to:

- “CAD + WebMCP,”
- “Shopify API + WebMCP,”
- or “dynamic tools are the novelty.”

The product novelty is the **semantic lifecycle that creates, narrows, and revokes agent capability from live multi-party truth, then composes that capability with another site's native WebMCP surface.**

---

# 86. Codex completion rule

Codex should consider setup successful only when:

```text
pnpm install
pnpm build
pnpm test
pnpm test:e2e
```

work locally, and the project has:

```text
.env.example
LICENSE
README.md
THIRD_PARTY_NOTICES.md
```

plus:

- a seeded demo;
- a deterministic reset;
- real Shopify configuration instructions;
- fake-provider local mode;
- WebMCP testing instructions;
- Browser Run testing instructions;
- challenge build ledger documenting challenge-period work.

Do not stop after scaffolding files.

The P0 golden path must work end-to-end.

---

# 91. Challenge foundation execution override — 2026-08-29

This section is a later, challenge-critical override. Where it conflicts with an earlier
section, this section controls the P0 build.

## 91.1 Rules state

Automated setup MAY record `rules_reviewed_at`, `rules_source_url`, and
`rules_fetched_at`.

Automated setup MUST NOT create or infer `rules_acknowledged`, `agreed_to_rules`, or
`agreed_to_eligibility`. Reviewing rules is not legal agreement. Registration and
submission operations obtain explicit, just-in-time confirmation through the current
Devpost flow.

Attune is the strategic primary submission. This is strategy, not a legal limitation;
the current rules permit multiple substantially different submissions.

## 91.2 External-risk-first order

Before Kumo, Neon, judge sessions, CanvasKit, PlaneGCS, or product dashboards:

1. create only `apps/web` in the pnpm/Vite+ workspace;
2. deploy one minimal Next.js page;
3. register one read-only imperative WebMCP tool;
4. prove the exact Shopify development-store path;
5. stop if any Shopify stage fails.

The Shopify proof MUST include client-credentials Admin auth, synchronous `productSet`,
Admin reread, `publishablePublish`, `publishedOnPublication`, Storefront GraphQL
`product(handle:)`, password entry, Shopify-native browser `get_product`, and visible
`update_cart(quantity: 1)`.

Do not use deprecated Storefront `productByHandle`.

## 91.3 Shopify boundary

Attune server code uses Admin GraphQL for mutation and Storefront GraphQL for
verification. It MUST NOT use Shopify Storefront MCP or UCP MCP endpoints.

The cross-origin challenge proof is:

```text
browser on Shopify Liquid storefront
→ Shopify-native WebMCP get_product
→ Shopify-native WebMCP update_cart(quantity: 1)
```

`proceed_to_checkout`, payment, orders, and fulfillment are outside P0 acceptance and
release gating.

## 91.4 Quantity model

```text
fabrication specification = 4 panels
provider quote = ₹2,400 total
Shopify variant = Fabrication lot — 4 panels
Shopify price = ₹2,400 per lot
Shopify cart quantity = 1
physical panels represented = 4
```

Never ask Shopify WebMCP to add four Shopify units for this revision.

## 91.5 Verification

Commerce linkage becomes `VERIFIED` only after:

```text
productSet(synchronous: true)
→ Admin reread and conformance comparison
→ publishablePublish
→ publishedOnPublication
→ Storefront product(handle)
→ variant / SKU / price / availability / metafield comparison
```

Storefront polling uses an immediate query followed by modest waits of approximately
1, 2, 4, 8, and 15 seconds. A timeout is a retryable failure, never verification.

## 91.6 Routes and access

There is no separate `/demo` application. Judges use a long-lived opaque access URL that
creates a short-lived renewable secure session and redirects to the canonical project
workspace. The original credential remains reusable through the full judging period.

Normal email/password signup is product-readiness work and cannot block judge access.

## 91.7 Quality staging

Type checking, correctness rules, and architecture import restrictions are errors from
the first commit. Complexity, depth, parameter-count, and function-length thresholds are
warnings until the feature-freeze commit, when they become errors.

Next.js MUST run through package scripts via `vp run`; do not use Vite+'s built-in Vite
development or build commands for the Next.js app.

## 91.8 P0 editor freeze

MUST:

- panel;
- holes;
- slot;
- select/move;
- fixed locks;
- dimensions;
- equal;
- symmetry;
- analytic clearance evidence.

PlaneGCS is used for solving and temporary drag relationships. Attune analytic geometry
owns displayed measurements and evidence.

Generic line/arc/circle creation, fillets, Béziers, booleans, rich snapping,
segment-bend work, and generalized CAD topology cannot interrupt release.

Liveblocks, R2 artifact infrastructure, and generalized authentication are not P0 release
blockers.
