"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/utils/api";

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        setLoading(true);
        const statsData = await api.get("/api/dashboard/reply-stats");
        const campaignsData = await api.get("/api/campaigns");
        setStats(statsData);
        setCampaigns(campaignsData);
      } catch (err) {
        console.error("Dashboard load failed:", err);
        setError(err.message || "Failed to load dashboard statistics.");
      } finally {
        setLoading(false);
      }
    }
    fetchDashboardData();
  }, []);

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
        <button onClick={() => window.location.reload()} className="btn btn-secondary" style={{ marginTop: "1rem" }}>
          Retry Loading
        </button>
      </div>
    );
  }

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

  return (
    <div className="dashboard-section">
      <div className="section-header">
        <div>
          <h2 className="section-title">Outreach Dashboard</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
            Track email conversions, recruiter feedback, and active sequences.
          </p>
        </div>
        <Link href="/campaign/new" className="btn btn-primary">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          Create Campaign
        </Link>
      </div>

      {/* Ratios Metrics Grid */}
      <div className="dashboard-grid">
        <div className="card accent-primary">
          <div className="card-header">
            <span className="card-label">Emails Dispatched</span>
            <span className="card-icon">✉️</span>
          </div>
          <div className="card-value">{metrics.total_sent}</div>
          <div className="card-subtext">
            <span>Bounces:</span>
            <span style={{ color: "var(--accent-red)", fontWeight: "600" }}>{metrics.total_bounced}</span>
            <span>({metrics.bounce_rate}%)</span>
          </div>
        </div>

        <div className="card accent-secondary">
          <div className="card-header">
            <span className="card-label">Overall Reply Rate</span>
            <span className="card-icon">📈</span>
          </div>
          <div className="card-value">{metrics.reply_rate}%</div>
          <div className="card-subtext">
            <span className="highlight-green">{metrics.total_replied}</span> replies parsed out of sent emails.
          </div>
        </div>

        <div className="card accent-orange">
          <div className="card-header">
            <span className="card-label">Out of Office</span>
            <span className="card-icon">🌴</span>
          </div>
          <div className="card-value">{metrics.total_ooo}</div>
          <div className="card-subtext">
            <span>Rate:</span>
            <span style={{ color: "var(--accent-orange)", fontWeight: "600" }}>{metrics.ooo_rate}%</span>
            <span>of all contacts.</span>
          </div>
        </div>

        <div className="card accent-cyan">
          <div className="card-header">
            <span className="card-label">Positive Feedback</span>
            <span className="card-icon">🤝</span>
          </div>
          <div className="card-value">{sentiment.positive.percentage}%</div>
          <div className="card-subtext">
            <span className="highlight" style={{ color: "var(--accent-cyan)" }}>{sentiment.positive.count}</span> interested recruiter replies detected.
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1.5rem", alignItems: "start" }}>
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

        {/* Sentiment Analysis Panel */}
        <div className="card">
          <h3 style={{ fontSize: "1.1rem", fontWeight: "600", fontFamily: "var(--font-mono)", marginBottom: "1rem" }}>Reply Sentiment</h3>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "1.5rem" }}>
            LLM classifications of candidate intent.
          </p>
          <div className="sentiment-breakdown-list">
            <div className="sentiment-row">
              <div className="sentiment-info">
                <span className="sentiment-label">
                  <span className="sentiment-dot positive"></span>
                  Positive (Interested)
                </span>
                <span className="sentiment-percentage">{sentiment.positive.percentage}%</span>
              </div>
              <div className="sentiment-progress-bg">
                <div className="sentiment-progress-bar positive" style={{ width: `${sentiment.positive.percentage}%` }}></div>
              </div>
            </div>

            <div className="sentiment-row">
              <div className="sentiment-info">
                <span className="sentiment-label">
                  <span className="sentiment-dot neutral"></span>
                  Neutral / Acknowledge
                </span>
                <span className="sentiment-percentage">{sentiment.neutral.percentage}%</span>
              </div>
              <div className="sentiment-progress-bg">
                <div className="sentiment-progress-bar neutral" style={{ width: `${sentiment.neutral.percentage}%` }}></div>
              </div>
            </div>

            <div className="sentiment-row">
              <div className="sentiment-info">
                <span className="sentiment-label">
                  <span className="sentiment-dot negative"></span>
                  Negative (Rejections)
                </span>
                <span className="sentiment-percentage">{sentiment.negative.percentage}%</span>
              </div>
              <div className="sentiment-progress-bg">
                <div className="sentiment-progress-bar negative" style={{ width: `${sentiment.negative.percentage}%` }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
