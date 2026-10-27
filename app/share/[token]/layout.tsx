import type { Metadata } from "next";

// Shared reports are reachable only by their unguessable link: keep them out of
// search engines and never send the link to other sites as a referrer.
export const metadata: Metadata = {
  title: "Shared report — ORIVIO",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
