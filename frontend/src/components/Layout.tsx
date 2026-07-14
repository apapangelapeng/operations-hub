import {
  Activity,
  BadgeCheck,
  ChevronDown,
  CreditCard,
  FileSearch,
  Flag,
  Home,
  LogOut,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "../context/AuthState";
import { humanize } from "../lib/api";

type NavItem = {
  to: string;
  label: string;
  module?: string;
  icon: typeof Home;
};

const items: NavItem[] = [
  { to: "/", label: "Home", icon: Home },
  { to: "/kyc", label: "KYC operations", module: "kyc", icon: FileSearch },
  {
    to: "/refunds",
    label: "Refund operations",
    module: "refunds",
    icon: CreditCard,
  },
  {
    to: "/feature-flags",
    label: "Feature flags",
    module: "flags",
    icon: Flag,
  },
  { to: "/audit", label: "Audit trail", module: "audit", icon: Activity },
  { to: "/admin", label: "Administration", module: "admin", icon: Settings },
];

export function Layout() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <ShieldCheck size={22} />
          </div>
          <div>
            <strong>Operations Hub</strong>
            <span>Internal control center</span>
          </div>
        </div>

        <div className="environment-chip">
          <span className="environment-dot" />
          Demo environment
        </div>

        <nav className="sidebar-nav">
          <span className="nav-section">Workspace</span>
          {items
            .filter((item) => !item.module || user.modules.includes(item.module))
            .map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    `nav-link ${isActive ? "active" : ""}`
                  }
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
        </nav>

        <div className="sidebar-footer">
          <button className="profile-card" type="button">
            <span className="avatar">{user.name.slice(0, 2).toUpperCase()}</span>
            <span className="profile-copy">
              <strong>{user.name}</strong>
              <small>{humanize(user.role)}</small>
            </span>
            <ChevronDown size={16} />
          </button>
          <button className="logout-button" type="button" onClick={() => void logout()}>
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-label">
            <BadgeCheck size={17} />
            Company-authenticated session
          </div>
          <div className="topbar-right">
            <span className="stripe-mode">
              <span />
              Stripe test mode
            </span>
            <span className="topbar-email">{user.email}</span>
          </div>
        </header>
        <div className="page-container">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
