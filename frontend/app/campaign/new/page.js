"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/utils/api";
import DuplicateWarning from "@/components/DuplicateWarning";

export default function NewCampaignPage() {
  const router = useRouter();
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    goal: ""
  });
  const [recipientsRaw, setRecipientsRaw] = useState("");
  const [duplicates, setDuplicates] = useState([]);
  const [excludedEmails, setExcludedEmails] = useState(new Set());
  const [blockedDomains, setBlockedDomains] = useState([]);
  
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Load blocked domains on mount to perform local validation checks
  useEffect(() => {
    async function loadExclusions() {
      try {
        const data = await api.get("/api/blocked-domains");
        setBlockedDomains(data);
      } catch (err) {
        console.error("Exclusions load failed:", err);
      }
    }
    loadExclusions();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Triggers when recipients text area loses focus
  const handleRecipientsBlur = async () => {
    const text = recipientsRaw.trim();
    if (!text) {
      setDuplicates([]);
      return;
    }

    setCheckingDuplicates(true);
    setError(null);
    try {
      const data = await api.post("/api/campaign/check-duplicates", {
        recipients_raw: text
      });
      
      setDuplicates(data.duplicates || []);
      
      // Auto-exclude duplicates by default
      const newExcludes = new Set();
      if (data.duplicates) {
        data.duplicates.forEach(d => newExcludes.add(d.email));
      }
      setExcludedEmails(newExcludes);
    } catch (err) {
      console.error("Duplicate checking failed:", err);
      setError(err.message || "Failed to audit duplicate leads.");
    } finally {
      setCheckingDuplicates(false);
    }
  };

  const handleToggleExclude = (email) => {
    setExcludedEmails(prev => {
      const next = new Set(prev);
      if (next.has(email)) {
        next.delete(email);
      } else {
        next.add(email);
      }
      return next;
    });
  };

  const handleExcludeAll = () => {
    const next = new Set();
    duplicates.forEach(d => next.add(d.email));
    setExcludedEmails(next);
  };

  const handleIncludeAll = () => {
    setExcludedEmails(new Set());
  };

  // Local helper parsing emails and checking blocked domains for live preview list
  const parseLocalRecipients = () => {
    if (!recipientsRaw.trim()) return [];
    
    // Regex matching simple email formats
    const matches = recipientsRaw.match(/[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+/g) || [];
    const unique = [...new Set(matches.map(m => m.trim().toLowerCase()))];
    
    return unique.map(email => {
      const domain = email.split("@")[1];
      const isBlocked = blockedDomains.some(d => {
        const blockedPattern = d.domain.toLowerCase();
        return domain === blockedPattern || domain.endsWith("." + blockedPattern);
      });
      return { email, isBlocked };
    });
  };

  const localList = parseLocalRecipients();
  const totalParsed = localList.length;
  const blockedCount = localList.filter(l => l.isBlocked).length;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    if (totalParsed === 0) {
      setError("Please add at least one valid recipient email address.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // 1. Compile final recipient objects from raw text (ignoring excluded duplicates)
      // We parse the raw text line by line to extract names alongside emails
      const lines = recipientsRaw.split(/[\n,;]+/).map(l => l.trim()).filter(Boolean);
      const finalRecipients = [];

      lines.forEach(line => {
        let name = "";
        let email = "";
        
        // Match 'Name <email@domain.com>'
        const angledMatch = line.match(/^([^<]+)<([^>]+)>/);
        if (angledMatch) {
          name = angledMatch[1].trim();
          email = angledMatch[2].trim().toLowerCase();
        } else {
          // Fallback to simple email extraction
          const emailMatch = line.match(/[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+/);
          if (emailMatch) {
            email = emailMatch[0].trim().toLowerCase();
            // Name is everything except the email
            name = line.replace(email, "").replace(/[^a-zA-Z\s]/g, "").trim();
          }
        }

        if (email && !excludedEmails.has(email)) {
          finalRecipients.push({ email, name: name || "" });
        }
      });

      if (finalRecipients.length === 0) {
        throw new Error("All entered recipients are excluded or skipped. Please adjust filters.");
      }

      // 2. Save campaign and nested recipient drafts
      const campaignPayload = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        goal: formData.goal.trim(),
        recipients: finalRecipients
      };

      const res = await api.post("/api/campaign/new", campaignPayload);
      const campaignId = res.campaign._id;

      // 3. Immediately trigger concurrent AI draft generation in the background
      await api.post(`/api/campaign/${campaignId}/generate`, {});

      // 4. Redirect user to progress loader dashboard
      router.push(`/campaign/${campaignId}/generate`);

    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to create campaigns.");
      setSubmitting(false);
    }
  };

  return (
    <div className="dashboard-section" style={{ position: "relative" }}>
      
      {/* Submit Loading Spinner Overlay */}
      {submitting && (
        <div 
          style={{ 
            position: "fixed", 
            top: 0, 
            left: 0, 
            width: "100vw", 
            height: "100vh", 
            background: "rgba(8, 9, 12, 0.9)", 
            zIndex: 1000, 
            display: "flex", 
            flexDirection: "column", 
            alignItems: "center", 
            justifyContent: "center",
            gap: "1.5rem"
          }}
        >
          <div className="spinner" style={{ width: "60px", height: "60px", borderWidth: "4px" }}></div>
          <div style={{ textAlign: "center" }}>
            <h3 style={{ fontSize: "1.25rem", fontWeight: "600", fontFamily: "var(--font-mono)" }}>
              Provisioning campaign records...
            </h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "0.25rem" }}>
              Initializing background workers and starting concurrent Groq email generations.
            </p>
          </div>
        </div>
      )}

      <div className="section-header">
        <div>
          <h2 className="section-title">Create Campaign</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
            Initialize new outreach campaigns, import recruiter contacts, and exclude duplicate leads.
          </p>
        </div>
      </div>

      {error && (
        <div className="card" style={{ padding: "1rem", borderLeft: "4px solid var(--accent-red)", color: "var(--accent-red)", fontSize: "0.9rem" }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "2rem", alignItems: "start" }}>
        
        {/* Left Panel: Campaign Meta Information */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <h3 style={{ fontSize: "1.1rem", fontWeight: "600", fontFamily: "var(--font-mono)" }}>
            Campaign Metadata
          </h3>

          <div className="form-group">
            <label className="form-label">Campaign Name</label>
            <input 
              type="text" 
              name="name" 
              value={formData.name} 
              onChange={handleChange} 
              className="input-field" 
              placeholder="e.g. OpenAI Software Engineer Role" 
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Recruiter Description / Target Company</label>
            <textarea 
              name="description" 
              value={formData.description} 
              onChange={handleChange} 
              className="textarea-field" 
              placeholder="Describe the company background and alignment (e.g. AI lab developing cutting-edge LLMs and agent infrastructures)..." 
              style={{ minHeight: "80px" }}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Outreach Goal</label>
            <textarea 
              name="goal" 
              value={formData.goal} 
              onChange={handleChange} 
              className="textarea-field" 
              placeholder="e.g. Politely request a 10-minute introductory call to explore engineering stacks and discuss fit for software engineer openings." 
              style={{ minHeight: "80px" }}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              Recipients Import (Format: Name &lt;email&gt; or plain email, one per line)
            </label>
            <textarea 
              value={recipientsRaw} 
              onChange={(e) => setRecipientsRaw(e.target.value)} 
              onBlur={handleRecipientsBlur}
              className="textarea-field" 
              placeholder="Alice <alice@openai.com>&#10;bob@anthropic.com&#10;Charlie <charlie@google.com>" 
              style={{ minHeight: "180px", fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}
              required
            />
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", justifyContent: "space-between" }}>
              <span>Focus out of this input field to trigger duplicate audits.</span>
              <span>Detected: <strong style={{ color: "var(--text-primary)" }}>{totalParsed}</strong> leads</span>
            </span>
          </div>

          {/* Render Duplicates Warnings component */}
          <DuplicateWarning 
            duplicates={duplicates}
            excludedEmails={excludedEmails}
            onToggleExclude={handleToggleExclude}
            onExcludeAll={handleExcludeAll}
            onIncludeAll={handleIncludeAll}
            blockedDomains={blockedDomains}
          />

          <button 
            type="submit" 
            disabled={submitting || checkingDuplicates} 
            className="btn btn-primary" 
            style={{ marginTop: "1rem" }}
          >
            {checkingDuplicates ? "Auditing duplicates..." : "Launch Campaign & AI Workers"}
          </button>
        </div>

        {/* Right Panel: Blocked Domains & Parsed Leads Audits */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          
          <div className="card">
            <h3 style={{ fontSize: "1.1rem", fontWeight: "600", fontFamily: "var(--font-mono)", marginBottom: "1rem" }}>
              Exclusions Audit
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", fontSize: "0.85rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-secondary)" }}>Total unique emails:</span>
                <span style={{ fontWeight: "600", fontFamily: "var(--font-mono)" }}>{totalParsed}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-secondary)" }}>Exclusion blocked domains:</span>
                <span style={{ fontWeight: "600", color: blockedCount > 0 ? "var(--accent-red)" : "inherit", fontFamily: "var(--font-mono)" }}>
                  {blockedCount}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-secondary)" }}>Duplicate leads skipped:</span>
                <span style={{ fontWeight: "600", color: excludedEmails.size > 0 ? "var(--accent-orange)" : "inherit", fontFamily: "var(--font-mono)" }}>
                  {excludedEmails.size}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--border-light)", paddingTop: "0.75rem", marginTop: "0.25rem", fontWeight: "600" }}>
                <span>Final queue size:</span>
                <span style={{ color: "var(--accent-secondary)", fontFamily: "var(--font-mono)" }}>
                  {Math.max(0, totalParsed - excludedEmails.size)}
                </span>
              </div>
            </div>
          </div>

          {totalParsed > 0 && (
            <div className="card" style={{ maxHeight: "450px", display: "flex", flexDirection: "column" }}>
              <h3 style={{ fontSize: "1.1rem", fontWeight: "600", fontFamily: "var(--font-mono)", marginBottom: "0.5rem" }}>
                Target Recipients Queue
              </h3>
              <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginBottom: "1.25rem" }}>
                List of contacts verified for this campaign.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", overflowY: "auto", flex: 1, paddingRight: "0.25rem" }}>
                {localList.map((lead, idx) => {
                  const isExcluded = excludedEmails.has(lead.email);
                  
                  return (
                    <div 
                      key={idx} 
                      style={{ 
                        display: "flex", 
                        justifyContent: "space-between", 
                        alignItems: "center", 
                        padding: "0.5rem 0.75rem", 
                        borderRadius: "var(--radius-sm)", 
                        background: isExcluded ? "rgba(255,255,255,0.01)" : "rgba(255,255,255,0.03)",
                        border: lead.isBlocked ? "1px solid rgba(239, 68, 68, 0.25)" : "1px solid var(--border-light)",
                        opacity: isExcluded ? 0.4 : 1,
                        fontSize: "0.8rem",
                        fontFamily: "var(--font-mono)"
                      }}
                    >
                      <span style={{ textDecoration: isExcluded ? "line-through" : "none", color: lead.isBlocked ? "var(--accent-red)" : "inherit" }}>
                        {lead.email}
                      </span>
                      {lead.isBlocked && (
                        <span className="status-badge blocked" style={{ backgroundColor: "rgba(239, 68, 68, 0.15)", color: "var(--accent-red)", fontSize: "0.65rem", padding: "0.05rem 0.3rem" }}>
                          Blocked
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>

      </form>
    </div>
  );
}
