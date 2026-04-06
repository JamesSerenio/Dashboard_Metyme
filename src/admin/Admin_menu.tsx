import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";
import "../styles/admin_menu.css";

import Admin_Dashboard from "./Admin_Dashboard";
import Admin_Add_Ons from "./Admin_Add_Ons";

import dashboardIcon from "../assets/graph.png";
import addOnsIcon from "../assets/ons.png";
import itemIcon from "../assets/item.png";
import seatIcon from "../assets/seat.png";
import salesIcon from "../assets/sales.png";
import studyHubLogo from "../assets/study_hub.png";

type MenuKey = "dashboard" | "addons" | "items" | "seat" | "sales";

type MenuItem = {
  name: string;
  key: MenuKey;
  icon: string;
};

const Admin_menu: React.FC = () => {
  const navigate = useNavigate();

  const [active, setActive] = useState<MenuKey>("dashboard");
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

  const handleLogout = async () => {
    if (loggingOut) return;

    setLoggingOut(true);

    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      localStorage.clear();
      sessionStorage.clear();
      navigate("/login", { replace: true });
    }
  };

  const menuItems = useMemo<MenuItem[]>(
    () => [
      { name: "Dashboard", key: "dashboard", icon: dashboardIcon },
      { name: "Add Ons", key: "addons", icon: addOnsIcon },
      { name: "Items", key: "items", icon: itemIcon },
      { name: "Seat Table", key: "seat", icon: seatIcon },
      { name: "Sales", key: "sales", icon: salesIcon },
    ],
    []
  );

  const activeMenu = menuItems.find((m) => m.key === active);

  const renderContent = () => {
    switch (active) {
      case "dashboard":
        return <Admin_Dashboard />;

      case "addons":
        return <Admin_Add_Ons />;

      case "items":
      case "seat":
      case "sales":
      default:
        return (
          <div className="admin-content-box">
            <h3>{activeMenu?.name}</h3>
          </div>
        );
    }
  };

  return (
    <div className={`admin-page ${mounted ? "is-mounted" : ""}`}>
      <aside className={`admin-sidebar ${collapsed ? "collapsed" : ""}`}>
        <div className="admin-sidebar-inner">
          <div className="admin-sidebar-top">
            <button
              type="button"
              className="admin-toggle-btn"
              onClick={() => setCollapsed((prev) => !prev)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <span />
              <span />
              <span />
            </button>

            {!collapsed && (
              <div className="admin-brand">
                <div className="admin-brand-logo-wrap">
                  <img
                    src={studyHubLogo}
                    className="admin-brand-logo"
                    alt="MeTyme Lounge"
                  />
                </div>

                <div className="admin-brand-copy">
                  <span className="admin-brand-badge">ADMIN PORTAL</span>
                  <h2>MeTyme Lounge</h2>
                </div>
              </div>
            )}
          </div>

          <div className="admin-menu-list">
            {menuItems.map((item, i) => (
              <button
                key={item.key}
                type="button"
                className={`admin-menu-item ${active === item.key ? "active" : ""}`}
                onClick={() => setActive(item.key)}
                style={{ animationDelay: `${0.08 + i * 0.05}s` }}
              >
                <span className="admin-menu-icon-wrap">
                  <img
                    src={item.icon}
                    className="admin-menu-icon"
                    alt={item.name}
                  />
                </span>

                {!collapsed && (
                  <span className="admin-menu-title">{item.name}</span>
                )}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="admin-logout-btn"
            onClick={handleLogout}
          >
            <span className="admin-logout-dot" />
            {collapsed ? "" : "Logout"}
          </button>
        </div>
      </aside>

      <main className="admin-main">{renderContent()}</main>
    </div>
  );
};

export default Admin_menu;