import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";
import "../styles/admin_menu.css";

import dashboardIcon from "../assets/graph.png";
import addOnsIcon from "../assets/ons.png";
import itemIcon from "../assets/item.png";
import seatIcon from "../assets/seat.png";
import salesIcon from "../assets/sales.png";
import studyHubLogo from "../assets/study_hub.png";
import leaves from "../assets/leave.png";

const Admin_menu: React.FC = () => {
  const navigate = useNavigate();

  const [active, setActive] = useState("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const role = (localStorage.getItem("role") || "").toLowerCase();

    if (role !== "admin") {
      navigate("/login", { replace: true });
      return;
    }

    const id = window.setTimeout(() => setMounted(true), 80);
    return () => window.clearTimeout(id);
  }, [navigate]);

  const handleLogout = async (): Promise<void> => {
    if (loggingOut) return;

    setLoggingOut(true);

    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      localStorage.removeItem("role");
      localStorage.removeItem("user_id");
      localStorage.removeItem("email");
      sessionStorage.clear();
      navigate("/login", { replace: true });
    }
  };

  const menuItems = useMemo(
    () => [
      { name: "Dashboard", key: "dashboard", icon: dashboardIcon },
      { name: "Add Ons", key: "addons", icon: addOnsIcon },
      { name: "Items", key: "items", icon: itemIcon },
      { name: "Seat Table", key: "seat", icon: seatIcon },
      { name: "Sales", key: "sales", icon: salesIcon },
    ],
    [],
  );

  const pageMeta = {
    dashboard: {
      title: "Dashboard Overview",
      subtitle:
        "Monitor activity, sales, and overall system performance in one place.",
      content: "Dashboard Content",
    },
    addons: {
      title: "Add Ons Management",
      subtitle:
        "Manage available add-ons, pricing, and stock in a cleaner workflow.",
      content: "Add-ons Content",
    },
    items: {
      title: "Items Management",
      subtitle:
        "Organize lounge items and keep your inventory records up to date.",
      content: "Items Content",
    },
    seat: {
      title: "Seat Table",
      subtitle:
        "View seating structure and manage lounge availability more easily.",
      content: "Seat Table Content",
    },
    sales: {
      title: "Sales Analytics",
      subtitle:
        "Track revenue, trends, and summaries with a more premium presentation.",
      content: "Sales Content",
    },
  } as const;

  const current = pageMeta[active as keyof typeof pageMeta];

  return (
    <div className={`admin-page ${mounted ? "is-mounted" : ""}`}>
      <div className="admin-bg-glow admin-bg-glow-1" />
      <div className="admin-bg-glow admin-bg-glow-2" />

      <aside className={`admin-sidebar ${collapsed ? "collapsed" : ""}`}>
        <div className="admin-sidebar-inner">
          <div className="admin-sidebar-top">
            <button
              type="button"
              className="admin-toggle-btn"
              onClick={() => setCollapsed((prev) => !prev)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <span />
              <span />
              <span />
            </button>

            {!collapsed && (
              <div className="admin-brand">
                <div className="admin-brand-logo-wrap">
                  <img src={studyHubLogo} alt="MeTyme Lounge" className="admin-brand-logo" />
                </div>

                <div className="admin-brand-copy">
                  <span className="admin-brand-badge">ADMIN PORTAL</span>
                  <h2>MeTyme Lounge</h2>
                </div>
              </div>
            )}
          </div>

          <div className="admin-menu-list">
            {menuItems.map((item, index) => (
              <button
                key={item.key}
                type="button"
                className={`admin-menu-item ${active === item.key ? "active" : ""}`}
                onClick={() => setActive(item.key)}
                title={item.name}
                style={{ animationDelay: `${0.08 + index * 0.05}s` }}
              >
                <span className="admin-menu-icon-wrap">
                  <img src={item.icon} alt={item.name} className="admin-menu-icon" />
                </span>

                {!collapsed && (
                  <span className="admin-menu-copy">
                    <span className="admin-menu-title">{item.name}</span>
                  </span>
                )}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="admin-logout-btn"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            <span className="admin-logout-dot" />
            {collapsed ? "" : loggingOut ? "Logging out..." : "Logout"}
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <img src={leaves} className="admin-leaf admin-leaf-top-left" alt="" aria-hidden="true" />
        <img src={leaves} className="admin-leaf admin-leaf-top-right" alt="" aria-hidden="true" />
        <img src={leaves} className="admin-leaf admin-leaf-bottom-left" alt="" aria-hidden="true" />
        <img src={leaves} className="admin-leaf admin-leaf-bottom-right" alt="" aria-hidden="true" />

        <header className="admin-topbar">
          <div className="admin-topbar-copy">
            <span className="admin-topbar-badge">WELCOME</span>
            <h1>Admin Panel</h1>
            <p>Manage the lounge with a cleaner and more premium workspace.</p>
          </div>

          <div className="admin-topbar-status">
            <span className="status-dot" />
            Admin Online
          </div>
        </header>

        <section className="admin-hero-card">
          <div className="admin-hero-copy">
            <span className="admin-section-badge">{current.title}</span>
            <h2>{current.title}</h2>
            <p>{current.subtitle}</p>
          </div>

          <div className="admin-stats-grid">
            <div className="admin-stat-card">
              <span className="admin-stat-label">Workspace</span>
              <strong>Premium UI</strong>
            </div>

            <div className="admin-stat-card">
              <span className="admin-stat-label">Current View</span>
              <strong>{menuItems.find((m) => m.key === active)?.name}</strong>
            </div>

            <div className="admin-stat-card">
              <span className="admin-stat-label">Status</span>
              <strong>Active</strong>
            </div>
          </div>
        </section>

        <section className="admin-content-panel">
          <div className="admin-content-header">
            <h3>Workspace Content</h3>
            <span className="admin-content-pill">{menuItems.find((m) => m.key === active)?.name}</span>
          </div>

          <div className="admin-content-box">
            <div className="admin-content-placeholder">
              <div className="admin-placeholder-icon-wrap">
                <img
                  src={menuItems.find((m) => m.key === active)?.icon}
                  alt={menuItems.find((m) => m.key === active)?.name}
                  className="admin-placeholder-icon"
                />
              </div>

              <div className="admin-placeholder-copy">
                <h4>{current.content}</h4>
                <p>
                  This section is ready for your real admin component content.
                  You can now replace this block with your actual dashboard,
                  tables, records, or reports.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Admin_menu;