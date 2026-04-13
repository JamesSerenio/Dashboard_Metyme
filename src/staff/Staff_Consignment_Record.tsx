import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../utils/supabaseClient";
import "../styles/Staff_Consignment_Record.css";

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
}

interface CashOutRowNoCategory {
  id: string;
  created_at: string;
  full_name: string;
  cashout_amount: NumericLike;
  payment_method: PayMethod;
  note: string | null;
}

interface CashOutRowNoMethod {
  id: string;
  created_at: string;
  full_name: string;
  category: string | null;
  cashout_amount: NumericLike;
  note: string | null;
}

type PersonAgg = {
  key: string;
  label: string;
  total_restock: number;
  total_sold: number;
  expected_total: number;
  gross_total: number;
  net_total: number;
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

const CONSIGNMENT_BUCKET = "consignment";

const toNumber = (v: NumericLike | null | undefined): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const round2 = (n: number): number => Number((Number.isFinite(n) ? n : 0).toFixed(2));
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

const norm = (s: string | null | undefined): string => (s ?? "").trim().toLowerCase();

const show = (s: string | null | undefined, fallback = "-"): string => {
  const v = String(s ?? "").trim();
  return v.length ? v : fallback;
};

const sizeText = (s: string | null | undefined): string => {
  const v = String(s ?? "").trim();
  return v.length ? v : "—";
};

const grossToNet = (gross: number): number => round2(gross * 0.85);

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
  const safeName = `consignment/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;

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

type ModalProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
};

const CenterModal: React.FC<ModalProps> = ({ open, title, subtitle, onClose, children }) => {
  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="scr-modal-overlay" onClick={onClose}>
      <div className="scr-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="scr-modal-head">
          <div>
            <h3 className="scr-modal-title">{title}</h3>
            {subtitle ? <p className="scr-modal-subtitle">{subtitle}</p> : null}
          </div>
          <button className="scr-modal-close" type="button" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="scr-modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
};

const Staff_Consignment_Record: React.FC = () => {
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
  const [restockNote, setRestockNote] = useState<string>("");
  const [savingRestock, setSavingRestock] = useState<boolean>(false);

  const [deleteTarget, setDeleteTarget] = useState<ConsignmentRow | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  useEffect(() => {
    void fetchAll();
  }, []);

  useEffect(() => {
    return () => {
      if (newImagePreview.startsWith("blob:")) URL.revokeObjectURL(newImagePreview);
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
      .select("id, created_at, full_name, category, cashout_amount, payment_method, note")
      .order("created_at", { ascending: false })
      .returns<CashOutRow[]>();

    if (!withCatMethod.error) {
      const mapped = (withCatMethod.data ?? []).map((r) => ({
        ...r,
        payment_method: (String((r as { payment_method?: unknown }).payment_method ?? "cash").toLowerCase() === "gcash"
          ? "gcash"
          : "cash") as PayMethod,
      }));
      setSalesRows(sales ?? []);
      setCashouts(mapped);
      setLoading(false);
      return;
    }

    const noCatMethod = await supabase
      .from("consignment_cash_outs")
      .select("id, created_at, full_name, cashout_amount, payment_method, note")
      .order("created_at", { ascending: false })
      .returns<CashOutRowNoCategory[]>();

    if (!noCatMethod.error) {
      const mapped: CashOutRow[] = (noCatMethod.data ?? []).map((r) => ({
        id: r.id,
        created_at: r.created_at,
        full_name: r.full_name,
        category: null,
        cashout_amount: r.cashout_amount,
        payment_method: (String((r as { payment_method?: unknown }).payment_method ?? "cash").toLowerCase() === "gcash"
          ? "gcash"
          : "cash") as PayMethod,
        note: r.note,
      }));
      setSalesRows(sales ?? []);
      setCashouts(mapped);
      setLoading(false);
      return;
    }

    const old = await supabase
      .from("consignment_cash_outs")
      .select("id, created_at, full_name, category, cashout_amount, note")
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
    }));

    setSalesRows(sales ?? []);
    setCashouts(mapped);
    setLoading(false);
  };

  const perKeyAggAll = useMemo<PersonAgg[]>(() => {
    const map = new Map<string, PersonAgg>();

    const getKeyAndLabel = (r: { full_name: string; category: string | null }): { key: string; label: string } => {
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

    for (const a of map.values()) a.net_total = grossToNet(a.gross_total);

    for (const c of cashouts) {
      const label = groupBy === "category" ? show(c.category, "-") : show(c.full_name, "-");
      const key = norm(label);
      const a = getOrCreate(key, label);

      const amt = round2(toNumber(c.cashout_amount));
      if (c.payment_method === "gcash") a.cashout_gcash = round2(a.cashout_gcash + amt);
      else a.cashout_cash = round2(a.cashout_cash + amt);

      a.cashout_total = round2(a.cashout_cash + a.cashout_gcash);
    }

    for (const a of map.values()) a.remaining = round2(Math.max(0, a.net_total - a.cashout_total));

    return Array.from(map.values()).sort((x, y) => norm(x.label).localeCompare(norm(y.label)));
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
      const label = groupBy === "category" ? show(c.category, "-") : show(c.full_name, "-");
      return norm(label) === cashoutTargetKey;
    });
  }, [cashoutTargetKey, cashouts, groupBy]);

  const historyForTarget = useMemo(() => {
    if (!historyTargetKey) return [];
    return cashouts.filter((c) => {
      const label = groupBy === "category" ? show(c.category, "-") : show(c.full_name, "-");
      return norm(label) === historyTargetKey;
    });
  }, [historyTargetKey, cashouts, groupBy]);

  const groupHasAnyHistory = (aggKey: string): boolean => {
    return cashouts.some((c) => {
      const label = groupBy === "category" ? show(c.category, "-") : show(c.full_name, "-");
      return norm(label) === aggKey;
    });
  };

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
      const note = cashoutNote.trim() || null;

      if (groupBy === "category") {
        const try1 = await supabase.rpc("cashout_consignment_oversale", {
          p_full_name: "CATEGORY",
          p_cash_amount: cash,
          p_gcash_amount: gcash,
          p_note: note,
          p_category: cashoutTargetLabel,
        });

        if (try1.error) {
          const try2 = await supabase.rpc("cashout_consignment_oversale", {
            p_full_name: cashoutTargetLabel,
            p_cash_amount: cash,
            p_gcash_amount: gcash,
            p_note: note,
          });

          if (try2.error) {
            alert(`Cash out error: ${try2.error.message}`);
            return;
          }
        }
      } else {
        const { error } = await supabase.rpc("cashout_consignment_oversale", {
          p_full_name: cashoutTargetLabel,
          p_cash_amount: cash,
          p_gcash_amount: gcash,
          p_note: note,
        });

        if (error) {
          alert(`Cash out error: ${error.message}`);
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
        const uploadedUrl = await uploadConsignmentImage(newImageFile, CONSIGNMENT_BUCKET);
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

      const { error } = await supabase.from("consignment").update(payload).eq("id", editTarget.id);

      if (error) {
        alert(`Edit failed: ${error.message}`);
        return;
      }

      const changedImage = (oldUrl ?? null) !== (nextImageUrl ?? null);
      if (changedImage && oldUrl) await deleteStorageByUrl(oldUrl, CONSIGNMENT_BUCKET);

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
    setRestockNote("");
  };

  const saveRestock = async (): Promise<void> => {
    if (!restockTarget) return;

    const addQty = Math.max(0, Math.floor(Number(restockQty) || 0));
    if (addQty <= 0) {
      alert("Restock quantity must be > 0");
      return;
    }

    try {
      setSavingRestock(true);

      const { error } = await supabase.rpc("consignment_restock", {
        p_consignment_id: restockTarget.id,
        p_qty: addQty,
        p_note: restockNote.trim() ? restockNote.trim() : null,
      });

      if (error) {
        alert(`Restock failed: ${error.message}`);
        return;
      }

      setRestockTarget(null);
      setRestockQty("");
      setRestockNote("");
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

      const { error } = await supabase.from("consignment").delete().eq("id", deleteTarget.id);

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

  return (
    <div className="scr-page">
      <div className="scr-shell">
        <section className="scr-topbar">
          <div className="scr-topbar-left">
            <h2 className="scr-title">Consignment Records</h2>
            <div className="scr-subtext">
              Showing: <strong>ALL</strong> • Rows: <strong>{rowsCount}</strong> • Groups:{" "}
              <strong>{perKeyAgg.length}</strong>
            </div>
          </div>

          <div className="scr-toolbar-actions">
            <div className="scr-searchbar">
              <span className="scr-search-icon">🔎</span>
              <input
                className="scr-search-input"
                type="text"
                placeholder="Search fullname / category / item / size"
                value={searchText}
                onChange={(e) => setSearchText(e.currentTarget.value)}
              />
              {searchText.trim() && (
                <button className="scr-clear-btn" onClick={() => setSearchText("")} type="button">
                  Clear
                </button>
              )}
            </div>

            <button
              className={`scr-chip-btn ${groupBy === "full_name" ? "is-active" : ""}`}
              onClick={() => setGroupBy("full_name")}
              type="button"
            >
              Group by Full Name
            </button>

            <button
              className={`scr-chip-btn ${groupBy === "category" ? "is-active" : ""}`}
              onClick={() => setGroupBy("category")}
              type="button"
            >
              Group by Category
            </button>

            <button className="scr-refresh-btn" onClick={() => void fetchAll()} disabled={loading} type="button">
              Refresh
            </button>
          </div>
        </section>

        {loading ? (
          <div className="scr-state-card">Loading...</div>
        ) : perKeyAgg.length === 0 ? (
          <div className="scr-state-card">No consignment data found.</div>
        ) : (
          <>
            <section className="scr-card">
              <div className="scr-card-head">
                <h3>Summary</h3>
              </div>

              <div className="scr-table-wrap">
                <table className="scr-table">
                  <thead>
                    <tr>
                      <th>{groupBy === "category" ? "Category" : "Full Name"}</th>
                      <th>Total Restock</th>
                      <th>Total Sold</th>
                      <th>Expected Sales</th>
                      <th>Overall Sales</th>
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
                          <td className="is-strong">{p.label}</td>
                          <td>{p.total_restock}</td>
                          <td>{p.total_sold}</td>
                          <td className="is-money">{moneyText(p.expected_total)}</td>
                          <td className="is-money">{moneyText(p.net_total)}</td>
                          <td className="is-money">
                            {moneyText(p.cashout_total)}
                            <div className="scr-mini-note">
                              Cash: {moneyText(p.cashout_cash)} • GCash: {moneyText(p.cashout_gcash)}
                            </div>
                          </td>
                          <td className="is-money is-strong">{moneyText(p.remaining)}</td>
                          <td>
                            <div className="scr-action-stack">
                              <button
                                className="scr-btn"
                                onClick={() => openCashout(p)}
                                disabled={p.remaining <= 0}
                                type="button"
                              >
                                Cash Out
                              </button>
                              <button
                                className="scr-btn"
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
                <div className="scr-footnote">
                  Note: For accurate cashouts when grouping by <b>Category</b>, your{" "}
                  <b>consignment_cash_outs</b> table should store the <b>category</b> value too.
                </div>
              ) : null}
            </section>

            <section className="scr-card">
              <div className="scr-card-head">
                <h3>Details</h3>
              </div>

              <div className="scr-table-wrap">
                <table className="scr-table">
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
                          <td className="scr-image-cell">
                            {r.image_url ? (
                              <img src={r.image_url} alt={r.item_name} className="scr-thumb" />
                            ) : (
                              <div className="scr-no-image">No Image</div>
                            )}
                          </td>
                          <td className="is-strong">{r.item_name || "-"}</td>
                          <td>{formatPHDateTime(r.created_at)}</td>
                          <td className="is-strong">{show(r.full_name)}</td>
                          <td className="is-strong">{show(r.category)}</td>
                          <td>{sizeText(r.size)}</td>
                          <td className="is-money">{moneyText(price)}</td>
                          <td>{rest}</td>
                          <td>{stocks}</td>
                          <td>{sold}</td>
                          <td className="is-money">{moneyText(expected)}</td>
                          <td className="is-money">{moneyText(netOverall)}</td>
                          <td>
                            <div className="scr-action-stack">
                              <button className="scr-btn" onClick={() => openEdit(r)} type="button">
                                Edit
                              </button>
                              <button className="scr-btn" onClick={() => openRestock(r)} type="button">
                                Restock
                              </button>
                              <button className="scr-btn scr-btn-danger" onClick={() => confirmDelete(r)} type="button">
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
            </section>
          </>
        )}
      </div>

      <CenterModal
        open={!!historyTargetKey}
        title="HISTORY"
        subtitle={`${groupBy === "category" ? "Category" : "Full Name"}: ${historyTargetLabel}`}
        onClose={() => setHistoryTargetKey(null)}
      >
        {(() => {
          const p = perKeyAggAll.find((x) => x.key === historyTargetKey);
          const gross = round2(p?.gross_total ?? 0);
          const net = grossToNet(gross);
          const remaining = round2(p?.remaining ?? 0);
          const cash = round2(p?.cashout_cash ?? 0);
          const gcash = round2(p?.cashout_gcash ?? 0);
          const totalCashouts = round2(p?.cashout_total ?? 0);
          const expected = round2(p?.expected_total ?? 0);

          return (
            <>
              <div className="scr-receipt-list">
                <div className="scr-receipt-row"><span>Expected Total</span><span>{moneyText(expected)}</span></div>
                <div className="scr-receipt-row"><span>Overall Sales (NET)</span><span>{moneyText(net)}</span></div>
                <div className="scr-receipt-row"><span>Cash Outs (Total)</span><span>{moneyText(totalCashouts)}</span></div>
                <div className="scr-receipt-row is-sub"><span>└ Cash</span><span>{moneyText(cash)}</span></div>
                <div className="scr-receipt-row is-sub"><span>└ GCash</span><span>{moneyText(gcash)}</span></div>
                <div className="scr-receipt-row is-strong"><span>Remaining</span><span>{moneyText(remaining)}</span></div>
              </div>

              <div className="scr-section-title">Cash Out History (all time)</div>

              <div className="scr-history-list">
                {historyForTarget.length === 0 ? (
                  <div className="scr-empty-note">No cash outs yet.</div>
                ) : (
                  historyForTarget.map((h) => (
                    <div key={h.id} className="scr-history-card">
                      <div>
                        <div className="scr-history-title">
                          {formatPHDateTime(h.created_at)} • {labelPay(h.payment_method)}
                        </div>
                        {h.note ? <div className="scr-history-note">{h.note}</div> : null}
                      </div>
                      <div className="scr-history-amount">
                        {moneyText(round2(toNumber(h.cashout_amount)))}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="scr-modal-actions">
                <button className="scr-btn" onClick={() => setHistoryTargetKey(null)} type="button">
                  Close
                </button>
              </div>
            </>
          );
        })()}
      </CenterModal>

      <CenterModal
        open={!!cashoutTargetKey}
        title="CASH OUT"
        subtitle={`${groupBy === "category" ? "Category" : "Full Name"}: ${cashoutTargetLabel}`}
        onClose={() => (savingCashout ? null : setCashoutTargetKey(null))}
      >
        {(() => {
          const p = perKeyAggAll.find((x) => x.key === cashoutTargetKey);
          const gross = round2(p?.gross_total ?? 0);
          const net = grossToNet(gross);
          const remaining = round2(p?.remaining ?? 0);
          const cash = round2(p?.cashout_cash ?? 0);
          const gcash = round2(p?.cashout_gcash ?? 0);
          const totalCashouts = round2(p?.cashout_total ?? 0);
          const expected = round2(p?.expected_total ?? 0);

          return (
            <>
              <div className="scr-receipt-list">
                <div className="scr-receipt-row"><span>Expected Total</span><span>{moneyText(expected)}</span></div>
                <div className="scr-receipt-row"><span>Overall Sales (NET)</span><span>{moneyText(net)}</span></div>
                <div className="scr-receipt-row"><span>Cash Outs (Total)</span><span>{moneyText(totalCashouts)}</span></div>
                <div className="scr-receipt-row is-sub"><span>└ Cash</span><span>{moneyText(cash)}</span></div>
                <div className="scr-receipt-row is-sub"><span>└ GCash</span><span>{moneyText(gcash)}</span></div>
                <div className="scr-receipt-row is-strong"><span>Remaining</span><span>{moneyText(remaining)}</span></div>
              </div>

              <div className="scr-form-grid">
                <div className="scr-field">
                  <label>Cash Amount</label>
                  <input
                    className="scr-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={cashAmount}
                    onChange={(e) => setCashAmount(e.currentTarget.value)}
                    placeholder="0.00"
                    disabled={savingCashout}
                  />
                </div>

                <div className="scr-field">
                  <label>GCash Amount</label>
                  <input
                    className="scr-input"
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

              <div className="scr-total-line">
                Total Cashout: <b>{moneyText(round2((Number(cashAmount) || 0) + (Number(gcashAmount) || 0)))}</b>
              </div>

              <div className="scr-field">
                <label>Note (optional)</label>
                <textarea
                  className="scr-textarea"
                  value={cashoutNote}
                  onChange={(e) => setCashoutNote(e.currentTarget.value)}
                  placeholder="Example: payout / release / partial cashout..."
                  disabled={savingCashout}
                />
              </div>

              <div className="scr-section-title">Cash Out History (all time)</div>

              <div className="scr-history-list">
                {cashoutHistoryForTarget.length === 0 ? (
                  <div className="scr-empty-note">No cash outs yet.</div>
                ) : (
                  cashoutHistoryForTarget.map((h) => (
                    <div key={h.id} className="scr-history-card">
                      <div>
                        <div className="scr-history-title">
                          {formatPHDateTime(h.created_at)} • {labelPay(h.payment_method)}
                        </div>
                        {h.note ? <div className="scr-history-note">{h.note}</div> : null}
                      </div>
                      <div className="scr-history-amount">
                        {moneyText(round2(toNumber(h.cashout_amount)))}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="scr-modal-actions">
                <button
                  className="scr-btn"
                  onClick={() => setCashoutTargetKey(null)}
                  disabled={savingCashout}
                  type="button"
                >
                  Close
                </button>
                <button
                  className="scr-btn"
                  onClick={() => void submitCashout()}
                  disabled={savingCashout}
                  type="button"
                >
                  {savingCashout ? "Saving..." : "Cash Out"}
                </button>
              </div>
            </>
          );
        })()}
      </CenterModal>

      <CenterModal
        open={!!editTarget}
        title="EDIT CONSIGNMENT"
        subtitle={editTarget?.item_name ?? ""}
        onClose={() => (savingEdit ? null : setEditTarget(null))}
      >
        <div className="scr-edit-image-row">
          <div className="scr-edit-image-box">
            {newImagePreview ? (
              <img src={newImagePreview} alt="New" className="scr-edit-image" />
            ) : editTarget?.image_url && !removeImage ? (
              <img src={editTarget.image_url} alt="Current" className="scr-edit-image" />
            ) : (
              <div className="scr-no-image">No Image</div>
            )}
          </div>

          <div className="scr-edit-image-actions">
            <label className="scr-btn is-label-btn">
              Upload Image
              <input
                type="file"
                accept="image/*"
                hidden
                disabled={savingEdit}
                onChange={(e) => {
                  const f = e.currentTarget.files?.[0] ?? null;
                  onPickImage(f);
                  e.currentTarget.value = "";
                }}
              />
            </label>

            <button
              className="scr-btn"
              onClick={() => {
                onPickImage(null);
                setRemoveImage(true);
              }}
              disabled={savingEdit}
              type="button"
            >
              Remove Image
            </button>

            {newImageFile ? <div className="scr-mini-note">Selected: {newImageFile.name}</div> : null}
            {removeImage && !newImageFile ? <div className="scr-mini-note">Image will be removed.</div> : null}
          </div>
        </div>

        <div className="scr-field">
          <label>Full Name *</label>
          <input
            className="scr-input"
            value={editForm.full_name}
            onChange={(e) => setEditForm((p) => ({ ...p, full_name: e.currentTarget.value }))}
            disabled={savingEdit}
            placeholder="Owner full name"
          />
        </div>

        <div className="scr-field">
          <label>Category</label>
          <input
            className="scr-input"
            value={editForm.category}
            onChange={(e) => setEditForm((p) => ({ ...p, category: e.currentTarget.value }))}
            disabled={savingEdit}
            placeholder="Optional category"
          />
        </div>

        <div className="scr-field">
          <label>Item Name *</label>
          <input
            className="scr-input"
            value={editForm.item_name}
            onChange={(e) => setEditForm((p) => ({ ...p, item_name: e.currentTarget.value }))}
            disabled={savingEdit}
            placeholder="Item name"
          />
        </div>

        <div className="scr-field">
          <label>Size</label>
          <input
            className="scr-input"
            value={editForm.size}
            onChange={(e) => setEditForm((p) => ({ ...p, size: e.currentTarget.value }))}
            disabled={savingEdit}
            placeholder="Optional size"
          />
        </div>

        <div className="scr-field">
          <label>Price *</label>
          <input
            className="scr-input"
            type="number"
            min="0"
            step="0.01"
            value={editForm.price}
            onChange={(e) => setEditForm((p) => ({ ...p, price: e.currentTarget.value }))}
            disabled={savingEdit}
            placeholder="0.00"
          />
        </div>

        <div className="scr-modal-actions">
          <button className="scr-btn" onClick={() => setEditTarget(null)} disabled={savingEdit} type="button">
            Close
          </button>
          <button className="scr-btn" onClick={() => void saveEdit()} disabled={savingEdit} type="button">
            {savingEdit ? "Saving..." : "Save"}
          </button>
        </div>
      </CenterModal>

      <CenterModal
        open={!!restockTarget}
        title="RESTOCK"
        subtitle={
          restockTarget
            ? `${restockTarget.item_name} • Current Restock: ${Math.max(
                0,
                Math.floor(Number(restockTarget.restocked ?? 0) || 0)
              )}`
            : ""
        }
        onClose={() => (savingRestock ? null : setRestockTarget(null))}
      >
        <div className="scr-field">
          <label>Add Qty</label>
          <input
            className="scr-input"
            type="number"
            min="1"
            step="1"
            value={restockQty}
            onChange={(e) => setRestockQty(e.currentTarget.value)}
            placeholder="0"
            disabled={savingRestock}
          />
        </div>

        <div className="scr-field">
          <label>Note (optional)</label>
          <textarea
            className="scr-textarea"
            value={restockNote}
            onChange={(e) => setRestockNote(e.currentTarget.value)}
            placeholder="Example: new stocks delivered / replenishment..."
            disabled={savingRestock}
          />
        </div>

        <div className="scr-footnote">This will also be recorded in Restock Logs.</div>

        <div className="scr-modal-actions">
          <button className="scr-btn" onClick={() => setRestockTarget(null)} disabled={savingRestock} type="button">
            Close
          </button>
          <button className="scr-btn" onClick={() => void saveRestock()} disabled={savingRestock} type="button">
            {savingRestock ? "Saving..." : "Restock"}
          </button>
        </div>
      </CenterModal>

      <CenterModal
        open={!!deleteTarget}
        title="DELETE ITEM"
        subtitle={deleteTarget ? `Are you sure you want to delete ${deleteTarget.item_name}?` : ""}
        onClose={() => (deleting ? null : setDeleteTarget(null))}
      >
        {deleteTarget && (
          <div className="scr-delete-box">
            <div>Full Name: <b>{show(deleteTarget.full_name)}</b></div>
            <div>Category: <b>{show(deleteTarget.category)}</b></div>
            <div>
              Stocks: <b>{Math.max(0, Math.floor(Number(deleteTarget.stocks ?? 0) || 0))}</b> • Sold:{" "}
              <b>{Math.max(0, Math.floor(Number(deleteTarget.sold ?? 0) || 0))}</b>
            </div>
            <div>Image: <b>{deleteTarget.image_url ? "will be deleted" : "none"}</b></div>
          </div>
        )}

        <div className="scr-modal-actions">
          <button className="scr-btn" onClick={() => setDeleteTarget(null)} disabled={deleting} type="button">
            Cancel
          </button>
          <button className="scr-btn scr-btn-danger" onClick={() => void doDelete()} disabled={deleting} type="button">
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </CenterModal>
    </div>
  );
};

export default Staff_Consignment_Record;