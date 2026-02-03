import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Github, Mail, Linkedin, Code, Coffee } from "lucide-react";

export default function Carter() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50">
      {/* Hero Section */}
      <section className="container mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="max-w-4xl mx-auto text-center">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <Logo size="xl" className="shadow-lg" />
          </div>

          {/* Main Heading */}
          <h1 className="text-5xl md:text-6xl font-bold text-graphite mb-6">
            Hey, I'm <span className="text-log-green">Carter</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-steel-gray mb-8 max-w-2xl mx-auto">
            Developer & Creator of PushLog
          </p>

          {/* Description */}
          <p className="text-lg text-steel-gray mb-12 max-w-2xl mx-auto leading-relaxed">
            Building tools that make developers' lives easier. PushLog bridges the gap between 
            GitHub and Slack, bringing intelligent automation to your development workflow.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Button 
              onClick={() => window.open('https://github.com', '_blank')}
              className="bg-graphite text-white px-8 py-6 rounded-lg hover:bg-gray-700 transition-colors font-semibold text-lg"
            >
              <Github className="mr-2 w-5 h-5" />
              GitHub
            </Button>
            <Button 
              onClick={() => window.open('mailto:carter@pushlog.ai', '_blank')}
              variant="outline"
              className="border-2 border-log-green text-log-green px-8 py-6 rounded-lg hover:bg-log-green hover:text-white transition-colors font-semibold text-lg"
            >
              <Mail className="mr-2 w-5 h-5" />
              Get in Touch
            </Button>
          </div>
        </div>

        {/* Features/Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto mt-16">
          <Card className="hover:shadow-xl transition-shadow border-2 border-gray-100">
            <CardContent className="p-6 text-center">
              <div className="w-16 h-16 bg-log-green rounded-lg mx-auto mb-4 flex items-center justify-center">
                <Code className="text-white text-2xl w-8 h-8" />
              </div>
              <h3 className="font-semibold text-graphite mb-2 text-lg">Full Stack Developer</h3>
              <p className="text-steel-gray text-sm">
                Building modern web applications with React, TypeScript, and Node.js
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-xl transition-shadow border-2 border-gray-100">
            <CardContent className="p-6 text-center">
              <div className="w-16 h-16 bg-sky-blue rounded-lg mx-auto mb-4 flex items-center justify-center">
                <Coffee className="text-white text-2xl w-8 h-8" />
              </div>
              <h3 className="font-semibold text-graphite mb-2 text-lg">Product Builder</h3>
              <p className="text-steel-gray text-sm">
                Creating tools that solve real problems for development teams
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-xl transition-shadow border-2 border-gray-100">
            <CardContent className="p-6 text-center">
              <div className="w-16 h-16 bg-graphite rounded-lg mx-auto mb-4 flex items-center justify-center">
                <Github className="text-white text-2xl w-8 h-8" />
              </div>
              <h3 className="font-semibold text-graphite mb-2 text-lg">Open Source</h3>
              <p className="text-steel-gray text-sm">
                Contributing to the developer community through open source projects
              </p>
            </CardContent>
          </Card>
        </div>

        {/* About Section */}
        <div className="max-w-3xl mx-auto mt-20">
          <Card className="bg-white/80 backdrop-blur-sm border-2 border-gray-100">
            <CardContent className="p-8 md:p-12">
              <h2 className="text-3xl font-bold text-graphite mb-6 text-center">
                About PushLog
              </h2>
              <div className="space-y-4 text-steel-gray leading-relaxed">
                <p>
                  PushLog is a powerful integration platform that connects GitHub and Slack, 
                  enabling seamless communication and automation for development teams. 
                  With intelligent code summaries, real-time notifications, and flexible 
                  configuration options, PushLog helps teams stay synchronized and informed.
                </p>
                <p>
                  Built with modern technologies and a focus on developer experience, 
                  PushLog makes it easy to set up integrations and customize workflows 
                  to fit your team's needs.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="text-center mt-16 pt-8 border-t border-gray-200">
          <p className="text-steel-gray">
            Made with <span className="text-log-green">♥</span> by Carter
          </p>
          <p className="text-sm text-steel-gray mt-2">
            © {new Date().getFullYear()} PushLog. All rights reserved.
          </p>
        </div>
      </section>
    </div>
  );
}
