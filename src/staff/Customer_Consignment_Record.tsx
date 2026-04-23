import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../utils/supabaseClient";
import "../styles/Customer_Consignment_Record.css";
import logo from "../assets/study_hub.png";

type NumericLike = number | string;

type ConsignmentInfo = {
  item_name: string;
  size: string | null;
  image_url: string | null;
  category: string | null;
};

type CustomerConsignmentRow = {
  id: string;
  created_at: string | null;

  consignment_id: string;
  quantity: number;
  price: NumericLike;
  total: NumericLike | null;

  full_name: string;
  seat_number: string;

  paid_at: string | null;
  gcash_amount: NumericLike;
  cash_amount: NumericLike;
  is_paid: boolean | number | string | null;

  voided: boolean | number | string | null;
  voided_at: string | null;
  void_note: string | null;

  consignment: ConsignmentInfo | null;
};

type ReceiptItem = {
  id: string;
  item_name: string;
  category: string;
  size: string | null;
  quantity: number;
  price: number;
  total: number;
  image_url: string | null;
};

type ReceiptGroup = {
  id: string;
  created_at: string | null;
  full_name: string;
  seat_number: string;
  booking_code: string | null;

  items: ReceiptItem[];
  grand_total: number;

  gcash_amount: number;
  cash_amount: number;

  is_paid: boolean;
  paid_at: string | null;

  is_voided: boolean;
  voided_at: string | null;
  void_note: string | null;
};

type CustomerOrderPayment = {
  booking_code: string;
  full_name?: string | null;
  seat_number?: string | null;
  gcash_amount: number | string;
  cash_amount: number | string;
  is_paid: boolean | number | string | null;
  paid_at: string | null;
};

const toNumber = (v: NumericLike | null | undefined): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const round2 = (n: number): number => Number((Number.isFinite(n) ? n : 0).toFixed(2));
const moneyText = (n: number): string => `₱${round2(n).toFixed(2)}`;

const toBool = (v: unknown): boolean => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes" || s === "paid";
  }
  return false;
};

const norm = (s: string | null | undefined): string => (s ?? "").trim().toLowerCase();

const show = (s: string | null | undefined, fallback = "-"): string => {
  const v = String(s ?? "").trim();
  return v.length ? v : fallback;
};

const formatPHDateTime = (iso: string | null | undefined): string => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "-";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(d);
};

const sizeText = (s: string | null | undefined): string => {
  const v = String(s ?? "").trim();
  return v.length ? v : "—";
};

const todayPHKey = (): string => {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
};

const phDayRange = (dateKey: string): { startISO: string; endISO: string } => {
  const startPH = new Date(`${dateKey}T00:00:00.000+08:00`);
  const endPH = new Date(`${dateKey}T23:59:59.999+08:00`);
  return { startISO: startPH.toISOString(), endISO: endPH.toISOString() };
};

type ModalProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

const CenterModal: React.FC<ModalProps> = ({ open, onClose, children }) => {
  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="ccr-modal-overlay" onClick={onClose}>
      <div className="ccr-modal-card" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body
  );
};

const Customer_Consignment_Record: React.FC = () => {
  const [rows, setRows] = useState<CustomerConsignmentRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [searchText, setSearchText] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(() => todayPHKey());

  const [selectedOrder, setSelectedOrder] = useState<ReceiptGroup | null>(null);

  const [paymentTarget, setPaymentTarget] = useState<ReceiptGroup | null>(null);
  const [gcashInput, setGcashInput] = useState<string>("0");
  const [cashInput, setCashInput] = useState<string>("0");
  const [savingPayment, setSavingPayment] = useState<boolean>(false);

  const [togglingPaidId, setTogglingPaidId] = useState<string | null>(null);

  const [voidTarget, setVoidTarget] = useState<CustomerConsignmentRow | null>(null);
  const [voidReason, setVoidReason] = useState<string>("");
  const [voiding, setVoiding] = useState<boolean>(false);

const [cancelTarget, setCancelTarget] = useState<CustomerConsignmentRow | null>(null);
const [cancelReason, setCancelReason] = useState<string>("");
const [cancelling, setCancelling] = useState<boolean>(false);

const [orderPayments, setOrderPayments] = useState<Record<string, CustomerOrderPayment>>({});
const [consignmentOrderLookup, setConsignmentOrderLookup] = useState<
  Array<{
    booking_code: string;
    created_at: string | null;
    full_name: string | null;
    seat_number: string | null;
  }>
>([]);

  useEffect(() => {
    void fetchByDate(selectedDate);
  }, [selectedDate]);

const fetchByDate = async (dateKey: string): Promise<void> => {
  setLoading(true);

  const { startISO, endISO } = phDayRange(dateKey);

  const { data, error } = await supabase
    .from("customer_session_consignment")
    .select(`
      id,
      created_at,
      consignment_id,
      quantity,
      price,
      total,
      full_name,
      seat_number,
      paid_at,
      gcash_amount,
      cash_amount,
      is_paid,
      voided,
      voided_at,
      void_note,
      consignment:consignment_id (
        item_name,
        size,
        image_url,
        category
      )
    `)
    .gte("created_at", startISO)
    .lte("created_at", endISO)
    .order("created_at", { ascending: false })
    .returns<CustomerConsignmentRow[]>();

  if (error) {
    console.error("FETCH customer_session_consignment ERROR:", error);
    setRows([]);
    setOrderPayments({});
    setConsignmentOrderLookup([]);
    setLoading(false);
    return;
  }

  const nextRows = data ?? [];
  setRows(nextRows);

  const orderRes = await supabase
    .from("consignment_orders")
    .select("booking_code, created_at, full_name, seat_number")
    .gte("created_at", startISO)
    .lte("created_at", endISO)
    .order("created_at", { ascending: true });

  if (orderRes.error) {
    console.error("FETCH consignment_orders ERROR:", orderRes.error);
    setOrderPayments({});
    setConsignmentOrderLookup([]);
    setLoading(false);
    return;
  }

  const orderRows = (orderRes.data ?? []) as Array<{
    booking_code?: string | null;
    created_at?: string | null;
    full_name?: string | null;
    seat_number?: string | null;
  }>;

  setConsignmentOrderLookup(
    orderRows.map((r) => ({
      booking_code: String(r.booking_code ?? "").trim().toUpperCase(),
      created_at: r.created_at ?? null,
      full_name: r.full_name ?? null,
      seat_number: r.seat_number ?? null,
    }))
  );

  const bookingCodes = Array.from(
    new Set(
      orderRows
        .map((r) => String(r.booking_code ?? "").trim().toUpperCase())
        .filter(Boolean)
    )
  );

  if (bookingCodes.length === 0) {
    setOrderPayments({});
    setLoading(false);
    return;
  }

  const paymentRes = await supabase
    .from("customer_order_payments")
    .select("booking_code, full_name, seat_number, gcash_amount, cash_amount, is_paid, paid_at")
    .in("booking_code", bookingCodes);

  if (paymentRes.error) {
    console.error("FETCH customer_order_payments ERROR:", paymentRes.error);
    setOrderPayments({});
    setLoading(false);
    return;
  }

  const paymentMap: Record<string, CustomerOrderPayment> = {};
  for (const row of (paymentRes.data ?? []) as CustomerOrderPayment[]) {
    const code = String(row.booking_code ?? "").trim().toUpperCase();
    if (!code) continue;
    paymentMap[code] = row;
  }

  setOrderPayments(paymentMap);
  setLoading(false);
};
  const filtered = useMemo(() => {
    const q = norm(searchText);
    if (!q) return rows;

    return rows.filter((r) => {
      const fn = norm(r.full_name);
      const seat = norm(r.seat_number);
      const item = norm(r.consignment?.item_name ?? "");
      const cat = norm(r.consignment?.category ?? "");
      return fn.includes(q) || seat.includes(q) || item.includes(q) || cat.includes(q);
    });
  }, [rows, searchText]);

function findBookingCodeForRow(r: CustomerConsignmentRow): string | null {
  const rowTime = new Date(String(r.created_at ?? "")).getTime();

  const candidates = consignmentOrderLookup.filter((x) => {
    return (
      norm(x.full_name) === norm(r.full_name) &&
      norm(x.seat_number) === norm(r.seat_number)
    );
  });

  if (candidates.length === 0) return null;

  let bestCode: string | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (const x of candidates) {
    const t = new Date(String(x.created_at ?? "")).getTime();
    if (!Number.isFinite(t)) continue;

    const diff = Math.abs(t - rowTime);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestCode = String(x.booking_code ?? "").trim().toUpperCase() || null;
    }
  }

  return bestCode;
};

function makeReceiptGroup(r: CustomerConsignmentRow): ReceiptGroup {
  const qty = Number(r.quantity ?? 0) || 0;
  const price = round2(toNumber(r.price));
  const total = round2(toNumber(r.total));

  const itemName = show(r.consignment?.item_name);
  const cat = show(r.consignment?.category);
  const img = r.consignment?.image_url ?? null;

  const bookingCode = findBookingCodeForRow(r);
  const payment = bookingCode ? orderPayments[bookingCode] ?? null : null;

  const rawGcash = round2(Math.max(0, toNumber(r.gcash_amount)));
  const rawCash = round2(Math.max(0, toNumber(r.cash_amount)));
  const rawTotal = round2(rawGcash + rawCash);

  const paymentGcash = payment ? round2(Math.max(0, toNumber(payment.gcash_amount))) : 0;
  const paymentCash = payment ? round2(Math.max(0, toNumber(payment.cash_amount))) : 0;
  const paymentTotal = round2(paymentGcash + paymentCash);

  const cappedSharedTotal = round2(Math.min(paymentTotal, total));
  const cappedRawTotal = round2(Math.min(rawTotal, total));

  let allocatedSharedGcash = 0;
  let allocatedSharedCash = 0;

  if (paymentTotal > 0 && cappedSharedTotal > 0) {
    const gcashRatio = paymentGcash / paymentTotal;
    allocatedSharedGcash = round2(cappedSharedTotal * gcashRatio);
    allocatedSharedCash = round2(cappedSharedTotal - allocatedSharedGcash);
  }

  let allocatedRawGcash = 0;
  let allocatedRawCash = 0;

  if (rawTotal > 0 && cappedRawTotal > 0) {
    const rawGcashRatio = rawGcash / rawTotal;
    allocatedRawGcash = round2(cappedRawTotal * rawGcashRatio);
    allocatedRawCash = round2(cappedRawTotal - allocatedRawGcash);
  }

  const gcash = payment ? allocatedSharedGcash : allocatedRawGcash;
  const cash = payment ? allocatedSharedCash : allocatedRawCash;
  const paidAmount = round2(gcash + cash);

  const paid = payment ? paidAmount >= total : toBool(r.is_paid);
  const isVoided = toBool(r.voided);

  return {
    id: r.id,
    created_at: r.created_at,
    full_name: r.full_name,
    seat_number: r.seat_number,
    booking_code: bookingCode,
    items: [
      {
        id: r.id,
        item_name: itemName,
        category: cat,
        size: r.consignment?.size ?? null,
        quantity: qty,
        price,
        total,
        image_url: img,
      },
    ],
    grand_total: total,
    gcash_amount: gcash,
    cash_amount: cash,
    is_paid: paid,
    paid_at: payment ? payment.paid_at ?? null : r.paid_at ?? null,
    is_voided: isVoided,
    voided_at: r.voided_at ?? null,
    void_note: r.void_note ?? null,
  };
};

const displayRows = useMemo(() => {
  return filtered.map((r) => makeReceiptGroup(r));
}, [filtered, orderPayments, consignmentOrderLookup]);

const totals = useMemo(() => {
  let totalAmount = 0;
  let totalCash = 0;
  let totalGcash = 0;

  for (const r of displayRows) {
    if (r.is_voided) continue;
    totalAmount += round2(r.grand_total);
    totalCash += round2(r.cash_amount);
    totalGcash += round2(r.gcash_amount);
  }

  return {
    totalAmount: round2(totalAmount),
    totalCash: round2(totalCash),
    totalGcash: round2(totalGcash),
  };
}, [displayRows]);

const stats = useMemo(() => {
  let totalOrders = 0;
  let paid = 0;
  let unpaid = 0;

  for (const r of displayRows) {
    if (r.is_voided) continue;

    totalOrders++;

    if (r.is_paid) {
      paid++;
    } else {
      unpaid++;
    }
  }

  return { totalOrders, paid, unpaid };
}, [displayRows]);

  const openReceipt = (r: CustomerConsignmentRow): void => setSelectedOrder(makeReceiptGroup(r));

  const openPaymentModal = (r: CustomerConsignmentRow): void => {
    const g = makeReceiptGroup(r);
    if (g.is_voided) {
      alert("Cannot set payment for VOIDED record.");
      return;
    }
    setPaymentTarget(g);
    setGcashInput(String(round2(Math.max(0, g.gcash_amount))));
    setCashInput(String(round2(Math.max(0, g.cash_amount))));
  };

  const savePayment = async (): Promise<void> => {
    if (!paymentTarget) return;

    const g = round2(Math.max(0, toNumber(gcashInput)));
    const c = round2(Math.max(0, toNumber(cashInput)));

    try {
      setSavingPayment(true);

      const { error } = await supabase.rpc("set_consignment_payment", {
        p_row_id: paymentTarget.id,
        p_gcash: g,
        p_cash: c,
      });

      if (error) {
        alert(`Save payment error: ${error.message}`);
        return;
      }

      setPaymentTarget(null);
      await fetchByDate(selectedDate);
    } catch (e: unknown) {
      console.error(e);
      alert("Save payment failed.");
    } finally {
      setSavingPayment(false);
    }
  };

  const togglePaid = async (r: CustomerConsignmentRow): Promise<void> => {
    if (toBool(r.voided)) {
      alert("Cannot change paid status for VOIDED record.");
      return;
    }

    try {
      setTogglingPaidId(r.id);

      const nextPaid = !toBool(r.is_paid);

      const { error } = await supabase.rpc("set_consignment_paid_status", {
        p_row_id: r.id,
        p_is_paid: nextPaid,
      });

      if (error) {
        alert(`Toggle paid error: ${error.message}`);
        return;
      }

      await fetchByDate(selectedDate);
    } catch (e: unknown) {
      console.error(e);
      alert("Toggle paid failed.");
    } finally {
      setTogglingPaidId(null);
    }
  };

  const openVoid = (r: CustomerConsignmentRow): void => {
    setVoidTarget(r);
    setVoidReason("");
  };

  const submitVoid = async (): Promise<void> => {
    if (!voidTarget) return;

    const reason = voidReason.trim();
    if (!reason) {
      alert("Void reason is required.");
      return;
    }

    if (toBool(voidTarget.voided)) {
      alert("Already voided.");
      return;
    }

    try {
      setVoiding(true);

      const { error } = await supabase.rpc("void_customer_consignment", {
        p_row_id: voidTarget.id,
        p_reason: reason,
      });

      if (error) {
        alert(`Void failed: ${error.message}`);
        return;
      }

      setVoidTarget(null);
      setVoidReason("");
      setSelectedOrder(null);
      setPaymentTarget(null);
      await fetchByDate(selectedDate);
    } catch (e: unknown) {
      console.error(e);
      alert("Void failed.");
    } finally {
      setVoiding(false);
    }
  };

  const openCancel = (r: CustomerConsignmentRow): void => {
    setCancelTarget(r);
    setCancelReason("");
  };

  const submitCancel = async (): Promise<void> => {
    if (!cancelTarget) return;

    const reason = cancelReason.trim();
    if (!reason) {
      alert("Cancel reason is required.");
      return;
    }

    try {
      setCancelling(true);

      const { error } = await supabase.rpc("cancel_customer_consignment", {
        p_row_id: cancelTarget.id,
        p_reason: reason,
      });

      if (error) {
        alert(`Cancel failed: ${error.message}`);
        return;
      }

      setCancelTarget(null);
      setCancelReason("");
      setSelectedOrder(null);
      setPaymentTarget(null);
      setVoidTarget(null);

      await fetchByDate(selectedDate);
    } catch (e: unknown) {
      console.error(e);
      alert("Cancel failed.");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="ccr-page">
      <div className="ccr-shell">
        <section className="ccr-topbar">
          <div className="ccr-topbar-left">
            <h2 className="ccr-title">Customer Consignment Records</h2>
            <div className="ccr-subtext">
              Showing records for: <strong>{selectedDate}</strong>
            </div>
            <div className="ccr-subtext">
              Rows: <strong>{filtered.length}</strong> • Total: <strong>{moneyText(totals.totalAmount)}</strong> • Cash:{" "}
              <strong>{moneyText(totals.totalCash)}</strong> • GCash: <strong>{moneyText(totals.totalGcash)}</strong>
            </div>
          </div>

          <div className="ccr-topbar-right">
            <div className="ccr-searchbar">
              <span className="ccr-search-icon">🔎</span>
              <input
                className="ccr-search-input"
                type="text"
                placeholder="Search fullname / seat / item / category..."
                value={searchText}
                onChange={(e) => setSearchText(e.currentTarget.value)}
              />
              {searchText.trim() && (
                <button className="ccr-search-clear" onClick={() => setSearchText("")} type="button">
                  Clear
                </button>
              )}
            </div>

            <div className="ccr-tools-row">
              <div className="ccr-date-pill">
                <span className="ccr-date-label">Date</span>
                <input
                  className="ccr-date-input"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.currentTarget.value)}
                />
              </div>

              <button className="ccr-btn" onClick={() => void fetchByDate(selectedDate)} disabled={loading} type="button">
                Refresh
              </button>
            </div>
          </div>
        </section>

              <div className="ccr-stats">
            <div className="ccr-stat-box">
              <span>Total Orders</span>
              <strong>{stats.totalOrders}</strong>
            </div>

            <div className="ccr-stat-box">
              <span>Paid</span>
              <strong>{stats.paid}</strong>
            </div>

            <div className="ccr-stat-box">
              <span>Unpaid</span>
              <strong>{stats.unpaid}</strong>
            </div>
          </div>

        {loading ? (
          <div className="ccr-state-card">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="ccr-state-card">No data found for this date</div>
        ) : (
          <section className="ccr-card">
            <div className="ccr-table-wrap">
              <table className="ccr-table">
                <thead>
                  <tr>
                    <th>Image</th>
                    <th>Item</th>
                    <th>Category</th>
                    <th>Date/Time (PH)</th>
                    <th>Full Name</th>
                    <th>Seat</th>
                    <th>Size</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th>Total</th>
                    <th>Payment</th>
                    <th>Paid?</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
          {filtered.map((r) => {
            const view = makeReceiptGroup(r);

            const qty = Number(r.quantity ?? 0) || 0;
            const price = round2(toNumber(r.price));
            const total = round2(toNumber(r.total));

            const cash = round2(view.cash_amount);
            const gcash = round2(view.gcash_amount);

            const itemName = show(r.consignment?.item_name);
            const cat = show(r.consignment?.category);
            const img = r.consignment?.image_url ?? null;

            const isVoided = view.is_voided;
            const isPaid = view.is_paid;
            const busyPaid = togglingPaidId === r.id;

                    return (
                      <tr key={r.id} className={isVoided ? "is-voided" : ""}>
                        <td className="ccr-image-cell">
                          {img ? (
                            <img src={img} alt={itemName} className="ccr-thumb" loading="lazy" />
                          ) : (
                            <div className="ccr-no-image">No Image</div>
                          )}
                        </td>

                        <td className="is-strong">{itemName}</td>
                        <td className="is-strong">{cat}</td>
                        <td>{formatPHDateTime(r.created_at)}</td>
                        <td className="is-strong">{show(r.full_name)}</td>
                        <td className="is-strong">{show(r.seat_number)}</td>
                        <td>{sizeText(r.consignment?.size)}</td>

                        <td className="is-strong">{qty}</td>
                        <td className="is-money">{moneyText(price)}</td>
                        <td className="is-money is-strong">{moneyText(total)}</td>

                        <td>
                          <div className="ccr-cell-stack ccr-center">
                            <span className="ccr-cell-strong">
                              GCash {moneyText(gcash)} / Cash {moneyText(cash)}
                            </span>

                            <button
                              className="ccr-btn"
                              onClick={() => openPaymentModal(r)}
                              disabled={isVoided || total <= 0}
                              title={isVoided ? "Voided" : "Set Cash & GCash freely (no limit)"}
                              type="button"
                            >
                              Payment
                            </button>
                          </div>
                        </td>

                        <td>
                          <button
                            className={`ccr-btn ccr-pay-badge ${isPaid ? "ccr-pay-badge--paid" : "ccr-pay-badge--unpaid"}`}
                            onClick={() => void togglePaid(r)}
                            disabled={busyPaid || isVoided}
                            title={isVoided ? "Voided" : isPaid ? "Tap to set UNPAID" : "Tap to set PAID"}
                            type="button"
                          >
                            {busyPaid ? "Updating..." : isPaid ? "PAID" : "UNPAID"}
                          </button>
                        </td>

                        <td>
                          <div className="ccr-action-stack">
                            <button className="ccr-btn" onClick={() => openReceipt(r)} type="button">
                              View Receipt
                            </button>

                            <button
                              className="ccr-btn"
                              onClick={() => openVoid(r)}
                              disabled={isVoided}
                              title={isVoided ? "Already voided" : "Void (returns stock)"}
                              type="button"
                            >
                              Void
                            </button>

                            <button
                              className="ccr-btn"
                              onClick={() => openCancel(r)}
                              title="Cancel (archive + delete from database)"
                              disabled={cancelling}
                              type="button"
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      <CenterModal open={!!cancelTarget} onClose={() => (cancelling ? null : setCancelTarget(null))}>
        {cancelTarget && (
          <>
            <h3 className="ccr-modal-title">CANCEL RECORD</h3>
            <p className="ccr-modal-subtitle">
              {show(cancelTarget.consignment?.item_name)} • Qty: <b>{cancelTarget.quantity}</b> • Seat:{" "}
              <b>{show(cancelTarget.seat_number)}</b>
            </p>

            <hr className="ccr-sep" />

            <div className="ccr-field">
              <div className="ccr-field-title">
                Reason <span className="ccr-required">*</span>
              </div>
              <textarea
                className="ccr-textarea"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.currentTarget.value)}
                placeholder="Example: cancelled order / mistaken entry / customer changed mind..."
                disabled={cancelling}
              />
            </div>

            <div className="ccr-mini-note">
              • This will be saved to <b>consignment_cancelled</b> then removed from <b>customer_session_consignment</b>.
              <br />
              • If this record is <b>NOT VOIDED</b>, stock will be returned by reducing <b>consignment.sold</b>.
            </div>

            <div className="ccr-modal-actions">
              <button className="ccr-btn" onClick={() => setCancelTarget(null)} disabled={cancelling} type="button">
                Close
              </button>
              <button className="ccr-btn" onClick={() => void submitCancel()} disabled={cancelling} type="button">
                {cancelling ? "Cancelling..." : "Confirm Cancel"}
              </button>
            </div>
          </>
        )}
      </CenterModal>

      <CenterModal open={!!paymentTarget} onClose={() => (savingPayment ? null : setPaymentTarget(null))}>
        {paymentTarget && (
          <>
            <h3 className="ccr-modal-title">PAYMENT</h3>
            <p className="ccr-modal-subtitle">
              {paymentTarget.full_name} • Seat {paymentTarget.seat_number}
            </p>

            <hr className="ccr-sep" />

            {(() => {
              const due = round2(Math.max(0, paymentTarget.grand_total));
              const g = round2(Math.max(0, toNumber(gcashInput)));
              const c = round2(Math.max(0, toNumber(cashInput)));
              const totalPaid = round2(g + c);
              const diff = round2(totalPaid - due);
              const isPaidAuto = due <= 0 ? true : totalPaid >= due;

              return (
                <>
                  <div className="ccr-receipt-row">
                    <span>Payment Due</span>
                    <span>{moneyText(due)}</span>
                  </div>

                  <div className="ccr-receipt-row ccr-input-row">
                    <span>GCash</span>
                    <input
                      className="ccr-money-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={gcashInput}
                      onChange={(e) => setGcashInput(e.currentTarget.value)}
                      disabled={savingPayment}
                    />
                  </div>

                  <div className="ccr-receipt-row ccr-input-row">
                    <span>Cash</span>
                    <input
                      className="ccr-money-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={cashInput}
                      onChange={(e) => setCashInput(e.currentTarget.value)}
                      disabled={savingPayment}
                    />
                  </div>

                  <hr className="ccr-sep" />

                  <div className="ccr-receipt-row">
                    <span>Total Paid</span>
                    <span>{moneyText(totalPaid)}</span>
                  </div>

                  <div className="ccr-receipt-row">
                    <span>{diff >= 0 ? "Change" : "Remaining"}</span>
                    <span>{moneyText(Math.abs(diff))}</span>
                  </div>

                  <div className="ccr-receipt-row">
                    <span>Auto Status</span>
                    <span className="ccr-receipt-status">{isPaidAuto ? "PAID" : "UNPAID"}</span>
                  </div>

                  <div className="ccr-modal-actions">
                    <button className="ccr-btn" onClick={() => setPaymentTarget(null)} disabled={savingPayment} type="button">
                      Cancel
                    </button>
                    <button className="ccr-btn" onClick={() => void savePayment()} disabled={savingPayment} type="button">
                      {savingPayment ? "Saving..." : "Save"}
                    </button>
                  </div>
                </>
              );
            })()}
          </>
        )}
      </CenterModal>

      <CenterModal open={!!selectedOrder} onClose={() => setSelectedOrder(null)}>
        {selectedOrder && (
          <>
            <img src={logo} alt="Me Tyme Lounge" className="ccr-receipt-logo" />

            <h3 className="ccr-receipt-title">ME TYME LOUNGE</h3>
            <p className="ccr-receipt-subtitle">OFFICIAL RECEIPT</p>

            <hr className="ccr-sep" />

            <div className="ccr-receipt-row">
              <span>Date</span>
              <span>{formatPHDateTime(selectedOrder.created_at)}</span>
            </div>

            <div className="ccr-receipt-row">
              <span>Customer</span>
              <span>{selectedOrder.full_name}</span>
            </div>

            <div className="ccr-receipt-row">
              <span>Seat</span>
              <span>{selectedOrder.seat_number}</span>
            </div>

            <hr className="ccr-sep" />

            <div className="ccr-items-receipt">
              {selectedOrder.items.map((it) => (
                <div className="ccr-receipt-item-row" key={it.id}>
                  <div className="ccr-receipt-item-left">
                    <div className="ccr-receipt-item-title">
                      {it.item_name}{" "}
                      <span className="ccr-item-cat">
                        ({it.category}
                        {String(it.size ?? "").trim() ? ` • ${sizeText(it.size)}` : ""})
                      </span>
                    </div>
                    <div className="ccr-receipt-item-sub">
                      {it.quantity} × {moneyText(it.price)}
                    </div>
                  </div>
                  <div className="ccr-receipt-item-total">{moneyText(it.total)}</div>
                </div>
              ))}
            </div>

            <hr className="ccr-sep" />

            {(() => {
              const due = round2(Math.max(0, selectedOrder.grand_total));
              const gcash = round2(Math.max(0, selectedOrder.gcash_amount));
              const cash = round2(Math.max(0, selectedOrder.cash_amount));
              const totalPaid = round2(gcash + cash);
              const diff = round2(totalPaid - due);

              const paid = toBool(selectedOrder.is_paid);
              const isVoided = selectedOrder.is_voided;

              return (
                <>
                  <div className="ccr-receipt-row">
                    <span>Total</span>
                    <span>{moneyText(due)}</span>
                  </div>

                  <hr className="ccr-sep" />

                  <div className="ccr-receipt-row">
                    <span>GCash</span>
                    <span>{moneyText(gcash)}</span>
                  </div>

                  <div className="ccr-receipt-row">
                    <span>Cash</span>
                    <span>{moneyText(cash)}</span>
                  </div>

                  <div className="ccr-receipt-row">
                    <span>Total Paid</span>
                    <span>{moneyText(totalPaid)}</span>
                  </div>

                  <div className="ccr-receipt-row">
                    <span>{diff >= 0 ? "Change" : "Remaining"}</span>
                    <span>{moneyText(Math.abs(diff))}</span>
                  </div>

                  <div className="ccr-receipt-row">
                    <span>Status</span>
                    <span className="ccr-receipt-status">{isVoided ? "VOIDED" : paid ? "PAID" : "UNPAID"}</span>
                  </div>

                  {paid && !isVoided && (
                    <div className="ccr-receipt-row">
                      <span>Paid at</span>
                      <span>{selectedOrder.paid_at ? formatPHDateTime(selectedOrder.paid_at) : "-"}</span>
                    </div>
                  )}

                  {isVoided && (
                    <>
                      <div className="ccr-receipt-row">
                        <span>Voided at</span>
                        <span>{selectedOrder.voided_at ? formatPHDateTime(selectedOrder.voided_at) : "-"}</span>
                      </div>
                      <div className="ccr-receipt-row">
                        <span>Void note</span>
                        <span className="ccr-right-note">{show(selectedOrder.void_note, "-")}</span>
                      </div>
                    </>
                  )}

                  <div className="ccr-receipt-total">
                    <span>TOTAL</span>
                    <span>{moneyText(due)}</span>
                  </div>
                </>
              );
            })()}

            <p className="ccr-receipt-footer">
              Thank you for choosing <br />
              <strong>Me Tyme Lounge</strong>
            </p>

            <button className="ccr-close-btn" onClick={() => setSelectedOrder(null)} type="button">
              Close
            </button>
          </>
        )}
      </CenterModal>

      <CenterModal open={!!voidTarget} onClose={() => (voiding ? null : setVoidTarget(null))}>
        {voidTarget && (
          <>
            <h3 className="ccr-modal-title">VOID CONSIGNMENT</h3>
            <p className="ccr-modal-subtitle">
              {show(voidTarget.consignment?.item_name)} • Qty: <b>{voidTarget.quantity}</b> • Seat:{" "}
              <b>{show(voidTarget.seat_number)}</b>
            </p>

            <hr className="ccr-sep" />

            <div className="ccr-field">
              <div className="ccr-field-title">
                Reason <span className="ccr-required">*</span>
              </div>
              <textarea
                className="ccr-textarea"
                value={voidReason}
                onChange={(e) => setVoidReason(e.currentTarget.value)}
                placeholder="Example: wrong item / mistaken quantity / cancelled..."
                disabled={voiding}
              />
            </div>

            <div className="ccr-mini-note">
              Note: Voiding will <b>return stock</b> by reducing <b>consignment.sold</b>.
            </div>

            <div className="ccr-modal-actions">
              <button className="ccr-btn" onClick={() => setVoidTarget(null)} disabled={voiding} type="button">
                Close
              </button>
              <button className="ccr-btn" onClick={() => void submitVoid()} disabled={voiding} type="button">
                {voiding ? "Voiding..." : "Confirm Void"}
              </button>
            </div>
          </>
        )}
      </CenterModal>
    </div>
  );
};

export default Customer_Consignment_Record;