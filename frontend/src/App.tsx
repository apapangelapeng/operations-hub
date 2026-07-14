import { Navigate, Route, Routes } from "react-router-dom";

import { Layout } from "./components/Layout";
import { useAuth } from "./context/AuthState";
import { AdminPage } from "./pages/AdminPage";
import { AuditPage } from "./pages/AuditPage";
import { FeatureFlagsPage } from "./pages/FeatureFlagsPage";
import { ForbiddenPage } from "./pages/ForbiddenPage";
import { HomePage } from "./pages/HomePage";
import { KycDetailPage } from "./pages/KycDetailPage";
import { KycQueuePage } from "./pages/KycQueuePage";
import { LoginPage } from "./pages/LoginPage";
import { RefundDetailPage } from "./pages/RefundDetailPage";
import { RefundQueuePage } from "./pages/RefundQueuePage";

function ModuleRoute({
  module,
  children,
}: {
  module: string;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  if (!user?.modules.includes(module)) {
    return <ForbiddenPage />;
  }
  return children;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="app-loading">
        <div className="loading-mark" />
        Loading Operations Hub…
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route
          path="kyc"
          element={
            <ModuleRoute module="kyc">
              <KycQueuePage />
            </ModuleRoute>
          }
        />
        <Route
          path="kyc/queue"
          element={<Navigate to="/kyc" replace />}
        />
        <Route
          path="kyc/cases/:caseId"
          element={
            <ModuleRoute module="kyc">
              <KycDetailPage />
            </ModuleRoute>
          }
        />
        <Route
          path="refunds"
          element={
            <ModuleRoute module="refunds">
              <RefundQueuePage />
            </ModuleRoute>
          }
        />
        <Route
          path="refunds/queue"
          element={<Navigate to="/refunds" replace />}
        />
        <Route
          path="refunds/:refundId"
          element={
            <ModuleRoute module="refunds">
              <RefundDetailPage />
            </ModuleRoute>
          }
        />
        <Route
          path="feature-flags"
          element={
            <ModuleRoute module="flags">
              <FeatureFlagsPage />
            </ModuleRoute>
          }
        />
        <Route
          path="audit"
          element={
            <ModuleRoute module="audit">
              <AuditPage />
            </ModuleRoute>
          }
        />
        <Route
          path="admin"
          element={
            <ModuleRoute module="admin">
              <AdminPage />
            </ModuleRoute>
          }
        />
        <Route
          path="feature_flag"
          element={<Navigate to="/feature-flags" replace />}
        />
        <Route path="refund" element={<Navigate to="/refunds" replace />} />
        <Route path="403" element={<ForbiddenPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
