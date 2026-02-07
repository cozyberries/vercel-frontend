"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Truck, RotateCcw, Shield, Clock, Package, AlertCircle } from "lucide-react";

export default function ShippingReturnsPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Shipping & Returns</h1>
          <p className="text-lg text-muted-foreground">
            Everything you need to know about shipping and returns
          </p>
        </div>

        <div className="space-y-8">
          {/* Shipping Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-6 w-6 text-primary" />
                Shipping Information
              </CardTitle>
              <CardDescription>
                Fast, secure, and reliable shipping options for your little ones' clothing
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Shipping Options</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <h4 className="font-medium">Standard Shipping</h4>
                        <p className="text-sm text-muted-foreground">5-7 business days</p>
                      </div>
                      <Badge variant="secondary">Free on orders $50+</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <h4 className="font-medium">Express Shipping</h4>
                        <p className="text-sm text-muted-foreground">2-3 business days</p>
                      </div>
                      <Badge variant="secondary">$9.99</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <h4 className="font-medium">Overnight Shipping</h4>
                        <p className="text-sm text-muted-foreground">Next business day</p>
                      </div>
                      <Badge variant="secondary">$19.99</Badge>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Shipping Details</h3>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <Package className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <h4 className="font-medium">Processing Time</h4>
                        <p className="text-sm text-muted-foreground">1-2 business days for order processing</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Shield className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <h4 className="font-medium">Secure Packaging</h4>
                        <p className="text-sm text-muted-foreground">All items are carefully packaged to prevent damage</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Clock className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <h4 className="font-medium">Delivery Hours</h4>
                        <p className="text-sm text-muted-foreground">Monday-Friday, 9 AM - 6 PM</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Returns Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RotateCcw className="h-6 w-6 text-primary" />
                Returns & Exchanges
              </CardTitle>
              <CardDescription>
                Easy returns and exchanges within 30 days of purchase
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Return Policy</h3>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <Clock className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <h4 className="font-medium">30-Day Return Window</h4>
                        <p className="text-sm text-muted-foreground">Returns must be initiated within 30 days of delivery</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Shield className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <h4 className="font-medium">Condition Requirements</h4>
                        <p className="text-sm text-muted-foreground">Items must be unworn, unwashed, and in original packaging</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <h4 className="font-medium">Final Sale Items</h4>
                        <p className="text-sm text-muted-foreground">Clearance and sale items are final sale and cannot be returned</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">How to Return</h3>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 border rounded-lg">
                      <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">1</div>
                      <div>
                        <h4 className="font-medium">Initiate Return</h4>
                        <p className="text-sm text-muted-foreground">Contact us or use our online return portal</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 border rounded-lg">
                      <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">2</div>
                      <div>
                        <h4 className="font-medium">Package Items</h4>
                        <p className="text-sm text-muted-foreground">Use original packaging or similar protective materials</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 border rounded-lg">
                      <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">3</div>
                      <div>
                        <h4 className="font-medium">Ship Back</h4>
                        <p className="text-sm text-muted-foreground">Use provided return label or ship to our return center</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* International Shipping */}
          <Card>
            <CardHeader>
              <CardTitle>International Shipping</CardTitle>
              <CardDescription>
                We ship worldwide to bring adorable clothing to little ones everywhere
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <h3 className="font-semibold mb-2">North America</h3>
                  <p className="text-sm text-muted-foreground mb-2">US, Canada, Mexico</p>
                  <Badge variant="outline">5-10 business days</Badge>
                </div>
                <div className="text-center">
                  <h3 className="font-semibold mb-2">Europe</h3>
                  <p className="text-sm text-muted-foreground mb-2">EU, UK, Switzerland</p>
                  <Badge variant="outline">7-14 business days</Badge>
                </div>
                <div className="text-center">
                  <h3 className="font-semibold mb-2">Rest of World</h3>
                  <p className="text-sm text-muted-foreground mb-2">Asia, Australia, etc.</p>
                  <Badge variant="outline">10-21 business days</Badge>
                </div>
              </div>
              <div className="mt-6 p-4 bg-muted rounded-lg">
                <h4 className="font-medium mb-2">Important Notes</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• International orders may be subject to customs duties and taxes</li>
                  <li>• Delivery times may vary due to customs processing</li>
                  <li>• Some countries may have restrictions on certain items</li>
                  <li>• Contact us for specific shipping rates to your country</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* FAQ Section */}
          <Card>
            <CardHeader>
              <CardTitle>Shipping & Returns FAQ</CardTitle>
              <CardDescription>
                Common questions about our shipping and return policies
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium">How long does shipping take?</h4>
                  <p className="text-sm text-muted-foreground">
                    Standard shipping takes 5-7 business days, express takes 2-3 business days, and overnight arrives the next business day.
                  </p>
                </div>
                <div>
                  <h4 className="font-medium">Can I track my order?</h4>
                  <p className="text-sm text-muted-foreground">
                    Yes! You'll receive a tracking number via email once your order ships. You can also track orders on our <a href="/track-order" className="text-primary hover:underline">Track Order</a> page.
                  </p>
                </div>
                <div>
                  <h4 className="font-medium">What if my item arrives damaged?</h4>
                  <p className="text-sm text-muted-foreground">
                    We're sorry to hear that! Please contact us immediately with photos of the damage, and we'll arrange for a replacement or full refund.
                  </p>
                </div>
                <div>
                  <h4 className="font-medium">Can I exchange for a different size?</h4>
                  <p className="text-sm text-muted-foreground">
                    Absolutely! Exchanges are free within 30 days. Just follow our return process and specify the new size you'd like.
                  </p>
                </div>
                <div>
                  <h4 className="font-medium">Do you offer free returns?</h4>
                  <p className="text-sm text-muted-foreground">
                    Yes! We provide free return shipping for all returns within the US. International customers may be responsible for return shipping costs.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
