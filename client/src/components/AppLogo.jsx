export function AppLogo({ size = 38 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Your One">
      <defs>
        <linearGradient id="yo-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0b6b3d" />
          <stop offset="1" stopColor="#16a35f" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="24" fill="url(#yo-grad)" />
      {/* extruded 3D depth behind the Y */}
      <g stroke="#0a5a33" strokeWidth="13" strokeLinecap="round" fill="none" transform="translate(3 6)">
        <path d="M33 27 L50 50 L67 27" />
        <path d="M50 50 L50 72" />
      </g>
      {/* the white Y */}
      <g stroke="#ffffff" strokeWidth="13" strokeLinecap="round" fill="none">
        <path d="M33 27 L50 50 L67 27" />
        <path d="M50 50 L50 72" />
      </g>
    </svg>
  );
}
