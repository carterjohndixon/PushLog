import { Logo } from "./logo";
import { Github, Twitter, Linkedin } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-graphite text-white py-16">
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
        <div className="border-t border-gray-700 mt-12 pt-8 text-center text-gray-400">
          <p>&copy; 2026 PushLog. All rights reserved. Built with ❤️ for developer teams.</p>
        </div>
      </div>
    </footer>
  );
}
