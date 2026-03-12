import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Heart,
  Shield,
  Leaf,
  Wind,
  Layers,
  Recycle,
  Star,
  Sparkles,
  Droplets,
} from "lucide-react";
import Link from "next/link";
import GingerbreadDecoration from "@/components/GingerbreadDecoration";
import SnowflakeDecoration from "@/components/SnowflakeDecoration";
import { images } from "@/app/assets/images";

// ─── Constants: Brand Values ───────────────────────────────────────
const BRAND_VALUES = [
  { icon: Wind, label: "Naturally breathable" },
  { icon: Shield, label: "Free from harsh chemicals" },
  { icon: Layers, label: "Minimal, timeless, and functional" },
  { icon: Leaf, label: "Gentle on the planet" },
] as const;

const FABRIC_FEATURES = [
  {
    icon: Leaf,
    title: "100% Organic & Skin-Safe",
    description:
      "Organically grown cotton yarn, free from harmful pesticides and certified safe for your baby's delicate skin.",
  },
  {
    icon: Droplets,
    title: "Azo-Free Dyes",
    description:
      "Crafted with kid-friendly, azo-free dyes — vibrant colours that are gentle, non-toxic, and safe for everyday wear.",
  },
  {
    icon: Shield,
    title: "Free from Harsh Chemicals",
    description:
      "No formaldehyde, no heavy metals. Every fabric is carefully screened to ensure it's completely chemical-free.",
  },
  {
    icon: Wind,
    title: "Soft, Breathable & Gentle",
    description:
      "Woven into soft, breathable muslin that keeps your baby comfortable — whether it's a warm afternoon or a cosy evening.",
  },
] as const;

const DESIGN_FOCUS = [
  {
    icon: Heart,
    title: "Soft seams for sensitive skin",
    description: "No scratchy edges — just smooth, gentle seams designed to protect the most delicate skin.",
  },
  {
    icon: Layers,
    title: "Minimal silhouettes for daily wear",
    description: "Clean, functional designs that are easy to dress and undress — because simplicity matters.",
  },
  {
    icon: Recycle,
    title: "Sustainable details that reduce waste",
    description: "Thoughtful choices at every step, from small-batch production to eco-conscious finishing.",
  },
] as const;

const COMMITMENT_PILLARS = [
  {
    icon: Leaf,
    title: "Sustainable Practices",
    description: "From sourcing to packaging, every step is designed with the environment in mind.",
  },
  {
    icon: Star,
    title: "Small-Batch Production",
    description: "Mindful, intentional production runs that prioritise quality over quantity.",
  },
  {
    icon: Sparkles,
    title: "True Craftsmanship",
    description: "Every detail is lovingly considered — because your baby deserves nothing less.",
  },
] as const;

const BRAND_PROMISES = [
  { icon: Wind, label: "A promise of softness" },
  { icon: Shield, label: "A promise of safety" },
  { icon: Heart, label: "A promise of comfort in every thread" },
] as const;

export default function AboutPage() {
  return (
    <div className="flex flex-col">
      {/* ── Hero: Soft Beginnings ── */}
      <section className="py-20 bg-gradient-to-b from-[#f9f7f4] to-background relative overflow-hidden">
        <SnowflakeDecoration
          position="top-left"
          size="md"
          opacity={0.12}
          rotation={-20}
          animationType="up-down"
          delay={0.5}
        />
        <SnowflakeDecoration
          position="bottom-right"
          size="lg"
          opacity={0.1}
          rotation={30}
          animationType="diagonal"
          delay={1.8}
        />
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <p className="text-xs uppercase tracking-widest text-primary/60 mb-4 font-medium">
              Our Story
            </p>
            <h1 className="text-4xl md:text-5xl font-light mb-6 leading-tight">
              Soft Beginnings,
              <br />
              Wrapped in Love
            </h1>
            <p className="text-lg text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
              Cozyberries was born from a simple belief — little ones deserve
              the purest comfort from their very first day.
            </p>
            <div className="relative w-full max-w-2xl mx-auto aspect-video rounded-2xl overflow-hidden shadow-sm">
              <Image
                src={images.about.story}
                alt="CozyBerries Story"
                fill
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Where Comfort Meets Conscious Living ── */}
      <section className="py-20 bg-background relative overflow-hidden">
        <SnowflakeDecoration
          position="top-right"
          size="sm"
          opacity={0.08}
          rotation={45}
          animationType="gentle-sway"
          delay={0.3}
        />
        <SnowflakeDecoration
          position="bottom-left"
          size="md"
          opacity={0.1}
          rotation={-15}
          animationType="vertical-float"
          delay={1.5}
        />
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl font-light mb-5 leading-snug">
                  Where Comfort Meets
                  <br />
                  Conscious Living
                </h2>
                <p className="text-muted-foreground mb-4 leading-relaxed">
                  As a brand rooted in care and consciousness, we create
                  thoughtfully designed baby essentials made from 100% organic
                  muslin and breathable cotton. Every piece is crafted to feel
                  like a gentle hug — soft on delicate skin, light as air, and
                  safe for everyday cuddles.
                </p>
                <p className="text-sm text-muted-foreground/75 italic mb-7">
                  Inspired by nature, motherhood, and the quiet beauty of
                  childhood — expressed in soothing earthy tones and clean
                  silhouettes.
                </p>
                <p className="text-sm font-medium text-foreground/70 mb-4">
                  At Cozyberries, we believe baby clothing should be:
                </p>
                <div className="space-y-3">
                  {BRAND_VALUES.map(({ icon: Icon, label }) => (
                    <div key={label} className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="relative aspect-square rounded-2xl overflow-hidden shadow-sm">
                <Image
                  src={images.about.comfort_meets_conscious_living}
                  alt="Comfort meets conscious living"
                  fill
                  className="object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Our Fabrics ── */}
      <section className="py-20 bg-[#f9f7f4] relative overflow-hidden">
        <SnowflakeDecoration
          position="top-left"
          size="lg"
          opacity={0.1}
          rotation={20}
          animationType="diagonal"
          delay={0.8}
        />
        <GingerbreadDecoration
          position="bottom-right"
          size="sm"
          opacity={0.12}
          rotation={-40}
          animationType="left-right"
          delay={2.2}
        />
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-light mb-4">Our Fabrics</h2>
              <p className="text-muted-foreground max-w-xl mx-auto">
                Made from organically grown cotton yarn and gently woven into
                soft, breathable muslin — our fabrics are created with care
                from start to finish.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-5">
              {FABRIC_FEATURES.map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  className="bg-white rounded-2xl p-6 flex gap-4 items-start shadow-sm"
                >
                  <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium mb-1 text-sm">{title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Thoughtfully Designed for Tiny Moments ── */}
      <section className="py-20 bg-background relative overflow-hidden">
        <SnowflakeDecoration
          position="top-right"
          size="md"
          opacity={0.09}
          rotation={-25}
          animationType="up-down"
          delay={1.1}
        />
        <SnowflakeDecoration
          position="bottom-left"
          size="lg"
          opacity={0.11}
          rotation={35}
          animationType="gentle-sway"
          delay={2.8}
        />
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div className="relative aspect-square rounded-2xl overflow-hidden shadow-sm">
                <Image
                  src={images.about.designed_for_tiny_moments}
                  alt="Designed for tiny moments"
                  fill
                  className="object-cover"
                />
              </div>
              <div>
                <h2 className="text-3xl font-light mb-5 leading-snug">
                  Thoughtfully Designed
                  <br />
                  for Tiny Moments
                </h2>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  From first smiles to sleepy snuggles, every Cozyberries piece
                  is created to move with your little one — comfortably and
                  safely.
                </p>
                <p className="text-sm font-medium text-foreground/70 mb-4">
                  We focus on:
                </p>
                <div className="space-y-5">
                  {DESIGN_FOCUS.map(({ icon: Icon, title, description }) => (
                    <div key={title} className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-0.5">{title}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground/75 italic mt-6">
                  Because we believe everyday wear should feel special —
                  without compromising comfort.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Made with Love, Made with Purpose ── */}
      <section className="py-20 bg-[#f9f7f4] relative overflow-hidden">
        <SnowflakeDecoration
          position="top-left"
          size="md"
          opacity={0.1}
          rotation={-30}
          animationType="vertical-float"
          delay={0.6}
        />
        <GingerbreadDecoration
          position="bottom-right"
          size="md"
          opacity={0.1}
          rotation={20}
          animationType="up-down"
          delay={2.0}
        />
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-light mb-4 leading-snug">
                Made with Love,
                <br />
                Made with Purpose
              </h2>
              <p className="text-muted-foreground max-w-xl mx-auto">
                Our responsibility extends beyond your child. We are committed
                to sustainable practices, mindful small-batch production, and
                craftsmanship that respects both your baby and Mother Earth.
              </p>
            </div>

            {/* Commitment pillars */}
            <div className="grid md:grid-cols-3 gap-5 mb-10">
              {COMMITMENT_PILLARS.map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  className="bg-white rounded-2xl p-6 text-center shadow-sm"
                >
                  <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-medium mb-2 text-sm">{title}</h3>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>
              ))}
            </div>

            {/* The Promise card */}
            <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
              <p className="text-xs uppercase tracking-widest text-primary/60 mb-3 font-medium">
                Our Promise
              </p>
              <h3 className="text-2xl font-light mb-2">
                Cozyberries is more than a brand
              </h3>
              <p className="text-sm text-muted-foreground mb-8 max-w-sm mx-auto">
                It&apos;s a promise — woven into every thread.
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-8">
                {BRAND_PROMISES.map(({ icon: Icon, label }) => (
                  <div
                    key={label}
                    className="flex flex-col items-center gap-2"
                  >
                    <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <p className="text-sm text-muted-foreground max-w-[120px] text-center">
                      {label}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-sm text-muted-foreground/60 italic mt-8">
                From our hearts to your little berries.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Call to Action ── */}
      <section className="py-20 bg-background relative overflow-hidden">
        <SnowflakeDecoration
          position="bottom-right"
          size="md"
          opacity={0.08}
          rotation={50}
          animationType="diagonal"
          delay={1.9}
        />
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl font-light mb-6">Ready to Shop?</h2>
            <p className="text-muted-foreground mb-8">
              Discover our collection of premium baby clothing, crafted with
              love and designed for comfort.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" asChild>
                <Link href="/products">Shop Now</Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link href="/">Back to Home</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
