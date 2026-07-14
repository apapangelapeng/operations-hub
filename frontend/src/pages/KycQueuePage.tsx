import { AlertTriangle, Clock3, Search, UserRoundCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import { api, formatDate } from "../lib/api";
import type { KycCase } from "../types";

type KycStats = {
  unassigned: number;
  mine: number;
  high_risk: number;
  second_review: number;
};

export function KycQueuePage() {
  const [cases, setCases] = useState<KycCase[]>([]);
  const [stats, setStats] = useState<KycStats | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api<KycCase[]>("/api/kyc/cases"),
      api<KycStats>("/api/kyc/stats"),
    ])
      .then(([nextCases, nextStats]) => {
        setCases(nextCases);
        setStats(nextStats);
      })
      .finally(() => setLoading(false));
  }, []);

  const visibleCases = cases.filter((item) => {
    const matchesSearch =
      item.id.toLowerCase().includes(search.toLowerCase()) ||
      item.applicant_name.toLowerCase().includes(search.toLowerCase());
    const matchesFilter =
      filter === "all" ||
      item.status === filter ||
      (filter === "high" && item.risk === "high");
    return matchesSearch && matchesFilter;
  });

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">KYC operations</span>
          <h1>Review queue</h1>
          <p>
            PII stays masked in the queue and is revealed only after claim.
          </p>
        </div>
      </div>

      <div className="metric-grid four">
        <div className="metric-card">
          <span>Unassigned</span>
          <strong>{stats?.unassigned ?? "—"}</strong>
          <small>Ready to claim</small>
        </div>
        <div className="metric-card">
          <span>My cases</span>
          <strong>{stats?.mine ?? "—"}</strong>
          <small>In your workspace</small>
        </div>
        <div className="metric-card">
          <span>High risk</span>
          <strong>{stats?.high_risk ?? "—"}</strong>
          <small>Requires enhanced review</small>
        </div>
        <div className="metric-card accent">
          <span>Second review</span>
          <strong>{stats?.second_review ?? "—"}</strong>
          <small>Maker-checker queue</small>
        </div>
      </div>

      <section className="panel table-panel">
        <div className="table-toolbar">
          <div className="search-field">
            <Search size={17} />
            <input
              aria-label="Search KYC cases"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search case or applicant"
            />
          </div>
          <div className="segmented-control">
            {[
              ["all", "All"],
              ["unassigned", "Unassigned"],
              ["pending_second_review", "Second review"],
              ["high", "High risk"],
            ].map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={filter === value ? "active" : ""}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="table-loading">Loading queue…</div>
        ) : visibleCases.length === 0 ? (
          <EmptyState
            title="No matching cases"
            description="Try changing your search or queue filter."
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Risk</th>
                  <th>Status</th>
                  <th>Signals</th>
                  <th>SLA</th>
                  <th>Owner</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibleCases.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="primary-cell">
                        <strong>{item.applicant_name}</strong>
                        <span>{item.id}</span>
                      </div>
                    </td>
                    <td>
                      <StatusBadge value={item.risk} />
                    </td>
                    <td>
                      <StatusBadge value={item.status} />
                    </td>
                    <td>
                      <div className="signal-count">
                        {item.flags.length > 0 && <AlertTriangle size={15} />}
                        {item.flags.length} flags
                      </div>
                    </td>
                    <td>
                      <div className="compact-copy">
                        <Clock3 size={15} />
                        {formatDate(item.sla_due_at)}
                      </div>
                    </td>
                    <td>
                      <div className="compact-copy">
                        <UserRoundCheck size={15} />
                        {item.assigned_to ? "Claimed" : "Unassigned"}
                      </div>
                    </td>
                    <td className="align-right">
                      <Link className="text-link" to={`/kyc/cases/${item.id}`}>
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
    </>
  );
}
