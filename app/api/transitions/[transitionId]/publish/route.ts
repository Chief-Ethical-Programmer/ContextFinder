import { NextResponse } from "next/server";
import { publishTransition } from "@/lib/api/client";

export async function POST(request: Request, context: { params: Promise<{ transitionId: string }> }) {
  try {
    const { transitionId } = await context.params;
    const { reviewerRemarks } = await request.json() as { reviewerRemarks?: string };
    return NextResponse.json(await publishTransition(transitionId, reviewerRemarks));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Publish failed." }, { status: 400 });
  }
}
