import {
  ArrowRight,
  CreditCard,
  FileSearch,
  Flag,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../context/AuthState";
import { api, humanize } from "../lib/api";
import type { HomeStats } from "../types";

const moduleMeta = {
  kyc: {
    label: "KYC operations",
    description: "Claim, investigate, and decide identity verification cases.",
    icon: FileSearch,
    to: "/kyc",
  },
  refunds: {
    label: "Refund operations",
    description: "Issue full Stripe refunds with approval controls.",
    icon: CreditCard,
    to: "/refunds",
  },
  flags: {
    label: "Feature flags",
    description: "Control boolean rollouts independently by environment.",
    icon: Flag,
    to: "/feature-flags",
  },
};

export function HomePage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<HomeStats | null>(null);

  useEffect(() => {
    api<HomeStats>("/api/home").then(setStats).catch(console.error);
  }, []);

  return (
    <>
      <div className="page-heading home-heading">
        <div>
          <span className="eyebrow">Operations workspace</span>
          <h1>Good morning, {user?.name.split(" ")[0]}</h1>
          <p>
            Your home is personalized to the capabilities assigned through
            company identity.
          </p>
        </div>
        <div className="trust-card">
          <ShieldCheck size={20} />
          <div>
            <strong>{humanize(user?.role ?? "")}</strong>
            <span>{user?.permissions.length} granted capabilities</span>
          </div>
        </div>
      </div>

      <div className="module-grid">
        {Object.entries(moduleMeta)
          .filter(([key]) => user?.modules.includes(key))
          .map(([key, meta]) => {
            const Icon = meta.icon;
            const moduleStats = stats?.modules[key];
            return (
              <Link to={meta.to} className="module-card" key={key}>
                <div className={`module-icon ${key}`}>
                  <Icon size={24} />
                </div>
                <div className="module-card-copy">
                  <strong>{meta.label}</strong>
                  <p>{meta.description}</p>
                </div>
                <div className="module-metrics">
                  <span>
                    <strong>{moduleStats?.open ?? "—"}</strong>
                    Open
                  </span>
                  <span>
                    <strong>{moduleStats?.attention ?? "—"}</strong>
                    Attention
                  </span>
                </div>
                <div className="module-link">
                  Open workspace
                  <ArrowRight size={16} />
                </div>
              </Link>
            );
          })}
      </div>

      <section className="panel getting-started">
        <div>
          <span className="eyebrow">Access model</span>
          <h2>Least privilege, one session</h2>
          <p className="muted">
            Navigation is generated from your server-issued capabilities.
            Direct API and page access is independently enforced.
          </p>
        </div>
        <div className="capability-list">
          {user?.permissions.slice(0, 8).map((permission) => (
            <span key={permission}>{permission}</span>
          ))}
        </div>
      </section>
    </>
  );
}
