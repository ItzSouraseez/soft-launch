"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/utils/api";
import ConfirmModal from "@/components/ConfirmModal";

export default function FollowupPreviewPage({ params }) {
  const resolvedParams = use(params);
  const campaignId = resolvedParams.id;
  const router = useRouter();

  const [campaign, setCampaign] = useState(null);
  const [followups, setFollowups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // States for modals & saving indicators
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [sendingQueue, setSendingQueue] = useState(false);
  const [savingIds, setSavingIds] = useState(new Set());

  // Load campaign and follow-up drafts
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const campaignData = await api.get(`/api/campaign/${campaignId}`);
        setCampaign(campaignData.campaign);
        
        const followupsData = await api.get(`/api/campaign/${campaignId}/followup/preview`);
        setFollowups(followupsData || []);
      } catch (err) {
        console.error(err);
        setError(err.message || "Failed to load follow-up drafts.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [campaignId]);

  // Handle local text changes
  const handleFieldChange = (fid, field, value) => {
    setFollowups(prev =>
      prev.map(f => f.id === fid ? { ...f, [field]: value } : f)
    );
  };

  // Wire input fields to auto-save triggers via PUT (Step 156 implemented)
  const handleAutoSave = async (fid) => {
    const fup = followups.find(f => f.id === fid);
    if (!fup) return;

    setSavingIds(prev => {
      const next = new Set(prev);
      next.add(fid);
      return next;
    });

    try {
      await api.put(`/api/followup/${fid}`, {
        mail_subject: fup.mail_subject,
        mail_body: fup.mail_body
      });
      console.log(`Follow-up draft ${fid} auto-saved successfully.`);
    } catch (err) {
      console.error(`Auto-save failed for follow-up ${fid}:`, err);
    } finally {
      setSavingIds(prev => {
        const next = new Set(prev);
        next.delete(fid);
        return next;
      });
    }
  };

  // Delete/Exclude single draft handler
  const handleDeleteDraft = async (fid) => {
    if (!confirm("Are you sure you want to discard this follow-up email draft?")) return;

    try {
      await api.delete(`/api/followup/${fid}`);
      setFollowups(prev => prev.filter(f => f.id !== fid));
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to delete follow-up draft.");
    }
  };

  // Confirm sending bulk handler (Step 158 implemented)
  const handleConfirmSend = async () => {
    setIsSendModalOpen(false);
    setSendingQueue(true);
    try {
      await api.post(`/api/campaign/${campaignId}/followup/send`, {});
      router.push(`/campaign/${campaignId}/followup/send`);
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to launch follow-up sending queue.");
      setSendingQueue(false);
    }
  };

  if (loading) {
    return (
      <div className="loader-container">
        <div className="spinner"></div>
        <p>Loading follow-up drafts for verification...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <h3>Follow-up Drafts Load Failed</h3>
        <p>{error}</p>
        <button onClick={() => router.push(`/campaign/${campaignId}`)} className="btn btn-secondary" style={{ marginTop: "1rem" }}>
          Back to Campaign Details
        </button>
      </div>
    );
  }

  const drafts = followups.filter(f => f.status === "draft" || f.status === "generating");
  const failed = followups.filter(f => f.status === "failed");
  const readyToSend = drafts.length;

  return (
    <div className="dashboard-section" style={{ position: "relative" }}>
      
      <div className="section-header">
        <div>
          <h2 className="section-title">Verify Follow-up Sequence</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
            Campaign: <strong style={{ color: "var(--text-primary)" }}>{campaign?.name}</strong> | Review follow-up emails before thread dispatch.
          </p>
        </div>
        <button 
          onClick={() => setIsSendModalOpen(true)} 
          disabled={readyToSend === 0 || sendingQueue} 
          className="btn btn-primary"
          style={{ backgroundColor: "var(--accent-secondary)", boxShadow: "0 0 12px rgba(16, 185, 129, 0.2)" }}
        >
          {sendingQueue ? "Launching Queue..." : `Dispatch Follow-ups (${readyToSend})`}
        </button>
      </div>

      {/* Render Drafts List Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "2rem", marginTop: "1.5rem" }}>
        
        {/* Failed Generations Panel */}
        {failed.map((fup) => (
          <div key={fup.id} className="card accent-red" style={{ borderLeft: "4px solid var(--accent-red)", padding: "1.5rem" }}>
            <div style={{ display: "flex", justifySelf: "space-between", alignSelf: "flex-start", marginBottom: "1rem" }}>
              <div>
                <h4 style={{ fontSize: "1rem", fontWeight: "600" }}>{fup.name || "Recruiter"}</h4>
                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>&lt;{fup.email}&gt;</span>
              </div>
              <span className="status-badge failed">Generation Failed</span>
            </div>
            <pre style={{ padding: "0.75rem", backgroundColor: "rgba(0,0,0,0.2)", borderRadius: "var(--radius-sm)", fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--accent-red)", overflowX: "auto", whiteSpace: "pre-wrap" }}>
              {fup.error_message || "Groq key rate limited or returned invalid response format."}
            </pre>
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
              <button 
                type="button" 
                onClick={() => handleDeleteDraft(fup.id)} 
                className="btn btn-secondary" 
                style={{ fontSize: "0.8rem", padding: "0.4rem 0.8rem", color: "var(--accent-red)", borderColor: "rgba(239, 68, 68, 0.2)" }}
              >
                Discard Draft
              </button>
            </div>
          </div>
        ))}

        {/* Draft List Cards */}
        {drafts.length === 0 && failed.length === 0 ? (
          <div className="card" style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
            <h4>No follow-up drafts available in review list.</h4>
            <p style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>
              Go back to campaign page to check back dates or launch sequences.
            </p>
            <button onClick={() => router.push(`/campaign/${campaignId}`)} className="btn btn-secondary" style={{ marginTop: "1rem" }}>
              Back to Campaign Details
            </button>
          </div>
        ) : (
          drafts.map((fup) => {
            const isSaving = savingIds.has(fup.id);

            return (
              <div key={fup.id} className="card" style={{ display: "flex", flexDirection: "column", gap: "1.25rem", padding: "1.75rem" }}>
                
                {/* Draft Card Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid var(--border-light)", paddingBottom: "1rem" }}>
                  <div>
                    <h4 style={{ fontSize: "1.05rem", fontWeight: "700" }}>{fup.name || "Recruiter"}</h4>
                    <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>&lt;{fup.email}&gt;</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    {isSaving && (
                      <span style={{ fontSize: "0.75rem", color: "var(--accent-cyan)", fontFamily: "var(--font-mono)" }}>
                        Auto-saving...
                      </span>
                    )}
                    <button 
                      type="button" 
                      onClick={() => handleDeleteDraft(fup.id)} 
                      className="btn btn-secondary" 
                      style={{ padding: "0.35rem 0.75rem", fontSize: "0.75rem", color: "var(--accent-red)", borderColor: "rgba(239, 68, 68, 0.15)" }}
                    >
                      Discard
                    </button>
                  </div>
                </div>

                {/* Subject and body textareas (Step 156) */}
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Subject Line (Will thread inside parent message)
                  </label>
                  <input 
                    type="text" 
                    value={fup.mail_subject || ""} 
                    onChange={(e) => handleFieldChange(fup.id, "mail_subject", e.target.value)}
                    onBlur={() => handleAutoSave(fup.id)}
                    className="input-field" 
                    style={{ fontWeight: "600" }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Follow-up Body Copy
                  </label>
                  <textarea 
                    value={fup.mail_body || ""} 
                    onChange={(e) => handleFieldChange(fup.id, "mail_body", e.target.value)}
                    onBlur={() => handleAutoSave(fup.id)}
                    className="textarea-field" 
                    style={{ minHeight: "150px", lineHeight: "1.6", fontSize: "0.9rem" }}
                  />
                </div>

              </div>
            );
          })
        )}

      </div>

      {/* Confirmation Send Outbound Modal (Step 158) */}
      <ConfirmModal 
        isOpen={isSendModalOpen}
        title="Confirm Follow-up Sequence Dispatch"
        message={`You are about to launch threaded follow-up emails to ${readyToSend} recruiter contacts. This sequence will send pitches with configured random delay limits to ensure thread safety.`}
        onConfirm={handleConfirmSend}
        onCancel={() => setIsSendModalOpen(false)}
        confirmLabel="Launch Threaded Sends"
        cancelLabel="Review Drafts"
      />

    </div>
  );
}
