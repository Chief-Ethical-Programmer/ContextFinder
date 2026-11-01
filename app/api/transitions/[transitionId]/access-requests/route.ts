import { NextResponse } from "next/server";
import { requestHandoverAccess } from "@/lib/api/client";

export async function POST(request: Request, context: { params: Promise<{ transitionId: string }> }) {
  try {
    const { transitionId } = await context.params;
    const { role, hiddenItemCount } = await request.json() as { role: string; hiddenItemCount: number };
    if (!role || !Number.isInteger(hiddenItemCount) || hiddenItemCount < 1) return NextResponse.json({ error: "A role and hidden item count are required." }, { status: 400 });
    return NextResponse.json(await requestHandoverAccess(transitionId, role, hiddenItemCount), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The access request could not be saved." }, { status: 400 });
  }
}
