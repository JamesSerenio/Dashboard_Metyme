import React, { useEffect, useMemo, useState } from "react";
import "../styles/Admin_Sales_Report.css";
import { supabase } from "../utils/supabaseClient";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

const HOURLY_RATE = 20;
const FREE_MINUTES = 0;

type MoneyKind = "cash" | "coin";
type CashOutMethod = "cash" | "gcash";
type DiscountKind = "none" | "percent" | "amount";
type ToastColor = "success" | "danger" | "warning";

interface DailyReportRow {
  id: string;
  report_date: string;
  starting_cash: number | string;
  starting_gcash: number | string;
  bilin_amount: number | string;
  is_submitted?: boolean;
  submitted_at?: string | null;
}

interface CashCountDBRow {
  report_id: string;
  money_kind: MoneyKind;
  denomination: number | string;
  qty: number;
}

interface CashLine {
  report_id: string;
  money_kind: MoneyKind;
  denomination: number;
  qty: number;
}

interface SalesTotalsRow {
  id: string;
  report_date: string;
  starting_cash: number | string;
  starting_gcash: number | string;
  bilin_amount: number | string;
  coh_total: number | string;
  expenses_amount: number | string;
  paid_reservation_cash: number | string;
  paid_reservation_gcash: number | string;
  advance_cash: number | string;
  advance_gcash: number | string;
  walkin_cash: number | string;
  walkin_gcash: number | string;
  total_time: number | string;
  addons_total: number | string;
  discount_total: number | string;
  cash_sales: number | string;
  gcash_sales: number | string;
  system_sale: number | string;
  sales_collected: number | string;
  net_collected: number | string;
}

type ConsignmentState = {
  gross: number;
  fee15: number;
  net: number;
};

type ConsignmentRpcRow = {
  gross: number | string | null;
  fee15: number | string | null;
  net: number | string | null;
};

type AddOnPaymentRow = {
  created_at: string;
  full_name: string;
  seat_number: string;
  gcash_amount: number | string | null;
  cash_amount: number | string | null;
};

type CustomerOrderPaymentRow = {
  booking_code: string | null;
  paid_at: string | null;
  is_paid: boolean | number | string | null;
  gcash_amount: number | string | null;
  cash_amount: number | string | null;
};

type WalkinSystemPaidRow = {
  paid_at: string | null;
  is_paid: boolean | number | string | null;
  reservation: string | null;
  total_amount: number | string | null;
  discount_kind?: DiscountKind | null;
  discount_value?: number | string | null;
};

type ReservationForTimeRow = {
  reservation_date: string | null;
  time_started: string | null;
  time_ended: string | null;
  hour_avail: string | null;
  is_paid: boolean | null;
  discount_kind: string | null;
  discount_value: number | string | null;
};

type ReservationPaymentPlacementRow = {
  paid_at: string | null;
  is_paid: boolean | number | string | null;
  reservation_date: string | null;
  gcash_amount: number | string | null;
  cash_amount: number | string | null;
};

type AddOnExpenseRow = {
  created_at: string;
  expense_type: string;
  expense_amount: number | string | null;
  voided: boolean | null;
};

type PromoPaymentRow = {
  paid_at: string | null;
  is_paid: boolean | number | string | null;
  start_at: string | null;
  gcash_amount: number | string | null;
  cash_amount: number | string | null;
};

type PromoDiscountRow = {
  paid_at: string | null;
  is_paid: boolean | number | string | null;
  price: number | string | null;
  discount_kind: string | null;
  discount_value: number | string | null;
};

type ToastState = {
  open: boolean;
  msg: string;
  color: ToastColor;
};

const CASH_DENOMS: number[] = [1000, 500, 200, 100, 50];
const COIN_DENOMS: number[] = [20, 10, 5, 1];
const GROUP_WINDOW_MS = 10_000;

const toNumber = (v: string | number | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number): number =>
  Number((Number.isFinite(n) ? n : 0).toFixed(2));

const clamp = (n: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, n));

const applyDiscountToBase = (
  baseCost: number,
  kind: DiscountKind,
  value: number
): number => {
  const cost = Math.max(0, round2(baseCost));
  const v = Math.max(0, round2(value));

  if (kind === "percent") {
    const pct = clamp(v, 0, 100);
    return Math.max(0, round2(cost - (cost * pct) / 100));
  }

  if (kind === "amount") {
    return Math.max(0, round2(cost - v));
  }

  return cost;
};

const computeDiscountAmountFromBaseCost = (
  baseCost: number,
  kindRaw: string | null | undefined,
  valueRaw: number | string | null | undefined
): number => {
  const kind = (kindRaw ?? "none").toLowerCase().trim();
  const v = Math.max(0, toNumber(valueRaw));

  if (kind === "amount") return round2(Math.min(baseCost, v));
  if (kind === "percent") return round2(baseCost * (Math.min(100, v) / 100));
  return 0;
};

const todayYMD = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const isYMD = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s);

const peso = (n: number): string =>
  `₱${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const manilaDayRange = (yyyyMmDd: string): { startIso: string; endIso: string } => {
  const start = new Date(`${yyyyMmDd}T00:00:00+08:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
};

const ms = (iso: string): number => {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
};

const norm = (s: string | null | undefined): string =>
  (s ?? "").trim().toLowerCase();

const buildZeroLines = (reportId: string): CashLine[] => {
  const merged: CashLine[] = [];
  for (const d of CASH_DENOMS) {
    merged.push({ report_id: reportId, money_kind: "cash", denomination: d, qty: 0 });
  }
  for (const d of COIN_DENOMS) {
    merged.push({ report_id: reportId, money_kind: "coin", denomination: d, qty: 0 });
  }
  return merged;
};

const toBool = (v: unknown): boolean => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes" || s === "paid";
  }
  return false;
};

const computeAddonsPaidFromPayments = (rows: AddOnPaymentRow[]): number => {
  if (rows.length === 0) return 0;

  const sorted = [...rows].sort((a, b) => ms(a.created_at) - ms(b.created_at));

  let total = 0;
  let curName = "";
  let curSeat = "";
  let curLast = 0;
  let started = false;
  let maxG = 0;
  let maxC = 0;

  const flush = (): void => {
    total += Math.max(0, maxG) + Math.max(0, maxC);
    maxG = 0;
    maxC = 0;
  };

  for (const r of sorted) {
    const t = ms(r.created_at);
    const name = norm(r.full_name);
    const seat = norm(r.seat_number);
    const g = Math.max(0, toNumber(r.gcash_amount));
    const c = Math.max(0, toNumber(r.cash_amount));

    const startNew =
      !started ||
      name !== curName ||
      seat !== curSeat ||
      Math.abs(t - curLast) > GROUP_WINDOW_MS;

    if (startNew) {
      if (started) flush();
      started = true;
      curName = name;
      curSeat = seat;
      curLast = t;
      maxG = g;
      maxC = c;
      continue;
    }

    curLast = t;
    maxG = Math.max(maxG, g);
    maxC = Math.max(maxC, c);
  }

  if (started) flush();

  return round2(total);
};

const isOpenTimeSession = (
  hourAvail: string | null | undefined,
  timeEnded: string | null | undefined
): boolean => {
  if ((hourAvail ?? "").toUpperCase() === "OPEN") return true;
  if (!timeEnded) return true;
  const end = new Date(timeEnded);
  if (!Number.isFinite(end.getTime())) return true;
  return end.getFullYear() >= 2999;
};

const diffMinutes = (startIso: string, endIso: string): number => {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.floor((end - start) / (1000 * 60));
};

const computeCostWithFreeMinutes = (startIso: string, endIso: string): number => {
  const minutesUsed = diffMinutes(startIso, endIso);
  const chargeMinutes = Math.max(0, minutesUsed - FREE_MINUTES);
  const perMinute = HOURLY_RATE / 60;
  return round2(chargeMinutes * perMinute);
};

const isoToLocalYMD = (iso: string): string => {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return todayYMD();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const AdminSalesReport: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState<string>(() => todayYMD());
  const [loading, setLoading] = useState<boolean>(true);

  const [report, setReport] = useState<DailyReportRow | null>(null);
  const [lines, setLines] = useState<CashLine[]>([]);
  const [totals, setTotals] = useState<SalesTotalsRow | null>(null);

  const [consignment, setConsignment] = useState<ConsignmentState>({
    gross: 0,
    fee15: 0,
    net: 0,
  });

  const [addonsPaidBase, setAddonsPaidBase] = useState<number>(0);
  const [customerOrderPaid, setCustomerOrderPaid] = useState<number>(0);
  const [walkinSystemPaid, setWalkinSystemPaid] = useState<number>(0);
  const [reservationTimeBase, setReservationTimeBase] = useState<number>(0);

  const [reservationDownCash, setReservationDownCash] = useState<number>(0);
  const [reservationDownGcash, setReservationDownGcash] = useState<number>(0);
  const [reservationAdvanceCash, setReservationAdvanceCash] = useState<number>(0);
  const [reservationAdvanceGcash, setReservationAdvanceGcash] = useState<number>(0);

  const [promoTodayCash, setPromoTodayCash] = useState<number>(0);
  const [promoTodayGcash, setPromoTodayGcash] = useState<number>(0);
  const [promoAdvanceCash, setPromoAdvanceCash] = useState<number>(0);
  const [promoAdvanceGcash, setPromoAdvanceGcash] = useState<number>(0);

  const [cashOutsCash, setCashOutsCash] = useState<number>(0);
  const [cashOutsGcash, setCashOutsGcash] = useState<number>(0);

  const [walkinDiscountAmount, setWalkinDiscountAmount] = useState<number>(0);
  const [reservationDiscountAmount, setReservationDiscountAmount] = useState<number>(0);
  const [promoDiscountAmount, setPromoDiscountAmount] = useState<number>(0);
  const [inventoryLossAmount, setInventoryLossAmount] = useState<number>(0);

  const [submitting, setSubmitting] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [deleteAlertOpen, setDeleteAlertOpen] = useState(false);

  const [toast, setToast] = useState<ToastState>({
    open: false,
    msg: "",
    color: "success",
  });

  const [startingCashInput, setStartingCashInput] = useState<string>("0");
  const [startingGcashInput, setStartingGcashInput] = useState<string>("0");
  const [bilinInput, setBilinInput] = useState<string>("0");

  const ensureReportRow = async (dateYMD: string): Promise<void> => {
    const upsertRes = await supabase
      .from("daily_sales_reports")
      .upsert(
        { report_date: dateYMD, starting_cash: 0, starting_gcash: 0, bilin_amount: 0 },
        { onConflict: "report_date", ignoreDuplicates: true }
      );

    if (upsertRes.error) {
      console.error("daily_sales_reports ensure(upsert) error:", upsertRes.error.message);
    }
  };

  const resetAll = (): void => {
    setReport(null);
    setLines([]);
    setTotals(null);
    setConsignment({ gross: 0, fee15: 0, net: 0 });
    setAddonsPaidBase(0);
    setCustomerOrderPaid(0);
    setWalkinSystemPaid(0);
    setReservationTimeBase(0);
    setReservationDownCash(0);
    setReservationDownGcash(0);
    setReservationAdvanceCash(0);
    setReservationAdvanceGcash(0);
    setPromoTodayCash(0);
    setPromoTodayGcash(0);
    setPromoAdvanceCash(0);
    setPromoAdvanceGcash(0);
    setCashOutsCash(0);
    setCashOutsGcash(0);
    setWalkinDiscountAmount(0);
    setReservationDiscountAmount(0);
    setPromoDiscountAmount(0);
    setInventoryLossAmount(0);
  };

  const loadReport = async (dateYMD: string): Promise<void> => {
    setLoading(true);

    if (!isYMD(dateYMD)) {
      resetAll();
      setLoading(false);
      return;
    }

    await ensureReportRow(dateYMD);

    const res = await supabase
      .from("daily_sales_reports")
      .select("id, report_date, starting_cash, starting_gcash, bilin_amount, is_submitted, submitted_at")
      .eq("report_date", dateYMD)
      .single<DailyReportRow>();

    if (res.error) {
      console.error("daily_sales_reports select error:", res.error.message);
      resetAll();
      setLoading(false);
      return;
    }

    setReport(res.data);
    setLoading(false);
  };

  const loadCashLines = async (reportId: string): Promise<void> => {
    const res = await supabase
      .from("daily_cash_count_lines")
      .select("report_id, money_kind, denomination, qty")
      .eq("report_id", reportId);

    if (res.error) {
      console.error("daily_cash_count_lines select error:", res.error.message);
      setLines(buildZeroLines(reportId));
      return;
    }

    const rows = (res.data ?? []) as CashCountDBRow[];
    const merged: CashLine[] = [];

    for (const d of CASH_DENOMS) {
      const found = rows.find(
        (r) => r.money_kind === "cash" && toNumber(r.denomination) === d
      );
      merged.push({
        report_id: reportId,
        money_kind: "cash",
        denomination: d,
        qty: found?.qty ?? 0,
      });
    }

    for (const d of COIN_DENOMS) {
      const found = rows.find(
        (r) => r.money_kind === "coin" && toNumber(r.denomination) === d
      );
      merged.push({
        report_id: reportId,
        money_kind: "coin",
        denomination: d,
        qty: found?.qty ?? 0,
      });
    }

    setLines(merged);
  };

  const loadTotals = async (dateYMD: string): Promise<void> => {
    if (!isYMD(dateYMD)) {
      setTotals(null);
      return;
    }

    const res = await supabase
      .from("v_daily_sales_report_totals")
      .select("*")
      .eq("report_date", dateYMD)
      .single<SalesTotalsRow>();

    if (res.error) {
      console.error("v_daily_sales_report_totals error:", res.error.message);
      setTotals(null);
      return;
    }

    setTotals(res.data);
  };

  const loadConsignment = async (dateYMD: string): Promise<void> => {
    if (!isYMD(dateYMD)) {
      setConsignment({ gross: 0, fee15: 0, net: 0 });
      return;
    }

    const res = await supabase.rpc("get_consignment_totals_for_day", { p_date: dateYMD });

    if (res.error) {
      console.error("get_consignment_totals_for_day error:", res.error.message);
      setConsignment({ gross: 0, fee15: 0, net: 0 });
      return;
    }

    const row = (res.data?.[0] ?? null) as ConsignmentRpcRow | null;
    if (!row) {
      setConsignment({ gross: 0, fee15: 0, net: 0 });
      return;
    }

    setConsignment({
      gross: toNumber(row.gross),
      fee15: toNumber(row.fee15),
      net: toNumber(row.net),
    });
  };

  const loadInventoryLossAmount = async (dateYMD: string): Promise<void> => {
    if (!isYMD(dateYMD)) {
      setInventoryLossAmount(0);
      return;
    }

    const { startIso, endIso } = manilaDayRange(dateYMD);

    const res = await supabase
      .from("add_on_expenses")
      .select("created_at, expense_type, expense_amount, voided")
      .eq("expense_type", "inventory_loss")
      .gte("created_at", startIso)
      .lt("created_at", endIso);

    if (res.error) {
      console.error("inventory loss query error:", res.error.message);
      const fallback = totals ? toNumber(totals.expenses_amount) : 0;
      setInventoryLossAmount(round2(fallback));
      return;
    }

    const rows = (res.data ?? []) as AddOnExpenseRow[];
    const sum = rows
      .filter((r) => !r.voided)
      .reduce((acc, r) => acc + Math.max(0, toNumber(r.expense_amount)), 0);

    setInventoryLossAmount(round2(sum));
  };

  const loadAddonsPaidBase = async (dateYMD: string): Promise<void> => {
    if (!isYMD(dateYMD)) {
      setAddonsPaidBase(0);
      return;
    }

    const { startIso, endIso } = manilaDayRange(dateYMD);

    const res = await supabase
      .from("customer_session_add_ons")
      .select("created_at, full_name, seat_number, gcash_amount, cash_amount")
      .gte("created_at", startIso)
      .lt("created_at", endIso);

    if (res.error) {
      console.error("addonsPaid(payment) query error:", res.error.message);
      setAddonsPaidBase(0);
      return;
    }

    const rows = (res.data ?? []) as AddOnPaymentRow[];
    const onlyWithAnyPayment = rows.filter(
      (r) => toNumber(r.gcash_amount) > 0 || toNumber(r.cash_amount) > 0
    );

    setAddonsPaidBase(computeAddonsPaidFromPayments(onlyWithAnyPayment));
  };

const loadCustomerOrderPaid = async (dateYMD: string): Promise<void> => {
  if (!isYMD(dateYMD)) {
    setCustomerOrderPaid(0);
    return;
  }

  const { startIso, endIso } = manilaDayRange(dateYMD);

  const payRes = await supabase
    .from("customer_order_payments")
    .select("booking_code, paid_at, is_paid")
    .gte("paid_at", startIso)
    .lt("paid_at", endIso);

  if (payRes.error) {
    console.error("customer_order_payments query error:", payRes.error.message);
    setCustomerOrderPaid(0);
    return;
  }

    const paidBookingCodes = Array.from(
      new Set(
        ((payRes.data ?? []) as CustomerOrderPaymentRow[])
          .filter((r) => toBool(r.is_paid) && !!r.paid_at)
          .map((r) => String(r.booking_code ?? "").trim().toUpperCase())
          .filter(Boolean)
      )
    );

    if (paidBookingCodes.length === 0) {
      setCustomerOrderPaid(0);
      return;
    }

    const addonRes = await supabase
      .from("addon_orders")
      .select("booking_code, total_amount")
      .in("booking_code", paidBookingCodes);

    if (addonRes.error) {
      console.error("addon_orders paid query error:", addonRes.error.message);
      setCustomerOrderPaid(0);
      return;
    }

    const total = ((addonRes.data ?? []) as Array<{ booking_code: string; total_amount: number | string }>)
      .reduce((sum, row) => sum + Math.max(0, toNumber(row.total_amount)), 0);

    setCustomerOrderPaid(round2(total));
  };

  const loadReservationPaymentPlacement = async (dateYMD: string): Promise<void> => {
    if (!isYMD(dateYMD)) {
      setReservationDownCash(0);
      setReservationDownGcash(0);
      setReservationAdvanceCash(0);
      setReservationAdvanceGcash(0);
      return;
    }

    const { startIso, endIso } = manilaDayRange(dateYMD);

    const res = await supabase
      .from("customer_sessions")
      .select("paid_at, is_paid, reservation_date, gcash_amount, cash_amount")
      .eq("reservation", "yes")
      .gte("paid_at", startIso)
      .lt("paid_at", endIso);

    if (res.error) {
      console.error("reservation payment placement query error:", res.error.message);
      setReservationDownCash(0);
      setReservationDownGcash(0);
      setReservationAdvanceCash(0);
      setReservationAdvanceGcash(0);
      return;
    }

    const rows = (res.data ?? []) as ReservationPaymentPlacementRow[];

    let todayCash = 0;
    let todayGcash = 0;
    let advanceCash = 0;
    let advanceGcash = 0;

    for (const r of rows) {
      if (!toBool(r.is_paid) || !r.paid_at) continue;

      const reservationYMD = String(r.reservation_date ?? "").trim();
      const cash = Math.max(0, toNumber(r.cash_amount));
      const gcash = Math.max(0, toNumber(r.gcash_amount));

      if (reservationYMD === dateYMD) {
        todayCash += cash;
        todayGcash += gcash;
      } else if (reservationYMD > dateYMD) {
        advanceCash += cash;
        advanceGcash += gcash;
      }
    }

    setReservationDownCash(round2(todayCash));
    setReservationDownGcash(round2(todayGcash));
    setReservationAdvanceCash(round2(advanceCash));
    setReservationAdvanceGcash(round2(advanceGcash));
  };

  const loadPromoPaymentPlacement = async (dateYMD: string): Promise<void> => {
    if (!isYMD(dateYMD)) {
      setPromoTodayCash(0);
      setPromoTodayGcash(0);
      setPromoAdvanceCash(0);
      setPromoAdvanceGcash(0);
      return;
    }

    const { startIso, endIso } = manilaDayRange(dateYMD);

    const res = await supabase
      .from("promo_bookings")
      .select("paid_at, is_paid, start_at, gcash_amount, cash_amount")
      .gte("paid_at", startIso)
      .lt("paid_at", endIso);

    if (res.error) {
      console.error("promo payment placement query error:", res.error.message);
      setPromoTodayCash(0);
      setPromoTodayGcash(0);
      setPromoAdvanceCash(0);
      setPromoAdvanceGcash(0);
      return;
    }

    const rows = (res.data ?? []) as PromoPaymentRow[];

    let todayCash = 0;
    let todayGcash = 0;
    let advanceCash = 0;
    let advanceGcash = 0;

    for (const r of rows) {
      if (!toBool(r.is_paid) || !r.paid_at) continue;

      const availYMD = r.start_at ? isoToLocalYMD(r.start_at) : "";
      const cash = Math.max(0, toNumber(r.cash_amount));
      const gcash = Math.max(0, toNumber(r.gcash_amount));

      if (availYMD === dateYMD) {
        todayCash += cash;
        todayGcash += gcash;
      } else if (availYMD > dateYMD) {
        advanceCash += cash;
        advanceGcash += gcash;
      }
    }

    setPromoTodayCash(round2(todayCash));
    setPromoTodayGcash(round2(todayGcash));
    setPromoAdvanceCash(round2(advanceCash));
    setPromoAdvanceGcash(round2(advanceGcash));
  };

  const loadWalkinSystemPaidAndDiscount = async (dateYMD: string): Promise<void> => {
    if (!isYMD(dateYMD)) {
      setWalkinSystemPaid(0);
      setWalkinDiscountAmount(0);
      return;
    }

    const { startIso, endIso } = manilaDayRange(dateYMD);

    const res = await supabase
      .from("customer_sessions")
      .select("paid_at, is_paid, reservation, total_amount, discount_kind, discount_value")
      .eq("reservation", "no")
      .gte("paid_at", startIso)
      .lt("paid_at", endIso);

    if (res.error) {
      console.error("walkin system paid query error:", res.error.message);
      setWalkinSystemPaid(0);
      setWalkinDiscountAmount(0);
      return;
    }

    const rows = (res.data ?? []) as WalkinSystemPaidRow[];

    let systemSum = 0;
    let discountSum = 0;

    for (const r of rows) {
      if (!toBool(r.is_paid) || !r.paid_at) continue;

      const base = Math.max(0, toNumber(r.total_amount));
      const kind = (r.discount_kind ?? "none") as DiscountKind;
      const value = Math.max(0, toNumber(r.discount_value));

      const discountAmt = computeDiscountAmountFromBaseCost(base, kind, value);
      const finalSystemCost = applyDiscountToBase(base, kind, value);

      systemSum += finalSystemCost;
      discountSum += discountAmt;
    }

    setWalkinSystemPaid(round2(systemSum));
    setWalkinDiscountAmount(round2(discountSum));
  };

  const loadReservationTimeAndDiscount = async (dateYMD: string): Promise<void> => {
    if (!isYMD(dateYMD)) {
      setReservationTimeBase(0);
      setReservationDiscountAmount(0);
      return;
    }

    const nowIso = new Date().toISOString();

    const res = await supabase
      .from("customer_sessions")
      .select("reservation_date, time_started, time_ended, hour_avail, is_paid, discount_kind, discount_value")
      .eq("reservation", "yes")
      .eq("reservation_date", dateYMD)
      .eq("is_paid", true);

    if (res.error) {
      console.error("reservation time query error:", res.error.message);
      setReservationTimeBase(0);
      setReservationDiscountAmount(0);
      return;
    }

    const rows = (res.data ?? []) as ReservationForTimeRow[];

    let timeSum = 0;
    let discountSum = 0;

    for (const s of rows) {
      if (!s.is_paid) continue;

      const startIso = String(s.time_started ?? "").trim();
      if (!startIso) continue;

      const open = isOpenTimeSession(s.hour_avail, s.time_ended);
      const endIso = open ? nowIso : String(s.time_ended ?? "").trim();
      if (!endIso) continue;

      const baseCost = computeCostWithFreeMinutes(startIso, endIso);
      timeSum += baseCost;

      const dAmt = computeDiscountAmountFromBaseCost(
        baseCost,
        s.discount_kind,
        s.discount_value
      );
      discountSum += dAmt;
    }

    setReservationTimeBase(round2(timeSum));
    setReservationDiscountAmount(round2(discountSum));
  };

  const loadPromoDiscountAmount = async (dateYMD: string): Promise<void> => {
    if (!isYMD(dateYMD)) {
      setPromoDiscountAmount(0);
      return;
    }

    const { startIso, endIso } = manilaDayRange(dateYMD);

    const res = await supabase
      .from("promo_bookings")
      .select("paid_at, is_paid, price, discount_kind, discount_value")
      .gte("paid_at", startIso)
      .lt("paid_at", endIso);

    if (res.error) {
      console.error("promo discount query error:", res.error.message);
      setPromoDiscountAmount(0);
      return;
    }

    const rows = (res.data ?? []) as PromoDiscountRow[];

    let discountSum = 0;

    for (const row of rows) {
      if (!toBool(row.is_paid) || !row.paid_at) continue;

      const base = Math.max(0, toNumber(row.price));
      const dAmt = computeDiscountAmountFromBaseCost(
        base,
        row.discount_kind,
        row.discount_value
      );

      discountSum += dAmt;
    }

    setPromoDiscountAmount(round2(discountSum));
  };

  const loadCashOutsTotal = async (dateYMD: string): Promise<void> => {
    if (!isYMD(dateYMD)) {
      setCashOutsCash(0);
      setCashOutsGcash(0);
      return;
    }

    const res = await supabase
      .from("cash_outs")
      .select("amount, cashout_date, payment_method")
      .eq("cashout_date", dateYMD);

    if (res.error) {
      const fallback = await supabase
        .from("cash_outs")
        .select("amount, cashout_date")
        .eq("cashout_date", dateYMD);

      if (fallback.error) {
        console.error("cash_outs query error:", fallback.error.message);
        setCashOutsCash(0);
        setCashOutsGcash(0);
        return;
      }

      const rows = (fallback.data ?? []) as Array<{ amount: number | string | null }>;
      const total = rows.reduce((sum, r) => sum + toNumber(r.amount), 0);
      setCashOutsCash(round2(total));
      setCashOutsGcash(0);
      return;
    }

    const rows = (res.data ?? []) as Array<{
      amount: number | string | null;
      payment_method?: CashOutMethod | null;
    }>;

    const cash = rows
      .filter((r) => (r.payment_method ?? "cash") === "cash")
      .reduce((sum, r) => sum + toNumber(r.amount), 0);

    const gcash = rows
      .filter((r) => (r.payment_method ?? "cash") === "gcash")
      .reduce((sum, r) => sum + toNumber(r.amount), 0);

    setCashOutsCash(round2(cash));
    setCashOutsGcash(round2(gcash));
  };

  const upsertQty = async (line: CashLine, qty: number): Promise<void> => {
    if (!report || submitting) return;

    const res = await supabase
      .from("daily_cash_count_lines")
      .upsert(
        {
          report_id: line.report_id,
          money_kind: line.money_kind,
          denomination: line.denomination,
          qty,
        },
        { onConflict: "report_id,money_kind,denomination" }
      );

    if (res.error) {
      console.error("daily_cash_count_lines upsert error:", res.error.message);
      return;
    }

    setLines((prev) =>
      prev.map((x) =>
        x.money_kind === line.money_kind && x.denomination === line.denomination
          ? { ...x, qty }
          : x
      )
    );

    await loadTotals(selectedDate);
  };

  const updateReportField = async (
    field: "starting_cash" | "starting_gcash" | "bilin_amount",
    valueNum: number
  ): Promise<void> => {
    if (!report || submitting) return;

    const safe = Math.max(0, valueNum);
    const res = await supabase
      .from("daily_sales_reports")
      .update({ [field]: safe })
      .eq("id", report.id);

    if (res.error) {
      console.error("daily_sales_reports update error:", res.error.message);
      return;
    }

    setReport((prev) => (prev ? { ...prev, [field]: safe } : prev));
    await loadTotals(selectedDate);
  };

  const reloadEverything = async (): Promise<void> => {
    await loadReport(selectedDate);
    await loadTotals(selectedDate);
    await loadConsignment(selectedDate);
    await loadAddonsPaidBase(selectedDate);
    await loadCustomerOrderPaid(selectedDate);
    await loadReservationPaymentPlacement(selectedDate);
    await loadPromoPaymentPlacement(selectedDate);
    await loadWalkinSystemPaidAndDiscount(selectedDate);
    await loadReservationTimeAndDiscount(selectedDate);
    await loadPromoDiscountAmount(selectedDate);
    await loadCashOutsTotal(selectedDate);
    await loadInventoryLossAmount(selectedDate);
  };

  const onSubmitDone = async (): Promise<void> => {
    if (!report) return;

    if (!isYMD(selectedDate)) {
      setToast({ open: true, msg: "Invalid date. Use YYYY-MM-DD.", color: "danger" });
      return;
    }

    setSubmitting(true);

    const r1 = await supabase
      .from("daily_sales_reports")
      .update({
        starting_cash: Math.max(0, toNumber(report.starting_cash)),
        starting_gcash: Math.max(0, toNumber(report.starting_gcash)),
        bilin_amount: Math.max(0, toNumber(report.bilin_amount)),
      })
      .eq("id", report.id);

    if (r1.error) {
      setToast({ open: true, msg: `Save failed: ${r1.error.message}`, color: "danger" });
      setSubmitting(false);
      return;
    }

    const payload = lines.map((l) => ({
      report_id: l.report_id,
      money_kind: l.money_kind,
      denomination: l.denomination,
      qty: Math.max(0, Math.floor(toNumber(l.qty))),
    }));

    if (payload.length > 0) {
      const r2 = await supabase
        .from("daily_cash_count_lines")
        .upsert(payload, { onConflict: "report_id,money_kind,denomination" });

      if (r2.error) {
        setToast({ open: true, msg: `Save lines failed: ${r2.error.message}`, color: "danger" });
        setSubmitting(false);
        return;
      }
    }

    const res = await supabase
      .from("daily_sales_reports")
      .update({ is_submitted: true, submitted_at: new Date().toISOString() })
      .eq("id", report.id);

    if (res.error) {
      setToast({ open: true, msg: `Submit failed: ${res.error.message}`, color: "danger" });
      setSubmitting(false);
      return;
    }

    await reloadEverything();
    setToast({ open: true, msg: `Saved for ${selectedDate}.`, color: "success" });
    setSubmitting(false);
  };

  const deleteByDate = async (): Promise<void> => {
    if (!isYMD(selectedDate)) {
      setToast({ open: true, msg: "Invalid date.", color: "danger" });
      return;
    }

    setSubmitting(true);

    const find = await supabase
      .from("daily_sales_reports")
      .select("id")
      .eq("report_date", selectedDate)
      .maybeSingle<{ id: string }>();

    if (find.error) {
      setToast({ open: true, msg: `Delete failed: ${find.error.message}`, color: "danger" });
      setSubmitting(false);
      return;
    }

    const reportId = find.data?.id;
    if (!reportId) {
      setToast({ open: true, msg: "No report found for that date.", color: "warning" });
      setSubmitting(false);
      return;
    }

    const d1 = await supabase.from("daily_cash_count_lines").delete().eq("report_id", reportId);
    if (d1.error) {
      setToast({ open: true, msg: `Delete lines failed: ${d1.error.message}`, color: "danger" });
      setSubmitting(false);
      return;
    }

    const d2 = await supabase.from("daily_sales_reports").delete().eq("id", reportId);
    if (d2.error) {
      setToast({ open: true, msg: `Delete report failed: ${d2.error.message}`, color: "danger" });
      setSubmitting(false);
      return;
    }

    setToast({ open: true, msg: `Deleted report for ${selectedDate}.`, color: "success" });
    setDeleteAlertOpen(false);
    await reloadEverything();
    setSubmitting(false);
  };

  useEffect(() => {
    void loadReport(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    if (!report) return;

    setStartingCashInput(String(toNumber(report.starting_cash)));
    setStartingGcashInput(String(toNumber(report.starting_gcash)));
    setBilinInput(String(toNumber(report.bilin_amount)));

    void loadCashLines(report.id);
    void loadTotals(selectedDate);
    void loadConsignment(selectedDate);
    void loadAddonsPaidBase(selectedDate);
    void loadCustomerOrderPaid(selectedDate);
    void loadReservationPaymentPlacement(selectedDate);
    void loadPromoPaymentPlacement(selectedDate);
    void loadWalkinSystemPaidAndDiscount(selectedDate);
    void loadReservationTimeAndDiscount(selectedDate);
    void loadPromoDiscountAmount(selectedDate);
    void loadCashOutsTotal(selectedDate);
    void loadInventoryLossAmount(selectedDate);
  }, [report, selectedDate]);

  useEffect(() => {
    if (!toast.open) return;
    const t = window.setTimeout(() => {
      setToast((prev) => ({ ...prev, open: false }));
    }, 2400);
    return () => window.clearTimeout(t);
  }, [toast.open]);

  const cashTotal = useMemo(() => {
    return lines
      .filter((l) => l.money_kind === "cash")
      .reduce((sum, l) => sum + l.denomination * l.qty, 0);
  }, [lines]);

  const coinTotal = useMemo(() => {
    return lines
      .filter((l) => l.money_kind === "coin")
      .reduce((sum, l) => sum + l.denomination * l.qty, 0);
  }, [lines]);

  const cashSales = totals ? toNumber(totals.cash_sales) : 0;
  const gcashSales = totals ? toNumber(totals.gcash_sales) : 0;

  const cohCash = cashTotal + coinTotal;
  const cohGcash = gcashSales;

  const walkinPaymentCash = totals ? toNumber(totals.walkin_cash) : 0;
  const walkinPaymentGcash = totals ? toNumber(totals.walkin_gcash) : 0;

  const totalPaymentCash = round2(
    walkinPaymentCash +
      reservationDownCash +
      reservationAdvanceCash +
      promoTodayCash +
      promoAdvanceCash
  );

  const totalPaymentGcash = round2(
    walkinPaymentGcash +
      reservationDownGcash +
      reservationAdvanceGcash +
      promoTodayGcash +
      promoAdvanceGcash
  );

  const startingCash = report ? toNumber(report.starting_cash) : 0;
  const startingGcash = report ? toNumber(report.starting_gcash) : 0;

  const addonsTotalWithCustomerOrders = round2(addonsPaidBase + customerOrderPaid);
  const totalTimeAmount = round2(walkinSystemPaid + reservationTimeBase);

  const discount = round2(
    walkinDiscountAmount + reservationDiscountAmount + promoDiscountAmount
  );

  const bilin = report ? toNumber(report.bilin_amount) : 0;

  const actualSystem = round2(
    (totalPaymentCash + totalPaymentGcash) - (startingCash + startingGcash)
  );

  const salesSystemComputed = round2(
    addonsTotalWithCustomerOrders + totalTimeAmount - discount
  );

  const salesCollectedDisplay = round2(actualSystem - bilin);

  const categoryRows: Array<{ label: string; cash: number; gcash: number; total?: boolean }> = [
    { label: "Starting Balance", cash: startingCash, gcash: startingGcash },
    { label: "COH / Total of the Day", cash: cohCash, gcash: cohGcash },
    { label: "Cash Outs", cash: cashOutsCash, gcash: cashOutsGcash },
    { label: "Walk-in Payments", cash: walkinPaymentCash, gcash: walkinPaymentGcash },
    {
      label: "Reservation Payments (Same Day)",
      cash: reservationDownCash,
      gcash: reservationDownGcash,
    },
    {
      label: "Reservation Advance Payments",
      cash: reservationAdvanceCash,
      gcash: reservationAdvanceGcash,
    },
    {
      label: "Promo Payments (Same Day)",
      cash: promoTodayCash,
      gcash: promoTodayGcash,
    },
    {
      label: "Promo Advance Payments",
      cash: promoAdvanceCash,
      gcash: promoAdvanceGcash,
    },
    {
      label: "Total Payment Collections",
      cash: totalPaymentCash,
      gcash: totalPaymentGcash,
      total: true,
    },
  ];

  const otherTotals: Array<{ label: string; value: number }> = [
    { label: "Add-ons (Paid)", value: addonsTotalWithCustomerOrders },
    { label: "Discount (Amount)", value: discount },
    { label: "Total Time", value: totalTimeAmount },
  ];

const exportToPDF = (): void => {
  if (!report || !isYMD(selectedDate)) {
    setToast({ open: true, msg: "Pick a valid date first.", color: "danger" });
    return;
  }

  const cashLines = lines.filter((x) => x.money_kind === "cash");
  const coinLines = lines.filter((x) => x.money_kind === "coin");

  const categoryHtml = categoryRows
    .map(
      (row) => `
        <tr ${row.total ? 'class="total-row"' : ""}>
          <td>${row.label}</td>
          <td class="num">${peso(row.cash)}</td>
          <td class="num">${peso(row.gcash)}</td>
        </tr>
      `
    )
    .join("");

  const cashRows = cashLines
    .map(
      (l) => `
        <tr>
          <td>${l.denomination}</td>
          <td class="center">${l.qty}</td>
          <td class="num">${peso(l.denomination * l.qty)}</td>
        </tr>
      `
    )
    .join("");

  const coinRows = coinLines
    .map(
      (l) => `
        <tr>
          <td>${l.denomination}</td>
          <td class="center">${l.qty}</td>
          <td class="num">${peso(l.denomination * l.qty)}</td>
        </tr>
      `
    )
    .join("");

  const otherHtml = `
    <div class="mini-row"><span>Add-ons (Paid)</span><strong>${peso(addonsTotalWithCustomerOrders)}</strong></div>
    <div class="mini-row"><span>Discount (Amount)</span><strong>${peso(discount)}</strong></div>
    <div class="mini-row"><span>Total Time</span><strong>${peso(totalTimeAmount)}</strong></div>
    <div class="mini-row"><span>Cash Sales</span><strong>${peso(cashSales)}</strong></div>
    <div class="mini-row"><span>GCash Sales</span><strong>${peso(gcashSales)}</strong></div>
    <div class="mini-row"><span>Consignment Sales</span><strong>${peso(consignment.gross)}</strong></div>
    <div class="mini-row"><span>Consignment 15%</span><strong>${peso(consignment.fee15)}</strong></div>
    <div class="mini-row"><span>Consignment Net</span><strong>${peso(consignment.net)}</strong></div>
    <div class="mini-row"><span>Inventory Loss</span><strong>${peso(inventoryLossAmount)}</strong></div>
    <div class="mini-row"><span>Bilin</span><strong>${peso(bilin)}</strong></div>
  `;

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Admin Sales Report ${selectedDate}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 6mm;
          }

          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          html,
          body {
            margin: 0;
            padding: 0;
            font-family: "Segoe UI", Arial, sans-serif;
            background: #f7f2e9;
            color: #1f1a16;
          }

          body {
            font-size: 9px;
            line-height: 1.28;
          }

          .page {
            width: 198mm;
            min-height: 284mm;
            margin: 0 auto;
            padding: 4mm;
            background: #f7f2e9;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }

          .hero {
            padding: 10px 12px;
            border-radius: 16px;
            background: linear-gradient(135deg, #b58a52, #d4b07b);
            color: #fff;
            margin-bottom: 8px;
          }

          .hero-top {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            align-items: flex-start;
          }

          .hero-title {
            margin: 0;
            font-size: 16px;
            font-weight: 800;
            letter-spacing: -0.02em;
          }

          .hero-sub {
            margin: 4px 0 0;
            font-size: 7px;
            opacity: 0.96;
          }

          .hero-badge {
            padding: 5px 10px;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.18);
            border: 1px solid rgba(255, 255, 255, 0.22);
            font-size: 7px;
            font-weight: 700;
            white-space: nowrap;
          }

          .stats {
            margin-top: 8px;
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 6px;
          }

          .stat {
            border-radius: 10px;
            background: rgba(255, 255, 255, 0.14);
            border: 1px solid rgba(255, 255, 255, 0.18);
            padding: 7px 9px;
          }

          .stat-label {
            font-size: 6px;
            text-transform: uppercase;
            opacity: 0.88;
            margin-bottom: 2px;
          }

          .stat-value {
            font-size: 9px;
            font-weight: 800;
          }

          .main {
            flex: 1 1 auto;
            display: grid;
            grid-template-rows: auto 1fr auto;
            min-height: 0;
          }

          .grid {
            display: grid;
            grid-template-columns: 1.08fr 0.92fr;
            gap: 8px;
            align-items: start;
            min-height: 0;
          }

          .col {
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .card {
            background: #fffaf2;
            border: 1px solid #e8dcc7;
            border-radius: 14px;
            padding: 8px;
            page-break-inside: avoid;
            break-inside: avoid;
          }

          .card.fill-space {
            flex: 1 1 auto;
          }

          .card-title {
            font-size: 10px;
            font-weight: 800;
            color: #5c4727;
            margin: 0 0 6px;
            padding-bottom: 4px;
            border-bottom: 1px solid #eadfcf;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 7.5px;
          }

          th {
            text-align: left;
            padding: 4px 5px;
            background: #f3e7d3;
            border-bottom: 1px solid #dfcfb5;
            color: #543f1f;
          }

          td {
            padding: 4px 5px;
            border-bottom: 1px solid #efe5d6;
            vertical-align: middle;
          }

          tr:last-child td {
            border-bottom: none;
          }

          .num {
            text-align: right;
            font-weight: 700;
          }

          .center {
            text-align: center;
          }

          .total-row td {
            background: #f6ecdc;
            font-weight: 800;
            color: #5b4420;
          }

          .feature-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px;
          }

          .feature {
            border-radius: 10px;
            background: #f8efdf;
            border: 1px solid #ead8bb;
            padding: 7px 8px;
          }

          .feature-label {
            font-size: 6px;
            color: #7a6544;
            margin-bottom: 3px;
          }

          .feature-value {
            font-size: 9px;
            font-weight: 800;
            color: #3f3018;
          }

          .mini-list {
            display: grid;
            gap: 5px;
          }

          .mini-row {
            display: flex;
            justify-content: space-between;
            gap: 8px;
            padding: 6px 8px;
            border-radius: 9px;
            background: #fcf7ef;
            border: 1px solid #eee1ce;
            font-size: 7px;
          }

          .cash-tables {
            display: grid;
            gap: 6px;
          }

          .footer-note {
            margin-top: 6px;
            font-size: 6px;
            color: #7f715d;
            text-align: right;
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="hero">
            <div class="hero-top">
              <div>
                <h1 class="hero-title">Admin Sales Report</h1>
                <p class="hero-sub">Premium daily summary of collections, cash count, and totals</p>
              </div>
              <div class="hero-badge">${selectedDate}</div>
            </div>

            <div class="stats">
              <div class="stat">
                <div class="stat-label">Status</div>
                <div class="stat-value">${report.is_submitted ? "SUBMITTED" : "DRAFT"}</div>
              </div>
              <div class="stat">
                <div class="stat-label">Actual System</div>
                <div class="stat-value">${peso(actualSystem)}</div>
              </div>
              <div class="stat">
                <div class="stat-label">Sales Collected</div>
                <div class="stat-value">${peso(salesCollectedDisplay)}</div>
              </div>
            </div>
          </div>

          <div class="main">
            <div class="grid">
              <div class="col">
                <div class="card">
                  <div class="card-title">Category Summary</div>
                  <table>
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th>Cash</th>
                        <th>GCash</th>
                      </tr>
                    </thead>
                    <tbody>${categoryHtml}</tbody>
                  </table>
                </div>

                <div class="card">
                  <div class="card-title">System Overview</div>
                  <div class="feature-grid">
                    <div class="feature">
                      <div class="feature-label">Actual System</div>
                      <div class="feature-value">${peso(actualSystem)}</div>
                    </div>
                    <div class="feature">
                      <div class="feature-label">Sales System / Total Cost</div>
                      <div class="feature-value">${peso(salesSystemComputed)}</div>
                    </div>
                  </div>
                </div>

                <div class="card fill-space">
                  <div class="card-title">Other Totals</div>
                  <div class="mini-list">
                    ${otherHtml}
                  </div>
                </div>
              </div>

              <div class="col">
                <div class="card fill-space">
                  <div class="card-title">Cash Count</div>
                  <div class="cash-tables">
                    <table>
                      <thead>
                        <tr>
                          <th>Cash</th>
                          <th>Qty</th>
                          <th>Amount</th>
                        </tr>
                      </thead>
                      <tbody>${cashRows}</tbody>
                    </table>

                    <table>
                      <thead>
                        <tr>
                          <th>Coins</th>
                          <th>Qty</th>
                          <th>Amount</th>
                        </tr>
                      </thead>
                      <tbody>${coinRows}</tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            <div class="footer-note">Print this page and choose "Save as PDF". Optimized for one A4 page.</div>
          </div>
        </div>

        <script>
          window.onload = () => window.print();
        </script>
      </body>
    </html>
  `;

  const w = window.open("", "_blank");
  if (!w) {
    setToast({
      open: true,
      msg: "Popup blocked. Allow popups then try again.",
      color: "danger",
    });
    return;
  }

  w.document.open();
  w.document.write(html);
  w.document.close();

  setToast({ open: true, msg: "Opened print view. Save as PDF.", color: "success" });
};

  const exportToExcel = async (): Promise<void> => {
    if (!report || !isYMD(selectedDate)) {
      setToast({ open: true, msg: "Pick a valid date first.", color: "danger" });
      return;
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Admin Sales Report");
    ws.columns = [
      { width: 34 },
      { width: 18 },
      { width: 18 },
      { width: 18 },
    ];

    ws.mergeCells("A1:C1");
    ws.getCell("A1").value = "ADMIN SALES REPORT";
    ws.getCell("A1").font = { size: 18, bold: true };
    ws.getCell("A2").value = `Date: ${selectedDate}`;

    let row = 4;
    ws.getCell(`A${row}`).value = "CATEGORY";
    ws.getCell(`B${row}`).value = "CASH";
    ws.getCell(`C${row}`).value = "GCASH";
    row++;

    for (const item of categoryRows) {
      ws.getCell(`A${row}`).value = item.label;
      ws.getCell(`B${row}`).value = item.cash;
      ws.getCell(`C${row}`).value = item.gcash;
      ws.getCell(`B${row}`).numFmt = "₱#,##0.00";
      ws.getCell(`C${row}`).numFmt = "₱#,##0.00";
      row++;
    }

    row++;
    ws.getCell(`A${row}`).value = "Actual System";
    ws.getCell(`B${row}`).value = actualSystem;
    ws.getCell(`B${row}`).numFmt = "₱#,##0.00";
    row++;

    ws.getCell(`A${row}`).value = "Sales System / Total Cost";
    ws.getCell(`B${row}`).value = salesSystemComputed;
    ws.getCell(`B${row}`).numFmt = "₱#,##0.00";
    row += 2;

    ws.getCell(`A${row}`).value = "OTHER TOTALS";
    row++;
    for (const item of otherTotals) {
      ws.getCell(`A${row}`).value = item.label;
      ws.getCell(`B${row}`).value = item.value;
      ws.getCell(`B${row}`).numFmt = "₱#,##0.00";
      row++;
    }

    const buffer = await wb.xlsx.writeBuffer();
    saveAs(
      new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      `Admin_Sales_Report_${selectedDate}.xlsx`
    );

    setToast({ open: true, msg: "Excel exported.", color: "success" });
  };

  if (loading) {
    return (
      <div className="asr-page">
        <div className="asr-shell">
          <div className="asr-loading-card">
            <div className="asr-spinner" />
            <span>Loading report...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="asr-page">
      <div className="asr-shell">
        <div className="asr-topbar">
          <div className="asr-topbar-left">
            <div className="asr-top-label">Admin Sales Report</div>
            <div className="asr-status">
              Status: <strong>{report?.is_submitted ? "SUBMITTED" : "DRAFT"}</strong>
              {report?.submitted_at ? (
                <span className="asr-status-sub">
                  Last submit: {new Date(report.submitted_at).toLocaleString()}
                </span>
              ) : null}
            </div>
          </div>

          <div className="asr-topbar-right">
            <div className="asr-topbar-row">
              <div className="asr-date-wrap">
                <input
                  type="date"
                  className="asr-date-input"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  disabled={submitting}
                />
              </div>

              <div className="asr-actions">
                <button
                  type="button"
                  className="asr-btn asr-btn-ghost"
                  onClick={() => void exportToExcel()}
                  disabled={submitting || !report}
                >
                  Export Excel
                </button>

                <button
                  type="button"
                  className="asr-btn asr-btn-ghost"
                  onClick={exportToPDF}
                  disabled={submitting || !report}
                >
                  Export PDF
                </button>

                <button
                  type="button"
                  className="asr-btn asr-btn-danger"
                  onClick={() => setDeleteAlertOpen(true)}
                  disabled={submitting || !isYMD(selectedDate)}
                >
                  Delete
                </button>

                <button
                  type="button"
                  className="asr-btn asr-btn-primary"
                  onClick={() => void onSubmitDone()}
                  disabled={submitting || !report}
                >
                  {submitting ? "Saving..." : "Save / Submit"}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="asr-main-grid">
          <div className="asr-left-column">
            <div className="asr-panel asr-panel-category">
              <div className="asr-section-head asr-section-head-3">
                <div>CATEGORY</div>
                <div className="center">CASH</div>
                <div className="center">GCASH</div>
              </div>

              <div className="asr-category-list">
                <div className="asr-category-row is-balance">
                  <div className="asr-category-label">Starting Balance</div>

                  <input
                    className="asr-balance-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={startingCashInput}
                    onFocus={() => {
                      if (toNumber(startingCashInput) === 0) setStartingCashInput("");
                    }}
                    onChange={(e) => {
                      const v = e.target.value;
                      setStartingCashInput(v);
                      setReport((prev) =>
                        prev ? { ...prev, starting_cash: v === "" ? 0 : Math.max(0, Number(v)) } : prev
                      );
                    }}
                    onBlur={() => {
                      const parsed = Math.max(0, toNumber(startingCashInput));
                      setStartingCashInput(String(parsed));
                      void updateReportField("starting_cash", parsed);
                    }}
                  />

                  <input
                    className="asr-balance-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={startingGcashInput}
                    onFocus={() => {
                      if (toNumber(startingGcashInput) === 0) setStartingGcashInput("");
                    }}
                    onChange={(e) => {
                      const v = e.target.value;
                      setStartingGcashInput(v);
                      setReport((prev) =>
                        prev ? { ...prev, starting_gcash: v === "" ? 0 : Math.max(0, Number(v)) } : prev
                      );
                    }}
                    onBlur={() => {
                      const parsed = Math.max(0, toNumber(startingGcashInput));
                      setStartingGcashInput(String(parsed));
                      void updateReportField("starting_gcash", parsed);
                    }}
                  />
                </div>

                {categoryRows
                  .filter((r) => r.label !== "Starting Balance")
                  .map((row) => (
                    <div
                      key={row.label}
                      className={`asr-category-row ${row.total ? "is-total" : ""}`}
                    >
                      <div className="asr-category-label">{row.label}</div>
                      <div className="asr-money-pill">{peso(row.cash)}</div>
                      <div className="asr-money-pill">{peso(row.gcash)}</div>
                    </div>
                  ))}
              </div>

              <div className="asr-metric-pair">
                <div className="asr-feature-card">
                  <div className="asr-feature-title">Actual System</div>
                  <div className="asr-feature-value">{peso(actualSystem)}</div>
                </div>

                <div className="asr-feature-card">
                  <div className="asr-feature-title">Sales System / Total Cost</div>
                  <div className="asr-feature-value">{peso(salesSystemComputed)}</div>
                </div>
              </div>

              <div className="asr-summary-grid">
                <div className="asr-summary-box">
                  <div className="asr-summary-title">Cash Sales</div>
                  <div className="asr-summary-value">{peso(cashSales)}</div>
                </div>
                <div className="asr-summary-box">
                  <div className="asr-summary-title">GCash Sales</div>
                  <div className="asr-summary-value">{peso(gcashSales)}</div>
                </div>
                <div className="asr-summary-box">
                  <div className="asr-summary-title">Consignment Sales</div>
                  <div className="asr-summary-value">{peso(consignment.gross)}</div>
                </div>
                <div className="asr-summary-box">
                  <div className="asr-summary-title">Consignment 15%</div>
                  <div className="asr-summary-value">{peso(consignment.fee15)}</div>
                </div>
                <div className="asr-summary-box">
                  <div className="asr-summary-title">Consignment Net</div>
                  <div className="asr-summary-value">{peso(consignment.net)}</div>
                </div>
                <div className="asr-summary-box">
                  <div className="asr-summary-title">Inventory Loss</div>
                  <div className="asr-summary-value">{peso(inventoryLossAmount)}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="asr-right-column">
            <div className="asr-panel">
              <div className="asr-cash-header">
                <div className="asr-panel-title">Cash Count</div>
                <div className="asr-mini-badge">
                  Cash: {peso(cashTotal)} | Coins: {peso(coinTotal)}
                </div>
              </div>

              <div className="asr-subtable">
                <div className="asr-subtable-head">
                  <div>CASH</div>
                  <div className="center">QTY</div>
                  <div className="right">AMOUNT</div>
                </div>

                {lines
                  .filter((l) => l.money_kind === "cash")
                  .map((line) => (
                    <div key={`cash-${line.denomination}`} className="asr-subtable-row">
                      <div className="asr-denom">{line.denomination}</div>
                      <div className="center">
                        <input
                          className="asr-qty-input"
                          type="number"
                          min="0"
                          step="1"
                          value={line.qty === 0 ? "" : line.qty}
                          placeholder="0"
                          onChange={(e) => {
                            const raw = e.target.value;
                            const qty = raw === "" ? 0 : Math.max(0, Math.floor(Number(raw)));
                            setLines((prev) =>
                              prev.map((x) =>
                                x.money_kind === line.money_kind &&
                                x.denomination === line.denomination
                                  ? { ...x, qty }
                                  : x
                              )
                            );
                          }}
                          onBlur={(e) => {
                            const raw = e.target.value;
                            const qty = raw === "" ? 0 : Math.max(0, Math.floor(Number(raw)));
                            void upsertQty(line, qty);
                          }}
                        />
                      </div>
                      <div className="right strong">{peso(line.denomination * line.qty)}</div>
                    </div>
                  ))}

                <div className="asr-subtable-total">
                  <span>TOTAL CASH</span>
                  <strong>{peso(cashTotal)}</strong>
                </div>
              </div>

              <div className="asr-subtable">
                <div className="asr-subtable-head">
                  <div>COINS</div>
                  <div className="center">QTY</div>
                  <div className="right">AMOUNT</div>
                </div>

                {lines
                  .filter((l) => l.money_kind === "coin")
                  .map((line) => (
                    <div key={`coin-${line.denomination}`} className="asr-subtable-row">
                      <div className="asr-denom">{line.denomination}</div>
                      <div className="center">
                        <input
                          className="asr-qty-input"
                          type="number"
                          min="0"
                          step="1"
                          value={line.qty === 0 ? "" : line.qty}
                          placeholder="0"
                          onChange={(e) => {
                            const raw = e.target.value;
                            const qty = raw === "" ? 0 : Math.max(0, Math.floor(Number(raw)));
                            setLines((prev) =>
                              prev.map((x) =>
                                x.money_kind === line.money_kind &&
                                x.denomination === line.denomination
                                  ? { ...x, qty }
                                  : x
                              )
                            );
                          }}
                          onBlur={(e) => {
                            const raw = e.target.value;
                            const qty = raw === "" ? 0 : Math.max(0, Math.floor(Number(raw)));
                            void upsertQty(line, qty);
                          }}
                        />
                      </div>
                      <div className="right strong">{peso(line.denomination * line.qty)}</div>
                    </div>
                  ))}

                <div className="asr-subtable-total">
                  <span>TOTAL COINS</span>
                  <strong>{peso(coinTotal)}</strong>
                </div>
              </div>

              <div className="asr-coh-row">
                <span>COH / Total of the Day</span>
                <strong>{peso(cohCash)}</strong>
              </div>
            </div>

            <div className="asr-panel">
              <div className="asr-mini-grid">
                <div className="asr-compact-box asr-balance-box">
                  <label>Bilin</label>
                  <input
                    className="asr-bilin-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={bilinInput}
                    onFocus={() => {
                      if (toNumber(bilinInput) === 0) setBilinInput("");
                    }}
                    onChange={(e) => {
                      const v = e.target.value;
                      setBilinInput(v);
                      setReport((prev) =>
                        prev ? { ...prev, bilin_amount: v === "" ? 0 : Math.max(0, Number(v)) } : prev
                      );
                    }}
                    onBlur={() => {
                      const parsed = Math.max(0, toNumber(bilinInput));
                      setBilinInput(String(parsed));
                      void updateReportField("bilin_amount", parsed);
                    }}
                  />
                </div>

                <div className="asr-compact-box asr-balance-box">
                  <div className="asr-field-title">Sales Collected</div>
                  <div className="asr-sales-collected">{peso(salesCollectedDisplay)}</div>
                </div>
              </div>
            </div>

            <div className="asr-panel">
              <div className="asr-panel-title">Other Totals</div>
              <div className="asr-other-list">
                {otherTotals.map((item) => (
                  <div key={item.label} className="asr-other-row">
                    <span>{item.label}</span>
                    <strong>{peso(item.value)}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {datePickerOpen && (
          <div className="asr-modal-overlay" onClick={() => setDatePickerOpen(false)}>
            <div className="asr-modal" onClick={(e) => e.stopPropagation()}>
              <div className="asr-modal-head">
                <h3>Select Report Date</h3>
                <button
                  type="button"
                  className="asr-modal-close"
                  onClick={() => setDatePickerOpen(false)}
                >
                  ✕
                </button>
              </div>

              <div className="asr-modal-text">
                Choose the report date you want to review.
              </div>

              <input
                type="date"
                className="asr-modal-date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />

              <div className="asr-modal-actions">
                <button
                  type="button"
                  className="asr-btn asr-btn-ghost"
                  onClick={() => setDatePickerOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="asr-btn asr-btn-primary"
                  onClick={() => setDatePickerOpen(false)}
                >
                  Apply Date
                </button>
              </div>
            </div>
          </div>
        )}

        {deleteAlertOpen && (
          <div className="asr-modal-overlay" onClick={() => setDeleteAlertOpen(false)}>
            <div className="asr-modal" onClick={(e) => e.stopPropagation()}>
              <div className="asr-modal-head">
                <h3>Delete by Date</h3>
                <button
                  type="button"
                  className="asr-modal-close"
                  onClick={() => setDeleteAlertOpen(false)}
                >
                  ✕
                </button>
              </div>

              <div className="asr-modal-text">
                Delete sales report for <strong>{selectedDate}</strong>? This will remove the
                report and cash lines for that date only.
              </div>

              <div className="asr-modal-actions">
                <button
                  type="button"
                  className="asr-btn asr-btn-ghost"
                  onClick={() => setDeleteAlertOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="asr-btn asr-btn-danger"
                  onClick={() => void deleteByDate()}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {toast.open && (
          <div className={`asr-toast ${toast.color === "danger" ? "danger" : ""} ${toast.color === "warning" ? "warning" : ""}`}>
            <span>{toast.msg}</span>
            <button type="button" onClick={() => setToast((p) => ({ ...p, open: false }))}>
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminSalesReport;