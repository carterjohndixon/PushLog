import { Github, Mail, Bug, CheckCircle, Shield, ArrowUpRight } from "lucide-react";

export default function Carter() {
  return (
    <div className="min-h-screen bg-white antialiased">
      {/* Hero Section */}
      <section className="container mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16 md:pt-32 md:pb-24">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-gray-900 mb-6 leading-tight tracking-tight">
              Carter Dixon
            </h1>
            <p className="text-xl md:text-2xl text-gray-600 font-light leading-relaxed max-w-2xl">
              Software engineer focused on backend systems and developer tools.
            </p>
          </div>
        </div>
      </section>

      {/* Background Section */}
      <section className="container mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-semibold text-gray-900 mb-8 tracking-tight">Background</h2>
          <div className="space-y-6 text-lg text-gray-700 leading-relaxed">
            <p>
              I started teaching myself to code in 2021, beginning with Python. From there I moved through web development, 
              then Node.js for backend work. I spent time with C++ and Rust to understand systems programming, 
              explored machine learning, worked with OpenGL for graphics, and eventually settled into React for frontend work.
            </p>
            <p>
              The progression wasn't planned—I followed what interested me and what problems I was trying to solve. 
              Each language and framework taught me something different about how software works.
            </p>
          </div>
        </div>
      </section>

      {/* Current Section */}
      <section className="container mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20 bg-gray-50/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-semibold text-gray-900 mb-8 tracking-tight">Current</h2>
          <div className="space-y-6 text-lg text-gray-700 leading-relaxed">
            <p>
              I graduated high school and I'm working now. Most of my time goes into building tools focused on 
              productivity and backend systems. I'm interested in making things that work reliably and don't get in the way.
            </p>
            <p>
              The backend work is what I find most engaging—designing APIs, handling data, managing state, 
              and making sure things fail gracefully when they need to.
            </p>
          </div>
        </div>
      </section>

      {/* Projects Section */}
      <section className="container mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-semibold text-gray-900 mb-12 tracking-tight">Projects</h2>
          <div className="space-y-8">
            <div className="group bg-white border border-gray-200 rounded-xl p-8 md:p-10 hover:border-gray-300 hover:shadow-lg transition-all duration-200">
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-2xl font-semibold text-gray-900">PushLog</h3>
                <div className="flex gap-3">
                  <a
                    href="https://github.com/carterjohndixon/PushLog"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 hover:border-gray-300 transition-colors"
                  >
                    <Github className="w-4 h-4" />
                    Code
                    <ArrowUpRight className="w-3 h-3 opacity-60" />
                  </a>
                  <a
                    href="https://pushlog.ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 hover:border-gray-300 transition-colors"
                  >
                    Site
                    <ArrowUpRight className="w-3 h-3 opacity-60" />
                  </a>
                </div>
              </div>
              <div className="space-y-4 text-gray-700 leading-relaxed">
                <p>
                  A GitHub-to-Slack integration that generates AI summaries of code changes and sends them to Slack channels. 
                  Built with React, TypeScript, Node.js, PostgreSQL, and Express. Handles OAuth flows, webhooks, 
                  session management, and real-time notifications via Server-Sent Events.
                </p>
                <p className="text-gray-600">
                  This project taught me about building reliable integrations, managing state across services, 
                  and handling edge cases in production. It's evidence of working with APIs, databases, authentication, 
                  and real-time systems.
                </p>
              </div>
            </div>

            <div className="group bg-white border border-gray-200 rounded-xl p-8 md:p-10 hover:border-gray-300 hover:shadow-lg transition-all duration-200">
              <h3 className="text-2xl font-semibold text-gray-900 mb-4">Policy Generator (2022)</h3>
              <p className="text-gray-700 leading-relaxed">
                A tool for generating policy documents. Built early in my learning process, it was one of the first 
                projects where I had to think through data structures, user input validation, and output formatting. 
                It helped me understand how to structure applications and handle different types of content.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Engineering Mindset Section */}
      <section className="container mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20 bg-gray-50/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-semibold text-gray-900 mb-12 tracking-tight">Engineering Mindset</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white border border-gray-200 rounded-xl p-6 md:p-8 hover:border-gray-300 hover:shadow-md transition-all duration-200">
              <div className="w-14 h-14 bg-emerald-500 rounded-xl mb-6 flex items-center justify-center shadow-sm">
                <Bug className="text-white w-7 h-7" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Debugging</h3>
              <p className="text-gray-600 leading-relaxed text-sm">
                I spend a lot of time understanding why things break. Good error messages, logging, 
                and systematic investigation make the difference between fixing something in minutes versus hours.
              </p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-6 md:p-8 hover:border-gray-300 hover:shadow-md transition-all duration-200">
              <div className="w-14 h-14 bg-blue-500 rounded-xl mb-6 flex items-center justify-center shadow-sm">
                <CheckCircle className="text-white w-7 h-7" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Correctness</h3>
              <p className="text-gray-600 leading-relaxed text-sm">
                Code should do what it's supposed to do. I focus on understanding requirements, 
                handling edge cases, and verifying behavior rather than assuming things work.
              </p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-6 md:p-8 hover:border-gray-300 hover:shadow-md transition-all duration-200">
              <div className="w-14 h-14 bg-gray-800 rounded-xl mb-6 flex items-center justify-center shadow-sm">
                <Shield className="text-white w-7 h-7" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Reliability</h3>
              <p className="text-gray-600 leading-relaxed text-sm">
                Systems should fail gracefully. I think about error handling, timeouts, retries, 
                and what happens when dependencies are unavailable.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="container mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-semibold text-gray-900 mb-10 text-center tracking-tight">Contact</h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://github.com/carterjohndixon"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 text-base font-medium text-gray-900 bg-white border-2 border-gray-900 rounded-lg hover:bg-gray-900 hover:text-white transition-all duration-200"
            >
              <Github className="w-5 h-5" />
              GitHub
            </a>
            <a
              href="mailto:carter@pushlog.ai"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 text-base font-medium text-gray-900 bg-white border-2 border-gray-900 rounded-lg hover:bg-gray-900 hover:text-white transition-all duration-200"
            >
              <Mail className="w-5 h-5" />
              Email
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-12 mt-8">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-gray-500 text-sm">
            © {new Date().getFullYear()} Carter Dixon
          </p>
        </div>
      </footer>
    </div>
  );
}
