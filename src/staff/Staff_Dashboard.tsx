import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../styles/staff_dashboard.css";
import seatsImage from "../assets/seats.png";
import bearImage from "../assets/bear.png";
import grassImage from "../assets/grass.png";
import { supabase } from "../utils/supabaseClient";

type SeatStatus = "temp_available" | "occupied_temp" | "occupied" | "reserved";
type PinKind = "seat" | "room";

type SeatPin = {
  id: string;
  label: string;
  x: number;
  y: number;
  kind: PinKind;
  readonly?: boolean;
  fixedStatus?: SeatStatus;
};

type StoredPos = { x: number; y: number };
type StoredMap = Record<string, StoredPos>;

type SeatBlockedRow = {
  seat_number: string;
  start_at: string;
  end_at: string;
  source: string;
  note: string | null;
};

type PromoBookingRow = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  area: string;
  seat_number: string | null;
  full_name: string;
};

type PackageRow = { id: string; area?: string };
type PackageOptionRow = { id: string };

const STORAGE_KEY = "seatmap_pin_positions_v1";
const CONFERENCE_ID = "CONFERENCE_ROOM";

const SWATCH_GREEN_ID = "__SWATCH_GREEN__";
const SWATCH_YELLOW_ID = "__SWATCH_YELLOW__";
const SWATCH_RED_ID = "__SWATCH_RED__";
const SWATCH_PURPLE_ID = "__SWATCH_PURPLE__";

const STATUS_COLOR: Record<SeatStatus, string> = {
  temp_available: "seat-green",
  occupied_temp: "seat-yellow",
  occupied: "seat-orange",
  reserved: "seat-purple",
};

const formatPHDate = (d: Date): string =>
  d.toLocaleDateString("en-PH", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "2-digit",
  });

const normalizeSeatId = (v: string): string => String(v).trim();

const farFutureIso = (): string =>
  new Date("2999-12-31T23:59:59.000Z").toISOString();

const isStoredPos = (v: unknown): v is StoredPos => {
  if (typeof v !== "object" || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.x === "number" &&
    Number.isFinite(obj.x) &&
    typeof obj.y === "number" &&
    Number.isFinite(obj.y)
  );
};

const loadStored = (): StoredMap => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const rec = parsed as Record<string, unknown>;

    const out: StoredMap = {};
    for (const k of Object.keys(rec)) {
      const v = rec[k];
      if (isStoredPos(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
};

const saveStored = (m: StoredMap): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(m));
};

const normalizeDurationHHMM = (value: string): string | null => {
  const raw = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^0-9:]/g, "");
  if (!raw) return null;

  let m = raw.match(/^(\d{1,8}):(\d{1,2})$/);
  if (m) {
    const h = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
    if (h < 0) return null;
    if (mm < 0 || mm > 59) return null;
    if (h === 0 && mm === 0) return null;
    return `${h.toString().padStart(2, "0")}:${mm
      .toString()
      .padStart(2, "0")}`;
  }

  m = raw.match(/^(\d{1,8})$/);
  if (m) {
    const digits = m[1];

    if (digits.length === 3 || digits.length === 4) {
      const s = digits.padStart(4, "0");
      const hh = parseInt(s.slice(0, 2), 10);
      const mm = parseInt(s.slice(2), 10);
      if (mm <= 59) {
        if (hh === 0 && mm === 0) return null;
        return `${hh.toString().padStart(2, "0")}:${mm
          .toString()
          .padStart(2, "0")}`;
      }
    }

    const h = parseInt(digits, 10);
    if (!Number.isFinite(h) || h <= 0) return null;
    return `${h.toString().padStart(2, "0")}:00`;
  }

  return null;
};

const addDurationToIso = (startIso: string, hhmm: string): string => {
  const start = new Date(startIso);
  if (!Number.isFinite(start.getTime())) return startIso;

  const [hh, mm] = hhmm.split(":");
  const h = Number(hh);
  const m = Number(mm);
  if (Number.isNaN(h) || Number.isNaN(m)) return startIso;

  const totalMin = h * 60 + m;
  return new Date(start.getTime() + totalMin * 60_000).toISOString();
};

const isTempMirrorRow = (note: string | null): boolean => {
  const n = (note ?? "").trim().toLowerCase();
  return n === "temp";
};

const isAutoReservationRow = (note: string | null): boolean => {
  const n = (note ?? "").trim().toLowerCase();
  return n === "reservation";
};

type SeatManageModalProps = {
  isOpen: boolean;
  selectedSeat: string;
  selectedKind: PinKind;
  currentStatus: SeatStatus;
  openTime: boolean;
  durationInput: string;
  saving: boolean;
  onChangeOpenTime: (checked: boolean) => void;
  onChangeDuration: (value: string) => void;
  onBlurDuration: () => void;
  onClose: () => void;
  onClearNow: () => void;
  onTemp: () => void;
  onOccupied: () => void;
  onReserved: () => void;
};

const SeatManageModal: React.FC<SeatManageModalProps> = ({
  isOpen,
  selectedSeat,
  selectedKind,
  currentStatus,
  openTime,
  durationInput,
  saving,
  onChangeOpenTime,
  onChangeDuration,
  onBlurDuration,
  onClose,
  onClearNow,
  onTemp,
  onOccupied,
  onReserved,
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    const prevBodyTouchAction = document.body.style.touchAction;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
      document.body.style.touchAction = prevBodyTouchAction;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isConference = selectedSeat === CONFERENCE_ID;
  const modal = (
    <div
      className="seat-modal-overlay"
      onMouseDown={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="seat-modal-center-anchor"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="seat-manage-modal">
          <div className="seat-modal-header">
            <h2 className="seat-modal-title">Seat Status</h2>
            <button
              type="button"
              className="seat-modal-close"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="seat-modal-body">
            <div className="bookadd-card">
              <div className="form-item">
                <label className="form-label">Target</label>
                <input
                  className="form-input"
                  value={
                    isConference ? "CONFERENCE ROOM" : `SEAT ${selectedSeat}`
                  }
                  readOnly
                />
              </div>

              <div className="form-item">
                <label className="form-label">Current Status</label>
                <input
                  className="form-input"
                  value={currentStatus.replaceAll("_", " ").toUpperCase()}
                  readOnly
                />
              </div>

              <div className="form-item form-item-toggle">
                <label className="form-label">Open Time</label>
                <div className="toggle-wrap">
                  <input
                    id="open-time-toggle"
                    type="checkbox"
                    checked={openTime}
                    onChange={(e) => onChangeOpenTime(e.target.checked)}
                  />
                  <label htmlFor="open-time-toggle" className="toggle-label">
                    {openTime ? "Yes" : "No"}
                  </label>
                </div>
              </div>

              {!openTime ? (
                <div className="form-item">
                  <label className="form-label">
                    Duration (HH:MM or hours)
                  </label>
                  <input
                    className="form-input"
                    value={durationInput}
                    placeholder="Examples: 1 / 0:45 / 2:30 / 230 / 100:30"
                    onChange={(e) => onChangeDuration(e.target.value)}
                    onBlur={onBlurDuration}
                  />
                </div>
              ) : null}

              <button
                type="button"
                className="seat-modal-btn seat-modal-btn--clear"
                disabled={saving}
                onClick={onClearNow}
              >
                {saving ? "Working..." : "Set as Temporarily Available (CLEAR NOW)"}
              </button>

              <div style={{ height: 10 }} />

              <button
                type="button"
                className="seat-modal-btn seat-modal-btn--temp"
                disabled={saving}
                onClick={onTemp}
              >
                Set as Occupied Temporarily (Yellow)
              </button>

              <button
                type="button"
                className="seat-modal-btn seat-modal-btn--occupied"
                disabled={saving}
                onClick={onOccupied}
              >
                Set as Occupied (Red)
              </button>

              <button
                type="button"
                className="seat-modal-btn seat-modal-btn--reserved"
                disabled={saving}
                onClick={onReserved}
              >
                Set as Reserved (Purple)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

const Staff_Dashboard: React.FC = () => {
  const defaultPins: SeatPin[] = useMemo(
    () => [
      { id: CONFERENCE_ID, label: "CONFERENCE ROOM", x: 13, y: 21.6, kind: "room" },

      { id: "6", label: "6", x: 39.3, y: 29, kind: "seat" },
      { id: "5", label: "5", x: 45.8, y: 29, kind: "seat" },
      { id: "4", label: "4", x: 52.5, y: 29, kind: "seat" },
      { id: "3", label: "3", x: 58.9, y: 29, kind: "seat" },
      { id: "2", label: "2", x: 73.6, y: 29, kind: "seat" },
      { id: "1", label: "1", x: 80.2, y: 29, kind: "seat" },

      { id: "11", label: "11", x: 13, y: 40.7, kind: "seat" },
      { id: "10", label: "10", x: 25.5, y: 42.7, kind: "seat" },
      { id: "9", label: "9", x: 28, y: 39.5, kind: "seat" },

      { id: "8A", label: "8A", x: 42, y: 39.5, kind: "seat" },
      { id: "8B", label: "8B", x: 42.0, y: 43, kind: "seat" },

      { id: "7A", label: "7A", x: 58, y: 39.7, kind: "seat" },
      { id: "7B", label: "7B", x: 58.2, y: 43, kind: "seat" },

      { id: "13", label: "13", x: 41, y: 61, kind: "seat" },

      { id: "14", label: "14", x: 47.8, y: 52.3, kind: "seat" },
      { id: "15", label: "15", x: 54.5, y: 52.3, kind: "seat" },
      { id: "16", label: "16", x: 61, y: 52.2, kind: "seat" },
      { id: "17", label: "17", x: 67.6, y: 52.3, kind: "seat" },

      { id: "25", label: "25", x: 55.5, y: 60.8, kind: "seat" },

      { id: "18", label: "18", x: 47.8, y: 69.5, kind: "seat" },
      { id: "19", label: "19", x: 56.7, y: 69.5, kind: "seat" },
      { id: "20", label: "20", x: 65.8, y: 69.5, kind: "seat" },

      { id: "24", label: "24", x: 76, y: 56.7, kind: "seat" },
      { id: "23", label: "23", x: 81.5, y: 59.5, kind: "seat" },
      { id: "22", label: "22", x: 74.4, y: 65.3, kind: "seat" },
      { id: "21", label: "21", x: 82, y: 68.7, kind: "seat" },

      { id: "12A", label: "12A", x: 9.1, y: 67, kind: "seat" },
      { id: "12B", label: "12B", x: 16.5, y: 68.3, kind: "seat" },
      { id: "12C", label: "12C", x: 24, y: 68.2, kind: "seat" },

      {
        id: SWATCH_GREEN_ID,
        label: "",
        x: 90,
        y: 83.5,
        kind: "seat",
        readonly: true,
        fixedStatus: "temp_available",
      },
      {
        id: SWATCH_YELLOW_ID,
        label: "",
        x: 90,
        y: 88,
        kind: "seat",
        readonly: true,
        fixedStatus: "occupied_temp",
      },
      {
        id: SWATCH_RED_ID,
        label: "",
        x: 90,
        y: 92.5,
        kind: "seat",
        readonly: true,
        fixedStatus: "occupied",
      },
      {
        id: SWATCH_PURPLE_ID,
        label: "",
        x: 90,
        y: 96,
        kind: "seat",
        readonly: true,
        fixedStatus: "reserved",
      },
    ],
    []
  );

  const [stored, setStored] = useState<StoredMap>(() => loadStored());
  const [statusBySeat, setStatusBySeat] = useState<Record<string, SeatStatus>>({});
  const [now, setNow] = useState<Date>(new Date());

  const [selectedPinId, setSelectedPinId] = useState<string>("");
  const stageRef = useRef<HTMLDivElement | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSeat, setSelectedSeat] = useState<string>("");
  const [selectedKind, setSelectedKind] = useState<PinKind>("seat");
  const [openTime, setOpenTime] = useState<boolean>(false);
  const [durationInput, setDurationInput] = useState<string>("01:00");
  const [saving, setSaving] = useState<boolean>(false);

  const [, setPackageIdCommon] = useState<string>("");
  const [, setPackageIdConference] = useState<string>("");
  const [, setPackageOptionId] = useState<string>("");

  const calibrate = useMemo(() => {
    try {
      const url = new URL(window.location.href);
      return url.searchParams.get("calibrate") === "1";
    } catch {
      return false;
    }
  }, []);

  const pins: SeatPin[] = useMemo(() => {
    return defaultPins.map((p) => {
      if (p.readonly) return p;
      const s = stored[p.id];
      if (!s) return p;
      return { ...p, x: s.x, y: s.y };
    });
  }, [defaultPins, stored]);

  const seatIdsOnly = useMemo<string[]>(
    () => pins.filter((p) => p.kind === "seat" && !p.readonly).map((p) => p.id),
    [pins]
  );

  const blockedIds = useMemo<string[]>(
    () => [...seatIdsOnly, CONFERENCE_ID],
    [seatIdsOnly]
  );

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(t);
  }, []);

  const loadRequiredIds = async (): Promise<void> => {
    const pkgCommonReq = supabase
      .from("packages")
      .select("id, area")
      .eq("area", "common_area")
      .limit(1);
    const pkgConfReq = supabase
      .from("packages")
      .select("id, area")
      .eq("area", "conference_room")
      .limit(1);
    const optReq = supabase.from("package_options").select("id").limit(1);

    const [
      { data: pkgsCommon, error: pkgCommonErr },
      { data: pkgsConf, error: pkgConfErr },
      { data: opts, error: optErr },
    ] = await Promise.all([pkgCommonReq, pkgConfReq, optReq]);

    if (pkgCommonErr) console.error("packages(common_area) load error:", pkgCommonErr.message);
    if (pkgConfErr) console.error("packages(conference_room) load error:", pkgConfErr.message);
    if (optErr) console.error("package_options load error:", optErr.message);

    const common = (pkgsCommon ?? [])[0] as PackageRow | undefined;
    const conf = (pkgsConf ?? [])[0] as PackageRow | undefined;
    const opt = (opts ?? [])[0] as PackageOptionRow | undefined;

    if (common?.id) setPackageIdCommon(common.id);
    if (conf?.id) setPackageIdConference(conf.id);
    if (opt?.id) setPackageOptionId(opt.id);
  };

  useEffect(() => {
    void loadRequiredIds();
  }, []);

  const getAreaForSelection = (kind: PinKind): "common_area" | "conference_room" =>
    kind === "room" ? "conference_room" : "common_area";

  const buildEndIso = (startIso: string): string => {
    if (openTime) return farFutureIso();
    const dur = normalizeDurationHHMM(durationInput);
    if (!dur) return new Date(new Date(startIso).getTime() + 60_000).toISOString();
    return addDurationToIso(startIso, dur);
  };

  const openManageModalForPin = (pinId: string, kind: PinKind): void => {
    setSelectedSeat(pinId);
    setSelectedKind(kind);
    setOpenTime(false);
    setDurationInput("01:00");
    setIsModalOpen(true);
  };

  const deleteBlockedOverlap = async (
    seatKey: string,
    startIso: string,
    endIso: string,
    note?: string
  ): Promise<string | null> => {
    let q = supabase
      .from("seat_blocked_times")
      .delete()
      .eq("seat_number", seatKey)
      .lt("start_at", endIso)
      .gt("end_at", startIso);

    if (note) q = q.eq("note", note);

    const { error } = await q;
    if (error) return error.message;
    return null;
  };

  const checkConflicts = async (
    pinId: string,
    kind: PinKind,
    startIso: string,
    endIso: string
  ): Promise<string | null> => {
    const seatKey = kind === "room" ? CONFERENCE_ID : pinId;

    const { data: blk, error: blkErr } = await supabase
      .from("seat_blocked_times")
      .select("seat_number, source, note")
      .eq("seat_number", seatKey)
      .lt("start_at", endIso)
      .gt("end_at", startIso);

    if (blkErr) return `Block check error: ${blkErr.message}`;

    const hardBlocks = ((blk ?? []) as SeatBlockedRow[]).filter(
      (r) => !isAutoReservationRow(r.note)
    );
    if (hardBlocks.length > 0) return "Already blocked (occupied/reserved/temp).";

    if (kind === "room") {
      const { data: confRows, error: confErr } = await supabase
        .from("promo_bookings")
        .select("id")
        .eq("area", "conference_room")
        .eq("status", "active")
        .is("seat_number", null)
        .lt("start_at", endIso)
        .gt("end_at", startIso);

      if (confErr) return `Conference promo check error: ${confErr.message}`;
      if ((confRows ?? []).length > 0) return "Conference room already has a promo booking.";
    } else {
      const { data: seatRows, error: seatErr } = await supabase
        .from("promo_bookings")
        .select("id")
        .eq("area", "common_area")
        .eq("status", "active")
        .eq("seat_number", pinId)
        .lt("start_at", endIso)
        .gt("end_at", startIso);

      if (seatErr) return `Seat promo check error: ${seatErr.message}`;
      if ((seatRows ?? []).length > 0) return `Seat already has a promo booking: ${pinId}`;
    }

    return null;
  };

  const loadSeatStatuses = async (): Promise<void> => {
    const nowIso = new Date().toISOString();
    const endIso = farFutureIso();

    const blockedReq = supabase
      .from("seat_blocked_times")
      .select("seat_number, start_at, end_at, source, note")
      .in("seat_number", blockedIds)
      .lt("start_at", endIso)
      .gt("end_at", nowIso);

    const promoSeatsReq = supabase
      .from("promo_bookings")
      .select("id, seat_number, start_at, end_at, status, area, full_name")
      .eq("area", "common_area")
      .eq("status", "active")
      .in("seat_number", seatIdsOnly)
      .lt("start_at", endIso)
      .gt("end_at", nowIso);

    const promoConfReq = supabase
      .from("promo_bookings")
      .select("id, seat_number, start_at, end_at, status, area, full_name")
      .eq("area", "conference_room")
      .eq("status", "active")
      .is("seat_number", null)
      .lt("start_at", endIso)
      .gt("end_at", nowIso);

    const [
      { data: blockedData, error: blockedErr },
      { data: promoSeatsData, error: promoSeatsErr },
      { data: promoConfData, error: promoConfErr },
    ] = await Promise.all([blockedReq, promoSeatsReq, promoConfReq]);

    const next: Record<string, SeatStatus> = {};
    for (const p of pins) next[p.id] = "temp_available";

    const nowMs = new Date(nowIso).getTime();

    const applyPromoRow = (seatId: string, r: PromoBookingRow): void => {
      if (!seatId) return;
      const s = new Date(r.start_at).getTime();
      const e = new Date(r.end_at).getTime();
      if (!Number.isFinite(s) || !Number.isFinite(e)) return;

      if (nowMs >= s && nowMs < e) next[seatId] = "occupied";
      else if (nowMs < s) next[seatId] = "reserved";
    };

    if (!promoSeatsErr) {
      const rows = (promoSeatsData ?? []) as PromoBookingRow[];
      for (const r of rows) {
        const seat = r.seat_number ? normalizeSeatId(r.seat_number) : "";
        applyPromoRow(seat, r);
      }
    }

    if (!promoConfErr) {
      const rows = (promoConfData ?? []) as PromoBookingRow[];
      if (rows.length > 0) applyPromoRow(CONFERENCE_ID, rows[0]);
    }

    if (!blockedErr) {
      const rows = (blockedData ?? []) as SeatBlockedRow[];
      const bySeat: Record<string, SeatStatus> = {};

      for (const r of rows) {
        if (isAutoReservationRow(r.note)) continue;

        const id = normalizeSeatId(r.seat_number);

        if (isTempMirrorRow(r.note)) {
          bySeat[id] = "occupied_temp";
          continue;
        }

        if (r.source === "reserved") {
          if (bySeat[id] !== "occupied") bySeat[id] = "reserved";
          continue;
        }

        if (r.source === "regular") {
          bySeat[id] = "occupied";
          continue;
        }

        if (bySeat[id] !== "occupied") bySeat[id] = "occupied";
      }

      for (const id of blockedIds) {
        if (!next[id] || next[id] === "temp_available") {
          if (bySeat[id]) next[id] = bySeat[id];
        } else {
          if (bySeat[id] === "occupied_temp") next[id] = "occupied_temp";
        }
      }
    }

    setStatusBySeat(next);
  };

  useEffect(() => {
    void loadSeatStatuses();
  }, [blockedIds.join("|"), pins.length]);

  useEffect(() => {
    const t = window.setInterval(() => void loadSeatStatuses(), 15000);
    return () => window.clearInterval(t);
  }, [blockedIds.join("|"), pins.length]);

  const setPinPositionFromClick = (clientX: number, clientY: number): void => {
    if (!calibrate) return;
    if (!selectedPinId) return;

    const pinObj = pins.find((p) => p.id === selectedPinId);
    if (pinObj?.readonly) return;

    const stage = stageRef.current;
    if (!stage) return;

    const rect = stage.getBoundingClientRect();
    const xPx = clientX - rect.left;
    const yPx = clientY - rect.top;

    const xPct = (xPx / rect.width) * 100;
    const yPct = (yPx / rect.height) * 100;

    const x = Math.max(0, Math.min(100, Number(xPct.toFixed(2))));
    const y = Math.max(0, Math.min(100, Number(yPct.toFixed(2))));

    const nextStored: StoredMap = { ...stored, [selectedPinId]: { x, y } };
    setStored(nextStored);
    saveStored(nextStored);
  };

  const onStageClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (!calibrate) return;
    setPinPositionFromClick(e.clientX, e.clientY);
  };

  const clearSaved = (): void => {
    if (!calibrate) return;
    localStorage.removeItem(STORAGE_KEY);
    setStored({});
    setSelectedPinId("");
  };

  const deleteTempPromoOverlap = async (
    seatKey: string,
    kind: PinKind,
    startIso: string,
    endIso: string
  ): Promise<string | null> => {
    const area = getAreaForSelection(kind);

    const base = supabase
      .from("promo_bookings")
      .delete()
      .eq("area", area)
      .eq("status", "active")
      .ilike("full_name", "temp%")
      .lt("start_at", endIso)
      .gt("end_at", startIso);

    const { error } =
      kind === "room"
        ? await base.is("seat_number", null)
        : await base.eq("seat_number", seatKey);

    if (error) return error.message;
    return null;
  };

  const clearToAvailableNow = async (pinId: string, kind: PinKind): Promise<void> => {
    const nowMs = Date.now();
    const nowMinusIso = new Date(nowMs - 120_000).toISOString();
    const nowPlusIso = new Date(nowMs + 120_000).toISOString();

    const seatKey = kind === "room" ? CONFERENCE_ID : pinId;
    const area = getAreaForSelection(kind);

    setSaving(true);

    {
      const { error: delBlkErr } = await supabase
        .from("seat_blocked_times")
        .delete()
        .eq("seat_number", seatKey)
        .lt("start_at", nowPlusIso)
        .gt("end_at", nowMinusIso);

      if (delBlkErr) {
        setSaving(false);
        alert(`Delete blocked error: ${delBlkErr.message}`);
        return;
      }
    }

    {
      const base = supabase
        .from("promo_bookings")
        .delete()
        .eq("area", area)
        .eq("status", "active")
        .lt("start_at", nowPlusIso)
        .gt("end_at", nowMinusIso);

      const { error: delPromoErr } =
        kind === "room"
          ? await base.is("seat_number", null)
          : await base.eq("seat_number", seatKey);

      if (delPromoErr) {
        setSaving(false);
        alert(`Delete promo error: ${delPromoErr.message}`);
        return;
      }
    }

    setSaving(false);
    setIsModalOpen(false);
    setSelectedSeat("");
    await loadSeatStatuses();
  };

  const setBlocked = async (choice: "occupied" | "reserved"): Promise<void> => {
    if (!selectedSeat) return;

    if (!openTime) {
      const dur = normalizeDurationHHMM(durationInput);
      if (!dur) {
        alert("Invalid duration. Examples: 1 / 0:45 / 2:30 / 230 / 100:30");
        return;
      }
    }

    const startIso = new Date().toISOString();
    const endIso = buildEndIso(startIso);

    const confMsg = await checkConflicts(selectedSeat, selectedKind, startIso, endIso);
    if (confMsg) {
      alert(confMsg);
      return;
    }

    const seatKey = selectedKind === "room" ? CONFERENCE_ID : selectedSeat;

    setSaving(true);

    {
      const errMsg = await deleteTempPromoOverlap(
        seatKey,
        selectedKind,
        startIso,
        endIso
      );
      if (errMsg) {
        setSaving(false);
        alert(`Failed removing TEMP promo first: ${errMsg}`);
        return;
      }
    }

    {
      const errMsg = await deleteBlockedOverlap(
        seatKey,
        startIso,
        endIso,
        "temp"
      );
      if (errMsg) {
        setSaving(false);
        alert(`Failed removing TEMP first: ${errMsg}`);
        return;
      }
    }

    {
      const errMsg = await deleteBlockedOverlap(
        seatKey,
        startIso,
        endIso,
        "reservation"
      );
      if (errMsg) {
        setSaving(false);
        alert(`Failed removing reservation auto blocks: ${errMsg}`);
        return;
      }
    }

    const source = choice === "occupied" ? "regular" : "reserved";

    const payload: {
      seat_number: string;
      start_at: string;
      end_at: string;
      source: "regular" | "reserved";
      created_by?: string | null;
      note?: string | null;
    } = {
      seat_number: seatKey,
      start_at: startIso,
      end_at: endIso,
      source,
      note: "staff_set",
    };

    const { data: auth } = await supabase.auth.getUser();
    if (auth?.user?.id) payload.created_by = auth.user.id;

    const { error } = await supabase.from("seat_blocked_times").insert(payload);

    setSaving(false);
    if (error) {
      alert(`Error saving: ${error.message}`);
      return;
    }

    setIsModalOpen(false);
    setSelectedSeat("");
    await loadSeatStatuses();
  };

  const saveTempOccupied = async (): Promise<void> => {
    if (!selectedSeat) return;

    if (!openTime) {
      const dur = normalizeDurationHHMM(durationInput);
      if (!dur) {
        alert("Invalid duration. Examples: 1 / 0:45 / 2:30 / 230 / 100:30");
        return;
      }
    }

    const startIso = new Date().toISOString();
    const endIso = buildEndIso(startIso);

    const confMsg = await checkConflicts(selectedSeat, selectedKind, startIso, endIso);
    if (confMsg) {
      alert(confMsg);
      return;
    }

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      alert("You must be logged in.");
      return;
    }

    setSaving(true);

    const seatKey = selectedKind === "room" ? CONFERENCE_ID : selectedSeat;

    {
      const { error: delBlkErr } = await supabase
        .from("seat_blocked_times")
        .delete()
        .eq("seat_number", seatKey)
        .lt("start_at", endIso)
        .gt("end_at", startIso);

      if (delBlkErr) {
        setSaving(false);
        alert(`Failed removing blocked first: ${delBlkErr.message}`);
        return;
      }
    }

    {
      const tempPayload: {
        seat_number: string;
        start_at: string;
        end_at: string;
        source: "promo";
        note: "temp";
        created_by?: string | null;
      } = {
        seat_number: seatKey,
        start_at: startIso,
        end_at: endIso,
        source: "promo",
        note: "temp",
        created_by: auth.user.id,
      };

      const { error: insErr } = await supabase
        .from("seat_blocked_times")
        .insert(tempPayload);

      if (insErr) {
        setSaving(false);
        alert(`TEMP set failed: ${insErr.message}`);
        return;
      }
    }

    setSaving(false);
    setIsModalOpen(false);
    setSelectedSeat("");
    await loadSeatStatuses();
  };

  const currentStatus: SeatStatus = selectedSeat
    ? statusBySeat[selectedSeat] ?? "temp_available"
    : "temp_available";

  return (
    <div className="staff-dashboard-page">
      <div className="staff-content">
        <div className="seatmap-wrap">
          <div className="seatmap-container">
            <div className="seatmap-card">
              <div className="seatmap-topbar">
                <p className="seatmap-title">Seat Map</p>
                <span className="seatmap-date">{formatPHDate(now)}</span>
              </div>

              <div className="seatmap-stage" ref={stageRef} onClick={onStageClick}>
                <img src={seatsImage} alt="Seat Map" className="seatmap-img" />

                {pins.map((p, index) => {
                  const st: SeatStatus =
                    p.fixedStatus ?? (statusBySeat[p.id] ?? "temp_available");
                  const baseCls = p.kind === "room" ? "seat-pin room" : "seat-pin";
                  const selectedCls =
                    calibrate && selectedPinId === p.id && !p.readonly
                      ? " selected"
                      : "";
                  const readonlyCls = p.readonly ? " seat-pin--readonly" : "";
                  const cls = `${baseCls} ${STATUS_COLOR[st]}${selectedCls}${readonlyCls}`;
                  const isRoom = p.kind === "room";

                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={cls}
                      style={
                        {
                          left: `${p.x}%`,
                          top: `${p.y}%`,
                          "--i": index,
                        } as React.CSSProperties
                      }
                      title={
                        p.readonly
                          ? "Legend"
                          : calibrate
                          ? `Click to select: ${p.label}`
                          : `Manage: ${p.label}`
                      }
                      onClick={(ev) => {
                        ev.stopPropagation();
                        if (p.readonly) return;

                        if (calibrate) {
                          setSelectedPinId(p.id);
                          return;
                        }

                        openManageModalForPin(p.id, isRoom ? "room" : "seat");
                      }}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>

              <div className="seatmap-legend">
                <div className="legend-item">
                  <span className="legend-dot seat-green" /> Temporarily Available
                </div>
                <div className="legend-item">
                  <span className="legend-dot seat-yellow" /> Occupied Temporarily
                  (TEMP)
                </div>
                <div className="legend-item">
                  <span className="legend-dot seat-orange" /> Occupied (CURRENT
                  PROMO / BLOCKED)
                </div>
                <div className="legend-item">
                  <span className="legend-dot seat-purple" /> Reserved (FUTURE
                  PROMO / RESERVED)
                </div>
              </div>

              {calibrate ? (
                <div className="seatmap-hint">
                  Calibrate mode ON: click a pin to select, then click exact number
                  on the image to place it.
                  <br />
                  Selected: <strong>{selectedPinId || "NONE"}</strong>
                  <button type="button" onClick={clearSaved} className="seatmap-reset-btn">
                    Reset Saved Pins
                  </button>
                </div>
              ) : null}

              <img
                src={bearImage}
                alt="Bear"
                className="seatmap-bear-outside"
                draggable={false}
              />
              <img
                src={grassImage}
                alt="Grass"
                className="seatmap-grass-outside"
                draggable={false}
              />
            </div>
          </div>
        </div>
      </div>

      <SeatManageModal
        isOpen={isModalOpen}
        selectedSeat={selectedSeat}
        selectedKind={selectedKind}
        currentStatus={currentStatus}
        openTime={openTime}
        durationInput={durationInput}
        saving={saving}
        onChangeOpenTime={setOpenTime}
        onChangeDuration={setDurationInput}
        onBlurDuration={() => {
          const n = normalizeDurationHHMM(durationInput);
          if (n) setDurationInput(n);
        }}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedSeat("");
        }}
        onClearNow={() => void clearToAvailableNow(selectedSeat, selectedKind)}
        onTemp={() => void saveTempOccupied()}
        onOccupied={() => void setBlocked("occupied")}
        onReserved={() => void setBlocked("reserved")}
      />
    </div>
  );
};

export default Staff_Dashboard;