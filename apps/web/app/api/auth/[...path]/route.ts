import { getNeonAuth } from '../../../../lib/auth/neon';

export const dynamic = 'force-dynamic';

type AuthRouteContext = { readonly params: Promise<{ readonly path: string[] }> };

export async function GET(request: Request, context: AuthRouteContext) {
  return getNeonAuth().handler().GET(request, context);
}

export async function POST(request: Request, context: AuthRouteContext) {
  return getNeonAuth().handler().POST(request, context);
}
