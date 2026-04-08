import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../utils/supabaseClient";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import "../styles/Admin_Restock_Record.css";

type FilterMode = "day" | "week" | "month";
type SourceKind = "add_ons" | "consignment";

type AddOnJoin = {
  name: string | null;
  category: string | null;
  image_url: string | null;
};

type AddOnJoinRaw = AddOnJoin | AddOnJoin[] | null;

interface RestockRecordRow {
  id: string;
  created_at: string;
  add_on_id: string;
  qty: number;
  add_ons: AddOnJoin | null;
}

type RestockRecordRaw = {
  id: unknown;
  created_at: unknown;
  add_on_id: unknown;
  qty: unknown;
  add_ons?: unknown;
};

type ConsJoin = {
  full_name: string | null;
  category: string | null;
  item_name: string | null;
  size: string | null;
  image_url: string | null;
};

type ConsJoinRaw = ConsJoin | ConsJoin[] | null;

type ConsRestockRow = {
  id: string;
  created_at: string;
  consignment_id: string;
  qty: number;
  full_name: string;
  category: string | null;
  item_name: string;
  size: string | null;
  image_url: string | null;
};

type ConsRestockRaw = {
  id: unknown;
  created_at: unknown;
  consignment_id: unknown;
  qty: unknown;
  full_name?: unknown;
  category?: unknown;
  item_name?: unknown;
  size?: unknown;
  image_url?: unknown;
  consignment?: unknown;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

const asStringOrNull = (v: unknown): string | null =>
  typeof v === "string" ? v : null;

const asString = (v: unknown): string => (typeof v === "string" ? v : "");

const asNumber = (v: unknown): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const clampInt = (raw: string, fallback = 0): number => {
  const t = raw.trim();
  if (!t) return fallback;
  const n = Math.floor(Number(t));
  return Number.isFinite(n) ? n : fallback;
};

const normalizeAddOns = (v: unknown): AddOnJoin | null => {
  if (!v) return null;

  if (Array.isArray(v)) {
    const first = v[0];
    if (!isRecord(first)) return null;
    return {
      name: asStringOrNull(first.name),
      category: asStringOrNull(first.category),
      image_url: asStringOrNull(first.image_url),
    };
  }

  if (isRecord(v)) {
    return {
      name: asStringOrNull(v.name),
      category: asStringOrNull(v.category),
      image_url: asStringOrNull(v.image_url),
    };
  }

  return null;
};

const normalizeAddOnRow = (raw: unknown): RestockRecordRow | null => {
  if (!isRecord(raw)) return null;
  const r = raw as RestockRecordRaw;

  const id = asString(r.id);
  const created_at = asString(r.created_at);
  const add_on_id = asString(r.add_on_id);
  if (!id || !created_at || !add_on_id) return null;

  return {
    id,
    created_at,
    add_on_id,
    qty: asNumber(r.qty),
    add_ons: normalizeAddOns(r.add_ons as AddOnJoinRaw),
  };
};

const normalizeConsJoin = (v: unknown): ConsJoin | null => {
  if (!v) return null;

  if (Array.isArray(v)) {
    const first = v[0];
    if (!isRecord(first)) return null;
    return {
      full_name: asStringOrNull(first.full_name),
      category: asStringOrNull(first.category),
      item_name: asStringOrNull(first.item_name),
      size: asStringOrNull(first.size),
      image_url: asStringOrNull(first.image_url),
    };
  }

  if (isRecord(v)) {
    return {
      full_name: asStringOrNull(v.full_name),
      category: asStringOrNull(v.category),
      item_name: asStringOrNull(v.item_name),
      size: asStringOrNull(v.size),
      image_url: asStringOrNull(v.image_url),
    };
  }

  return null;
};

const normalizeConsRow = (raw: unknown): ConsRestockRow | null => {
  if (!isRecord(raw)) return null;
  const r = raw as ConsRestockRaw;

  const id = asString(r.id);
  const created_at = asString(r.created_at);
  const consignment_id = asString(r.consignment_id);
  if (!id || !created_at || !consignment_id) return null;

  const join = normalizeConsJoin(r.consignment as ConsJoinRaw);

  const full_name = (join?.full_name ?? asString(r.full_name)).trim();
  const item_name = (join?.item_name ?? asString(r.item_name)).trim();

  if (!full_name || !item_name) return null;

  return {
    id,
    created_at,
    consignment_id,
    qty: asNumber(r.qty),
    full_name,
    category: join?.category ?? asStringOrNull(r.category),
    item_name,
    size: join?.size ?? asStringOrNull(r.size),
    image_url: join?.image_url ?? asStringOrNull(r.image_url),
  };
};

const pad2 = (n: number): string => String(n).padStart(2, "0");

const ymd = (d: Date): string =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const todayKey = (): string => ymd(new Date());

const monthKeyNow = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
};

const dateKeyFromISO = (iso: string): string => iso.split("T")[0] || "";

const monthKeyFromISO = (iso: string): string => {
  const d = dateKeyFromISO(iso);
  return d.slice(0, 7);
};

const formatDateTime = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const startOfWeekISO = (ymdStr: string): string => {
  const [yy, mm, dd] = ymdStr.split("-").map(Number);
  if (!yy || !mm || !dd) return ymdStr;

  const d = new Date(yy, mm - 1, dd);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return ymd(d);
};

const addDaysISO = (ymdStr: string, days: number): string => {
  const [yy, mm, dd] = ymdStr.split("-").map(Number);
  if (!yy || !mm || !dd) return ymdStr;
  const d = new Date(yy, mm - 1, dd);
  d.setDate(d.getDate() + days);
  return ymd(d);
};

const inInclusiveRange = (
  targetISODate: string,
  startISO: string,
  endISO: string
): boolean => targetISODate >= startISO && targetISODate <= endISO;

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result;
      if (typeof res !== "string") {
        reject(new Error("Failed to convert image"));
        return;
      }
      resolve(res.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(new Error("FileReader error"));
    reader.readAsDataURL(blob);
  });

const fetchImageBase64 = async (
  url: string
): Promise<{ base64: string; ext: "png" | "jpeg" }> => {
  const r = await fetch(url);
  if (!r.ok) throw new Error("Image fetch failed");

  const ct = (r.headers.get("content-type") ?? "").toLowerCase();
  const blob = await r.blob();
  const base64 = await blobToBase64(blob);
  const isPng = ct.includes("png") || url.toLowerCase().includes(".png");

  return { base64, ext: isPng ? "png" : "jpeg" };
};

const Admin_Restock_Record: React.FC = () => {
  const [source, setSource] = useState<SourceKind>("add_ons");

  const [recordsAddOn, setRecordsAddOn] = useState<RestockRecordRow[]>([]);
  const [recordsCons, setRecordsCons] = useState<ConsRestockRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [toastOpen, setToastOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  const [search, setSearch] = useState<string>("");

  const [filterMode, setFilterMode] = useState<FilterMode>("day");
  const [selectedDate, setSelectedDate] = useState<string>(todayKey());
  const [selectedWeek, setSelectedWeek] = useState<string>(todayKey());
  const [selectedMonth, setSelectedMonth] = useState<string>(monthKeyNow());

  const [dateModalOpen, setDateModalOpen] = useState<boolean>(false);
  const [showDeleteFilterAlert, setShowDeleteFilterAlert] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editQty, setEditQty] = useState<string>("0");

  const [editingAddOn, setEditingAddOn] = useState<RestockRecordRow | null>(null);
  const [editingCons, setEditingCons] = useState<ConsRestockRow | null>(null);

  const [voidAddOn, setVoidAddOn] = useState<RestockRecordRow | null>(null);
  const [voidCons, setVoidCons] = useState<ConsRestockRow | null>(null);

  const notify = (msg: string): void => {
    setToastMsg(msg);
    setToastOpen(true);
  };

  useEffect(() => {
    if (!toastOpen) return;
    const t = window.setTimeout(() => setToastOpen(false), 2500);
    return () => window.clearTimeout(t);
  }, [toastOpen]);

  const fetchAddOnRecords = async (): Promise<void> => {
    const { data, error } = await supabase
      .from("add_on_restocks")
      .select("id, created_at, add_on_id, qty, add_ons(name, category, image_url)")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const rawList: unknown[] = Array.isArray(data) ? (data as unknown[]) : [];
    const normalized = rawList
      .map((x) => normalizeAddOnRow(x))
      .filter((x): x is RestockRecordRow => x !== null);

    setRecordsAddOn(normalized);
  };

  const fetchConsRecords = async (): Promise<void> => {
    const joined = await supabase
      .from("consignment_restocks")
      .select(`
        id,
        created_at,
        consignment_id,
        qty,
        consignment:consignment_id (
          full_name,
          category,
          item_name,
          size,
          image_url
        )
      `)
      .order("created_at", { ascending: false });

    if (!joined.error) {
      const rawList: unknown[] = Array.isArray(joined.data)
        ? (joined.data as unknown[])
        : [];
      const normalized = rawList
        .map((x) => normalizeConsRow(x))
        .filter((x): x is ConsRestockRow => x !== null);
      setRecordsCons(normalized);
      return;
    }

    const flat = await supabase
      .from("consignment_restocks")
      .select(
        "id, created_at, consignment_id, qty, full_name, category, item_name, size, image_url"
      )
      .order("created_at", { ascending: false });

    if (flat.error) throw flat.error;

    const rawList: unknown[] = Array.isArray(flat.data)
      ? (flat.data as unknown[])
      : [];
    const normalized = rawList
      .map((x) => normalizeConsRow(x))
      .filter((x): x is ConsRestockRow => x !== null);

    setRecordsCons(normalized);
  };

  const fetchRecords = async (): Promise<void> => {
    setLoading(true);
    try {
      if (source === "add_ons") await fetchAddOnRecords();
      else await fetchConsRecords();
    } catch (err) {
      console.error("Error fetching records:", err);
      notify("Failed to load restock records.");
      if (source === "add_ons") setRecordsAddOn([]);
      else setRecordsCons([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRecords();
  }, [source]);

  const activeDateLabel = useMemo(() => {
    if (filterMode === "day") return selectedDate;
    if (filterMode === "week") {
      const start = startOfWeekISO(selectedWeek);
      const end = addDaysISO(start, 6);
      return `${start} to ${end}`;
    }
    return selectedMonth;
  }, [filterMode, selectedDate, selectedWeek, selectedMonth]);

  const rowMatchesFilter = (createdAtISO: string): boolean => {
    const d = dateKeyFromISO(createdAtISO);

    if (filterMode === "day") {
      return d === selectedDate;
    }

    if (filterMode === "week") {
      const start = startOfWeekISO(selectedWeek);
      const end = addDaysISO(start, 6);
      return inInclusiveRange(d, start, end);
    }

    return monthKeyFromISO(createdAtISO) === selectedMonth;
  };

  const filteredAddOn = useMemo(() => {
    const q = search.trim().toLowerCase();

    return recordsAddOn.filter((r) => {
      if (!rowMatchesFilter(r.created_at)) return false;
      if (!q) return true;

      const name = (r.add_ons?.name ?? "").toLowerCase();
      const category = (r.add_ons?.category ?? "").toLowerCase();
      return name.includes(q) || category.includes(q);
    });
  }, [recordsAddOn, search, filterMode, selectedDate, selectedWeek, selectedMonth]);

  const filteredCons = useMemo(() => {
    const q = search.trim().toLowerCase();

    return recordsCons.filter((r) => {
      if (!rowMatchesFilter(r.created_at)) return false;
      if (!q) return true;

      const item = (r.item_name ?? "").toLowerCase();
      const cat = (r.category ?? "").toLowerCase();
      const owner = (r.full_name ?? "").toLowerCase();
      return item.includes(q) || cat.includes(q) || owner.includes(q);
    });
  }, [recordsCons, search, filterMode, selectedDate, selectedWeek, selectedMonth]);

  const activeRowsCount =
    source === "add_ons" ? filteredAddOn.length : filteredCons.length;

  const totalQty = useMemo(() => {
    if (source === "add_ons") {
      return filteredAddOn.reduce((sum, r) => sum + (Number.isFinite(r.qty) ? r.qty : 0), 0);
    }
    return filteredCons.reduce((sum, r) => sum + (Number.isFinite(r.qty) ? r.qty : 0), 0);
  }, [source, filteredAddOn, filteredCons]);

  const clearFilterValue = (): void => {
    if (filterMode === "day") setSelectedDate(todayKey());
    else if (filterMode === "week") setSelectedWeek(todayKey());
    else setSelectedMonth(monthKeyNow());
  };

  const adjustRestockedAddOns = async (
    addOnId: string,
    delta: number
  ): Promise<void> => {
    if (!Number.isFinite(delta) || delta === 0) return;

    const { data: currentRow, error: readErr } = await supabase
      .from("add_ons")
      .select("restocked")
      .eq("id", addOnId)
      .single();

    if (readErr) throw readErr;

    const currentRestocked = asNumber(
      (currentRow as Record<string, unknown>)["restocked"]
    );
    const next = Math.max(0, currentRestocked + delta);

    const { error: upErr } = await supabase
      .from("add_ons")
      .update({ restocked: next })
      .eq("id", addOnId);

    if (upErr) throw upErr;
  };

  const adjustRestockedConsignment = async (
    consignmentId: string,
    delta: number
  ): Promise<void> => {
    if (!Number.isFinite(delta) || delta === 0) return;

    const { data: currentRow, error: readErr } = await supabase
      .from("consignment")
      .select("restocked")
      .eq("id", consignmentId)
      .single();

    if (readErr) throw readErr;

    const currentRestocked = asNumber(
      (currentRow as Record<string, unknown>)["restocked"]
    );
    const next = Math.max(0, currentRestocked + delta);

    const { error: upErr } = await supabase
      .from("consignment")
      .update({ restocked: next })
      .eq("id", consignmentId);

    if (upErr) throw upErr;
  };

  const doVoidAddOnRow = async (row: RestockRecordRow): Promise<void> => {
    try {
      await adjustRestockedAddOns(row.add_on_id, -row.qty);

      const { error: delErr } = await supabase
        .from("add_on_restocks")
        .delete()
        .eq("id", row.id);

      if (delErr) throw delErr;

      setRecordsAddOn((prev) => prev.filter((x) => x.id !== row.id));
      notify("Voided. Restock and stocks reverted.");
    } catch (e) {
      console.error(e);
      notify("Failed to void record.");
    }
  };

  const doVoidConsRow = async (row: ConsRestockRow): Promise<void> => {
    try {
      await adjustRestockedConsignment(row.consignment_id, -row.qty);

      const { error: delErr } = await supabase
        .from("consignment_restocks")
        .delete()
        .eq("id", row.id);

      if (delErr) throw delErr;

      setRecordsCons((prev) => prev.filter((x) => x.id !== row.id));
      notify("Voided. Consignment restock reverted.");
    } catch (e) {
      console.error(e);
      notify("Failed to void consignment record.");
    }
  };

  const openEditAddOn = (row: RestockRecordRow): void => {
    setEditingAddOn(row);
    setEditingCons(null);
    setEditQty(String(row.qty));
    setEditOpen(true);
  };

  const openEditCons = (row: ConsRestockRow): void => {
    setEditingCons(row);
    setEditingAddOn(null);
    setEditQty(String(row.qty));
    setEditOpen(true);
  };

  const closeEdit = (): void => {
    setEditOpen(false);
    setEditingAddOn(null);
    setEditingCons(null);
  };

  const saveEditQty = async (): Promise<void> => {
    const newQty = clampInt(editQty, 0);

    if (newQty <= 0) {
      notify("Restock must be at least 1.");
      return;
    }

    try {
      if (editingAddOn) {
        const delta = newQty - editingAddOn.qty;

        await adjustRestockedAddOns(editingAddOn.add_on_id, delta);

        const { data: upData, error: upErr } = await supabase
          .from("add_on_restocks")
          .update({ qty: newQty })
          .eq("id", editingAddOn.id)
          .select("id")
          .maybeSingle();

        if (upErr) throw upErr;
        if (!upData) {
          notify("Update blocked (check RLS policy).");
          return;
        }

        setRecordsAddOn((prev) =>
          prev.map((x) => (x.id === editingAddOn.id ? { ...x, qty: newQty } : x))
        );

        notify("Restock edited.");
      }

      if (editingCons) {
        const delta = newQty - editingCons.qty;

        await adjustRestockedConsignment(editingCons.consignment_id, delta);

        const { data: upData, error: upErr } = await supabase
          .from("consignment_restocks")
          .update({ qty: newQty })
          .eq("id", editingCons.id)
          .select("id")
          .maybeSingle();

        if (upErr) throw upErr;
        if (!upData) {
          notify("Update blocked (check RLS policy).");
          return;
        }

        setRecordsCons((prev) =>
          prev.map((x) => (x.id === editingCons.id ? { ...x, qty: newQty } : x))
        );

        notify("Consignment restock edited.");
      }

      closeEdit();
      void fetchRecords();
    } catch (e) {
      console.error(e);
      notify("Failed to edit restock.");
    }
  };

  const deleteByFilter = async (): Promise<void> => {
    try {
      if (source === "add_ons") {
        if (filteredAddOn.length === 0) {
          notify("No records to delete for the selected filter.");
          setShowDeleteFilterAlert(false);
          return;
        }

        for (const r of filteredAddOn) {
          await adjustRestockedAddOns(r.add_on_id, -r.qty);
        }

        const ids = filteredAddOn.map((r) => r.id);
        const { error: delErr } = await supabase
          .from("add_on_restocks")
          .delete()
          .in("id", ids);

        if (delErr) throw delErr;

        setRecordsAddOn((prev) => prev.filter((x) => !ids.includes(x.id)));
        notify(`Deleted add-ons records by ${filterMode.toUpperCase()}.`);
      } else {
        if (filteredCons.length === 0) {
          notify("No records to delete for the selected filter.");
          setShowDeleteFilterAlert(false);
          return;
        }

        for (const r of filteredCons) {
          await adjustRestockedConsignment(r.consignment_id, -r.qty);
        }

        const ids = filteredCons.map((r) => r.id);
        const { error: delErr } = await supabase
          .from("consignment_restocks")
          .delete()
          .in("id", ids);

        if (delErr) throw delErr;

        setRecordsCons((prev) => prev.filter((x) => !ids.includes(x.id)));
        notify(`Deleted consignment records by ${filterMode.toUpperCase()}.`);
      }
    } catch (e) {
      console.error(e);
      notify("Failed to delete by filter.");
    } finally {
      setShowDeleteFilterAlert(false);
    }
  };

  const exportExcel = async (): Promise<void> => {
    try {
      const now = new Date();
      const modeLabel = filterMode.toUpperCase();

      let filterLabel = "";
      if (filterMode === "day") {
        filterLabel = selectedDate;
      } else if (filterMode === "week") {
        const start = startOfWeekISO(selectedWeek);
        const end = addDaysISO(start, 6);
        filterLabel = `${start}_to_${end}`;
      } else {
        filterLabel = selectedMonth;
      }

      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet("Restocks", {
        views: [{ state: "frozen", ySplit: 6 }],
      });

      const title =
        source === "add_ons"
          ? "ADD-ONS RESTOCK RECORDS REPORT"
          : "CONSIGNMENT RESTOCK RECORDS REPORT";

      ws.columns =
        source === "add_ons"
          ? [
              { header: "Image", key: "image", width: 14 },
              { header: "Item Name", key: "name", width: 34 },
              { header: "Category", key: "category", width: 18 },
              { header: "Restock Qty", key: "qty", width: 14 },
              { header: "Restock Date", key: "date", width: 18 },
              { header: "Restock Time", key: "time", width: 14 },
            ]
          : [
              { header: "Image", key: "image", width: 14 },
              { header: "Item Name", key: "name", width: 34 },
              { header: "Owner", key: "owner", width: 22 },
              { header: "Category", key: "category", width: 18 },
              { header: "Restock Qty", key: "qty", width: 14 },
              { header: "Restock Date", key: "date", width: 18 },
              { header: "Restock Time", key: "time", width: 14 },
            ];

      const colCount = ws.columns.length;

      ws.mergeCells(1, 1, 1, colCount);
      ws.mergeCells(2, 1, 2, colCount);
      ws.mergeCells(3, 1, 3, colCount);
      ws.mergeCells(4, 1, 4, colCount);

      ws.getCell("A1").value = title;
      ws.getCell("A2").value = `Generated: ${now.toLocaleString()}`;
      ws.getCell("A3").value = `Source: ${source.toUpperCase()}   Mode: ${modeLabel}   Filter: ${filterLabel.replaceAll("_", " ")}   Search: ${
        search.trim() ? search.trim() : "—"
      }`;
      ws.getCell("A4").value = `Total Rows: ${activeRowsCount}   Total Restock Qty: ${totalQty}`;

      ws.getCell("A1").font = { bold: true, size: 16 };
      ws.getCell("A4").font = { bold: true };

      ws.addRow([]);

      const headerRow = ws.getRow(6);
      const headers = ws.columns.map((c) => String(c.header ?? ""));
      headerRow.values = ["", ...headers];
      headerRow.font = { bold: true };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };

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

      let rowIndex = 7;

      if (source === "add_ons") {
        for (const r of filteredAddOn) {
          const row = ws.getRow(rowIndex);

          const d = new Date(r.created_at);
          const datePart = isNaN(d.getTime()) ? dateKeyFromISO(r.created_at) : ymd(d);
          const timePart = isNaN(d.getTime())
            ? ""
            : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

          row.getCell(2).value = r.add_ons?.name ?? "Unknown";
          row.getCell(3).value = r.add_ons?.category ?? "—";
          row.getCell(4).value = Number(r.qty ?? 0);
          row.getCell(5).value = datePart;
          row.getCell(6).value = timePart;
          row.height = 52;

          for (let c = 1; c <= 6; c++) {
            const cell = row.getCell(c);
            cell.alignment =
              c === 2
                ? { vertical: "middle", horizontal: "left", wrapText: true }
                : { vertical: "middle", horizontal: "center" };
            cell.border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };
          }

          const imgUrl = r.add_ons?.image_url ?? null;
          if (imgUrl) {
            try {
              const { base64, ext } = await fetchImageBase64(imgUrl);
              const imgId = workbook.addImage({ base64, extension: ext });
              ws.addImage(imgId, {
                tl: { col: 0.15, row: rowIndex - 1 + 0.15 },
                ext: { width: 48, height: 48 },
              });
            } catch {}
          }

          row.commit();
          rowIndex++;
        }
      } else {
        for (const r of filteredCons) {
          const row = ws.getRow(rowIndex);

          const d = new Date(r.created_at);
          const datePart = isNaN(d.getTime()) ? dateKeyFromISO(r.created_at) : ymd(d);
          const timePart = isNaN(d.getTime())
            ? ""
            : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

          row.getCell(2).value = r.item_name ?? "Unknown";
          row.getCell(3).value = r.full_name ?? "—";
          row.getCell(4).value = r.category ?? "—";
          row.getCell(5).value = Number(r.qty ?? 0);
          row.getCell(6).value = datePart;
          row.getCell(7).value = timePart;
          row.height = 52;

          for (let c = 1; c <= 7; c++) {
            const cell = row.getCell(c);
            cell.alignment =
              c === 2 || c === 3
                ? { vertical: "middle", horizontal: "left", wrapText: true }
                : { vertical: "middle", horizontal: "center" };
            cell.border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };
          }

          const imgUrl = r.image_url ?? null;
          if (imgUrl) {
            try {
              const { base64, ext } = await fetchImageBase64(imgUrl);
              const imgId = workbook.addImage({ base64, extension: ext });
              ws.addImage(imgId, {
                tl: { col: 0.15, row: rowIndex - 1 + 0.15 },
                ext: { width: 48, height: 48 },
              });
            } catch {}
          }

          row.commit();
          rowIndex++;
        }
      }

      const buf = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      saveAs(blob, `restock_records_${source}_${modeLabel}_${filterLabel}.xlsx`);
      notify("Exported Excel successfully.");
    } catch (e) {
      console.error(e);
      notify("Export failed.");
    }
  };

  const sourceLabel =
    source === "add_ons" ? "Add-ons Restock" : "Consignment Restock";

  const editTitle = editingAddOn
    ? "EDIT RESTOCK"
    : editingCons
    ? "EDIT CONSIGNMENT RESTOCK"
    : "EDIT RESTOCK";

  const deleteAlertMessage = useMemo(() => {
    const src = source === "add_ons" ? "ADD-ONS" : "CONSIGNMENT";

    if (filterMode === "day") {
      return `This will DELETE all ${src} restock records for ${selectedDate} and REVERT restock. Continue?`;
    }

    if (filterMode === "week") {
      const start = startOfWeekISO(selectedWeek);
      const end = addDaysISO(start, 6);
      return `This will DELETE all ${src} restock records for WEEK ${start} to ${end} and REVERT restock. Continue?`;
    }

    return `This will DELETE all ${src} restock records for ${selectedMonth} and REVERT restock. Continue?`;
  }, [filterMode, selectedDate, selectedWeek, selectedMonth, source]);

  return (
    <div className="admin-restock-page">
      <div className="restock-shell">
        <div className="restock-hero">
          <div className="restock-badge">✦ RESTOCK RECORDS</div>
          <h1 className="admin-restock-main-title">Admin Restock Record</h1>
          <p className="restock-hero-subtitle">
            Track daily restocks, edit quantities, remove wrong entries, and export polished reports.
          </p>
        </div>

        <div className="restock-panel">
          <div className="restock-panel-header">
            <div className="restock-panel-title-wrap">
              <h2 className="restock-panel-title">Admin Restock Record</h2>
              <div className="restock-panel-subtitle">
                Source: <strong>{sourceLabel}</strong> • Showing records for:{" "}
                <strong>{activeDateLabel}</strong>{" "}
                <span className="restock-inline-stats">
                  (Total: <strong>{activeRowsCount}</strong> | Qty:{" "}
                  <strong>{totalQty}</strong>)
                </span>
              </div>
            </div>

            <div className="restock-toolbar">
              <div className="restock-search-box">
                <span className="restock-search-icon">🔎</span>
                <input
                  className="restock-search-input"
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(String(e.currentTarget.value ?? ""))}
                  placeholder={
                    source === "add_ons"
                      ? "Search item or category..."
                      : "Search item / owner / category..."
                  }
                />
                {search.trim() && (
                  <button
                    className="restock-clear-btn"
                    onClick={() => setSearch("")}
                    type="button"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="restock-select-card">
                <span className="restock-control-label">Source</span>
                <select
                  className="restock-select"
                  value={source}
                  onChange={(e) => setSource(e.currentTarget.value as SourceKind)}
                >
                  <option value="add_ons">Add-ons Restock</option>
                  <option value="consignment">Consignment Restock</option>
                </select>
              </div>

              <div className="restock-select-card">
                <span className="restock-control-label">Mode</span>
                <select
                  className="restock-select"
                  value={filterMode}
                  onChange={(e) => setFilterMode(e.currentTarget.value as FilterMode)}
                >
                  <option value="day">Day</option>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                </select>
              </div>

              <button className="restock-btn restock-btn-dark" onClick={() => void exportExcel()}>
                ⬇ Export Excel
              </button>
            </div>

            <div className="restock-toolbar restock-toolbar-lower">
              <div className="restock-date-card">
                <span className="restock-control-label">
                  {filterMode === "day"
                    ? "Date"
                    : filterMode === "week"
                    ? "Week"
                    : "Month"}
                </span>

                <button
                  type="button"
                  className="restock-date-display"
                  onClick={() => setDateModalOpen(true)}
                >
                  {activeDateLabel}
                </button>

                <button
                  type="button"
                  className="restock-mini-icon-btn"
                  onClick={() => setDateModalOpen(true)}
                  title="Open calendar"
                >
                  📅
                </button>

                <button
                  type="button"
                  className="restock-mini-icon-btn"
                  onClick={clearFilterValue}
                  title="Reset filter"
                >
                  ✕
                </button>
              </div>

              <button className="restock-btn restock-btn-dark" onClick={() => void fetchRecords()}>
                ⟳ Refresh
              </button>

              <button
                className="restock-btn restock-btn-danger"
                onClick={() => setShowDeleteFilterAlert(true)}
              >
                🗑 Delete By{" "}
                {filterMode === "day" ? "Date" : filterMode === "week" ? "Week" : "Month"}
              </button>
            </div>
          </div>
        </div>

        <div className="restock-table-card">
          {loading ? (
            <div className="restock-loading">
              <div className="simple-spinner" />
              <span>Loading records…</span>
            </div>
          ) : activeRowsCount === 0 ? (
            <div className="restock-empty">No restock records found.</div>
          ) : (
            <div className="restock-table-wrap" key={`${source}-${activeDateLabel}`}>
              <table className="restock-table">
                <thead>
                  <tr>
                    <th>Image</th>
                    <th>Item Name</th>
                    {source === "consignment" ? <th>Owner</th> : null}
                    <th>Category</th>
                    <th>Restock</th>
                    <th>Restock Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {source === "add_ons"
                    ? filteredAddOn.map((r) => (
                        <tr key={r.id} className="restock-row">
                          <td>
                            {r.add_ons?.image_url ? (
                              <img
                                className="restock-img"
                                src={r.add_ons.image_url}
                                alt={r.add_ons?.name ?? "item"}
                              />
                            ) : (
                              <div className="restock-imgFallback">No Image</div>
                            )}
                          </td>

                          <td>
                            <div className="restock-name-cell">
                              <span className="restock-name-main">
                                {r.add_ons?.name ?? "Unknown Item"}
                              </span>
                            </div>
                          </td>

                          <td>{r.add_ons?.category ?? "—"}</td>

                          <td>
                            <span className="restock-pill">{r.qty}</span>
                          </td>

                          <td>{formatDateTime(r.created_at)}</td>

                          <td>
                            <div className="restock-action-row">
                              <button className="restock-action-btn" onClick={() => openEditAddOn(r)}>
                                ✎ Edit
                              </button>
                              <button
                                className="restock-action-btn danger"
                                onClick={() => setVoidAddOn(r)}
                              >
                                ⛔ Void
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    : filteredCons.map((r) => (
                        <tr key={r.id} className="restock-row">
                          <td>
                            {r.image_url ? (
                              <img className="restock-img" src={r.image_url} alt={r.item_name ?? "item"} />
                            ) : (
                              <div className="restock-imgFallback">No Image</div>
                            )}
                          </td>

                          <td>
                            <div className="restock-name-cell">
                              <span className="restock-name-main">
                                {r.item_name ?? "Unknown Item"}
                              </span>
                              {r.size ? <span className="restock-name-sub">{r.size}</span> : null}
                            </div>
                          </td>

                          <td>{r.full_name}</td>
                          <td>{r.category ?? "—"}</td>

                          <td>
                            <span className="restock-pill">{r.qty}</span>
                          </td>

                          <td>{formatDateTime(r.created_at)}</td>

                          <td>
                            <div className="restock-action-row">
                              <button className="restock-action-btn" onClick={() => openEditCons(r)}>
                                ✎ Edit
                              </button>
                              <button
                                className="restock-action-btn danger"
                                onClick={() => setVoidCons(r)}
                              >
                                ⛔ Void
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {dateModalOpen && (
        <div className="restock-modal-overlay" onClick={() => setDateModalOpen(false)}>
          <div
            className="restock-calendar-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="restock-modal-header">
              <div>
                <h3 className="restock-modal-title">
                  {filterMode === "day"
                    ? "Select Date"
                    : filterMode === "week"
                    ? "Select Week"
                    : "Select Month"}
                </h3>
                <p className="restock-modal-subtitle">
                  {filterMode === "day"
                    ? "Choose a specific restock date."
                    : filterMode === "week"
                    ? "Pick any date inside the week you want."
                    : "Choose a month to filter records."}
                </p>
              </div>

              <button
                className="restock-modal-close"
                onClick={() => setDateModalOpen(false)}
                type="button"
              >
                ✕
              </button>
            </div>

            <div className="restock-calendar-body">
              {filterMode === "day" && (
                <input
                  type="date"
                  className="restock-picker"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              )}

              {filterMode === "week" && (
                <input
                  type="date"
                  className="restock-picker"
                  value={selectedWeek}
                  onChange={(e) => setSelectedWeek(e.target.value)}
                />
              )}

              {filterMode === "month" && (
                <input
                  type="month"
                  className="restock-picker"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                />
              )}

              <div className="restock-selected-preview">
                Selected: <strong>{activeDateLabel}</strong>
              </div>
            </div>

            <div className="restock-modal-actions">
              <button className="restock-btn restock-btn-light" onClick={clearFilterValue}>
                Reset
              </button>
              <button
                className="restock-btn restock-btn-dark"
                onClick={() => setDateModalOpen(false)}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteFilterAlert && (
        <div className="restock-modal-overlay" onClick={() => setShowDeleteFilterAlert(false)}>
          <div className="restock-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="restock-modal-title">
              Delete by {filterMode === "day" ? "Date" : filterMode === "week" ? "Week" : "Month"}?
            </h3>
            <p className="restock-modal-subtitle restock-confirm-text">
              {deleteAlertMessage}
            </p>

            <div className="restock-modal-actions">
              <button
                className="restock-btn restock-btn-light"
                onClick={() => setShowDeleteFilterAlert(false)}
              >
                Cancel
              </button>
              <button className="restock-btn restock-btn-danger" onClick={() => void deleteByFilter()}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {!!voidAddOn && (
        <div className="restock-modal-overlay" onClick={() => setVoidAddOn(null)}>
          <div className="restock-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="restock-modal-title">Void this restock?</h3>
            <p className="restock-modal-subtitle restock-confirm-text">
              This will revert restock/stocks and delete the record.
            </p>

            <div className="restock-modal-actions">
              <button className="restock-btn restock-btn-light" onClick={() => setVoidAddOn(null)}>
                Cancel
              </button>
              <button
                className="restock-btn restock-btn-danger"
                onClick={() => {
                  if (voidAddOn) void doVoidAddOnRow(voidAddOn);
                  setVoidAddOn(null);
                }}
              >
                Void
              </button>
            </div>
          </div>
        </div>
      )}

      {!!voidCons && (
        <div className="restock-modal-overlay" onClick={() => setVoidCons(null)}>
          <div className="restock-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="restock-modal-title">Void this consignment restock?</h3>
            <p className="restock-modal-subtitle restock-confirm-text">
              This will revert consignment restock and delete the record.
            </p>

            <div className="restock-modal-actions">
              <button className="restock-btn restock-btn-light" onClick={() => setVoidCons(null)}>
                Cancel
              </button>
              <button
                className="restock-btn restock-btn-danger"
                onClick={() => {
                  if (voidCons) void doVoidConsRow(voidCons);
                  setVoidCons(null);
                }}
              >
                Void
              </button>
            </div>
          </div>
        </div>
      )}

      {editOpen && (
        <div className="restock-modal-overlay" onClick={closeEdit}>
          <div className="restock-edit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="restock-modal-header">
              <div>
                <h3 className="restock-modal-title">{editTitle}</h3>
                <p className="restock-modal-subtitle">
                  {editingAddOn ? (
                    <>
                      {editingAddOn.add_ons?.name ?? "Unknown Item"} • Category:{" "}
                      {editingAddOn.add_ons?.category ?? "—"}
                    </>
                  ) : editingCons ? (
                    <>
                      {editingCons.item_name ?? "Unknown Item"} • Owner:{" "}
                      {editingCons.full_name ?? "—"}
                    </>
                  ) : (
                    "-"
                  )}
                </p>
              </div>

              <button className="restock-modal-close" onClick={closeEdit} type="button">
                ✕
              </button>
            </div>

            {editingAddOn && (
              <div className="restock-edit-info">
                <div>
                  Current Restock: <strong>{editingAddOn.qty}</strong>
                </div>
                <div>
                  Date: <strong>{formatDateTime(editingAddOn.created_at)}</strong>
                </div>
              </div>
            )}

            {editingCons && (
              <div className="restock-edit-info">
                <div>
                  Current Restock: <strong>{editingCons.qty}</strong>
                </div>
                <div>
                  Category: <strong>{editingCons.category ?? "—"}</strong>
                </div>
                <div>
                  Date: <strong>{formatDateTime(editingCons.created_at)}</strong>
                </div>
              </div>
            )}

            <div className="restock-edit-row">
              <span>New Restock (Exact)</span>
              <input
                className="restock-edit-input"
                type="number"
                min="1"
                step="1"
                value={editQty}
                onChange={(e) => setEditQty(e.currentTarget.value)}
                placeholder="0"
              />
            </div>

            <div className="restock-edit-note">
              Note: Delta lang ang ia-adjust based sa difference ng old at new quantity.
            </div>

            <div className="restock-modal-actions">
              <button className="restock-btn restock-btn-light" onClick={closeEdit}>
                Close
              </button>
              <button className="restock-btn restock-btn-dark" onClick={() => void saveEditQty()}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {toastOpen && (
        <div className="restock-toast">
          <span>{toastMsg}</span>
          <button type="button" onClick={() => setToastOpen(false)}>
            ✕
          </button>
        </div>
      )}
    </div>
  );
};

export default Admin_Restock_Record;