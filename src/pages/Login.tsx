import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";
import studyHubLogo from "../assets/study_hub.png";
import leaves from "../assets/leave.png";
import flowerImg from "../assets/flower.png";
import "../styles/login.css";

type ProfileRow = {
  role: string;
};

type FlowerItem = {
  id: string;
  className: string;
  delay: number;
};

const Login: React.FC = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const [toastMsg, setToastMsg] = useState<string>("");
  const [toastType, setToastType] = useState<"success" | "error">("error");
  const [showToast, setShowToast] = useState<boolean>(false);

  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    const id = window.setTimeout(() => setMounted(true), 80);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!showToast) return;

    const id = window.setTimeout(() => {
      setShowToast(false);
    }, 2400);

    return () => window.clearTimeout(id);
  }, [showToast]);

  const isValidEmail = (value: string): boolean =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const showError = (msg: string): void => {
    setToastType("error");
    setToastMsg(msg);
    setShowToast(true);
  };

  const showSuccess = (msg: string): void => {
    setToastType("success");
    setToastMsg(msg);
    setShowToast(true);
  };

  const handleLogin = async (): Promise<void> => {
    if (isLoading) return;

    const emailClean = email.trim().toLowerCase();
    const passwordClean = password;

    if (!isValidEmail(emailClean)) {
      showError("Invalid email format.");
      return;
    }

    if (!passwordClean) {
      showError("Password is required.");
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailClean,
        password: passwordClean,
      });

      if (error) {
        showError(error.message);
        return;
      }

      if (!data.session || !data.user) {
        showError("Login failed. No session returned.");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle<ProfileRow>();

      if (profileError) {
        showError(profileError.message);
        return;
      }

      const role = (profile?.role || "").toLowerCase();

      localStorage.setItem("role", role);
      localStorage.setItem("user_id", data.user.id);
      localStorage.setItem("email", emailClean);

      showSuccess("Login successful!");

      window.setTimeout(() => {
        if (role === "staff") {
          navigate("/staff-menu", { replace: true });
        } else if (role === "admin") {
          navigate("/admin-menu", { replace: true });
        } else {
          navigate("/home", { replace: true });
        }
      }, 700);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      showError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (
    e: React.FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    e.preventDefault();
    await handleLogin();
  };

  const leafItems = useMemo(
    () => [
      "leaf-top-left",
      "leaf-top-right",
      "leaf-bottom-left",
      "leaf-bottom-right",
    ],
    [],
  );

  const flowerItems = useMemo<FlowerItem[]>(
    () => [
      { id: "f1", className: "login-form-flower lff-top-left", delay: 0 },
      { id: "f2", className: "login-form-flower lff-top-mid-left", delay: 0.5 },
      { id: "f3", className: "login-form-flower lff-top-right", delay: 1.1 },

      { id: "f4", className: "login-form-flower lff-left-upper", delay: 0.35 },
      { id: "f5", className: "login-form-flower lff-left-lower", delay: 1.35 },

      { id: "f6", className: "login-form-flower lff-right-upper", delay: 0.8 },
      { id: "f7", className: "login-form-flower lff-right-lower", delay: 1.7 },

      { id: "f8", className: "login-form-flower lff-bottom-left", delay: 0.65 },
      { id: "f9", className: "login-form-flower lff-bottom-mid", delay: 1.45 },
      { id: "f10", className: "login-form-flower lff-bottom-right", delay: 2.1 },

      { id: "f11", className: "login-form-flower lff-inner-top-left", delay: 0.25 },
      { id: "f12", className: "login-form-flower lff-inner-top-right", delay: 1.0 },
      { id: "f13", className: "login-form-flower lff-inner-bottom-left", delay: 1.55 },
      { id: "f14", className: "login-form-flower lff-inner-bottom-right", delay: 2.25 },
    ],
    [],
  );

  return (
    <div className="login-page">
      <div className="login-shell">
        <div className={`login-card-wrap ${mounted ? "is-mounted" : ""}`}>
          {leafItems.map((className, index) => (
            <div key={className} className={`leaf ${className}`} aria-hidden="true">
              <img
                src={leaves}
                alt=""
                className="leaf-img"
                style={{ animationDelay: `${index * 0.45}s` }}
              />
            </div>
          ))}

          <div className={`login-card ${mounted ? "is-mounted" : ""}`}>
            <div className="login-form-flower-layer" aria-hidden="true">
              {flowerItems.map((item) => (
                <img
                  key={item.id}
                  src={flowerImg}
                  alt=""
                  className={item.className}
                  style={{ animationDelay: `${item.delay}s` }}
                />
              ))}
            </div>

            <div className="login-header">
              <div className="login-brand">
                <div className="login-logo-wrap">
                  <img
                    src={studyHubLogo}
                    alt="Study Hub"
                    className="login-logo"
                  />
                </div>

                <div className="login-brand-copy">
                  <span className="login-badge">MeTyme Lounge</span>
                  <h1 className="login-title">Welcome Back</h1>
                  <p className="login-subtitle">
                    Secure sign in for staff and admin access to the MeTyme
                    Lounge management system.
                  </p>
                </div>
              </div>
            </div>

            <div className="login-divider" />

            <form className="login-form" onSubmit={handleSubmit}>
              <div className="login-field">
                <label htmlFor="email" className="login-label">
                  Email Address
                </label>

                <div className="login-input-wrap">
                  <span className="login-input-icon" aria-hidden="true">
                    @
                  </span>

                  <input
                    id="email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="Enter your email"
                    className="login-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="login-field">
                <label htmlFor="password" className="login-label">
                  Password
                </label>

                <div className="login-input-wrap">
                  <span className="login-input-icon" aria-hidden="true">
                    •
                  </span>

                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    className="login-input login-input-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />

                  <button
                    type="button"
                    className="login-password-toggle"
                    onClick={() => setShowPassword((prev) => !prev)}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className={`login-button ${isLoading ? "is-loading" : ""}`}
                disabled={isLoading}
              >
                <span className="login-button-text">
                  {isLoading ? "Logging in..." : "LOGIN"}
                </span>
                <span className="login-button-glow" />
              </button>
            </form>
          </div>
        </div>
      </div>

      <div
        className={`login-toast ${showToast ? "show" : ""} ${
          toastType === "success" ? "success" : "error"
        }`}
        role="status"
        aria-live="polite"
      >
        <span className="login-toast-dot" />
        <span>{toastMsg}</span>
      </div>
    </div>
  );
};

export default Login;