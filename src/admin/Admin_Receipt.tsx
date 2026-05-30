import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../utils/supabaseClient";
import logo from "../assets/study_hub.png";
import "../styles/Admin_Receipt.css";

type ReceiptType = "customer_list" | "add_ons" | "membership";

type ReceiptRecord = {
  id: string;
  type: ReceiptType;
  created_at: string;
  full_name: string;
  booking_code: string;
  seat_number: string;
  grand_total: number;
  gcash_amount: number;
  cash_amount: number;
  is_paid: boolean;
  paid_at: string | null;
  items: ReceiptItem[];
};

type ReceiptItem = {
  id: string;
  name: string;
  category?: string;
  quantity: number;
  price: number;
  subtotal: number;
};

const toNumber = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const toBool = (v: unknown): boolean => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.toLowerCase().trim();
    return s === "true" || s === "1" || s === "yes" || s === "paid";
  }
  return false;
};

const money = (n: number): string => `₱${toNumber(n).toFixed(2)}`;

const formatDateTime = (iso: string | null | undefined): string => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "-";
  return d.toLocaleString("en-PH");
};

const todayLocal = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const sameLocalDate = (iso: string | null | undefined, date: string): boolean => {
  if (!iso) return false;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return false;

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${y}-${m}-${day}` === date;
};

const Admin_Receipt: React.FC = () => {
  const [type, setType] = useState<ReceiptType>("customer_list");
  const [selectedDate, setSelectedDate] = useState<string>(todayLocal());
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<ReceiptRecord[]>([]);
  const [selected, setSelected] = useState<ReceiptRecord | null>(null);

  const title =
    type === "customer_list"
      ? "Customer List Receipts"
      : type === "add_ons"
      ? "Add-Ons Receipts"
      : "Membership Receipts";

  const filteredRecords = useMemo(() => {
    return records.filter((r) => sameLocalDate(r.created_at, selectedDate));
  }, [records, selectedDate]);

  const totalGrand = useMemo(() => {
    return filteredRecords.reduce((sum, r) => sum + r.grand_total, 0);
  }, [filteredRecords]);

  useEffect(() => {
    setSelected(null);
    void loadRecords();
  }, [type]);

  useEffect(() => {
    setSelected(null);
  }, [selectedDate]);

  const loadRecords = async () => {
    setLoading(true);

    try {
      if (type === "customer_list") {
        await loadCustomerListReceipts();
      }

      if (type === "add_ons") {
        await loadAddOnsReceipts();
      }

      if (type === "membership") {
        await loadMembershipReceipts();
      }
    } finally {
      setLoading(false);
    }
  };

  const loadCustomerListReceipts = async () => {
    const { data, error } = await supabase
      .from("customer_sessions")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      alert(`Error loading customer list receipts: ${error.message}`);
      setRecords([]);
      return;
    }

    const mapped: ReceiptRecord[] = (data ?? []).map((r: any) => {
      const timeTotal = toNumber(r.total_amount);
      const grandTotal = timeTotal;

      return {
        id: String(r.id),
        type: "customer_list",
        created_at: String(r.created_at ?? r.date ?? ""),
        full_name: String(r.full_name ?? "-"),
        booking_code: String(r.booking_code ?? "-"),
        seat_number: String(r.seat_number ?? "-"),
        grand_total: grandTotal,
        gcash_amount: toNumber(r.gcash_amount),
        cash_amount: toNumber(r.cash_amount),
        is_paid: toBool(r.is_paid),
        paid_at: r.paid_at ?? null,
        items: [
          {
            id: String(r.id),
            name: "Time Total",
            category: String(r.customer_type ?? "Customer"),
            quantity: 1,
            price: timeTotal,
            subtotal: timeTotal,
          },
        ],
      };
    });

    setRecords(mapped);
  };

  const loadAddOnsReceipts = async () => {
    const { data, error } = await supabase
      .from("customer_session_add_ons")
      .select(`
        id,
        created_at,
        full_name,
        seat_number,
        quantity,
        price,
        subtotal,
        gcash_amount,
        cash_amount,
        is_paid,
        paid_at,
        add_ons (
          name,
          category
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      alert(`Error loading add-ons receipts: ${error.message}`);
      setRecords([]);
      return;
    }

    const grouped = new Map<string, ReceiptRecord>();

    (data ?? []).forEach((r: any) => {
      const created = String(r.created_at ?? "");
      const name = String(r.full_name ?? "-");
      const seat = String(r.seat_number ?? "-");
      const key = `${name}|${seat}|${created.slice(0, 16)}`;

      const qty = Math.max(0, Math.floor(toNumber(r.quantity)));
      const price = toNumber(r.price);
      const subtotal = toNumber(r.subtotal || qty * price);

      if (!grouped.has(key)) {
        grouped.set(key, {
          id: key,
          type: "add_ons",
          created_at: created,
          full_name: name,
          booking_code: "-",
          seat_number: seat,
          grand_total: 0,
          gcash_amount: 0,
          cash_amount: 0,
          is_paid: false,
          paid_at: null,
          items: [],
        });
      }

      const g = grouped.get(key)!;

      g.items.push({
        id: String(r.id),
        name: String(r.add_ons?.name ?? "Add-on Item"),
        category: String(r.add_ons?.category ?? "Add-ons"),
        quantity: qty,
        price,
        subtotal,
      });

      g.grand_total += subtotal;
      g.gcash_amount += toNumber(r.gcash_amount);
      g.cash_amount += toNumber(r.cash_amount);
      g.is_paid = g.is_paid || toBool(r.is_paid);
      g.paid_at = g.paid_at ?? r.paid_at ?? null;
    });

    setRecords(Array.from(grouped.values()));
  };

  const loadMembershipReceipts = async () => {
    const { data, error } = await supabase
      .from("promo_bookings")
      .select(`
        id,
        created_at,
        full_name,
        promo_code,
        seat_number,
        area,
        price,
        gcash_amount,
        cash_amount,
        is_paid,
        paid_at,
        packages:package_id (
          title
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      alert(`Error loading membership receipts: ${error.message}`);
      setRecords([]);
      return;
    }

    const mapped: ReceiptRecord[] = (data ?? []).map((r: any) => {
      const price = toNumber(r.price);
      const seat =
        String(r.area ?? "") === "conference_room"
          ? "CONFERENCE ROOM"
          : String(r.seat_number ?? "-");

      return {
        id: String(r.id),
        type: "membership",
        created_at: String(r.created_at ?? ""),
        full_name: String(r.full_name ?? "-"),
        booking_code: String(r.promo_code ?? "-"),
        seat_number: seat,
        grand_total: price,
        gcash_amount: toNumber(r.gcash_amount),
        cash_amount: toNumber(r.cash_amount),
        is_paid: toBool(r.is_paid),
        paid_at: r.paid_at ?? null,
        items: [
          {
            id: String(r.id),
            name: String(r.packages?.title ?? "Membership Package"),
            category: "Membership",
            quantity: 1,
            price,
            subtotal: price,
          },
        ],
      };
    });

    setRecords(mapped);
  };

  return (
    <div className="ar-page">
      <section className="ar-hero">
        <div>
          <p className="ar-eyebrow">ADMIN RECEIPTS</p>
          <h1>{title}</h1>
          <p>
            Plain receipt records with customer names, grand totals, and receipt preview.
          </p>
        </div>

        <div className="ar-filters">
          <label>
            <span>Filter</span>
            <select
              value={type}
              onChange={(e) => setType(e.currentTarget.value as ReceiptType)}
            >
              <option value="customer_list">Customer List</option>
              <option value="add_ons">Add-Ons</option>
              <option value="membership">Membership</option>
            </select>
          </label>

          <label>
            <span>Date</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.currentTarget.value)}
            />
          </label>

          <button type="button" onClick={() => void loadRecords()}>
            Refresh
          </button>
        </div>
      </section>

      <section className="ar-summary">
        <div>
          <span>Total Records</span>
          <strong>{filteredRecords.length}</strong>
        </div>

        <div>
          <span>Grand Total</span>
          <strong>{money(totalGrand)}</strong>
        </div>
      </section>

      <section className="ar-layout">
        <div className="ar-left">
          <div className="ar-panel-head">
            <h2>Names</h2>
            <span>{selectedDate}</span>
          </div>

          {loading ? (
            <div className="ar-empty">Loading receipts...</div>
          ) : filteredRecords.length === 0 ? (
            <div className="ar-empty">No receipts found for this date.</div>
          ) : (
            <div className="ar-name-list">
              {filteredRecords.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`ar-name-card ${selected?.id === r.id ? "active" : ""}`}
                  onClick={() => setSelected(r)}
                >
                  <div>
                    <strong>{r.full_name}</strong>
                    <span>{r.booking_code}</span>
                  </div>

                  <b>{money(r.grand_total)}</b>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="ar-right">
          {!selected ? (
            <div className="ar-receipt-empty">
              <h3>Select customer name</h3>
              <p>Tap a name on the left side to preview the receipt here.</p>
            </div>
          ) : (
            <div className="ar-receipt">
              <div className="ar-receipt-top">
                <img src={logo} alt="Me Tyme Lounge" />
                <h2>ME TYME LOUNGE</h2>
                <p>
                  {selected.type === "customer_list"
                    ? "Customer Receipt"
                    : selected.type === "add_ons"
                    ? "Add-Ons Receipt"
                    : "Membership Receipt"}
                </p>
              </div>

              <div className="ar-receipt-block">
                <div>
                  <span>Date</span>
                  <strong>{formatDateTime(selected.created_at)}</strong>
                </div>

                <div>
                  <span>Customer</span>
                  <strong>{selected.full_name}</strong>
                </div>

                <div>
                  <span>Code</span>
                  <strong>{selected.booking_code}</strong>
                </div>

                <div>
                  <span>Seat</span>
                  <strong>{selected.seat_number}</strong>
                </div>
              </div>

              <div className="ar-items">
                {selected.items.map((item) => (
                  <div key={item.id} className="ar-item">
                    <div>
                      <strong>{item.name}</strong>
                      <span>{item.category}</span>
                      <small>
                        Qty: {item.quantity} × {money(item.price)}
                      </small>
                    </div>

                    <b>{money(item.subtotal)}</b>
                  </div>
                ))}
              </div>

              <div className="ar-receipt-block">
                <div>
                  <span>GCash</span>
                  <strong>{money(selected.gcash_amount)}</strong>
                </div>

                <div>
                  <span>Cash</span>
                  <strong>{money(selected.cash_amount)}</strong>
                </div>

                <div>
                  <span>Status</span>
                  <strong className={selected.is_paid ? "ar-paid" : "ar-unpaid"}>
                    {selected.is_paid ? "PAID" : "UNPAID"}
                  </strong>
                </div>

                <div>
                  <span>Paid At</span>
                  <strong>{formatDateTime(selected.paid_at)}</strong>
                </div>
              </div>

              <div className="ar-grand">
                <span>Grand Total</span>
                <strong>{money(selected.grand_total)}</strong>
              </div>

              <p className="ar-footer">
                Thank you for choosing <strong>Me Tyme Lounge</strong>
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default Admin_Receipt;