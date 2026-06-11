"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/utils/api";

export default function CampaignDetailPage({ params }) {
  const resolvedParams = use(params);
  const campaignId = resolvedParams.id;
  const router = useRouter();

  const [campaign, setCampaign] = useState(null);
  const [recipients, setRecipients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filtering and active row states
  const [activeTab, setActiveTab] = useState("all"); // "all", "draft", "sent", "failed", "bounces", "ooo", "replied"
  const [expandedRow, setExpandedRow] = useState(null); // recipient ID
  const [pastingReplyRow, setPastingReplyRow] = useState(null); // recipient ID
  
  // Paste reply form state
  const [pastedReplyText, setPastedReplyText] = useState("");
  const [pastedSentiment, setPastedSentiment] = useState("positive");
  const [pastedOooDate, setPastedOooDate] = useState("");
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  // Load campaign metrics and recipients
  const fetchCampaignData = async () => {
    try {
      setLoading(true);
      const data = await api.get(`/api/campaign/${campaignId}`);
      setCampaign(data.campaign);
      setRecipients(data.recipients || []);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to load campaign details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaignData();
  }, [campaignId]);

  // Patch recipient handler (Step 150)
  const handlePatchRecipient = async (rid, patchPayload) => {
    try {
      await api.patch(`/api/recipient/${rid}`, patchPayload);
      
      // Update local state instantly
      setRecipients(prev => 
        prev.map(r => r._id === rid ? { ...r, ...patchPayload } : r)
      );

      // Refresh campaign counters from backend to keep stats accurate
      const data = await api.get(`/api/campaign/${campaignId}`);
      setCampaign(data.campaign);
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to update recipient details.");
    }
  };

  // Submit manual reply payload handler
  const handleSavePastedReply = async (rid) => {
    if (!pastedReplyText.trim()) {
      alert("Please paste the reply text content first.");
      return;
    }

    setIsSubmittingReply(true);
    try {
      const isOoo = pastedOooDate.trim().length > 0;
      const patchPayload = {
        status: isOoo ? "ooo" : "replied",
        reply_sentiment: isOoo ? null : pastedSentiment,
        ooo_return_date: isOoo ? pastedOooDate : null,
        error_message: `Pasted recruiter reply: "${pastedReplyText.slice(0, 100)}..."`
      };

      await handlePatchRecipient(rid, patchPayload);
      setPastingReplyRow(null);
      setPastedReplyText("");
      setPastedOooDate("");
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to save recruiter reply.");
    } finally {
      setIsSubmittingReply(false);
    }
  };

  if (loading) {
    return (
      <div className="loader-container">
        <div className="spinner"></div>
        <p>Loading campaign analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <h3>Campaign Loading Failed</h3>
        <p>{error}</p>
        <button onClick={() => router.push("/")} className="btn btn-secondary" style={{ marginTop: "1rem" }}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  // Filter logic (Step 142 implemented)
  const filteredRecipients = recipients.filter(r => {
    if (activeTab === "all") return true;
    if (activeTab === "bounces") return r.status === "bounced";
    return r.status === activeTab;
  });

  // Calculate campaign metrics for dashboard header counters
  const totalLeads = recipients.length;
  const sentCount = recipients.filter(r => r.status === "sent").length;
  const repliedCount = recipients.filter(r => r.status === "replied").length;
  const oooCount = recipients.filter(r => r.status === "ooo").length;
  const bouncedCount = recipients.filter(r => r.status === "bounced").length;
  const failedCount = recipients.filter(r => r.status === "failed").length;
  const draftCount = recipients.filter(r => r.status === "draft").length;

  return (
    <div className="dashboard-section" style={{ position: "relative" }}>
      
      {/* Campaign Details Header */}
      <div className="section-header" style={{ borderBottom: "1px solid var(--border-light)", paddingBottom: "1.5rem" }}>
        <div>
          <h2 className="section-title">{campaign?.name}</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginTop: "0.25rem" }}>
            Goal: <strong style={{ color: "var(--text-primary)" }}>{campaign?.goal}</strong>
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "0.25rem" }}>
            {campaign?.description}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          {draftCount > 0 && (
            <button 
              onClick={() => router.push(`/campaign/${campaignId}/preview`)}
              className="btn btn-primary"
            >
              Resume Draft Preview ({draftCount})
            </button>
          )}
          <button 
            onClick={() => router.push("/")}
            className="btn btn-secondary"
          >
            Dashboard
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="dashboard-grid" style={{ margin: "2rem 0" }}>
        <div className="card accent-primary">
          <div className="card-label">Total Leads</div>
          <div className="card-value">{totalLeads}</div>
          <div className="card-subtext">Contacts imported</div>
        </div>
        <div className="card accent-cyan">
          <div className="card-label">Sent</div>
          <div className="card-value">{sentCount}</div>
          <div className="card-subtext">Pitches successfully dispatched</div>
        </div>
        <div className="card accent-secondary">
          <div className="card-label">Replies</div>
          <div className="card-value">{repliedCount}</div>
          <div className="card-subtext">Recruiter responses received</div>
        </div>
        <div className="card accent-orange">
          <div className="card-label">Out of Office</div>
          <div className="card-value">{oooCount}</div>
          <div className="card-subtext">OOO auto-replies caught</div>
        </div>
        <div className="card accent-red">
          <div className="card-label">Bounces</div>
          <div className="card-value">{bouncedCount}</div>
          <div className="card-subtext">Delivery bounce-backs</div>
        </div>
      </div>

      {/* Delivery Issue Banner Alerts (Step 149) */}
      {bouncedCount > 0 && (
        <div 
          className="card accent-red" 
          style={{ 
            borderLeft: "4px solid var(--accent-red)", 
            padding: "1rem 1.5rem", 
            marginBottom: "1.5rem",
            backgroundColor: "rgba(239, 68, 68, 0.04)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}
        >
          <span style={{ fontSize: "0.875rem", color: "var(--accent-red)" }}>
            ⚠️ <strong>Delivery Warning:</strong> We detected {bouncedCount} bounced email address(es) in this campaign. Please inspect recruiter records below to adjust.
          </span>
        </div>
      )}

      {/* Filter Tabs (Step 142) */}
      <div 
        style={{ 
          display: "flex", 
          gap: "0.5rem", 
          borderBottom: "1px solid var(--border-light)", 
          paddingBottom: "1px",
          marginBottom: "1.5rem",
          overflowX: "auto"
        }}
      >
        {[
          { key: "all", label: "All Leads", count: totalLeads },
          { key: "draft", label: "Drafts", count: draftCount },
          { key: "sent", label: "Sent", count: sentCount },
          { key: "replied", label: "Replies", count: repliedCount },
          { key: "ooo", label: "OOO", count: oooCount },
          { key: "bounces", label: "Bounces", count: bouncedCount },
          { key: "failed", label: "Failed", count: failedCount }
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "0.75rem 1.25rem",
              backgroundColor: activeTab === tab.key ? "rgba(255,255,255,0.03)" : "transparent",
              color: activeTab === tab.key ? "var(--text-primary)" : "var(--text-secondary)",
              border: "none",
              borderBottom: activeTab === tab.key ? "2px solid var(--accent-primary)" : "2px solid transparent",
              cursor: "pointer",
              fontWeight: "600",
              fontSize: "0.875rem",
              whiteSpace: "nowrap",
              transition: "all var(--transition-fast)"
            }}
          >
            {tab.label} <span style={{ marginLeft: "0.25rem", fontFamily: "var(--font-mono)", opacity: 0.6, fontSize: "0.8rem" }}>({tab.count})</span>
          </button>
        ))}
      </div>

      {/* Recipients Table (Step 143 implemented) */}
      <div className="table-container">
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: "30px" }}></th>
                <th>Recruiter</th>
                <th>Status Override</th>
                <th>Check-back Date</th>
                <th>Exclusions</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecipients.map((rec) => {
                const isExpanded = expandedRow === rec._id;
                const isPasting = pastingReplyRow === rec._id;

                let statusBadgeClass = "status-badge idle";
                if (rec.status === "sent") statusBadgeClass = "status-badge sent";
                else if (rec.status === "replied") statusBadgeClass = "status-badge sent";
                else if (rec.status === "ooo") statusBadgeClass = "status-badge ooo";
                else if (rec.status === "bounced") statusBadgeClass = "status-badge failed";
                else if (rec.status === "failed") statusBadgeClass = "status-badge failed";
                else if (rec.status === "blocked") statusBadgeClass = "status-badge blocked";

                return (
                  <tr key={rec._id} style={{ borderBottom: isExpanded || isPasting ? "none" : "1px solid var(--border-light)" }}>
                    {/* Expander Button (Step 148) */}
                    <td>
                      <button
                        onClick={() => setExpandedRow(isExpanded ? null : rec._id)}
                        className="btn-icon-only"
                        style={{ padding: "0.25rem", transform: isExpanded ? "rotate(90deg)" : "rotate(0)" }}
                      >
                        ▶
                      </button>
                    </td>

                    {/* Recruiter Identity */}
                    <td>
                      <div style={{ fontWeight: "600", color: "var(--text-primary)" }}>{rec.name || "Recruiter"}</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{rec.email}</div>
                    </td>

                    {/* Status Select dropdown override (Step 144 implemented) */}
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span className={`status-badge ${rec.status}`} style={{ padding: "0.15rem 0.4rem", fontSize: "0.7rem", whiteSpace: "nowrap" }}>
                          {rec.status}
                        </span>
                        <select
                          value={rec.status}
                          onChange={(e) => handlePatchRecipient(rec._id, { status: e.target.value })}
                          className="select-field"
                          style={{ padding: "0.25rem 0.4rem", fontSize: "0.8rem", width: "110px" }}
                        >
                          <option value="draft">Draft</option>
                          <option value="sent">Sent</option>
                          <option value="replied">Replied</option>
                          <option value="ooo">OOO</option>
                          <option value="bounced">Bounced</option>
                          <option value="failed">Failed</option>
                          <option value="blocked">Blocked</option>
                        </select>
                      </div>
                    </td>

                    {/* Checkback Date selector (Step 146) */}
                    <td>
                      <input
                        type="date"
                        value={rec.check_back_date || ""}
                        onChange={(e) => handlePatchRecipient(rec._id, { check_back_date: e.target.value })}
                        className="input-field"
                        style={{ padding: "0.35rem 0.5rem", fontSize: "0.85rem", width: "135px" }}
                      />
                    </td>

                    {/* Exclude checkbox (Step 147) */}
                    <td>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={rec.exclude_followup || false}
                          onChange={(e) => handlePatchRecipient(rec._id, { exclude_followup: e.target.checked })}
                          style={{ accentColor: "var(--accent-primary)", width: "15px", height: "15px" }}
                        />
                        Excl. Follow-up
                      </label>
                    </td>

                    {/* Actions panel */}
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: "0.5rem" }}>
                        <button
                          onClick={() => {
                            setPastingReplyRow(isPasting ? null : rec._id);
                            setExpandedRow(null);
                          }}
                          className="btn btn-secondary"
                          style={{ padding: "0.35rem 0.75rem", fontSize: "0.8rem" }}
                        >
                          Paste Reply
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredRecipients.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
                    No contacts found in this list category.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Expanded and Pasting Rows Content */}
      {filteredRecipients.map((rec) => {
        const isExpanded = expandedRow === rec._id;
        const isPasting = pastingReplyRow === rec._id;

        if (isExpanded) {
          return (
            <div 
              key={`exp-${rec._id}`}
              className="card"
              style={{
                margin: "0.5rem 0 1.5rem 0",
                padding: "1.5rem",
                borderTop: "none",
                borderLeft: "4px solid var(--accent-primary)",
                backgroundColor: "rgba(255,255,255,0.01)"
              }}
            >
              <h4 style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: "0.75rem", fontFamily: "var(--font-mono)" }}>
                EMAIL DRAFT SENT / PREVIEW COPY
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <strong style={{ color: "var(--text-primary)", fontSize: "0.85rem" }}>Subject:</strong>
                  <div style={{ fontSize: "0.9rem", marginTop: "0.25rem", fontWeight: "600" }}>
                    {rec.mail_subject || "(No subject drafted)"}
                  </div>
                </div>
                <div>
                  <strong style={{ color: "var(--text-primary)", fontSize: "0.85rem" }}>Body Copy:</strong>
                  <pre 
                    style={{ 
                      fontSize: "0.85rem", 
                      marginTop: "0.25rem", 
                      whiteSpace: "pre-wrap", 
                      lineHeight: "1.6",
                      backgroundColor: "rgba(0,0,0,0.15)",
                      padding: "1rem",
                      borderRadius: "var(--radius-sm)",
                      fontFamily: "inherit"
                    }}
                  >
                    {rec.mail_body || "(No email body drafted)"}
                  </pre>
                </div>
                {rec.error_message && (
                  <div>
                    <strong style={{ color: "var(--accent-red)", fontSize: "0.85rem" }}>Status Details / Log Errors:</strong>
                    <pre style={{ fontSize: "0.8rem", color: "var(--accent-red)", backgroundColor: "rgba(239, 68, 68, 0.05)", padding: "0.75rem", borderRadius: "var(--radius-sm)", marginTop: "0.25rem", overflowX: "auto" }}>
                      {rec.error_message}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          );
        }

        if (isPasting) {
          return (
            <div 
              key={`paste-${rec._id}`}
              className="card"
              style={{
                margin: "0.5rem 0 1.5rem 0",
                padding: "1.5rem",
                borderTop: "none",
                borderLeft: "4px solid var(--accent-cyan)",
                backgroundColor: "rgba(255,255,255,0.01)"
              }}
            >
              {/* Paste Reply Form Drawer (Step 145) */}
              <h4 style={{ fontSize: "0.95rem", fontWeight: "600", color: "var(--text-primary)", marginBottom: "0.75rem" }}>
                Paste Recruiter Response for {rec.email}
              </h4>
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
                Log manually pasted emails to classify sentiment, mark repliability, and trigger appropriate sequences.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div className="form-group">
                  <label className="form-label">Recruiter Email Text</label>
                  <textarea
                    placeholder="Paste the raw text content of the email reply here..."
                    value={pastedReplyText}
                    onChange={(e) => setPastedReplyText(e.target.value)}
                    className="textarea-field"
                    style={{ minHeight: "120px" }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                  <div className="form-group">
                    <label className="form-label">Manual Sentiment Analysis</label>
                    <select
                      value={pastedSentiment}
                      onChange={(e) => setPastedSentiment(e.target.value)}
                      className="select-field"
                    >
                      <option value="positive">Positive / Interested (Follow-up sequences enabled)</option>
                      <option value="negative">Rejection / Not Interested (Stop outreach)</option>
                      <option value="neutral">Neutral / Referral / Informational</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Out of Office Return Date (Optional)</label>
                    <input
                      type="date"
                      value={pastedOooDate}
                      onChange={(e) => setPastedOooDate(e.target.value)}
                      className="input-field"
                      placeholder="YYYY-MM-DD"
                    />
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
                  <button
                    onClick={() => {
                      setPastingReplyRow(null);
                      setPastedReplyText("");
                      setPastedOooDate("");
                    }}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleSavePastedReply(rec._id)}
                    disabled={isSubmittingReply}
                    className="btn btn-primary"
                  >
                    {isSubmittingReply ? "Saving Reply..." : "Log & Save Reply"}
                  </button>
                </div>
              </div>
            </div>
          );
        }

        return null;
      })}

    </div>
  );
}
