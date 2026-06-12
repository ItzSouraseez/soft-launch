"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/utils/api";
import ConfirmModal from "@/components/ConfirmModal";

export default function CampaignPreviewPage({ params }) {
  const resolvedParams = use(params);
  const campaignId = resolvedParams.id;
  const router = useRouter();

  const [campaign, setCampaign] = useState(null);
  const [recipients, setRecipients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Modals and action loading states
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [sendingQueue, setSendingQueue] = useState(false);
  const [regeneratingIds, setRegeneratingIds] = useState(new Set());
  const [savingIds, setSavingIds] = useState(new Set());

  useEffect(() => {
    async function loadCampaignData() {
      try {
        setLoading(true);
        const data = await api.get(`/api/campaign/${campaignId}`);
        setCampaign(data.campaign);
        setRecipients(data.recipients || []);
      } catch (err) {
        console.error(err);
        setError(err.message || "Failed to load campaign drafts.");
      } finally {
        setLoading(false);
      }
    }
    loadCampaignData();
  }, [campaignId]);

  const handleFieldChange = (rid, field, value) => {
    setRecipients(prev => 
      prev.map(r => r._id === rid ? { ...r, [field]: value } : r)
    );
  };

  const handleAutoSave = async (rid) => {
    const rec = recipients.find(r => r._id === rid);
    if (!rec) return;

    setSavingIds(prev => {
      const next = new Set(prev);
      next.add(rid);
      return next;
    });

    try {
      await api.patch(`/api/recipient/${rid}`, {
        mail_subject: rec.mail_subject,
        mail_body: rec.mail_body
      });
      console.log(`Draft for ${rec.email} auto-saved successfully.`);
    } catch (err) {
      console.error(`Auto-save failed for recipient ${rid}:`, err);
    } finally {
      setSavingIds(prev => {
        const next = new Set(prev);
        next.delete(rid);
        return next;
      });
    }
  };

  const handleRegenerate = async (rid) => {
    setRegeneratingIds(prev => {
      const next = new Set(prev);
      next.add(rid);
      return next;
    });

    try {
      const res = await api.post(`/api/campaign/${campaignId}/recipient/${rid}/regenerate`, {});
      setRecipients(prev => 
        prev.map(r => r._id === rid ? res.recipient : r)
      );
    } catch (err) {
      console.error(err);
      alert(err.message || "Email regeneration failed.");
    } finally {
      setRegeneratingIds(prev => {
        const next = new Set(prev);
        next.delete(rid);
        return next;
      });
    }
  };

  const handleRemoveRecipient = async (rid) => {
    if (!confirm("Are you sure you want to exclude this recruiter from the campaign list?")) return;

    try {
      // Exclude by updating status to blocked (so they are skipped during send)
      const res = await api.patch(`/api/recipient/${rid}`, {
        status: "blocked",
        error_message: "Excluded by candidate during draft review."
      });
      
      setRecipients(prev => 
        prev.map(r => r._id === rid ? { ...r, status: "blocked", error_message: res.error_message } : r)
      );
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to exclude recipient.");
    }
  };

  const handleConfirmSend = async () => {
    setIsSendModalOpen(false);
    setSendingQueue(true);
    try {
      await api.post(`/api/campaign/${campaignId}/send`, {});
      router.push(`/campaign/${campaignId}/send`);
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to launch sending queue.");
      setSendingQueue(false);
    }
  };

  if (loading) {
    return (
      <div className="loader-container">
        <div className="spinner"></div>
        <p>Loading email drafts for verification...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <h3>Campaign Load Failed</h3>
        <p>{error}</p>
        <button onClick={() => router.push("/")} className="btn btn-secondary" style={{ marginTop: "1rem" }}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  // Filter recipients lists
  const drafts = recipients.filter(r => r.status === "draft");
  const failed = recipients.filter(r => r.status === "failed");
  const blocked = recipients.filter(r => r.status === "blocked");
  
  const totalLeads = recipients.length;
  const readyToSend = drafts.length;

  return (
    <div className="dashboard-section" style={{ position: "relative" }}>
      
      <div className="section-header">
        <div>
          <h2 className="section-title">Review Email Drafts</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
            Campaign: <strong style={{ color: "var(--text-primary)" }}>{campaign?.name}</strong> | Verify generated copy before dispatch.
          </p>
        </div>
        <button 
          onClick={() => setIsSendModalOpen(true)} 
          disabled={readyToSend === 0 || sendingQueue} 
          className="btn btn-primary"
        >
          {sendingQueue ? "Launching Queue..." : `Send Outbound Queue (${readyToSend})`}
        </button>
      </div>

      {/* Blocked Exclusions Banner Indicator */}
      {blocked.length > 0 && (
        <div 
          className="card" 
          style={{ 
            padding: "1rem 1.5rem", 
            borderLeft: "4px solid var(--text-muted)", 
            backgroundColor: "rgba(255,255,255,0.01)",
            fontSize: "0.85rem",
            color: "var(--text-secondary)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}
        >
          <span>
            🛡️ <strong>Exclusions:</strong> {blocked.length} recruiter contacts skipped due to domain block filters or manual skips.
          </span>
        </div>
      )}

      {/* Campaign Details Sub-goals details card */}
      <div className="card" style={{ padding: "1.25rem" }}>
        <h4 style={{ fontSize: "0.95rem", fontWeight: "600", fontFamily: "var(--font-mono)", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
          Target Pitch Alignment
        </h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          <div>
            <strong style={{ color: "var(--text-primary)", display: "block", marginBottom: "0.25rem" }}>Company Domain / Target Context:</strong>
            {campaign?.description || "No company background provided."}
          </div>
          <div>
            <strong style={{ color: "var(--text-primary)", display: "block", marginBottom: "0.25rem" }}>Campaign Objective:</strong>
            {campaign?.goal}
          </div>
        </div>
      </div>

      {/* Render Drafts List Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "2rem", marginTop: "1rem" }}>
        
        {/* Failed Generations Panel */}
        {failed.map((rec) => (
          <div key={rec._id} className="card accent-red" style={{ borderLeft: "4px solid var(--accent-red)", padding: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
              <div>
                <h4 style={{ fontSize: "1rem", fontWeight: "600" }}>{rec.name || "Recruiter"}</h4>
                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>&lt;{rec.email}&gt;</span>
              </div>
              <span className="status-badge failed">Generation Failed</span>
            </div>
            <pre style={{ padding: "0.75rem", backgroundColor: "rgba(0,0,0,0.2)", borderRadius: "var(--radius-sm)", fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--accent-red)", overflowX: "auto", whiteSpace: "pre-wrap" }}>
              {rec.error_message || "Groq key rate limited or returned invalid JSON format."}
            </pre>
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
              <button 
                type="button" 
                onClick={() => handleRegenerate(rec._id)} 
                disabled={regeneratingIds.has(rec._id)} 
                className="btn btn-secondary" 
                style={{ fontSize: "0.8rem", padding: "0.4rem 0.8rem" }}
              >
                {regeneratingIds.has(rec._id) ? "Regenerating..." : "Retry Formulate"}
              </button>
              <button 
                type="button" 
                onClick={() => handleRemoveRecipient(rec._id)} 
                className="btn btn-secondary" 
                style={{ fontSize: "0.8rem", padding: "0.4rem 0.8rem", color: "var(--accent-red)", borderColor: "rgba(239, 68, 68, 0.2)" }}
              >
                Exclude Recipient
              </button>
            </div>
          </div>
        ))}

        {/* Draft List Cards */}
        {drafts.length === 0 && failed.length === 0 ? (
          <div className="card" style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
            <h4>No draft emails available in review list.</h4>
            <p style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>
              Verify if other recipients are already sent, or configure exclusions settings.
            </p>
            <button onClick={() => router.push("/")} className="btn btn-secondary" style={{ marginTop: "1rem" }}>
              Back to Dashboard
            </button>
          </div>
        ) : (
          drafts.map((rec) => {
            const isRegenerating = regeneratingIds.has(rec._id);
            const isSaving = savingIds.has(rec._id);

            return (
              <div key={rec._id} className="card" style={{ display: "flex", flexDirection: "column", gap: "1.25rem", padding: "1.75rem" }}>
                
                {/* Draft Card Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid var(--border-light)", paddingBottom: "1rem" }}>
                  <div>
                    <h4 style={{ fontSize: "1.05rem", fontWeight: "700" }}>{rec.name || "Recruiter"}</h4>
                    <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>&lt;{rec.email}&gt;</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    {isSaving && (
                      <span style={{ fontSize: "0.75rem", color: "var(--accent-cyan)", fontFamily: "var(--font-mono)" }}>
                        Auto-saving...
                      </span>
                    )}
                    <button 
                      type="button" 
                      onClick={() => handleRegenerate(rec._id)} 
                      disabled={isRegenerating} 
                      className="btn btn-secondary" 
                      style={{ padding: "0.35rem 0.75rem", fontSize: "0.75rem" }}
                    >
                      {isRegenerating ? "Formulating..." : "Regenerate Pitch"}
                    </button>
                    <button 
                      type="button" 
                      onClick={() => handleRemoveRecipient(rec._id)} 
                      className="btn btn-secondary" 
                      style={{ padding: "0.35rem 0.75rem", fontSize: "0.75rem", color: "var(--accent-red)", borderColor: "rgba(239, 68, 68, 0.15)" }}
                    >
                      Exclude
                    </button>
                  </div>
                </div>

                {/* Subject and body textareas */}
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Subject Line
                  </label>
                  <input 
                    type="text" 
                    value={rec.mail_subject || ""} 
                    onChange={(e) => handleFieldChange(rec._id, "mail_subject", e.target.value)}
                    onBlur={() => handleAutoSave(rec._id)}
                    className="input-field" 
                    style={{ fontWeight: "600" }}
                    disabled={isRegenerating}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Email Body Copy
                  </label>
                  <textarea 
                    value={rec.mail_body || ""} 
                    onChange={(e) => handleFieldChange(rec._id, "mail_body", e.target.value)}
                    onBlur={() => handleAutoSave(rec._id)}
                    className="textarea-field" 
                    style={{ minHeight: "150px", lineHeight: "1.6", fontSize: "0.9rem" }}
                    disabled={isRegenerating}
                  />
                </div>

              </div>
            );
          })
        )}

      </div>

      {/* Confirmation Send Outbound Modal */}
      <ConfirmModal 
        isOpen={isSendModalOpen}
        title="Confirm Campaign Dispatch"
        message={`You are about to launch bulk cold outreach emails to ${readyToSend} recruiter contacts. This sequence will send pitches with configured random delay limits to ensure delivery safety.`}
        onConfirm={handleConfirmSend}
        onCancel={() => setIsSendModalOpen(false)}
        confirmLabel="Launch Outbound Send"
        cancelLabel="Review Drafts"
      />

    </div>
  );
}
