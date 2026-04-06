import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../utils/supabaseClient";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import "../styles/Admin_Item_Lists.css";

type SortKey = "category" | "stocks";
type ExpenseType = "expired" | "inventory_loss" | "bilin";

interface AddOn {
  id: string;
  category: string;
  name: string;
  size: string | null;
  price: number;
  restocked: number;
  sold: number;
  expenses: number;
  stocks: number;
  overall_sales: number;
  expected_sales: number;
  image_url: string | null;
  expired: number;
  inventory_loss: number;
  bilin: number;
}

interface AddOnExpenseRow {
  id: string;
  created_at: string;
  add_on_id: string;
  full_name: string;
  category: string;
  product_name: string;
  quantity: number;
  expense_type: ExpenseType;
  expense_amount: number | string;
  description: string;
  voided: boolean;
  voided_at: string | null;
}

const BUCKET = "add-ons";

const money2 = (n: number): string =>
  `₱${Number.isFinite(n) ? n.toFixed(2) : "0.00"}`;

const ymd = (d: Date): string => {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
};

const normSize = (s: string | null | undefined): string | null => {
  const v = String(s ?? "").trim();
  return v.length ? v : null;
};

const toNum = (v: unknown): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const formatPH = (iso: string): string => {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
};

const typeLabel = (t: ExpenseType): string => {
  if (t === "expired") return "Expired / Damaged";
  if (t === "inventory_loss") return "Inventory Loss";
  return "Bilin";
};

const safeExtFromName = (name: string): string => {
  const parts = name.split(".");
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  const ext = last.trim().toLowerCase();
  if (!ext) return "jpg";
  if (ext.length > 8) return "jpg";
  return ext.replace(/[^a-z0-9]/g, "") || "jpg";
};

const extractPathFromPublicUrl = (
  url: string,
  bucket: string,
): string | null => {
  try {
    const u = new URL(url);
    const marker = `/storage/v1/object/public/${bucket}/`;
    const idx = u.pathname.indexOf(marker);
    if (idx === -1) return null;
    return decodeURIComponent(u.pathname.slice(idx + marker.length));
  } catch {
    return null;
  }
};

const deleteStorageByUrl = async (
  url: string | null,
  bucket: string,
): Promise<void> => {
  if (!url) return;
  const path = extractPathFromPublicUrl(url, bucket);
  if (!path) return;
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) {
    console.warn("Storage delete failed:", error.message);
  }
};

const Admin_Item_Lists: React.FC = () => {
  const [addOns, setAddOns] = useState<AddOn[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [showToast, setShowToast] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string>("");

  const [sortKey, setSortKey] = useState<SortKey>("category");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [search, setSearch] = useState<string>("");

  const [editingAddOn, setEditingAddOn] = useState<AddOn | null>(null);
  const [savingEdit, setSavingEdit] = useState<boolean>(false);

  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [newImagePreview, setNewImagePreview] = useState<string>("");
  const [removeImage, setRemoveImage] = useState<boolean>(false);

  const [restockingAddOn, setRestockingAddOn] = useState<AddOn | null>(null);
  const [restockQty, setRestockQty] = useState<string>("");
  const [restockNote, setRestockNote] = useState<string>("");
  const [savingRestock, setSavingRestock] = useState<boolean>(false);

  const [historyAddOn, setHistoryAddOn] = useState<AddOn | null>(null);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [historyRows, setHistoryRows] = useState<AddOnExpenseRow[]>([]);

  const [deleteTarget, setDeleteTarget] = useState<AddOn | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  const [voidTarget, setVoidTarget] = useState<AddOnExpenseRow | null>(null);
  const [voiding, setVoiding] = useState<boolean>(false);

  const syncHistoryHeaderFromLatest = (latest: AddOn[]): void => {
    if (!historyAddOn) return;
    const fresh = latest.find((x) => x.id === historyAddOn.id);
    if (fresh) setHistoryAddOn(fresh);
  };

  const fetchAddOns = async (opts?: { silent?: boolean }): Promise<void> => {
    const silent = Boolean(opts?.silent);
    if (!silent) setLoading(true);

    try {
      const { data, error } = await supabase
        .from("add_ons")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = (data ?? []) as unknown as AddOn[];

      const normalized: AddOn[] = rows.map((r) => ({
        ...r,
        price: toNum((r as unknown as { price?: unknown }).price),
        restocked: toNum((r as unknown as { restocked?: unknown }).restocked),
        sold: toNum((r as unknown as { sold?: unknown }).sold),
        expenses: toNum((r as unknown as { expenses?: unknown }).expenses),
        stocks: toNum((r as unknown as { stocks?: unknown }).stocks),
        overall_sales: toNum(
          (r as unknown as { overall_sales?: unknown }).overall_sales,
        ),
        expected_sales: toNum(
          (r as unknown as { expected_sales?: unknown }).expected_sales,
        ),
        expired: toNum((r as unknown as { expired?: unknown }).expired),
        inventory_loss: toNum(
          (r as unknown as { inventory_loss?: unknown }).inventory_loss,
        ),
        bilin: toNum((r as unknown as { bilin?: unknown }).bilin),
        size: normSize((r as unknown as { size?: string | null }).size),
        image_url:
          (r as unknown as { image_url?: string | null }).image_url ?? null,
        category: String((r as unknown as { category?: unknown }).category ?? ""),
        name: String((r as unknown as { name?: unknown }).name ?? ""),
        id: String((r as unknown as { id?: unknown }).id ?? ""),
      }));

      setAddOns(normalized);
      syncHistoryHeaderFromLatest(normalized);
    } catch (error: unknown) {
      console.error("Error fetching add-ons:", error);
      setToastMessage("Error loading add-ons. Please try again.");
      setShowToast(true);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void fetchAddOns();
  }, []);

  useEffect(() => {
    return () => {
      if (newImagePreview.startsWith("blob:")) {
        URL.revokeObjectURL(newImagePreview);
      }
    };
  }, [newImagePreview]);

  useEffect(() => {
    if (!showToast) return;
    const timer = window.setTimeout(() => setShowToast(false), 2600);
    return () => window.clearTimeout(timer);
  }, [showToast]);

  const sortedAddOns = useMemo(() => {
    const list = [...addOns];
    list.sort((a, b) => {
      if (sortKey === "category") {
        const aCat = (a.category ?? "").toString();
        const bCat = (b.category ?? "").toString();
        return sortOrder === "asc"
          ? aCat.localeCompare(bCat)
          : bCat.localeCompare(aCat);
      }
      const aStock = toNum(a.stocks);
      const bStock = toNum(b.stocks);
      return sortOrder === "asc" ? aStock - bStock : bStock - aStock;
    });
    return list;
  }, [addOns, sortKey, sortOrder]);

  const filteredAddOns = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedAddOns;

    return sortedAddOns.filter((a) => {
      const name = (a.name ?? "").toString().toLowerCase();
      const cat = (a.category ?? "").toString().toLowerCase();
      const size = (a.size ?? "").toString().toLowerCase();
      return name.includes(q) || cat.includes(q) || size.includes(q);
    });
  }, [sortedAddOns, search]);

  const totalStocks = useMemo(
    () => filteredAddOns.reduce((sum, item) => sum + toNum(item.stocks), 0),
    [filteredAddOns],
  );

  const totalExpected = useMemo(
    () =>
      filteredAddOns.reduce((sum, item) => sum + toNum(item.expected_sales), 0),
    [filteredAddOns],
  );

  const toggleSortOrder = (): void =>
    setSortOrder((p) => (p === "asc" ? "desc" : "asc"));

  const openEdit = (id: string): void => {
    const a = addOns.find((x) => x.id === id);
    if (!a) return;

    setEditingAddOn({ ...a, size: normSize(a.size) });
    setNewImageFile(null);
    setRemoveImage(false);

    if (newImagePreview.startsWith("blob:")) {
      URL.revokeObjectURL(newImagePreview);
    }
    setNewImagePreview("");
  };

  const onPickImage = (file: File | null): void => {
    setNewImageFile(file);
    setRemoveImage(false);

    if (newImagePreview.startsWith("blob:")) {
      URL.revokeObjectURL(newImagePreview);
    }
    setNewImagePreview(file ? URL.createObjectURL(file) : "");
  };

  const uploadNewImage = async (): Promise<string> => {
    if (!newImageFile) throw new Error("No image selected");

    const ext = safeExtFromName(newImageFile.name);
    const safeName = `add_ons/${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}.${ext}`;

    const { error } = await supabase.storage.from(BUCKET).upload(safeName, newImageFile, {
      cacheControl: "3600",
      upsert: false,
      contentType: newImageFile.type || undefined,
    });

    if (error) throw new Error(error.message);

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(safeName);
    const publicUrl = data?.publicUrl ?? "";
    if (!publicUrl) throw new Error("Failed to get public URL.");
    return publicUrl;
  };

  const handleSaveEdit = async (): Promise<void> => {
    if (!editingAddOn) return;

    if (!editingAddOn.name.trim()) {
      setToastMessage("Name is required.");
      setShowToast(true);
      return;
    }

    if (!editingAddOn.category.trim()) {
      setToastMessage("Category is required.");
      setShowToast(true);
      return;
    }

    const fixedSize = normSize(editingAddOn.size);

    if (!Number.isFinite(editingAddOn.price) || editingAddOn.price < 0) {
      setToastMessage("Price must be a valid positive number.");
      setShowToast(true);
      return;
    }

    if (!Number.isFinite(editingAddOn.sold) || editingAddOn.sold < 0) {
      setToastMessage("Sold must be a valid non-negative number.");
      setShowToast(true);
      return;
    }

    if (!Number.isFinite(editingAddOn.expenses) || editingAddOn.expenses < 0) {
      setToastMessage("Expenses must be a valid non-negative number.");
      setShowToast(true);
      return;
    }

    const oldImageUrl: string | null = editingAddOn.image_url ?? null;

    try {
      setSavingEdit(true);

      let finalImageUrl: string | null = oldImageUrl;

      if (newImageFile) {
        finalImageUrl = await uploadNewImage();
      } else if (removeImage) {
        finalImageUrl = null;
      }

      const { error } = await supabase
        .from("add_ons")
        .update({
          category: editingAddOn.category,
          name: editingAddOn.name,
          size: fixedSize,
          price: editingAddOn.price,
          sold: editingAddOn.sold,
          expenses: editingAddOn.expenses,
          image_url: finalImageUrl,
        })
        .eq("id", editingAddOn.id);

      if (error) throw error;

      const changedImage = (oldImageUrl ?? null) !== (finalImageUrl ?? null);
      if (changedImage && oldImageUrl) {
        await deleteStorageByUrl(oldImageUrl, BUCKET);
      }

      setToastMessage("Add-on updated successfully.");
      setShowToast(true);

      setEditingAddOn(null);
      setNewImageFile(null);
      setRemoveImage(false);

      if (newImagePreview.startsWith("blob:")) {
        URL.revokeObjectURL(newImagePreview);
      }
      setNewImagePreview("");

      void fetchAddOns();
    } catch (error: unknown) {
      console.error("Error updating add-on:", error);
      setToastMessage(
        `Error updating add-on: ${
          error instanceof Error ? error.message : "Please try again."
        }`,
      );
      setShowToast(true);
    } finally {
      setSavingEdit(false);
    }
  };

  const openRestock = (id: string): void => {
    const a = addOns.find((x) => x.id === id);
    if (!a) return;
    setRestockingAddOn(a);
    setRestockQty("");
    setRestockNote("");
  };

  const submitRestock = async (): Promise<void> => {
    if (!restockingAddOn) return;

    const qty = parseInt(restockQty.trim(), 10);
    if (Number.isNaN(qty) || qty <= 0) {
      setToastMessage("Restock quantity must be a positive number.");
      setShowToast(true);
      return;
    }

    try {
      setSavingRestock(true);

      const { error } = await supabase.rpc("restock_add_on", {
        p_add_on_id: restockingAddOn.id,
        p_qty: qty,
        p_note: restockNote.trim() || null,
      });

      if (error) throw error;

      setToastMessage("Stocks added successfully.");
      setShowToast(true);

      setRestockingAddOn(null);
      setRestockQty("");
      setRestockNote("");

      void fetchAddOns();
    } catch (error: unknown) {
      console.error("Error restocking:", error);
      setToastMessage(
        `Error restocking: ${
          error instanceof Error ? error.message : "Please try again."
        }`,
      );
      setShowToast(true);
    } finally {
      setSavingRestock(false);
    }
  };

  const fetchHistoryRowsFor = async (addOnId: string): Promise<void> => {
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from("add_on_expenses")
        .select(
          "id, created_at, add_on_id, full_name, category, product_name, quantity, expense_type, expense_amount, description, voided, voided_at",
        )
        .eq("add_on_id", addOnId)
        .order("created_at", { ascending: false })
        .limit(150);

      if (error) throw error;

      const rows = (data ?? []) as unknown as AddOnExpenseRow[];
      setHistoryRows(
        rows.map((r) => ({
          ...r,
          quantity: toNum(r.quantity),
          expense_amount: toNum(r.expense_amount),
          expense_type: String(r.expense_type) as ExpenseType,
          voided: Boolean(r.voided),
          voided_at: r.voided_at ?? null,
        })),
      );

      void fetchAddOns({ silent: true });
    } catch (e: unknown) {
      console.error("history fetch error:", e);
      setToastMessage(
        `History load failed: ${e instanceof Error ? e.message : "Try again."}`,
      );
      setShowToast(true);
      setHistoryAddOn(null);
      setHistoryRows([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const openHistory = async (id: string): Promise<void> => {
    const a = addOns.find((x) => x.id === id);
    if (!a) return;

    setHistoryAddOn(a);
    setHistoryRows([]);
    await fetchHistoryRowsFor(a.id);
  };

  const refreshHistory = async (): Promise<void> => {
    if (!historyAddOn) return;
    await fetchHistoryRowsFor(historyAddOn.id);
  };

  const confirmVoid = (row: AddOnExpenseRow): void => setVoidTarget(row);

  const doVoid = async (): Promise<void> => {
    if (!voidTarget) return;

    try {
      setVoiding(true);

      const { error } = await supabase.rpc("void_addon_expense", {
        p_expense_id: voidTarget.id,
      });

      if (error) throw error;

      setToastMessage("Voided successfully. Counters restored.");
      setShowToast(true);

      setVoidTarget(null);

      await fetchAddOns();
      await refreshHistory();
    } catch (e: unknown) {
      console.error("void error:", e);
      setToastMessage(
        `Void failed: ${e instanceof Error ? e.message : "Try again."}`,
      );
      setShowToast(true);
    } finally {
      setVoiding(false);
    }
  };

  const confirmDelete = (id: string): void => {
    const a = addOns.find((x) => x.id === id) ?? null;
    setDeleteTarget(a);
  };

  const doDelete = async (): Promise<void> => {
    if (!deleteTarget) return;

    try {
      setDeleting(true);

      const oldImageUrl = deleteTarget.image_url ?? null;

      const { error } = await supabase
        .from("add_ons")
        .delete()
        .eq("id", deleteTarget.id);

      if (error) throw error;

      if (oldImageUrl) await deleteStorageByUrl(oldImageUrl, BUCKET);

      setAddOns((prev) => prev.filter((a) => a.id !== deleteTarget.id));

      if (historyAddOn?.id === deleteTarget.id) {
        setHistoryAddOn(null);
        setHistoryRows([]);
      }

      setToastMessage("Add-on deleted successfully.");
      setShowToast(true);

      setDeleteTarget(null);
    } catch (error: unknown) {
      console.error("Error deleting add-on:", error);
      setToastMessage(
        `Error deleting add-on: ${
          error instanceof Error ? error.message : "Please try again."
        }`,
      );
      setShowToast(true);
    } finally {
      setDeleting(false);
    }
  };

  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = reader.result;
        if (typeof res !== "string") return reject(new Error("Failed to convert image"));
        const base64 = res.split(",")[1] ?? "";
        resolve(base64);
      };
      reader.onerror = () => reject(new Error("FileReader error"));
      reader.readAsDataURL(blob);
    });

  const fetchImageBase64 = async (
    url: string,
  ): Promise<{ base64: string; ext: "png" | "jpeg" }> => {
    const r = await fetch(url);
    if (!r.ok) throw new Error("Image fetch failed");

    const ct = (r.headers.get("content-type") ?? "").toLowerCase();
    const blob = await r.blob();
    const base64 = await blobToBase64(blob);

    const isPng = ct.includes("png") || url.toLowerCase().includes(".png");
    const ext: "png" | "jpeg" = isPng ? "png" : "jpeg";
    return { base64, ext };
  };

  const exportToExcel = async (): Promise<void> => {
    try {
      const now = new Date();
      const title = "Item Lists INVENTORY REPORT";
      const generated = `Generated: ${now.toLocaleString()}`;
      const sortInfo = `Sort: ${sortKey} (${sortOrder})   Search: ${
        search.trim() ? search.trim() : "—"
      }`;

      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet("Add-ons", {
        views: [{ state: "frozen", ySplit: 5 }],
      });

      ws.columns = [
        { header: "Image", key: "image", width: 14 },
        { header: "Name", key: "name", width: 28 },
        { header: "Category", key: "category", width: 18 },
        { header: "Size", key: "size", width: 10 },
        { header: "Price", key: "price", width: 12 },
        { header: "Restocked", key: "restocked", width: 12 },
        { header: "Sold", key: "sold", width: 10 },
        { header: "Expired", key: "expired", width: 10 },
        { header: "Inventory Loss", key: "inv_loss", width: 14 },
        { header: "Bilin", key: "bilin", width: 10 },
        { header: "Stocks", key: "stocks", width: 10 },
        { header: "Expenses", key: "expenses", width: 12 },
        { header: "Overall Sales", key: "overall", width: 14 },
        { header: "Expected Sales", key: "expected", width: 14 },
      ];

      ws.mergeCells(1, 1, 1, 14);
      ws.mergeCells(2, 1, 2, 14);
      ws.mergeCells(3, 1, 3, 14);

      ws.getCell("A1").value = title;
      ws.getCell("A2").value = generated;
      ws.getCell("A3").value = sortInfo;

      ws.getCell("A1").font = { bold: true, size: 16 };
      ws.getCell("A2").font = { size: 11 };
      ws.getCell("A3").font = { size: 11 };

      ws.addRow([]);

      const headerRow = ws.getRow(5);
      headerRow.values = [
        "Image",
        "Name",
        "Category",
        "Size",
        "Price",
        "Restocked",
        "Sold",
        "Expired",
        "Inventory Loss",
        "Bilin",
        "Stocks",
        "Expenses",
        "Overall Sales",
        "Expected Sales",
      ];
      headerRow.font = { bold: true };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };
      headerRow.height = 20;

      headerRow.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFEFEFEF" },
        };
      });

      let rowIndex = 6;

      for (const a of filteredAddOns) {
        const r = ws.getRow(rowIndex);

        r.getCell(2).value = a.name ?? "";
        r.getCell(3).value = a.category ?? "";
        r.getCell(4).value = normSize(a.size) ?? "—";
        r.getCell(5).value = toNum(a.price);
        r.getCell(6).value = toNum(a.restocked);
        r.getCell(7).value = toNum(a.sold);
        r.getCell(8).value = toNum(a.expired);
        r.getCell(9).value = toNum(a.inventory_loss);
        r.getCell(10).value = toNum(a.bilin);
        r.getCell(11).value = toNum(a.stocks);
        r.getCell(12).value = toNum(a.expenses);
        r.getCell(13).value = toNum(a.overall_sales);
        r.getCell(14).value = toNum(a.expected_sales);

        r.height = 52;

        for (let c = 1; c <= 14; c++) {
          const cell = r.getCell(c);
          cell.alignment =
            c === 2
              ? { vertical: "middle", horizontal: "left", wrapText: true }
              : {
                  vertical: "middle",
                  horizontal: c === 1 ? "center" : "center",
                  wrapText: true,
                };
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        }

        r.getCell(5).numFmt = "₱#,##0.00";
        r.getCell(13).numFmt = "₱#,##0.00";
        r.getCell(14).numFmt = "₱#,##0.00";

        if (a.image_url) {
          try {
            const { base64, ext } = await fetchImageBase64(a.image_url);
            const imgId = workbook.addImage({ base64, extension: ext });

            ws.addImage(imgId, {
              tl: { col: 0.15, row: rowIndex - 1 + 0.15 },
              ext: { width: 48, height: 48 },
            });
          } catch {
            console.warn("Image embed failed for:", a.image_url);
          }
        }

        r.commit();
        rowIndex++;
      }

      const buf = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      saveAs(blob, `Item_List_${ymd(now)}.xlsx`);

      setToastMessage("Exported to Excel successfully.");
      setShowToast(true);
    } catch (e: unknown) {
      console.error("Export Excel error:", e);
      setToastMessage(
        `Export failed: ${e instanceof Error ? e.message : "Please try again."}`,
      );
      setShowToast(true);
    }
  };

  const sortLabel = `${sortKey === "category" ? "category" : "stocks"} (${sortOrder})`;

  return (
    <div className="admin-items-page">
      <div className="admin-items-shell">
        <section className="admin-items-hero">
          <div className="admin-items-badge">
            <span>✦</span>
            <span>Item Inventory</span>
          </div>

          <div className="admin-items-hero-main">
            <div className="admin-items-copy">
              <h1 className="admin-items-title">Admin Item Lists</h1>
              <p className="admin-items-subtitle">
                Manage stocks, pricing, images, and adjustment history with a
                polished premium inventory workspace.
              </p>
            </div>

            <div className="admin-items-hero-actions">
              <button
                className="admin-action-btn admin-action-btn--ghost"
                onClick={() => void fetchAddOns()}
                disabled={loading}
                type="button"
              >
                Refresh
              </button>
              <button
                className="admin-action-btn admin-action-btn--primary"
                onClick={() => void exportToExcel()}
                disabled={loading || filteredAddOns.length === 0}
                type="button"
              >
                Export Excel
              </button>
            </div>
          </div>
        </section>

        <section className="admin-items-toolbar">
          <div className="admin-toolbar-top">
            <div className="admin-toolbar-stats">
              <div className="admin-summary-card">
                <span className="admin-summary-label">Sorted By</span>
                <strong>{sortLabel}</strong>
              </div>

              <div className="admin-summary-card">
                <span className="admin-summary-label">Rows</span>
                <strong>{filteredAddOns.length}</strong>
              </div>

              <div className="admin-summary-card">
                <span className="admin-summary-label">Stocks</span>
                <strong>{totalStocks}</strong>
              </div>

              <div className="admin-summary-card">
                <span className="admin-summary-label">Expected</span>
                <strong>{money2(totalExpected)}</strong>
              </div>
            </div>

            <div className="admin-toolbar-search">
              <div className="admin-search-box">
                <span className="admin-search-icon">🔎</span>
                <input
                  className="admin-search-input"
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(String(e.currentTarget.value ?? ""))}
                  placeholder="Search name, category, or size..."
                />
                {search.trim() && (
                  <button
                    className="admin-search-clear"
                    type="button"
                    onClick={() => setSearch("")}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="admin-toolbar-bottom">
            <div className="admin-filter-actions">
              <button
                className={`admin-chip-btn ${
                  sortKey === "category" ? "is-active" : ""
                }`}
                type="button"
                onClick={() => setSortKey("category")}
              >
                Sort: Category
              </button>

              <button
                className={`admin-chip-btn ${
                  sortKey === "stocks" ? "is-active" : ""
                }`}
                type="button"
                onClick={() => setSortKey("stocks")}
              >
                Sort: Stocks
              </button>

              <button
                className="admin-chip-btn"
                type="button"
                onClick={toggleSortOrder}
              >
                Order: {sortOrder === "asc" ? "Asc" : "Desc"}
              </button>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="admin-state-card">Loading add-ons...</div>
        ) : filteredAddOns.length === 0 ? (
          <div className="admin-state-card">No add-ons found.</div>
        ) : (
          <section className="admin-table-card">
            <div className="admin-table-card-head">
              <div>
                <div className="admin-table-title">Inventory Table</div>
                <div className="admin-table-subtitle">
                  Premium overview of item stocks, sales, losses, and actions
                </div>
              </div>
            </div>

            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Image</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Size</th>
                    <th>Price</th>
                    <th>Restocked</th>
                    <th>Sold</th>
                    <th>Expired</th>
                    <th>Inventory Loss</th>
                    <th>Bale</th>
                    <th>Stocks</th>
                    <th>Expenses</th>
                    <th>Overall</th>
                    <th>Expected</th>
                    <th className="admin-actions-head">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredAddOns.map((a) => (
                    <tr key={a.id}>
                      <td className="admin-cell-image">
                        {a.image_url ? (
                          <img
                            src={a.image_url}
                            alt={a.name}
                            className="admin-item-image"
                            loading="lazy"
                          />
                        ) : (
                          <div className="admin-no-image">No Image</div>
                        )}
                      </td>

                      <td className="is-strong admin-name-cell">{a.name}</td>
                      <td className="is-strong">{a.category}</td>
                      <td>{normSize(a.size) ?? "—"}</td>
                      <td className="is-strong">{money2(toNum(a.price))}</td>
                      <td className="is-strong">{toNum(a.restocked)}</td>
                      <td className="is-strong">{toNum(a.sold)}</td>
                      <td className="is-strong">{toNum(a.expired)}</td>
                      <td className="is-strong">{toNum(a.inventory_loss)}</td>
                      <td className="is-strong">{toNum(a.bilin)}</td>
                      <td className="is-strong">{toNum(a.stocks)}</td>
                      <td className="is-strong">{money2(toNum(a.expenses))}</td>
                      <td className="is-strong">{money2(toNum(a.overall_sales))}</td>
                      <td className="is-strong">{money2(toNum(a.expected_sales))}</td>

                      <td className="admin-actions-cell">
                        <div className="admin-row-actions">
                          <button
                            className="admin-action-btn admin-action-btn--soft"
                            onClick={() => openRestock(a.id)}
                            type="button"
                          >
                            Add Stocks
                          </button>
                          <button
                            className="admin-action-btn admin-action-btn--soft"
                            onClick={() => void openHistory(a.id)}
                            type="button"
                          >
                            History
                          </button>
                          <button
                            className="admin-action-btn admin-action-btn--soft"
                            onClick={() => openEdit(a.id)}
                            type="button"
                          >
                            Edit
                          </button>
                          <button
                            className="admin-action-btn admin-action-btn--danger"
                            onClick={() => confirmDelete(a.id)}
                            type="button"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {showToast && <div className="admin-toast">{toastMessage}</div>}

        {editingAddOn && (
          <div
            className="admin-modal-overlay"
            onClick={() => (savingEdit ? null : setEditingAddOn(null))}
          >
            <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
              <h3 className="admin-modal-title">Edit Add-On</h3>
              <p className="admin-modal-subtitle">{editingAddOn.name}</p>

              <div className="admin-edit-image-row">
                <div className="admin-edit-image-box">
                  {newImagePreview ? (
                    <img src={newImagePreview} alt="New" className="admin-edit-image" />
                  ) : editingAddOn.image_url && !removeImage ? (
                    <img
                      src={editingAddOn.image_url}
                      alt="Current"
                      className="admin-edit-image"
                    />
                  ) : (
                    <div className="admin-no-image">No Image</div>
                  )}
                </div>

                <div className="admin-edit-image-actions">
                  <label className="admin-action-btn admin-action-btn--soft">
                    Upload Image
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      disabled={savingEdit}
                      onChange={(e) => {
                        const f = e.currentTarget.files?.[0] ?? null;
                        onPickImage(f);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>

                  <button
                    className="admin-action-btn admin-action-btn--soft"
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
                    <div className="admin-helper-text">Selected: {newImageFile.name}</div>
                  ) : null}

                  {removeImage && !newImageFile ? (
                    <div className="admin-helper-text">Image will be removed.</div>
                  ) : null}
                </div>
              </div>

              <div className="admin-form-grid">
                <div className="admin-form-group">
                  <label>Name *</label>
                  <input
                    className="admin-input"
                    value={editingAddOn.name}
                    onChange={(e) =>
                      setEditingAddOn({ ...editingAddOn, name: e.currentTarget.value })
                    }
                    disabled={savingEdit}
                  />
                </div>

                <div className="admin-form-group">
                  <label>Category *</label>
                  <input
                    className="admin-input"
                    value={editingAddOn.category}
                    onChange={(e) =>
                      setEditingAddOn({
                        ...editingAddOn,
                        category: e.currentTarget.value,
                      })
                    }
                    disabled={savingEdit}
                  />
                </div>

                <div className="admin-form-group">
                  <label>Size</label>
                  <input
                    className="admin-input"
                    value={editingAddOn.size ?? ""}
                    placeholder='e.g. "Small", "16oz"'
                    onChange={(e) =>
                      setEditingAddOn({ ...editingAddOn, size: e.currentTarget.value })
                    }
                    disabled={savingEdit}
                  />
                </div>

                <div className="admin-form-group">
                  <label>Price</label>
                  <input
                    className="admin-input"
                    type="number"
                    value={editingAddOn.price}
                    onChange={(e) => {
                      const v = parseFloat(e.currentTarget.value);
                      setEditingAddOn({
                        ...editingAddOn,
                        price: Number.isNaN(v) ? 0 : v,
                      });
                    }}
                    disabled={savingEdit}
                  />
                </div>

                <div className="admin-form-group">
                  <label>Sold</label>
                  <input
                    className="admin-input"
                    type="number"
                    value={editingAddOn.sold}
                    onChange={(e) => {
                      const v = parseInt(e.currentTarget.value, 10);
                      setEditingAddOn({
                        ...editingAddOn,
                        sold: Number.isNaN(v) ? 0 : v,
                      });
                    }}
                    disabled={savingEdit}
                  />
                </div>

                <div className="admin-form-group">
                  <label>Expenses</label>
                  <input
                    className="admin-input"
                    type="number"
                    value={editingAddOn.expenses}
                    onChange={(e) => {
                      const v = parseFloat(e.currentTarget.value);
                      setEditingAddOn({
                        ...editingAddOn,
                        expenses: Number.isNaN(v) ? 0 : v,
                      });
                    }}
                    disabled={savingEdit}
                  />
                </div>
              </div>

              <div className="admin-modal-actions">
                <button
                  className="admin-action-btn admin-action-btn--ghost"
                  onClick={() => setEditingAddOn(null)}
                  disabled={savingEdit}
                  type="button"
                >
                  Close
                </button>
                <button
                  className="admin-action-btn admin-action-btn--primary"
                  onClick={() => void handleSaveEdit()}
                  disabled={savingEdit}
                  type="button"
                >
                  {savingEdit ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}

        {restockingAddOn && (
          <div
            className="admin-modal-overlay"
            onClick={() => (savingRestock ? null : setRestockingAddOn(null))}
          >
            <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
              <h3 className="admin-modal-title">Add Stocks</h3>
              <p className="admin-modal-subtitle">
                {restockingAddOn.name} • Current Restock:{" "}
                <b>{toNum(restockingAddOn.restocked)}</b>
              </p>

              <div className="admin-form-grid admin-form-grid--single">
                <div className="admin-form-group">
                  <label>Quantity to add *</label>
                  <input
                    className="admin-input"
                    type="number"
                    min="1"
                    step="1"
                    value={restockQty}
                    onChange={(e) => setRestockQty(e.currentTarget.value)}
                    disabled={savingRestock}
                    placeholder="e.g. 10"
                  />
                </div>

                <div className="admin-form-group">
                  <label>Note (optional)</label>
                  <textarea
                    className="admin-textarea"
                    value={restockNote}
                    onChange={(e) => setRestockNote(e.currentTarget.value)}
                    placeholder="e.g. supplier restock / new batch"
                    disabled={savingRestock}
                  />
                </div>
              </div>

              <div className="admin-modal-actions">
                <button
                  className="admin-action-btn admin-action-btn--ghost"
                  onClick={() => setRestockingAddOn(null)}
                  disabled={savingRestock}
                  type="button"
                >
                  Close
                </button>
                <button
                  className="admin-action-btn admin-action-btn--primary"
                  onClick={() => void submitRestock()}
                  disabled={savingRestock}
                  type="button"
                >
                  {savingRestock ? "Saving..." : "Confirm Restock"}
                </button>
              </div>
            </div>
          </div>
        )}

        {historyAddOn && (
          <div
            className="admin-modal-overlay"
            onClick={() => (historyLoading ? null : setHistoryAddOn(null))}
          >
            <div
              className="admin-modal-card admin-modal-card--wide"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="admin-modal-title">Adjustment History</h3>
              <p className="admin-modal-subtitle">{historyAddOn.name}</p>

              <div className="admin-history-meta">
                Current Stock: <b>{historyAddOn.stocks}</b> • Overall:{" "}
                <b>{money2(historyAddOn.overall_sales)}</b>
              </div>

              {historyLoading ? (
                <div className="admin-state-card">Loading history...</div>
              ) : historyRows.length === 0 ? (
                <div className="admin-state-card">No adjustment records.</div>
              ) : (
                <div className="admin-table-wrap admin-table-wrap--modal">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Qty</th>
                        <th>Amount</th>
                        <th>By</th>
                        <th>Reason</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyRows.map((r) => (
                        <tr key={r.id}>
                          <td>{formatPH(r.created_at)}</td>
                          <td className="is-strong">{typeLabel(r.expense_type)}</td>
                          <td className="is-strong">{toNum(r.quantity)}</td>
                          <td className="is-strong">{money2(toNum(r.expense_amount))}</td>
                          <td className="is-strong">{r.full_name}</td>
                          <td>{r.description}</td>
                          <td className="is-strong">{r.voided ? "VOIDED" : "ACTIVE"}</td>
                          <td>
                            {!r.voided ? (
                              <button
                                className="admin-action-btn admin-action-btn--danger"
                                onClick={() => confirmVoid(r)}
                                disabled={voiding}
                                type="button"
                              >
                                Void
                              </button>
                            ) : (
                              <span className="admin-helper-text">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="admin-modal-actions">
                <button
                  className="admin-action-btn admin-action-btn--ghost"
                  onClick={() => setHistoryAddOn(null)}
                  disabled={historyLoading}
                  type="button"
                >
                  Close
                </button>
                <button
                  className="admin-action-btn admin-action-btn--primary"
                  onClick={() => void refreshHistory()}
                  disabled={historyLoading}
                  type="button"
                >
                  Refresh
                </button>
              </div>
            </div>
          </div>
        )}

        {deleteTarget && (
          <div
            className="admin-modal-overlay"
            onClick={() => (deleting ? null : setDeleteTarget(null))}
          >
            <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
              <h3 className="admin-modal-title">Delete Item</h3>
              <p className="admin-modal-subtitle">
                Are you sure you want to delete <b>{deleteTarget.name}</b>?
              </p>

              <div className="admin-confirm-box">
                <div>
                  Category: <b>{deleteTarget.category}</b>
                </div>
                <div>
                  Stocks: <b>{toNum(deleteTarget.stocks)}</b> • Sold:{" "}
                  <b>{toNum(deleteTarget.sold)}</b>
                </div>
                <div>
                  Image: <b>{deleteTarget.image_url ? "will be deleted" : "none"}</b>
                </div>
              </div>

              <div className="admin-modal-actions">
                <button
                  className="admin-action-btn admin-action-btn--ghost"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="admin-action-btn admin-action-btn--danger"
                  onClick={() => void doDelete()}
                  disabled={deleting}
                  type="button"
                >
                  {deleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}

        {voidTarget && (
          <div
            className="admin-modal-overlay"
            onClick={() => (voiding ? null : setVoidTarget(null))}
          >
            <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
              <h3 className="admin-modal-title">Void Adjustment</h3>
              <p className="admin-modal-subtitle">
                Are you sure you want to void this adjustment?
              </p>

              <div className="admin-confirm-box">
                <div>
                  Date: <b>{formatPH(voidTarget.created_at)}</b>
                </div>
                <div>
                  Type: <b>{typeLabel(voidTarget.expense_type)}</b>
                </div>
                <div>
                  Qty: <b>{toNum(voidTarget.quantity)}</b>
                </div>
                <div>
                  Amount: <b>{money2(toNum(voidTarget.expense_amount))}</b>
                </div>
                <div>
                  By: <b>{voidTarget.full_name}</b>
                </div>
              </div>

              <div className="admin-modal-actions">
                <button
                  className="admin-action-btn admin-action-btn--ghost"
                  onClick={() => setVoidTarget(null)}
                  disabled={voiding}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="admin-action-btn admin-action-btn--danger"
                  onClick={() => void doVoid()}
                  disabled={voiding}
                  type="button"
                >
                  {voiding ? "Voiding..." : "Void"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Admin_Item_Lists;