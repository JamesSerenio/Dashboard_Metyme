import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../utils/supabaseClient";
import logo from "../assets/study_hub.png";
import "../styles/Customer_Reservations.css";

const HOURLY_RATE = 20;
const FREE_MINUTES = 0;
const VIEW_ROW_ID = 1;

type CustomerViewRow = {
  id: number;
  session_id: string | null;
  enabled: boolean;
  updated_at: string | null;
};

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
  total_time: number;
  total_amount: number;
  reservation: string;
  reservation_date: string | null;
  reservation_end_date?: string | null;
  id_number?: string | null;
  seat_number: string;
  promo_booking_id?: string | null;
  booking_code?: string | null;
  discount_kind?: DiscountKind;
  discount_value?: number | string;
  discount_reason?: string | null;
  gcash_amount?: number | string;
  cash_amount?: number | string;
  is_paid?: boolean | number | string | null;
  paid_at?: string | null;
  down_payment?: number | string | null;
  expected_end_at?: string | null;
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

type CancelOrderTarget = {
  session: CustomerSession;
  item: OrderItemView;
};

type SeatBlockedRow = {
  id: string;
  seat_number: string;
  start_at: string;
  end_at: string;
  source: string;
  note: string | null;
};

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

const formatDateDisplay = (dateStr: string | null | undefined): string => {
  if (!dateStr) return "—";
  const d = new Date(`${dateStr}T00:00:00`);
  if (!Number.isFinite(d.getTime())) return String(dateStr);
  return d.toLocaleDateString("en-GB");
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

const formatTimeText = (iso: string): string => {
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return "";
  return dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const formatDateText = (value?: string | null): string => {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return value;
  return d.toLocaleDateString([], { year: "numeric", month: "short", day: "2-digit" });
};

const formatDateTimeText = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("en-PH");
};

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

const toMoney = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const wholePeso = (n: number): number => Math.ceil(Math.max(0, Number.isFinite(n) ? n : 0));

const toBool = (v: unknown): boolean => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes" || s === "paid";
  }
  return false;
};

const toText = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
};

const normalizeSingleRelation = <T,>(value: T | T[] | null | undefined): T | null => {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
};

const toAddonCatalogMini = (raw: RawAddonCatalogMini | null | undefined): AddonCatalogMini | null => {
  if (!raw) return null;
  return {
    id: toText(raw.id),
    name: toText(raw.name),
    category: toText(raw.category) || null,
    size: toText(raw.size) || null,
    image_url: toText(raw.image_url) || null,
  };
};

const toConsignmentCatalogMini = (raw: RawConsignmentCatalogMini | null | undefined): ConsignmentCatalogMini | null => {
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

const toConsignmentOrderItemRow = (raw: RawConsignmentOrderItemRow): ConsignmentOrderItemRow => {
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

const setCustomerViewState = async (enabled: boolean, sessionId: string | null): Promise<void> => {
  const payload: CustomerViewRow = {
    id: VIEW_ROW_ID,
    enabled,
    session_id: enabled ? sessionId : null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("customer_view_state")
    .upsert(payload, { onConflict: "id" });

  if (error) throw error;
};

const isCustomerViewOnForSession = (active: CustomerViewRow | null, sessionId: string): boolean => {
  if (!active) return false;
  if (!active.enabled) return false;
  return String(active.session_id ?? "") === String(sessionId);
};

const splitSeats = (seatStr: string): string[] => {
  return String(seatStr ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.toUpperCase() !== "N/A");
};

const getLocalDateFromIso = (iso: string | null | undefined): string => {
  const d = new Date(String(iso ?? ""));
  if (!Number.isFinite(d.getTime())) return "";
  return yyyyMmDdLocal(d);
};

type FixedCenterModalProps = {
  open: boolean;
  title: string;
  size?: "sm" | "md" | "lg" | "xl";
  onClose: () => void;
  children: React.ReactNode;
};

const FixedCenterModal: React.FC<FixedCenterModalProps> = ({
  open,
  title,
  size = "md",
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
    <div className="crv-fm-overlay" onClick={onClose}>
      <div
        className={`crv-fm-card crv-fm-${size}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="crv-fm-body">{children}</div>
      </div>
    </div>,
    document.body
  );
};

const Customer_Reservations: React.FC = () => {
  const [sessions, setSessions] = useState<CustomerSession[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [selectedSession, setSelectedSession] = useState<CustomerSession | null>(null);
  const [selectedOrderSession, setSelectedOrderSession] = useState<CustomerSession | null>(null);
  const [selectedAttendanceSession, setSelectedAttendanceSession] = useState<CustomerSession | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);

  const [activeView, setActiveView] = useState<CustomerViewRow | null>(null);
  const [viewBusy, setViewBusy] = useState<boolean>(false);

  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>("start_date");
  const [filterDate, setFilterDate] = useState<string>(yyyyMmDdLocal(new Date()));
  const [searchName, setSearchName] = useState<string>("");

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

  const [refreshing, setRefreshing] = useState<boolean>(false);

  const [cancelTarget, setCancelTarget] = useState<CustomerSession | null>(null);
  const [cancelReason, setCancelReason] = useState<string>("");
  const [cancellingBusy, setCancellingBusy] = useState<boolean>(false);

  const [orderCancelTarget, setOrderCancelTarget] = useState<CancelOrderTarget | null>(null);
  const [orderCancelNote, setOrderCancelNote] = useState<string>("");
  const [cancellingOrderItemId, setCancellingOrderItemId] = useState<string | null>(null);

  const [sessionOrders, setSessionOrders] = useState<SessionOrdersMap>({});
  const [orderPayments, setOrderPayments] = useState<Record<string, CustomerOrderPayment>>({});
  const [attendanceState, setAttendanceState] = useState<AttendanceStateMap>({});
  const [attendanceLogsMap, setAttendanceLogsMap] = useState<Record<string, AttendanceLogRow[]>>({});

  const getAttendanceOpenLog = (s: CustomerSession): AttendanceLogRow | null => {
    return attendanceState[s.id]?.openLog ?? null;
  };

  const getReservationLiveMinutesFromAttendance = (s: CustomerSession): number => {
    const openLog = getAttendanceOpenLog(s);
    if (!openLog) return 0;
    const start = new Date(openLog.in_at).getTime();
    const now = Date.now();
    if (!Number.isFinite(start) || now <= start) return 0;
    return Math.floor((now - start) / (1000 * 60));
  };

  const getClosedMinutesFromSession = (s: CustomerSession): number =>
    Math.max(0, Math.floor(toMoney(s.total_time) * 60));

  const getReservationTotalUsedMinutes = (s: CustomerSession): number => {
    return getClosedMinutesFromSession(s) + getReservationLiveMinutesFromAttendance(s);
  };

  const getReservationLiveCostFromAttendance = (s: CustomerSession): number => {
    const liveMinutes = getReservationLiveMinutesFromAttendance(s);
    const chargeMinutes = Math.max(0, liveMinutes - FREE_MINUTES);
    const perMinute = HOURLY_RATE / 60;
    return wholePeso(chargeMinutes * perMinute);
  };

  const getReservationAccumulatedCost = (s: CustomerSession): number =>
    wholePeso(Math.max(0, toMoney(s.total_amount)));

  const isReservationCurrentlyIn = (s: CustomerSession): boolean => getAttendanceOpenLog(s) !== null;

  useEffect(() => {
    void initLoad();
    void readActiveCustomerView();
    const unsub = subscribeCustomerViewRealtime();
    return () => {
      try {
        if (typeof unsub === "function") unsub();
      } catch {
        //
      }
    };
  }, []);

  useEffect(() => {
    const hasOpenAttendance = sessions.some(
      (s) => String(s.reservation).toLowerCase() === "yes" && isReservationCurrentlyIn(s)
    );
    if (!hasOpenAttendance) return;

    const timer = window.setInterval(() => {
      setSessions((prev) => [...prev]);
    }, 30000);

    return () => window.clearInterval(timer);
  }, [sessions, attendanceState]);

  const initLoad = async (): Promise<void> => {
    setLoading(true);
    try {
      const loadedSessions = await fetchReservationSessions();
      await fetchOrdersForSessions(loadedSessions);
      await fetchOrderPayments(loadedSessions);
      await fetchAttendanceStateForSessions(loadedSessions);
      await syncSessionPaidStates(loadedSessions);
    } finally {
      setLoading(false);
    }
  };

  const filteredSessions = useMemo(() => {
    const q = searchName.trim().toLowerCase();

    return sessions
      .filter((s) => {
        if (filterDate) {
          if (dateFilterMode === "reserved_on") {
            const createdLocalDate = getLocalDateFromIso(s.created_at ?? "");
            if (createdLocalDate !== filterDate) return false;
          } else {
            const startDate = String(s.reservation_date ?? "").trim();
            const endDate = getReservationEndDate(s);
            if (!isDateWithinReservationRange(filterDate, startDate, endDate)) return false;
          }
        }

        if (!q) return true;
        const name = String(s.full_name ?? "").toLowerCase();
        return name.includes(q);
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
  }, [sessions, filterDate, dateFilterMode, searchName]);

  const fetchReservationSessions = async (): Promise<CustomerSession[]> => {
    const { data, error } = await supabase
      .from("customer_sessions")
      .select("*")
      .eq("reservation", "yes")
      .order("reservation_date", { ascending: false });

    if (error) {
      console.error(error);
      alert("Error loading reservations");
      setSessions([]);
      return [];
    }

    const rows = ((data ?? []) as CustomerSession[]) || [];
    setSessions(rows);
    return rows;
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
            add_ons ( id, name, category, size, image_url )
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
            consignment ( id, item_name, category, size, image_url )
          )
        `)
        .in("booking_code", codes),
    ]);

    if (addonRes.error) console.error("addon_orders fetch error:", addonRes.error);
    if (consignmentRes.error) console.error("consignment_orders fetch error:", consignmentRes.error);

    const addonOrders: AddonOrderRow[] = ((addonRes.data ?? []) as RawAddonOrderRow[]).map((raw) => ({
      id: toText(raw.id),
      booking_code: toText(raw.booking_code).trim().toUpperCase(),
      full_name: toText(raw.full_name),
      seat_number: toText(raw.seat_number),
      total_amount: toMoney(raw.total_amount),
      addon_order_items: Array.isArray(raw.addon_order_items)
        ? raw.addon_order_items.map(toAddonOrderItemRow)
        : [],
    }));

    const consignmentOrders: ConsignmentOrderRow[] = ((consignmentRes.data ?? []) as RawConsignmentOrderRow[]).map(
      (raw) => ({
        id: toText(raw.id),
        booking_code: toText(raw.booking_code).trim().toUpperCase(),
        full_name: toText(raw.full_name),
        seat_number: toText(raw.seat_number),
        total_amount: toMoney(raw.total_amount),
        consignment_order_items: Array.isArray(raw.consignment_order_items)
          ? raw.consignment_order_items.map(toConsignmentOrderItemRow)
          : [],
      })
    );

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

      const totalAddon = aOrders.reduce((sum, o) => sum + wholePeso(toMoney(o.total_amount)), 0);
      const totalConsignment = cOrders.reduce((sum, o) => sum + wholePeso(toMoney(o.total_amount)), 0);

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
        rows.map((s) => String(s.booking_code ?? "").trim().toUpperCase()).filter(Boolean)
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

  const fetchAttendanceStateForSessions = async (rows: CustomerSession[]): Promise<void> => {
    const sessionIds = Array.from(new Set(rows.map((s) => String(s.id)).filter((x) => x.length > 0)));

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

  const readActiveCustomerView = async (): Promise<void> => {
    const { data, error } = await supabase
      .from("customer_view_state")
      .select("id, session_id, enabled, updated_at")
      .eq("id", VIEW_ROW_ID)
      .maybeSingle();

    if (error) {
      console.error("readActiveCustomerView error:", error);
      setActiveView(null);
      return;
    }

    if (!data) {
      try {
        await setCustomerViewState(false, null);
        const retry = await supabase
          .from("customer_view_state")
          .select("id, session_id, enabled, updated_at")
          .eq("id", VIEW_ROW_ID)
          .maybeSingle();

        if (!retry.error) {
          setActiveView((retry.data ?? null) as CustomerViewRow | null);
        }
      } catch (e) {
        console.error("ensure view row failed:", e);
      }
      return;
    }

    setActiveView((data ?? null) as CustomerViewRow | null);
  };

  const subscribeCustomerViewRealtime = (): (() => void) => {
    const channel = supabase
      .channel("customer_view_state_changes_customer_reservations")
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_view_state" }, () => {
        void readActiveCustomerView();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  };

  const refreshAll = async (): Promise<void> => {
    try {
      setRefreshing(true);
      const loadedSessions = await fetchReservationSessions();
      await Promise.all([
        fetchOrdersForSessions(loadedSessions),
        fetchOrderPayments(loadedSessions),
        fetchAttendanceStateForSessions(loadedSessions),
        readActiveCustomerView(),
      ]);
      await syncSessionPaidStates(loadedSessions);
    } finally {
      setRefreshing(false);
    }
  };

  const phoneText = (s: CustomerSession): string => {
    const p = String(s.phone_number ?? "").trim();
    return p || "N/A";
  };

  const getAttendanceLogsForSession = (s: CustomerSession): AttendanceLogRow[] => {
    return attendanceLogsMap[s.id] ?? [];
  };

  const getAttendanceCountText = (s: CustomerSession): string => {
    const logs = getAttendanceLogsForSession(s);
    return `${logs.length} log${logs.length === 1 ? "" : "s"}`;
  };

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

  const getLiveTotalCost = (s: CustomerSession): number => {
    const nowIso = new Date().toISOString();
    return computeCostWithFreeMinutes(s.time_started, nowIso);
  };

  const getBaseSystemCost = (s: CustomerSession): number => {
    if (String(s.reservation).toLowerCase() === "yes") {
      const accumulated = getReservationAccumulatedCost(s);
      const live = getReservationLiveCostFromAttendance(s);
      return wholePeso(accumulated + live);
    }
    return isOpenTimeSession(s) ? getLiveTotalCost(s) : wholePeso(toMoney(s.total_amount));
  };

  const getDiscountInfo = (s: CustomerSession): { kind: DiscountKind; value: number; reason: string } => {
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
    return sessionOrders[code] ?? { addonOrders: [], consignmentOrders: [], items: [], total: 0 };
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

  const getSystemRemaining = (s: CustomerSession): number =>
    wholePeso(Math.max(0, getSystemDue(s) - getSystemPaymentInfo(s).totalPaid));

  const getOrderRemaining = (s: CustomerSession): number =>
    wholePeso(Math.max(0, getOrderDue(s) - getOrderPaymentInfo(s).totalPaid));

  const getSessionBalanceAfterDP = (s: CustomerSession): number =>
    wholePeso(Math.max(0, getGrandDue(s) - getDownPayment(s)));

  const getSessionChangeAfterDP = (s: CustomerSession): number =>
    wholePeso(Math.max(0, getDownPayment(s) - getGrandDue(s)));

  const getDisplayAmount = (
    s: CustomerSession
  ): { label: "Total Balance" | "Total Change"; value: number } => {
    const balance = getSessionBalanceAfterDP(s);
    if (balance > 0) return { label: "Total Balance", value: balance };
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

  const stopOpenTime = async (session: CustomerSession): Promise<void> => {
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

  const renderTimeOut = (s: CustomerSession): string => {
    if (isOpenTimeSession(s)) return "OPEN";
    const t = formatTimeText(s.time_ended);
    return t || "—";
  };

  const renderStatus = (s: CustomerSession): string => {
    if (String(s.reservation).toLowerCase() === "yes") {
      return isReservationCurrentlyIn(s) ? "IN" : "OUT";
    }
    if (isOpenTimeSession(s)) return "Ongoing";
    const end = new Date(s.time_ended);
    if (!Number.isFinite(end.getTime())) return "Finished";
    return new Date() > end ? "Finished" : "Ongoing";
  };

  const getUsedMinutesForReceipt = (s: CustomerSession): number => {
    if (String(s.reservation).toLowerCase() === "yes") {
      return getReservationTotalUsedMinutes(s);
    }
    if (isOpenTimeSession(s)) return diffMinutes(s.time_started, new Date().toISOString());
    return diffMinutes(s.time_started, s.time_ended);
  };

  const getChargeMinutesForReceipt = (s: CustomerSession): number => {
    const used = getUsedMinutesForReceipt(s);
    return Math.max(0, used - FREE_MINUTES);
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
    const pi = getSystemPaymentInfo(s);
    setPaymentTarget(s);
    setGcashInput(String(pi.gcash));
    setCashInput(String(pi.cash));
  };

  const savePayment = async (): Promise<void> => {
    if (!paymentTarget) return;

    const g = wholePeso(Math.max(0, toMoney(gcashInput)));
    const c = wholePeso(Math.max(0, toMoney(cashInput)));
    const totalPaid = wholePeso(g + c);
    const due = getSystemDue(paymentTarget);
    const systemPaid = due <= 0 ? true : totalPaid >= due;

    try {
      setSavingPayment(true);

      const orderPaid = hasOrders(paymentTarget) ? getOrderIsPaid(paymentTarget) : true;
      const nextFinalPaid = systemPaid && orderPaid;

      const { data: updated, error } = await supabase
        .from("customer_sessions")
        .update({
          gcash_amount: g,
          cash_amount: c,
          is_paid: nextFinalPaid,
          paid_at: nextFinalPaid ? new Date().toISOString() : null,
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
    } catch (e) {
      console.error(e);
      alert("Save payment failed.");
    } finally {
      setSavingPayment(false);
    }
  };

  const ensureOrderPaymentRow = async (session: CustomerSession): Promise<CustomerOrderPayment | null> => {
    const bookingCode = String(session.booking_code ?? "").trim().toUpperCase();
    if (!bookingCode) {
      alert("No booking code found for this customer.");
      return null;
    }

    const orderTotal = getOrderDue(session);

    const payload = {
      booking_code: bookingCode,
      full_name: session.full_name,
      seat_number: session.seat_number || "N/A",
      order_total: orderTotal,
    };

    const { error } = await supabase
      .from("customer_order_payments")
      .upsert(payload, { onConflict: "booking_code" });

    if (error) {
      console.error(error);
      alert(`Failed to prepare order payment row: ${error.message}`);
      return null;
    }

    const { data, error: fetchErr } = await supabase
      .from("customer_order_payments")
      .select("*")
      .eq("booking_code", bookingCode)
      .maybeSingle();

    if (fetchErr || !data) {
      alert(`Failed to read order payment row: ${fetchErr?.message ?? "Not found"}`);
      return null;
    }

    const row = data as CustomerOrderPayment;
    setOrderPayments((prev) => ({ ...prev, [bookingCode]: row }));
    return row;
  };

  const openOrderPaymentModal = async (s: CustomerSession): Promise<void> => {
    if (!hasOrders(s)) return;
    const row = await ensureOrderPaymentRow(s);
    if (!row) return;
    setOrderPaymentTarget(s);
    setOrderGcashInput(String(wholePeso(Math.max(0, toMoney(row.gcash_amount ?? 0)))));
    setOrderCashInput(String(wholePeso(Math.max(0, toMoney(row.cash_amount ?? 0)))));
  };

  const saveOrderPayment = async (): Promise<void> => {
    if (!orderPaymentTarget) return;

    const bookingCode = String(orderPaymentTarget.booking_code ?? "").trim().toUpperCase();
    if (!bookingCode) {
      alert("Missing booking code.");
      return;
    }

    const due = getOrderDue(orderPaymentTarget);
    const gcash = wholePeso(Math.max(0, toMoney(orderGcashInput)));
    const cash = wholePeso(Math.max(0, toMoney(orderCashInput)));
    const totalPaid = wholePeso(gcash + cash);
    const orderPaid = due <= 0 ? true : totalPaid >= due;

    try {
      setSavingOrderPayment(true);

      const { data: paymentRow, error: payErr } = await supabase
        .from("customer_order_payments")
        .upsert(
          {
            booking_code: bookingCode,
            full_name: orderPaymentTarget.full_name,
            seat_number: orderPaymentTarget.seat_number || "N/A",
            order_total: due,
            gcash_amount: gcash,
            cash_amount: cash,
            is_paid: orderPaid,
            paid_at: orderPaid ? new Date().toISOString() : null,
          },
          { onConflict: "booking_code" }
        )
        .select("*")
        .single();

      if (payErr || !paymentRow) {
        alert(`Save order payment error: ${payErr?.message ?? "Unknown error"}`);
        return;
      }

      setOrderPayments((prev) => ({ ...prev, [bookingCode]: paymentRow as CustomerOrderPayment }));

      // 🔥 SYNC ADD-ONS + CONSIGNMENT (same sa customer promo list)
const paidAt = orderPaid ? new Date().toISOString() : null;

// 👉 ADD-ONS
await supabase
  .from("customer_session_add_ons")
  .update({
    is_paid: orderPaid,
    paid_at: paidAt,
  })
  .eq("full_name", orderPaymentTarget.full_name)
  .eq("seat_number", orderPaymentTarget.seat_number);

// 👉 CONSIGNMENT
await supabase
  .from("customer_session_consignment")
  .update({
    is_paid: orderPaid,
    paid_at: paidAt,
  })
  .eq("full_name", orderPaymentTarget.full_name)
  .eq("seat_number", orderPaymentTarget.seat_number)
  .eq("voided", false);

      const systemPaid = getSystemIsPaid(orderPaymentTarget);
      const nextFinalPaid = systemPaid && orderPaid;

      const { data: updatedSession, error: updErr } = await supabase
        .from("customer_sessions")
        .update({
          is_paid: nextFinalPaid,
          paid_at: nextFinalPaid ? new Date().toISOString() : null,
        })
        .eq("id", orderPaymentTarget.id)
        .select("*")
        .single();

      if (updErr || !updatedSession) {
        alert(
          `Order payment saved, but session paid sync failed: ${updErr?.message ?? "Unknown error"}`
        );
        return;
      }

      const updatedRow = updatedSession as CustomerSession;
      setSessions((prev) => prev.map((s) => (s.id === updatedRow.id ? updatedRow : s)));
      setSelectedSession((prev) => (prev?.id === updatedRow.id ? updatedRow : prev));
      setSelectedOrderSession((prev) => (prev?.id === updatedRow.id ? updatedRow : prev));
      setOrderPaymentTarget(null);
      await refreshAll();
    } catch (e) {
      console.error(e);
      alert("Save order payment failed.");
    } finally {
      setSavingOrderPayment(false);
    }
  };
  

  const openCancelModal = (s: CustomerSession): void => {
    setCancelTarget(s);
    setCancelReason("");
  };

  const openOrderCancelModal = (session: CustomerSession, item: OrderItemView): void => {
    setOrderCancelTarget({ session, item });
    setOrderCancelNote("");
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
      const { error: delParentErr } = await supabase.from("addon_orders").delete().eq("id", parentOrderId);
      if (delParentErr) throw delParentErr;
      return;
    }

    const newTotal = wholePeso(
      rows.reduce((sum, r) => {
        const subtotal = toMoney(r.subtotal ?? toMoney(r.price) * toMoney(r.quantity));
        return sum + subtotal;
      }, 0)
    );

    const { error: updParentErr } = await supabase
      .from("addon_orders")
      .update({ total_amount: newTotal })
      .eq("id", parentOrderId);

    if (updParentErr) throw updParentErr;
  };

  const recalcConsignmentParentAfterDelete = async (parentOrderId: string): Promise<void> => {
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

    const newTotal = wholePeso(
      rows.reduce((sum, r) => {
        const subtotal = toMoney(r.subtotal ?? toMoney(r.price) * toMoney(r.quantity));
        return sum + subtotal;
      }, 0)
    );

    const { error: updParentErr } = await supabase
      .from("consignment_orders")
      .update({ total_amount: newTotal })
      .eq("id", parentOrderId);

    if (updParentErr) throw updParentErr;
  };

  const refreshOrderPaymentTotalForSession = async (session: CustomerSession): Promise<void> => {
    const bookingCode = String(session.booking_code ?? "").trim().toUpperCase();
    if (!bookingCode) return;

    const newOrderTotal = getOrderDue(session);
    const existing = getOrderPaymentRow(session);
    if (!existing && newOrderTotal <= 0) return;

    const gcash = wholePeso(Math.max(0, toMoney(existing?.gcash_amount ?? 0)));
    const cash = wholePeso(Math.max(0, toMoney(existing?.cash_amount ?? 0)));
    const totalPaid = wholePeso(gcash + cash);
    const isPaid = newOrderTotal <= 0 ? true : totalPaid >= newOrderTotal;

    const { data, error } = await supabase
      .from("customer_order_payments")
      .upsert(
        {
          booking_code: bookingCode,
          full_name: session.full_name,
          seat_number: session.seat_number || "N/A",
          order_total: newOrderTotal,
          gcash_amount: gcash,
          cash_amount: cash,
          is_paid: isPaid,
          paid_at: isPaid ? new Date().toISOString() : null,
        },
        { onConflict: "booking_code" }
      )
      .select("*")
      .single();

    if (!error && data) {
      setOrderPayments((prev) => ({ ...prev, [bookingCode]: data as CustomerOrderPayment }));
    }
  };

  const submitOrderItemCancel = async (): Promise<void> => {
    if (!orderCancelTarget) return;

    const note = orderCancelNote.trim();
    if (!note) {
      alert("Cancel note is required.");
      return;
    }

    const { session, item } = orderCancelTarget;

    try {
      setCancellingOrderItemId(item.id);

      if (item.source === "addon") {
        const systemPaid = getSystemPaymentInfo(session);

        const cancelPayload = {
          original_id: item.id,
          created_at: item.created_at,
          add_on_id: item.source_item_id,
          quantity: item.qty,
          price: item.price,
          full_name: session.full_name,
          seat_number: session.seat_number,
          gcash_amount: systemPaid.gcash,
          cash_amount: systemPaid.cash,
          is_paid: toBool(session.is_paid),
          paid_at: session.paid_at ?? null,
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

        const { data: addonRow, error: addonFetchErr } = await supabase
          .from("add_ons")
          .select("sold")
          .eq("id", item.source_item_id)
          .maybeSingle();

        if (!addonFetchErr && addonRow) {
          const nextSold = Math.max(
            0,
            wholePeso(toMoney((addonRow as { sold?: number | string | null }).sold) - item.qty)
          );
          await supabase.from("add_ons").update({ sold: nextSold }).eq("id", item.source_item_id);
        }

        await recalcAddonParentAfterDelete(item.parent_order_id);
      } else {
        const systemPaid = getSystemPaymentInfo(session);

        const consignmentPayload = {
          original_id: item.id,
          original_created_at: item.created_at,
          consignment_id: item.source_item_id,
          quantity: item.qty,
          price: item.price,
          total: item.subtotal,
          full_name: session.full_name,
          seat_number: session.seat_number,
          gcash_amount: systemPaid.gcash,
          cash_amount: systemPaid.cash,
          is_paid: toBool(session.is_paid),
          paid_at: session.paid_at ?? null,
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

        const { data: conRow, error: conFetchErr } = await supabase
          .from("consignment")
          .select("sold")
          .eq("id", item.source_item_id)
          .maybeSingle();

        if (!conFetchErr && conRow) {
          const nextSold = Math.max(
            0,
            wholePeso(toMoney((conRow as { sold?: number | string | null }).sold) - item.qty)
          );
          await supabase.from("consignment").update({ sold: nextSold }).eq("id", item.source_item_id);
        }

        await recalcConsignmentParentAfterDelete(item.parent_order_id);
      }

      const updatedSessions = await fetchReservationSessions();
      await fetchOrdersForSessions(updatedSessions);
      await fetchOrderPayments(updatedSessions);
      await fetchAttendanceStateForSessions(updatedSessions);

      const freshSession = updatedSessions.find((s) => s.id === session.id) ?? session;
      await refreshOrderPaymentTotalForSession(freshSession);
      await syncSingleSessionPaidState(freshSession);

      setOrderCancelTarget(null);
      setOrderCancelNote("");

      if (selectedOrderSession) {
        const freshOrderSession =
          updatedSessions.find((s) => s.id === selectedOrderSession.id) ?? null;
        setSelectedOrderSession(freshOrderSession);
      }

      if (selectedSession) {
        const freshReceiptSession =
          updatedSessions.find((s) => s.id === selectedSession.id) ?? null;
        setSelectedSession(freshReceiptSession);
      }

      alert("Order item cancelled successfully.");
    } catch (e) {
      console.error(e);
      alert("Order item cancel failed.");
    } finally {
      setCancellingOrderItemId(null);
    }
  };

  const submitCancel = async (): Promise<void> => {
    if (!cancelTarget) return;

    const reason = cancelReason.trim();
    if (!reason) {
      alert("Cancel reason is required.");
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
        alert(`Cancel failed: ${fetchErr?.message ?? "Session not found."}`);
        return;
      }

      const row = freshRow as CustomerSession;

      const cancelPayload = {
        id: row.id,
        cancelled_at: new Date().toISOString(),
        cancel_reason: reason,
        created_at: row.created_at ?? null,
        staff_id: row.staff_id ?? null,
        date: row.date,
        full_name: row.full_name,
        phone_number: row.phone_number ?? null,
        customer_type: row.customer_type,
        customer_field: row.customer_field ?? null,
        has_id: row.has_id,
        hour_avail: row.hour_avail,
        time_started: row.time_started,
        time_ended: row.time_ended ?? row.time_started,
        total_time: toMoney(row.total_time),
        total_amount: toMoney(row.total_amount),
        reservation: row.reservation ?? "yes",
        reservation_date: row.reservation_date ?? null,
        reservation_end_date: row.reservation_end_date ?? null,
        id_number: row.id_number ?? null,
        seat_number: row.seat_number,
        promo_booking_id: row.promo_booking_id ?? null,
        discount_kind: row.discount_kind ?? "none",
        discount_value: toMoney(row.discount_value ?? 0),
        discount_reason: row.discount_reason ?? null,
        gcash_amount: toMoney(row.gcash_amount ?? 0),
        cash_amount: toMoney(row.cash_amount ?? 0),
        is_paid: toBool(row.is_paid),
        paid_at: row.paid_at ?? null,
        down_payment: toMoney(row.down_payment ?? 0),
        booking_code: row.booking_code ?? null,
      };

      const { error: insertErr } = await supabase.from("customer_sessions_cancelled").insert(cancelPayload);

      if (insertErr) {
        alert(`Cancel failed: ${insertErr.message}`);
        return;
      }

      await releaseSeatBlocksNow(row, new Date().toISOString(), "cancel");

      const { error: deleteErr } = await supabase
        .from("customer_sessions")
        .delete()
        .eq("id", row.id);

      if (deleteErr) {
        alert(`Cancelled copy saved, but delete failed: ${deleteErr.message}`);
        return;
      }

      setCancelTarget(null);
      setCancelReason("");
      setSelectedSession((prev) => (prev?.id === row.id ? null : prev));
      setSelectedOrderSession((prev) => (prev?.id === row.id ? null : prev));
      await refreshAll();
      alert("Reservation cancelled successfully.");
    } catch (e) {
      console.error(e);
      alert("Cancel failed.");
    } finally {
      setCancellingBusy(false);
    }
  };

  const toggleCustomerViewForSession = async (session: CustomerSession): Promise<void> => {
    try {
      setViewBusy(true);
      const isOn = isCustomerViewOnForSession(activeView, session.id);
      await setCustomerViewState(!isOn, isOn ? null : session.id);
      await readActiveCustomerView();
    } catch (e) {
      console.error(e);
      alert("Failed to update customer view.");
    } finally {
      setViewBusy(false);
    }
  };

  return (
    <div className="crv-page">
      <div className="crv-shell">
        <section className="crv-hero">
          <div className="crv-eyebrow">CUSTOMER MANAGEMENT</div>
          <h1 className="crv-title">Customer Reservations</h1>
          <p className="crv-subtitle">
            Plain and clean reservation records with attendance, payment, receipt, and order tools.
          </p>

          <div className="crv-toolbar crv-toolbar-resv">
            <div className="crv-control">
              <label>Date Basis</label>
              <select
                value={dateFilterMode}
                onChange={(e) => setDateFilterMode(e.target.value as DateFilterMode)}
              >
                <option value="reserved_on">Reserved On</option>
                <option value="start_date">Start Date</option>
              </select>
            </div>

            <div className="crv-control">
              <label>Date</label>
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
              />
            </div>

            <div className="crv-control crv-control-search">
              <label>Search Full Name</label>
              <input
                type="text"
                placeholder="Search reservation name..."
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
              />
            </div>

            <div className="crv-actions-top">
              <button
                className="crv-btn crv-btn-light"
                onClick={() => {
                  setDateFilterMode("start_date");
                  setFilterDate(yyyyMmDdLocal(new Date()));
                  setSearchName("");
                }}
                type="button"
              >
                Clear
              </button>

              <button
                className="crv-btn crv-btn-light"
                onClick={() => void refreshAll()}
                disabled={refreshing}
                type="button"
              >
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
        </section>
          <div className="crv-stats">
          <div className="crv-stat-box">
            <span>Total Customer</span>
            <strong>{filteredSessions.length}</strong>
          </div>

          <div className="crv-stat-box">
            <span>Paid</span>
            <strong>{filteredSessions.filter((s) => toBool(s.is_paid)).length}</strong>
          </div>

          <div className="crv-stat-box">
            <span>Unpaid</span>
            <strong>{filteredSessions.filter((s) => !toBool(s.is_paid)).length}</strong>
          </div>
        </div>

        <section className="crv-table-wrap">
          {loading ? (
            <div className="crv-empty">Loading reservation records...</div>
          ) : filteredSessions.length === 0 ? (
            <div className="crv-empty">No reservation records found.</div>
          ) : (
            <div className="crv-table-scroll">
              <table className="crv-table">
                <thead>
                  <tr>
                    <th>Reservation</th>
                    <th>Customer</th>
                    <th>Seat</th>
                    <th>Attendance</th>
                    <th>Orders</th>
                    <th>Total</th>
                    <th>Payments</th>
                    <th>Paid</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSessions.map((session) => {
                    const orderBundle = getOrderBundle(session);
                    const systemPay = getSystemPaymentInfo(session);
                    const orderPay = getOrderPaymentInfo(session);
                    const grandTotal = getGrandDue(session);
                    const finalPaid = getFinalPaidStatus(session);
                    const displayAmount = getDisplayAmount(session);

                    return (
                      <tr key={session.id} className="crv-row-anim">
                        <td>
                          <div className="crv-date-cell">
                            <strong>{formatReservationRange(session)}</strong>
                            <span>
                              {formatTimeText(session.time_started)} - {renderTimeOut(session)}
                            </span>
                            <span>{renderStatus(session)}</span>
                          </div>
                        </td>

                        <td>
                          <div className="crv-customer-cell">
                            <div className="crv-name-main">{session.full_name}</div>
                            <div className="crv-name-sub">{session.booking_code || "No code"}</div>

                            <div className="crv-meta-grid">
                              <div className="crv-name-meta">
                                <span className="crv-meta-label">Phone</span>
                                <span className="crv-meta-value">{phoneText(session)}</span>
                              </div>

                              <div className="crv-name-meta">
                                <span className="crv-meta-label">Type</span>
                                <span className="crv-meta-value">{session.customer_type}</span>
                              </div>

                              <div className="crv-name-meta">
                                <span className="crv-meta-label">Discount</span>
                                <span className="crv-meta-value">{getDiscountText(session)}</span>
                              </div>

                              <div className="crv-status-inline">
                                {session.has_id ? "With ID" : "No ID"}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td>
                          <span className="crv-seat-pill">{session.seat_number || "N/A"}</span>
                        </td>

                        <td>
                          <div className="crv-orders-cell">
                            <div className="crv-orders-empty">{getAttendanceCountText(session)}</div>
                            <button
                              className="crv-mini-btn crv-orders-btn"
                              onClick={() => setSelectedAttendanceSession(session)}
                              type="button"
                            >
                              View Attendance
                            </button>
                          </div>
                        </td>

                        <td>
                          <div className="crv-orders-cell">
                            {orderBundle.items.length === 0 ? (
                              <div className="crv-orders-empty">No orders</div>
                            ) : (
                              <>
                                <div className="crv-orders-list">
                                  {orderBundle.items.slice(0, 3).map((item) => (
                                    <div
                                      key={`${item.source}-${item.id}`}
                                      className="crv-order-line"
                                    >
                                      <div className="crv-order-name">
                                        {item.name} x{item.qty}
                                      </div>
                                      <div className="crv-order-price">₱{item.subtotal}</div>
                                    </div>
                                  ))}
                                </div>

                                {orderBundle.items.length > 3 && (
                                  <div className="crv-order-more">
                                    +{orderBundle.items.length - 3} more items
                                  </div>
                                )}

                                <button
                                  className="crv-mini-btn crv-orders-btn"
                                  onClick={() => setSelectedOrderSession(session)}
                                  type="button"
                                >
                                  View Orders
                                </button>
                              </>
                            )}
                          </div>
                        </td>

                        <td>
                          <div className="crv-total-card">
                            <div className="crv-grand-amount">₱{grandTotal}</div>
                            <div className="crv-grand-breakdown">
                              <div className="crv-break-row">
                                <span>System</span>
                                <strong>₱{getSystemDue(session)}</strong>
                              </div>
                              <div className="crv-break-row">
                                <span>Orders</span>
                                <strong>₱{getOrderDue(session)}</strong>
                              </div>
                              <div className="crv-break-row">
                                <span>Down Payment</span>
                                <strong>₱{getDownPayment(session)}</strong>
                              </div>
                              <div className="crv-break-row crv-break-row-highlight">
                                <span>{displayAmount.label}</span>
                                <strong>₱{displayAmount.value}</strong>
                              </div>
                            </div>
                          </div>
                        </td>

                        <td>
                          <div className="crv-payment-card">
                            <div className="crv-payment-section">
                              <div className="crv-payment-title">Time Payment</div>
                              <div className="crv-pay-box">
                                <div className="crv-pay-line">
                                  <span>GCash</span>
                                  <strong>₱{systemPay.gcash}</strong>
                                </div>
                                <div className="crv-pay-line">
                                  <span>Cash</span>
                                  <strong>₱{systemPay.cash}</strong>
                                </div>
                                <div className="crv-pay-line crv-pay-line-strong">
                                  <span>Paid</span>
                                  <strong>₱{systemPay.totalPaid}</strong>
                                </div>
                                <div className="crv-pay-line crv-pay-line-remain">
                                  <span>Remaining</span>
                                  <strong>₱{getSystemRemaining(session)}</strong>
                                </div>
                              </div>

                              <div className="crv-payment-stack">
                                <button
                                  className="crv-mini-btn crv-mini-btn-main"
                                  onClick={() => openPaymentModal(session)}
                                  type="button"
                                >
                                  Time Payment
                                </button>

                                <button
                                  className="crv-mini-btn crv-mini-soft"
                                  onClick={() => openDpModal(session)}
                                  type="button"
                                >
                                  Down Payment
                                </button>
                              </div>
                            </div>

                            <div className="crv-payment-section crv-payment-section-order">
                              <div className="crv-payment-title">Order Payment</div>
                              <div className="crv-pay-box">
                                <div className="crv-pay-line">
                                  <span>GCash</span>
                                  <strong>₱{orderPay.gcash}</strong>
                                </div>
                                <div className="crv-pay-line">
                                  <span>Cash</span>
                                  <strong>₱{orderPay.cash}</strong>
                                </div>
                                <div className="crv-pay-line crv-pay-line-strong">
                                  <span>Paid</span>
                                  <strong>₱{orderPay.totalPaid}</strong>
                                </div>
                                <div className="crv-pay-line crv-pay-line-remain">
                                  <span>Remaining</span>
                                  <strong>₱{getOrderRemaining(session)}</strong>
                                </div>
                              </div>

                              <div className="crv-payment-stack">
                                <button
                                  className="crv-mini-btn crv-mini-btn-main"
                                  onClick={() => void openOrderPaymentModal(session)}
                                  disabled={!hasOrders(session)}
                                  type="button"
                                >
                                  Order Payment
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>

                        <td>
                          <div className="crv-paid-wrap">
                            <span className={`crv-paid-pill ${finalPaid ? "paid" : "unpaid"}`}>
                              {finalPaid ? "PAID" : "UNPAID"}
                            </span>
                          </div>
                        </td>

                        <td>
                          <div className="crv-action-stack crv-action-stack-premium">
                            <button
                              className="crv-action-btn"
                              onClick={() => openDiscountModal(session)}
                              type="button"
                            >
                              Discount
                            </button>

                            {isOpenTimeSession(session) && (
                              <button
                                className="crv-action-btn crv-action-gold"
                                onClick={() => void stopOpenTime(session)}
                                disabled={stoppingId === session.id}
                                type="button"
                              >
                                {stoppingId === session.id ? "Stopping..." : "Stop Time"}
                              </button>
                            )}
                            <button
                              className="crv-action-btn"
                              onClick={() => setSelectedSession(session)}
                              type="button"
                            >
                              View Receipt
                            </button>

                            <button
                              className="crv-action-btn crv-action-danger"
                              onClick={() => openCancelModal(session)}
                              type="button"
                            >
                              Cancel
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
        </section>

          <FixedCenterModal
            open={!!selectedAttendanceSession}
            title="Attendance"
            size="sm"
            onClose={() => setSelectedAttendanceSession(null)}
          >
            {selectedAttendanceSession && (
              <>
              <div className="crv-modal-summary-grid">
                <div>
                  <span>Customer</span>
                  <strong>{selectedAttendanceSession.full_name}</strong>
                </div>
                <div>
                  <span>Booking Code</span>
                  <strong>{selectedAttendanceSession.booking_code ?? "—"}</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong>{renderStatus(selectedAttendanceSession)}</strong>
                </div>
                <div>
                  <span>Total Logs</span>
                  <strong>{getAttendanceLogsForSession(selectedAttendanceSession).length}</strong>
                </div>
              </div>

              {getAttendanceLogsForSession(selectedAttendanceSession).length === 0 ? (
                <div className="crv-empty crv-empty-tight">No attendance logs found.</div>
              ) : (
                <div className="crv-items-list">
                  {getAttendanceLogsForSession(selectedAttendanceSession).map((log) => (
                    <div key={log.id} className="crv-item-card crv-item-card-plain">
                      <div className="crv-item-center">
                        <h4>{log.attendance_date}</h4>
                        <p>IN: {formatDateTimeText(log.in_at)}</p>
                        <p>OUT: {formatDateTimeText(log.out_at)}</p>
                        <p>Note: {log.note || "—"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="crv-modal-actions">
                <button
                  className="crv-btn crv-btn-light"
                  onClick={() => setSelectedAttendanceSession(null)}
                  type="button"
                >
                  Close
                </button>
              </div>
            </>
          )}
        </FixedCenterModal>

        <FixedCenterModal
          open={!!selectedOrderSession}
          title="Order List"
          size="md"
          onClose={() => setSelectedOrderSession(null)}
        >
          {selectedOrderSession && (
            <>
              <div className="crv-modal-summary-grid">
                <div>
                  <span>Customer</span>
                  <strong>{selectedOrderSession.full_name}</strong>
                </div>
                <div>
                  <span>Booking Code</span>
                  <strong>{selectedOrderSession.booking_code ?? "—"}</strong>
                </div>
                <div>
                  <span>Seat</span>
                  <strong>{selectedOrderSession.seat_number}</strong>
                </div>
                <div>
                  <span>Total</span>
                  <strong>₱{wholePeso(getOrderDue(selectedOrderSession))}</strong>
                </div>
              </div>

              {getOrderBundle(selectedOrderSession).items.length === 0 ? (
                <div className="crv-empty crv-empty-tight">No order items found.</div>
              ) : (
                <div className="crv-items-list">
                  {getOrderBundle(selectedOrderSession).items.map((item) => (
                    <div key={`${item.source}-${item.id}`} className="crv-item-card">
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.name} className="crv-item-image" />
                      ) : (
                        <div className="crv-item-placeholder">No Image</div>
                      )}

                      <div className="crv-item-center">
                        <h4>{item.name}</h4>
                        <p>{item.category}</p>
                        <p>Qty: {item.qty}</p>
                        <p>Price: ₱{item.price}</p>
                        {item.size && <p>Size: {item.size}</p>}
                      </div>

                      <div className="crv-item-right">
                        <strong>₱{item.subtotal}</strong>
                        <button
                          className="crv-mini-btn crv-mini-danger"
                          onClick={() => openOrderCancelModal(selectedOrderSession, item)}
                          type="button"
                        >
                          Cancel Item
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="crv-modal-actions">
                <button
                  className="crv-btn crv-btn-light"
                  onClick={() => setSelectedOrderSession(null)}
                  type="button"
                >
                  Close
                </button>
              </div>
            </>
          )}
        </FixedCenterModal>

      <FixedCenterModal
        open={!!selectedSession}
        title=""
        size="sm"
        onClose={() => setSelectedSession(null)}
      >
        {selectedSession ? (
          (() => {
            const orderBundle = getOrderBundle(selectedSession);
            const orders = orderBundle.items;
            const ordersTotal = getOrdersTotal(selectedSession);
            const systemCost = getSystemDue(selectedSession);
            const systemPay = getSystemPaymentInfo(selectedSession);
            const orderPay = getOrderPaymentInfo(selectedSession);
            const di = getDiscountInfo(selectedSession);
            const totalPaid = wholePeso(
              systemPay.gcash +
                systemPay.cash +
                orderPay.gcash +
                orderPay.cash
            );
            const totalChange = getSessionChangeAfterDP(selectedSession);
            const bottomInfo = getDisplayAmount(selectedSession);

            return (
              <div className="crv-plain-receipt-wrap">
                <div className="crv-plain-receipt">
                  <div className="crv-plain-brand">
                    <img
                      src={logo}
                      alt="Me Tyme Lounge"
                      className="crv-plain-receipt-logo"
                    />
                    <div className="crv-plain-brand-top">ME TYME LOUNGE</div>
                    <div className="crv-plain-brand-title">Reservation Receipt</div>
                  </div>

                  <div className="crv-plain-block">
                    <div className="crv-plain-row">
                      <span>Name</span>
                      <strong>{selectedSession.full_name || "N/A"}</strong>
                    </div>

                    <div className="crv-plain-row">
                      <span>Seat</span>
                      <strong>{selectedSession.seat_number || "N/A"}</strong>
                    </div>

                    <div className="crv-plain-row">
                      <span>Reservation</span>
                      <strong>{formatReservationRange(selectedSession)}</strong>
                    </div>

                    {selectedSession.booking_code && (
                      <div className="crv-plain-row">
                        <span>Booking Code</span>
                        <strong>{selectedSession.booking_code}</strong>
                      </div>
                    )}
                  </div>

                  <div className="crv-plain-divider" />

                  <div className="crv-plain-items">
                    {orders.length > 0 ? (
                      orders.map((item) => (
                        <div className="crv-plain-item-card" key={item.id}>
                          <div className="crv-plain-item-left">
                            <div className="crv-plain-item-name">
                              {item.name}
                              {item.size ? ` (${item.size})` : ""}
                            </div>
                            <div className="crv-plain-item-sub">
                              {item.qty} × ₱{item.price}
                            </div>
                          </div>
                          <div className="crv-plain-item-total">₱{item.subtotal}</div>
                        </div>
                      ))
                    ) : (
                      <div className="crv-plain-item-card">
                        <div className="crv-plain-item-left">
                          <div className="crv-plain-item-name">Reservation Session</div>
                          <div className="crv-plain-item-sub">
                            {String(selectedSession.hour_avail || "N/A").toUpperCase() === "OPEN"
                              ? "Open time reservation"
                              : `Reserved Duration: ${selectedSession.hour_avail || "N/A"}`}
                          </div>
                        </div>
                        <div className="crv-plain-item-total">₱{systemCost}</div>
                      </div>
                    )}
                  </div>

                  <div className="crv-plain-divider" />

                  <div className="crv-plain-summary">
                    <div className="crv-plain-row">
                      <span>System Cost</span>
                      <strong>₱{systemCost}</strong>
                    </div>

                    <div className="crv-plain-row">
                      <span>Discount</span>
                      <strong>{getDiscountTextFrom(di.kind, di.value)}</strong>
                    </div>

                    <div className="crv-plain-row">
                      <span>Orders Total</span>
                      <strong>₱{ordersTotal}</strong>
                    </div>

                    <div className="crv-plain-row">
                      <span>Down Payment</span>
                      <strong>₱{getDownPayment(selectedSession)}</strong>
                    </div>

                    <div className="crv-plain-row">
                      <span>GCash</span>
                      <strong>₱{systemPay.gcash + orderPay.gcash}</strong>
                    </div>

                    <div className="crv-plain-row">
                      <span>Cash</span>
                      <strong>₱{systemPay.cash + orderPay.cash}</strong>
                    </div>

                    <div className="crv-plain-row">
                      <span>Total Paid</span>
                      <strong>₱{totalPaid}</strong>
                    </div>

                    <div className="crv-plain-row">
                      <span>Change</span>
                      <strong>₱{totalChange}</strong>
                    </div>

                    <div className="crv-plain-row">
                      <span>Status</span>
                      <strong
                        className={
                          getFinalPaidStatus(selectedSession)
                            ? "crv-plain-status paid"
                            : "crv-plain-status unpaid"
                        }
                      >
                        {getFinalPaidStatus(selectedSession) ? "PAID" : "UNPAID"}
                      </strong>
                    </div>
                  </div>

                  <div className="crv-plain-total-box">
                    <span>{bottomInfo.label}</span>
                    <strong>₱{bottomInfo.value}</strong>
                  </div>

                  <p className="crv-plain-thankyou">
                    Thank you for choosing
                    <br />
                    <strong>Me Tyme Lounge</strong>
                  </p>

                  <div className="crv-plain-actions">
                    <button
                      className="crv-btn crv-btn-light"
                      onClick={() => setSelectedSession(null)}
                      type="button"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            );
          })()
        ) : null}
      </FixedCenterModal>

        <FixedCenterModal
          open={!!discountTarget}
          title="Apply Discount"
          size="sm"
          onClose={() => setDiscountTarget(null)}
        >
          <div className="crv-form-grid">
            <div className="crv-form-field">
              <label>Discount Type</label>
              <select
                value={discountKind}
                onChange={(e) => setDiscountKind(e.target.value as DiscountKind)}
              >
                <option value="none">None</option>
                <option value="percent">Percent</option>
                <option value="amount">Amount</option>
              </select>
            </div>

            <div className="crv-form-field">
              <label>Value</label>
              <input
                type="number"
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
              />
            </div>

            <div className="crv-form-field">
              <label>Reason</label>
              <textarea
                value={discountReason}
                onChange={(e) => setDiscountReason(e.target.value)}
              />
            </div>
          </div>

          <div className="crv-modal-actions">
            <button className="crv-btn crv-btn-light" onClick={() => setDiscountTarget(null)} type="button">
              Close
            </button>
            <button
              className="crv-btn crv-btn-dark"
              onClick={() => void saveDiscount()}
              disabled={savingDiscount}
              type="button"
            >
              {savingDiscount ? "Saving..." : "Save"}
            </button>
          </div>
        </FixedCenterModal>

        <FixedCenterModal
          open={!!dpTarget}
          title="Down Payment"
          size="sm"
          onClose={() => setDpTarget(null)}
        >
          <div className="crv-form-grid">
            <div className="crv-form-field">
              <label>Amount</label>
              <input
                type="number"
                value={dpInput}
                onChange={(e) => setDpInput(e.target.value)}
              />
            </div>
          </div>

          <div className="crv-modal-actions">
            <button className="crv-btn crv-btn-light" onClick={() => setDpTarget(null)} type="button">
              Close
            </button>
            <button
              className="crv-btn crv-btn-dark"
              onClick={() => void saveDownPayment()}
              disabled={savingDp}
              type="button"
            >
              {savingDp ? "Saving..." : "Save"}
            </button>
          </div>
        </FixedCenterModal>

        <FixedCenterModal
          open={!!paymentTarget}
          title="Time Payment"
          size="sm"
          onClose={() => setPaymentTarget(null)}
        >
          <div className="crv-form-grid">
            <div className="crv-form-field">
              <label>GCash</label>
              <input
                type="number"
                value={gcashInput}
                onChange={(e) => setGcashInput(e.target.value)}
              />
            </div>

            <div className="crv-form-field">
              <label>Cash</label>
              <input
                type="number"
                value={cashInput}
                onChange={(e) => setCashInput(e.target.value)}
              />
            </div>
          </div>

          <div className="crv-modal-actions">
            <button className="crv-btn crv-btn-light" onClick={() => setPaymentTarget(null)} type="button">
              Close
            </button>
            <button
              className="crv-btn crv-btn-dark"
              onClick={() => void savePayment()}
              disabled={savingPayment}
              type="button"
            >
              {savingPayment ? "Saving..." : "Save"}
            </button>
          </div>
        </FixedCenterModal>

        <FixedCenterModal
          open={!!orderPaymentTarget}
          title="Order Payment"
          size="sm"
          onClose={() => setOrderPaymentTarget(null)}
        >
          <div className="crv-form-grid">
            <div className="crv-form-field">
              <label>GCash</label>
              <input
                type="number"
                value={orderGcashInput}
                onChange={(e) => setOrderGcashInput(e.target.value)}
              />
            </div>

            <div className="crv-form-field">
              <label>Cash</label>
              <input
                type="number"
                value={orderCashInput}
                onChange={(e) => setOrderCashInput(e.target.value)}
              />
            </div>
          </div>

          <div className="crv-modal-actions">
            <button
              className="crv-btn crv-btn-light"
              onClick={() => setOrderPaymentTarget(null)}
              type="button"
            >
              Close
            </button>
            <button
              className="crv-btn crv-btn-dark"
              onClick={() => void saveOrderPayment()}
              disabled={savingOrderPayment}
              type="button"
            >
              {savingOrderPayment ? "Saving..." : "Save"}
            </button>
          </div>
        </FixedCenterModal>

        <FixedCenterModal
          open={!!cancelTarget}
          title="Cancel Reservation"
          size="sm"
          onClose={() => setCancelTarget(null)}
        >
          <p className="crv-confirm-copy">
            Please provide a reason before cancelling this reservation.
          </p>

          <div className="crv-form-field">
            <label>Reason</label>
            <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
          </div>

          <div className="crv-modal-actions">
            <button className="crv-btn crv-btn-light" onClick={() => setCancelTarget(null)} type="button">
              Close
            </button>
            <button
              className="crv-btn crv-btn-danger"
              onClick={() => void submitCancel()}
              disabled={cancellingBusy}
              type="button"
            >
              {cancellingBusy ? "Cancelling..." : "Confirm Cancel"}
            </button>
          </div>
        </FixedCenterModal>

        <FixedCenterModal
          open={!!orderCancelTarget}
          title="Cancel Order Item"
          size="sm"
          onClose={() => setOrderCancelTarget(null)}
        >
          {orderCancelTarget && (
            <>
              <p className="crv-confirm-copy">
                You are cancelling <strong>{orderCancelTarget.item.name}</strong>.
              </p>

              <div className="crv-form-field">
                <label>Cancel Note</label>
                <textarea
                  value={orderCancelNote}
                  onChange={(e) => setOrderCancelNote(e.target.value)}
                />
              </div>

              <div className="crv-modal-actions">
                <button
                  className="crv-btn crv-btn-light"
                  onClick={() => setOrderCancelTarget(null)}
                  type="button"
                >
                  Close
                </button>
                <button
                  className="crv-btn crv-btn-danger"
                  onClick={() => void submitOrderItemCancel()}
                  disabled={cancellingOrderItemId === orderCancelTarget.item.id}
                  type="button"
                >
                  {cancellingOrderItemId === orderCancelTarget.item.id
                    ? "Cancelling..."
                    : "Confirm Cancel"}
                </button>
              </div>
            </>
          )}
        </FixedCenterModal>
      </div>
    </div>
  );
};

export default Customer_Reservations;