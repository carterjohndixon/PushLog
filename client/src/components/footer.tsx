import { Logo } from "./logo";
import { Github, Twitter, Linkedin, User } from "lucide-react";
import { Link } from "wouter";

export function Footer() {
  return (
    <footer className="bg-footer text-white py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-2">
            <div className="flex items-center space-x-3 mb-4">
              <Logo size="md" />
              <div>
                <h3 className="text-xl font-bold text-log-green">PushLog</h3>
                <p className="text-sm text-gray-400">GitHub ↔ Slack Integration</p>
              </div>
            </div>
            <p className="text-gray-400 mb-4 max-w-md">
              Streamline your development workflow with intelligent GitHub and Slack integration. 
              Keep your team synchronized with automated notifications and AI-powered code summaries.
            </p>
            <div className="flex space-x-4">
              <a 
                href="https://github.com/carterjohndixon/PushLog" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-log-green transition-colors"
                aria-label="View source code on GitHub"
              >
                <Github className="w-5 h-5" />
              </a>
              <a 
                href="https://carter.pushlog.ai" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-log-green transition-colors"
                aria-label="View profile"
              >
                <User className="w-5 h-5" />
              </a>
            </div>
            {/* <div className="flex space-x-4">
              <a href="#" className="text-gray-400 hover:text-log-green transition-colors">
                <Github className="w-5 h-5" />
              </a>
              <a href="#" className="text-gray-400 hover:text-sky-blue transition-colors">
                <Twitter className="w-5 h-5" />
              </a>
              <a href="#" className="text-gray-400 hover:text-log-green transition-colors">
                <Linkedin className="w-5 h-5" />
              </a>
            </div> */}
          </div>
          {/* <div>
            <h4 className="font-semibold mb-4">Product</h4>
            <ul className="space-y-2 text-gray-400">
              <li><a href="#" className="hover:text-white transition-colors">Features</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Pricing</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Documentation</a></li>
              <li><a href="#" className="hover:text-white transition-colors">API Reference</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4">Support</h4>
            <ul className="space-y-2 text-gray-400">
              <li><a href="#" className="hover:text-white transition-colors">Help Center</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Contact Us</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Status Page</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Security</a></li>
            </ul>
          </div> */}
        </div>
        <div className="border-t border-white/10 mt-12 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center text-gray-400">
            <p>&copy; 2026 PushLog. All rights reserved. Built with ❤️ for developer teams.</p>
            <div className="flex space-x-6 mt-4 md:mt-0">
              <Link 
                href="/support" 
                className="hover:text-log-green transition-colors text-sm"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              >
                Support
              </Link>
              <Link 
                href="/terms" 
                className="hover:text-log-green transition-colors text-sm"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              >
                Terms of Service
              </Link>
              <Link 
                href="/policy" 
                className="hover:text-log-green transition-colors text-sm"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              >
                Privacy Policy
              </Link>
              <Link 
                href="/sub-processors" 
                className="hover:text-log-green transition-colors text-sm"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              >
                Sub-Processors
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
