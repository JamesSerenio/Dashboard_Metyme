// src/admin/Admin_menu.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";
import "../styles/admin_menu.css";

/* ================= PAGES ================= */
import Admin_Dashboard from "./Admin_Dashboard";
import Admin_Add_Ons from "./Admin_Add_Ons";
import Admin_Item_Lists from "./Admin_Item_Lists";
import Admin_Restock_Record from "./Admin_Restock_Record";
import Admin_Staff_Expenses_Expired from "./Admin_Staff_Expenses&Expired";
import Admin_Sales_Report from "./Admin_Sales_Report";
import Admin_Customer_Add_ons from "./Admin_Customer_Add_ons";
import Admin_customer_list from "./Admin_customer_list";
import Admin_customer_reservation from "./Admin_customer_reservation";
import Admin_Customer_Cancelled from "./Admin_Customer_Cancelled";
import Staff_Consignment_Record from "./Admin_Staff_Consignment_Record";
import Customer_Consignment_Record from "./Admin_Customer_Consignment_Record";
import Admin_Consignment_Approval from "./Admin_Consignment_Approval";
import Admin_Seat_Table from "./Admin_Seat_Table";
import Admin_Packages from "./Admin_Packages";
import Admin_Customer_Discount_List from "./Admin_Customer_Discount_List";

/* ================= ASSETS ================= */
import dashboardIcon from "../assets/graph.png";
import addOnsIcon from "../assets/ons.png";
import itemIcon from "../assets/item.png";
import customerListIcon from "../assets/list.png";
import reservationIcon from "../assets/reserve.png";
import promotionIcon from "../assets/promotion.png";
import discountIcon from "../assets/discount.png";
import seatIcon from "../assets/seat.png";
import expenseIcon from "../assets/expense.png";
import hamburgerIcon from "../assets/hamburger.png";
import salesIcon from "../assets/sales.png";
import restockIcon from "../assets/restock.png";
import cancelledIcon from "../assets/cancelled.png";
import studyHubLogo from "../assets/study_hub.png";
import staffConsignmentIcon from "../assets/staff_consignment.png";
import customerConsignmentIcon from "../assets/consignment_record.png";
import approvedIcon from "../assets/approved.png";

type MenuKey =
  | "dashboard"
  | "add_ons"
  | "item_lists"
  | "restock_records"
  | "staff_expenses"
  | "sales_report"
  | "customer_add_ons"
  | "customer_list"
  | "customer_reservation"
  | "customer_cancelled"
  | "staff_consignment_record"
  | "customer_consignment_record"
  | "consignment_approval"
  | "seat_table"
  | "packages"
  | "discount_records";

type MenuItem = {
  name: string;
  key: MenuKey;
  icon: string;
};

const Admin_menu: React.FC = () => {
  const navigate = useNavigate();

  const [active, setActive] = useState<MenuKey>("dashboard");
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [loggingOut, setLoggingOut] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);

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
      localStorage.clear();
      sessionStorage.clear();
      navigate("/login", { replace: true });
    }
  };

  const menuItems = useMemo<MenuItem[]>(
    () => [
      { name: "Dashboard", key: "dashboard", icon: dashboardIcon },
      { name: "Admin Add Ons", key: "add_ons", icon: addOnsIcon },
      { name: "Item Lists", key: "item_lists", icon: itemIcon },
      { name: "Restock Records", key: "restock_records", icon: restockIcon },
      {
        name: "Staff Expenses & Cash outs",
        key: "staff_expenses",
        icon: expenseIcon,
      },
      { name: "Sales Report", key: "sales_report", icon: salesIcon },
      {
        name: "Customer Add-Ons",
        key: "customer_add_ons",
        icon: hamburgerIcon,
      },
      { name: "Customer List", key: "customer_list", icon: customerListIcon },
      {
        name: "Customer Reservations",
        key: "customer_reservation",
        icon: reservationIcon,
      },
      {
        name: "Cancelled Records",
        key: "customer_cancelled",
        icon: cancelledIcon,
      },
      {
        name: "Consignment Record",
        key: "staff_consignment_record",
        icon: staffConsignmentIcon,
      },
      {
        name: "Customer Consignment Record",
        key: "customer_consignment_record",
        icon: customerConsignmentIcon,
      },
      {
        name: "Consignment Approval",
        key: "consignment_approval",
        icon: approvedIcon,
      },
      { name: "Seat Table", key: "seat_table", icon: seatIcon },
      { name: "Promotions", key: "packages", icon: promotionIcon },
      {
        name: "Memberships",
        key: "discount_records",
        icon: discountIcon,
      },
    ],
    []
  );

  const activeMenu = menuItems.find((m) => m.key === active);

  const renderContent = (): React.ReactNode => {
    switch (active) {
      case "dashboard":
        return <Admin_Dashboard />;

      case "add_ons":
        return <Admin_Add_Ons />;

      case "item_lists":
        return <Admin_Item_Lists />;

      case "restock_records":
        return <Admin_Restock_Record />;

      case "staff_expenses":
        return <Admin_Staff_Expenses_Expired />;

      case "sales_report":
        return <Admin_Sales_Report />;

      case "customer_add_ons":
        return <Admin_Customer_Add_ons />;

      case "customer_list":
        return <Admin_customer_list />;

      case "customer_reservation":
        return <Admin_customer_reservation />;

      case "customer_cancelled":
        return <Admin_Customer_Cancelled />;

      case "staff_consignment_record":
        return <Staff_Consignment_Record />;

      case "customer_consignment_record":
        return <Customer_Consignment_Record />;

      case "consignment_approval":
        return <Admin_Consignment_Approval />;

      case "seat_table":
        return <Admin_Seat_Table />;

      case "packages":
        return <Admin_Packages />;

      case "discount_records":
        return <Admin_Customer_Discount_List />;

      default:
        return (
          <div className="admin-content-box">
            <h3>{activeMenu?.name ?? "Admin Panel"}</h3>
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
                  <span className="admin-brand-badge">ADMIN PANEL</span>
                  <h2>Me Tyme Lounge</h2>
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
                title={collapsed ? item.name : undefined}
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
            onClick={() => void handleLogout()}
            disabled={loggingOut}
            title="Logout"
          >
            <span className="admin-logout-dot" />
            {collapsed ? "" : loggingOut ? "Logging out..." : "Logout"}
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <div className="admin-topbar">
        </div>

        <div className="admin-content">{renderContent()}</div>
      </main>
    </div>
  );
};

export default Admin_menu;