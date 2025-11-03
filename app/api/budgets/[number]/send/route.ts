import { getSupabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

function mask(value: string | undefined, keep = 8) {
  if (!value) return null;
  const v = value.trim();
  if (v.length <= keep) return "*".repeat(v.length);
  return `${v.slice(0, keep)}...(${v.length})`;
}

export async function POST(
  req: Request,
  { params }: { params: { number: string } }
) {
  const url = new URL(req.url);
  let number = (params?.number || url.searchParams.get("number") || "").trim();
  // Fallback: extrai do pathname /api/budgets/{number}/send
  if (!number) {
    const parts = url.pathname.split("/").filter(Boolean);
    const idx = parts.indexOf("budgets");
    if (idx >= 0 && idx + 1 < parts.length) {
      number = decodeURIComponent(parts[idx + 1]);
    }
  }
  if (process.env.NODE_ENV !== "production") {
    console.info("[send-route] incoming", {
      path: url.pathname + url.search,
      number,
    });
  }
  if (!number) {
    return Response.json(
      { error: "Número do orçamento não informado" },
      { status: 400 }
    );
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json(
      {
        error:
          "Supabase não configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local",
      },
      { status: 500 }
    );
  }

  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("budgets")
      .select("*")
      .eq("number", number)
      .single();
    if (error) throw new Error(error.message);
    if (!data)
      return Response.json(
        { error: "Orçamento não encontrado" },
        { status: 404 }
      );

    const n8nUrl = (process.env.N8N_WEBHOOK_URL || "").trim();
    if (!n8nUrl) {
      return Response.json({
        ok: true,
        n8nNotified: false,
        info: "N8N_WEBHOOK_URL não configurado",
      });
    }

    const urlInfo = new URL(req.url);
    const publicBase = (process.env.PUBLIC_BASE_URL || "").trim();
    const base =
      publicBase && /^https?:\/\//i.test(publicBase)
        ? publicBase.replace(/\/$/, "")
        : `${urlInfo.protocol}//${urlInfo.host}`;
    const pdfUrl = `${base}/api/budgets/pdf?number=${encodeURIComponent(
      number
    )}`;

    const phoneDigits = String((data as any)?.client?.phone || "").replace(
      /\D/g,
      ""
    );
    const payload = {
      ...data,
      pdfUrl,
      client: { ...(data as any).client, phoneDigits },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const token = (process.env.N8N_WEBHOOK_TOKEN || "").trim();
    if (token) headers["Authorization"] = `Bearer ${token}`;

    if (process.env.NODE_ENV !== "production") {
      console.info("[send-route] posting to n8n", {
        n8nUrl: mask(n8nUrl),
        hasToken: Boolean(token),
        pdfUrl,
      });
    }

    const res = await fetch(n8nUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    try {
      clearTimeout(timeout);
    } catch {}

    const bodyTxt = await res.text().catch(() => "<no-body>");
    if (process.env.NODE_ENV !== "production") {
      console.info("[send-route] n8n response", {
        status: res.status,
        ok: res.ok,
        bodyPreview: bodyTxt.slice(0, 200),
      });
    }

    if (!res.ok) {
      return Response.json(
        {
          ok: false,
          n8nNotified: false,
          n8nStatusCode: res.status,
          n8nError: bodyTxt.slice(0, 500),
        },
        { status: 502 }
      );
    }

    return Response.json(
      { ok: true, n8nNotified: true, n8nStatusCode: res.status },
      { status: 200 }
    );
  } catch (e: any) {
    return Response.json(
      { ok: false, error: e?.message || "Falha ao reenviar orçamento" },
      { status: 500 }
    );
  }
}
