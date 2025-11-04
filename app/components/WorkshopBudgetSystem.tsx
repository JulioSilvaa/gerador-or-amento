"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
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
  Settings,
  Search,
} from "lucide-react";
// App de orçamentos: UI + chamadas de API (Supabase / PDF / n8n)

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

// Utilitário de busca mais robusto: case/acentos-insensível e ignora pontuação/espaços
// Mantém apenas a-z e 0-9 para termos comparáveis (ex.: "ORC 123" ~ "ORC-123", placas e telefones com/sem máscara)
const normalize = (s: string | undefined) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-z0-9]/g, ""); // remove tudo que não for letra/dígito

// Componentes pequenos para deixar o JSX principal mais limpo
type SearchBarProps = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
};

function SearchBar({ value, onChange, onSubmit, onClear, inputRef }: SearchBarProps) {
  return (
    <div className="flex gap-2" role="search">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 h-4 w-4 md:h-4 md:w-4" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            // Reforça a manutenção do foco após re-render
            requestAnimationFrame(() => inputRef?.current?.focus());
          }}
          // A busca só deve acontecer ao clicar no botão; Enter não dispara
          placeholder="Buscar por número, cliente, placa ou veículo..."
          aria-label="Buscar orçamentos"
          autoComplete="off"
          spellCheck={false}
          className="w-full pl-9 md:pl-10 pr-9 md:pr-10 py-2 md:py-2.5 text-sm md:text-base border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {value && (
          <button
            type="button"
            aria-label="Limpar busca"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClear}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onSubmit}
        className="px-3 py-2 text-sm md:px-4 md:py-2.5 md:text-base bg-blue-600 text-white rounded-lg hover:bg-blue-700"
      >
        Buscar
      </button>
    </div>
  );
}

type HistoryCardProps = {
  budget: Budget;
  onOpen: (number: string) => void;
  onResend: (number: string) => void;
  sendingNumber: string | null;
  formatCurrency: (v: number) => string;
  onEdit: (budget: Budget) => void;
};

function HistoryCard({ budget, onOpen, onResend, sendingNumber, formatCurrency, onEdit }: HistoryCardProps) {
  // Metadados opcionais de reenvio embutidos no JSON da empresa (armazenados no backend)
  const meta = (budget.company as unknown as { _meta?: { lastResentAt?: string; resendCount?: number } })._meta;
  const resendCount = typeof meta?.resendCount === "number" ? meta!.resendCount! : 0;
  const resendInfo = resendCount > 0
    ? `Reenviado ${resendCount} ${resendCount === 1 ? "vez" : "vezes"}${meta?.lastResentAt ? ` • último em ${new Date(meta.lastResentAt).toLocaleDateString("pt-BR")} às ${new Date(meta.lastResentAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}`
    : null;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(budget.number)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(budget.number); }}
  className="bg-white border rounded-lg p-3 md:p-4 shadow-sm hover:shadow-md transition cursor-pointer hover:border-blue-200"
    >
      <div className="flex justify-between items-start mb-2">
        <div>
          <p className="font-semibold text-gray-800">{budget.client.name}</p>
          <p className="text-sm text-gray-600">{budget.client.vehicle} - {budget.client.plate}</p>
        </div>
        <div className="text-right">
          <p className="font-bold text-green-600">{formatCurrency(budget.total)}</p>
          <p className="text-xs text-gray-500">{budget.number}</p>
        </div>
      </div>
      <div className="flex justify-between items-center pt-2 border-t">
        <div className="flex flex-col">
          <p className="text-xs text-gray-500">
            {new Date(budget.date).toLocaleDateString("pt-BR")} às {new Date(budget.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </p>
          {resendInfo && (
            <p className="text-[11px] text-gray-500 mt-0.5">{resendInfo}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-600">{budget.items.length} {budget.items.length === 1 ? "item" : "itens"}</p>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit(budget); }}
            className="text-sm px-3 py-1.5 rounded-md border bg-white hover:bg-gray-50"
            title="Editar orçamento"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onResend(budget.number); }}
            disabled={sendingNumber === budget.number}
            className={`text-sm px-3 py-1.5 rounded-md border ${sendingNumber === budget.number ? "bg-gray-200 text-gray-500" : "bg-blue-600 text-white hover:bg-blue-700"}`}
            title="Reenviar orçamento via WhatsApp (n8n)"
          >
            {sendingNumber === budget.number ? "Enviando..." : "Reenviar"}
          </button>
        </div>
      </div>
    </div>
  );
}

 

export default function WorkshopBudgetSystem() {
  const [activeTab, setActiveTab] = useState<"new" | "history">("new");
  const [showPreview, setShowPreview] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [companyData] = useState<CompanyData>({
    name: "",
    cnpj: "",
    phone: "",
    email: "",
    address: "",
    logo: "",
  });
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [selectedLogoFile, setSelectedLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

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
  // Busca: separa texto digitado do termo aplicado
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Edição ativa
  const [editing, setEditing] = useState<{ number: string; date: string } | null>(null);
  // Modal de configurações: refs para trap de foco
  const settingsDialogRef = useRef<HTMLDivElement>(null);
  const settingsFirstInputRef = useRef<HTMLInputElement>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  // Modal de PDF: trap de foco
  const pdfDialogRef = useRef<HTMLDivElement>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [sendingNumber, setSendingNumber] = useState<string | null>(null);
  // Preview de PDF de orçamentos do histórico
  const [showPdf, setShowPdf] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfNumber, setPdfNumber] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Carrega lista de orçamentos (estável entre renders)
  const loadBudgets = useCallback(async () => {
    try {
      const res = await fetch("/api/budgets");
      if (!res.ok) {
        const err = (await res.json().catch(() => ({} as { error?: string }))) as {
          error?: string;
        };
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
  }, []);

  useEffect(() => {
    // Carregar configurações da oficina
    (async () => {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          if (json?.company) {
            const c = json.company as CompanyData;
            // Aplicar máscaras ao exibir valores carregados do banco
            setCompany({
              ...c,
              cnpj: masks.cnpj(c?.cnpj ?? ""),
              phone: masks.phone(c?.phone ?? ""),
            });
          }
        }
      } catch {}
    })();
    // Carregar histórico de orçamentos
    loadBudgets();
  }, [loadBudgets]);

  useEffect(() => {
    if (activeTab === "history") {
      // garante foco no campo após render
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [activeTab]);

  // Trap de foco e ESC para o modal de configurações
  useEffect(() => {
    if (!showSettings) return;
    const container = settingsDialogRef.current;
    // foco inicial no primeiro input
    requestAnimationFrame(() => settingsFirstInputRef.current?.focus());
    const selector = 'a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setShowSettings(false);
        return;
      }
      if (e.key !== "Tab" || !container) return;
      const focusables = Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(el => !el.hasAttribute('disabled'));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (!active || active === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (!active || active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showSettings]);

  // Fecha o modal de PDF e limpa estados relacionados
  const closePdfPreview = useCallback(() => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(null);
    setPdfNumber(null);
    setShowPdf(false);
    setPdfError(null);
    setPdfLoading(false);
  }, [pdfUrl]);

  // Trap de foco e ESC para o modal de PDF
  useEffect(() => {
    if (!showPdf) return;
    const container = pdfDialogRef.current;
    // foca o botão fechar se existir
    requestAnimationFrame(() => container?.querySelector<HTMLElement>('button[aria-label="Fechar preview do PDF"]')?.focus());
    const selector = 'a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closePdfPreview();
        return;
      }
      if (e.key !== "Tab" || !container) return;
      const focusables = Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(el => !el.hasAttribute('disabled'));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (!active || active === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (!active || active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showPdf, closePdfPreview]);

  

  const resendBudget = async (number: string) => {
    if (!number) return;
    try {
      setSendingNumber(number);
      const res = await fetch(`/api/budgets/${encodeURIComponent(number)}/send`, { method: "POST" });
      const json = (await res.json().catch(() => ({} as { ok?: boolean; error?: string }))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || json?.ok === false) {
        const msg = json?.error || "Falha ao reenviar orçamento.";
        setErrorMsg(String(msg));
        return;
      }
      // feedback de sucesso simples
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 1800);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setErrorMsg(message || "Erro ao reenviar orçamento.");
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
        const err = (await res.json().catch(() => ({} as { error?: string }))) as {
          error?: string;
        };
        throw new Error(err?.error ?? `Falha ao gerar PDF (status ${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setPdfError(message ?? "Não foi possível carregar o PDF.");
    } finally {
      setPdfLoading(false);
    }
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
      prev.map((item) => (item.id === id ? ({ ...item, [field]: value } as Item) : item))
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

  const startEditBudget = (b: Budget) => {
    setActiveTab("new");
    // Preenche campos
    setClientData({
      name: b.client?.name || "",
      phone: b.client?.phone || "",
      vehicle: b.client?.vehicle || "",
      plate: b.client?.plate || "",
    });
    setItems(
      (b.items || []).map((it) => ({
        id: Date.now() + Math.floor(Math.random() * 100000),
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        displayPrice: new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          .format(it.unitPrice)
          .replace(".", ","),
      }))
    );
    setEditing({ number: b.number, date: b.date });
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  };

  // Handlers auxiliares (deixam JSX mais limpo)
  const saveCompanySettings = async () => {
    if (!company?.name) {
      setErrorMsg("Informe ao menos o nome da oficina.");
      return;
    }
    setSavingSettings(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(company),
      });
      const json = (await res.json().catch(() => ({} as { ok?: boolean; error?: string }))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || json?.ok === false) {
        setErrorMsg(json?.error || "Falha ao salvar configurações.");
        return;
      }
      setShowSettings(false);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setErrorMsg(message || "Erro ao salvar configurações.");
    } finally {
      setSavingSettings(false);
    }
  };

  const uploadLogo = async () => {
    if (!selectedLogoFile) return;
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append("file", selectedLogoFile, selectedLogoFile.name);
      const res = await fetch("/api/settings/logo", { method: "POST", body: fd });
      const json = (await res.json().catch(() => ({} as { ok?: boolean; error?: string; url?: string }))) as {
        ok?: boolean;
        error?: string;
        url?: string;
      };
      if (!res.ok || json?.ok === false) {
        setErrorMsg(json?.error || "Falha ao enviar logo.");
        return;
      }
      const url: string | undefined = json?.url;
      if (url) setCompany({ ...(company ?? companyData), logo: url });
      setSelectedLogoFile(null);
      if (logoPreview) URL.revokeObjectURL(logoPreview);
      setLogoPreview(null);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setErrorMsg(message || "Erro ao enviar logo.");
    } finally {
      setUploadingLogo(false);
    }
  };
  // Seleciona/valida a imagem de logo com tamanho e tipo
  const handleSelectLogoFile = (file: File | null) => {
    if (!file) {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
      setSelectedLogoFile(null);
      setLogoPreview(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setErrorMsg("Envie um arquivo de imagem (PNG, JPG, SVG).");
      return;
    }
    const maxBytes = 5 * 1024 * 1024; // 5MB
    if (file.size > maxBytes) {
      setErrorMsg("Imagem maior que 5MB. Reduza o tamanho e tente novamente.");
      return;
    }
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setSelectedLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };
  const onLogoInputChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    handleSelectLogoFile(e.target.files?.[0] ?? null);
  };
  const onLogoDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer?.files?.[0] ?? null;
    handleSelectLogoFile(file);
  };
  const clearSelectedLogo = () => handleSelectLogoFile(null);
  const handleSendBudget = async (silent = false) => {
    const companyInfo: CompanyData = company ?? companyData; // fallback vazio
    if (!companyInfo.name) {
      setErrorMsg("Configure os dados da oficina antes de enviar o orçamento.");
      setShowSettings(true);
      return;
    }
    const budgetData: Budget = {
      number: editing?.number ?? generateBudgetNumber(),
      date: editing?.date ?? new Date().toISOString(),
      company: companyInfo,
      client: clientData,
      items: items,
      total: calculateTotal(),
    };

    // Envia para a API que grava no Supabase
    try {
      const res = await fetch(`/api/budgets${silent ? "?notify=false" : ""}` , {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(budgetData),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({} as { error?: string }))) as {
          error?: string;
        };
        const msg = err?.error ?? `Falha ao salvar no servidor (status ${res.status})`;
        setErrorMsg(
          /Supabase/i.test(String(msg))
            ? "Erro ao salvar. Conecte o Supabase no .env.local e reinicie o servidor."
            : String(msg)
        );
        throw new Error(String(msg));
      }

      // Analisa retorno para saber se n8n foi notificado
      const out = (await res.json().catch(() => ({} as { ok?: boolean; n8nNotified?: boolean; n8nError?: string | null; n8nStatusCode?: number | null; n8nSkipped?: boolean }))) as { ok?: boolean; n8nNotified?: boolean; n8nError?: string | null; n8nStatusCode?: number | null; n8nSkipped?: boolean };

      if (!silent && out?.ok && out.n8nNotified === false && !out?.n8nSkipped) {
        try {
          const retry = await fetch(`/api/budgets/${encodeURIComponent(budgetData.number)}/send`, { method: "POST" });
          if (!retry.ok) {
            const retryJson = (await retry.json().catch(() => ({} as { error?: string }))) as { error?: string };
            setErrorMsg(
              retryJson?.error
                ? `Orçamento salvo, mas falhou ao notificar o n8n (2ª tentativa): ${retryJson.error}`
                : `Orçamento salvo, mas falhou ao notificar o n8n (status ${retry.status}).`
            );
          }
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          setErrorMsg(`Orçamento salvo, mas falhou ao notificar o n8n: ${message}`);
        }
      }

      setShowSuccess(true);
      // Recarrega histórico online
      void loadBudgets();
      // Removido: não baixar PDF automaticamente após enviar
      setTimeout(() => {
        setShowSuccess(false);
        resetForm();
        setEditing(null);
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
    <div className="fixed inset-0 flex items-center justify-center p-4 z-50">
      {/* Overlay clicável para fechar */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => setShowPreview(false)}
      />
      <div className="relative bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <h3 className="text-xl font-bold text-gray-800">Preview do Orçamento</h3>
          <button onClick={() => setShowPreview(false)} className="text-gray-500 hover:text-gray-700">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Cabeçalho da Empresa */}
          <div className="border-b pb-4">
            <h1 className="text-2xl font-bold text-gray-800">{(company ?? companyData).name}</h1>
            <p className="text-sm text-gray-600">CNPJ: {(company ?? companyData).cnpj}</p>
            <p className="text-sm text-gray-600">{(company ?? companyData).phone}</p>
            <p className="text-sm text-gray-600">{(company ?? companyData).email}</p>
            <p className="text-sm text-gray-600">{(company ?? companyData).address}</p>
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
      <div className="mb-3">
        <SearchBar
          value={searchInput}
          onChange={setSearchInput}
          onSubmit={() => setSearchQuery(searchInput)}
          onClear={() => { setSearchInput(""); setSearchQuery(""); }}
          inputRef={searchInputRef}
        />
      </div>

      {(() => {
        const q = normalize(searchQuery);
        const list = !q
          ? budgets
          : budgets.filter((b) => {
              const inNumber = normalize(b.number).includes(q);
              const inClient = [b.client?.name, b.client?.phone, b.client?.vehicle, b.client?.plate]
                .some((v) => normalize(v).includes(q));
              const inItems = (b.items || []).some((it) => normalize(it.description).includes(q));
              return inNumber || inClient || inItems;
            });

        if (budgets.length === 0) {
          return (
            <div className="text-center py-12 text-gray-500">
              <History className="mx-auto mb-4 opacity-50 h-10 w-10 md:h-12 md:w-12" />
              <p>Nenhum orçamento enviado ainda</p>
            </div>
          );
        }

        if (list.length === 0) {
          return (
            <div className="text-center py-12 text-gray-500">
              <p>Nenhum orçamento encontrado para &quot;{searchQuery}&quot;</p>
            </div>
          );
        }

        return (
          <>
            {list.map((budget) => (
              <HistoryCard
                key={budget.number}
                budget={budget}
                onOpen={openPdfPreview}
                onResend={resendBudget}
                sendingNumber={sendingNumber}
                formatCurrency={formatCurrency}
                onEdit={startEditBudget}
              />
            ))}
          </>
        );
      })()}
    </div>
  );

  return (
  <div className="min-h-screen bg-linear-to-br from-blue-50 via-white to-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              {((company ?? companyData).logo ? (
                // Logo fornecida
                <img
                  src={(company ?? companyData).logo}
                  alt={(company ?? companyData).name || "Logo da oficina"}
                  className="h-10 w-auto rounded-sm object-contain border border-gray-200 bg-white"
                />
              ) : (
                // Fallback ícone
                <Building2 className="text-blue-600 shrink-0 h-7 w-7 md:h-8 md:w-8" />
              ))}
              <div className="min-w-0">
                <h1 className="text-2xl font-bold text-gray-800 truncate">{(company ?? companyData).name || "Dados da oficina não configurados"}</h1>
                <p className="text-sm text-gray-600">Sistema de Orçamentos</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                title="Configurações da oficina"
                onClick={() => setShowSettings((s) => !s)}
                className="p-2 rounded-lg border text-gray-700 hover:bg-gray-50 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Configurações"
              >
                <Settings className="h-5 w-5 md:h-6 md:w-6" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowSettings(false)}
          />
          {/* Dialog */}
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            className="relative bg-white rounded-none md:rounded-lg w-full md:max-w-2xl h-dvh md:max-h-[90vh] flex flex-col shadow-lg"
            ref={settingsDialogRef}
          >
            <div className="sticky top-0 bg-white border-b px-4 py-3 flex justify-between items-center">
              <h2 id="settings-title" className="text-lg font-semibold text-gray-800">Configurações da Oficina</h2>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="p-2 rounded-lg text-gray-600 hover:bg-gray-50"
                aria-label="Fechar configurações"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 md:px-5 md:py-5">
              {/* Dados da Empresa */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Nome da oficina"
                  value={(company ?? companyData).name}
                  onChange={(e) => setCompany({ ...(company ?? companyData), name: e.target.value })}
                  ref={settingsFirstInputRef}
                  className="w-full px-4 py-2 md:py-3 text-sm md:text-base border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <input
                  type="text"
                  placeholder="CNPJ"
                  value={(company ?? companyData).cnpj}
                  onChange={(e) => setCompany({ ...(company ?? companyData), cnpj: masks.cnpj(e.target.value) })}
                  maxLength={18}
                  className="w-full px-4 py-2 md:py-3 text-sm md:text-base border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <input
                  type="tel"
                  placeholder="Telefone"
                  value={(company ?? companyData).phone}
                  onChange={(e) => setCompany({ ...(company ?? companyData), phone: masks.phone(e.target.value) })}
                  maxLength={15}
                  className="w-full px-4 py-2 md:py-3 text-sm md:text-base border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <input
                  type="email"
                  placeholder="E-mail"
                  value={(company ?? companyData).email}
                  onChange={(e) => setCompany({ ...(company ?? companyData), email: e.target.value })}
                  className="w-full px-4 py-2 md:py-3 text-sm md:text-base border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <input
                  type="text"
                  placeholder="Endereço"
                  value={(company ?? companyData).address}
                  onChange={(e) => setCompany({ ...(company ?? companyData), address: e.target.value })}
                  className="w-full md:col-span-2 px-4 py-2 md:py-3 text-sm md:text-base border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {/* Seção de Logo */}
                <div className="md:col-span-2">
                  <div className="mb-2 text-sm font-medium text-gray-700">Logo da oficina</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                    {/* Dropzone + Pré-visualização */}
                    <div
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                      onDrop={onLogoDrop}
                      onClick={() => logoFileInputRef.current?.click()}
                      className="relative cursor-pointer select-none rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 transition p-4"
                      aria-describedby="logo-hint"
                    >
                      <div className="flex items-center gap-3">
                        {(logoPreview || company?.logo) ? (
                          <img
                            src={logoPreview || company?.logo || ''}
                            alt="Pré-visualização da logo"
                            className="h-20 w-auto rounded bg-white border"
                          />
                        ) : (
                          <div className="h-20 w-full flex items-center justify-center text-gray-500 text-sm">
                            Arraste e solte a imagem aqui ou clique para selecionar
                          </div>
                        )}
                      </div>
                      <input
                        ref={logoFileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={onLogoInputChange}
                        className="sr-only"
                        aria-label="Selecionar arquivo de logo"
                      />
                    </div>
                    {/* Ações */}
                    <div className="flex flex-col gap-2">
                      <div className="text-xs text-gray-500" id="logo-hint">
                        Tipos aceitos: PNG/JPG/SVG • Tamanho máximo 5MB • Proporção recomendada 3:1 (ex.: 600x200)
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => logoFileInputRef.current?.click()}
                          className="px-3 py-2 rounded-md border bg-white hover:bg-gray-50"
                          disabled={uploadingLogo}
                        >
                          Escolher imagem
                        </button>
                        <button
                          type="button"
                          disabled={!selectedLogoFile || uploadingLogo}
                          onClick={uploadLogo}
                          className={`px-3 py-2 rounded-md text-white ${(!selectedLogoFile || uploadingLogo) ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"}`}
                        >
                          {uploadingLogo ? "Enviando..." : "Enviar logo"}
                        </button>
                        {selectedLogoFile && (
                          <button
                            type="button"
                            onClick={clearSelectedLogo}
                            className="px-3 py-2 rounded-md border bg-white hover:bg-gray-50"
                            disabled={uploadingLogo}
                          >
                            Limpar seleção
                          </button>
                        )}
                        {(company?.logo && !selectedLogoFile) && (
                          <button
                            type="button"
                            onClick={() => setCompany({ ...(company ?? companyData), logo: "" })}
                            className="px-3 py-2 rounded-md border text-red-600 bg-white hover:bg-red-50"
                            disabled={uploadingLogo}
                            title="Remover logo atual"
                          >
                            Remover logo
                          </button>
                        )}
                      </div>
                      {(selectedLogoFile) && (
                        <div className="text-xs text-gray-600">
                          Selecionado: <span className="font-medium">{selectedLogoFile.name}</span> ({Math.round(selectedLogoFile.size / 1024)} KB)
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t px-4 py-3 flex items-center justify-end gap-3 text-sm md:text-base">
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="px-3 py-2 md:px-4 md:py-2 rounded-lg border bg-white hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveCompanySettings}
                className={`px-3 py-2 md:px-4 md:py-2 rounded-lg text-white ${savingSettings ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"}`}
                disabled={savingSettings}
              >
                {savingSettings ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

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
            className={`flex-1 py-2.5 md:py-3 px-4 rounded-lg font-semibold transition text-sm md:text-base ${
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
            className={`flex-1 py-2.5 md:py-3 px-4 rounded-lg font-semibold transition text-sm md:text-base ${
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
            {editing && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 px-4 py-3 flex items-center justify-between">
                <div className="text-sm">
                  Editando orçamento <span className="font-semibold">{editing.number}</span> (data original {new Date(editing.date).toLocaleDateString("pt-BR")})
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="px-3 py-1.5 rounded-md border bg-white hover:bg-gray-50 text-sm"
                >
                  Cancelar edição
                </button>
              </div>
            )}
            {/* Dados do Cliente */}
            <div className="bg-white rounded-lg shadow-md p-4 md:p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                <Phone className="mr-2 text-blue-600 h-4 w-4 md:h-5 md:w-5" />
                Dados do Cliente
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label htmlFor="client-name" className="sr-only">Nome do cliente</label>
                <input
                  id="client-name"
                  type="text"
                  placeholder="Nome do cliente"
                  value={clientData.name}
                  onChange={(e) => setClientData({ ...clientData, name: e.target.value })}
                  className="w-full px-4 py-2 md:py-3 text-sm md:text-base border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <label htmlFor="client-phone" className="sr-only">Telefone/WhatsApp</label>
                <input
                  id="client-phone"
                  type="tel"
                  placeholder="Telefone/WhatsApp"
                  value={clientData.phone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  maxLength={15}
                  className="w-full px-4 py-2 md:py-3 text-sm md:text-base border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <label htmlFor="client-vehicle" className="sr-only">Veículo</label>
                <input
                  id="client-vehicle"
                  type="text"
                  placeholder="Veículo (ex: Fiat Uno 2015)"
                  value={clientData.vehicle}
                  onChange={(e) => setClientData({ ...clientData, vehicle: e.target.value })}
                  className="w-full px-4 py-2 md:py-3 text-sm md:text-base border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <label htmlFor="client-plate" className="sr-only">Placa</label>
                <input
                  id="client-plate"
                  type="text"
                  placeholder="Placa"
                  value={clientData.plate}
                  onChange={(e) => handlePlateChange(e.target.value)}
                  maxLength={8}
                  className="w-full px-4 py-2 md:py-3 text-sm md:text-base border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Itens do Orçamento */}
            <div className="bg-white rounded-lg shadow-md p-4 md:p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">Itens do Orçamento</h2>
              <div className="space-y-3">
                {items.map((item, index) => (
                  <div key={item.id} className="border rounded-lg p-3 md:p-4 bg-gray-50">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-sm font-semibold text-gray-600">Item {index + 1}</span>
                      {items.length > 1 && (
                        <button onClick={() => removeItem(item.id)} className="text-red-500 hover:text-red-700">
                          <Trash2 className="h-4 w-4 md:h-[18px] md:w-[18px]" />
                        </button>
                      )}
                    </div>
                    <div className="space-y-3">
                      <label htmlFor={`item-desc-${item.id}`} className="sr-only">Descrição do serviço/peça</label>
                      <input
                        id={`item-desc-${item.id}`}
                        type="text"
                        placeholder="Descrição do serviço/peça"
                        value={item.description}
                        onChange={(e) => updateItem(item.id, "description", e.target.value)}
                        className="w-full px-3 md:px-4 py-2 text-sm md:text-base border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <label htmlFor={`item-qty-${item.id}`} className="sr-only">Quantidade</label>
                        <input
                          id={`item-qty-${item.id}`}
                          type="number"
                          placeholder="Quantidade"
                          min={1}
                          value={item.quantity}
                          onChange={(e) => updateItem(item.id, "quantity", parseInt(e.target.value, 10) || 1)}
                          className="w-full px-3 md:px-4 py-2 text-sm md:text-base border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <div className="relative">
                          <span className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 text-gray-600 text-sm md:text-base">R$</span>
                          <label htmlFor={`item-price-${item.id}`} className="sr-only">Valor unitário</label>
                          <input
                            id={`item-price-${item.id}`}
                            type="text"
                            placeholder="0,00"
                            value={item.displayPrice}
                            onChange={(e) => handlePriceChange(item.id, e.target.value)}
                            className="w-full pl-10 md:pl-12 pr-3 md:pr-4 py-2 text-sm md:text-base border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                className="w-full mt-4 py-2.5 md:py-3 border-2 border-dashed border-blue-300 rounded-lg text-blue-600 font-semibold hover:bg-blue-50 transition flex items-center justify-center text-sm md:text-base"
              >
                <Plus className="mr-2 h-4 w-4 md:h-5 md:w-5" />
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
                className="py-3 md:py-4 bg-white border-2 border-blue-600 text-blue-600 rounded-lg font-bold hover:bg-blue-50 transition flex items-center justify-center text-sm md:text-base"
              >
                <Eye className="mr-2 h-4 w-4 md:h-5 md:w-5" />
                Visualizar Preview
              </button>
              <button
                onClick={() => handleSendBudget(false)}
                className="py-3 md:py-4 bg-linear-to-r from-blue-600 to-blue-700 text-white rounded-lg font-bold hover:from-blue-700 hover:to-blue-800 shadow-lg transition flex items-center justify-center text-sm md:text-base"
              >
                <Send className="mr-2 h-4 w-4 md:h-5 md:w-5" />
                {editing ? "Atualizar Orçamento" : "Enviar Orçamento"}
              </button>
              {editing && (
                <button
                  onClick={() => handleSendBudget(true)}
                  className="py-3 md:py-4 border-2 border-gray-300 text-gray-700 rounded-lg font-bold hover:bg-gray-50 transition flex items-center justify-center text-sm md:text-base"
                >
                  Salvar (sem enviar)
                </button>
              )}
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
        <div className="fixed inset-0 flex items-center justify-center p-0 md:p-4 z-50">
          {/* Overlay clicável para fechar */}
          <div className="absolute inset-0 bg-black/50" onClick={closePdfPreview} />
          <div ref={pdfDialogRef} className="relative bg-white rounded-none md:rounded-lg w-full md:max-w-5xl h-dvh md:max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b sticky top-0 bg-white">
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
                <object data={pdfUrl} type="application/pdf" className="w-full h-full">
                  <iframe title="PDF" src={pdfUrl} className="w-full h-full" />
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
