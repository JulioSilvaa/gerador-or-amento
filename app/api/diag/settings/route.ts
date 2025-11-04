import { getSupabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

function getCfg() {
  const table = (process.env.WORKSHOP_TABLE || "workshop").trim();
  const jsonColumn = (process.env.WORKSHOP_JSON_COLUMN || "company").trim();
  const rowId = (process.env.WORKSHOP_ROW_ID || "default").trim();
  const bucket = (process.env.WORKSHOP_LOGO_BUCKET || "logos").trim();
  return { table, jsonColumn, rowId, bucket };
}

export async function GET() {
  try {
    const { table, jsonColumn, rowId, bucket } = getCfg();
    const supabase = getSupabaseServer();

    // Testa existência da tabela/coluna/linha
    let tableOk = true;
    let columnOk = true;
    let rowExists = false;
    let error: string | null = null;

    try {
      const { data, error: err } = await supabase
        .from(table)
        .select(jsonColumn)
        .eq("id", rowId)
        .maybeSingle();
      if (err) {
        error = err.message;
        // Não dá para distinguir 100% todos os casos, mas sinalizamos
        if (/column .* does not exist|42703/i.test(err.message))
          columnOk = false;
        if (/relation .* does not exist|42P01/i.test(err.message))
          tableOk = false;
      } else {
        rowExists = Boolean(data);
      }
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    }

    return Response.json({
      ok: tableOk && columnOk,
      config: { table, jsonColumn, rowId, bucket },
      checks: { tableOk, columnOk, rowExists },
      error,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
