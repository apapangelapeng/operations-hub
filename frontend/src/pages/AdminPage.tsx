import { ShieldCheck } from "lucide-react";

import { useAuth } from "../context/AuthState";
import { humanize } from "../lib/api";

export function AdminPage() {
  const { user } = useAuth();
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Administration</span>
          <h1>Access policy</h1>
          <p>Company identities map to Operations Hub capability bundles.</p>
        </div>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Current administrator</h2>
            <p className="muted">
              Production provisioning is supplied by the company auth adapter.
            </p>
          </div>
          <ShieldCheck size={24} />
        </div>
        <div className="detail-grid">
          <div>
            <span>Name</span>
            <strong>{user?.name}</strong>
          </div>
          <div>
            <span>Role</span>
            <strong>{humanize(user?.role ?? "")}</strong>
          </div>
          <div>
            <span>Email</span>
            <strong>{user?.email}</strong>
          </div>
          <div>
            <span>Access</span>
            <strong>All modules</strong>
          </div>
        </div>
      </section>
    </>
  );
}
