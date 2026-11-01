import { Library } from "@/components/Library";
import { PageHeader } from "@/components/ui";

export default function ResourcesPage() {
  return (
    <>
      <PageHeader title="My Resources" subtitle="Lecture notes, slides, textbooks and syllabi. Upload once, organise by subject, module and topic, and reuse in any paper." />
      <Library kind="resource" />
    </>
  );
}
