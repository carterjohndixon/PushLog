import { Loader2 } from "lucide-react";

interface PageLoadingOverlayProps {
  isVisible: boolean;
  message?: string;
}

/**
 * Full-screen overlay with blurred background. Use while primary page data is loading.
 * Renders nothing when not visible. Page content stays underneath (blurred) until data loads.
 */
export function PageLoadingOverlay({ isVisible, message = "Loading..." }: PageLoadingOverlayProps) {
  if (!isVisible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-md"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-card/95 px-8 py-6 shadow-lg">
        <Loader2 className="h-10 w-10 text-primary animate-spin" aria-hidden />
        <p className="text-sm font-medium text-foreground">{message}</p>
      </div>
    </div>
  );
}
