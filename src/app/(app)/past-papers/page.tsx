import { Library } from "@/components/Library";
import { PageHeader } from "@/components/ui";

export default function PastPapersPage() {
  return (
    <>
      <PageHeader title="Past Papers Library" subtitle="Previous examination papers. The AI learns their numbering, section layout, marks distribution and difficulty — it never copies their questions." />
      <Library kind="past_paper" />
    </>
  );
}
