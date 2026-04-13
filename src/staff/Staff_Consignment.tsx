import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../utils/supabaseClient";
import "../styles/Staff_Consignment.css";

type Profile = { role: string };

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

const normalizeSize = (v: string): string => v.trim();
const normalizeText = (v: string): string => v.trim().replace(/\s+/g, " ");

type CategoryRow = { id: string };

type ConsignmentSuggestRow = {
  full_name: string | null;
  category: string | null;
};

type ToastState = {
  open: boolean;
  message: string;
  tone: "success" | "error";
};

const Staff_Consignment: React.FC = () => {
  const [fullName, setFullName] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [itemName, setItemName] = useState<string>("");
  const [size, setSize] = useState<AddOnSize>("None");

  const [restocked, setRestocked] = useState<number | "">("");
  const [price, setPrice] = useState<number | "">("");
  const [imageFile, setImageFile] = useState<File | null>(null);

  const [toast, setToast] = useState<ToastState>({
    open: false,
    message: "",
    tone: "success",
  });

  const [allFullNames, setAllFullNames] = useState<string[]>([]);
  const [allCategories, setAllCategories] = useState<string[]>([]);

  const [fullOpen, setFullOpen] = useState<boolean>(false);
  const [catOpen, setCatOpen] = useState<boolean>(false);

  const [consignmentCategoryId, setConsignmentCategoryId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const fullWrapRef = useRef<HTMLDivElement | null>(null);
  const catWrapRef = useRef<HTMLDivElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = (message: string, tone: "success" | "error" = "success"): void => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast({ open: true, message, tone });
    toastTimerRef.current = window.setTimeout(() => {
      setToast((prev) => ({ ...prev, open: false }));
    }, 2200);
  };

  useEffect(() => {
    const loadPrereqs = async (): Promise<void> => {
      const { data: catRow, error: catErr } = await supabase
        .from("addon_categories")
        .select("id")
        .ilike("name", "Consignment")
        .limit(1);

      if (catErr) {
        console.error("Load addon_categories error:", catErr);
        showToast("Failed to load addon_categories.", "error");
      } else {
        const id: string | null = (catRow?.[0] as CategoryRow | undefined)?.id ?? null;
        setConsignmentCategoryId(id);
      }

      const { data, error } = await supabase
        .from("consignment")
        .select("full_name, category");

      if (error) {
        console.error("Load suggestions error:", error);
        return;
      }

      const rows: ConsignmentSuggestRow[] = (data ?? []) as ConsignmentSuggestRow[];

      const uniqFull: string[] = Array.from(
        new Set(
          rows
            .map((r) => normalizeText(r.full_name ?? ""))
            .filter((v) => v.length > 0)
        )
      ).sort((a, b) => a.localeCompare(b));

      const uniqCat: string[] = Array.from(
        new Set(
          rows
            .map((r) => normalizeText(r.category ?? ""))
            .filter((v) => v.length > 0)
        )
      ).sort((a, b) => a.localeCompare(b));

      setAllFullNames(uniqFull);
      setAllCategories(uniqCat);
    };

    void loadPrereqs();

    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent): void => {
      const target = e.target as Node;

      if (fullWrapRef.current && !fullWrapRef.current.contains(target)) {
        setFullOpen(false);
      }

      if (catWrapRef.current && !catWrapRef.current.contains(target)) {
        setCatOpen(false);
      }
    };

    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const shownFullNames = useMemo(() => allFullNames.slice(0, 30), [allFullNames]);
  const shownCategories = useMemo(() => allCategories.slice(0, 30), [allCategories]);

  const handlePickFullName = (picked: string): void => {
    setFullName(picked);
    setFullOpen(false);
  };

  const handlePickCategory = (picked: string): void => {
    setCategory(picked);
    setCatOpen(false);
  };

  const handleSubmit = async (): Promise<void> => {
    const fullNameFinal = normalizeText(fullName);
    const categoryFinal = normalizeText(category);
    const itemNameFinal = normalizeText(itemName);

    if (
      !fullNameFinal ||
      !categoryFinal ||
      !itemNameFinal ||
      restocked === "" ||
      price === ""
    ) {
      showToast("Please fill in all required fields!", "error");
      return;
    }

    if (!consignmentCategoryId) {
      showToast(
        "Consignment category not found. Add 'Consignment' in addon_categories first.",
        "error"
      );
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

      const role = (profile?.role ?? "").toLowerCase();
      if (role !== "admin" && role !== "staff") {
        throw new Error("Admin/Staff only");
      }

      let imageUrl: string | null = null;

      if (imageFile) {
        const extRaw: string | undefined = imageFile.name.split(".").pop();
        const fileExt: string = (extRaw ? extRaw.toLowerCase() : "jpg").trim();
        const fileName: string = `${Date.now()}.${fileExt}`;
        const filePath: string = `${userId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("consignment")
          .upload(filePath, imageFile, {
            contentType: imageFile.type,
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from("consignment")
          .getPublicUrl(filePath);

        imageUrl = urlData.publicUrl;
      }

      const sizeFinal = normalizeSize(size);
      const sizeDb: string | null = sizeFinal === "None" ? null : sizeFinal;

      const { error: insertConsErr } = await supabase.from("consignment").insert([
        {
          created_by: userId,
          category_id: consignmentCategoryId,
          full_name: fullNameFinal,
          category: categoryFinal,
          item_name: itemNameFinal,
          size: sizeDb,
          restocked: Number(restocked),
          price: Number(price),
          image_url: imageUrl,
          approval_status: "pending",
        },
      ]);

      if (insertConsErr) throw insertConsErr;

      setAllFullNames((prev) => {
        if (prev.some((n) => n.toLowerCase() === fullNameFinal.toLowerCase())) return prev;
        return [...prev, fullNameFinal].sort((a, b) => a.localeCompare(b));
      });

      setAllCategories((prev) => {
        if (prev.some((c) => c.toLowerCase() === categoryFinal.toLowerCase())) return prev;
        return [...prev, categoryFinal].sort((a, b) => a.localeCompare(b));
      });

      setFullName("");
      setCategory("");
      setItemName("");
      setSize("None");
      setRestocked("");
      setPrice("");
      setImageFile(null);
      setFullOpen(false);
      setCatOpen(false);

      showToast("Consignment item submitted for admin approval!", "success");
    } catch (err: unknown) {
      console.error(err);
      showToast(err instanceof Error ? err.message : "Unexpected error occurred", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const fileLabel = imageFile ? imageFile.name : "Choose image (optional)";

  return (
    <div className="staff-cons-page">
      <div className="staff-cons-wrap">
        <div className="staff-cons-card">
          <div className="staff-cons-card-head">
            <div>
              <div className="staff-cons-card-title">Add Consignment Item</div>
              <div className="staff-cons-card-sub">
                Fill the details below to add a consignment product.
              </div>
            </div>
          </div>

          <div className="staff-cons-grid">
            <div className="staff-cons-col">
              <div className="staff-cons-field-block" ref={fullWrapRef}>
                <label className="staff-cons-label">
                  Full Name <span className="staff-cons-req">*</span>
                </label>

                <div className="staff-cons-input-wrap">
                  <input
                    className="staff-cons-input"
                    value={fullName}
                    placeholder="Tap to choose full name"
                    onChange={(e) => setFullName(e.target.value)}
                    onFocus={() => setFullOpen(false)}
                  />
                  <button
                    type="button"
                    className="staff-cons-dropbtn"
                    onClick={() => setFullOpen((prev) => !prev)}
                    aria-label="Open full name suggestions"
                  >
                    ▼
                  </button>
                </div>

                {fullOpen && (
                  <div className="staff-cons-popover">
                    <div className="staff-cons-popover-hint">Suggestions (tap to select)</div>
                    <div className="staff-cons-popover-scroll">
                      {shownFullNames.map((n) => (
                        <button
                          type="button"
                          key={n}
                          className="staff-cons-popover-item"
                          onClick={() => handlePickFullName(n)}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="staff-cons-field-block" ref={catWrapRef}>
                <label className="staff-cons-label">
                  Category <span className="staff-cons-req">*</span>
                </label>

                <div className="staff-cons-input-wrap">
                  <input
                    className="staff-cons-input"
                    value={category}
                    placeholder="Tap to choose category"
                    onChange={(e) => setCategory(e.target.value)}
                    onFocus={() => setCatOpen(false)}
                  />
                  <button
                    type="button"
                    className="staff-cons-dropbtn"
                    onClick={() => setCatOpen((prev) => !prev)}
                    aria-label="Open category suggestions"
                  >
                    ▼
                  </button>
                </div>

                {catOpen && (
                  <div className="staff-cons-popover">
                    <div className="staff-cons-popover-hint">Suggestions (tap to select)</div>
                    <div className="staff-cons-popover-scroll">
                      {shownCategories.map((n) => (
                        <button
                          type="button"
                          key={n}
                          className="staff-cons-popover-item"
                          onClick={() => handlePickCategory(n)}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="staff-cons-field-block">
                <label className="staff-cons-label">
                  Size <span className="staff-cons-opt">(optional)</span>
                </label>

                <select
                  className="staff-cons-input"
                  value={size}
                  onChange={(e) => setSize(e.target.value as AddOnSize)}
                >
                  {SIZE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>

                <div className="staff-cons-help">
                  Choose size if applicable. If not, keep None.
                </div>
              </div>

              <div className="staff-cons-field-block">
                <label className="staff-cons-label">
                  Item Name <span className="staff-cons-req">*</span>
                </label>
                <input
                  className="staff-cons-input"
                  value={itemName}
                  placeholder="Example: Nike Shoes"
                  onChange={(e) => setItemName(e.target.value)}
                />
              </div>

              <div className="staff-cons-field-block">
                <label className="staff-cons-label">Image</label>

                <label className="staff-cons-file">
                  <span className="staff-cons-file-icon">🖼</span>
                  <span className="staff-cons-file-text">{fileLabel}</span>
                  <input
                    className="staff-cons-file-input"
                    type="file"
                    accept="image/*"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const fileList: FileList | null = e.target.files;
                      setImageFile(fileList && fileList.length > 0 ? fileList[0] : null);
                    }}
                  />
                </label>

                <div className="staff-cons-help">
                  Tip: image is optional. You can add later too.
                </div>
              </div>
            </div>

            <div className="staff-cons-col">
              <div className="staff-cons-side-card">
                <div className="staff-cons-side-title">Pricing & Stock</div>
                <div className="staff-cons-side-sub">Set quantity and price here.</div>

                <div className="staff-cons-field-block staff-cons-field-block--compact">
                  <label className="staff-cons-label">
                    Restocked Quantity <span className="staff-cons-req">*</span>
                  </label>
                  <input
                    className="staff-cons-input"
                    inputMode="numeric"
                    type="number"
                    value={restocked}
                    placeholder="e.g. 50"
                    onChange={(e) => {
                      const v = e.target.value;
                      setRestocked(v === "" ? "" : Number(v));
                    }}
                  />
                </div>

                <div className="staff-cons-field-block staff-cons-field-block--compact">
                  <label className="staff-cons-label">
                    Price <span className="staff-cons-req">*</span>
                  </label>
                  <input
                    className="staff-cons-input"
                    inputMode="decimal"
                    type="number"
                    value={price}
                    placeholder="e.g. 25"
                    onChange={(e) => {
                      const v = e.target.value;
                      setPrice(v === "" ? "" : Number(v));
                    }}
                  />
                </div>

                <button
                  type="button"
                  className="staff-cons-submit-btn"
                  onClick={() => void handleSubmit()}
                  disabled={submitting}
                >
                  {submitting ? "Submitting..." : "Submit for Approval"}
                </button>

                <div className="staff-cons-footnote">
                  Item will only display after admin approval.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {toast.open && (
        <div
          className={`staff-cons-toast ${
            toast.tone === "error" ? "staff-cons-toast--error" : ""
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default Staff_Consignment;