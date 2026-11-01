import { z } from "zod";
import { route, json, body, must, HttpError } from "@/lib/api";
import { checkQuestion, markingForQuestion, transformQuestion } from "@/lib/ai/actions";
import { loadContext } from "@/lib/ai/context";
import type { MarkingScheme, PaperRow } from "@/lib/schemas";

export const maxDuration = 180;

const Body = z.object({
  action: z.enum(["harder", "easier", "another", "scenario", "clarify", "regenerate", "custom", "check", "marking"]),
  instruction: z.string().optional(),
});

/** Every action touches exactly one question — the rest of the paper is never regenerated. */
export const POST = route<{ id: string; qid: string }>(async (req, { supabase }, { id, qid }) => {
  const { action, instruction } = await body(req, Body);
  const row = must(await supabase.from("papers").select("*").eq("id", id).single()) as PaperRow;
  if (!row.content) throw new HttpError(409, "Generate the paper first.");

  if (action === "check") return json({ check: await checkQuestion(supabase, row, qid) });

  if (action === "marking") {
    const q = row.content.sections.flatMap((s) => s.questions).find((x) => x.id === qid);
    if (!q) throw new HttpError(404, "Question not found");
    const ctx = await loadContext(supabase, row.resource_ids, []);
    const mq = await markingForQuestion(supabase, row, q, ctx.titles);
    const scheme: MarkingScheme = row.marking_scheme ?? { generalGuidelines: [], questions: [] };
    const next = { ...scheme, questions: [...scheme.questions.filter((x) => x.questionId !== qid), mq] };
    await supabase.from("papers").update({ marking_scheme: next, updated_at: new Date().toISOString() }).eq("id", id);
    return json({ marking: mq });
  }

  const question = await transformQuestion(supabase, row, qid, action, instruction);
  const content = {
    ...row.content,
    sections: row.content.sections.map((s) => ({ ...s, questions: s.questions.map((q) => (q.id === qid ? question : q)) })),
  };
  // a changed question invalidates its old marking scheme entry
  const marking = row.marking_scheme
    ? { ...row.marking_scheme, questions: row.marking_scheme.questions.filter((m) => m.questionId !== qid) }
    : null;
  await supabase.from("papers").update({ content, marking_scheme: marking, updated_at: new Date().toISOString() }).eq("id", id);
  return json({ question });
});
