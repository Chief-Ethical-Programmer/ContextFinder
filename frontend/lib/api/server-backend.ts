import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const backendUrl = (process.env.BACKEND_API_URL ?? "http://localhost:8000/api/v1").replace(/\/$/, "");

export async function backendGet(path: string) {
  const token = (await cookies()).get("contextfinder-session")?.value;
  if (!token) redirect("/login");
  const response = await fetch(`${backendUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) redirect("/login");
  if (!response.ok) throw new Error(body.message ?? body.detail ?? `Backend request failed (${response.status}).`);
  return body;
}
