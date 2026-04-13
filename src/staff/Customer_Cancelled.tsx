import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../utils/supabaseClient";
import logo from "../assets/study_hub.png";
import "../styles/Customer_Cancelled.css";

type NumericLike = number | string;
type DiscountKind = "none" | "percent" | "amount";
type PackageArea = "common_area" | "conference_room";
type DurationUnit = "hour" | "day" | "month" | "year";
type CancelTab = "addons" | "walkin" | "reservation" | "promo" | "consignment";

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
  reservation_end_date?: string | null;
  id_number: string | null;
  seat_number: string;
  promo_booking_id: string | null;
  booking_code?: string | null;
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
  reservation_end_date?: string | null;
  full_name: string;
  phone_number: string | null;
  customer_type: string;
  customer_field: string | null;
  has_id: boolean;
  id_number: string | null;
  seat_number: string;
  booking_code?: string | null;
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
  original_id: string;
  original_created_at: string | null;
  consignment_id: string;
  quantity: number | string;
  price: number | string;
  total: number | string;
  full_name: string;
  seat_number: string;
  gcash_amount: number | string;
  cash_amount: number | string;
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

type ConsignmentCancelled = {
  id: string;
  cancelled_at: string;
  original_id: string;
  original_created_at: string | null;
  consignment_id: string;
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
  item_name: string;
  category: string;
  size: string | null;
  image_url: string | null;
  cancel_note: string;
  stock_returned: boolean;
};

const TAB_LABEL: Record<CancelTab, string> = {
  addons: "Add-Ons",
  walkin: "Walk-in",
  reservation: "Reservation",
  promo: "Promo (Membership)",
  consignment: "Consignment",
};

const toNumber = (v: NumericLike | null | undefined): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const round2 = (n: number): number => Number((Number.isFinite(n) ? n : 0).toFixed(2));

const toBool = (v: unknown): boolean => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes" || s === "paid";
  }
  return false;
};

const norm = (s: string | null | undefined): string => (s ?? "").trim().toLowerCase();

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

const formatReservationRange = (
  start: string | null | undefined,
  end: string | null | undefined
): string => {
  const s = String(start ?? "").trim();
  const e = String(end ?? "").trim();
  if (!s && !e) return "-";
  if (s && e && s !== e) return `${s} → ${e}`;
  return s || e || "-";
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

const GROUP_WINDOW_MS = 10_000;

const ReadOnlyBadge: React.FC<{ paid: boolean }> = ({ paid }) => {
  return (
    <span className={`cnc-pay-badge ${paid ? "cnc-pay-badge--paid" : "cnc-pay-badge--unpaid"}`}>
      {paid ? "PAID" : "UNPAID"}
    </span>
  );
};

type FixedCenterModalProps = {
  open: boolean;
  title: string;
  size?: "sm" | "md" | "lg" | "xl";
  hideClose?: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

const FixedCenterModal: React.FC<FixedCenterModalProps> = ({
  open,
  title,
  size = "md",
  hideClose = false,
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
    <div className="cnc-modal-overlay" onClick={onClose}>
      <div
        className={`cnc-modal-card cnc-modal-${size}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {title ? (
          <div className="cnc-modal-head">
            <h3>{title}</h3>
            {!hideClose && (
              <button className="cnc-modal-close" onClick={onClose} type="button" aria-label="Close">
                ×
              </button>
            )}
          </div>
        ) : null}

        <div className="cnc-modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
};

const Customer_Cancelled: React.FC = () => {
  const [tab, setTab] = useState<CancelTab>("addons");
  const [selectedDate, setSelectedDate] = useState<string>(yyyyMmDdLocal(new Date()));
  const [loading, setLoading] = useState<boolean>(true);

  const [rowsAddOns, setRowsAddOns] = useState<CancelItemAddOn[]>([]);
  const [selectedGroupAddOns, setSelectedGroupAddOns] = useState<CancelGroupAddOn | null>(null);

  const [rowsSessions, setRowsSessions] = useState<CancelledSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<CancelledSession | null>(null);

  const [rowsPromo, setRowsPromo] = useState<CancelledPromo[]>([]);
  const [selectedPromo, setSelectedPromo] = useState<CancelledPromo | null>(null);

  const [rowsConsignment, setRowsConsignment] = useState<ConsignmentCancelled[]>([]);
  const [selectedConsignment, setSelectedConsignment] = useState<ConsignmentCancelled | null>(null);

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
    setSelectedConsignment(null);

    if (tab === "addons") {
      await fetchCancelledAddOns(selectedDate);
    } else if (tab === "walkin") {
      await fetchCancelledSessions(selectedDate, "no");
    } else if (tab === "reservation") {
      await fetchCancelledSessions(selectedDate, "yes");
    } else if (tab === "promo") {
      await fetchCancelledPromo(selectedDate);
    } else {
      await fetchCancelledConsignment(selectedDate);
    }
  };

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
        current = {
          key: `${norm(r.full_name)}|${norm(r.seat_number)}|${ms(r.cancelled_at)}|${norm(
            r.description
          )}`,
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
        reservation_end_date,
        id_number,
        seat_number,
        promo_booking_id,
        booking_code,
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

    const mapped: CancelledSession[] = (data ?? []).map((r) => {
      const kindRaw = String(r.discount_kind ?? "none") as DiscountKind;
      const kind: DiscountKind =
        kindRaw === "percent" || kindRaw === "amount" || kindRaw === "none" ? kindRaw : "none";

      return {
        id: r.id,
        cancelled_at: r.cancelled_at,
        cancel_reason: String(r.cancel_reason ?? "").trim() || "-",
        date: String(r.date ?? ""),
        reservation: (String(r.reservation ?? "no") === "yes" ? "yes" : "no") as "no" | "yes",
        reservation_date: r.reservation_date ?? null,
        reservation_end_date: r.reservation_end_date ?? null,
        full_name: String(r.full_name ?? "-"),
        phone_number: r.phone_number ?? null,
        customer_type: String(r.customer_type ?? "-"),
        customer_field: r.customer_field ?? null,
        has_id: Boolean(r.has_id),
        id_number: r.id_number ?? null,
        seat_number: String(r.seat_number ?? "-"),
        booking_code: r.booking_code ?? null,
        hour_avail: String(r.hour_avail ?? "-"),
        time_started: String(r.time_started ?? ""),
        time_ended: String(r.time_ended ?? ""),
        total_time: round2(Math.max(0, toNumber(r.total_time))),
        total_amount: round2(Math.max(0, toNumber(r.total_amount))),
        discount_kind: kind,
        discount_value: round2(Math.max(0, toNumber(r.discount_value))),
        discount_reason: r.discount_reason ?? null,
        down_payment: round2(Math.max(0, toNumber(r.down_payment))),
        gcash_amount: round2(Math.max(0, toNumber(r.gcash_amount))),
        cash_amount: round2(Math.max(0, toNumber(r.cash_amount))),
        is_paid: toBool(r.is_paid),
        paid_at: r.paid_at ?? null,
      };
    });

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
        : Promise.resolve({ data: [] as PackageRow[], error: null }),
      optIds.length
        ? supabase
            .from("package_options")
            .select("id,option_name,duration_value,duration_unit")
            .in("id", optIds)
            .returns<PackageOptionRow[]>()
        : Promise.resolve({ data: [] as PackageOptionRow[], error: null }),
    ]);

    const pkgMap = new Map<string, PackageRow>();
    (pkgRes.data ?? []).forEach((p) => pkgMap.set(p.id, p));

    const optMap = new Map<string, PackageOptionRow>();
    (optRes.data ?? []).forEach((o) => optMap.set(o.id, o));

    const mapped: CancelledPromo[] = rows.map((r) => {
      const kind = normalizeDiscountKind(r.discount_kind);
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
        discount_kind: kind,
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
      .order("cancelled_at", { ascending: false })
      .returns<ConsignmentCancelledDB[]>();

    if (error) {
      console.error("FETCH CANCELLED CONSIGNMENT ERROR:", error);
      setRowsConsignment([]);
      setLoading(false);
      return;
    }

    const mapped: ConsignmentCancelled[] = (data ?? []).map((r) => {
      const qty = Math.max(0, Math.floor(Number(r.quantity) || 0));
      const price = round2(Math.max(0, toNumber(r.price)));
      const totalDb = round2(Math.max(0, toNumber(r.total)));
      const total = totalDb > 0 ? totalDb : round2(qty * price);

      return {
        id: r.id,
        cancelled_at: r.cancelled_at,
        original_id: r.original_id,
        original_created_at: r.original_created_at ?? null,
        consignment_id: r.consignment_id,
        quantity: qty,
        price,
        total,
        full_name: String(r.full_name ?? "-"),
        seat_number: String(r.seat_number ?? "-"),
        gcash_amount: round2(Math.max(0, toNumber(r.gcash_amount))),
        cash_amount: round2(Math.max(0, toNumber(r.cash_amount))),
        is_paid: toBool(r.is_paid),
        paid_at: r.paid_at ?? null,
        was_voided: toBool(r.was_voided),
        voided_at: r.voided_at ?? null,
        void_note: r.void_note ?? null,
        item_name: String(r.item_name ?? "-"),
        category: String(r.category ?? "").trim() || "—",
        size: r.size ?? null,
        image_url: r.image_url ?? null,
        cancel_note: String(r.cancel_note ?? "").trim() || "-",
        stock_returned: toBool(r.stock_returned),
      };
    });

    setRowsConsignment(mapped);
    setLoading(false);
  };

  const tabTitle =
    tab === "addons"
      ? "Cancelled Add-Ons"
      : tab === "walkin"
      ? "Cancelled Walk-in"
      : tab === "reservation"
      ? "Cancelled Reservation"
      : tab === "promo"
      ? "Cancelled Promo Membership"
      : "Cancelled Consignment";

  const countText =
    tab === "addons"
      ? groupedAddOns.length
      : tab === "promo"
      ? rowsPromo.length
      : tab === "consignment"
      ? rowsConsignment.length
      : rowsSessions.length;

  return (
    <div className="cnc-page">
      <div className="cnc-shell">
        <section className="cnc-hero">
          <div className="cnc-eyebrow">CANCELLED RECORDS</div>
          <h1 className="cnc-title">{tabTitle}</h1>
          <p className="cnc-subtitle">
            Showing cancelled records for <strong>{selectedDate}</strong> ({countText}). Read-only only.
          </p>

          <div className="cnc-toolbar">
            <div className="cnc-control">
              <label>Type</label>
              <select
                value={tab}
                onChange={(e) => setTab(e.currentTarget.value as CancelTab)}
              >
                <option value="addons">{TAB_LABEL.addons}</option>
                <option value="walkin">{TAB_LABEL.walkin}</option>
                <option value="reservation">{TAB_LABEL.reservation}</option>
                <option value="promo">{TAB_LABEL.promo}</option>
                <option value="consignment">{TAB_LABEL.consignment}</option>
              </select>
            </div>

            <div className="cnc-control">
              <label>Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.currentTarget.value)}
              />
            </div>

            <div className="cnc-actions-top">
              <button className="cnc-btn cnc-btn-light" onClick={() => setSelectedDate(yyyyMmDdLocal(new Date()))} type="button">
                Today
              </button>
              <button className="cnc-btn cnc-btn-dark" onClick={() => void refresh()} type="button">
                Refresh
              </button>
            </div>
          </div>

          <div className="cnc-tab-row">
            {(Object.keys(TAB_LABEL) as CancelTab[]).map((key) => (
              <button
                key={key}
                className={`cnc-tab ${tab === key ? "is-active" : ""}`}
                onClick={() => setTab(key)}
                type="button"
              >
                {TAB_LABEL[key]}
              </button>
            ))}
          </div>
        </section>

        <section className="cnc-table-wrap">
          {loading ? (
            <div className="cnc-empty">Loading...</div>
          ) : tab === "addons" ? (
            groupedAddOns.length === 0 ? (
              <div className="cnc-empty">No cancelled add-ons found for this date.</div>
            ) : (
              <div className="cnc-table-scroll">
                <table className="cnc-table">
                  <thead>
                    <tr>
                      <th>Cancelled At</th>
                      <th>Full Name</th>
                      <th>Seat</th>
                      <th>Items</th>
                      <th>Grand Total</th>
                      <th>Description</th>
                      <th>Paid</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedAddOns.map((g) => (
                      <tr key={g.key}>
                        <td>{formatDateTime(g.cancelled_at)}</td>
                        <td>{g.full_name || "-"}</td>
                        <td>{g.seat_number || "-"}</td>
                        <td>
                          <div className="cnc-list-mini">
                            {g.items.map((it) => (
                              <div key={it.id}>
                                <strong>{it.item_name}</strong> ({it.category}
                                {String(it.size ?? "").trim() ? ` • ${sizeText(it.size)}` : ""}) — Qty:{" "}
                                {it.quantity} • {moneyText(it.price)} • {moneyText(it.total)}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="cnc-strong">{moneyText(g.grand_total)}</td>
                        <td>{g.description || "-"}</td>
                        <td><ReadOnlyBadge paid={g.is_paid} /></td>
                        <td>
                          <button className="cnc-btn-mini" onClick={() => setSelectedGroupAddOns(g)} type="button">
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
              <div className="cnc-empty">No cancelled sessions found for this date.</div>
            ) : (
              <div className="cnc-table-scroll">
                <table className="cnc-table">
                  <thead>
                    <tr>
                      <th>Cancelled At</th>
                      <th>Date</th>
                      {tab === "reservation" && <th>Reservation Range</th>}
                      <th>Full Name</th>
                      <th>Phone #</th>
                      <th>Seat</th>
                      <th>Type</th>
                      <th>Hours</th>
                      <th>Time In</th>
                      <th>Time Out</th>
                      <th>Total Amount</th>
                      <th>Discount</th>
                      <th>Down Payment</th>
                      <th>Paid</th>
                      <th>Cancel Reason</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowsSessions.map((s) => {
                      const base = round2(Math.max(0, s.total_amount));
                      const disc = applyDiscount(base, s.discount_kind, s.discount_value);
                      const dp = round2(Math.max(0, s.down_payment));
                      const afterDp = round2(Math.max(0, disc.discountedCost - dp));

                      return (
                        <tr key={s.id}>
                          <td>{formatDateTime(s.cancelled_at)}</td>
                          <td>{s.date}</td>
                          {tab === "reservation" && (
                            <td>{formatReservationRange(s.reservation_date, s.reservation_end_date)}</td>
                          )}
                          <td>{s.full_name}</td>
                          <td>{String(s.phone_number ?? "").trim() || "N/A"}</td>
                          <td>{s.seat_number}</td>
                          <td>{s.customer_type}</td>
                          <td>{s.hour_avail}</td>
                          <td>{formatTimeText(s.time_started)}</td>
                          <td>{formatTimeText(s.time_ended)}</td>
                          <td className="cnc-strong">{moneyText(base)}</td>
                          <td>{getDiscountText(s.discount_kind, s.discount_value)}</td>
                          <td>{moneyText(dp)}</td>
                          <td><ReadOnlyBadge paid={s.is_paid} /></td>
                          <td>{s.cancel_reason || "-"}</td>
                          <td>
                            <div className="cnc-stack">
                              <button className="cnc-btn-mini" onClick={() => setSelectedSession(s)} type="button">
                                View Receipt
                              </button>
                              <span>
                                After DP: <strong>{moneyText(afterDp)}</strong>
                              </span>
                            </div>
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
              <div className="cnc-empty">No cancelled promo records found for this date.</div>
            ) : (
              <div className="cnc-table-scroll">
                <table className="cnc-table">
                  <thead>
                    <tr>
                      <th>Cancelled At</th>
                      <th>Customer</th>
                      <th>Phone #</th>
                      <th>Area</th>
                      <th>Seat</th>
                      <th>Package</th>
                      <th>Option</th>
                      <th>Start</th>
                      <th>End</th>
                      <th>Total</th>
                      <th>Discount</th>
                      <th>Paid</th>
                      <th>Description</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowsPromo.map((p) => {
                      const base = round2(Math.max(0, p.price));
                      const disc = applyDiscount(base, p.discount_kind, p.discount_value);
                      const due = round2(disc.discountedCost);

                      return (
                        <tr key={p.id}>
                          <td>{formatDateTime(p.cancelled_at)}</td>
                          <td>{p.full_name}</td>
                          <td>{String(p.phone_number ?? "").trim() || "N/A"}</td>
                          <td>{prettyArea(p.area)}</td>
                          <td>{seatLabelPromo(p.area, p.seat_number)}</td>
                          <td>{p.package_title}</td>
                          <td>
                            {p.duration_value && p.duration_unit
                              ? `${p.option_name} • ${formatDuration(Number(p.duration_value), p.duration_unit)}`
                              : p.option_name}
                          </td>
                          <td>{formatDateTime(p.start_at)}</td>
                          <td>{formatDateTime(p.end_at)}</td>
                          <td className="cnc-strong">{moneyText(due)}</td>
                          <td>{getDiscountText(p.discount_kind, p.discount_value)}</td>
                          <td><ReadOnlyBadge paid={p.is_paid} /></td>
                          <td>{p.description || "-"}</td>
                          <td>
                            <button className="cnc-btn-mini" onClick={() => setSelectedPromo(p)} type="button">
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
          ) : rowsConsignment.length === 0 ? (
            <div className="cnc-empty">No cancelled consignment records found for this date.</div>
          ) : (
            <div className="cnc-table-scroll">
              <table className="cnc-table">
                <thead>
                  <tr>
                    <th>Cancelled At</th>
                    <th>Full Name</th>
                    <th>Seat</th>
                    <th>Item</th>
                    <th>Category</th>
                    <th>Size</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th>Total</th>
                    <th>Paid</th>
                    <th>Stock Returned</th>
                    <th>Void</th>
                    <th>Cancel Note</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsConsignment.map((c) => (
                    <tr key={c.id}>
                      <td>{formatDateTime(c.cancelled_at)}</td>
                      <td>{c.full_name}</td>
                      <td>{c.seat_number}</td>
                      <td className="cnc-strong">{c.item_name}</td>
                      <td>{c.category}</td>
                      <td>{sizeText(c.size)}</td>
                      <td>{c.quantity}</td>
                      <td>{moneyText(c.price)}</td>
                      <td className="cnc-strong">{moneyText(c.total)}</td>
                      <td><ReadOnlyBadge paid={c.is_paid} /></td>
                      <td>{c.stock_returned ? "Yes" : "No"}</td>
                      <td>{c.was_voided ? "VOIDED" : "—"}</td>
                      <td>{c.cancel_note}</td>
                      <td>
                        <button className="cnc-btn-mini" onClick={() => setSelectedConsignment(c)} type="button">
                          View Receipt
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <FixedCenterModal
        open={!!selectedGroupAddOns}
        title=""
        size="sm"
        hideClose={true}
        onClose={() => setSelectedGroupAddOns(null)}
      >
        {selectedGroupAddOns && (
          <div className="cnc-receipt">
            <div className="cnc-receipt-head">
              <img src={logo} alt="Me Tyme Lounge" className="cnc-receipt-logo" />
              <div className="cnc-receipt-brand-top">ME TYME LOUNGE</div>
              <div className="cnc-receipt-brand-title">Cancelled Add-Ons Receipt</div>
            </div>

            <div className="cnc-receipt-block">
              <div className="cnc-receipt-row"><span>Cancelled At</span><strong>{formatDateTime(selectedGroupAddOns.cancelled_at)}</strong></div>
              <div className="cnc-receipt-row"><span>Customer</span><strong>{selectedGroupAddOns.full_name}</strong></div>
              <div className="cnc-receipt-row"><span>Seat</span><strong>{selectedGroupAddOns.seat_number}</strong></div>
              <div className="cnc-receipt-row"><span>Description</span><strong>{selectedGroupAddOns.description || "-"}</strong></div>
              <div className="cnc-receipt-row"><span>Status</span><strong className={selectedGroupAddOns.is_paid ? "cnc-receipt-status paid" : "cnc-receipt-status unpaid"}>{selectedGroupAddOns.is_paid ? "PAID" : "UNPAID"}</strong></div>
            </div>

            <div className="cnc-receipt-items">
              {selectedGroupAddOns.items.map((it) => (
                <div key={it.id} className="cnc-receipt-item">
                  <div className="cnc-receipt-item-left">
                    <div className="cnc-receipt-item-name">
                      {it.item_name} <span>({it.category}{String(it.size ?? "").trim() ? ` • ${sizeText(it.size)}` : ""})</span>
                    </div>
                    <div className="cnc-receipt-item-sub">
                      {it.quantity} × {moneyText(it.price)}
                    </div>
                  </div>
                  <div className="cnc-receipt-item-total">{moneyText(it.total)}</div>
                </div>
              ))}
            </div>

            <div className="cnc-receipt-total">
              <span>Total</span>
              <strong>{moneyText(selectedGroupAddOns.grand_total)}</strong>
            </div>

            <p className="cnc-receipt-footer">
              Cancelled record archived
              <br />
              <strong>Me Tyme Lounge</strong>
            </p>

            <button className="cnc-btn cnc-btn-light" onClick={() => setSelectedGroupAddOns(null)} type="button">
              Close
            </button>
          </div>
        )}
      </FixedCenterModal>

      <FixedCenterModal
        open={!!selectedSession}
        title=""
        size="sm"
        hideClose={true}
        onClose={() => setSelectedSession(null)}
      >
        {selectedSession && (() => {
          const base = round2(Math.max(0, selectedSession.total_amount));
          const disc = applyDiscount(base, selectedSession.discount_kind, selectedSession.discount_value);
          const dp = round2(Math.max(0, selectedSession.down_payment));
          const afterDp = round2(Math.max(0, disc.discountedCost - dp));
          const change = round2(Math.max(0, dp - disc.discountedCost));
          const bottomLabel = afterDp > 0 ? "Balance After DP" : "Change";
          const bottomVal = afterDp > 0 ? afterDp : change;

          return (
            <div className="cnc-receipt">
              <div className="cnc-receipt-head">
                <img src={logo} alt="Me Tyme Lounge" className="cnc-receipt-logo" />
                <div className="cnc-receipt-brand-top">ME TYME LOUNGE</div>
                <div className="cnc-receipt-brand-title">
                  {selectedSession.reservation === "yes"
                    ? "Cancelled Reservation Receipt"
                    : "Cancelled Walk-in Receipt"}
                </div>
              </div>

              <div className="cnc-receipt-block">
                <div className="cnc-receipt-row"><span>Cancelled At</span><strong>{formatDateTime(selectedSession.cancelled_at)}</strong></div>
                <div className="cnc-receipt-row"><span>Date</span><strong>{selectedSession.date}</strong></div>
                {selectedSession.reservation === "yes" && (
                  <div className="cnc-receipt-row">
                    <span>Reservation Range</span>
                    <strong>{formatReservationRange(selectedSession.reservation_date, selectedSession.reservation_end_date)}</strong>
                  </div>
                )}
                <div className="cnc-receipt-row"><span>Customer</span><strong>{selectedSession.full_name}</strong></div>
                <div className="cnc-receipt-row"><span>Phone</span><strong>{String(selectedSession.phone_number ?? "").trim() || "N/A"}</strong></div>
                <div className="cnc-receipt-row"><span>Type</span><strong>{selectedSession.customer_type}</strong></div>
                <div className="cnc-receipt-row"><span>Field</span><strong>{selectedSession.customer_field ?? "-"}</strong></div>
                <div className="cnc-receipt-row"><span>Seat</span><strong>{selectedSession.seat_number}</strong></div>
                <div className="cnc-receipt-row"><span>Time In</span><strong>{formatTimeText(selectedSession.time_started)}</strong></div>
                <div className="cnc-receipt-row"><span>Time Out</span><strong>{formatTimeText(selectedSession.time_ended)}</strong></div>
                <div className="cnc-receipt-row"><span>Total Time</span><strong>{selectedSession.total_time}</strong></div>
              </div>

              <div className="cnc-receipt-block">
                <div className="cnc-receipt-row"><span>System Cost (Before)</span><strong>{moneyText(base)}</strong></div>
                <div className="cnc-receipt-row"><span>Discount</span><strong>{getDiscountText(selectedSession.discount_kind, selectedSession.discount_value)}</strong></div>
                <div className="cnc-receipt-row"><span>System Cost (After Discount)</span><strong>{moneyText(disc.discountedCost)}</strong></div>
                <div className="cnc-receipt-row"><span>Down Payment</span><strong>{moneyText(dp)}</strong></div>
                <div className="cnc-receipt-row"><span>GCash</span><strong>{moneyText(selectedSession.gcash_amount)}</strong></div>
                <div className="cnc-receipt-row"><span>Cash</span><strong>{moneyText(selectedSession.cash_amount)}</strong></div>
                <div className="cnc-receipt-row"><span>Status</span><strong className={selectedSession.is_paid ? "cnc-receipt-status paid" : "cnc-receipt-status unpaid"}>{selectedSession.is_paid ? "PAID" : "UNPAID"}</strong></div>
                <div className="cnc-receipt-row"><span>Cancel Reason</span><strong>{selectedSession.cancel_reason || "-"}</strong></div>
              </div>

              <div className="cnc-receipt-total">
                <span>{bottomLabel}</span>
                <strong>{moneyText(bottomVal)}</strong>
              </div>

              <p className="cnc-receipt-footer">
                Cancelled record archived
                <br />
                <strong>Me Tyme Lounge</strong>
              </p>

              <button className="cnc-btn cnc-btn-light" onClick={() => setSelectedSession(null)} type="button">
                Close
              </button>
            </div>
          );
        })()}
      </FixedCenterModal>

      <FixedCenterModal
        open={!!selectedPromo}
        title=""
        size="sm"
        hideClose={true}
        onClose={() => setSelectedPromo(null)}
      >
        {selectedPromo && (() => {
          const base = round2(Math.max(0, selectedPromo.price));
          const disc = applyDiscount(base, selectedPromo.discount_kind, selectedPromo.discount_value);
          const due = round2(disc.discountedCost);
          const paidTotal = round2(selectedPromo.gcash_amount + selectedPromo.cash_amount);
          const remaining = round2(Math.max(0, due - paidTotal));

          return (
            <div className="cnc-receipt">
              <div className="cnc-receipt-head">
                <img src={logo} alt="Me Tyme Lounge" className="cnc-receipt-logo" />
                <div className="cnc-receipt-brand-top">ME TYME LOUNGE</div>
                <div className="cnc-receipt-brand-title">Cancelled Promo Receipt</div>
              </div>

              <div className="cnc-receipt-block">
                <div className="cnc-receipt-row"><span>Cancelled At</span><strong>{formatDateTime(selectedPromo.cancelled_at)}</strong></div>
                <div className="cnc-receipt-row"><span>Customer</span><strong>{selectedPromo.full_name}</strong></div>
                <div className="cnc-receipt-row"><span>Phone #</span><strong>{String(selectedPromo.phone_number ?? "").trim() || "N/A"}</strong></div>
                <div className="cnc-receipt-row"><span>Area</span><strong>{prettyArea(selectedPromo.area)}</strong></div>
                <div className="cnc-receipt-row"><span>Seat</span><strong>{seatLabelPromo(selectedPromo.area, selectedPromo.seat_number)}</strong></div>
                <div className="cnc-receipt-row"><span>Description</span><strong>{selectedPromo.description || "-"}</strong></div>
                <div className="cnc-receipt-row"><span>Package</span><strong>{selectedPromo.package_title}</strong></div>
                <div className="cnc-receipt-row">
                  <span>Option</span>
                  <strong>
                    {selectedPromo.duration_value && selectedPromo.duration_unit
                      ? `${selectedPromo.option_name} • ${formatDuration(Number(selectedPromo.duration_value), selectedPromo.duration_unit)}`
                      : selectedPromo.option_name}
                  </strong>
                </div>
                <div className="cnc-receipt-row"><span>Start</span><strong>{formatDateTime(selectedPromo.start_at)}</strong></div>
                <div className="cnc-receipt-row"><span>End</span><strong>{formatDateTime(selectedPromo.end_at)}</strong></div>
              </div>

              <div className="cnc-receipt-block">
                <div className="cnc-receipt-row"><span>System Cost (Before)</span><strong>{moneyText(base)}</strong></div>
                <div className="cnc-receipt-row"><span>Discount</span><strong>{getDiscountText(selectedPromo.discount_kind, selectedPromo.discount_value)}</strong></div>
                <div className="cnc-receipt-row"><span>Final Cost</span><strong>{moneyText(due)}</strong></div>
                <div className="cnc-receipt-row"><span>GCash</span><strong>{moneyText(selectedPromo.gcash_amount)}</strong></div>
                <div className="cnc-receipt-row"><span>Cash</span><strong>{moneyText(selectedPromo.cash_amount)}</strong></div>
                <div className="cnc-receipt-row"><span>Total Paid</span><strong>{moneyText(paidTotal)}</strong></div>
                <div className="cnc-receipt-row"><span>Remaining</span><strong>{moneyText(remaining)}</strong></div>
                <div className="cnc-receipt-row"><span>Status</span><strong className={selectedPromo.is_paid ? "cnc-receipt-status paid" : "cnc-receipt-status unpaid"}>{selectedPromo.is_paid ? "PAID" : "UNPAID"}</strong></div>
              </div>

              <div className="cnc-receipt-total">
                <span>Total</span>
                <strong>{moneyText(due)}</strong>
              </div>

              <p className="cnc-receipt-footer">
                Cancelled record archived
                <br />
                <strong>Me Tyme Lounge</strong>
              </p>

              <button className="cnc-btn cnc-btn-light" onClick={() => setSelectedPromo(null)} type="button">
                Close
              </button>
            </div>
          );
        })()}
      </FixedCenterModal>

      <FixedCenterModal
        open={!!selectedConsignment}
        title=""
        size="sm"
        hideClose={true}
        onClose={() => setSelectedConsignment(null)}
      >
        {selectedConsignment && (
          <div className="cnc-receipt">
            <div className="cnc-receipt-head">
              <img src={logo} alt="Me Tyme Lounge" className="cnc-receipt-logo" />
              <div className="cnc-receipt-brand-top">ME TYME LOUNGE</div>
              <div className="cnc-receipt-brand-title">Cancelled Consignment Receipt</div>
            </div>

            <div className="cnc-receipt-block">
              <div className="cnc-receipt-row"><span>Cancelled At</span><strong>{formatDateTime(selectedConsignment.cancelled_at)}</strong></div>
              <div className="cnc-receipt-row"><span>Customer</span><strong>{selectedConsignment.full_name}</strong></div>
              <div className="cnc-receipt-row"><span>Seat</span><strong>{selectedConsignment.seat_number}</strong></div>
              <div className="cnc-receipt-row"><span>Item</span><strong>{selectedConsignment.item_name}</strong></div>
              <div className="cnc-receipt-row"><span>Category</span><strong>{selectedConsignment.category}</strong></div>
              <div className="cnc-receipt-row"><span>Size</span><strong>{sizeText(selectedConsignment.size)}</strong></div>
              <div className="cnc-receipt-row"><span>Qty</span><strong>{selectedConsignment.quantity}</strong></div>
              <div className="cnc-receipt-row"><span>Price</span><strong>{moneyText(selectedConsignment.price)}</strong></div>
              <div className="cnc-receipt-row"><span>Status</span><strong className={selectedConsignment.is_paid ? "cnc-receipt-status paid" : "cnc-receipt-status unpaid"}>{selectedConsignment.is_paid ? "PAID" : "UNPAID"}</strong></div>
              <div className="cnc-receipt-row"><span>Stock Returned</span><strong>{selectedConsignment.stock_returned ? "Yes" : "No"}</strong></div>
              <div className="cnc-receipt-row"><span>Void</span><strong>{selectedConsignment.was_voided ? "VOIDED" : "—"}</strong></div>
              <div className="cnc-receipt-row"><span>Cancel Note</span><strong>{selectedConsignment.cancel_note || "-"}</strong></div>
            </div>

            <div className="cnc-receipt-total">
              <span>Total</span>
              <strong>{moneyText(selectedConsignment.total)}</strong>
            </div>

            <p className="cnc-receipt-footer">
              Cancelled record archived
              <br />
              <strong>Me Tyme Lounge</strong>
            </p>

            <button className="cnc-btn cnc-btn-light" onClick={() => setSelectedConsignment(null)} type="button">
              Close
            </button>
          </div>
        )}
      </FixedCenterModal>
    </div>
  );
};

export default Customer_Cancelled;