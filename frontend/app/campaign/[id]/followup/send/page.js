"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/utils/api";
import ProgressBar from "@/components/ProgressBar";

export default function FollowupSendPage({ params }) {
  const resolvedParams = use(params);
  const campaignId = resolvedParams.id;
  const router = useRouter();

  const [campaign, setCampaign] = useState(null);
  const [followups, setFollowups] = useState([]);
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

  // 1. Initial Load of Campaign and settings
  useEffect(() => {
    async function loadInitialData() {
      try {
        setLoading(true);
        const campaignData = await api.get(`/api/campaign/${campaignId}`);
        setCampaign(campaignData.campaign);
        
        const followupsData = await api.get(`/api/campaign/${campaignId}/followup/preview`);
        setFollowups(followupsData || []);

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
        console.error("Failed to load campaign metadata:", err);
        setErrorDetails(err.message || "Failed to establish initial connection.");
      } finally {
        setLoading(false);
      }
    }
    loadInitialData();
  }, [campaignId]);

  // 2. Poll loop querying metrics every 5 seconds (Step 157 implemented)
  useEffect(() => {
    if (loading || errorDetails) return;

    let prevProcessed = 0;

    const pollStatus = async () => {
      try {
        const progressData = await api.get(`/api/campaign/${campaignId}/followup/progress`);
        setJob(progressData);

        const followupsData = await api.get(`/api/campaign/${campaignId}/followup/preview`);
        setFollowups(followupsData || []);

        // Logging events to local console
        if (progressData.processed > prevProcessed) {
          const newCount = progressData.processed - prevProcessed;
          const freshLogs = [];

          // Find newly processed followups
          const processedList = (followupsData || []).filter(f => f.status !== "draft" && f.status !== "generating");
          processedList.slice(-newCount).forEach(fup => {
            if (fup.status === "sent") {
              freshLogs.push(`[SENT] Dispatched threaded follow-up to ${fup.email}`);
            } else if (fup.status === "failed") {
              freshLogs.push(`[FAILED] Failed sending follow-up to ${fup.email}: ${fup.error_message || "SMTP issue"}`);
            } else if (fup.status === "blocked") {
              freshLogs.push(`[SKIPPED] Follow-up skipped for ${fup.email} (exclusion filter)`);
            }
          });

          if (freshLogs.length > 0) {
            setLogs(prev => [...prev, ...freshLogs]);
          }
          prevProcessed = progressData.processed;
        }

        // Job termination
        if (progressData.status === "completed") {
          setLogs(prev => [...prev, "[SYSTEM] Follow-up queue dispatch finished successfully."]);
          clearInterval(intervalId);
        } else if (progressData.status === "failed") {
          setLogs(prev => [...prev, "[SYSTEM] Follow-up queue aborted due to fatal errors."]);
          setErrorDetails(progressData.errors?.join("\n") || "SMTP credentials login validation failed.");
          clearInterval(intervalId);
        } else if (progressData.status === "aborted") {
          setLogs(prev => [...prev, "[SYSTEM] Follow-up send process stopped by candidate."]);
          clearInterval(intervalId);
        }
      } catch (err) {
        console.error(err);
        setLogs(prev => [...prev, `[WARNING] Network heartbeat drop: ${err.message}`]);
      }
    };

    pollStatus();
    const intervalId = setInterval(pollStatus, 5000);

    return () => clearInterval(intervalId);
  }, [campaignId, loading, errorDetails]);

  // Calculations for layout
  const total = job.total || followups.length || 0;
  const processed = job.processed || 0;
  const sent = job.sent || 0;
  const failed = job.failed || 0;
  const blocked = job.blocked || 0;
  const percent = total > 0 ? Math.round((processed / total) * 100) : 0;

  // Next target tracking
  const pendingDrafts = followups.filter(f => f.status === "draft");
  const currentTarget = pendingDrafts.length > 0 ? pendingDrafts[0] : null;

  // ETA range estimator
  const remainingCount = total - processed;
  const getEtaString = () => {
    if (remainingCount <= 0) return "0 seconds";
    const minSeconds = remainingCount * delaySettings.min;
    const maxSeconds = remainingCount * delaySettings.max;
    
    const formatTime = (seconds) => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      if (mins > 0) return `${mins}m ${secs}s`;
      return `${secs}s`;
    };
    
    return `${formatTime(minSeconds)} - ${formatTime(maxSeconds)}`;
  };

  // Abort handling action trigger (Step 160 implemented)
  const handleAbort = async () => {
    if (!confirm("Are you sure you want to stop the follow-up sending queue? Already sent emails cannot be recalled.")) return;
    setAborting(true);
    try {
      await api.post(`/api/campaign/${campaignId}/followup/abort`, {});
      setLogs(prev => [...prev, "[SYSTEM] Requesting abort from followup dispatch queue..."]);
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to abort sending queue.");
    } finally {
      setAborting(false);
    }
  };

  if (loading) {
    return (
      <div className="loader-container">
        <div className="spinner"></div>
        <p>Loading follow-up sender logs...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-section" style={{ maxWidth: "800px", margin: "2rem auto" }}>
      
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <h2 className="section-title" style={{ color: "var(--accent-secondary)" }}>Follow-up Email Dispatcher</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginTop: "0.25rem" }}>
          Campaign: <strong style={{ color: "var(--text-primary)" }}>{campaign?.name}</strong> | Outbox Sequence Monitor
        </p>
      </div>

      {/* Progress Cards */}
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1.5rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "center", margin: "1rem 0" }}>
          {job.status === "running" ? (
            <div className="spinner" style={{ width: "50px", height: "50px", borderTopColor: "var(--accent-secondary)" }}></div>
          ) : job.status === "completed" ? (
            <div style={{ fontSize: "3.5rem" }}>🎉</div>
          ) : job.status === "aborted" ? (
            <div style={{ fontSize: "3.5rem" }}>🛑</div>
          ) : (
            <div style={{ fontSize: "3.5rem" }}>⚠️</div>
          )}
        </div>

        {/* Progress bar */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", fontSize: "0.9rem", fontFamily: "var(--font-mono)" }}>
            <span>Dispatch Progress: {processed} / {total} Completed</span>
            <span style={{ color: "var(--accent-secondary)", fontWeight: "600" }}>{percent}%</span>
          </div>
          <ProgressBar value={percent} color="linear-gradient(90deg, var(--accent-secondary), var(--accent-cyan))" />
        </div>

        {/* Counter breakdown */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", textAlign: "center", fontSize: "0.85rem", borderTop: "1px solid var(--border-light)", paddingTop: "1rem" }}>
          <div>
            <span style={{ color: "var(--text-secondary)", display: "block" }}>Followups Sent</span>
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

      {/* Active targets & ETA */}
      {job.status === "running" && (
        <div className="card" style={{ padding: "1.25rem", marginBottom: "1.5rem", borderLeft: "4px solid var(--accent-secondary)" }}>
          <h4 style={{ fontSize: "0.9rem", fontWeight: "600", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
            Active Follow-up Dispatch Operations
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
                <span style={{ color: "var(--text-secondary)" }}>Preparing next dispatch...</span>
              </div>
            )}
            <div style={{ marginTop: "0.25rem" }}>
              <span style={{ color: "var(--text-secondary)" }}>Estimated Time Remaining:</span>{" "}
              <strong style={{ color: "var(--accent-cyan)", fontFamily: "var(--font-mono)" }}>{getEtaString()}</strong>
            </div>
          </div>
        </div>
      )}

      {/* Real-time Logs Console */}
      <div className="card" style={{ padding: "1.25rem", marginBottom: "1.5rem" }}>
        <h3 style={{ fontSize: "0.95rem", fontWeight: "600", fontFamily: "var(--font-mono)", marginBottom: "0.75rem", color: "var(--text-secondary)" }}>
          Real-time Thread Dispatch Console
        </h3>
        <div 
          style={{ 
            height: "140px", 
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
            <div style={{ color: "var(--text-muted)" }}>[SYSTEM] Waiting for follow-up dispatch thread status...</div>
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

      {/* Delivery Thread Table (Step 157 & 159 implemented) */}
      <div className="table-container" style={{ marginBottom: "1.5rem" }}>
        <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid var(--border-light)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: "0.95rem", fontWeight: "600" }}>Thread Outbox delivery status</h3>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Follow-ups: {total}</span>
        </div>
        <div className="table-wrapper" style={{ maxHeight: "250px", overflowY: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Recipient</th>
                <th>Status</th>
                <th>Threading Details</th>
              </tr>
            </thead>
            <tbody>
              {followups.map((fup) => {
                let statusClass = "status-badge idle";
                let iconSymbol = "⏳";
                
                if (fup.status === "sent") {
                  statusClass = "status-badge sent";
                  iconSymbol = "✅";
                } else if (fup.status === "failed") {
                  statusClass = "status-badge failed";
                  iconSymbol = "❌";
                } else if (fup.status === "blocked") {
                  statusClass = "status-badge blocked";
                  iconSymbol = "🛡️";
                } else if (fup.status === "draft") {
                  statusClass = "status-badge draft";
                  iconSymbol = "📄";
                }
                
                return (
                  <tr key={fup.id}>
                    <td>
                      <div style={{ fontWeight: "600" }}>{fup.name || "Recruiter"}</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{fup.email}</div>
                    </td>
                    <td>
                      <span className={statusClass}>
                        {iconSymbol} {fup.status}
                      </span>
                    </td>
                    <td style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      {fup.status === "sent" ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                          <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--accent-secondary)" }}>
                            🔗 Thread Linked successfully
                          </span>
                          <span style={{ fontSize: "0.7rem", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                            In-Reply-To Parent Thread
                          </span>
                        </div>
                      ) : fup.status === "failed" ? (
                        <span style={{ color: "var(--accent-red)" }}>{fup.error_message || "SMTP transmission failure"}</span>
                      ) : (
                        "Pending queue dispatch"
                      )}
                    </td>
                  </tr>
                );
              })}
              {followups.length === 0 && (
                <tr>
                  <td colSpan="3" style={{ textAlign: "center", color: "var(--text-muted)", padding: "2rem" }}>
                    No follow-up records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SMTP Issues details card */}
      {errorDetails && (
        <div className="card accent-red" style={{ borderLeft: "4px solid var(--accent-red)", marginBottom: "1.5rem" }}>
          <h4 style={{ color: "var(--accent-red)", fontWeight: "600", fontSize: "0.95rem" }}>
            Outbound Thread Sender Exception
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
          <button onClick={() => router.push("/settings")} className="btn btn-secondary" style={{ marginTop: "1rem", fontSize: "0.8rem", padding: "0.4rem 0.8rem" }}>
            Fix SMTP Settings
          </button>
        </div>
      )}

      {/* Control Buttons (Step 160 implemented) */}
      <div style={{ display: "flex", gap: "1rem", justifyContent: "center", marginTop: "1rem" }}>
        {job.status === "running" ? (
          <button 
            onClick={handleAbort} 
            disabled={aborting}
            className="btn btn-secondary" 
            style={{ color: "var(--accent-red)", borderColor: "rgba(239, 68, 68, 0.25)" }}
          >
            {aborting ? "Stopping Queue..." : "Stop Follow-up Queue"}
          </button>
        ) : (
          <button 
            onClick={() => router.push(`/campaign/${campaignId}`)} 
            className="btn btn-primary"
            style={{ backgroundColor: "var(--accent-secondary)" }}
          >
            View Campaign Details
          </button>
        )}
        <button onClick={() => router.push("/")} className="btn btn-secondary">
          Dashboard
        </button>
      </div>

    </div>
  );
}
