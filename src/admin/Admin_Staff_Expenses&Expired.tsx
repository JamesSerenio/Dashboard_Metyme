import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../utils/supabaseClient";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import "../styles/Admin_Staff_Expenses&Expired.css";

type SectionKind = "damage_expired" | "inventory_loss" | "cash_outs" | "bilin";
type FilterMode = "day" | "week" | "month";
type ExpenseType = "expired" | "inventory_loss" | "bilin";

type ExpenseRow = {
  id: string;
  created_at: string;
  add_on_id: string;
  full_name: string;
  category: string;
  product_name: string;
  quantity: number;
  expense_type: ExpenseType;
  expense_amount: number;
  description: string;
  voided: boolean;
  voided_at: string | null;
};

type ExpenseRowDB = {
  id: string;
  created_at: string;
  add_on_id: string;
  full_name: string | null;
  category: string | null;
  product_name: string | null;
  quantity: number | string | null;
  expense_type: string | null;
  expense_amount: number | string | null;
  description: string | null;
  voided: boolean | null;
  voided_at: string | null;
};

type CashOutRow = {
  id: string;
  created_at: string;
  created_by: string;
  cashout_date: string;
  cashout_time: string;
  type: string;
  description: string;
  amount: number;
};

type CashOutRowDB = {
  id: string;
  created_at: string;
  created_by: string;
  cashout_date: string | null;
  cashout_time: string | null;
  type: string | null;
  description: string | null;
  amount: number | string | null;
};

type BilinSummaryRow = {
  key: string;
  display_name: string;
  total_qty: number;
  total_amount: number;
  tx_count: number;
};

const pad2 = (n: number): string => String(n).padStart(2, "0");

const yyyyMmDdLocal = (d: Date): string => {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
};

const yyyyMmLocal = (d: Date): string =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

const startOfLocalDay = (d: Date): Date => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const addDays = (d: Date, days: number): Date =>
  new Date(d.getTime() + days * 24 * 60 * 60 * 1000);

const getWeekRangeMonSun = (
  anchorYmd: string
): { start: Date; endExclusive: Date } => {
  const base = new Date(`${anchorYmd}T00:00:00`);
  const day = base.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const start = startOfLocalDay(addDays(base, diffToMon));
  const endExclusive = addDays(start, 7);
  return { start, endExclusive };
};

const getMonthRange = (
  anchorYmd: string
): { start: Date; endExclusive: Date } => {
  const base = new Date(`${anchorYmd}T00:00:00`);
  const y = base.getFullYear();
  const m = base.getMonth();
  const start = new Date(y, m, 1, 0, 0, 0, 0);
  const endExclusive = new Date(y, m + 1, 1, 0, 0, 0, 0);
  return { start, endExclusive };
};

const inRange = (d: Date, start: Date, endExclusive: Date): boolean => {
  const t = d.getTime();
  return t >= start.getTime() && t < endExclusive.getTime();
};

const formatDateTime = (iso: string): string => {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString();
};

const typeLabel = (t: ExpenseType): string => {
  if (t === "expired") return "Expired / Damaged";
  if (t === "inventory_loss") return "Inventory Loss";
  return "Bilin (Utang)";
};

const toQty = (v: number | string | null): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const toMoney = (v: number | string | null): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const toExpenseType = (v: string | null): ExpenseType | null => {
  const x = String(v ?? "").trim().toLowerCase();
  if (x === "expired") return "expired";
  if (x === "inventory_loss") return "inventory_loss";
  if (x === "bilin") return "bilin";
  if (x === "staff_consumed" || x === "staff_consume") return "inventory_loss";
  return null;
};

const peso = (n: number): string =>
  `₱${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const normNameKey = (name: string): string =>
  String(name ?? "").trim().toLowerCase();

const prettyName = (name: string): string =>
  String(name ?? "").trim() || "—";

const cashOutDateTimeDate = (r: CashOutRow): Date => {
  const date = String(r.cashout_date ?? "").trim();
  const time = String(r.cashout_time ?? "").trim();
  if (date && time) {
    const isoLike = `${date}T${time}`;
    const d = new Date(isoLike);
    if (Number.isFinite(d.getTime())) return d;
  }
  const fallback = new Date(r.created_at);
  return Number.isFinite(fallback.getTime()) ? fallback : new Date();
};

const Admin_Staff_Expenses_Expired: React.FC = () => {
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [cashOuts, setCashOuts] = useState<CashOutRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [toastOpen, setToastOpen] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string>("");

  const [confirmVoid, setConfirmVoid] = useState<ExpenseRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ExpenseRow | null>(null);
  const [confirmDeleteCashOut, setConfirmDeleteCashOut] =
    useState<CashOutRow | null>(null);
  const [showDeleteFilterAlert, setShowDeleteFilterAlert] =
    useState<boolean>(false);

  const [busyId, setBusyId] = useState<string>("");

  const [selectedDate, setSelectedDate] = useState<string>(
    yyyyMmDdLocal(new Date())
  );
  const [section, setSection] = useState<SectionKind>("damage_expired");
  const [filterMode, setFilterMode] = useState<FilterMode>("day");

  useEffect(() => {
    if (!toastOpen) return;
    const timer = window.setTimeout(() => setToastOpen(false), 2500);
    return () => window.clearTimeout(timer);
  }, [toastOpen]);

  const fetchExpenses = async (): Promise<ExpenseRow[]> => {
    const { data, error } = await supabase
      .from("add_on_expenses")
      .select(
        "id, created_at, add_on_id, full_name, category, product_name, quantity, expense_type, expense_amount, description, voided, voided_at"
      )
      .order("created_at", { ascending: false })
      .returns<ExpenseRowDB[]>();

    if (error) throw error;

    const normalized: ExpenseRow[] = (data ?? [])
      .map((r): ExpenseRow | null => {
        const et = toExpenseType(r.expense_type);
        if (!et) return null;

        return {
          id: r.id,
          created_at: r.created_at,
          add_on_id: r.add_on_id,
          full_name: String(r.full_name ?? "").trim(),
          category: String(r.category ?? "").trim(),
          product_name: String(r.product_name ?? "").trim(),
          quantity: toQty(r.quantity),
          expense_type: et,
          expense_amount: toMoney(r.expense_amount),
          description: String(r.description ?? "").trim(),
          voided: Boolean(r.voided ?? false),
          voided_at: r.voided_at ?? null,
        };
      })
      .filter((x): x is ExpenseRow => x !== null);

    return normalized;
  };

  const fetchCashOuts = async (): Promise<CashOutRow[]> => {
    const { data, error } = await supabase
      .from("cash_outs")
      .select(
        "id, created_at, created_by, cashout_date, cashout_time, type, description, amount"
      )
      .order("created_at", { ascending: false })
      .returns<CashOutRowDB[]>();

    if (error) throw error;

    return (data ?? []).map((r) => ({
      id: r.id,
      created_at: r.created_at,
      created_by: r.created_by,
      cashout_date: String(r.cashout_date ?? "").trim(),
      cashout_time: String(r.cashout_time ?? "").trim(),
      type: String(r.type ?? "").trim(),
      description: String(r.description ?? "").trim(),
      amount: toMoney(r.amount),
    }));
  };

  const notify = (msg: string): void => {
    setToastMsg(msg);
    setToastOpen(true);
  };

  const fetchAll = async (): Promise<void> => {
    setLoading(true);
    try {
      const [exp, co] = await Promise.all([fetchExpenses(), fetchCashOuts()]);
      setRows(exp);
      setCashOuts(co);
    } catch (e) {
      console.error(e);
      notify("Failed to load logs.");
      setRows([]);
      setCashOuts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchAll();
  }, []);

  const activeRange = useMemo(() => {
    if (filterMode === "day") {
      const start = startOfLocalDay(new Date(`${selectedDate}T00:00:00`));
      const endExclusive = addDays(start, 1);
      return {
        start,
        endExclusive,
        label: selectedDate,
        fileLabel: selectedDate,
      };
    }

    if (filterMode === "week") {
      const w = getWeekRangeMonSun(selectedDate);
      const endInc = new Date(w.endExclusive.getTime() - 1);
      const label = `${yyyyMmDdLocal(w.start)} to ${yyyyMmDdLocal(endInc)}`;
      const fileLabel = `${yyyyMmDdLocal(w.start)}_to_${yyyyMmDdLocal(endInc)}`;
      return { start: w.start, endExclusive: w.endExclusive, label, fileLabel };
    }

    const m = getMonthRange(selectedDate);
    const label = yyyyMmLocal(new Date(`${selectedDate}T00:00:00`));
    const fileLabel = label;
    return { start: m.start, endExclusive: m.endExclusive, label, fileLabel };
  }, [filterMode, selectedDate]);

  const rowsInActiveRange = useMemo(() => {
    return rows.filter((r) => {
      const d = new Date(r.created_at);
      if (!Number.isFinite(d.getTime())) return false;
      return inRange(d, activeRange.start, activeRange.endExclusive);
    });
  }, [rows, activeRange]);

  const expenseRowsForSection = useMemo(() => {
    if (section === "inventory_loss") {
      return rowsInActiveRange.filter((r) => r.expense_type === "inventory_loss");
    }
    if (section === "bilin") {
      return rowsInActiveRange.filter((r) => r.expense_type === "bilin");
    }
    return rowsInActiveRange.filter((r) => r.expense_type === "expired");
  }, [rowsInActiveRange, section]);

  const totalQtyForSection = useMemo(
    () =>
      expenseRowsForSection.reduce(
        (sum, r) => sum + (Number.isFinite(r.quantity) ? r.quantity : 0),
        0
      ),
    [expenseRowsForSection]
  );

  const totalVoidedForSection = useMemo(
    () => expenseRowsForSection.filter((r) => r.voided).length,
    [expenseRowsForSection]
  );

  const filteredCashOuts = useMemo(() => {
    if (filterMode === "day") {
      return cashOuts.filter((r) => r.cashout_date === selectedDate);
    }

    const startKey = yyyyMmDdLocal(activeRange.start);
    const endKey = yyyyMmDdLocal(
      new Date(activeRange.endExclusive.getTime() - 1)
    );

    return cashOuts.filter((r) => {
      const key = String(r.cashout_date ?? "").trim();
      if (!key) return false;
      return key >= startKey && key <= endKey;
    });
  }, [cashOuts, filterMode, selectedDate, activeRange]);

  const cashOutsTotal = useMemo(
    () => filteredCashOuts.reduce((sum, r) => sum + r.amount, 0),
    [filteredCashOuts]
  );

  const bilinSummary = useMemo((): BilinSummaryRow[] => {
    if (section !== "bilin") return [];

    const map = new Map<string, BilinSummaryRow>();

    for (const r of expenseRowsForSection) {
      if (r.voided) continue;
      const key = normNameKey(r.full_name);
      if (!key) continue;

      const qty = Number.isFinite(r.quantity) ? r.quantity : 0;
      const amt = Number.isFinite(r.expense_amount) ? r.expense_amount : 0;
      const prev = map.get(key);

      if (!prev) {
        map.set(key, {
          key,
          display_name: prettyName(r.full_name),
          total_qty: qty,
          total_amount: amt,
          tx_count: 1,
        });
      } else {
        const bestName =
          prettyName(prev.display_name).length >=
          prettyName(r.full_name).length
            ? prev.display_name
            : prettyName(r.full_name);

        map.set(key, {
          ...prev,
          display_name: bestName,
          total_qty: prev.total_qty + qty,
          total_amount: prev.total_amount + amt,
          tx_count: prev.tx_count + 1,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => b.total_amount - a.total_amount);
  }, [expenseRowsForSection, section]);

  const bilinGrandTotal = useMemo(
    () => bilinSummary.reduce((s, x) => s + x.total_amount, 0),
    [bilinSummary]
  );

  const applyHeaderStyle = (row: ExcelJS.Row): void => {
    row.font = { bold: true };
    row.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
    row.height = 20;

    row.eachCell((cell) => {
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
  };

  const applyHeaderStyleRange = (
    row: ExcelJS.Row,
    startCol: number,
    endCol: number
  ): void => {
    row.font = { bold: true };
    row.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
    row.height = 20;

    for (let c = startCol; c <= endCol; c++) {
      const cell = row.getCell(c);
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
    }
  };

  const applyCellBorders = (
    row: ExcelJS.Row,
    startCol: number,
    endCol: number
  ): void => {
    for (let c = startCol; c <= endCol; c++) {
      const cell = row.getCell(c);
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    }
  };

  const styleTitleCell = (
    cell: ExcelJS.Cell,
    size = 16,
    bold = true
  ): void => {
    cell.font = { size, bold };
    cell.alignment = {
      vertical: "middle",
      horizontal: "left",
      wrapText: true,
    };
  };

  const styleMetaCell = (cell: ExcelJS.Cell, bold = false): void => {
    cell.font = { size: 11, bold };
    cell.alignment = {
      vertical: "middle",
      horizontal: "left",
      wrapText: true,
    };
  };

  const blankRow = (ws: ExcelJS.Worksheet, rowNumber: number): void => {
    const r = ws.getRow(rowNumber);
    r.height = 10;
    r.commit();
  };

  const sectionLabel =
    section === "damage_expired"
      ? "DAMAGE/EXPIRED"
      : section === "inventory_loss"
      ? "INVENTORY LOSS"
      : section === "cash_outs"
      ? "CASH OUTS"
      : "BILIN (UTANG)";

  const exportExcel = async (): Promise<void> => {
    try {
      const now = new Date();
      const wb = new ExcelJS.Workbook();
      wb.creator = "Admin";
      wb.created = now;

      const ws = wb.addWorksheet("Logs", {
        views: [{ state: "frozen", ySplit: 6 }],
      });

      ws.columns = [
        { header: "Col1", key: "c1", width: 22 },
        { header: "Col2", key: "c2", width: 30 },
        { header: "Col3", key: "c3", width: 16 },
        { header: "Col4", key: "c4", width: 10 },
        { header: "Col5", key: "c5", width: 16 },
        { header: "Col6", key: "c6", width: 34 },
        { header: "Col7", key: "c7", width: 22 },
        { header: "Col8", key: "c8", width: 20 },
      ];

      ws.mergeCells(1, 1, 1, 8);
      ws.mergeCells(2, 1, 2, 8);
      ws.mergeCells(3, 1, 3, 8);
      ws.mergeCells(4, 1, 4, 8);

      ws.getCell("A1").value = `STAFF LOGS REPORT — ${sectionLabel}`;
      ws.getCell("A2").value = `${filterMode.toUpperCase()} Range: ${activeRange.label}`;
      ws.getCell("A3").value = `Generated: ${now.toLocaleString()}`;

      styleTitleCell(ws.getCell("A1"), 16, true);
      styleMetaCell(ws.getCell("A2"));
      styleMetaCell(ws.getCell("A3"));

      if (section === "cash_outs") {
        ws.getCell("A4").value = `Rows: ${filteredCashOuts.length}   Total: ${peso(
          cashOutsTotal
        )}`;
      } else if (section === "bilin") {
        ws.getCell(
          "A4"
        ).value = `People: ${bilinSummary.length}   Grand Total: ${peso(
          bilinGrandTotal
        )}   Rows: ${expenseRowsForSection.length}`;
      } else {
        ws.getCell(
          "A4"
        ).value = `Rows: ${expenseRowsForSection.length}   Total Qty: ${totalQtyForSection}   Voided: ${totalVoidedForSection}`;
      }
      styleMetaCell(ws.getCell("A4"), true);

      blankRow(ws, 5);

      if (section === "cash_outs") {
        const h = ws.getRow(6);

        ws.mergeCells(6, 2, 6, 4);
        ws.mergeCells(6, 6, 6, 7);

        h.getCell(1).value = "Type";
        h.getCell(2).value = "Description";
        h.getCell(5).value = "Amount";
        h.getCell(6).value = "Date & Time";
        h.getCell(8).value = "";

        applyHeaderStyleRange(h, 1, 7);
        applyCellBorders(h, 1, 7);
        h.commit();

        let cur = 7;

        for (const r of filteredCashOuts) {
          const row = ws.getRow(cur);

          ws.mergeCells(cur, 2, cur, 4);
          ws.mergeCells(cur, 6, cur, 7);

          row.getCell(1).value = r.type || "—";
          row.getCell(2).value = r.description || "—";
          row.getCell(5).value = Number(r.amount ?? 0);
          row.getCell(5).numFmt = '"₱"#,##0.00';

          const dt = cashOutDateTimeDate(r);
          row.getCell(6).value = dt;
          row.getCell(6).numFmt = "m/d/yyyy h:mm AM/PM";
          row.height = 22;

          applyCellBorders(row, 1, 7);
          row.commit();
          cur++;
        }
      } else if (section === "bilin") {
        const hSum = ws.getRow(6);
        hSum.values = [
          "Staff",
          "Tx Count",
          "Total Qty",
          "Total Amount",
          "",
          "",
          "",
          "",
        ];
        applyHeaderStyle(hSum);
        hSum.commit();

        let cur = 7;
        for (const s of bilinSummary) {
          const row = ws.getRow(cur);
          row.getCell(1).value = s.display_name;
          row.getCell(2).value = s.tx_count;
          row.getCell(3).value = s.total_qty;
          row.getCell(4).value = s.total_amount;
          row.getCell(4).numFmt = '"₱"#,##0.00';
          row.height = 20;
          applyCellBorders(row, 1, 4);
          row.commit();
          cur++;
        }

        cur += 2;
        blankRow(ws, cur - 1);

        const h = ws.getRow(cur);
        h.values = [
          "Full Name",
          "Product",
          "Category",
          "Qty",
          "Amount",
          "Description",
          "Date & Time",
          "Status",
        ];
        applyHeaderStyle(h);
        h.commit();
        cur++;

        for (const r of expenseRowsForSection) {
          const row = ws.getRow(cur);
          const status = r.voided
            ? `VOIDED${r.voided_at ? ` • ${formatDateTime(r.voided_at)}` : ""}`
            : "ACTIVE";

          row.getCell(1).value = r.full_name || "—";
          row.getCell(2).value = r.product_name || "—";
          row.getCell(3).value = r.category || "—";
          row.getCell(4).value = Number(r.quantity ?? 0);
          row.getCell(5).value = Number(r.expense_amount ?? 0);
          row.getCell(5).numFmt = '"₱"#,##0.00';
          row.getCell(6).value = r.description || "—";
          row.getCell(7).value = formatDateTime(r.created_at);
          row.getCell(8).value = status;

          row.height = 22;
          applyCellBorders(row, 1, 8);

          if (r.voided) {
            for (let c = 1; c <= 8; c++) {
              row.getCell(c).fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FFF6F6F6" },
              };
            }
          }

          row.commit();
          cur++;
        }
      } else {
        const h = ws.getRow(6);
        h.values = [
          "Full Name",
          "Product",
          "Category",
          "Qty",
          "Type",
          "Description",
          "Date & Time",
          "Status",
        ];
        applyHeaderStyle(h);
        h.commit();

        let cur = 7;
        for (const r of expenseRowsForSection) {
          const row = ws.getRow(cur);
          const status = r.voided
            ? `VOIDED${r.voided_at ? ` • ${formatDateTime(r.voided_at)}` : ""}`
            : "ACTIVE";

          row.getCell(1).value = r.full_name || "—";
          row.getCell(2).value = r.product_name || "—";
          row.getCell(3).value = r.category || "—";
          row.getCell(4).value = Number(r.quantity ?? 0);
          row.getCell(5).value = typeLabel(r.expense_type);
          row.getCell(6).value = r.description || "—";
          row.getCell(7).value = formatDateTime(r.created_at);
          row.getCell(8).value = status;

          row.height = 22;
          applyCellBorders(row, 1, 8);

          if (r.voided) {
            for (let c = 1; c <= 8; c++) {
              row.getCell(c).fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FFF6F6F6" },
              };
            }
          }

          row.commit();
          cur++;
        }
      }

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const filenameNow = new Date();
      const y = filenameNow.getFullYear();
      const m = pad2(filenameNow.getMonth() + 1);
      const d = pad2(filenameNow.getDate());
      const hh = pad2(filenameNow.getHours());
      const mm = pad2(filenameNow.getMinutes());

      const sec =
        section === "damage_expired"
          ? "DamageExpired"
          : section === "inventory_loss"
          ? "InventoryLoss"
          : section === "cash_outs"
          ? "CashOuts"
          : "Bilin";

      const mode = filterMode.toUpperCase();
      const fileName = `MeTyme_StaffLogs_${sec}_${mode}_${activeRange.fileLabel}_generated_${y}-${m}-${d}_${hh}${mm}.xlsx`;

      saveAs(blob, fileName);
      notify("Exported Excel successfully.");
    } catch (e) {
      console.error(e);
      notify("Export failed.");
    }
  };

  const doVoid = async (r: ExpenseRow): Promise<void> => {
    if (busyId) return;
    setBusyId(r.id);

    try {
      const { error } = await supabase.rpc("void_addon_expense", {
        p_expense_id: r.id,
      });
      if (error) throw error;

      notify("Voided. Stock/counts restored.");
      await fetchAll();
    } catch (e) {
      console.error(e);
      notify("Failed to void record.");
    } finally {
      setBusyId("");
    }
  };

  const doDelete = async (r: ExpenseRow): Promise<void> => {
    if (busyId) return;
    setBusyId(r.id);
    try {
      const { error } = await supabase
        .from("add_on_expenses")
        .delete()
        .eq("id", r.id);
      if (error) throw error;

      notify("Deleted log (no stock changes).");
      await fetchAll();
    } catch (e) {
      console.error(e);
      notify("Failed to delete record.");
    } finally {
      setBusyId("");
    }
  };

  const doDeleteCashOut = async (r: CashOutRow): Promise<void> => {
    if (busyId) return;
    setBusyId(r.id);
    try {
      const { error } = await supabase
        .from("cash_outs")
        .delete()
        .eq("id", r.id);
      if (error) throw error;

      notify("Deleted cash out.");
      await fetchAll();
    } catch (e) {
      console.error(e);
      notify("Failed to delete cash out.");
    } finally {
      setBusyId("");
    }
  };

  const deleteByFilter = async (): Promise<void> => {
    try {
      if (section === "cash_outs") {
        const ids = filteredCashOuts.map((x) => x.id);
        if (ids.length === 0) {
          notify("No CASH OUT logs to delete for this filter.");
          return;
        }

        const { error } = await supabase.from("cash_outs").delete().in("id", ids);
        if (error) throw error;

        notify(`Deleted CASH OUT logs by ${filterMode.toUpperCase()} (no revert).`);
        await fetchAll();
        return;
      }

      const ids = expenseRowsForSection.map((x) => x.id);
      if (ids.length === 0) {
        notify("No logs to delete for this filter.");
        return;
      }

      const { error } = await supabase
        .from("add_on_expenses")
        .delete()
        .in("id", ids);
      if (error) throw error;

      notify(`Deleted logs by ${filterMode.toUpperCase()} (no revert).`);
      await fetchAll();
    } catch (e) {
      console.error(e);
      notify("Failed to delete by filter.");
    }
  };

  const sectionTitle =
    section === "damage_expired"
      ? "Damage/Expired"
      : section === "inventory_loss"
      ? "Inventory Loss"
      : section === "cash_outs"
      ? "Cash Outs"
      : "Bilin (Utang)";

  const sectionCount =
    section === "cash_outs" ? filteredCashOuts.length : expenseRowsForSection.length;

  const deleteFilterMessage = useMemo(() => {
    const label = `${filterMode.toUpperCase()} Range: ${activeRange.label}`;
    if (section === "cash_outs") {
      return `This will DELETE all CASH OUT logs for ${label}. Continue?`;
    }

    const sec =
      section === "damage_expired"
        ? "DAMAGE/EXPIRED"
        : section === "inventory_loss"
        ? "INVENTORY LOSS"
        : "BILIN (UTANG)";

    return `This will DELETE all ${sec} logs for ${label}. This deletes LOGS ONLY (no stock/count revert). Continue?`;
  }, [filterMode, activeRange.label, section]);

  return (
    <div className="admin-staff-exp-page">
      <div className="admin-staff-exp-shell">
        <div className="staff-exp-hero">
          <h1 className="staff-exp-main-title">Admin Staff Expenses & Expired</h1>
          <p className="staff-exp-hero-subtitle">
            Review expired items, inventory losses, cash outs, and bilin records in
            one premium workspace.
          </p>
        </div>

        <div className="staff-exp-panel">
          <div className="staff-exp-panel-head">
            <div className="staff-exp-heading-wrap">
              <h2 className="staff-exp-title">Staff Logs</h2>
              <div className="staff-exp-subtext">
                Showing: <strong>{sectionTitle}</strong> • {filterMode.toUpperCase()} Range:{" "}
                <strong>{activeRange.label}</strong> • Rows: <strong>{sectionCount}</strong>
              </div>
            </div>

            <div className="staff-exp-toolbar">
              <div className="staff-exp-control">
                <span className="staff-exp-control-label">Show</span>
                <select
                  className="staff-exp-select"
                  value={section}
                  onChange={(e) => setSection(e.currentTarget.value as SectionKind)}
                >
                  <option value="damage_expired">Damage/Expired</option>
                  <option value="inventory_loss">Inventory Loss</option>
                  <option value="cash_outs">Cash Outs</option>
                  <option value="bilin">Bale (Utang)</option>
                </select>
              </div>

              <div className="staff-exp-control">
                <span className="staff-exp-control-label">Mode</span>
                <select
                  className="staff-exp-select"
                  value={filterMode}
                  onChange={(e) =>
                    setFilterMode(e.currentTarget.value as FilterMode)
                  }
                >
                  <option value="day">Day</option>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                </select>
              </div>

              <button
                className="staff-exp-btn staff-exp-btn-dark"
                onClick={() => void exportExcel()}
              >
                ⬇ Export Excel
              </button>

              <button
                className="staff-exp-btn staff-exp-btn-danger"
                onClick={() => setShowDeleteFilterAlert(true)}
              >
                🗑 Delete By{" "}
                {filterMode === "day"
                  ? "Date"
                  : filterMode === "week"
                  ? "Week"
                  : "Month"}
              </button>

              <div className="staff-exp-control">
                <span className="staff-exp-control-label">Anchor Date</span>
                <input
                  className="staff-exp-date"
                  type="date"
                  value={selectedDate}
                  onChange={(e) =>
                    setSelectedDate(String(e.currentTarget.value ?? ""))
                  }
                />
              </div>

              <button
                className="staff-exp-btn staff-exp-btn-light"
                onClick={() => void fetchAll()}
              >
                ⟳ Refresh
              </button>
            </div>
          </div>
        </div>

        <div className="staff-exp-table-card">
          {loading ? (
            <div className="staff-exp-loading">
              <div className="staff-exp-spinner" />
              <span>Loading...</span>
            </div>
          ) : section === "cash_outs" ? (
            filteredCashOuts.length === 0 ? (
              <p className="staff-exp-empty">No CASH OUTS found for this filter</p>
            ) : (
              <div
                className="staff-exp-table-wrap"
                key={`co-${filterMode}-${activeRange.fileLabel}`}
              >
                <table className="staff-exp-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Description</th>
                      <th>Amount</th>
                      <th>Date & Time</th>
                      <th>Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredCashOuts.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <span className="staff-exp-pill staff-exp-pill-info">
                            {r.type || "—"}
                          </span>
                        </td>
                        <td>
                          <div className="staff-exp-cell-stack">
                            <span className="staff-exp-cell-strong">
                              {r.description || "—"}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className="staff-exp-pill staff-exp-pill-dark">
                            {peso(r.amount)}
                          </span>
                        </td>
                        <td>{cashOutDateTimeDate(r).toLocaleString()}</td>
                        <td>
                          <div className="staff-exp-action-row">
                            <button
                              className="staff-exp-action-btn gray"
                              disabled={busyId === r.id}
                              onClick={() => setConfirmDeleteCashOut(r)}
                              title="Delete cash out"
                            >
                              {busyId === r.id ? "..." : "Delete"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="staff-exp-summary">
                  Total cash outs: <strong>{peso(cashOutsTotal)}</strong>
                </div>
              </div>
            )
          ) : section === "bilin" ? (
            expenseRowsForSection.length === 0 ? (
              <p className="staff-exp-empty">
                No BILIN (UTANG) records found for this filter
              </p>
            ) : (
              <>
                <div className="staff-exp-summary top">
                  People: <strong>{bilinSummary.length}</strong> • Grand total:{" "}
                  <strong>{peso(bilinGrandTotal)}</strong> • Rows:{" "}
                  <strong>{expenseRowsForSection.length}</strong>
                </div>

                <div
                  className="staff-exp-table-wrap"
                  style={{ marginTop: 10 }}
                  key={`bilin-sum-${filterMode}-${activeRange.fileLabel}`}
                >
                  <table className="staff-exp-table">
                    <thead>
                      <tr>
                        <th>Staff Name</th>
                        <th>Transactions</th>
                        <th>Total Qty</th>
                        <th>Total Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bilinSummary.map((s) => (
                        <tr key={s.key}>
                          <td>
                            <span className="staff-exp-cell-strong">
                              {s.display_name}
                            </span>
                          </td>
                          <td>
                            <span className="staff-exp-pill staff-exp-pill-info">
                              {s.tx_count}
                            </span>
                          </td>
                          <td>
                            <span className="staff-exp-pill staff-exp-pill-dark">
                              {s.total_qty}
                            </span>
                          </td>
                          <td>
                            <span className="staff-exp-pill staff-exp-pill-dark">
                              {peso(s.total_amount)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div
                  className="staff-exp-table-wrap"
                  style={{ marginTop: 14 }}
                  key={`bilin-${filterMode}-${activeRange.fileLabel}`}
                >
                  <table className="staff-exp-table">
                    <thead>
                      <tr>
                        <th>Full Name</th>
                        <th>Product</th>
                        <th>Category</th>
                        <th>Qty</th>
                        <th>Amount</th>
                        <th>Date & Time</th>
                        <th>Action</th>
                      </tr>
                    </thead>

                    <tbody>
                      {expenseRowsForSection.map((r) => (
                        <tr key={r.id} className={r.voided ? "is-voided" : ""}>
                          <td>
                            <div className="staff-exp-cell-stack">
                              <span className="staff-exp-cell-strong">
                                {r.full_name || "—"}
                              </span>
                              {r.voided && (
                                <span className="staff-exp-cell-sub">
                                  <span className="staff-exp-pill staff-exp-pill-muted">
                                    VOIDED
                                  </span>
                                  {r.voided_at
                                    ? ` • ${formatDateTime(r.voided_at)}`
                                    : ""}
                                </span>
                              )}
                            </div>
                          </td>

                          <td>
                            <div className="staff-exp-cell-stack">
                              <span className="staff-exp-cell-strong">
                                {r.product_name || "—"}
                              </span>
                              <span className="staff-exp-cell-sub">
                                {r.description || "—"}
                              </span>
                            </div>
                          </td>

                          <td>{r.category || "—"}</td>

                          <td>
                            <span className="staff-exp-pill staff-exp-pill-dark">
                              {r.quantity}
                            </span>
                          </td>

                          <td>
                            <span className="staff-exp-pill staff-exp-pill-dark">
                              {peso(r.expense_amount)}
                            </span>
                          </td>

                          <td>{formatDateTime(r.created_at)}</td>

                          <td>
                            <div className="staff-exp-action-row">
                              <button
                                className="staff-exp-action-btn danger"
                                disabled={r.voided || busyId === r.id}
                                onClick={() => setConfirmVoid(r)}
                                title={
                                  r.voided
                                    ? "Already voided"
                                    : "Void (RPC restores counters)"
                                }
                              >
                                {busyId === r.id ? "..." : "Void"}
                              </button>

                              <button
                                className="staff-exp-action-btn gray"
                                disabled={busyId === r.id}
                                onClick={() => setConfirmDelete(r)}
                                title="Delete log only (no revert)"
                              >
                                {busyId === r.id ? "..." : "Delete"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )
          ) : expenseRowsForSection.length === 0 ? (
            <p className="staff-exp-empty">
              No {section === "inventory_loss" ? "INVENTORY LOSS" : "DAMAGE/EXPIRED"}{" "}
              records found for this filter
            </p>
          ) : (
            <div
              className="staff-exp-table-wrap"
              key={`exp-${filterMode}-${activeRange.fileLabel}-${section}`}
            >
              <table className="staff-exp-table">
                <thead>
                  <tr>
                    <th>Full Name</th>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Qty</th>
                    <th>Type</th>
                    <th>Date & Time</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {expenseRowsForSection.map((r) => (
                    <tr key={r.id} className={r.voided ? "is-voided" : ""}>
                      <td>
                        <div className="staff-exp-cell-stack">
                          <span className="staff-exp-cell-strong">
                            {r.full_name || "—"}
                          </span>
                          {r.voided && (
                            <span className="staff-exp-cell-sub">
                              <span className="staff-exp-pill staff-exp-pill-muted">
                                VOIDED
                              </span>
                              {r.voided_at
                                ? ` • ${formatDateTime(r.voided_at)}`
                                : ""}
                            </span>
                          )}
                        </div>
                      </td>

                      <td>
                        <div className="staff-exp-cell-stack">
                          <span className="staff-exp-cell-strong">
                            {r.product_name || "—"}
                          </span>
                          <span className="staff-exp-cell-sub">
                            {r.description || "—"}
                          </span>
                        </div>
                      </td>

                      <td>{r.category || "—"}</td>

                      <td>
                        <span className="staff-exp-pill staff-exp-pill-dark">
                          {r.quantity}
                        </span>
                      </td>

                      <td>
                        <span
                          className={`staff-exp-pill ${
                            r.expense_type === "expired"
                              ? "staff-exp-pill-warn"
                              : "staff-exp-pill-info"
                          }`}
                        >
                          {typeLabel(r.expense_type)}
                        </span>
                      </td>

                      <td>{formatDateTime(r.created_at)}</td>

                      <td>
                        <div className="staff-exp-action-row">
                          <button
                            className="staff-exp-action-btn danger"
                            disabled={r.voided || busyId === r.id}
                            onClick={() => setConfirmVoid(r)}
                            title={
                              r.voided
                                ? "Already voided"
                                : "Void (RPC restores counters)"
                            }
                          >
                            {busyId === r.id ? "..." : "Void"}
                          </button>

                          <button
                            className="staff-exp-action-btn gray"
                            disabled={busyId === r.id}
                            onClick={() => setConfirmDelete(r)}
                            title="Delete log only (no revert)"
                          >
                            {busyId === r.id ? "..." : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="staff-exp-summary">
                Total qty: <strong>{totalQtyForSection}</strong> • Voided:{" "}
                <strong>{totalVoidedForSection}</strong>
              </div>
            </div>
          )}
        </div>
      </div>

      {!!confirmVoid && (
        <div className="staff-exp-modal-overlay" onClick={() => setConfirmVoid(null)}>
          <div className="staff-exp-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="staff-exp-modal-title">Void this record?</h3>
            <p className="staff-exp-modal-text">
              This will restore counts by reverting{" "}
              {typeLabel(confirmVoid.expense_type)} (qty: {confirmVoid.quantity}).
            </p>
            <div className="staff-exp-modal-actions">
              <button
                className="staff-exp-btn staff-exp-btn-light"
                onClick={() => setConfirmVoid(null)}
              >
                Cancel
              </button>
              <button
                className="staff-exp-btn staff-exp-btn-danger"
                onClick={() => {
                  const r = confirmVoid;
                  setConfirmVoid(null);
                  if (r) void doVoid(r);
                }}
              >
                Void
              </button>
            </div>
          </div>
        </div>
      )}

      {!!confirmDelete && (
        <div
          className="staff-exp-modal-overlay"
          onClick={() => setConfirmDelete(null)}
        >
          <div className="staff-exp-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="staff-exp-modal-title">Delete this log?</h3>
            <p className="staff-exp-modal-text">
              This will delete the record only. Stock/counts will NOT change.
            </p>
            <div className="staff-exp-modal-actions">
              <button
                className="staff-exp-btn staff-exp-btn-light"
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>
              <button
                className="staff-exp-btn staff-exp-btn-danger"
                onClick={() => {
                  const r = confirmDelete;
                  setConfirmDelete(null);
                  if (r) void doDelete(r);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {!!confirmDeleteCashOut && (
        <div
          className="staff-exp-modal-overlay"
          onClick={() => setConfirmDeleteCashOut(null)}
        >
          <div className="staff-exp-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="staff-exp-modal-title">Delete this cash out?</h3>
            <p className="staff-exp-modal-text">
              This will delete the cash out record only.
            </p>
            <div className="staff-exp-modal-actions">
              <button
                className="staff-exp-btn staff-exp-btn-light"
                onClick={() => setConfirmDeleteCashOut(null)}
              >
                Cancel
              </button>
              <button
                className="staff-exp-btn staff-exp-btn-danger"
                onClick={() => {
                  const r = confirmDeleteCashOut;
                  setConfirmDeleteCashOut(null);
                  if (r) void doDeleteCashOut(r);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteFilterAlert && (
        <div
          className="staff-exp-modal-overlay"
          onClick={() => setShowDeleteFilterAlert(false)}
        >
          <div className="staff-exp-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="staff-exp-modal-title">
              Delete by{" "}
              {filterMode === "day"
                ? "Date"
                : filterMode === "week"
                ? "Week"
                : "Month"}
              ?
            </h3>
            <p className="staff-exp-modal-text">{deleteFilterMessage}</p>
            <div className="staff-exp-modal-actions">
              <button
                className="staff-exp-btn staff-exp-btn-light"
                onClick={() => setShowDeleteFilterAlert(false)}
              >
                Cancel
              </button>
              <button
                className="staff-exp-btn staff-exp-btn-danger"
                onClick={() => {
                  setShowDeleteFilterAlert(false);
                  void deleteByFilter();
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {toastOpen && (
        <div className="staff-exp-toast">
          <span>{toastMsg}</span>
          <button type="button" onClick={() => setToastOpen(false)}>
            ✕
          </button>
        </div>
      )}
    </div>
  );
};

export default Admin_Staff_Expenses_Expired;