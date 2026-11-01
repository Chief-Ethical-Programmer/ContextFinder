import { NextResponse } from "next/server";
import { submitExitAnswers } from "@/lib/api/client";
import type { ExitAnswerStatus } from "@/lib/types";

export async function POST(request: Request, context: { params: Promise<{ transitionId: string }> }) {
  try {
    const { transitionId } = await context.params;
    const { responses } = await request.json() as { responses: Array<{ questionId: string; answer: string; status: ExitAnswerStatus }> };
    if (!Array.isArray(responses) || responses.length === 0) return NextResponse.json({ error: "At least one exit response is required." }, { status: 400 });
    return NextResponse.json(await submitExitAnswers(transitionId, responses));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The answers could not be submitted." }, { status: 400 });
  }
}
