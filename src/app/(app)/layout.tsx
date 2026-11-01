import { Shell } from "@/components/Shell";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return <Shell email={data.user?.email ?? ""}>{children}</Shell>;
}
