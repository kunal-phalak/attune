import { WEBMCP_EVAL_CASES } from './cases';
import { scoreWebMcpEval, type WebMcpEvalResult, type WebMcpEvalTrace } from './rubric';

export function runWebMcpEval(trace: WebMcpEvalTrace): WebMcpEvalResult {
  const testCase = WEBMCP_EVAL_CASES.find(({ id }) => id === trace.caseId);
  if (!testCase) throw new TypeError(`Unknown WebMCP eval case ${trace.caseId}.`);
  return scoreWebMcpEval(testCase, trace);
}

export function webMcpEvalCatalog() {
  return WEBMCP_EVAL_CASES.map(({ id, userGoal, initialState, maxToolCalls }) => ({
    id,
    userGoal,
    initialState,
    maxToolCalls,
  }));
}
