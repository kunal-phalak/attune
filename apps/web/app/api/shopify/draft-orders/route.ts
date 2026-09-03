import { shopifyInstallationForOwner } from '@attune/database';
import { customerCheckoutHandoffWithAdmin, listRecentDraftOrdersWithAdmin } from '@attune/shopify';
import { NextResponse } from 'next/server';

import { currentAttuneUser } from '../../../../lib/auth/session';
import { adminForShopifyInstallation } from '../../../../lib/shopify/installations';

export const dynamic = 'force-dynamic';

function errorResponse(error: unknown, status = 400) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : 'Shopify Draft Orders are unavailable.' },
    { status, headers: { 'Cache-Control': 'no-store, private' } },
  );
}

function adminUrl(shopDomain: string, externalId: string): string {
  const id = externalId.split('/').at(-1);
  return `https://${shopDomain}/admin/draft_orders/${encodeURIComponent(id ?? externalId)}`;
}

export async function GET(request: Request) {
  try {
    const user = await currentAttuneUser();
    if (!user) return errorResponse(new Error('Authentication required.'), 401);
    const installationId = new URL(request.url).searchParams.get('installation_id');
    if (!installationId?.startsWith('shopify:')) {
      return errorResponse(new TypeError('A valid Shopify installation is required.'));
    }
    const installation = await shopifyInstallationForOwner(user.principalId, installationId);
    if (!installation) return errorResponse(new Error('Shopify installation not found.'), 404);
    const draftOrders = await listRecentDraftOrdersWithAdmin(
      await adminForShopifyInstallation(installation),
    );
    return NextResponse.json(
      {
        store: {
          installationId: installation.id,
          name: installation.shopName,
          domain: installation.shopDomain,
        },
        draftOrders: draftOrders.map((order) => ({
          externalId: order.externalId,
          name: order.name,
          status: order.status,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
          invoiceSent: order.invoiceSent,
          checkoutAvailable: order.checkoutAvailable,
          convertedOrderName: order.convertedOrderName,
          attuneBinding: order.attuneBinding,
          adminUrl: adminUrl(installation.shopDomain, order.externalId),
        })),
      },
      { headers: { 'Cache-Control': 'no-store, private' } },
    );
  } catch (error) {
    return errorResponse(error, 502);
  }
}

export async function POST(request: Request) {
  try {
    const user = await currentAttuneUser();
    if (!user) return errorResponse(new Error('Authentication required.'), 401);
    const body: unknown = await request.json().catch(() => null);
    const installationId =
      typeof body === 'object' && body !== null ? Reflect.get(body, 'installationId') : undefined;
    const draftOrderId =
      typeof body === 'object' && body !== null ? Reflect.get(body, 'draftOrderId') : undefined;
    const userConfirmed =
      typeof body === 'object' && body !== null ? Reflect.get(body, 'userConfirmed') : undefined;
    if (
      typeof installationId !== 'string' ||
      !installationId.startsWith('shopify:') ||
      typeof draftOrderId !== 'string' ||
      !draftOrderId.startsWith('gid://shopify/DraftOrder/')
    ) {
      return errorResponse(new TypeError('Valid installation and Draft Order IDs are required.'));
    }
    if (userConfirmed !== true) {
      return NextResponse.json(
        {
          status: 'USER_CONFIRMATION_REQUIRED',
          nextAction: 'Ask the merchant before revealing the customer checkout handoff URL.',
        },
        { status: 409, headers: { 'Cache-Control': 'no-store, private' } },
      );
    }
    const installation = await shopifyInstallationForOwner(user.principalId, installationId);
    if (!installation) return errorResponse(new Error('Shopify installation not found.'), 404);
    const handoff = await customerCheckoutHandoffWithAdmin(
      await adminForShopifyInstallation(installation),
      draftOrderId,
    );
    return NextResponse.json(
      {
        status: 'CHECKOUT_HANDOFF_READY',
        draftOrder: handoff.name,
        checkoutUrl: handoff.invoiceUrl,
        nextAction: 'Share only through the merchant-approved customer channel.',
      },
      { headers: { 'Cache-Control': 'no-store, private' } },
    );
  } catch (error) {
    return errorResponse(error, 502);
  }
}
