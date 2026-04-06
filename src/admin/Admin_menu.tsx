import React, { useEffect, useState } from "react";
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

  useEffect(() => {
    const role = (localStorage.getItem("role") || "").toLowerCase();

    if (role !== "admin") {
      navigate("/login", { replace: true });
    }
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

  const menuItems = [
    { name: "Dashboard", key: "dashboard", icon: dashboardIcon },
    { name: "Add Ons", key: "addons", icon: addOnsIcon },
    { name: "Items", key: "items", icon: itemIcon },
    { name: "Seat Table", key: "seat", icon: seatIcon },
    { name: "Sales", key: "sales", icon: salesIcon },
  ];

  return (
    <div className={`admin-container ${collapsed ? "collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-top">
          <button
            type="button"
            className="toggle-btn"
            onClick={() => setCollapsed((prev) => !prev)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            ☰
          </button>

          {!collapsed && (
            <div className="brand">
              <img src={studyHubLogo} alt="MeTyme Lounge" />
              <span>MeTyme</span>
            </div>
          )}
        </div>

        <div className="menu">
          {menuItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`menu-item ${active === item.key ? "active" : ""}`}
              onClick={() => setActive(item.key)}
              title={item.name}
            >
              <img src={item.icon} alt={item.name} />
              {!collapsed && <span>{item.name}</span>}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="logout"
          onClick={handleLogout}
          disabled={loggingOut}
        >
          {loggingOut ? "Logging out..." : "Logout"}
        </button>
      </aside>

      <main className="main">
        <img src={leaves} className="leaf leaf-top-left" alt="" aria-hidden="true" />
        <img src={leaves} className="leaf leaf-top-right" alt="" aria-hidden="true" />
        <img src={leaves} className="leaf leaf-bottom-left" alt="" aria-hidden="true" />
        <img src={leaves} className="leaf leaf-bottom-right" alt="" aria-hidden="true" />

        <div className="content-card">
          <h1>Admin Panel</h1>
          <p>Welcome to your dashboard</p>

          <div className="content-box">
            {active === "dashboard" && <p>Dashboard Content</p>}
            {active === "addons" && <p>Add-ons Content</p>}
            {active === "items" && <p>Items Content</p>}
            {active === "seat" && <p>Seat Table Content</p>}
            {active === "sales" && <p>Sales Content</p>}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Admin_menu;