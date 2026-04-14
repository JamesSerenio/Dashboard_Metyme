import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../utils/supabaseClient";
import "../styles/Staff_menu.css";

/* pages */
import Staff_Dashboard from "./Staff_Dashboard";
import Customer_Lists from "./Customer_Lists";
import Customer_Reservations from "./Customer_Reservations";
import Customer_Calendar from "./Customer_Calendar";
import Product_Item_Lists from "./Product_Item_lists";
import Customer_Add_ons from "./Customer_Add_ons";
import Customer_Discount_List from "./Customer_Promo_List";
import Staff_Sales_Report from "./staff_sales_report";
import Customer_Cancelled from "./Customer_Cancelled";
import Staff_Consignment from "./Staff_Consignment";
import Staff_Consignment_Record from "./Staff_Consignment_Record";
import Customer_Consignment_Record from "./Customer_Consignment_Record";

/* assets */
import dashboardIcon from "../assets/add_user.png";
import studyHubLogo from "../assets/study_hub.png";
import listIcon from "../assets/list.png";
import reserveIcon from "../assets/reserve.png";
import calendarIcon from "../assets/calendar.png";
import foodIcon from "../assets/food.png";
import onsIcon from "../assets/hamburger.png";
import discountIcon from "../assets/discount.png";
import salesIcon from "../assets/sales.png";
import flowerImg from "../assets/flower.png";
import cancelledIcon from "../assets/cancelled.png";
import bellIcon from "../assets/bell.png";
import foodNotifIcon from "../assets/food_notif.png";
import consignmentIcon from "../assets/consignment.png";
import staffConsignmentIcon from "../assets/staff_consignment.png";
import consignmentRecordIcon from "../assets/consignment_record.png";

type MenuKey =
  | "dashboard"
  | "customer_lists"
  | "customer_reservations"
  | "customer_calendar"
  | "customer_add_ons"
  | "customer_cancelled"
  | "customer_promo_list"
  | "staff_sales_report"
  | "product_item_lists"
  | "staff_consignment"
  | "staff_consignment_record"
  | "customer_consignment_record";

type MenuItem = {
  name: string;
  key: MenuKey;
  icon: string;
};

type FlowerStatic = {
  id: string;
  left: string;
  top: string;
  size: string;
  opacity: number;
  rotateDeg?: number;
};

type NoisyNotifRow = {
  id: string;
  created_at: string;
  name: string;
  seat_number: string;
  report_type: string | null;
  message: string | null;
  concern?: string | null;
  status: string | null;
  is_read: boolean;
  read_at: string | null;
};

type FoodNotifMode = "add_ons" | "consignment";

type FoodNotifRow = {
  id: string;
  source_id: string;
  mode: FoodNotifMode;
  created_at: string;
  full_name: string;
  phone_number: string;
  seat_number: string;
  item_name: string;
  quantity: number;
  total: number;
  is_read: boolean;
  read_at: string | null;
  booking_code: string;
};

type LooseRecord = Record<string, unknown>;

type RealtimeInsertPayload<T> = {
  new: T;
};

type RealtimeUpdatePayload<T> = {
  new: T;
  old: Partial<T>;
};

const Staff_menu: React.FC = () => {
  const navigate = useNavigate();

  const [activePage, setActivePage] = useState<MenuKey>("dashboard");
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [boot, setBoot] = useState<boolean>(false);

  /* =========================
      🔔 Guest Notifications
  ========================= */
  const NOISY_TABLE = "noisy_reports";

  const [notifOpen, setNotifOpen] = useState<boolean>(false);
  const notifOpenRef = useRef<boolean>(false);

  const [notifLoading, setNotifLoading] = useState<boolean>(false);
  const [notifItems, setNotifItems] = useState<NoisyNotifRow[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  const bellBtnRef = useRef<HTMLButtonElement | null>(null);

  const [popoverPos, setPopoverPos] = useState<{ top: number; right: number }>(
    {
      top: 64,
      right: 12,
    }
  );

  const refreshTimerRef = useRef<number | null>(null);
  const suspendRefreshRef = useRef<boolean>(false);

  /* =========================
      🍔 Unified Food Notifications
  ========================= */
  const ADDON_NOTIF_TABLE = "add_on_notifications";
  const CONSIGNMENT_NOTIF_TABLE = "consignment_notifications";

  const [foodNotifOpen, setFoodNotifOpen] = useState<boolean>(false);
  const foodNotifOpenRef = useRef<boolean>(false);

  const [foodNotifLoading, setFoodNotifLoading] = useState<boolean>(false);
  const [foodNotifItems, setFoodNotifItems] = useState<FoodNotifRow[]>([]);
  const [foodUnreadCount, setFoodUnreadCount] = useState<number>(0);

  const foodBtnRef = useRef<HTMLButtonElement | null>(null);

  const [foodPopoverPos, setFoodPopoverPos] = useState<{
    top: number;
    right: number;
  }>({
    top: 64,
    right: 70,
  });

  const foodRefreshTimerRef = useRef<number | null>(null);
  const foodSuspendRefreshRef = useRef<boolean>(false);

  const phoneCacheRef = useRef<Map<string, string>>(new Map());

  /* request lock para isang fetch lang */
  const foodFetchInFlightRef = useRef<Promise<void> | null>(null);
  const foodFetchSeqRef = useRef(0);

  useEffect(() => {
    notifOpenRef.current = notifOpen;
  }, [notifOpen]);

  useEffect(() => {
    foodNotifOpenRef.current = foodNotifOpen;
  }, [foodNotifOpen]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setBoot(true);
      window.dispatchEvent(new Event("resize"));
      document.body.getBoundingClientRect();
    }, 0);

    return () => window.clearTimeout(t);
  }, []);

  const formatPHDateTime = (iso: string): string => {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "";
    return new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  };

  const peso = (value: number): string => {
    const safe = Number.isFinite(value) ? value : 0;
    return `₱${safe.toLocaleString("en-PH", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  };

  const toText = (value: unknown): string => {
    if (typeof value === "string") return value.trim();
    if (typeof value === "number") return String(value);
    return "";
  };

  const toNumber = (value: unknown): number => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  };

  const pickText = (row: LooseRecord, keys: string[]): string => {
    for (const key of keys) {
      const v = toText(row[key]);
      if (v) return v;
    }
    return "";
  };

  const pickNumber = (row: LooseRecord, keys: string[]): number => {
    for (const key of keys) {
      const raw = row[key];
      if (raw !== undefined && raw !== null && raw !== "") {
        return toNumber(raw);
      }
    }
    return 0;
  };

  const buildPhoneCacheKey = (
    bookingCode: string,
    fullName: string,
    seatNumber: string
  ): string => {
    return [
      bookingCode.trim().toLowerCase(),
      fullName.trim().toLowerCase(),
      seatNumber.trim().toLowerCase(),
    ].join("|");
  };

  const resolvePhoneNumber = async (
    bookingCode: string,
    fullName: string,
    seatNumber: string
  ): Promise<string> => {
    const cacheKey = buildPhoneCacheKey(bookingCode, fullName, seatNumber);
    const cached = phoneCacheRef.current.get(cacheKey);
    if (cached !== undefined) return cached;

    const cleanBookingCode = bookingCode.trim();
    const cleanFullName = fullName.trim();
    const cleanSeatNumber = seatNumber.trim();

    if (cleanBookingCode) {
      const { data: sessionByCode } = await supabase
        .from("customer_sessions")
        .select("phone_number")
        .eq("booking_code", cleanBookingCode)
        .limit(1)
        .maybeSingle();

      const sessionPhone = toText(sessionByCode?.phone_number);
      if (sessionPhone) {
        phoneCacheRef.current.set(cacheKey, sessionPhone);
        return sessionPhone;
      }

      const { data: promoByCode } = await supabase
        .from("promo_bookings")
        .select("phone_number")
        .eq("promo_code", cleanBookingCode)
        .limit(1)
        .maybeSingle();

      const promoPhone = toText(promoByCode?.phone_number);
      if (promoPhone) {
        phoneCacheRef.current.set(cacheKey, promoPhone);
        return promoPhone;
      }
    }

    if (cleanFullName && cleanSeatNumber) {
      const { data: sessionByNameSeat } = await supabase
        .from("customer_sessions")
        .select("phone_number, created_at")
        .eq("full_name", cleanFullName)
        .eq("seat_number", cleanSeatNumber)
        .order("created_at", { ascending: false })
        .limit(1);

      const sessionPhone = toText(sessionByNameSeat?.[0]?.phone_number);
      if (sessionPhone) {
        phoneCacheRef.current.set(cacheKey, sessionPhone);
        return sessionPhone;
      }
    }

    if (cleanFullName) {
      const { data: promoByName } = await supabase
        .from("promo_bookings")
        .select("phone_number, created_at")
        .eq("full_name", cleanFullName)
        .order("created_at", { ascending: false })
        .limit(1);

      const promoPhone = toText(promoByName?.[0]?.phone_number);
      if (promoPhone) {
        phoneCacheRef.current.set(cacheKey, promoPhone);
        return promoPhone;
      }
    }

    phoneCacheRef.current.set(cacheKey, "");
    return "";
  };

  const mapAddOnNotifRow = (row: LooseRecord): FoodNotifRow => {
    return {
      id: `addon-${toText(row.id) || crypto.randomUUID()}`,
      source_id: toText(row.id) || crypto.randomUUID(),
      mode: "add_ons",
      created_at: toText(row.created_at) || new Date().toISOString(),
      full_name: pickText(row, ["full_name", "name", "customer_name", "customer"]),
      phone_number: pickText(row, [
        "phone_number",
        "phone",
        "contact_number",
        "mobile_number",
        "contact_no",
      ]),
      seat_number: pickText(row, ["seat_number", "seat", "table_no"]),
      item_name: pickText(row, [
        "add_on_name",
        "addon_name",
        "item_name",
        "product_name",
        "food_name",
        "name_of_addon",
      ]),
      quantity: pickNumber(row, ["quantity", "qty"]),
      total: pickNumber(row, ["total", "total_amount", "amount", "subtotal"]),
      is_read: Boolean(row.is_read),
      read_at: toText(row.read_at) || null,
      booking_code: pickText(row, ["booking_code", "code", "promo_code"]),
    };
  };

  const mapConsignmentNotifRow = (row: LooseRecord): FoodNotifRow => {
    return {
      id: `consignment-${toText(row.id) || crypto.randomUUID()}`,
      source_id: toText(row.id) || crypto.randomUUID(),
      mode: "consignment",
      created_at: toText(row.created_at) || new Date().toISOString(),
      full_name: pickText(row, ["full_name", "name", "customer_name", "customer"]),
      phone_number: pickText(row, [
        "phone_number",
        "phone",
        "contact_number",
        "mobile_number",
        "contact_no",
      ]),
      seat_number: pickText(row, ["seat_number", "seat", "table_no"]),
      item_name: pickText(row, [
        "consignment_name",
        "item_name",
        "product_name",
        "name",
      ]),
      quantity: pickNumber(row, ["quantity", "qty"]),
      total: pickNumber(row, ["total", "total_amount", "amount", "subtotal"]),
      is_read: Boolean(row.is_read),
      read_at: toText(row.read_at) || null,
      booking_code: pickText(row, ["booking_code", "code", "promo_code"]),
    };
  };

  const enrichFoodPhoneNumbers = async (
    items: FoodNotifRow[]
  ): Promise<FoodNotifRow[]> => {
    const next = await Promise.all(
      items.map(async (item) => {
        if (item.phone_number?.trim()) return item;

        const resolvedPhone = await resolvePhoneNumber(
          item.booking_code,
          item.full_name,
          item.seat_number
        );

        return {
          ...item,
          phone_number: resolvedPhone || "",
        };
      })
    );

    return next;
  };

  const normalizeType = (value: string | null | undefined): string => {
    const v = String(value ?? "other").trim().toLowerCase();
    if (
      v === "concern" ||
      v === "feedback" ||
      v === "suggestion" ||
      v === "complaint" ||
      v === "request" ||
      v === "other"
    ) {
      return v;
    }
    return "other";
  };

  const getTypeLabel = (value: string | null | undefined): string => {
    const v = normalizeType(value);
    return v.charAt(0).toUpperCase() + v.slice(1);
  };

  const getAvatarText = (name: string): string => {
    const trimmed = name.trim();
    if (!trimmed) return "?";
    return trimmed.charAt(0).toUpperCase();
  };

  const getMessageText = (row: NoisyNotifRow): string => {
    return String(row.message ?? row.concern ?? "").trim() || "No message.";
  };

  const getFoodModeLabel = (mode: FoodNotifMode): string => {
    if (mode === "add_ons") return "ADD-ONS";
    return "SPECIAL ITEM";
  };

  /* =========================
      Guest notif helpers
  ========================= */
  const cancelScheduledRefresh = (): void => {
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = null;
  };

  const scheduleRecount = (delayMs = 220): void => {
    if (suspendRefreshRef.current) return;
    cancelScheduledRefresh();

    refreshTimerRef.current = window.setTimeout(() => {
      if (suspendRefreshRef.current) return;
      void fetchUnreadCount();
    }, delayMs);
  };

  const fetchUnreadCount = async (): Promise<number> => {
    const result = await supabase
      .from(NOISY_TABLE)
      .select("id", { count: "exact", head: true })
      .eq("is_read", false);

    const total = result.error ? 0 : Number(result.count ?? 0);
    setUnreadCount(total);
    return total;
  };

  const fetchNotifications = async (): Promise<void> => {
    setNotifLoading(true);

    const { data, error } = await supabase
      .from(NOISY_TABLE)
      .select(
        "id, created_at, name, seat_number, report_type, message, concern, status, is_read, read_at"
      )
      .order("created_at", { ascending: false })
      .limit(40);

    setNotifLoading(false);

    if (error) {
      console.warn("fetch noisy notifications:", error.message);
      return;
    }

    setNotifItems((data as NoisyNotifRow[] | null) ?? []);
  };

  const markAllAsReadSilent = async (): Promise<void> => {
    if (suspendRefreshRef.current) return;

    cancelScheduledRefresh();
    suspendRefreshRef.current = true;

    const nowIso = new Date().toISOString();

    setUnreadCount(0);
    setNotifItems((prev) =>
      prev.map((n) => ({
        ...n,
        is_read: true,
        read_at: nowIso,
      }))
    );

    const { error } = await supabase
      .from(NOISY_TABLE)
      .update({ is_read: true, read_at: nowIso })
      .eq("is_read", false);

    if (error) {
      console.warn("markAllAsReadSilent:", error.message);
      await fetchUnreadCount();
      if (notifOpenRef.current) {
        await fetchNotifications();
      }
    }

    suspendRefreshRef.current = false;
  };

  const handleDeleteNotification = async (id: string): Promise<void> => {
    const ok = window.confirm("Delete this message?");
    if (!ok) return;

    const current = notifItems.find((x) => x.id === id);

    const { error } = await supabase.from(NOISY_TABLE).delete().eq("id", id);

    if (error) {
      alert(`Delete failed: ${error.message}`);
      return;
    }

    setNotifItems((prev) => prev.filter((x) => x.id !== id));

    if (current && !current.is_read) {
      setUnreadCount((c) => Math.max(0, c - 1));
    } else {
      void fetchUnreadCount();
    }
  };

  const computePopoverPosition = (): void => {
    const btn = bellBtnRef.current;
    if (!btn) return;

    const r = btn.getBoundingClientRect();
    const top = Math.round(r.bottom + 10);
    const right = Math.max(12, Math.round(window.innerWidth - r.right));
    setPopoverPos({ top, right });
  };

  const openBell = async (): Promise<void> => {
    if (foodNotifOpen) setFoodNotifOpen(false);
    computePopoverPosition();
    setNotifOpen(true);
    await fetchNotifications();
    void markAllAsReadSilent();
  };

  const closeBell = (): void => {
    setNotifOpen(false);
  };

  const toggleBell = async (): Promise<void> => {
    if (notifOpen) {
      closeBell();
    } else {
      await openBell();
    }
  };

  /* =========================
      Unified food notif helpers
  ========================= */
  const cancelFoodScheduledRefresh = (): void => {
    if (foodRefreshTimerRef.current !== null) {
      window.clearTimeout(foodRefreshTimerRef.current);
    }
    foodRefreshTimerRef.current = null;
  };

  const scheduleFoodRecount = (delayMs = 220): void => {
    if (foodSuspendRefreshRef.current) return;
    cancelFoodScheduledRefresh();

    foodRefreshTimerRef.current = window.setTimeout(() => {
      if (foodSuspendRefreshRef.current) return;
      void fetchFoodUnreadCount();
    }, delayMs);
  };

  const fetchFoodUnreadCount = async (): Promise<number> => {
    const [addonResult, consignmentResult] = await Promise.all([
      supabase
        .from(ADDON_NOTIF_TABLE)
        .select("id", { count: "exact", head: true })
        .eq("is_read", false),
      supabase
        .from(CONSIGNMENT_NOTIF_TABLE)
        .select("id", { count: "exact", head: true })
        .eq("is_read", false),
    ]);

    const addonTotal = addonResult.error ? 0 : Number(addonResult.count ?? 0);
    const consignmentTotal = consignmentResult.error
      ? 0
      : Number(consignmentResult.count ?? 0);

    const total = addonTotal + consignmentTotal;
    setFoodUnreadCount(total);
    return total;
  };

  const fetchFoodNotifications = async (
    options?: { silent?: boolean }
  ): Promise<void> => {
    const silent = options?.silent === true;
    const reqId = ++foodFetchSeqRef.current;

    if (!silent) {
      setFoodNotifLoading(true);
    }

    try {
      const [addonRes, consignmentRes] = await Promise.all([
        supabase
          .from(ADDON_NOTIF_TABLE)
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from(CONSIGNMENT_NOTIF_TABLE)
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      if (addonRes.error) {
        console.warn("fetch add_on_notifications:", addonRes.error.message);
      }

      if (consignmentRes.error) {
        console.warn(
          "fetch consignment_notifications:",
          consignmentRes.error.message
        );
      }

      const addonItems = ((addonRes.data as LooseRecord[] | null) ?? []).map(
        mapAddOnNotifRow
      );
      const consignmentItems = (
        (consignmentRes.data as LooseRecord[] | null) ?? []
      ).map(mapConsignmentNotifRow);

      const merged = [...addonItems, ...consignmentItems].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      const enriched = await enrichFoodPhoneNumbers(merged.slice(0, 100));

      /* ignore old response */
      if (reqId !== foodFetchSeqRef.current) return;

      setFoodNotifItems(enriched);
    } finally {
      if (!silent && reqId === foodFetchSeqRef.current) {
        setFoodNotifLoading(false);
      }
    }
  };

  const fetchFoodNotificationsLocked = async (
    options?: { silent?: boolean }
  ): Promise<void> => {
    if (foodFetchInFlightRef.current) {
      return foodFetchInFlightRef.current;
    }

    const task = (async () => {
      try {
        await fetchFoodNotifications(options);
      } finally {
        foodFetchInFlightRef.current = null;
      }
    })();

    foodFetchInFlightRef.current = task;
    return task;
  };

  const markAllFoodAsReadSilent = async (): Promise<void> => {
    if (foodSuspendRefreshRef.current) return;

    cancelFoodScheduledRefresh();
    foodSuspendRefreshRef.current = true;

    const nowIso = new Date().toISOString();

    setFoodUnreadCount(0);
    setFoodNotifItems((prev) =>
      prev.map((n) => ({
        ...n,
        is_read: true,
        read_at: nowIso,
      }))
    );

    const [addonUpdate, consignmentUpdate] = await Promise.all([
      supabase
        .from(ADDON_NOTIF_TABLE)
        .update({ is_read: true, read_at: nowIso })
        .eq("is_read", false),
      supabase
        .from(CONSIGNMENT_NOTIF_TABLE)
        .update({ is_read: true, read_at: nowIso })
        .eq("is_read", false),
    ]);

    if (addonUpdate.error || consignmentUpdate.error) {
      if (addonUpdate.error) {
        console.warn("markAll add_on_notifications:", addonUpdate.error.message);
      }
      if (consignmentUpdate.error) {
        console.warn(
          "markAll consignment_notifications:",
          consignmentUpdate.error.message
        );
      }

      await fetchFoodUnreadCount();
      if (foodNotifOpenRef.current) {
        await fetchFoodNotificationsLocked({ silent: true });
      }
    }

    /* small delay para ma-ignore ang sariling realtime update burst */
    window.setTimeout(() => {
      foodSuspendRefreshRef.current = false;
    }, 350);
  };

  const handleDeleteFoodNotification = async (
    item: FoodNotifRow
  ): Promise<void> => {
    const ok = window.confirm("Delete this food notification?");
    if (!ok) return;

    const table =
      item.mode === "add_ons" ? ADDON_NOTIF_TABLE : CONSIGNMENT_NOTIF_TABLE;

    const { error } = await supabase
      .from(table)
      .delete()
      .eq("id", item.source_id);

    if (error) {
      alert(`Delete failed: ${error.message}`);
      return;
    }

    setFoodNotifItems((prev) => prev.filter((x) => x.id !== item.id));

    if (!item.is_read) {
      setFoodUnreadCount((c) => Math.max(0, c - 1));
    } else {
      void fetchFoodUnreadCount();
    }
  };

  const computeFoodPopoverPosition = (): void => {
    const btn = foodBtnRef.current;
    if (!btn) return;

    const r = btn.getBoundingClientRect();
    const top = Math.round(r.bottom + 10);
    const right = Math.max(12, Math.round(window.innerWidth - r.right));
    setFoodPopoverPos({ top, right });
  };

  const openFoodBell = async (): Promise<void> => {
    if (notifOpen) setNotifOpen(false);
    if (foodFetchInFlightRef.current) return;

    computeFoodPopoverPosition();
    setFoodNotifOpen(true);

    await fetchFoodNotificationsLocked();
    void markAllFoodAsReadSilent();
  };

  const closeFoodBell = (): void => {
    setFoodNotifOpen(false);
  };

  const toggleFoodBell = async (): Promise<void> => {
    if (foodNotifOpen) {
      closeFoodBell();
    } else {
      await openFoodBell();
    }
  };

  useEffect(() => {
    const onResize = (): void => {
      if (notifOpenRef.current) computePopoverPosition();
      if (foodNotifOpenRef.current) computeFoodPopoverPosition();
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    void fetchUnreadCount();
    void fetchNotifications();

    const ch = supabase
      .channel("realtime_noisy_reports_notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: NOISY_TABLE },
        (payload: unknown) => {
          const row = (payload as RealtimeInsertPayload<NoisyNotifRow>).new;

          setNotifItems((prev) => {
            if (prev.some((x) => x.id === row.id)) return prev;
            const merged = [row, ...prev].sort(
              (a, b) =>
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime()
            );
            return merged.slice(0, 40);
          });

          if (notifOpenRef.current) {
            void markAllAsReadSilent();
          } else if (!row.is_read) {
            setUnreadCount((c) => c + 1);
            scheduleRecount(600);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: NOISY_TABLE },
        (payload: unknown) => {
          const p = payload as RealtimeUpdatePayload<NoisyNotifRow>;
          const newRow = p.new;
          const oldRow = p.old;

          setNotifItems((prev) => {
            const idx = prev.findIndex((x) => x.id === newRow.id);
            if (idx === -1) return prev;
            const copy = [...prev];
            copy[idx] = newRow;
            return copy;
          });

          if (notifOpenRef.current) return;

          const wasUnread =
            oldRow.is_read === undefined ? null : !oldRow.is_read;
          const isUnreadNow = !newRow.is_read;

          if (wasUnread === true && isUnreadNow === false) {
            setUnreadCount((c) => Math.max(0, c - 1));
          } else if (wasUnread === false && isUnreadNow === true) {
            setUnreadCount((c) => c + 1);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: NOISY_TABLE },
        () => {
          if (!notifOpenRef.current) {
            scheduleRecount(250);
          } else {
            void fetchUnreadCount();
          }
        }
      )
      .subscribe((status) => {
        console.log("NOISY NOTIF CHANNEL:", status);
      });

    const onFocusOrWake = (): void => {
      void fetchUnreadCount();
      if (notifOpenRef.current) computePopoverPosition();
    };

    window.addEventListener("focus", onFocusOrWake);
    window.addEventListener("online", onFocusOrWake);
    document.addEventListener("visibilitychange", onFocusOrWake);

    return () => {
      window.removeEventListener("focus", onFocusOrWake);
      window.removeEventListener("online", onFocusOrWake);
      document.removeEventListener("visibilitychange", onFocusOrWake);

      cancelScheduledRefresh();
      suspendRefreshRef.current = false;
      void supabase.removeChannel(ch);
    };
  }, []);

  useEffect(() => {
    void fetchFoodUnreadCount();

    const chAddOn = supabase
      .channel("realtime_add_on_notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: ADDON_NOTIF_TABLE },
        async (payload: unknown) => {
          const raw = (payload as RealtimeInsertPayload<LooseRecord>).new;
          let row = mapAddOnNotifRow(raw);

          if (!row.phone_number) {
            const resolvedPhone = await resolvePhoneNumber(
              row.booking_code,
              row.full_name,
              row.seat_number
            );
            row = { ...row, phone_number: resolvedPhone || "" };
          }

          setFoodNotifItems((prev) => {
            if (prev.some((x) => x.id === row.id)) return prev;
            const merged = [row, ...prev].sort(
              (a, b) =>
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime()
            );
            return merged.slice(0, 100);
          });

          if (foodNotifOpenRef.current) {
            void markAllFoodAsReadSilent();
          } else if (!row.is_read) {
            setFoodUnreadCount((c) => c + 1);
            scheduleFoodRecount(600);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: ADDON_NOTIF_TABLE },
        async (payload: unknown) => {
          const p = payload as RealtimeUpdatePayload<LooseRecord>;

          if (foodNotifOpenRef.current && foodSuspendRefreshRef.current) return;

          let newRow = mapAddOnNotifRow(p.new as LooseRecord);

          if (!newRow.phone_number) {
            const resolvedPhone = await resolvePhoneNumber(
              newRow.booking_code,
              newRow.full_name,
              newRow.seat_number
            );
            newRow = { ...newRow, phone_number: resolvedPhone || "" };
          }

          setFoodNotifItems((prev) => {
            const idx = prev.findIndex((x) => x.id === newRow.id);
            if (idx === -1) return prev;
            const copy = [...prev];
            copy[idx] = newRow;
            return copy;
          });

          if (foodNotifOpenRef.current) return;

          const oldIsRead = Boolean((p.old as LooseRecord).is_read);
          const isUnreadNow = !newRow.is_read;

          if (!oldIsRead && !isUnreadNow) {
            setFoodUnreadCount((c) => Math.max(0, c - 1));
          } else if (oldIsRead && isUnreadNow) {
            setFoodUnreadCount((c) => c + 1);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: ADDON_NOTIF_TABLE },
        () => {
          if (!foodNotifOpenRef.current) {
            scheduleFoodRecount(250);
          } else {
            void fetchFoodUnreadCount();
          }
        }
      )
      .subscribe((status) => {
        console.log("ADDON FOOD NOTIF CHANNEL:", status);
      });

    const chConsignment = supabase
      .channel("realtime_consignment_notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: CONSIGNMENT_NOTIF_TABLE },
        async (payload: unknown) => {
          const raw = (payload as RealtimeInsertPayload<LooseRecord>).new;
          let row = mapConsignmentNotifRow(raw);

          if (!row.phone_number) {
            const resolvedPhone = await resolvePhoneNumber(
              row.booking_code,
              row.full_name,
              row.seat_number
            );
            row = { ...row, phone_number: resolvedPhone || "" };
          }

          setFoodNotifItems((prev) => {
            if (prev.some((x) => x.id === row.id)) return prev;
            const merged = [row, ...prev].sort(
              (a, b) =>
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime()
            );
            return merged.slice(0, 100);
          });

          if (foodNotifOpenRef.current) {
            void markAllFoodAsReadSilent();
          } else if (!row.is_read) {
            setFoodUnreadCount((c) => c + 1);
            scheduleFoodRecount(600);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: CONSIGNMENT_NOTIF_TABLE },
        async (payload: unknown) => {
          const p = payload as RealtimeUpdatePayload<LooseRecord>;

          if (foodNotifOpenRef.current && foodSuspendRefreshRef.current) return;

          let newRow = mapConsignmentNotifRow(p.new as LooseRecord);

          if (!newRow.phone_number) {
            const resolvedPhone = await resolvePhoneNumber(
              newRow.booking_code,
              newRow.full_name,
              newRow.seat_number
            );
            newRow = { ...newRow, phone_number: resolvedPhone || "" };
          }

          setFoodNotifItems((prev) => {
            const idx = prev.findIndex((x) => x.id === newRow.id);
            if (idx === -1) return prev;
            const copy = [...prev];
            copy[idx] = newRow;
            return copy;
          });

          if (foodNotifOpenRef.current) return;

          const oldIsRead = Boolean((p.old as LooseRecord).is_read);
          const isUnreadNow = !newRow.is_read;

          if (!oldIsRead && !isUnreadNow) {
            setFoodUnreadCount((c) => Math.max(0, c - 1));
          } else if (oldIsRead && isUnreadNow) {
            setFoodUnreadCount((c) => c + 1);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: CONSIGNMENT_NOTIF_TABLE },
        () => {
          if (!foodNotifOpenRef.current) {
            scheduleFoodRecount(250);
          } else {
            void fetchFoodUnreadCount();
          }
        }
      )
      .subscribe((status) => {
        console.log("CONSIGNMENT FOOD NOTIF CHANNEL:", status);
      });

    const onFocusOrWake = (): void => {
      void fetchFoodUnreadCount();
      if (foodNotifOpenRef.current) computeFoodPopoverPosition();
    };

    window.addEventListener("focus", onFocusOrWake);
    window.addEventListener("online", onFocusOrWake);
    document.addEventListener("visibilitychange", onFocusOrWake);

    return () => {
      window.removeEventListener("focus", onFocusOrWake);
      window.removeEventListener("online", onFocusOrWake);
      document.removeEventListener("visibilitychange", onFocusOrWake);

      cancelFoodScheduledRefresh();
      foodSuspendRefreshRef.current = false;
      void supabase.removeChannel(chAddOn);
      void supabase.removeChannel(chConsignment);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      const target = e.target as Node;

      if (
        notifOpen &&
        bellBtnRef.current &&
        !bellBtnRef.current.contains(target)
      ) {
        const pop = document.querySelector(".notif-popover");
        if (pop && !pop.contains(target)) {
          setNotifOpen(false);
        }
      }

      if (
        foodNotifOpen &&
        foodBtnRef.current &&
        !foodBtnRef.current.contains(target)
      ) {
        const pop = document.querySelector(".food-popover");
        if (pop && !pop.contains(target)) {
          setFoodNotifOpen(false);
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [notifOpen, foodNotifOpen]);

  const menuItems = useMemo<MenuItem[]>(
    () => [
      { name: "Dashboard", key: "dashboard", icon: dashboardIcon },
      { name: "Customer Lists", key: "customer_lists", icon: listIcon },
      {
        name: "Customer Reservations",
        key: "customer_reservations",
        icon: reserveIcon,
      },
      { name: "Customer Calendar", key: "customer_calendar", icon: calendarIcon },
      { name: "Customer Add-Ons", key: "customer_add_ons", icon: onsIcon },
      { name: "Customer Cancelled", key: "customer_cancelled", icon: cancelledIcon },
      { name: "Memberships", key: "customer_promo_list", icon: discountIcon },
      { name: "Sales Report", key: "staff_sales_report", icon: salesIcon },
      { name: "Product Item Lists", key: "product_item_lists", icon: foodIcon },
      { name: "Add Consignment", key: "staff_consignment", icon: consignmentIcon },
      {
        name: "Consignment Record",
        key: "staff_consignment_record",
        icon: staffConsignmentIcon,
      },
      {
        name: "Customer Consignment Record",
        key: "customer_consignment_record",
        icon: consignmentRecordIcon,
      },
    ],
    []
  );

  const flowers: FlowerStatic[] = useMemo(
    () => [
      { id: "big-tr", left: "62%", top: "10%", size: "260px", opacity: 0.18, rotateDeg: 0 },
      { id: "big-bl", left: "-10%", top: "70%", size: "320px", opacity: 0.16, rotateDeg: 0 },
      { id: "s1", left: "58%", top: "52%", size: "110px", opacity: 0.18, rotateDeg: 0 },
      { id: "s2", left: "73%", top: "62%", size: "95px", opacity: 0.18, rotateDeg: 0 },
      { id: "s3", left: "64%", top: "74%", size: "105px", opacity: 0.18, rotateDeg: 0 },
      { id: "s4", left: "78%", top: "78%", size: "90px", opacity: 0.18, rotateDeg: 0 },
      { id: "s5", left: "54%", top: "86%", size: "85px", opacity: 0.16, rotateDeg: 0 },
    ],
    []
  );

  const renderContent = (): React.ReactNode => {
    switch (activePage) {
      case "dashboard":
        return <Staff_Dashboard />;
      case "customer_lists":
        return <Customer_Lists />;
      case "customer_reservations":
        return <Customer_Reservations />;
      case "customer_calendar":
        return <Customer_Calendar />;
      case "customer_add_ons":
        return <Customer_Add_ons />;
      case "customer_cancelled":
        return <Customer_Cancelled />;
      case "customer_promo_list":
        return <Customer_Discount_List />;
      case "staff_sales_report":
        return <Staff_Sales_Report />;
      case "product_item_lists":
        return <Product_Item_Lists />;
      case "staff_consignment":
        return <Staff_Consignment />;
      case "staff_consignment_record":
        return <Staff_Consignment_Record />;
      case "customer_consignment_record":
        return <Customer_Consignment_Record />;
      default:
        return <Staff_Dashboard />;
    }
  };

  const handleLogout = async (): Promise<void> => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      localStorage.clear();
      sessionStorage.clear();
      navigate("/login", { replace: true });
    }
  };

  const activeMenu = menuItems.find((m) => m.key === activePage);

  const spinner = (
    <div className="notif-spinner-wrap">
      <div className="notif-spinner" />
    </div>
  );

  return (
    <div className={`staff-page ${collapsed ? "sidebar-collapsed" : ""}`}>
      <aside className={`staff-sidebar ${collapsed ? "collapsed" : ""}`}>
        <div className="staff-sidebar-inner">
          <div className="staff-sidebar-top">
            <button
              type="button"
              className="staff-toggle-btn"
              onClick={() => setCollapsed((prev) => !prev)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <span />
              <span />
              <span />
            </button>

            {!collapsed && (
              <div className="staff-brand">
                <div className="staff-brand-logo-wrap">
                  <img src={studyHubLogo} alt="Study Hub" className="staff-brand-logo" />
                </div>

                <div className="staff-brand-copy">
                  <span className="staff-brand-badge">STAFF PANEL</span>
                  <h2>Me Tyme Lounge</h2>
                </div>
              </div>
            )}
          </div>

          <div className="staff-menu-content">
            <div className="menu-flowers" aria-hidden="true">
              {flowers.map((f) => (
                <img
                  key={f.id}
                  src={flowerImg}
                  alt=""
                  className="menu-flower"
                  draggable={false}
                  style={{
                    left: f.left,
                    top: f.top,
                    width: f.size,
                    height: f.size,
                    opacity: f.opacity,
                    transform: `rotate(${f.rotateDeg ?? 0}deg)`,
                  }}
                />
              ))}
            </div>

            <div className="staff-menu-list">
              {menuItems.map((item, i) => (
                <button
                  key={item.key}
                  type="button"
                  className={`staff-menu-item ${activePage === item.key ? "active" : ""}`}
                  onClick={() => setActivePage(item.key)}
                  style={{ animationDelay: `${0.08 + i * 0.05}s` }}
                  title={collapsed ? item.name : undefined}
                >
                  <span className="staff-menu-hover-line" />
                  <span className="staff-menu-icon-wrap">
                    <img src={item.icon} alt={item.name} className="staff-menu-icon" />
                  </span>
                  {!collapsed && <span className="staff-menu-title">{item.name}</span>}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="staff-logout-btn"
            onClick={() => void handleLogout()}
            title="Logout"
          >
            <span className="staff-logout-dot" />
            {!collapsed && "Logout"}
          </button>
        </div>
      </aside>

      <main className="staff-main">
        <div className="staff-topbar">
          <div className="staff-topbar-left">
            <button
              type="button"
              className="staff-mobile-toggle"
              onClick={() => setCollapsed((prev) => !prev)}
              aria-label="Toggle sidebar"
            >
              <span />
              <span />
              <span />
            </button>

            <h1 className="staff-topbar-title">
              {activeMenu?.name ?? "Staff Dashboard"}
            </h1>
          </div>

          <div className="topbar-tools">
            <button
              ref={foodBtnRef}
              className="notif-bell-btn food-notif-btn"
              onClick={() => void toggleFoodBell()}
              aria-label="Food Notifications"
              type="button"
            >
              <img src={foodNotifIcon} alt="Food Notifications" className="notif-bell-icon" />
              {foodUnreadCount > 0 && (
                <span className="notif-badge notif-badge-food">{foodUnreadCount}</span>
              )}
            </button>

            <button
              ref={bellBtnRef}
              className="notif-bell-btn"
              onClick={() => void toggleBell()}
              aria-label="Notifications"
              type="button"
            >
              <img src={bellIcon} alt="Notifications" className="notif-bell-icon" />
              {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
            </button>
          </div>
        </div>

        <div className="staff-main-content">
          {boot && (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activePage}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -18 }}
                transition={{ duration: 0.25 }}
                className="staff-content-anim"
              >
                {renderContent()}
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        {foodNotifOpen && (
          <div
            className="notif-popover notif-popover--fixed food-popover"
            style={{ top: `${foodPopoverPos.top}px`, right: `${foodPopoverPos.right}px` }}
            role="dialog"
            aria-label="Food Notifications"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="notif-popover-head">
              <div>
                <div className="notif-title">Food / Add-Ons Notifications</div>
              </div>

              <div className="notif-head-actions">
                <button
                  className="notif-close-btn"
                  onClick={closeFoodBell}
                  aria-label="Close"
                  type="button"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="notif-popover-body food-notif-body">
              {foodNotifLoading ? (
                spinner
              ) : foodNotifItems.length === 0 ? (
                <div className="notif-empty">No food notifications yet.</div>
              ) : (
                foodNotifItems.map((n) => (
                  <div
                    key={n.id}
                    className={`food-notif-card ${n.is_read ? "" : "food-notif-card--unread"}`}
                  >
                    <div className="food-notif-card-top">
                      <div className="food-notif-name">{n.full_name || "Unknown Customer"}</div>
                      <div className="food-notif-datetime">{formatPHDateTime(n.created_at)}</div>
                    </div>

                    <div className="food-notif-grid">
                      <div className="food-notif-row">
                        <span className="food-notif-label">Type</span>
                        <span className="food-notif-value">{getFoodModeLabel(n.mode)}</span>
                      </div>

                      <div className="food-notif-row">
                        <span className="food-notif-label">Phone Number</span>
                        <span className="food-notif-value">{n.phone_number || "-"}</span>
                      </div>

                      <div className="food-notif-row">
                        <span className="food-notif-label">Seat Number</span>
                        <span className="food-notif-value">{n.seat_number || "-"}</span>
                      </div>

                      <div className="food-notif-row">
                        <span className="food-notif-label">Item Name</span>
                        <span className="food-notif-value food-notif-value-wrap">
                          {n.item_name || "-"}
                        </span>
                      </div>

                      <div className="food-notif-row">
                        <span className="food-notif-label">Quantity</span>
                        <span className="food-notif-value">{n.quantity}</span>
                      </div>

                      <div className="food-notif-row">
                        <span className="food-notif-label">Total</span>
                        <span className="food-notif-value food-notif-total">
                          {peso(n.total)}
                        </span>
                      </div>
                    </div>

                    <div className="notif-actions">
                      <button
                        type="button"
                        className="notif-delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDeleteFoodNotification(n);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {notifOpen && (
          <div
            className="notif-popover notif-popover--fixed guest-popover"
            style={{ top: `${popoverPos.top}px`, right: `${popoverPos.right}px` }}
            role="dialog"
            aria-label="Notifications"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="notif-popover-head">
              <div>
                <div className="notif-title">Guest Messages</div>
                <div className="notif-subtitle">
                  Anonymous / guest concern, feedback, suggestion, request
                </div>
              </div>

              <div className="notif-head-actions">
                <button
                  className="notif-close-btn"
                  onClick={closeBell}
                  aria-label="Close"
                  type="button"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="notif-popover-body">
              {notifLoading ? (
                spinner
              ) : notifItems.length === 0 ? (
                <div className="notif-empty">No messages yet.</div>
              ) : (
                notifItems.map((n) => {
                  const typeValue = normalizeType(n.report_type);

                  return (
                    <div
                      key={n.id}
                      className={`notif-chat-item ${n.is_read ? "" : "notif-chat-item--unread"}`}
                    >
                      <div className="notif-avatar">{getAvatarText(n.name)}</div>

                      <div className="notif-main">
                        <div className="notif-topline">
                          <div className="notif-name">{n.name || "Guest User"}</div>
                          <div className="notif-datetime">{formatPHDateTime(n.created_at)}</div>
                        </div>

                        <div className="notif-meta">
                          <span className={`notif-type-pill notif-type-pill--${typeValue}`}>
                            {getTypeLabel(typeValue)}
                          </span>
                          <span className="notif-seat-pill">
                            Seat: {n.seat_number || "-"}
                          </span>
                        </div>

                        <div className="notif-message">{getMessageText(n)}</div>

                        <div className="notif-actions">
                          <button
                            type="button"
                            className="notif-delete-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDeleteNotification(n.id);
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Staff_menu;