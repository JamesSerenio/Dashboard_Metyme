import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../utils/supabaseClient";
import "../styles/AddOrderModal.css";

type ProductKind = "addon" | "consignment";

type Product = {
  id: string;
  kind: ProductKind;
  name: string;
  category: string;
  size: string | null;
  price: number;
  stocks: number;
  image_url: string | null;
};

type Props = {
  open: boolean;
  bookingCode: string;
  fullName: string;
  seatNumber: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

const money = (value: number): string => `₱${value.toFixed(2)}`;

const AddOrderModal: React.FC<Props> = ({
  open,
  bookingCode,
  fullName,
  seatNumber,
  onClose,
  onSaved,
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setQuantities({});
    setError("");
    setLoading(true);

    void Promise.all([
      supabase
        .from("add_ons")
        .select("id, name, category, size, price, stocks, image_url")
        .gt("stocks", 0)
        .order("category")
        .order("name"),
      supabase
        .from("consignment")
        .select("id, item_name, size, price, stocks, image_url, approval_status")
        .eq("approval_status", "approved")
        .gt("stocks", 0)
        .order("item_name"),
    ]).then(([addonRes, consignmentRes]) => {
      if (addonRes.error || consignmentRes.error) {
        setError(addonRes.error?.message ?? consignmentRes.error?.message ?? "Unable to load products.");
        setProducts([]);
      } else {
        const addons: Product[] = (addonRes.data ?? []).map((row) => ({
          id: String(row.id),
          kind: "addon",
          name: String(row.name ?? "Add-on"),
          category: String(row.category ?? "Add-on"),
          size: row.size == null ? null : String(row.size),
          price: Number(row.price ?? 0),
          stocks: Number(row.stocks ?? 0),
          image_url: row.image_url == null ? null : String(row.image_url),
        }));
        const consignments: Product[] = (consignmentRes.data ?? []).map((row) => ({
          id: String(row.id),
          kind: "consignment",
          name: String(row.item_name ?? "Special item"),
          category: "Special Item",
          size: row.size == null ? null : String(row.size),
          price: Number(row.price ?? 0),
          stocks: Number(row.stocks ?? 0),
          image_url: row.image_url == null ? null : String(row.image_url),
        }));
        setProducts([...addons, ...consignments]);
      }
      setLoading(false);
    });
  }, [open]);

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return products;
    return products.filter((item) =>
      `${item.name} ${item.category} ${item.size ?? ""}`.toLowerCase().includes(query)
    );
  }, [products, search]);

  const selected = useMemo(
    () => products.filter((item) => (quantities[`${item.kind}:${item.id}`] ?? 0) > 0),
    [products, quantities]
  );

  const total = selected.reduce(
    (sum, item) => sum + item.price * (quantities[`${item.kind}:${item.id}`] ?? 0),
    0
  );

  const changeQty = (item: Product, delta: number): void => {
    const key = `${item.kind}:${item.id}`;
    setQuantities((prev) => ({
      ...prev,
      [key]: Math.max(0, Math.min(item.stocks, (prev[key] ?? 0) + delta)),
    }));
  };

  const attachLatestOrder = async (table: "addon_orders" | "consignment_orders", since: string) => {
    const { data, error: findError } = await supabase
      .from(table)
      .select("id")
      .eq("full_name", fullName)
      .eq("seat_number", seatNumber)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (findError) throw findError;
    if (!data?.id) throw new Error(`New ${table} row was not found.`);
    const { error: updateError } = await supabase
      .from(table)
      .update({ booking_code: bookingCode.trim().toUpperCase() })
      .eq("id", data.id);
    if (updateError) throw updateError;
  };

  const submit = async (): Promise<void> => {
    if (selected.length === 0 || saving) return;
    setSaving(true);
    setError("");
    const since = new Date(Date.now() - 5000).toISOString();

    try {
      const addonItems = selected
        .filter((item) => item.kind === "addon")
        .map((item) => ({ add_on_id: item.id, quantity: quantities[`addon:${item.id}`] }));
      const consignmentItems = selected
        .filter((item) => item.kind === "consignment")
        .map((item) => ({
          consignment_id: item.id,
          quantity: quantities[`consignment:${item.id}`],
        }));

      if (addonItems.length > 0) {
        const { error: rpcError } = await supabase.rpc("place_addon_order", {
          p_full_name: fullName,
          p_seat_number: seatNumber,
          p_items: addonItems,
        });
        if (rpcError) throw rpcError;
        await attachLatestOrder("addon_orders", since);
      }

      if (consignmentItems.length > 0) {
        const { error: rpcError } = await supabase.rpc("place_consignment_order", {
          p_full_name: fullName,
          p_seat_number: seatNumber,
          p_items: consignmentItems,
        });
        if (rpcError) throw rpcError;
        await attachLatestOrder("consignment_orders", since);
      }

      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save order.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="aom-overlay" onClick={onClose}>
      <div className="aom-modal" onClick={(event) => event.stopPropagation()}>
        <div className="aom-header">
          <div><h3>Add Order</h3><p>{fullName} · {bookingCode}</p></div>
          <button type="button" onClick={onClose}>×</button>
        </div>
        <input
          className="aom-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search available products..."
        />
        {error ? <div className="aom-error">{error}</div> : null}
        <div className="aom-products">
          {loading ? <div className="aom-empty">Loading products...</div> : null}
          {!loading && visibleProducts.length === 0 ? <div className="aom-empty">No available products.</div> : null}
          {visibleProducts.map((item) => {
            const qty = quantities[`${item.kind}:${item.id}`] ?? 0;
            return (
              <div className="aom-product" key={`${item.kind}:${item.id}`}>
                {item.image_url ? <img src={item.image_url} alt={item.name} /> : <div className="aom-no-image">No image</div>}
                <div className="aom-info">
                  <strong>{item.name}</strong>
                  <span>{item.category}{item.size ? ` · ${item.size}` : ""}</span>
                  <span>{money(item.price)} · Stock {item.stocks}</span>
                </div>
                <div className="aom-qty">
                  <button type="button" onClick={() => changeQty(item, -1)} disabled={qty === 0}>−</button>
                  <strong>{qty}</strong>
                  <button type="button" onClick={() => changeQty(item, 1)} disabled={qty >= item.stocks}>+</button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="aom-footer">
          <div><span>Total</span><strong>{money(total)}</strong></div>
          <button type="button" className="aom-cancel" onClick={onClose}>Cancel</button>
          <button type="button" className="aom-submit" onClick={() => void submit()} disabled={selected.length === 0 || saving}>
            {saving ? "Saving..." : "Place Order"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AddOrderModal;
