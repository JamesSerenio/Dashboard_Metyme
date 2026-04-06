import React, { useState } from "react";
import "../styles/admin_menu.css";

import dashboardIcon from "../assets/graph.png";
import addOnsIcon from "../assets/ons.png";
import itemIcon from "../assets/item.png";
import seatIcon from "../assets/seat.png";
import salesIcon from "../assets/sales.png";
import studyHubLogo from "../assets/study_hub.png";
import leaves from "../assets/leave.png";

const Admin_menu = () => {
  const [active, setActive] = useState("dashboard");
  const [collapsed, setCollapsed] = useState(false);

  const menuItems = [
    { name: "Dashboard", key: "dashboard", icon: dashboardIcon },
    { name: "Add Ons", key: "addons", icon: addOnsIcon },
    { name: "Items", key: "items", icon: itemIcon },
    { name: "Seat Table", key: "seat", icon: seatIcon },
    { name: "Sales", key: "sales", icon: salesIcon },
  ];

  return (
    <div className={`admin-container ${collapsed ? "collapsed" : ""}`}>
      
      {/* ================= SIDEBAR ================= */}
      <aside className="sidebar">
        
        <div className="sidebar-top">
          <button
            className="toggle-btn"
            onClick={() => setCollapsed(!collapsed)}
          >
            ☰
          </button>

          {!collapsed && (
            <div className="brand">
              <img src={studyHubLogo} />
              <span>MeTyme</span>
            </div>
          )}
        </div>

        <div className="menu">
          {menuItems.map((item) => (
            <div
              key={item.key}
              className={`menu-item ${
                active === item.key ? "active" : ""
              }`}
              onClick={() => setActive(item.key)}
            >
              <img src={item.icon} />
              {!collapsed && <span>{item.name}</span>}
            </div>
          ))}
        </div>

        <button className="logout">Logout</button>
      </aside>

      {/* ================= MAIN ================= */}
      <main className="main">

        {/* LEAVES DESIGN */}
        <img src={leaves} className="leaf leaf-top-left" />
        <img src={leaves} className="leaf leaf-top-right" />
        <img src={leaves} className="leaf leaf-bottom-left" />
        <img src={leaves} className="leaf leaf-bottom-right" />

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