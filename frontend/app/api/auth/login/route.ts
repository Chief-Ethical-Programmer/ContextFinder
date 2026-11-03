import { NextResponse } from "next/server";

const backendUrl = (process.env.BACKEND_API_URL ?? "http://localhost:8000/api/v1").replace(/\/$/, "");

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const response = await fetch(`${backendUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json({ error: body.message ?? body.detail ?? "Email or password is incorrect." }, { status: response.status });
    }
    const result = NextResponse.json(body, { status: response.status });
    result.cookies.set("contextfinder-session", body.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 60,
    });
    return result;
  } catch {
    return NextResponse.json({ error: "Could not reach the backend. Make sure the API and PostgreSQL are running." }, { status: 503 });
  }
}
