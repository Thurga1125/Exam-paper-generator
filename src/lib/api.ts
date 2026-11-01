import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { ZodError } from "zod";
import { createClient } from "./supabase/server";
import { AiConfigError } from "./ai/openai";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface Auth {
  supabase: SupabaseClient;
  user: User;
}

type Handler<P> = (req: NextRequest, auth: Auth, params: P) => Promise<Response>;

/** Wraps a route handler with auth + consistent JSON error responses. */
export function route<P = Record<string, never>>(handler: Handler<P>) {
  return async (req: NextRequest, ctx: { params: Promise<P> }): Promise<Response> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) throw new HttpError(401, "Not signed in");
      return await handler(req, { supabase, user: data.user }, await ctx.params);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof ZodError) {
    const msg = e.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
    return NextResponse.json({ error: `Invalid input — ${msg}` }, { status: 400 });
  }
  if (e instanceof AiConfigError) return NextResponse.json({ error: e.message }, { status: 503 });
  const message = e instanceof Error ? e.message : "Unexpected error";
  console.error("[api]", e);
  return NextResponse.json({ error: message }, { status: 500 });
}

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });

export async function body<T>(req: NextRequest, schema: { parse: (x: unknown) => T }): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "Request body must be JSON");
  }
  return schema.parse(raw);
}

export function must<T>(res: { data: T; error: { message: string; code?: string } | null }, notFound = "Not found"): NonNullable<T> {
  if (res.error) {
    if (res.error.code === "PGRST116") throw new HttpError(404, notFound);
    throw new Error(res.error.message);
  }
  if (res.data === null || res.data === undefined) throw new HttpError(404, notFound);
  return res.data as NonNullable<T>;
}
