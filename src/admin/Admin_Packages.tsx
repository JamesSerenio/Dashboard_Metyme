import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../utils/supabaseClient";
import "../styles/Admin_Packages.css";

type PackageArea = "common_area" | "conference_room";
type DurationUnit = "hour" | "day" | "month" | "year";

interface PackageRow {
  id: string;
  created_at: string;
  admin_id: string;
  area: PackageArea;
  title: string;
  description: string | null;
  amenities: string | null;
  is_active: boolean;
}

interface PackageOptionRow {
  id: string;
  created_at: string;
  package_id: string;
  option_name: string;
  duration_value: number;
  duration_unit: DurationUnit;
  price: number | string;
  promo_max_attempts: number | string | null;
  promo_validity_days: number | string | null;
}

const toNum = (v: number | string | null | undefined): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const clampInt = (n: number, min: number, max: number): number => {
  const x = Math.floor(Number.isFinite(n) ? n : 0);
  return Math.min(max, Math.max(min, x));
};

const formatArea = (a: PackageArea) =>
  a === "common_area" ? "Common Area" : "Conference Room";

const formatDuration = (v: number, u: DurationUnit) => {
  const unit =
    u === "hour"
      ? v === 1
        ? "hour"
        : "hours"
      : u === "day"
      ? v === 1
        ? "day"
        : "days"
      : u === "month"
      ? v === 1
        ? "month"
        : "months"
      : v === 1
      ? "year"
      : "years";

  return `${v} ${unit}`;
};

const Modal: React.FC<{
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: "md" | "lg";
}> = ({ open, title, onClose, children, size = "md" }) => {
  useEffect(() => {
    if (!open) return;

    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="adpkg-modal-overlay" onClick={onClose}>
      <div
        className={`adpkg-modal-card ${size === "lg" ? "adpkg-modal-lg" : "adpkg-modal-md"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="adpkg-modal-head">
          <h3>{title}</h3>
          <button className="adpkg-modal-close" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <div className="adpkg-modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
};

const Admin_Packages: React.FC = () => {
  const [loading, setLoading] = useState(true);

  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [optionsByPackage, setOptionsByPackage] = useState<Record<string, PackageOptionRow[]>>(
    {}
  );

  const [openPackageModal, setOpenPackageModal] = useState(false);
  const [openOptionsModal, setOpenOptionsModal] = useState(false);

  const [activePackage, setActivePackage] = useState<PackageRow | null>(null);

  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [toastOpen, setToastOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  const [pkgArea, setPkgArea] = useState<PackageArea>("common_area");
  const [pkgTitle, setPkgTitle] = useState("");
  const [pkgDesc, setPkgDesc] = useState("");
  const [pkgAmenities, setPkgAmenities] = useState("");
  const [pkgActive, setPkgActive] = useState(true);

  const [editingOption, setEditingOption] = useState<PackageOptionRow | null>(null);
  const [optName, setOptName] = useState("");
  const [optDurationValue, setOptDurationValue] = useState<number>(1);
  const [optDurationUnit, setOptDurationUnit] = useState<DurationUnit>("hour");
  const [optPrice, setOptPrice] = useState<number>(0);
  const [optPromoMaxAttempts, setOptPromoMaxAttempts] = useState<number>(7);
  const [optPromoValidityDays, setOptPromoValidityDays] = useState<number>(14);

  const selectedOptions = useMemo(() => {
    if (!activePackage) return [];
    return optionsByPackage[activePackage.id] || [];
  }, [activePackage, optionsByPackage]);

  useEffect(() => {
    if (!toastOpen) return;
    const t = window.setTimeout(() => setToastOpen(false), 2200);
    return () => window.clearTimeout(t);
  }, [toastOpen]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastOpen(true);
  };

  const resetPackageForm = () => {
    setPkgArea("common_area");
    setPkgTitle("");
    setPkgDesc("");
    setPkgAmenities("");
    setPkgActive(true);
  };

  const openCreatePackage = () => {
    setActivePackage(null);
    resetPackageForm();
    setOpenPackageModal(true);
  };

  const openEditPackage = (p: PackageRow) => {
    setActivePackage(p);
    setPkgArea(p.area);
    setPkgTitle(p.title || "");
    setPkgDesc(p.description || "");
    setPkgAmenities(p.amenities || "");
    setPkgActive(!!p.is_active);
    setOpenPackageModal(true);
  };

  const resetOptionForm = () => {
    setEditingOption(null);
    setOptName("");
    setOptDurationValue(1);
    setOptDurationUnit("hour");
    setOptPrice(0);
    setOptPromoMaxAttempts(7);
    setOptPromoValidityDays(14);
  };

  const fetchOptionsForPackage = async (packageId: string): Promise<void> => {
    const { data, error } = await supabase
      .from("package_options")
      .select("*")
      .eq("package_id", packageId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      showToast(`Load options failed: ${error.message}`);
      return;
    }

    setOptionsByPackage((prev) => ({
      ...prev,
      [packageId]: (data as PackageOptionRow[]) || [],
    }));
  };

  const openManageOptions = async (p: PackageRow) => {
    setActivePackage(p);
    resetOptionForm();
    setOpenOptionsModal(true);

    if (!optionsByPackage[p.id]) {
      await fetchOptionsForPackage(p.id);
    }
  };

  const openEditOption = (o: PackageOptionRow) => {
    setEditingOption(o);
    setOptName(o.option_name);
    setOptDurationValue(Number(o.duration_value || 1));
    setOptDurationUnit(o.duration_unit);
    setOptPrice(toNum(o.price));
    setOptPromoMaxAttempts(clampInt(toNum(o.promo_max_attempts), 1, 9999));
    setOptPromoValidityDays(clampInt(toNum(o.promo_validity_days), 1, 3650));
  };

  const fetchPackages = async (): Promise<void> => {
    setLoading(true);

    const { data, error } = await supabase
      .from("packages")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      showToast(`Load failed: ${error.message}`);
      setPackages([]);
      setOptionsByPackage({});
      setLoading(false);
      return;
    }

    const rows = (data as PackageRow[]) || [];
    setPackages(rows);

    const ids = rows.map((r) => r.id);

    if (ids.length) {
      const { data: optData, error: optErr } = await supabase
        .from("package_options")
        .select("*")
        .in("package_id", ids)
        .order("created_at", { ascending: true });

      if (optErr) {
        console.error(optErr);
        showToast(`Options load failed: ${optErr.message}`);
        setOptionsByPackage({});
      } else {
        const map: Record<string, PackageOptionRow[]> = {};
        ((optData as PackageOptionRow[]) || []).forEach((o) => {
          if (!map[o.package_id]) map[o.package_id] = [];
          map[o.package_id].push(o);
        });
        setOptionsByPackage(map);
      }
    } else {
      setOptionsByPackage({});
    }

    setLoading(false);
  };

  useEffect(() => {
    void fetchPackages();
  }, []);

  const savePackage = async (): Promise<void> => {
    if (!pkgTitle.trim()) {
      showToast("Title is required.");
      return;
    }

    setSaving(true);

    try {
      const userRes = await supabase.auth.getUser();
      const uid = userRes.data.user?.id;

      if (!uid) {
        showToast("Not logged in.");
        return;
      }

      const payload = {
        admin_id: uid,
        area: pkgArea,
        title: pkgTitle.trim(),
        description: pkgDesc.trim() ? pkgDesc.trim() : null,
        amenities: pkgAmenities.trim() ? pkgAmenities.trim() : null,
        is_active: !!pkgActive,
      };

      if (!activePackage) {
        const { data, error } = await supabase
          .from("packages")
          .insert(payload)
          .select("*")
          .single();

        if (error || !data) {
          showToast(`Create failed: ${error?.message ?? "Unknown error"}`);
          return;
        }

        showToast("Package created.");
      } else {
        const { data, error } = await supabase
          .from("packages")
          .update({
            area: payload.area,
            title: payload.title,
            description: payload.description,
            amenities: payload.amenities,
            is_active: payload.is_active,
          })
          .eq("id", activePackage.id)
          .select("*")
          .single();

        if (error || !data) {
          showToast(`Update failed: ${error?.message ?? "Unknown error"}`);
          return;
        }

        showToast("Package updated.");
      }

      setOpenPackageModal(false);
      setActivePackage(null);
      resetPackageForm();
      await fetchPackages();
    } finally {
      setSaving(false);
    }
  };

  const deletePackage = async (p: PackageRow): Promise<void> => {
    const ok = window.confirm(`Delete package?\n\n${p.title}\n(${p.area})`);
    if (!ok) return;

    setDeletingId(p.id);

    try {
      const { error } = await supabase.from("packages").delete().eq("id", p.id);

      if (error) {
        showToast(`Delete failed: ${error.message}`);
        return;
      }

      showToast("Package deleted.");

      setPackages((prev) => prev.filter((x) => x.id !== p.id));
      setOptionsByPackage((prev) => {
        const copy = { ...prev };
        delete copy[p.id];
        return copy;
      });

      if (activePackage?.id === p.id) {
        setActivePackage(null);
        setOpenOptionsModal(false);
      }
    } finally {
      setDeletingId(null);
    }
  };

  const saveOption = async (): Promise<void> => {
    if (!activePackage) {
      showToast("No package selected.");
      return;
    }

    if (!optName.trim()) {
      showToast("Option name is required.");
      return;
    }

    if (!Number.isFinite(optDurationValue) || optDurationValue <= 0) {
      showToast("Duration value must be > 0.");
      return;
    }

    if (!Number.isFinite(optPrice) || optPrice < 0) {
      showToast("Price must be >= 0.");
      return;
    }

    const promoMaxAttempts = clampInt(optPromoMaxAttempts, 1, 9999);
    const promoValidityDays = clampInt(optPromoValidityDays, 1, 3650);

    setSaving(true);

    try {
      const payload = {
        package_id: activePackage.id,
        option_name: optName.trim(),
        duration_value: Math.floor(optDurationValue),
        duration_unit: optDurationUnit,
        price: Number(optPrice),
        promo_max_attempts: promoMaxAttempts,
        promo_validity_days: promoValidityDays,
      };

      if (!editingOption) {
        const { data, error } = await supabase
          .from("package_options")
          .insert(payload)
          .select("*")
          .single();

        if (error || !data) {
          showToast(`Add option failed: ${error?.message ?? "Unknown error"}`);
          return;
        }

        showToast("Option added.");
      } else {
        const { data, error } = await supabase
          .from("package_options")
          .update(payload)
          .eq("id", editingOption.id)
          .select("*")
          .single();

        if (error || !data) {
          showToast(`Update option failed: ${error?.message ?? "Unknown error"}`);
          return;
        }

        showToast("Option updated.");
      }

      resetOptionForm();
      await fetchOptionsForPackage(activePackage.id);
      await fetchPackages();
    } finally {
      setSaving(false);
    }
  };

  const deleteOption = async (o: PackageOptionRow): Promise<void> => {
    const ok = window.confirm(`Delete option?\n\n${o.option_name}`);
    if (!ok) return;

    setDeletingId(o.id);

    try {
      const { error } = await supabase.from("package_options").delete().eq("id", o.id);

      if (error) {
        showToast(`Delete option failed: ${error.message}`);
        return;
      }

      showToast("Option deleted.");

      if (activePackage) await fetchOptionsForPackage(activePackage.id);
      await fetchPackages();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="adpkg-page">
      <div className="customer-lists-container adminpkg adminpkg__wrap">
        <div className="customer-topbar adminpkg__topbar">
          <div className="customer-topbar-left">
            <h2 className="customer-lists-title">Packages</h2>
            <div className="customer-subtext">
              Total packages: <strong>{packages.length}</strong>
            </div>
          </div>

          <div className="customer-topbar-right adminpkg__topActions">
            <button className="receipt-btn" onClick={openCreatePackage} type="button">
              <span style={{ marginLeft: 2 }}>＋ New Package</span>
            </button>

            <button className="receipt-btn" onClick={() => void fetchPackages()} type="button">
              <span style={{ marginLeft: 2 }}>Refresh</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="adminpkg__loading">
            <div className="adminpkg__spinner" />
            <p className="customer-note" style={{ marginTop: 10 }}>
              Loading packages...
            </p>
          </div>
        ) : packages.length === 0 ? (
          <p className="customer-note">No packages yet. Click “New Package”.</p>
        ) : (
          <div className="adminpkg__grid">
            {packages.map((p) => {
              const opts = optionsByPackage[p.id] || [];

              return (
                <div className="adminpkg__gridItem" key={p.id}>
                  <div className="adminpkg__card adminpkg__fadeIn">
                    <div className="adminpkg__cardHead">
                      <div className="adminpkg__cardTitle">
                        <span className="adminpkg__titleText">{p.title}</span>
                        <span
                          className={`adpkg-badge ${
                            p.is_active ? "adpkg-badge--active" : "adpkg-badge--inactive"
                          }`}
                        >
                          {p.is_active ? "ACTIVE" : "INACTIVE"}
                        </span>
                      </div>

                      <div className="adminpkg__chips">
                        <span className="adpkg-chip">{formatArea(p.area)}</span>
                        <span className="adpkg-chip">
                          {opts.length} option{opts.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>

                    <div className="adminpkg__cardBody">
                      {p.description ? <p className="adminpkg__desc">{p.description}</p> : null}

                      {p.amenities ? (
                        <div className="adminpkg__amenities">
                          <strong>AMENITIES</strong>
                          <ul className="adminpkg__amenityList">
                            {p.amenities
                              .split("\n")
                              .map((line) => line.replace("•", "").trim())
                              .filter(Boolean)
                              .map((line, idx) => (
                                <li key={idx}>{line}</li>
                              ))}
                          </ul>
                        </div>
                      ) : null}

                      {opts.length > 0 ? (
                        <div className="adminpkg__options">
                          <strong>OPTIONS</strong>

                          <div className="adminpkg__optionGrid">
                            {opts.slice(0, 6).map((o) => {
                              const attempts = clampInt(toNum(o.promo_max_attempts), 1, 9999);
                              const validity = clampInt(toNum(o.promo_validity_days), 1, 3650);

                              return (
                                <div className="adminpkg__optionRow" key={o.id}>
                                  <div className="adminpkg__optionLeft">
                                    <strong>{o.option_name}</strong>
                                    <small className="adminpkg__muted">
                                      {formatDuration(Number(o.duration_value), o.duration_unit)} • ₱
                                      {toNum(o.price).toFixed(2)}
                                    </small>
                                    <small className="adminpkg__muted">
                                      Promo Attempts: {attempts} • Promo Validity: {validity} day(s)
                                    </small>
                                  </div>
                                </div>
                              );
                            })}

                            {opts.length > 6 ? (
                              <p className="adminpkg__muted" style={{ marginTop: 8 }}>
                                +{opts.length - 6} more…
                              </p>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <p className="adminpkg__muted" style={{ marginTop: 10 }}>
                          No options yet. Add options.
                        </p>
                      )}

                      <div className="adminpkg__actions">
                        <button className="receipt-btn" onClick={() => openEditPackage(p)} type="button">
                          Edit
                        </button>

                        <button className="receipt-btn" onClick={() => void openManageOptions(p)} type="button">
                          Manage Options
                        </button>

                        <button
                          className="receipt-btn adminpkg__dangerBtn"
                          disabled={deletingId === p.id}
                          onClick={() => void deletePackage(p)}
                          type="button"
                        >
                          {deletingId === p.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Modal
          open={openPackageModal}
          onClose={() => setOpenPackageModal(false)}
          title={activePackage ? "Edit Package" : "New Package"}
          size="md"
        >
          <div className="adminpkg__modalWrap">
            <div className="adminpkg__list">
              <div className="adpkg-field">
                <label>Area</label>
                <select value={pkgArea} onChange={(e) => setPkgArea(e.target.value as PackageArea)}>
                  <option value="common_area">Common Area</option>
                  <option value="conference_room">Conference Room</option>
                </select>
              </div>

              <div className="adpkg-field">
                <label>Title</label>
                <input value={pkgTitle} onChange={(e) => setPkgTitle(e.target.value)} />
              </div>

              <div className="adpkg-field">
                <label>Description (optional)</label>
                <textarea value={pkgDesc} onChange={(e) => setPkgDesc(e.target.value)} rows={4} />
              </div>

              <div className="adpkg-field">
                <label>AMENITIES (optional)</label>
                <textarea
                  placeholder={`Example:\n• Free Wi-Fi\n• Unlimited coffee\n• Printing services available`}
                  value={pkgAmenities}
                  onChange={(e) => setPkgAmenities(e.target.value)}
                  rows={6}
                />
              </div>

              <div className="adpkg-field">
                <label>Active?</label>
                <select
                  value={pkgActive ? "yes" : "no"}
                  onChange={(e) => setPkgActive(e.target.value === "yes")}
                >
                  <option value="yes">Active</option>
                  <option value="no">Inactive</option>
                </select>
              </div>
            </div>

            <div className="adminpkg__modalActions">
              <button className="receipt-btn" disabled={saving} onClick={() => void savePackage()} type="button">
                {saving ? "Saving..." : "Save"}
              </button>

              <button
                className="receipt-btn adpkg-btn-outline"
                onClick={() => {
                  setOpenPackageModal(false);
                  setActivePackage(null);
                }}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>

        <Modal
          open={openOptionsModal}
          onClose={() => setOpenOptionsModal(false)}
          title={`Options — ${activePackage?.title ?? ""}`}
          size="lg"
        >
          <div className="adminpkg__modalWrap">
            {!activePackage ? (
              <p className="customer-note">No package selected.</p>
            ) : (
              <>
                <div className="adminpkg__card adminpkg__fadeIn">
                  <div className="adminpkg__cardHead">
                    <div className="adminpkg__cardTitle">
                      <span className="adminpkg__titleText">
                        {editingOption ? "Edit Option" : "Add Option"}
                      </span>
                    </div>
                  </div>

                  <div className="adminpkg__cardBody">
                    <div className="adminpkg__list">
                      <div className="adpkg-field">
                        <label>Option Name</label>
                        <input value={optName} onChange={(e) => setOptName(e.target.value)} />
                      </div>

                      <div className="adpkg-two-col">
                        <div className="adpkg-field">
                          <label>Duration Value</label>
                          <input
                            type="number"
                            value={String(optDurationValue)}
                            onChange={(e) => setOptDurationValue(Number(e.target.value || 1))}
                          />
                        </div>

                        <div className="adpkg-field">
                          <label>Duration Unit</label>
                          <select
                            value={optDurationUnit}
                            onChange={(e) => setOptDurationUnit(e.target.value as DurationUnit)}
                          >
                            <option value="hour">Hour(s)</option>
                            <option value="day">Day(s)</option>
                            <option value="month">Month(s)</option>
                            <option value="year">Year(s)</option>
                          </select>
                        </div>
                      </div>

                      <div className="adpkg-two-col">
                        <div className="adpkg-field">
                          <label>Price (PHP)</label>
                          <input
                            type="number"
                            value={String(optPrice)}
                            onChange={(e) => setOptPrice(Number(e.target.value || 0))}
                          />
                        </div>

                        <div className="adpkg-field">
                          <label>Promo Max Attempts (attendance IN)</label>
                          <input
                            type="number"
                            value={String(optPromoMaxAttempts)}
                            onChange={(e) =>
                              setOptPromoMaxAttempts(clampInt(Number(e.target.value || 7), 1, 9999))
                            }
                          />
                        </div>
                      </div>

                      <div className="adpkg-field">
                        <label>Promo Validity Days</label>
                        <input
                          type="number"
                          value={String(optPromoValidityDays)}
                          onChange={(e) =>
                            setOptPromoValidityDays(clampInt(Number(e.target.value || 14), 1, 3650))
                          }
                        />
                      </div>
                    </div>

                    <div className="adminpkg__optionActions">
                      <button className="receipt-btn" disabled={saving} onClick={() => void saveOption()} type="button">
                        {saving ? "Saving..." : editingOption ? "Update Option" : "Add Option"}
                      </button>

                      <button className="receipt-btn adpkg-btn-outline" onClick={resetOptionForm} type="button">
                        Clear
                      </button>
                    </div>
                  </div>
                </div>

                <div className="adminpkg__savedWrap">
                  <div className="adminpkg__savedTitle">Saved Options</div>

                  {selectedOptions.length === 0 ? (
                    <div className="adpkg-emptyRow">No options yet.</div>
                  ) : (
                    <div className="adpkg-optionList">
                      {selectedOptions.map((o) => {
                        const attempts = clampInt(toNum(o.promo_max_attempts), 1, 9999);
                        const validity = clampInt(toNum(o.promo_validity_days), 1, 3650);

                        return (
                          <div className="adpkg-optionItem" key={o.id}>
                            <div className="adpkg-optionInfo">
                              <strong>{o.option_name}</strong>
                              <div className="adminpkg__muted" style={{ fontSize: 12 }}>
                                {formatDuration(Number(o.duration_value), o.duration_unit)} • ₱
                                {toNum(o.price).toFixed(2)}
                              </div>
                              <div className="adminpkg__muted" style={{ fontSize: 12 }}>
                                Promo Attempts: {attempts} • Promo Validity: {validity} day(s)
                              </div>
                            </div>

                            <div className="adpkg-optionBtns">
                              <button
                                className="receipt-btn adpkg-btn-outline"
                                onClick={() => openEditOption(o)}
                                type="button"
                              >
                                Edit
                              </button>

                              <button
                                className="receipt-btn adminpkg__dangerBtn"
                                disabled={deletingId === o.id}
                                onClick={() => void deleteOption(o)}
                                type="button"
                              >
                                {deletingId === o.id ? "..." : "Delete"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </Modal>

        {toastOpen && (
          <div className="adpkg-toast" role="status" aria-live="polite">
            {toastMsg}
          </div>
        )}
      </div>
    </div>
  );
};

export default Admin_Packages;