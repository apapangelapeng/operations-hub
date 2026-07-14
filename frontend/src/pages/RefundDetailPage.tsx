import {
  ArrowLeft,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  Fingerprint,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/AuthState";
import { api, formatDate, humanize, money } from "../lib/api";
import type { Refund } from "../types";

export function RefundDetailPage() {
  const { refundId = "" } = useParams();
  const { user, hasPermission } = useAuth();
  const [refund, setRefund] = useState<Refund | null>(null);
  const [approvalNote, setApprovalNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setRefund(await api<Refund>(`/api/refunds/${refundId}`));
  }, [refundId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve(approved: boolean) {
    setBusy(true);
    setError("");
    try {
      setRefund(
        await api<Refund>(`/api/refunds/${refundId}/approve`, {
          method: "POST",
          body: JSON.stringify({ approved, note: approvalNote }),
        }),
      );
      setApprovalNote("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Approval failed");
    } finally {
      setBusy(false);
    }
  }

  async function execute() {
    setBusy(true);
    setError("");
    try {
      setRefund(
        await api<Refund>(`/api/refunds/${refundId}/execute`, {
          method: "POST",
        }),
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Execution failed");
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!refund) {
    return <div className="table-loading">Loading refund…</div>;
  }

  const canExecuteStandard =
    !refund.requires_approval &&
    hasPermission("refunds.execute_standard") &&
    ["pending_review", "approved", "failed_retryable"].includes(refund.status);
  const canExecuteApproved =
    refund.requires_approval &&
    hasPermission("refunds.execute_approved") &&
    ["approved", "failed_retryable"].includes(refund.status);

  return (
    <>
      <div className="detail-header">
        <div>
          <Link to="/refunds" className="back-link">
            <ArrowLeft size={16} />
            Refund dashboard
          </Link>
          <div className="title-row">
            <h1>{refund.payment.order_id}</h1>
            <StatusBadge value={refund.status} />
          </div>
          <p>
            Refund request {refund.id} · {formatDate(refund.created_at)}
          </p>
        </div>
        <div className="refund-amount">
          <span>Full refund</span>
          <strong>{money(refund.amount, refund.currency)}</strong>
        </div>
      </div>

      {error && <div className="alert danger">{error}</div>}
      {refund.failure_reason && (
        <div className="alert danger">{refund.failure_reason}</div>
      )}

      <div className="detail-layout">
        <div className="detail-main">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Original payment</span>
                <h2>Stripe payment</h2>
              </div>
              <CreditCard size={23} />
            </div>
            <div className="detail-grid">
              <div>
                <span>Customer</span>
                <strong>{refund.payment.customer_name}</strong>
              </div>
              <div>
                <span>Email</span>
                <strong>{refund.payment.customer_email}</strong>
              </div>
              <div>
                <span>PaymentIntent</span>
                <strong>{refund.payment.payment_intent_id}</strong>
              </div>
              <div>
                <span>Charge</span>
                <strong>{refund.payment.charge_id}</strong>
              </div>
              <div>
                <span>Captured amount</span>
                <strong>{money(refund.payment.amount, refund.payment.currency)}</strong>
              </div>
              <div>
                <span>Eligibility</span>
                <strong>{refund.payment.refunded ? "Already refunded" : "Full refund eligible"}</strong>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Request rationale</span>
                <h2>{humanize(refund.reason)}</h2>
              </div>
              <CircleDollarSign size={23} />
            </div>
            <p className="operator-note">{refund.note}</p>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Provider state</span>
                <h2>Stripe execution</h2>
              </div>
              {refund.stripe_status && <StatusBadge value={refund.stripe_status} />}
            </div>
            <div className="detail-grid">
              <div>
                <span>Stripe refund ID</span>
                <strong>{refund.stripe_refund_id ?? "Not submitted"}</strong>
              </div>
              <div>
                <span>Processor state</span>
                <strong>{humanize(refund.stripe_status ?? "not submitted")}</strong>
              </div>
              <div>
                <span>Attempt identity</span>
                <strong>Stable per internal request</strong>
              </div>
              <div>
                <span>Refund mode</span>
                <strong>Full amount only</strong>
              </div>
            </div>
          </section>
        </div>

        <aside className="detail-aside">
          <section className="panel sticky-panel">
            <span className="eyebrow">Policy decision</span>
            <h2>Approval & execution</h2>
            <div className="policy-summary">
              <div>
                <ShieldCheck size={19} />
                <span>
                  {refund.requires_approval
                    ? "A different human approver is required."
                    : "Authorized agents may execute this refund."}
                </span>
              </div>
              <div>
                <Fingerprint size={19} />
                <span>
                  Stripe retries use the same stable idempotency key.
                </span>
              </div>
            </div>

            {refund.status === "pending_approval" &&
              hasPermission("refunds.approve") && (
                <div className="approval-box">
                  <label>
                    Approval note
                    <textarea
                      rows={3}
                      value={approvalNote}
                      onChange={(event) => setApprovalNote(event.target.value)}
                      placeholder="Confirm policy and supporting evidence"
                    />
                  </label>
                  <div className="split-actions">
                    <button
                      className="button danger-outline"
                      type="button"
                      disabled={busy || approvalNote.trim().length < 3}
                      onClick={() => void approve(false)}
                    >
                      Reject
                    </button>
                    <button
                      className="button success"
                      type="button"
                      disabled={
                        busy ||
                        approvalNote.trim().length < 3 ||
                        refund.requester_id === user?.id
                      }
                      onClick={() => void approve(true)}
                    >
                      Approve
                    </button>
                  </div>
                  {refund.requester_id === user?.id && (
                    <small className="danger-text">
                      You cannot approve your own request.
                    </small>
                  )}
                </div>
              )}

            {(canExecuteStandard || canExecuteApproved) && (
              <button
                className="button primary full"
                type="button"
                disabled={busy}
                onClick={() => void execute()}
              >
                Execute full refund
              </button>
            )}
            {refund.status === "succeeded" && (
              <div className="success-result">
                <CheckCircle2 size={22} />
                <div>
                  <strong>Refund succeeded</strong>
                  <span>Stripe accepted the full-refund operation.</span>
                </div>
              </div>
            )}

            <div className="case-meta-list">
              <div>
                <span>Requester</span>
                <strong>{refund.requester_id === user?.id ? "You" : refund.requester_id}</strong>
              </div>
              <div>
                <span>Approver</span>
                <strong>{refund.approver_id ?? "Not approved"}</strong>
              </div>
              <div>
                <span>Version</span>
                <strong>{refund.version}</strong>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
