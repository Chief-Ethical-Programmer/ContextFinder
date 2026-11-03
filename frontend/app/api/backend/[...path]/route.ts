import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const backendUrl = (process.env.BACKEND_API_URL ?? "http://localhost:8000/api/v1").replace(/\/$/, "");

async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const token = (await cookies()).get("contextfinder-session")?.value;
  if (!token) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });

  const { path } = await context.params;
  const encodedPath = path.map((part) => encodeURIComponent(part)).join("/");
  const incoming = new URL(request.url);
  const headers = new Headers({ Authorization: `Bearer ${token}`, Accept: "application/json" });
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  const hasBody = !["GET", "HEAD"].includes(request.method);

  try {
    const response = await fetch(`${backendUrl}/${encodedPath}${incoming.search}`, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      cache: "no-store",
    });
    const responseBody = await response.arrayBuffer();
    const responseHeaders = new Headers();
    const responseContentType = response.headers.get("content-type");
    if (responseContentType) responseHeaders.set("content-type", responseContentType);
    const requestId = response.headers.get("x-request-id");
    if (requestId) responseHeaders.set("x-request-id", requestId);
    return new NextResponse(responseBody, { status: response.status, headers: responseHeaders });
  } catch {
    return NextResponse.json({ error: "Could not reach the backend. Check that the API is running." }, { status: 503 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
