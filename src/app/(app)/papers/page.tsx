"use client";

import Link from "next/link";
import { PaperList, type PaperSummary } from "@/components/PaperList";
import { Button, Empty, ErrorNote, PageHeader, Spinner } from "@/components/ui";
import { useLoad } from "@/lib/client";

export default function PapersPage() {
  const { data, error, loading, reload } = useLoad<PaperSummary[]>("/api/papers");
  return (
    <>
      <PageHeader title="Generated Examination Papers" subtitle="Every paper you create is saved here. Reopen one to keep editing, regenerate single questions, or download it again." actions={<Link href="/create"><Button>New paper</Button></Link>} />
      <ErrorNote message={error} />
      {loading && !data ? <Spinner /> : data?.length ? <PaperList papers={data} onChanged={reload} /> : <Empty title="No papers yet">Create your first examination paper to see it here.</Empty>}
    </>
  );
}
