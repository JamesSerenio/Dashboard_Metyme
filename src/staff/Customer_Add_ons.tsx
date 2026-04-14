import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../utils/supabaseClient";
import logo from "../assets/study_hub.png";
import "../styles/Customer_Add_ons.css";

type NumericLike = number | string;

interface AddOnInfo {
  id: string;
  name: string;
  category: string;
  size: string | null;
}

interface CustomerSessionAddOnRow {
  id: string;
  created_at: string;
  add_on_id: string;
  quantity: number;
  price: NumericLike;
  total: NumericLike;
  full_name: string;
  seat_number: string;
  gcash_amount: NumericLike;
  cash_amount: NumericLike;
  is_paid: boolean | number | string | null;
  paid_at: string | null;
  add_ons: AddOnInfo | null;
}

interface CustomerAddOnMerged {
  id: string;
  created_at: string;
  add_on_id: string;
  quantity: number;
  price: number;
  total: number;
  full_name: string;
  seat_number: string;
  item_name: string;
  category: string;
  size: string | null;
  gcash_amount: number;
  cash_amount: number;
  is_paid: boolean;
  paid_at: string | null;
}

type OrderItem = {
  id: string;
  add_on_id: string;
  category: string;
  size: string | null;
  item_name: string;
  quantity: number;
  price: number;
  total: number;
};

type OrderGroup = {
  key: string;
  created_at: string;
  full_name: string;
  seat_number: string;
  items: OrderItem[];
  grand_total: number;
  gcash_amount: number;
  cash_amount: number;
  is_paid: boolean;
  paid_at: string | null;
};

/* ---------------- helpers ---------------- */

const toNumber = (v: NumericLike | null | undefined): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const round2 = (n: number): number => Number((Number.isFinite(n) ? n : 0).toFixed(2));

const toBool = (v: unknown): boolean => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes" || s === "paid";
  }
  return false;
};

const yyyyMmDdLocal = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const norm = (s: string | null | undefined): string => (s ?? "").trim().toLowerCase();

const ms = (iso: string): number => {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
};

const moneyText = (n: number): string => `₱${round2(n).toFixed(2)}`;

const sizeText = (s: string | null | undefined): string => {
  const v = String(s ?? "").trim();
  return v.length > 0 ? v : "—";
};

const manilaDayRange = (yyyyMmDd: string): { startIso: string; endIso: string } => {
  const start = new Date(`${yyyyMmDd}T00:00:00+08:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
};

const GROUP_WINDOW_MS = 10_000;

const samePersonSeat = (a: CustomerAddOnMerged, b: CustomerAddOnMerged): boolean =>
  norm(a.full_name) === norm(b.full_name) && norm(a.seat_number) === norm(b.seat_number);

const formatDateTime = (iso: string): string => {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "-";
  return d.toLocaleString("en-PH");
};

/* ---------------- fixed center modal ---------------- */

type FixedCenterModalProps = {
  open: boolean;
  title?: string;
  size?: "sm" | "md" | "lg";
  onClose: () => void;
  children: React.ReactNode;
};

const FixedCenterModal: React.FC<FixedCenterModalProps> = ({
  open,
  title,
  size = "md",
  onClose,
  children,
}) => {
  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    const prevTouchAction = document.body.style.touchAction;

    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    document.body.classList.add("cao-modal-open");

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouchAction;
      document.body.classList.remove("cao-modal-open");
      window.removeEventListener("keydown", handleKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="cao-fm-overlay" onClick={onClose}>
      <div
        className={`cao-fm-card cao-fm-${size}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title || "Modal"}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};

/* ---------------- component ---------------- */

const Customer_Add_ons: React.FC = () => {
  const [records, setRecords] = useState<CustomerAddOnMerged[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [selectedDate, setSelectedDate] = useState<string>(yyyyMmDdLocal(new Date()));
  const [searchText, setSearchText] = useState<string>("");

  const [selectedOrder, setSelectedOrder] = useState<OrderGroup | null>(null);

  const [paymentTarget, setPaymentTarget] = useState<OrderGroup | null>(null);
  const [gcashInput, setGcashInput] = useState<string>("0");
  const [cashInput, setCashInput] = useState<string>("0");
  const [savingPayment, setSavingPayment] = useState<boolean>(false);

  const [togglingPaidKey, setTogglingPaidKey] = useState<string | null>(null);

  const [cancelTarget, setCancelTarget] = useState<OrderGroup | null>(null);
  const [cancelDesc, setCancelDesc] = useState<string>("");
  const [cancellingKey, setCancellingKey] = useState<string | null>(null);

  useEffect(() => {
    void fetchAddOns(selectedDate);
  }, []);

  useEffect(() => {
    void fetchAddOns(selectedDate);
  }, [selectedDate]);

  const fetchAddOns = async (dateStr: string): Promise<void> => {
    setLoading(true);

    const { startIso, endIso } = manilaDayRange(dateStr);

    const q = supabase
      .from("customer_session_add_ons")
      .select(
        `
        id,
        created_at,
        add_on_id,
        quantity,
        price,
        total,
        full_name,
        seat_number,
        gcash_amount,
        cash_amount,
        is_paid,
        paid_at,
        add_ons (
          id,
          name,
          category,
          size
        )
      `
      )
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .order("created_at", { ascending: true });

    const { data, error } = await q.returns<CustomerSessionAddOnRow[]>();

    if (error) {
      console.error("FETCH ADD-ONS ERROR:", error);
      setRecords([]);
      setLoading(false);
      return;
    }

    const merged: CustomerAddOnMerged[] = (data ?? []).map((r) => {
      const a = r.add_ons;
      return {
        id: r.id,
        created_at: r.created_at,
        add_on_id: r.add_on_id,
        quantity: Number.isFinite(r.quantity) ? r.quantity : 0,
        price: toNumber(r.price),
        total: toNumber(r.total),
        full_name: r.full_name,
        seat_number: r.seat_number,
        item_name: a?.name ?? "-",
        category: a?.category ?? "-",
        size: a?.size ?? null,
        gcash_amount: round2(Math.max(0, toNumber(r.gcash_amount))),
        cash_amount: round2(Math.max(0, toNumber(r.cash_amount))),
        is_paid: toBool(r.is_paid),
        paid_at: r.paid_at ?? null,
      };
    });

    setRecords(merged);
    setLoading(false);
  };

  const groupedOrdersAll = useMemo<OrderGroup[]>(() => {
    if (records.length === 0) return [];

    const groups: OrderGroup[] = [];
    let current: OrderGroup | null = null;
    let lastRow: CustomerAddOnMerged | null = null;

    for (const row of records) {
      const startNew =
        current === null ||
        lastRow === null ||
        !samePersonSeat(row, lastRow) ||
        Math.abs(ms(row.created_at) - ms(lastRow.created_at)) > GROUP_WINDOW_MS;

      if (startNew) {
        const key = `${norm(row.full_name)}|${norm(row.seat_number)}|${ms(row.created_at)}`;

        current = {
          key,
          created_at: row.created_at,
          full_name: row.full_name,
          seat_number: row.seat_number,
          items: [],
          grand_total: 0,
          gcash_amount: 0,
          cash_amount: 0,
          is_paid: false,
          paid_at: null,
        };

        groups.push(current);
      }

      if (!current) continue;

      current.items.push({
        id: row.id,
        add_on_id: row.add_on_id,
        category: row.category,
        size: row.size,
        item_name: row.item_name,
        quantity: Number(row.quantity) || 0,
        price: row.price,
        total: row.total,
      });

      current.grand_total = round2(current.grand_total + row.total);
      current.gcash_amount = round2(current.gcash_amount + row.gcash_amount);
      current.cash_amount = round2(current.cash_amount + row.cash_amount);
      current.is_paid = current.is_paid || row.is_paid;
      current.paid_at = current.paid_at ?? row.paid_at;

      lastRow = row;
    }

    return groups.sort((a, b) => ms(b.created_at) - ms(a.created_at));
  }, [records]);

  const groupedOrders = useMemo<OrderGroup[]>(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return groupedOrdersAll;

    return groupedOrdersAll.filter((o) => {
      const name = String(o.full_name ?? "").toLowerCase();
      const seat = String(o.seat_number ?? "").toLowerCase();
      const items = o.items.some((it) => String(it.item_name ?? "").toLowerCase().includes(q));
      return name.includes(q) || seat.includes(q) || items;
    });
  }, [groupedOrdersAll, searchText]);

  const openPaymentModal = (o: OrderGroup): void => {
    setPaymentTarget(o);
    setGcashInput(String(round2(Math.max(0, o.gcash_amount))));
    setCashInput(String(round2(Math.max(0, o.cash_amount))));
  };

  const savePayment = async (): Promise<void> => {
    if (!paymentTarget) return;

    const g = round2(Math.max(0, toNumber(gcashInput)));
    const c = round2(Math.max(0, toNumber(cashInput)));
    const itemIds = paymentTarget.items.map((x) => x.id);
    if (itemIds.length === 0) return;

    try {
      setSavingPayment(true);

    const { error } = await supabase.rpc("pay_addon_order_by_booking_code", {
      p_booking_code: paymentTarget.full_name ? undefined : undefined,
    });

      if (error) {
        alert(`Save payment error: ${error.message}`);
        return;
      }

      setPaymentTarget(null);
      await fetchAddOns(selectedDate);
    } catch (e) {
      console.error(e);
      alert("Save payment failed.");
    } finally {
      setSavingPayment(false);
    }
  };

  const togglePaid = async (o: OrderGroup): Promise<void> => {
    const itemIds = o.items.map((x) => x.id);
    if (itemIds.length === 0) return;

    try {
      setTogglingPaidKey(o.key);

      const nextPaid = !toBool(o.is_paid);

      const { error } = await supabase.rpc("set_addon_paid_status", {
        p_item_ids: itemIds,
        p_is_paid: nextPaid,
      });

      if (error) {
        alert(`Toggle paid error: ${error.message}`);
        return;
      }

      await fetchAddOns(selectedDate);
    } catch (e) {
      console.error(e);
      alert("Toggle paid failed.");
    } finally {
      setTogglingPaidKey(null);
    }
  };

  const openCancelModal = (o: OrderGroup): void => {
    setCancelTarget(o);
    setCancelDesc("");
  };

    const submitCancel = async (): Promise<void> => {
      if (!cancelTarget) return;

      const desc = cancelDesc.trim();
      if (!desc) {
        alert("Description is required before you can cancel.");
        return;
      }

      const itemIds = cancelTarget.items.map((x) => x.id);
      if (itemIds.length === 0) {
        alert("Nothing to cancel.");
        return;
      }

      try {
        setCancellingKey(cancelTarget.key);

        const { error } = await supabase.rpc("cancel_add_on_order", {
          p_item_ids: itemIds,
          p_description: desc,
        });

        if (error) {
          alert(`Cancel error: ${error.message}`);
          return;
        }

        setCancelTarget(null);
        setSelectedOrder(null);
        await fetchAddOns(selectedDate);
      } catch (e) {
        console.error(e);
        alert("Cancel failed.");
      } finally {
        setCancellingKey(null);
      }
    };

  return (
    <div className="cao-page">
      <div className="cao-shell">
        <section className="cao-topbar">
          <div className="cao-topbar-left">
            <h2 className="cao-title">Customer Add-Ons Records</h2>
            <div className="cao-subtext">
              Showing records for: <strong>{selectedDate}</strong> ({groupedOrders.length})
            </div>
          </div>

          <div className="cao-topbar-right">
            <div className="cao-searchbar-inline">
              <div className="cao-searchbar-inner">
                <span className="cao-search-icon" aria-hidden="true">
                  🔎
                </span>

                <input
                  className="cao-search-input"
                  type="text"
                  placeholder="Search name / seat / item..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.currentTarget.value)}
                />

                {searchText.trim() && (
                  <button className="cao-search-clear" onClick={() => setSearchText("")} type="button">
                    Clear
                  </button>
                )}
              </div>
            </div>

            <label className="cao-pill">
              <span className="cao-pill-label">Date</span>
              <input
                className="cao-pill-input"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(String(e.currentTarget.value ?? ""))}
              />
              <span className="cao-pill-icon" aria-hidden="true">
                📅
              </span>
            </label>

            <div className="cao-tools-row">
              <button
                className="cao-btn cao-btn-primary"
                onClick={() => void fetchAddOns(selectedDate)}
                disabled={loading}
                type="button"
              >
                Refresh
              </button>
            </div>
          </div>
        </section>

        {loading ? (
          <p className="cao-note">Loading...</p>
        ) : groupedOrders.length === 0 ? (
          <p className="cao-note">No add-ons found for this date</p>
        ) : (
          <div
            className="cao-table-wrap"
            key={selectedDate}
            style={{ maxHeight: "560px", overflowY: "auto", overflowX: "auto" }}
          >
            <table className="cao-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Full Name</th>
                  <th>Seat</th>
                  <th>Items</th>
                  <th>Grand Total</th>
                  <th>Payment</th>
                  <th>Paid?</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {groupedOrders.map((o) => {
                  const due = round2(o.grand_total);
                  const totalPaid = round2(o.gcash_amount + o.cash_amount);
                  const diff = round2(totalPaid - due);
                  const paid = toBool(o.is_paid);
                  const busyCancel = cancellingKey === o.key;

                  return (
                    <tr key={o.key}>
                      <td>{formatDateTime(o.created_at)}</td>
                      <td>{o.full_name || "-"}</td>
                      <td>{o.seat_number || "-"}</td>

                      <td>
                        <div className="cao-items-list">
                          {o.items.map((it) => (
                            <div key={it.id} className="cao-item-row">
                              <div className="cao-item-left">
                                <div className="cao-item-title">
                                  {it.item_name}{" "}
                                  <span className="cao-item-cat">
                                    ({it.category}
                                    {String(it.size ?? "").trim() ? ` • ${sizeText(it.size)}` : ""})
                                  </span>
                                </div>
                                <div className="cao-item-sub">
                                  Qty: {it.quantity} • {moneyText(it.price)}
                                </div>
                              </div>
                              <div className="cao-item-total">{moneyText(it.total)}</div>
                            </div>
                          ))}
                        </div>
                      </td>

                      <td>
                        <div className="cao-cell-stack">
                          <span className="cao-cell-strong">{moneyText(due)}</span>
                          <span className="cao-cell-muted">
                            {diff >= 0
                              ? `Change: ${moneyText(Math.abs(diff))}`
                              : `Remaining: ${moneyText(Math.abs(diff))}`}
                          </span>
                        </div>
                      </td>

                      <td>
                        <div className="cao-cell-stack cao-cell-center">
                          <span className="cao-cell-strong">
                            GCash {moneyText(o.gcash_amount)} / Cash {moneyText(o.cash_amount)}
                          </span>
                          <button
                            className="cao-btn cao-btn-ghost"
                            onClick={() => openPaymentModal(o)}
                            disabled={due <= 0}
                            title={due <= 0 ? "No amount due" : "Set Cash & GCash freely (no limit)"}
                            type="button"
                          >
                            Payment
                          </button>
                        </div>
                      </td>

                      <td>
                        <button
                          className={`cao-btn cao-badge ${paid ? "cao-badge-paid" : "cao-badge-unpaid"}`}
                          onClick={() => void togglePaid(o)}
                          disabled={togglingPaidKey === o.key}
                          title={paid ? "Tap to set UNPAID" : "Tap to set PAID"}
                          type="button"
                        >
                          {togglingPaidKey === o.key ? "Updating..." : paid ? "PAID" : "UNPAID"}
                        </button>
                      </td>

                      <td>
                        <div className="cao-action-stack">
                          <button
                            className="cao-btn cao-btn-ghost"
                            onClick={() => setSelectedOrder(o)}
                            type="button"
                          >
                            View Receipt
                          </button>

                          <button
                            className="cao-btn cao-btn-danger"
                            disabled={busyCancel}
                            onClick={() => openCancelModal(o)}
                            type="button"
                          >
                            {busyCancel ? "Cancelling..." : "Cancel"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <FixedCenterModal
          open={!!paymentTarget}
          title="Payment"
          size="sm"
          onClose={() => setPaymentTarget(null)}
        >
          {paymentTarget && (
            <>
              <div className="cao-modal-head">
                <h3 className="cao-modal-title">PAYMENT</h3>
                <p className="cao-modal-subtitle">{paymentTarget.full_name}</p>
              </div>

              <hr className="cao-line" />

              {(() => {
                const due = round2(Math.max(0, paymentTarget.grand_total));
                const g = round2(Math.max(0, toNumber(gcashInput)));
                const c = round2(Math.max(0, toNumber(cashInput)));
                const totalPaid = round2(g + c);
                const diff = round2(totalPaid - due);
                const isPaidAuto = due <= 0 ? true : totalPaid >= due;

                return (
                  <>
                    <div className="cao-payment-grid">
                      <div className="cao-payment-summary">
                        <div className="cao-payment-summary-row">
                          <span>Payment Due</span>
                          <strong>{moneyText(due)}</strong>
                        </div>
                      </div>

                      <div className="cao-payment-row">
                        <label htmlFor="cao-gcash">GCash</label>
                        <input
                          id="cao-gcash"
                          className="cao-money-input cao-money-input-compact"
                          type="number"
                          min="0"
                          step="0.01"
                          value={gcashInput}
                          onChange={(e) => setGcashInput(e.currentTarget.value)}
                        />
                      </div>

                      <div className="cao-payment-row">
                        <label htmlFor="cao-cash">Cash</label>
                        <input
                          id="cao-cash"
                          className="cao-money-input cao-money-input-compact"
                          type="number"
                          min="0"
                          step="0.01"
                          value={cashInput}
                          onChange={(e) => setCashInput(e.currentTarget.value)}
                        />
                      </div>
                    </div>

                    <hr className="cao-line" />

                    <div className="cao-payment-summary">
                      <div className="cao-payment-summary-row">
                        <span>Total Paid</span>
                        <strong>{moneyText(totalPaid)}</strong>
                      </div>

                      <div className="cao-payment-summary-row">
                        <span>{diff >= 0 ? "Change" : "Remaining"}</span>
                        <strong>{moneyText(Math.abs(diff))}</strong>
                      </div>

                      <div className="cao-payment-summary-row">
                        <span>Auto Status</span>
                        <strong className={`cao-status-text ${isPaidAuto ? "is-paid" : "is-unpaid"}`}>
                          {isPaidAuto ? "PAID" : "UNPAID"}
                        </strong>
                      </div>
                    </div>

                    <div className="cao-modal-actions cao-modal-actions-payment">
                      <button
                        className="cao-btn cao-btn-ghost"
                        onClick={() => setPaymentTarget(null)}
                        disabled={savingPayment}
                        type="button"
                      >
                        Cancel
                      </button>
                      <button
                        className="cao-btn cao-btn-primary"
                        onClick={() => void savePayment()}
                        disabled={savingPayment}
                        type="button"
                      >
                        {savingPayment ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </>
                );
              })()}
            </>
          )}
        </FixedCenterModal>

        <FixedCenterModal
          open={!!cancelTarget}
          title="Cancel Order"
          size="md"
          onClose={() => (cancellingKey ? undefined : setCancelTarget(null))}
        >
          {cancelTarget && (
            <>
              <div className="cao-modal-head">
                <h3 className="cao-modal-title">CANCEL ORDER</h3>
                <p className="cao-modal-subtitle">
                  {cancelTarget.full_name} • Seat {cancelTarget.seat_number}
                </p>
              </div>

              <hr className="cao-line" />

              <div className="cao-text-strong">Required: Description / Reason</div>

              <textarea
                className="cao-textarea"
                value={cancelDesc}
                onChange={(e) => setCancelDesc(e.currentTarget.value)}
                placeholder="Example: Customer changed mind / wrong item / duplicate order..."
                disabled={cancellingKey === cancelTarget.key}
              />

              <div className="cao-warning-text">
                ⚠️ Cancel will archive this order to the cancel table and reverse SOLD.
              </div>

              <div className="cao-modal-actions">
                <button
                  className="cao-btn cao-btn-ghost"
                  onClick={() => setCancelTarget(null)}
                  disabled={cancellingKey === cancelTarget.key}
                  type="button"
                >
                  Close
                </button>
                <button
                  className="cao-btn cao-btn-danger"
                  onClick={() => void submitCancel()}
                  disabled={cancellingKey === cancelTarget.key || cancelDesc.trim().length === 0}
                  title={cancelDesc.trim().length === 0 ? "Description required" : "Submit cancel"}
                  type="button"
                >
                  {cancellingKey === cancelTarget.key ? "Cancelling..." : "Submit Cancel"}
                </button>
              </div>
            </>
          )}
        </FixedCenterModal>

        <FixedCenterModal
          open={!!selectedOrder}
          title="Official Receipt"
          size="lg"
          onClose={() => setSelectedOrder(null)}
        >
          {selectedOrder && (
            <>
              <img src={logo} alt="Me Tyme Lounge" className="cao-receipt-logo" />

              <div className="cao-modal-head cao-modal-head-center">
                <h3 className="cao-modal-title">ME TYME LOUNGE</h3>
                <p className="cao-modal-subtitle">OFFICIAL RECEIPT</p>
              </div>

              <hr className="cao-line" />

              <div className="cao-receipt-meta">
                <div className="cao-receipt-meta-row">
                  <span>Date</span>
                  <strong>{formatDateTime(selectedOrder.created_at)}</strong>
                </div>

                <div className="cao-receipt-meta-row">
                  <span>Customer</span>
                  <strong>{selectedOrder.full_name}</strong>
                </div>

                <div className="cao-receipt-meta-row">
                  <span>Seat</span>
                  <strong>{selectedOrder.seat_number}</strong>
                </div>
              </div>

              <hr className="cao-line" />

              <div className="cao-items-receipt">
                {selectedOrder.items.map((it) => (
                  <div key={it.id} className="cao-receipt-item-row">
                    <div className="cao-receipt-item-left">
                      <div className="cao-receipt-item-title">
                        {it.item_name}{" "}
                        <span className="cao-item-cat">
                          ({it.category}
                          {String(it.size ?? "").trim() ? ` • ${sizeText(it.size)}` : ""})
                        </span>
                      </div>
                      <div className="cao-receipt-item-sub">
                        {it.quantity} × {moneyText(it.price)}
                      </div>
                    </div>
                    <div className="cao-receipt-item-total">{moneyText(it.total)}</div>
                  </div>
                ))}
              </div>

              <hr className="cao-line" />

              {(() => {
                const due = round2(Math.max(0, selectedOrder.grand_total));
                const gcash = round2(Math.max(0, selectedOrder.gcash_amount));
                const cash = round2(Math.max(0, selectedOrder.cash_amount));
                const totalPaid = round2(gcash + cash);
                const diff = round2(totalPaid - due);
                const paid = toBool(selectedOrder.is_paid);

                return (
                  <>
                    <div className="cao-receipt-meta">
                      <div className="cao-receipt-meta-row">
                        <span>Total</span>
                        <strong>{moneyText(due)}</strong>
                      </div>

                      <div className="cao-receipt-meta-row">
                        <span>GCash</span>
                        <strong>{moneyText(gcash)}</strong>
                      </div>

                      <div className="cao-receipt-meta-row">
                        <span>Cash</span>
                        <strong>{moneyText(cash)}</strong>
                      </div>

                      <div className="cao-receipt-meta-row">
                        <span>Total Paid</span>
                        <strong>{moneyText(totalPaid)}</strong>
                      </div>

                      <div className="cao-receipt-meta-row">
                        <span>{diff >= 0 ? "Change" : "Remaining Balance"}</span>
                        <strong>{moneyText(Math.abs(diff))}</strong>
                      </div>

                      <div className="cao-receipt-meta-row">
                        <span>Status</span>
                        <strong className={`cao-status-text ${paid ? "is-paid" : "is-unpaid"}`}>
                          {paid ? "PAID" : "UNPAID"}
                        </strong>
                      </div>

                      {paid && (
                        <div className="cao-receipt-meta-row">
                          <span>Paid at</span>
                          <strong>{selectedOrder.paid_at ? formatDateTime(selectedOrder.paid_at) : "-"}</strong>
                        </div>
                      )}
                    </div>

                    <div className="cao-receipt-total">
                      <span>TOTAL</span>
                      <span>{moneyText(due)}</span>
                    </div>
                  </>
                );
              })()}

              <p className="cao-receipt-footer">
                Thank you for choosing <br />
                <strong>Me Tyme Lounge</strong>
              </p>

              <button
                className="cao-btn cao-btn-primary cao-close-btn"
                onClick={() => setSelectedOrder(null)}
                type="button"
              >
                Close
              </button>
            </>
          )}
        </FixedCenterModal>
      </div>
    </div>
  );
};

export default Customer_Add_ons;