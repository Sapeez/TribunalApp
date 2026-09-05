// Role-colored avatar icon for the Advocates & Judges list
// (docs/plans/advocates-judges-avatar-list.md §7). No photo lookup, no
// network call, no cache — a stance-specific icon (suited bust for
// advocates, gavel for judges), colored by stance using the same
// --defense/--prosecution/--judge tokens already used by
// app/globals.css's .role-icon (blue/red/purple).
export type Stance = "defense" | "prosecution" | "judge";

// Advocate (defense/prosecution) icon — bust in a suit and tie.
function AdvocateIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="6.5" r="5" />
      <path d="M3,22 L3,15 Q3,10.5 10.3,10.8 L9,22 Z" />
      <path d="M21,22 L21,15 Q21,10.5 13.7,10.8 L15,22 Z" />
      <path d="M11,10.6 L13,10.6 L13.4,12.6 L12,20 L10.6,12.6 Z" />
    </svg>
  );
}

// Judge icon — gavel silhouette (public/icons/judge-gavel.png) rendered
// as a currentColor mask so it stays tintable by stance, same as the
// inline-SVG advocate icon.
function GavelIcon() {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: 18,
        height: 18,
        backgroundColor: "currentColor",
        WebkitMaskImage: "url(/icons/judge-gavel.png)",
        maskImage: "url(/icons/judge-gavel.png)",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain",
      }}
    />
  );
}

export function Avatar({ stance }: { stance: Stance }) {
  return (
    <span className={`avatar-icon ${stance}`}>
      {stance === "judge" ? <GavelIcon /> : <AdvocateIcon />}
    </span>
  );
}
