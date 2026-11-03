"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }));
  useEffect(() => {
    try { window.localStorage.removeItem("contextfinder:transitions:v1"); } catch { /* Ignore unavailable browser storage. */ }
  }, []);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
