import logoImage from "../../../attached_assets/PushLog.png";

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
    <img 
      src={logoImage}
      alt="PushLog"
      className={`${sizeClasses[size]} ${className} object-contain`}
    />
  );
}
