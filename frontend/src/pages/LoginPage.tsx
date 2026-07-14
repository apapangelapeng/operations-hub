import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { useAuth } from "../context/AuthState";
import { humanize } from "../lib/api";

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
          <span className="eyebrow">Local development</span>
          <h2>Choose a fixture identity</h2>
          <p className="muted">
            Personas simulate company identity claims and server-enforced
            capabilities. They are disabled in production.
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
                  <small>{humanize(persona.role)}</small>
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
