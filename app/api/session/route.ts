import { environmentLabel, fastPathCache, isDemoMode, studioUser } from "@/lib/config";
import type { Session } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session: Session = { demo: isDemoMode(), user: studioUser(), environment: environmentLabel(), fastPath: !isDemoMode() && fastPathCache() };
  return Response.json(session);
}
