import { PaperEditor } from "@/components/PaperEditor";

export default async function PaperPage({ params }: PageProps<"/papers/[id]">) {
  const { id } = await params;
  return <PaperEditor id={id} />;
}
