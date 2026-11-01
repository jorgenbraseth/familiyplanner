"use client";

import { useEffect, useState } from "react";

/**
 * Shows its children while `show` is true. When `show` turns false because the thing was finished (`finished`), the
 * children stay for `ms` more milliseconds so the child sees the success message instead of the block vanishing on
 * the tick; then they go. A block that was never shown, or that goes away for another reason (the time window
 * closed), is removed at once. The server decides `show`; this only delays the last step.
 */
export function Linger({
  show,
  finished,
  ms = 6000,
  children,
}: {
  show: boolean;
  finished: boolean;
  ms?: number;
  children: React.ReactNode;
}) {
  const [prevShow, setPrevShow] = useState(show);
  const [lingering, setLingering] = useState(false);
  if (show !== prevShow) {
    setPrevShow(show);
    setLingering(!show && finished);
  }
  useEffect(() => {
    if (!lingering) return;
    const timer = setTimeout(() => setLingering(false), ms);
    return () => clearTimeout(timer);
  }, [lingering, ms]);
  return show || lingering ? <>{children}</> : null;
}
