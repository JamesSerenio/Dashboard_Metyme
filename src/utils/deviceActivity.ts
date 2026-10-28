import { supabase } from "./supabaseClient";

const DEVICE_KEY = "metyme_device_key_v1";
export const SESSION_MARKER_KEY = "metyme_registered_session_v1";

export const tokenSessionId = (token?: string | null): string => {
  if (!token) return "";
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return String(payload.session_id || "");
  } catch { return ""; }
};

const getDeviceKey = (): string => {
  let value = localStorage.getItem(DEVICE_KEY);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, value);
  }
  return value;
};

const browserName = (): string => {
  const ua = navigator.userAgent;
  if (ua.includes("Edg/")) return "Microsoft Edge";
  if (ua.includes("Chrome/")) return "Google Chrome";
  if (ua.includes("Firefox/")) return "Mozilla Firefox";
  if (ua.includes("Safari/") && !ua.includes("Chrome/")) return "Safari";
  return "Unknown browser";
};

const osName = (): string => {
  const ua = navigator.userAgent;
  if (ua.includes("Windows")) return "Windows";
  if (ua.includes("Android")) return "Android";
  if (/iPhone|iPad/.test(ua)) return "iOS";
  if (ua.includes("Mac OS")) return "macOS";
  if (ua.includes("Linux")) return "Linux";
  return "Unknown OS";
};

export const registerDeviceActivity = async (): Promise<void> => {
  const { error } = await supabase.rpc("register_login_device", {
    p_device_key: getDeviceKey(),
    p_browser: browserName(),
    p_os: osName(),
    p_device_type: /Mobi|Android/i.test(navigator.userAgent) ? "Mobile" : "Computer",
  });
  // Migration may not be installed yet. Login must still work.
  if (error && !/register_login_device|schema cache/i.test(error.message)) throw error;
  if (!error) {
    const { data } = await supabase.auth.getSession();
    const sessionId = tokenSessionId(data.session?.access_token);
    if (sessionId) localStorage.setItem(SESSION_MARKER_KEY, sessionId);
  }
};

export const clearAccountStorage = (): void => {
  ["role", "user_id", "email", "selectedCustomer", "customerData", SESSION_MARKER_KEY].forEach((key) =>
    localStorage.removeItem(key),
  );
  sessionStorage.clear();
};

export { DEVICE_KEY };
