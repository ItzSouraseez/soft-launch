"use client";

import { useTransition, useState } from "react";

export default function DuplicateWarning({ 
  duplicates, 
  excludedEmails, 
  onToggleExclude, 
  onExcludeAll, 
  onIncludeAll,
  blockedDomains = []
}) {
  if (!duplicates || duplicates.length === 0) return null;

  // Helper to check if domain is blocked
  const isDomainBlocked = (email) => {
    const domain = email.split("@")[1]?.toLowerCase();
    if (!domain) return false;
    return blockedDomains.some(d => {
      const blockedPattern = d.domain.toLowerCase();
      return domain === blockedPattern || domain.endsWith("." + blockedPattern);
    });
  };

  return (
    <div className="card accent-orange" style={{ padding: "1.5rem", borderLeft: "4px solid var(--accent-orange)", backgroundColor: "rgba(249, 115, 22, 0.03)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h4 style={{ fontSize: "1.05rem", fontWeight: "600", color: "var(--accent-orange)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent-orange)" }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Duplicate Leads Identified ({duplicates.length})
          </h4>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            Some recipients exist in previous campaigns. Review to prevent double-outreach.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button 
            type="button" 
            onClick={onExcludeAll} 
            className="btn btn-secondary" 
            style={{ padding: "0.4rem 0.8rem", fontSize: "0.8rem", borderColor: "var(--accent-orange)", color: "var(--accent-orange)" }}
          >
            Skip All Duplicates
          </button>
          <button 
            type="button" 
            onClick={onIncludeAll} 
            className="btn btn-secondary" 
            style={{ padding: "0.4rem 0.8rem", fontSize: "0.8rem" }}
          >
            Include All
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxHeight: "250px", overflowY: "auto", paddingRight: "0.5rem" }}>
        {duplicates.map((dup) => {
          const isExcluded = excludedEmails.has(dup.email);
          const isBlocked = isDomainBlocked(dup.email);
          
          return (
            <div 
              key={dup.email} 
              style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center", 
                padding: "0.75rem 1rem", 
                background: "rgba(0,0,0,0.2)", 
                borderRadius: "var(--radius-md)", 
                border: isExcluded ? "1px solid var(--border-light)" : "1px solid rgba(249, 115, 22, 0.25)",
                opacity: isExcluded ? 0.6 : 1,
                transition: "all var(--transition-fast)"
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: "600", fontSize: "0.9rem" }}>
                    {dup.name || "Recruiter"}
                  </span>
                  <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                    &lt;{dup.email}&gt;
                  </span>
                  {isBlocked && (
                    <span className="status-badge blocked" style={{ backgroundColor: "rgba(239, 68, 68, 0.15)", color: "var(--accent-red)", fontSize: "0.7rem", padding: "0.1rem 0.4rem" }}>
                      Domain Blocked
                    </span>
                  )}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  Last Campaign: <span style={{ color: "var(--text-secondary)" }}>{dup.campaign_name}</span> | 
                  Status: <span className={`status-badge ${dup.status}`} style={{ fontSize: "0.65rem", padding: "0.05rem 0.35rem" }}>{dup.status}</span>
                  {dup.sent_at && ` | Contacted: ${new Date(dup.sent_at).toLocaleDateString()}`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onToggleExclude(dup.email)}
                className="btn"
                style={{
                  padding: "0.35rem 0.75rem",
                  fontSize: "0.75rem",
                  backgroundColor: isExcluded ? "rgba(255,255,255,0.05)" : "rgba(239, 68, 68, 0.15)",
                  color: isExcluded ? "var(--text-secondary)" : "var(--accent-red)",
                  borderColor: isExcluded ? "var(--border-light)" : "rgba(239, 68, 68, 0.25)",
                }}
              >
                {isExcluded ? "Skip Enabled" : "Outreach Enabled"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
