import { NextResponse } from "next/server";
import { completeIngestion } from "@/lib/api/client";

export async function POST(_request: Request, context: { params: Promise<{ transitionId: string }> }) {
  try {
    const { transitionId } = await context.params;
    const transition = await completeIngestion(transitionId);
    return NextResponse.json(transition);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Ingestion could not be completed." }, { status: 404 });
  }
}
