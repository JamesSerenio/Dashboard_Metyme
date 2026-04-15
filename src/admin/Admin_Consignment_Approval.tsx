import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../utils/supabaseClient";
import "../styles/Admin_Consignment_Approval.css";

type ApprovalStatus = "pending" | "approved" | "rejected";
type HistoryFilter = "all" | "approved" | "rejected";
type ActionTypeFilter = "all" | "cashout" | "return_expired" | "restock" | "delete";

type ConsignmentRow = {
  id: string;
  created_at: string;
  full_name: string;
  category: string | null;
  item_name: string;
  size: string | null;
  image_url: string | null;
  price: number;
  restocked: number;
  approval_status: ApprovalStatus;
  rejection_reason: string | null;
  approved_at: string | null;
};

type ActionRequestRow = {
  id: string;
  created_at: string;
  consignment_id: string;
  action_type: "cashout" | "return_expired" | "restock" | "delete";
  qty: number | null;
  cash_amount: number | null;
  gcash_amount: number | null;
  note: string | null;
  category: string | null;
  full_name: string | null;
  price_snapshot: number | null;
  item_name_snapshot: string | null;
  size_snapshot: string | null;
  image_url_snapshot: string | null;
  status: ApprovalStatus;
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
};

const formatDateTime = (value: string | null): string => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";

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

const money = (value: number | null | undefined): string => {
  const n = Number(value ?? 0);
  return `₱${Number.isFinite(n) ? n.toFixed(2) : "0.00"}`;
};

const actionLabel = (value: ActionRequestRow["action_type"]): string => {
  switch (value) {
    case "cashout":
      return "Cash Out";
    case "return_expired":
      return "Returns / Expired";
    case "restock":
      return "Restock";
    case "delete":
      return "Delete";
    default:
      return value;
  }
};

const totalCashout = (row: ActionRequestRow): number =>
  Number(row.cash_amount ?? 0) + Number(row.gcash_amount ?? 0);

const Admin_Consignment_Approval: React.FC = () => {
  const [items, setItems] = useState<ConsignmentRow[]>([]);
  const [historyItems, setHistoryItems] = useState<ConsignmentRow[]>([]);
  const [actionItems, setActionItems] = useState<ActionRequestRow[]>([]);
  const [actionHistoryItems, setActionHistoryItems] = useState<ActionRequestRow[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [historyLoading, setHistoryLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(true);
  const [actionHistoryLoading, setActionHistoryLoading] = useState<boolean>(true);

  const [toastMessage, setToastMessage] = useState<string>("");
  const [showToast, setShowToast] = useState<boolean>(false);

  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [actionRejectReasons, setActionRejectReasons] = useState<Record<string, string>>({});

  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [actionFilter, setActionFilter] = useState<ActionTypeFilter>("all");
  const [actionHistoryFilter, setActionHistoryFilter] = useState<ActionTypeFilter>("all");
  const [searchText, setSearchText] = useState<string>("");

  useEffect(() => {
    if (!showToast) return;
    const timer = window.setTimeout(() => setShowToast(false), 3000);
    return () => window.clearTimeout(timer);
  }, [showToast]);

  const loadPending = async (): Promise<void> => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("consignment")
        .select(`
          id,
          created_at,
          full_name,
          category,
          item_name,
          size,
          image_url,
          price,
          restocked,
          approval_status,
          rejection_reason,
          approved_at
        `)
        .eq("approval_status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setItems((data ?? []) as ConsignmentRow[]);
    } catch (err: unknown) {
      console.error("loadPending error:", err);
      setToastMessage(err instanceof Error ? err.message : "Failed to load pending consignment");
      setShowToast(true);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async (): Promise<void> => {
    try {
      setHistoryLoading(true);

      const { data, error } = await supabase
        .from("consignment")
        .select(`
          id,
          created_at,
          full_name,
          category,
          item_name,
          size,
          image_url,
          price,
          restocked,
          approval_status,
          rejection_reason,
          approved_at
        `)
        .in("approval_status", ["approved", "rejected"])
        .order("approved_at", { ascending: false });

      if (error) throw error;
      setHistoryItems((data ?? []) as ConsignmentRow[]);
    } catch (err: unknown) {
      console.error("loadHistory error:", err);
      setToastMessage(err instanceof Error ? err.message : "Failed to load consignment records");
      setShowToast(true);
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadPendingActionRequests = async (): Promise<void> => {
    try {
      setActionLoading(true);

      const { data, error } = await supabase
        .from("consignment_action_requests")
        .select(`
          id,
          created_at,
          consignment_id,
          action_type,
          qty,
          cash_amount,
          gcash_amount,
          note,
          category,
          full_name,
          price_snapshot,
          item_name_snapshot,
          size_snapshot,
          image_url_snapshot,
          status,
          approved_at,
          rejected_at,
          rejection_reason
        `)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setActionItems((data ?? []) as ActionRequestRow[]);
    } catch (err: unknown) {
      console.error("loadPendingActionRequests error:", err);
      setToastMessage(err instanceof Error ? err.message : "Failed to load action requests");
      setShowToast(true);
    } finally {
      setActionLoading(false);
    }
  };

  const loadActionHistory = async (): Promise<void> => {
    try {
      setActionHistoryLoading(true);

      const { data, error } = await supabase
        .from("consignment_action_requests")
        .select(`
          id,
          created_at,
          consignment_id,
          action_type,
          qty,
          cash_amount,
          gcash_amount,
          note,
          category,
          full_name,
          price_snapshot,
          item_name_snapshot,
          size_snapshot,
          image_url_snapshot,
          status,
          approved_at,
          rejected_at,
          rejection_reason
        `)
        .in("status", ["approved", "rejected"])
        .order("approved_at", { ascending: false });

      if (error) throw error;
      setActionHistoryItems((data ?? []) as ActionRequestRow[]);
    } catch (err: unknown) {
      console.error("loadActionHistory error:", err);
      setToastMessage(err instanceof Error ? err.message : "Failed to load action history");
      setShowToast(true);
    } finally {
      setActionHistoryLoading(false);
    }
  };

  const reloadAll = async (): Promise<void> => {
    await Promise.all([
      loadPending(),
      loadHistory(),
      loadPendingActionRequests(),
      loadActionHistory(),
    ]);
  };

  useEffect(() => {
    void reloadAll();
  }, []);

  const handleApprove = async (id: string): Promise<void> => {
    try {
      const { error } = await supabase.rpc("approve_consignment", {
        p_consignment_id: id,
      });

      if (error) throw new Error(error.message);

      setToastMessage("Consignment approved!");
      setShowToast(true);
      await reloadAll();
    } catch (err: unknown) {
      console.error("handleApprove error:", err);
      setToastMessage(err instanceof Error ? err.message : "Approval failed");
      setShowToast(true);
    }
  };

  const handleReject = async (id: string): Promise<void> => {
    try {
      const reason = (rejectReasons[id] ?? "").trim();

      const { error } = await supabase.rpc("reject_consignment", {
        p_consignment_id: id,
        p_reason: reason || null,
      });

      if (error) throw new Error(error.message);

      setToastMessage("Consignment rejected!");
      setShowToast(true);
      await reloadAll();
    } catch (err: unknown) {
      console.error("handleReject error:", err);
      setToastMessage(err instanceof Error ? err.message : "Reject failed");
      setShowToast(true);
    }
  };

  const handleApproveAction = async (id: string): Promise<void> => {
    try {
      const { error } = await supabase.rpc("approve_consignment_action_request", {
        p_request_id: id,
      });

      if (error) throw new Error(error.message);

      setToastMessage("Action request approved!");
      setShowToast(true);
      await reloadAll();
    } catch (err: unknown) {
      console.error("handleApproveAction error:", err);
      setToastMessage(err instanceof Error ? err.message : "Action approval failed");
      setShowToast(true);
    }
  };

  const handleRejectAction = async (id: string): Promise<void> => {
    try {
      const reason = (actionRejectReasons[id] ?? "").trim();

      const { error } = await supabase.rpc("reject_consignment_action_request", {
        p_request_id: id,
        p_reason: reason || null,
      });

      if (error) throw new Error(error.message);

      setToastMessage("Action request rejected!");
      setShowToast(true);
      await reloadAll();
    } catch (err: unknown) {
      console.error("handleRejectAction error:", err);
      setToastMessage(err instanceof Error ? err.message : "Action reject failed");
      setShowToast(true);
    }
  };

  const filteredHistory = useMemo(() => {
    if (historyFilter === "approved") {
      return historyItems.filter((item) => item.approval_status === "approved");
    }
    if (historyFilter === "rejected") {
      return historyItems.filter((item) => item.approval_status === "rejected");
    }
    return historyItems;
  }, [historyItems, historyFilter]);

  const filteredPendingActions = useMemo(() => {
    let rows = actionItems;

    if (actionFilter !== "all") {
      rows = rows.filter((row) => row.action_type === actionFilter);
    }

    const q = searchText.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((row) => {
      const fullName = String(row.full_name ?? "").toLowerCase();
      const category = String(row.category ?? "").toLowerCase();
      const itemName = String(row.item_name_snapshot ?? "").toLowerCase();
      const action = String(row.action_type ?? "").toLowerCase();
      const note = String(row.note ?? "").toLowerCase();
      return (
        fullName.includes(q) ||
        category.includes(q) ||
        itemName.includes(q) ||
        action.includes(q) ||
        note.includes(q)
      );
    });
  }, [actionItems, actionFilter, searchText]);

  const filteredActionHistory = useMemo(() => {
    let rows = actionHistoryItems;

    if (actionHistoryFilter !== "all") {
      rows = rows.filter((row) => row.action_type === actionHistoryFilter);
    }

    const q = searchText.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((row) => {
      const fullName = String(row.full_name ?? "").toLowerCase();
      const category = String(row.category ?? "").toLowerCase();
      const itemName = String(row.item_name_snapshot ?? "").toLowerCase();
      const action = String(row.action_type ?? "").toLowerCase();
      const note = String(row.note ?? "").toLowerCase();
      return (
        fullName.includes(q) ||
        category.includes(q) ||
        itemName.includes(q) ||
        action.includes(q) ||
        note.includes(q)
      );
    });
  }, [actionHistoryItems, actionHistoryFilter, searchText]);

  return (
    <div className="aca-page">
      <div className="aca-shell">
        <div className="aca-head">
          <h1 className="aca-title">Consignment Approval</h1>
          <p className="aca-subtitle">
            Review consignment approval and action requests with quick filters.
          </p>
        </div>

        <div className="aca-toolbar-panel">
          <div className="aca-search-wrap">
            <input
              className="aca-search-input"
              type="text"
              placeholder="Search full name / item / category / action / note"
              value={searchText}
              onChange={(e) => setSearchText(e.currentTarget.value)}
            />
          </div>

          <div className="aca-filter-groups">
            <div className="aca-filter-block">
              <div className="aca-filter-label">Pending Actions</div>
              <div className="aca-pill-row">
                <button
                  className={`aca-pill ${actionFilter === "all" ? "is-active" : ""}`}
                  onClick={() => setActionFilter("all")}
                  type="button"
                >
                  All
                </button>
                <button
                  className={`aca-pill ${actionFilter === "cashout" ? "is-active" : ""}`}
                  onClick={() => setActionFilter("cashout")}
                  type="button"
                >
                  Cash Out
                </button>
                <button
                  className={`aca-pill ${actionFilter === "return_expired" ? "is-active" : ""}`}
                  onClick={() => setActionFilter("return_expired")}
                  type="button"
                >
                  Returns
                </button>
                <button
                  className={`aca-pill ${actionFilter === "restock" ? "is-active" : ""}`}
                  onClick={() => setActionFilter("restock")}
                  type="button"
                >
                  Restock
                </button>
                <button
                  className={`aca-pill ${actionFilter === "delete" ? "is-active" : ""}`}
                  onClick={() => setActionFilter("delete")}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="aca-filter-block">
              <div className="aca-filter-label">Action History</div>
              <div className="aca-pill-row">
                <button
                  className={`aca-pill ${actionHistoryFilter === "all" ? "is-active" : ""}`}
                  onClick={() => setActionHistoryFilter("all")}
                  type="button"
                >
                  All
                </button>
                <button
                  className={`aca-pill ${actionHistoryFilter === "cashout" ? "is-active" : ""}`}
                  onClick={() => setActionHistoryFilter("cashout")}
                  type="button"
                >
                  Cash Out
                </button>
                <button
                  className={`aca-pill ${actionHistoryFilter === "return_expired" ? "is-active" : ""}`}
                  onClick={() => setActionHistoryFilter("return_expired")}
                  type="button"
                >
                  Returns
                </button>
                <button
                  className={`aca-pill ${actionHistoryFilter === "restock" ? "is-active" : ""}`}
                  onClick={() => setActionHistoryFilter("restock")}
                  type="button"
                >
                  Restock
                </button>
                <button
                  className={`aca-pill ${actionHistoryFilter === "delete" ? "is-active" : ""}`}
                  onClick={() => setActionHistoryFilter("delete")}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="aca-section">
          <div className="aca-section-head">
            <h2 className="aca-section-title">Pending Consignment Items</h2>
            <button className="aca-btn aca-btn-approve" onClick={() => void loadPending()}>
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="aca-loading">
              <div className="aca-spinner" />
            </div>
          ) : items.length === 0 ? (
            <div className="aca-empty">No pending consignment items.</div>
          ) : (
            <div className="aca-list">
              {items.map((item) => (
                <div key={item.id} className="aca-card">
                  <div className="aca-card-grid">
                    <div className="aca-image-wrap">
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.item_name} className="aca-image" />
                      ) : (
                        <div className="aca-no-image">No Image</div>
                      )}
                    </div>

                    <div className="aca-details">
                      <div className="aca-item-title">{item.item_name}</div>

                      <div className="aca-info-grid">
                        <div className="aca-info-pill">
                          <span className="aca-info-label">Full Name</span>
                          <span className="aca-info-value">{item.full_name}</span>
                        </div>

                        <div className="aca-info-pill">
                          <span className="aca-info-label">Category</span>
                          <span className="aca-info-value">{item.category ?? "-"}</span>
                        </div>

                        <div className="aca-info-pill">
                          <span className="aca-info-label">Size</span>
                          <span className="aca-info-value">{item.size ?? "-"}</span>
                        </div>

                        <div className="aca-info-pill">
                          <span className="aca-info-label">Price</span>
                          <span className="aca-info-value">{money(item.price)}</span>
                        </div>

                        <div className="aca-info-pill">
                          <span className="aca-info-label">Restocked</span>
                          <span className="aca-info-value">{item.restocked}</span>
                        </div>

                        <div className="aca-info-pill">
                          <span className="aca-info-label">Status</span>
                          <span className="aca-info-value aca-status">{item.approval_status}</span>
                        </div>
                      </div>

                      <div className="aca-reason-item">
                        <label className="aca-reason-label" htmlFor={`reject-${item.id}`}>
                          Reject Reason (optional)
                        </label>
                        <textarea
                          id={`reject-${item.id}`}
                          className="aca-reason-textarea"
                          value={rejectReasons[item.id] ?? ""}
                          placeholder="Type reason here..."
                          onChange={(e) =>
                            setRejectReasons((prev) => ({
                              ...prev,
                              [item.id]: e.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="aca-actions">
                        <button className="aca-btn aca-btn-approve" onClick={() => void handleApprove(item.id)}>
                          Approve
                        </button>
                        <button className="aca-btn aca-btn-reject" onClick={() => void handleReject(item.id)}>
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="aca-section">
          <div className="aca-section-head">
            <h2 className="aca-section-title">Pending Action Requests</h2>
            <button className="aca-btn aca-btn-approve" onClick={() => void loadPendingActionRequests()}>
              Refresh
            </button>
          </div>

          {actionLoading ? (
            <div className="aca-loading">
              <div className="aca-spinner" />
            </div>
          ) : filteredPendingActions.length === 0 ? (
            <div className="aca-empty">No pending action requests.</div>
          ) : (
            <div className="aca-list">
              {filteredPendingActions.map((item) => (
                <div key={item.id} className="aca-card aca-card-action">
                  <div className="aca-card-grid">
                    <div className="aca-image-wrap">
                      {item.image_url_snapshot ? (
                        <img
                          src={item.image_url_snapshot}
                          alt={item.item_name_snapshot ?? "Action item"}
                          className="aca-image"
                        />
                      ) : (
                        <div className="aca-no-image">No Image</div>
                      )}
                    </div>

                    <div className="aca-details">
                      <div className="aca-item-title">
                        {item.item_name_snapshot ?? "-"}
                        <span className={`aca-action-badge aca-action-${item.action_type}`}>
                          {actionLabel(item.action_type)}
                        </span>
                      </div>

                      <div className="aca-info-grid">
                        <div className="aca-info-pill">
                          <span className="aca-info-label">Full Name</span>
                          <span className="aca-info-value">{item.full_name ?? "-"}</span>
                        </div>

                        <div className="aca-info-pill">
                          <span className="aca-info-label">Category</span>
                          <span className="aca-info-value">{item.category ?? "-"}</span>
                        </div>

                        <div className="aca-info-pill">
                          <span className="aca-info-label">Size</span>
                          <span className="aca-info-value">{item.size_snapshot ?? "-"}</span>
                        </div>

                        <div className="aca-info-pill">
                          <span className="aca-info-label">Qty</span>
                          <span className="aca-info-value">{item.qty ?? "-"}</span>
                        </div>

                        <div className="aca-info-pill">
                          <span className="aca-info-label">Cash</span>
                          <span className="aca-info-value">{money(item.cash_amount)}</span>
                        </div>

                        <div className="aca-info-pill">
                          <span className="aca-info-label">GCash</span>
                          <span className="aca-info-value">{money(item.gcash_amount)}</span>
                        </div>

                        <div className="aca-info-pill">
                          <span className="aca-info-label">Total</span>
                          <span className="aca-info-value">{money(totalCashout(item))}</span>
                        </div>

                        <div className="aca-info-pill">
                          <span className="aca-info-label">Requested At</span>
                          <span className="aca-info-value">{formatDateTime(item.created_at)}</span>
                        </div>
                      </div>

                      <div className="aca-reason-item">
                        <label className="aca-reason-label">Request Note</label>
                        <div className="aca-info-value">{item.note?.trim() ? item.note : "-"}</div>
                      </div>

                      <div className="aca-reason-item">
                        <label className="aca-reason-label" htmlFor={`action-reject-${item.id}`}>
                          Reject Reason (optional)
                        </label>
                        <textarea
                          id={`action-reject-${item.id}`}
                          className="aca-reason-textarea"
                          value={actionRejectReasons[item.id] ?? ""}
                          placeholder="Type reason here..."
                          onChange={(e) =>
                            setActionRejectReasons((prev) => ({
                              ...prev,
                              [item.id]: e.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="aca-actions">
                        <button className="aca-btn aca-btn-approve" onClick={() => void handleApproveAction(item.id)}>
                          Approve
                        </button>
                        <button className="aca-btn aca-btn-reject" onClick={() => void handleRejectAction(item.id)}>
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="aca-section aca-history-section">
          <div className="aca-section-head aca-section-head--history">
            <h2 className="aca-section-title">Consignment Approval Records</h2>
          </div>

          <div className="aca-history-toolbar">
            <div className="aca-segment" role="tablist" aria-label="History Filter">
              <button
                className={`aca-segment-btn ${historyFilter === "all" ? "active" : ""}`}
                onClick={() => setHistoryFilter("all")}
                type="button"
              >
                All
              </button>
              <button
                className={`aca-segment-btn ${historyFilter === "approved" ? "active" : ""}`}
                onClick={() => setHistoryFilter("approved")}
                type="button"
              >
                Approved
              </button>
              <button
                className={`aca-segment-btn ${historyFilter === "rejected" ? "active" : ""}`}
                onClick={() => setHistoryFilter("rejected")}
                type="button"
              >
                Rejected
              </button>
            </div>

            <button className="aca-btn aca-btn-approve" onClick={() => void loadHistory()}>
              Refresh Records
            </button>
          </div>

          {historyLoading ? (
            <div className="aca-loading">
              <div className="aca-spinner" />
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="aca-empty">No approval records found.</div>
          ) : (
            <div className="aca-table-wrap">
              <table className="aca-table">
                <thead>
                  <tr>
                    <th>Date Submitted</th>
                    <th>Decision Date</th>
                    <th>Full Name</th>
                    <th>Item Name</th>
                    <th>Category</th>
                    <th>Size</th>
                    <th>Price</th>
                    <th>Restocked</th>
                    <th>Status</th>
                    <th>Reject Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((item) => (
                    <tr key={item.id}>
                      <td>{formatDateTime(item.created_at)}</td>
                      <td>{formatDateTime(item.approved_at)}</td>
                      <td>{item.full_name}</td>
                      <td>{item.item_name}</td>
                      <td>{item.category ?? "-"}</td>
                      <td>{item.size ?? "-"}</td>
                      <td>{money(item.price)}</td>
                      <td>{item.restocked}</td>
                      <td>
                        <span
                          className={`aca-badge ${
                            item.approval_status === "approved"
                              ? "aca-badge-approved"
                              : "aca-badge-rejected"
                          }`}
                        >
                          {item.approval_status}
                        </span>
                      </td>
                      <td>{item.rejection_reason?.trim() ? item.rejection_reason : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="aca-section aca-history-section">
          <div className="aca-section-head aca-section-head--history">
            <h2 className="aca-section-title">Action Request Records</h2>
          </div>

          {actionHistoryLoading ? (
            <div className="aca-loading">
              <div className="aca-spinner" />
            </div>
          ) : filteredActionHistory.length === 0 ? (
            <div className="aca-empty">No action request records found.</div>
          ) : (
            <div className="aca-table-wrap">
              <table className="aca-table">
                <thead>
                  <tr>
                    <th>Date Requested</th>
                    <th>Decision Date</th>
                    <th>Full Name</th>
                    <th>Item Name</th>
                    <th>Category</th>
                    <th>Action</th>
                    <th>Qty</th>
                    <th>Cash</th>
                    <th>GCash</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Request Note</th>
                    <th>Reject Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredActionHistory.map((item) => (
                    <tr key={item.id}>
                      <td>{formatDateTime(item.created_at)}</td>
                      <td>{formatDateTime(item.approved_at ?? item.rejected_at)}</td>
                      <td>{item.full_name ?? "-"}</td>
                      <td>{item.item_name_snapshot ?? "-"}</td>
                      <td>{item.category ?? "-"}</td>
                      <td>{actionLabel(item.action_type)}</td>
                      <td>{item.qty ?? "-"}</td>
                      <td>{money(item.cash_amount)}</td>
                      <td>{money(item.gcash_amount)}</td>
                      <td>{money(totalCashout(item))}</td>
                      <td>
                        <span
                          className={`aca-badge ${
                            item.status === "approved" ? "aca-badge-approved" : "aca-badge-rejected"
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td>{item.note?.trim() ? item.note : "-"}</td>
                      <td>{item.rejection_reason?.trim() ? item.rejection_reason : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="aca-history-toolbar aca-history-toolbar-bottom">
            <button className="aca-btn aca-btn-approve" onClick={() => void loadActionHistory()}>
              Refresh Action Records
            </button>
          </div>
        </div>
      </div>

      {showToast && (
        <div className="aca-toast" role="status" aria-live="polite">
          {toastMessage}
        </div>
      )}
    </div>
  );
};

export default Admin_Consignment_Approval;