import React, { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import "../styles/AddOnCodeAlertModal.css";

export type AddOnAlertMode = "add_ons" | "consignment";

export type AddOnCodeAlertItem = {
  id: string;
  full_name: string;
  phone_number: string;
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

const getTitleLabel = (mode: AddOnAlertMode): string => {
  return mode === "add_ons"
    ? "Add-On Order Verified"
    : "Consignment Order Verified";
};

const getBadgeLabel = (mode: AddOnAlertMode): string => {
  return mode === "add_ons" ? "ADD-ON ALERT" : "CONSIGNMENT ALERT";
};

const getIconLabel = (mode: AddOnAlertMode): string => {
  return mode === "add_ons" ? "🛍" : "📦";
};

const getSubLabel = (mode: AddOnAlertMode): string => {
  return mode === "add_ons"
    ? "A new add-on order has been received."
    : "A new consignment order has been received.";
};

const AddOnCodeAlertModal: React.FC<Props> = ({
  isOpen,
  alerts,
  onCloseOne,
  onCloseAll,
}) => {
  const shouldOpen = isOpen && alerts.length > 0;

  const currentAlert = useMemo(() => {
    return alerts[0] ?? null;
  }, [alerts]);

  useEffect(() => {
    if (!shouldOpen || !currentAlert) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        onCloseOne(currentAlert.id);
      }
    };

    window.addEventListener("keydown", handleKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [shouldOpen, currentAlert, onCloseOne]);

  if (!shouldOpen || !currentAlert) return null;

  const a = currentAlert;

  return createPortal(
    <div className="addon-alert-overlay">
      <div className="addon-alert-wrapper">
        <div
          className={`addon-alert-card ${
            a.mode === "consignment"
              ? "addon-alert-card--consignment"
              : "addon-alert-card--addons"
          }`}
        >
          <div className="addon-alert-glow addon-alert-glow--1" />
          <div className="addon-alert-glow addon-alert-glow--2" />

          <div className="addon-alert-top">
            <div className="addon-alert-title-wrap">
              <div className="addon-alert-icon" aria-hidden="true">
                {getIconLabel(a.mode)}
              </div>

              <div className="addon-alert-headings">
                <div className="addon-alert-badge">{getBadgeLabel(a.mode)}</div>
                <div className="addon-alert-title">{getTitleLabel(a.mode)}</div>
                <div className="addon-alert-subtitle">{getSubLabel(a.mode)}</div>
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
            <div className="addon-alert-grid">
              <div className="addon-alert-info-card">
                <div className="addon-alert-label">Full Name</div>
                <div className="addon-alert-value">{a.full_name || "-"}</div>
              </div>

              <div className="addon-alert-info-card">
                <div className="addon-alert-label">Phone Number</div>
                <div className="addon-alert-value">{a.phone_number || "-"}</div>
              </div>

              <div className="addon-alert-info-card">
                <div className="addon-alert-label">Seat Number</div>
                <div className="addon-alert-value">{a.seat_number || "-"}</div>
              </div>

              <div className="addon-alert-info-card">
                <div className="addon-alert-label">Booking Code</div>
                <div className="addon-alert-value addon-alert-code">
                  {a.booking_code || "-"}
                </div>
              </div>
            </div>

            <div className="addon-alert-order-box">
              <div className="addon-alert-label">Order Details</div>
              <div className="addon-alert-order-text">{a.order_text || "-"}</div>
            </div>
          </div>

          <div className="addon-alert-actions">
            {alerts.length > 1 ? (
              <button
                type="button"
                className="addon-alert-close-all"
                onClick={onCloseAll}
              >
                Close All ({alerts.length})
              </button>
            ) : (
              <span />
            )}

            <button
              type="button"
              className="addon-alert-btn"
              onClick={() => onCloseOne(a.id)}
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AddOnCodeAlertModal;