import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import "../styles/AddOnCodeAlertModal.css";

export type AddOnAlertMode = "add_ons" | "consignment";

export type AddOnCodeAlertItem = {
  id: string;
  full_name: string;
  seat_number: string;
  booking_code: string;
  order_text: string;
  mode: AddOnAlertMode;
};

interface Props {
  isOpen: boolean;
  alerts: AddOnCodeAlertItem[];
  onCloseOne: (id: string) => void;
  onCloseAll: () => void;
}

const getModeLabel = (mode: AddOnAlertMode): string => {
  return mode === "add_ons" ? "Add-On Order" : "Consignment Order";
};

const getTitleLabel = (mode: AddOnAlertMode): string => {
  return mode === "add_ons" ? "Order Verified" : "Consignment Verified";
};

const getIconLabel = (mode: AddOnAlertMode): string => {
  return mode === "add_ons" ? "🛍" : "📦";
};

const AddOnCodeAlertModal: React.FC<Props> = ({
  isOpen,
  alerts,
  onCloseOne,
  onCloseAll,
}) => {
  const shouldOpen = isOpen && alerts.length > 0;

  useEffect(() => {
    if (!shouldOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        if (alerts.length > 1) onCloseAll();
        else if (alerts.length === 1) onCloseOne(alerts[0].id);
      }
    };

    window.addEventListener("keydown", handleKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [shouldOpen, alerts, onCloseAll, onCloseOne]);

  if (!shouldOpen) return null;

  return createPortal(
    <div className="addon-alert-overlay">
      <div className="addon-alert-wrapper">
        <div className="addon-alert-stack">
          {alerts.map((a) => (
            <div
              key={a.id}
              className={`addon-alert-card ${
                a.mode === "consignment"
                  ? "addon-alert-card--consignment"
                  : "addon-alert-card--addons"
              }`}
            >
              <div className="addon-alert-top">
                <div className="addon-alert-title-wrap">
                  <div className="addon-alert-icon" aria-hidden="true">
                    {getIconLabel(a.mode)}
                  </div>
                  <div>
                    <div className="addon-alert-badge">
                      {a.mode === "add_ons" ? "ORDER ALERT" : "CONSIGNMENT ALERT"}
                    </div>
                    <div className="addon-alert-title">{getTitleLabel(a.mode)}</div>
                  </div>
                </div>

                <button
                  type="button"
                  className="addon-alert-close"
                  onClick={() => onCloseOne(a.id)}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              <div className="addon-alert-body">
                <div className="addon-alert-row">
                  <strong>Name:</strong> {a.full_name || "-"}
                </div>
                <div className="addon-alert-row">
                  <strong>Seat:</strong> {a.seat_number || "-"}
                </div>
                <div className="addon-alert-row">
                  <strong>Type:</strong> {getModeLabel(a.mode)}
                </div>
                <div className="addon-alert-row">
                  <strong>Order:</strong> {a.order_text || "-"}
                </div>
              </div>

              <button
                type="button"
                className="addon-alert-btn"
                onClick={() => onCloseOne(a.id)}
              >
                OK
              </button>
            </div>
          ))}

          {alerts.length > 1 ? (
            <button
              type="button"
              className="addon-alert-close-all"
              onClick={onCloseAll}
            >
              Close All
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AddOnCodeAlertModal;