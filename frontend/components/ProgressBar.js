"use client";

export default function ProgressBar({ value = 0, color = null, height = "8px" }) {
  const percentage = Math.min(100, Math.max(0, value));

  return (
    <div 
      className="progress-container" 
      style={{ 
        height, 
        backgroundColor: "var(--bg-tertiary)", 
        borderRadius: "var(--radius-full)",
        overflow: "hidden",
        width: "100%",
        position: "relative"
      }}
    >
      <div 
        className="progress-bar" 
        style={{ 
          width: `${percentage}%`, 
          height: "100%", 
          background: color || "linear-gradient(90deg, var(--accent-primary), var(--accent-cyan))",
          borderRadius: "var(--radius-full)",
          transition: "width 0.4s cubic-bezier(0.4, 0, 0.2, 1)"
        }}
      ></div>
    </div>
  );
}
