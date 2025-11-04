import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";

type CompanyData = {
  name: string;
  cnpj: string;
  phone: string;
  email: string;
  address: string;
  logo: string;
};

type ClientData = {
  name: string;
  phone: string;
  vehicle: string;
  plate: string;
};

type Item = {
  id: number;
  description: string;
  quantity: number;
  unitPrice: number;
  displayPrice: string;
};

type Budget = {
  number: string;
  date: string; // ISO
  company: CompanyData;
  client: ClientData;
  items: Item[];
  total: number;
};

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json(
      {
        error:
          "Supabase não configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local",
      },
      { status: 500 }
    );
  }

  let body: Budget;
  try {
    body = (await req.json()) as Budget;
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  // Validação mínima
  if (!body?.number || !body?.client?.name || !Array.isArray(body?.items)) {
    return Response.json(
      { error: "Dados obrigatórios ausentes: number, client.name, items" },
      { status: 400 }
    );
  }

  // Persistir como JSONB para flexibilidade
  const payload = {
    number: body.number,
    date: body.date,
    company: body.company,
    client: body.client,
    items: body.items,
    total: body.total,
  };

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("budgets")
    .upsert(payload, { onConflict: "number" })
    .select("number")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Disparo opcional para n8n após salvar com sucesso
  const n8nUrl = (process.env.N8N_WEBHOOK_URL || "").trim();
  let n8nNotified = false;
  let n8nStatusCode: number | null = null;
  let n8nError: string | null = null;
  if (n8nUrl) {
    try {
      const reqUrl = new URL(req.url);
      const publicBase = (process.env.PUBLIC_BASE_URL || "").trim();
      const base =
        publicBase && /^https?:\/\//i.test(publicBase)
          ? publicBase.replace(/\/$/, "")
          : `${reqUrl.protocol}//${reqUrl.host}`;
      const pdfUrl = `${base}/api/budgets/pdf?number=${encodeURIComponent(
        body.number
      )}`;

      const phoneDigits = (body.client?.phone || "").replace(/\D/g, "");

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      const token = (process.env.N8N_WEBHOOK_TOKEN || "").trim();
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const n8nRes = await fetch(n8nUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...payload,
          pdfUrl,
          client: { ...payload.client, phoneDigits },
        }),
        signal: controller.signal,
      });
      n8nStatusCode = n8nRes.status;
      if (!n8nRes.ok) {
        const txt = await n8nRes.text().catch(() => "<no-body>");
        n8nError = `n8n respondeu ${n8nRes.status}: ${txt.slice(0, 500)}`;
        console.warn("[n8n] webhook resposta não OK:", n8nError);
      } else {
        n8nNotified = true;
      }
      try {
        clearTimeout(timeout);
      } catch {}
    } catch (e) {
      n8nError = (e as Error)?.message ?? String(e);
      console.warn("[n8n] webhook falhou:", n8nError);
    }
  }

  return Response.json({
    ok: true,
    id: data.number,
    n8nNotified,
    n8nStatusCode,
    n8nError,
  });
}

export async function GET() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json(
      {
        error:
          "Supabase não configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local",
      },
      { status: 500 }
    );
  }

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("budgets")
    .select("*")
    .order("date", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data ?? []);
}
