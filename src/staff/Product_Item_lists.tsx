import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import "../styles/Product_Item_lists.css";
import { supabase } from "../utils/supabaseClient";

type ExpenseType = "expired" | "inventory_loss" | "bilin";
type SortKey = "category" | "stocks";
type CashOutMethod = "cash" | "gcash";
type UnitSource = "cost" | "price" | "none";
type ToastColor = "success" | "danger" | "warning";

interface AddOn {
  id: string;
  category: string;
  name: string;
  size: string | null;

  price: number | string;
  restocked: number | string;
  sold: number | string;

  expenses_cost: number | string;
  expenses: number | string;

  stocks: number | string;
  overall_sales: number | string;
  expected_sales: number | string;
  image_url: string | null;

  expired: number | string;
  inventory_loss: number | string;
  bilin: number | string;
}

interface CashOutInsert {
  type: string;
  description: string | null;
  amount: number;
  payment_method: CashOutMethod;
}

type ToastState = {
  open: boolean;
  msg: string;
  color: ToastColor;
};

const toNumber = (v: unknown): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const clampInt = (raw: string, fallback = 0): number => {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  const n = Math.floor(Number(trimmed));
  return Number.isFinite(n) ? n : fallback;
};

const clampMoney = (raw: string, fallback = 0): number => {
  const cleaned = raw.replace(/,/g, "").trim();
  if (!cleaned) return fallback;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
};

const money2 = (n: number): string =>
  `₱${Number.isFinite(n) ? n.toFixed(2) : "0.00"}`;

const normSize = (s: string | null | undefined): string | null => {
  const v = String(s ?? "").trim();
  return v.length ? v : null;
};

const getAuthedUserId = async (): Promise<string | null> => {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error("getUser error:", error);
    return null;
  }
  return data.user?.id ?? null;
};

const getUnitForType = (
  addOn: AddOn | null,
  t: ExpenseType
): { unit: number; source: UnitSource } => {
  if (!addOn) return { unit: 0, source: "none" };

  const price = toNumber(addOn.price);
  const cost = toNumber(addOn.expenses_cost);

  if (t === "bilin" || t === "inventory_loss") {
    return price > 0 ? { unit: price, source: "price" } : { unit: 0, source: "none" };
  }

  if (cost > 0) return { unit: cost, source: "cost" };
  if (price > 0) return { unit: price, source: "price" };
  return { unit: 0, source: "none" };
};

const computeAmount = (
  addOn: AddOn | null,
  t: ExpenseType,
  qtyStr: string
): number => {
  if (!addOn) return 0;
  const q = clampInt(qtyStr, 0);
  const { unit } = getUnitForType(addOn, t);
  const total = q * unit;
  return Number.isFinite(total) ? total : 0;
};

type ModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
};

const CenterModal: React.FC<ModalProps> = ({
  open,
  title,
  onClose,
  wide = false,
  children,
}) => {
  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="prod-items-modal-overlay" onClick={onClose}>
      <div
        className={`prod-items-modal-card ${wide ? "prod-items-modal-card--wide" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="prod-items-modal-head">
          <h3 className="prod-items-modal-title">{title}</h3>
          <button
            type="button"
            className="prod-items-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
};

const Toast: React.FC<{
  open: boolean;
  msg: string;
  color?: ToastColor;
  onClose: () => void;
}> = ({ open, msg, color = "success", onClose }) => {
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(onClose, 3200);
    return () => window.clearTimeout(t);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className={`prod-items-toast prod-items-toast--${color}`}>
      <span>{msg}</span>
      <button type="button" onClick={onClose} aria-label="Close toast">
        ✕
      </button>
    </div>,
    document.body
  );
};

const Product_Item_lists: React.FC = () => {
  const [addOns, setAddOns] = useState<AddOn[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [toast, setToast] = useState<ToastState>({
    open: false,
    msg: "",
    color: "success",
  });

  const [sortKey, setSortKey] = useState<SortKey>("category");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [search, setSearch] = useState<string>("");

  const [isExpenseOpen, setIsExpenseOpen] = useState<boolean>(false);
  const [savingExpense, setSavingExpense] = useState<boolean>(false);

  const [fullName, setFullName] = useState<string>("");
  const [selectedAddOnId, setSelectedAddOnId] = useState<string>("");
  const [expenseType, setExpenseType] = useState<ExpenseType>("expired");
  const [qty, setQty] = useState<string>("1");
  const [expenseAmount, setExpenseAmount] = useState<string>("0");
  const [description, setDescription] = useState<string>("");

  const [isCashOutOpen, setIsCashOutOpen] = useState<boolean>(false);
  const [savingCashOut, setSavingCashOut] = useState<boolean>(false);

  const [cashOutType, setCashOutType] = useState<string>("");
  const [cashOutDesc, setCashOutDesc] = useState<string>("");
  const [cashOutAmount, setCashOutAmount] = useState<string>("");
  const [cashOutMethod, setCashOutMethod] = useState<CashOutMethod>("cash");

  const showToast = (msg: string, color: ToastColor = "success"): void => {
    setToast({ open: true, msg, color });
  };

  const fetchAddOns = async (): Promise<void> => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("add_ons")
        .select(
          "id, created_at, category, name, size, price, restocked, sold, expenses_cost, expenses, stocks, overall_sales, expected_sales, image_url, expired, inventory_loss, bilin"
        )
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAddOns((data ?? []) as AddOn[]);
    } catch (err) {
      console.error("Error fetching add-ons:", err);
      showToast("Error loading products. Please try again.", "danger");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchAddOns();
  }, []);

  const sortedAddOns = useMemo(() => {
    const list = [...addOns];

    list.sort((a, b) => {
      if (sortKey === "category") {
        const aCat = (a.category ?? "").toString();
        const bCat = (b.category ?? "").toString();
        return sortOrder === "asc" ? aCat.localeCompare(bCat) : bCat.localeCompare(aCat);
      }

      const aStock = toNumber(a.stocks);
      const bStock = toNumber(b.stocks);
      return sortOrder === "asc" ? aStock - bStock : bStock - aStock;
    });

    return list;
  }, [addOns, sortKey, sortOrder]);

  const filteredAddOns = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedAddOns;

    return sortedAddOns.filter((a) => {
      const name = (a.name ?? "").toString().toLowerCase();
      const cat = (a.category ?? "").toString().toLowerCase();
      const size = (a.size ?? "").toString().toLowerCase();
      return name.includes(q) || cat.includes(q) || size.includes(q);
    });
  }, [sortedAddOns, search]);

  const toggleSortOrder = (): void => {
    setSortOrder((p) => (p === "asc" ? "desc" : "asc"));
  };

  const selectedAddOn = useMemo(
    () => addOns.find((a) => a.id === selectedAddOnId) ?? null,
    [addOns, selectedAddOnId]
  );

  useEffect(() => {
    const total = computeAmount(selectedAddOn, expenseType, qty);
    setExpenseAmount(String(total));
  }, [selectedAddOn, expenseType, qty]);

const totalProducts = addOns.length;
const lowStockCount = addOns.filter((a) => toNumber(a.stocks) <= 10).length;

  const openExpenseModal = (): void => {
    setFullName("");
    setSelectedAddOnId("");
    setExpenseType("expired");
    setQty("1");
    setExpenseAmount("0");
    setDescription("");
    setIsExpenseOpen(true);
  };

  const closeExpenseModal = (): void => {
    if (savingExpense) return;
    setIsExpenseOpen(false);
  };

  const validateExpense = (): string | null => {
    const name = fullName.trim();
    if (!name) return "Full name is required.";
    if (!selectedAddOnId) return "Please select a product.";

    const q = clampInt(qty, -1);
    if (q <= 0) return "Quantity must be at least 1.";

    const desc = description.trim();
    if (!desc) return "Description / reason is required.";

    if (!selectedAddOn) return "Product not found.";

    const stock = toNumber(selectedAddOn.stocks);
    if (q > stock) return `Not enough stock. Available: ${stock}`;

    const { unit, source } = getUnitForType(selectedAddOn, expenseType);
    if (unit <= 0 || source === "none") return "Set price (and/or expenses_cost) first.";

    return null;
  };

  const submitExpense = async (): Promise<void> => {
    const err = validateExpense();
    if (err) {
      showToast(err, "warning");
      return;
    }

    if (!selectedAddOn) {
      showToast("Product not found.", "danger");
      return;
    }

    const q = clampInt(qty, 1);

    setSavingExpense(true);
    try {
      const { error } = await supabase.rpc("record_addon_adjustment", {
        p_add_on_id: selectedAddOn.id,
        p_full_name: fullName.trim(),
        p_quantity: q,
        p_expense_type: expenseType,
        p_description: description.trim(),
      });

      if (error) {
        console.error("record_addon_adjustment error:", error);
        showToast(error.message, "danger");
        return;
      }

      showToast("Stock adjustment recorded.", "success");
      setIsExpenseOpen(false);
      await fetchAddOns();
    } finally {
      setSavingExpense(false);
    }
  };

  const openCashOutModal = (): void => {
    setCashOutType("");
    setCashOutDesc("");
    setCashOutAmount("");
    setCashOutMethod("cash");
    setIsCashOutOpen(true);
  };

  const closeCashOutModal = (): void => {
    if (savingCashOut) return;
    setIsCashOutOpen(false);
  };

  const validateCashOut = (): string | null => {
    const t = cashOutType.trim();
    if (!t) return "Type is required.";

    const amt = clampMoney(cashOutAmount, -1);
    if (amt < 0) return "Amount must be 0 or higher.";
    if (amt === 0) return "Amount must be greater than 0.";

    return null;
  };

  const submitCashOut = async (): Promise<void> => {
    const err = validateCashOut();
    if (err) {
      showToast(err, "warning");
      return;
    }

    const uid = await getAuthedUserId();
    if (!uid) {
      showToast("Walang Supabase session. Mag-login ulit (Supabase Auth).", "danger");
      return;
    }

    const payload: CashOutInsert = {
      type: cashOutType.trim(),
      description: cashOutDesc.trim() ? cashOutDesc.trim() : null,
      amount: clampMoney(cashOutAmount, 0),
      payment_method: cashOutMethod,
    };

    setSavingCashOut(true);
    try {
      const { error } = await supabase.from("cash_outs").insert(payload);
      if (error) {
        console.error("cash_outs insert error:", error);
        showToast(error.message, "danger");
        return;
      }

      showToast("Cash out saved.", "success");
      setIsCashOutOpen(false);
      setCashOutType("");
      setCashOutDesc("");
      setCashOutAmount("");
      setCashOutMethod("cash");
    } finally {
      setSavingCashOut(false);
    }
  };

  const unitInfo = useMemo(
    () => getUnitForType(selectedAddOn, expenseType),
    [selectedAddOn, expenseType]
  );

  const sortLabel = `${sortKey === "category" ? "category" : "stocks"} (${sortOrder})`;

  return (
    <div className="prod-items-page">
      <Toast
        open={toast.open}
        msg={toast.msg}
        color={toast.color}
        onClose={() => setToast((p) => ({ ...p, open: false }))}
      />

      <div className="prod-items-shell">
        <section className="prod-items-hero">
          <div className="prod-items-badge">Inventory Management</div>

          <div className="prod-items-hero-main">
            <div className="prod-items-copy">
              <h1 className="prod-items-title">Product Item Lists</h1>
              <p className="prod-items-subtitle">
                Manage products, stock adjustments, search results, cash outs,
                and table records in one plain premium page.
              </p>
            </div>

            <div className="prod-items-hero-actions">
              <button
                type="button"
                className="prod-items-action-btn prod-items-action-btn--primary"
                onClick={openExpenseModal}
              >
                Stock Adjustment
              </button>

              <button
                type="button"
                className="prod-items-action-btn prod-items-action-btn--primary"
                onClick={openCashOutModal}
              >
                Add Cash Outs
              </button>

              <button
                type="button"
                className="prod-items-action-btn prod-items-action-btn--soft"
                onClick={() => void fetchAddOns()}
              >
                Refresh
              </button>
            </div>
          </div>
        </section>

        <section className="prod-items-toolbar">
          <div className="prod-items-toolbar-top">
            <div className="prod-items-toolbar-stats">
              <div className="prod-items-summary-card">
                <span className="prod-items-summary-label">Total Products</span>
                <strong>{totalProducts}</strong>
              </div>
              <div className="prod-items-summary-card">
                <span className="prod-items-summary-label">Low Stocks</span>
                <strong>{lowStockCount}</strong>
              </div>
            </div>

            <div className="prod-items-toolbar-search">
              <div className="prod-items-search-box">
                <span className="prod-items-search-icon">⌕</span>
                <input
                  className="prod-items-search-input"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, category, or size..."
                />
                {search.trim() && (
                  <button
                    type="button"
                    className="prod-items-search-clear"
                    onClick={() => setSearch("")}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="prod-items-toolbar-bottom">
            <div className="prod-items-filter-actions">
              <button
                type="button"
                className={`prod-items-chip-btn ${sortKey === "category" ? "is-active" : ""}`}
                onClick={() => setSortKey("category")}
              >
                Sort: Category
              </button>

              <button
                type="button"
                className={`prod-items-chip-btn ${sortKey === "stocks" ? "is-active" : ""}`}
                onClick={() => setSortKey("stocks")}
              >
                Sort: Stocks
              </button>

              <button
                type="button"
                className="prod-items-chip-btn"
                onClick={toggleSortOrder}
              >
                Order: {sortOrder === "asc" ? "Asc" : "Desc"}
              </button>

              {search.trim() && (
                <button type="button" className="prod-items-chip-btn is-active">
                  Showing {filteredAddOns.length} result(s)
                </button>
              )}
            </div>
          </div>
        </section>

        {loading ? (
          <div className="prod-items-state-card">Loading products...</div>
        ) : filteredAddOns.length === 0 ? (
          <div className="prod-items-state-card">No products found.</div>
        ) : (
          <section className="prod-items-table-card">
            <div className="prod-items-table-card-head">
              <div>
                <div className="prod-items-table-title">Products</div>
                <div className="prod-items-table-subtitle">
                  Sorted by <b>{sortLabel}</b>
                </div>
              </div>
            </div>

            <div className="prod-items-table-wrap">
              <table className="prod-items-table">
                <thead>
                  <tr>
                    <th className="prod-items-cell-image">Image</th>
                    <th className="prod-items-name-cell">Name</th>
                    <th>Category</th>
                    <th>Size</th>
                    <th>Price</th>
                    <th>Restocked</th>
                    <th>Sold</th>
                    <th>Expired</th>
                    <th>Inventory Loss</th>
                    <th>Bale</th>
                    <th>Stocks</th>
                    <th>Expenses (qty)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAddOns.map((a) => (
                    <tr key={a.id}>
                      <td className="prod-items-cell-image">
                        {a.image_url ? (
                          <img
                            className="prod-items-item-image"
                            src={a.image_url}
                            alt={a.name}
                          />
                        ) : (
                          <div className="prod-items-no-image">No image</div>
                        )}
                      </td>
                      <td className="prod-items-name-cell is-strong">{a.name}</td>
                      <td>{a.category}</td>
                      <td>{normSize(a.size) ?? "—"}</td>
                      <td>{money2(toNumber(a.price))}</td>
                      <td>{toNumber(a.restocked)}</td>
                      <td>{toNumber(a.sold)}</td>
                      <td>{toNumber(a.expired)}</td>
                      <td>{toNumber(a.inventory_loss)}</td>
                      <td>{toNumber(a.bilin)}</td>
                      <td>{toNumber(a.stocks)}</td>
                      <td>{toNumber(a.expenses)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      <CenterModal
        open={isExpenseOpen}
        onClose={closeExpenseModal}
        title="STOCK ADJUSTMENT"
      >
        <p className="prod-items-modal-subtitle">
          Adjust expired, inventory loss, or bale records.
        </p>

        <div className="prod-items-form-grid prod-items-form-grid--single">
          <div className="prod-items-form-group">
            <label>Full Name</label>
            <input
              className="prod-items-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter staff full name"
            />
          </div>

          <div className="prod-items-form-group">
            <label>Product</label>
            <select
              className="prod-items-input"
              value={selectedAddOnId}
              onChange={(e) => setSelectedAddOnId(e.target.value)}
            >
              <option value="">Select product</option>
              {addOns.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.category} — {a.name}
                  {normSize(a.size) ? ` (${normSize(a.size)})` : ""} (Stock: {toNumber(a.stocks)})
                </option>
              ))}
            </select>
          </div>

          <div className="prod-items-form-grid">
            <div className="prod-items-form-group">
              <label>Type</label>
              <select
                className="prod-items-input"
                value={expenseType}
                onChange={(e) => setExpenseType(e.target.value as ExpenseType)}
              >
                <option value="expired">Expired / Damaged</option>
                <option value="inventory_loss">Inventory Loss</option>
                <option value="bilin">Bale (Utang / Bought)</option>
              </select>
            </div>

            <div className="prod-items-form-group">
              <label>Quantity</label>
              <input
                className="prod-items-input"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                inputMode="numeric"
                placeholder="1"
              />
            </div>
          </div>

          <div className="prod-items-form-group">
            <label>Amount (auto)</label>
            <input
              className="prod-items-input"
              value={expenseAmount}
              readOnly
            />
          </div>

          <div className="prod-items-form-group">
            <label>Description / Reason</label>
            <textarea
              className="prod-items-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Example: expired date reached / damaged packaging / inventory loss / utang product"
            />
          </div>
        </div>

        {selectedAddOn && (
          <div className="prod-items-history-meta">
            <div className="prod-items-table-title" style={{ marginBottom: 10 }}>
              Selected Product
            </div>

            <div className="prod-items-confirm-box">
              <div><strong>Name:</strong> {selectedAddOn.name}</div>
              <div><strong>Category:</strong> {selectedAddOn.category}</div>
              <div><strong>Size:</strong> {normSize(selectedAddOn.size) ?? "—"}</div>
              <div><strong>Current Stock:</strong> {toNumber(selectedAddOn.stocks)}</div>
              <div>
                <strong>Unit Source:</strong>{" "}
                {expenseType === "bilin" || expenseType === "inventory_loss"
                  ? "price"
                  : unitInfo.source === "cost"
                    ? "expenses_cost"
                    : unitInfo.source === "price"
                      ? "price (fallback)"
                      : "none"}
              </div>
              <div><strong>Unit Used:</strong> {money2(unitInfo.unit)}</div>
              <div><strong>Total:</strong> {money2(computeAmount(selectedAddOn, expenseType, qty))}</div>
            </div>
          </div>
        )}

        <div className="prod-items-modal-actions">
          <button
            type="button"
            className="prod-items-action-btn prod-items-action-btn--primary"
            onClick={() => void submitExpense()}
            disabled={savingExpense}
          >
            {savingExpense ? "Saving..." : "Save Adjustment"}
          </button>

          <button
            type="button"
            className="prod-items-action-btn prod-items-action-btn--ghost"
            onClick={closeExpenseModal}
            disabled={savingExpense}
          >
            Cancel
          </button>
        </div>
      </CenterModal>

      <CenterModal
        open={isCashOutOpen}
        onClose={closeCashOutModal}
        title="Add Cash Outs"
      >
        <p className="prod-items-modal-subtitle">
          Save a new cash out entry.
        </p>

        <div className="prod-items-form-grid prod-items-form-grid--single">
          <div className="prod-items-form-group">
            <label>Type</label>
            <input
              className="prod-items-input"
              value={cashOutType}
              onChange={(e) => setCashOutType(e.target.value)}
              placeholder="Example: money"
            />
          </div>

          <div className="prod-items-form-group">
            <label>Description</label>
            <textarea
              className="prod-items-textarea"
              value={cashOutDesc}
              onChange={(e) => setCashOutDesc(e.target.value)}
              placeholder="Example: allowance"
            />
          </div>

          <div className="prod-items-form-group">
            <label>Payment (Cash / GCash)</label>
            <select
              className="prod-items-input"
              value={cashOutMethod}
              onChange={(e) => setCashOutMethod(e.target.value as CashOutMethod)}
            >
              <option value="cash">Cash</option>
              <option value="gcash">GCash</option>
            </select>
          </div>

          <div className="prod-items-form-group">
            <label>Amount</label>
            <input
              className="prod-items-input"
              value={cashOutAmount}
              onChange={(e) => setCashOutAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
            />
            <div className="prod-items-helper-text">
              Preview: <b>{money2(clampMoney(cashOutAmount, 0))}</b>
            </div>
          </div>
        </div>

        <div className="prod-items-modal-actions">
          <button
            type="button"
            className="prod-items-action-btn prod-items-action-btn--primary"
            onClick={() => void submitCashOut()}
            disabled={savingCashOut}
          >
            {savingCashOut ? "Saving..." : "Save Cash Outs"}
          </button>

          <button
            type="button"
            className="prod-items-action-btn prod-items-action-btn--ghost"
            onClick={closeCashOutModal}
            disabled={savingCashOut}
          >
            Cancel
          </button>
        </div>
      </CenterModal>
    </div>
  );
};

export default Product_Item_lists;