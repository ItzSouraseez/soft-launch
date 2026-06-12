"use client";

import { useEffect, useState } from "react";
import { api } from "@/utils/api";

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    smtp_email: "",
    smtp_password: "",
    smtp_host: "smtp.gmail.com",
    smtp_port: 587,
    imap_email: "",
    imap_password: "",
    imap_host: "imap.gmail.com",
    imap_port: 993,
    send_delay_min: 30,
    send_delay_max: 60,
    groq_api_keys: []
  });

  const [groqKeysText, setGroqKeysText] = useState("");
  const [blockedDomains, setBlockedDomains] = useState([]);
  const [newDomain, setNewDomain] = useState("");
  const [saving, setSaving] = useState(false);
  const [addingDomain, setAddingDomain] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });

  useEffect(() => {
    async function loadSettingsData() {
      try {
        const settingsData = await api.get("/api/settings");
        setSettings(settingsData);
        setGroqKeysText(settingsData.groq_api_keys ? settingsData.groq_api_keys.join("\n") : "");
        
        const domainsData = await api.get("/api/blocked-domains");
        setBlockedDomains(domainsData);
      } catch (err) {
        console.error(err);
        setMessage({ text: "Failed to load settings from server.", type: "error" });
      }
    }
    loadSettingsData();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: ["smtp_port", "imap_port", "send_delay_min", "send_delay_max"].includes(name) 
        ? Number(value) 
        : value
    }));
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ text: "", type: "" });
    try {
      const keysArray = groqKeysText.split("\n").map(k => k.trim()).filter(Boolean);
      const payload = {
        ...settings,
        groq_api_keys: keysArray
      };
      
      const res = await api.post("/api/settings", payload);
      setSettings(res);
      setMessage({ text: "Credentials and delay configurations updated successfully!", type: "success" });
    } catch (err) {
      console.error(err);
      setMessage({ text: err.message || "Failed to update configurations.", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleAddDomain = async (e) => {
    e.preventDefault();
    if (!newDomain.strip) {
      const trimmed = newDomain.trim();
      if (!trimmed) return;
    }
    setAddingDomain(true);
    setMessage({ text: "", type: "" });
    try {
      const trimmed = newDomain.trim().toLowerCase();
      const res = await api.post("/api/blocked-domains", { domain: trimmed });
      setBlockedDomains(res);
      setNewDomain("");
      setMessage({ text: `Successfully blocked domain '${trimmed}'`, type: "success" });
    } catch (err) {
      console.error(err);
      setMessage({ text: err.message || "Failed to block domain.", type: "error" });
    } finally {
      setAddingDomain(false);
    }
  };

  const handleDeleteDomain = async (domainStr) => {
    const confirmUnblock = window.confirm(`Are you sure you want to unblock the domain "${domainStr}"? This will allow future outreach emails to this domain.`);
    if (!confirmUnblock) return;

    setMessage({ text: "", type: "" });
    try {
      // Direct call to block delete endpoint
      const res = await api.delete(`/api/blocked-domains?domain=${domainStr}`);
      setBlockedDomains(res);
      setMessage({ text: `Unblocked domain '${domainStr}'`, type: "success" });
    } catch (err) {
      console.error(err);
      setMessage({ text: err.message || "Failed to unblock domain.", type: "error" });
    }
  };

  return (
    <div className="dashboard-section">
      <div className="section-header">
        <div>
          <h2 className="section-title">System Configuration</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
            Maintain SMTP/IMAP network sync, API tokens, delays, and lead target filters.
          </p>
        </div>
      </div>

      {message.text && (
        <div 
          className="card" 
          style={{ 
            padding: "1rem", 
            borderLeft: `4px solid var(--accent-${message.type === "success" ? "secondary" : message.type === "error" ? "red" : "primary"})`,
            backgroundColor: "rgba(255,255,255,0.02)",
            fontSize: "0.9rem"
          }}
        >
          {message.text}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "2rem", alignItems: "start" }}>
        
        {/* Connection Credentials Form */}
        <div className="card">
          <h3 style={{ fontSize: "1.1rem", fontWeight: "600", fontFamily: "var(--font-mono)", marginBottom: "1.5rem" }}>
            Network & LLM Access Keys
          </h3>
          <form onSubmit={handleSaveSettings} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div className="form-group">
                <label className="form-label">SMTP Email User</label>
                <input 
                  type="email" 
                  name="smtp_email" 
                  value={settings.smtp_email || ""} 
                  onChange={handleChange} 
                  className="input-field" 
                  placeholder="sender@gmail.com"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">SMTP App Password</label>
                <input 
                  type="password" 
                  name="smtp_password" 
                  value={settings.smtp_password || ""} 
                  onChange={handleChange} 
                  className="input-field" 
                  placeholder="••••••••••••••••"
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "2.5fr 1fr", gap: "1rem" }}>
              <div className="form-group">
                <label className="form-label">SMTP Host</label>
                <input 
                  type="text" 
                  name="smtp_host" 
                  value={settings.smtp_host || ""} 
                  onChange={handleChange} 
                  className="input-field" 
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">SMTP Port</label>
                <input 
                  type="number" 
                  name="smtp_port" 
                  value={settings.smtp_port || 587} 
                  onChange={handleChange} 
                  className="input-field" 
                  required
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", borderTop: "1px solid var(--border-light)", paddingTop: "1.5rem" }}>
              <div className="form-group">
                <label className="form-label">IMAP Email User</label>
                <input 
                  type="email" 
                  name="imap_email" 
                  value={settings.imap_email || ""} 
                  onChange={handleChange} 
                  className="input-field" 
                  placeholder="sender@gmail.com"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">IMAP App Password</label>
                <input 
                  type="password" 
                  name="imap_password" 
                  value={settings.imap_password || ""} 
                  onChange={handleChange} 
                  className="input-field" 
                  placeholder="••••••••••••••••"
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "2.5fr 1fr", gap: "1rem" }}>
              <div className="form-group">
                <label className="form-label">IMAP Host</label>
                <input 
                  type="text" 
                  name="imap_host" 
                  value={settings.imap_host || ""} 
                  onChange={handleChange} 
                  className="input-field" 
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">IMAP Port</label>
                <input 
                  type="number" 
                  name="imap_port" 
                  value={settings.imap_port || 993} 
                  onChange={handleChange} 
                  className="input-field" 
                  required
                />
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: "1.5rem" }}>
              <div className="form-group">
                <label className="form-label">Groq API Keys (One key per line)</label>
                <textarea 
                  value={groqKeysText} 
                  onChange={(e) => setGroqKeysText(e.target.value)} 
                  className="textarea-field" 
                  placeholder="gsk_..."
                  style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem", minHeight: "100px" }}
                  required
                />
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  Rotates keys dynamically to prevent rate limiting errors during concurrent bulk draft generation.
                </span>
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: "1.5rem" }}>
              <h4 style={{ fontSize: "0.95rem", fontWeight: "600", color: "var(--text-secondary)", marginBottom: "1rem" }}>
                Campaign Dispatch Delays
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div className="form-group">
                  <label className="form-label">Min Delay (seconds)</label>
                  <input 
                    type="number" 
                    name="send_delay_min" 
                    value={settings.send_delay_min} 
                    onChange={handleChange} 
                    className="input-field" 
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Max Delay (seconds)</label>
                  <input 
                    type="number" 
                    name="send_delay_max" 
                    value={settings.send_delay_max} 
                    onChange={handleChange} 
                    className="input-field" 
                    required
                  />
                </div>
              </div>
            </div>

            <button type="submit" disabled={saving} className="btn btn-primary" style={{ marginTop: "1rem" }}>
              {saving ? "Updating Configurations..." : "Save Settings Configurations"}
            </button>
          </form>
        </div>

        {/* Exclusions Settings */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          
          <div className="card">
            <h3 style={{ fontSize: "1.1rem", fontWeight: "600", fontFamily: "var(--font-mono)", marginBottom: "1rem" }}>
              Exclusion Domain Rules
            </h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginBottom: "1.5rem" }}>
              Block specific domains to prevent accidentally sending email pitches to competitors or current employers.
            </p>

            <form onSubmit={handleAddDomain} style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
              <input 
                type="text" 
                value={newDomain} 
                onChange={(e) => setNewDomain(e.target.value)} 
                className="input-field" 
                placeholder="e.g. apple.com"
                style={{ flex: 1 }}
                required
              />
              <button type="submit" disabled={addingDomain} className="btn btn-primary" style={{ whiteSpace: "nowrap" }}>
                {addingDomain ? "Adding..." : "Add Rule"}
              </button>
            </form>

            <div className="table-container" style={{ maxHeight: "300px", overflowY: "auto" }}>
              {blockedDomains.length === 0 ? (
                <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                  No domains blocked yet.
                </div>
              ) : (
                <table className="data-table" style={{ fontSize: "0.85rem" }}>
                  <thead>
                    <tr>
                      <th>Domain Pattern</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blockedDomains.map((rule) => (
                      <tr key={rule._id || rule.domain}>
                        <td style={{ fontFamily: "var(--font-mono)" }}>{rule.domain}</td>
                        <td style={{ textAlign: "right" }}>
                          <button 
                            onClick={() => handleDeleteDomain(rule.domain)} 
                            style={{ color: "var(--accent-red)", cursor: "pointer", background: "none", border: "none" }}
                          >
                            Unblock
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
