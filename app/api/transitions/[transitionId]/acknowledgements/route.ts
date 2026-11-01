import { NextResponse } from "next/server";
import { acknowledgeTransition } from "@/lib/api/client";

export async function POST(request: Request, context: { params: Promise<{ transitionId: string }> }) {
  try {
    const { transitionId } = await context.params;
    const { personName } = await request.json() as { personName: string };
    if (!personName?.trim()) return NextResponse.json({ error: "The acknowledging person is required." }, { status: 400 });
    return NextResponse.json(await acknowledgeTransition(transitionId, personName.trim()));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Acknowledgement failed." }, { status: 400 });
  }
}
