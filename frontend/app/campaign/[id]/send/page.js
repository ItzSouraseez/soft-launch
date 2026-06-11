"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/utils/api";
import ProgressBar from "@/components/ProgressBar";

export default function CampaignSendPage({ params }) {
  const resolvedParams = use(params);
  const campaignId = resolvedParams.id;
  const router = useRouter();

  const [campaign, setCampaign] = useState(null);
  const [recipients, setRecipients] = useState([]);
  const [job, setJob] = useState({
    status: "idle",
    total: 0,
    processed: 0,
    sent: 0,
    failed: 0,
    blocked: 0,
    errors: []
  });
  
  const [delaySettings, setDelaySettings] = useState({ min: 30, max: 60 });
  const [logs, setLogs] = useState([]);
  const [errorDetails, setErrorDetails] = useState("");
  const [aborting, setAborting] = useState(false);
  const [loading, setLoading] = useState(true);

  // 1. Initial Load of Campaign and Delay Settings
  useEffect(() => {
    async function loadInitialData() {
      try {
        setLoading(true);
        const data = await api.get(`/api/campaign/${campaignId}`);
        setCampaign(data.campaign);
        setRecipients(data.recipients || []);
        
        // Fetch delay configurations to map ETA accurately
        try {
          const settings = await api.get("/api/settings");
          if (settings.send_delay_min !== undefined && settings.send_delay_max !== undefined) {
            setDelaySettings({
              min: Number(settings.send_delay_min),
              max: Number(settings.send_delay_max)
            });
          }
        } catch (settingsErr) {
          console.error("Failed to load settings delays:", settingsErr);
        }
      } catch (err) {
        console.error("Failed to load initial data:", err);
        setErrorDetails(err.message || "Failed to establish initial connection.");
      } finally {
        setLoading(false);
      }
    }
    loadInitialData();
  }, [campaignId]);

  // 2. Poll loop querying metrics every 5 seconds (Step 132 implemented)
  useEffect(() => {
    if (loading || errorDetails) return;

    let prevProcessed = 0;

    const pollStatus = async () => {
      try {
        // Query backend dispatch progress
        const progressData = await api.get(`/api/campaign/${campaignId}/progress`);
        setJob(progressData);

        // Also refresh recipients list to show detailed rows of processed emails
        const campaignData = await api.get(`/api/campaign/${campaignId}`);
        setRecipients(campaignData.recipients || []);

        // Logging output to screen console
        if (progressData.processed > prevProcessed) {
          const newProcessedCount = progressData.processed - prevProcessed;
          const freshLogs = [];
          
          // Find newly processed recipients
          const processedRecipients = (campaignData.recipients || [])
            .filter(r => r.status !== "draft" && r.status !== "generating");
            
          // Add log messages for newly processed items
          processedRecipients.slice(-newProcessedCount).forEach(rec => {
            if (rec.status === "sent") {
              freshLogs.push(`[SENT] Successfully dispatched pitch to ${rec.email}`);
            } else if (rec.status === "blocked") {
              freshLogs.push(`[SKIPPED] Skipped recipient ${rec.email} (domain blocked or manually excluded)`);
            } else if (rec.status === "failed") {
              freshLogs.push(`[FAILED] Failed sending to ${rec.email}: ${rec.error_message || "SMTP transmission failure"}`);
            }
          });

          if (freshLogs.length > 0) {
            setLogs(prev => [...prev, ...freshLogs]);
          }
          prevProcessed = progressData.processed;
        }

        // Handle termination or completion transitions
        if (progressData.status === "completed") {
          setLogs(prev => [...prev, "[SYSTEM] Email queue processing completed.", "[SYSTEM] All eligible drafts have been dispatched."]);
          clearInterval(intervalId);
        } else if (progressData.status === "failed") {
          setLogs(prev => [...prev, "[SYSTEM] Email queue failed or aborted."]);
          setErrorDetails(progressData.errors?.join("\n") || "SMTP connection failure or credentials missing.");
          clearInterval(intervalId);
        } else if (progressData.status === "aborted") {
          setLogs(prev => [...prev, "[SYSTEM] Sending process aborted by the candidate."]);
          clearInterval(intervalId);
        }
      } catch (err) {
        console.error("Failed to poll campaign progress:", err);
        setLogs(prev => [...prev, `[WARNING] Network heartbeat drop: ${err.message}`]);
      }
    };

    // Run first poll immediately
    pollStatus();

    const intervalId = setInterval(pollStatus, 5000);

    return () => clearInterval(intervalId);
  }, [campaignId, loading, errorDetails]);

  // Calculations for layout
  const total = job.total || recipients.length || 0;
  const processed = job.processed || 0;
  const sent = job.sent || 0;
  const failed = job.failed || 0;
  const blocked = job.blocked || 0;
  const percent = total > 0 ? Math.round((processed / total) * 100) : 0;

  // Determine current active target recipient (Step 133 implemented)
  const draftRecipients = recipients.filter(r => r.status === "draft");
  const currentTarget = draftRecipients.length > 0 ? draftRecipients[0] : null;

  // ETA calculation mapping remaining counts to delays settings (Step 134 implemented)
  const remainingCount = total - processed;
  const getEtaString = () => {
    if (remainingCount <= 0) return "0 seconds";
    const minSeconds = remainingCount * delaySettings.min;
    const maxSeconds = remainingCount * delaySettings.max;
    
    const formatTime = (totalSeconds) => {
      const mins = Math.floor(totalSeconds / 60);
      const secs = Math.floor(totalSeconds % 60);
      if (mins > 0) {
        return `${mins}m ${secs}s`;
      }
      return `${secs}s`;
    };
    
    return `${formatTime(minSeconds)} - ${formatTime(maxSeconds)}`;
  };

  // Abort handling action trigger (Step 139)
  const handleAbort = async () => {
    if (!confirm("Are you sure you want to stop the bulk send queue? Any already sent emails cannot be recalled.")) return;
    setAborting(true);
    try {
      await api.post(`/api/campaign/${campaignId}/abort`, {});
      setLogs(prev => [...prev, "[SYSTEM] Requesting abort from mail dispatch queue..."]);
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to abort sending queue. It may have already completed.");
    } finally {
      setAborting(false);
    }
  };

  if (loading) {
    return (
      <div className="loader-container">
        <div className="spinner"></div>
        <p>Initializing email sender dispatcher...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-section" style={{ maxWidth: "800px", margin: "2rem auto" }}>
      
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <h2 className="section-title">Outbound Email Dispatcher</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginTop: "0.25rem" }}>
          Campaign: <strong style={{ color: "var(--text-primary)" }}>{campaign?.name}</strong>
        </p>
      </div>

      {/* Progress Cards */}
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1.5rem", marginBottom: "1.5rem" }}>
        
        {/* State Indicators */}
        <div style={{ display: "flex", justifyContent: "center", margin: "1rem 0" }}>
          {job.status === "running" ? (
            <div className="spinner" style={{ width: "50px", height: "50px" }}></div>
          ) : job.status === "completed" ? (
            <div style={{ fontSize: "3.5rem" }}>🎉</div>
          ) : job.status === "aborted" ? (
            <div style={{ fontSize: "3.5rem" }}>🛑</div>
          ) : (
            <div style={{ fontSize: "3.5rem" }}>⚠️</div>
          )}
        </div>

        {/* Progress Bar & Percentage */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", fontSize: "0.9rem", fontFamily: "var(--font-mono)" }}>
            <span>Progress: {processed} / {total} Dispatched</span>
            <span style={{ color: "var(--accent-primary)", fontWeight: "600" }}>{percent}%</span>
          </div>
          <ProgressBar value={percent} />
        </div>

        {/* Stats breakdown */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", textAlign: "center", fontSize: "0.85rem", borderTop: "1px solid var(--border-light)", paddingTop: "1rem" }}>
          <div>
            <span style={{ color: "var(--text-secondary)", display: "block" }}>Sent</span>
            <strong style={{ fontSize: "1.2rem", color: "var(--accent-secondary)", fontFamily: "var(--font-mono)" }}>{sent}</strong>
          </div>
          <div>
            <span style={{ color: "var(--text-secondary)", display: "block" }}>Skipped</span>
            <strong style={{ fontSize: "1.2rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{blocked}</strong>
          </div>
          <div>
            <span style={{ color: "var(--text-secondary)", display: "block" }}>Failed</span>
            <strong style={{ fontSize: "1.2rem", color: "var(--accent-red)", fontFamily: "var(--font-mono)" }}>{failed}</strong>
          </div>
        </div>
      </div>

      {/* Current Target Card (Step 133) & ETA Indicator (Step 134) */}
      {job.status === "running" && (
        <div className="card" style={{ padding: "1.25rem", marginBottom: "1.5rem", borderLeft: "4px solid var(--accent-primary)" }}>
          <h4 style={{ fontSize: "0.9rem", fontWeight: "600", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
            Active Dispatch Operations
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
            {currentTarget ? (
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Current Target:</span>{" "}
                <strong style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
                  {currentTarget.name ? `${currentTarget.name} <${currentTarget.email}>` : currentTarget.email}
                </strong>
              </div>
            ) : (
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Preparing next recipient...</span>
              </div>
            )}
            <div style={{ marginTop: "0.25rem" }}>
              <span style={{ color: "var(--text-secondary)" }}>Estimated Time Remaining:</span>{" "}
              <strong style={{ color: "var(--accent-cyan)", fontFamily: "var(--font-mono)" }}>{getEtaString()}</strong>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block", marginTop: "0.25rem" }}>
                Based on SMTP security delays of {delaySettings.min}s - {delaySettings.max}s per email.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Logs Console Panel */}
      <div className="card" style={{ padding: "1.25rem", marginBottom: "1.5rem" }}>
        <h3 style={{ fontSize: "0.95rem", fontWeight: "600", fontFamily: "var(--font-mono)", marginBottom: "0.75rem", color: "var(--text-secondary)" }}>
          Real-time Dispatch Console Logs
        </h3>
        <div 
          style={{ 
            height: "150px", 
            overflowY: "auto", 
            backgroundColor: "rgba(0,0,0,0.3)", 
            borderRadius: "var(--radius-sm)", 
            padding: "0.75rem 1rem", 
            fontFamily: "var(--font-mono)", 
            fontSize: "0.75rem", 
            lineHeight: "1.5",
            display: "flex",
            flexDirection: "column",
            gap: "0.35rem"
          }}
        >
          {logs.length === 0 ? (
            <div style={{ color: "var(--text-muted)" }}>[SYSTEM] Waiting for dispatch loop status...</div>
          ) : (
            logs.map((log, index) => {
              let color = "var(--text-secondary)";
              if (log.startsWith("[SENT]")) color = "var(--accent-secondary)";
              if (log.startsWith("[FAILED]")) color = "var(--accent-red)";
              if (log.startsWith("[SYSTEM]")) color = "var(--accent-cyan)";
              if (log.startsWith("[SKIPPED]")) color = "var(--text-muted)";
              
              return <div key={index} style={{ color }}>{log}</div>;
            })
          )}
        </div>
      </div>

      {/* Active Sending Rows / Recipients Table (Steps 135 & 136) */}
      <div className="table-container" style={{ marginBottom: "1.5rem" }}>
        <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid var(--border-light)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: "0.95rem", fontWeight: "600" }}>Outbox Delivery Statuses</h3>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Total Leads: {total}</span>
        </div>
        <div className="table-wrapper" style={{ maxHeight: "250px", overflowY: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Recipient</th>
                <th>Status</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {recipients.map((rec) => {
                let statusClass = "status-badge idle";
                let iconSymbol = "⏳";
                
                if (rec.status === "sent") {
                  statusClass = "status-badge sent";
                  iconSymbol = "✅";
                } else if (rec.status === "failed") {
                  statusClass = "status-badge failed";
                  iconSymbol = "❌";
                } else if (rec.status === "blocked") {
                  statusClass = "status-badge blocked";
                  iconSymbol = "🛡️";
                } else if (rec.status === "draft") {
                  statusClass = "status-badge draft";
                  iconSymbol = "📄";
                }
                
                return (
                  <tr key={rec._id}>
                    <td>
                      <div style={{ fontWeight: "600" }}>{rec.name || "Recruiter"}</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{rec.email}</div>
                    </td>
                    <td>
                      <span className={statusClass}>
                        {iconSymbol} {rec.status}
                      </span>
                    </td>
                    <td style={{ fontSize: "0.85rem", color: rec.status === "failed" ? "var(--accent-red)" : "var(--text-secondary)" }}>
                      {rec.status === "sent" && rec.message_id && (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>Msg-ID: {rec.message_id.slice(0, 15)}...</span>
                      )}
                      {rec.status === "failed" && (rec.error_message || "SMTP Login failure")}
                      {rec.status === "blocked" && (rec.error_message || "Domain blacklisted")}
                      {rec.status === "draft" && "Pending in queue"}
                    </td>
                  </tr>
                );
              })}
              {recipients.length === 0 && (
                <tr>
                  <td colSpan="3" style={{ textAlign: "center", color: "var(--text-muted)", padding: "2rem" }}>
                    No recipient records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Connection Failure Panel / Errors (Step 140) */}
      {errorDetails && (
        <div className="card accent-red" style={{ borderLeft: "4px solid var(--accent-red)", marginBottom: "1.5rem" }}>
          <h4 style={{ color: "var(--accent-red)", fontWeight: "600", fontSize: "0.95rem" }}>
            Critical Outbound Error Encountered
          </h4>
          <pre 
            style={{ 
              marginTop: "0.75rem", 
              padding: "0.75rem", 
              backgroundColor: "rgba(0,0,0,0.2)", 
              borderRadius: "var(--radius-sm)", 
              fontSize: "0.75rem", 
              fontFamily: "var(--font-mono)", 
              overflowX: "auto",
              whiteSpace: "pre-wrap"
            }}
          >
            {errorDetails}
          </pre>
          <button 
            onClick={() => router.push("/settings")} 
            className="btn btn-secondary" 
            style={{ marginTop: "1rem", fontSize: "0.8rem", padding: "0.4rem 0.8rem" }}
          >
            Fix SMTP Settings
          </button>
        </div>
      )}

      {/* Control Buttons (Step 137, 139) */}
      <div style={{ display: "flex", gap: "1rem", justifyContent: "center", marginTop: "1rem" }}>
        {job.status === "running" ? (
          <button 
            onClick={handleAbort} 
            disabled={aborting}
            className="btn btn-secondary" 
            style={{ color: "var(--accent-red)", borderColor: "rgba(239, 68, 68, 0.25)" }}
          >
            {aborting ? "Stopping Queue..." : "Stop Sending Queue"}
          </button>
        ) : (
          <button 
            onClick={() => router.push(`/campaign/${campaignId}`)} 
            className="btn btn-primary"
          >
            View Campaign Details
          </button>
        )}
        <button 
          onClick={() => router.push("/")} 
          className="btn btn-secondary"
        >
          Back to Dashboard
        </button>
      </div>

    </div>
  );
}
