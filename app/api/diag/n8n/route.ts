export const runtime = "nodejs";

function mask(value: string | undefined, keep = 4) {
  if (!value) return null;
  const v = value.trim();
  if (v.length <= keep) return "*".repeat(v.length);
  return `${v.slice(0, keep)}...(${v.length})`;
}

export async function GET() {
  const url = (process.env.N8N_WEBHOOK_URL || "").trim();
  const token = (process.env.N8N_WEBHOOK_TOKEN || "").trim();
  const publicBase = (process.env.PUBLIC_BASE_URL || "").trim();
  return Response.json({
    ok: true,
    hasUrl: Boolean(url),
    hasToken: Boolean(token),
    publicBaseSet: Boolean(publicBase),
    details: {
      N8N_WEBHOOK_URL_preview: url ? mask(url, 8) : null,
      N8N_WEBHOOK_TOKEN_present: Boolean(token),
      PUBLIC_BASE_URL: publicBase || null,
    },
  });
}

export async function POST(req: Request) {
  const url = (process.env.N8N_WEBHOOK_URL || "").trim();
  const token = (process.env.N8N_WEBHOOK_TOKEN || "").trim();
  if (!url) {
    return Response.json(
      { ok: false, error: "N8N_WEBHOOK_URL não configurado no .env" },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const payload = {
    ping: true,
    ts: new Date().toISOString(),
    sample: body && Object.keys(body).length ? body : { message: "diagnostic" },
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await res.text().catch(() => "<no-body>");
    try {
      clearTimeout(timeout);
    } catch {}
    return Response.json(
      {
        ok: res.ok,
        status: res.status,
        body: text.slice(0, 1000),
      },
      { status: res.ok ? 200 : 502 }
    );
  } catch (e: any) {
    try {
      clearTimeout(timeout);
    } catch {}
    return Response.json(
      {
        ok: false,
        error: e?.message || String(e),
      },
      { status: 500 }
    );
  }
}
