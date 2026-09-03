import { readFileSync } from 'node:fs';

const origin = process.env.ATTUNE_LOCAL_ORIGIN ?? 'http://localhost:3000';
const workspaceId = 'workspace:at-1042';

function judgeCode() {
  const environment = readFileSync('.env.local', 'utf8');
  const match = environment.match(/^#\s*RAW_JUDGE_CODE=(.+)$/m);
  if (!match?.[1]) throw new Error('The local judge access code is not configured.');
  return match[1].trim();
}

function envelope(view, command, prefix) {
  return {
    command,
    commandId: `${prefix}-${crypto.randomUUID()}`,
    expectedWorkspaceSeq: view.workspace.workspaceSeq,
    expectedCapabilityEpoch: view.workspace.capabilityEpoch,
    expectedAuthorityEpoch: view.workspace.authorityEpoch,
    expectedSpecHash: view.specHash,
    observationCursor: view.workspace.workspaceSeq,
  };
}

async function json(path, cookie, init = {}) {
  const response = await fetch(`${origin}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      Cookie: cookie,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`${path} failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function main() {
  const login = await fetch(`${origin}/api/judge-session`, {
    method: 'POST',
    body: new URLSearchParams({ accessCode: judgeCode() }),
    redirect: 'manual',
  });
  if (login.status !== 303) throw new Error(`Judge session failed with HTTP ${login.status}.`);
  const cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(';', 1)[0])
    .join('; ');
  if (!cookie) throw new Error('Judge session returned no cookie.');

  await json('/api/attune/reset', cookie, { method: 'POST' });
  const marketplace = await json(
    `/api/attune/marketplace?workspace_id=${encodeURIComponent(workspaceId)}&refresh=true`,
    cookie,
  );
  const profile = marketplace.providerProfile;
  const configuration = {
    material: 'aluminium',
    thicknessMm: 3,
    finish: profile.finishes?.[0] ?? 'As cut',
    quantity: 2,
    toleranceMm: typeof profile.toleranceMm === 'number' ? profile.toleranceMm : 0.2,
  };
  const requested = await json(
    `/api/attune/human?workspace_id=${encodeURIComponent(workspaceId)}`,
    cookie,
    {
      method: 'POST',
      body: JSON.stringify(
        envelope(marketplace.view, { type: 'request_quote', configuration }, 'verify-request'),
      ),
    },
  );
  const currency = profile.shopify?.currency ?? marketplace.connection.shop.currencyCode;
  const validUntil = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const providerReady = await json(
    `/api/attune/provider?workspace_id=${encodeURIComponent(workspaceId)}`,
    cookie,
  );
  if (!providerReady.capabilities.some(({ id }) => id === 'freeze_and_quote_revision')) {
    const frontier = providerReady.frontiers.provider.find(
      ({ id }) => id === 'freeze_and_quote_revision',
    );
    throw new Error(
      `Provider quote capability unavailable: ${JSON.stringify({
        blockers: frontier?.blockers,
        requestCount: providerReady.workspace.quoteRequests.length,
        requestHash: providerReady.workspace.quoteRequests.at(-1)?.specHash,
        currentHash: providerReady.specHash,
        provider: providerReady.workspace.providerCapabilityProfile.providerId,
        requestProvider: providerReady.workspace.quoteRequests.at(-1)?.provider,
      })}`,
    );
  }
  const quoted = await json(
    `/api/attune/provider?workspace_id=${encodeURIComponent(workspaceId)}`,
    cookie,
    {
      method: 'POST',
      body: JSON.stringify(
        envelope(
          providerReady,
          {
            type: 'freeze_and_quote_revision',
            amountMinor: 125_000,
            currency,
            leadTimeDays: 7,
            validUntil,
          },
          'verify-quote',
        ),
      ),
    },
  );
  const quote = quoted.workspace.quotes.at(-1);
  const draftOrder = quoted.workspace.externalCommerceRecords.at(-1);
  if (!quote || !draftOrder) throw new Error('Quote did not produce a verified Draft Order.');
  const accepted = await json(
    `/api/attune/human?workspace_id=${encodeURIComponent(workspaceId)}`,
    cookie,
    {
      method: 'POST',
      body: JSON.stringify(
        envelope(
          quoted,
          { type: 'accept_revision', revisionId: quote.revisionId, quoteId: quote.quoteId },
          'verify-accept',
        ),
      ),
    },
  );
  const request = accepted.workspace.manufacturingRequests.at(-1);
  const acceptance = accepted.workspace.acceptances.at(-1);
  const invoiceHost = draftOrder.invoiceUrl ? new URL(draftOrder.invoiceUrl).host : null;
  if (
    profile.source !== 'SHOPIFY_AND_ATTUNE' ||
    request?.configuration?.quantity !== configuration.quantity ||
    acceptance?.revisionId !== quote.revisionId ||
    acceptance.specHash !== quote.specHash ||
    draftOrder.syncState !== 'IN_SYNC' ||
    !invoiceHost
  ) {
    throw new Error('The accepted manufacturing order failed exact conformance checks.');
  }
  console.log(
    JSON.stringify(
      {
        connectedProvider: {
          shopId: marketplace.connection.shop.id,
          name: marketplace.connection.shop.name,
          domain: marketplace.connection.shop.myshopifyDomain,
          locationId: profile.shopify.locationId,
          locationName: profile.shopify.locationName,
          source: profile.source,
        },
        capabilities: marketplace.connection.capabilities,
        request: {
          id: request.requestId,
          revision: request.specRevision,
          specHashPrefix: request.specHash.slice(0, 12),
          configuration: request.configuration,
        },
        quote: {
          id: quote.quoteId,
          amountMinor: quote.amountMinor,
          currency: quote.currency,
          leadTimeDays: quote.leadTimeDays,
        },
        shopifyDraftOrder: {
          id: draftOrder.externalId,
          name: draftOrder.name,
          status: draftOrder.status,
          syncState: draftOrder.syncState,
          invoiceHost,
        },
        accepted: true,
      },
      null,
      2,
    ),
  );
}

await main();
