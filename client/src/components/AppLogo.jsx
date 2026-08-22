export function AppLogo({ size = 38 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Your One">
      <defs>
        <linearGradient id="yo-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4A6CF7" />
          <stop offset="100%" stopColor="#2B4CE8" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="24" fill="url(#yo-grad)" />
      <g stroke="#ffffff" strokeWidth="8" strokeLinecap="round" fill="none">
        <path d="M30 28 L50 55 L70 28" />
        <path d="M50 55 L50 75" />
        <path d="M60 35 L60 65" />
      </g>
    </svg>
  );
}
