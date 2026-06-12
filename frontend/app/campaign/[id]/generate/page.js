"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/utils/api";
import ProgressBar from "@/components/ProgressBar";

export default function CampaignGeneratePage({ params }) {
  const resolvedParams = use(params);
  const campaignId = resolvedParams.id;
  const router = useRouter();

  const [job, setJob] = useState({
    status: "idle",
    total: 0,
    processed: 0,
    success: 0,
    failed: 0,
    blocked: 0,
    errors: []
  });

  const [logs, setLogs] = useState([]);
  const [errorDetails, setErrorDetails] = useState("");
  const [pollingInterval, setPollingInterval] = useState(null);

  // Initialize status poll
  useEffect(() => {
    let prevProcessed = 0;
    
    // Quick starter logs
    setLogs(["[SYSTEM] Initializing parallel generation runner...", "[SYSTEM] Fetching active API key configurations..."]);

    const poll = async () => {
      try {
        const data = await api.get(`/api/campaign/${campaignId}/generate-progress`);
        setJob(data);

        // Map database shifts to visual log entries
        const newLogs = [];
        if (data.processed > prevProcessed) {
          const delta = data.processed - prevProcessed;
          newLogs.push(`[GENERATOR] Processed ${data.processed}/${data.total} drafts...`);
          if (data.success > 0) {
            newLogs.push(`[SUCCESS] AI email draft successfully formulated.`);
          }
          if (data.blocked > 0) {
            newLogs.push(`[SECURITY] Skipping email target: matching domain block exclusion rule.`);
          }
          if (data.failed > 0 && data.errors && data.errors.length > 0) {
            newLogs.push(`[ERROR] AI worker thread failed: ${data.errors[data.errors.length - 1]}`);
          }
          prevProcessed = data.processed;
        }

        if (newLogs.length > 0) {
          setLogs(prev => [...prev, ...newLogs]);
        }

        // Job termination rules
        if (data.status === "completed") {
          setLogs(prev => [...prev, "[SYSTEM] All active threads resolved successfully.", "[SYSTEM] Campaign drafts finalized. Redirecting..."]);
          clearInterval(intervalId);
          
          // Wait 1.2s for final progress animation to display
          setTimeout(() => {
            router.push(`/campaign/${campaignId}/preview`);
          }, 1200);
        } else if (data.status === "failed") {
          setLogs(prev => [...prev, "[SYSTEM] Generation aborted: Rate limits or token issues hit."]);
          setErrorDetails(data.errors?.join("\n") || "Groq client failed to return valid JSON draft.");
          clearInterval(intervalId);
        }
      } catch (err) {
        console.error("Progress poll failed:", err);
        // Do not crash the view on network drops, log it
        setLogs(prev => [...prev, `[WARNING] Network heartbeat drop: ${err.message}`]);
      }
    };

    // Initial immediate call
    poll();

    // Start long polling loop
    const intervalId = setInterval(poll, 1500);
    setPollingInterval(intervalId);

    // Teardown
    return () => clearInterval(intervalId);
  }, [campaignId, router]);

  // Calculations
  const total = job.total || 0;
  const processed = job.processed || 0;
  const success = job.success || 0;
  const failed = job.failed || 0;
  const blocked = job.blocked || 0;
  
  const percent = total > 0 ? Math.round((processed / total) * 100) : 0;

  return (
    <div className="dashboard-section" style={{ maxWidth: "800px", margin: "2rem auto" }}>
      
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <h2 className="section-title">AI Email Formulation</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginTop: "0.25rem" }}>
          Generating personalized cold emails using parallel Groq key pipelines.
        </p>
      </div>

      {/* Progress Cards */}
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1.5rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifySelf: "center", alignSelf: "center", margin: "1rem 0" }}>
          {job.status !== "failed" && job.status !== "completed" ? (
            <div className="spinner" style={{ width: "50px", height: "50px" }}></div>
          ) : job.status === "completed" ? (
            <div style={{ fontSize: "3rem" }}>✅</div>
          ) : (
            <div style={{ fontSize: "3rem" }}>❌</div>
          )}
        </div>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", fontSize: "0.9rem", fontFamily: "var(--font-mono)" }}>
            <span>Progress: {processed} / {total} Leads Audited</span>
            <span style={{ color: "var(--accent-primary)", fontWeight: "600" }}>{percent}%</span>
          </div>
          <ProgressBar value={percent} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", textAlign: "center", fontSize: "0.85rem", borderTop: "1px solid var(--border-light)", paddingTop: "1rem" }}>
          <div>
            <span style={{ color: "var(--text-secondary)", display: "block" }}>Drafted</span>
            <strong style={{ fontSize: "1.2rem", color: "var(--accent-secondary)", fontFamily: "var(--font-mono)" }}>{success}</strong>
          </div>
          <div>
            <span style={{ color: "var(--text-secondary)", display: "block" }}>Skipped (Blocked)</span>
            <strong style={{ fontSize: "1.2rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{blocked}</strong>
          </div>
          <div>
            <span style={{ color: "var(--text-secondary)", display: "block" }}>Failed</span>
            <strong style={{ fontSize: "1.2rem", color: "var(--accent-red)", fontFamily: "var(--font-mono)" }}>{failed}</strong>
          </div>
        </div>
      </div>

      {/* Real-time Logs Console */}
      <div className="card" style={{ padding: "1.25rem" }}>
        <h3 style={{ fontSize: "0.95rem", fontWeight: "600", fontFamily: "var(--font-mono)", marginBottom: "0.75rem", color: "var(--text-secondary)" }}>
          AI Processing Logs
        </h3>
        <div 
          style={{ 
            height: "180px", 
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
          {logs.map((log, index) => {
            let color = "var(--text-secondary)";
            if (log.startsWith("[SUCCESS]")) color = "var(--accent-secondary)";
            if (log.startsWith("[ERROR]")) color = "var(--accent-red)";
            if (log.startsWith("[SYSTEM]")) color = "var(--accent-cyan)";
            if (log.startsWith("[SECURITY]")) color = "var(--text-muted)";
            
            return <div key={index} style={{ color }}>{log}</div>;
          })}
        </div>
      </div>

      {/* Failure panel details card */}
      {job.status === "failed" && (
        <div className="card accent-red" style={{ marginTop: "1.5rem", borderLeft: "4px solid var(--accent-red)" }}>
          <h4 style={{ color: "var(--accent-red)", fontWeight: "600", fontSize: "0.95rem" }}>
            LLM Generation Queue Aborted
          </h4>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            The pipeline encountered critical issues executing Parallel queries:
          </p>
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
            {errorDetails || "Active Groq API keys rate limited or token formats mismatch."}
          </pre>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
            <button onClick={() => router.push("/settings")} className="btn btn-secondary" style={{ fontSize: "0.8rem", padding: "0.4rem 0.8rem" }}>
              Configure API Keys
            </button>
            <button onClick={() => router.push("/")} className="btn btn-secondary" style={{ fontSize: "0.8rem", padding: "0.4rem 0.8rem" }}>
              Dashboard
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
