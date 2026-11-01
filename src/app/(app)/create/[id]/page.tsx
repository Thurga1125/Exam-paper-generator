import { Wizard } from "@/components/Wizard";

export default async function CreatePage({ params }: PageProps<"/create/[id]">) {
  const { id } = await params;
  return <Wizard id={id} />;
}
