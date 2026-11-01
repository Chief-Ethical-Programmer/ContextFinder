import { NextResponse } from "next/server";
import { createTransition, type CreateTransitionInput } from "@/lib/api/client";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as CreateTransitionInput;
    if (!payload.project?.trim() || !payload.projectCode?.trim() || !payload.departingName?.trim() || !payload.incomingName?.trim() || !payload.sources?.length) {
      return NextResponse.json({ error: "Project, people and at least one approved source are required." }, { status: 400 });
    }
    const transition = await createTransition(payload);
    return NextResponse.json(transition, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start the transition." }, { status: 500 });
  }
}
