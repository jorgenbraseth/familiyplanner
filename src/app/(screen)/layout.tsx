/** The family screen's shell: no top menu and no assistant button; the page owns the whole viewport. */
export default function ScreenLayout({ children }: { children: React.ReactNode }) {
  return <div className="h-dvh overflow-hidden">{children}</div>;
}
