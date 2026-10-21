export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl bg-warning-soft p-3 text-sm font-semibold text-on-warning-soft">
      {children}
    </p>
  );
}
