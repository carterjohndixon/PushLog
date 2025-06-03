import { Logo } from "./logo";
import { Button } from "@/components/ui/button";
import { Bell, User, Menu } from "lucide-react";
import { Link } from "wouter";

export function Header() {
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-4">
            <Link href="/" className="flex items-center space-x-3">
              <Logo size="md" />
              <div>
                <h1 className="text-xl font-bold text-log-green">PushLog</h1>
                <p className="text-xs text-steel-gray hidden sm:block">GitHub ↔ Slack Integration</p>
              </div>
            </Link>
            <nav className="hidden md:flex space-x-8 ml-8">
              <Link href="/dashboard" className="text-log-green font-medium hover:text-green-600 transition-colors">
                Dashboard
              </Link>
              <Link href="/integrations" className="text-steel-gray hover:text-graphite transition-colors">
                Integrations
              </Link>
              <Link href="/repositories" className="text-steel-gray hover:text-graphite transition-colors">
                Repositories
              </Link>
            </nav>
          </div>
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="icon" className="text-steel-gray hover:text-graphite">
              <Bell className="w-5 h-5" />
            </Button>
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-steel-gray rounded-full flex items-center justify-center">
                <User className="w-4 h-4 text-white" />
              </div>
              <span className="text-sm font-medium hidden md:block text-graphite">John Developer</span>
            </div>
            <Button variant="ghost" size="icon" className="md:hidden text-graphite">
              <Menu className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
