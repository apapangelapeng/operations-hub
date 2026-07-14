import {
  AlertTriangle,
  Check,
  Flag,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/AuthState";
import { api, formatDate, humanize } from "../lib/api";
import type { FeatureFlag } from "../types";

const environments = ["development", "staging", "production"];

type CreateForm = {
  name: string;
  key: string;
  description: string;
  owner: string;
  risk: string;
  environment: string;
  enabled: boolean;
  rollout: number;
  reason: string;
};

const initialCreate: CreateForm = {
  name: "",
  key: "",
  description: "",
  owner: "",
  risk: "low",
  environment: "development",
  enabled: false,
  rollout: 0,
  reason: "",
};

export function FeatureFlagsPage() {
  const { hasPermission } = useAuth();
  const [environment, setEnvironment] = useState("production");
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<FeatureFlag | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateForm>(initialCreate);
  const [editEnabled, setEditEnabled] = useState(false);
  const [editRollout, setEditRollout] = useState(0);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setFlags(
      await api<FeatureFlag[]>(
        `/api/feature-flags?environment=${environment}`,
      ),
    );
  }, [environment]);

  useEffect(() => {
    void load();
  }, [load]);

  function openEdit(flag: FeatureFlag) {
    setSelected(flag);
    setEditEnabled(flag.enabled);
    setEditRollout(flag.rollout);
    setReason("");
    setError("");
  }

  async function updateFlag() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await api<FeatureFlag>(
        `/api/feature-flags/${selected.id}/environments/${environment}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            enabled: editEnabled,
            rollout: editRollout,
            version: selected.version,
            reason,
          }),
        },
      );
      setSelected(null);
      await load();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function createFlag() {
    setBusy(true);
    setError("");
    try {
      await api<FeatureFlag>("/api/feature-flags", {
        method: "POST",
        body: JSON.stringify(form),
      });
      const createdEnvironment = form.environment;
      setShowCreate(false);
      setForm(initialCreate);
      setEnvironment(createdEnvironment);
      if (createdEnvironment === environment) {
        await load();
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  const visibleFlags = flags.filter(
    (flag) =>
      flag.name.toLowerCase().includes(search.toLowerCase()) ||
      flag.key.toLowerCase().includes(search.toLowerCase()) ||
      flag.owner.toLowerCase().includes(search.toLowerCase()),
  );
  const canEditEnvironment =
    hasPermission("flags.edit") &&
    (environment !== "production" || hasPermission("flags.production"));

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Feature flag operations</span>
          <h1>Feature flags</h1>
          <p>
            Boolean state and rollout percentage are stored independently for
            each environment.
          </p>
        </div>
        {hasPermission("flags.create") && (
          <button className="button primary" type="button" onClick={() => setShowCreate(true)}>
            <Plus size={17} />
            Create flag
          </button>
        )}
      </div>

      <div className="environment-switcher">
        <div>
          <span className={`environment-orb ${environment}`} />
          <div>
            <small>Active environment</small>
            <strong>{humanize(environment)}</strong>
          </div>
        </div>
        <div className="environment-tabs">
          {environments.map((value) => (
            <button
              type="button"
              key={value}
              className={environment === value ? "active" : ""}
              onClick={() => setEnvironment(value)}
            >
              {humanize(value)}
            </button>
          ))}
        </div>
      </div>

      {environment === "production" && (
        <div className="alert warning">
          <ShieldCheck size={18} />
          Production mutations require explicit permission, confirmation, and a
          change reason. They never alter staging or development.
        </div>
      )}

      <div className="metric-grid four">
        <div className="metric-card">
          <span>Total definitions</span>
          <strong>{flags.length}</strong>
          <small>Across this workspace</small>
        </div>
        <div className="metric-card">
          <span>Configured</span>
          <strong>{flags.filter((flag) => flag.configured).length}</strong>
          <small>In {environment}</small>
        </div>
        <div className="metric-card">
          <span>Enabled</span>
          <strong>{flags.filter((flag) => flag.enabled).length}</strong>
          <small>Environment-specific</small>
        </div>
        <div className="metric-card accent">
          <span>High risk</span>
          <strong>{flags.filter((flag) => flag.risk === "high").length}</strong>
          <small>Review before changing</small>
        </div>
      </div>

      <section className="panel table-panel">
        <div className="table-toolbar">
          <div className="search-field">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search flags, keys, or owners"
              aria-label="Search feature flags"
            />
          </div>
          <div className={`environment-label ${environment}`}>
            {humanize(environment)} values only
          </div>
        </div>
        {visibleFlags.length === 0 ? (
          <EmptyState
            title="No matching flags"
            description="Create a flag or change your search."
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Flag</th>
                  <th>State</th>
                  <th>Rollout</th>
                  <th>Risk</th>
                  <th>Owner</th>
                  <th>Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibleFlags.map((flag) => (
                  <tr key={flag.id}>
                    <td>
                      <div className="flag-name-cell">
                        <div className="mini-flag-icon">
                          <Flag size={16} />
                        </div>
                        <div className="primary-cell">
                          <strong>{flag.name}</strong>
                          <span>{flag.key}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      {flag.configured ? (
                        <StatusBadge value={flag.enabled ? "enabled" : "disabled"} />
                      ) : (
                        <StatusBadge value="not configured" />
                      )}
                    </td>
                    <td>
                      <div className="rollout-cell">
                        <div className="rollout-track">
                          <span style={{ width: `${flag.rollout}%` }} />
                        </div>
                        <strong>{flag.rollout}%</strong>
                      </div>
                    </td>
                    <td>
                      <StatusBadge value={flag.risk} />
                    </td>
                    <td>{flag.owner}</td>
                    <td>{flag.updated_at ? formatDate(flag.updated_at) : "Never"}</td>
                    <td className="align-right">
                      <button
                        className="text-link button-reset"
                        type="button"
                        disabled={!canEditEnvironment}
                        onClick={() => openEdit(flag)}
                      >
                        {flag.configured ? "Configure" : "Set up"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-heading">
              <div>
                <span className="eyebrow">{humanize(environment)} configuration</span>
                <h2>{selected.name}</h2>
                <code>{selected.key}</code>
              </div>
              <button className="icon-button" type="button" onClick={() => setSelected(null)}>
                <X size={18} />
              </button>
            </div>
            <div className={`environment-confirmation ${environment}`}>
              <AlertTriangle size={18} />
              This changes {environment} only. Other environments are untouched.
            </div>
            <label className="toggle-row">
              <span>
                <strong>Enabled</strong>
                <small>Boolean state for {environment}</small>
              </span>
              <button
                className={`toggle ${editEnabled ? "on" : ""}`}
                type="button"
                aria-pressed={editEnabled}
                onClick={() => setEditEnabled((value) => !value)}
              >
                <span />
              </button>
            </label>
            <label>
              Rollout percentage
              <div className="range-row">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={editRollout}
                  onChange={(event) => setEditRollout(Number(event.target.value))}
                />
                <strong>{editRollout}%</strong>
              </div>
            </label>
            <label>
              Change reason {environment === "production" && <em>Required</em>}
              <textarea
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why is this environment changing?"
              />
            </label>
            {error && <div className="alert danger">{error}</div>}
            <div className="modal-actions">
              <button className="button secondary" type="button" onClick={() => setSelected(null)}>
                Cancel
              </button>
              <button
                className="button primary"
                type="button"
                disabled={busy || (environment === "production" && !reason.trim())}
                onClick={() => void updateFlag()}
              >
                <Check size={17} />
                Save {environment}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal wide" role="dialog" aria-modal="true">
            <div className="modal-heading">
              <div>
                <span className="eyebrow">New feature flag</span>
                <h2>Create flag</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setShowCreate(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="form-grid">
              <label>
                Display name
                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm((value) => ({ ...value, name: event.target.value }))
                  }
                  placeholder="Faster checkout"
                />
              </label>
              <label>
                Flag key
                <input
                  value={form.key}
                  onChange={(event) =>
                    setForm((value) => ({
                      ...value,
                      key: event.target.value.toLowerCase().replaceAll(" ", "-"),
                    }))
                  }
                  placeholder="faster-checkout"
                />
              </label>
              <label>
                Owner
                <input
                  value={form.owner}
                  onChange={(event) =>
                    setForm((value) => ({ ...value, owner: event.target.value }))
                  }
                  placeholder="Payments"
                />
              </label>
              <label>
                Risk
                <select
                  value={form.risk}
                  onChange={(event) =>
                    setForm((value) => ({ ...value, risk: event.target.value }))
                  }
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
            </div>
            <label>
              Description
              <textarea
                rows={3}
                value={form.description}
                onChange={(event) =>
                  setForm((value) => ({ ...value, description: event.target.value }))
                }
                placeholder="What does this flag control?"
              />
            </label>

            <div className="creation-environment">
              <div className="creation-environment-title">
                <SlidersHorizontal size={19} />
                <div>
                  <strong>Initial environment</strong>
                  <span>
                    Select where this flag is configured first. Other
                    environments remain unconfigured.
                  </span>
                </div>
              </div>
              <div className="environment-choice-grid">
                {environments.map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={form.environment === value ? "selected" : ""}
                    disabled={
                      value === "production" && !hasPermission("flags.production")
                    }
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        environment: value,
                        reason: value === "production" ? current.reason : "",
                      }))
                    }
                  >
                    <span className={`environment-orb ${value}`} />
                    <span>
                      <strong>{humanize(value)}</strong>
                      <small>
                        {value === "production"
                          ? "Audited production value"
                          : `Independent ${value} value`}
                      </small>
                    </span>
                    {form.environment === value && <Check size={17} />}
                  </button>
                ))}
              </div>
            </div>

            <label className="toggle-row">
              <span>
                <strong>Initial enabled state</strong>
                <small>Applies to {form.environment} only</small>
              </span>
              <button
                type="button"
                className={`toggle ${form.enabled ? "on" : ""}`}
                aria-pressed={form.enabled}
                onClick={() =>
                  setForm((value) => ({ ...value, enabled: !value.enabled }))
                }
              >
                <span />
              </button>
            </label>
            <label>
              Initial rollout
              <div className="range-row">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={form.rollout}
                  onChange={(event) =>
                    setForm((value) => ({
                      ...value,
                      rollout: Number(event.target.value),
                    }))
                  }
                />
                <strong>{form.rollout}%</strong>
              </div>
            </label>
            {form.environment === "production" && (
              <label>
                Production creation reason <em>Required</em>
                <textarea
                  rows={3}
                  value={form.reason}
                  onChange={(event) =>
                    setForm((value) => ({ ...value, reason: event.target.value }))
                  }
                  placeholder="Describe the production purpose and approval"
                />
              </label>
            )}
            {error && <div className="alert danger">{error}</div>}
            <div className="modal-actions">
              <button className="button secondary" type="button" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
              <button
                className="button primary"
                type="button"
                disabled={
                  busy ||
                  !form.name.trim() ||
                  !form.key.trim() ||
                  !form.owner.trim() ||
                  (form.environment === "production" && !form.reason.trim())
                }
                onClick={() => void createFlag()}
              >
                Create in {humanize(form.environment)}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
