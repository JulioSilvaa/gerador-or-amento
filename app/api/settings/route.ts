import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type CompanyData = {
  name: string;
  cnpj: string;
  phone: string;
  email: string;
  address: string;
  logo: string;
};

function getCfg() {
  // Tabela real e colunas conforme seu screenshot
  const table = (process.env.WORKSHOP_TABLE || "config_empresa").trim();
  const recordId = (process.env.WORKSHOP_RECORD_ID || "").trim(); // uuid opcional
  const cols = {
    id: (process.env.WORKSHOP_COL_ID || "id").trim(),
    name: (process.env.WORKSHOP_COL_NAME || "nome_empresa").trim(),
    whatsapp: (process.env.WORKSHOP_COL_WHATSAPP || "whatsapp").trim(),
    phone: (process.env.WORKSHOP_COL_PHONE || "phone").trim(),
    cnpj: (process.env.WORKSHOP_COL_CNPJ || "cnpj").trim(),
    email: (process.env.WORKSHOP_COL_EMAIL || "email").trim(),
    address: (process.env.WORKSHOP_COL_ADDRESS || "endereco").trim(),
    pix: (process.env.WORKSHOP_COL_PIX || "pix").trim(),
    logoUrl: (process.env.WORKSHOP_COL_LOGO || "logo_url").trim(),
    createdAt: (process.env.WORKSHOP_COL_CREATED_AT || "created_at").trim(),
  } as const;
  return { table, recordId, cols };
}

function toCompany(
  row: Record<string, unknown>,
  cols: ReturnType<typeof getCfg>["cols"]
): CompanyData {
  const phoneValue = (row[cols.whatsapp] ?? row[cols.phone] ?? "") as unknown;
  return {
    name: String(row[cols.name] ?? ""),
    cnpj: String(row[cols.cnpj] ?? ""),
    phone: String((phoneValue as string) ?? ""),
    email: String(row[cols.email] ?? ""),
    address: String(row[cols.address] ?? ""),
    logo: String(row[cols.logoUrl] ?? ""),
  };
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
  const { table, recordId, cols } = getCfg();
  try {
    const supabase = getSupabaseServer();
    const selectList = [
      cols.id,
      cols.name,
      cols.cnpj,
      cols.email,
      cols.address,
      cols.whatsapp,
      cols.phone,
      cols.logoUrl,
      cols.createdAt,
    ].join(",");

    let data: Record<string, unknown> | null = null;
    let error: { message: string } | null = null;
    if (recordId) {
      const res = await supabase
        .from(table)
        .select(selectList)
        .eq(cols.id, recordId)
        .limit(1)
        .maybeSingle();
      data = (res.data as unknown as Record<string, unknown>) ?? null;
      error = res.error;
    } else {
      const res = await supabase
        .from(table)
        .select(selectList)
        .order(cols.createdAt, { ascending: false })
        .limit(1)
        .maybeSingle();
      data = (res.data as unknown as Record<string, unknown>) ?? null;
      error = res.error;
    }
    if (error) {
      return Response.json(
        {
          error: `Falha ao buscar configurações em '${table}'. ${error.message}`,
        },
        { status: 500 }
      );
    }
    if (!data) return Response.json({ company: null });
    return Response.json({
      company: toCompany(data, cols),
      id: (data as Record<string, unknown>)[cols.id],
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json(
      { error: message || "Erro ao consultar configurações" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json(
      {
        error:
          "Supabase não configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local",
      },
      { status: 500 }
    );
  }
  const { table, recordId, cols } = getCfg();
  let body: CompanyData;
  try {
    body = (await req.json()) as CompanyData;
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!body?.name) {
    return Response.json(
      { error: "Campo 'name' é obrigatório" },
      { status: 400 }
    );
  }
  try {
    const supabase = getSupabaseServer();
    // Descobrir o registro a atualizar (recordId específico ou o mais recente)
    let currentId: string | null = null;
    if (recordId) {
      currentId = recordId;
    } else {
      const { data } = await supabase
        .from(table)
        .select(cols.id)
        .order(cols.createdAt, { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data && typeof data === "object") {
        const v = (data as Record<string, unknown>)[cols.id];
        currentId = typeof v === "string" ? v : null;
      } else {
        currentId = null;
      }
    }

    const rowPayload: Record<string, unknown> = {
      [cols.name]: body.name,
      [cols.cnpj]: body.cnpj,
      [cols.email]: body.email,
      [cols.address]: body.address,
      [cols.logoUrl]: body.logo,
      // prioriza whatsapp
      [cols.whatsapp]: body.phone,
    };

    let errMsg: string | null = null;
    if (currentId) {
      const { error } = await supabase
        .from(table)
        .update(rowPayload)
        .eq(cols.id, currentId);
      if (error) errMsg = error.message;
    } else {
      const { error } = await supabase.from(table).insert(rowPayload);
      if (error) errMsg = error.message;
    }
    if (errMsg) {
      return Response.json(
        { error: `Falha ao salvar configurações em '${table}'. ${errMsg}` },
        { status: 500 }
      );
    }
    return Response.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json(
      { error: message || "Erro ao salvar configurações" },
      { status: 500 }
    );
  }
}
