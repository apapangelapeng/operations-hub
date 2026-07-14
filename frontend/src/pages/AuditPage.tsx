import { Activity, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import { api, formatDate, humanize } from "../lib/api";
import type { AuditEvent } from "../types";

export function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api<AuditEvent[]>("/api/audit").then(setEvents).catch(console.error);
  }, []);

  const visibleEvents = events.filter(
    (event) =>
      event.action.toLowerCase().includes(search.toLowerCase()) ||
      event.resource_id.toLowerCase().includes(search.toLowerCase()) ||
      event.actor_name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Governance</span>
          <h1>Audit trail</h1>
          <p>
            Immutable activity visible only for modules granted to your role.
          </p>
        </div>
      </div>
      <section className="panel table-panel">
        <div className="table-toolbar">
          <div className="search-field">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search actor, action, or resource"
              aria-label="Search audit trail"
            />
          </div>
          <div className="policy-chip">
            <Activity size={16} />
            Append-only events
          </div>
        </div>
        {visibleEvents.length === 0 ? (
          <EmptyState
            title="No audit events"
            description="Actions in authorized modules appear here."
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Module</th>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Resource</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {visibleEvents.map((event) => (
                  <tr key={event.id}>
                    <td>{formatDate(event.created_at)}</td>
                    <td>
                      <StatusBadge value={event.module} />
                    </td>
                    <td>
                      <strong>{humanize(event.action)}</strong>
                    </td>
                    <td>{event.actor_name}</td>
                    <td>
                      <div className="primary-cell">
                        <strong>{humanize(event.resource_type)}</strong>
                        <span>{event.resource_id}</span>
                      </div>
                    </td>
                    <td>
                      <code className="details-code">
                        {JSON.stringify(event.details)}
                      </code>
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
