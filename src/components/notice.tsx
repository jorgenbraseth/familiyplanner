export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
      {children}
    </p>
  );
}
