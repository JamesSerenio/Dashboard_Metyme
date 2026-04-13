import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "../styles/TimeAlertModal.css";

type AlertKind = "walkin" | "reservation" | "promo";

type AlertItem = {
  key: string;
  kind: AlertKind;
  full_name: string;
  seat_number: string;
  minutes_left: number;
};

type OrderAlertItem = {
  key: string;
  kind: "add_ons" | "consignment";
  full_name: string;
  seat_number: string;
  lines: {
    name: string;
    quantity: number;
    size: string;
    image_url?: string | null;
  }[];
};

interface Props {
  isOpen: boolean;
  alerts: AlertItem[];
  orderAlerts: OrderAlertItem[];
  onStopOne: (key: string) => void;
  onClose: () => void;
}

const TimeAlertModal: React.FC<Props> = ({
  isOpen,
  alerts,
  orderAlerts,
  onStopOne,
  onClose,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const total = alerts.length + orderAlerts.length;

  useEffect(() => {
    if (!isOpen || total === 0) return;

    document.body.style.overflow = "hidden";

    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.loop = true;
      audioRef.current.play().catch(() => {});
    }

    return () => {
      document.body.style.overflow = "";
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };
  }, [isOpen, total]);

  if (!isOpen || total === 0) return null;

  return createPortal(
    <div className="ta-overlay">
      <div className="ta-container">

        <audio ref={audioRef} src="/assets/alarm.mp3" />

        <div className="ta-box">

          {/* HEADER */}
          <div className="ta-header">
            <div className="ta-title">🚨 {total} ALERT(S)</div>
            <button className="ta-close" onClick={onClose}>✕</button>
          </div>

          {/* LIST */}
          <div className="ta-list">

            {/* ORDER ALERT */}
            {orderAlerts.map(o => (
              <div key={o.key} className="ta-card ta-card-order">

                <div className="ta-card-title">
                  🛍 ORDER ALERT
                </div>

                <div className="ta-meta">
                  <b>{o.full_name}</b> • Seat {o.seat_number}
                </div>

                <div className="ta-lines">
                  {o.lines.map((l, i) => (
                    <div key={i} className="ta-line">
                      {l.image_url ? (
                        <img src={l.image_url} className="ta-img" />
                      ) : (
                        <div className="ta-noimg">NO IMG</div>
                      )}

                      <div>
                        <div className="ta-name">{l.name}</div>
                        <div className="ta-sub">
                          x{l.quantity} • {l.size || "-"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  className="ta-btn ta-btn-green"
                  onClick={() => onStopOne(o.key)}
                >
                  STOP ORDER
                </button>
              </div>
            ))}

            {/* TIME ALERT */}
            {alerts.map(a => (
              <div key={a.key} className="ta-card ta-card-time">

                <div className="ta-card-title">
                  ⏰ {a.minutes_left} MIN LEFT
                </div>

                <div className="ta-meta">
                  {a.full_name} • Seat {a.seat_number}
                </div>

                <button
                  className="ta-btn ta-btn-red"
                  onClick={() => onStopOne(a.key)}
                >
                  STOP ALERT
                </button>
              </div>
            ))}

          </div>

          {/* FOOTER */}
          <button className="ta-close-all" onClick={onClose}>
            Close
          </button>

        </div>
      </div>
    </div>,
    document.body
  );
};

export default TimeAlertModal;