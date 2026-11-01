import { NextResponse } from "next/server";
import { getVersions } from "@/lib/api/client";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ transitionId: string }> }) {
  const { transitionId } = await context.params;
  return NextResponse.json(await getVersions(transitionId));
}
