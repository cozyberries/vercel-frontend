"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, HelpCircle, ShoppingBag, Truck, RotateCcw, CreditCard, Shield } from "lucide-react";

interface FAQItem {
  question: string;
  answer: string;
  category: string;
}

const faqData: FAQItem[] = [
  // General Questions
  {
    question: "What is CozyBerries?",
    answer: "CozyBerries is a premium baby clothing brand that specializes in adorable, high-quality clothing for your little ones. We craft our garments with love, design them for comfort, and make them to last through all your baby's adventures.",
    category: "general"
  },
  {
    question: "What age ranges do you cater to?",
    answer: "We offer clothing for babies and toddlers from newborn to 4T (approximately 0-4 years old). Our size guide helps you find the perfect fit for your little one.",
    category: "general"
  },
  {
    question: "Are your clothes safe for babies?",
    answer: "Absolutely! All our clothing is made from baby-safe, non-toxic materials. We use organic cotton and other gentle fabrics that are safe for sensitive baby skin. All products meet or exceed safety standards for children's clothing.",
    category: "general"
  },

  // Shopping & Orders
  {
    question: "How do I place an order?",
    answer: "Simply browse our products, select the items you love, choose the appropriate size, and add them to your cart. Then proceed to checkout, enter your shipping information, and complete your payment. You'll receive a confirmation email once your order is placed.",
    category: "shopping"
  },
  {
    question: "Can I modify or cancel my order?",
    answer: "You can modify or cancel your order within 2 hours of placing it. After that, the order enters our fulfillment process and cannot be changed. If you need to make changes, please contact us immediately at hello@cozyberries.com.",
    category: "shopping"
  },
  {
    question: "Do you offer gift wrapping?",
    answer: "Yes! We offer beautiful gift wrapping for all orders. You can add gift wrapping during checkout, and we'll include a personalized message card at no extra cost.",
    category: "shopping"
  },
  {
    question: "What payment methods do you accept?",
    answer: "We accept all major credit cards (Visa, MasterCard, American Express), PayPal, Apple Pay, Google Pay, and Shop Pay. All payments are processed securely through our encrypted payment system.",
    category: "shopping"
  },

  // Shipping & Delivery
  {
    question: "How long does shipping take?",
    answer: "Standard shipping takes 5-7 business days, express shipping takes 2-3 business days, and overnight shipping arrives the next business day. International shipping times vary by location (7-21 business days).",
    category: "shipping"
  },
  {
    question: "Do you ship internationally?",
    answer: "Yes! We ship to most countries worldwide. International shipping costs and delivery times vary by location. You can see the exact cost and estimated delivery time during checkout.",
    category: "shipping"
  },
  {
    question: "How can I track my order?",
    answer: "Once your order ships, you'll receive a tracking number via email. You can also track your order on our Track Order page using your order number and email address.",
    category: "shipping"
  },
  {
    question: "What if my package is lost or stolen?",
    answer: "We're sorry to hear that! Please contact us immediately, and we'll work with the shipping carrier to locate your package or arrange for a replacement. We're committed to making sure you receive your order.",
    category: "shipping"
  },

  // Returns & Exchanges
  {
    question: "What is your return policy?",
    answer: "We offer a 30-day return policy for all items in original condition. Items must be unworn, unwashed, and in original packaging. Clearance and sale items are final sale and cannot be returned.",
    category: "returns"
  },
  {
    question: "How do I return an item?",
    answer: "To return an item, contact us at hello@cozyberries.com or use our online return portal. We'll provide you with a return label and instructions. Returns are free within the US.",
    category: "returns"
  },
  {
    question: "Can I exchange for a different size?",
    answer: "Yes! We offer free exchanges within 30 days. Simply follow our return process and specify the new size you'd like. We'll send the new size as soon as we receive your return.",
    category: "returns"
  },
  {
    question: "How long does it take to process a return?",
    answer: "Once we receive your return, we'll process it within 2-3 business days. You'll receive an email confirmation once your refund is processed. Refunds typically appear in your account within 5-7 business days.",
    category: "returns"
  },

  // Sizing & Care
  {
    question: "How do I choose the right size?",
    answer: "We provide detailed size charts for each product. Measure your baby's chest, waist, and length, then compare with our size guide. If you're between sizes, we recommend sizing up for comfort and room to grow.",
    category: "sizing"
  },
  {
    question: "How should I care for the clothes?",
    answer: "Most of our items can be machine washed in cold water and tumble dried on low heat. We recommend using gentle, baby-safe detergents. Check the care label on each item for specific instructions.",
    category: "sizing"
  },
  {
    question: "Do the clothes shrink?",
    answer: "Our clothes are pre-shrunk and designed to maintain their shape and size through normal washing and drying. However, we always recommend following the care instructions to ensure the best longevity.",
    category: "sizing"
  }
];

const categories = [
  { id: "all", name: "All Questions", icon: HelpCircle },
  { id: "general", name: "General", icon: HelpCircle },
  { id: "shopping", name: "Shopping & Orders", icon: ShoppingBag },
  { id: "shipping", name: "Shipping & Delivery", icon: Truck },
  { id: "returns", name: "Returns & Exchanges", icon: RotateCcw },
  { id: "sizing", name: "Sizing & Care", icon: Shield }
];

export default function FAQsPage() {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [openItems, setOpenItems] = useState<number[]>([]);

  const filteredFAQs = selectedCategory === "all" 
    ? faqData 
    : faqData.filter(faq => faq.category === selectedCategory);

  const toggleItem = (index: number) => {
    setOpenItems(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Frequently Asked Questions</h1>
          <p className="text-lg text-muted-foreground">
            Find answers to common questions about our products, shipping, returns, and more
          </p>
        </div>

        {/* Category Filter */}
        <div className="flex flex-wrap gap-2 justify-center mb-8">
          {categories.map((category) => {
            const Icon = category.icon;
            return (
              <Button
                key={category.id}
                variant={selectedCategory === category.id ? "default" : "outline"}
                onClick={() => setSelectedCategory(category.id)}
                className="flex items-center gap-2"
              >
                <Icon className="h-4 w-4" />
                {category.name}
              </Button>
            );
          })}
        </div>

        {/* FAQ Items */}
        <div className="space-y-4">
          {filteredFAQs.map((faq, index) => {
            const isOpen = openItems.includes(index);
            return (
              <Card key={index} className="overflow-hidden">
                <Button
                  variant="ghost"
                  className="w-full justify-between p-6 h-auto"
                  onClick={() => toggleItem(index)}
                >
                  <span className="text-left font-medium">{faq.question}</span>
                  {isOpen ? (
                    <ChevronUp className="h-5 w-5 flex-shrink-0 ml-4" />
                  ) : (
                    <ChevronDown className="h-5 w-5 flex-shrink-0 ml-4" />
                  )}
                </Button>
                {isOpen && (
                  <CardContent className="pt-0 pb-6">
                    <p className="text-muted-foreground leading-relaxed">{faq.answer}</p>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>

        {/* Contact Section */}
        <Card className="mt-12">
          <CardHeader className="text-center">
            <CardTitle>Still have questions?</CardTitle>
            <CardDescription>
              Can't find what you're looking for? We're here to help!
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <div className="space-y-4">
              <p className="text-muted-foreground">
                Contact our friendly customer service team and we'll get back to you within 24 hours.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button asChild>
                  <a href="/contact">Contact Us</a>
                </Button>
                <Button variant="outline" asChild>
                  <a href="mailto:hello@cozyberries.com">Email Us</a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
