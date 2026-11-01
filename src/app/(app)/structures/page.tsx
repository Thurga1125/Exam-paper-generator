"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Library } from "@/components/Library";
import { StructureEditor } from "@/components/StructureEditor";
import { Badge, Button, Card, Empty, ErrorNote, Modal, PageHeader, Spinner, useToast } from "@/components/ui";
import { api, useLoad } from "@/lib/client";
import { emptyStructure } from "@/lib/structure";
import { structureTotal, sum, type Structure } from "@/lib/schemas";

interface Saved { id: string; name: string; data: Structure; updated_at: string }

export default function StructuresPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad<Saved[]>("/api/structures");
  const [edit, setEdit] = useState<{ id: string | null; data: Structure } | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!edit) return;
    setSaving(true);
    try {
      const body = { data: { ...edit.data, totalMarks: structureTotal(edit.data) } };
      if (edit.id) await api(`/api/structures/${edit.id}`, { method: "PATCH", json: body });
      else await api("/api/structures", { method: "POST", json: body });
      toast("Structure saved");
      setEdit(null);
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed", "err");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Paper Structures & Templates"
        subtitle="Reusable blueprints: sections, question counts, sub-questions, marks and answer rules. Pick one when you create a paper."
        actions={<Button onClick={() => setEdit({ id: null, data: emptyStructure() })}><Plus className="h-4 w-4" />New structure</Button>}
      />
      <ErrorNote message={error} />
      {loading && !data ? <Spinner /> : data?.length ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {data.map((s) => (
            <li key={s.id}>
              <Card className="p-4">
                <p className="font-medium text-navy-950">{s.name}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone="blue">{structureTotal(s.data)} marks</Badge>
                  <Badge>{s.data.sections.length} sections</Badge>
                  <Badge>{sum(s.data.sections.map((x) => x.questions.length))} questions</Badge>
                  <Badge>{s.data.durationMinutes} min</Badge>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setEdit({ id: s.id, data: structuredClone(s.data) })}><Pencil className="h-3.5 w-3.5" />Edit</Button>
                  <Button size="sm" variant="danger" onClick={async () => { if (confirm(`Delete “${s.name}”?`)) { await api(`/api/structures/${s.id}`, { method: "DELETE" }); await reload(); } }}><Trash2 className="h-3.5 w-3.5" />Delete</Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : <Empty title="No saved structures">Create one here, or save one from the creation workspace.</Empty>}

      <h2 className="mb-1 mt-10 text-lg font-semibold text-navy-950">Uploaded structure files</h2>
      <p className="mb-4 text-sm text-slate-600">Upload an existing paper or template. In the creation workspace you can import it and the AI will turn it into an editable structure.</p>
      <Library kind="structure" />

      {edit && (
        <Modal title={edit.id ? "Edit structure" : "New structure"} onClose={() => setEdit(null)} wide>
          <StructureEditor value={edit.data} onChange={(d) => setEdit({ ...edit, data: d })} />
          <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button loading={saving} onClick={save}>Save structure</Button></div>
        </Modal>
      )}
    </>
  );
}
