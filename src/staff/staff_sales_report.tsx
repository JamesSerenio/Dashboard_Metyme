import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../utils/supabaseClient";
import "../styles/staff_sales_report.css";

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
  net: number;
};

type ConsignmentRpcRow = {
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

type CenterModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
};

const CenterModal: React.FC<CenterModalProps> = ({
  open,
  title,
  onClose,
  children,
}) => {
  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    const prevTouchAction = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouchAction;
      window.removeEventListener("keydown", handleKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="ssrp-modal-overlay" onClick={onClose}>
      <div className="ssrp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ssrp-modal-head">
          <h3>{title}</h3>
          <button className="ssrp-modal-close" onClick={onClose} type="button">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
};

const Toast: React.FC<{
  open: boolean;
  msg: string;
  color?: "success" | "danger" | "warning";
  onClose: () => void;
}> = ({ open, msg, color = "success", onClose }) => {
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(onClose, 2400);
    return () => window.clearTimeout(t);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className={`ssrp-toast ${color}`} role="status" aria-live="polite">
      <span>{msg}</span>
      <button onClick={onClose} type="button">
        ✕
      </button>
    </div>,
    document.body
  );
};

const StaffSalesReport: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState<string>(() => todayYMD());
  const [loading, setLoading] = useState<boolean>(true);

  const [report, setReport] = useState<DailyReportRow | null>(null);
  const [lines, setLines] = useState<CashLine[]>([]);
  const [totals, setTotals] = useState<SalesTotalsRow | null>(null);

  const [consignment, setConsignment] = useState<ConsignmentState>({
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

  const [toast, setToast] = useState<ToastState>({
    open: false,
    msg: "",
    color: "success",
  });

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
    setConsignment({ net: 0 });
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
      setConsignment({ net: 0 });
      return;
    }

    const res = await supabase.rpc("get_consignment_totals_for_day", { p_date: dateYMD });

    if (res.error) {
      console.error("get_consignment_totals_for_day error:", res.error.message);
      setConsignment({ net: 0 });
      return;
    }

    const row = (res.data?.[0] ?? null) as ConsignmentRpcRow | null;
    if (!row) {
      setConsignment({ net: 0 });
      return;
    }

    setConsignment({
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

    const res = await supabase
      .from("customer_session_add_ons")
      .select("paid_at, is_paid, gcash_amount, cash_amount")
      .gte("paid_at", startIso)
      .lt("paid_at", endIso);

    if (res.error) {
      console.error("customer_session_add_ons payment query error:", res.error.message);
      setCustomerOrderPaid(0);
      return;
    }

    const rows = (res.data ?? []) as CustomerOrderPaymentRow[];

    const total = rows
      .filter((r) => toBool(r.is_paid) && !!r.paid_at)
      .reduce(
        (sum, r) =>
          sum +
          Math.max(0, toNumber(r.gcash_amount)) +
          Math.max(0, toNumber(r.cash_amount)),
        0
      );

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

    const safeQty = Math.max(0, Math.floor(qty));

    const res = await supabase
      .from("daily_cash_count_lines")
      .upsert(
        {
          report_id: line.report_id,
          money_kind: line.money_kind,
          denomination: line.denomination,
          qty: safeQty,
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
          ? { ...x, qty: safeQty }
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

  useEffect(() => {
    void loadReport(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    if (!report) return;

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

  if (loading) {
    return (
      <div className="ssrp-page">
        <div className="ssrp-shell">
          <div className="ssrp-loading-card">
            <div className="ssrp-spinner" />
            <span>Loading report...</span>
          </div>
        </div>
      </div>
    );
  }

  const submitLabel = report?.is_submitted ? "DONE / UPDATE" : "DONE / SUBMIT";

  return (
    <div className="ssrp-page">
      <Toast
        open={toast.open}
        msg={toast.msg}
        color={toast.color}
        onClose={() => setToast((p) => ({ ...p, open: false }))}
      />

      <div className="ssrp-shell">
        <div className="ssrp-topbar">
          <div className="ssrp-topbar-left">
            <div className="ssrp-top-label">Staff Sales Report</div>
            <div className="ssrp-status">
              Status: <strong>{report?.is_submitted ? "SUBMITTED" : "DRAFT"}</strong>
              {report?.submitted_at ? (
                <span className="ssrp-status-sub">
                  Last submit: {new Date(report.submitted_at).toLocaleString()}
                </span>
              ) : null}
            </div>
          </div>

          <div className="ssrp-topbar-right">
            <div className="ssrp-topbar-row">
              <div className="ssrp-date-wrap">
                <input
                  type="date"
                  className="ssrp-date-input"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  disabled={submitting}
                />
              </div>

              <div className="ssrp-actions">
                <button
                  type="button"
                  className="ssrp-btn ssrp-btn-primary"
                  onClick={() => void onSubmitDone()}
                  disabled={submitting || !report}
                >
                  {submitting ? "Saving..." : submitLabel}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="ssrp-main-grid">
          <div className="ssrp-left-column">
            <div className="ssrp-panel ssrp-panel-category">
              <div className="ssrp-section-head ssrp-section-head-3">
                <span>CATEGORY</span>
                <span className="center">CASH</span>
                <span className="center">GCASH</span>
              </div>

              <div className="ssrp-category-list">
                <div className="ssrp-category-row">
                  <div className="ssrp-category-label">Starting Balance</div>

                  <input
                    type="number"
                    className="ssrp-balance-input"
                    value={report ? String(toNumber(report.starting_cash)) : "0"}
                    min={0}
                    step="0.01"
                    disabled={submitting}
                    onChange={(e) =>
                      setReport((prev) =>
                        prev
                          ? { ...prev, starting_cash: Math.max(0, Number(e.target.value || 0)) }
                          : prev
                      )
                    }
                    onBlur={() => {
                      const parsed = Math.max(0, toNumber(report?.starting_cash));
                      void updateReportField("starting_cash", parsed);
                    }}
                  />

                  <input
                    type="number"
                    className="ssrp-balance-input"
                    value={report ? String(toNumber(report.starting_gcash)) : "0"}
                    min={0}
                    step="0.01"
                    disabled={submitting}
                    onChange={(e) =>
                      setReport((prev) =>
                        prev
                          ? { ...prev, starting_gcash: Math.max(0, Number(e.target.value || 0)) }
                          : prev
                      )
                    }
                    onBlur={() => {
                      const parsed = Math.max(0, toNumber(report?.starting_gcash));
                      void updateReportField("starting_gcash", parsed);
                    }}
                  />
                </div>

                {categoryRows
                  .filter((r) => r.label !== "Starting Balance")
                  .map((row) => (
                    <div
                      key={row.label}
                      className={`ssrp-category-row ${row.total ? "is-total" : ""}`}
                    >
                      <div className="ssrp-category-label">{row.label}</div>
                      <div className="ssrp-money-pill">{peso(row.cash)}</div>
                      <div className="ssrp-money-pill">{peso(row.gcash)}</div>
                    </div>
                  ))}
              </div>

              <div className="ssrp-metric-pair">
                <div className="ssrp-feature-card">
                  <div className="ssrp-feature-title">Actual System</div>
                  <div className="ssrp-feature-value">{peso(actualSystem)}</div>
                </div>

                <div className="ssrp-feature-card">
                  <div className="ssrp-feature-title">Sales System / Total Cost</div>
                  <div className="ssrp-feature-value">{peso(salesSystemComputed)}</div>
                </div>
              </div>

              <div className="ssrp-summary-grid">
                <div className="ssrp-summary-box">
                  <div className="ssrp-summary-title">Cash Sales</div>
                  <div className="ssrp-summary-value">{peso(cashSales)}</div>
                </div>
                <div className="ssrp-summary-box">
                  <div className="ssrp-summary-title">GCash Sales</div>
                  <div className="ssrp-summary-value">{peso(gcashSales)}</div>
                </div>
                <div className="ssrp-summary-box">
                  <div className="ssrp-summary-title">Consignment Sales</div>
                  <div className="ssrp-summary-value">{peso(consignment.net)}</div>
                </div>
                <div className="ssrp-summary-box">
                  <div className="ssrp-summary-title">Inventory Loss</div>
                  <div className="ssrp-summary-value">{peso(inventoryLossAmount)}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="ssrp-right-column">
            <div className="ssrp-panel">
              <div className="ssrp-cash-header">
                <div className="ssrp-panel-title">Cash Count</div>
                <div className="ssrp-mini-badge">
                  Cash: {peso(cashTotal)} | Coins: {peso(coinTotal)}
                </div>
              </div>

              <div className="ssrp-cash-stack">
                <div className="ssrp-subtable">
                  <div className="ssrp-subtable-head">
                    <span>CASH</span>
                    <span className="center">QTY</span>
                    <span className="right">AMOUNT</span>
                  </div>

                  {lines
                    .filter((l) => l.money_kind === "cash")
                    .map((line) => (
                      <div className="ssrp-subtable-row" key={`cash-${line.denomination}`}>
                        <span className="ssrp-denom">{line.denomination}</span>
                        <div className="center">
                          <input
                            className="ssrp-qty-input"
                            type="number"
                            min="0"
                            step="1"
                            value={line.qty}
                            onChange={(e) =>
                              void upsertQty(line, Math.max(0, Number(e.target.value || 0)))
                            }
                          />
                        </div>
                        <span className="right strong">{peso(line.denomination * line.qty)}</span>
                      </div>
                    ))}

                  <div className="ssrp-subtable-total">
                    <span>TOTAL CASH</span>
                    <strong>{peso(cashTotal)}</strong>
                  </div>
                </div>

                <div className="ssrp-subtable">
                  <div className="ssrp-subtable-head">
                    <span>COINS</span>
                    <span className="center">QTY</span>
                    <span className="right">AMOUNT</span>
                  </div>

                  {lines
                    .filter((l) => l.money_kind === "coin")
                    .map((line) => (
                      <div className="ssrp-subtable-row" key={`coin-${line.denomination}`}>
                        <span className="ssrp-denom">{line.denomination}</span>
                        <div className="center">
                          <input
                            className="ssrp-qty-input"
                            type="number"
                            min="0"
                            step="1"
                            value={line.qty}
                            onChange={(e) =>
                              void upsertQty(line, Math.max(0, Number(e.target.value || 0)))
                            }
                          />
                        </div>
                        <span className="right strong">{peso(line.denomination * line.qty)}</span>
                      </div>
                    ))}

                  <div className="ssrp-subtable-total">
                    <span>TOTAL COINS</span>
                    <strong>{peso(coinTotal)}</strong>
                  </div>
                </div>
              </div>

              <div className="ssrp-coh-row">
                <span>COH / Total of the Day</span>
                <strong>{peso(cohCash)}</strong>
              </div>
            </div>

            <div className="ssrp-panel">
              <div className="ssrp-balance-grid">
                <div className="ssrp-balance-box">
                  <label>Bilin</label>
                  <input
                    className="ssrp-bilin-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={report ? String(toNumber(report.bilin_amount)) : "0"}
                    disabled={submitting}
                    onChange={(e) =>
                      setReport((prev) =>
                        prev
                          ? { ...prev, bilin_amount: Math.max(0, Number(e.target.value || 0)) }
                          : prev
                      )
                    }
                    onBlur={() => {
                      const parsed = Math.max(0, toNumber(report?.bilin_amount));
                      void updateReportField("bilin_amount", parsed);
                    }}
                  />
                </div>

                <div className="ssrp-balance-box">
                  <label>Sales Collected</label>
                  <div className="ssrp-sales-collected">{peso(salesCollectedDisplay)}</div>
                </div>
              </div>
            </div>

            <div className="ssrp-panel">
              <div className="ssrp-panel-title">Other Totals</div>

              <div className="ssrp-other-list">
                {otherTotals.map((item) => (
                  <div className="ssrp-other-row" key={item.label}>
                    <span>{item.label}</span>
                    <strong>{peso(item.value)}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <CenterModal
        open={datePickerOpen}
        title="Select Date"
        onClose={() => setDatePickerOpen(false)}
      >
        <div className="ssrp-modal-text">Pick a report date.</div>
        <div style={{ marginTop: 14 }}>
          <input
            className="ssrp-modal-date"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>
        <div className="ssrp-modal-actions">
          <button className="ssrp-btn ssrp-btn-ghost" onClick={() => setDatePickerOpen(false)} type="button">
            Close
          </button>
          <button className="ssrp-btn ssrp-btn-primary" onClick={() => setDatePickerOpen(false)} type="button">
            Apply
          </button>
        </div>
      </CenterModal>
    </div>
  );
};

export default StaffSalesReport;