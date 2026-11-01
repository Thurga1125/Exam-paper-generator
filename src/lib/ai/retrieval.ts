import type { SupabaseClient } from "@supabase/supabase-js";
import { embed } from "./openai";

export interface Source {
  tag: string; // S1, S2…
  chunkId: string;
  resourceId: string;
  title: string;
  content: string;
  similarity: number;
}

/**
 * Semantic retrieval over the selected resources. Runs one vector search per
 * query, merges by best similarity and prefers chunks not already used.
 */
export async function retrieve(
  supabase: SupabaseClient,
  args: {
    resourceIds: string[];
    titles: Map<string, string>;
    queries: string[];
    maxTotal?: number;
    exclude?: Set<string>;
  },
): Promise<Source[]> {
  const { resourceIds, titles, exclude } = args;
  const queries = args.queries.map((q) => q.trim()).filter(Boolean);
  if (!resourceIds.length || !queries.length) return [];
  const maxTotal = args.maxTotal ?? 16;

  const vectors = await embed(queries);
  const best = new Map<string, Source>();
  await Promise.all(
    vectors.map(async (v) => {
      const { data, error } = await supabase.rpc("match_chunks", {
        query_embedding: JSON.stringify(v),
        resource_ids: resourceIds,
        match_count: Math.ceil((maxTotal * 2) / Math.max(1, Math.min(queries.length, 4))) + 4,
      });
      if (error) throw new Error(`Retrieval failed: ${error.message}`);
      for (const r of data as { id: string; resource_id: string; content: string; similarity: number }[]) {
        const prev = best.get(r.id);
        if (!prev || prev.similarity < r.similarity) {
          best.set(r.id, {
            tag: "",
            chunkId: r.id,
            resourceId: r.resource_id,
            title: titles.get(r.resource_id) ?? "Resource",
            content: r.content,
            similarity: r.similarity,
          });
        }
      }
    }),
  );

  const all = [...best.values()].sort((a, b) => b.similarity - a.similarity);
  const fresh = all.filter((s) => !exclude?.has(s.chunkId));
  const stale = all.filter((s) => exclude?.has(s.chunkId));
  const picked = [...fresh, ...stale].slice(0, maxTotal);
  return picked.map((s, i) => ({ ...s, tag: `S${i + 1}` }));
}

export function formatSources(sources: Source[]): string {
  if (!sources.length) return "(no source excerpts were retrieved)";
  return sources.map((s) => `[${s.tag}] (${s.title})\n${s.content}`).join("\n\n---\n\n");
}
