"use client";

import { useEffect, useState } from "react";
import { ExamDetailsForm, FormattingForm, GenerationOptionsForm } from "@/components/ConfigForms";
import { Button, Card, ErrorNote, PageHeader, Spinner, useToast } from "@/components/ui";
import { api, useLoad } from "@/lib/client";
import type { ExamConfig } from "@/lib/schemas";

export default function SettingsPage() {
  const toast = useToast();
  const { data, error, loading } = useLoad<{ defaults: ExamConfig }>("/api/settings");
  const [cfg, setCfg] = useState<ExamConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (data && !cfg) setCfg(data.defaults);
  }, [data, cfg]);

  async function save() {
    if (!cfg) return;
    setSaving(true);
    try {
      await api("/api/settings", { method: "PUT", json: { defaults: cfg } });
      toast("Defaults saved");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed", "err");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !cfg) return <Spinner />;
  if (!cfg) return <ErrorNote message={error ?? "Could not load settings"} />;
  const patch = (p: Partial<ExamConfig>) => setCfg({ ...cfg, ...p });

  return (
    <>
      <PageHeader title="Settings" subtitle="Defaults applied to every new examination paper — institution details, generation options and document formatting." actions={<Button loading={saving} onClick={save}>Save defaults</Button>} />
      <div className="space-y-5">
        <Card className="p-4 sm:p-5"><h2 className="mb-3 font-semibold text-navy-950">Institution & exam defaults</h2><ExamDetailsForm config={cfg} onChange={patch} /></Card>
        <Card className="p-4 sm:p-5"><h2 className="mb-3 font-semibold text-navy-950">Generation defaults</h2><GenerationOptionsForm config={cfg} onChange={patch} /></Card>
        <Card className="p-4 sm:p-5"><h2 className="mb-3 font-semibold text-navy-950">Document formatting</h2><FormattingForm value={cfg.formatting} onChange={(p) => patch({ formatting: { ...cfg.formatting, ...p } })} /></Card>
      </div>
    </>
  );
}
