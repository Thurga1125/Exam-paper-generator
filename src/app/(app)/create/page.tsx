"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { ErrorNote, Spinner } from "@/components/ui";

export default function NewPaperPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api<{ id: string }>("/api/papers", { method: "POST" })
      .then((p) => router.replace(`/create/${p.id}`))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not create the paper"));
  }, [router]);

  return error ? <ErrorNote message={error} /> : <Spinner label="Creating a new examination…" />;
}
