import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import Login from "./pages/Login";
import Admin_menu from "./admin/Admin_menu";
import Staff_menu from "./staff/Staff_menu";

import TimeAlertModal from "./components/TimeAlertModal";
import AddOnCodeAlertModal from "./components/AddOnCodeAlertModal";

import { supabase } from "./utils/supabaseClient";

const ALERT_MINUTES = [5, 3, 1];

const minutesLeftCeil = (endIso) => {
  const end = new Date(endIso).getTime();
  const now = Date.now();
  const ms = end - now;
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.ceil(ms / 60000);
};

const seatText = (seat) => {
  if (Array.isArray(seat)) return seat.join(", ");
  return seat ?? "";
};

const asString = (value) => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
};

const toNum = (value) => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

const getRoleLocal = () =>
  (localStorage.getItem("role") || "").toLowerCase();

const getModeLabel = (mode) =>
  mode === "consignment" ? "consignment" : "add_ons";

const makeLookupKey = (fullName, seatNumber) =>
  `${asString(fullName).toLowerCase()}|${asString(seatNumber).toLowerCase()}`;

const AppRoutes = () => {
  const location = useLocation();

  const [alerts, setAlerts] = useState([]);
  const [orderAlerts, setOrderAlerts] = useState([]);
  const [showTimeAlert, setShowTimeAlert] = useState(false);

  const [codeAlerts, setCodeAlerts] = useState([]);
  const [showCodeAlert, setShowCodeAlert] = useState(false);

  const [role, setRole] = useState(getRoleLocal());

  const isStaffOrAdmin = useMemo(
    () => role === "staff" || role === "admin",
    [role]
  );

  const isAllowedAlertRoute = useMemo(() => {
    return (
      location.pathname === "/staff-menu" || location.pathname === "/admin-menu"
    );
  }, [location.pathname]);

  const canShowModal = isStaffOrAdmin && isAllowedAlertRoute;

  const triggeredRef = useRef(new Set());
  const sessionsRef = useRef(new Map());
  const promosRef = useRef(new Map());

  const fetchedNotificationIdsRef = useRef(new Set());
  const resolvedMetaCacheRef = useRef(new Map());

  const resetAllAlertState = useCallback(() => {
    setShowTimeAlert(false);
    setShowCodeAlert(false);
    setAlerts([]);
    setOrderAlerts([]);
    setCodeAlerts([]);
    triggeredRef.current.clear();
    sessionsRef.current.clear();
    promosRef.current.clear();
    fetchedNotificationIdsRef.current.clear();
    resolvedMetaCacheRef.current.clear();
  }, []);

  const syncRoleFromSupabase = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession();
    const user = sess.session?.user;

    if (!user?.id) {
      localStorage.removeItem("role");
      setRole("");
      return;
    }

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      setRole(getRoleLocal());
      return;
    }

    const r = (profile?.role || "").toLowerCase();
    localStorage.setItem("role", r);
    setRole(r);
  }, []);

  useEffect(() => {
    const run = async () => {
      await syncRoleFromSupabase();
    };

    run();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      syncRoleFromSupabase();
    });

    const onStorage = (e) => {
      if (e.key === "role") setRole(getRoleLocal());
    };

    window.addEventListener("storage", onStorage);

    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, [syncRoleFromSupabase]);

  const addAlert = useCallback((a) => {
    setAlerts((prev) => {
      if (prev.some((x) => x.key === a.key)) return prev;
      return [...prev, a].sort((x, y) => x.minutes_left - y.minutes_left);
    });
    setShowTimeAlert(true);
  }, []);

  const addOrderAlert = useCallback((a) => {
    setOrderAlerts([a]);
    setShowTimeAlert(true);
  }, []);

  const addCodeAlert = useCallback((a) => {
    setCodeAlerts([a]);
    setShowCodeAlert(true);
  }, []);

  const fireAlert = useCallback(
    (kind, id, full_name, seat_number, end_iso) => {
      const mLeft = minutesLeftCeil(end_iso);
      if (!ALERT_MINUTES.includes(mLeft)) return;

      const key = `${kind}-${id}-${mLeft}`;
      if (triggeredRef.current.has(key)) return;
      triggeredRef.current.add(key);

      addAlert({
        key,
        kind,
        id,
        full_name,
        seat_number,
        minutes_left: mLeft,
      });
    },
    [addAlert]
  );

  const resolveCustomerMeta = useCallback(async (fullName, seatNumber) => {
    const key = makeLookupKey(fullName, seatNumber);
    if (resolvedMetaCacheRef.current.has(key)) {
      return resolvedMetaCacheRef.current.get(key);
    }

    const now = Date.now();
    const cleanSeat = asString(seatNumber);
    const cleanName = asString(fullName);

    let resolved = {
      phone_number: "",
      booking_code: "",
    };

    try {
      const sessionQuery = supabase
        .from("customer_sessions")
        .select(
          "id, full_name, seat_number, phone_number, booking_code, time_started, time_ended, created_at"
        )
        .eq("full_name", cleanName)
        .order("created_at", { ascending: false })
        .limit(10);

      const sessionRes =
        cleanSeat && cleanSeat !== "CONFERENCE ROOM"
          ? await sessionQuery.eq("seat_number", cleanSeat)
          : await sessionQuery;

      if (!sessionRes.error && Array.isArray(sessionRes.data) && sessionRes.data.length > 0) {
        const activeSession =
          sessionRes.data.find((row) => {
            const start = new Date(row.time_started).getTime();
            const end = row.time_ended ? new Date(row.time_ended).getTime() : Infinity;
            return Number.isFinite(start) && now >= start && now < end;
          }) ?? sessionRes.data[0];

        resolved = {
          phone_number: asString(activeSession.phone_number),
          booking_code: asString(activeSession.booking_code),
        };
      }

      if (!resolved.phone_number || !resolved.booking_code) {
        let promoRes;

        if (cleanSeat === "CONFERENCE ROOM") {
          promoRes = await supabase
            .from("promo_bookings")
            .select(
              "id, full_name, phone_number, promo_code, area, seat_number, start_at, end_at, created_at"
            )
            .eq("full_name", cleanName)
            .eq("area", "conference_room")
            .order("created_at", { ascending: false })
            .limit(10);
        } else {
          promoRes = await supabase
            .from("promo_bookings")
            .select(
              "id, full_name, phone_number, promo_code, area, seat_number, start_at, end_at, created_at"
            )
            .eq("full_name", cleanName)
            .eq("area", "common_area")
            .eq("seat_number", cleanSeat)
            .order("created_at", { ascending: false })
            .limit(10);
        }

        if (!promoRes.error && Array.isArray(promoRes.data) && promoRes.data.length > 0) {
          const activePromo =
            promoRes.data.find((row) => {
              const start = new Date(row.start_at).getTime();
              const end = new Date(row.end_at).getTime();
              return Number.isFinite(start) && Number.isFinite(end) && now >= start && now < end;
            }) ?? promoRes.data[0];

          resolved = {
            phone_number: resolved.phone_number || asString(activePromo.phone_number),
            booking_code: resolved.booking_code || asString(activePromo.promo_code),
          };
        }
      }
    } catch (error) {
      console.warn("resolveCustomerMeta failed:", error);
    }

    resolvedMetaCacheRef.current.set(key, resolved);
    return resolved;
  }, []);

  const buildOrderTextFromNotif = useCallback((row, mode) => {
    const name =
      mode === "consignment"
        ? asString(row.consignment_name || row.item_name || row.product_name || row.name)
        : asString(
            row.add_on_name ||
              row.addon_name ||
              row.item_name ||
              row.product_name ||
              row.food_name ||
              row.name_of_addon
          );

    const qty = Math.max(1, Math.floor(toNum(row.quantity || row.qty || 1)));
    return `${name || (mode === "consignment" ? "Other Item" : "Add-On")} x${qty}`;
  }, []);

  const handleIncomingFoodNotification = useCallback(
    async (raw, mode) => {
      const notifId = `${getModeLabel(mode)}-${asString(raw.id)}`;
      if (!asString(raw.id)) return;
      if (fetchedNotificationIdsRef.current.has(notifId)) return;
      fetchedNotificationIdsRef.current.add(notifId);

      const full_name = asString(
        raw.full_name || raw.name || raw.customer_name || raw.customer
      );
      const seat_number = asString(raw.seat_number || raw.seat || raw.table_no);
      const order_text = buildOrderTextFromNotif(raw, mode);
      const created_at = asString(raw.created_at) || new Date().toISOString();

      const meta = await resolveCustomerMeta(full_name, seat_number);

      addOrderAlert({
        key: notifId,
        kind: mode,
        id: asString(raw.id),
        full_name: full_name || "Unknown Customer",
        seat_number: seat_number || "-",
        created_at,
        lines: [
          {
            name: order_text.replace(/\sx\d+$/, ""),
            quantity: Math.max(1, Math.floor(toNum(raw.quantity || raw.qty || 1))),
          },
        ],
      });

      addCodeAlert({
        id: notifId,
        full_name: full_name || "Unknown Customer",
        phone_number: meta.phone_number || "-",
        seat_number: seat_number || "-",
        booking_code: meta.booking_code || "-",
        order_text,
        mode,
      });
    },
    [addCodeAlert, addOrderAlert, buildOrderTextFromNotif, resolveCustomerMeta]
  );

  const tickCheckAll = useCallback(() => {
    const now = Date.now();

    Array.from(sessionsRef.current.values()).forEach((s) => {
      const endIso = s.time_ended;
      if (!endIso) return;

      const endMs = new Date(endIso).getTime();
      if (!Number.isFinite(endMs) || endMs <= now) {
        sessionsRef.current.delete(s.id);
        return;
      }

      const kind = s.promo_booking_id
        ? "promo"
        : String(s.reservation ?? "").toLowerCase() === "yes"
          ? "reservation"
          : "walkin";

      fireAlert(kind, s.id, s.full_name, seatText(s.seat_number), endIso);
    });

    Array.from(promosRef.current.values()).forEach((p) => {
      const endMs = new Date(p.end_at).getTime();
      if (!Number.isFinite(endMs) || endMs <= now) {
        promosRef.current.delete(p.id);
        return;
      }

      const seat =
        p.area === "conference_room" ? "CONFERENCE ROOM" : p.seat_number ?? "-";

      fireAlert("promo", p.id, p.full_name, seat, p.end_at);
    });
  }, [fireAlert]);

  const loadActiveCustomerSessions = useCallback(async () => {
    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from("customer_sessions")
      .select(
        "id, created_at, full_name, seat_number, time_ended, reservation, promo_booking_id"
      )
      .not("time_ended", "is", null)
      .gt("time_ended", nowIso)
      .order("time_ended", { ascending: true })
      .limit(400);

    if (error || !data) return;

    const map = new Map();
    data.forEach((r) => map.set(r.id, r));
    sessionsRef.current = map;
  }, []);

  const loadActivePromos = useCallback(async () => {
    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from("promo_bookings")
      .select(
        "id, created_at, full_name, seat_number, area, start_at, end_at, status"
      )
      .gt("end_at", nowIso)
      .order("end_at", { ascending: true })
      .limit(400);

    if (error || !data) return;

    const map = new Map();
    data.forEach((r) => map.set(r.id, r));
    promosRef.current = map;
  }, []);

  useEffect(() => {
    if (!isStaffOrAdmin) {
      const t = window.setTimeout(() => {
        resetAllAlertState();
      }, 0);

      return () => window.clearTimeout(t);
    }

    let alive = true;

    (async () => {
      await loadActiveCustomerSessions();
      await loadActivePromos();
      if (alive) tickCheckAll();
    })();

    const chSessions = supabase
      .channel("rt_customer_sessions_alerts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "customer_sessions" },
        (payload) => {
          const row = payload.new;
          if (!row?.id) return;
          sessionsRef.current.set(row.id, row);
          tickCheckAll();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "customer_sessions" },
        (payload) => {
          const row = payload.new;
          if (!row?.id) return;
          sessionsRef.current.set(row.id, row);
          tickCheckAll();
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "customer_sessions" },
        (payload) => {
          const oldRow = payload.old;
          if (oldRow?.id) sessionsRef.current.delete(oldRow.id);
        }
      )
      .subscribe();

    const chPromos = supabase
      .channel("rt_promo_bookings_alerts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "promo_bookings" },
        (payload) => {
          const row = payload.new;
          if (!row?.id) return;
          promosRef.current.set(row.id, row);
          tickCheckAll();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "promo_bookings" },
        (payload) => {
          const row = payload.new;
          if (!row?.id) return;
          promosRef.current.set(row.id, row);
          tickCheckAll();
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "promo_bookings" },
        (payload) => {
          const oldRow = payload.old;
          if (oldRow?.id) promosRef.current.delete(oldRow.id);
        }
      )
      .subscribe();

    const chAddonNotif = supabase
      .channel("rt_add_on_notifications_code_alerts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "add_on_notifications" },
        (payload) => {
          const row = payload.new;
          if (!row?.id) return;
          void handleIncomingFoodNotification(row, "add_ons");
        }
      )
      .subscribe();

    const chConsignmentNotif = supabase
      .channel("rt_consignment_notifications_code_alerts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "consignment_notifications" },
        (payload) => {
          const row = payload.new;
          if (!row?.id) return;
          void handleIncomingFoodNotification(row, "consignment");
        }
      )
      .subscribe();

    const tick = window.setInterval(() => tickCheckAll(), 1000);

    const refresh = () => {
      loadActiveCustomerSessions();
      loadActivePromos();
      window.setTimeout(() => tickCheckAll(), 200);
    };

    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      alive = false;
      window.clearInterval(tick);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVis);

      supabase.removeChannel(chSessions);
      supabase.removeChannel(chPromos);
      supabase.removeChannel(chAddonNotif);
      supabase.removeChannel(chConsignmentNotif);
    };
  }, [
    handleIncomingFoodNotification,
    isStaffOrAdmin,
    loadActiveCustomerSessions,
    loadActivePromos,
    resetAllAlertState,
    tickCheckAll,
  ]);

  useEffect(() => {
    if (!canShowModal) {
      const t = window.setTimeout(() => {
        setShowTimeAlert(false);
        setShowCodeAlert(false);
      }, 0);

      return () => window.clearTimeout(t);
    }
  }, [canShowModal]);

  const stopOne = useCallback((key) => {
    setAlerts((prev) => prev.filter((x) => x.key !== key));
    setOrderAlerts((prev) => prev.filter((x) => x.key !== key));

    window.setTimeout(() => {
      setAlerts((timeNow) => {
        setOrderAlerts((orderNow) => {
          if (timeNow.length === 0 && orderNow.length === 0) {
            setShowTimeAlert(false);
          }
          return orderNow;
        });
        return timeNow;
      });
    }, 0);
  }, []);

  const closeOneCode = useCallback((id) => {
    setCodeAlerts((prev) => {
      const next = prev.filter((x) => x.id !== id);
      if (next.length === 0) setShowCodeAlert(false);
      return next;
    });
  }, []);

  const closeAllCodes = useCallback(() => {
    setCodeAlerts([]);
    setShowCodeAlert(false);
  }, []);

  return (
    <>
      {canShowModal ? (
        <>
          <TimeAlertModal
            isOpen={showTimeAlert}
            alerts={alerts}
            orderAlerts={orderAlerts}
            onStopOne={stopOne}
            onClose={() => setShowTimeAlert(false)}
          />

          <AddOnCodeAlertModal
            isOpen={showCodeAlert}
            alerts={codeAlerts}
            onCloseOne={closeOneCode}
            onCloseAll={closeAllCodes}
          />
        </>
      ) : null}

      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin-menu" element={<Admin_menu />} />
        <Route path="/staff-menu" element={<Staff_menu />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </>
  );
};

function App() {
  return <AppRoutes />;
}

export default App;