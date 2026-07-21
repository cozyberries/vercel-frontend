import { Wind, Leaf, Shield, Recycle } from "lucide-react";

const VALUES = [
  { icon: Wind, title: "Naturally breathable" },
  { icon: Leaf, title: "100% organic cotton" },
  { icon: Shield, title: "Free from harsh chemicals" },
  { icon: Recycle, title: "Made in small batches" },
];

export default function ValuesSection() {
  return (
    <section className="lg:py-14 py-8 bg-background">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-4xl rounded-[20px] bg-cb-linen px-[22px] py-[26px] text-center lg:px-12 lg:py-10">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-cb-terracotta">
            Why CozyBerries
          </p>
          <h2 className="mb-6 text-[22px] md:text-[28px] font-light">
            Comfort Meets Conscious Living
          </h2>
          <div className="grid grid-cols-2 gap-[14px] lg:grid-cols-4">
            {VALUES.map((v) => (
              <div key={v.title} className="flex items-center gap-2.5 text-left">
                <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
                  <v.icon className="h-4 w-4 text-cb-mauve-deep" />
                </span>
                <span className="text-sm font-semibold text-cb-fg">{v.title}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
