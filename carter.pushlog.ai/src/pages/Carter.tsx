import { Github, Mail, Bug, CheckCircle, Shield } from "lucide-react";

export default function Carter() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="container mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold text-graphite mb-4">
            I'm Carter Dixon
          </h1>
          <p className="text-xl text-steel-gray mb-8">
            Software engineer focused on backend systems and developer tools.
          </p>
        </div>
      </section>

      {/* Background Section */}
      <section className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-semibold text-graphite mb-6">Background</h2>
          <div className="prose prose-gray max-w-none">
            <p className="text-steel-gray leading-relaxed mb-4">
              I started teaching myself to code in 2021, beginning with Python. From there I moved through web development, 
              then Node.js for backend work. I spent time with C++ and Rust to understand systems programming, 
              explored machine learning, worked with OpenGL for graphics, and eventually settled into React for frontend work.
            </p>
            <p className="text-steel-gray leading-relaxed">
              The progression wasn't planned—I followed what interested me and what problems I was trying to solve. 
              Each language and framework taught me something different about how software works.
            </p>
          </div>
        </div>
      </section>

      {/* Current Section */}
      <section className="container mx-auto px-4 sm:px-6 lg:px-8 py-12 bg-gray-50">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-semibold text-graphite mb-6">Current</h2>
          <div className="prose prose-gray max-w-none">
            <p className="text-steel-gray leading-relaxed mb-4">
              I graduated high school and I'm working now. Most of my time goes into building tools focused on 
              productivity and backend systems. I'm interested in making things that work reliably and don't get in the way.
            </p>
            <p className="text-steel-gray leading-relaxed">
              The backend work is what I find most engaging—designing APIs, handling data, managing state, 
              and making sure things fail gracefully when they need to.
            </p>
          </div>
        </div>
      </section>

      {/* Projects Section */}
      <section className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-semibold text-graphite mb-6">Projects</h2>
          <div className="space-y-6">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-xl font-semibold text-graphite mb-3">PushLog</h3>
              <p className="text-steel-gray leading-relaxed mb-4">
                A GitHub-to-Slack integration that generates AI summaries of code changes and sends them to Slack channels. 
                Built with React, TypeScript, Node.js, PostgreSQL, and Express. Handles OAuth flows, webhooks, 
                session management, and real-time notifications via Server-Sent Events.
              </p>
              <p className="text-steel-gray leading-relaxed mb-4">
                This project taught me about building reliable integrations, managing state across services, 
                and handling edge cases in production. It's evidence of working with APIs, databases, authentication, 
                and real-time systems.
              </p>
              <div className="flex gap-3">
                <a
                  href="https://github.com/carterjohndixon/PushLog"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                >
                  <Github className="mr-2 w-4 h-4" />
                  View Code
                </a>
                <a
                  href="https://pushlog.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                >
                  View Site
                </a>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-xl font-semibold text-graphite mb-3">Policy Generator (2022)</h3>
              <p className="text-steel-gray leading-relaxed">
                A tool for generating policy documents. Built early in my learning process, it was one of the first 
                projects where I had to think through data structures, user input validation, and output formatting. 
                It helped me understand how to structure applications and handle different types of content.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Engineering Mindset Section */}
      <section className="container mx-auto px-4 sm:px-6 lg:px-8 py-12 bg-gray-50">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-semibold text-graphite mb-6">Engineering Mindset</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="w-12 h-12 bg-log-green rounded-lg mb-4 flex items-center justify-center">
                <Bug className="text-white w-6 h-6" />
              </div>
              <h3 className="font-semibold text-graphite mb-2">Debugging</h3>
              <p className="text-steel-gray text-sm leading-relaxed">
                I spend a lot of time understanding why things break. Good error messages, logging, 
                and systematic investigation make the difference between fixing something in minutes versus hours.
              </p>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="w-12 h-12 bg-sky-blue rounded-lg mb-4 flex items-center justify-center">
                <CheckCircle className="text-white w-6 h-6" />
              </div>
              <h3 className="font-semibold text-graphite mb-2">Correctness</h3>
              <p className="text-steel-gray text-sm leading-relaxed">
                Code should do what it's supposed to do. I focus on understanding requirements, 
                handling edge cases, and verifying behavior rather than assuming things work.
              </p>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="w-12 h-12 bg-graphite rounded-lg mb-4 flex items-center justify-center">
                <Shield className="text-white w-6 h-6" />
              </div>
              <h3 className="font-semibold text-graphite mb-2">Reliability</h3>
              <p className="text-steel-gray text-sm leading-relaxed">
                Systems should fail gracefully. I think about error handling, timeouts, retries, 
                and what happens when dependencies are unavailable.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-semibold text-graphite mb-6">Contact</h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://github.com/carterjohndixon"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center border border-gray-300 px-6 py-3 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Github className="mr-2 w-4 h-4" />
              GitHub
            </a>
            <a
              href="mailto:carter@pushlog.ai"
              className="inline-flex items-center justify-center border border-gray-300 px-6 py-3 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Mail className="mr-2 w-4 h-4" />
              Email
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8 mt-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-steel-gray text-sm">
            © {new Date().getFullYear()} Carter Dixon
          </p>
        </div>
      </footer>
    </div>
  );
}
