"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/utils/api";

export default function ProfileGuardian({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function checkProfile() {
      // Allow unrestricted access to the profile setup route itself to avoid loops
      if (pathname === "/profile") {
        setChecking(false);
        return;
      }

      try {
        const profile = await api.get("/api/profile");
        
        // Redirect to profile setup if resume is not parsed or full name is missing
        if (!profile.resume_parsed || !profile.full_name) {
          console.warn("Profile incomplete, redirecting to setup page.");
          router.push("/profile");
        } else {
          setChecking(false);
        }
      } catch (err) {
        console.error("Profile authorization check failed:", err);
        // Proceed on check failures (e.g. backend offline) so interface is testable
        setChecking(false);
      }
    }
    
    checkProfile();
  }, [pathname, router]);

  if (checking && pathname !== "/profile") {
    return (
      <div className="loader-container">
        <div className="spinner"></div>
        <p>Verifying profile setup status...</p>
      </div>
    );
  }

  return children;
}
