import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Newsletter() {
  return (
    <section className="py-24 bg-[#f5eee0]">
      <div className="container mx-auto px-4 max-w-xl text-center">
        <h2 className="text-2xl md:text-3xl font-light mb-4">
          Join Our Family
        </h2>
        <p className="text-muted-foreground mb-8">
          Subscribe to receive updates on new arrivals, special offers, and
          parenting tips.
        </p>
        <form className="flex flex-col sm:flex-row gap-3">
          <Input
            type="email"
            placeholder="Your email address"
            className="flex-1 bg-white"
            required
          />
          <Button type="submit">Subscribe</Button>
        </form>
      </div>
    </section>
  );
}
