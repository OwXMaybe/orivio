"use client";

/**
 * Last-resort boundary when the root layout itself fails. Providers are not
 * available here, so it is self-contained and bilingual.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#08101c", color: "#e8eef7", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20 }}>ORIVIO could not load · ORIVIO yüklenemedi</h1>
          <p style={{ color: "#7f90a8", fontSize: 14 }}>Your saved investigations are not affected. · Kayıtlı araştırmaların etkilenmedi.</p>
          <button type="button" onClick={reset} style={{ marginTop: 16, padding: "10px 16px", borderRadius: 8, border: 0, background: "#4fd1c5", color: "#04111a", fontWeight: 600, cursor: "pointer" }}>
            Try again · Tekrar dene
          </button>
        </main>
      </body>
    </html>
  );
}
