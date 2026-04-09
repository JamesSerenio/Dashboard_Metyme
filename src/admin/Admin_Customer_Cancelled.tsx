import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../utils/supabaseClient";
import logo from "../assets/study_hub.png";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import "../styles/Admin_Customer_Cancelled.css";

/* =========================
   TYPES
========================= */
type NumericLike = number | string;
type CancelTab = "addons" | "walkin" | "reservation" | "promo" | "consignment";
type DiscountKind = "none" | "percent" | "amount";
type PackageArea = "common_area" | "conference_room";
type DurationUnit = "hour" | "day" | "month" | "year";

interface AddOnInfo {
  id: string;
  name: string;
  category: string;
  size: string | null;
}

interface CancelRowDB_AddOns {
  id: string;
  cancelled_at: string;
  original_id: string;
  created_at: string | null;
  add_on_id: string;
  quantity: number;
  price: NumericLike;
  full_name: string;
  seat_number: string;
  gcash_amount: NumericLike;
  cash_amount: NumericLike;
  is_paid: boolean | number | string | null;
  paid_at: string | null;
  description: string;
  add_ons: AddOnInfo | null;
}

type CancelItemAddOn = {
  id: string;
  original_id: string;
  add_on_id: string;
  item_name: string;
  category: string;
  size: string | null;
  quantity: number;
  price: number;
  total: number;
  cancelled_at: string;
  created_at: string | null;
  full_name: string;
  seat_number: string;
  gcash_amount: number;
  cash_amount: number;
  is_paid: boolean;
  paid_at: string | null;
  description: string;
};

type CancelGroupItemAddOn = {
  id: string;
  original_id: string;
  add_on_id: string;
  item_name: string;
  category: string;
  size: string | null;
  quantity: number;
  price: number;
  total: number;
};

type CancelGroupAddOn = {
  key: string;
  cancelled_at: string;
  full_name: string;
  seat_number: string;
  description: string;
  items: CancelGroupItemAddOn[];
  grand_total: number;
  gcash_amount: number;
  cash_amount: number;
  is_paid: boolean;
  paid_at: string | null;
};

type CancelledSessionDB = {
  id: string;
  cancelled_at: string;
  cancel_reason: string;
  created_at: string | null;
  staff_id: string | null;
  date: string;
  full_name: string;
  customer_type: string;
  customer_field: string | null;
  has_id: boolean;
  hour_avail: string;
  time_started: string;
  time_ended: string;
  total_time: number | string;
  total_amount: number | string;
  reservation: string;
  reservation_date: string | null;
  id_number: string | null;
  seat_number: string;
  promo_booking_id: string | null;
  discount_kind: DiscountKind | string;
  discount_value: number | string;
  discount_reason: string | null;
  gcash_amount: number | string;
  cash_amount: number | string;
  is_paid: boolean | number | string | null;
  paid_at: string | null;
  phone_number: string | null;
  down_payment: number | string | null;
};

type CancelledSession = {
  id: string;
  cancelled_at: string;
  cancel_reason: string;
  date: string;
  reservation: "no" | "yes";
  reservation_date: string | null;
  full_name: string;
  phone_number: string | null;
  customer_type: string;
  customer_field: string | null;
  has_id: boolean;
  id_number: string | null;
  seat_number: string;
  hour_avail: string;
  time_started: string;
  time_ended: string;
  total_time: number;
  total_amount: number;
  discount_kind: DiscountKind;
  discount_value: number;
  discount_reason: string | null;
  down_payment: number;
  gcash_amount: number;
  cash_amount: number;
  is_paid: boolean;
  paid_at: string | null;
};

type CancelledPromoDB = {
  id: string;
  cancelled_at: string;
  original_id: string;
  description: string;
  created_at: string;
  user_id: string | null;
  full_name: string;
  phone_number: string | null;
  area: PackageArea;
  package_id: string;
  package_option_id: string;
  seat_number: string | null;
  start_at: string;
  end_at: string;
  price: number | string;
  status: string;
  gcash_amount: number | string;
  cash_amount: number | string;
  is_paid: boolean | number | string | null;
  paid_at: string | null;
  discount_reason: string | null;
  discount_kind: DiscountKind | string;
  discount_value: number | string;
};

type PackageRow = { id: string; title: string | null };
type PackageOptionRow = {
  id: string;
  option_name: string | null;
  duration_value: number | null;
  duration_unit: DurationUnit | null;
};

type CancelledPromo = {
  id: string;
  cancelled_at: string;
  original_id: string;
  description: string;
  created_at: string;
  full_name: string;
  phone_number: string | null;
  area: PackageArea;
  seat_number: string | null;
  start_at: string;
  end_at: string;
  price: number;
  status: string;
  gcash_amount: number;
  cash_amount: number;
  is_paid: boolean;
  paid_at: string | null;
  discount_kind: DiscountKind;
  discount_value: number;
  discount_reason: string | null;
  package_title: string;
  option_name: string;
  duration_value: number | null;
  duration_unit: DurationUnit | null;
};

type ConsignmentCancelledDB = {
  id: string;
  cancelled_at: string;
  cancelled_by: string;
  original_id: string;
  original_created_at: string | null;
  consignment_id: string;
  quantity: number;
  price: NumericLike;
  total: NumericLike;
  full_name: string;
  seat_number: string;
  gcash_amount: NumericLike;
  cash_amount: NumericLike;
  is_paid: boolean | number | string | null;
  paid_at: string | null;
  was_voided: boolean | number | string | null;
  voided_at: string | null;
  void_note: string | null;
  item_name: string;
  category: string | null;
  size: string | null;
  image_url: string | null;
  cancel_note: string;
  stock_returned: boolean | number | string | null;
};

type CancelItemConsignment = {
  id: string;
  cancelled_at: string;
  original_id: string;
  original_created_at: string | null;
  consignment_id: string;
  item_name: string;
  category: string;
  size: string | null;
  image_url: string | null;
  quantity: number;
  price: number;
  total: number;
  full_name: string;
  seat_number: string;
  gcash_amount: number;
  cash_amount: number;
  is_paid: boolean;
  paid_at: string | null;
  was_voided: boolean;
  voided_at: string | null;
  void_note: string | null;
  cancel_note: string;
  stock_returned: boolean;
};

type CancelGroupItemConsignment = {
  id: string;
  original_id: string;
  consignment_id: string;
  item_name: string;
  category: string;
  size: string | null;
  quantity: number;
  price: number;
  total: number;
};

type CancelGroupConsignment = {
  key: string;
  cancelled_at: string;
  full_name: string;
  seat_number: string;
  cancel_note: string;
  items: CancelGroupItemConsignment[];
  grand_total: number;
  gcash_amount: number;
  cash_amount: number;
  is_paid: boolean;
  paid_at: string | null;
  was_voided: boolean;
  voided_at: string | null;
  void_note: string | null;
  stock_returned: boolean;
};

/* =========================
   HELPERS
========================= */
const GROUP_WINDOW_MS = 10_000;

const TAB_LABEL: Record<CancelTab, string> = {
  addons: "Add-Ons",
  walkin: "Walk-in",
  reservation: "Reservation",
  promo: "Promo",
  consignment: "Consignment",
};

const tabTitleFrom = (tab: CancelTab): string => {
  if (tab === "addons") return "Cancelled Add-Ons";
  if (tab === "walkin") return "Cancelled Walk-in";
  if (tab === "reservation") return "Cancelled Reservation";
  if (tab === "promo") return "Cancelled Promo Membership";
  return "Cancelled Consignment";
};

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

const toBool = (v: unknown): boolean => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes" || s === "paid";
  }
  return false;
};

const norm = (s: string | null | undefined): string =>
  (s ?? "").trim().toLowerCase();

const yyyyMmDdLocal = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const manilaDayRange = (yyyyMmDd: string): { startIso: string; endIso: string } => {
  const start = new Date(`${yyyyMmDd}T00:00:00+08:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
};

const ms = (iso: string): number => {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
};

const moneyText = (n: number): string => `₱${round2(n).toFixed(2)}`;

const sizeText = (s: string | null | undefined): string => {
  const v = String(s ?? "").trim();
  return v.length > 0 ? v : "—";
};

const formatDateTime = (iso: string | null | undefined): string => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "-";
  return d.toLocaleString("en-PH");
};

const formatTimeText = (iso: string | null | undefined): string => {
  if (!iso) return "-";
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return "-";
  return dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const clamp = (n: number, minV: number, maxV: number): number =>
  Math.min(maxV, Math.max(minV, n));

const applyDiscount = (
  baseCost: number,
  kind: DiscountKind,
  value: number
): { discountedCost: number; discountAmount: number } => {
  const cost = round2(Math.max(0, baseCost));
  const v = round2(Math.max(0, value));

  if (kind === "percent") {
    const pct = clamp(v, 0, 100);
    const disc = round2((cost * pct) / 100);
    return { discountedCost: round2(Math.max(0, cost - disc)), discountAmount: disc };
  }
  if (kind === "amount") {
    const disc = round2(Math.min(cost, v));
    return { discountedCost: round2(Math.max(0, cost - disc)), discountAmount: disc };
  }
  return { discountedCost: cost, discountAmount: 0 };
};

const getDiscountText = (kind: DiscountKind, value: number): string => {
  const v = round2(Math.max(0, value));
  if (kind === "percent" && v > 0) return `${v}%`;
  if (kind === "amount" && v > 0) return `₱${v.toFixed(2)}`;
  return "—";
};

const normalizeDiscountKind = (v: unknown): DiscountKind => {
  const s = String(v ?? "none").trim().toLowerCase();
  if (s === "percent") return "percent";
  if (s === "amount") return "amount";
  return "none";
};

const prettyArea = (a: PackageArea): string =>
  a === "conference_room" ? "Conference Room" : "Common Area";

const seatLabelPromo = (area: PackageArea, seat: string | null): string =>
  area === "conference_room" ? "CONFERENCE ROOM" : String(seat ?? "").trim() || "N/A";

const formatDuration = (v: number, u: DurationUnit): string => {
  const unit =
    u === "hour"
      ? v === 1
        ? "hour"
        : "hours"
      : u === "day"
      ? v === 1
        ? "day"
        : "days"
      : u === "month"
      ? v === 1
        ? "month"
        : "months"
      : v === 1
      ? "year"
      : "years";
  return `${v} ${unit}`;
};

const ReadOnlyBadge: React.FC<{ paid: boolean }> = ({ paid }) => (
  <span className={`acc-pay-badge ${paid ? "acc-pay-badge--paid" : "acc-pay-badge--unpaid"}`}>
    {paid ? "PAID" : "UNPAID"}
  </span>
);

const FixedModal: React.FC<{
  open: boolean;
  title: string;
  size?: "sm" | "md" | "lg" | "xl";
  onClose: () => void;
  children: React.ReactNode;
}> = ({ open, title, size = "md", onClose, children }) => {
  useEffect(() => {
    if (!open) return;

    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.classList.add("acc-modal-open");

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.classList.remove("acc-modal-open");
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="acc-modal-overlay" onClick={onClose}>
      <div
        className={`acc-modal-card acc-modal-${size}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="acc-modal-head">
          <h3>{title}</h3>
          <button className="acc-modal-close" onClick={onClose} type="button">
            ×
          </button>
        </div>
        <div className="acc-modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
};

/* =========================
   COMPONENT
========================= */
const Admin_Customer_Cancelled: React.FC = () => {
  const [tab, setTab] = useState<CancelTab>("addons");
  const [selectedDate, setSelectedDate] = useState<string>(yyyyMmDdLocal(new Date()));
  const [loading, setLoading] = useState<boolean>(true);

  const [rowsAddOns, setRowsAddOns] = useState<CancelItemAddOn[]>([]);
  const [selectedGroupAddOns, setSelectedGroupAddOns] = useState<CancelGroupAddOn | null>(null);

  const [rowsSessions, setRowsSessions] = useState<CancelledSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<CancelledSession | null>(null);

  const [rowsPromo, setRowsPromo] = useState<CancelledPromo[]>([]);
  const [selectedPromo, setSelectedPromo] = useState<CancelledPromo | null>(null);

  const [rowsConsignment, setRowsConsignment] = useState<CancelItemConsignment[]>([]);
  const [selectedGroupConsignment, setSelectedGroupConsignment] =
    useState<CancelGroupConsignment | null>(null);

  const [confirmDeleteDate, setConfirmDeleteDate] = useState<boolean>(false);
  const [busyDelete, setBusyDelete] = useState<boolean>(false);
  const [busyExport, setBusyExport] = useState<boolean>(false);

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    void refresh();
  }, [selectedDate, tab]);

  const refresh = async (): Promise<void> => {
    setSelectedGroupAddOns(null);
    setSelectedSession(null);
    setSelectedPromo(null);
    setSelectedGroupConsignment(null);

    if (tab === "addons") await fetchCancelledAddOns(selectedDate);
    else if (tab === "walkin") await fetchCancelledSessions(selectedDate, "no");
    else if (tab === "reservation") await fetchCancelledSessions(selectedDate, "yes");
    else if (tab === "promo") await fetchCancelledPromo(selectedDate);
    else await fetchCancelledConsignment(selectedDate);
  };

  const groupedAddOns = useMemo<CancelGroupAddOn[]>(() => {
    if (rowsAddOns.length === 0) return [];

    const groups: CancelGroupAddOn[] = [];
    let current: CancelGroupAddOn | null = null;
    let last: CancelItemAddOn | null = null;

    const sameKey = (a: CancelItemAddOn, b: CancelItemAddOn): boolean =>
      norm(a.full_name) === norm(b.full_name) &&
      norm(a.seat_number) === norm(b.seat_number) &&
      norm(a.description) === norm(b.description);

    for (const r of rowsAddOns) {
      const startNew =
        current === null ||
        last === null ||
        !sameKey(r, last) ||
        Math.abs(ms(r.cancelled_at) - ms(last.cancelled_at)) > GROUP_WINDOW_MS;

      if (startNew) {
        const key = `${norm(r.full_name)}|${norm(r.seat_number)}|${ms(r.cancelled_at)}|${norm(r.description)}`;
        current = {
          key,
          cancelled_at: r.cancelled_at,
          full_name: r.full_name,
          seat_number: r.seat_number,
          description: r.description || "-",
          items: [],
          grand_total: 0,
          gcash_amount: 0,
          cash_amount: 0,
          is_paid: false,
          paid_at: null,
        };
        groups.push(current);
      }

      if (!current) continue;

      current.items.push({
        id: r.id,
        original_id: r.original_id,
        add_on_id: r.add_on_id,
        item_name: r.item_name,
        category: r.category,
        size: r.size,
        quantity: r.quantity,
        price: r.price,
        total: r.total,
      });

      current.grand_total = round2(current.grand_total + r.total);
      current.gcash_amount = round2(current.gcash_amount + r.gcash_amount);
      current.cash_amount = round2(current.cash_amount + r.cash_amount);
      current.is_paid = current.is_paid || r.is_paid;
      current.paid_at = current.paid_at ?? r.paid_at;

      last = r;
    }

    return groups.sort((a, b) => ms(b.cancelled_at) - ms(a.cancelled_at));
  }, [rowsAddOns]);

  const groupedConsignment = useMemo<CancelGroupConsignment[]>(() => {
    if (rowsConsignment.length === 0) return [];

    const sorted = [...rowsConsignment].sort((a, b) => ms(a.cancelled_at) - ms(b.cancelled_at));
    const groups: CancelGroupConsignment[] = [];
    let current: CancelGroupConsignment | null = null;
    let last: CancelItemConsignment | null = null;

    const sameKey = (a: CancelItemConsignment, b: CancelItemConsignment): boolean =>
      norm(a.full_name) === norm(b.full_name) &&
      norm(a.seat_number) === norm(b.seat_number) &&
      norm(a.cancel_note) === norm(b.cancel_note);

    for (const r of sorted) {
      const startNew =
        current === null ||
        last === null ||
        !sameKey(r, last) ||
        Math.abs(ms(r.cancelled_at) - ms(last.cancelled_at)) > GROUP_WINDOW_MS;

      if (startNew) {
        const key = `${norm(r.full_name)}|${norm(r.seat_number)}|${ms(r.cancelled_at)}|${norm(r.cancel_note)}`;
        current = {
          key,
          cancelled_at: r.cancelled_at,
          full_name: r.full_name,
          seat_number: r.seat_number,
          cancel_note: r.cancel_note || "-",
          items: [],
          grand_total: 0,
          gcash_amount: 0,
          cash_amount: 0,
          is_paid: false,
          paid_at: null,
          was_voided: false,
          voided_at: null,
          void_note: null,
          stock_returned: false,
        };
        groups.push(current);
      }

      if (!current) continue;

      current.items.push({
        id: r.id,
        original_id: r.original_id,
        consignment_id: r.consignment_id,
        item_name: r.item_name,
        category: r.category,
        size: r.size,
        quantity: r.quantity,
        price: r.price,
        total: r.total,
      });

      current.grand_total = round2(current.grand_total + r.total);
      current.gcash_amount = round2(current.gcash_amount + r.gcash_amount);
      current.cash_amount = round2(current.cash_amount + r.cash_amount);
      current.is_paid = current.is_paid || r.is_paid;
      current.paid_at = current.paid_at ?? r.paid_at;
      current.was_voided = current.was_voided || r.was_voided;
      current.voided_at = current.voided_at ?? r.voided_at;
      current.void_note = current.void_note ?? r.void_note;
      current.stock_returned = current.stock_returned || r.stock_returned;

      last = r;
    }

    return groups.sort((a, b) => ms(b.cancelled_at) - ms(a.cancelled_at));
  }, [rowsConsignment]);

  const fetchCancelledAddOns = async (dateStr: string): Promise<void> => {
    setLoading(true);
    const { startIso, endIso } = manilaDayRange(dateStr);

    const { data, error } = await supabase
      .from("customer_session_add_ons_cancelled")
      .select(`
        id,
        cancelled_at,
        original_id,
        created_at,
        add_on_id,
        quantity,
        price,
        full_name,
        seat_number,
        gcash_amount,
        cash_amount,
        is_paid,
        paid_at,
        description,
        add_ons (
          id,
          name,
          category,
          size
        )
      `)
      .gte("cancelled_at", startIso)
      .lt("cancelled_at", endIso)
      .order("cancelled_at", { ascending: true })
      .returns<CancelRowDB_AddOns[]>();

    if (error) {
      console.error("FETCH CANCELLED ADD-ONS ERROR:", error);
      setRowsAddOns([]);
      setLoading(false);
      return;
    }

    const mapped: CancelItemAddOn[] = (data ?? []).map((r) => {
      const a = r.add_ons;
      const qty = Math.max(0, Math.floor(Number(r.quantity) || 0));
      const price = round2(Math.max(0, toNumber(r.price)));
      const total = round2(qty * price);

      return {
        id: r.id,
        original_id: r.original_id,
        add_on_id: r.add_on_id,
        item_name: a?.name ?? "-",
        category: a?.category ?? "-",
        size: a?.size ?? null,
        quantity: qty,
        price,
        total,
        cancelled_at: r.cancelled_at,
        created_at: r.created_at ?? null,
        full_name: r.full_name,
        seat_number: r.seat_number,
        gcash_amount: round2(Math.max(0, toNumber(r.gcash_amount))),
        cash_amount: round2(Math.max(0, toNumber(r.cash_amount))),
        is_paid: toBool(r.is_paid),
        paid_at: r.paid_at ?? null,
        description: String(r.description ?? "").trim(),
      };
    });

    setRowsAddOns(mapped);
    setLoading(false);
  };

  const fetchCancelledSessions = async (
    dateStr: string,
    reservation: "no" | "yes"
  ): Promise<void> => {
    setLoading(true);
    const { startIso, endIso } = manilaDayRange(dateStr);

    const { data, error } = await supabase
      .from("customer_sessions_cancelled")
      .select(`
        id,
        cancelled_at,
        cancel_reason,
        created_at,
        staff_id,
        date,
        full_name,
        customer_type,
        customer_field,
        has_id,
        hour_avail,
        time_started,
        time_ended,
        total_time,
        total_amount,
        reservation,
        reservation_date,
        id_number,
        seat_number,
        promo_booking_id,
        discount_kind,
        discount_value,
        discount_reason,
        gcash_amount,
        cash_amount,
        is_paid,
        paid_at,
        phone_number,
        down_payment
      `)
      .gte("cancelled_at", startIso)
      .lt("cancelled_at", endIso)
      .eq("reservation", reservation)
      .order("cancelled_at", { ascending: false })
      .returns<CancelledSessionDB[]>();

    if (error) {
      console.error("FETCH CANCELLED SESSIONS ERROR:", error);
      setRowsSessions([]);
      setLoading(false);
      return;
    }

    const mapped: CancelledSession[] = (data ?? []).map((r) => ({
      id: r.id,
      cancelled_at: r.cancelled_at,
      cancel_reason: String(r.cancel_reason ?? "").trim() || "-",
      date: String(r.date ?? ""),
      reservation: (String(r.reservation ?? "no") === "yes" ? "yes" : "no") as "no" | "yes",
      reservation_date: r.reservation_date ?? null,
      full_name: String(r.full_name ?? "-"),
      phone_number: r.phone_number ?? null,
      customer_type: String(r.customer_type ?? "-"),
      customer_field: r.customer_field ?? null,
      has_id: Boolean(r.has_id),
      id_number: r.id_number ?? null,
      seat_number: String(r.seat_number ?? "-"),
      hour_avail: String(r.hour_avail ?? "-"),
      time_started: String(r.time_started ?? ""),
      time_ended: String(r.time_ended ?? ""),
      total_time: round2(Math.max(0, toNumber(r.total_time))),
      total_amount: round2(Math.max(0, toNumber(r.total_amount))),
      discount_kind: normalizeDiscountKind(r.discount_kind),
      discount_value: round2(Math.max(0, toNumber(r.discount_value))),
      discount_reason: r.discount_reason ?? null,
      down_payment: round2(Math.max(0, toNumber(r.down_payment))),
      gcash_amount: round2(Math.max(0, toNumber(r.gcash_amount))),
      cash_amount: round2(Math.max(0, toNumber(r.cash_amount))),
      is_paid: toBool(r.is_paid),
      paid_at: r.paid_at ?? null,
    }));

    setRowsSessions(mapped);
    setLoading(false);
  };

  const fetchCancelledPromo = async (dateStr: string): Promise<void> => {
    setLoading(true);
    const { startIso, endIso } = manilaDayRange(dateStr);

    const { data, error } = await supabase
      .from("promo_bookings_cancelled")
      .select(`
        id,
        cancelled_at,
        original_id,
        description,
        created_at,
        user_id,
        full_name,
        phone_number,
        area,
        package_id,
        package_option_id,
        seat_number,
        start_at,
        end_at,
        price,
        status,
        gcash_amount,
        cash_amount,
        is_paid,
        paid_at,
        discount_reason,
        discount_kind,
        discount_value
      `)
      .gte("cancelled_at", startIso)
      .lt("cancelled_at", endIso)
      .order("cancelled_at", { ascending: false })
      .returns<CancelledPromoDB[]>();

    if (error) {
      console.error("FETCH CANCELLED PROMO ERROR:", error);
      setRowsPromo([]);
      setLoading(false);
      return;
    }

    const rows = data ?? [];
    if (rows.length === 0) {
      setRowsPromo([]);
      setLoading(false);
      return;
    }

    const pkgIds = Array.from(new Set(rows.map((r) => String(r.package_id)).filter(Boolean)));
    const optIds = Array.from(new Set(rows.map((r) => String(r.package_option_id)).filter(Boolean)));

    const [pkgRes, optRes] = await Promise.all([
      pkgIds.length
        ? supabase.from("packages").select("id,title").in("id", pkgIds).returns<PackageRow[]>()
        : Promise.resolve({ data: [] as PackageRow[], error: null as unknown }),
      optIds.length
        ? supabase
            .from("package_options")
            .select("id,option_name,duration_value,duration_unit")
            .in("id", optIds)
            .returns<PackageOptionRow[]>()
        : Promise.resolve({ data: [] as PackageOptionRow[], error: null as unknown }),
    ]);

    if ((pkgRes as { error: unknown }).error) {
      console.error("FETCH PACKAGES LOOKUP ERROR:", (pkgRes as { error: unknown }).error);
    }
    if ((optRes as { error: unknown }).error) {
      console.error("FETCH PACKAGE_OPTIONS LOOKUP ERROR:", (optRes as { error: unknown }).error);
    }

    const pkgMap = new Map<string, PackageRow>();
    ((pkgRes as { data: PackageRow[] }).data ?? []).forEach((p) => pkgMap.set(p.id, p));

    const optMap = new Map<string, PackageOptionRow>();
    ((optRes as { data: PackageOptionRow[] }).data ?? []).forEach((o) => optMap.set(o.id, o));

    const mapped: CancelledPromo[] = rows.map((r) => {
      const pkg = pkgMap.get(String(r.package_id));
      const opt = optMap.get(String(r.package_option_id));

      return {
        id: r.id,
        cancelled_at: r.cancelled_at,
        original_id: r.original_id,
        description: String(r.description ?? "").trim() || "-",
        created_at: r.created_at,
        full_name: String(r.full_name ?? "-"),
        phone_number: r.phone_number ?? null,
        area: r.area,
        seat_number: r.seat_number ?? null,
        start_at: r.start_at,
        end_at: r.end_at,
        price: round2(Math.max(0, toNumber(r.price))),
        status: String(r.status ?? "pending"),
        gcash_amount: round2(Math.max(0, toNumber(r.gcash_amount))),
        cash_amount: round2(Math.max(0, toNumber(r.cash_amount))),
        is_paid: toBool(r.is_paid),
        paid_at: r.paid_at ?? null,
        discount_kind: normalizeDiscountKind(r.discount_kind),
        discount_value: round2(Math.max(0, toNumber(r.discount_value))),
        discount_reason: r.discount_reason ?? null,
        package_title: String(pkg?.title ?? "").trim() || "—",
        option_name: String(opt?.option_name ?? "").trim() || "—",
        duration_value: opt?.duration_value ?? null,
        duration_unit: opt?.duration_unit ?? null,
      };
    });

    setRowsPromo(mapped);
    setLoading(false);
  };

  const fetchCancelledConsignment = async (dateStr: string): Promise<void> => {
    setLoading(true);
    const { startIso, endIso } = manilaDayRange(dateStr);

    const { data, error } = await supabase
      .from("consignment_cancelled")
      .select(`
        id,
        cancelled_at,
        cancelled_by,
        original_id,
        original_created_at,
        consignment_id,
        quantity,
        price,
        total,
        full_name,
        seat_number,
        gcash_amount,
        cash_amount,
        is_paid,
        paid_at,
        was_voided,
        voided_at,
        void_note,
        item_name,
        category,
        size,
        image_url,
        cancel_note,
        stock_returned
      `)
      .gte("cancelled_at", startIso)
      .lt("cancelled_at", endIso)
      .order("cancelled_at", { ascending: true })
      .returns<ConsignmentCancelledDB[]>();

    if (error) {
      console.error("FETCH CONSIGNMENT CANCELLED ERROR:", error);
      setRowsConsignment([]);
      setLoading(false);
      return;
    }

    const mapped: CancelItemConsignment[] = (data ?? []).map((r) => {
      const qty = Math.max(0, Math.floor(Number(r.quantity) || 0));
      const price = round2(Math.max(0, toNumber(r.price)));
      const total = round2(Math.max(0, toNumber(r.total)));
      const fixedTotal = total > 0 ? total : round2(qty * price);

      return {
        id: r.id,
        cancelled_at: r.cancelled_at,
        original_id: r.original_id,
        original_created_at: r.original_created_at ?? null,
        consignment_id: r.consignment_id,
        item_name: String(r.item_name ?? "-"),
        category: String(r.category ?? "-") || "-",
        size: r.size ?? null,
        image_url: r.image_url ?? null,
        quantity: qty,
        price,
        total: fixedTotal,
        full_name: String(r.full_name ?? "-"),
        seat_number: String(r.seat_number ?? "-"),
        gcash_amount: round2(Math.max(0, toNumber(r.gcash_amount))),
        cash_amount: round2(Math.max(0, toNumber(r.cash_amount))),
        is_paid: toBool(r.is_paid),
        paid_at: r.paid_at ?? null,
        was_voided: toBool(r.was_voided),
        voided_at: r.voided_at ?? null,
        void_note: r.void_note ?? null,
        cancel_note: String(r.cancel_note ?? "").trim() || "-",
        stock_returned: toBool(r.stock_returned),
      };
    });

    setRowsConsignment(mapped);
    setLoading(false);
  };

  const deleteByDateAll = async (): Promise<void> => {
    try {
      setBusyDelete(true);
      const { startIso, endIso } = manilaDayRange(selectedDate);

      const { error: e1 } = await supabase
        .from("customer_session_add_ons_cancelled")
        .delete()
        .gte("cancelled_at", startIso)
        .lt("cancelled_at", endIso);
      if (e1) throw new Error(`Delete Add-Ons by date failed: ${e1.message}`);

      const { error: e2 } = await supabase
        .from("customer_sessions_cancelled")
        .delete()
        .gte("cancelled_at", startIso)
        .lt("cancelled_at", endIso);
      if (e2) throw new Error(`Delete Sessions by date failed: ${e2.message}`);

      const { error: e3 } = await supabase
        .from("promo_bookings_cancelled")
        .delete()
        .gte("cancelled_at", startIso)
        .lt("cancelled_at", endIso);
      if (e3) throw new Error(`Delete Promo by date failed: ${e3.message}`);

      const { error: e4 } = await supabase
        .from("consignment_cancelled")
        .delete()
        .gte("cancelled_at", startIso)
        .lt("cancelled_at", endIso);
      if (e4) throw new Error(`Delete Consignment by date failed: ${e4.message}`);

      setConfirmDeleteDate(false);
      await refresh();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Delete by date failed.");
    } finally {
      setBusyDelete(false);
    }
  };

  const exportExcelAll = async (): Promise<void> => {
    try {
      setBusyExport(true);
      const wb = new ExcelJS.Workbook();
      wb.creator = "Me Tyme Lounge";
      wb.created = new Date();

      const ws = wb.addWorksheet("Cancelled Records", {
        pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
        properties: { defaultRowHeight: 18 },
        views: [{ state: "frozen", ySplit: 5 }],
      });

      ws.columns = Array.from({ length: 18 }).map(() => ({ width: 20 }));

      const borderAll: Partial<ExcelJS.Borders> = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };

      const fillSolid = (argb: string): ExcelJS.Fill => ({
        type: "pattern",
        pattern: "solid",
        fgColor: { argb },
      });

      const setCell = (
        rowNo: number,
        colNo: number,
        value: ExcelJS.CellValue,
        opts?: {
          bold?: boolean;
          center?: boolean;
          right?: boolean;
          wrap?: boolean;
          fill?: string;
          numFmt?: string;
          size?: number;
        }
      ): void => {
        const cell = ws.getCell(rowNo, colNo);
        cell.value = value;
        cell.border = borderAll;
        cell.font = { bold: Boolean(opts?.bold), size: opts?.size ?? 11 };

        const h = opts?.center
          ? "center"
          : opts?.right
          ? "right"
          : ("left" as ExcelJS.Alignment["horizontal"]);

        cell.alignment = { vertical: "middle", horizontal: h, wrapText: opts?.wrap ?? true };
        if (opts?.fill) cell.fill = fillSolid(opts.fill);
        if (opts?.numFmt) cell.numFmt = opts.numFmt;
      };

      const mergeTitle = (rowNo: number, text: string, fill: string): void => {
        ws.mergeCells(rowNo, 1, rowNo, 18);
        setCell(rowNo, 1, text, { bold: true, center: true, size: 16, fill });
        ws.getRow(rowNo).height = 28;
      };

      const mergeSub = (rowNo: number, text: string): void => {
        ws.mergeCells(rowNo, 1, rowNo, 18);
        setCell(rowNo, 1, text, { bold: true, center: true, fill: "FFF3F4F6" });
      };

      const sectionTitle = (rowNo: number, text: string): void => {
        ws.mergeCells(rowNo, 1, rowNo, 18);
        setCell(rowNo, 1, text, { bold: true, fill: "FFE5E7EB", size: 13 });
        ws.getRow(rowNo).height = 22;
      };

      const header = (rowNo: number, cols: Array<{ c: number; label: string }>): void => {
        for (let c = 1; c <= 18; c++) setCell(rowNo, c, "", { fill: "FFF9FAFB" });
        for (const x of cols) {
          setCell(rowNo, x.c, x.label, {
            bold: true,
            center: true,
            fill: "FFF3F4F6",
            wrap: true,
          });
        }
        ws.getRow(rowNo).height = 20;
      };

      mergeTitle(1, "ME TYME LOUNGE — CANCELLED RECORDS", "FFFFFFFF");
      mergeSub(2, `Date (Cancelled): ${selectedDate}`);
      mergeSub(3, `Generated: ${new Date().toLocaleString("en-PH")}`);

      let r = 5;

      sectionTitle(r, "1) CANCELLED ADD-ONS");
      r++;
      header(r, [
        { c: 1, label: "Cancelled At" },
        { c: 2, label: "Full Name" },
        { c: 3, label: "Seat" },
        { c: 4, label: "Item" },
        { c: 5, label: "Category" },
        { c: 6, label: "Size" },
        { c: 7, label: "Qty" },
        { c: 8, label: "Price" },
        { c: 9, label: "Total" },
        { c: 10, label: "Paid" },
        { c: 11, label: "Description" },
      ]);
      r++;
      for (const g of groupedAddOns) {
        for (const it of g.items) {
          setCell(r, 1, formatDateTime(g.cancelled_at));
          setCell(r, 2, g.full_name);
          setCell(r, 3, g.seat_number, { center: true });
          setCell(r, 4, it.item_name);
          setCell(r, 5, it.category);
          setCell(r, 6, sizeText(it.size), { center: true });
          setCell(r, 7, it.quantity, { center: true });
          setCell(r, 8, it.price, { right: true, numFmt: "₱#,##0.00" });
          setCell(r, 9, it.total, { right: true, numFmt: "₱#,##0.00" });
          setCell(r, 10, g.is_paid ? "PAID" : "UNPAID", { center: true });
          setCell(r, 11, g.description || "-");
          r++;
        }
      }
      r += 2;

      sectionTitle(r, "2) CANCELLED WALK-IN");
      r++;
      header(r, [
        { c: 1, label: "Cancelled At" },
        { c: 2, label: "Date" },
        { c: 3, label: "Full Name" },
        { c: 4, label: "Phone" },
        { c: 5, label: "Seat" },
        { c: 6, label: "Type" },
        { c: 7, label: "Hours" },
        { c: 8, label: "Time In" },
        { c: 9, label: "Time Out" },
        { c: 10, label: "Amount" },
        { c: 11, label: "Discount" },
        { c: 12, label: "Down Payment" },
        { c: 13, label: "Paid" },
        { c: 14, label: "Cancel Reason" },
      ]);
      r++;
      for (const s of rowsSessions.filter((x) => x.reservation === "no")) {
        const disc = applyDiscount(s.total_amount, s.discount_kind, s.discount_value);
        setCell(r, 1, formatDateTime(s.cancelled_at));
        setCell(r, 2, s.date, { center: true });
        setCell(r, 3, s.full_name);
        setCell(r, 4, String(s.phone_number ?? "").trim() || "N/A");
        setCell(r, 5, s.seat_number, { center: true });
        setCell(r, 6, s.customer_type, { center: true });
        setCell(r, 7, s.hour_avail, { center: true });
        setCell(r, 8, formatTimeText(s.time_started), { center: true });
        setCell(r, 9, formatTimeText(s.time_ended), { center: true });
        setCell(r, 10, disc.discountedCost, { right: true, numFmt: "₱#,##0.00" });
        setCell(r, 11, getDiscountText(s.discount_kind, s.discount_value), { center: true });
        setCell(r, 12, s.down_payment, { right: true, numFmt: "₱#,##0.00" });
        setCell(r, 13, s.is_paid ? "PAID" : "UNPAID", { center: true });
        setCell(r, 14, s.cancel_reason || "-");
        r++;
      }
      r += 2;

      sectionTitle(r, "3) CANCELLED RESERVATION");
      r++;
      header(r, [
        { c: 1, label: "Cancelled At" },
        { c: 2, label: "Date" },
        { c: 3, label: "Reservation Date" },
        { c: 4, label: "Full Name" },
        { c: 5, label: "Phone" },
        { c: 6, label: "Seat" },
        { c: 7, label: "Type" },
        { c: 8, label: "Hours" },
        { c: 9, label: "Time In" },
        { c: 10, label: "Time Out" },
        { c: 11, label: "Amount" },
        { c: 12, label: "Discount" },
        { c: 13, label: "Down Payment" },
        { c: 14, label: "Paid" },
        { c: 15, label: "Cancel Reason" },
      ]);
      r++;
      for (const s of rowsSessions.filter((x) => x.reservation === "yes")) {
        const disc = applyDiscount(s.total_amount, s.discount_kind, s.discount_value);
        setCell(r, 1, formatDateTime(s.cancelled_at));
        setCell(r, 2, s.date, { center: true });
        setCell(r, 3, s.reservation_date ?? "-", { center: true });
        setCell(r, 4, s.full_name);
        setCell(r, 5, String(s.phone_number ?? "").trim() || "N/A");
        setCell(r, 6, s.seat_number, { center: true });
        setCell(r, 7, s.customer_type, { center: true });
        setCell(r, 8, s.hour_avail, { center: true });
        setCell(r, 9, formatTimeText(s.time_started), { center: true });
        setCell(r, 10, formatTimeText(s.time_ended), { center: true });
        setCell(r, 11, disc.discountedCost, { right: true, numFmt: "₱#,##0.00" });
        setCell(r, 12, getDiscountText(s.discount_kind, s.discount_value), { center: true });
        setCell(r, 13, s.down_payment, { right: true, numFmt: "₱#,##0.00" });
        setCell(r, 14, s.is_paid ? "PAID" : "UNPAID", { center: true });
        setCell(r, 15, s.cancel_reason || "-");
        r++;
      }
      r += 2;

      sectionTitle(r, "4) CANCELLED PROMO");
      r++;
      header(r, [
        { c: 1, label: "Cancelled At" },
        { c: 2, label: "Customer" },
        { c: 3, label: "Phone" },
        { c: 4, label: "Area" },
        { c: 5, label: "Seat" },
        { c: 6, label: "Package" },
        { c: 7, label: "Option" },
        { c: 8, label: "Start" },
        { c: 9, label: "End" },
        { c: 10, label: "Final Cost" },
        { c: 11, label: "Discount" },
        { c: 12, label: "Paid" },
        { c: 13, label: "Description" },
      ]);
      r++;
      for (const p of rowsPromo) {
        const disc = applyDiscount(p.price, p.discount_kind, p.discount_value);
        const optText =
          p.duration_value && p.duration_unit
            ? `${p.option_name} • ${formatDuration(Number(p.duration_value), p.duration_unit)}`
            : p.option_name;

        setCell(r, 1, formatDateTime(p.cancelled_at));
        setCell(r, 2, p.full_name);
        setCell(r, 3, String(p.phone_number ?? "").trim() || "N/A");
        setCell(r, 4, prettyArea(p.area), { center: true });
        setCell(r, 5, seatLabelPromo(p.area, p.seat_number), { center: true });
        setCell(r, 6, p.package_title);
        setCell(r, 7, optText);
        setCell(r, 8, formatDateTime(p.start_at), { center: true });
        setCell(r, 9, formatDateTime(p.end_at), { center: true });
        setCell(r, 10, disc.discountedCost, { right: true, numFmt: "₱#,##0.00" });
        setCell(r, 11, getDiscountText(p.discount_kind, p.discount_value), { center: true });
        setCell(r, 12, p.is_paid ? "PAID" : "UNPAID", { center: true });
        setCell(r, 13, p.description || "-");
        r++;
      }
      r += 2;

      sectionTitle(r, "5) CANCELLED CONSIGNMENT");
      r++;
      header(r, [
        { c: 1, label: "Cancelled At" },
        { c: 2, label: "Full Name" },
        { c: 3, label: "Seat" },
        { c: 4, label: "Item" },
        { c: 5, label: "Category" },
        { c: 6, label: "Size" },
        { c: 7, label: "Qty" },
        { c: 8, label: "Price" },
        { c: 9, label: "Total" },
        { c: 10, label: "Paid" },
        { c: 11, label: "Voided" },
        { c: 12, label: "Stock Returned" },
        { c: 13, label: "Cancel Note" },
      ]);
      r++;
      for (const g of groupedConsignment) {
        for (const it of g.items) {
          setCell(r, 1, formatDateTime(g.cancelled_at));
          setCell(r, 2, g.full_name);
          setCell(r, 3, g.seat_number, { center: true });
          setCell(r, 4, it.item_name);
          setCell(r, 5, it.category);
          setCell(r, 6, sizeText(it.size), { center: true });
          setCell(r, 7, it.quantity, { center: true });
          setCell(r, 8, it.price, { right: true, numFmt: "₱#,##0.00" });
          setCell(r, 9, it.total, { right: true, numFmt: "₱#,##0.00" });
          setCell(r, 10, g.is_paid ? "PAID" : "UNPAID", { center: true });
          setCell(r, 11, g.was_voided ? "YES" : "NO", { center: true });
          setCell(r, 12, g.stock_returned ? "YES" : "NO", { center: true });
          setCell(r, 13, g.cancel_note || "-");
          r++;
        }
      }

      const buffer = await wb.xlsx.writeBuffer();
      saveAs(
        new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        `cancelled_records_${selectedDate}.xlsx`
      );
    } catch (err) {
      console.error(err);
      alert("Export Excel failed.");
    } finally {
      setBusyExport(false);
    }
  };

  const currentCount = useMemo(() => {
    if (tab === "addons") return groupedAddOns.length;
    if (tab === "promo") return rowsPromo.length;
    if (tab === "consignment") return groupedConsignment.length;
    return rowsSessions.length;
  }, [tab, groupedAddOns.length, rowsPromo.length, groupedConsignment.length, rowsSessions.length]);

  return (
    <div className="acc-page">
      <div className="acc-shell">
        <div className="acc-hero">
          <div className="acc-eyebrow">ADMIN ARCHIVE</div>
          <h1 className="acc-title">Customer Cancelled Records</h1>
          <p className="acc-subtitle">
            View archived cancelled add-ons, walk-ins, reservations, promos, and
            consignment records in one premium workspace.
          </p>

          <div className="acc-toolbar">
            <div className="acc-control">
              <label>Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.currentTarget.value)}
              />
            </div>

            <div className="acc-actions-top">
              <button className="acc-btn acc-btn-dark" onClick={() => void refresh()} type="button">
                Refresh
              </button>
              <button
                className="acc-btn acc-btn-light"
                onClick={() => void exportExcelAll()}
                disabled={busyExport}
                type="button"
              >
                {busyExport ? "Exporting..." : "Export Excel"}
              </button>
              <button
                className="acc-btn acc-btn-danger"
                onClick={() => setConfirmDeleteDate(true)}
                disabled={busyDelete}
                type="button"
              >
                {busyDelete ? "Deleting..." : "Delete by Date"}
              </button>
            </div>
          </div>

          <div className="acc-tab-row">
            {(Object.keys(TAB_LABEL) as CancelTab[]).map((k) => (
              <button
                key={k}
                className={`acc-tab ${tab === k ? "is-active" : ""}`}
                onClick={() => setTab(k)}
                type="button"
              >
                {TAB_LABEL[k]}
              </button>
            ))}
          </div>
        </div>

        <div className="acc-top-meta">
          <div className="acc-meta-box">
            <span>Showing</span>
            <strong>{tabTitleFrom(tab)}</strong>
          </div>
          <div className="acc-meta-box">
            <span>Date</span>
            <strong>{selectedDate}</strong>
          </div>
          <div className="acc-meta-box">
            <span>Records</span>
            <strong>{currentCount}</strong>
          </div>
        </div>

        <div className="acc-table-wrap">
          {loading ? (
            <div className="acc-loading">
              <div className="acc-spinner" />
              <span>Loading...</span>
            </div>
          ) : tab === "addons" ? (
            groupedAddOns.length === 0 ? (
              <div className="acc-empty">No cancelled add-ons found.</div>
            ) : (
              <div className="acc-table-scroll">
                <table className="acc-table">
                  <thead>
                    <tr>
                      <th>Cancelled At</th>
                      <th>Customer</th>
                      <th>Items</th>
                      <th>Total</th>
                      <th>Payment</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedAddOns.map((g) => (
                      <tr key={g.key}>
                        <td>{formatDateTime(g.cancelled_at)}</td>
                        <td>
                          <div className="acc-stack">
                            <strong>{g.full_name}</strong>
                            <span>Seat: {g.seat_number}</span>
                            <span>{g.description || "—"}</span>
                          </div>
                        </td>
                        <td>
                          <div className="acc-list-mini">
                            {g.items.slice(0, 3).map((it) => (
                              <div key={it.id}>
                                {it.item_name} × {it.quantity}
                              </div>
                            ))}
                            {g.items.length > 3 ? (
                              <div className="acc-more">+{g.items.length - 3} more</div>
                            ) : null}
                          </div>
                        </td>
                        <td className="acc-strong">{moneyText(g.grand_total)}</td>
                        <td>
                          <div className="acc-stack">
                            <ReadOnlyBadge paid={g.is_paid} />
                            <span>GCash: {moneyText(g.gcash_amount)}</span>
                            <span>Cash: {moneyText(g.cash_amount)}</span>
                          </div>
                        </td>
                        <td>
                          <button
                            className="acc-btn-mini"
                            onClick={() => setSelectedGroupAddOns(g)}
                            type="button"
                          >
                            View Receipt
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : tab === "walkin" || tab === "reservation" ? (
            rowsSessions.length === 0 ? (
              <div className="acc-empty">No cancelled sessions found.</div>
            ) : (
              <div className="acc-table-scroll">
                <table className="acc-table">
                  <thead>
                    <tr>
                      <th>Cancelled At</th>
                      <th>Customer</th>
                      <th>Seat</th>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>Payment</th>
                      <th>Reason</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowsSessions.map((s) => {
                      const disc = applyDiscount(s.total_amount, s.discount_kind, s.discount_value);
                      return (
                        <tr key={s.id}>
                          <td>{formatDateTime(s.cancelled_at)}</td>
                          <td>
                            <div className="acc-stack">
                              <strong>{s.full_name}</strong>
                              <span>{String(s.phone_number ?? "").trim() || "N/A"}</span>
                              <span>
                                {formatTimeText(s.time_started)} - {formatTimeText(s.time_ended)}
                              </span>
                            </div>
                          </td>
                          <td>{s.seat_number}</td>
                          <td>
                            <div className="acc-stack">
                              <span>{s.customer_type}</span>
                              {s.reservation === "yes" ? (
                                <span>Reservation Date: {s.reservation_date ?? "—"}</span>
                              ) : null}
                            </div>
                          </td>
                          <td>
                            <div className="acc-stack">
                              <strong>{moneyText(disc.discountedCost)}</strong>
                              <span>Discount: {getDiscountText(s.discount_kind, s.discount_value)}</span>
                              <span>Down Payment: {moneyText(s.down_payment)}</span>
                            </div>
                          </td>
                          <td>
                            <div className="acc-stack">
                              <ReadOnlyBadge paid={s.is_paid} />
                              <span>GCash: {moneyText(s.gcash_amount)}</span>
                              <span>Cash: {moneyText(s.cash_amount)}</span>
                            </div>
                          </td>
                          <td>{s.cancel_reason || "-"}</td>
                          <td>
                            <button
                              className="acc-btn-mini"
                              onClick={() => setSelectedSession(s)}
                              type="button"
                            >
                              View Receipt
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : tab === "promo" ? (
            rowsPromo.length === 0 ? (
              <div className="acc-empty">No cancelled promos found.</div>
            ) : (
              <div className="acc-table-scroll">
                <table className="acc-table">
                  <thead>
                    <tr>
                      <th>Cancelled At</th>
                      <th>Customer</th>
                      <th>Package</th>
                      <th>Schedule</th>
                      <th>Price</th>
                      <th>Payment</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowsPromo.map((p) => {
                      const disc = applyDiscount(p.price, p.discount_kind, p.discount_value);
                      const optText =
                        p.duration_value && p.duration_unit
                          ? `${p.option_name} • ${formatDuration(Number(p.duration_value), p.duration_unit)}`
                          : p.option_name;

                      return (
                        <tr key={p.id}>
                          <td>{formatDateTime(p.cancelled_at)}</td>
                          <td>
                            <div className="acc-stack">
                              <strong>{p.full_name}</strong>
                              <span>{String(p.phone_number ?? "").trim() || "N/A"}</span>
                              <span>{prettyArea(p.area)}</span>
                            </div>
                          </td>
                          <td>
                            <div className="acc-stack">
                              <strong>{p.package_title}</strong>
                              <span>{optText}</span>
                              <span>Seat: {seatLabelPromo(p.area, p.seat_number)}</span>
                            </div>
                          </td>
                          <td>
                            <div className="acc-stack">
                              <span>Start: {formatDateTime(p.start_at)}</span>
                              <span>End: {formatDateTime(p.end_at)}</span>
                            </div>
                          </td>
                          <td>
                            <div className="acc-stack">
                              <strong>{moneyText(disc.discountedCost)}</strong>
                              <span>Discount: {getDiscountText(p.discount_kind, p.discount_value)}</span>
                            </div>
                          </td>
                          <td>
                            <div className="acc-stack">
                              <ReadOnlyBadge paid={p.is_paid} />
                              <span>GCash: {moneyText(p.gcash_amount)}</span>
                              <span>Cash: {moneyText(p.cash_amount)}</span>
                            </div>
                          </td>
                          <td>
                            <button
                              className="acc-btn-mini"
                              onClick={() => setSelectedPromo(p)}
                              type="button"
                            >
                              View Receipt
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : groupedConsignment.length === 0 ? (
            <div className="acc-empty">No cancelled consignment found.</div>
          ) : (
            <div className="acc-table-scroll">
              <table className="acc-table">
                <thead>
                  <tr>
                    <th>Cancelled At</th>
                    <th>Customer</th>
                    <th>Items</th>
                    <th>Total</th>
                    <th>Payment</th>
                    <th>Extra</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedConsignment.map((g) => (
                    <tr key={g.key}>
                      <td>{formatDateTime(g.cancelled_at)}</td>
                      <td>
                        <div className="acc-stack">
                          <strong>{g.full_name}</strong>
                          <span>Seat: {g.seat_number}</span>
                          <span>{g.cancel_note || "—"}</span>
                        </div>
                      </td>
                      <td>
                        <div className="acc-list-mini">
                          {g.items.slice(0, 3).map((it) => (
                            <div key={it.id}>
                              {it.item_name} × {it.quantity}
                            </div>
                          ))}
                          {g.items.length > 3 ? (
                            <div className="acc-more">+{g.items.length - 3} more</div>
                          ) : null}
                        </div>
                      </td>
                      <td className="acc-strong">{moneyText(g.grand_total)}</td>
                      <td>
                        <div className="acc-stack">
                          <ReadOnlyBadge paid={g.is_paid} />
                          <span>GCash: {moneyText(g.gcash_amount)}</span>
                          <span>Cash: {moneyText(g.cash_amount)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="acc-stack">
                          <span>Voided: {g.was_voided ? "YES" : "NO"}</span>
                          <span>Stock Returned: {g.stock_returned ? "YES" : "NO"}</span>
                        </div>
                      </td>
                      <td>
                        <button
                          className="acc-btn-mini"
                          onClick={() => setSelectedGroupConsignment(g)}
                          type="button"
                        >
                          View Receipt
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <FixedModal
          open={!!selectedGroupAddOns}
          title="Cancelled Add-On Receipt"
          size="md"
          onClose={() => setSelectedGroupAddOns(null)}
        >
          {selectedGroupAddOns ? (
            <div className="receipt-box">
              <div className="receipt-head-brand">
                <img src={logo} alt="logo" className="receipt-logo" />
                <div>
                  <h4>Me Tyme Lounge</h4>
                  <p>Cancelled Add-On Archive</p>
                </div>
              </div>

              <div className="receipt-row">
                <span>Cancelled At</span>
                <span>{formatDateTime(selectedGroupAddOns.cancelled_at)}</span>
              </div>
              <div className="receipt-row">
                <span>Customer</span>
                <span>{selectedGroupAddOns.full_name}</span>
              </div>
              <div className="receipt-row">
                <span>Seat</span>
                <span>{selectedGroupAddOns.seat_number}</span>
              </div>
              <div className="receipt-row">
                <span>Description</span>
                <span>{selectedGroupAddOns.description || "—"}</span>
              </div>
              <div className="receipt-row">
                <span>Payment</span>
                <span>{selectedGroupAddOns.is_paid ? "PAID" : "UNPAID"}</span>
              </div>

              <hr />

              {selectedGroupAddOns.items.map((it) => (
                <div key={it.id} className="receipt-order-item">
                  <div>
                    <strong>
                      {it.item_name}{" "}
                      <span className="receipt-muted">
                        ({it.category}
                        {String(it.size ?? "").trim() ? ` • ${sizeText(it.size)}` : ""})
                      </span>
                    </strong>
                    <span>
                      {it.quantity} × {moneyText(it.price)}
                    </span>
                  </div>
                  <strong>{moneyText(it.total)}</strong>
                </div>
              ))}

              <hr />

              <div className="receipt-row">
                <span>Total</span>
                <span className="receipt-strong">{moneyText(selectedGroupAddOns.grand_total)}</span>
              </div>
            </div>
          ) : null}
        </FixedModal>

        <FixedModal
          open={!!selectedSession}
          title="Cancelled Session Receipt"
          size="md"
          onClose={() => setSelectedSession(null)}
        >
          {selectedSession ? (
            <div className="receipt-box">
              <div className="receipt-head-brand">
                <img src={logo} alt="logo" className="receipt-logo" />
                <div>
                  <h4>Me Tyme Lounge</h4>
                  <p>Cancelled Session Archive</p>
                </div>
              </div>

              <div className="receipt-row">
                <span>Cancelled At</span>
                <span>{formatDateTime(selectedSession.cancelled_at)}</span>
              </div>
              <div className="receipt-row">
                <span>Customer</span>
                <span>{selectedSession.full_name}</span>
              </div>
              <div className="receipt-row">
                <span>Phone</span>
                <span>{String(selectedSession.phone_number ?? "").trim() || "N/A"}</span>
              </div>
              <div className="receipt-row">
                <span>Seat</span>
                <span>{selectedSession.seat_number}</span>
              </div>
              <div className="receipt-row">
                <span>Type</span>
                <span>{selectedSession.customer_type}</span>
              </div>
              <div className="receipt-row">
                <span>Schedule</span>
                <span>
                  {formatTimeText(selectedSession.time_started)} - {formatTimeText(selectedSession.time_ended)}
                </span>
              </div>
              {selectedSession.reservation === "yes" ? (
                <div className="receipt-row">
                  <span>Reservation Date</span>
                  <span>{selectedSession.reservation_date ?? "—"}</span>
                </div>
              ) : null}

              {(() => {
                const disc = applyDiscount(
                  selectedSession.total_amount,
                  selectedSession.discount_kind,
                  selectedSession.discount_value
                );
                return (
                  <>
                    <div className="receipt-row">
                      <span>Base Amount</span>
                      <span>{moneyText(selectedSession.total_amount)}</span>
                    </div>
                    <div className="receipt-row">
                      <span>Discount</span>
                      <span>{getDiscountText(selectedSession.discount_kind, selectedSession.discount_value)}</span>
                    </div>
                    <div className="receipt-row">
                      <span>Final Amount</span>
                      <span>{moneyText(disc.discountedCost)}</span>
                    </div>
                  </>
                );
              })()}

              <div className="receipt-row">
                <span>Down Payment</span>
                <span>{moneyText(selectedSession.down_payment)}</span>
              </div>
              <div className="receipt-row">
                <span>Payment</span>
                <span>{selectedSession.is_paid ? "PAID" : "UNPAID"}</span>
              </div>
              <div className="receipt-row">
                <span>Reason</span>
                <span>{selectedSession.cancel_reason || "—"}</span>
              </div>
            </div>
          ) : null}
        </FixedModal>

        <FixedModal
          open={!!selectedPromo}
          title="Cancelled Promo Receipt"
          size="md"
          onClose={() => setSelectedPromo(null)}
        >
          {selectedPromo ? (
            <div className="receipt-box">
              <div className="receipt-head-brand">
                <img src={logo} alt="logo" className="receipt-logo" />
                <div>
                  <h4>Me Tyme Lounge</h4>
                  <p>Cancelled Promo Archive</p>
                </div>
              </div>

              <div className="receipt-row">
                <span>Cancelled At</span>
                <span>{formatDateTime(selectedPromo.cancelled_at)}</span>
              </div>
              <div className="receipt-row">
                <span>Customer</span>
                <span>{selectedPromo.full_name}</span>
              </div>
              <div className="receipt-row">
                <span>Phone</span>
                <span>{String(selectedPromo.phone_number ?? "").trim() || "N/A"}</span>
              </div>
              <div className="receipt-row">
                <span>Area</span>
                <span>{prettyArea(selectedPromo.area)}</span>
              </div>
              <div className="receipt-row">
                <span>Seat</span>
                <span>{seatLabelPromo(selectedPromo.area, selectedPromo.seat_number)}</span>
              </div>
              <div className="receipt-row">
                <span>Package</span>
                <span>{selectedPromo.package_title}</span>
              </div>
              <div className="receipt-row">
                <span>Option</span>
                <span>
                  {selectedPromo.duration_value && selectedPromo.duration_unit
                    ? `${selectedPromo.option_name} • ${formatDuration(
                        Number(selectedPromo.duration_value),
                        selectedPromo.duration_unit
                      )}`
                    : selectedPromo.option_name}
                </span>
              </div>
              <div className="receipt-row">
                <span>Start</span>
                <span>{formatDateTime(selectedPromo.start_at)}</span>
              </div>
              <div className="receipt-row">
                <span>End</span>
                <span>{formatDateTime(selectedPromo.end_at)}</span>
              </div>

              {(() => {
                const disc = applyDiscount(
                  selectedPromo.price,
                  selectedPromo.discount_kind,
                  selectedPromo.discount_value
                );
                return (
                  <>
                    <div className="receipt-row">
                      <span>Base Price</span>
                      <span>{moneyText(selectedPromo.price)}</span>
                    </div>
                    <div className="receipt-row">
                      <span>Discount</span>
                      <span>{getDiscountText(selectedPromo.discount_kind, selectedPromo.discount_value)}</span>
                    </div>
                    <div className="receipt-row">
                      <span>Final Price</span>
                      <span>{moneyText(disc.discountedCost)}</span>
                    </div>
                  </>
                );
              })()}

              <div className="receipt-row">
                <span>Description</span>
                <span>{selectedPromo.description || "—"}</span>
              </div>
              <div className="receipt-row">
                <span>Payment</span>
                <span>{selectedPromo.is_paid ? "PAID" : "UNPAID"}</span>
              </div>
            </div>
          ) : null}
        </FixedModal>

        <FixedModal
          open={!!selectedGroupConsignment}
          title="Cancelled Consignment Receipt"
          size="md"
          onClose={() => setSelectedGroupConsignment(null)}
        >
          {selectedGroupConsignment ? (
            <div className="receipt-box">
              <div className="receipt-head-brand">
                <img src={logo} alt="logo" className="receipt-logo" />
                <div>
                  <h4>Me Tyme Lounge</h4>
                  <p>Cancelled Consignment Archive</p>
                </div>
              </div>

              <div className="receipt-row">
                <span>Cancelled At</span>
                <span>{formatDateTime(selectedGroupConsignment.cancelled_at)}</span>
              </div>
              <div className="receipt-row">
                <span>Customer</span>
                <span>{selectedGroupConsignment.full_name}</span>
              </div>
              <div className="receipt-row">
                <span>Seat</span>
                <span>{selectedGroupConsignment.seat_number}</span>
              </div>
              <div className="receipt-row">
                <span>Payment</span>
                <span>{selectedGroupConsignment.is_paid ? "PAID" : "UNPAID"}</span>
              </div>
              <div className="receipt-row">
                <span>Cancel Note</span>
                <span>{selectedGroupConsignment.cancel_note || "—"}</span>
              </div>

              <hr />

              {selectedGroupConsignment.items.map((it) => (
                <div key={it.id} className="receipt-order-item">
                  <div>
                    <strong>
                      {it.item_name}{" "}
                      <span className="receipt-muted">
                        ({it.category}
                        {String(it.size ?? "").trim() ? ` • ${sizeText(it.size)}` : ""})
                      </span>
                    </strong>
                    <span>
                      {it.quantity} × {moneyText(it.price)}
                    </span>
                  </div>
                  <strong>{moneyText(it.total)}</strong>
                </div>
              ))}

              <hr />

              <div className="receipt-row">
                <span>Total</span>
                <span className="receipt-strong">{moneyText(selectedGroupConsignment.grand_total)}</span>
              </div>
              <div className="receipt-row">
                <span>Voided</span>
                <span>{selectedGroupConsignment.was_voided ? "YES" : "NO"}</span>
              </div>
              <div className="receipt-row">
                <span>Void Note</span>
                <span>{String(selectedGroupConsignment.void_note ?? "").trim() || "—"}</span>
              </div>
              <div className="receipt-row">
                <span>Stock Returned</span>
                <span>{selectedGroupConsignment.stock_returned ? "YES" : "NO"}</span>
              </div>
            </div>
          ) : null}
        </FixedModal>

        <FixedModal
          open={confirmDeleteDate}
          title="Delete all cancelled records by date?"
          size="sm"
          onClose={() => setConfirmDeleteDate(false)}
        >
          <div className="acc-confirm-text">
            This will delete all cancelled records for <strong>{selectedDate}</strong> across
            Add-Ons, Walk-in, Reservation, Promo, and Consignment.
          </div>

          <div className="acc-modal-actions">
            <button
              className="acc-btn acc-btn-light"
              onClick={() => setConfirmDeleteDate(false)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="acc-btn acc-btn-danger"
              onClick={() => void deleteByDateAll()}
              disabled={busyDelete}
              type="button"
            >
              {busyDelete ? "Deleting..." : "Delete"}
            </button>
          </div>
        </FixedModal>
      </div>
    </div>
  );
};

export default Admin_Customer_Cancelled;