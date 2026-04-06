import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Admin_menu from "./admin/Admin_menu";
import Staff_menu from "./staff/Staff_menu";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/login" element={<Login />} />
      <Route path="/admin-menu" element={<Admin_menu />} />
      <Route path="/staff-menu" element={<Staff_menu />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;