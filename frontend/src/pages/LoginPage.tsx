import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { useAuth } from "../context/AuthState";
import { humanize } from "../lib/api";

function accountLabel(role: string): string {
  const labels: Record<string, string> = {
    super_admin: "All apps · Superuser",
    kyc_l2: "KYC · Admin",
    kyc_analyst: "KYC · User",
    refund_admin: "Refunds · Admin",
    refund_agent: "Refunds · User",
    flags_admin: "Feature Flags · Admin",
    flags_editor: "Feature Flags · User",
  };
  return labels[role] ?? humanize(role);
}

export function LoginPage() {
  const { personas, login } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function signIn(email: string) {
    setBusy(email);
    setError("");
    try {
      await login(email);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Sign in failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="login-page">
      <section className="login-hero">
        <div className="login-logo">
          <ShieldCheck size={24} />
          Operations Hub
        </div>
        <div className="login-hero-copy">
          <span className="eyebrow light">Unified operations</span>
          <h1>One secure workspace for critical operational decisions.</h1>
          <p>
            Review KYC cases, issue controlled Stripe refunds, and manage
            environment-isolated feature flags from one permission-aware app.
          </p>
        </div>
        <div className="security-note">
          <LockKeyhole size={19} />
          <div>
            <strong>Company authentication ready</strong>
            <span>
              Production delegates identity to your company auth provider.
            </span>
          </div>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-panel-inner">
          <span className="eyebrow">Passwordless demo access</span>
          <h2>Choose one of 7 demo accounts</h2>
          <p className="muted">
            Click an account to sign in—no password is required. Each account
            demonstrates its server-enforced app permissions.
          </p>
          {error && <div className="alert danger">{error}</div>}
          <div className="persona-grid">
            {personas.map((persona) => (
              <button
                className="persona-card"
                key={persona.id}
                type="button"
                disabled={busy !== null}
                onClick={() => void signIn(persona.email)}
              >
                <span className="avatar large">
                  {persona.name.slice(0, 2).toUpperCase()}
                </span>
                <span>
                  <strong>{persona.name}</strong>
                  <small>{accountLabel(persona.role)}</small>
                </span>
                <ArrowRight size={18} />
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
