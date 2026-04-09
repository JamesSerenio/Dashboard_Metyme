import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../utils/supabaseClient";
import logo from "../assets/study_hub.png";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import "../styles/Admin_Customer_Discount_List.css";

type PackageArea = "common_area" | "conference_room";
type DurationUnit = "hour" | "day" | "month" | "year";
type DiscountKind = "none" | "percent" | "amount";

type AreaFilter = "all" | PackageArea;
type CommonDurationFilter = "all" | "1_day" | "week" | "half_month" | "month";
type ConferenceDurationFilter = "all" | "1_hour" | "3_hours" | "6_hours" | "8_hours";

type OrderKind = "add_on" | "consignment";
type OrderParentSource = "addon_orders" | "consignment_orders";
type RangeMode = "day" | "week" | "month";

type Range = {
  startIso: string;
  endIso: string;
  label: string;
};

type PromoBookingAttendanceRow = {
  id: string;
  created_at: string;
  promo_booking_id: string;
  local_day: string;
  in_at: string;
  out_at: string | null;
  auto_out: boolean;
  note: string | null;
};

interface PromoBookingRow {
  id: string;
  created_at: string;
  full_name: string;
  phone_number: string | null;
  area: PackageArea;
  seat_number: string | null;
  start_at: string;
  end_at: string;
  price: number;
  gcash_amount: number;
  cash_amount: number;
  is_paid: boolean;
  paid_at: string | null;
  discount_kind: DiscountKind;
  discount_value: number;
  discount_reason: string | null;
  promo_code: string | null;
  attempts_left: number;
  max_attempts: number;
  validity_end_at: string | null;
  packages: { title: string | null } | null;
  package_options: {
    option_name: string | null;
    duration_value: number | null;
    duration_unit: DurationUnit | null;
  } | null;
}

interface PromoBookingDBRow {
  id: string;
  created_at: string;
  full_name: string;
  phone_number: string | null;
  area: PackageArea;
  seat_number: string | null;
  start_at: string;
  end_at: string;
  price: number | string | null;
  gcash_amount: number | string | null;
  cash_amount: number | string | null;
  is_paid: boolean | number | string | null;
  paid_at: string | null;
  discount_kind: DiscountKind | string | null;
  discount_value: number | string | null;
  discount_reason: string | null;
  promo_code?: string | null;
  attempts_left?: number | string | null;
  max_attempts?: number | string | null;
  validity_end_at?: string | null;
  packages: { title: string | null } | null;
  package_options: {
    option_name: string | null;
    duration_value: number | null;
    duration_unit: DurationUnit | null;
  } | null;
}

interface PromoBookingPaidUpdateRow {
  id: string;
  is_paid: boolean | number | string | null;
  paid_at: string | null;
  gcash_amount: number | string | null;
  cash_amount: number | string | null;
}

interface PromoOrderItemRow {
  id: string;
  booking_code: string;
  parent_order_id: string;
  kind: OrderKind;
  source_item_id: string;
  created_at: string | null;
  name: string;
  category: string | null;
  size: string | null;
  image_url: string | null;
  quantity: number;
  price: number;
  subtotal: number;
}

interface PromoOrderParentRow {
  id: string;
  booking_code: string;
  source: OrderParentSource;
  total_amount: number;
  gcash_amount: number;
  cash_amount: number;
  is_paid: boolean;
  paid_at: string | null;
}

type PromoOrdersMap = Record<string, PromoOrderItemRow[]>;
type PromoOrderParentsMap = Record<string, PromoOrderParentRow[]>;

type AddonOrderItemJoinRow = {
  id: string;
  created_at: string | null;
  add_on_id: string | null;
  quantity: number | string | null;
  price: number | string | null;
  subtotal: number | string | null;
  addon_orders: {
    id: string;
    booking_code: string | null;
  } | null;
  add_ons: {
    name: string | null;
    category: string | null;
    size: string | null;
    image_url: string | null;
  } | null;
};

type ConsignmentOrderItemJoinRow = {
  id: string;
  created_at: string | null;
  consignment_id: string | null;
  quantity: number | string | null;
  price: number | string | null;
  subtotal: number | string | null;
  consignment_orders: {
    id: string;
    booking_code: string | null;
  } | null;
  consignment: {
    item_name: string | null;
    category: string | null;
    size: string | null;
    image_url: string | null;
  } | null;
};

type AddonOrderParentDBRow = {
  id: string;
  booking_code: string | null;
  total_amount: number | string | null;
  gcash_amount: number | string | null;
  cash_amount: number | string | null;
  is_paid: boolean | number | string | null;
  paid_at: string | null;
};

type ConsignmentOrderParentDBRow = {
  id: string;
  booking_code: string | null;
  total_amount: number | string | null;
  gcash_amount: number | string | null;
  cash_amount: number | string | null;
  is_paid: boolean | number | string | null;
  paid_at: string | null;
};

type CancelOrderTarget = {
  booking: PromoBookingRow;
  item: PromoOrderItemRow;
};

const toNumber = (v: number | string | null | undefined): number => {
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

const clamp = (n: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, n));

const yyyyMmDdLocal = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const prettyArea = (a: PackageArea): string =>
  a === "conference_room" ? "Conference Room" : "Common Area";

const seatLabel = (r: PromoBookingRow): string =>
  r.area === "conference_room" ? "CONFERENCE ROOM" : r.seat_number || "N/A";

const safePhone = (v: string | null | undefined): string => {
  const p = String(v ?? "").trim();
  return p ? p : "—";
};

const getStatus = (
  startIso: string,
  endIso: string,
  nowMs: number = Date.now()
): "UPCOMING" | "ONGOING" | "FINISHED" => {
  const s = new Date(startIso).getTime();
  const e = new Date(endIso).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e)) return "FINISHED";
  if (nowMs < s) return "UPCOMING";
  if (nowMs >= s && nowMs <= e) return "ONGOING";
  return "FINISHED";
};

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

const normalizeDiscountKind = (v: unknown): DiscountKind => {
  const s = String(v ?? "none").trim().toLowerCase();
  if (s === "percent") return "percent";
  if (s === "amount") return "amount";
  return "none";
};

const getDiscountTextFrom = (kind: DiscountKind, value: number): string => {
  const v = Number.isFinite(value) ? Math.max(0, value) : 0;
  if (kind === "percent" && v > 0) return `${v}%`;
  if (kind === "amount" && v > 0) return `₱${v.toFixed(2)}`;
  return "—";
};

const applyDiscount = (
  baseCost: number,
  kind: DiscountKind,
  value: number
): { discountedCost: number; discountAmount: number } => {
  const cost = Number.isFinite(baseCost) ? Math.max(0, baseCost) : 0;
  const v = Number.isFinite(value) ? Math.max(0, value) : 0;

  if (kind === "percent") {
    const pct = clamp(v, 0, 100);
    const disc = round2((cost * pct) / 100);
    const final = round2(Math.max(0, cost - disc));
    return { discountedCost: final, discountAmount: disc };
  }

  if (kind === "amount") {
    const disc = round2(Math.min(cost, v));
    const final = round2(Math.max(0, cost - disc));
    return { discountedCost: final, discountAmount: disc };
  }

  return { discountedCost: round2(cost), discountAmount: 0 };
};

const moneyFromStr = (s: string): number => round2(Math.max(0, toNumber(s)));

const isoToLocalDateTimeInput = (iso: string): string => {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
};

const localDateTimeInputToIso = (v: string): string => new Date(v).toISOString();

const isExpired = (validityEndAtIso: string | null): boolean => {
  const iso = String(validityEndAtIso ?? "").trim();
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() > t;
};

const normalizeRow = (row: PromoBookingDBRow): PromoBookingRow => {
  const kind = normalizeDiscountKind(row.discount_kind);
  const value = round2(toNumber(row.discount_value));
  const attempts_left = Math.max(0, Math.floor(toNumber(row.attempts_left ?? 0)));
  const max_attempts = Math.max(0, Math.floor(toNumber(row.max_attempts ?? 0)));
  const validity_end_at = row.validity_end_at ?? null;

  return {
    id: row.id,
    created_at: row.created_at,
    full_name: row.full_name,
    phone_number: row.phone_number ?? null,
    area: row.area,
    seat_number: row.seat_number,
    start_at: row.start_at,
    end_at: row.end_at,
    price: round2(toNumber(row.price)),
    gcash_amount: round2(toNumber(row.gcash_amount)),
    cash_amount: round2(toNumber(row.cash_amount)),
    is_paid: toBool(row.is_paid),
    paid_at: row.paid_at ?? null,
    discount_kind: kind,
    discount_value: value,
    discount_reason: row.discount_reason ?? null,
    promo_code: row.promo_code ?? null ? String(row.promo_code ?? "").trim() : null,
    attempts_left,
    max_attempts,
    validity_end_at,
    packages: row.packages ?? null,
    package_options: row.package_options ?? null,
  };
};

const getCommonAreaDurationBucket = (
  r: PromoBookingRow
): CommonDurationFilter | "all" => {
  const optName = String(r.package_options?.option_name ?? "").trim().toLowerCase();
  const v = Number(r.package_options?.duration_value ?? 0);
  const u = String(r.package_options?.duration_unit ?? "").trim().toLowerCase();

  if (u === "day" && v === 1) return "1_day";
  if ((u === "day" && v === 7) || optName.includes("week")) return "week";
  if ((u === "day" && v === 15) || optName.includes("half month") || optName.includes("half-month")) return "half_month";
  if ((u === "month" && v === 1) || (u === "day" && (v === 30 || v === 31)) || optName.includes("month")) return "month";

  return "all";
};

const getConferenceDurationBucket = (
  r: PromoBookingRow
): ConferenceDurationFilter | "all" => {
  const v = Number(r.package_options?.duration_value ?? 0);
  const u = String(r.package_options?.duration_unit ?? "").trim().toLowerCase();

  if (u === "hour" && v === 1) return "1_hour";
  if (u === "hour" && v === 3) return "3_hours";
  if (u === "hour" && v === 6) return "6_hours";
  if (u === "hour" && v === 8) return "8_hours";

  return "all";
};

const attStatus = (r: PromoBookingAttendanceRow): "IN" | "OUT" =>
  r.out_at ? "OUT" : "IN";

const attStamp = (r: PromoBookingAttendanceRow): string =>
  r.out_at ? r.out_at : r.in_at;

const fmtPH = (iso: string): string => new Date(iso).toLocaleString("en-PH");

const startOfLocalDay = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);

const addDaysLocal = (d: Date, days: number): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, 0, 0, 0, 0);

const startEndIsoLocalDay = (
  yyyyMmDd: string
): { startIso: string; endIso: string } => {
  const [yStr, mStr, dStr] = yyyyMmDd.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);

  const startLocal = new Date(y, m - 1, d, 0, 0, 0, 0);
  const endLocal = new Date(y, m - 1, d + 1, 0, 0, 0, 0);

  return { startIso: startLocal.toISOString(), endIso: endLocal.toISOString() };
};

const startOfWeekMondayLocal = (anyDay: Date): Date => {
  const d = startOfLocalDay(anyDay);
  const day = d.getDay();
  const diffToMonday = (day + 6) % 7;
  return addDaysLocal(d, -diffToMonday);
};

const rangeFromMode = (mode: RangeMode, dayStr: string, monthStr: string): Range => {
  if (mode === "month") {
    const [yStr, mStr] = monthStr.split("-");
    const y = Number(yStr);
    const m = Number(mStr);
    const startLocal = new Date(y, m - 1, 1, 0, 0, 0, 0);
    const endLocal = new Date(y, m, 1, 0, 0, 0, 0);
    const label = `${startLocal.toLocaleString("en-PH", { month: "long" })} ${startLocal.getFullYear()}`;
    return {
      startIso: startLocal.toISOString(),
      endIso: endLocal.toISOString(),
      label,
    };
  }

  if (mode === "week") {
    const [yStr, mStr, dStr] = dayStr.split("-");
    const y = Number(yStr);
    const m = Number(mStr);
    const d = Number(dStr);
    const picked = new Date(y, m - 1, d, 12, 0, 0, 0);
    const startLocal = startOfWeekMondayLocal(picked);
    const endLocal = addDaysLocal(startLocal, 7);
    const label = `${yyyyMmDdLocal(startLocal)} to ${yyyyMmDdLocal(addDaysLocal(endLocal, -1))}`;
    return {
      startIso: startLocal.toISOString(),
      endIso: endLocal.toISOString(),
      label,
    };
  }

  const r = startEndIsoLocalDay(dayStr);
  return { startIso: r.startIso, endIso: r.endIso, label: dayStr };
};

const bookingOverlapsRange = (startIso: string, endIso: string, range: Range): boolean => {
  const bookingStart = new Date(startIso).getTime();
  const bookingEnd = new Date(endIso).getTime();
  const rangeStart = new Date(range.startIso).getTime();
  const rangeEnd = new Date(range.endIso).getTime();

  if (!Number.isFinite(bookingStart) || !Number.isFinite(bookingEnd)) return false;
  if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd)) return false;

  return bookingStart < rangeEnd && bookingEnd >= rangeStart;
};

const isLikelyUrl = (v: unknown): v is string =>
  typeof v === "string" && /^https?:\/\//i.test(v.trim());

const fetchAsArrayBuffer = async (url: string): Promise<ArrayBuffer | null> => {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
};

const fetchBookingById = async (
  id: string,
  selectPromoBookings: string
): Promise<PromoBookingDBRow | null> => {
  const { data, error } = await supabase
    .from("promo_bookings")
    .select(selectPromoBookings)
    .eq("id", id)
    .limit(1);

  if (error) throw new Error(error.message);
  const arr = (data ?? []) as unknown as PromoBookingDBRow[];
  return arr.length ? arr[0] : null;
};

const updateBookingThenFetch = async (
  id: string,
  patch: Record<string, unknown>,
  selectPromoBookings: string
): Promise<PromoBookingDBRow> => {
  const { data: upd, error: updErr } = await supabase
    .from("promo_bookings")
    .update(patch)
    .eq("id", id)
    .select("id")
    .limit(1);

  if (updErr) throw new Error(updErr.message);
  if (!upd || upd.length === 0) {
    throw new Error("No row updated. Possible RLS/permission issue or missing record.");
  }

  const full = await fetchBookingById(id, selectPromoBookings);
  if (!full) throw new Error("Updated but failed to refetch booking.");
  return full;
};

const normalizeOrderParents = (
  rows: AddonOrderParentDBRow[] | ConsignmentOrderParentDBRow[],
  source: OrderParentSource
): PromoOrderParentRow[] => {
  return rows.map((r) => ({
    id: r.id,
    booking_code: String(r.booking_code ?? "").trim(),
    source,
    total_amount: round2(toNumber(r.total_amount)),
    gcash_amount: round2(toNumber(r.gcash_amount)),
    cash_amount: round2(toNumber(r.cash_amount)),
    is_paid: toBool(r.is_paid),
    paid_at: r.paid_at ?? null,
  }));
};

const allocateAmountsAcrossOrders = (
  parents: PromoOrderParentRow[],
  totalGcash: number,
  totalCash: number
): Array<{
  id: string;
  source: OrderParentSource;
  gcash_amount: number;
  cash_amount: number;
  is_paid: boolean;
  paid_at: string | null;
}> => {
  const sorted = [...parents].sort((a, b) => a.id.localeCompare(b.id));

  let remainingGcash = round2(Math.max(0, totalGcash));
  let remainingCash = round2(Math.max(0, totalCash));

  const result: Array<{
    id: string;
    source: OrderParentSource;
    gcash_amount: number;
    cash_amount: number;
    is_paid: boolean;
    paid_at: string | null;
  }> = [];

  sorted.forEach((p, idx) => {
    const due = round2(Math.max(0, p.total_amount));
    const notLast = idx < sorted.length - 1;

    let useGcash = 0;
    let useCash = 0;

    if (notLast) {
      useGcash = round2(Math.min(remainingGcash, due));
      const remainDueAfterG = round2(Math.max(0, due - useGcash));
      useCash = round2(Math.min(remainingCash, remainDueAfterG));
    } else {
      useGcash = round2(Math.max(0, remainingGcash));
      useCash = round2(Math.max(0, remainingCash));
    }

    remainingGcash = round2(Math.max(0, remainingGcash - useGcash));
    remainingCash = round2(Math.max(0, remainingCash - useCash));

    const totalPaid = round2(useGcash + useCash);
    const isPaid = due <= 0 ? true : totalPaid >= due;

    result.push({
      id: p.id,
      source: p.source,
      gcash_amount: useGcash,
      cash_amount: useCash,
      is_paid,
      paid_at: isPaid ? new Date().toISOString() : null,
    });
  });

  return result;
};

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
    document.body.classList.add("acdl-modal-open");

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.classList.remove("acdl-modal-open");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="acdl-modal-overlay" onClick={onClose}>
      <div
        className={`acdl-modal-card acdl-modal-${size}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="acdl-modal-head">
          <h3>{title}</h3>
          <button className="acdl-modal-close" onClick={onClose} type="button">
            ×
          </button>
        </div>
        <div className="acdl-modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
};

const Admin_Customer_Discount_List: React.FC = () => {
  const [rows, setRows] = useState<PromoBookingRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selected, setSelected] = useState<PromoBookingRow | null>(null);
  const [selectedOrderBooking, setSelectedOrderBooking] =
    useState<PromoBookingRow | null>(null);

  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [tick, setTick] = useState<number>(Date.now());

  const [rangeMode, setRangeMode] = useState<RangeMode>("day");
  const [selectedDay, setSelectedDay] = useState<string>(yyyyMmDdLocal(new Date()));
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  });

  const [areaFilter, setAreaFilter] = useState<AreaFilter>("all");
  const [commonDurationFilter, setCommonDurationFilter] =
    useState<CommonDurationFilter>("all");
  const [conferenceDurationFilter, setConferenceDurationFilter] =
    useState<ConferenceDurationFilter>("all");

  const [deletingRangeLabel, setDeletingRangeLabel] = useState<string | null>(null);

  const [attMap, setAttMap] = useState<Record<string, PromoBookingAttendanceRow[]>>(
    {}
  );
  const [attModalTarget, setAttModalTarget] = useState<PromoBookingRow | null>(null);

  const [ordersMap, setOrdersMap] = useState<PromoOrdersMap>({});
  const [orderParentsMap, setOrderParentsMap] = useState<PromoOrderParentsMap>({});

  const [paymentTarget, setPaymentTarget] = useState<PromoBookingRow | null>(null);
  const [gcashInput, setGcashInput] = useState<string>("0");
  const [cashInput, setCashInput] = useState<string>("0");
  const [savingPayment, setSavingPayment] = useState<boolean>(false);

  const [orderPaymentTarget, setOrderPaymentTarget] =
    useState<PromoBookingRow | null>(null);
  const [orderGcashInput, setOrderGcashInput] = useState<string>("0");
  const [orderCashInput, setOrderCashInput] = useState<string>("0");
  const [savingOrderPayment, setSavingOrderPayment] = useState<boolean>(false);

  const [discountTarget, setDiscountTarget] = useState<PromoBookingRow | null>(null);
  const [discountKind, setDiscountKind] = useState<DiscountKind>("none");
  const [discountValueInput, setDiscountValueInput] = useState<string>("0");
  const [discountReasonInput, setDiscountReasonInput] = useState<string>("");
  const [savingDiscount, setSavingDiscount] = useState<boolean>(false);

  const [togglingPaidId, setTogglingPaidId] = useState<string | null>(null);

  const [cancelTarget, setCancelTarget] = useState<PromoBookingRow | null>(null);
  const [cancelDesc, setCancelDesc] = useState<string>("");
  const [cancelError, setCancelError] = useState<string>("");
  const [cancelling, setCancelling] = useState<boolean>(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const [ruleTarget, setRuleTarget] = useState<PromoBookingRow | null>(null);
  const [ruleAttemptsLeftInput, setRuleAttemptsLeftInput] = useState<string>("0");
  const [ruleMaxAttemptsInput, setRuleMaxAttemptsInput] = useState<string>("0");
  const [ruleValidityInput, setRuleValidityInput] = useState<string>("");
  const [savingRule, setSavingRule] = useState<boolean>(false);

  const [orderCancelTarget, setOrderCancelTarget] = useState<CancelOrderTarget | null>(null);
  const [orderCancelNote, setOrderCancelNote] = useState<string>("");
  const [cancellingOrderItemId, setCancellingOrderItemId] = useState<string | null>(null);

  const [exporting, setExporting] = useState<boolean>(false);

  const localRole = useMemo(
    () => String(localStorage.getItem("role") ?? "").toLowerCase(),
    []
  );
  const canEditRules = useMemo(
    () => localRole === "admin" || localRole === "staff",
    [localRole]
  );

  const selectPromoBookings = `
    id,
    created_at,
    full_name,
    phone_number,
    area,
    seat_number,
    start_at,
    end_at,
    price,
    gcash_amount,
    cash_amount,
    is_paid,
    paid_at,
    discount_kind,
    discount_value,
    discount_reason,
    promo_code,
    attempts_left,
    max_attempts,
    validity_end_at,
    packages:package_id ( title ),
    package_options:package_option_id (
      option_name,
      duration_value,
      duration_unit
    )
  `;

  useEffect(() => {
    const t = window.setInterval(() => setTick(Date.now()), 10000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    void fetchPromoBookings();
  }, []);

  useEffect(() => {
    setCommonDurationFilter("all");
    setConferenceDurationFilter("all");
  }, [areaFilter]);

  const fetchAttendanceForBookings = async (bookingIds: string[]): Promise<void> => {
    if (bookingIds.length === 0) {
      setAttMap({});
      return;
    }

    const safeIds = bookingIds.slice(0, 500);

    const { data, error } = await supabase
      .from("promo_booking_attendance")
      .select("id, created_at, promo_booking_id, local_day, in_at, out_at, auto_out, note")
      .in("promo_booking_id", safeIds)
      .order("local_day", { ascending: false })
      .order("in_at", { ascending: false })
      .limit(3000);

    if (error) {
      setAttMap({});
      return;
    }

    const aRows = (data ?? []) as PromoBookingAttendanceRow[];
    const map: Record<string, PromoBookingAttendanceRow[]> = {};

    for (const r of aRows) {
      const k = String(r.promo_booking_id);
      if (!map[k]) map[k] = [];
      map[k].push(r);
    }

    Object.keys(map).forEach((k) => {
      map[k] = map[k].slice(0, 30);
    });

    setAttMap(map);
  };

  const fetchOrdersForPromoCodes = async (codes: string[]): Promise<void> => {
    const cleanCodes = Array.from(
      new Set(codes.map((c) => String(c ?? "").trim()).filter((c) => c.length > 0))
    );

    if (cleanCodes.length === 0) {
      setOrdersMap({});
      setOrderParentsMap({});
      return;
    }

    const [addonParentsRes, consignmentParentsRes, addonItemsRes, consignmentItemsRes] =
      await Promise.all([
        supabase
          .from("addon_orders")
          .select("id, booking_code, total_amount, gcash_amount, cash_amount, is_paid, paid_at")
          .in("booking_code", cleanCodes),

        supabase
          .from("consignment_orders")
          .select("id, booking_code, total_amount, gcash_amount, cash_amount, is_paid, paid_at")
          .in("booking_code", cleanCodes),

        supabase
          .from("addon_order_items")
          .select(`
            id,
            created_at,
            add_on_id,
            quantity,
            price,
            subtotal,
            addon_orders!inner (
              id,
              booking_code
            ),
            add_ons (
              name,
              category,
              size,
              image_url
            )
          `)
          .in("addon_orders.booking_code", cleanCodes),

        supabase
          .from("consignment_order_items")
          .select(`
            id,
            created_at,
            consignment_id,
            quantity,
            price,
            subtotal,
            consignment_orders!inner (
              id,
              booking_code
            ),
            consignment (
              item_name,
              category,
              size,
              image_url
            )
          `)
          .in("consignment_orders.booking_code", cleanCodes),
      ]);

    const parentMap: PromoOrderParentsMap = {};
    const itemMap: PromoOrdersMap = {};

    const addonParents = normalizeOrderParents(
      (addonParentsRes.data ?? []) as AddonOrderParentDBRow[],
      "addon_orders"
    );

    const consignmentParents = normalizeOrderParents(
      (consignmentParentsRes.data ?? []) as ConsignmentOrderParentDBRow[],
      "consignment_orders"
    );

    [...addonParents, ...consignmentParents].forEach((p) => {
      const code = p.booking_code;
      if (!code) return;
      if (!parentMap[code]) parentMap[code] = [];
      parentMap[code].push(p);
    });

    const addonItems = (addonItemsRes.data ?? []) as unknown as AddonOrderItemJoinRow[];
    addonItems.forEach((r) => {
      const code = String(r.addon_orders?.booking_code ?? "").trim();
      const parentId = String(r.addon_orders?.id ?? "").trim();
      if (!code || !parentId) return;

      if (!itemMap[code]) itemMap[code] = [];

      itemMap[code].push({
        id: r.id,
        booking_code: code,
        parent_order_id: parentId,
        kind: "add_on",
        source_item_id: String(r.add_on_id ?? "").trim(),
        created_at: r.created_at ?? null,
        name: String(r.add_ons?.name ?? "").trim() || "Add-on Item",
        category: r.add_ons?.category ?? null,
        size: r.add_ons?.size ?? null,
        image_url: r.add_ons?.image_url ?? null,
        quantity: Math.max(0, Math.floor(toNumber(r.quantity))),
        price: round2(toNumber(r.price)),
        subtotal: round2(
          toNumber(r.subtotal == null ? toNumber(r.price) * toNumber(r.quantity) : r.subtotal)
        ),
      });
    });

    const consignmentItems = (consignmentItemsRes.data ?? []) as unknown as ConsignmentOrderItemJoinRow[];
    consignmentItems.forEach((r) => {
      const code = String(r.consignment_orders?.booking_code ?? "").trim();
      const parentId = String(r.consignment_orders?.id ?? "").trim();
      if (!code || !parentId) return;

      if (!itemMap[code]) itemMap[code] = [];

      itemMap[code].push({
        id: r.id,
        booking_code: code,
        parent_order_id: parentId,
        kind: "consignment",
        source_item_id: String(r.consignment_id ?? "").trim(),
        created_at: r.created_at ?? null,
        name: String(r.consignment?.item_name ?? "").trim() || "Consignment Item",
        category: r.consignment?.category ?? null,
        size: r.consignment?.size ?? null,
        image_url: r.consignment?.image_url ?? null,
        quantity: Math.max(0, Math.floor(toNumber(r.quantity))),
        price: round2(toNumber(r.price)),
        subtotal: round2(
          toNumber(r.subtotal == null ? toNumber(r.price) * toNumber(r.quantity) : r.subtotal)
        ),
      });
    });

    Object.keys(itemMap).forEach((code) => {
      itemMap[code] = itemMap[code].sort((a, b) => a.name.localeCompare(b.name));
    });

    setOrdersMap(itemMap);
    setOrderParentsMap(parentMap);
  };

  const fetchPromoBookings = async (): Promise<PromoBookingRow[]> => {
    setLoading(true);

    const { data, error } = await supabase
      .from("promo_bookings")
      .select(selectPromoBookings)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      alert(`Load error: ${error.message}`);
      setRows([]);
      setAttMap({});
      setOrdersMap({});
      setOrderParentsMap({});
      setLoading(false);
      return [];
    }

    const dbRows = (data ?? []) as unknown as PromoBookingDBRow[];
    const normalized = dbRows.map(normalizeRow);

    setRows(normalized);
    setLoading(false);

    const ids = normalized.map((r) => r.id);
    void fetchAttendanceForBookings(ids);

    const codes = normalized.map((r) => String(r.promo_code ?? ""));
    void fetchOrdersForPromoCodes(codes);

    return normalized;
  };

  const refreshAll = async (): Promise<void> => {
    try {
      setRefreshing(true);
      await fetchPromoBookings();
    } finally {
      setRefreshing(false);
    }
  };

  const activeRange = useMemo(
    () => rangeFromMode(rangeMode, selectedDay, selectedMonth),
    [rangeMode, selectedDay, selectedMonth]
  );

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (!bookingOverlapsRange(r.start_at, r.end_at, activeRange)) return false;

      if (areaFilter !== "all" && r.area !== areaFilter) return false;

      if (areaFilter === "common_area" && commonDurationFilter !== "all") {
        const bucket = getCommonAreaDurationBucket(r);
        if (bucket !== commonDurationFilter) return false;
      }

      if (areaFilter === "conference_room" && conferenceDurationFilter !== "all") {
        const bucket = getConferenceDurationBucket(r);
        if (bucket !== conferenceDurationFilter) return false;
      }

      return true;
    });
  }, [rows, activeRange, areaFilter, commonDurationFilter, conferenceDurationFilter]);

  const logsFor = (bookingId: string): PromoBookingAttendanceRow[] => attMap[bookingId] ?? [];
  const lastLogFor = (bookingId: string): PromoBookingAttendanceRow | null => {
    const logs = logsFor(bookingId);
    return logs.length ? logs[0] : null;
  };

  const getOrderItems = (code: string | null): PromoOrderItemRow[] => {
    if (!code) return [];
    return ordersMap[code] ?? [];
  };

  const getOrderParents = (code: string | null): PromoOrderParentRow[] => {
    if (!code) return [];
    return orderParentsMap[code] ?? [];
  };

  const hasOrder = (code: string | null): boolean =>
    getOrderItems(code).length > 0 || getOrderParents(code).length > 0;

  const getOrderDue = (code: string | null): number => {
    const parentTotal = round2(
      getOrderParents(code).reduce((sum, r) => sum + round2(Math.max(0, r.total_amount)), 0)
    );

    const itemsTotal = round2(
      getOrderItems(code).reduce((sum, item) => sum + round2(Math.max(0, item.subtotal)), 0)
    );

    if (itemsTotal > 0) return itemsTotal;
    return parentTotal;
  };

  const getOrderPaidInfo = (
    code: string | null
  ): { gcash: number; cash: number; totalPaid: number } => {
    const parents = getOrderParents(code);
    const gcash = round2(
      parents.reduce((sum, r) => sum + round2(Math.max(0, r.gcash_amount)), 0)
    );
    const cash = round2(
      parents.reduce((sum, r) => sum + round2(Math.max(0, r.cash_amount)), 0)
    );
    return { gcash, cash, totalPaid: round2(gcash + cash) };
  };

  const getSystemDue = (r: PromoBookingRow): number => {
    const base = round2(Math.max(0, toNumber(r.price)));
    return round2(applyDiscount(base, r.discount_kind, r.discount_value).discountedCost);
  };

  const getSystemPaidInfo = (
    r: PromoBookingRow
  ): { gcash: number; cash: number; totalPaid: number } => {
    const gcash = round2(Math.max(0, toNumber(r.gcash_amount)));
    const cash = round2(Math.max(0, toNumber(r.cash_amount)));
    return { gcash, cash, totalPaid: round2(gcash + cash) };
  };

  const getSystemRemainingInfo = (
    r: PromoBookingRow
  ): { remaining: number; change: number; label: "Remaining" | "Change" } => {
    const due = getSystemDue(r);
    const paid = getSystemPaidInfo(r).totalPaid;
    const diff = round2(due - paid);

    if (diff > 0) return { remaining: diff, change: 0, label: "Remaining" };
    return { remaining: 0, change: round2(Math.abs(diff)), label: "Change" };
  };

  const getOrderRemainingInfo = (
    code: string | null
  ): { remaining: number; change: number; label: "Remaining" | "Change" } => {
    const due = getOrderDue(code);
    const paid = getOrderPaidInfo(code).totalPaid;
    const diff = round2(due - paid);

    if (diff > 0) return { remaining: diff, change: 0, label: "Remaining" };
    return { remaining: 0, change: round2(Math.abs(diff)), label: "Change" };
  };

  const getGrandDue = (r: PromoBookingRow): number =>
    round2(getSystemDue(r) + getOrderDue(r.promo_code));

  const getGrandPaid = (r: PromoBookingRow): number =>
    round2(getSystemPaidInfo(r).totalPaid + getOrderPaidInfo(r.promo_code).totalPaid);

  const getGrandBalanceInfo = (
    r: PromoBookingRow
  ): { remaining: number; change: number; label: "Overall Remaining" | "Overall Change" } => {
    const due = getGrandDue(r);
    const paid = getGrandPaid(r);
    const diff = round2(due - paid);

    if (diff > 0) {
      return { remaining: diff, change: 0, label: "Overall Remaining" };
    }

    return {
      remaining: 0,
      change: round2(Math.abs(diff)),
      label: "Overall Change",
    };
  };

  const totals = useMemo(() => {
    const nowMs = tick;
    const total = filteredRows.reduce((sum, r) => sum + getGrandDue(r), 0);

    let upcoming = 0;
    let ongoing = 0;
    let finished = 0;

    for (const r of filteredRows) {
      const st = getStatus(r.start_at, r.end_at, nowMs);
      if (st === "UPCOMING") upcoming += 1;
      else if (st === "ONGOING") ongoing += 1;
      else finished += 1;
    }

    return { total: round2(total), upcoming, ongoing, finished };
  }, [filteredRows, tick, ordersMap, orderParentsMap]);

  const isFinalPaidRow = (r: PromoBookingRow): boolean => {
    const systemDue = getSystemDue(r);
    const systemPaid = getSystemPaidInfo(r).totalPaid;
    const systemOk = systemDue <= 0 ? true : systemPaid >= systemDue;

    if (!hasOrder(r.promo_code)) return systemOk;

    const orderDue = getOrderDue(r.promo_code);
    const orderPaid = getOrderPaidInfo(r.promo_code).totalPaid;
    const orderOk = orderDue <= 0 ? true : orderPaid >= orderDue;

    return systemOk && orderOk;
  };

  const syncPromoFinalPaid = async (promoId: string): Promise<void> => {
    const row = rows.find((r) => r.id === promoId);
    if (!row) return;

    const systemDue = getSystemDue(row);
    const systemPaid = getSystemPaidInfo(row).totalPaid;
    const systemOk = systemDue <= 0 ? true : systemPaid >= systemDue;

    const orderDue = getOrderDue(row.promo_code);
    const orderPaid = getOrderPaidInfo(row.promo_code).totalPaid;
    const hasAnyOrder = hasOrder(row.promo_code);

    const finalPaid = hasAnyOrder
      ? systemOk && (orderDue <= 0 ? true : orderPaid >= orderDue)
      : systemOk;

    const nextPaidAt = finalPaid ? new Date().toISOString() : null;

    const { error } = await supabase
      .from("promo_bookings")
      .update({
        is_paid: finalPaid,
        paid_at: nextPaidAt,
      })
      .eq("id", promoId);

    if (error) {
      console.warn("syncPromoFinalPaid error:", error.message);
      return;
    }

    setRows((prev) =>
      prev.map((x) =>
        x.id === promoId
          ? {
              ...x,
              is_paid: finalPaid,
              paid_at: nextPaidAt,
            }
          : x
      )
    );

    setSelected((prev) =>
      prev?.id === promoId
        ? {
            ...prev,
            is_paid: finalPaid,
            paid_at: nextPaidAt,
          }
        : prev
    );

    setSelectedOrderBooking((prev) =>
      prev?.id === promoId
        ? {
            ...prev,
            is_paid: finalPaid,
            paid_at: nextPaidAt,
          }
        : prev
    );
  };

  const recalcAddonParentAfterDelete = async (parentOrderId: string): Promise<void> => {
    const { data: remainingItems, error: remErr } = await supabase
      .from("addon_order_items")
      .select("subtotal, price, quantity")
      .eq("addon_order_id", parentOrderId);

    if (remErr) throw remErr;

    const rows = (remainingItems ?? []) as Array<{
      subtotal?: number | string | null;
      price?: number | string | null;
      quantity?: number | string | null;
    }>;

    if (rows.length === 0) {
      const { error: delParentErr } = await supabase
        .from("addon_orders")
        .delete()
        .eq("id", parentOrderId);

      if (delParentErr) throw delParentErr;
      return;
    }

    const newTotal = round2(
      rows.reduce((sum, r) => {
        const subtotal = toNumber(r.subtotal ?? toNumber(r.price) * toNumber(r.quantity));
        return sum + subtotal;
      }, 0)
    );

    const { error: updParentErr } = await supabase
      .from("addon_orders")
      .update({ total_amount: newTotal })
      .eq("id", parentOrderId);

    if (updParentErr) throw updParentErr;
  };

  const recalcConsignmentParentAfterDelete = async (
    parentOrderId: string
  ): Promise<void> => {
    const { data: remainingItems, error: remErr } = await supabase
      .from("consignment_order_items")
      .select("subtotal, price, quantity")
      .eq("consignment_order_id", parentOrderId);

    if (remErr) throw remErr;

    const rows = (remainingItems ?? []) as Array<{
      subtotal?: number | string | null;
      price?: number | string | null;
      quantity?: number | string | null;
    }>;

    if (rows.length === 0) {
      const { error: delParentErr } = await supabase
        .from("consignment_orders")
        .delete()
        .eq("id", parentOrderId);

      if (delParentErr) throw delParentErr;
      return;
    }

    const newTotal = round2(
      rows.reduce((sum, r) => {
        const subtotal = toNumber(r.subtotal ?? toNumber(r.price) * toNumber(r.quantity));
        return sum + subtotal;
      }, 0)
    );

    const { error: updParentErr } = await supabase
      .from("consignment_orders")
      .update({ total_amount: newTotal })
      .eq("id", parentOrderId);

    if (updParentErr) throw updParentErr;
  };

  const refreshDataAfterOrderCancel = async (booking: PromoBookingRow): Promise<void> => {
    const freshRows = await fetchPromoBookings();
    const fresh = freshRows.find((r) => r.id === booking.id) ?? null;

    if (selected && selected.id === booking.id) setSelected(fresh);
    if (selectedOrderBooking && selectedOrderBooking.id === booking.id) {
      setSelectedOrderBooking(fresh);
    }

    if (fresh) {
      await syncPromoFinalPaid(fresh.id);
    }
  };

  const openOrderCancelModal = (booking: PromoBookingRow, item: PromoOrderItemRow): void => {
    setOrderCancelTarget({ booking, item });
    setOrderCancelNote("");
  };

  const submitOrderItemCancel = async (): Promise<void> => {
    if (!orderCancelTarget) return;

    const note = orderCancelNote.trim();
    if (!note) {
      alert("Cancel note is required.");
      return;
    }

    const { booking, item } = orderCancelTarget;

    try {
      setCancellingOrderItemId(item.id);

      if (item.kind === "add_on") {
        const systemPay = getSystemPaidInfo(booking);

        const cancelPayload = {
          original_id: item.id,
          created_at: item.created_at,
          add_on_id: item.source_item_id || null,
          quantity: item.quantity,
          price: item.price,
          full_name: booking.full_name,
          seat_number: seatLabel(booking),
          gcash_amount: systemPay.gcash,
          cash_amount: systemPay.cash,
          is_paid: toBool(booking.is_paid),
          paid_at: booking.paid_at ?? null,
          description: note,
        };

        const { error: insertErr } = await supabase
          .from("customer_session_add_ons_cancelled")
          .insert(cancelPayload);

        if (insertErr) {
          alert(`Cancel add-on failed: ${insertErr.message}`);
          return;
        }

        const { error: deleteErr } = await supabase
          .from("addon_order_items")
          .delete()
          .eq("id", item.id);

        if (deleteErr) {
          alert(`Cancelled copy saved, but item delete failed: ${deleteErr.message}`);
          return;
        }

        if (item.source_item_id) {
          const { data: addonRow, error: addonFetchErr } = await supabase
            .from("add_ons")
            .select("sold")
            .eq("id", item.source_item_id)
            .maybeSingle();

          if (!addonFetchErr && addonRow) {
            const nextSold = Math.max(
              0,
              round2(
                toNumber((addonRow as { sold?: number | string | null }).sold) -
                  item.quantity
              )
            );
            await supabase
              .from("add_ons")
              .update({ sold: nextSold })
              .eq("id", item.source_item_id);
          }
        }

        await recalcAddonParentAfterDelete(item.parent_order_id);
      } else {
        const systemPay = getSystemPaidInfo(booking);

        const consignmentPayload = {
          original_id: item.id,
          original_created_at: item.created_at,
          consignment_id: item.source_item_id || null,
          quantity: item.quantity,
          price: item.price,
          total: item.subtotal,
          full_name: booking.full_name,
          seat_number: seatLabel(booking),
          gcash_amount: systemPay.gcash,
          cash_amount: systemPay.cash,
          is_paid: toBool(booking.is_paid),
          paid_at: booking.paid_at ?? null,
          was_voided: false,
          voided_at: null,
          void_note: null,
          item_name: item.name,
          category: item.category,
          size: item.size,
          image_url: item.image_url,
          cancel_note: note,
          stock_returned: true,
        };

        const { error: insertErr } = await supabase
          .from("consignment_cancelled")
          .insert(consignmentPayload);

        if (insertErr) {
          alert(`Cancel consignment failed: ${insertErr.message}`);
          return;
        }

        const { error: deleteErr } = await supabase
          .from("consignment_order_items")
          .delete()
          .eq("id", item.id);

        if (deleteErr) {
          alert(`Cancelled copy saved, but item delete failed: ${deleteErr.message}`);
          return;
        }

        if (item.source_item_id) {
          const { data: conRow, error: conFetchErr } = await supabase
            .from("consignment")
            .select("sold")
            .eq("id", item.source_item_id)
            .maybeSingle();

          if (!conFetchErr && conRow) {
            const nextSold = Math.max(
              0,
              round2(
                toNumber((conRow as { sold?: number | string | null }).sold) -
                  item.quantity
              )
            );
            await supabase
              .from("consignment")
              .update({ sold: nextSold })
              .eq("id", item.source_item_id);
          }
        }

        await recalcConsignmentParentAfterDelete(item.parent_order_id);
      }

      await refreshDataAfterOrderCancel(booking);
      setOrderCancelTarget(null);
      setOrderCancelNote("");
      alert("Order item cancelled successfully.");
    } catch (e) {
      console.error(e);
      alert("Order item cancel failed.");
    } finally {
      setCancellingOrderItemId(null);
    }
  };

  const openPaymentModal = (r: PromoBookingRow): void => {
    setPaymentTarget(r);
    setGcashInput(String(round2(Math.max(0, toNumber(r.gcash_amount)))));
    setCashInput(String(round2(Math.max(0, toNumber(r.cash_amount)))));
  };

  const savePayment = async (): Promise<void> => {
    if (!paymentTarget) return;

    const due = getSystemDue(paymentTarget);
    const g = moneyFromStr(gcashInput);
    const c = moneyFromStr(cashInput);
    const totalPaid = round2(g + c);
    const systemPaidAuto = due <= 0 ? true : totalPaid >= due;

    try {
      setSavingPayment(true);

      const dbRow = await updateBookingThenFetch(
        paymentTarget.id,
        {
          gcash_amount: g,
          cash_amount: c,
          is_paid: false,
          paid_at:
            systemPaidAuto && !hasOrder(paymentTarget.promo_code)
              ? new Date().toISOString()
              : null,
        },
        selectPromoBookings
      );

      const updated = normalizeRow(dbRow);
      setRows((prev) => prev.map((x) => (x.id === paymentTarget.id ? updated : x)));
      setSelected((prev) => (prev?.id === paymentTarget.id ? updated : prev));
      setSelectedOrderBooking((prev) =>
        prev?.id === paymentTarget.id ? updated : prev
      );
      setPaymentTarget(null);

      await syncPromoFinalPaid(updated.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save payment failed.";
      alert(`Save payment error: ${msg}`);
    } finally {
      setSavingPayment(false);
    }
  };

  const openOrderPaymentModal = (r: PromoBookingRow): void => {
    const pi = getOrderPaidInfo(r.promo_code);
    setOrderPaymentTarget(r);
    setOrderGcashInput(String(pi.gcash));
    setOrderCashInput(String(pi.cash));
  };

  const saveOrderPayment = async (): Promise<void> => {
    if (!orderPaymentTarget) return;

    const code = orderPaymentTarget.promo_code;
    if (!code) {
      alert("Promo code not found.");
      return;
    }

    const parents = getOrderParents(code);
    if (parents.length === 0) {
      alert("No order found for this promo code.");
      return;
    }

    const g = moneyFromStr(orderGcashInput);
    const c = moneyFromStr(orderCashInput);

    try {
      setSavingOrderPayment(true);

      const allocations = allocateAmountsAcrossOrders(parents, g, c);

      for (const alloc of allocations) {
        const tableName =
          alloc.source === "addon_orders" ? "addon_orders" : "consignment_orders";

        const { error } = await supabase
          .from(tableName)
          .update({
            gcash_amount: alloc.gcash_amount,
            cash_amount: alloc.cash_amount,
            is_paid: alloc.is_paid,
            paid_at: alloc.paid_at,
          })
          .eq("id", alloc.id);

        if (error) {
          alert(`Save order payment error: ${error.message}`);
          return;
        }
      }

      const nextParents: PromoOrderParentRow[] = parents.map((p) => {
        const found = allocations.find((a) => a.id === p.id && a.source === p.source);
        if (!found) return p;
        return {
          ...p,
          gcash_amount: found.gcash_amount,
          cash_amount: found.cash_amount,
          is_paid: found.is_paid,
          paid_at: found.paid_at,
        };
      });

      setOrderParentsMap((prev) => ({
        ...prev,
        [code]: nextParents,
      }));

      setOrderPaymentTarget(null);

      await fetchOrdersForPromoCodes(rows.map((r) => String(r.promo_code ?? "")));
      await syncPromoFinalPaid(orderPaymentTarget.id);
    } catch (e) {
      console.error(e);
      alert("Save order payment failed.");
    } finally {
      setSavingOrderPayment(false);
    }
  };

  const openDiscountModal = (r: PromoBookingRow): void => {
    setDiscountTarget(r);
    setDiscountKind(r.discount_kind ?? "none");
    setDiscountValueInput(String(round2(toNumber(r.discount_value))));
    setDiscountReasonInput(String(r.discount_reason ?? ""));
    setGcashInput(String(round2(Math.max(0, toNumber(r.gcash_amount)))));
    setCashInput(String(round2(Math.max(0, toNumber(r.cash_amount)))));
  };

  const saveDiscount = async (): Promise<void> => {
    if (!discountTarget) return;

    const base = round2(Math.max(0, toNumber(discountTarget.price)));
    const rawVal = toNumber(discountValueInput);
    const cleanVal = round2(Math.max(0, rawVal));
    const finalVal = discountKind === "percent" ? clamp(cleanVal, 0, 100) : cleanVal;

    const calc = applyDiscount(base, discountKind, finalVal);
    const newDue = round2(calc.discountedCost);

    const g = moneyFromStr(gcashInput);
    const c = moneyFromStr(cashInput);
    const totalPaid = round2(g + c);
    const systemPaidAuto = newDue <= 0 ? true : totalPaid >= newDue;

    try {
      setSavingDiscount(true);

      const dbRow = await updateBookingThenFetch(
        discountTarget.id,
        {
          discount_kind: discountKind,
          discount_value: finalVal,
          discount_reason: discountReasonInput.trim() || null,
          gcash_amount: g,
          cash_amount: c,
          is_paid: false,
          paid_at:
            systemPaidAuto && !hasOrder(discountTarget.promo_code)
              ? new Date().toISOString()
              : null,
        },
        selectPromoBookings
      );

      const updated = normalizeRow(dbRow);
      setRows((prev) => prev.map((x) => (x.id === discountTarget.id ? updated : x)));
      setSelected((prev) => (prev?.id === discountTarget.id ? updated : prev));
      setSelectedOrderBooking((prev) =>
        prev?.id === discountTarget.id ? updated : prev
      );
      setDiscountTarget(null);

      await syncPromoFinalPaid(updated.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save discount failed.";
      alert(`Save discount error: ${msg}`);
    } finally {
      setSavingDiscount(false);
    }
  };

  const togglePaid = async (r: PromoBookingRow): Promise<void> => {
    try {
      setTogglingPaidId(r.id);

      const current = toBool(r.is_paid);
      const nextPaid = !current;

      if (nextPaid && !isFinalPaidRow(r)) {
        alert(
          "Cannot set PAID yet. Both System Payment and Order Payment must be fully paid first."
        );
        return;
      }

      const { data, error } = await supabase
        .from("promo_bookings")
        .update({
          is_paid: nextPaid,
          paid_at: nextPaid ? new Date().toISOString() : null,
        })
        .eq("id", r.id)
        .select("id, is_paid, paid_at, gcash_amount, cash_amount")
        .limit(1);

      if (error) {
        alert(`Toggle paid error: ${error.message}`);
        return;
      }

      const u = (((data ?? []) as unknown as PromoBookingPaidUpdateRow[])[0] ?? null);
      if (!u) {
        alert("Toggle paid error: updated row not returned (RLS/permission?)");
        return;
      }

      setRows((prev) =>
        prev.map((x) =>
          x.id === r.id
            ? {
                ...x,
                is_paid: toBool(u.is_paid),
                paid_at: u.paid_at ?? null,
                gcash_amount: round2(toNumber(u.gcash_amount)),
                cash_amount: round2(toNumber(u.cash_amount)),
              }
            : x
        )
      );

      setSelected((prev) =>
        prev?.id === r.id
          ? {
              ...prev,
              is_paid: toBool(u.is_paid),
              paid_at: u.paid_at ?? null,
              gcash_amount: round2(toNumber(u.gcash_amount)),
              cash_amount: round2(toNumber(u.cash_amount)),
            }
          : prev
      );

      setSelectedOrderBooking((prev) =>
        prev?.id === r.id
          ? {
              ...prev,
              is_paid: toBool(u.is_paid),
              paid_at: u.paid_at ?? null,
              gcash_amount: round2(toNumber(u.gcash_amount)),
              cash_amount: round2(toNumber(u.cash_amount)),
            }
          : prev
      );
    } catch (e) {
      console.error(e);
      alert("Toggle paid failed.");
    } finally {
      setTogglingPaidId(null);
    }
  };

  const openCancelModal = (r: PromoBookingRow): void => {
    setCancelTarget(r);
    setCancelDesc("");
    setCancelError("");
  };

  const runCancel = async (): Promise<void> => {
    if (!cancelTarget) return;

    const desc = cancelDesc.trim();
    if (!desc) {
      setCancelError("Description / reason is required.");
      return;
    }

    try {
      setCancelling(true);
      setCancellingId(cancelTarget.id);
      setCancelError("");

      const { data, error } = await supabase
        .from("promo_bookings")
        .select(`
          id,
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
          discount_value,
          promo_code,
          attempts_left,
          max_attempts,
          validity_end_at
        `)
        .eq("id", cancelTarget.id)
        .limit(1);

      if (error) {
        setCancelError(`Failed to load booking: ${error.message}`);
        return;
      }

      const fullRow = ((data ?? []) as unknown as Array<Record<string, unknown>>)[0] ?? null;
      if (!fullRow) {
        setCancelError("Failed to load booking: record not found.");
        return;
      }

      const { error: insErr } = await supabase.from("promo_bookings_cancelled").insert({
        original_id: String(fullRow.id),
        description: desc,
        created_at: fullRow.created_at,
        user_id: (fullRow.user_id as string | null | undefined) ?? null,
        full_name: String(fullRow.full_name ?? ""),
        phone_number: (fullRow.phone_number as string | null | undefined) ?? null,
        area: fullRow.area,
        package_id: fullRow.package_id,
        package_option_id: fullRow.package_option_id,
        seat_number: (fullRow.seat_number as string | null | undefined) ?? null,
        start_at: fullRow.start_at,
        end_at: fullRow.end_at,
        price: fullRow.price ?? 0,
        status: (fullRow.status as string | null | undefined) ?? "pending",
        gcash_amount: fullRow.gcash_amount ?? 0,
        cash_amount: fullRow.cash_amount ?? 0,
        is_paid: Boolean(fullRow.is_paid),
        paid_at: (fullRow.paid_at as string | null | undefined) ?? null,
        discount_reason: (fullRow.discount_reason as string | null | undefined) ?? null,
        discount_kind: String(fullRow.discount_kind ?? "none"),
        discount_value: fullRow.discount_value ?? 0,
        promo_code: (fullRow.promo_code as string | null | undefined) ?? null,
        attempts_left: Number(fullRow.attempts_left ?? 0) || 0,
        max_attempts: Number(fullRow.max_attempts ?? 0) || 0,
        validity_end_at: (fullRow.validity_end_at as string | null | undefined) ?? null,
      });

      if (insErr) {
        setCancelError(`Cancel save failed: ${insErr.message}`);
        return;
      }

      const { error: delErr } = await supabase
        .from("promo_bookings")
        .delete()
        .eq("id", cancelTarget.id);

      if (delErr) {
        setCancelError(`Inserted to cancelled, but delete failed: ${delErr.message}.`);
        return;
      }

      setRows((prev) => prev.filter((x) => x.id !== cancelTarget.id));
      setSelected((prev) => (prev?.id === cancelTarget.id ? null : prev));
      setSelectedOrderBooking((prev) => (prev?.id === cancelTarget.id ? null : prev));
      setCancelTarget(null);

      setAttMap((prev) => {
        const next = { ...prev };
        delete next[cancelTarget.id];
        return next;
      });

      if (cancelTarget.promo_code) {
        setOrdersMap((prev) => {
          const next = { ...prev };
          delete next[cancelTarget.promo_code as string];
          return next;
        });
        setOrderParentsMap((prev) => {
          const next = { ...prev };
          delete next[cancelTarget.promo_code as string];
          return next;
        });
      }
    } catch {
      setCancelError("Cancel failed (unexpected error).");
    } finally {
      setCancelling(false);
      setCancellingId(null);
    }
  };

  const deleteByRange = async (): Promise<void> => {
    if (filteredRows.length === 0) {
      alert("No records to delete for selected filter/range.");
      return;
    }

    const count = filteredRows.length;
    const label = `${rangeMode.toUpperCase()} • ${activeRange.label}`;
    const ok = window.confirm(
      `Delete ALL currently filtered promo records for:\n${label}\n\nArea: ${areaFilter}\nCommon Duration: ${commonDurationFilter}\nConference Duration: ${conferenceDurationFilter}\n\nThis will delete ${count} record(s).`
    );
    if (!ok) return;

    try {
      setDeletingRangeLabel(label);

      const ids = filteredRows.map((r) => r.id);
      const chunkSize = 200;

      for (let i = 0; i < ids.length; i += chunkSize) {
        const slice = ids.slice(i, i + chunkSize);
        const { error } = await supabase.from("promo_bookings").delete().in("id", slice);
        if (error) {
          alert(`Delete error: ${error.message}`);
          return;
        }
      }

      setRows((prev) => prev.filter((r) => !ids.includes(r.id)));
      setSelected((prev) => (prev && ids.includes(prev.id) ? null : prev));
      setSelectedOrderBooking((prev) => (prev && ids.includes(prev.id) ? null : prev));

      setAttMap((prev) => {
        const next = { ...prev };
        ids.forEach((id) => delete next[id]);
        return next;
      });
    } catch {
      alert("Delete failed.");
    } finally {
      setDeletingRangeLabel(null);
    }
  };

  const openRuleModal = (r: PromoBookingRow): void => {
    if (!canEditRules) return;
    setRuleTarget(r);
    setRuleAttemptsLeftInput(String(Math.max(0, Math.floor(toNumber(r.attempts_left)))));
    setRuleMaxAttemptsInput(String(Math.max(0, Math.floor(toNumber(r.max_attempts)))));
    setRuleValidityInput(r.validity_end_at ? isoToLocalDateTimeInput(r.validity_end_at) : "");
  };

  const saveRule = async (): Promise<void> => {
    if (!ruleTarget) return;
    if (!canEditRules) {
      alert("Only staff/admin can edit attempts/validity.");
      return;
    }

    const attemptsLeft = Math.max(0, Math.floor(toNumber(ruleAttemptsLeftInput)));
    const maxAttempts = Math.max(0, Math.floor(toNumber(ruleMaxAttemptsInput)));

    const fixedMax = maxAttempts;
    const fixedLeft = fixedMax > 0 ? Math.min(attemptsLeft, fixedMax) : attemptsLeft;

    const validityIso = ruleValidityInput.trim()
      ? localDateTimeInputToIso(ruleValidityInput.trim())
      : null;

    try {
      setSavingRule(true);

      const dbRow = await updateBookingThenFetch(
        ruleTarget.id,
        {
          attempts_left: fixedLeft,
          max_attempts: fixedMax,
          validity_end_at: validityIso,
        },
        selectPromoBookings
      );

      const updated = normalizeRow(dbRow);
      setRows((prev) => prev.map((x) => (x.id === ruleTarget.id ? updated : x)));
      setSelected((prev) => (prev?.id === ruleTarget.id ? updated : prev));
      setSelectedOrderBooking((prev) =>
        prev?.id === ruleTarget.id ? updated : prev
      );
      setRuleTarget(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save rule failed.";
      alert(`Save rule error: ${msg}`);
    } finally {
      setSavingRule(false);
    }
  };

  const exportToExcel = async (): Promise<void> => {
    if (filteredRows.length === 0) {
      alert("No records for selected filter/range.");
      return;
    }

    setExporting(true);
    try {
      const wb = new ExcelJS.Workbook();
      wb.creator = "Me Tyme Lounge";
      wb.created = new Date();

      const ws = wb.addWorksheet("Promo Discounts", {
        views: [{ state: "frozen", ySplit: 6 }],
        pageSetup: { fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      });

      ws.columns = [
        { header: "Created At", key: "created_at", width: 20 },
        { header: "Customer", key: "customer", width: 26 },
        { header: "Phone #", key: "phone", width: 16 },
        { header: "Area", key: "area", width: 16 },
        { header: "Seat", key: "seat", width: 16 },
        { header: "Package", key: "pkg", width: 20 },
        { header: "Option", key: "opt", width: 28 },
        { header: "Start", key: "start", width: 20 },
        { header: "End", key: "end", width: 20 },
        { header: "System Cost", key: "system_due", width: 12 },
        { header: "Order Total", key: "order_due", width: 12 },
        { header: "Grand Total", key: "grand_total", width: 12 },
        { header: "System Paid", key: "system_paid", width: 12 },
        { header: "Order Paid", key: "order_paid", width: 12 },
        { header: "Overall Paid", key: "overall_paid", width: 12 },
        { header: "Paid?", key: "paid_status", width: 10 },
        { header: "Status", key: "status", width: 12 },
        { header: "Promo Code", key: "code", width: 14 },
        { header: "Attempts Left", key: "attempts_left", width: 12 },
        { header: "Max Attempts", key: "max_attempts", width: 12 },
        { header: "Validity End", key: "validity", width: 20 },
        { header: "Last Attendance", key: "att_last", width: 22 },
      ];

      ws.mergeCells("A1", "V1");
      ws.getCell("A1").value = "ME TYME LOUNGE — ADMIN PROMO REPORT";
      ws.getCell("A1").font = { bold: true, size: 16 };
      ws.getCell("A1").alignment = { vertical: "middle", horizontal: "left" };
      ws.getRow(1).height = 26;

      ws.mergeCells("A2", "V2");
      ws.getCell("A2").value = `Range: ${rangeMode.toUpperCase()} • ${activeRange.label}`;
      ws.getCell("A2").font = { bold: true, size: 12 };

      ws.mergeCells("A3", "V3");
      ws.getCell("A3").value = `Area: ${areaFilter} • Common Duration: ${commonDurationFilter} • Conference Duration: ${conferenceDurationFilter}`;
      ws.getCell("A3").font = { bold: true, size: 12 };

      ws.mergeCells("A4", "V4");
      ws.getCell("A4").value = `Generated: ${new Date().toLocaleString("en-PH")}`;
      ws.getCell("A4").font = { size: 11 };

      ws.mergeCells("A5", "V5");
      ws.getCell("A5").value = `Total: ₱${totals.total.toFixed(2)} • Upcoming: ${totals.upcoming} • Ongoing: ${totals.ongoing} • Finished: ${totals.finished}`;
      ws.getCell("A5").font = { bold: true, size: 11 };

      const headerRow = ws.getRow(6);
      headerRow.font = { bold: true };

      filteredRows.forEach((r) => {
        const opt = r.package_options;
        const optionText =
          opt?.option_name && opt?.duration_value && opt?.duration_unit
            ? `${opt.option_name} • ${formatDuration(Number(opt.duration_value), opt.duration_unit)}`
            : opt?.option_name || "—";

        const finalPaid = toBool(r.is_paid);
        const orderDue = getOrderDue(r.promo_code);
        const orderPaidInfo = getOrderPaidInfo(r.promo_code);
        const systemDue = getSystemDue(r);
        const systemPaidInfo = getSystemPaidInfo(r);
        const grand = getGrandDue(r);
        const last = lastLogFor(r.id);

        ws.addRow({
          created_at: fmtPH(r.created_at),
          customer: r.full_name,
          phone: safePhone(r.phone_number),
          area: prettyArea(r.area),
          seat: seatLabel(r),
          pkg: r.packages?.title || "—",
          opt: optionText,
          start: fmtPH(r.start_at),
          end: fmtPH(r.end_at),
          system_due: systemDue,
          order_due: orderDue,
          grand_total: grand,
          system_paid: systemPaidInfo.totalPaid,
          order_paid: orderPaidInfo.totalPaid,
          overall_paid: getGrandPaid(r),
          paid_status: finalPaid ? "PAID" : "UNPAID",
          status: getStatus(r.start_at, r.end_at, tick),
          code: r.promo_code || "—",
          attempts_left: r.attempts_left,
          max_attempts: r.max_attempts,
          validity: r.validity_end_at ? fmtPH(r.validity_end_at) : "—",
          att_last: last ? `${attStatus(last)} • ${fmtPH(attStamp(last))}` : "—",
        });
      });

      [10, 11, 12, 13, 14, 15].forEach((col) => {
        ws.getColumn(col).numFmt = "₱#,##0.00";
      });

      if (isLikelyUrl(logo)) {
        const imgBuf = await fetchAsArrayBuffer(logo);
        if (imgBuf) {
          const imgId = wb.addImage({ buffer: imgBuf, extension: "png" });
          ws.addImage(imgId, {
            tl: { col: 21, row: 0 },
            ext: { width: 72, height: 72 },
          });
        }
      }

      const buffer = await wb.xlsx.writeBuffer();
      saveAs(
        new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        `admin_customer_discount_list_${rangeMode}_${activeRange.label.replace(/[^\w-]+/g, "_")}.xlsx`
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="acdl-page">
      <div className="acdl-shell">
        <div className="acdl-hero">
          <div className="acdl-eyebrow">ADMIN PANEL</div>
          <h1 className="acdl-title">Customer Discount List</h1>
          <p className="acdl-subtitle">
            Promo discount management with payment tracking, order handling,
            attendance, code rules, export, and fixed centered modals.
          </p>

          <div className="acdl-toolbar">
            <div className="acdl-control">
              <label>Range Mode</label>
              <select value={rangeMode} onChange={(e) => setRangeMode(e.currentTarget.value as RangeMode)}>
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
              </select>
            </div>

            {rangeMode === "month" ? (
              <div className="acdl-control">
                <label>Month</label>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.currentTarget.value)}
                />
              </div>
            ) : (
              <div className="acdl-control">
                <label>{rangeMode === "week" ? "Week Anchor" : "Day"}</label>
                <input
                  type="date"
                  value={selectedDay}
                  onChange={(e) => setSelectedDay(e.currentTarget.value)}
                />
              </div>
            )}

            <div className="acdl-control">
              <label>Area</label>
              <select value={areaFilter} onChange={(e) => setAreaFilter(e.currentTarget.value as AreaFilter)}>
                <option value="all">All</option>
                <option value="common_area">Common Area</option>
                <option value="conference_room">Conference Room</option>
              </select>
            </div>

            {areaFilter === "common_area" ? (
              <div className="acdl-control">
                <label>Common Duration</label>
                <select
                  value={commonDurationFilter}
                  onChange={(e) => setCommonDurationFilter(e.currentTarget.value as CommonDurationFilter)}
                >
                  <option value="all">All</option>
                  <option value="1_day">1 Day</option>
                  <option value="week">Week</option>
                  <option value="half_month">Half Month</option>
                  <option value="month">Month</option>
                </select>
              </div>
            ) : null}

            {areaFilter === "conference_room" ? (
              <div className="acdl-control">
                <label>Conference Duration</label>
                <select
                  value={conferenceDurationFilter}
                  onChange={(e) => setConferenceDurationFilter(e.currentTarget.value as ConferenceDurationFilter)}
                >
                  <option value="all">All</option>
                  <option value="1_hour">1 Hour</option>
                  <option value="3_hours">3 Hours</option>
                  <option value="6_hours">6 Hours</option>
                  <option value="8_hours">8 Hours</option>
                </select>
              </div>
            ) : null}

            <div className="acdl-actions-top">
              <button className="acdl-btn acdl-btn-light" onClick={() => void refreshAll()} type="button">
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
              <button
                className="acdl-btn acdl-btn-dark"
                onClick={() => void exportToExcel()}
                disabled={exporting || filteredRows.length === 0}
                type="button"
              >
                {exporting ? "Exporting..." : "Export Excel"}
              </button>
              <button
                className="acdl-btn acdl-btn-danger"
                onClick={() => void deleteByRange()}
                disabled={!!deletingRangeLabel || filteredRows.length === 0}
                type="button"
              >
                {deletingRangeLabel ? "Deleting..." : "Delete Filtered"}
              </button>
            </div>
          </div>
        </div>

        <div className="acdl-stats">
          <div className="acdl-stat-box">
            <span>Range</span>
            <strong>{activeRange.label}</strong>
          </div>
          <div className="acdl-stat-box">
            <span>Total</span>
            <strong>₱{totals.total.toFixed(2)}</strong>
          </div>
          <div className="acdl-stat-box">
            <span>Upcoming</span>
            <strong>{totals.upcoming}</strong>
          </div>
          <div className="acdl-stat-box">
            <span>Ongoing</span>
            <strong>{totals.ongoing}</strong>
          </div>
          <div className="acdl-stat-box">
            <span>Finished</span>
            <strong>{totals.finished}</strong>
          </div>
        </div>

        <div className="acdl-table-wrap">
          {loading ? (
            <div className="acdl-loading">
              <div className="acdl-spinner" />
              <span>Loading...</span>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="acdl-empty">No promo discount records found.</div>
          ) : (
            <div className="acdl-table-scroll">
              <table className="acdl-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th>Area</th>
                    <th>Seat</th>
                    <th>Package</th>
                    <th>Option</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>System Cost</th>
                    <th>Order</th>
                    <th>Discount</th>
                    <th>Status</th>
                    <th>Paid?</th>
                    <th>System Payment</th>
                    <th>Order Payment</th>
                    <th>Code / Rules</th>
                    <th>Attendance</th>
                    <th>Reason</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredRows.map((r) => {
                    const opt = r.package_options;
                    const optionText =
                      opt?.option_name && opt?.duration_value && opt?.duration_unit
                        ? `${opt.option_name} • ${formatDuration(
                            Number(opt.duration_value),
                            opt.duration_unit
                          )}`
                        : opt?.option_name || "—";

                    const finalPaid = toBool(r.is_paid);
                    const st = getStatus(r.start_at, r.end_at, tick);
                    const systemDue = getSystemDue(r);
                    const systemPaid = getSystemPaidInfo(r);
                    const systemBalance = getSystemRemainingInfo(r);
                    const orderDue = getOrderDue(r.promo_code);
                    const orderPaid = getOrderPaidInfo(r.promo_code);
                    const orderBalance = getOrderRemainingInfo(r.promo_code);
                    const last = lastLogFor(r.id);

                    return (
                      <tr key={r.id}>
                        <td>{fmtPH(r.created_at)}</td>

                        <td>
                          <div className="acdl-stack">
                            <strong>{r.full_name}</strong>
                            <span>{safePhone(r.phone_number)}</span>
                          </div>
                        </td>

                        <td>{safePhone(r.phone_number)}</td>
                        <td>{prettyArea(r.area)}</td>
                        <td>{seatLabel(r)}</td>
                        <td>{r.packages?.title || "—"}</td>
                        <td>{optionText}</td>
                        <td>{fmtPH(r.start_at)}</td>
                        <td>{fmtPH(r.end_at)}</td>

                        <td>
                          <div className="acdl-stack">
                            <strong>₱{systemDue.toFixed(2)}</strong>
                            <span>Grand: ₱{getGrandDue(r).toFixed(2)}</span>
                          </div>
                        </td>

                        <td>
                          <div className="acdl-stack">
                            <strong>₱{orderDue.toFixed(2)}</strong>
                            {hasOrder(r.promo_code) ? (
                              <button
                                className="acdl-btn-mini"
                                onClick={() => setSelectedOrderBooking(r)}
                                type="button"
                              >
                                View Order
                              </button>
                            ) : (
                              <span>—</span>
                            )}
                          </div>
                        </td>

                        <td>
                          <div className="acdl-stack">
                            <strong>{getDiscountTextFrom(r.discount_kind, r.discount_value)}</strong>
                            {r.discount_reason ? <span>{r.discount_reason}</span> : <span>—</span>}
                          </div>
                        </td>

                        <td>
                          <div className="acdl-stack">
                            <span className={`acdl-status-badge acdl-status-${st.toLowerCase()}`}>
                              {st}
                            </span>
                            {isExpired(r.validity_end_at) ? (
                              <span className="acdl-expired">Code Expired</span>
                            ) : null}
                          </div>
                        </td>

                        <td>
                          <button
                            className={`acdl-paid-pill ${finalPaid ? "paid" : "unpaid"}`}
                            onClick={() => void togglePaid(r)}
                            disabled={togglingPaidId === r.id}
                            type="button"
                          >
                            {togglingPaidId === r.id ? "..." : finalPaid ? "PAID" : "UNPAID"}
                          </button>
                        </td>

                        <td>
                          <div className="acdl-pay-card">
                            <span>GCash: ₱{systemPaid.gcash.toFixed(2)}</span>
                            <span>Cash: ₱{systemPaid.cash.toFixed(2)}</span>
                            <strong>
                              {systemBalance.label}: ₱
                              {(systemBalance.label === "Remaining"
                                ? systemBalance.remaining
                                : systemBalance.change
                              ).toFixed(2)}
                            </strong>
                            <button
                              className="acdl-btn-mini"
                              onClick={() => openPaymentModal(r)}
                              type="button"
                            >
                              Payment
                            </button>
                          </div>
                        </td>

                        <td>
                          <div className="acdl-pay-card">
                            <span>GCash: ₱{orderPaid.gcash.toFixed(2)}</span>
                            <span>Cash: ₱{orderPaid.cash.toFixed(2)}</span>
                            <strong>
                              {orderBalance.label}: ₱
                              {(orderBalance.label === "Remaining"
                                ? orderBalance.remaining
                                : orderBalance.change
                              ).toFixed(2)}
                            </strong>
                            <button
                              className="acdl-btn-mini"
                              onClick={() => openOrderPaymentModal(r)}
                              type="button"
                              disabled={!hasOrder(r.promo_code)}
                            >
                              Order Payment
                            </button>
                          </div>
                        </td>

                        <td>
                          <div className="acdl-stack">
                            <strong>{r.promo_code || "—"}</strong>
                            <span>
                              {r.attempts_left}/{r.max_attempts} attempts
                            </span>
                            <span>{r.validity_end_at ? fmtPH(r.validity_end_at) : "No expiry"}</span>
                            <button
                              className="acdl-btn-mini"
                              onClick={() => openRuleModal(r)}
                              disabled={!canEditRules}
                              type="button"
                            >
                              Edit Rules
                            </button>
                          </div>
                        </td>

                        <td>
                          <div className="acdl-stack">
                            <span>{logsFor(r.id).length} logs</span>
                            <span>{last ? `${attStatus(last)} • ${fmtPH(attStamp(last))}` : "—"}</span>
                            <button
                              className="acdl-btn-mini"
                              onClick={() => setAttModalTarget(r)}
                              type="button"
                            >
                              View
                            </button>
                          </div>
                        </td>

                        <td>{r.discount_reason || "—"}</td>

                        <td>
                          <div className="acdl-action-stack">
                            <button
                              className="acdl-btn-mini"
                              onClick={() => setSelected(r)}
                              type="button"
                            >
                              Receipt
                            </button>
                            <button
                              className="acdl-btn-mini"
                              onClick={() => openDiscountModal(r)}
                              type="button"
                            >
                              Discount
                            </button>
                            <button
                              className="acdl-btn-mini acdl-btn-mini-danger"
                              onClick={() => openCancelModal(r)}
                              disabled={cancellingId === r.id}
                              type="button"
                            >
                              {cancellingId === r.id ? "Cancelling..." : "Cancel"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <FixedModal
          open={!!paymentTarget}
          title="System Payment"
          size="sm"
          onClose={() => setPaymentTarget(null)}
        >
          <div className="acdl-form-stack">
            <div className="acdl-form-field">
              <label>GCash</label>
              <input
                type="number"
                value={gcashInput}
                onChange={(e) => setGcashInput(e.currentTarget.value)}
              />
            </div>
            <div className="acdl-form-field">
              <label>Cash</label>
              <input
                type="number"
                value={cashInput}
                onChange={(e) => setCashInput(e.currentTarget.value)}
              />
            </div>
            <div className="acdl-modal-actions">
              <button className="acdl-btn acdl-btn-light" onClick={() => setPaymentTarget(null)} type="button">
                Close
              </button>
              <button
                className="acdl-btn acdl-btn-dark"
                onClick={() => void savePayment()}
                disabled={savingPayment}
                type="button"
              >
                {savingPayment ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </FixedModal>

        <FixedModal
          open={!!orderPaymentTarget}
          title="Order Payment"
          size="sm"
          onClose={() => setOrderPaymentTarget(null)}
        >
          <div className="acdl-form-stack">
            <div className="acdl-form-field">
              <label>GCash</label>
              <input
                type="number"
                value={orderGcashInput}
                onChange={(e) => setOrderGcashInput(e.currentTarget.value)}
              />
            </div>
            <div className="acdl-form-field">
              <label>Cash</label>
              <input
                type="number"
                value={orderCashInput}
                onChange={(e) => setOrderCashInput(e.currentTarget.value)}
              />
            </div>
            <div className="acdl-modal-actions">
              <button className="acdl-btn acdl-btn-light" onClick={() => setOrderPaymentTarget(null)} type="button">
                Close
              </button>
              <button
                className="acdl-btn acdl-btn-dark"
                onClick={() => void saveOrderPayment()}
                disabled={savingOrderPayment}
                type="button"
              >
                {savingOrderPayment ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </FixedModal>

        <FixedModal
          open={!!discountTarget}
          title="Discount"
          size="sm"
          onClose={() => setDiscountTarget(null)}
        >
          <div className="acdl-form-stack">
            <div className="acdl-form-field">
              <label>Discount Type</label>
              <select
                value={discountKind}
                onChange={(e) => setDiscountKind(e.currentTarget.value as DiscountKind)}
              >
                <option value="none">None</option>
                <option value="percent">Percent</option>
                <option value="amount">Amount</option>
              </select>
            </div>

            <div className="acdl-form-field">
              <label>Discount Value</label>
              <input
                type="number"
                value={discountValueInput}
                onChange={(e) => setDiscountValueInput(e.currentTarget.value)}
              />
            </div>

            <div className="acdl-form-field">
              <label>Discount Reason</label>
              <textarea
                rows={4}
                value={discountReasonInput}
                onChange={(e) => setDiscountReasonInput(e.currentTarget.value)}
              />
            </div>

            <div className="acdl-form-grid">
              <div className="acdl-form-field">
                <label>GCash</label>
                <input
                  type="number"
                  value={gcashInput}
                  onChange={(e) => setGcashInput(e.currentTarget.value)}
                />
              </div>
              <div className="acdl-form-field">
                <label>Cash</label>
                <input
                  type="number"
                  value={cashInput}
                  onChange={(e) => setCashInput(e.currentTarget.value)}
                />
              </div>
            </div>

            <div className="acdl-modal-actions">
              <button className="acdl-btn acdl-btn-light" onClick={() => setDiscountTarget(null)} type="button">
                Close
              </button>
              <button
                className="acdl-btn acdl-btn-dark"
                onClick={() => void saveDiscount()}
                disabled={savingDiscount}
                type="button"
              >
                {savingDiscount ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </FixedModal>

        <FixedModal
          open={!!ruleTarget}
          title="Edit Code Rules"
          size="sm"
          onClose={() => setRuleTarget(null)}
        >
          <div className="acdl-form-stack">
            <div className="acdl-form-field">
              <label>Attempts Left</label>
              <input
                type="number"
                value={ruleAttemptsLeftInput}
                onChange={(e) => setRuleAttemptsLeftInput(e.currentTarget.value)}
              />
            </div>

            <div className="acdl-form-field">
              <label>Max Attempts</label>
              <input
                type="number"
                value={ruleMaxAttemptsInput}
                onChange={(e) => setRuleMaxAttemptsInput(e.currentTarget.value)}
              />
            </div>

            <div className="acdl-form-field">
              <label>Validity End</label>
              <input
                type="datetime-local"
                value={ruleValidityInput}
                onChange={(e) => setRuleValidityInput(e.currentTarget.value)}
              />
            </div>

            <div className="acdl-modal-actions">
              <button className="acdl-btn acdl-btn-light" onClick={() => setRuleTarget(null)} type="button">
                Close
              </button>
              <button
                className="acdl-btn acdl-btn-dark"
                onClick={() => void saveRule()}
                disabled={savingRule}
                type="button"
              >
                {savingRule ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </FixedModal>

        <FixedModal
          open={!!attModalTarget}
          title="Attendance Logs"
          size="md"
          onClose={() => setAttModalTarget(null)}
        >
          {attModalTarget ? (
            <div className="acdl-attendance-wrap">
              <div className="acdl-att-head">
                <strong>{attModalTarget.full_name}</strong>
                <span>{logsFor(attModalTarget.id).length} logs</span>
              </div>

              {logsFor(attModalTarget.id).length === 0 ? (
                <div className="acdl-empty acdl-empty-tight">No attendance logs.</div>
              ) : (
                <div className="acdl-att-list">
                  {logsFor(attModalTarget.id).map((r) => (
                    <div className="acdl-att-card" key={r.id}>
                      <div>
                        <strong>{r.local_day}</strong>
                        <span>IN: {fmtPH(r.in_at)}</span>
                        <span>OUT: {r.out_at ? fmtPH(r.out_at) : "—"}</span>
                      </div>
                      <div>
                        <strong>{attStatus(r)}</strong>
                        <span>{r.note || "—"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </FixedModal>

        <FixedModal
          open={!!cancelTarget}
          title="Cancel Promo"
          size="sm"
          onClose={() => setCancelTarget(null)}
        >
          <div className="acdl-form-stack">
            <div className="acdl-form-field">
              <label>Description / Reason</label>
              <textarea
                rows={4}
                value={cancelDesc}
                onChange={(e) => setCancelDesc(e.currentTarget.value)}
              />
            </div>
            {cancelError ? <div className="acdl-error">{cancelError}</div> : null}
            <div className="acdl-modal-actions">
              <button className="acdl-btn acdl-btn-light" onClick={() => setCancelTarget(null)} type="button">
                Close
              </button>
              <button
                className="acdl-btn acdl-btn-danger"
                onClick={() => void runCancel()}
                disabled={cancelling}
                type="button"
              >
                {cancelling ? "Cancelling..." : "Cancel Promo"}
              </button>
            </div>
          </div>
        </FixedModal>

        <FixedModal
          open={!!orderCancelTarget}
          title="Cancel Order Item"
          size="sm"
          onClose={() => setOrderCancelTarget(null)}
        >
          <div className="acdl-form-stack">
            <div className="acdl-form-field">
              <label>Cancel Note</label>
              <textarea
                rows={4}
                value={orderCancelNote}
                onChange={(e) => setOrderCancelNote(e.currentTarget.value)}
              />
            </div>
            <div className="acdl-modal-actions">
              <button className="acdl-btn acdl-btn-light" onClick={() => setOrderCancelTarget(null)} type="button">
                Close
              </button>
              <button
                className="acdl-btn acdl-btn-danger"
                onClick={() => void submitOrderItemCancel()}
                disabled={!!cancellingOrderItemId}
                type="button"
              >
                {cancellingOrderItemId ? "Cancelling..." : "Cancel Item"}
              </button>
            </div>
          </div>
        </FixedModal>

        <FixedModal
          open={!!selectedOrderBooking}
          title="Order List"
          size="lg"
          onClose={() => setSelectedOrderBooking(null)}
        >
          {selectedOrderBooking ? (
            <div className="acdl-order-wrap">
              <div className="acdl-order-head">
                <img src={logo} alt="logo" className="acdl-logo" />
                <div>
                  <h4>{selectedOrderBooking.full_name}</h4>
                  <p>Promo Code: {selectedOrderBooking.promo_code || "—"}</p>
                </div>
              </div>

              {getOrderItems(selectedOrderBooking.promo_code).length === 0 ? (
                <div className="acdl-empty acdl-empty-tight">No order items.</div>
              ) : (
                <div className="acdl-order-list">
                  {getOrderItems(selectedOrderBooking.promo_code).map((item) => (
                    <div className="acdl-order-card" key={item.id}>
                      <div className="acdl-order-main">
                        {item.image_url && isLikelyUrl(item.image_url) ? (
                          <img
                            src={item.image_url}
                            alt={item.name}
                            className="acdl-order-thumb"
                          />
                        ) : (
                          <div className="acdl-order-thumb acdl-order-thumb-empty">No Image</div>
                        )}

                        <div className="acdl-order-text">
                          <strong>{item.name}</strong>
                          <span>{item.category || "—"}</span>
                          <span>Size: {item.size || "—"}</span>
                          <span>Qty: {item.quantity}</span>
                        </div>
                      </div>

                      <div className="acdl-order-side">
                        <div>₱{item.subtotal.toFixed(2)}</div>
                        <button
                          className="acdl-btn-mini acdl-btn-mini-danger"
                          onClick={() => openOrderCancelModal(selectedOrderBooking, item)}
                          type="button"
                        >
                          Cancel Item
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="acdl-order-total-line">
                Total Order Due: <strong>₱{getOrderDue(selectedOrderBooking.promo_code).toFixed(2)}</strong>
              </div>
            </div>
          ) : null}
        </FixedModal>

        <FixedModal
          open={!!selected}
          title="Receipt"
          size="lg"
          onClose={() => setSelected(null)}
        >
          {selected ? (
            <div className="receipt-container-custom">
              <div className="receipt-head-brand">
                <img src={logo} alt="Study Hub" className="receipt-brand-logo" />
                <div>
                  <h4>Me Tyme Lounge</h4>
                  <p>Promo Receipt</p>
                </div>
              </div>

              <div className="receipt-block">
                <div className="receipt-row">
                  <span>Name</span>
                  <span>{selected.full_name}</span>
                </div>
                <div className="receipt-row">
                  <span>Phone</span>
                  <span>{safePhone(selected.phone_number)}</span>
                </div>
                <div className="receipt-row">
                  <span>Area</span>
                  <span>{prettyArea(selected.area)}</span>
                </div>
                <div className="receipt-row">
                  <span>Seat</span>
                  <span>{seatLabel(selected)}</span>
                </div>
                <div className="receipt-row">
                  <span>Package</span>
                  <span>{selected.packages?.title || "—"}</span>
                </div>
                <div className="receipt-row">
                  <span>Option</span>
                  <span>
                    {selected.package_options?.option_name &&
                    selected.package_options?.duration_value &&
                    selected.package_options?.duration_unit
                      ? `${selected.package_options.option_name} • ${formatDuration(
                          Number(selected.package_options.duration_value),
                          selected.package_options.duration_unit
                        )}`
                      : selected.package_options?.option_name || "—"}
                  </span>
                </div>
                <div className="receipt-row">
                  <span>Start</span>
                  <span>{fmtPH(selected.start_at)}</span>
                </div>
                <div className="receipt-row">
                  <span>End</span>
                  <span>{fmtPH(selected.end_at)}</span>
                </div>
                <div className="receipt-row">
                  <span>Promo Code</span>
                  <span>{selected.promo_code || "—"}</span>
                </div>
              </div>

              <div className="receipt-block">
                {(() => {
                  const finalPaid = toBool(selected.is_paid);
                  const systemDue = getSystemDue(selected);
                  const systemPaid = getSystemPaidInfo(selected);
                  const systemBalance = getSystemRemainingInfo(selected);

                  const orderDue = getOrderDue(selected.promo_code);
                  const orderPaid = getOrderPaidInfo(selected.promo_code);
                  const orderBalance = getOrderRemainingInfo(selected.promo_code);

                  return (
                    <>
                      <div className="receipt-section-title">System Payment</div>
                      <div className="receipt-row">
                        <span>System Cost</span>
                        <span>₱{systemDue.toFixed(2)}</span>
                      </div>
                      <div className="receipt-row">
                        <span>Discount</span>
                        <span>{getDiscountTextFrom(selected.discount_kind, selected.discount_value)}</span>
                      </div>
                      <div className="receipt-row">
                        <span>System GCash</span>
                        <span>₱{systemPaid.gcash.toFixed(2)}</span>
                      </div>
                      <div className="receipt-row">
                        <span>System Cash</span>
                        <span>₱{systemPaid.cash.toFixed(2)}</span>
                      </div>
                      <div className="receipt-row">
                        <span>{systemBalance.label}</span>
                        <span>
                          ₱
                          {(systemBalance.label === "Remaining"
                            ? systemBalance.remaining
                            : systemBalance.change
                          ).toFixed(2)}
                        </span>
                      </div>

                      {hasOrder(selected.promo_code) ? (
                        <>
                          <hr />
                          <div className="receipt-section-title">Order Payment</div>
                          <div className="receipt-row">
                            <span>Total Order</span>
                            <span>₱{orderDue.toFixed(2)}</span>
                          </div>
                          <div className="receipt-row">
                            <span>Order GCash</span>
                            <span>₱{orderPaid.gcash.toFixed(2)}</span>
                          </div>
                          <div className="receipt-row">
                            <span>Order Cash</span>
                            <span>₱{orderPaid.cash.toFixed(2)}</span>
                          </div>
                          <div className="receipt-row">
                            <span>{orderBalance.label}</span>
                            <span>
                              ₱
                              {(orderBalance.label === "Remaining"
                                ? orderBalance.remaining
                                : orderBalance.change
                              ).toFixed(2)}
                            </span>
                          </div>
                        </>
                      ) : null}

                      <hr />

                      <div className="receipt-row">
                        <span>Paid Status</span>
                        <span className="receipt-status">
                          {finalPaid ? "PAID" : "UNPAID"}
                        </span>
                      </div>

                      <div className="receipt-total">
                        <span>TOTAL SYSTEM COST</span>
                        <span>₱{systemDue.toFixed(2)}</span>
                      </div>

                      <div className="receipt-total" style={{ marginTop: 8 }}>
                        <span>TOTAL ORDER</span>
                        <span>₱{orderDue.toFixed(2)}</span>
                      </div>

                      <hr />

                      <div className="receipt-row">
                        <span>Overall Paid</span>
                        <span>₱{getGrandPaid(selected).toFixed(2)}</span>
                      </div>

                      <div className="receipt-row">
                        <span>{getGrandBalanceInfo(selected).label}</span>
                        <span>
                          ₱
                          {(
                            getGrandBalanceInfo(selected).label === "Overall Remaining"
                              ? getGrandBalanceInfo(selected).remaining
                              : getGrandBalanceInfo(selected).change
                          ).toFixed(2)}
                        </span>
                      </div>

                      <div className="receipt-total" style={{ marginTop: 8 }}>
                        <span>GRAND TOTAL</span>
                        <span>₱{getGrandDue(selected).toFixed(2)}</span>
                      </div>
                    </>
                  );
                })()}
              </div>

              <button className="close-btn" onClick={() => setSelected(null)} type="button">
                Close
              </button>
            </div>
          ) : null}
        </FixedModal>
      </div>
    </div>
  );
};

export default Admin_Customer_Discount_List;