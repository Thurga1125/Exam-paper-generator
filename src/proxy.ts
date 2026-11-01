import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const SETUP_HTML = `<!doctype html><meta charset="utf-8"><title>Setup required</title>
<body style="font-family:system-ui;max-width:640px;margin:10vh auto;padding:0 20px;line-height:1.6;color:#0f172a">
<h1>Setup required</h1>
<p>Smart Exam Paper Studio needs your Supabase and OpenAI keys.</p>
<ol>
<li>Open <code>.env.local</code> in the project folder.</li>
<li>Fill in <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> (Supabase &rarr; Project Settings &rarr; API) and <code>OPENAI_API_KEY</code>.</li>
<li>Stop the server (Ctrl+C), run <code>npm run dev</code> again, and refresh.</li>
</ol></body>`;

/** Refreshes the Supabase session and gates everything except the login page. */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || url.includes("YOUR-PROJECT") || key === "your-anon-key") {
    return new NextResponse(SETUP_HTML, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims;
  const { pathname } = request.nextUrl;
  const isPublic = pathname.startsWith("/login") || pathname.startsWith("/auth");

  if (!signedIn && !isPublic) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (signedIn && pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
