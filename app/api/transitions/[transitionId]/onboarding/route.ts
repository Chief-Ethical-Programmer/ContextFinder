import { NextResponse } from "next/server";
import { getOnboardingView } from "@/lib/api/client";
import type { RecipientRole } from "@/lib/types";

export const dynamic = "force-dynamic";

const roles: RecipientRole[] = ["Technical successor", "Project lead", "New volunteer"];

export async function GET(request: Request, context: { params: Promise<{ transitionId: string }> }) {
  try {
    const { transitionId } = await context.params;
    const role = new URL(request.url).searchParams.get("role") as RecipientRole | null;
    if (!role || !roles.includes(role)) return NextResponse.json({ error: "A supported recipient role is required." }, { status: 400 });
    return NextResponse.json(await getOnboardingView(transitionId, role));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The handover view could not be loaded." }, { status: 400 });
  }
}
