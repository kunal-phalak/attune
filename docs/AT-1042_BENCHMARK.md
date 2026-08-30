# AT-1042 Outcome Benchmark

The product now captures single-run evidence directly from authoritative receipts,
capability transitions, intervention observations, rejections, and Shopify verification
records. The comparative five-run benchmark remains pending until the complete Shopify
browser gate is repeatable. This protocol prevents unsupported performance claims.

## Scenario

Run the same seeded AT-1042 requirement through two paths:

1. manual baseline using the product's human controls without agent assistance;
2. Attune with the agent using the shared semantic command path.

Run each path five times from the same reset state. Record raw run evidence and report
medians. Do not publish a percentage improvement until both five-run sets exist.

## Measurements

| Outcome                   | Measurement                                                                    |
| ------------------------- | ------------------------------------------------------------------------------ |
| Intent to buildable       | Elapsed time from seeded requirement to valid specification                    |
| Human coordination burden | Manual interactions and clarification turns                                    |
| Engineering prevention    | Hard conflicts found before quote or order                                     |
| Preservation of intent    | Locked requirements preserved across repair                                    |
| Authority safety          | Stale consequential actions attempted and blocked                              |
| Revision integrity        | Shopify materializations whose spec hash matches the frozen revision           |
| Execution reliability     | Successful Admin to Storefront to browser-WebMCP runs                          |
| Human/agent equivalence   | Identical semantic command producing the same after-hash through UI and WebMCP |
| Intervention awareness    | Human changes detected on the next agent interaction without explanation       |
| Conformance               | Observed manufactured measurements matching frozen acceptance criteria         |

## Product evidence

The canonical commitment UI renders a compact, source-backed outcome panel throughout
the run. Values are computed from receipts, revision records, verification attempts,
rejections, and benchmark timestamps—not hard-coded marketing copy.

```text
AT-1042 · Outcome

Need → buildable                 pending measurement
Hard conflicts caught pre-quote  1
Buyer-locked mounts preserved    4 / 4
Human intervention detected      pending measurement
Stale commerce actions blocked   pending measurement
Frozen revision → Shopify match  pending verification
External verification            pending
```

The benchmark artifact for each run must include reset identifier, timestamps,
command/receipt sequence, resulting hashes, actor origins, and external verification
attempt IDs. Failed runs remain in the evidence set and are not silently discarded.
