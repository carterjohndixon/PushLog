interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export function Logo({ size = 'md', className = '' }: LogoProps) {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16'
  };

  return (
    <div className={`${sizeClasses[size]} ${className} relative`}>
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Outer log shape */}
        <ellipse
          cx="20"
          cy="20"
          rx="18"
          ry="15"
          fill="#4CAF50"
          transform="rotate(0 20 20)"
        />
        
        {/* Inner log rings */}
        <ellipse
          cx="20"
          cy="20"
          rx="12"
          ry="10"
          fill="#66BB6A"
          transform="rotate(0 20 20)"
        />
        
        <ellipse
          cx="20"
          cy="20"
          rx="6"
          ry="5"
          fill="#81C784"
          transform="rotate(0 20 20)"
        />
        
        {/* Wood grain lines */}
        <path
          d="M5 12 Q20 8 35 12"
          stroke="#2E7D32"
          strokeWidth="1"
          fill="none"
        />
        <path
          d="M5 20 Q20 16 35 20"
          stroke="#2E7D32"
          strokeWidth="1"
          fill="none"
        />
        <path
          d="M5 28 Q20 24 35 28"
          stroke="#2E7D32"
          strokeWidth="1"
          fill="none"
        />
        
        {/* Center core */}
        <circle
          cx="20"
          cy="20"
          r="2"
          fill="#A5D6A7"
        />
      </svg>
    </div>
  );
}
