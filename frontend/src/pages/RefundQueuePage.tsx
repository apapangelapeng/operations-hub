import { CircleDollarSign, Plus, Search, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/AuthState";
import { api, formatDate, money } from "../lib/api";
import type { Payment, Refund } from "../types";

type RefundStats = {
  pending_approval: number;
  processing: number;
  failed: number;
  refunded_amount: number;
};

export function RefundQueuePage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [stats, setStats] = useState<RefundStats | null>(null);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [paymentId, setPaymentId] = useState("");
  const [reason, setReason] = useState("requested_by_customer");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [nextRefunds, nextPayments, nextStats] = await Promise.all([
      api<Refund[]>("/api/refunds"),
      api<Payment[]>("/api/refunds/payments"),
      api<RefundStats>("/api/refunds/stats"),
    ]);
    setRefunds(nextRefunds);
    setPayments(nextPayments);
    setStats(nextStats);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createRefund() {
    setBusy(true);
    setError("");
    try {
      const refund = await api<Refund>("/api/refunds", {
        method: "POST",
        body: JSON.stringify({ payment_id: paymentId, reason, note }),
      });
      setShowCreate(false);
      navigate(`/refunds/${refund.id}`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  const selectedPayment = payments.find((item) => item.id === paymentId);
  const visibleRefunds = refunds.filter(
    (refund) =>
      refund.id.toLowerCase().includes(search.toLowerCase()) ||
      refund.payment.order_id.toLowerCase().includes(search.toLowerCase()) ||
      refund.payment.payment_intent_id.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Refund operations</span>
          <h1>Refund dashboard</h1>
          <p>
            Full refunds only, with Stripe-backed idempotency and human approval
            above $100 USD.
          </p>
        </div>
        {hasPermission("refunds.request") && (
          <button className="button primary" type="button" onClick={() => setShowCreate(true)}>
            <Plus size={17} />
            New refund
          </button>
        )}
      </div>

      <div className="metric-grid four">
        <div className="metric-card">
          <span>Pending approval</span>
          <strong>{stats?.pending_approval ?? "—"}</strong>
          <small>Second human required</small>
        </div>
        <div className="metric-card">
          <span>Processing</span>
          <strong>{stats?.processing ?? "—"}</strong>
          <small>Awaiting Stripe final state</small>
        </div>
        <div className="metric-card">
          <span>Exceptions</span>
          <strong>{stats?.failed ?? "—"}</strong>
          <small>Needs investigation</small>
        </div>
        <div className="metric-card accent">
          <span>Refunded</span>
          <strong>{money(stats?.refunded_amount ?? 0, "usd")}</strong>
          <small>Successful full refunds</small>
        </div>
      </div>

      <section className="panel table-panel">
        <div className="table-toolbar">
          <div className="search-field">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search request, order, or PaymentIntent"
              aria-label="Search refunds"
            />
          </div>
          <div className="policy-chip">
            <ShieldCheck size={16} />
            Approval threshold: $100 USD
          </div>
        </div>
        {visibleRefunds.length === 0 ? (
          <EmptyState
            title="No refund requests"
            description="Create a full refund from an eligible payment."
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Reason</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibleRefunds.map((refund) => (
                  <tr key={refund.id}>
                    <td>
                      <div className="primary-cell">
                        <strong>{refund.payment.order_id}</strong>
                        <span>{refund.id.slice(0, 14)}</span>
                      </div>
                    </td>
                    <td>
                      <div className="primary-cell">
                        <strong>{refund.payment.customer_name}</strong>
                        <span>{refund.payment.customer_email}</span>
                      </div>
                    </td>
                    <td>
                      <strong>{money(refund.amount, refund.currency)}</strong>
                    </td>
                    <td>
                      <StatusBadge value={refund.status} />
                    </td>
                    <td>{refund.reason.replaceAll("_", " ")}</td>
                    <td>{formatDate(refund.created_at)}</td>
                    <td className="align-right">
                      <Link className="text-link" to={`/refunds/${refund.id}`}>
                        Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showCreate && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal wide" role="dialog" aria-modal="true">
            <div className="modal-heading">
              <div>
                <span className="eyebrow">New request</span>
                <h2>Create full refund</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setShowCreate(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="alert info">
              <CircleDollarSign size={18} />
              Partial refunds are not supported. The amount is always the full
              captured payment and cannot be edited.
            </div>
            <label>
              Eligible payment
              <select value={paymentId} onChange={(event) => setPaymentId(event.target.value)}>
                <option value="">Select a payment</option>
                {payments
                  .filter((payment) => !payment.refunded)
                  .map((payment) => (
                    <option value={payment.id} key={payment.id}>
                      {payment.order_id} · {payment.customer_name} ·{" "}
                      {money(payment.amount, payment.currency)}
                    </option>
                  ))}
              </select>
            </label>
            {selectedPayment && (
              <div className="selected-payment">
                <div>
                  <span>Full refund amount</span>
                  <strong>{money(selectedPayment.amount, selectedPayment.currency)}</strong>
                </div>
                <div>
                  <span>PaymentIntent</span>
                  <strong>{selectedPayment.payment_intent_id}</strong>
                </div>
                <div>
                  <span>Approval policy</span>
                  <strong>
                    {selectedPayment.amount > 10_000
                      ? "Second approver required"
                      : "Agent may execute"}
                  </strong>
                </div>
              </div>
            )}
            <label>
              Reason
              <select value={reason} onChange={(event) => setReason(event.target.value)}>
                <option value="requested_by_customer">Requested by customer</option>
                <option value="duplicate">Duplicate charge</option>
                <option value="fraudulent">Fraudulent</option>
                <option value="service_issue">Service issue</option>
              </select>
            </label>
            <label>
              Operator note
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={4}
                placeholder="Add the customer request or supporting reference"
              />
            </label>
            {error && <div className="alert danger">{error}</div>}
            <div className="modal-actions">
              <button className="button secondary" type="button" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
              <button
                className="button primary"
                type="button"
                disabled={busy || !paymentId || note.trim().length < 3}
                onClick={() => void createRefund()}
              >
                Create request
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
