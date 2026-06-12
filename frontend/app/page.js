"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/utils/api";
import ContactHistoryPanel from "@/components/ContactHistoryPanel";

export default function DashboardPage() {
  // Stats & Core Lists
  const [stats, setStats] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [reengagement, setReengagement] = useState([]);
  const [settings, setSettings] = useState(null);

  // States
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncingInbox, setSyncingInbox] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(null);
  
  // Drawer state
  const [selectedContactEmail, setSelectedContactEmail] = useState(null);

  const loadAllDashboardData = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const [statsData, campaignsData, remindersData, activityData, reengageData, settingsData] = await Promise.all([
        api.get("/api/dashboard/reply-stats"),
        api.get("/api/campaigns"),
        api.get("/api/reminders"),
        api.get("/api/recent-activity"),
        api.get("/api/reengagement?days_limit=3"),
        api.get("/api/settings")
      ]);

      setStats(statsData);
      setCampaigns(campaignsData);
      setReminders(remindersData);
      setRecentActivity(activityData);
      setReengagement(reengageData);
      setSettings(settingsData);
      setError(null);
    } catch (err) {
      console.error("Dashboard load failed:", err);
      setError(err.message || "Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.resolve().then(() => {
      loadAllDashboardData(true);
    });
  }, []);

  // Handle Manual IMAP Check Trigger
  const handleInboxSync = async () => {
    if (syncingInbox) return;
    setSyncingInbox(true);
    setSyncSuccess(null);
    
    try {
      await api.post("/api/inbox/check");
      setSyncSuccess("Inbox synchronization started in background.");
      
      // Simulate progress indicator, then poll fresh data after 6 seconds
      setTimeout(() => {
        setSyncingInbox(false);
        loadAllDashboardData();
      }, 6000);
    } catch (err) {
      alert(err.message || "Failed to trigger inbox check.");
      setSyncingInbox(false);
    }
  };

  if (loading) {
    return (
      <div className="loader-container">
        <div className="spinner"></div>
        <p>Loading your outreach intelligence dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <h3>Dashboard Error</h3>
        <p>{error}</p>
        <button onClick={() => loadAllDashboardData(true)} className="btn btn-secondary" style={{ marginTop: "1rem" }}>
          Retry Loading
        </button>
      </div>
    );
  }

  // Extract Stats Details
  const metrics = stats?.metrics || {
    total_sent: 0,
    total_replied: 0,
    total_ooo: 0,
    total_bounced: 0,
    reply_rate: 0.0,
    ooo_rate: 0.0,
    bounce_rate: 0.0,
  };

  const sentiment = stats?.sentiment_breakdown || {
    positive: { count: 0, percentage: 0 },
    neutral: { count: 0, percentage: 0 },
    negative: { count: 0, percentage: 0 },
  };

  // Check if credentials are missing (Step 180)
  const isCredentialsMissing = 
    !settings || 
    !settings.groq_api_keys || 
    settings.groq_api_keys.length === 0 || 
    !settings.smtp_email || 
    !settings.smtp_password || 
    !settings.imap_email || 
    !settings.imap_password;

  return (
    <div className="dashboard-section">
      
      {/* 1. Missing Settings warning alert banner (Step 180) */}
      {isCredentialsMissing && (
        <div className="error-container" style={{ margin: "0 0 1.5rem 0", padding: "1.25rem 1.5rem", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "rgba(239, 68, 68, 0.12)", borderColor: "rgba(239, 68, 68, 0.35)", color: "var(--text-primary)" }}>
          <div>
            <h4 style={{ fontWeight: "700", color: "var(--accent-red)", marginBottom: "0.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              Outreach Configuration Incomplete
            </h4>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              Please configure your SMTP details, IMAP app credentials, and Groq API keys to initiate outreach campaigns.
            </p>
          </div>
          <Link href="/settings" className="btn btn-secondary" style={{ color: "var(--accent-red)", borderColor: "rgba(239, 68, 68, 0.3)" }}>
            Configure Settings
          </Link>
        </div>
      )}

      {/* Section Header */}
      <div className="section-header">
        <div>
          <h2 className="section-title">Outreach Dashboard</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
            Track email conversions, recruiter feedback, and active sequences.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button 
            onClick={handleInboxSync} 
            className="btn btn-secondary"
            disabled={syncingInbox}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle", marginRight: "0.35rem" }}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Sync Inbox
          </button>
          <Link href="/campaign/new" className="btn btn-primary">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Create Campaign
          </Link>
        </div>
      </div>

      {/* 2. Inbox Sync Progress Scanner Bar (Step 176) */}
      {syncingInbox && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", margin: "-0.5rem 0 0.5rem 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--accent-primary)", fontWeight: "600", fontFamily: "var(--font-mono)" }}>
              Scanning Inbox via IMAP...
            </span>
            <span className="spinner" style={{ width: "16px", height: "16px", borderWidth: "2px" }}></span>
          </div>
          <div className="progress-container" style={{ height: "4px", backgroundColor: "var(--bg-tertiary)" }}>
            <div 
              style={{
                height: "100%",
                background: "linear-gradient(90deg, var(--accent-primary) 0%, var(--accent-cyan) 50%, var(--accent-primary) 100%)",
                width: "100%",
                borderRadius: "var(--radius-full)",
                animation: "pulseScan 2s linear infinite"
              }}
            />
          </div>
          <style jsx="true">{`
            @keyframes pulseScan {
              0% { filter: brightness(1) hue-rotate(0deg); }
              50% { filter: brightness(1.3) hue-rotate(90deg); }
              100% { filter: brightness(1) hue-rotate(0deg); }
            }
          `}</style>
        </div>
      )}

      {/* 3. Dashboard Grid: Sent, Failed, and Campaign Stats Cards (Step 171) */}
      <div className="dashboard-grid">
        <div className="card accent-primary">
          <div className="card-header">
            <span className="card-label">Active Campaigns</span>
            <span className="card-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.25-2.5 3.5-2.5 3.5s2.25-1 3.5-2.5M12 2C6.5 2 2 6.5 2 12c0 1.5.5 3 1.5 4.5L12 8l-8.5 8.5C5 17.5 6.5 18 8 18c5.5 0 10-4.5 10-10 0-1.5-.5-3-1.5-4.5L12 8z"/></svg>
            </span>
          </div>
          <div className="card-value">{campaigns.length}</div>
          <div className="card-subtext">
            <span>Total sequences launched</span>
          </div>
        </div>

        <div className="card accent-cyan">
          <div className="card-header">
            <span className="card-label">Emails Dispatched</span>
            <span className="card-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            </span>
          </div>
          <div className="card-value">{metrics.total_sent}</div>
          <div className="card-subtext">
            <span>Delivery success rate:</span>
            <span style={{ color: "var(--accent-secondary)", fontWeight: "600" }}>
              {metrics.total_sent > 0 ? Math.round(((metrics.total_sent - metrics.total_bounced) / metrics.total_sent) * 100) : 100}%
            </span>
          </div>
        </div>

        <div className="card accent-red">
          <div className="card-header">
            <span className="card-label">Bounces & Failures</span>
            <span className="card-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </span>
          </div>
          <div className="card-value">{metrics.total_bounced}</div>
          <div className="card-subtext">
            <span>Bounce rate:</span>
            <span style={{ color: "var(--accent-red)", fontWeight: "600" }}>{metrics.bounce_rate}%</span>
            <span>of all contacts</span>
          </div>
        </div>

        <div className="card accent-secondary">
          <div className="card-header">
            <span className="card-label">Overall Reply Rate</span>
            <span className="card-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
            </span>
          </div>
          <div className="card-value">{metrics.reply_rate}%</div>
          <div className="card-subtext">
            <span className="highlight-green">{metrics.total_replied}</span> replies parsed in history.
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "1.5rem", alignItems: "start" }}>
        
        {/* Left column: Campaigns Table & Inbox Monitor responses */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          
          {/* Campaigns Panel */}
          <div className="table-container">
            <div className="section-header" style={{ padding: "1.25rem 1.5rem 0.5rem 1.5rem", marginBottom: "0" }}>
              <h3 style={{ fontSize: "1.1rem", fontWeight: "600", fontFamily: "var(--font-mono)" }}>Outreach Campaigns</h3>
            </div>
            <div className="table-wrapper">
              {campaigns.length === 0 ? (
                <div style={{ padding: "3rem 1.5rem", textAlignment: "center", color: "var(--text-muted)", textAlign: "center" }}>
                  <p>No outreach campaigns configured yet.</p>
                  <Link href="/campaign/new" className="btn btn-secondary" style={{ marginTop: "1rem" }}>
                    Create Your First Campaign
                  </Link>
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Campaign Name</th>
                      <th>Status</th>
                      <th>Sent</th>
                      <th>Replies</th>
                      <th>Progress</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((camp) => {
                      const percent = camp.total_recipients > 0 
                        ? Math.round(((camp.sent_count + camp.failed_count) / camp.total_recipients) * 100) 
                        : 0;
                      return (
                        <tr key={camp._id}>
                          <td style={{ fontWeight: "600" }}>{camp.name}</td>
                          <td>
                            <span className={`status-badge ${camp.status}`}>
                              {camp.status}
                            </span>
                          </td>
                          <td style={{ fontFamily: "var(--font-mono)" }}>{camp.sent_count}/{camp.total_recipients}</td>
                          <td style={{ fontFamily: "var(--font-mono)", color: camp.reply_count > 0 ? "var(--accent-secondary)" : "inherit" }}>
                            {camp.reply_count}
                          </td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", width: "120px" }}>
                              <div className="progress-container" style={{ height: "6px" }}>
                                <div className="progress-bar" style={{ width: `${percent}%` }}></div>
                              </div>
                              <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                                {percent}%
                              </span>
                            </div>
                          </td>
                          <td>
                            <Link href={`/campaign/${camp._id}`} className="btn btn-secondary" style={{ padding: "0.35rem 0.75rem", fontSize: "0.8rem" }}>
                              Manage
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* 4. Inbox Monitor: Auto-Detected Responses (Steps 174 & 177) */}
          <div className="table-container">
            <div className="section-header" style={{ padding: "1.25rem 1.5rem 0.5rem 1.5rem", marginBottom: "0" }}>
              <h3 style={{ fontSize: "1.1rem", fontWeight: "600", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>
                Inbox Monitor: Auto-Detected Responses
              </h3>
            </div>
            <div className="table-wrapper" style={{ padding: "0.5rem 1.5rem 1.5rem 1.5rem" }}>
              {recentActivity.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", padding: "1.5rem 0", textAlign: "center" }}>
                  No replies or bounces detected in the inbox scan database yet. Try running &quot;Sync Inbox&quot;.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {recentActivity.map((activity) => (
                    <div 
                      key={activity.id} 
                      onClick={() => setSelectedContactEmail(activity.email)}
                      className="card"
                      style={{ padding: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", background: "var(--bg-secondary)", border: "1px solid var(--border-light)" }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span style={{ fontWeight: "600", fontSize: "0.9rem" }}>{activity.name || "Unnamed"}</span>
                          <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", fontFamily: "var(--font-mono)" }}>
                            ({activity.email})
                          </span>
                        </div>
                        <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                          Campaign: {activity.campaign_name}
                        </p>
                        {activity.reply_sentiment && (
                          <p style={{ fontSize: "0.75rem", color: "var(--accent-cyan)", marginTop: "0.15rem" }}>
                            Sentiment: {activity.reply_sentiment}
                          </p>
                        )}
                        {activity.error_message && (
                          <p style={{ fontSize: "0.75rem", color: "var(--accent-red)", marginTop: "0.15rem" }}>
                            Error: {activity.error_message}
                          </p>
                        )}
                        {activity.ooo_return_date && (
                          <p style={{ fontSize: "0.75rem", color: "var(--accent-orange)", marginTop: "0.15rem" }}>
                            Return Date: {activity.ooo_return_date}
                          </p>
                        )}
                      </div>
                      <span className={`status-badge ${activity.status}`}>
                        {activity.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Right column: Ratios Graph, Check Backs, Re-engagements */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

          {/* 5. Custom CSS CRM Reply Ratios Progress Graph (Step 172) */}
          <div className="card">
            <h3 style={{ fontSize: "1.1rem", fontWeight: "600", fontFamily: "var(--font-mono)", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              Outreach Conversion Breakdown
            </h3>
            
            {metrics.total_sent === 0 ? (
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Send emails to display response conversion chart.</p>
            ) : (
              <div>
                {/* Visual Stacked CSS shape graph */}
                <div style={{ display: "flex", height: "24px", borderRadius: "var(--radius-sm)", overflow: "hidden", margin: "1rem 0" }}>
                  <div 
                    style={{ 
                      width: `${Math.max(metrics.reply_rate, 2)}%`, 
                      backgroundColor: "var(--accent-secondary)", 
                      height: "100%" 
                    }} 
                    title={`Replies: ${metrics.total_replied}`} 
                  />
                  <div 
                    style={{ 
                      width: `${Math.max(metrics.ooo_rate, 2)}%`, 
                      backgroundColor: "var(--accent-orange)", 
                      height: "100%" 
                    }} 
                    title={`OOO: ${metrics.total_ooo}`} 
                  />
                  <div 
                    style={{ 
                      width: `${Math.max(metrics.bounce_rate, 2)}%`, 
                      backgroundColor: "var(--accent-red)", 
                      height: "100%" 
                    }} 
                    title={`Bounced: ${metrics.total_bounced}`} 
                  />
                  <div 
                    style={{ 
                      flex: 1, 
                      backgroundColor: "var(--bg-tertiary)", 
                      height: "100%" 
                    }} 
                    title={`No Reply: ${metrics.total_sent - metrics.total_replied - metrics.total_ooo - metrics.total_bounced}`} 
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--accent-secondary)" }} />
                      Replied ({metrics.total_replied})
                    </span>
                    <span style={{ fontWeight: "600", fontFamily: "var(--font-mono)" }}>{metrics.reply_rate}%</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--accent-orange)" }} />
                      Out of Office ({metrics.total_ooo})
                    </span>
                    <span style={{ fontWeight: "600", fontFamily: "var(--font-mono)" }}>{metrics.ooo_rate}%</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--accent-red)" }} />
                      Bounced ({metrics.total_bounced})
                    </span>
                    <span style={{ fontWeight: "600", fontFamily: "var(--font-mono)" }}>{metrics.bounce_rate}%</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 6. Check Back Reminders Panel (Step 173) */}
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: "600", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Check Back Reminders
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxHeight: "300px", overflowY: "auto" }}>
              {reminders.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                  No manual check-back dates scheduled for active candidates.
                </p>
              ) : (
                reminders.map((reminder) => (
                  <div 
                    key={reminder.id}
                    onClick={() => setSelectedContactEmail(reminder.email)}
                    style={{ padding: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-light)", background: "var(--bg-secondary)", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                  >
                    <div>
                      <div style={{ fontWeight: "600", fontSize: "0.85rem" }}>{reminder.name || reminder.email}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>
                        Campaign: {reminder.campaign_name}
                      </div>
                    </div>
                    <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--accent-primary)", padding: "0.2rem 0.5rem", borderRadius: "var(--radius-sm)", backgroundColor: "rgba(99, 102, 241, 0.12)" }}>
                      {reminder.check_back_date}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 7. Re-engagement Stale Leads Panel (Steps 178 & 179) */}
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: "600", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 2h14M5 22h14M19 2v4a7 7 0 0 1-7 7 7 7 0 0 1-7-7V2M5 22v-4a7 7 0 0 1 7-7 7 7 0 0 1 7 7v4"/></svg>
              Stale Contacts (3+ Days)
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxHeight: "300px", overflowY: "auto" }}>
              {reengagement.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                  No candidates currently meet the re-engagement window limits.
                </p>
              ) : (
                reengagement.map((candidate) => (
                  <div 
                    key={candidate.recipient_id}
                    onClick={() => setSelectedContactEmail(candidate.email)}
                    style={{ padding: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-light)", background: "var(--bg-secondary)", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                  >
                    <div>
                      <div style={{ fontWeight: "600", fontSize: "0.85rem" }}>{candidate.name || candidate.email}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                        Campaign: {candidate.campaign_name}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--accent-red)", marginTop: "0.15rem", fontWeight: "500" }}>
                        Last sent {candidate.days_since_contact} days ago
                      </div>
                    </div>
                    <Link 
                      href={`/campaign/${candidate.campaign_id}`} 
                      className="btn btn-secondary"
                      style={{ padding: "0.3rem 0.5rem", fontSize: "0.75rem", color: "var(--accent-primary)", borderColor: "rgba(99, 102, 241, 0.25)" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Followup
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>

      {/* Slide-out history timeline panel */}
      <ContactHistoryPanel
        email={selectedContactEmail}
        onClose={() => setSelectedContactEmail(null)}
        onUpdate={loadAllDashboardData}
      />
    </div>
  );
}
