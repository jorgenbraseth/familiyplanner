/** The family screen's shell: no top menu (the assistant is the page's own big button); the page owns the whole viewport. */
export default function ScreenLayout({ children }: { children: React.ReactNode }) {
  return <div className="h-dvh overflow-hidden">{children}</div>;
}
