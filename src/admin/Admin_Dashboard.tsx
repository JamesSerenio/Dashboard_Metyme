import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../utils/supabaseClient";
import { motion, AnimatePresence } from "framer-motion";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import "../styles/admin_dashboard.css";

import iconWalkin from "../assets/list.png";
import iconReserve from "../assets/reserve.png";
import iconPromo from "../assets/discount.png";
import iconAll from "../assets/all.png";
import iconCalendar from "../assets/calendar.png";

type Totals = {
  walkin: number;
  reservation: number;
  promo: number;
  all: number;
};

type PieName = "Walk-in" | "Reservation" | "Promo";

type PieRow = {
  name: PieName;
  value: number;
};

type LineRow = {
  day: string;
  total: number;
};

const PIE_COLORS: Record<PieName, string> = {
  "Walk-in": "#2f3b2f",
  Reservation: "#6a3fb5",
  Promo: "#c04b1a",
};

const pad2 = (n: number): string => String(n).padStart(2, "0");

const toYYYYMMDD = (d: Date): string => {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
};

const formatPretty = (yyyyMmDd: string): string => {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "2-digit",
  });
};

const formatShort = (yyyyMmDd: string): string => {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
  });
};

const addDaysYYYYMMDD = (yyyyMmDd: string, delta: number): string => {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return toYYYYMMDD(dt);
};

const pct = (part: number, total: number): number => {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return (part / total) * 100;
};

const formatPct = (n: number): string => {
  if (!Number.isFinite(n)) return "0%";
  const rounded1 = Math.round(n * 10) / 10;
  const isInt = Math.abs(rounded1 - Math.round(rounded1)) < 1e-9;
  return `${isInt ? Math.round(rounded1) : rounded1}%`;
};

const cardSpring = {
  type: "spring" as const,
  stiffness: 180,
  damping: 18,
  mass: 0.9,
};

const numberSpring = {
  type: "spring" as const,
  stiffness: 260,
  damping: 20,
  mass: 0.6,
};

const Admin_Dashboard: React.FC = () => {
  const todayYYYYMMDD = useMemo(() => toYYYYMMDD(new Date()), []);

  const [selectedDate, setSelectedDate] = useState<string>(todayYYYYMMDD);
  const [openCalendar, setOpenCalendar] = useState<boolean>(false);

  const [totals, setTotals] = useState<Totals>({
    walkin: 0,
    reservation: 0,
    promo: 0,
    all: 0,
  });

  const [pulseKey, setPulseKey] = useState<number>(0);
  const [weekSeries, setWeekSeries] = useState<LineRow[]>([]);
  const [weekLoading, setWeekLoading] = useState<boolean>(false);

  const prettyDate = useMemo(() => formatPretty(selectedDate), [selectedDate]);
  const weekStart = useMemo(
    () => addDaysYYYYMMDD(selectedDate, -6),
    [selectedDate],
  );

  const weekRangeLabel = useMemo(() => {
    return `${formatPretty(weekStart)} – ${formatPretty(selectedDate)}`;
  }, [weekStart, selectedDate]);

  const fetchTotalsForDate = async (dateYYYYMMDD: string): Promise<Totals> => {
    const walkinQ = supabase
      .from("customer_sessions")
      .select("id", { count: "exact", head: true })
      .eq("date", dateYYYYMMDD)
      .eq("reservation", "no");

    const reservationQ = supabase
      .from("customer_sessions")
      .select("id", { count: "exact", head: true })
      .eq("date", dateYYYYMMDD)
      .eq("reservation", "yes");

    const startOfDay = new Date(`${dateYYYYMMDD}T00:00:00`);
    const endOfDay = new Date(`${dateYYYYMMDD}T23:59:59`);

    const promoQ = supabase
      .from("promo_bookings")
      .select("id", { count: "exact", head: true })
      .gte("start_at", startOfDay.toISOString())
      .lte("start_at", endOfDay.toISOString());

    const [walkinRes, reservationRes, promoRes] = await Promise.all([
      walkinQ,
      reservationQ,
      promoQ,
    ]);

    const walkin = walkinRes.count ?? 0;
    const reservation = reservationRes.count ?? 0;
    const promo = promoRes.count ?? 0;

    return {
      walkin,
      reservation,
      promo,
      all: walkin + reservation + promo,
    };
  };

  useEffect(() => {
    let alive = true;

    const run = async (): Promise<void> => {
      const t = await fetchTotalsForDate(selectedDate);
      if (!alive) return;

      setTotals(t);
      setPulseKey((k) => k + 1);

      setWeekLoading(true);

      try {
        const days: string[] = Array.from({ length: 7 }, (_, i) =>
          addDaysYYYYMMDD(selectedDate, i - 6),
        );

        const results = await Promise.all(
          days.map(async (d) => {
            const tt = await fetchTotalsForDate(d);
            return {
              day: formatShort(d),
              total: tt.all,
            };
          }),
        );

        if (!alive) return;
        setWeekSeries(results);
      } finally {
        if (alive) setWeekLoading(false);
      }
    };

    void run();

    return () => {
      alive = false;
    };
  }, [selectedDate]);

  const pieData: PieRow[] = useMemo(
    () => [
      { name: "Walk-in", value: totals.walkin },
      { name: "Reservation", value: totals.reservation },
      { name: "Promo", value: totals.promo },
    ],
    [totals.walkin, totals.reservation, totals.promo],
  );

  const pieTotal = useMemo(
    () => totals.walkin + totals.reservation + totals.promo,
    [totals.walkin, totals.reservation, totals.promo],
  );

  const walkinPct = useMemo(
    () => formatPct(pct(totals.walkin, totals.all)),
    [totals.walkin, totals.all],
  );
  const reservePct = useMemo(
    () => formatPct(pct(totals.reservation, totals.all)),
    [totals.reservation, totals.all],
  );
  const promoPct = useMemo(
    () => formatPct(pct(totals.promo, totals.all)),
    [totals.promo, totals.all],
  );

  return (
    <div className="admin-dashboard-page">
      <div className="admin-dashboard-wrap">
        <div className="admin-dash-headline">
          <div>
            <span className="admin-dash-badge">Analytics Overview</span>
            <h2>Admin Dashboard</h2>
            <p>Monitor walk-ins, reservations, promos, and weekly activity.</p>
          </div>

          <button
            type="button"
            className="admin-dash-date-btn"
            onClick={() => setOpenCalendar(true)}
          >
            <img src={iconCalendar} alt="Calendar" />
            <span>{prettyDate}</span>
          </button>
        </div>

        <div className="admin-dash-totals-row">
          <motion.div
            className="admin-dash-total-card admin-dash-total-card--walkin"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={cardSpring}
          >
            <img className="admin-dash-total-icon" src={iconWalkin} alt="Walk-in" />

            <div className="admin-dash-total-meta">
              <div className="admin-dash-total-label">Walk-in</div>
              <AnimatePresence mode="popLayout">
                <motion.div
                  key={`walkin-${pulseKey}-${totals.walkin}`}
                  className="admin-dash-total-value"
                  initial={{ scale: 0.92, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.92, opacity: 0 }}
                  transition={numberSpring}
                >
                  {totals.walkin}
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="admin-dash-total-percent">
              <strong>{walkinPct}</strong>
              <span>of total</span>
            </div>
          </motion.div>

          <motion.div
            className="admin-dash-total-card admin-dash-total-card--reserve"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...cardSpring, delay: 0.03 }}
          >
            <img
              className="admin-dash-total-icon"
              src={iconReserve}
              alt="Reservation"
            />

            <div className="admin-dash-total-meta">
              <div className="admin-dash-total-label">Reservation</div>
              <AnimatePresence mode="popLayout">
                <motion.div
                  key={`reserve-${pulseKey}-${totals.reservation}`}
                  className="admin-dash-total-value"
                  initial={{ scale: 0.92, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.92, opacity: 0 }}
                  transition={numberSpring}
                >
                  {totals.reservation}
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="admin-dash-total-percent">
              <strong>{reservePct}</strong>
              <span>of total</span>
            </div>
          </motion.div>

          <motion.div
            className="admin-dash-total-card admin-dash-total-card--promo"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...cardSpring, delay: 0.06 }}
          >
            <img className="admin-dash-total-icon" src={iconPromo} alt="Promo" />

            <div className="admin-dash-total-meta">
              <div className="admin-dash-total-label">Promo</div>
              <AnimatePresence mode="popLayout">
                <motion.div
                  key={`promo-${pulseKey}-${totals.promo}`}
                  className="admin-dash-total-value"
                  initial={{ scale: 0.92, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.92, opacity: 0 }}
                  transition={numberSpring}
                >
                  {totals.promo}
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="admin-dash-total-percent">
              <strong>{promoPct}</strong>
              <span>of total</span>
            </div>
          </motion.div>

          <motion.div
            className="admin-dash-total-card admin-dash-total-card--all"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...cardSpring, delay: 0.09 }}
          >
            <img className="admin-dash-total-icon" src={iconAll} alt="All" />

            <div className="admin-dash-total-meta">
              <div className="admin-dash-total-label">Total All</div>
              <AnimatePresence mode="popLayout">
                <motion.div
                  key={`all-${pulseKey}-${totals.all}`}
                  className="admin-dash-total-value"
                  initial={{ scale: 0.92, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.92, opacity: 0 }}
                  transition={numberSpring}
                >
                  {totals.all}
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="admin-dash-total-percent">
              <strong>100%</strong>
              <span>overview</span>
            </div>
          </motion.div>
        </div>

        <div className="admin-dash-charts-grid">
          <motion.div
            className="admin-dash-chart-card"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...cardSpring, delay: 0.12 }}
          >
            <div className="admin-dash-chart-head">
              <div>
                <div className="admin-dash-chart-title">Total All (7 days)</div>
                <div className="admin-dash-chart-sub">{weekRangeLabel}</div>
              </div>
            </div>

            {weekLoading ? (
              <div className="admin-dash-chart-loading">
                <div className="admin-dash-loader" />
                <div>Loading...</div>
              </div>
            ) : (
              <div className="admin-dash-line-wrap">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart
                    data={weekSeries}
                    margin={{ top: 10, right: 18, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="total"
                      stroke="#0f5a4a"
                      strokeWidth={3}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                      isAnimationActive
                      animationDuration={700}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </motion.div>

          <motion.div
            className="admin-dash-chart-card"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...cardSpring, delay: 0.16 }}
          >
            <div className="admin-dash-chart-head">
              <div>
                <div className="admin-dash-chart-title">Breakdown</div>
                <div className="admin-dash-chart-sub">{prettyDate}</div>
              </div>
            </div>

            {pieTotal <= 0 ? (
              <div className="admin-dash-chart-empty">No data for this date.</div>
            ) : (
              <div className="admin-dash-chart-body">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={68}
                      outerRadius={104}
                      paddingAngle={3}
                      isAnimationActive
                      animationDuration={700}
                    >
                      {pieData.map((entry) => (
                        <Cell
                          key={`cell-${entry.name}`}
                          fill={PIE_COLORS[entry.name]}
                        />
                      ))}
                    </Pie>

                    <Tooltip
                      formatter={(value: unknown, name: unknown) => {
                        const v = typeof value === "number" ? value : Number(value);
                        const label = String(name);
                        const pv = Number.isFinite(v) ? v : 0;
                        return [`${pv} (${formatPct(pct(pv, pieTotal))})`, label];
                      }}
                    />

                    <Legend verticalAlign="bottom" />
                  </PieChart>
                </ResponsiveContainer>

                <div className="admin-dash-chart-center">
                  <div className="admin-dash-chart-center-label">Total</div>
                  <AnimatePresence mode="popLayout">
                    <motion.div
                      key={`pieTotal-${pulseKey}-${pieTotal}`}
                      className="admin-dash-chart-center-value"
                      initial={{ scale: 0.92, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.92, opacity: 0 }}
                      transition={numberSpring}
                    >
                      {pieTotal}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {openCalendar && (
        <div className="admin-dash-calendar-overlay" onClick={() => setOpenCalendar(false)}>
          <div
            className="admin-dash-calendar-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-dash-calendar-head">
              <h3>Select Date</h3>
              <button
                type="button"
                className="admin-dash-calendar-close"
                onClick={() => setOpenCalendar(false)}
              >
                Close
              </button>
            </div>

            <input
              type="date"
              className="admin-dash-calendar-input"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />

            <div className="admin-dash-calendar-actions">
              <button
                type="button"
                className="admin-dash-calendar-btn secondary"
                onClick={() => setSelectedDate(todayYYYYMMDD)}
              >
                Today
              </button>

              <button
                type="button"
                className="admin-dash-calendar-btn primary"
                onClick={() => setOpenCalendar(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Admin_Dashboard;