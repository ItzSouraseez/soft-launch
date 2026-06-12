"use client";

import { useState, useEffect } from "react";
import { api } from "@/utils/api";
import ContactHistoryPanel from "@/components/ContactHistoryPanel";

export default function SearchPage() {
  // Filter States
  const [query, setQuery] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [status, setStatus] = useState("");
  const [daysLimit, setDaysLimit] = useState(""); // days since contact (re-engagement filter)

  // Options lists
  const [campaigns, setCampaigns] = useState([]);
  
  // Data States
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Active Contact for the Slide-Out History Panel
  const [selectedContactEmail, setSelectedContactEmail] = useState(null);

  // Load campaigns list for selector
  useEffect(() => {
    async function loadCampaigns() {
      try {
        const data = await api.get("/api/campaigns");
        setCampaigns(data);
      } catch (err) {
        console.error("Failed to load campaigns for selector:", err);
      }
    }
    loadCampaigns();
  }, []);

  // Fetch search results based on parameters
  const fetchResults = async (resetPage = false) => {
    setLoading(true);
    setError(null);
    const currentPage = resetPage ? 1 : page;
    if (resetPage) setPage(1);

    try {
      let data;
      // If daysLimit is set, we query the re-engagement endpoint
      if (daysLimit) {
        const reengagementData = await api.get(`/api/reengagement?days_limit=${daysLimit}`);
        // Filter re-engagement list client-side if query, campaignId, or status is set
        let filtered = reengagementData;
        if (query) {
          const qLower = query.toLowerCase();
          filtered = filtered.filter(
            c => (c.name && c.name.toLowerCase().includes(qLower)) || 
                 (c.email && c.email.toLowerCase().includes(qLower))
          );
        }
        if (campaignId) {
          filtered = filtered.filter(c => c.campaign_id === campaignId);
        }
        if (status) {
          filtered = filtered.filter(c => c.status === status);
        }
        
        // Paginate locally
        const limit = 20;
        const totalCount = filtered.length;
        const startIndex = (currentPage - 1) * limit;
        const paginatedResults = filtered.slice(startIndex, startIndex + limit);

        // Format similarly to /api/search results
        data = {
          total: totalCount,
          page: currentPage,
          limit: limit,
          pages: Math.ceil(totalCount / limit),
          results: paginatedResults.map(c => ({
            id: c.recipient_id,
            campaign_id: c.campaign_id,
            campaign_name: c.campaign_name,
            email: c.email,
            name: c.name,
            status: "sent", // re-engagement only returns sent ones
            sent_at: c.sent_at,
            days_since_contact: c.days_since_contact
          }))
        };
      } else {
        // Query the standard CRM search route
        let path = `/api/search?page=${currentPage}&limit=20`;
        if (query) path += `&q=${encodeURIComponent(query)}`;
        if (campaignId) path += `&campaign_id=${encodeURIComponent(campaignId)}`;
        if (status) path += `&status=${encodeURIComponent(status)}`;
        
        data = await api.get(path);
      }

      setResults(data.results || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error("Search failed:", err);
      setError(err.message || "Failed to fetch search results.");
    } finally {
      setLoading(false);
    }
  };

  // Trigger search on changes
  useEffect(() => {
    fetchResults();
  }, [page, campaignId, status, daysLimit]);

  // Handle manual submit (e.g. search input enter)
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchResults(true);
  };

  // Trigger domain block
  const handleBlockDomain = async (email) => {
    const domain = email.split("@")[-1] || email.substring(email.indexOf("@") + 1);
    if (!domain) return;
    
    const confirmBlock = window.confirm(`Are you sure you want to block the domain "${domain}"? This will prevent any future outreach to this domain.`);
    if (!confirmBlock) return;

    try {
      await api.post("/api/blocked-domains", { domain });
      alert(`Domain "${domain}" added to blocklist successfully.`);
      fetchResults(); // Refresh list to reflect blocked status if applicable
    } catch (err) {
      alert(err.message || "Failed to block domain.");
    }
  };

  return (
    <div className="dashboard-section">
      <div className="section-header">
        <div>
          <h2 className="section-title">CRM & Search</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
            Search contacts, filter by campaigns or inactive leads, and view full communication histories.
          </p>
        </div>
      </div>

      {/* Filters Form Container */}
      <div className="card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
        <form onSubmit={handleSearchSubmit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.25rem", alignItems: "end" }}>
          
          <div className="form-group">
            <label className="form-label">Search Query</label>
            <div style={{ position: "relative" }}>
              <input
                type="text"
                placeholder="Search name or email..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="input-field"
                style={{ paddingRight: "2.5rem" }}
              />
              <button 
                type="submit" 
                style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)", cursor: "pointer" }}
              >
                🔍
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Campaign</label>
            <select
              value={campaignId}
              onChange={(e) => {
                setCampaignId(e.target.value);
                setDaysLimit(""); // Reset re-engagement if campaign is picked manually sometimes, or let them combine
              }}
              className="select-field"
            >
              <option value="">All Campaigns</option>
              {campaigns.map((camp) => (
                <option key={camp._id} value={camp._id}>
                  {camp.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Outreach Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="select-field"
            >
              <option value="">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="generating">Generating</option>
              <option value="failed">Failed</option>
              <option value="blocked">Blocked</option>
              <option value="sent">Sent</option>
              <option value="replied">Replied</option>
              <option value="ooo">Out of Office (OOO)</option>
              <option value="bounced">Bounced</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Days of Inactivity</label>
            <select
              value={daysLimit}
              onChange={(e) => setDaysLimit(e.target.value)}
              className="select-field"
            >
              <option value="">Standard Search (All)</option>
              <option value="3">3+ Days (Stale / Re-engage)</option>
              <option value="5">5+ Days (Stale / Re-engage)</option>
              <option value="7">7+ Days (Stale / Re-engage)</option>
              <option value="14">14+ Days (Stale / Re-engage)</option>
            </select>
          </div>

          <div>
            <button type="submit" className="btn btn-primary" style={{ width: "100%" }}>
              Filter
            </button>
          </div>
        </form>
      </div>

      {/* Results Section */}
      <div className="table-container">
        <div className="table-wrapper">
          {loading ? (
            <div style={{ padding: "4rem 2rem", textAlignment: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
              <div className="spinner"></div>
              <p style={{ color: "var(--text-secondary)" }}>Searching outreach database...</p>
            </div>
          ) : error ? (
            <div className="error-container">
              <p>{error}</p>
            </div>
          ) : results.length === 0 ? (
            <div style={{ padding: "4rem 2rem", textAlignment: "center", textAlign: "center", color: "var(--text-muted)" }}>
              <p style={{ fontSize: "1.1rem" }}>No matching contacts found.</p>
              <p style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}>Try expanding your search query or adjusting your filters.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Contact Name</th>
                  <th>Email Address</th>
                  <th>Campaign</th>
                  <th>Status</th>
                  <th>Last Activity / Sent</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {results.map((recipient) => (
                  <tr key={recipient.id} style={{ cursor: "pointer" }} onClick={() => setSelectedContactEmail(recipient.email)}>
                    <td>
                      <div style={{ fontWeight: "600", color: "var(--text-primary)" }}>
                        {recipient.name || "Unnamed Recipient"}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                        Company: {(() => {
                          if (!recipient.email || !recipient.email.includes("@")) return "Unknown";
                          const domain = recipient.email.split("@")[1];
                          const name = domain.split(".")[0];
                          return name.charAt(0).toUpperCase() + name.slice(1);
                        })()}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                        {recipient.email}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: "0.875rem" }}>{recipient.campaign_name}</span>
                    </td>
                    <td>
                      <span className={`status-badge ${recipient.status}`}>
                        {recipient.status}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                        {recipient.sent_at ? new Date(recipient.sent_at).toLocaleDateString() : "Never"}
                        {recipient.days_since_contact !== undefined && ` (${recipient.days_since_contact} days ago)`}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                        <button 
                          className="btn btn-secondary"
                          style={{ padding: "0.35rem 0.75rem", fontSize: "0.8rem" }}
                          onClick={() => setSelectedContactEmail(recipient.email)}
                        >
                          View History
                        </button>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: "0.35rem 0.75rem", fontSize: "0.8rem", color: "var(--accent-red)", borderColor: "rgba(239, 68, 68, 0.2)" }}
                          onClick={() => handleBlockDomain(recipient.email)}
                        >
                          Block Domain
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination Footer */}
        {!daysLimit && total > 20 && (
          <div style={{ padding: "1rem 1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border-light)", backgroundColor: "var(--bg-secondary)" }}>
            <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              Showing {(page - 1) * 20 + 1} - {Math.min(page * 20, total)} of {total} contacts
            </span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                className="btn btn-secondary"
                style={{ padding: "0.35rem 0.75rem", fontSize: "0.8rem" }}
                disabled={page === 1}
                onClick={() => setPage(prev => Math.max(prev - 1, 1))}
              >
                Previous
              </button>
              <button
                className="btn btn-secondary"
                style={{ padding: "0.35rem 0.75rem", fontSize: "0.8rem" }}
                disabled={page * 20 >= total}
                onClick={() => setPage(prev => prev + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Slide-Out History Panel Component */}
      <ContactHistoryPanel
        email={selectedContactEmail}
        onClose={() => setSelectedContactEmail(null)}
        onUpdate={() => fetchResults()}
      />
    </div>
  );
}
