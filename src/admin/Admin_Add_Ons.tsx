import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  IonPage,
  IonHeader,
  IonContent,
  IonItem,
  IonLabel,
  IonInput,
  IonButton,
  IonToast,
  IonPopover,
  IonList,
  IonText,
  IonIcon,
  IonSelect,
  IonSelectOption,
} from "@ionic/react";
import type { IonInputCustomEvent, InputChangeEventDetail } from "@ionic/core";
import {
  chevronDownOutline,
  imageOutline,
  addCircleOutline,
  pricetagOutline,
  layersOutline,
  cubeOutline,
  sparklesOutline,
} from "ionicons/icons";
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
  const [catEvent, setCatEvent] = useState<MouseEvent | undefined>(undefined);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const iconBtnRef = useRef<HTMLButtonElement | null>(null);

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

  const shownCats = useMemo(() => allCategories.slice(0, 30), [allCategories]);

  const closePopover = (): void => {
    setCatOpen(false);
    setCatEvent(undefined);
  };

  const onDropdownClick = (e: React.MouseEvent<HTMLButtonElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    setCatEvent(e.nativeEvent);
    setCatOpen(true);
  };

  const handlePickCategory = (picked: string): void => {
    setCategory(picked);
    requestAnimationFrame(() => closePopover());
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
      closePopover();

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
    <IonPage className="aao-page">
      <IonHeader className="aao-header"></IonHeader>

      <IonContent className="aao-content">
        <div className="aao-bg-orb aao-bg-orb-1" />
        <div className="aao-bg-orb aao-bg-orb-2" />
        <div className="aao-bg-grid" />

        <div className="aao-wrap">
          <div className="aao-top-banner">
            <div className="aao-top-badge">
              <IonIcon icon={sparklesOutline} />
              <span>Premium Workspace</span>
            </div>

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
                <IonIcon icon={layersOutline} />
                <span>Inventory Form</span>
              </div>
            </div>

            <div className="aao-grid">
              <div className="aao-col aao-col-left">
                <div className="aao-section-tag">
                  <IonIcon icon={cubeOutline} />
                  <span>Basic Details</span>
                </div>

                <IonItem className="aao-item" lines="none">
                  <IonLabel position="stacked" className="aao-label">
                    Category <span className="aao-req">*</span>
                  </IonLabel>

                  <div className="aao-field aao-field--withIcon">
                    <IonInput
                      className="aao-input"
                      value={category}
                      placeholder="Tap to choose category"
                      onIonInput={(
                        e: IonInputCustomEvent<InputChangeEventDetail>
                      ) => {
                        const v = (e.detail.value ?? "").toString();
                        setCategory(v);
                      }}
                      onIonFocus={() => {
                        if (catOpen) closePopover();
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />

                    <button
                      ref={iconBtnRef}
                      type="button"
                      className="aao-dropbtn"
                      aria-label="Open category suggestions"
                      onClick={onDropdownClick}
                    >
                      <IonIcon
                        className="aao-field-icon aao-field-icon--click"
                        icon={chevronDownOutline}
                      />
                    </button>
                  </div>
                </IonItem>

                <IonPopover
                  isOpen={catOpen}
                  event={catEvent}
                  onDidDismiss={closePopover}
                  side="bottom"
                  alignment="start"
                  className="aao-popover"
                  showBackdrop={false}
                >
                  <IonContent className="aao-popover-content">
                    <IonText className="aao-popover-hint">
                      Suggestions (tap to select)
                    </IonText>

                    <div className="aao-popover-scroll">
                      <IonList className="aao-popover-list">
                        {shownCats.length > 0 ? (
                          shownCats.map((c) => (
                            <IonItem
                              key={c}
                              button
                              className="aao-popover-item"
                              onClick={() => handlePickCategory(c)}
                            >
                              <IonLabel className="aao-popover-label">
                                {c}
                              </IonLabel>
                            </IonItem>
                          ))
                        ) : (
                          <div className="aao-popover-empty">
                            No categories yet
                          </div>
                        )}
                      </IonList>
                    </div>
                  </IonContent>
                </IonPopover>

                <IonItem className="aao-item" lines="none">
                  <IonLabel position="stacked" className="aao-label">
                    Size <span className="aao-opt">(optional)</span>
                  </IonLabel>

                  <div className="aao-field">
                    <IonSelect
                      className="aao-input"
                      value={size}
                      interface="popover"
                      placeholder="None"
                      onIonChange={(e) =>
                        setSize((e.detail.value ?? "None") as AddOnSize)
                      }
                    >
                      {SIZE_OPTIONS.map((opt) => (
                        <IonSelectOption key={opt} value={opt}>
                          {opt}
                        </IonSelectOption>
                      ))}
                    </IonSelect>
                  </div>

                  <div className="aao-help">
                    Choose size if applicable. If not, keep it as None.
                  </div>
                </IonItem>

                <IonItem className="aao-item" lines="none">
                  <IonLabel position="stacked" className="aao-label">
                    Item Name <span className="aao-req">*</span>
                  </IonLabel>

                  <div className="aao-field">
                    <IonInput
                      className="aao-input"
                      value={name}
                      placeholder="Example: Choco Syrup"
                      onIonChange={(e) =>
                        setName((e.detail.value ?? "").toString())
                      }
                    />
                  </div>
                </IonItem>

                <IonItem className="aao-item" lines="none">
                  <IonLabel position="stacked" className="aao-label">
                    Image
                  </IonLabel>

                  <label className="aao-file">
                    <div className="aao-file-icon-wrap">
                      <IonIcon icon={imageOutline} className="aao-file-icon" />
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
                </IonItem>
              </div>

              <div className="aao-col aao-col-right">
                <div className="aao-rightCard">
                  <div className="aao-section-tag aao-section-tag--right">
                    <IonIcon icon={pricetagOutline} />
                    <span>Pricing & Stock</span>
                  </div>

                  <div className="aao-rightTitle">Stock Configuration</div>
                  <div className="aao-rightSub">
                    Set item quantity and pricing before saving this add-on.
                  </div>

                  <IonItem className="aao-item aao-item-compact" lines="none">
                    <IonLabel position="stacked" className="aao-label">
                      Restocked Quantity <span className="aao-req">*</span>
                    </IonLabel>

                    <div className="aao-field">
                      <IonInput
                        className="aao-input"
                        inputMode="numeric"
                        type="number"
                        value={restocked}
                        placeholder="e.g. 50"
                        onIonChange={(e) => {
                          const v: string = (e.detail.value ?? "").toString();
                          setRestocked(v === "" ? undefined : Number(v));
                        }}
                      />
                    </div>
                  </IonItem>

                  <IonItem className="aao-item aao-item-compact" lines="none">
                    <IonLabel position="stacked" className="aao-label">
                      Price <span className="aao-req">*</span>
                    </IonLabel>

                    <div className="aao-field">
                      <IonInput
                        className="aao-input"
                        inputMode="decimal"
                        type="number"
                        value={price}
                        placeholder="e.g. 25"
                        onIonChange={(e) => {
                          const v: string = (e.detail.value ?? "").toString();
                          setPrice(v === "" ? undefined : Number(v));
                        }}
                      />
                    </div>
                  </IonItem>

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

                  <IonButton
                    className="aao-btn aao-btn--primary aao-btn-right"
                    expand="block"
                    onClick={handleAddOnSubmit}
                    disabled={submitting}
                  >
                    <IonIcon slot="start" icon={addCircleOutline} />
                    {submitting ? "Saving..." : "Add Add-On"}
                  </IonButton>

                  <div className="aao-footnote aao-footnote-right">
                    Tip: Category suggestions appear from your existing saved
                    add-ons.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <IonToast
          isOpen={showToast}
          message={toastMessage}
          duration={2200}
          onDidDismiss={() => setShowToast(false)}
        />
      </IonContent>
    </IonPage>
  );
};

export default Admin_Add_Ons;