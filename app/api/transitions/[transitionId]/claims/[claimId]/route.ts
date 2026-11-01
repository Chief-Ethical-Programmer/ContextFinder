import { NextResponse } from "next/server";
import { editClaim } from "@/lib/api/client";
import type { ClaimEditInput } from "@/lib/types";

export async function PATCH(request: Request, context: { params: Promise<{ transitionId: string; claimId: string }> }) {
  try {
    const { transitionId, claimId } = await context.params;
    const edit = await request.json() as ClaimEditInput;
    return NextResponse.json(await editClaim(transitionId, claimId, edit));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Claim edit failed." }, { status: 400 });
  }
}
