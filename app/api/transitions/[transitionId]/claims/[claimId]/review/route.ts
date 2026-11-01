import { NextResponse } from "next/server";
import { reviewClaim } from "@/lib/api/client";

export async function POST(request: Request, context: { params: Promise<{ transitionId: string; claimId: string }> }) {
  try {
    const { transitionId, claimId } = await context.params;
    const { action, note } = await request.json() as { action: "approve" | "reject" | "request-clarification"; note?: string };
    if (!["approve", "reject", "request-clarification"].includes(action)) return NextResponse.json({ error: "Unsupported review action." }, { status: 400 });
    return NextResponse.json(await reviewClaim(transitionId, claimId, action, note));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Claim review failed." }, { status: 400 });
  }
}
