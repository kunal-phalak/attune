# P0 Capability Frontier

This contract governs the AT-1042 vertical slice. The August 29 bounded Shopify retry isolated
`read_inventory` as an external permission edge; product work now proceeds without weakening this
contract while the integration is resolved independently.

## Shared command path

Human UI and WebMCP operations must submit the same semantic commands to the same
authoritative execution path. The server assigns provenance; browser-supplied actor
claims are never authoritative.

```text
Human UI ─────┐
              ├── semantic command ── authoritative state
WebMCP ───────┘                         │
                                       ├── immutable receipt
                                       ├── workspace_seq
                                       ├── draft_version
                                       ├── capability_epoch
                                       └── before/after hashes
                                                   │
                                                   ▼
                                        Capability Compiler
                                           ╱             ╲
                                      Human actions   WebMCP surface
```

Every receipt records a server-assigned origin from `human_ui`, `webmcp`, `solver`,
`provider`, or `shopify_verification`.

## Intervention awareness

Each browser tab keeps an agent observation cursor containing its last observed
`workspace_seq`. Every tool execution compares that cursor with authoritative state
before validating the requested action.

If an agent last observed sequence 142 and a human UI operation creates receipt 143,
the next agent interaction receives a structured intervention summary without requiring
the human to explain the edit:

```json
{
  "previous_workspace_seq": 142,
  "current_workspace_seq": 143,
  "interventions": [
    {
      "receipt_seq": 143,
      "origin": "human_ui",
      "command": "move_slot",
      "affected_entities": ["slot:connector"],
      "before_hash": "…",
      "after_hash": "…"
    }
  ]
}
```

The observation cursor advances only after the response containing the new state is
successfully produced.

## Minimal compiled frontier

The compiler exposes only actions whose factual prerequisites currently hold. Tool
descriptions and structured results explain predicted consequences; Attune does not
invent a WebMCP priority annotation.

| Authoritative condition                         | Available consequential action | Required consequence evidence                                              |
| ----------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------- |
| Draft has hard conflicts                        | `compare_valid_changes`        | Candidate after-state, resolved conflicts, moved entities, preserved locks |
| Human selected a valid repair                   | `apply_deterministic_repair`   | Exact command, expected version, predicted clearance, preserved locks      |
| Draft is valid and unquoted                     | `request_quote`                | Frozen input hash and current capability epoch                             |
| Exact buyer quote request is current            | `freeze_and_quote_revision`    | Immutable revision and one-lot ₹2,400 quote                                |
| Provider quote exists for frozen revision       | `accept_revision`              | Exact revision, quote, amount, quantity, and expiry                        |
| Accepted revision is current and unmaterialized | `materialize_for_commerce`     | Exact revision/spec hash and Shopify lot semantics                         |
| Shopify verification is exact                   | `navigate_to_storefront`       | Verified product URL, revision hash, and verification timestamp            |

Any draft mutation increments `workspace_seq`, `draft_version`, and `capability_epoch`.
The compiler then revalidates the frontier. Quote, acceptance, or commerce actions whose
prerequisites refer to stale facts disappear and attempts using an older epoch are
blocked server-side.

Dynamic registration is transport only. Attune's differentiator is the deterministic
state, consequence prediction, intervention detection, and revocable authority that
determine the compiled surface.

## Execution boundary

Every mutation revalidates the server-owned principal and role, `workspace_seq`,
`capability_epoch`, current specification hash, and idempotency binding. Exact retries
return the original immutable result; reusing a command ID for different content is
rejected. Browser fields cannot assign provenance, role, Shopify verification, or actor.

The product response includes the complete frontier for buyer, provider, and agent,
including code-owned reasons, predicted consequences, and exact blocker codes. Each
receipt links a capability transition containing the actions gained and lost across all
three roles.

## WebMCP eval contract

`packages/webmcp` contains deterministic tests plus probabilistic prompt cases for:

- direct and ambiguous manufacturing requests;
- unseen human intervention and stale capability;
- boundary-bypass and adversarial external-content requests;
- multi-step quote/accept/materialize sequencing;
- use of returned hashes, sequences, and epochs in subsequent calls.

Deterministic cases run in the normal test suite. Probabilistic cases are a versioned
acceptance manifest for the production Browser Run harness; they are not presented as
passing until executed against the deployed browser surface.
