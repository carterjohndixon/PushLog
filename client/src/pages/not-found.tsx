import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { Home, ArrowRight } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-forest-gradient px-4">
      <div className="absolute inset-0 pointer-events-none flex justify-center -top-1/4" aria-hidden>
        <div className="w-[400px] h-[300px] rounded-full bg-primary/10 blur-[80px]" />
      </div>
      <div className="relative text-center max-w-md">
        <Logo size="lg" className="mx-auto mb-6 opacity-90" />
        <h1 className="text-4xl font-bold text-hero mb-2">Page not found</h1>
        <p className="text-muted-foreground mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link href="/">
          <Button className="bg-log-green text-white hover:bg-green-600 transition-colors gap-2">
            <Home className="w-4 h-4" />
            Back to home
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
