import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";
import studyHubLogo from "../assets/study_hub.png";
import leaves from "../assets/leave.png";
import "../styles/login.css";

type ProfileRow = {
  role: string;
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
        if (role === "staff") navigate("/staff-menu", { replace: true });
        else if (role === "admin") navigate("/admin-menu", { replace: true });
        else navigate("/home", { replace: true });
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

  return (
    <div className="login-page">
      <div className="login-shell">
        <div className={`login-card-wrap ${mounted ? "is-mounted" : ""}`}>
          {leafItems.map((className, index) => (
            <div
              key={className}
              className={`leaf ${className}`}
              aria-hidden="true"
            >
              <img
                src={leaves}
                alt=""
                className="leaf-img"
                style={{ animationDelay: `${index * 0.45}s` }}
              />
            </div>
          ))}

          <div className={`login-card ${mounted ? "is-mounted" : ""}`}>
            <div className="login-top-bar">
              <div className="login-top-left">
                <div className="login-logo-wrap">
                  <img
                    src={studyHubLogo}
                    alt="Study Hub"
                    className="login-logo"
                  />
                </div>

                <div className="login-brand-copy">
                  <h1 className="login-title">Welcome Back</h1>
                  <p className="login-subtitle">
                    Sign in to continue to your MeTyme dashboard.
                  </p>
                </div>
              </div>

              <div className="login-status-pill">
                <span className="status-dot" />
                Ready to login
              </div>
            </div>

            <div className="login-center-copy">
              <div className="login-hero-card">
                <h2>Start Your Premium Access</h2>
                <p>
                  Secure sign in for staff, admin, and customer accounts with a
                  clean and peaceful experience.
                </p>
              </div>
            </div>

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
                  {isLoading ? "Logging in..." : "Login"}
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