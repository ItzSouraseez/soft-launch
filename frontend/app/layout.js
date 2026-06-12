import "./globals.css";
import Navbar from "@/components/Navbar";
import ProfileGuardian from "@/components/ProfileGuardian";

export const metadata = {
  title: "Soft Launch - Premium Cold Outreach Platform",
  description: "AI-Powered personalized cold outreach campaign manager with inbox monitoring and automated context-aware followups.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="app-container">
          <Navbar />
          <div className="main-layout">
            <header className="main-header">
              <div className="header-brand">
                <span className="logo-icon">⚡</span>
                <h1 className="logo-text">Soft<span>Launch</span></h1>
              </div>
              <div className="header-actions">
                <div className="system-status">
                  <span className="status-dot green"></span>
                  <span className="status-text">Inbox Monitor Active</span>
                </div>
              </div>
            </header>
            <main className="content-area">
              <ProfileGuardian>
                {children}
              </ProfileGuardian>
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
