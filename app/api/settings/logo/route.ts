import { getSupabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

function cfg() {
  // Tabela/colunas reais
  const table = (process.env.WORKSHOP_TABLE || "config_empresa").trim();
  const recordId = (process.env.WORKSHOP_RECORD_ID || "").trim();
  const cols = {
    id: (process.env.WORKSHOP_COL_ID || "id").trim(),
    logoUrl: (process.env.WORKSHOP_COL_LOGO || "logo_url").trim(),
    createdAt: (process.env.WORKSHOP_COL_CREATED_AT || "created_at").trim(),
  } as const;
  const bucket = (process.env.WORKSHOP_LOGO_BUCKET || "company-logos").trim();
  return { table, recordId, cols, bucket };
}

export async function POST(req: Request) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json(
      {
        error:
          "Supabase não configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local",
      },
      { status: 500 }
    );
  }
  const { table, recordId, cols, bucket } = cfg();

  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    let filename = String(form.get("filename") || "logo");

    if (!file || typeof (file as File).arrayBuffer !== "function") {
      return Response.json(
        { error: "Envie o arquivo no campo 'file'" },
        { status: 400 }
      );
    }

    // Normaliza extensão pela mime, se possível
    const mime = file.type || "application/octet-stream";
    if (!/\.[a-z0-9]+$/i.test(filename)) {
      const ext = mime.split("/")[1] || "bin";
      filename = `${filename}.${ext}`;
    }

    const supabase = getSupabaseServer();

    // Garante bucket (público); ignora se já existir
    try {
      await supabase.storage.createBucket(bucket, { public: true });
    } catch {}

    const ownerFolder = recordId || "default";
    const path = `${ownerFolder}/${Date.now()}-${filename}`;
    const ab = await file.arrayBuffer();
    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(path, ab, { contentType: mime, upsert: true });
    if (upErr) {
      return Response.json(
        { error: `Falha ao subir a logo: ${upErr.message}` },
        { status: 500 }
      );
    }

    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
    const publicUrl = pub?.publicUrl;
    if (!publicUrl) {
      return Response.json(
        { error: "Não foi possível obter URL pública da logo" },
        { status: 500 }
      );
    }

    // Descobre registro alvo: recordId explícito ou o mais recente
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

    let upsertErr: { message: string } | null = null;
    if (currentId) {
      const { error } = await supabase
        .from(table)
        .update({ [cols.logoUrl]: publicUrl })
        .eq(cols.id, currentId);
      upsertErr = error;
    } else {
      const { error } = await supabase
        .from(table)
        .insert({ [cols.logoUrl]: publicUrl });
      upsertErr = error;
    }
    if (upsertErr) {
      return Response.json(
        {
          error: `Upload feito, mas falhou ao salvar logo: ${upsertErr.message}`,
          url: publicUrl,
        },
        { status: 500 }
      );
    }

    return Response.json({ ok: true, url: publicUrl });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json(
      { error: message || "Erro ao fazer upload da logo" },
      { status: 500 }
    );
  }
}
