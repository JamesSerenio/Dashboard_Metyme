import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../utils/supabaseClient";
import logo from "../assets/study_hub.png";

// Excel export
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

import "../styles/Admin_customer_list.css";

const HOURLY_RATE = 20;
const FREE_MINUTES = 0;

type CustomerViewRow = {
  id: number;
  session_id: string | null;
  enabled: boolean;
  updated_at: string;
};

type DiscountKind = "none" | "percent" | "amount";
type FilterMode = "day" | "week" | "month";

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
  id_number?: string | null;
  seat_number: string;

  promo_booking_id?: string | null;
  booking_code?: string | null;

  down_payment?: number | string | null;

  discount_kind?: DiscountKind;
  discount_value?: number | string;
  discount_reason?: string | null;

  gcash_amount?: number | string;
  cash_amount?: number | string;

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

type CancelOrderTarget = {
  session: CustomerSession;
  item: OrderItemView;
};

/* =========================
   Raw row types for strict TS
========================= */
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

/* =========================
   Date / Range helpers
========================= */
const pad2 = (n: number): string => String(n).padStart(2, "0");

const yyyyMmDdLocal = (d: Date): string => {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
};

const yyyyMmLocal = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

const displayDateInput = (ymd: string): string => {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${m}/${d}/${y}`;
};

const displayDateNice = (ymd: string): string => {
  if (!ymd) return "";
  const dt = new Date(`${ymd}T00:00:00`);
  if (!Number.isFinite(dt.getTime())) return ymd;
  return dt.toLocaleDateString();
};

const startOfLocalDay = (d: Date): Date => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const addDays = (d: Date, days: number): Date =>
  new Date(d.getTime() + days * 24 * 60 * 60 * 1000);

const getWeekRangeMonSunKeys = (anchorYmd: string): { startKey: string; endKey: string } => {
  const base = new Date(`${anchorYmd}T00:00:00`);
  const day = base.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const start = startOfLocalDay(addDays(base, diffToMon));
  const endInc = addDays(start, 6);
  return { startKey: yyyyMmDdLocal(start), endKey: yyyyMmDdLocal(endInc) };
};

const getMonthRangeKeys = (
  anchorYmd: string
): { startKey: string; endKey: string; monthLabel: string } => {
  const base = new Date(`${anchorYmd}T00:00:00`);
  const y = base.getFullYear();
  const m = base.getMonth();
  const start = new Date(y, m, 1, 0, 0, 0, 0);
  const endExclusive = new Date(y, m + 1, 1, 0, 0, 0, 0);
  const endInc = new Date(endExclusive.getTime() - 24 * 60 * 60 * 1000);
  return { startKey: yyyyMmDdLocal(start), endKey: yyyyMmDdLocal(endInc), monthLabel: yyyyMmLocal(base) };
};

const rangeFromMode = (
  mode: FilterMode,
  anchorYmd: string
): { startKey: string; endKey: string; label: string; fileLabel: string } => {
  if (mode === "day") {
    return { startKey: anchorYmd, endKey: anchorYmd, label: anchorYmd, fileLabel: anchorYmd };
  }
  if (mode === "week") {
    const w = getWeekRangeMonSunKeys(anchorYmd);
    return {
      startKey: w.startKey,
      endKey: w.endKey,
      label: `${w.startKey} to ${w.endKey} (Mon-Sun)`,
      fileLabel: `${w.startKey}_to_${w.endKey}`,
    };
  }
  const m = getMonthRangeKeys(anchorYmd);
  return {
    startKey: m.startKey,
    endKey: m.endKey,
    label: `${m.monthLabel} (${m.startKey} to ${m.endKey})`,
    fileLabel: m.monthLabel,
  };
};

/* =========================
   Misc helpers
========================= */
const formatTimeText = (iso: string): string => {
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return "";
  return dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
    return { discountedCost: wholePeso(finalRaw), discountAmount: wholePeso(discRaw) };
  }

  if (kind === "amount") {
    const discRaw = Math.min(cost, v);
    const finalRaw = Math.max(0, cost - discRaw);
    return { discountedCost: wholePeso(finalRaw), discountAmount: wholePeso(discRaw) };
  }

  return { discountedCost: wholePeso(cost), discountAmount: 0 };
};

/* =========================
   CROSS-DEVICE VIEW HELPERS
========================= */
const VIEW_ROW_ID = 1;

const setCustomerViewState = async (enabled: boolean, sessionId: string | null): Promise<void> => {
  const { error } = await supabase
    .from("customer_view_state")
    .update({
      enabled,
      session_id: enabled ? sessionId : null,
    })
    .eq("id", VIEW_ROW_ID);

  if (error) throw error;
};

const isCustomerViewOnForSession = (
  active: CustomerViewRow | null,
  sessionId: string
): boolean => {
  if (!active) return false;
  if (!active.enabled) return false;
  return String(active.session_id ?? "") === String(sessionId);
};

/* =========================
   Excel helpers
========================= */
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

/* =========================
   Modal portal
========================= */
const CenterModal: React.FC<{
  open: boolean;
  title: string;
  onClose: () => void;
  size?: "sm" | "md" | "lg" | "xl";
  children: React.ReactNode;
}> = ({ open, title, onClose, size = "md", children }) => {
  useEffect(() => {
    if (!open) return;

    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="acl-modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`acl-modal-card acl-modal-${size}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="acl-modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
};

const Admin_customer_list: React.FC = () => {
  const [sessions, setSessions] = useState<CustomerSession[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [selectedSession, setSelectedSession] = useState<CustomerSession | null>(null);
  const [selectedOrderSession, setSelectedOrderSession] = useState<CustomerSession | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);

  const [activeView, setActiveView] = useState<CustomerViewRow | null>(null);
  const [viewBusy, setViewBusy] = useState<boolean>(false);

  const [cancelTarget, setCancelTarget] = useState<CustomerSession | null>(null);
  const [cancelReason, setCancelReason] = useState<string>("");
  const [cancellingBusy, setCancellingBusy] = useState<boolean>(false);

  const [orderCancelTarget, setOrderCancelTarget] = useState<CancelOrderTarget | null>(null);
  const [orderCancelNote, setOrderCancelNote] = useState<string>("");
  const [cancellingOrderItemId, setCancellingOrderItemId] = useState<string | null>(null);

  const [filterMode, setFilterMode] = useState<FilterMode>("day");
  const [anchorDate, setAnchorDate] = useState<string>(yyyyMmDdLocal(new Date()));
  const activeRange = useMemo(() => rangeFromMode(filterMode, anchorDate), [filterMode, anchorDate]);

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

  const [exporting, setExporting] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const [deleteRangeOpen, setDeleteRangeOpen] = useState<boolean>(false);
  const [deletingByRange, setDeletingByRange] = useState<boolean>(false);

  const [sessionOrders, setSessionOrders] = useState<SessionOrdersMap>({});
  const [orderPayments, setOrderPayments] = useState<Record<string, CustomerOrderPayment>>({});

  const anyModalOpen =
    !!selectedSession ||
    !!selectedOrderSession ||
    !!discountTarget ||
    !!dpTarget ||
    !!paymentTarget ||
    !!orderPaymentTarget ||
    !!cancelTarget ||
    !!orderCancelTarget ||
    deleteRangeOpen;

  useEffect(() => {
    void initLoad();
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
    void loadRangeData();
  }, [activeRange.startKey, activeRange.endKey]);

  useEffect(() => {
    if (!anyModalOpen) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedSession) void closeReceipt();
        else if (selectedOrderSession) setSelectedOrderSession(null);
        else if (discountTarget) setDiscountTarget(null);
        else if (dpTarget) setDpTarget(null);
        else if (paymentTarget) setPaymentTarget(null);
        else if (orderPaymentTarget) setOrderPaymentTarget(null);
        else if (cancelTarget) setCancelTarget(null);
        else if (orderCancelTarget) setOrderCancelTarget(null);
        else if (deleteRangeOpen) setDeleteRangeOpen(false);
      }
    };

    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [
    anyModalOpen,
    selectedSession,
    selectedOrderSession,
    discountTarget,
    dpTarget,
    paymentTarget,
    orderPaymentTarget,
    cancelTarget,
    orderCancelTarget,
    deleteRangeOpen,
  ]);

  const initLoad = async (): Promise<void> => {
    await Promise.all([loadRangeData(), readActiveCustomerView()]);
  };

  const loadRangeData = async (): Promise<void> => {
    const loaded = await fetchCustomerSessionsByRange(activeRange.startKey, activeRange.endKey);
    await fetchOrdersForSessions(loaded);
    await fetchOrderPayments(loaded);
    await syncSessionPaidStates(loaded);
  };

  const filteredSessions = useMemo(() => {
    const q = searchName.trim().toLowerCase();

    return sessions
      .filter((s) => {
        if (!q) return true;
        const name = String(s.full_name ?? "").toLowerCase();
        const code = String(s.booking_code ?? "").toLowerCase();
        return name.includes(q) || code.includes(q);
      })
      .sort((a, b) => {
        const dateCompare = String(b.date ?? "").localeCompare(String(a.date ?? ""));
        if (dateCompare !== 0) return dateCompare;

        const aTime = new Date(a.time_started).getTime();
        const bTime = new Date(b.time_started).getTime();

        const aValid = Number.isFinite(aTime);
        const bValid = Number.isFinite(bTime);

        if (!aValid && !bValid) return 0;
        if (!aValid) return 1;
        if (!bValid) return -1;

        return aTime - bTime;
      });
  }, [sessions, searchName]);

  const fetchCustomerSessionsByRange = async (
    startKey: string,
    endKey: string
  ): Promise<CustomerSession[]> => {
    setLoading(true);

    const { data, error } = await supabase
      .from("customer_sessions")
      .select("*")
      .eq("reservation", "no")
      .gte("date", startKey)
      .lte("date", endKey)
      .order("date", { ascending: false });

    if (error) {
      console.error(error);
      alert("Error loading customer lists");
      setSessions([]);
      setLoading(false);
      return [];
    }

    const rows = ((data ?? []) as CustomerSession[]) || [];
    setSessions(rows);
    setLoading(false);
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

  const refreshAll = async (): Promise<void> => {
    try {
      setRefreshing(true);
      const loaded = await fetchCustomerSessionsByRange(activeRange.startKey, activeRange.endKey);
      await Promise.all([fetchOrdersForSessions(loaded), fetchOrderPayments(loaded), readActiveCustomerView()]);
      await syncSessionPaidStates(loaded);
    } catch (e) {
      console.error(e);
      alert("Refresh failed.");
    } finally {
      setRefreshing(false);
    }
  };

  const readActiveCustomerView = async (): Promise<void> => {
    const { data, error } = await supabase
      .from("customer_view_state")
      .select("id, session_id, enabled, updated_at")
      .eq("id", VIEW_ROW_ID)
      .maybeSingle();

    if (error) {
      console.error(error);
      setActiveView(null);
      return;
    }

    const row = (data ?? null) as CustomerViewRow | null;
    setActiveView(row);
  };

  const subscribeCustomerViewRealtime = (): (() => void) => {
    const channel = supabase
      .channel("customer_view_state_changes_admin_customer_list_react")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customer_view_state" },
        () => {
          void readActiveCustomerView();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  };

  const phoneText = (s: CustomerSession): string => {
    const p = String(s.phone_number ?? "").trim();
    return p || "N/A";
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

  const getBaseSystemCost = (s: CustomerSession): number =>
    isOpenTimeSession(s) ? getLiveTotalCost(s) : wholePeso(toMoney(s.total_amount));

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

  const getSystemDue = (s: CustomerSession): number =>
    wholePeso(Math.max(0, getSessionSystemCost(s)));

  const getOrderDue = (s: CustomerSession): number =>
    wholePeso(Math.max(0, getOrdersTotal(s)));

  const getGrandDue = (s: CustomerSession): number =>
    wholePeso(getSystemDue(s) + getOrderDue(s));

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
    if (isOpenTimeSession(s)) return "Ongoing";
    const end = new Date(s.time_ended);
    if (!Number.isFinite(end.getTime())) return "Finished";
    return new Date() > end ? "Finished" : "Ongoing";
  };

  const getUsedMinutesForReceipt = (s: CustomerSession): number => {
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

      const paidAtValue = nextFinalPaid
        ? paymentTarget.paid_at ?? new Date().toISOString()
        : null;

      const { data: updated, error } = await supabase
        .from("customer_sessions")
        .update({
          gcash_amount: g,
          cash_amount: c,
          is_paid: nextFinalPaid,
          paid_at: paidAtValue,
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
      setSelectedOrderSession((prev) => (prev?.id === paymentTarget.id ? updatedRow : prev));
      setPaymentTarget(null);
    } catch (e) {
      console.error(e);
      alert("Save payment failed.");
    } finally {
      setSavingPayment(false);
    }
  };

  const ensureOrderPaymentRow = async (
    session: CustomerSession
  ): Promise<CustomerOrderPayment | null> => {
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
    setOrderPayments((prev) => ({
      ...prev,
      [bookingCode]: row,
    }));

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

      const existingOrderRow = getOrderPaymentRow(orderPaymentTarget);
      const orderPaidAtValue = orderPaid
        ? existingOrderRow?.paid_at ?? new Date().toISOString()
        : null;

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
            paid_at: orderPaidAtValue,
          },
          { onConflict: "booking_code" }
        )
        .select("*")
        .single();

      if (payErr || !paymentRow) {
        alert(`Save order payment error: ${payErr?.message ?? "Unknown error"}`);
        return;
      }

      setOrderPayments((prev) => ({
        ...prev,
        [bookingCode]: paymentRow as CustomerOrderPayment,
      }));

      const systemPaid = getSystemIsPaid(orderPaymentTarget);
      const nextFinalPaid = systemPaid && orderPaid;

      const sessionPaidAtValue = nextFinalPaid
        ? orderPaymentTarget.paid_at ?? new Date().toISOString()
        : null;

      const { data: updatedSession, error: updErr } = await supabase
        .from("customer_sessions")
        .update({
          is_paid: nextFinalPaid,
          paid_at: sessionPaidAtValue,
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
    } catch (e) {
      console.error(e);
      alert("Save order payment failed.");
    } finally {
      setSavingOrderPayment(false);
    }
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
      setOrderPayments((prev) => ({
        ...prev,
        [bookingCode]: data as CustomerOrderPayment,
      }));
    }
  };

  const openOrderCancelModal = (session: CustomerSession, item: OrderItemView): void => {
    setOrderCancelTarget({ session, item });
    setOrderCancelNote("");
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

      const { error: legacyDeleteErr } = await supabase
        .from("customer_session_add_ons")
        .delete()
        .eq("add_on_id", item.source_item_id)
        .eq("full_name", session.full_name)
        .eq("seat_number", session.seat_number);

      if (legacyDeleteErr) {
        alert(`Cancelled copy saved, but legacy add-on delete failed: ${legacyDeleteErr.message}`);
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

      const loaded = await fetchCustomerSessionsByRange(activeRange.startKey, activeRange.endKey);
      await fetchOrdersForSessions(loaded);
      await fetchOrderPayments(loaded);

      const freshSession = loaded.find((s) => s.id === session.id) ?? session;
      await refreshOrderPaymentTotalForSession(freshSession);
      await syncSingleSessionPaidState(freshSession);

      setOrderCancelTarget(null);
      setOrderCancelNote("");

      if (selectedOrderSession) {
        const freshOrderSession = loaded.find((s) => s.id === selectedOrderSession.id) ?? null;
        setSelectedOrderSession(freshOrderSession);
      }

      if (selectedSession) {
        const freshReceiptSession = loaded.find((s) => s.id === selectedSession.id) ?? null;
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

  const openCancelModal = (s: CustomerSession): void => {
    setCancelTarget(s);
    setCancelReason("");
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
        customer_type: row.customer_type,
        customer_field: row.customer_field ?? null,
        has_id: row.has_id,
        hour_avail: row.hour_avail,
        time_started: row.time_started,
        time_ended: row.time_ended ?? row.time_started,

        total_time: toMoney(row.total_time),
        total_amount: toMoney(row.total_amount),

        reservation: row.reservation ?? "no",
        reservation_date: row.reservation_date ?? null,

        id_number: row.id_number ?? null,
        seat_number: String(row.seat_number ?? "").trim() || "N/A",

        promo_booking_id: row.promo_booking_id ?? null,
        booking_code: row.booking_code ?? null,

        discount_kind: row.discount_kind ?? "none",
        discount_value: Math.max(0, toMoney(row.discount_value ?? 0)),
        discount_reason: row.discount_reason ?? null,

        gcash_amount: Math.max(0, toMoney(row.gcash_amount ?? 0)),
        cash_amount: Math.max(0, toMoney(row.cash_amount ?? 0)),
        is_paid: toBool(row.is_paid),
        paid_at: row.paid_at ?? null,

        phone_number: row.phone_number ?? null,
        down_payment: row.down_payment == null ? null : wholePeso(toMoney(row.down_payment)),
      };

      const { error: insertErr } = await supabase.from("customer_sessions_cancelled").insert(cancelPayload);

      if (insertErr) {
        alert(`Cancel failed: ${insertErr.message}`);
        return;
      }

      const bookingCode = String(row.booking_code ?? "").trim().toUpperCase();
      if (bookingCode) {
        await supabase.from("customer_order_payments").delete().eq("booking_code", bookingCode);
      }

      const seatText = String(row.seat_number ?? "").trim();
      const hasSeat = seatText !== "" && seatText.toUpperCase() !== "N/A";

      if (hasSeat) {
        const seatList = seatText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

        if (seatList.length > 0) {
          const startIso = row.time_started;
          const endIso = row.time_ended ?? row.time_started;

          const { error: seatDeleteErr } = await supabase
            .from("seat_blocked_times")
            .delete()
            .in("seat_number", seatList)
            .lt("start_at", endIso)
            .gt("end_at", startIso);

          if (seatDeleteErr) {
            console.error("seat_blocked_times delete error:", seatDeleteErr);
          }
        }
      }

      if (isCustomerViewOnForSession(activeView, row.id)) {
        await setCustomerViewState(false, null);
      }

      const { error: deleteErr } = await supabase.from("customer_sessions").delete().eq("id", row.id);

      if (deleteErr) {
        alert(`Cancelled copy saved, but delete failed: ${deleteErr.message}`);
        return;
      }

      setSessions((prev) => prev.filter((x) => x.id !== row.id));
      setSelectedSession((prev) => (prev?.id === row.id ? null : prev));
      setSelectedOrderSession((prev) => (prev?.id === row.id ? null : prev));

      const code = String(row.booking_code ?? "").trim().toUpperCase();
      if (code) {
        setSessionOrders((prev) => {
          const next = { ...prev };
          delete next[code];
          return next;
        });

        setOrderPayments((prev) => {
          const next = { ...prev };
          delete next[code];
          return next;
        });
      }

      await readActiveCustomerView();

      setCancelTarget(null);
      setCancelReason("");
      alert("Session cancelled successfully.");
    } catch (e) {
      console.error(e);
      alert("Cancel failed.");
    } finally {
      setCancellingBusy(false);
    }
  };

  const openDeleteByRangeModal = (): void => {
    if (loading || refreshing || exporting) return;
    if (filteredSessions.length === 0) {
      alert("No records to delete in this range.");
      return;
    }
    setDeleteRangeOpen(true);
  };

  const deleteByRange = async (): Promise<void> => {
    try {
      setDeletingByRange(true);

      if (activeView?.enabled && activeView.session_id) {
        const willDelete = sessions.some((s) => String(s.id) === String(activeView.session_id));
        if (willDelete) {
          try {
            await setCustomerViewState(false, null);
          } catch {
            //
          }
        }
      }

      const codesToDelete = Array.from(
        new Set(
          sessions
            .map((s) => String(s.booking_code ?? "").trim().toUpperCase())
            .filter(Boolean)
        )
      );

      const { error } = await supabase
        .from("customer_sessions")
        .delete()
        .eq("reservation", "no")
        .gte("date", activeRange.startKey)
        .lte("date", activeRange.endKey);

      if (error) {
        alert(`Delete failed: ${error.message}`);
        return;
      }

      if (codesToDelete.length > 0) {
        await supabase.from("customer_order_payments").delete().in("booking_code", codesToDelete);
      }

      setSessions([]);
      setSelectedSession(null);
      setSelectedOrderSession(null);
      setSessionOrders({});
      setOrderPayments({});

      await readActiveCustomerView();

      setDeleteRangeOpen(false);
      alert(`Deleted all non-reservation records for ${filterMode.toUpperCase()} range: ${activeRange.label}`);
    } catch (e) {
      console.error(e);
      alert("Delete by range failed.");
    } finally {
      setDeletingByRange(false);
    }
  };

  const closeReceipt = async (): Promise<void> => {
    if (selectedSession && isCustomerViewOnForSession(activeView, selectedSession.id)) {
      try {
        setViewBusy(true);
        await setCustomerViewState(false, null);
        await readActiveCustomerView();
      } catch {
        //
      } finally {
        setViewBusy(false);
      }
    }
    setSelectedSession(null);
  };

  const showCustomerView = async (session: CustomerSession): Promise<void> => {
    try {
      setViewBusy(true);
      await setCustomerViewState(true, session.id);
      await readActiveCustomerView();
    } catch (e) {
      console.error(e);
      alert("Failed to show customer view.");
    } finally {
      setViewBusy(false);
    }
  };

  const hideCustomerView = async (): Promise<void> => {
    try {
      setViewBusy(true);
      await setCustomerViewState(false, null);
      await readActiveCustomerView();
    } catch (e) {
      console.error(e);
      alert("Failed to hide customer view.");
    } finally {
      setViewBusy(false);
    }
  };

  const exportToExcel = async (): Promise<void> => {
    if (filteredSessions.length === 0) {
      alert("No records for selected range.");
      return;
    }

    try {
      setExporting(true);

      const wb = new ExcelJS.Workbook();
      wb.creator = "Me Tyme Lounge";
      wb.created = new Date();

      const ws = wb.addWorksheet("Non-Reservation", {
        views: [{ state: "frozen", ySplit: 4 }],
      });

      ws.columns = [
        { header: "Date", key: "date", width: 16 },
        { header: "Full Name", key: "full_name", width: 24 },
        { header: "Booking Code", key: "booking_code", width: 16 },
        { header: "Phone #", key: "phone_number", width: 18 },
        { header: "Type", key: "customer_type", width: 14 },
        { header: "Has ID", key: "has_id", width: 10 },
        { header: "Hours", key: "hour_avail", width: 12 },
        { header: "Time In", key: "time_in", width: 12 },
        { header: "Time Out", key: "time_out", width: 12 },
        { header: "Total Hours", key: "total_hours", width: 12 },
        { header: "Order Total", key: "order_total", width: 14 },
        { header: "Amount Label", key: "amount_label", width: 16 },
        { header: "Balance/Change", key: "amount_value", width: 16 },
        { header: "Discount", key: "discount_text", width: 12 },
        { header: "Down Payment", key: "down_payment", width: 14 },
        { header: "System Cost", key: "system_cost", width: 14 },
        { header: "System GCash", key: "system_gcash", width: 14 },
        { header: "System Cash", key: "system_cash", width: 14 },
        { header: "System Remaining", key: "system_remaining", width: 16 },
        { header: "Order GCash", key: "order_gcash", width: 14 },
        { header: "Order Cash", key: "order_cash", width: 14 },
        { header: "Order Remaining", key: "order_remaining", width: 16 },
        { header: "Paid?", key: "paid", width: 10 },
        { header: "Status", key: "status", width: 12 },
        { header: "Seat", key: "seat", width: 12 },
      ];

      ws.mergeCells("A1:Y1");
      ws.getCell("A1").value = "ME TYME LOUNGE — CUSTOMER LIST";
      ws.getCell("A1").font = { bold: true, size: 16 };

      ws.mergeCells("A2:Y2");
      ws.getCell("A2").value = `Mode: ${filterMode.toUpperCase()} • Range: ${activeRange.label} • Records: ${filteredSessions.length}`;

      if (isLikelyUrl(logo)) {
        const ab = await fetchAsArrayBuffer(logo);
        if (ab) {
          const ext =
            logo.toLowerCase().includes(".jpg") || logo.toLowerCase().includes(".jpeg")
              ? "jpeg"
              : "png";
          const imgId = wb.addImage({ buffer: ab, extension: ext });
          ws.addImage(imgId, {
            tl: { col: 22, row: 0.2 },
            ext: { width: 140, height: 48 },
          });
        }
      }

      const headerRow = ws.getRow(4);
      headerRow.values = ws.columns.map((c) => String(c.header ?? ""));
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3A1B0E" } };
      });

      filteredSessions.forEach((s) => {
        const disp = getDisplayAmount(s);
        const sysPay = getSystemPaymentInfo(s);
        const ordPay = getOrderPaymentInfo(s);

        ws.addRow({
          date: displayDateNice(s.date),
          full_name: s.full_name,
          booking_code: s.booking_code ?? "",
          phone_number: phoneText(s),
          customer_type: s.customer_type,
          has_id: s.has_id ? "Yes" : "No",
          hour_avail: s.hour_avail,
          time_in: formatTimeText(s.time_started),
          time_out: renderTimeOut(s),
          total_hours: isOpenTimeSession(s) ? 0 : s.total_time,
          order_total: getOrdersTotal(s),
          amount_label: disp.label,
          amount_value: disp.value,
          discount_text: getDiscountText(s),
          down_payment: getDownPayment(s),
          system_cost: getSystemDue(s),
          system_gcash: sysPay.gcash,
          system_cash: sysPay.cash,
          system_remaining: getSystemRemaining(s),
          order_gcash: ordPay.gcash,
          order_cash: ordPay.cash,
          order_remaining: getOrderRemaining(s),
          paid: getFinalPaidStatus(s) ? "PAID" : "UNPAID",
          status: renderStatus(s),
          seat: s.seat_number || "N/A",
        });
      });

      const buffer = await wb.xlsx.writeBuffer();
      saveAs(
        new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        `Admin_Customer_List_${activeRange.fileLabel}.xlsx`
      );
    } catch (e) {
      console.error(e);
      alert("Export failed.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="acl-page">
      <div className="acl-shell">
        <section className="acl-hero">
          <div className="acl-eyebrow">ADMIN PANEL</div>
          <h1 className="acl-title">Customer List</h1>
          <p className="acl-subtitle">
            Mode: <strong>{filterMode.toUpperCase()}</strong> · Range:{" "}
            <strong>{activeRange.label}</strong> · Records: <strong>{filteredSessions.length}</strong>
          </p>

          <div className="acl-toolbar">
            <div className="acl-control">
              <label>Mode</label>
              <select
                value={filterMode}
                onChange={(e) => setFilterMode(e.target.value as FilterMode)}
              >
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
              </select>
            </div>

            <div className="acl-control">
              <label>Date</label>
              <input
                type="date"
                value={anchorDate}
                onChange={(e) => setAnchorDate(e.target.value)}
              />
            </div>

            <div className="acl-control acl-control-search">
              <label>Search</label>
              <input
                type="text"
                placeholder="Customer name or booking code"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
              />
            </div>

            <div className="acl-actions-top">
              <button className="acl-btn acl-btn-light" type="button" onClick={() => void refreshAll()} disabled={refreshing}>
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>

              <button className="acl-btn acl-btn-light" type="button" onClick={() => void exportToExcel()} disabled={exporting}>
                {exporting ? "Exporting..." : "Export to Excel"}
              </button>

              <button className="acl-btn acl-btn-danger" type="button" onClick={openDeleteByRangeModal}>
                Delete (day)
              </button>
            </div>
          </div>
        </section>

        <section className="acl-stats">
          <div className="acl-stat-box">
            <span>Total Customer</span>
            <strong>{totals.totalCustomer}</strong>
          </div>

          <div className="acl-stat-box">
            <span>Paid</span>
            <strong>{totals.paid}</strong>
          </div>

          <div className="acl-stat-box">
            <span>Unpaid</span>
            <strong>{totals.unpaid}</strong>
          </div>

          <div className="acl-stat-box">
            <span>System Total</span>
            <strong>₱{totals.systemTotal.toLocaleString()}</strong>
          </div>

          <div className="acl-stat-box">
            <span>Orders Total</span>
            <strong>₱{totals.ordersTotal.toLocaleString()}</strong>
          </div>
        </section>

        <section className="acl-table-wrap">
          <div className="acl-table-scroll">
            <table className="acl-table acl-table-premium">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Seat</th>
                  <th>Orders</th>
                  <th>Grand Total</th>
                  <th>Payment</th>
                  <th>Paid?</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8}>
                      <div className="acl-empty">Loading records...</div>
                    </td>
                  </tr>
                ) : filteredSessions.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <div className="acl-empty">No records found.</div>
                    </td>
                  </tr>
                ) : (
                  filteredSessions.map((s) => {
                    const bundle = getOrderBundle(s);
                    const ordersTotal = getOrdersTotal(s);
                    const grandTotal = getGrandDue(s);
                    const displayAmount = getDisplayAmount(s);
                    const systemPay = getSystemPaymentInfo(s);
                    const orderPay = getOrderPaymentInfo(s);
                    const customerViewActive = isCustomerViewOnForSession(activeView, s.id);

                    return (
                      <tr key={s.id} className="acl-row-anim">
                        <td>
                          <div className="acl-date-cell">
                            <strong>{displayDateNice(s.date)}</strong>
                            <span>{formatTimeText(s.time_started)}</span>
                          </div>
                        </td>

                        <td>
                          <div className="acl-customer-cell">
                            <div className="acl-name-main">{s.full_name}</div>
                            <div className="acl-name-sub">{s.customer_type}</div>

                            <div className="acl-meta-grid">
                              <div className="acl-name-meta">
                                <span className="acl-meta-label">Code</span>
                                <span className="acl-meta-value">{s.booking_code || "N/A"}</span>
                              </div>

                              <div className="acl-name-meta">
                                <span className="acl-meta-label">Phone</span>
                                <span className="acl-meta-value">{phoneText(s)}</span>
                              </div>
                            </div>

                            <div className="acl-status-inline">{renderStatus(s)}</div>
                          </div>
                        </td>

                        <td>
                          <div className="acl-seat-pill">{s.seat_number || "N/A"}</div>
                        </td>

                        <td>
                          <div className="acl-orders-cell">
                            {bundle.items.length === 0 ? (
                              <div className="acl-orders-empty">
                                No add-ons or
                                <br />
                                consignment items.
                              </div>
                            ) : (
                              <>
                                <div className="acl-orders-list">
                                  {bundle.items.slice(0, 2).map((item) => (
                                    <div className="acl-order-line" key={item.id}>
                                      <span className="acl-order-name">
                                        {item.name} x{item.qty}
                                      </span>
                                      <span className="acl-order-price">₱{item.subtotal}</span>
                                    </div>
                                  ))}
                                </div>

                                {bundle.items.length > 2 && (
                                  <div className="acl-order-more">
                                    +{bundle.items.length - 2} more item(s)
                                  </div>
                                )}
                              </>
                            )}

                            <button
                              className="acl-mini-btn acl-orders-btn"
                              type="button"
                              onClick={() => setSelectedOrderSession(s)}
                            >
                              View Orders
                            </button>
                          </div>
                        </td>

                        <td>
                          <div className="acl-total-card">
                            <div className="acl-grand-amount">₱{grandTotal}</div>

                            <div className="acl-grand-breakdown">
                              <div className="acl-break-row">
                                <span>System</span>
                                <strong>₱{getSystemDue(s)}</strong>
                              </div>

                              <div className="acl-break-row">
                                <span>Orders</span>
                                <strong>₱{ordersTotal}</strong>
                              </div>

                              <div className="acl-break-row acl-break-row-highlight">
                                <span>{displayAmount.label}</span>
                                <strong>₱{displayAmount.value}</strong>
                              </div>
                            </div>
                          </div>
                        </td>

                        <td>
                          <div className="acl-payment-card">
                            <div className="acl-payment-section">
                              <div className="acl-payment-title">System Payment</div>

                              <div className="acl-pay-box">
                                <div className="acl-pay-line acl-pay-line-strong">
                                  <span>GCash</span>
                                  <strong>₱{systemPay.gcash}</strong>
                                </div>
                                <div className="acl-pay-line acl-pay-line-strong">
                                  <span>Cash</span>
                                  <strong>₱{systemPay.cash}</strong>
                                </div>
                                <div className="acl-pay-line acl-pay-line-remain">
                                  <span>Remaining</span>
                                  <strong>₱{getSystemRemaining(s)}</strong>
                                </div>
                              </div>

                              <div className="acl-payment-stack acl-payment-stack-compact">
                                <button
                                  className="acl-mini-btn acl-mini-btn-main"
                                  type="button"
                                  onClick={() => openPaymentModal(s)}
                                >
                                  System Payment
                                </button>

                                <div className="acl-inline-actions">
                                  <button
                                    className="acl-mini-btn acl-mini-soft"
                                    type="button"
                                    onClick={() => openDiscountModal(s)}
                                  >
                                    Discount
                                  </button>

                                  <button
                                    className="acl-mini-btn acl-mini-soft"
                                    type="button"
                                    onClick={() => openDpModal(s)}
                                  >
                                    Down Payment
                                  </button>
                                </div>
                              </div>
                            </div>

                            {ordersTotal > 0 && (
                              <div className="acl-payment-section acl-payment-section-order">
                                <div className="acl-payment-title">Order Payment</div>

                                <div className="acl-pay-box">
                                  <div className="acl-pay-line acl-pay-line-strong">
                                    <span>GCash</span>
                                    <strong>₱{orderPay.gcash}</strong>
                                  </div>
                                  <div className="acl-pay-line acl-pay-line-strong">
                                    <span>Cash</span>
                                    <strong>₱{orderPay.cash}</strong>
                                  </div>
                                  <div className="acl-pay-line acl-pay-line-remain">
                                    <span>Remaining</span>
                                    <strong>₱{getOrderRemaining(s)}</strong>
                                  </div>
                                </div>

                                <button
                                  className="acl-mini-btn acl-mini-btn-main"
                                  type="button"
                                  onClick={() => void openOrderPaymentModal(s)}
                                >
                                  Order Payment
                                </button>
                              </div>
                            )}
                          </div>
                        </td>

                        <td>
                          <div className="acl-paid-wrap">
                            <span
                              className={`acl-paid-pill ${getFinalPaidStatus(s) ? "paid" : "unpaid"}`}
                            >
                              {getFinalPaidStatus(s) ? "PAID" : "UNPAID"}
                            </span>
                          </div>
                        </td>

                        <td>
                          <div className="acl-action-stack acl-action-stack-premium">
                            <button
                              className="acl-action-btn"
                              type="button"
                              onClick={() => setSelectedSession(s)}
                            >
                              View Receipt
                            </button>
                            {isOpenTimeSession(s) && (
                              <button
                                className="acl-action-btn acl-action-gold"
                                type="button"
                                onClick={() => void stopOpenTime(s)}
                                disabled={stoppingId === s.id}
                              >
                                {stoppingId === s.id ? "Stopping..." : "Stop Time"}
                              </button>
                            )}

                            <button
                              className="acl-action-btn acl-action-danger"
                              type="button"
                              onClick={() => openCancelModal(s)}
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <CenterModal
        open={!!selectedOrderSession}
        title="View Orders"
        size="lg"
        onClose={() => setSelectedOrderSession(null)}
      >
        {selectedOrderSession && (
          <div className="acl-orders-modal">
            <div className="acl-modal-summary-grid">
              <div>
                <span>Customer</span>
                <strong>{selectedOrderSession.full_name}</strong>
              </div>
              <div>
                <span>Booking Code</span>
                <strong>{selectedOrderSession.booking_code || "N/A"}</strong>
              </div>
              <div>
                <span>Seat</span>
                <strong>{selectedOrderSession.seat_number || "N/A"}</strong>
              </div>
              <div>
                <span>Total</span>
                <strong>₱{getOrdersTotal(selectedOrderSession)}</strong>
              </div>
            </div>

            <div className="acl-items-list">
              {getOrderBundle(selectedOrderSession).items.length === 0 ? (
                <div className="acl-empty acl-empty-tight">No order items found.</div>
              ) : (
                getOrderBundle(selectedOrderSession).items.map((item) => (
                  <div className="acl-item-card" key={item.id}>
                    <div className="acl-item-left">
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.name} className="acl-item-image" />
                      ) : (
                        <div className="acl-item-placeholder">No Image</div>
                      )}
                    </div>

                    <div className="acl-item-center">
                      <h4>{item.name}</h4>
                      <p>{item.category}</p>
                      {item.size && <p>Size: {item.size}</p>}
                      <p>Qty: {item.qty}</p>
                      <p>Price: ₱{item.price}</p>
                    </div>

                    <div className="acl-item-right">
                      <strong>₱{item.subtotal}</strong>
                      <button
                        className="acl-mini-btn acl-mini-danger"
                        type="button"
                        onClick={() => openOrderCancelModal(selectedOrderSession, item)}
                      >
                        Cancel Item
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="acl-modal-actions">
              <button className="acl-btn acl-btn-light" type="button" onClick={() => setSelectedOrderSession(null)}>
                Close
              </button>
            </div>
          </div>
        )}
      </CenterModal>

      <CenterModal
        open={!!selectedSession}
        title="Receipt"
        size="md"
        onClose={() => void closeReceipt()}
      >
        {selectedSession && (() => {
          const di = getDiscountInfo(selectedSession);
          const systemCost = getSessionSystemCost(selectedSession);
          const usedMinutes = getUsedMinutesForReceipt(selectedSession);
          const chargeMinutes = getChargeMinutesForReceipt(selectedSession);
          const systemPay = getSystemPaymentInfo(selectedSession);
          const orderPay = getOrderPaymentInfo(selectedSession);
          const orders = getOrderBundle(selectedSession).items;
          const ordersTotal = getOrdersTotal(selectedSession);
          const totalPaid = systemPay.totalPaid + orderPay.totalPaid;
          const totalDue = getGrandDue(selectedSession);
          const totalChange = Math.max(0, totalPaid - totalDue);
          const paidAtText = selectedSession.paid_at
            ? new Date(selectedSession.paid_at).toLocaleString()
            : "—";

          return (
            <div className="acl-plain-receipt">
              <div className="acl-plain-receipt-head">
                <img src={logo} alt="Logo" className="acl-plain-receipt-logo" />
                <h2>ME TYME LOUNGE</h2>
                <p>OFFICIAL RECEIPT</p>
              </div>

              <div className="acl-plain-divider" />

              <div className="acl-plain-info">
                <div className="acl-plain-row">
                  <span>Date</span>
                  <strong>{new Date().toLocaleString()}</strong>
                </div>
                <div className="acl-plain-row">
                  <span>Customer</span>
                  <strong>{selectedSession.full_name || "N/A"}</strong>
                </div>
                <div className="acl-plain-row">
                  <span>Seat</span>
                  <strong>{selectedSession.seat_number || "N/A"}</strong>
                </div>
                {selectedSession.booking_code && (
                  <div className="acl-plain-row">
                    <span>Booking Code</span>
                    <strong>{selectedSession.booking_code}</strong>
                  </div>
                )}
              </div>

              <div className="acl-plain-divider" />

              <div className="acl-plain-items">
                {orders.length > 0 ? (
                  orders.map((item) => (
                    <div className="acl-plain-item-card" key={item.id}>
                      <div className="acl-plain-item-left">
                        <div className="acl-plain-item-name">
                          {item.name}
                          {item.size ? ` (${item.size})` : ""}
                        </div>
                        <div className="acl-plain-item-sub">
                          {item.qty} × ₱{item.price}
                        </div>
                      </div>
                      <div className="acl-plain-item-total">₱{item.subtotal}</div>
                    </div>
                  ))
                ) : (
                  <div className="acl-plain-item-card">
                    <div className="acl-plain-item-left">
                      <div className="acl-plain-item-name">
                        Study Hub Session
                      </div>
                      <div className="acl-plain-item-sub">
                        {usedMinutes} mins used • {chargeMinutes} mins charged
                      </div>
                    </div>
                    <div className="acl-plain-item-total">₱{systemCost}</div>
                  </div>
                )}
              </div>

              <div className="acl-plain-divider" />

              <div className="acl-plain-summary">
                <div className="acl-plain-row">
                  <span>System Cost</span>
                  <strong>₱{systemCost}</strong>
                </div>

                <div className="acl-plain-row">
                  <span>Discount</span>
                  <strong>{getDiscountTextFrom(di.kind, di.value)}</strong>
                </div>

                <div className="acl-plain-row">
                  <span>Orders Total</span>
                  <strong>₱{ordersTotal}</strong>
                </div>

                <div className="acl-plain-row">
                  <span>GCash</span>
                  <strong>₱{systemPay.gcash + orderPay.gcash}</strong>
                </div>

                <div className="acl-plain-row">
                  <span>Cash</span>
                  <strong>₱{systemPay.cash + orderPay.cash}</strong>
                </div>

                <div className="acl-plain-row">
                  <span>Total Paid</span>
                  <strong>₱{totalPaid}</strong>
                </div>

                <div className="acl-plain-row">
                  <span>Change</span>
                  <strong>₱{totalChange}</strong>
                </div>

                <div className="acl-plain-row">
                  <span>Status</span>
                  <strong className={getFinalPaidStatus(selectedSession) ? "acl-paid-green" : "acl-paid-gold"}>
                    {getFinalPaidStatus(selectedSession) ? "PAID" : "UNPAID"}
                  </strong>
                </div>

                <div className="acl-plain-row">
                  <span>Paid at</span>
                  <strong>{paidAtText}</strong>
                </div>
              </div>

              <div className="acl-plain-total-box">
                <span>TOTAL</span>
                <strong>₱{totalDue}</strong>
              </div>

              <p className="acl-receipt-footer">
                Thank you for choosing <br />
                <strong>Me Tyme Lounge</strong>
              </p>

          <div className="acl-plain-close-full">
            <button
              className="acl-plain-close-btn-full"
              onClick={() => void closeReceipt()}
              disabled={viewBusy}
              type="button"
            >
              Close
            </button>
          </div>
            </div>
          );
        })()}
      </CenterModal>

      <CenterModal
        open={!!discountTarget}
        title="Discount"
        size="sm"
        onClose={() => setDiscountTarget(null)}
      >
        <div className="acl-form-grid">
          <div className="acl-form-field">
            <label>Discount Type</label>
            <select value={discountKind} onChange={(e) => setDiscountKind(e.target.value as DiscountKind)}>
              <option value="none">None</option>
              <option value="percent">Percent</option>
              <option value="amount">Amount</option>
            </select>
          </div>

          <div className="acl-form-field">
            <label>Value</label>
            <input
              type="number"
              value={discountInput}
              onChange={(e) => setDiscountInput(e.target.value)}
            />
          </div>

          <div className="acl-form-field">
            <label>Reason</label>
            <textarea
              value={discountReason}
              onChange={(e) => setDiscountReason(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <div className="acl-modal-actions">
          <button className="acl-btn acl-btn-light" type="button" onClick={() => setDiscountTarget(null)}>
            Cancel
          </button>
          <button className="acl-btn acl-btn-dark" type="button" onClick={() => void saveDiscount()} disabled={savingDiscount}>
            {savingDiscount ? "Saving..." : "Save"}
          </button>
        </div>
      </CenterModal>

      <CenterModal
        open={!!dpTarget}
        title="Down Payment"
        size="sm"
        onClose={() => setDpTarget(null)}
      >
        <div className="acl-form-grid">
          <div className="acl-form-field">
            <label>Amount</label>
            <input type="number" value={dpInput} onChange={(e) => setDpInput(e.target.value)} />
          </div>
        </div>

        <div className="acl-modal-actions">
          <button className="acl-btn acl-btn-light" type="button" onClick={() => setDpTarget(null)}>
            Cancel
          </button>
          <button className="acl-btn acl-btn-dark" type="button" onClick={() => void saveDownPayment()} disabled={savingDp}>
            {savingDp ? "Saving..." : "Save"}
          </button>
        </div>
      </CenterModal>

      <CenterModal
        open={!!paymentTarget}
        title="System Payment"
        size="sm"
        onClose={() => setPaymentTarget(null)}
      >
        <div className="acl-form-grid">
          <div className="acl-form-field">
            <label>GCash</label>
            <input type="number" value={gcashInput} onChange={(e) => setGcashInput(e.target.value)} />
          </div>

          <div className="acl-form-field">
            <label>Cash</label>
            <input type="number" value={cashInput} onChange={(e) => setCashInput(e.target.value)} />
          </div>
        </div>

        <div className="acl-modal-actions">
          <button className="acl-btn acl-btn-light" type="button" onClick={() => setPaymentTarget(null)}>
            Cancel
          </button>
          <button className="acl-btn acl-btn-dark" type="button" onClick={() => void savePayment()} disabled={savingPayment}>
            {savingPayment ? "Saving..." : "Save"}
          </button>
        </div>
      </CenterModal>

      <CenterModal
        open={!!orderPaymentTarget}
        title="Order Payment"
        size="sm"
        onClose={() => setOrderPaymentTarget(null)}
      >
        <div className="acl-form-grid">
          <div className="acl-form-field">
            <label>GCash</label>
            <input type="number" value={orderGcashInput} onChange={(e) => setOrderGcashInput(e.target.value)} />
          </div>

          <div className="acl-form-field">
            <label>Cash</label>
            <input type="number" value={orderCashInput} onChange={(e) => setOrderCashInput(e.target.value)} />
          </div>
        </div>

        <div className="acl-modal-actions">
          <button className="acl-btn acl-btn-light" type="button" onClick={() => setOrderPaymentTarget(null)}>
            Cancel
          </button>
          <button
            className="acl-btn acl-btn-dark"
            type="button"
            onClick={() => void saveOrderPayment()}
            disabled={savingOrderPayment}
          >
            {savingOrderPayment ? "Saving..." : "Save"}
          </button>
        </div>
      </CenterModal>

      <CenterModal
        open={!!cancelTarget}
        title="Cancel Session"
        size="sm"
        onClose={() => setCancelTarget(null)}
      >
        <div className="acl-form-grid">
          <div className="acl-form-field">
            <label>Reason</label>
            <textarea
              rows={4}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Enter cancel reason"
            />
          </div>
        </div>

        <div className="acl-modal-actions">
          <button className="acl-btn acl-btn-light" type="button" onClick={() => setCancelTarget(null)}>
            Close
          </button>
          <button className="acl-btn acl-btn-danger" type="button" onClick={() => void submitCancel()} disabled={cancellingBusy}>
            {cancellingBusy ? "Cancelling..." : "Submit"}
          </button>
        </div>
      </CenterModal>

      <CenterModal
        open={!!orderCancelTarget}
        title="Cancel Order Item"
        size="sm"
        onClose={() => setOrderCancelTarget(null)}
      >
        <div className="acl-form-grid">
          <div className="acl-form-field">
            <label>Cancel Note</label>
            <textarea
              rows={4}
              value={orderCancelNote}
              onChange={(e) => setOrderCancelNote(e.target.value)}
              placeholder="Enter cancel note"
            />
          </div>
        </div>

        <div className="acl-modal-actions">
          <button className="acl-btn acl-btn-light" type="button" onClick={() => setOrderCancelTarget(null)}>
            Close
          </button>
          <button
            className="acl-btn acl-btn-danger"
            type="button"
            onClick={() => void submitOrderItemCancel()}
            disabled={cancellingOrderItemId !== null}
          >
            {cancellingOrderItemId ? "Cancelling..." : "Submit"}
          </button>
        </div>
      </CenterModal>

      <CenterModal
        open={deleteRangeOpen}
        title="Delete Records"
        size="sm"
        onClose={() => setDeleteRangeOpen(false)}
      >
        <div className="acl-confirm-copy">
          Are you sure you want to delete all non-reservation records for this range?
          <br />
          <strong>{activeRange.label}</strong>
        </div>

        <div className="acl-modal-actions">
          <button className="acl-btn acl-btn-light" type="button" onClick={() => setDeleteRangeOpen(false)}>
            No
          </button>
          <button className="acl-btn acl-btn-danger" type="button" onClick={() => void deleteByRange()} disabled={deletingByRange}>
            {deletingByRange ? "Deleting..." : "Yes, Delete"}
          </button>
        </div>
      </CenterModal>
    </div>
  );
};

export default Admin_customer_list;