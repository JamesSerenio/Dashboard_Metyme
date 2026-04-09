import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../utils/supabaseClient";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import "../styles/Admin_Staff_Consignment_Record.css";

type NumericLike = number | string;
type GroupBy = "full_name" | "category";
type PayMethod = "cash" | "gcash";

interface ConsignmentRow {
  id: string;
  created_at: string;
  full_name: string;
  category: string | null;
  item_name: string;
  size: string | null;
  image_url: string | null;
  price: NumericLike;
  restocked: number | null;
  sold: number | null;
  expected_sales: NumericLike | null;
  overall_sales: NumericLike | null;
  stocks: number | null;
}

interface CashOutRow {
  id: string;
  created_at: string;
  full_name: string;
  category: string | null;
  cashout_amount: NumericLike;
  payment_method: PayMethod;
  note: string | null;
  voided: boolean | null;
  voided_at: string | null;
  voided_by: string | null;
}

interface CashOutRowNoCategory {
  id: string;
  created_at: string;
  full_name: string;
  cashout_amount: NumericLike;
  payment_method: PayMethod;
  note: string | null;
  voided: boolean | null;
  voided_at: string | null;
  voided_by: string | null;
}

interface CashOutRowNoMethod {
  id: string;
  created_at: string;
  full_name: string;
  category: string | null;
  cashout_amount: NumericLike;
  note: string | null;
  voided: boolean | null;
  voided_at: string | null;
  voided_by: string | null;
}

const CONSIGNMENT_BUCKET = "consignment";

const toNumber = (v: NumericLike | null | undefined): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const round2 = (n: number): number =>
  Number((Number.isFinite(n) ? n : 0).toFixed(2));

const moneyText = (n: number): string => `₱${round2(n).toFixed(2)}`;

const formatPHDateTime = (iso: string): string => {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "-";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(d);
};

const norm = (s: string | null | undefined): string =>
  (s ?? "").trim().toLowerCase();

const show = (s: string | null | undefined, fallback = "-"): string => {
  const v = String(s ?? "").trim();
  return v.length ? v : fallback;
};

const sizeText = (s: string | null | undefined): string => {
  const v = String(s ?? "").trim();
  return v.length ? v : "—";
};

const grossToNet = (gross: number): number => round2(gross * 0.85);
const grossToCommission = (gross: number): number => round2(gross * 0.15);

const safeExtFromName = (name: string): string => {
  const parts = name.split(".");
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  const ext = last.trim().toLowerCase();
  if (!ext) return "jpg";
  if (ext.length > 8) return "jpg";
  return ext.replace(/[^a-z0-9]/g, "") || "jpg";
};

const extractPathFromPublicUrl = (url: string, bucket: string): string | null => {
  try {
    const u = new URL(url);
    const marker = `/storage/v1/object/public/${bucket}/`;
    const idx = u.pathname.indexOf(marker);
    if (idx === -1) return null;
    return u.pathname.slice(idx + marker.length);
  } catch {
    return null;
  }
};

const deleteStorageByUrl = async (url: string | null, bucket: string): Promise<void> => {
  if (!url) return;
  const path = extractPathFromPublicUrl(url, bucket);
  if (!path) return;
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) console.error("Storage delete error:", error);
};

const uploadConsignmentImage = async (file: File, bucket: string): Promise<string> => {
  const ext = safeExtFromName(file.name);
  const safeName = `consignment/${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}.${ext}`;

  const { error } = await supabase.storage.from(bucket).upload(safeName, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(bucket).getPublicUrl(safeName);
  const publicUrl = data?.publicUrl ?? "";
  if (!publicUrl) throw new Error("Failed to get public URL.");
  return publicUrl;
};

const labelPay = (m: PayMethod): string => (m === "gcash" ? "GCASH" : "CASH");

type ImgData = { base64: string; extension: "png" | "jpeg" };

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image."));
    reader.onload = () => {
      const res = reader.result;
      if (typeof res !== "string") {
        reject(new Error("Invalid base64 result."));
        return;
      }
      resolve(res);
    };
    reader.readAsDataURL(blob);
  });

const fetchImageAsBase64 = async (url: string): Promise<ImgData | null> => {
  try {
    const resp = await fetch(url, { mode: "cors" });
    if (!resp.ok) return null;

    const blob = await resp.blob();
    if (!blob.type.startsWith("image/")) return null;

    const isPng = blob.type.includes("png");
    const ext: "png" | "jpeg" = isPng ? "png" : "jpeg";

    const dataUrl = await blobToBase64(blob);
    const commaIdx = dataUrl.indexOf(",");
    const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
    if (!base64) return null;

    return { base64, extension: ext };
  } catch {
    return null;
  }
};

type PersonAgg = {
  key: string;
  label: string;
  total_restock: number;
  total_sold: number;
  expected_total: number;
  gross_total: number;
  net_total: number;
  commission_total: number;
  cashout_cash: number;
  cashout_gcash: number;
  cashout_total: number;
  remaining: number;
};

type EditForm = {
  full_name: string;
  category: string;
  item_name: string;
  size: string;
  price: string;
};

const CenterModal: React.FC<{
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: "md" | "lg";
}> = ({ open, title, subtitle, onClose, children, size = "md" }) => {
  useEffect(() => {
    if (!open) return;

    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.classList.add("asc-modal-open");

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.classList.remove("asc-modal-open");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="asc-modal-overlay" onClick={onClose}>
      <div
        className={`asc-modal-card ${size === "lg" ? "asc-modal-lg" : "asc-modal-md"}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="asc-modal-head">
          <div>
            <h3>{title}</h3>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>

          <button className="asc-modal-close" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <div className="asc-modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
};

const Admin_Staff_Consignment_Record: React.FC = () => {
  const [salesRows, setSalesRows] = useState<ConsignmentRow[]>([]);
  const [cashouts, setCashouts] = useState<CashOutRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [searchText, setSearchText] = useState<string>("");
  const [groupBy, setGroupBy] = useState<GroupBy>("full_name");

  const [cashoutTargetKey, setCashoutTargetKey] = useState<string | null>(null);
  const [cashoutTargetLabel, setCashoutTargetLabel] = useState<string>("");
  const [cashAmount, setCashAmount] = useState<string>("");
  const [gcashAmount, setGcashAmount] = useState<string>("");
  const [cashoutNote, setCashoutNote] = useState<string>("");
  const [savingCashout, setSavingCashout] = useState<boolean>(false);

  const [historyTargetKey, setHistoryTargetKey] = useState<string | null>(null);
  const [historyTargetLabel, setHistoryTargetLabel] = useState<string>("");

  const [editTarget, setEditTarget] = useState<ConsignmentRow | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    full_name: "",
    category: "",
    item_name: "",
    size: "",
    price: "",
  });
  const [savingEdit, setSavingEdit] = useState<boolean>(false);

  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [newImagePreview, setNewImagePreview] = useState<string>("");
  const [removeImage, setRemoveImage] = useState<boolean>(false);

  const [restockTarget, setRestockTarget] = useState<ConsignmentRow | null>(null);
  const [restockQty, setRestockQty] = useState<string>("");
  const [savingRestock, setSavingRestock] = useState<boolean>(false);

  const [deleteTarget, setDeleteTarget] = useState<ConsignmentRow | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  const [exporting, setExporting] = useState<boolean>(false);

  useEffect(() => {
    void fetchAll();
  }, []);

  useEffect(() => {
    return () => {
      if (newImagePreview.startsWith("blob:")) {
        URL.revokeObjectURL(newImagePreview);
      }
    };
  }, [newImagePreview]);

  const fetchAll = async (): Promise<void> => {
    setLoading(true);

    const { data: sales, error: sErr } = await supabase
      .from("consignment")
      .select(`
        id,
        created_at,
        full_name,
        category,
        item_name,
        size,
        image_url,
        price,
        restocked,
        sold,
        expected_sales,
        overall_sales,
        stocks
      `)
      .order("created_at", { ascending: false })
      .returns<ConsignmentRow[]>();

    if (sErr) {
      console.error("FETCH CONSIGNMENT ERROR:", sErr);
      setSalesRows([]);
      setCashouts([]);
      setLoading(false);
      return;
    }

    const withCatMethod = await supabase
      .from("consignment_cash_outs")
      .select(
        "id, created_at, full_name, category, cashout_amount, payment_method, note, voided, voided_at, voided_by"
      )
      .order("created_at", { ascending: false })
      .returns<CashOutRow[]>();

    if (!withCatMethod.error) {
      const mapped = (withCatMethod.data ?? []).map((r) => ({
        ...r,
        payment_method:
          String(
            (r as unknown as { payment_method?: unknown }).payment_method ?? "cash"
          ).toLowerCase() === "gcash"
            ? "gcash"
            : "cash",
        voided: Boolean((r as unknown as { voided?: unknown }).voided),
        voided_at: (r as unknown as { voided_at?: string | null }).voided_at ?? null,
        voided_by: (r as unknown as { voided_by?: string | null }).voided_by ?? null,
      })) as CashOutRow[];

      setSalesRows(sales ?? []);
      setCashouts(mapped);
      setLoading(false);
      return;
    }

    const noCatMethod = await supabase
      .from("consignment_cash_outs")
      .select(
        "id, created_at, full_name, cashout_amount, payment_method, note, voided, voided_at, voided_by"
      )
      .order("created_at", { ascending: false })
      .returns<CashOutRowNoCategory[]>();

    if (!noCatMethod.error) {
      const mapped: CashOutRow[] = (noCatMethod.data ?? []).map((r) => ({
        id: r.id,
        created_at: r.created_at,
        full_name: r.full_name,
        category: null,
        cashout_amount: r.cashout_amount,
        payment_method:
          String(
            (r as unknown as { payment_method?: unknown }).payment_method ?? "cash"
          ).toLowerCase() === "gcash"
            ? "gcash"
            : "cash",
        note: r.note,
        voided: Boolean((r as unknown as { voided?: unknown }).voided),
        voided_at: (r as unknown as { voided_at?: string | null }).voided_at ?? null,
        voided_by: (r as unknown as { voided_by?: string | null }).voided_by ?? null,
      }));

      setSalesRows(sales ?? []);
      setCashouts(mapped);
      setLoading(false);
      return;
    }

    const old = await supabase
      .from("consignment_cash_outs")
      .select(
        "id, created_at, full_name, category, cashout_amount, note, voided, voided_at, voided_by"
      )
      .order("created_at", { ascending: false })
      .returns<CashOutRowNoMethod[]>();

    if (old.error) {
      console.error("FETCH CASH OUTS ERROR:", old.error);
      setSalesRows(sales ?? []);
      setCashouts([]);
      setLoading(false);
      return;
    }

    const mapped: CashOutRow[] = (old.data ?? []).map((r) => ({
      id: r.id,
      created_at: r.created_at,
      full_name: r.full_name,
      category: r.category ?? null,
      cashout_amount: r.cashout_amount,
      payment_method: "cash",
      note: r.note,
      voided: Boolean((r as unknown as { voided?: unknown }).voided),
      voided_at: (r as unknown as { voided_at?: string | null }).voided_at ?? null,
      voided_by: (r as unknown as { voided_by?: string | null }).voided_by ?? null,
    }));

    setSalesRows(sales ?? []);
    setCashouts(mapped);
    setLoading(false);
  };

  const perKeyAggAll = useMemo<PersonAgg[]>(() => {
    const map = new Map<string, PersonAgg>();

    const getKeyAndLabel = (r: {
      full_name: string;
      category: string | null;
    }): { key: string; label: string } => {
      if (groupBy === "category") {
        const label = show(r.category, "-");
        return { key: norm(label), label };
      }
      const label = show(r.full_name, "-");
      return { key: norm(label), label };
    };

    const getOrCreate = (key: string, label: string): PersonAgg => {
      const found = map.get(key);
      if (found) return found;

      const fresh: PersonAgg = {
        key,
        label,
        total_restock: 0,
        total_sold: 0,
        expected_total: 0,
        gross_total: 0,
        net_total: 0,
        commission_total: 0,
        cashout_cash: 0,
        cashout_gcash: 0,
        cashout_total: 0,
        remaining: 0,
      };

      map.set(key, fresh);
      return fresh;
    };

    for (const r of salesRows) {
      const { key, label } = getKeyAndLabel(r);
      const a = getOrCreate(key, label);

      const rest = Number(r.restocked ?? 0) || 0;
      const sold = Number(r.sold ?? 0) || 0;

      a.total_restock += rest;
      a.total_sold += sold;

      const expected = round2(toNumber(r.expected_sales));
      const gross = round2(toNumber(r.overall_sales));

      a.expected_total = round2(a.expected_total + expected);
      a.gross_total = round2(a.gross_total + gross);
    }

    for (const a of map.values()) {
      a.net_total = grossToNet(a.gross_total);
      a.commission_total = grossToCommission(a.gross_total);
    }

    for (const c of cashouts) {
      if (c.voided === true) continue;

      const label =
        groupBy === "category" ? show(c.category, "-") : show(c.full_name, "-");
      const key = norm(label);
      const a = getOrCreate(key, label);

      const amt = round2(toNumber(c.cashout_amount));
      if (c.payment_method === "gcash") {
        a.cashout_gcash = round2(a.cashout_gcash + amt);
      } else {
        a.cashout_cash = round2(a.cashout_cash + amt);
      }

      a.cashout_total = round2(a.cashout_cash + a.cashout_gcash);
    }

    for (const a of map.values()) {
      a.remaining = round2(Math.max(0, a.net_total - a.cashout_total));
    }

    return Array.from(map.values()).sort((x, y) =>
      norm(x.label).localeCompare(norm(y.label))
    );
  }, [salesRows, cashouts, groupBy]);

  const perKeyAgg = useMemo<PersonAgg[]>(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return perKeyAggAll;
    return perKeyAggAll.filter((p) => norm(p.label).includes(q));
  }, [perKeyAggAll, searchText]);

  const filteredRows = useMemo<ConsignmentRow[]>(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return salesRows;

    return salesRows.filter((r) => {
      const f = norm(r.full_name);
      const cat = norm(r.category);
      const it = norm(r.item_name);
      const sz = norm(r.size);
      return f.includes(q) || cat.includes(q) || it.includes(q) || sz.includes(q);
    });
  }, [salesRows, searchText]);

  const rowsCount = filteredRows.length;

  const exportToExcel = async (): Promise<void> => {
    try {
      setExporting(true);

      const wb = new ExcelJS.Workbook();
      wb.creator = "Consignment System";
      wb.created = new Date();

      const ws = wb.addWorksheet("Consignment", {
        views: [{ state: "frozen", ySplit: 2 }],
        pageSetup: { fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      });

      const title = `Consignment Records (ALL) • Exported: ${formatPHDateTime(
        new Date().toISOString()
      )}`;
      ws.addRow([title]);
      ws.mergeCells("A1:M1");

      const titleCell = ws.getCell("A1");
      titleCell.font = { bold: true, size: 14 };
      titleCell.alignment = { vertical: "middle", horizontal: "center" };
      ws.getRow(1).height = 26;

      const headers = [
        "Image",
        "Item Name",
        "Date/Time (PH)",
        "Full Name",
        "Category",
        "Size",
        "Price",
        "Restock",
        "Stock",
        "Sold",
        "Expected Sales",
        "Overall Sales (NET)",
        "MeTyme Commission",
      ];
      ws.addRow(headers);

      const headerRow = ws.getRow(2);
      headerRow.height = 20;
      headerRow.font = { bold: true };
      headerRow.alignment = {
        vertical: "middle",
        horizontal: "center",
        wrapText: true,
      };

      ws.columns = [
        { key: "img", width: 14 },
        { key: "item", width: 26 },
        { key: "dt", width: 22 },
        { key: "name", width: 24 },
        { key: "cat", width: 18 },
        { key: "size", width: 10 },
        { key: "price", width: 14 },
        { key: "rest", width: 10 },
        { key: "stock", width: 10 },
        { key: "sold", width: 10 },
        { key: "exp", width: 16 },
        { key: "net", width: 18 },
        { key: "comm", width: 18 },
      ];

      const borderAll = {
        top: { style: "thin" as const },
        left: { style: "thin" as const },
        bottom: { style: "thin" as const },
        right: { style: "thin" as const },
      };

      const startRow = 3;
      for (let i = 0; i < filteredRows.length; i++) {
        const r = filteredRows[i];

        const price = round2(toNumber(r.price));
        const rest = Number(r.restocked ?? 0) || 0;
        const sold = Number(r.sold ?? 0) || 0;
        const stocks = Number(r.stocks ?? 0) || 0;

        const expected = round2(toNumber(r.expected_sales));
        const gross = round2(toNumber(r.overall_sales));
        const netOverall = grossToNet(gross);
        const commission = grossToCommission(gross);

        ws.addRow([
          "",
          show(r.item_name),
          formatPHDateTime(r.created_at),
          show(r.full_name),
          show(r.category),
          sizeText(r.size),
          price,
          rest,
          stocks,
          sold,
          expected,
          netOverall,
          commission,
        ]);

        const excelRowNum = startRow + i;
        const row = ws.getRow(excelRowNum);
        row.height = 56;

        for (let c = 1; c <= headers.length; c++) {
          const cell = row.getCell(c);
          cell.border = borderAll;
          cell.alignment = {
            vertical: "middle",
            horizontal: c === 2 || c === 4 || c === 5 ? "left" : "center",
            wrapText: true,
          };
          if (c === 7 || c === 11 || c === 12 || c === 13) {
            cell.numFmt = '"₱"#,##0.00';
          }
          if (c === 8 || c === 9 || c === 10) {
            cell.numFmt = "0";
          }
        }

        if (r.image_url) {
          const img = await fetchImageAsBase64(r.image_url);
          if (img) {
            const imgId = wb.addImage({
              base64: img.base64,
              extension: img.extension,
            });
            ws.addImage(imgId, {
              tl: { col: 0, row: excelRowNum - 1 },
              ext: { width: 64, height: 64 },
              editAs: "oneCell",
            });
          }
        }
      }

      for (let c = 1; c <= headers.length; c++) {
        ws.getRow(2).getCell(c).border = borderAll;
      }

      ws.autoFilter = {
        from: { row: 2, column: 1 },
        to: { row: 2, column: headers.length },
      };

      const totalsRowNum = startRow + filteredRows.length + 1;
      ws.addRow([]);
      ws.addRow([
        "TOTALS",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        { formula: `SUM(K${startRow}:K${startRow + filteredRows.length - 1})` },
        { formula: `SUM(L${startRow}:L${startRow + filteredRows.length - 1})` },
        { formula: `SUM(M${startRow}:M${startRow + filteredRows.length - 1})` },
      ]);

      const totalsRow = ws.getRow(totalsRowNum);
      totalsRow.height = 20;
      totalsRow.font = { bold: true };
      for (let c = 1; c <= headers.length; c++) {
        const cell = totalsRow.getCell(c);
        cell.border = borderAll;
        cell.alignment = {
          vertical: "middle",
          horizontal: c === 1 ? "left" : "center",
        };
        if (c === 11 || c === 12 || c === 13) {
          cell.numFmt = '"₱"#,##0.00';
        }
      }

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const fileName = `consignment_records_${new Date()
        .toISOString()
        .slice(0, 10)}.xlsx`;
      saveAs(blob, fileName);
    } catch (e: unknown) {
      console.error(e);
      alert("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const openCashout = (agg: PersonAgg): void => {
    setCashoutTargetKey(agg.key);
    setCashoutTargetLabel(agg.label);
    setCashAmount("");
    setGcashAmount("");
    setCashoutNote("");
  };

  const openHistory = (agg: PersonAgg): void => {
    setHistoryTargetKey(agg.key);
    setHistoryTargetLabel(agg.label);
  };

  const cashoutHistoryForTarget = useMemo(() => {
    if (!cashoutTargetKey) return [];
    return cashouts.filter((c) => {
      const label =
        groupBy === "category" ? show(c.category, "-") : show(c.full_name, "-");
      return norm(label) === cashoutTargetKey;
    });
  }, [cashoutTargetKey, cashouts, groupBy]);

  const historyForTarget = useMemo(() => {
    if (!historyTargetKey) return [];
    return cashouts.filter((c) => {
      const label =
        groupBy === "category" ? show(c.category, "-") : show(c.full_name, "-");
      return norm(label) === historyTargetKey;
    });
  }, [historyTargetKey, cashouts, groupBy]);

  const submitCashout = async (): Promise<void> => {
    if (!cashoutTargetKey) return;

    const cash = round2(Math.max(0, Number(cashAmount) || 0));
    const gcash = round2(Math.max(0, Number(gcashAmount) || 0));
    const total = round2(cash + gcash);

    if (total <= 0) {
      alert("Please enter CASH or GCASH amount (must be > 0).");
      return;
    }

    const target = perKeyAggAll.find((p) => p.key === cashoutTargetKey);
    const remaining = round2(target?.remaining ?? 0);

    if (total > remaining) {
      alert(`Insufficient remaining. Remaining: ${moneyText(remaining)}`);
      return;
    }

    try {
      setSavingCashout(true);

      const p_category = groupBy === "category" ? cashoutTargetLabel : null;

      const tryRpc = await supabase.rpc("cashout_consignment_oversale", {
        p_full_name: groupBy === "category" ? "CATEGORY" : cashoutTargetLabel,
        p_cash_amount: cash,
        p_gcash_amount: gcash,
        p_note: cashoutNote.trim() || null,
        p_category,
      });

      if (tryRpc.error) {
        const fallbackRpc = await supabase.rpc("cashout_consignment_oversale", {
          p_full_name: cashoutTargetLabel,
          p_cash_amount: cash,
          p_gcash_amount: gcash,
          p_note: cashoutNote.trim() || null,
        });

        if (fallbackRpc.error) {
          alert(`Cash out error: ${fallbackRpc.error.message}`);
          return;
        }
      }

      setCashoutTargetKey(null);
      setCashoutTargetLabel("");
      await fetchAll();
    } catch (e: unknown) {
      console.error(e);
      alert("Cash out failed.");
    } finally {
      setSavingCashout(false);
    }
  };

  const openEdit = (r: ConsignmentRow): void => {
    setEditTarget(r);
    setEditForm({
      full_name: show(r.full_name, ""),
      category: show(r.category, ""),
      item_name: show(r.item_name, ""),
      size: show(r.size, ""),
      price: String(toNumber(r.price) || ""),
    });

    setNewImageFile(null);
    if (newImagePreview.startsWith("blob:")) URL.revokeObjectURL(newImagePreview);
    setNewImagePreview("");
    setRemoveImage(false);
  };

  const onPickImage = (file: File | null): void => {
    setNewImageFile(file);
    setRemoveImage(false);

    if (newImagePreview.startsWith("blob:")) URL.revokeObjectURL(newImagePreview);
    setNewImagePreview(file ? URL.createObjectURL(file) : "");
  };

  const saveEdit = async (): Promise<void> => {
    if (!editTarget) return;

    const full_name = editForm.full_name.trim();
    const category = editForm.category.trim();
    const item_name = editForm.item_name.trim();
    const size = editForm.size.trim();
    const priceNum = round2(Math.max(0, Number(editForm.price) || 0));

    if (!full_name) return alert("Full Name is required.");
    if (!item_name) return alert("Item Name is required.");
    if (priceNum <= 0) return alert("Price must be > 0.");

    try {
      setSavingEdit(true);

      const oldUrl = editTarget.image_url ?? null;
      let nextImageUrl: string | null = oldUrl;

      if (newImageFile) {
        const uploadedUrl = await uploadConsignmentImage(
          newImageFile,
          CONSIGNMENT_BUCKET
        );
        nextImageUrl = uploadedUrl;
      } else if (removeImage) {
        nextImageUrl = null;
      }

      const payload = {
        full_name,
        category: category.length ? category : null,
        item_name,
        size: size.length ? size : null,
        price: priceNum,
        image_url: nextImageUrl,
      };

      const { error } = await supabase
        .from("consignment")
        .update(payload)
        .eq("id", editTarget.id);

      if (error) {
        alert(`Edit failed: ${error.message}`);
        return;
      }

      const changedImage = (oldUrl ?? null) !== (nextImageUrl ?? null);
      if (changedImage && oldUrl) {
        await deleteStorageByUrl(oldUrl, CONSIGNMENT_BUCKET);
      }

      setEditTarget(null);

      if (newImagePreview.startsWith("blob:")) URL.revokeObjectURL(newImagePreview);
      setNewImagePreview("");
      setNewImageFile(null);
      setRemoveImage(false);

      await fetchAll();
    } catch (e: unknown) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSavingEdit(false);
    }
  };

  const openRestock = (r: ConsignmentRow): void => {
    setRestockTarget(r);
    setRestockQty("");
  };

  const saveRestock = async (): Promise<void> => {
    if (!restockTarget) return;

    const addQty = Math.max(0, Math.floor(Number(restockQty) || 0));
    if (addQty <= 0) {
      alert("Restock quantity must be > 0");
      return;
    }

    const current = Math.max(
      0,
      Math.floor(Number(restockTarget.restocked ?? 0) || 0)
    );
    const next = current + addQty;

    try {
      setSavingRestock(true);

      const { error } = await supabase
        .from("consignment")
        .update({ restocked: next })
        .eq("id", restockTarget.id);

      if (error) {
        alert(`Restock failed: ${error.message}`);
        return;
      }

      setRestockTarget(null);
      await fetchAll();
    } finally {
      setSavingRestock(false);
    }
  };

  const confirmDelete = (r: ConsignmentRow): void => setDeleteTarget(r);

  const doDelete = async (): Promise<void> => {
    if (!deleteTarget) return;

    try {
      setDeleting(true);

      await deleteStorageByUrl(deleteTarget.image_url ?? null, CONSIGNMENT_BUCKET);

      const { error } = await supabase
        .from("consignment")
        .delete()
        .eq("id", deleteTarget.id);

      if (error) {
        alert(`Delete failed: ${error.message}`);
        return;
      }

      setDeleteTarget(null);
      await fetchAll();
    } finally {
      setDeleting(false);
    }
  };

  const groupHasAnyHistory = (aggKey: string): boolean =>
    cashouts.some((c) => {
      const label =
        groupBy === "category" ? show(c.category, "-") : show(c.full_name, "-");
      return norm(label) === aggKey;
    });

  return (
    <div className="asc-page">
      <div className="asc-shell">
        <div className="asc-hero">
          <h1 className="asc-main-title">Admin Staff Consignment Record</h1>
          <p className="asc-hero-subtitle">
            Premium view for consignment items, grouped sales, cash outs, history,
            editing, restocking, and export.
          </p>
        </div>

        <div className="asc-panel">
          <div className="asc-panel-head">
            <div className="asc-heading-wrap">
              <h2 className="asc-title">Consignment Records</h2>
              <div className="asc-subtext">
                Showing: <strong>ALL</strong> • Rows: <strong>{rowsCount}</strong> • Groups:{" "}
                <strong>{perKeyAgg.length}</strong>
              </div>

              <div className="asc-toggle-row">
                <button
                  className={`asc-btn ${groupBy === "full_name" ? "is-active" : ""}`}
                  onClick={() => setGroupBy("full_name")}
                  type="button"
                >
                  Group by Full Name
                </button>
                <button
                  className={`asc-btn ${groupBy === "category" ? "is-active" : ""}`}
                  onClick={() => setGroupBy("category")}
                  type="button"
                >
                  Group by Category
                </button>
              </div>
            </div>

            <div className="asc-toolbar">
              <div className="asc-search">
                <span className="asc-search-icon">🔎</span>
                <input
                  className="asc-search-input"
                  type="text"
                  placeholder="Search fullname / category / item / size..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.currentTarget.value)}
                />
                {searchText.trim() ? (
                  <button
                    className="asc-search-clear"
                    onClick={() => setSearchText("")}
                    type="button"
                  >
                    Clear
                  </button>
                ) : null}
              </div>

              <button
                className="asc-btn asc-btn-dark"
                onClick={() => void fetchAll()}
                disabled={loading || exporting}
                type="button"
              >
                Refresh
              </button>

              <button
                className="asc-btn asc-btn-gold"
                onClick={() => void exportToExcel()}
                disabled={loading || exporting || filteredRows.length === 0}
                type="button"
              >
                {exporting ? "Exporting..." : "Export Excel"}
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="asc-table-card">
            <div className="asc-loading">
              <div className="asc-spinner" />
              <span>Loading...</span>
            </div>
          </div>
        ) : perKeyAgg.length === 0 ? (
          <div className="asc-table-card">
            <p className="asc-empty">No consignment data found.</p>
          </div>
        ) : (
          <>
            <div className="asc-table-card">
              <div className="asc-table-wrap">
                <table className="asc-table">
                  <thead>
                    <tr>
                      <th>{groupBy === "category" ? "Category" : "Full Name"}</th>
                      <th>Total Restock</th>
                      <th>Total Sold</th>
                      <th>Expected Sales</th>
                      <th>Overall Sales</th>
                      <th>MeTyme Commission</th>
                      <th>Cash Outs</th>
                      <th>Remaining</th>
                      <th>Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {perKeyAgg.map((p) => {
                      const hasHistory = groupHasAnyHistory(p.key);

                      return (
                        <tr key={p.key}>
                          <td className="asc-strong">{p.label}</td>
                          <td className="asc-strong">{p.total_restock}</td>
                          <td className="asc-strong">{p.total_sold}</td>
                          <td className="asc-strong">{moneyText(p.expected_total)}</td>
                          <td className="asc-strong">{moneyText(p.net_total)}</td>
                          <td className="asc-strong">{moneyText(p.commission_total)}</td>
                          <td className="asc-strong">
                            {moneyText(p.cashout_total)}
                            <div className="asc-submini">
                              Cash: {moneyText(p.cashout_cash)} • GCash:{" "}
                              {moneyText(p.cashout_gcash)}
                            </div>
                          </td>
                          <td className="asc-strong asc-highlight">
                            {moneyText(p.remaining)}
                          </td>
                          <td>
                            <div className="asc-action-row">
                              <button
                                className="asc-btn asc-btn-dark"
                                onClick={() => openCashout(p)}
                                disabled={p.remaining <= 0}
                                type="button"
                              >
                                Cash Out
                              </button>

                              <button
                                className="asc-btn asc-btn-light"
                                onClick={() => openHistory(p)}
                                disabled={!hasHistory}
                                type="button"
                              >
                                History
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {groupBy === "category" ? (
                <div className="asc-note">
                  Note: For perfect cashouts when grouping by <b>Category</b>, your
                  cashout table should store the category value too.
                </div>
              ) : null}
            </div>

            <div className="asc-table-card">
              <div className="asc-table-wrap">
                <table className="asc-table">
                  <thead>
                    <tr>
                      <th>Image</th>
                      <th>Item Name</th>
                      <th>Date/Time (PH)</th>
                      <th>Full Name</th>
                      <th>Category</th>
                      <th>Size</th>
                      <th>Price</th>
                      <th>Restock</th>
                      <th>Stock</th>
                      <th>Sold</th>
                      <th>Expected Sales</th>
                      <th>Overall Sales</th>
                      <th>Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredRows.map((r) => {
                      const price = round2(toNumber(r.price));
                      const rest = Number(r.restocked ?? 0) || 0;
                      const sold = Number(r.sold ?? 0) || 0;
                      const stocks = Number(r.stocks ?? 0) || 0;

                      const expected = round2(toNumber(r.expected_sales));
                      const gross = round2(toNumber(r.overall_sales));
                      const netOverall = grossToNet(gross);

                      return (
                        <tr key={r.id}>
                          <td style={{ width: 92 }}>
                            {r.image_url ? (
                              <img
                                src={r.image_url}
                                alt={r.item_name}
                                className="asc-thumb"
                                loading="lazy"
                              />
                            ) : (
                              <div className="asc-no-image">No Image</div>
                            )}
                          </td>

                          <td className="asc-strong">{r.item_name || "-"}</td>
                          <td>{formatPHDateTime(r.created_at)}</td>
                          <td className="asc-strong">{show(r.full_name)}</td>
                          <td className="asc-strong">{show(r.category)}</td>
                          <td>{sizeText(r.size)}</td>
                          <td className="asc-strong">{moneyText(price)}</td>
                          <td className="asc-strong">{rest}</td>
                          <td className="asc-strong">{stocks}</td>
                          <td className="asc-strong">{sold}</td>
                          <td className="asc-strong">{moneyText(expected)}</td>
                          <td className="asc-strong">{moneyText(netOverall)}</td>
                          <td>
                            <div className="asc-action-row">
                              <button
                                className="asc-btn asc-btn-light"
                                onClick={() => openEdit(r)}
                                type="button"
                              >
                                Edit
                              </button>
                              <button
                                className="asc-btn asc-btn-dark"
                                onClick={() => openRestock(r)}
                                type="button"
                              >
                                Restock
                              </button>
                              <button
                                className="asc-btn asc-btn-danger"
                                onClick={() => confirmDelete(r)}
                                type="button"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        <CenterModal
          open={!!historyTargetKey}
          title="History"
          subtitle={`${groupBy === "category" ? "Category" : "Full Name"}: ${historyTargetLabel}`}
          onClose={() => setHistoryTargetKey(null)}
          size="lg"
        >
          {(() => {
            const p = perKeyAggAll.find((x) => x.key === historyTargetKey);

            const gross = round2(p?.gross_total ?? 0);
            const net = grossToNet(gross);
            const comm = grossToCommission(gross);
            const remaining = round2(p?.remaining ?? 0);
            const cash = round2(p?.cashout_cash ?? 0);
            const gcash = round2(p?.cashout_gcash ?? 0);
            const totalCashouts = round2(p?.cashout_total ?? 0);
            const expected = round2(p?.expected_total ?? 0);

            return (
              <div className="asc-modal-stack">
                <div className="asc-summary-grid">
                  <div className="asc-summary-item">
                    <span>Expected Total</span>
                    <strong>{moneyText(expected)}</strong>
                  </div>
                  <div className="asc-summary-item">
                    <span>Overall Sales (NET)</span>
                    <strong>{moneyText(net)}</strong>
                  </div>
                  <div className="asc-summary-item">
                    <span>MeTyme Commission</span>
                    <strong>{moneyText(comm)}</strong>
                  </div>
                  <div className="asc-summary-item">
                    <span>Cash Outs</span>
                    <strong>{moneyText(totalCashouts)}</strong>
                  </div>
                  <div className="asc-summary-item">
                    <span>Cash</span>
                    <strong>{moneyText(cash)}</strong>
                  </div>
                  <div className="asc-summary-item">
                    <span>GCash</span>
                    <strong>{moneyText(gcash)}</strong>
                  </div>
                  <div className="asc-summary-item asc-summary-item-wide">
                    <span>Remaining</span>
                    <strong>{moneyText(remaining)}</strong>
                  </div>
                </div>

                <div className="asc-history-title">Cash Out History (all time)</div>

                <div className="asc-history-list">
                  {historyForTarget.length === 0 ? (
                    <div className="asc-empty-box">No cash outs yet.</div>
                  ) : (
                    historyForTarget.map((h) => {
                      const isVoided = h.voided === true;

                      return (
                        <div
                          key={h.id}
                          className={`asc-history-item ${isVoided ? "is-voided" : ""}`}
                        >
                          <div>
                            <div className="asc-history-main">
                              {formatPHDateTime(h.created_at)} • {labelPay(h.payment_method)}
                              {isVoided ? " • VOIDED" : ""}
                            </div>
                            {h.note ? (
                              <div className="asc-history-sub">{h.note}</div>
                            ) : null}
                            {isVoided && h.voided_at ? (
                              <div className="asc-history-sub">
                                Voided at: {formatPHDateTime(h.voided_at)}
                              </div>
                            ) : null}
                          </div>

                          <div className="asc-history-amount">
                            {moneyText(round2(toNumber(h.cashout_amount)))}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="asc-modal-actions">
                  <button
                    className="asc-btn asc-btn-light"
                    onClick={() => setHistoryTargetKey(null)}
                    type="button"
                  >
                    Close
                  </button>
                </div>
              </div>
            );
          })()}
        </CenterModal>

        <CenterModal
          open={!!cashoutTargetKey}
          title="Cash Out"
          subtitle={`${groupBy === "category" ? "Category" : "Full Name"}: ${cashoutTargetLabel}`}
          onClose={() => {
            if (!savingCashout) setCashoutTargetKey(null);
          }}
          size="lg"
        >
          {(() => {
            const p = perKeyAggAll.find((x) => x.key === cashoutTargetKey);

            const gross = round2(p?.gross_total ?? 0);
            const net = grossToNet(gross);
            const comm = grossToCommission(gross);
            const remaining = round2(p?.remaining ?? 0);
            const cash = round2(p?.cashout_cash ?? 0);
            const gcash = round2(p?.cashout_gcash ?? 0);
            const totalCashouts = round2(p?.cashout_total ?? 0);
            const expected = round2(p?.expected_total ?? 0);

            return (
              <div className="asc-modal-stack">
                <div className="asc-summary-grid">
                  <div className="asc-summary-item">
                    <span>Expected Total</span>
                    <strong>{moneyText(expected)}</strong>
                  </div>
                  <div className="asc-summary-item">
                    <span>Overall Sales (NET)</span>
                    <strong>{moneyText(net)}</strong>
                  </div>
                  <div className="asc-summary-item">
                    <span>MeTyme Commission</span>
                    <strong>{moneyText(comm)}</strong>
                  </div>
                  <div className="asc-summary-item">
                    <span>Cash Outs</span>
                    <strong>{moneyText(totalCashouts)}</strong>
                  </div>
                  <div className="asc-summary-item">
                    <span>Cash</span>
                    <strong>{moneyText(cash)}</strong>
                  </div>
                  <div className="asc-summary-item">
                    <span>GCash</span>
                    <strong>{moneyText(gcash)}</strong>
                  </div>
                  <div className="asc-summary-item asc-summary-item-wide">
                    <span>Remaining</span>
                    <strong>{moneyText(remaining)}</strong>
                  </div>
                </div>

                <div className="asc-form-grid">
                  <div className="asc-field">
                    <label>Cash Amount</label>
                    <input
                      className="asc-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={cashAmount}
                      onChange={(e) => setCashAmount(e.currentTarget.value)}
                      placeholder="0.00"
                      disabled={savingCashout}
                    />
                  </div>

                  <div className="asc-field">
                    <label>GCash Amount</label>
                    <input
                      className="asc-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={gcashAmount}
                      onChange={(e) => setGcashAmount(e.currentTarget.value)}
                      placeholder="0.00"
                      disabled={savingCashout}
                    />
                  </div>
                </div>

                <div className="asc-total-line">
                  Total Cashout:{" "}
                  <strong>
                    {moneyText(
                      round2((Number(cashAmount) || 0) + (Number(gcashAmount) || 0))
                    )}
                  </strong>
                </div>

                <div className="asc-field">
                  <label>Note (optional)</label>
                  <textarea
                    className="asc-input asc-textarea"
                    value={cashoutNote}
                    onChange={(e) => setCashoutNote(e.currentTarget.value)}
                    placeholder="Example: payout / release / partial cashout..."
                    disabled={savingCashout}
                  />
                </div>

                <div className="asc-history-title">Cash Out History (all time)</div>

                <div className="asc-history-list">
                  {cashoutHistoryForTarget.length === 0 ? (
                    <div className="asc-empty-box">No cash outs yet.</div>
                  ) : (
                    cashoutHistoryForTarget.map((h) => {
                      const isVoided = h.voided === true;
                      return (
                        <div
                          key={h.id}
                          className={`asc-history-item ${isVoided ? "is-voided" : ""}`}
                        >
                          <div>
                            <div className="asc-history-main">
                              {formatPHDateTime(h.created_at)} • {labelPay(h.payment_method)}
                              {isVoided ? " • VOIDED" : ""}
                            </div>
                            {h.note ? (
                              <div className="asc-history-sub">{h.note}</div>
                            ) : null}
                          </div>
                          <div className="asc-history-amount">
                            {moneyText(round2(toNumber(h.cashout_amount)))}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="asc-modal-actions">
                  <button
                    className="asc-btn asc-btn-light"
                    onClick={() => setCashoutTargetKey(null)}
                    disabled={savingCashout}
                    type="button"
                  >
                    Close
                  </button>
                  <button
                    className="asc-btn asc-btn-dark"
                    onClick={() => void submitCashout()}
                    disabled={savingCashout}
                    type="button"
                  >
                    {savingCashout ? "Saving..." : "Cash Out"}
                  </button>
                </div>
              </div>
            );
          })()}
        </CenterModal>

        <CenterModal
          open={!!editTarget}
          title="Edit Consignment"
          subtitle={editTarget?.item_name ?? ""}
          onClose={() => {
            if (!savingEdit) setEditTarget(null);
          }}
          size="lg"
        >
          <div className="asc-modal-stack">
            <div className="asc-image-edit-wrap">
              <div className="asc-image-preview-box">
                {newImagePreview ? (
                  <img src={newImagePreview} alt="New" className="asc-image-preview" />
                ) : editTarget?.image_url && !removeImage ? (
                  <img
                    src={editTarget.image_url}
                    alt="Current"
                    className="asc-image-preview"
                  />
                ) : (
                  <div className="asc-no-image">No Image</div>
                )}
              </div>

              <div className="asc-image-actions">
                <label className="asc-btn asc-btn-dark asc-file-btn">
                  Upload Image
                  <input
                    type="file"
                    accept="image/*"
                    disabled={savingEdit}
                    onChange={(e) => {
                      const f = e.currentTarget.files?.[0] ?? null;
                      onPickImage(f);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>

                <button
                  className="asc-btn asc-btn-light"
                  onClick={() => {
                    onPickImage(null);
                    setRemoveImage(true);
                  }}
                  disabled={savingEdit}
                  type="button"
                >
                  Remove Image
                </button>

                {newImageFile ? (
                  <div className="asc-small-note">Selected: {newImageFile.name}</div>
                ) : null}
                {removeImage && !newImageFile ? (
                  <div className="asc-small-note">Image will be removed.</div>
                ) : null}
              </div>
            </div>

            <div className="asc-form-grid">
              <div className="asc-field">
                <label>Full Name *</label>
                <input
                  className="asc-input"
                  value={editForm.full_name}
                  onChange={(e) =>
                    setEditForm((p) => ({ ...p, full_name: e.currentTarget.value }))
                  }
                  disabled={savingEdit}
                  placeholder="Owner full name"
                />
              </div>

              <div className="asc-field">
                <label>Category</label>
                <input
                  className="asc-input"
                  value={editForm.category}
                  onChange={(e) =>
                    setEditForm((p) => ({ ...p, category: e.currentTarget.value }))
                  }
                  disabled={savingEdit}
                  placeholder="Optional category"
                />
              </div>

              <div className="asc-field">
                <label>Item Name *</label>
                <input
                  className="asc-input"
                  value={editForm.item_name}
                  onChange={(e) =>
                    setEditForm((p) => ({ ...p, item_name: e.currentTarget.value }))
                  }
                  disabled={savingEdit}
                  placeholder="Item name"
                />
              </div>

              <div className="asc-field">
                <label>Size</label>
                <input
                  className="asc-input"
                  value={editForm.size}
                  onChange={(e) =>
                    setEditForm((p) => ({ ...p, size: e.currentTarget.value }))
                  }
                  disabled={savingEdit}
                  placeholder="Optional size"
                />
              </div>

              <div className="asc-field asc-field-wide">
                <label>Price *</label>
                <input
                  className="asc-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={editForm.price}
                  onChange={(e) =>
                    setEditForm((p) => ({ ...p, price: e.currentTarget.value }))
                  }
                  disabled={savingEdit}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="asc-modal-actions">
              <button
                className="asc-btn asc-btn-light"
                onClick={() => setEditTarget(null)}
                disabled={savingEdit}
                type="button"
              >
                Close
              </button>
              <button
                className="asc-btn asc-btn-dark"
                onClick={() => void saveEdit()}
                disabled={savingEdit}
                type="button"
              >
                {savingEdit ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </CenterModal>

        <CenterModal
          open={!!restockTarget}
          title="Restock"
          subtitle={
            restockTarget
              ? `${restockTarget.item_name} • Current Restock: ${Math.max(
                  0,
                  Math.floor(Number(restockTarget.restocked ?? 0) || 0)
                )}`
              : ""
          }
          onClose={() => {
            if (!savingRestock) setRestockTarget(null);
          }}
        >
          <div className="asc-modal-stack">
            <div className="asc-field">
              <label>Add Qty</label>
              <input
                className="asc-input"
                type="number"
                min="1"
                step="1"
                value={restockQty}
                onChange={(e) => setRestockQty(e.currentTarget.value)}
                placeholder="0"
                disabled={savingRestock}
              />
            </div>

            <div className="asc-small-note">
              Example: current 10 + input 5 = 15
            </div>

            <div className="asc-modal-actions">
              <button
                className="asc-btn asc-btn-light"
                onClick={() => setRestockTarget(null)}
                disabled={savingRestock}
                type="button"
              >
                Close
              </button>
              <button
                className="asc-btn asc-btn-dark"
                onClick={() => void saveRestock()}
                disabled={savingRestock}
                type="button"
              >
                {savingRestock ? "Saving..." : "Restock"}
              </button>
            </div>
          </div>
        </CenterModal>

        <CenterModal
          open={!!deleteTarget}
          title="Delete Item"
          subtitle={
            deleteTarget
              ? `Are you sure you want to delete ${deleteTarget.item_name}?`
              : ""
          }
          onClose={() => {
            if (!deleting) setDeleteTarget(null);
          }}
        >
          {deleteTarget ? (
            <div className="asc-modal-stack">
              <div className="asc-delete-box">
                <div>
                  Full Name: <b>{show(deleteTarget.full_name)}</b>
                </div>
                <div>
                  Category: <b>{show(deleteTarget.category)}</b>
                </div>
                <div>
                  Stocks: <b>{Math.max(0, Math.floor(Number(deleteTarget.stocks ?? 0) || 0))}</b>{" "}
                  • Sold:{" "}
                  <b>{Math.max(0, Math.floor(Number(deleteTarget.sold ?? 0) || 0))}</b>
                </div>
                <div>
                  Image: <b>{deleteTarget.image_url ? "will be deleted" : "none"}</b>
                </div>
              </div>

              <div className="asc-modal-actions">
                <button
                  className="asc-btn asc-btn-light"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="asc-btn asc-btn-danger"
                  onClick={() => void doDelete()}
                  disabled={deleting}
                  type="button"
                >
                  {deleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          ) : null}
        </CenterModal>
      </div>
    </div>
  );
};

export default Admin_Staff_Consignment_Record;