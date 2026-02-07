import Link from "next/link";
import { Ruler, Baby, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Size Guide | Cozyberries",
  description:
    "Find the perfect fit for your little one with our baby and kids clothing size guide.",
};

const sizeData = [
  {
    size: "0-3M",
    age: "0–3 months",
    weight: "3–6 kg",
    height: "50–62 cm",
    chest: "38–42 cm",
  },
  {
    size: "3-6M",
    age: "3–6 months",
    weight: "6–8 kg",
    height: "62–68 cm",
    chest: "42–45 cm",
  },
  {
    size: "6-12M",
    age: "6–12 months",
    weight: "8–10 kg",
    height: "68–76 cm",
    chest: "45–48 cm",
  },
  {
    size: "1-2Y",
    age: "1–2 years",
    weight: "10–13 kg",
    height: "76–88 cm",
    chest: "48–51 cm",
  },
  {
    size: "2-3Y",
    age: "2–3 years",
    weight: "13–15 kg",
    height: "88–98 cm",
    chest: "51–53 cm",
  },
  {
    size: "3-4Y",
    age: "3–4 years",
    weight: "15–17 kg",
    height: "98–104 cm",
    chest: "53–55 cm",
  },
  {
    size: "4-5Y",
    age: "4–5 years",
    weight: "17–20 kg",
    height: "104–110 cm",
    chest: "55–57 cm",
  },
  {
    size: "5-6Y",
    age: "5–6 years",
    weight: "20–23 kg",
    height: "110–116 cm",
    chest: "57–59 cm",
  },
];

const measurementTips = [
  {
    title: "Chest",
    description:
      "Measure around the fullest part of the chest, keeping the tape snug but not tight.",
  },
  {
    title: "Height",
    description:
      "For babies, lay them flat and measure from head to toe. For toddlers, measure standing against a wall.",
  },
  {
    title: "Weight",
    description:
      "Use a baby scale or weigh yourself holding your baby, then subtract your own weight.",
  },
];

export default function SizeGuidePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f9f7f4] to-white">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Back link */}
        <Link
          href="/products"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-8 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to products
        </Link>

        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-primary/10 rounded-full mb-4">
            <Ruler className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-3xl md:text-4xl font-light mb-3">Size Guide</h1>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Find the perfect fit for your little one. Our sizes are based on age,
            but we recommend checking measurements for the best fit.
          </p>
        </div>

        {/* Size Chart Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-12">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f9f7f4]">
                  <th className="text-left px-5 py-4 font-semibold text-gray-900">
                    Size
                  </th>
                  <th className="text-left px-5 py-4 font-semibold text-gray-900">
                    Age
                  </th>
                  <th className="text-left px-5 py-4 font-semibold text-gray-900">
                    Weight
                  </th>
                  <th className="text-left px-5 py-4 font-semibold text-gray-900">
                    Height
                  </th>
                  <th className="text-left px-5 py-4 font-semibold text-gray-900">
                    Chest
                  </th>
                </tr>
              </thead>
              <tbody>
                {sizeData.map((row, index) => (
                  <tr
                    key={row.size}
                    className={`border-t border-gray-100 ${
                      index % 2 === 0 ? "bg-white" : "bg-gray-50/50"
                    }`}
                  >
                    <td className="px-5 py-4 font-semibold text-gray-900">
                      {row.size}
                    </td>
                    <td className="px-5 py-4 text-gray-600">{row.age}</td>
                    <td className="px-5 py-4 text-gray-600">{row.weight}</td>
                    <td className="px-5 py-4 text-gray-600">{row.height}</td>
                    <td className="px-5 py-4 text-gray-600">{row.chest}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* How to Measure */}
        <div className="mb-12">
          <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
            <Baby className="h-5 w-5 text-primary" />
            How to Measure
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            {measurementTips.map((tip, index) => (
              <div
                key={tip.title}
                className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                    {index + 1}
                  </span>
                  <h3 className="font-semibold text-gray-900">{tip.title}</h3>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">
                  {tip.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Tips */}
        <div className="bg-amber-50/60 border border-amber-200/50 rounded-2xl p-6 mb-12">
          <h2 className="font-semibold text-gray-900 mb-3">
            Helpful Tips
          </h2>
          <ul className="space-y-2 text-sm text-gray-700">
            <li className="flex items-start gap-2">
              <span className="text-amber-500 mt-0.5">&#x2022;</span>
              If your child is between two sizes, we recommend sizing up for a
              more comfortable fit and room to grow.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-500 mt-0.5">&#x2022;</span>
              All our garments are made from 100% organic cotton and may shrink
              slightly after the first wash.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-500 mt-0.5">&#x2022;</span>
              Sizes are approximate. Every child grows differently, so
              measurements are the most reliable guide.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-500 mt-0.5">&#x2022;</span>
              For newborn essentials (jhablas, caps, mittens, booties), size 0-3M
              is one-size-fits-most.
            </li>
          </ul>
        </div>

        {/* CTA */}
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-4">
            Still unsure about sizing? We&apos;re happy to help!
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild variant="outline">
              <Link href="/contact">Contact Us</Link>
            </Button>
            <Button asChild>
              <Link href="/products">Shop Now</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
