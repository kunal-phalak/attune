import { describe, expect, it } from 'vitest';

import { WEBMCP_EVAL_CASES } from './cases';
import { runWebMcpEval } from './runner';

describe('structured WebMCP release eval catalog', () => {
  it('contains every release scenario exactly once', () => {
    const ids = WEBMCP_EVAL_CASES.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      'DESIGN-01',
      'DESIGN-02',
      'DESIGN-03',
      'MFG-01',
      'MFG-02',
      'MFG-03',
      'MFG-04',
      'MFG-05',
      'MFG-06',
      'MFG-07',
      'MFG-08',
      'MFG-09',
      'AUTH-01',
      'AUTH-02',
      'AUTH-03',
      'AUTH-04',
      'AUTH-05',
      'ACCOUNT-01',
      'ACCOUNT-02',
      'SHOPIFY-01',
      'SHOPIFY-02',
      'PROFILE-01',
      'PROFILE-02',
      'VERSION-01',
      'REQUEST-01',
      'ORDER-01',
      'CHANGE-01',
      'JUDGE-01',
      'JUDGE-02',
      'LIVEBLOCKS-01',
      'CUSTOMER-01',
      'CUSTOMER-02',
      'CUSTOMER-03',
      'CUSTOMER-04',
      'CONFLICT-01',
    ]);
  });

  it('scores only observable calls, arguments, timings, results, and final state', () => {
    expect(
      runWebMcpEval({
        caseId: 'MFG-04',
        calls: [
          {
            tool: 'navigate_workspace',
            arguments: { destination: 'maker_requests' },
            timingMs: 4,
            result: { status: 'NAVIGATION_INITIATED' },
          },
        ],
        finalState: {
          navigation: { perspective: 'provider', authorityUnchanged: true },
        },
      }),
    ).toEqual({ caseId: 'MFG-04', passed: true, failures: [], toolCalls: 1 });
  });
});
