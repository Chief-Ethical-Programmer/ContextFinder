import { NextResponse } from "next/server";
import { saveExitAnswer } from "@/lib/api/client";

export async function POST(request: Request, context: { params: Promise<{ transitionId: string }> }) {
  try {
    const { transitionId } = await context.params;
    const { questionId, answer, status } = await request.json() as { questionId: string; answer: string; status: "draft" | "dont-know" | "skipped" };
    if (!questionId || !["draft", "dont-know", "skipped"].includes(status)) return NextResponse.json({ error: "A valid question and answer status are required." }, { status: 400 });
    return NextResponse.json(await saveExitAnswer(transitionId, questionId, answer ?? "", status));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The answer could not be saved." }, { status: 400 });
  }
}
