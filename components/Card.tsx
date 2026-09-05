// Thin wrapper around the existing `.panel` styling (app/globals.css) so
// dashboard sections share one surface primitive instead of re-declaring
// card chrome per component.
import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
  glow = false,
  style,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
  style?: React.CSSProperties;
}) {
  const card = (
    <div className={`panel ${className}`.trim()} style={style}>
      {children}
    </div>
  );
  if (!glow) return card;
  return <div className="glow-wrap">{card}</div>;
}
