import { NextResponse } from "next/server";

const backendUrl = (process.env.BACKEND_API_URL ?? "http://localhost:8000/api/v1").replace(/\/$/, "");

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const response = await fetch(`${backendUrl}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json({ error: body.message ?? body.detail ?? "Account could not be created." }, { status: response.status });
    }
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json({ error: "Could not reach the backend. Make sure the API and PostgreSQL are running." }, { status: 503 });
  }
}
