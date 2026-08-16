export function AppLogo({ size = 38 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Your One">
      <defs>
        <linearGradient id="yo-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#86cf4f" />
          <stop offset="0.5" stopColor="#27a25b" />
          <stop offset="1" stopColor="#0b5c31" />
        </linearGradient>
        <linearGradient id="yo-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.42" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <clipPath id="yo-clip">
          <rect width="100" height="100" rx="24" />
        </clipPath>
      </defs>
      <rect width="100" height="100" rx="24" fill="url(#yo-grad)" />
      {/* glossy sheen across the top half */}
      <g clipPath="url(#yo-clip)">
        <rect width="100" height="52" fill="url(#yo-shine)" />
      </g>
      {/* the white Y */}
      <g stroke="#ffffff" strokeWidth="13" strokeLinecap="round" fill="none">
        <path d="M33 27 L50 50 L67 27" />
        <path d="M50 50 L50 72" />
      </g>
    </svg>
  );
}
