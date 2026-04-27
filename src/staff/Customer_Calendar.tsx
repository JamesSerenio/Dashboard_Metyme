import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import { supabase } from "../utils/supabaseClient";
import "../styles/Customer_Calendar.css";

import walkInIcon from "../assets/customer_reservation.png";
import reservationIcon from "../assets/customer.png";

type Area = "common_area" | "conference_room" | string;

type Counts = {
  walkIn: number;
  reservation: number;
};

type CountMap = Record<string, Counts>;

type TileArgs = {
  date: Date;
  view: "month" | "year" | "decade" | "century";
};

const yyyyMmDdLocal = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const startOfDayLocal = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);

const endOfDayLocal = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

const ensure = (m: CountMap, date: string): Counts => {
  if (!m[date]) m[date] = { walkIn: 0, reservation: 0 };
  return m[date];
};

const addCount = (m: CountMap, date: string, key: keyof Counts): void => {
  ensure(m, date)[key] += 1;
};

const safeDate = (v: string | null | undefined): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
};

const fmtDateTime = (iso: string | null | undefined): string => {
  const d = safeDate(iso);
  if (!d) return "—";
  return d.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const fmtTimeOnly = (iso: string | null | undefined): string => {
  const d = safeDate(iso);
  if (!d) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

interface CustomerSessionRow {
  id: string;
  date: string;
  full_name: string | null;
  reservation: string;
  reservation_date: string | null;
  time_started: string | null;
  time_ended: string | null;
  seat_number: string | null;
  created_at: string | null;
  customer_type?: string | null;
}

interface PromoBookingRow {
  id: string;
  created_at: string | null;
  full_name: string | null;
  seat_number: string | null;
  start_at: string;
  end_at: string | null;
  area: Area;
  status: string | null;
}

type DayKind = "walkIn" | "reservation";

type DayItem = {
  kind: DayKind;
  source: "session" | "promo";
  id: string;
  full_name: string;
  booked_at: string | null;
  time_in: string | null;
  time_out: string | null;
  seat: string | null;
  area?: Area;
  status?: string | null;
};

const normalizeName = (v: string | null | undefined): string => {
  const s = String(v ?? "").trim();
  return s || "Unknown";
};

type CenterModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
};

const CenterModal: React.FC<CenterModalProps> = ({
  open,
  title,
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
    <div className="ccc-modal-overlay" onClick={onClose}>
      <div
        className="ccc-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="ccc-modal-head">
          <h3>{title}</h3>
          <button
            type="button"
            className="ccc-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="ccc-modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
};

const Customer_Calendar: React.FC = () => {
  const [counts, setCounts] = useState<CountMap>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [dayLoading, setDayLoading] = useState<boolean>(false);
  const [dayWalkIns, setDayWalkIns] = useState<DayItem[]>([]);
  const [dayReservations, setDayReservations] = useState<DayItem[]>([]);

  useEffect(() => {
    void loadCalendar();

    const t = window.setInterval(() => {
      void loadCalendar();
    }, 30000);

    return () => window.clearInterval(t);
  }, []);

  const loadCalendar = async (): Promise<void> => {
    try {
      setLoading(true);

      const sessionsReq = supabase
        .from("customer_sessions")
        .select("id, date, full_name, reservation, reservation_date, customer_type");

      const promosReq = supabase
        .from("promo_bookings")
        .select("id, start_at, area, status");

      const [{ data: sessions, error: sErr }, { data: promos, error: pErr }] =
        await Promise.all([sessionsReq, promosReq]);

      if (sErr) console.error("customer_sessions error:", sErr.message);
      if (pErr) console.error("promo_bookings error:", pErr.message);

      const result: CountMap = {};

      (sessions ?? []).forEach(
        (
          s: Omit<
            CustomerSessionRow,
            "time_started" | "time_ended" | "seat_number" | "created_at"
          >
        ) => {
          const ctype = String(s.customer_type ?? "").trim().toLowerCase();
          if (ctype === "promo") return;

          if (s.reservation === "yes" && s.reservation_date) {
            addCount(result, s.reservation_date, "reservation");
          } else {
            addCount(result, s.date, "walkIn");
          }
        }
      );

      const now = new Date();
      const todayStart = startOfDayLocal(now);
      const todayEnd = endOfDayLocal(now);

      (promos ?? []).forEach((p: Pick<PromoBookingRow, "start_at" | "area" | "status">) => {
        const start = new Date(p.start_at);
        if (!Number.isFinite(start.getTime())) return;

        const dateKey = yyyyMmDdLocal(start);

        if (p.area === "common_area") {
          const isToday = start >= todayStart && start <= todayEnd;
          if (isToday && start <= now) addCount(result, dateKey, "walkIn");
          else addCount(result, dateKey, "reservation");
        } else if (p.area === "conference_room") {
          addCount(result, dateKey, "reservation");
        } else {
          addCount(result, dateKey, "reservation");
        }
      });

      setCounts(result);
      setLastUpdated(
        new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      );
    } finally {
      setLoading(false);
    }
  };

  const loadDayDetails = async (day: Date): Promise<void> => {
    const dayKey = yyyyMmDdLocal(day);

    try {
      setDayLoading(true);
      setDayWalkIns([]);
      setDayReservations([]);

      const sessionsReq = supabase
        .from("customer_sessions")
        .select(
          "id, date, full_name, reservation, reservation_date, time_started, time_ended, seat_number, created_at, customer_type"
        )
        .or(`date.eq.${dayKey},reservation_date.eq.${dayKey}`);

      const dayStartIso = startOfDayLocal(day).toISOString();
      const dayEndIso = endOfDayLocal(day).toISOString();

      const promosReq = supabase
        .from("promo_bookings")
        .select("id, created_at, full_name, seat_number, start_at, end_at, area, status")
        .gte("start_at", dayStartIso)
        .lte("start_at", dayEndIso);

      const [{ data: sessions, error: sErr }, { data: promos, error: pErr }] =
        await Promise.all([sessionsReq, promosReq]);

      if (sErr) console.error("day sessions error:", sErr.message);
      if (pErr) console.error("day promos error:", pErr.message);

      const walkIns: DayItem[] = [];
      const reservations: DayItem[] = [];

      (sessions ?? []).forEach((s: CustomerSessionRow) => {
        const ctype = String(s.customer_type ?? "").trim().toLowerCase();
        if (ctype === "promo") return;

        const kind: DayKind =
          s.reservation === "yes" && s.reservation_date === dayKey
            ? "reservation"
            : s.date === dayKey
            ? "walkIn"
            : "walkIn";

        const item: DayItem = {
          kind,
          source: "session",
          id: s.id,
          full_name: normalizeName(s.full_name),
          booked_at: s.created_at ?? null,
          time_in: s.time_started ?? null,
          time_out: s.time_ended ?? null,
          seat: s.seat_number ?? null,
        };

        if (kind === "walkIn") walkIns.push(item);
        else reservations.push(item);
      });

      const now = new Date();
      const todayKey = yyyyMmDdLocal(now);
      const todayStart = startOfDayLocal(now);
      const todayEnd = endOfDayLocal(now);

      (promos ?? []).forEach((p: PromoBookingRow) => {
        const start = new Date(p.start_at);
        if (!Number.isFinite(start.getTime())) return;

        const pKey = yyyyMmDdLocal(start);
        if (pKey !== dayKey) return;

        let kind: DayKind = "reservation";

        if (p.area === "common_area") {
          if (dayKey === todayKey) {
            const isToday = start >= todayStart && start <= todayEnd;
            if (isToday && start <= now) kind = "walkIn";
            else kind = "reservation";
          } else {
            kind = "reservation";
          }
        } else if (p.area === "conference_room") {
          kind = "reservation";
        } else {
          kind = "reservation";
        }

        const item: DayItem = {
          kind,
          source: "promo",
          id: p.id,
          full_name: normalizeName(p.full_name),
          booked_at: p.created_at ?? null,
          time_in: p.start_at ?? null,
          time_out: p.end_at ?? null,
          seat: p.seat_number ?? null,
          area: p.area,
          status: p.status ?? null,
        };

        if (kind === "walkIn") walkIns.push(item);
        else reservations.push(item);
      });

      const byTime = (a: DayItem, b: DayItem): number => {
        const ta = safeDate(a.time_in)?.getTime() ?? 0;
        const tb = safeDate(b.time_in)?.getTime() ?? 0;
        return ta - tb;
      };

      walkIns.sort(byTime);
      reservations.sort(byTime);

      setDayWalkIns(walkIns);
      setDayReservations(reservations);
    } finally {
      setDayLoading(false);
    }
  };

  const tileContent = ({ date, view }: TileArgs): React.ReactNode => {
    if (view !== "month") return null;

    const key = yyyyMmDdLocal(date);
    const data = counts[key];
    if (!data) return null;

    const showRes = data.reservation > 0;
    const showWalk = data.walkIn > 0;

    if (!showRes && !showWalk) return null;

    return (
      <>
        {showRes && (
          <div
            className="ccc-icon-wrap ccc-reservation"
            title={`Reservation: ${data.reservation}`}
          >
            <img src={reservationIcon} alt="Reservation" />
            <span className="ccc-count">{data.reservation}</span>
          </div>
        )}

        {showWalk && (
          <div
            className="ccc-icon-wrap ccc-walkin"
            title={`Walk-in: ${data.walkIn}`}
          >
            <img src={walkInIcon} alt="Walk-in" />
            <span className="ccc-count">{data.walkIn}</span>
          </div>
        )}
      </>
    );
  };

  const selectedKey = useMemo(() => yyyyMmDdLocal(selectedDate), [selectedDate]);

  const openDayModal = (d: Date): void => {
    setSelectedDate(d);
    setIsModalOpen(true);
    void loadDayDetails(d);
  };

  return (
    <div className="ccc-page">
      <div className="ccc-shell">
        <div className="ccc-card">
          <div className="ccc-topbar">
            <div className="ccc-topbar-left">
              <div className="ccc-eyebrow">LIVE VIEW</div>
              <h2 className="ccc-title">Customer Calendar</h2>
              <p className="ccc-subtitle">
                Reservation sa top-left, walk-in sa bottom-right.
              </p>
            </div>

            <div className="ccc-topbar-right">
              <button
                className="ccc-btn ccc-btn-dark"
                onClick={() => void loadCalendar()}
                disabled={loading}
                type="button"
              >
                {loading ? "Refreshing..." : "Refresh"}
              </button>

              <div className="ccc-updated">
                Updated: <strong>{lastUpdated || "—"}</strong>
              </div>
            </div>
          </div>

          <div className="ccc-legend">
            <div className="ccc-legend-row">
              <img src={reservationIcon} className="ccc-legend-icon" alt="Reservation" />
              <span>
                <strong>Reservation</strong> — future bookings & conference room
              </span>
            </div>

            <div className="ccc-legend-row">
              <img src={walkInIcon} className="ccc-legend-icon" alt="Walk-in" />
              <span>
                <strong>Walk-in</strong> — already started today
              </span>
            </div>
          </div>

          <div className="ccc-calendar-wrap">
            <Calendar
              tileContent={tileContent}
              showNeighboringMonth={true}
              showFixedNumberOfWeeks={true}
              locale="en-US"
              calendarType="gregory"
              onClickDay={(value: Date) => openDayModal(value)}
            />
          </div>
        </div>
      </div>

      <CenterModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={`${selectedKey} • Details`}
      >
        <div className="ccc-day-top">
          <button
            className="ccc-btn ccc-btn-light"
            onClick={() => void loadDayDetails(selectedDate)}
            disabled={dayLoading}
            type="button"
          >
            {dayLoading ? "Loading..." : "Refresh Day"}
          </button>
        </div>

        {dayLoading ? (
          <div className="ccc-loading">Loading details...</div>
        ) : (
          <div className="ccc-day-sections">
            <div className="ccc-day-section">
              <div className="ccc-day-section-head">
                <img
                  src={reservationIcon}
                  className="ccc-legend-icon"
                  alt="Reservation"
                />
                <h3 className="ccc-day-section-title">
                  Reservations ({dayReservations.length})
                </h3>
              </div>

              {dayReservations.length === 0 ? (
                <div className="ccc-day-empty">No reservations.</div>
              ) : (
                <div className="ccc-day-list">
                  {dayReservations.map((it) => (
                    <div key={`${it.source}-${it.id}`} className="ccc-day-item">
                      <div className="ccc-day-item-name">{it.full_name}</div>

                      <div className="ccc-day-item-meta">
                        <div>
                          <strong>Booked:</strong> {fmtDateTime(it.booked_at)}
                        </div>
                        <div>
                          <strong>Time In:</strong> {fmtTimeOnly(it.time_in)}{" "}
                          <span className="ccc-dot">•</span>{" "}
                          <strong>Time Out:</strong> {fmtTimeOnly(it.time_out)}
                        </div>
                        <div>
                          <strong>Seat:</strong> {it.seat ?? "—"}
                        </div>

                        {it.source === "promo" && (
                          <div>
                            <strong>Area:</strong> {String(it.area ?? "—")}{" "}
                            <span className="ccc-dot">•</span>{" "}
                            <strong>Status:</strong> {String(it.status ?? "—")}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="ccc-day-section">
              <div className="ccc-day-section-head">
                <img src={walkInIcon} className="ccc-legend-icon" alt="Walk-in" />
                <h3 className="ccc-day-section-title">
                  Walk-ins ({dayWalkIns.length})
                </h3>
              </div>

              {dayWalkIns.length === 0 ? (
                <div className="ccc-day-empty">No walk-ins.</div>
              ) : (
                <div className="ccc-day-list">
                  {dayWalkIns.map((it) => (
                    <div key={`${it.source}-${it.id}`} className="ccc-day-item">
                      <div className="ccc-day-item-name">{it.full_name}</div>

                      <div className="ccc-day-item-meta">
                        <div>
                          <strong>Booked:</strong> {fmtDateTime(it.booked_at)}
                        </div>
                        <div>
                          <strong>Time In:</strong> {fmtTimeOnly(it.time_in)}{" "}
                          <span className="ccc-dot">•</span>{" "}
                          <strong>Time Out:</strong> {fmtTimeOnly(it.time_out)}
                        </div>
                        <div>
                          <strong>Seat:</strong> {it.seat ?? "—"}
                        </div>

                        {it.source === "promo" && (
                          <div>
                            <strong>Area:</strong> {String(it.area ?? "—")}{" "}
                            <span className="ccc-dot">•</span>{" "}
                            <strong>Status:</strong> {String(it.status ?? "—")}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </CenterModal>
    </div>
  );
};

export default Customer_Calendar;