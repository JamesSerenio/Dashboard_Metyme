import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../utils/supabaseClient";
import "../styles/Admin_Add_Ons.css";

type Profile = { role: string };

const normalizeCategory = (v: string): string =>
  v.trim().replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const normalizeSize = (v: string): string => v.trim();

type AddOnSize =
  | "None"
  | "XS"
  | "S"
  | "M"
  | "L"
  | "XL"
  | "2XL"
  | "3XL"
  | "4XL"
  | "5XL";

const SIZE_OPTIONS: AddOnSize[] = [
  "None",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "2XL",
  "3XL",
  "4XL",
  "5XL",
];

const Admin_Add_Ons: React.FC = () => {
  const [category, setCategory] = useState<string>("");
  const [size, setSize] = useState<AddOnSize>("None");
  const [name, setName] = useState<string>("");

  const [restocked, setRestocked] = useState<number | undefined>(undefined);
  const [price, setPrice] = useState<number | undefined>(undefined);
  const [imageFile, setImageFile] = useState<File | null>(null);

  const [showToast, setShowToast] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string>("");

  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [catOpen, setCatOpen] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const categoryWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const loadCategories = async (): Promise<void> => {
      const { data, error } = await supabase
        .from("add_ons")
        .select("category")
        .not("category", "is", null);

      if (error) {
        console.error("Load categories error:", error);
        return;
      }

      const unique: string[] = Array.from(
        new Set(
          (data ?? [])
            .map((r: { category?: string | null }) => (r.category ?? "").trim())
            .filter((c) => c.length > 0)
        )
      ).sort((a, b) => a.localeCompare(b));

      setAllCategories(unique);
    };

    void loadCategories();
  }, []);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent): void => {
      if (
        categoryWrapRef.current &&
        !categoryWrapRef.current.contains(event.target as Node)
      ) {
        setCatOpen(false);
      }
    };

    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (!showToast) return;

    const id = window.setTimeout(() => {
      setShowToast(false);
    }, 2200);

    return () => window.clearTimeout(id);
  }, [showToast]);

  const shownCats = useMemo(() => allCategories.slice(0, 30), [allCategories]);

  const handlePickCategory = (picked: string): void => {
    setCategory(picked);
    setCatOpen(false);
  };

  const handleAddOnSubmit = async (): Promise<void> => {
    if (submitting) return;

    if (!category || !name || restocked === undefined || price === undefined) {
      setToastMessage("Please fill in all required fields!");
      setShowToast(true);
      return;
    }

    try {
      setSubmitting(true);

      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      if (!userRes?.user) throw new Error("Not logged in");

      const userId: string = userRes.user.id;

      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single<Profile>();

      if (profErr) throw profErr;
      if (!profile || profile.role !== "admin") throw new Error("Admin only");

      let imageUrl: string | null = null;

      if (imageFile) {
        const extRaw: string | undefined = imageFile.name.split(".").pop();
        const fileExt: string = (extRaw ? extRaw.toLowerCase() : "jpg").trim();
        const fileName: string = `${Date.now()}.${fileExt}`;
        const filePath: string = `${userId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("add-ons")
          .upload(filePath, imageFile, {
            contentType: imageFile.type,
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from("add-ons")
          .getPublicUrl(filePath);

        imageUrl = urlData.publicUrl;
      }

      const categoryFinal = normalizeCategory(category);
      const sizeFinal = normalizeSize(size);
      const sizeDb: string | null = sizeFinal === "None" ? null : sizeFinal;

      const { error: insertErr } = await supabase.from("add_ons").insert([
        {
          admin_id: userId,
          category: categoryFinal,
          size: sizeDb,
          name: name.trim(),
          restocked,
          price,
          image_url: imageUrl,
        },
      ]);

      if (insertErr) throw insertErr;

      setAllCategories((prev) => {
        if (prev.some((c) => c.toLowerCase() === categoryFinal.toLowerCase())) {
          return prev;
        }
        return [...prev, categoryFinal].sort((a, b) => a.localeCompare(b));
      });

      setCategory("");
      setSize("None");
      setName("");
      setRestocked(undefined);
      setPrice(undefined);
      setImageFile(null);
      setCatOpen(false);

      setToastMessage("Add-on added successfully!");
      setShowToast(true);
    } catch (err: unknown) {
      console.error(err);
      setToastMessage(
        err instanceof Error ? err.message : "Unexpected error occurred"
      );
      setShowToast(true);
    } finally {
      setSubmitting(false);
    }
  };

  const fileLabel = imageFile ? imageFile.name : "Choose image (optional)";

  return (
    <div className="aao-page">
      <div className="aao-bg-orb aao-bg-orb-1" />
      <div className="aao-bg-orb aao-bg-orb-2" />
      <div className="aao-bg-grid" />

      <div className="aao-wrap">
        <div className="aao-top-banner">

          <div className="aao-top-copy">
            <h1>Add New Add-On</h1>
            <p>
              Create a polished add-on record with category, size, stock,
              pricing, and optional image.
            </p>
          </div>
        </div>

        <div className="aao-card">
          <div className="aao-card-head">
            <div className="aao-card-head-copy">
              <div className="aao-card-title">Product Information</div>
              <div className="aao-card-sub">
                Fill the details below to add a new add-on item into your
                inventory.
              </div>
            </div>

            <div className="aao-card-chip">
              <span className="aao-chip-icon">◈</span>
              <span>Inventory Form</span>
            </div>
          </div>

          <div className="aao-grid">
            <div className="aao-col aao-col-left">
              <div className="aao-section-tag">
                <span className="aao-section-icon">◌</span>
                <span>Basic Details</span>
              </div>

              <div className="aao-item">
                <label className="aao-label">
                  Category <span className="aao-req">*</span>
                </label>

                <div className="aao-category-wrap" ref={categoryWrapRef}>
                  <div className="aao-field aao-field--withIcon">
                    <input
                      className="aao-input"
                      value={category}
                      placeholder="Tap to choose category"
                      onChange={(e) => setCategory(e.target.value)}
                      onFocus={() => setCatOpen(false)}
                    />

                    <button
                      type="button"
                      className="aao-dropbtn"
                      aria-label="Open category suggestions"
                      onClick={(e) => {
                        e.preventDefault();
                        setCatOpen((prev) => !prev);
                      }}
                    >
                      <span className="aao-field-icon aao-field-icon--click">
                        ▾
                      </span>
                    </button>
                  </div>

                  {catOpen && (
                    <div className="aao-popover">
                      <div className="aao-popover-content">
                        <div className="aao-popover-hint">
                          Suggestions (tap to select)
                        </div>

                        <div className="aao-popover-scroll">
                          <div className="aao-popover-list">
                            {shownCats.length > 0 ? (
                              shownCats.map((c) => (
                                <button
                                  key={c}
                                  type="button"
                                  className="aao-popover-item"
                                  onClick={() => handlePickCategory(c)}
                                >
                                  <span className="aao-popover-label">{c}</span>
                                </button>
                              ))
                            ) : (
                              <div className="aao-popover-empty">
                                No categories yet
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="aao-item">
                <label className="aao-label">
                  Size <span className="aao-opt">(optional)</span>
                </label>

                <div className="aao-field">
                  <select
                    className="aao-input aao-select"
                    value={size}
                    onChange={(e) => setSize(e.target.value as AddOnSize)}
                  >
                    {SIZE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="aao-help">
                  Choose size if applicable. If not, keep it as None.
                </div>
              </div>

              <div className="aao-item">
                <label className="aao-label">
                  Item Name <span className="aao-req">*</span>
                </label>

                <div className="aao-field">
                  <input
                    className="aao-input"
                    value={name}
                    placeholder="Example: Choco Syrup"
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              </div>

              <div className="aao-item">
                <label className="aao-label">Image</label>

                <label className="aao-file">
                  <div className="aao-file-icon-wrap">
                    <span className="aao-file-icon">🖼</span>
                  </div>

                  <div className="aao-file-meta">
                    <span className="aao-file-title">Upload Product Image</span>
                    <span className="aao-file-text">{fileLabel}</span>
                  </div>

                  <input
                    className="aao-file-input"
                    type="file"
                    accept="image/*"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const fileList: FileList | null = e.target.files;
                      setImageFile(
                        fileList && fileList.length > 0 ? fileList[0] : null
                      );
                    }}
                  />
                </label>

                <div className="aao-help">
                  Tip: image is optional. You can upload one later too.
                </div>
              </div>
            </div>

            <div className="aao-col aao-col-right">
              <div className="aao-rightCard">
                <div className="aao-section-tag aao-section-tag--right">
                  <span className="aao-section-icon">⌁</span>
                  <span>Pricing & Stock</span>
                </div>

                <div className="aao-rightTitle">Stock Configuration</div>
                <div className="aao-rightSub">
                  Set item quantity and pricing before saving this add-on.
                </div>

                <div className="aao-item aao-item-compact">
                  <label className="aao-label">
                    Restocked Quantity <span className="aao-req">*</span>
                  </label>

                  <div className="aao-field">
                    <input
                      className="aao-input"
                      inputMode="numeric"
                      type="number"
                      value={restocked ?? ""}
                      placeholder="e.g. 50"
                      onChange={(e) => {
                        const v = e.target.value;
                        setRestocked(v === "" ? undefined : Number(v));
                      }}
                    />
                  </div>
                </div>

                <div className="aao-item aao-item-compact">
                  <label className="aao-label">
                    Price <span className="aao-req">*</span>
                  </label>

                  <div className="aao-field">
                    <input
                      className="aao-input"
                      inputMode="decimal"
                      type="number"
                      value={price ?? ""}
                      placeholder="e.g. 25"
                      onChange={(e) => {
                        const v = e.target.value;
                        setPrice(v === "" ? undefined : Number(v));
                      }}
                    />
                  </div>
                </div>

                <div className="aao-preview-box">
                  <div className="aao-preview-label">Quick Preview</div>

                  <div className="aao-preview-row">
                    <span>Category</span>
                    <strong>{category || "—"}</strong>
                  </div>

                  <div className="aao-preview-row">
                    <span>Size</span>
                    <strong>{size || "None"}</strong>
                  </div>

                  <div className="aao-preview-row">
                    <span>Name</span>
                    <strong>{name || "—"}</strong>
                  </div>

                  <div className="aao-preview-row">
                    <span>Stock</span>
                    <strong>{restocked ?? "—"}</strong>
                  </div>

                  <div className="aao-preview-row">
                    <span>Price</span>
                    <strong>{price ?? "—"}</strong>
                  </div>
                </div>

                <button
                  type="button"
                  className="aao-btn aao-btn--primary aao-btn-right"
                  onClick={handleAddOnSubmit}
                  disabled={submitting}
                >
                  <span className="aao-btn-icon">＋</span>
                  <span>{submitting ? "Saving..." : "Add Add-On"}</span>
                </button>

                <div className="aao-footnote aao-footnote-right">
                  Tip: Category suggestions appear from your existing saved
                  add-ons.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showToast && (
        <div className="aao-toast">
          <div className="aao-toast-inner">{toastMessage}</div>
        </div>
      )}
    </div>
  );
};

export default Admin_Add_Ons;