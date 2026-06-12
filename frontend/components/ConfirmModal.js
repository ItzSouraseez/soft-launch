"use client";

export default function ConfirmModal({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  isDanger = false
}) {
  if (!isOpen) return null;

  return (
    <div 
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "rgba(8, 9, 12, 0.8)",
        backdropFilter: "blur(8px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem"
      }}
    >
      <div 
        className="card"
        style={{
          maxWidth: "480px",
          width: "100%",
          padding: "2rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.5rem",
          border: "1px solid var(--border-light)",
          animation: "fadeIn 0.2s ease-out"
        }}
      >
        <h4 style={{ fontSize: "1.15rem", fontWeight: "700", fontFamily: "var(--font-mono)", color: isDanger ? "var(--accent-red)" : "var(--text-primary)" }}>
          {title}
        </h4>
        
        <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: "1.5" }}>
          {message}
        </p>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
          <button 
            type="button" 
            onClick={onCancel} 
            className="btn btn-secondary"
            style={{ padding: "0.5rem 1rem", fontSize: "0.85rem" }}
          >
            {cancelLabel}
          </button>
          <button 
            type="button" 
            onClick={onConfirm} 
            className="btn"
            style={{ 
              padding: "0.5rem 1rem", 
              fontSize: "0.85rem",
              backgroundColor: isDanger ? "var(--accent-red)" : "var(--accent-primary)",
              color: "white",
              boxShadow: isDanger ? "none" : "var(--accent-glow)"
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
