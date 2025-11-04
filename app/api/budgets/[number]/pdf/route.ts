// Usar build standalone do PDFKit (inclui fontes embutidas e evita acesso a FS)
// @ts-expect-error: o build standalone não possui declarações de tipos
import PDFDocument from "pdfkit/js/pdfkit.standalone.js";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { NextRequest } from "next/server";

export const runtime = "nodejs"; // garante Node APIs para PDFKit

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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

async function generatePdfBuffer(b: Budget): Promise<Buffer> {
  return await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer | Uint8Array) =>
      chunks.push(Buffer.from(chunk))
    );
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    // Cabeçalho
    doc.font("Helvetica");
    doc.fontSize(18).text(b.company.name, { align: "left" });
    doc.moveDown(0.2);
    doc.fontSize(10).fillColor("#555").text(`CNPJ: ${b.company.cnpj}`);
    doc.text(b.company.address);
    doc.text(`${b.company.phone}  |  ${b.company.email}`);
    doc.moveDown();
    doc
      .fillColor("#000")
      .fontSize(14)
      .text(`Orçamento ${b.number}`, { align: "right" });
    doc
      .fontSize(10)
      .fillColor("#555")
      .text(new Date(b.date).toLocaleString("pt-BR"), {
        align: "right",
      });

    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke("#e5e7eb");
    doc.moveDown();

    // Cliente
    doc
      .fillColor("#000")
      .fontSize(12)
      .text("Dados do Cliente", { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor("#111").text(`Nome: ${b.client.name}`);
    doc.text(`Telefone: ${b.client.phone}`);
    doc.text(`Veículo: ${b.client.vehicle}`);
    doc.text(`Placa: ${b.client.plate}`);

    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke("#e5e7eb");
    doc.moveDown();

    // Tabela de Itens
    doc
      .fillColor("#000")
      .fontSize(12)
      .text("Itens do Orçamento", { underline: true });
    doc.moveDown(0.5);
    const startX = 50;
    const widths = { desc: 280, qty: 60, unit: 80, total: 80 };

    doc.fontSize(10).fillColor("#111");
    doc.text("Descrição", startX, doc.y, {
      continued: true,
      width: widths.desc,
    });
    doc.text("Qtd", startX + widths.desc, doc.y, {
      continued: true,
      width: widths.qty,
      align: "center",
    });
    doc.text("Unitário", startX + widths.desc + widths.qty, doc.y, {
      continued: true,
      width: widths.unit,
      align: "right",
    });
    doc.text("Total", startX + widths.desc + widths.qty + widths.unit, doc.y, {
      width: widths.total,
      align: "right",
    });
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke("#e5e7eb");

    for (const item of b.items) {
      const y = doc.y + 4;
      doc.text(item.description, startX, y, {
        continued: true,
        width: widths.desc,
      });
      doc.text(String(item.quantity), startX + widths.desc, y, {
        continued: true,
        width: widths.qty,
        align: "center",
      });
      doc.text(
        formatCurrency(item.unitPrice),
        startX + widths.desc + widths.qty,
        y,
        { continued: true, width: widths.unit, align: "right" }
      );
      doc.text(
        formatCurrency(item.quantity * item.unitPrice),
        startX + widths.desc + widths.qty + widths.unit,
        y,
        { width: widths.total, align: "right" }
      );
      doc.moveDown(0.4);
    }

    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke("#e5e7eb");
    doc.moveDown();

    // Total (layout em duas colunas alinhadas à direita, evitando sobreposição)
    const pageRight = 545; // margin right (A4 595 - margin 50)
    const valueWidth = 120;
    const valueX = pageRight - valueWidth;
    const yTotal = doc.y;
    doc
      .fontSize(12)
      .fillColor("#000")
      .text("TOTAL:", 50, yTotal, {
        width: valueX - 50,
        align: "right",
      });
    doc.font("Helvetica-Bold").text(formatCurrency(b.total), valueX, yTotal, {
      width: valueWidth,
      align: "right",
    });
    doc.font("Helvetica");
    doc.moveDown();

    doc.moveDown();
    doc
      .fontSize(9)
      .fillColor("#666")
      .text("Orçamento válido por 15 dias.", { align: "center" });

    doc.end();
  });
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ number: string }> }
) {
  const url = new URL(_req.url);
  const p = await ctx.params;
  let number = (p?.number ?? url.searchParams.get("number") ?? "").trim();
  // Fallback: extrai o número do pathname caso o params venha vazio
  if (!number) {
    const m = url.pathname.match(/\/api\/budgets\/([^/]+)\/pdf\/?$/);
    if (m && m[1]) number = decodeURIComponent(m[1]);
  }
  // Log leve de depuração (apenas em dev)
  if (process.env.NODE_ENV !== "production") {
    console.info(
      "[pdf-route] url=",
      url.pathname + url.search,
      " number=",
      number
    );
  }
  if (!number)
    return new Response(
      JSON.stringify({ error: "Número do orçamento não informado" }),
      { status: 400 }
    );

  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("budgets")
      .select("*")
      .eq("number", number)
      .single();
    if (error) throw new Error(error.message);
    if (!data)
      return new Response(
        JSON.stringify({ error: "Orçamento não encontrado" }),
        { status: 404 }
      );

    const pdf = await generatePdfBuffer(data as Budget);
    const bytes = new Uint8Array(pdf);
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=${number}.pdf`,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({ error: message || "Erro ao gerar PDF" }),
      { status: 500 }
    );
  }
}
