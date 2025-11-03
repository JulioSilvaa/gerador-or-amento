"use client";

import React, { useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  FileText,
  Send,
  History,
  X,
  Eye,
  Building2,
  Phone,
} from "lucide-react";
// Persistência agora é feita somente no banco via API

// Tipos
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

// Funções de máscara
const masks = {
  phone: (value: string) => {
    return value
      .replace(/\D/g, "")
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{5})(\d)/, "$1-$2")
      .replace(/(-\d{4})\d+?$/, "$1");
  },
  cnpj: (value: string) => {
    return value
      .replace(/\D/g, "")
      .replace(/(\d{2})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1/$2")
      .replace(/(\d{4})(\d)/, "$1-$2")
      .replace(/(-\d{2})\d+?$/, "$1");
  },
  plate: (value: string) => {
    return value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .replace(/(\w{3})(\w)/, "$1-$2")
      .replace(/(-\w{4})\w+?$/, "$1");
  },
  currency: (value: string) => {
    const numbers = value.replace(/\D/g, "");
    const amount = parseFloat(numbers) / 100;
    if (Number.isNaN(amount)) return "0.00";
    return amount.toFixed(2);
  },
};

export default function WorkshopBudgetSystem() {
  const [activeTab, setActiveTab] = useState<"new" | "history">("new");
  const [showPreview, setShowPreview] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [companyData] = useState<CompanyData>({
    name: "Auto Mecânica Silva",
    cnpj: "12.345.678/0001-90",
    phone: "(11) 98765-4321",
    email: "contato@oficinasilva.com.br",
    address: "Rua das Oficinas, 123 - São Paulo, SP",
    logo: "",
  });

  const [clientData, setClientData] = useState<ClientData>({
    name: "",
    phone: "",
    vehicle: "",
    plate: "",
  });

  const [items, setItems] = useState<Item[]>([
    { id: 1, description: "", quantity: 1, unitPrice: 0, displayPrice: "0,00" },
  ]);

  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [sendingNumber, setSendingNumber] = useState<string | null>(null);
  // Preview de PDF de orçamentos do histórico
  const [showPdf, setShowPdf] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfNumber, setPdfNumber] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  useEffect(() => {
    loadBudgets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadBudgets = async () => {
    try {
      const res = await fetch("/api/budgets");
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as any));
        const message = (err?.error as string) ?? "Falha ao carregar orçamentos";
        setErrorMsg(
          /Supabase/i.test(message)
            ? "Erro ao carregar orçamentos. Conecte o Supabase no .env.local e reinicie o servidor."
            : message
        );
        setBudgets([]);
        return;
      }
      const list = (await res.json()) as Budget[];
      setBudgets(list ?? []);
      setErrorMsg(null);
    } catch (error) {
      console.error("Erro ao carregar orçamentos:", error);
      setBudgets([]);
      setErrorMsg("Não foi possível carregar orçamentos. Verifique sua conexão e as variáveis do Supabase.");
    }
  };

  const resendBudget = async (number: string) => {
    if (!number) return;
    try {
      setSendingNumber(number);
      const res = await fetch(`/api/budgets/${encodeURIComponent(number)}/send`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        const msg = json?.error || "Falha ao reenviar orçamento.";
        setErrorMsg(String(msg));
        return;
      }
      // feedback de sucesso simples
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 1800);
    } catch (e: any) {
      setErrorMsg(e?.message || "Erro ao reenviar orçamento.");
    } finally {
      setSendingNumber(null);
    }
  };

  const openPdfPreview = async (number: string) => {
    if (!number || number.trim().length === 0) {
      setPdfError("Número do orçamento inválido");
      setShowPdf(true);
      return;
    }
    setPdfNumber(number);
    setShowPdf(true);
    setPdfLoading(true);
    setPdfError(null);
    try {
  // Usar a rota estável por query string (evita problemas com params dinâmicos)
  const res = await fetch(`/api/budgets/pdf?number=${encodeURIComponent(number)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as any));
        throw new Error(err?.error ?? `Falha ao gerar PDF (status ${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
    } catch (e: any) {
      setPdfError(e?.message ?? "Não foi possível carregar o PDF.");
    } finally {
      setPdfLoading(false);
    }
  };

  const closePdfPreview = () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(null);
    setPdfNumber(null);
    setShowPdf(false);
    setPdfError(null);
    setPdfLoading(false);
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: Date.now(),
        description: "",
        quantity: 1,
        unitPrice: 0,
        displayPrice: "0,00",
      },
    ]);
  };

  const removeItem = (id: number) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((i) => i.id !== id) : prev));
  };

  const updateItem = (id: number, field: keyof Item, value: unknown) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } as Item : item))
    );
  };

  const handlePriceChange = (id: number, value: string) => {
    const numericValue = masks.currency(value);
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              unitPrice: parseFloat(numericValue),
              displayPrice: numericValue.replace(".", ","),
            }
          : item
      )
    );
  };

  const handlePhoneChange = (value: string) => {
    const masked = masks.phone(value);
    setClientData({ ...clientData, phone: masked });
  };

  const handlePlateChange = (value: string) => {
    const masked = masks.plate(value);
    setClientData({ ...clientData, plate: masked });
  };

  const calculateTotal = () => {
    return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const generateBudgetNumber = () => {
    return `ORC-${Date.now()}`;
  };

  // Removido: salvamento local (somente banco de dados agora)

  const handleSendBudget = async () => {
    const budgetData: Budget = {
      number: generateBudgetNumber(),
      date: new Date().toISOString(),
      company: companyData,
      client: clientData,
      items: items,
      total: calculateTotal(),
    };

    // Envia para a API que grava no Supabase
    try {
      const res = await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(budgetData),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err?.error ?? `Falha ao salvar no servidor (status ${res.status})`;
        setErrorMsg(
          /Supabase/i.test(String(msg))
            ? "Erro ao salvar. Conecte o Supabase no .env.local e reinicie o servidor."
            : String(msg)
        );
        throw new Error(String(msg));
      }

      setShowSuccess(true);
      // Recarrega histórico online
      void loadBudgets();
      // Removido: não baixar PDF automaticamente após enviar
      setTimeout(() => {
        setShowSuccess(false);
        resetForm();
      }, 2000);
    } catch (error) {
      console.error("Erro ao enviar para Supabase:", error);
      if (!errorMsg) {
        setErrorMsg("Não foi possível salvar no servidor. Verifique as variáveis do Supabase e tente novamente.");
      }
    }
  };

  const resetForm = () => {
    setClientData({ name: "", phone: "", vehicle: "", plate: "" });
    setItems([{ id: Date.now(), description: "", quantity: 1, unitPrice: 0, displayPrice: "0,00" }]);
  };

  const BudgetPreview = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <h3 className="text-xl font-bold text-gray-800">Preview do Orçamento</h3>
          <button onClick={() => setShowPreview(false)} className="text-gray-500 hover:text-gray-700">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Cabeçalho da Empresa */}
          <div className="border-b pb-4">
            <h1 className="text-2xl font-bold text-gray-800">{companyData.name}</h1>
            <p className="text-sm text-gray-600">CNPJ: {companyData.cnpj}</p>
            <p className="text-sm text-gray-600">{companyData.phone}</p>
            <p className="text-sm text-gray-600">{companyData.email}</p>
            <p className="text-sm text-gray-600">{companyData.address}</p>
          </div>

          {/* Dados do Cliente */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-semibold text-gray-800 mb-2">Dados do Cliente</h3>
            <p className="text-sm text-gray-700">
              <strong>Nome:</strong> {clientData.name}
            </p>
            <p className="text-sm text-gray-700">
              <strong>Telefone:</strong> {clientData.phone}
            </p>
            <p className="text-sm text-gray-700">
              <strong>Veículo:</strong> {clientData.vehicle}
            </p>
            <p className="text-sm text-gray-700">
              <strong>Placa:</strong> {clientData.plate}
            </p>
          </div>

          {/* Itens */}
          <div>
            <h3 className="font-semibold text-gray-800 mb-3">Itens do Orçamento</h3>
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left p-2">Descrição</th>
                  <th className="text-center p-2">Qtd</th>
                  <th className="text-right p-2">Valor Unit.</th>
                  <th className="text-right p-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={index} className="border-b">
                    <td className="p-2">{item.description}</td>
                    <td className="text-center p-2">{item.quantity}</td>
                    <td className="text-right p-2">{formatCurrency(item.unitPrice)}</td>
                    <td className="text-right p-2">{formatCurrency(item.quantity * item.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-100 font-bold">
                <tr>
                  <td colSpan={3} className="text-right p-2">
                    TOTAL:
                  </td>
                  <td className="text-right p-2 text-green-600">{formatCurrency(calculateTotal())}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="text-xs text-gray-500 text-center pt-4 border-t">
            <p>Orçamento válido por 15 dias</p>
            <p className="mt-1">Data: {new Date().toLocaleDateString("pt-BR")}</p>
          </div>
        </div>
      </div>
    </div>
  );

  const HistoryTab = () => (
    <div className="space-y-3">
      {budgets.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <History size={48} className="mx-auto mb-4 opacity-50" />
          <p>Nenhum orçamento enviado ainda</p>
        </div>
      ) : (
        budgets.map((budget) => (
          <div
            key={budget.number}
            role="button"
            tabIndex={0}
            onClick={() => openPdfPreview(budget.number)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") openPdfPreview(budget.number);
            }}
            className="bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition cursor-pointer hover:border-blue-200"
          >
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="font-semibold text-gray-800">{budget.client.name}</p>
                <p className="text-sm text-gray-600">
                  {budget.client.vehicle} - {budget.client.plate}
                </p>
              </div>
              <div className="text-right">
                <p className="font-bold text-green-600">{formatCurrency(budget.total)}</p>
                <p className="text-xs text-gray-500">{budget.number}</p>
              </div>
            </div>
            <div className="flex justify-between items-center pt-2 border-t">
              <p className="text-xs text-gray-500">
                {new Date(budget.date).toLocaleDateString("pt-BR")} às
                {" "}
                {new Date(budget.date).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
              <div className="flex items-center gap-3">
                <p className="text-xs text-gray-600">
                  {budget.items.length} {budget.items.length === 1 ? "item" : "itens"}
                </p>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); resendBudget(budget.number); }}
                  disabled={sendingNumber === budget.number}
                  className={`text-sm px-3 py-1.5 rounded-md border ${sendingNumber === budget.number ? "bg-gray-200 text-gray-500" : "bg-blue-600 text-white hover:bg-blue-700"}`}
                  title="Reenviar orçamento via WhatsApp (n8n)"
                >
                  {sendingNumber === budget.number ? "Enviando..." : "Reenviar"}
                </button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );

  return (
  <div className="min-h-screen bg-linear-to-br from-blue-50 via-white to-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">{companyData.name}</h1>
              <p className="text-sm text-gray-600">Sistema de Orçamentos</p>
            </div>
            <Building2 size={32} className="text-blue-600" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-4xl mx-auto px-4 mt-6">
        {errorMsg && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 flex items-start gap-3">
            <span className="mt-0.5">⚠️</span>
            <div className="flex-1 text-sm">
              {errorMsg}
            </div>
            <button
              aria-label="Fechar aviso"
              className="text-red-600 hover:text-red-800"
              onClick={() => setErrorMsg(null)}
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab("new")}
            className={`flex-1 py-3 px-4 rounded-lg font-semibold transition ${
              activeTab === "new"
                ? "bg-blue-600 text-white shadow-md"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            <FileText size={20} className="inline mr-2" />
            Novo Orçamento
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`flex-1 py-3 px-4 rounded-lg font-semibold transition ${
              activeTab === "history"
                ? "bg-blue-600 text-white shadow-md"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            <History size={20} className="inline mr-2" />
            Histórico
          </button>
        </div>

        {/* Content */}
        {activeTab === "new" ? (
          <div className="space-y-6 pb-8">
            {/* Dados do Cliente */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                <Phone size={20} className="mr-2 text-blue-600" />
                Dados do Cliente
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Nome do cliente"
                  value={clientData.name}
                  onChange={(e) => setClientData({ ...clientData, name: e.target.value })}
                  className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <input
                  type="tel"
                  placeholder="Telefone/WhatsApp"
                  value={clientData.phone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  maxLength={15}
                  className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <input
                  type="text"
                  placeholder="Veículo (ex: Fiat Uno 2015)"
                  value={clientData.vehicle}
                  onChange={(e) => setClientData({ ...clientData, vehicle: e.target.value })}
                  className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <input
                  type="text"
                  placeholder="Placa"
                  value={clientData.plate}
                  onChange={(e) => handlePlateChange(e.target.value)}
                  maxLength={8}
                  className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Itens do Orçamento */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">Itens do Orçamento</h2>
              <div className="space-y-3">
                {items.map((item, index) => (
                  <div key={item.id} className="border rounded-lg p-4 bg-gray-50">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-sm font-semibold text-gray-600">Item {index + 1}</span>
                      {items.length > 1 && (
                        <button onClick={() => removeItem(item.id)} className="text-red-500 hover:text-red-700">
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                    <div className="space-y-3">
                      <input
                        type="text"
                        placeholder="Descrição do serviço/peça"
                        value={item.description}
                        onChange={(e) => updateItem(item.id, "description", e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          type="number"
                          placeholder="Quantidade"
                          min={1}
                          value={item.quantity}
                          onChange={(e) => updateItem(item.id, "quantity", parseInt(e.target.value, 10) || 1)}
                          className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600">R$</span>
                          <input
                            type="text"
                            placeholder="0,00"
                            value={item.displayPrice}
                            onChange={(e) => handlePriceChange(item.id, e.target.value)}
                            className="w-full pl-12 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-sm text-gray-600">Subtotal: </span>
                        <span className="font-bold text-green-600">{formatCurrency(item.quantity * item.unitPrice)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={addItem}
                className="w-full mt-4 py-3 border-2 border-dashed border-blue-300 rounded-lg text-blue-600 font-semibold hover:bg-blue-50 transition flex items-center justify-center"
              >
                <Plus size={20} className="mr-2" />
                Adicionar Item
              </button>
            </div>

            {/* Total */}
            <div className="bg-linear-to-r from-green-500 to-green-600 rounded-lg shadow-lg p-6 text-white">
              <div className="flex justify-between items-center">
                <span className="text-lg font-semibold">VALOR TOTAL:</span>
                <span className="text-3xl font-bold">{formatCurrency(calculateTotal())}</span>
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => setShowPreview(true)}
                className="py-4 bg-white border-2 border-blue-600 text-blue-600 rounded-lg font-bold hover:bg-blue-50 transition flex items-center justify-center"
              >
                <Eye size={20} className="mr-2" />
                Visualizar Preview
              </button>
              <button
                onClick={handleSendBudget}
                className="py-4 bg-linear-to-r from-blue-600 to-blue-700 text-white rounded-lg font-bold hover:from-blue-700 hover:to-blue-800 shadow-lg transition flex items-center justify-center"
              >
                <Send size={20} className="mr-2" />
                Enviar Orçamento
              </button>
            </div>
          </div>
        ) : (
          <HistoryTab />
        )}
      </div>

      {/* Preview Modal */}
      {showPreview && <BudgetPreview />}

      {/* PDF Preview Modal */}
      {showPdf && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="text-lg font-semibold text-gray-800">
                PDF do Orçamento {pdfNumber ?? ""}
              </h3>
              <button
                onClick={closePdfPreview}
                className="text-gray-500 hover:text-gray-700"
                aria-label="Fechar preview do PDF"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 bg-gray-50">
              {pdfLoading ? (
                <div className="h-full w-full flex items-center justify-center text-gray-600">
                  Carregando PDF...
                </div>
              ) : pdfError ? (
                <div className="p-6 text-sm text-red-700 bg-red-50">
                  {pdfError}
                </div>
              ) : pdfUrl ? (
                <object data={pdfUrl} type="application/pdf" className="w-full h-[80vh]">
                  <iframe title="PDF" src={pdfUrl} className="w-full h-[80vh]" />
                </object>
              ) : (
                <div className="h-full w-full flex items-center justify-center text-gray-600">
                  Nenhum conteúdo para exibir.
                </div>
              )}
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t bg-white">
              <div className="text-xs text-gray-500">Visualizador embutido</div>
              {pdfUrl && (
                <a
                  href={pdfUrl}
                  download={`${pdfNumber ?? "orcamento"}.pdf`}
                  className="px-3 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
                >
                  Baixar PDF
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Success Message */}
      {showSuccess && (
        <div className="fixed bottom-4 right-4 bg-green-500 text-white px-6 py-4 rounded-lg shadow-lg animate-bounce">
          ✓ Orçamento enviado com sucesso!
        </div>
      )}
    </div>
  );
}
