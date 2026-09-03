import { buyerCommerceProfile, saveBuyerCommerceProfile } from '@attune/database';

import { attuneErrorResponse, noStoreJson } from '../../../../lib/attune-response';
import { currentAttuneUser } from '../../../../lib/auth/session';
import { parseBuyerCommerceProfile } from '../../../../lib/manufacturing/buyer-commerce';

export const dynamic = 'force-dynamic';

async function requireUser() {
  const user = await currentAttuneUser();
  if (!user) throw new Error('AUTHENTICATION_REQUIRED');
  return user;
}

export async function GET() {
  try {
    const user = await requireUser();
    return noStoreJson({ profile: await buyerCommerceProfile(user.principalId) });
  } catch (error) {
    return attuneErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireUser();
    const profile = parseBuyerCommerceProfile(user.principalId, await request.json());
    return noStoreJson({ profile: await saveBuyerCommerceProfile(profile) });
  } catch (error) {
    return attuneErrorResponse(error);
  }
}
