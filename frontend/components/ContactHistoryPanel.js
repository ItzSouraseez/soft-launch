"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/utils/api";

export default function ContactHistoryPanel({ email, onClose, onUpdate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Track open state for animations
  const [active, setActive] = useState(false);

  const fetchContactHistory = useCallback(async (targetEmail) => {
    setLoading(true);
    setError(null);
    try {
      const historyData = await api.get(`/api/contact/${encodeURIComponent(targetEmail)}`);
      setData(historyData);
    } catch (err) {
      console.error("Failed to load contact history:", err);
      setError(err.message || "Failed to load historical timeline.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleClose = useCallback(() => {
    setActive(false);
    // Wait for slide animation to complete before raising onClose callback
    setTimeout(() => {
      onClose();
    }, 300);
  }, [onClose]);

  // Trigger open state animation and fetch data when email changes
  useEffect(() => {
    if (email) {
      Promise.resolve().then(() => {
        setActive(true);
        fetchContactHistory(email);
      });
    } else {
      Promise.resolve().then(() => {
        setActive(false);
        setData(null);
      });
    }
  }, [email, fetchContactHistory]);

  // Handle ESC key press to close drawer
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && email) {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [email, handleClose]);

  const handleStatusOverride = async (recipientId, newStatus) => {
    try {
      await api.patch(`/api/recipient/${recipientId}`, { status: newStatus });
      // Reload history data
      if (email) fetchContactHistory(email);
      if (onUpdate) onUpdate();
    } catch (err) {
      alert(err.message || "Failed to update status manually.");
    }
  };

  const handleCheckBackDateChange = async (recipientId, dateStr) => {
    try {
      await api.patch(`/api/recipient/${recipientId}`, { check_back_date: dateStr || "" });
      if (email) fetchContactHistory(email);
      if (onUpdate) onUpdate();
    } catch (err) {
      alert(err.message || "Failed to update check-back date.");
    }
  };

  const handleExcludeFollowupChange = async (recipientId, isExcluded) => {
    try {
      await api.patch(`/api/recipient/${recipientId}`, { exclude_followup: isExcluded });
      if (email) fetchContactHistory(email);
      if (onUpdate) onUpdate();
    } catch (err) {
      alert(err.message || "Failed to update followup exclusion status.");
    }
  };

  if (!email) return null;

  return (
    <>
      {/* Backdrop overlay */}
      <div 
        className={`drawer-overlay ${active ? "open" : ""}`} 
        onClick={handleClose}
      />

      {/* Drawer Container */}
      <div className={`drawer-container ${active ? "open" : ""}`}>
        <div className="drawer-header">
          <div>
            <h3 className="drawer-title">Contact Profile</h3>
            <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              {email}
            </span>
          </div>
          <button className="drawer-close" onClick={handleClose}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="drawer-content">
          {loading && !data ? (
            <div style={{ padding: "4rem 2rem", textAlignment: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
              <div className="spinner"></div>
              <p style={{ color: "var(--text-secondary)" }}>Loading communication logs...</p>
            </div>
          ) : error ? (
            <div className="error-container" style={{ margin: 0 }}>
              <p>{error}</p>
              <button onClick={() => fetchContactHistory(email)} className="btn btn-secondary" style={{ marginTop: "1rem" }}>
                Retry
              </button>
            </div>
          ) : data ? (
            <>
              {/* Profile Card */}
              <div className="card" style={{ padding: "1.25rem", borderLeft: "3px solid var(--accent-primary)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  <div className="avatar" style={{ width: "48px", height: "48px", fontSize: "1.1rem" }}>
                    {(data.name || email).substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h4 style={{ fontSize: "1.1rem", fontWeight: "700" }}>{data.name || "Unnamed Recipient"}</h4>
                    <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                      Domain: {email.split("@")[1]}
                    </p>
                  </div>
                </div>
              </div>

              {/* Parallel Recruiter Targets Section */}
              {data.other_domain_leads && data.other_domain_leads.length > 0 && (
                <div>
                  <h4 className="drawer-section-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                    Parallel Recruiter Targets ({data.other_domain_leads.length})
                  </h4>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                    Other contacts targeted on the same company domain.
                  </p>
                  <div className="table-container" style={{ borderRadius: "var(--radius-sm)", border: "1px solid var(--border-light)" }}>
                    <div className="table-wrapper">
                      <table className="data-table" style={{ fontSize: "0.8rem" }}>
                        <thead>
                          <tr>
                            <th style={{ padding: "0.5rem 0.75rem" }}>Name</th>
                            <th style={{ padding: "0.5rem 0.75rem" }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.other_domain_leads.map((ol) => (
                            <tr key={ol.email}>
                              <td style={{ padding: "0.5rem 0.75rem" }}>
                                <div style={{ fontWeight: "600", color: "var(--text-primary)" }}>{ol.name || "Unnamed"}</div>
                                <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", fontFamily: "var(--font-mono)" }}>{ol.email}</div>
                              </td>
                              <td style={{ padding: "0.5rem 0.75rem" }}>
                                <span className={`status-badge ${ol.status}`} style={{ fontSize: "0.7rem", padding: "0.15rem 0.4rem" }}>
                                  {ol.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Campaign Timelines Section */}
              <div>
                <h4 className="drawer-section-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                  Campaign Interactions
                </h4>
                {data.history && data.history.map((campHistory) => (
                  <div key={campHistory.recipient_id} className="history-campaign-item">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "0.75rem" }}>
                      <div>
                        <h5 style={{ fontWeight: "700", color: "var(--text-primary)", fontSize: "0.95rem" }}>
                          {campHistory.campaign_name}
                        </h5>
                        {campHistory.campaign_goal && (
                          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>
                            Goal: {campHistory.campaign_goal}
                          </p>
                        )}
                      </div>
                      <span className={`status-badge ${campHistory.status}`}>
                        {campHistory.status}
                      </span>
                    </div>

                    {/* Inline Status Override Dropdown */}
                    <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", padding: "0.75rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
                      <div className="form-group" style={{ flex: 1, minWidth: "120px", gap: "0.25rem" }}>
                        <span style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary)" }}>Override Status</span>
                        <select
                          value={campHistory.status}
                          onChange={(e) => handleStatusOverride(campHistory.recipient_id, e.target.value)}
                          className="select-field"
                          style={{ padding: "0.4rem 0.6rem", fontSize: "0.8rem", borderRadius: "var(--radius-sm)" }}
                        >
                          <option value="draft">Draft</option>
                          <option value="generating">Generating</option>
                          <option value="failed">Failed</option>
                          <option value="blocked">Blocked</option>
                          <option value="sent">Sent</option>
                          <option value="replied">Replied</option>
                          <option value="ooo">Out of Office</option>
                          <option value="bounced">Bounced</option>
                        </select>
                      </div>

                      <div className="form-group" style={{ flex: 1, minWidth: "120px", gap: "0.25rem" }}>
                        <span style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary)" }}>Check-back Date</span>
                        <input
                          type="date"
                          value={campHistory.check_back_date || ""}
                          onChange={(e) => handleCheckBackDateChange(campHistory.recipient_id, e.target.value)}
                          className="input-field"
                          style={{ padding: "0.35rem 0.5rem", fontSize: "0.8rem", borderRadius: "var(--radius-sm)" }}
                        />
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.85rem" }}>
                        <input
                          type="checkbox"
                          id={`exclude-${campHistory.recipient_id}`}
                          checked={campHistory.exclude_followup || false}
                          onChange={(e) => handleExcludeFollowupChange(campHistory.recipient_id, e.target.checked)}
                          style={{ cursor: "pointer", width: "16px", height: "16px" }}
                        />
                        <label htmlFor={`exclude-${campHistory.recipient_id}`} style={{ fontSize: "0.75rem", cursor: "pointer", fontWeight: "500", userSelect: "none" }}>
                          Exclude Followups
                        </label>
                      </div>
                    </div>

                    {/* Timeline logs */}
                    <div style={{ marginTop: "1rem" }}>
                      <span style={{ fontSize: "0.75rem", fontWeight: "700", color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: "0.5rem" }}>
                        Timeline Events
                      </span>
                      {campHistory.events && campHistory.events.length > 0 ? (
                        <div className="timeline">
                          {campHistory.events.map((evt, idx) => (
                            <div key={idx} className="timeline-item">
                              <span className={`timeline-dot ${evt.event}`}></span>
                              <div className="timeline-header">
                                <span className="timeline-title">{evt.event.toUpperCase()}</span>
                                <span className="timeline-date">
                                  {new Date(evt.timestamp).toLocaleString()}
                                </span>
                              </div>
                              <p className="timeline-desc">{evt.description}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>No events recorded for this recipient.</p>
                      )}
                    </div>

                    {/* Email Copy Expander */}
                    {(campHistory.mail_subject || campHistory.mail_body) && (
                      <details style={{ marginTop: "1.25rem", borderTop: "1px solid var(--border-light)", paddingTop: "0.75rem" }}>
                        <summary style={{ cursor: "pointer", fontSize: "0.8rem", fontWeight: "600", color: "var(--accent-primary)", userSelect: "none" }}>
                          Show Dispatched Email Copy
                        </summary>
                        <div style={{ marginTop: "0.75rem", backgroundColor: "var(--bg-secondary)", padding: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-light)" }}>
                          <div style={{ fontSize: "0.8rem", marginBottom: "0.5rem" }}>
                            <span style={{ color: "var(--text-muted)" }}>Subject: </span>
                            <span style={{ fontWeight: "600", color: "var(--text-primary)" }}>{campHistory.mail_subject}</span>
                          </div>
                          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", whiteSpace: "pre-wrap", fontFamily: "var(--font-sans)", lineHeight: "1.5" }}>
                            {campHistory.mail_body}
                          </div>
                        </div>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ padding: "4rem 2rem", textAlign: "center", color: "var(--text-muted)" }}>
              No profile found.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
