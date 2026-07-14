import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FileBadge,
  LockKeyhole,
  ShieldAlert,
  UserCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/AuthState";
import { api, formatDate, humanize } from "../lib/api";
import type { KycCase } from "../types";

type Action =
  | "approve"
  | "rfi"
  | "deny"
  | "high_risk"
  | "second_accept"
  | "second_reject";

export function KycDetailPage() {
  const { caseId = "" } = useParams();
  const { user, hasPermission } = useAuth();
  const [item, setItem] = useState<KycCase | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState("policy_review");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [document, setDocument] = useState<Record<string, string | boolean | number> | null>(
    null,
  );

  const load = useCallback(async () => {
    setItem(await api<KycCase>(`/api/kyc/cases/${caseId}`));
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function claim() {
    setBusy(true);
    setError("");
    try {
      setItem(await api<KycCase>(`/api/kyc/cases/${caseId}/claim`, { method: "POST" }));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Claim failed");
    } finally {
      setBusy(false);
    }
  }

  async function release() {
    setBusy(true);
    try {
      setItem(await api<KycCase>(`/api/kyc/cases/${caseId}/release`, { method: "POST" }));
    } finally {
      setBusy(false);
    }
  }

  async function previewDocument() {
    setDocument(
      await api<Record<string, string | boolean | number>>(
        `/api/kyc/cases/${caseId}/document-preview`,
        { method: "POST" },
      ),
    );
  }

  async function updateHit(hitId: string, disposition: string) {
    setItem(
      await api<KycCase>(`/api/kyc/cases/${caseId}/hits/${hitId}/disposition`, {
        method: "POST",
        body: JSON.stringify({ disposition }),
      }),
    );
  }

  async function submitAction() {
    if (!action || !item) return;
    setBusy(true);
    setError("");
    try {
      let endpoint = `/api/kyc/cases/${caseId}/decisions`;
      let body: Record<string, string | number | boolean> = {
        reason,
        note,
        version: item.version,
      };
      if (action === "approve" || action === "rfi") {
        body.decision = action === "approve" ? "approved" : "needs_information";
      } else if (action === "deny" || action === "high_risk") {
        endpoint = `/api/kyc/cases/${caseId}/recommendations`;
        body.recommendation = action === "deny" ? "denied" : "approved_high_risk";
      } else {
        endpoint = `/api/kyc/cases/${caseId}/second-review`;
        body = {
          approved: action === "second_accept",
          note,
          version: item.version,
        };
      }
      setItem(
        await api<KycCase>(endpoint, {
          method: "POST",
          body: JSON.stringify(body),
        }),
      );
      setAction(null);
      setNote("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (!item) {
    return <div className="table-loading">Loading case…</div>;
  }

  const isMine = item.assigned_to === user?.id;
  const mayAct = item.pii_revealed && item.status !== "approved" && item.status !== "denied";

  return (
    <>
      <div className="detail-header">
        <div>
          <Link to="/kyc" className="back-link">
            <ArrowLeft size={16} />
            Review queue
          </Link>
          <div className="title-row">
            <h1>{item.applicant_name}</h1>
            <StatusBadge value={item.risk} />
            <StatusBadge value={item.status} />
          </div>
          <p>
            {item.id} · Submitted {formatDate(item.created_at)}
          </p>
        </div>
        <div className="header-actions">
          {!item.assigned_to && hasPermission("kyc.claim") && (
            <button className="button primary" type="button" disabled={busy} onClick={() => void claim()}>
              <UserCheck size={17} />
              Claim case
            </button>
          )}
          {isMine && hasPermission("kyc.release") && (
            <button className="button secondary" type="button" disabled={busy} onClick={() => void release()}>
              Release
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert danger">{error}</div>}
      {!item.pii_revealed && (
        <div className="alert info">
          <LockKeyhole size={18} />
          Sensitive PII is masked. Claim the case to reveal necessary fields;
          access is audited.
        </div>
      )}

      <div className="detail-layout">
        <div className="detail-main">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Applicant profile</span>
                <h2>Identity information</h2>
              </div>
              {item.pii_revealed && <span className="audit-label">Access audited</span>}
            </div>
            <div className="detail-grid">
              <div>
                <span>Full name</span>
                <strong>{item.applicant_name}</strong>
              </div>
              <div>
                <span>Email</span>
                <strong>{item.email}</strong>
              </div>
              <div>
                <span>Phone</span>
                <strong>{item.phone}</strong>
              </div>
              <div>
                <span>Date of birth</span>
                <strong>{item.date_of_birth}</strong>
              </div>
              <div>
                <span>Government ID</span>
                <strong>{item.government_id}</strong>
              </div>
              <div>
                <span>Country</span>
                <strong>{item.country}</strong>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Stripe Identity</span>
                <h2>Verification evidence</h2>
              </div>
              <StatusBadge value={item.stripe_identity?.status ?? "unknown"} />
            </div>
            <div className="provider-card">
              <div className="provider-icon">
                <FileBadge size={23} />
              </div>
              <div>
                <strong>{item.stripe_identity?.verification_session}</strong>
                <span>{item.stripe_identity?.verification_report}</span>
              </div>
              {item.pii_revealed && hasPermission("kyc.document") && (
                <button className="button secondary small" type="button" onClick={() => void previewDocument()}>
                  Secure preview
                  <ExternalLink size={14} />
                </button>
              )}
            </div>
            {document && (
              <div className="document-result">
                <CheckCircle2 size={18} />
                <div>
                  <strong>
                    {humanize(String(document.document_type))} verified
                  </strong>
                  <span>
                    Issued in {String(document.issuing_country)} · short-lived
                    preview authorized
                  </span>
                </div>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Screening</span>
                <h2>Watchlist results</h2>
              </div>
              <span className="count-pill">{item.screening_hits.length} hits</span>
            </div>
            {item.screening_hits.length === 0 ? (
              <div className="clear-check">
                <CheckCircle2 size={20} />
                No screening hits found
              </div>
            ) : (
              <div className="hit-list">
                {item.screening_hits.map((hit) => (
                  <div className="hit-card" key={hit.id}>
                    <ShieldAlert size={20} />
                    <div>
                      <strong>{hit.source}</strong>
                      <span>
                        {hit.match} · Match score {hit.score}%
                      </span>
                    </div>
                    <StatusBadge value={hit.disposition} />
                    {mayAct && hasPermission("kyc.screening") && (
                      <select
                        value={hit.disposition}
                        onChange={(event) =>
                          void updateHit(hit.id, event.target.value)
                        }
                      >
                        <option value="pending">Pending</option>
                        <option value="false_positive">False positive</option>
                        <option value="true_match">True match</option>
                      </select>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="detail-aside">
          <section className="panel sticky-panel">
            <span className="eyebrow">Case decision</span>
            <h2>Review actions</h2>
            <p className="muted">
              Rejection and high-risk approval always require another reviewer.
            </p>
            <div className="action-stack">
              {mayAct && hasPermission("kyc.decide_standard") && item.risk !== "high" && (
                <button className="button success full" type="button" onClick={() => setAction("approve")}>
                  Approve case
                </button>
              )}
              {mayAct && hasPermission("kyc.decide_standard") && (
                <button className="button secondary full" type="button" onClick={() => setAction("rfi")}>
                  Request information
                </button>
              )}
              {mayAct && hasPermission("kyc.recommend") && item.status !== "pending_second_review" && (
                <button className="button danger-outline full" type="button" onClick={() => setAction("deny")}>
                  Recommend rejection
                </button>
              )}
              {mayAct &&
                hasPermission("kyc.recommend") &&
                item.risk === "high" &&
                item.status !== "pending_second_review" && (
                  <button className="button primary full" type="button" onClick={() => setAction("high_risk")}>
                    Recommend high-risk approval
                  </button>
                )}
              {item.status === "pending_second_review" &&
                hasPermission("kyc.second_review") && (
                  <>
                    <div className="review-notice">
                      <strong>{humanize(item.pending_recommendation ?? "")}</strong>
                      <span>Proposed by another reviewer</span>
                    </div>
                    <button className="button success full" type="button" onClick={() => setAction("second_accept")}>
                      Confirm recommendation
                    </button>
                    <button className="button danger-outline full" type="button" onClick={() => setAction("second_reject")}>
                      Return for review
                    </button>
                  </>
                )}
            </div>
            <div className="case-meta-list">
              <div>
                <span>Version</span>
                <strong>{item.version}</strong>
              </div>
              <div>
                <span>SLA due</span>
                <strong>{formatDate(item.sla_due_at)}</strong>
              </div>
              <div>
                <span>Ownership</span>
                <strong>{isMine ? "Claimed by you" : item.assigned_to ? "Claimed" : "Unassigned"}</strong>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {action && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-heading">
              <div>
                <span className="eyebrow">KYC decision</span>
                <h2>{humanize(action)}</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setAction(null)}>
                <X size={18} />
              </button>
            </div>
            {!action.startsWith("second") && (
              <label>
                Reason code
                <select value={reason} onChange={(event) => setReason(event.target.value)}>
                  <option value="policy_review">Policy review</option>
                  <option value="identity_verified">Identity verified</option>
                  <option value="screening_match">Screening match</option>
                  <option value="insufficient_information">Insufficient information</option>
                </select>
              </label>
            )}
            <label>
              Reviewer note
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Summarize the evidence and decision rationale"
                rows={5}
              />
            </label>
            {error && <div className="alert danger">{error}</div>}
            <div className="modal-actions">
              <button className="button secondary" type="button" onClick={() => setAction(null)}>
                Cancel
              </button>
              <button
                className="button primary"
                type="button"
                disabled={busy || note.trim().length < 3}
                onClick={() => void submitAction()}
              >
                Submit action
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
