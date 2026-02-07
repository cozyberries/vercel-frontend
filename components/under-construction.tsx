import React from "react";
import Image from "next/image";
import { Construction, Clock, Mail, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { images } from "@/app/assets/images";

export default function UnderConstruction() {
  return (
    <div className="min-h-screen bg-[#f5eee0]">
      {/* Hero Section */}

      {/* Logo */}
      <div className="py-3 h-36">
        <Image
          src={images.logoURL}
          alt="CozyBerries"
          width={200}
          height={60}
          className="mx-auto object-contain"
        />
      </div>
      <section className="relative h-[500px] md:h-[600px] bg-[#f5eee0] overflow-hidden">
        <div className="container mx-auto px-4 h-full flex items-center justify-center">
          <div className="max-w-4xl mx-auto text-center">
            {/* Construction Icon */}
            <div className="mb-8">
              <Construction className="w-20 h-20 mx-auto text-primary animate-pulse" />
            </div>

            {/* Main Heading */}
            <h1 className="text-3xl md:text-5xl font-light mb-4">
              We're Building Something Beautiful
            </h1>

            {/* Subtitle */}
            <p className="text-lg mb-8 text-muted-foreground">
              Crafted with love, designed for comfort, and made to last
            </p>

            {/* Description */}
            <p className="text-base text-muted-foreground mb-12 leading-relaxed max-w-2xl mx-auto">
              Our team is putting the finishing touches on CozyBerries. We'll be
              back soon with a beautiful new experience for you and your little
              ones.
            </p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-light text-center mb-12">
            What's Coming
          </h2>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="flex items-center space-x-4 p-6 bg-[#f9f7f4] rounded-lg">
              <Clock className="w-8 h-8 text-primary" />
              <div>
                <h3 className="text-lg font-light mb-2">Coming Soon</h3>
                <p className="text-muted-foreground">
                  We're working hard to bring you something amazing!
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-4 p-6 bg-[#f9f7f4] rounded-lg">
              <Heart className="w-8 h-8 text-primary" />
              <div>
                <h3 className="text-lg font-light mb-2">Made with Love</h3>
                <p className="text-muted-foreground">
                  Every detail crafted for your little treasures
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-20 bg-[#f5eee0]">
        <div className="container mx-auto px-4 max-w-xl text-center">
          <h2 className="text-2xl md:text-3xl font-light mb-4">Stay Updated</h2>
          <p className="text-muted-foreground mb-8">
            Want to be notified when we launch? Drop us a line and we'll let you
            know as soon as we're ready!
          </p>
          <Button asChild size="lg">
            <a
              href="mailto:cozyberriesofficial@gmail.com"
              className="inline-flex items-center space-x-2"
            >
              <Mail className="w-5 h-5" />
              <span>Contact Us</span>
            </a>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <div className="py-8 bg-background text-center">
        <p className="text-sm text-muted-foreground">
          © 2024 CozyBerries. All rights reserved.
        </p>
      </div>
    </div>
  );
}
