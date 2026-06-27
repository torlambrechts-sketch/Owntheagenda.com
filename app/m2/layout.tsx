import "./m2.css";

// Root of the MAIN2 parallel skin. Kept as a thin wrapper so the m2 design
// system (m2.css) loads for every /m2 route — including the chrome-less
// onboarding flow — while the in-app shell lives in app/m2/(app)/layout.tsx.
export default function M2RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="m2-root">{children}</div>;
}
