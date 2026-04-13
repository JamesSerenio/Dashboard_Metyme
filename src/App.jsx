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

const asString = (value) => (typeof value === "string" ? value : "");

const toNum = (value) => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

const getRoleLocal = () =>
  (localStorage.getItem("role") || "").toLowerCase();

const firstObj = (value) => {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
};

const sleep = (ms) =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

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

  const resetAllAlertState = useCallback(() => {
    setShowTimeAlert(false);
    setShowCodeAlert(false);
    setAlerts([]);
    setOrderAlerts([]);
    setCodeAlerts([]);
    triggeredRef.current.clear();
    sessionsRef.current.clear();
    promosRef.current.clear();
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
    setOrderAlerts((prev) => {
      if (prev.some((x) => x.key === a.key)) return prev;
      return [a, ...prev];
    });
    setShowTimeAlert(true);
  }, []);

  const addCodeAlert = useCallback((a) => {
    setCodeAlerts((prev) => {
      if (prev.some((x) => x.id === a.id)) return prev;
      return [a, ...prev];
    });
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

  const buildAddOnLines = useCallback((rows) => {
    return (rows ?? [])
      .map((row) => {
        const catalog = firstObj(row.add_ons);
        return {
          name: asString(catalog?.name).trim() || "Order Item",
          quantity: Math.max(1, Math.floor(toNum(row.quantity))),
          size: asString(catalog?.size).trim() || "-",
          image_url: catalog?.image_url ?? null,
        };
      })
      .filter((line) => line.name.trim().length > 0);
  }, []);

  const buildConsignmentLines = useCallback((rows) => {
    return (rows ?? [])
      .map((row) => {
        const catalog = firstObj(row.consignment);
        return {
          name: asString(catalog?.item_name).trim() || "Other Item",
          quantity: Math.max(1, Math.floor(toNum(row.quantity))),
          size: asString(catalog?.size).trim() || "-",
          image_url: catalog?.image_url ?? null,
        };
      })
      .filter((line) => line.name.trim().length > 0);
  }, []);

  const fetchAddOnOrderAlert = useCallback(
    async (orderId) => {
      const key = `add_ons-${orderId}`;

      for (let attempt = 0; attempt < 8; attempt += 1) {
        const { data, error } = await supabase
          .from("addon_orders")
          .select(`
            id,
            full_name,
            seat_number,
            created_at,
            addon_order_items (
              quantity,
              add_ons (
                name,
                size,
                image_url
              )
            )
          `)
          .eq("id", orderId)
          .maybeSingle();

        if (!error && data?.id) {
          const lines = buildAddOnLines(data.addon_order_items);

          if (lines.length > 0) {
            addOrderAlert({
              key,
              kind: "add_ons",
              id: data.id,
              full_name: asString(data.full_name).trim() || "Unknown Customer",
              seat_number: asString(data.seat_number).trim() || "-",
              created_at: asString(data.created_at),
              lines,
            });

            addCodeAlert({
              id: `${data.id}-code`,
              full_name: asString(data.full_name).trim() || "Unknown Customer",
              seat_number: asString(data.seat_number).trim() || "-",
              booking_code: data.id,
              order_text: lines
                .map((line) => `${line.name} x${line.quantity}`)
                .join(", "),
              mode: "add_ons",
            });

            return;
          }
        }

        await sleep(250);
      }
    },
    [addCodeAlert, addOrderAlert, buildAddOnLines]
  );

  const fetchConsignmentOrderAlert = useCallback(
    async (orderId) => {
      const key = `consignment-${orderId}`;

      for (let attempt = 0; attempt < 8; attempt += 1) {
        const { data, error } = await supabase
          .from("consignment_orders")
          .select(`
            id,
            full_name,
            seat_number,
            created_at,
            consignment_order_items (
              quantity,
              consignment (
                item_name,
                size,
                image_url
              )
            )
          `)
          .eq("id", orderId)
          .maybeSingle();

        if (!error && data?.id) {
          const lines = buildConsignmentLines(data.consignment_order_items);

          if (lines.length > 0) {
            addOrderAlert({
              key,
              kind: "consignment",
              id: data.id,
              full_name: asString(data.full_name).trim() || "Unknown Customer",
              seat_number: asString(data.seat_number).trim() || "-",
              created_at: asString(data.created_at),
              lines,
            });

            addCodeAlert({
              id: `${data.id}-code`,
              full_name: asString(data.full_name).trim() || "Unknown Customer",
              seat_number: asString(data.seat_number).trim() || "-",
              booking_code: data.id,
              order_text: lines
                .map((line) => `${line.name} x${line.quantity}`)
                .join(", "),
              mode: "consignment",
            });

            return;
          }
        }

        await sleep(250);
      }
    },
    [addCodeAlert, addOrderAlert, buildConsignmentLines]
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

    const chAddOnOrders = supabase
      .channel("rt_addon_orders_alerts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "addon_orders" },
        (payload) => {
          const row = payload.new;
          if (!row?.id) return;
          fetchAddOnOrderAlert(row.id);
        }
      )
      .subscribe();

    const chConsignmentOrders = supabase
      .channel("rt_consignment_orders_alerts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "consignment_orders" },
        (payload) => {
          const row = payload.new;
          if (!row?.id) return;
          fetchConsignmentOrderAlert(row.id);
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
      supabase.removeChannel(chAddOnOrders);
      supabase.removeChannel(chConsignmentOrders);
    };
  }, [
    isStaffOrAdmin,
    fetchAddOnOrderAlert,
    fetchConsignmentOrderAlert,
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