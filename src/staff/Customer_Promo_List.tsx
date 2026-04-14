import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../utils/supabaseClient";
import logo from "../assets/study_hub.png";
import "../styles/Customer_Promo_List.css";

type PackageArea = "common_area" | "conference_room";
type DurationUnit = "hour" | "day" | "month" | "year";
type DiscountKind = "none" | "percent" | "amount";

type AreaFilter = "all" | PackageArea;
type CommonDurationFilter = "all" | "1_day" | "week" | "half_month" | "month";
type ConferenceDurationFilter = "all" | "1_hour" | "3_hours" | "6_hours" | "8_hours";

type OrderKind = "add_on" | "consignment";
type OrderParentSource = "addon_orders" | "consignment_orders";

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
  package_id: string;
  package_option_id: string;
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
  package_id: string | null;
  package_option_id: string | null;
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

type ViewStateRow = {
  id: number;
  enabled: boolean | number | string | null;
  session_id: string | null;
  updated_at?: string | null;
};

const LS_VIEW_ENABLED = "customer_view_enabled";
const LS_SESSION_ID = "customer_view_session_id";
const VIEW_STATE_TABLE = "customer_view_state";
const VIEW_STATE_ID = 1;

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

const safePhone = (v: string | null | undefined): string => {
  const p = String(v ?? "").trim();
  return p ? p : "—";
};

const moneyFromStr = (s: string): number => round2(Math.max(0, toNumber(s)));

const isExpired = (validityEndAtIso: string | null): boolean => {
  const iso = String(validityEndAtIso ?? "").trim();
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() > t;
};

const getLocalDayStartMs = (dateStr: string): number =>
  new Date(`${dateStr}T00:00:00`).getTime();

const getLocalDayEndMs = (dateStr: string): number =>
  new Date(`${dateStr}T23:59:59.999`).getTime();

const bookingCoversLocalDate = (
  startIso: string,
  endIso: string,
  selectedDate: string
): boolean => {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  const dayStartMs = getLocalDayStartMs(selectedDate);
  const dayEndMs = getLocalDayEndMs(selectedDate);

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
  if (!Number.isFinite(dayStartMs) || !Number.isFinite(dayEndMs)) return false;

  return startMs <= dayEndMs && endMs >= dayStartMs;
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

  const normalizeRow = (row: PromoBookingDBRow): PromoBookingRow => {
    const kind = normalizeDiscountKind(row.discount_kind);
    const value = round2(toNumber(row.discount_value));
    const promo_code =
      row.promo_code ?? null ? String(row.promo_code ?? "").trim() : null;
    const attempts_left = Math.max(0, Math.floor(toNumber(row.attempts_left ?? 0)));
    const max_attempts = Math.max(0, Math.floor(toNumber(row.max_attempts ?? 0)));
    const validity_end_at = row.validity_end_at ?? null;

    return {
      id: row.id,
      created_at: row.created_at,
      full_name: row.full_name,
      phone_number: row.phone_number ?? null,
      area: row.area,
      package_id: String(row.package_id ?? "").trim(),
      package_option_id: String(row.package_option_id ?? "").trim(),
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
      promo_code,
      attempts_left,
      max_attempts,
      validity_end_at,
      packages: row.packages ?? null,
      package_options: row.package_options ?? null,
    };
  };

const readLocalView = (): { enabled: boolean; sessionId: string } => {
  const enabled =
    String(localStorage.getItem(LS_VIEW_ENABLED) ?? "").toLowerCase() === "true";
  const sid = String(localStorage.getItem(LS_SESSION_ID) ?? "").trim();
  return { enabled, sessionId: sid };
};

const writeLocalView = (enabled: boolean, sessionId: string | null): void => {
  localStorage.setItem(LS_VIEW_ENABLED, String(enabled));
  if (enabled && sessionId) localStorage.setItem(LS_SESSION_ID, sessionId);
  else localStorage.removeItem(LS_SESSION_ID);
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

  return sorted.map((p, idx) => {
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
    const is_paid = due <= 0 ? true : totalPaid >= due;

    return {
      id: p.id,
      source: p.source,
      gcash_amount: useGcash,
      cash_amount: useCash,
      is_paid,
      paid_at: is_paid ? new Date().toISOString() : null,
    };
  });
};

type ModalProps = {
  open: boolean;
  title: string;
  size?: "sm" | "md" | "lg" | "xl";
  hideClose?: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

const FixedCenterModal: React.FC<ModalProps> = ({
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
    const prevTouch = document.body.style.touchAction;
    document.body.classList.add("cpl-modal-open");
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.classList.remove("cpl-modal-open");
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouch;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="cpl-modal-overlay" onClick={onClose}>
      <div
        className={`cpl-modal-card cpl-modal-${size}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title || "Modal"}
      >
        {title ? (
          <div className="cpl-modal-head">
            <h3>{title}</h3>
            {!hideClose && (
              <button className="cpl-modal-close" onClick={onClose} type="button" aria-label="Close">
                ×
              </button>
            )}
          </div>
        ) : null}
        <div className="cpl-modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
};

const Customer_Promo_List: React.FC = () => {
  const [rows, setRows] = useState<PromoBookingRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selected, setSelected] = useState<PromoBookingRow | null>(null);
  const [selectedOrderBooking, setSelectedOrderBooking] = useState<PromoBookingRow | null>(null);

  const [selectedDate, setSelectedDate] = useState<string>(yyyyMmDdLocal(new Date()));
  const [searchName, setSearchName] = useState<string>("");

  const [areaFilter, setAreaFilter] = useState<AreaFilter>("all");
  const [commonDurationFilter, setCommonDurationFilter] =
    useState<CommonDurationFilter>("all");
  const [conferenceDurationFilter, setConferenceDurationFilter] =
    useState<ConferenceDurationFilter>("all");

  const [tick, setTick] = useState<number>(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setTick(Date.now()), 10000);
    return () => window.clearInterval(t);
  }, []);

  const [, setViewTick] = useState<number>(0);
  const [viewEnabled, setViewEnabled] = useState<boolean>(false);
  const [viewSessionId, setViewSessionId] = useState<string>("");
  const viewHydratedRef = useRef<boolean>(false);

  const [refreshing, setRefreshing] = useState<boolean>(false);

  const [attMap, setAttMap] = useState<Record<string, PromoBookingAttendanceRow[]>>({});
  const [attModalTarget, setAttModalTarget] = useState<PromoBookingRow | null>(null);

  const [ordersMap, setOrdersMap] = useState<PromoOrdersMap>({});
  const [orderParentsMap, setOrderParentsMap] = useState<PromoOrderParentsMap>({});

  const [paymentTarget, setPaymentTarget] = useState<PromoBookingRow | null>(null);
  const [gcashInput, setGcashInput] = useState<string>("0");
  const [cashInput, setCashInput] = useState<string>("0");
  const [savingPayment, setSavingPayment] = useState<boolean>(false);

  const [orderPaymentTarget, setOrderPaymentTarget] = useState<PromoBookingRow | null>(null);
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

  const [orderCancelTarget, setOrderCancelTarget] = useState<CancelOrderTarget | null>(null);
  const [orderCancelNote, setOrderCancelNote] = useState<string>("");
  const [cancellingOrderItemId, setCancellingOrderItemId] = useState<string | null>(null);

  const selectPromoBookings = `
    id,
    created_at,
    full_name,
    phone_number,
    area,
    package_id,
    package_option_id,
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

  const applyViewState = (enabled: boolean, sessionId: string): void => {
    setViewEnabled(enabled);
    setViewSessionId(sessionId);
    writeLocalView(enabled, enabled ? sessionId : null);
    setViewTick((x) => x + 1);
  };

  const hydrateViewState = async (): Promise<void> => {
    const { data, error } = await supabase
      .from(VIEW_STATE_TABLE)
      .select("id, enabled, session_id, updated_at")
      .eq("id", VIEW_STATE_ID)
      .maybeSingle();

    if (!error && data) {
      const row = data as unknown as ViewStateRow;
      applyViewState(toBool(row.enabled), String(row.session_id ?? "").trim());
      viewHydratedRef.current = true;
      return;
    }

    const local = readLocalView();
    applyViewState(local.enabled, local.sessionId);
    viewHydratedRef.current = true;
  };

  const setCustomerViewRealtime = async (
    enabled: boolean,
    sessionId: string | null
  ): Promise<void> => {
    const sid = enabled && sessionId ? sessionId : null;

    applyViewState(Boolean(enabled), String(sid ?? ""));

    const { error } = await supabase
      .from(VIEW_STATE_TABLE)
      .update({
        enabled: Boolean(enabled),
        session_id: sid,
        updated_at: new Date().toISOString(),
      })
      .eq("id", VIEW_STATE_ID);

    if (error) {
      console.warn("setCustomerViewRealtime error:", error.message);
      writeLocalView(Boolean(enabled), sid);
      setViewTick((x) => x + 1);
    }
  };

  const isCustomerViewOnFor = (sessionId: string): boolean =>
    viewEnabled && viewSessionId === sessionId;

  useEffect(() => {
    void hydrateViewState();

    const channel = supabase
      .channel("realtime_customer_view_state_promo_list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: VIEW_STATE_TABLE },
        (payload) => {
          const next = (payload.new ?? null) as unknown as ViewStateRow | null;
          if (!next) return;
          if (Number(next.id) !== VIEW_STATE_ID) return;
          applyViewState(toBool(next.enabled), String(next.session_id ?? "").trim());
          viewHydratedRef.current = true;
        }
      )
      .subscribe();

    const onStorage = (e: StorageEvent): void => {
      if (!e.key) return;
      if (e.key === LS_VIEW_ENABLED || e.key === LS_SESSION_ID) {
        const local = readLocalView();
        applyViewState(local.enabled, local.sessionId);
      }
    };

    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("storage", onStorage);
      void supabase.removeChannel(channel);
    };
  }, []);

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

  const logsFor = (bookingId: string): PromoBookingAttendanceRow[] => attMap[bookingId] ?? [];

  const lastLogFor = (bookingId: string): PromoBookingAttendanceRow | null => {
    const logs = logsFor(bookingId);
    return logs.length ? logs[0] : null;
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
            addon_orders!inner ( id, booking_code ),
            add_ons ( name, category, size, image_url )
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
            consignment_orders!inner ( id, booking_code ),
            consignment ( item_name, category, size, image_url )
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
      if (!p.booking_code) return;
      if (!parentMap[p.booking_code]) parentMap[p.booking_code] = [];
      parentMap[p.booking_code].push(p);
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
        subtotal: round2(toNumber(r.subtotal == null ? toNumber(r.price) * toNumber(r.quantity) : r.subtotal)),
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
        subtotal: round2(toNumber(r.subtotal == null ? toNumber(r.price) * toNumber(r.quantity) : r.subtotal)),
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

    void fetchAttendanceForBookings(normalized.map((r) => r.id));
    void fetchOrdersForPromoCodes(normalized.map((r) => String(r.promo_code ?? "")));

    return normalized;
  };

  useEffect(() => {
    void fetchPromoBookings();
  }, []);

  const refreshAll = async (): Promise<void> => {
    try {
      setRefreshing(true);
      await Promise.all([fetchPromoBookings(), hydrateViewState()]);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setCommonDurationFilter("all");
    setConferenceDurationFilter("all");
  }, [areaFilter]);

  const getOrderItems = (code: string | null): PromoOrderItemRow[] =>
    code ? ordersMap[code] ?? [] : [];

  const getOrderParents = (code: string | null): PromoOrderParentRow[] =>
    code ? orderParentsMap[code] ?? [] : [];

  const hasOrder = (code: string | null): boolean =>
    getOrderItems(code).length > 0 || getOrderParents(code).length > 0;

  const getOrderDue = (code: string | null): number => {
    const parentTotal = round2(
      getOrderParents(code).reduce((sum, r) => sum + round2(Math.max(0, r.total_amount)), 0)
    );
    const itemsTotal = round2(
      getOrderItems(code).reduce((sum, item) => sum + round2(Math.max(0, item.subtotal)), 0)
    );
    return itemsTotal > 0 ? itemsTotal : parentTotal;
  };

  const getOrderPaidInfo = (
    code: string | null
  ): { gcash: number; cash: number; totalPaid: number } => {
    const parents = getOrderParents(code);
    const gcash = round2(parents.reduce((sum, r) => sum + round2(Math.max(0, r.gcash_amount)), 0));
    const cash = round2(parents.reduce((sum, r) => sum + round2(Math.max(0, r.cash_amount)), 0));
    return { gcash, cash, totalPaid: round2(gcash + cash) };
  };

  const getSystemDue = (r: PromoBookingRow): number =>
    round2(applyDiscount(round2(Math.max(0, toNumber(r.price))), r.discount_kind, r.discount_value).discountedCost);

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

    return { remaining: 0, change: round2(Math.abs(diff)), label: "Overall Change" };
  };

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

    const finalPaid = isFinalPaidRow(row);
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
        x.id === promoId ? { ...x, is_paid: finalPaid, paid_at: nextPaidAt } : x
      )
    );

    setSelected((prev) =>
      prev?.id === promoId ? { ...prev, is_paid: finalPaid, paid_at: nextPaidAt } : prev
    );

    setSelectedOrderBooking((prev) =>
      prev?.id === promoId ? { ...prev, is_paid: finalPaid, paid_at: nextPaidAt } : prev
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

  const openOrderCancelModal = (booking: PromoBookingRow, item: PromoOrderItemRow): void => {
    setOrderCancelTarget({ booking, item });
    setOrderCancelNote("");
  };

  const refreshDataAfterOrderCancel = async (booking: PromoBookingRow): Promise<void> => {
    const freshRows = await fetchPromoBookings();
    const fresh = freshRows.find((r) => r.id === booking.id) ?? null;
    if (selected?.id === booking.id) setSelected(fresh);
    if (selectedOrderBooking?.id === booking.id) setSelectedOrderBooking(fresh);
    if (fresh) await syncPromoFinalPaid(fresh.id);
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
              round2(toNumber((addonRow as { sold?: number | string | null }).sold) - item.quantity)
            );
            await supabase.from("add_ons").update({ sold: nextSold }).eq("id", item.source_item_id);
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
            .select("stocks")
            .eq("id", item.source_item_id)
            .maybeSingle();

          if (!conFetchErr && conRow) {
            const nextStocks = Math.max(
              0,
              round2(toNumber((conRow as { stocks?: number | string | null }).stocks) + item.quantity)
            );
            await supabase.from("consignment").update({ stocks: nextStocks }).eq("id", item.source_item_id);
          }
        }

        await recalcConsignmentParentAfterDelete(item.parent_order_id);
      }

      setOrderCancelTarget(null);
      setOrderCancelNote("");
      await refreshDataAfterOrderCancel(booking);
      alert("Order item cancelled successfully.");
    } catch (e) {
      console.error(e);
      alert("Order item cancel failed.");
    } finally {
      setCancellingOrderItemId(null);
    }
  };

  const openPaymentModal = (row: PromoBookingRow): void => {
    setPaymentTarget(row);
    setGcashInput("0");
    setCashInput("0");
  };

  const submitSystemPayment = async (): Promise<void> => {
    if (!paymentTarget) return;

    try {
      setSavingPayment(true);

      const addGcash = moneyFromStr(gcashInput);
      const addCash = moneyFromStr(cashInput);

      const nextGcash = round2(paymentTarget.gcash_amount + addGcash);
      const nextCash = round2(paymentTarget.cash_amount + addCash);
      const systemDue = getSystemDue(paymentTarget);
      const nextPaid = round2(nextGcash + nextCash) >= systemDue;
      const nextPaidAt = nextPaid ? new Date().toISOString() : null;

      const { data, error } = await supabase
        .from("promo_bookings")
        .update({
          gcash_amount: nextGcash,
          cash_amount: nextCash,
          is_paid: nextPaid,
          paid_at: nextPaidAt,
        })
        .eq("id", paymentTarget.id)
        .select("id, is_paid, paid_at, gcash_amount, cash_amount")
        .single();

      if (error) {
        alert(`Payment failed: ${error.message}`);
        return;
      }

      const fresh = data as PromoBookingPaidUpdateRow;

      setRows((prev) =>
        prev.map((r) =>
          r.id === paymentTarget.id
            ? {
                ...r,
                gcash_amount: round2(toNumber(fresh.gcash_amount)),
                cash_amount: round2(toNumber(fresh.cash_amount)),
                is_paid: toBool(fresh.is_paid),
                paid_at: fresh.paid_at ?? null,
              }
            : r
        )
      );

      setSelected((prev) =>
        prev?.id === paymentTarget.id
          ? {
              ...prev,
              gcash_amount: round2(toNumber(fresh.gcash_amount)),
              cash_amount: round2(toNumber(fresh.cash_amount)),
              is_paid: toBool(fresh.is_paid),
              paid_at: fresh.paid_at ?? null,
            }
          : prev
      );

      setPaymentTarget(null);
      await syncPromoFinalPaid(paymentTarget.id);
    } finally {
      setSavingPayment(false);
    }
  };

  const openOrderPaymentModal = (row: PromoBookingRow): void => {
    setOrderPaymentTarget(row);
    setOrderGcashInput("0");
    setOrderCashInput("0");
  };

  const submitOrderPayment = async (): Promise<void> => {
    if (!orderPaymentTarget) return;

    const code = orderPaymentTarget.promo_code;
    const parents = getOrderParents(code);

    if (parents.length === 0) {
      alert("No order found for this promo code.");
      return;
    }

    try {
      setSavingOrderPayment(true);

      const addGcash = moneyFromStr(orderGcashInput);
      const addCash = moneyFromStr(orderCashInput);

      const current = getOrderPaidInfo(code);
      const nextTotalGcash = round2(current.gcash + addGcash);
      const nextTotalCash = round2(current.cash + addCash);

      const allocations = allocateAmountsAcrossOrders(parents, nextTotalGcash, nextTotalCash);

      for (const alloc of allocations) {
        const table = alloc.source === "addon_orders" ? "addon_orders" : "consignment_orders";
        const { error } = await supabase
          .from(table)
          .update({
            gcash_amount: alloc.gcash_amount,
            cash_amount: alloc.cash_amount,
            is_paid: alloc.is_paid,
            paid_at: alloc.paid_at,
          })
          .eq("id", alloc.id);

        if (error) {
          alert(`Order payment failed: ${error.message}`);
          return;
        }
      }

      await fetchOrdersForPromoCodes([String(code ?? "")]);
      setOrderPaymentTarget(null);
      await syncPromoFinalPaid(orderPaymentTarget.id);
    } finally {
      setSavingOrderPayment(false);
    }
  };

  const openDiscountModal = (row: PromoBookingRow): void => {
    setDiscountTarget(row);
    setDiscountKind(row.discount_kind);
    setDiscountValueInput(String(row.discount_value ?? 0));
    setDiscountReasonInput(row.discount_reason ?? "");
  };

  const submitDiscount = async (): Promise<void> => {
    if (!discountTarget) return;

    try {
      setSavingDiscount(true);

      const value = round2(toNumber(discountValueInput));
      const reason = discountReasonInput.trim() || null;

      const { error } = await supabase
        .from("promo_bookings")
        .update({
          discount_kind: discountKind,
          discount_value: value,
          discount_reason: reason,
        })
        .eq("id", discountTarget.id);

      if (error) {
        alert(`Discount update failed: ${error.message}`);
        return;
      }

      setRows((prev) =>
        prev.map((r) =>
          r.id === discountTarget.id
            ? {
                ...r,
                discount_kind: discountKind,
                discount_value: value,
                discount_reason: reason,
              }
            : r
        )
      );

      setSelected((prev) =>
        prev?.id === discountTarget.id
          ? {
              ...prev,
              discount_kind: discountKind,
              discount_value: value,
              discount_reason: reason,
            }
          : prev
      );

      setDiscountTarget(null);
      await syncPromoFinalPaid(discountTarget.id);
    } finally {
      setSavingDiscount(false);
    }
  };

  const togglePaidOnly = async (row: PromoBookingRow): Promise<void> => {
    try {
      setTogglingPaidId(row.id);

      const next = !row.is_paid;
      const nextPaidAt = next ? new Date().toISOString() : null;

      const { error } = await supabase
        .from("promo_bookings")
        .update({
          is_paid: next,
          paid_at: nextPaidAt,
        })
        .eq("id", row.id);

      if (error) {
        alert(`Paid toggle failed: ${error.message}`);
        return;
      }

      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id ? { ...r, is_paid: next, paid_at: nextPaidAt } : r
        )
      );

      setSelected((prev) =>
        prev?.id === row.id ? { ...prev, is_paid: next, paid_at: nextPaidAt } : prev
      );
    } finally {
      setTogglingPaidId(null);
    }
  };

  const submitCancelPromo = async (): Promise<void> => {
    if (!cancelTarget) return;

    const note = cancelDesc.trim();
    if (!note) {
      setCancelError("Cancellation reason is required.");
      return;
    }

    try {
      setCancelling(true);
      setCancelError("");

      const payload = {
        original_id: cancelTarget.id,
        description: note,
        created_at: cancelTarget.created_at,
        user_id: null,
        full_name: cancelTarget.full_name,
        phone_number: cancelTarget.phone_number,
        area: cancelTarget.area,
        package_id: cancelTarget.package_id,
        package_option_id: cancelTarget.package_option_id,
        seat_number: cancelTarget.seat_number,
        start_at: cancelTarget.start_at,
        end_at: cancelTarget.end_at,
        price: cancelTarget.price,
        status: getStatus(cancelTarget.start_at, cancelTarget.end_at).toLowerCase(),
        gcash_amount: cancelTarget.gcash_amount,
        cash_amount: cancelTarget.cash_amount,
        is_paid: cancelTarget.is_paid,
        paid_at: cancelTarget.paid_at,
        discount_reason: cancelTarget.discount_reason,
        discount_kind: cancelTarget.discount_kind,
        discount_value: cancelTarget.discount_value,
        promo_code: cancelTarget.promo_code,
        attempts_left: cancelTarget.attempts_left,
        max_attempts: cancelTarget.max_attempts,
        validity_end_at: cancelTarget.validity_end_at,
      };

      const { error: insertErr } = await supabase
        .from("promo_bookings_cancelled")
        .insert(payload);

      if (insertErr) {
        setCancelError(insertErr.message);
        return;
      }

      const { error: deleteErr } = await supabase
        .from("promo_bookings")
        .delete()
        .eq("id", cancelTarget.id);

      if (deleteErr) {
        setCancelError(deleteErr.message);
        return;
      }

      setRows((prev) => prev.filter((r) => r.id !== cancelTarget.id));
      setSelected((prev) => (prev?.id === cancelTarget.id ? null : prev));
      setSelectedOrderBooking((prev) => (prev?.id === cancelTarget.id ? null : prev));
      setCancelTarget(null);
      setCancelDesc("");
      alert("Promo cancelled successfully.");
    } finally {
      setCancelling(false);
    }
  };

  const filteredRows = useMemo(() => {
    const nowMs = tick;

    return rows.filter((r) => {
      if (!bookingCoversLocalDate(r.start_at, r.end_at, selectedDate)) return false;

      if (searchName.trim()) {
        const q = searchName.trim().toLowerCase();
        if (!String(r.full_name ?? "").toLowerCase().includes(q)) return false;
      }

      if (areaFilter !== "all" && r.area !== areaFilter) return false;

      if (areaFilter === "common_area" && commonDurationFilter !== "all") {
        if (getCommonAreaDurationBucket(r) !== commonDurationFilter) return false;
      }

      if (areaFilter === "conference_room" && conferenceDurationFilter !== "all") {
        if (getConferenceDurationBucket(r) !== conferenceDurationFilter) return false;
      }

      return true;
    }).sort((a, b) => {
      const sa = getStatus(a.start_at, a.end_at, nowMs);
      const sb = getStatus(b.start_at, b.end_at, nowMs);
      const order = { ONGOING: 0, UPCOMING: 1, FINISHED: 2 } as const;
      if (order[sa] !== order[sb]) return order[sa] - order[sb];
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [rows, selectedDate, searchName, areaFilter, commonDurationFilter, conferenceDurationFilter, tick]);

  const totalRows = filteredRows.length;
  const paidRows = filteredRows.filter(isFinalPaidRow).length;
  const unpaidRows = totalRows - paidRows;
  const systemTotal = round2(filteredRows.reduce((sum, r) => sum + getSystemDue(r), 0));
  const ordersTotal = round2(filteredRows.reduce((sum, r) => sum + getOrderDue(r.promo_code), 0));

  const currentOrderItems = selectedOrderBooking
    ? getOrderItems(selectedOrderBooking.promo_code)
    : [];

  const currentOrderParents = selectedOrderBooking
    ? getOrderParents(selectedOrderBooking.promo_code)
    : [];

  const selectedAttendanceLogs = attModalTarget ? logsFor(attModalTarget.id) : [];

  return (
    <div className="cpl-page">
      <div className="cpl-shell">
        <section className="cpl-hero">
          <div className="cpl-eyebrow">PROMO MANAGEMENT</div>
          <h1 className="cpl-title">Customer Promo List</h1>
          <p className="cpl-subtitle">
            Plain and clean promo booking records with attendance, payment, receipt, order tools, and customer view.
          </p>

          <div className="cpl-toolbar">
            <div className="cpl-control">
              <label>Date</label>
              <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
            </div>

            <div className="cpl-control">
              <label>Search Full Name</label>
              <input
                type="text"
                placeholder="Search promo name."
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
              />
            </div>

            <div className="cpl-control">
              <label>Area</label>
              <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value as AreaFilter)}>
                <option value="all">All</option>
                <option value="common_area">Common Area</option>
                <option value="conference_room">Conference Room</option>
              </select>
            </div>

            <div className="cpl-control">
              <label>
                {areaFilter === "conference_room" ? "Conference Duration" : "Common Area Duration"}
              </label>
              {areaFilter === "conference_room" ? (
                <select
                  value={conferenceDurationFilter}
                  onChange={(e) =>
                    setConferenceDurationFilter(e.target.value as ConferenceDurationFilter)
                  }
                >
                  <option value="all">All</option>
                  <option value="1_hour">1 Hour</option>
                  <option value="3_hours">3 Hours</option>
                  <option value="6_hours">6 Hours</option>
                  <option value="8_hours">8 Hours</option>
                </select>
              ) : (
                <select
                  value={commonDurationFilter}
                  onChange={(e) =>
                    setCommonDurationFilter(e.target.value as CommonDurationFilter)
                  }
                >
                  <option value="all">All</option>
                  <option value="1_day">1 Day</option>
                  <option value="week">Week</option>
                  <option value="half_month">Half Month</option>
                  <option value="month">Month</option>
                </select>
              )}
            </div>

            <div className="cpl-actions-top">
              <button
                className="cpl-btn cpl-btn-light"
                onClick={() => {
                  setSelectedDate(yyyyMmDdLocal(new Date()));
                  setSearchName("");
                  setAreaFilter("all");
                  setCommonDurationFilter("all");
                  setConferenceDurationFilter("all");
                }}
                type="button"
              >
                Clear
              </button>

              <button
                className="cpl-btn cpl-btn-dark"
                onClick={() => void refreshAll()}
                disabled={loading || refreshing}
                type="button"
              >
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
        </section>

        <section className="cpl-stats">
          <div className="cpl-stat-box">
            <span>Total Rows</span>
            <strong>{totalRows}</strong>
          </div>
          <div className="cpl-stat-box">
            <span>Paid</span>
            <strong>{paidRows}</strong>
          </div>
          <div className="cpl-stat-box">
            <span>Unpaid</span>
            <strong>{unpaidRows}</strong>
          </div>
          <div className="cpl-stat-box">
            <span>System Total</span>
            <strong>₱{systemTotal.toFixed(2)}</strong>
          </div>
          <div className="cpl-stat-box">
            <span>Orders Total</span>
            <strong>₱{ordersTotal.toFixed(2)}</strong>
          </div>
        </section>

        <section className="cpl-table-wrap">
          {loading ? (
            <div className="cpl-loading">
              <div className="cpl-spinner" />
              Loading promo records...
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="cpl-empty">No promo records found for this filter/date.</div>
          ) : (
            <div className="cpl-table-scroll">
              <table className="cpl-table">
                <thead>
                  <tr>
                    <th>Created</th>
                    <th>Customer Name</th>
                    <th>Phone #</th>
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
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const di = applyDiscount(row.price, row.discount_kind, row.discount_value);
                    const systemDue = round2(di.discountedCost);
                    const orderDue = round2(getOrderDue(row.promo_code));
                    const systemPay = getSystemPaidInfo(row);
                    const orderPay = getOrderPaidInfo(row.promo_code);
                    const status = getStatus(row.start_at, row.end_at, tick);
                    const lastLog = lastLogFor(row.id);
                    const expired = isExpired(row.validity_end_at);

                    return (
                      <tr key={row.id}>
                        <td>
                          <div className="cpl-stack">
                            <strong>{new Date(row.created_at).toLocaleDateString("en-PH")}</strong>
                            <span>{new Date(row.created_at).toLocaleTimeString("en-PH")}</span>
                          </div>
                        </td>

                        <td>
                          <div className="cpl-stack">
                            <strong>{row.full_name}</strong>
                            <span>{row.promo_code || "No Code"}</span>
                          </div>
                        </td>

                        <td>{safePhone(row.phone_number)}</td>
                        <td>{prettyArea(row.area)}</td>
                        <td>{seatLabel(row)}</td>
                        <td>{row.packages?.title || "—"}</td>
                        <td>
                          {row.package_options?.duration_value && row.package_options?.duration_unit
                            ? `${row.package_options?.option_name || "—"} • ${formatDuration(
                                Number(row.package_options.duration_value),
                                row.package_options.duration_unit
                              )}`
                            : row.package_options?.option_name || "—"}
                        </td>
                        <td>{new Date(row.start_at).toLocaleString("en-PH")}</td>
                        <td>{new Date(row.end_at).toLocaleString("en-PH")}</td>
                        <td className="cpl-strong">₱{systemDue.toFixed(2)}</td>
                        <td className="cpl-strong">₱{orderDue.toFixed(2)}</td>
                        <td>
                          <div className="cpl-stack">
                            <strong>{getDiscountTextFrom(row.discount_kind, row.discount_value)}</strong>
                            <span>{row.discount_reason || "—"}</span>
                          </div>
                        </td>
                        <td>
                          <span
                            className={`cpl-status-badge ${
                              status === "UPCOMING"
                                ? "cpl-status-upcoming"
                                : status === "ONGOING"
                                ? "cpl-status-ongoing"
                                : "cpl-status-finished"
                            }`}
                          >
                            {status}
                          </span>
                        </td>
                        <td>
                          <button
                            className={`cpl-paid-pill ${isFinalPaidRow(row) ? "paid" : "unpaid"}`}
                            onClick={() => void togglePaidOnly(row)}
                            disabled={togglingPaidId === row.id}
                            type="button"
                          >
                            {togglingPaidId === row.id
                              ? "..."
                              : isFinalPaidRow(row)
                              ? "PAID"
                              : "UNPAID"}
                          </button>
                        </td>
                        <td>
                          <div className="cpl-pay-card">
                            <strong>
                              GCash ₱{systemPay.gcash.toFixed(2)} / Cash ₱{systemPay.cash.toFixed(2)}
                            </strong>
                            <span>
                              {getSystemRemainingInfo(row).label}: ₱
                              {(getSystemRemainingInfo(row).label === "Remaining"
                                ? getSystemRemainingInfo(row).remaining
                                : getSystemRemainingInfo(row).change
                              ).toFixed(2)}
                            </span>
                            <button
                              className="cpl-btn-mini"
                              onClick={() => openPaymentModal(row)}
                              type="button"
                            >
                              System Payment
                            </button>
                          </div>
                        </td>
                        <td>
                          {hasOrder(row.promo_code) ? (
                            <div className="cpl-pay-card">
                              <strong>
                                GCash ₱{orderPay.gcash.toFixed(2)} / Cash ₱{orderPay.cash.toFixed(2)}
                              </strong>
                              <span>
                                {getOrderRemainingInfo(row.promo_code).label}: ₱
                                {(getOrderRemainingInfo(row.promo_code).label === "Remaining"
                                  ? getOrderRemainingInfo(row.promo_code).remaining
                                  : getOrderRemainingInfo(row.promo_code).change
                                ).toFixed(2)}
                              </span>
                              <button
                                className="cpl-btn-mini"
                                onClick={() => openOrderPaymentModal(row)}
                                type="button"
                              >
                                Order Payment
                              </button>
                            </div>
                          ) : (
                            <div className="cpl-empty cpl-empty-tight">No order</div>
                          )}
                        </td>
                        <td>
                          <div className="cpl-stack">
                            <strong>{row.promo_code || "—"}</strong>
                            <span>Attempts: {row.attempts_left}/{row.max_attempts}</span>
                            <span className={expired ? "cpl-expired" : ""}>
                              Valid Until: {row.validity_end_at ? new Date(row.validity_end_at).toLocaleString("en-PH") : "—"}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="cpl-action-stack">
                            <span>
                              {lastLog
                                ? `${lastLog.out_at ? "OUT" : "IN"} • ${new Date(
                                    lastLog.out_at || lastLog.in_at
                                  ).toLocaleString("en-PH")}`
                                : "No logs"}
                            </span>
                            <button
                              className="cpl-btn-mini"
                              onClick={() => setAttModalTarget(row)}
                              type="button"
                            >
                              View Attendance
                            </button>
                          </div>
                        </td>
                        <td>{row.discount_reason || "—"}</td>
                        <td>
                          <div className="cpl-action-stack">
                            <button className="cpl-btn-mini" onClick={() => setSelected(row)} type="button">
                              View Receipt
                            </button>
                            {hasOrder(row.promo_code) ? (
                              <button
                                className="cpl-btn-mini"
                                onClick={() => setSelectedOrderBooking(row)}
                                type="button"
                              >
                                View Order
                              </button>
                            ) : null}
                            <button className="cpl-btn-mini" onClick={() => openDiscountModal(row)} type="button">
                              Discount
                            </button>
                            <button
                              className="cpl-btn-mini"
                              onClick={() => {
                                const on = isCustomerViewOnFor(row.id);
                                void setCustomerViewRealtime(!on, !on ? row.id : null);
                              }}
                              type="button"
                            >
                              {isCustomerViewOnFor(row.id) ? "Stop Customer View" : "View to Customer"}
                            </button>
                            <button
                              className="cpl-btn-mini cpl-btn-mini-danger"
                              onClick={() => {
                                setCancelTarget(row);
                                setCancelDesc("");
                                setCancelError("");
                              }}
                              type="button"
                            >
                              Cancel Promo
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
      </div>

      <FixedCenterModal
        open={!!attModalTarget}
        title="Attendance"
        size="md"
        onClose={() => setAttModalTarget(null)}
      >
        {attModalTarget ? (
          <div className="cpl-attendance-wrap">
            <div className="cpl-att-head">
              <strong>{attModalTarget.full_name}</strong>
              <span>{attModalTarget.promo_code || "No Code"}</span>
            </div>

            {selectedAttendanceLogs.length === 0 ? (
              <div className="cpl-empty cpl-empty-tight">No attendance logs.</div>
            ) : (
              <div className="cpl-att-list">
                {selectedAttendanceLogs.map((r) => (
                  <div className="cpl-att-card" key={r.id}>
                    <div>
                      <strong>{r.out_at ? "OUT" : "IN"}</strong>
                      <span>Day: {r.local_day}</span>
                      <span>Stamp: {new Date(r.out_at || r.in_at).toLocaleString("en-PH")}</span>
                      <span>IN: {new Date(r.in_at).toLocaleString("en-PH")}</span>
                      <span>OUT: {r.out_at ? new Date(r.out_at).toLocaleString("en-PH") : "—"}</span>
                    </div>
                    <div>
                      <strong>{r.auto_out ? "AUTO" : "MANUAL"}</strong>
                      <span>{r.note || "No note"}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </FixedCenterModal>

      <FixedCenterModal
        open={!!selectedOrderBooking}
        title="Order List"
        size="lg"
        onClose={() => setSelectedOrderBooking(null)}
      >
        {selectedOrderBooking ? (
          <div className="cpl-order-wrap">
            <div className="cpl-order-head">
              <img src={logo} alt="Me Tyme Lounge" className="cpl-logo" />
              <div>
                <h4>{selectedOrderBooking.full_name}</h4>
                <p>{selectedOrderBooking.promo_code || "No booking code"}</p>
              </div>
            </div>

            {currentOrderItems.length === 0 ? (
              <div className="cpl-empty cpl-empty-tight">No order items found.</div>
            ) : (
              <div className="cpl-order-list">
                {currentOrderItems.map((item) => (
                  <div key={item.id} className="cpl-order-card">
                    <div className="cpl-order-main">
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.name} className="cpl-order-thumb" />
                      ) : (
                        <div className="cpl-order-thumb cpl-order-thumb-empty">No Image</div>
                      )}

                      <div className="cpl-order-text">
                        <strong>{item.name}</strong>
                        <span>
                          {item.category || "—"}
                          {item.size ? ` • ${item.size}` : ""}
                        </span>
                        <span>
                          Qty {item.quantity} • ₱{item.price.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <div className="cpl-order-side">
                      <div>₱{item.subtotal.toFixed(2)}</div>
                      <button
                        className="cpl-btn-mini cpl-btn-mini-danger"
                        onClick={() => openOrderCancelModal(selectedOrderBooking, item)}
                        type="button"
                      >
                        Cancel Item
                      </button>
                    </div>
                  </div>
                ))}

                <div className="cpl-order-total-line">
                  Total Order: <strong>₱{getOrderDue(selectedOrderBooking.promo_code).toFixed(2)}</strong>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </FixedCenterModal>

      <FixedCenterModal
        open={!!paymentTarget}
        title="System Payment"
        size="sm"
        onClose={() => setPaymentTarget(null)}
      >
        {paymentTarget ? (
          <div className="cpl-form-stack">
            <div className="cpl-form-field">
              <label>GCash Amount</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={gcashInput}
                onChange={(e) => setGcashInput(e.target.value)}
              />
            </div>

            <div className="cpl-form-field">
              <label>Cash Amount</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={cashInput}
                onChange={(e) => setCashInput(e.target.value)}
              />
            </div>

            <div className="cpl-modal-actions">
              <button className="cpl-btn cpl-btn-light" onClick={() => setPaymentTarget(null)} type="button">
                Close
              </button>
              <button
                className="cpl-btn cpl-btn-dark"
                onClick={() => void submitSystemPayment()}
                disabled={savingPayment}
                type="button"
              >
                {savingPayment ? "Saving..." : "Save Payment"}
              </button>
            </div>
          </div>
        ) : null}
      </FixedCenterModal>

      <FixedCenterModal
        open={!!orderPaymentTarget}
        title="Order Payment"
        size="sm"
        onClose={() => setOrderPaymentTarget(null)}
      >
        {orderPaymentTarget ? (
          <div className="cpl-form-stack">
            <div className="cpl-form-field">
              <label>GCash Amount</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={orderGcashInput}
                onChange={(e) => setOrderGcashInput(e.target.value)}
              />
            </div>

            <div className="cpl-form-field">
              <label>Cash Amount</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={orderCashInput}
                onChange={(e) => setOrderCashInput(e.target.value)}
              />
            </div>

            <div className="cpl-modal-actions">
              <button className="cpl-btn cpl-btn-light" onClick={() => setOrderPaymentTarget(null)} type="button">
                Close
              </button>
              <button
                className="cpl-btn cpl-btn-dark"
                onClick={() => void submitOrderPayment()}
                disabled={savingOrderPayment}
                type="button"
              >
                {savingOrderPayment ? "Saving..." : "Save Payment"}
              </button>
            </div>
          </div>
        ) : null}
      </FixedCenterModal>

      <FixedCenterModal
        open={!!discountTarget}
        title="Discount"
        size="sm"
        onClose={() => setDiscountTarget(null)}
      >
        {discountTarget ? (
          <div className="cpl-form-stack">
            <div className="cpl-form-field">
              <label>Discount Kind</label>
              <select
                value={discountKind}
                onChange={(e) => setDiscountKind(e.target.value as DiscountKind)}
              >
                <option value="none">None</option>
                <option value="percent">Percent</option>
                <option value="amount">Amount</option>
              </select>
            </div>

            <div className="cpl-form-field">
              <label>Discount Value</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={discountValueInput}
                onChange={(e) => setDiscountValueInput(e.target.value)}
              />
            </div>

            <div className="cpl-form-field">
              <label>Discount Reason</label>
              <textarea
                value={discountReasonInput}
                onChange={(e) => setDiscountReasonInput(e.target.value)}
                rows={4}
              />
            </div>

            <div className="cpl-modal-actions">
              <button className="cpl-btn cpl-btn-light" onClick={() => setDiscountTarget(null)} type="button">
                Close
              </button>
              <button
                className="cpl-btn cpl-btn-dark"
                onClick={() => void submitDiscount()}
                disabled={savingDiscount}
                type="button"
              >
                {savingDiscount ? "Saving..." : "Save Discount"}
              </button>
            </div>
          </div>
        ) : null}
      </FixedCenterModal>

      <FixedCenterModal
        open={!!cancelTarget}
        title="Cancel Promo"
        size="sm"
        onClose={() => setCancelTarget(null)}
      >
        {cancelTarget ? (
          <div className="cpl-form-stack">
            <div className="cpl-form-field">
              <label>Cancellation Reason</label>
              <textarea
                value={cancelDesc}
                onChange={(e) => setCancelDesc(e.target.value)}
                rows={4}
              />
            </div>

            {cancelError ? <div className="cpl-error">{cancelError}</div> : null}

            <div className="cpl-modal-actions">
              <button className="cpl-btn cpl-btn-light" onClick={() => setCancelTarget(null)} type="button">
                Close
              </button>
              <button
                className="cpl-btn cpl-btn-danger"
                onClick={() => void submitCancelPromo()}
                disabled={cancelling}
                type="button"
              >
                {cancelling ? "Cancelling..." : "Confirm Cancel"}
              </button>
            </div>
          </div>
        ) : null}
      </FixedCenterModal>

      <FixedCenterModal
        open={!!orderCancelTarget}
        title="Cancel Order Item"
        size="sm"
        onClose={() => setOrderCancelTarget(null)}
      >
        {orderCancelTarget ? (
          <div className="cpl-form-stack">
            <div className="cpl-form-field">
              <label>Cancellation Note</label>
              <textarea
                value={orderCancelNote}
                onChange={(e) => setOrderCancelNote(e.target.value)}
                rows={4}
              />
            </div>

            <div className="cpl-modal-actions">
              <button className="cpl-btn cpl-btn-light" onClick={() => setOrderCancelTarget(null)} type="button">
                Close
              </button>
              <button
                className="cpl-btn cpl-btn-danger"
                onClick={() => void submitOrderItemCancel()}
                disabled={cancellingOrderItemId === orderCancelTarget.item.id}
                type="button"
              >
                {cancellingOrderItemId === orderCancelTarget.item.id ? "Cancelling..." : "Confirm Cancel"}
              </button>
            </div>
          </div>
        ) : null}
      </FixedCenterModal>

      <FixedCenterModal
        open={!!selected}
        title=""
        size="sm"
        hideClose={true}
        onClose={() => setSelected(null)}
      >
        {selected ? (
          <div className="cpl-receipt">
            <div className="cpl-receipt-head">
              <img src={logo} alt="Me Tyme Lounge" className="cpl-receipt-logo" />
              <div className="cpl-receipt-brand-top">ME TYME LOUNGE</div>
              <div className="cpl-receipt-brand-title">Promo Receipt</div>
            </div>

            <div className="cpl-receipt-block">
              <div className="cpl-receipt-row">
                <span>Name</span>
                <strong>{selected.full_name}</strong>
              </div>
              <div className="cpl-receipt-row">
                <span>Phone #</span>
                <strong>{safePhone(selected.phone_number)}</strong>
              </div>
              <div className="cpl-receipt-row">
                <span>Area</span>
                <strong>{prettyArea(selected.area)}</strong>
              </div>
              <div className="cpl-receipt-row">
                <span>Seat</span>
                <strong>{seatLabel(selected)}</strong>
              </div>
              <div className="cpl-receipt-row">
                <span>Package</span>
                <strong>{selected.packages?.title || "—"}</strong>
              </div>
              <div className="cpl-receipt-row">
                <span>Option</span>
                <strong>
                  {selected.package_options?.duration_value && selected.package_options?.duration_unit
                    ? `${selected.package_options?.option_name || "—"} • ${formatDuration(
                        Number(selected.package_options.duration_value),
                        selected.package_options.duration_unit
                      )}`
                    : selected.package_options?.option_name || "—"}
                </strong>
              </div>
              <div className="cpl-receipt-row">
                <span>Start</span>
                <strong>{new Date(selected.start_at).toLocaleString("en-PH")}</strong>
              </div>
              <div className="cpl-receipt-row">
                <span>End</span>
                <strong>{new Date(selected.end_at).toLocaleString("en-PH")}</strong>
              </div>
              <div className="cpl-receipt-row">
                <span>Code</span>
                <strong>{selected.promo_code || "—"}</strong>
              </div>
              <div className="cpl-receipt-row">
                <span>Attendance</span>
                <strong>{logsFor(selected.id).length}</strong>
              </div>
            </div>

            {(() => {
              const di = applyDiscount(selected.price, selected.discount_kind, selected.discount_value);
              const systemDue = getSystemDue(selected);
              const orderDue = getOrderDue(selected.promo_code);
              const systemPay = getSystemPaidInfo(selected);
              const orderPay = getOrderPaidInfo(selected.promo_code);
              const orderItems = getOrderItems(selected.promo_code);

              return (
                <>
                  <div className="cpl-receipt-block">
                    <div className="cpl-receipt-row">
                      <span>System Cost (Before)</span>
                      <strong>₱{selected.price.toFixed(2)}</strong>
                    </div>
                    <div className="cpl-receipt-row">
                      <span>Discount</span>
                      <strong>{getDiscountTextFrom(selected.discount_kind, selected.discount_value)}</strong>
                    </div>
                    <div className="cpl-receipt-row">
                      <span>Discount Amount</span>
                      <strong>₱{di.discountAmount.toFixed(2)}</strong>
                    </div>
                    <div className="cpl-receipt-row">
                      <span>System Cost</span>
                      <strong>₱{systemDue.toFixed(2)}</strong>
                    </div>
                    <div className="cpl-receipt-row">
                      <span>Order Total</span>
                      <strong>₱{orderDue.toFixed(2)}</strong>
                    </div>

                    {orderItems.length > 0 ? (
                      <>
                        <div className="cpl-receipt-section-title">Order List</div>
                        {orderItems.map((item) => (
                          <div className="cpl-receipt-row" key={item.id}>
                            <span>{item.name} × {item.quantity}</span>
                            <strong>₱{item.subtotal.toFixed(2)}</strong>
                          </div>
                        ))}
                      </>
                    ) : null}
                  </div>

                  <div className="cpl-receipt-block">
                    <div className="cpl-receipt-row">
                      <span>System Payment</span>
                      <strong>GCash ₱{systemPay.gcash.toFixed(2)} / Cash ₱{systemPay.cash.toFixed(2)}</strong>
                    </div>

                    {orderDue > 0 ? (
                      <div className="cpl-receipt-row">
                        <span>Order Payment</span>
                        <strong>GCash ₱{orderPay.gcash.toFixed(2)} / Cash ₱{orderPay.cash.toFixed(2)}</strong>
                      </div>
                    ) : null}

                    <div className="cpl-receipt-row">
                      <span>Status</span>
                      <strong className={isFinalPaidRow(selected) ? "cpl-receipt-status paid" : "cpl-receipt-status unpaid"}>
                        {isFinalPaidRow(selected) ? "PAID" : "UNPAID"}
                      </strong>
                    </div>
                  </div>

                  <div className="cpl-receipt-total">
                    <span>Total System Cost</span>
                    <strong>₱{systemDue.toFixed(2)}</strong>
                  </div>

                  <div className="cpl-receipt-total">
                    <span>Total Order</span>
                    <strong>₱{orderDue.toFixed(2)}</strong>
                  </div>

                  <div className="cpl-receipt-block">
                    <div className="cpl-receipt-row">
                      <span>Overall Paid</span>
                      <strong>₱{getGrandPaid(selected).toFixed(2)}</strong>
                    </div>
                    <div className="cpl-receipt-row">
                      <span>{getGrandBalanceInfo(selected).label}</span>
                      <strong>
                        ₱
                        {(
                          getGrandBalanceInfo(selected).label === "Overall Remaining"
                            ? getGrandBalanceInfo(selected).remaining
                            : getGrandBalanceInfo(selected).change
                        ).toFixed(2)}
                      </strong>
                    </div>
                  </div>

                  <div className="cpl-receipt-total">
                    <span>Grand Total</span>
                    <strong>₱{getGrandDue(selected).toFixed(2)}</strong>
                  </div>
                </>
              );
            })()}

            <div className="cpl-modal-actions">
              <button
                className="cpl-btn cpl-btn-dark"
                onClick={() => {
                  const on = isCustomerViewOnFor(selected.id);
                  void setCustomerViewRealtime(!on, !on ? selected.id : null);
                }}
                type="button"
              >
                {isCustomerViewOnFor(selected.id) ? "Stop View to Customer" : "View to Customer"}
              </button>

              <button className="cpl-btn cpl-btn-light" onClick={() => setSelected(null)} type="button">
                Close
              </button>
            </div>
          </div>
        ) : null}
      </FixedCenterModal>
    </div>
  );
};

export default Customer_Promo_List;