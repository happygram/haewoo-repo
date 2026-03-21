import React from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import AdminLogin from "./pages/AdminLogin.jsx";
import AdminDashboardSimple from "./pages/AdminDashboardSimple.jsx";
import KioskView from "./pages/KioskView.jsx";

function RequireAuth({ children }) {
  const token = localStorage.getItem("adminToken");
  const loc = useLocation();
  if (!token) return <Navigate to="/admin" replace state={{ from: loc.pathname }} />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin" replace />} />
      <Route path="/admin" element={<AdminLogin />} />
      <Route
        path="/admin/dashboard"
        element={
          <RequireAuth>
            <AdminDashboardSimple />
          </RequireAuth>
        }
      />
      <Route path="/kiosk" element={<KioskView />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}

