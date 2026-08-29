# P0 Capability Frontier

This contract applies after the Shopify connectivity gate passes. It does not authorize
product implementation during Phase A.

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
