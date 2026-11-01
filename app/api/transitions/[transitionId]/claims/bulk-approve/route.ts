import { NextResponse } from "next/server";
import { bulkApproveClaims } from "@/lib/api/client";

export async function POST(request: Request, context: { params: Promise<{ transitionId: string }> }) {
  try {
    const { transitionId } = await context.params;
    const { claimIds } = await request.json() as { claimIds: string[] };
    if (!Array.isArray(claimIds) || claimIds.length === 0) return NextResponse.json({ error: "Select at least one eligible claim." }, { status: 400 });
    return NextResponse.json(await bulkApproveClaims(transitionId, claimIds));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Bulk approval failed." }, { status: 400 });
  }
}
