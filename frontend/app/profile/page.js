"use client";

import { useEffect, useState, useRef } from "react";
import { api } from "@/utils/api";

export default function ProfilePage() {
  const [profile, setProfile] = useState({
    full_name: "",
    title: "",
    bio: "",
    skills: [],
    experience: [],
    projects: [],
    resume_parsed: false,
    resume_path: ""
  });
  
  const [skillsText, setSkillsText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });
  const fileInputRef = useRef(null);

  useEffect(() => {
    async function loadProfile() {
      try {
        const data = await api.get("/api/profile");
        setProfile(data);
        setSkillsText(data.skills ? data.skills.join(", ") : "");
      } catch (err) {
        console.error("Failed to load profile:", err);
        setMessage({ text: "Failed to load profile details.", type: "error" });
      }
    }
    loadProfile();
  }, []);

  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setProfile(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ text: "", type: "" });
    try {
      const skillsArray = skillsText.split(",").map(s => s.trim()).filter(Boolean);
      const updated = {
        ...profile,
        skills: skillsArray
      };
      
      const res = await api.post("/api/profile", updated);
      setProfile(res);
      setMessage({ text: "Profile updated successfully!", type: "success" });
    } catch (err) {
      console.error(err);
      setMessage({ text: err.message || "Failed to update profile.", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleUploadResume = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      setMessage({ text: "Please upload a valid PDF file.", type: "error" });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessage({ text: "File size exceeds 5MB limit.", type: "error" });
      return;
    }

    setUploading(true);
    setMessage({ text: "Uploading and parsing resume PDF with LLM...", type: "info" });

    const formData = new FormData();
    formData.append("file", file);

    try {
      // Direct fetch for FormData since JSON serializer client skips FormData headers
      const res = await fetch("http://localhost:8000/api/upload-resume", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Upload failed");
      }

      setProfile(data.profile || data);
      setSkillsText(data.profile?.skills ? data.profile.skills.join(", ") : "");
      setMessage({ text: "Resume uploaded and parsed successfully!", type: "success" });
    } catch (err) {
      console.error(err);
      setMessage({ text: err.message || "Failed to parse resume.", type: "error" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleReparse = async () => {
    setUploading(true);
    setMessage({ text: "Reparsing resume text...", type: "info" });
    try {
      const data = await api.post("/api/resume/reparse");
      setProfile(data.profile || data);
      setSkillsText(data.profile?.skills ? data.profile.skills.join(", ") : "");
      setMessage({ text: "Resume reparsed successfully!", type: "success" });
    } catch (err) {
      console.error(err);
      setMessage({ text: err.message || "Failed to reparse resume.", type: "error" });
    } finally {
      setUploading(false);
    }
  };

  // List helpers for dynamically modifying experience/projects items in draft
  const handleAddExperience = () => {
    setProfile(prev => ({
      ...prev,
      experience: [...prev.experience, { role: "", company: "", duration: "", description: "" }]
    }));
  };

  const handleRemoveExperience = (idx) => {
    setProfile(prev => ({
      ...prev,
      experience: prev.experience.filter((_, i) => i !== idx)
    }));
  };

  const handleExperienceItemChange = (idx, field, value) => {
    setProfile(prev => {
      const copy = [...prev.experience];
      copy[idx] = { ...copy[idx], [field]: value };
      return { ...prev, experience: copy };
    });
  };

  const handleAddProject = () => {
    setProfile(prev => ({
      ...prev,
      projects: [...prev.projects, { title: "", description: "" }]
    }));
  };

  const handleRemoveProject = (idx) => {
    setProfile(prev => ({
      ...prev,
      projects: prev.projects.filter((_, i) => i !== idx)
    }));
  };

  const handleProjectItemChange = (idx, field, value) => {
    setProfile(prev => {
      const copy = [...prev.projects];
      copy[idx] = { ...copy[idx], [field]: value };
      return { ...prev, projects: copy };
    });
  };

  return (
    <div className="dashboard-section">
      <div className="section-header">
        <div>
          <h2 className="section-title">My Professional Profile</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
            Adjust your credentials and sync your resume parser data to format email drafts correctly.
          </p>
        </div>
      </div>

      {message.text && (
        <div 
          className={`card`} 
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
        
        {/* Profile Editor Form */}
        <div className="card">
          <h3 style={{ fontSize: "1.1rem", fontWeight: "600", fontFamily: "var(--font-mono)", marginBottom: "1.5rem" }}>
            Candidate Information
          </h3>
          <form onSubmit={handleSaveProfile} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input 
                type="text" 
                name="full_name" 
                value={profile.full_name || ""} 
                onChange={handleProfileChange} 
                className="input-field" 
                placeholder="e.g. John Doe"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Professional Title</label>
              <input 
                type="text" 
                name="title" 
                value={profile.title || ""} 
                onChange={handleProfileChange} 
                className="input-field" 
                placeholder="e.g. Software Engineer / ML Researcher"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Professional Summary Bio</label>
              <textarea 
                name="bio" 
                value={profile.bio || ""} 
                onChange={handleProfileChange} 
                className="textarea-field" 
                placeholder="Explain who you are and your career goals..."
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Skills (Comma-separated)</label>
              <input 
                type="text" 
                value={skillsText} 
                onChange={(e) => setSkillsText(e.target.value)} 
                className="input-field" 
                placeholder="e.g. Python, FastAPI, React, Next.js, PyTorch"
              />
            </div>

            {/* Work Experience Form List */}
            <div style={{ marginTop: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h4 style={{ fontSize: "0.95rem", fontWeight: "600", color: "var(--text-secondary)" }}>Work Experience</h4>
                <button type="button" onClick={handleAddExperience} className="btn btn-secondary" style={{ padding: "0.25rem 0.75rem", fontSize: "0.75rem" }}>
                  + Add Experience
                </button>
              </div>
              {profile.experience?.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>No experience items listed.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {profile.experience.map((exp, idx) => (
                    <div key={idx} style={{ padding: "1rem", background: "rgba(0,0,0,0.2)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-light)", position: "relative" }}>
                      <button type="button" onClick={() => handleRemoveExperience(idx)} style={{ position: "absolute", top: "0.75rem", right: "0.75rem", color: "var(--accent-red)", fontSize: "0.8rem", cursor: "pointer" }}>
                        Remove
                      </button>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
                        <input type="text" value={exp.role || ""} onChange={(e) => handleExperienceItemChange(idx, "role", e.target.value)} className="input-field" placeholder="Role (e.g. Intern)" style={{ padding: "0.5rem" }} required />
                        <input type="text" value={exp.company || ""} onChange={(e) => handleExperienceItemChange(idx, "company", e.target.value)} className="input-field" placeholder="Company" style={{ padding: "0.5rem" }} required />
                      </div>
                      <input type="text" value={exp.duration || ""} onChange={(e) => handleExperienceItemChange(idx, "duration", e.target.value)} className="input-field" placeholder="Duration (e.g. May 2025 - Present)" style={{ padding: "0.5rem", marginBottom: "0.75rem" }} required />
                      <textarea value={exp.description || ""} onChange={(e) => handleExperienceItemChange(idx, "description", e.target.value)} className="textarea-field" placeholder="Describe achievements..." style={{ padding: "0.5rem", minHeight: "60px" }} required />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Projects Form List */}
            <div style={{ marginTop: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h4 style={{ fontSize: "0.95rem", fontWeight: "600", color: "var(--text-secondary)" }}>Personal Projects</h4>
                <button type="button" onClick={handleAddProject} className="btn btn-secondary" style={{ padding: "0.25rem 0.75rem", fontSize: "0.75rem" }}>
                  + Add Project
                </button>
              </div>
              {profile.projects?.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>No projects listed.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {profile.projects.map((proj, idx) => (
                    <div key={idx} style={{ padding: "1rem", background: "rgba(0,0,0,0.2)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-light)", position: "relative" }}>
                      <button type="button" onClick={() => handleRemoveProject(idx)} style={{ position: "absolute", top: "0.75rem", right: "0.75rem", color: "var(--accent-red)", fontSize: "0.8rem", cursor: "pointer" }}>
                        Remove
                      </button>
                      <input type="text" value={proj.title || ""} onChange={(e) => handleProjectItemChange(idx, "title", e.target.value)} className="input-field" placeholder="Project Title" style={{ padding: "0.5rem", marginBottom: "0.75rem" }} required />
                      <textarea value={proj.description || ""} onChange={(e) => handleProjectItemChange(idx, "description", e.target.value)} className="textarea-field" placeholder="Description / Tech stack..." style={{ padding: "0.5rem", minHeight: "60px" }} required />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button type="submit" disabled={saving} className="btn btn-primary" style={{ marginTop: "1rem" }}>
              {saving ? "Saving Changes..." : "Save Profile Details"}
            </button>
          </form>
        </div>

        {/* Resume upload console */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          
          <div className="card">
            <h3 style={{ fontSize: "1.1rem", fontWeight: "600", fontFamily: "var(--font-mono)", marginBottom: "1rem" }}>
              Resume PDF Console
            </h3>
            
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
              <span className={`status-badge ${profile.resume_parsed ? "completed" : "failed"}`}>
                {profile.resume_parsed ? "Resume Parsed" : "No Resume Synced"}
              </span>
              {profile.resume_parsed && (
                <button type="button" onClick={handleReparse} disabled={uploading} className="btn btn-secondary" style={{ padding: "0.25rem 0.75rem", fontSize: "0.75rem" }}>
                  Reparse Text
                </button>
              )}
            </div>

            {/* Custom file drag/drop block */}
            <div 
              style={{ 
                border: "2px dashed var(--border-light)", 
                borderRadius: "var(--radius-md)", 
                padding: "2rem 1.5rem", 
                textAlign: "center",
                background: "rgba(255,255,255,0.01)",
                cursor: "pointer",
                transition: "border-color var(--transition-fast)"
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <span style={{ display: "flex", justifyContent: "center", marginBottom: "0.75rem", color: "var(--accent-primary)" }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              </span>
              <span style={{ fontWeight: "600", fontSize: "0.9rem", display: "block" }}>
                {uploading ? "Parsing PDF File..." : "Upload New Resume PDF"}
              </span>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem", display: "block" }}>
                Supports PDF up to 5MB
              </span>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleUploadResume} 
                style={{ display: "none" }} 
                accept="application/pdf"
              />
            </div>
          </div>

          {/* Parsed Resume Extracted View */}
          {profile.resume_parsed && (
            <div className="card">
              <h3 style={{ fontSize: "1.1rem", fontWeight: "600", fontFamily: "var(--font-mono)", marginBottom: "1rem" }}>
                Audit Extracted Data
              </h3>
              <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginBottom: "1.5rem" }}>
                This is what the Groq AI will read from your parsed PDF resume to write email outreach messages.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <h4 style={{ fontSize: "0.85rem", fontWeight: "600", color: "var(--text-secondary)", marginBottom: "0.35rem", textTransform: "uppercase" }}>Parsed Skills</h4>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                    {profile.skills?.map((skill, sIdx) => (
                      <span key={sIdx} style={{ fontSize: "0.75rem", background: "rgba(255,255,255,0.05)", padding: "0.2rem 0.5rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-light)" }}>
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 style={{ fontSize: "0.85rem", fontWeight: "600", color: "var(--text-secondary)", marginBottom: "0.5rem", textTransform: "uppercase" }}>Parsed Experiences</h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {profile.experience?.map((exp, eIdx) => (
                      <div key={eIdx} style={{ fontSize: "0.85rem", borderLeft: "2px solid var(--accent-primary)", paddingLeft: "0.75rem" }}>
                        <div style={{ fontWeight: "600", color: "var(--text-primary)" }}>{exp.role} @ {exp.company}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>{exp.duration}</div>
                        <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>{exp.description}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 style={{ fontSize: "0.85rem", fontWeight: "600", color: "var(--text-secondary)", marginBottom: "0.5rem", textTransform: "uppercase" }}>Parsed Projects</h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {profile.projects?.map((proj, pIdx) => (
                      <div key={pIdx} style={{ fontSize: "0.85rem", borderLeft: "2px solid var(--accent-cyan)", paddingLeft: "0.75rem" }}>
                        <div style={{ fontWeight: "600", color: "var(--text-primary)" }}>{proj.title}</div>
                        <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{proj.description}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
