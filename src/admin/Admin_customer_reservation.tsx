import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../utils/supabaseClient";
import logo from "../assets/study_hub.png";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import "../styles/Admin_customer_reservation.css";

const HOURLY_RATE = 20;
const FREE_MINUTES = 0;

type DiscountKind = "none" | "percent" | "amount";
type DateFilterMode = "reserved_on" | "start_date";

interface CustomerSession {
  id: string;
  created_at?: string | null;
  staff_id?: string | null;
  date: string;
  full_name: string;
  phone_number?: string | null;
  customer_type: string;
  customer_field?: string | null;
  has_id: boolean;
  hour_avail: string;
  time_started: string;
  time_ended: string;
  total_time: number | string;
  total_amount: number | string;
  reservation: string;
  reservation_date: string | null;
  reservation_end_date?: string | null;
  seat_number: string;
  id_number?: string | null;
  promo_booking_id?: string | null;
  booking_code?: string | null;
  down_payment?: number | string | null;
  expected_end_at?: string | null;
  discount_kind?: DiscountKind;
  discount_value?: number | string | null;
  discount_reason?: string | null;
  gcash_amount?: number | string | null;
  cash_amount?: number | string | null;
  is_paid?: boolean | number | string | null;
  paid_at?: string | null;
}

type CustomerOrderPayment = {
  id: string;
  booking_code: string;
  full_name: string;
  seat_number: string;
  order_total: number | string;
  gcash_amount: number | string;
  cash_amount: number | string;
  is_paid: boolean | number | string | null;
  paid_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type AddonCatalogMini = {
  id: string;
  name: string;
  category: string | null;
  size: string | null;
  image_url: string | null;
};

type ConsignmentCatalogMini = {
  id: string;
  item_name: string;
  category: string | null;
  size: string | null;
  image_url: string | null;
};

type AddonOrderItemRow = {
  id: string;
  created_at?: string | null;
  add_on_id: string;
  item_name: string;
  price: number | string;
  quantity: number | string;
  subtotal?: number | string | null;
  add_ons?: AddonCatalogMini | null;
};

type AddonOrderRow = {
  id: string;
  booking_code: string;
  full_name: string;
  seat_number: string;
  total_amount: number | string;
  addon_order_items?: AddonOrderItemRow[] | null;
};

type ConsignmentOrderItemRow = {
  id: string;
  created_at?: string | null;
  consignment_id: string;
  item_name: string;
  price: number | string;
  quantity: number | string;
  subtotal?: number | string | null;
  consignment?: ConsignmentCatalogMini | null;
};

type ConsignmentOrderRow = {
  id: string;
  booking_code: string;
  full_name: string;
  seat_number: string;
  total_amount: number | string;
  consignment_order_items?: ConsignmentOrderItemRow[] | null;
};

type OrderItemView = {
  id: string;
  parent_order_id: string;
  source: "addon" | "consignment";
  source_item_id: string;
  name: string;
  category: string;
  size: string | null;
  qty: number;
  price: number;
  subtotal: number;
  image_url: string | null;
  created_at: string | null;
};

type SessionOrdersMap = Record<
  string,
  {
    addonOrders: AddonOrderRow[];
    consignmentOrders: ConsignmentOrderRow[];
    items: OrderItemView[];
    total: number;
  }
>;

type AttendanceLogRow = {
  id: string;
  session_id: string;
  booking_code: string;
  attendance_date: string;
  in_at: string;
  out_at: string | null;
  note: string | null;
  auto_closed: boolean;
  created_at: string;
};

type AttendanceStateMap = Record<
  string,
  {
    openLog: AttendanceLogRow | null;
  }
>;

type SeatBlockedRow = {
  id: string;
  seat_number: string;
  start_at: string;
  end_at: string;
  source: string;
  note: string | null;
};

type RawAddonCatalogMini = {
  id?: unknown;
  name?: unknown;
  category?: unknown;
  size?: unknown;
  image_url?: unknown;
};

type RawConsignmentCatalogMini = {
  id?: unknown;
  item_name?: unknown;
  category?: unknown;
  size?: unknown;
  image_url?: unknown;
};

type RawAddonOrderItemRow = {
  id?: unknown;
  created_at?: unknown;
  add_on_id?: unknown;
  item_name?: unknown;
  price?: unknown;
  quantity?: unknown;
  subtotal?: unknown;
  add_ons?: RawAddonCatalogMini | RawAddonCatalogMini[] | null;
};

type RawAddonOrderRow = {
  id?: unknown;
  booking_code?: unknown;
  full_name?: unknown;
  seat_number?: unknown;
  total_amount?: unknown;
  addon_order_items?: RawAddonOrderItemRow[] | null;
};

type RawConsignmentOrderItemRow = {
  id?: unknown;
  created_at?: unknown;
  consignment_id?: unknown;
  item_name?: unknown;
  price?: unknown;
  quantity?: unknown;
  subtotal?: unknown;
  consignment?: RawConsignmentCatalogMini | RawConsignmentCatalogMini[] | null;
};

type RawConsignmentOrderRow = {
  id?: unknown;
  booking_code?: unknown;
  full_name?: unknown;
  seat_number?: unknown;
  total_amount?: unknown;
  consignment_order_items?: RawConsignmentOrderItemRow[] | null;
};

const yyyyMmDdLocal = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const formatDateDisplay = (dateStr: string | null | undefined): string => {
  if (!dateStr) return "—";
  const d = new Date(`${dateStr}T00:00:00`);
  if (!Number.isFinite(d.getTime())) return String(dateStr);
  return d.toLocaleDateString("en-GB");
};

const getLocalDateFromIso = (iso: string | null | undefined): string => {
  const d = new Date(String(iso ?? ""));
  if (!Number.isFinite(d.getTime())) return "";
  return yyyyMmDdLocal(d);
};

const formatTimeText = (iso: string): string => {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const formatDateTimeText = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("en-PH");
};

const clamp = (n: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, n));

const toMoney = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const toText = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
};

const wholePeso = (n: number): number =>
  Math.ceil(Math.max(0, Number.isFinite(n) ? n : 0));

const toBool = (v: unknown): boolean => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes" || s === "paid";
  }
  return false;
};

const normalizeSingleRelation = <T,>(value: T | T[] | null | undefined): T | null => {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
};

const toAddonCatalogMini = (
  raw: RawAddonCatalogMini | null | undefined
): AddonCatalogMini | null => {
  if (!raw) return null;
  return {
    id: toText(raw.id),
    name: toText(raw.name),
    category: toText(raw.category) || null,
    size: toText(raw.size) || null,
    image_url: toText(raw.image_url) || null,
  };
};

const toConsignmentCatalogMini = (
  raw: RawConsignmentCatalogMini | null | undefined
): ConsignmentCatalogMini | null => {
  if (!raw) return null;
  return {
    id: toText(raw.id),
    item_name: toText(raw.item_name),
    category: toText(raw.category) || null,
    size: toText(raw.size) || null,
    image_url: toText(raw.image_url) || null,
  };
};

const toAddonOrderItemRow = (raw: RawAddonOrderItemRow): AddonOrderItemRow => {
  const catalog = normalizeSingleRelation(raw.add_ons);
  return {
    id: toText(raw.id),
    created_at: toText(raw.created_at) || null,
    add_on_id: toText(raw.add_on_id),
    item_name: toText(raw.item_name),
    price: toMoney(raw.price),
    quantity: toMoney(raw.quantity),
    subtotal: raw.subtotal == null ? null : toMoney(raw.subtotal),
    add_ons: toAddonCatalogMini(catalog),
  };
};

const toConsignmentOrderItemRow = (
  raw: RawConsignmentOrderItemRow
): ConsignmentOrderItemRow => {
  const catalog = normalizeSingleRelation(raw.consignment);
  return {
    id: toText(raw.id),
    created_at: toText(raw.created_at) || null,
    consignment_id: toText(raw.consignment_id),
    item_name: toText(raw.item_name),
    price: toMoney(raw.price),
    quantity: toMoney(raw.quantity),
    subtotal: raw.subtotal == null ? null : toMoney(raw.subtotal),
    consignment: toConsignmentCatalogMini(catalog),
  };
};

const getDiscountTextFrom = (kind: DiscountKind, value: number): string => {
  const v = Number.isFinite(value) ? Math.max(0, value) : 0;
  if (kind === "percent" && v > 0) return `${v}%`;
  if (kind === "amount" && v > 0) return `₱${wholePeso(v)}`;
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
    const discRaw = (cost * pct) / 100;
    const finalRaw = Math.max(0, cost - discRaw);
    return {
      discountedCost: wholePeso(finalRaw),
      discountAmount: wholePeso(discRaw),
    };
  }

  if (kind === "amount") {
    const discRaw = Math.min(cost, v);
    const finalRaw = Math.max(0, cost - discRaw);
    return {
      discountedCost: wholePeso(finalRaw),
      discountAmount: wholePeso(discRaw),
    };
  }

  return { discountedCost: wholePeso(cost), discountAmount: 0 };
};

const splitSeats = (seatStr: string): string[] =>
  String(seatStr ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.toUpperCase() !== "N/A");

const rangeDatesInclusive = (startYmd: string, endYmd: string): string[] => {
  const start = new Date(`${startYmd}T00:00:00`);
  const end = new Date(`${endYmd}T00:00:00`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return [];
  if (start.getTime() > end.getTime()) return [];

  const out: string[] = [];
  const cur = new Date(start);
  while (cur.getTime() <= end.getTime()) {
    out.push(yyyyMmDdLocal(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
};

const getClockFromIso = (iso: string): { hours: number; minutes: number } => {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return { hours: 0, minutes: 0 };
  return { hours: d.getHours(), minutes: d.getMinutes() };
};

const endOfLocalDayIso = (yyyyMmDd: string): string => {
  const m = yyyyMmDd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return new Date().toISOString();
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  return new Date(y, mo, d, 23, 59, 59, 999).toISOString();
};

const addDurationToIso = (startIso: string, durationHHMM: string): string => {
  const start = new Date(startIso);
  if (!Number.isFinite(start.getTime())) return startIso;
  const [hRaw, mRaw] = durationHHMM.split(":");
  const dh = Number(hRaw);
  const dm = Number(mRaw);
  if (!Number.isFinite(dh) || !Number.isFinite(dm)) return startIso;
  return new Date(start.getTime() + (dh * 60 + dm) * 60_000).toISOString();
};

const clampToReservationDay = (endIso: string, reservationDate?: string | null): string => {
  if (!reservationDate) return endIso;
  const eod = endOfLocalDayIso(reservationDate);
  const endMs = new Date(endIso).getTime();
  const eodMs = new Date(eod).getTime();
  if (!Number.isFinite(endMs) || !Number.isFinite(eodMs)) return endIso;
  return endMs > eodMs ? eod : endIso;
};

const buildReservationSeatWindowsFromSession = (
  session: CustomerSession
): Array<{ date: string; startIso: string; endIso: string }> => {
  const startDate = String(session.reservation_date ?? "").trim();
  const endDate = String(session.reservation_end_date ?? "").trim() || startDate;
  if (!startDate || !endDate) return [];

  const days = rangeDatesInclusive(startDate, endDate);
  if (days.length === 0) return [];

  const { hours, minutes } = getClockFromIso(session.time_started);
  const openTime = String(session.hour_avail ?? "").trim().toUpperCase() === "OPEN";

  return days.map((day) => {
    const [y, m, d] = day.split("-").map(Number);
    const startIso = new Date(y, (m ?? 1) - 1, d ?? 1, hours, minutes, 0, 0).toISOString();

    if (openTime) {
      return { date: day, startIso, endIso: endOfLocalDayIso(day) };
    }

    const endIso = clampToReservationDay(
      addDurationToIso(startIso, String(session.hour_avail ?? "00:00")),
      day
    );
    return { date: day, startIso, endIso };
  });
};

const getReservationEndDate = (s: CustomerSession): string | null => {
  const end = String(s.reservation_end_date ?? "").trim();
  if (end) return end;
  const start = String(s.reservation_date ?? "").trim();
  return start || null;
};

const isDateWithinReservationRange = (
  filterYmd: string,
  startYmd: string | null | undefined,
  endYmd: string | null | undefined
): boolean => {
  const start = String(startYmd ?? "").trim();
  const end = String(endYmd ?? "").trim() || start;
  const target = String(filterYmd ?? "").trim();
  if (!target || !start) return false;
  return target >= start && target <= end;
};

const formatReservationRange = (s: CustomerSession): string => {
  const start = String(s.reservation_date ?? "").trim();
  const end = String(s.reservation_end_date ?? "").trim();
  if (!start && !end) return "—";
  if (start && end && start !== end) {
    return `${formatDateDisplay(start)} → ${formatDateDisplay(end)}`;
  }
  return formatDateDisplay(start || end);
};

const fetchAsArrayBuffer = async (url: string): Promise<ArrayBuffer | null> => {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
};

const isLikelyUrl = (v: unknown): v is string =>
  typeof v === "string" && /^https?:\/\//i.test(v.trim());

const colToLetter = (col: number): string => {
  let n = col;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

const ReceiptModal: React.FC<{
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
    document.body.classList.add("acr-modal-open");

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.classList.remove("acr-modal-open");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="acr-modal-overlay" onClick={onClose}>
      <div
        className={`acr-modal-card acr-modal-${size}`}
        onClick={(e) => e.stopPropagation()}
      >
      {title ? (
        <div className="acr-modal-head">
          <h3>{title}</h3>
          <button className="acr-modal-close" onClick={onClose} type="button">
            ×
          </button>
        </div>
      ) : null}
      <div className="acr-modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
};

const Admin_customer_reservation: React.FC = () => {
  const [sessions, setSessions] = useState<CustomerSession[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedSession, setSelectedSession] = useState<CustomerSession | null>(null);
  const [selectedOrderSession, setSelectedOrderSession] = useState<CustomerSession | null>(null);

  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [nowTick, setNowTick] = useState<number>(Date.now());

  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>("start_date");
  const [filterDate, setFilterDate] = useState<string>(yyyyMmDdLocal(new Date()));
  const [searchText, setSearchText] = useState<string>("");

  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);
  const [deletingRange, setDeletingRange] = useState<boolean>(false);

  const [discountTarget, setDiscountTarget] = useState<CustomerSession | null>(null);
  const [discountKind, setDiscountKind] = useState<DiscountKind>("none");
  const [discountInput, setDiscountInput] = useState<string>("0");
  const [discountReason, setDiscountReason] = useState<string>("");
  const [savingDiscount, setSavingDiscount] = useState<boolean>(false);

  const [dpTarget, setDpTarget] = useState<CustomerSession | null>(null);
  const [dpInput, setDpInput] = useState<string>("0");
  const [savingDp, setSavingDp] = useState<boolean>(false);

  const [paymentTarget, setPaymentTarget] = useState<CustomerSession | null>(null);
  const [gcashInput, setGcashInput] = useState<string>("0");
  const [cashInput, setCashInput] = useState<string>("0");
  const [savingPayment, setSavingPayment] = useState<boolean>(false);

  const [orderPaymentTarget, setOrderPaymentTarget] = useState<CustomerSession | null>(null);
  const [orderGcashInput, setOrderGcashInput] = useState<string>("0");
  const [orderCashInput, setOrderCashInput] = useState<string>("0");
  const [savingOrderPayment, setSavingOrderPayment] = useState<boolean>(false);

  const [togglingPaidId, setTogglingPaidId] = useState<string | null>(null);

  const [cancelTarget, setCancelTarget] = useState<CustomerSession | null>(null);
  const [cancelReason, setCancelReason] = useState<string>("");
  const [cancellingBusy, setCancellingBusy] = useState<boolean>(false);

  const [sessionOrders, setSessionOrders] = useState<SessionOrdersMap>({});
  const [orderPayments, setOrderPayments] = useState<Record<string, CustomerOrderPayment>>({});

  const [selectedAttendanceSession, setSelectedAttendanceSession] =
    useState<CustomerSession | null>(null);

  const [attendanceState, setAttendanceState] = useState<AttendanceStateMap>({});
  const [attendanceLogsMap, setAttendanceLogsMap] = useState<Record<string, AttendanceLogRow[]>>({});

  useEffect(() => {
    void initLoad();
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 10000);
    return () => window.clearInterval(t);
  }, []);

  const getAttendanceOpenLog = (s: CustomerSession): AttendanceLogRow | null =>
    attendanceState[s.id]?.openLog ?? null;

  const isReservationCurrentlyIn = (s: CustomerSession): boolean =>
    getAttendanceOpenLog(s) !== null;

  const getAttendanceLogsForSession = (s: CustomerSession): AttendanceLogRow[] =>
    attendanceLogsMap[s.id] ?? [];

  const getAttendanceCountText = (s: CustomerSession): string => {
    const logs = getAttendanceLogsForSession(s);
    return `${logs.length} log${logs.length === 1 ? "" : "s"}`;
  };

  const initLoad = async (): Promise<void> => {
    setLoading(true);
    try {
      const loadedSessions = await fetchReservations();
      await fetchOrdersForSessions(loadedSessions);
      await fetchOrderPayments(loadedSessions);
      await fetchAttendanceStateForSessions(loadedSessions);
      await syncSessionPaidStates(loadedSessions);
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = (): void => {
    setDateFilterMode("start_date");
    setFilterDate("");
    setSearchText("");
  };

  const isPromoType = (t: string | null | undefined): boolean =>
    (t ?? "").trim().toLowerCase() === "promo";

  const safePhone = (v: string | null | undefined): string => {
    const s = String(v ?? "").trim();
    return s || "N/A";
  };

  const fetchReservations = async (): Promise<CustomerSession[]> => {
    const { data, error } = await supabase
      .from("customer_sessions")
      .select("*")
      .eq("reservation", "yes")
      .neq("customer_type", "promo")
      .order("reservation_date", { ascending: false });

    if (error) {
      console.error(error);
      alert(`Error loading reservations: ${error.message}`);
      setSessions([]);
      return [];
    }

    const cleaned = (((data ?? []) as CustomerSession[]) || []).filter(
      (s) => !isPromoType(s.customer_type)
    );
    setSessions(cleaned);
    return cleaned;
  };

  const fetchOrdersForSessions = async (rows: CustomerSession[]): Promise<void> => {
    const codes = Array.from(
      new Set(
        rows
          .map((s) => String(s.booking_code ?? "").trim().toUpperCase())
          .filter((x) => x.length > 0)
      )
    );

    if (codes.length === 0) {
      setSessionOrders({});
      return;
    }

    const [addonRes, consignmentRes] = await Promise.all([
      supabase
        .from("addon_orders")
        .select(`
          id,
          booking_code,
          full_name,
          seat_number,
          total_amount,
          addon_order_items (
            id,
            created_at,
            add_on_id,
            item_name,
            price,
            quantity,
            subtotal,
            add_ons (
              id,
              name,
              category,
              size,
              image_url
            )
          )
        `)
        .in("booking_code", codes),

      supabase
        .from("consignment_orders")
        .select(`
          id,
          booking_code,
          full_name,
          seat_number,
          total_amount,
          consignment_order_items (
            id,
            created_at,
            consignment_id,
            item_name,
            price,
            quantity,
            subtotal,
            consignment (
              id,
              item_name,
              category,
              size,
              image_url
            )
          )
        `)
        .in("booking_code", codes),
    ]);

    if (addonRes.error) console.error("addon_orders fetch error:", addonRes.error);
    if (consignmentRes.error) console.error("consignment_orders fetch error:", consignmentRes.error);

    const addonOrders: AddonOrderRow[] = ((addonRes.data ?? []) as RawAddonOrderRow[]).map(
      (raw) => ({
        id: toText(raw.id),
        booking_code: toText(raw.booking_code).trim().toUpperCase(),
        full_name: toText(raw.full_name),
        seat_number: toText(raw.seat_number),
        total_amount: toMoney(raw.total_amount),
        addon_order_items: Array.isArray(raw.addon_order_items)
          ? raw.addon_order_items.map(toAddonOrderItemRow)
          : [],
      })
    );

    const consignmentOrders: ConsignmentOrderRow[] = (
      (consignmentRes.data ?? []) as RawConsignmentOrderRow[]
    ).map((raw) => ({
      id: toText(raw.id),
      booking_code: toText(raw.booking_code).trim().toUpperCase(),
      full_name: toText(raw.full_name),
      seat_number: toText(raw.seat_number),
      total_amount: toMoney(raw.total_amount),
      consignment_order_items: Array.isArray(raw.consignment_order_items)
        ? raw.consignment_order_items.map(toConsignmentOrderItemRow)
        : [],
    }));

    const nextMap: SessionOrdersMap = {};

    for (const code of codes) {
      const aOrders = addonOrders.filter((o) => o.booking_code === code);
      const cOrders = consignmentOrders.filter((o) => o.booking_code === code);
      const items: OrderItemView[] = [];

      for (const o of aOrders) {
        for (const item of o.addon_order_items ?? []) {
          const qty = wholePeso(toMoney(item.quantity));
          const price = wholePeso(toMoney(item.price));
          const subtotal = wholePeso(toMoney(item.subtotal ?? qty * price));

          items.push({
            id: item.id,
            parent_order_id: o.id,
            source: "addon",
            source_item_id: item.add_on_id,
            name: String(item.item_name ?? item.add_ons?.name ?? "").trim() || "-",
            category: String(item.add_ons?.category ?? "").trim() || "Add-On",
            size: item.add_ons?.size ?? null,
            qty,
            price,
            subtotal,
            image_url: item.add_ons?.image_url ?? null,
            created_at: item.created_at ?? null,
          });
        }
      }

      for (const o of cOrders) {
        for (const item of o.consignment_order_items ?? []) {
          const qty = wholePeso(toMoney(item.quantity));
          const price = wholePeso(toMoney(item.price));
          const subtotal = wholePeso(toMoney(item.subtotal ?? qty * price));

          items.push({
            id: item.id,
            parent_order_id: o.id,
            source: "consignment",
            source_item_id: item.consignment_id,
            name: String(item.item_name ?? item.consignment?.item_name ?? "").trim() || "-",
            category: String(item.consignment?.category ?? "").trim() || "Consignment",
            size: item.consignment?.size ?? null,
            qty,
            price,
            subtotal,
            image_url: item.consignment?.image_url ?? null,
            created_at: item.created_at ?? null,
          });
        }
      }

      const totalAddon = aOrders.reduce(
        (sum, o) => sum + wholePeso(toMoney(o.total_amount)),
        0
      );
      const totalConsignment = cOrders.reduce(
        (sum, o) => sum + wholePeso(toMoney(o.total_amount)),
        0
      );

      nextMap[code] = {
        addonOrders: aOrders,
        consignmentOrders: cOrders,
        items,
        total: wholePeso(totalAddon + totalConsignment),
      };
    }

    setSessionOrders(nextMap);
  };

  const fetchOrderPayments = async (rows: CustomerSession[]): Promise<void> => {
    const codes = Array.from(
      new Set(
        rows
          .map((s) => String(s.booking_code ?? "").trim().toUpperCase())
          .filter(Boolean)
      )
    );

    if (codes.length === 0) {
      setOrderPayments({});
      return;
    }

    const { data, error } = await supabase
      .from("customer_order_payments")
      .select("*")
      .in("booking_code", codes);

    if (error) {
      console.error("customer_order_payments fetch error:", error);
      setOrderPayments({});
      return;
    }

    const map: Record<string, CustomerOrderPayment> = {};
    for (const row of (data ?? []) as CustomerOrderPayment[]) {
      const code = String(row.booking_code ?? "").trim().toUpperCase();
      if (!code) continue;
      map[code] = row;
    }
    setOrderPayments(map);
  };

  const fetchAttendanceStateForSessions = async (
    rows: CustomerSession[]
  ): Promise<void> => {
    const sessionIds = Array.from(new Set(rows.map((s) => String(s.id)).filter(Boolean)));

    if (sessionIds.length === 0) {
      setAttendanceState({});
      setAttendanceLogsMap({});
      return;
    }

    const { data, error } = await supabase
      .from("customer_session_attendance")
      .select("*")
      .in("session_id", sessionIds)
      .order("in_at", { ascending: false });

    if (error) {
      console.error("customer_session_attendance fetch error:", error);
      setAttendanceState({});
      setAttendanceLogsMap({});
      return;
    }

    const logs = (data ?? []) as AttendanceLogRow[];
    const nextStateMap: AttendanceStateMap = {};
    const nextLogsMap: Record<string, AttendanceLogRow[]> = {};

    for (const s of rows) {
      const sessionLogs = logs.filter((log) => log.session_id === s.id);
      const openLog = sessionLogs.find((log) => !log.out_at) ?? null;
      nextStateMap[s.id] = { openLog };
      nextLogsMap[s.id] = sessionLogs;
    }

    setAttendanceState(nextStateMap);
    setAttendanceLogsMap(nextLogsMap);
  };

  const refreshAll = async (): Promise<void> => {
    try {
      setRefreshing(true);
      const loadedSessions = await fetchReservations();
      await Promise.all([
        fetchOrdersForSessions(loadedSessions),
        fetchOrderPayments(loadedSessions),
        fetchAttendanceStateForSessions(loadedSessions),
      ]);
      await syncSessionPaidStates(loadedSessions);
    } catch (e) {
      console.error(e);
      alert("Refresh failed.");
    } finally {
      setRefreshing(false);
    }
  };

  const filteredSessions = useMemo(() => {
    const q = searchText.trim().toLowerCase();

    return sessions
      .filter((s) => {
        if (filterDate) {
          if (dateFilterMode === "reserved_on") {
            const createdLocalDate = getLocalDateFromIso(s.created_at ?? "");
            if (createdLocalDate !== filterDate) return false;
          } else {
            const startDate = String(s.reservation_date ?? "").trim();
            const endDate = getReservationEndDate(s);
            if (!isDateWithinReservationRange(filterDate, startDate, endDate)) {
              return false;
            }
          }
        }

        if (!q) return true;
        return String(s.full_name ?? "").toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const aTime = new Date(a.time_started).getTime();
        const bTime = new Date(b.time_started).getTime();
        const aValid = Number.isFinite(aTime);
        const bValid = Number.isFinite(bTime);
        if (!aValid && !bValid) return 0;
        if (!aValid) return 1;
        if (!bValid) return -1;
        return aTime - bTime;
      });
  }, [sessions, filterDate, dateFilterMode, searchText]);

  const getDownPayment = (s: CustomerSession): number =>
    wholePeso(Math.max(0, toMoney(s.down_payment ?? 0)));

  const isOpenTimeSession = (s: CustomerSession): boolean => {
    if ((s.hour_avail || "").toUpperCase() === "OPEN") return true;
    const end = new Date(s.time_ended);
    return end.getFullYear() >= 2999;
  };

  const diffMinutes = (startIso: string, endIso: string): number => {
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
    return Math.floor((end - start) / (1000 * 60));
  };

  const formatMinutesToTime = (minutes: number): string => {
    if (!Number.isFinite(minutes) || minutes <= 0) return "0 min";
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hrs === 0) return `${mins} min`;
    if (mins === 0) return `${hrs} hour${hrs > 1 ? "s" : ""}`;
    return `${hrs} hr ${mins} min`;
  };

  const computeHours = (startIso: string, endIso: string): number => {
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
    const hours = (end - start) / (1000 * 60 * 60);
    return Number(hours.toFixed(2));
  };

  const computeCostWithFreeMinutes = (startIso: string, endIso: string): number => {
    const minutesUsed = diffMinutes(startIso, endIso);
    const chargeMinutes = Math.max(0, minutesUsed - FREE_MINUTES);
    const perMinute = HOURLY_RATE / 60;
    return wholePeso(chargeMinutes * perMinute);
  };

  const getScheduledStartDateTime = (s: CustomerSession): Date => {
    const start = new Date(s.time_started);
    if (s.reservation_date) {
      const d = new Date(s.reservation_date);
      start.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
    }
    return start;
  };

  const getStatus = (session: CustomerSession): string =>
    isReservationCurrentlyIn(session) ? "IN" : "OUT";

  const canShowStopButton = (session: CustomerSession): boolean => {
    if (!isOpenTimeSession(session)) return false;
    const startMs = getScheduledStartDateTime(session).getTime();
    if (!Number.isFinite(startMs)) return false;
    return nowTick >= startMs;
  };

  const getDisplayedTotalMinutes = (s: CustomerSession): number => {
    if (isOpenTimeSession(s)) {
      return diffMinutes(s.time_started, new Date(nowTick).toISOString());
    }
    return wholePeso(toMoney(s.total_time));
  };

  const getBaseSystemCost = (s: CustomerSession): number => {
    if (isOpenTimeSession(s)) {
      return computeCostWithFreeMinutes(s.time_started, new Date(nowTick).toISOString());
    }
    return wholePeso(toMoney(s.total_amount));
  };

  const getDiscountInfo = (
    s: CustomerSession
  ): { kind: DiscountKind; value: number; reason: string } => {
    const kind = (s.discount_kind ?? "none") as DiscountKind;
    const value = toMoney(s.discount_value ?? 0);
    const reason = String(s.discount_reason ?? "").trim();
    return { kind, value, reason };
  };

  const getDiscountText = (s: CustomerSession): string => {
    const di = getDiscountInfo(s);
    return getDiscountTextFrom(di.kind, di.value);
  };

  const getSessionSystemCost = (s: CustomerSession): number => {
    const base = getBaseSystemCost(s);
    const di = getDiscountInfo(s);
    return wholePeso(applyDiscount(base, di.kind, di.value).discountedCost);
  };

  const getOrderBundle = (s: CustomerSession) => {
    const code = String(s.booking_code ?? "").trim().toUpperCase();
    return (
      sessionOrders[code] ?? {
        addonOrders: [],
        consignmentOrders: [],
        items: [],
        total: 0,
      }
    );
  };

  const getOrdersTotal = (s: CustomerSession): number => wholePeso(getOrderBundle(s).total);

  const hasOrders = (s: CustomerSession): boolean => getOrdersTotal(s) > 0;

  const getSystemPaymentInfo = (
    s: CustomerSession
  ): { gcash: number; cash: number; totalPaid: number } => {
    const gcash = wholePeso(Math.max(0, toMoney(s.gcash_amount ?? 0)));
    const cash = wholePeso(Math.max(0, toMoney(s.cash_amount ?? 0)));
    const totalPaid = wholePeso(gcash + cash);
    return { gcash, cash, totalPaid };
  };

  const getOrderPaymentRow = (s: CustomerSession): CustomerOrderPayment | null => {
    const code = String(s.booking_code ?? "").trim().toUpperCase();
    if (!code) return null;
    return orderPayments[code] ?? null;
  };

  const getOrderPaymentInfo = (
    s: CustomerSession
  ): { gcash: number; cash: number; totalPaid: number; isPaid: boolean } => {
    const row = getOrderPaymentRow(s);
    const gcash = wholePeso(Math.max(0, toMoney(row?.gcash_amount ?? 0)));
    const cash = wholePeso(Math.max(0, toMoney(row?.cash_amount ?? 0)));
    const totalPaid = wholePeso(gcash + cash);
    const isPaid = toBool(row?.is_paid ?? false);
    return { gcash, cash, totalPaid, isPaid };
  };

  const getSystemDue = (s: CustomerSession): number => wholePeso(Math.max(0, getSessionSystemCost(s)));
  const getOrderDue = (s: CustomerSession): number => wholePeso(Math.max(0, getOrdersTotal(s)));
  const getGrandDue = (s: CustomerSession): number => wholePeso(getSystemDue(s) + getOrderDue(s));

  const getSystemRemaining = (s: CustomerSession): number => {
    const due = getSystemDue(s);
    const paid = getSystemPaymentInfo(s).totalPaid;
    return wholePeso(Math.max(0, due - paid));
  };

  const getOrderRemaining = (s: CustomerSession): number => {
    const due = getOrderDue(s);
    const paid = getOrderPaymentInfo(s).totalPaid;
    return wholePeso(Math.max(0, due - paid));
  };

  const getSessionBalanceAfterDP = (s: CustomerSession): number => {
    const grandDue = getGrandDue(s);
    const dp = getDownPayment(s);
    return wholePeso(Math.max(0, grandDue - dp));
  };

  const getSessionChangeAfterDP = (s: CustomerSession): number => {
    const grandDue = getGrandDue(s);
    const dp = getDownPayment(s);
    return wholePeso(Math.max(0, dp - grandDue));
  };

  const getDisplayAmount = (
    s: CustomerSession
  ): { label: "Total Balance" | "Total Change"; value: number } => {
    const bal = getSessionBalanceAfterDP(s);
    if (bal > 0) return { label: "Total Balance", value: bal };
    return { label: "Total Change", value: getSessionChangeAfterDP(s) };
  };

  const getSystemIsPaid = (s: CustomerSession): boolean => {
    const due = getSystemDue(s);
    const paid = getSystemPaymentInfo(s).totalPaid;
    return due <= 0 ? true : paid >= due;
  };

  const getOrderIsPaid = (s: CustomerSession): boolean => {
    const due = getOrderDue(s);
    if (due <= 0) return true;
    const paid = getOrderPaymentInfo(s).totalPaid;
    return paid >= due;
  };

const getFinalPaidStatus = (s: CustomerSession): boolean => {
  const systemPaid = getSystemIsPaid(s);
  const orderPaid = hasOrders(s) ? getOrderIsPaid(s) : true;
  return systemPaid && orderPaid;
};

const totals = useMemo(() => {
  const totalCustomer = filteredSessions.length;
  const paid = filteredSessions.filter((s) => getFinalPaidStatus(s)).length;
  const unpaid = totalCustomer - paid;

  const systemTotal = filteredSessions.reduce(
    (sum, s) => sum + getSessionSystemCost(s),
    0
  );

  const ordersTotal = filteredSessions.reduce(
    (sum, s) => sum + getOrdersTotal(s),
    0
  );

  return {
    totalCustomer,
    paid,
    unpaid,
    systemTotal,
    ordersTotal,
  };
}, [filteredSessions]);

  const syncSingleSessionPaidState = async (s: CustomerSession): Promise<void> => {
    const finalPaid = getFinalPaidStatus(s);
    if (toBool(s.is_paid) === finalPaid) return;

    const { data, error } = await supabase
      .from("customer_sessions")
      .update({
        is_paid: finalPaid,
        paid_at: finalPaid ? new Date().toISOString() : null,
      })
      .eq("id", s.id)
      .select("*")
      .single();

    if (!error && data) {
      const updated = data as CustomerSession;
      setSessions((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      setSelectedSession((prev) => (prev?.id === updated.id ? updated : prev));
      setSelectedOrderSession((prev) => (prev?.id === updated.id ? updated : prev));
    }
  };

  const syncSessionPaidStates = async (rows: CustomerSession[]): Promise<void> => {
    for (const s of rows) {
      try {
        await syncSingleSessionPaidState(s);
      } catch (e) {
        console.error("syncSingleSessionPaidState error:", e);
      }
    }
  };

  const renderTimeOut = (s: CustomerSession): string =>
    isOpenTimeSession(s) ? "OPEN" : formatTimeText(s.time_ended);

  const releaseSeatBlocksNow = async (
    session: CustomerSession,
    nowIso: string,
    mode: "stop" | "cancel" = "stop"
  ): Promise<void> => {
    const seats = splitSeats(session.seat_number);
    if (seats.length === 0) return;

    const windows = buildReservationSeatWindowsFromSession(session);
    if (windows.length === 0) return;

    const firstStart = windows[0].startIso;
    const lastEnd = windows[windows.length - 1].endIso;

    const { data, error } = await supabase
      .from("seat_blocked_times")
      .select("id, seat_number, start_at, end_at, source, note")
      .in("seat_number", seats)
      .eq("source", "reserved")
      .gte("start_at", firstStart)
      .lte("end_at", lastEnd);

    if (error) {
      console.warn("releaseSeatBlocksNow select:", error.message);
      return;
    }

    const rows = (data ?? []) as SeatBlockedRow[];

    const matchedRows = rows.filter((r) => {
      const seat = String(r.seat_number).trim();
      if (!seats.includes(seat)) return false;

      const rStart = new Date(r.start_at).getTime();
      const rEnd = new Date(r.end_at).getTime();
      if (!Number.isFinite(rStart) || !Number.isFinite(rEnd)) return false;

      return windows.some((w) => {
        const wStart = new Date(w.startIso).getTime();
        const wEnd = new Date(w.endIso).getTime();
        if (!Number.isFinite(wStart) || !Number.isFinite(wEnd)) return false;
        return rStart < wEnd && rEnd > wStart;
      });
    });

    if (matchedRows.length > 0) {
      const ids = matchedRows.map((r) => r.id);

      if (mode === "cancel") {
        const { error: delErr } = await supabase.from("seat_blocked_times").delete().in("id", ids);
        if (delErr) console.warn("releaseSeatBlocksNow delete:", delErr.message);
      } else {
        const { error: upErr } = await supabase
          .from("seat_blocked_times")
          .update({ end_at: nowIso, note: "stopped/cancelled" })
          .in("id", ids)
          .gt("end_at", nowIso);

        if (upErr) console.warn("releaseSeatBlocksNow update:", upErr.message);
      }
      return;
    }

    if (mode === "cancel") {
      const { error: fallbackDelErr } = await supabase
        .from("seat_blocked_times")
        .delete()
        .in("seat_number", seats)
        .eq("source", "reserved")
        .gte("start_at", firstStart)
        .lte("end_at", lastEnd);

      if (fallbackDelErr) console.warn("releaseSeatBlocksNow fallback delete:", fallbackDelErr.message);
    } else {
      const { error: fallbackUpErr } = await supabase
        .from("seat_blocked_times")
        .update({ end_at: nowIso, note: "stopped/cancelled (fallback)" })
        .in("seat_number", seats)
        .eq("source", "reserved")
        .gte("start_at", firstStart)
        .lte("end_at", lastEnd)
        .gt("end_at", nowIso);

      if (fallbackUpErr) console.warn("releaseSeatBlocksNow fallback update:", fallbackUpErr.message);
    }
  };

  const deleteSeatBlocksForSession = async (session: CustomerSession): Promise<void> => {
    const nowIso = new Date().toISOString();
    await releaseSeatBlocksNow(session, nowIso, "cancel");
  };

  const deleteSeatBlocksForList = async (list: CustomerSession[]): Promise<void> => {
    for (const s of list) await deleteSeatBlocksForSession(s);
  };

  const stopReservationTime = async (session: CustomerSession): Promise<void> => {
    if (!canShowStopButton(session)) {
      alert("Stop Time is only allowed when the reservation date/time has started.");
      return;
    }

    try {
      setStoppingId(session.id);

      const nowIso = new Date().toISOString();
      const totalHours = computeHours(session.time_started, nowIso);
      const totalCost = computeCostWithFreeMinutes(session.time_started, nowIso);

      const { data: updated, error } = await supabase
        .from("customer_sessions")
        .update({
          time_ended: nowIso,
          total_time: totalHours,
          total_amount: totalCost,
          hour_avail: "CLOSED",
        })
        .eq("id", session.id)
        .select("*")
        .single();

      if (error || !updated) {
        alert(`Stop Time error: ${error?.message ?? "Unknown error"}`);
        return;
      }

      await releaseSeatBlocksNow(session, nowIso);

      const updatedRow = updated as CustomerSession;
      setSessions((prev) => prev.map((s) => (s.id === session.id ? updatedRow : s)));
      setSelectedSession((prev) => (prev?.id === session.id ? updatedRow : prev));
      await syncSingleSessionPaidState(updatedRow);
    } catch (e) {
      console.error(e);
      alert("Stop Time failed.");
    } finally {
      setStoppingId(null);
    }
  };

  const deleteSession = async (session: CustomerSession): Promise<void> => {
    const ok = window.confirm(
      `Delete this reservation record?\n\n${session.full_name}\nPhone: ${safePhone(
        session.phone_number
      )}\nReservation Date: ${formatReservationRange(session)}`
    );
    if (!ok) return;

    try {
      setDeletingId(session.id);

      const bookingCode = String(session.booking_code ?? "").trim().toUpperCase();
      if (bookingCode) {
        await supabase.from("customer_order_payments").delete().eq("booking_code", bookingCode);
      }

      await deleteSeatBlocksForSession(session);

      const { error } = await supabase.from("customer_sessions").delete().eq("id", session.id);

      if (error) {
        alert(`Delete error: ${error.message}`);
        return;
      }

      setSessions((prev) => prev.filter((s) => s.id !== session.id));
      setSelectedSession((prev) => (prev?.id === session.id ? null : prev));
      setSelectedOrderSession((prev) => (prev?.id === session.id ? null : prev));

      if (bookingCode) {
        setSessionOrders((prev) => {
          const next = { ...prev };
          delete next[bookingCode];
          return next;
        });

        setOrderPayments((prev) => {
          const next = { ...prev };
          delete next[bookingCode];
          return next;
        });
      }
    } catch (e) {
      console.error(e);
      alert("Delete failed.");
    } finally {
      setDeletingId(null);
    }
  };

  const deleteByFilter = async (): Promise<void> => {
    if (filteredSessions.length === 0) {
      alert("No reservation records found for this filter.");
      return;
    }

    const label =
      dateFilterMode === "reserved_on"
        ? `Reserved On: ${filterDate || "All"}`
        : `Start Date coverage/range: ${filterDate || "All"}`;

    const ok = window.confirm(
      `Delete ALL filtered reservation records?\n\n${label}\n\nThis will delete ${filteredSessions.length} record(s) from the database.\n\n⚠️ This also deletes related seat_blocked_times and customer_order_payments.`
    );
    if (!ok) return;

    try {
      setDeletingRange(true);

      const codes = Array.from(
        new Set(
          filteredSessions
            .map((s) => String(s.booking_code ?? "").trim().toUpperCase())
            .filter(Boolean)
        )
      );

      const ids = filteredSessions.map((s) => s.id);

      if (codes.length > 0) {
        const { error: payErr } = await supabase
          .from("customer_order_payments")
          .delete()
          .in("booking_code", codes);

        if (payErr) console.warn("customer_order_payments delete warning:", payErr.message);
      }

      await deleteSeatBlocksForList(filteredSessions);

      const { error } = await supabase.from("customer_sessions").delete().in("id", ids);

      if (error) {
        alert(`Delete filter error: ${error.message}`);
        return;
      }

      setSessions((prev) => prev.filter((s) => !ids.includes(s.id)));
      setSelectedSession((prev) => (prev && ids.includes(prev.id) ? null : prev));
      setSelectedOrderSession((prev) => (prev && ids.includes(prev.id) ? null : prev));

      if (codes.length > 0) {
        setSessionOrders((prev) => {
          const next = { ...prev };
          codes.forEach((code) => delete next[code]);
          return next;
        });

        setOrderPayments((prev) => {
          const next = { ...prev };
          codes.forEach((code) => delete next[code]);
          return next;
        });
      }
    } catch (e) {
      console.error(e);
      alert("Delete filter failed.");
    } finally {
      setDeletingRange(false);
    }
  };

  const openDiscountModal = (s: CustomerSession): void => {
    const di = getDiscountInfo(s);
    setDiscountTarget(s);
    setDiscountKind(di.kind);
    setDiscountInput(String(Number.isFinite(di.value) ? di.value : 0));
    setDiscountReason(di.reason);
  };

  const saveDiscount = async (): Promise<void> => {
    if (!discountTarget) return;

    const raw = Number(discountInput);
    const clean = Number.isFinite(raw) ? Math.max(0, raw) : 0;
    const finalValue = discountKind === "percent" ? clamp(clean, 0, 100) : clean;

    try {
      setSavingDiscount(true);

      const { data: updated, error } = await supabase
        .from("customer_sessions")
        .update({
          discount_kind: discountKind,
          discount_value: finalValue,
          discount_reason: discountReason.trim(),
        })
        .eq("id", discountTarget.id)
        .select("*")
        .single();

      if (error || !updated) {
        alert(`Save discount error: ${error?.message ?? "Unknown error"}`);
        return;
      }

      const updatedRow = updated as CustomerSession;
      setSessions((prev) => prev.map((s) => (s.id === discountTarget.id ? updatedRow : s)));
      setSelectedSession((prev) => (prev?.id === discountTarget.id ? updatedRow : prev));
      setDiscountTarget(null);
      await syncSingleSessionPaidState(updatedRow);
    } catch (e) {
      console.error(e);
      alert("Save discount failed.");
    } finally {
      setSavingDiscount(false);
    }
  };

  const openDpModal = (s: CustomerSession): void => {
    setDpTarget(s);
    setDpInput(String(getDownPayment(s)));
  };

  const saveDownPayment = async (): Promise<void> => {
    if (!dpTarget) return;

    const raw = Number(dpInput);
    const dp = wholePeso(Math.max(0, Number.isFinite(raw) ? raw : 0));

    try {
      setSavingDp(true);

      const { data: updated, error } = await supabase
        .from("customer_sessions")
        .update({ down_payment: dp })
        .eq("id", dpTarget.id)
        .select("*")
        .single();

      if (error || !updated) {
        alert(`Save down payment error: ${error?.message ?? "Unknown error"}`);
        return;
      }

      const updatedRow = updated as CustomerSession;
      setSessions((prev) => prev.map((s) => (s.id === dpTarget.id ? updatedRow : s)));
      setSelectedSession((prev) => (prev?.id === dpTarget.id ? updatedRow : prev));
      setDpTarget(null);
      await syncSingleSessionPaidState(updatedRow);
    } catch (e) {
      console.error(e);
      alert("Save down payment failed.");
    } finally {
      setSavingDp(false);
    }
  };

  const openPaymentModal = (s: CustomerSession): void => {
    setPaymentTarget(s);
    const pay = getSystemPaymentInfo(s);
    setGcashInput(String(pay.gcash));
    setCashInput(String(pay.cash));
  };

  const saveSystemPayment = async (): Promise<void> => {
    if (!paymentTarget) return;

    const gcash = wholePeso(Math.max(0, Number(gcashInput) || 0));
    const cash = wholePeso(Math.max(0, Number(cashInput) || 0));

    try {
      setSavingPayment(true);

      const { data: updated, error } = await supabase
        .from("customer_sessions")
        .update({
          gcash_amount: gcash,
          cash_amount: cash,
        })
        .eq("id", paymentTarget.id)
        .select("*")
        .single();

      if (error || !updated) {
        alert(`Save payment error: ${error?.message ?? "Unknown error"}`);
        return;
      }

      const updatedRow = updated as CustomerSession;
      setSessions((prev) => prev.map((s) => (s.id === paymentTarget.id ? updatedRow : s)));
      setSelectedSession((prev) => (prev?.id === paymentTarget.id ? updatedRow : prev));
      setPaymentTarget(null);
      await syncSingleSessionPaidState(updatedRow);
    } catch (e) {
      console.error(e);
      alert("Save system payment failed.");
    } finally {
      setSavingPayment(false);
    }
  };

  const openOrderPaymentModal = (s: CustomerSession): void => {
    setOrderPaymentTarget(s);
    const pay = getOrderPaymentInfo(s);
    setOrderGcashInput(String(pay.gcash));
    setOrderCashInput(String(pay.cash));
  };

  const saveOrderPayment = async (): Promise<void> => {
    if (!orderPaymentTarget) return;

    const bookingCode = String(orderPaymentTarget.booking_code ?? "").trim().toUpperCase();
    if (!bookingCode) {
      alert("No booking code found.");
      return;
    }

    const gcash = wholePeso(Math.max(0, Number(orderGcashInput) || 0));
    const cash = wholePeso(Math.max(0, Number(orderCashInput) || 0));
    const total = wholePeso(gcash + cash);
    const due = getOrderDue(orderPaymentTarget);
    const isPaid = due <= 0 ? true : total >= due;

    try {
      setSavingOrderPayment(true);

      const existing = getOrderPaymentRow(orderPaymentTarget);

      if (existing?.id) {
        const { error: updPayErr } = await supabase
          .from("customer_order_payments")
          .update({
            gcash_amount: gcash,
            cash_amount: cash,
            order_total: due,
            is_paid: isPaid,
            paid_at: isPaid ? new Date().toISOString() : null,
          })
          .eq("id", existing.id);

        if (updPayErr) {
          alert(`Save order payment error: ${updPayErr.message}`);
          return;
        }
      } else {
        const { error: insPayErr } = await supabase
          .from("customer_order_payments")
          .insert([
            {
              booking_code: bookingCode,
              full_name: orderPaymentTarget.full_name,
              seat_number: orderPaymentTarget.seat_number,
              order_total: due,
              gcash_amount: gcash,
              cash_amount: cash,
              is_paid: isPaid,
              paid_at: isPaid ? new Date().toISOString() : null,
            },
          ]);

        if (insPayErr) {
          alert(`Create order payment error: ${insPayErr.message}`);
          return;
        }
      }

      await fetchOrderPayments([orderPaymentTarget]);

      // 🔥 SYNC ADD-ONS + CONSIGNMENT (FIX)
      const paidAt = isPaid ? new Date().toISOString() : null;

      // 👉 ADD-ONS
      await supabase
        .from("customer_session_add_ons")
        .update({
          is_paid: isPaid,
          paid_at: paidAt,
        })
        .eq("full_name", orderPaymentTarget.full_name)
        .eq("seat_number", orderPaymentTarget.seat_number)
        .eq("is_paid", false)

      // 👉 CONSIGNMENT
      await supabase
        .from("customer_session_consignment")
        .update({
          is_paid: isPaid,
          paid_at: paidAt,
        })
        .eq("full_name", orderPaymentTarget.full_name)
        .eq("seat_number", orderPaymentTarget.seat_number)
        .eq("voided", false);

      const { data: updatedSession, error: updErr } = await supabase
        .from("customer_sessions")
        .update({
          paid_at: getFinalPaidStatus(orderPaymentTarget) ? new Date().toISOString() : null,
        })
        .eq("id", orderPaymentTarget.id)
        .select("*")
        .single();

      if (updErr || !updatedSession) {
        alert(
          `Order payment saved, but session paid sync failed: ${
            updErr?.message ?? "Unknown error"
          }`
        );
        return;
      }

      const updatedRow = updatedSession as CustomerSession;
      setSessions((prev) => prev.map((s) => (s.id === updatedRow.id ? updatedRow : s)));
      setSelectedSession((prev) => (prev?.id === updatedRow.id ? updatedRow : prev));
      setSelectedOrderSession((prev) => (prev?.id === updatedRow.id ? updatedRow : prev));
      setOrderPaymentTarget(null);
      await refreshAll();
      await syncSingleSessionPaidState(updatedRow);
    } catch (e) {
      console.error(e);
      alert("Save order payment failed.");
    } finally {
      setSavingOrderPayment(false);
    }
  };

  const togglePaid = async (s: CustomerSession): Promise<void> => {
    try {
      setTogglingPaidId(s.id);

      const currentPaid = toBool(s.is_paid);
      const nextPaid = !currentPaid;

      const { data: updated, error } = await supabase
        .from("customer_sessions")
        .update({
          is_paid: nextPaid,
          paid_at: nextPaid ? new Date().toISOString() : null,
        })
        .eq("id", s.id)
        .select("*")
        .single();

      if (error || !updated) {
        alert(`Toggle paid error: ${error?.message ?? "Unknown error"}`);
        return;
      }

      const updatedRow = updated as CustomerSession;
      setSessions((prev) => prev.map((x) => (x.id === s.id ? updatedRow : x)));
      setSelectedSession((prev) => (prev?.id === s.id ? updatedRow : prev));
    } catch (e) {
      console.error(e);
      alert("Toggle paid failed.");
    } finally {
      setTogglingPaidId(null);
    }
  };

  const openCancelModal = (session: CustomerSession): void => {
    setCancelTarget(session);
    setCancelReason("");
  };

  const submitCancel = async (): Promise<void> => {
    if (!cancelTarget) return;

    const reason = cancelReason.trim();
    if (!reason) {
      alert("Please enter a cancellation reason.");
      return;
    }

    try {
      setCancellingBusy(true);

      const { data: freshRow, error: fetchErr } = await supabase
        .from("customer_sessions")
        .select("*")
        .eq("id", cancelTarget.id)
        .single();

      if (fetchErr || !freshRow) {
        alert(`Failed to load reservation: ${fetchErr?.message ?? "Not found"}`);
        return;
      }

      const bookingCode = String((freshRow as CustomerSession).booking_code ?? "")
        .trim()
        .toUpperCase();
      const nowIso = new Date().toISOString();

      const cancelPayload = {
        ...(freshRow as Record<string, unknown>),
        cancellation_reason: reason,
        cancelled_at: nowIso,
        original_session_id: (freshRow as CustomerSession).id,
      };

      const { error: insertErr } = await supabase
        .from("customer_sessions_cancelled")
        .insert([cancelPayload]);

      if (insertErr) {
        alert(`Failed to move reservation to cancelled table: ${insertErr.message}`);
        return;
      }

      await deleteSeatBlocksForSession(freshRow as CustomerSession);

      if (bookingCode) {
        const { error: payDeleteErr } = await supabase
          .from("customer_order_payments")
          .delete()
          .eq("booking_code", bookingCode);

        if (payDeleteErr) {
          console.warn("customer_order_payments delete warning:", payDeleteErr.message);
        }
      }

      const { error: deleteErr } = await supabase
        .from("customer_sessions")
        .delete()
        .eq("id", (freshRow as CustomerSession).id);

      if (deleteErr) {
        alert(
          `Reservation moved to cancelled table, but failed to delete original row: ${deleteErr.message}`
        );
        return;
      }

      setSessions((prev) => prev.filter((row) => row.id !== (freshRow as CustomerSession).id));
      setSelectedSession((prev) =>
        prev?.id === (freshRow as CustomerSession).id ? null : prev
      );
      setSelectedOrderSession((prev) =>
        prev?.id === (freshRow as CustomerSession).id ? null : prev
      );

      if (bookingCode) {
        setSessionOrders((prev) => {
          const next = { ...prev };
          delete next[bookingCode];
          return next;
        });

        setOrderPayments((prev) => {
          const next = { ...prev };
          delete next[bookingCode];
          return next;
        });
      }

      setCancelTarget(null);
      setCancelReason("");
      alert("Reservation cancelled successfully.");
    } catch (error) {
      console.error(error);
      alert("Failed to cancel reservation.");
    } finally {
      setCancellingBusy(false);
    }
  };

  const exportToExcel = async (): Promise<void> => {
    if (!filterDate) {
      alert("Please select a date.");
      return;
    }
    if (filteredSessions.length === 0) {
      alert("No records for this filter.");
      return;
    }

    try {
      setExporting(true);

      const wb = new ExcelJS.Workbook();
      wb.creator = "Admin";
      wb.created = new Date();

      const ws = wb.addWorksheet("Reservations", {
        views: [{ state: "frozen", ySplit: 2 }],
      });

      ws.columns = [
        { header: "Created", key: "created", width: 22 },
        { header: "Reservation Range", key: "resrange", width: 22 },
        { header: "Time In", key: "timein", width: 12 },
        { header: "Time Out", key: "timeout", width: 12 },
        { header: "Name", key: "name", width: 24 },
        { header: "Phone", key: "phone", width: 18 },
        { header: "Seat", key: "seat", width: 16 },
        { header: "Booking Code", key: "code", width: 16 },
        { header: "Orders", key: "orders", width: 16 },
        { header: "System Due", key: "systemdue", width: 14 },
        { header: "Order Due", key: "orderdue", width: 14 },
        { header: "Down Payment", key: "dp", width: 14 },
        { header: "Display", key: "display", width: 14 },
        { header: "Paid", key: "paid", width: 12 },
      ];

      ws.mergeCells("A1:N1");
      ws.getCell("A1").value = `Reservation Report • ${dateFilterMode === "reserved_on" ? "Reserved On" : "Start Date"} • ${filterDate}`;
      ws.getCell("A1").font = { bold: true, size: 14 };
      ws.getCell("A1").alignment = { horizontal: "center" };
      ws.getRow(1).height = 24;

      ws.getRow(2).values = [
        "Created",
        "Reservation Range",
        "Time In",
        "Time Out",
        "Name",
        "Phone",
        "Seat",
        "Booking Code",
        "Orders",
        "System Due",
        "Order Due",
        "Down Payment",
        "Display",
        "Paid",
      ];
      ws.getRow(2).font = { bold: true };

      let rowIndex = 3;

      for (const s of filteredSessions) {
        const orders = getOrderBundle(s);
        const display = getDisplayAmount(s);
        const row = ws.getRow(rowIndex);

        row.values = [
          formatDateTimeText(s.created_at),
          formatReservationRange(s),
          formatTimeText(s.time_started),
          renderTimeOut(s),
          s.full_name,
          safePhone(s.phone_number),
          s.seat_number,
          s.booking_code ?? "-",
          orders.items.length,
          getSystemDue(s),
          getOrderDue(s),
          getDownPayment(s),
          `${display.label}: ₱${display.value}`,
          getFinalPaidStatus(s) ? "PAID" : "UNPAID",
        ];

        for (let c = 1; c <= 14; c++) {
          row.getCell(c).border = {
            top: { style: "thin" },
            bottom: { style: "thin" },
            left: { style: "thin" },
            right: { style: "thin" },
          };
        }

        rowIndex += 1;
      }

      const amountCols = [10, 11, 12];
      for (let r = 3; r < rowIndex; r++) {
        amountCols.forEach((col) => {
          ws.getCell(`${colToLetter(col)}${r}`).numFmt = '"₱"#,##0';
        });
      }

      const fileName = `admin_customer_reservation_${filterDate}.xlsx`;
      const buffer = await wb.xlsx.writeBuffer();
      saveAs(
        new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        fileName
      );
    } catch (e) {
      console.error(e);
      alert("Export failed.");
    } finally {
      setExporting(false);
    }
  };

  const openAttendanceModal = (s: CustomerSession): void => {
    setSelectedAttendanceSession(s);
  };


  return (
    <div className="acr-page">
      <div className="acr-shell">
        <div className="acr-hero">
          <div className="acr-eyebrow">ADMIN PANEL</div>
          <h1 className="acr-title">Customer Reservations</h1>
          <p className="acr-subtitle">
            Premium reservation list with booking code, orders, receipt view,
            attendance, payments, cancel, export, and fixed centered modals.
          </p>

          <div className="acr-toolbar">
            <div className="acr-control">
              <label>Date Basis</label>
              <select
                value={dateFilterMode}
                onChange={(e) => setDateFilterMode(e.currentTarget.value as DateFilterMode)}
              >
                <option value="reserved_on">Reserved On</option>
                <option value="start_date">Start Date</option>
              </select>
            </div>

            <div className="acr-control">
              <label>Date</label>
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.currentTarget.value)}
              />
            </div>

            <div className="acr-control acr-control-search">
              <label>Search Full Name</label>
              <input
                type="text"
                placeholder="Search full name..."
                value={searchText}
                onChange={(e) => setSearchText(e.currentTarget.value)}
              />
            </div>

            <div className="acr-actions-top">
              <button className="acr-btn acr-btn-light" onClick={clearFilters} type="button">
                Clear
              </button>
              <button
                className="acr-btn acr-btn-dark"
                onClick={() => void refreshAll()}
                disabled={refreshing}
                type="button"
              >
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
              <button
                className="acr-btn acr-btn-light"
                onClick={() => void exportToExcel()}
                disabled={exporting || loading || filteredSessions.length === 0}
                type="button"
              >
                {exporting ? "Exporting..." : "Export Excel"}
              </button>
              <button
                className="acr-btn acr-btn-danger"
                onClick={() => void deleteByFilter()}
                disabled={deletingRange || filteredSessions.length === 0}
                type="button"
              >
                {deletingRange ? "Deleting..." : "Delete Filtered"}
              </button>
            </div>
          </div>
          </div>

          <div className="acr-bottom-stats">
            <div className="acr-stat-box">
              <span>Total Customer</span>
              <strong>{totals.totalCustomer}</strong>
            </div>

            <div className="acr-stat-box">
              <span>Paid</span>
              <strong>{totals.paid}</strong>
            </div>

            <div className="acr-stat-box">
              <span>Unpaid</span>
              <strong>{totals.unpaid}</strong>
            </div>

            <div className="acr-stat-box">
              <span>System Total</span>
              <strong>₱{totals.systemTotal.toLocaleString()}</strong>
            </div>

            <div className="acr-stat-box">
              <span>Orders Total</span>
              <strong>₱{totals.ordersTotal.toLocaleString()}</strong>
            </div>
          </div>

          <div className="acr-table-wrap">
          {loading ? (
            <div className="acr-empty">Loading reservations...</div>
          ) : filteredSessions.length === 0 ? (
            <div className="acr-empty">No reservation records found.</div>
          ) : (
            <div className="acr-table-scroll">
              <table className="acr-table">
                <thead>
                  <tr>
                    <th>Date / Time</th>
                    <th>Customer</th>
                    <th>Seat</th>
                    <th>Order</th>
                    <th>Total Amount</th>
                    <th>Payment</th>
                    <th>Paid</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredSessions.map((s) => {
                    const orders = getOrderBundle(s);
                    const displayAmount = getDisplayAmount(s);
                    const systemPay = getSystemPaymentInfo(s);
                    const orderPay = getOrderPaymentInfo(s);
                    const isPaid = getFinalPaidStatus(s);
                    const orderItems = orders.items.slice(0, 3);

                    return (
                      <tr key={s.id} className="acr-row-anim">
                        <td>
                          <div className="acr-date-cell">
                            <strong>{formatReservationRange(s)}</strong>
                            <span>
                              {formatTimeText(s.time_started)} - {renderTimeOut(s)}
                            </span>
                            <span>Reserved: {formatDateTimeText(s.created_at)}</span>
                          </div>
                        </td>

                        <td>
                          <div className="acr-customer-cell">
                            <div className="acr-name-main">{s.full_name}</div>
                            <div className="acr-name-sub">{safePhone(s.phone_number)}</div>

                            <div className="acr-meta-grid">
                              <div className="acr-name-meta">
                                <span className="acr-meta-label">Booking Code</span>
                                <span className="acr-meta-value">{s.booking_code || "—"}</span>
                              </div>

                              <div className="acr-name-meta">
                                <span className="acr-meta-label">Discount</span>
                                <span className="acr-meta-value">{getDiscountText(s)}</span>
                              </div>

                              {String(s.discount_reason ?? "").trim() ? (
                                <div className="acr-name-meta">
                                  <span className="acr-meta-label">Reason</span>
                                  <span className="acr-meta-value">{s.discount_reason}</span>
                                </div>
                              ) : null}

                              <div className="acr-name-meta">
                                <span className="acr-meta-label">Attendance</span>
                                <span className="acr-meta-value">{getAttendanceCountText(s)}</span>
                              </div>
                            </div>

                            <div className="acr-status-inline">Status: {getStatus(s)}</div>
                          </div>
                        </td>

                        <td>
                          <span className="acr-seat-pill">{s.seat_number || "—"}</span>
                        </td>

                        <td>
                          <div className="acr-orders-cell">
                            {orders.items.length === 0 ? (
                              <div className="acr-orders-empty">No orders</div>
                            ) : (
                              <>
                                <div className="acr-orders-list">
                                  {orderItems.map((item) => (
                                    <div className="acr-order-line" key={item.id}>
                                      <div className="acr-order-name">
                                        {item.name} × {item.qty}
                                      </div>
                                      <div className="acr-order-price">₱{item.subtotal}</div>
                                    </div>
                                  ))}
                                </div>

                                {orders.items.length > 3 ? (
                                  <div className="acr-order-more">
                                    +{orders.items.length - 3} more item(s)
                                  </div>
                                ) : null}

                                <button
                                  className="acr-mini-btn acr-orders-btn"
                                  onClick={() => setSelectedOrderSession(s)}
                                  type="button"
                                >
                                  View Order
                                </button>
                              </>
                            )}
                          </div>
                        </td>

                        <td>
                          <div className="acr-total-card">
                            <div className="acr-grand-amount">₱{displayAmount.value}</div>

                            <div className="acr-grand-breakdown">
                              <div className="acr-break-row">
                                <span>System Due</span>
                                <strong>₱{getSystemDue(s)}</strong>
                              </div>
                              <div className="acr-break-row">
                                <span>Order Due</span>
                                <strong>₱{getOrderDue(s)}</strong>
                              </div>
                              <div className="acr-break-row">
                                <span>Down Payment</span>
                                <strong>₱{getDownPayment(s)}</strong>
                              </div>
                              <div className="acr-break-row acr-break-row-highlight">
                                <span>{displayAmount.label}</span>
                                <strong>₱{displayAmount.value}</strong>
                              </div>
                            </div>
                          </div>
                        </td>

                        <td>
                          <div className="acr-payment-card">
                            <div className="acr-payment-section">
                              <div className="acr-payment-title">System Payment</div>

                              <div className="acr-pay-box">
                                <div className="acr-pay-line">
                                  <span>GCash</span>
                                  <strong>₱{systemPay.gcash}</strong>
                                </div>
                                <div className="acr-pay-line">
                                  <span>Cash</span>
                                  <strong>₱{systemPay.cash}</strong>
                                </div>
                                <div className="acr-pay-line acr-pay-line-strong">
                                  <span>Remaining</span>
                                  <strong>₱{getSystemRemaining(s)}</strong>
                                </div>
                              </div>

                              <div className="acr-inline-actions">
                                <button
                                  className="acr-mini-btn acr-mini-btn-main"
                                  onClick={() => openPaymentModal(s)}
                                  type="button"
                                >
                                  Edit Payment
                                </button>
                                <button
                                  className="acr-mini-btn acr-mini-soft"
                                  onClick={() => openDpModal(s)}
                                  type="button"
                                >
                                  Down Payment
                                </button>
                              </div>
                            </div>

                            <div className="acr-payment-section acr-payment-section-order">
                              <div className="acr-payment-title">Order Payment</div>

                              <div className="acr-pay-box">
                                <div className="acr-pay-line">
                                  <span>GCash</span>
                                  <strong>₱{orderPay.gcash}</strong>
                                </div>
                                <div className="acr-pay-line">
                                  <span>Cash</span>
                                  <strong>₱{orderPay.cash}</strong>
                                </div>
                                <div className="acr-pay-line acr-pay-line-strong">
                                  <span>Remaining</span>
                                  <strong>₱{getOrderRemaining(s)}</strong>
                                </div>
                              </div>

                              <div className="acr-payment-stack acr-payment-stack-compact">
                                <button
                                  className="acr-mini-btn acr-mini-btn-main"
                                  onClick={() => openOrderPaymentModal(s)}
                                  type="button"
                                >
                                  Order Payment
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>

                        <td>
                          <div className="acr-paid-wrap">
                            <button
                              className={`acr-paid-pill ${isPaid ? "paid" : "unpaid"}`}
                              onClick={() => void togglePaid(s)}
                              disabled={togglingPaidId === s.id}
                              type="button"
                            >
                              {togglingPaidId === s.id ? "..." : isPaid ? "PAID" : "UNPAID"}
                            </button>
                          </div>
                        </td>

                        <td>
                          <div className="acr-action-stack acr-action-stack-premium">
                            <button
                              className={`acr-action-btn ${
                                selectedSession?.id === s.id ? "active-view" : ""
                              }`}
                              onClick={() => setSelectedSession(s)}
                              type="button"
                            >
                              View Receipt
                            </button>

                            <button
                              className="acr-action-btn"
                              onClick={() => openDiscountModal(s)}
                              type="button"
                            >
                              Discount
                            </button>

                            <button
                              className="acr-action-btn"
                              onClick={() => openAttendanceModal(s)}
                              type="button"
                            >
                              Attendance
                            </button>

                            {canShowStopButton(s) ? (
                              <button
                                className="acr-action-btn acr-action-gold"
                                onClick={() => void stopReservationTime(s)}
                                disabled={stoppingId === s.id}
                                type="button"
                              >
                                {stoppingId === s.id ? "Stopping..." : "Stop Time"}
                              </button>
                            ) : null}

                            <button
                              className="acr-action-btn acr-action-gold"
                              onClick={() => openCancelModal(s)}
                              type="button"
                            >
                              Cancel
                            </button>

                            <button
                              className="acr-action-btn acr-action-danger"
                              onClick={() => void deleteSession(s)}
                              disabled={deletingId === s.id}
                              type="button"
                            >
                              {deletingId === s.id ? "Deleting..." : "Delete"}
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

        <ReceiptModal
          open={!!selectedSession}
          title="Receipt"
          size="md"
          onClose={() => setSelectedSession(null)}
        >
          {selectedOrderSession ? (
            <div className="acr-order-modal-wrap">
              <div className="acr-order-modal-top">
                <img src={logo} alt="logo" className="acr-logo" />
                <div>
                  <h4>{selectedOrderSession.full_name}</h4>
                  <p>Booking Code: {selectedOrderSession.booking_code || "—"}</p>
                </div>
              </div>

              {getOrderBundle(selectedOrderSession).items.length === 0 ? (
                <div className="acr-empty acr-empty-tight">No order items.</div>
              ) : (
                <div className="acr-order-list">
                  {getOrderBundle(selectedOrderSession).items.map((item) => (
                    <div className="acr-order-card" key={item.id}>
                      <div className="acr-order-card-main">
                        {item.image_url && isLikelyUrl(item.image_url) ? (
                          <img
                            src={item.image_url}
                            alt={item.name}
                            className="acr-order-thumb"
                          />
                        ) : (
                          <div className="acr-order-thumb acr-order-thumb-empty">No Image</div>
                        )}

                        <div className="acr-order-card-text">
                          <strong>{item.name}</strong>
                          <span>{item.category}</span>
                          <span>Size: {item.size || "—"}</span>
                          <span>Qty: {item.qty}</span>
                        </div>
                      </div>

                      <div className="acr-order-card-price">
                        <div>₱{item.price}</div>
                        <strong>₱{item.subtotal}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="acr-order-total-line">
                Total Order Due: <strong>₱{getOrderDue(selectedOrderSession)}</strong>
              </div>
            </div>
          ) : null}
        </ReceiptModal>

        <ReceiptModal
          open={!!discountTarget}
          title="Discount"
          size="sm"
          onClose={() => setDiscountTarget(null)}
        >
          <div className="acr-form-stack">
            <div className="acr-form-field">
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

            <div className="acr-form-field">
              <label>Discount Value</label>
              <input
                type="number"
                value={discountInput}
                onChange={(e) => setDiscountInput(e.currentTarget.value)}
              />
            </div>

            <div className="acr-form-field">
              <label>Reason</label>
              <textarea
                rows={4}
                value={discountReason}
                onChange={(e) => setDiscountReason(e.currentTarget.value)}
              />
            </div>

            <div className="acr-modal-actions">
              <button className="acr-btn acr-btn-light" onClick={() => setDiscountTarget(null)} type="button">
                Close
              </button>
              <button
                className="acr-btn acr-btn-dark"
                onClick={() => void saveDiscount()}
                disabled={savingDiscount}
                type="button"
              >
                {savingDiscount ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </ReceiptModal>

        <ReceiptModal
          open={!!dpTarget}
          title="Down Payment"
          size="sm"
          onClose={() => setDpTarget(null)}
        >
          <div className="acr-form-stack">
            <div className="acr-form-field">
              <label>Down Payment</label>
              <input
                type="number"
                value={dpInput}
                onChange={(e) => setDpInput(e.currentTarget.value)}
              />
            </div>

            <div className="acr-modal-actions">
              <button className="acr-btn acr-btn-light" onClick={() => setDpTarget(null)} type="button">
                Close
              </button>
              <button
                className="acr-btn acr-btn-dark"
                onClick={() => void saveDownPayment()}
                disabled={savingDp}
                type="button"
              >
                {savingDp ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </ReceiptModal>

        <ReceiptModal
          open={!!paymentTarget}
          title="System Payment"
          size="sm"
          onClose={() => setPaymentTarget(null)}
        >
          <div className="acr-form-stack">
            <div className="acr-form-field">
              <label>GCash</label>
              <input
                type="number"
                value={gcashInput}
                onChange={(e) => setGcashInput(e.currentTarget.value)}
              />
            </div>

            <div className="acr-form-field">
              <label>Cash</label>
              <input
                type="number"
                value={cashInput}
                onChange={(e) => setCashInput(e.currentTarget.value)}
              />
            </div>

            <div className="acr-modal-actions">
              <button className="acr-btn acr-btn-light" onClick={() => setPaymentTarget(null)} type="button">
                Close
              </button>
              <button
                className="acr-btn acr-btn-dark"
                onClick={() => void saveSystemPayment()}
                disabled={savingPayment}
                type="button"
              >
                {savingPayment ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </ReceiptModal>

        <ReceiptModal
          open={!!orderPaymentTarget}
          title="Order Payment"
          size="sm"
          onClose={() => setOrderPaymentTarget(null)}
        >
          <div className="acr-form-stack">
            <div className="acr-form-field">
              <label>GCash</label>
              <input
                type="number"
                value={orderGcashInput}
                onChange={(e) => setOrderGcashInput(e.currentTarget.value)}
              />
            </div>

            <div className="acr-form-field">
              <label>Cash</label>
              <input
                type="number"
                value={orderCashInput}
                onChange={(e) => setOrderCashInput(e.currentTarget.value)}
              />
            </div>

            <div className="acr-modal-actions">
              <button className="acr-btn acr-btn-light" onClick={() => setOrderPaymentTarget(null)} type="button">
                Close
              </button>
              <button
                className="acr-btn acr-btn-dark"
                onClick={() => void saveOrderPayment()}
                disabled={savingOrderPayment}
                type="button"
              >
                {savingOrderPayment ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </ReceiptModal>

        <ReceiptModal
          open={!!cancelTarget}
          title="Cancel Reservation"
          size="sm"
          onClose={() => setCancelTarget(null)}
        >
          <div className="acr-form-stack">
            <div className="acr-form-field">
              <label>Cancellation Reason</label>
              <textarea
                rows={4}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.currentTarget.value)}
                placeholder="Enter cancellation reason..."
              />
            </div>

            <div className="acr-modal-actions">
              <button className="acr-btn acr-btn-light" onClick={() => setCancelTarget(null)} type="button">
                Close
              </button>
              <button
                className="acr-btn acr-btn-danger"
                onClick={() => void submitCancel()}
                disabled={cancellingBusy}
                type="button"
              >
                {cancellingBusy ? "Cancelling..." : "Cancel Reservation"}
              </button>
            </div>
          </div>
        </ReceiptModal>

        <ReceiptModal
          open={!!selectedAttendanceSession}
          title="Attendance Logs"
          size="md"
          onClose={() => setSelectedAttendanceSession(null)}
        >
          {selectedAttendanceSession ? (
            <div className="acr-attendance-wrap">
              <div className="acr-attendance-head">
                <strong>{selectedAttendanceSession.full_name}</strong>
                <span>{getAttendanceCountText(selectedAttendanceSession)}</span>
              </div>

              {getAttendanceLogsForSession(selectedAttendanceSession).length === 0 ? (
                <div className="acr-empty acr-empty-tight">No attendance logs.</div>
              ) : (
                <div className="acr-attendance-list">
                  {getAttendanceLogsForSession(selectedAttendanceSession).map((log) => (
                    <div className="acr-attendance-card" key={log.id}>
                      <div>
                        <strong>{log.attendance_date}</strong>
                        <span>IN: {formatDateTimeText(log.in_at)}</span>
                        <span>OUT: {formatDateTimeText(log.out_at)}</span>
                      </div>
                      <div>
                        <strong>{log.out_at ? "CLOSED" : "OPEN"}</strong>
                        <span>{log.note || "—"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </ReceiptModal>

        <ReceiptModal
          open={!!selectedSession}
          title=""
          size="md"
          onClose={() => setSelectedSession(null)}
        >
          {selectedSession ? (
            (() => {
              const di = getDiscountInfo(selectedSession);
              const systemCost = getSessionSystemCost(selectedSession);
              const systemPay = getSystemPaymentInfo(selectedSession);
              const orderPay = getOrderPaymentInfo(selectedSession);
              const orders = getOrderBundle(selectedSession).items;
              const ordersTotal = getOrdersTotal(selectedSession);
              const totalPaid = wholePeso(systemPay.totalPaid + orderPay.totalPaid);
              const totalDue = getGrandDue(selectedSession);
              const totalChange = wholePeso(Math.max(0, totalPaid - totalDue));
              const paidAtText = selectedSession.paid_at
                ? formatDateTimeText(selectedSession.paid_at)
                : "—";

              const bottomLabel = totalDue > totalPaid ? "BALANCE" : "TOTAL";
              const bottomValue = totalDue > totalPaid
                ? wholePeso(Math.max(0, totalDue - totalPaid))
                : totalDue;

              return (
                <div className="acr-plain-receipt">
                  <div className="acr-plain-receipt-head">
                    <img src={logo} alt="Logo" className="acr-plain-receipt-logo" />
                    <h2>ME TYME LOUNGE</h2>
                    <p>OFFICIAL RECEIPT</p>
                  </div>

                  <div className="acr-plain-divider" />

                  <div className="acr-plain-info">
                    <div className="acr-plain-row">
                      <span>Date</span>
                      <strong>{new Date().toLocaleString()}</strong>
                    </div>

                    <div className="acr-plain-row">
                      <span>Customer</span>
                      <strong>{selectedSession.full_name || "N/A"}</strong>
                    </div>

                    <div className="acr-plain-row">
                      <span>Seat</span>
                      <strong>{selectedSession.seat_number || "N/A"}</strong>
                    </div>

                    <div className="acr-plain-row">
                      <span>Reservation</span>
                      <strong>{formatReservationRange(selectedSession)}</strong>
                    </div>

                    {selectedSession.booking_code && (
                      <div className="acr-plain-row">
                        <span>Booking Code</span>
                        <strong>{selectedSession.booking_code}</strong>
                      </div>
                    )}
                  </div>

                  <div className="acr-plain-divider" />

                  <div className="acr-plain-items">
                    {orders.length > 0 ? (
                      orders.map((item) => (
                        <div className="acr-plain-item-card" key={item.id}>
                          <div className="acr-plain-item-left">
                            <div className="acr-plain-item-name">
                              {item.name}
                              {item.size ? ` (${item.size})` : ""}
                            </div>
                            <div className="acr-plain-item-sub">
                              {item.qty} × ₱{item.price}
                            </div>
                          </div>
                          <div className="acr-plain-item-total">₱{item.subtotal}</div>
                        </div>
                      ))
                    ) : (
                      <div className="acr-plain-item-card">
                        <div className="acr-plain-item-left">
                          <div className="acr-plain-item-name">Reservation Session</div>
                          <div className="acr-plain-item-sub">
                            {String(selectedSession.hour_avail || "N/A").toUpperCase() === "OPEN"
                              ? "Open time reservation"
                              : `Reserved Duration: ${selectedSession.hour_avail || "N/A"}`}
                          </div>
                        </div>
                        <div className="acr-plain-item-total">₱{systemCost}</div>
                      </div>
                    )}
                  </div>

                  <div className="acr-plain-divider" />

                  <div className="acr-plain-summary">
                    <div className="acr-plain-row">
                      <span>System Cost</span>
                      <strong>₱{systemCost}</strong>
                    </div>

                    <div className="acr-plain-row">
                      <span>Discount</span>
                      <strong>{getDiscountTextFrom(di.kind, di.value)}</strong>
                    </div>

                    <div className="acr-plain-row">
                      <span>Orders Total</span>
                      <strong>₱{ordersTotal}</strong>
                    </div>

                    <div className="acr-plain-row">
                      <span>Down Payment</span>
                      <strong>₱{getDownPayment(selectedSession)}</strong>
                    </div>

                    <div className="acr-plain-row">
                      <span>GCash</span>
                      <strong>₱{systemPay.gcash + orderPay.gcash}</strong>
                    </div>

                    <div className="acr-plain-row">
                      <span>Cash</span>
                      <strong>₱{systemPay.cash + orderPay.cash}</strong>
                    </div>

                    <div className="acr-plain-row">
                      <span>Total Paid</span>
                      <strong>₱{totalPaid}</strong>
                    </div>

                    <div className="acr-plain-row">
                      <span>Change</span>
                      <strong>₱{totalChange}</strong>
                    </div>

                    <div className="acr-plain-row">
                      <span>Status</span>
                      <strong className={getFinalPaidStatus(selectedSession) ? "acr-paid-green" : "acr-paid-gold"}>
                        {getFinalPaidStatus(selectedSession) ? "PAID" : "UNPAID"}
                      </strong>
                    </div>

                    <div className="acr-plain-row">
                      <span>Paid at</span>
                      <strong>{paidAtText}</strong>
                    </div>
                  </div>

                  <div className="acr-plain-total-box">
                    <span>{bottomLabel}</span>
                    <strong>₱{bottomValue}</strong>
                  </div>

                  <p className="acr-plain-thankyou">
                    Thank you for choosing
                    <br />
                    <strong>Me Tyme Lounge</strong>
                  </p>

                  <div className="acr-plain-close-full">
                    <button
                      className="acr-plain-close-btn-full"
                      onClick={() => setSelectedSession(null)}
                      type="button"
                    >
                      Close
                    </button>
                  </div>
                </div>
              );
            })()
          ) : null}
        </ReceiptModal>
      </div>
    </div>
  );
};

export default Admin_customer_reservation;