"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  CreditCard,
  Shield,
  Check,
  AlertCircle,
  Smartphone,
  Building,
  Wallet,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/components/supabase-auth-provider";
import type { Order, PaymentMethod } from "@/lib/types/order";

interface PaymentOption {
  id: PaymentMethod;
  name: string;
  icon: React.ReactNode;
  description: string;
  enabled: boolean;
}

const paymentOptions: PaymentOption[] = [
  {
    id: "credit_card",
    name: "Credit Card",
    icon: <CreditCard className="w-5 h-5" />,
    description: "Visa, Mastercard, American Express",
    enabled: true,
  },
  {
    id: "debit_card",
    name: "Debit Card",
    icon: <CreditCard className="w-5 h-5" />,
    description: "All major debit cards",
    enabled: true,
  },
  {
    id: "upi",
    name: "UPI",
    icon: <Smartphone className="w-5 h-5" />,
    description: "Google Pay, PhonePe, Paytm",
    enabled: true,
  },
  {
    id: "net_banking",
    name: "Net Banking",
    icon: <Building className="w-5 h-5" />,
    description: "All major banks",
    enabled: true,
  },
  {
    id: "wallet",
    name: "Digital Wallet",
    icon: <Wallet className="w-5 h-5" />,
    description: "Paytm, Amazon Pay, etc.",
    enabled: true,
  },
  {
    id: "cod",
    name: "Cash on Delivery",
    icon: <Shield className="w-5 h-5" />,
    description: "Pay when you receive",
    enabled: true,
  },
];

export default function PaymentPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const orderId = params?.orderId as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>("credit_card");
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderLoading, setOrderLoading] = useState(true);

  // Card form state
  const [cardForm, setCardForm] = useState({
    cardNumber: "",
    expiryDate: "",
    cvv: "",
    cardholderName: "",
  });

  // UPI form state
  const [upiId, setUpiId] = useState("");

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
      return;
    }

    if (user && orderId) {
      fetchOrder();
    }
  }, [user, loading, orderId]);

  const fetchOrder = async () => {
    try {
      setOrderLoading(true);
      const response = await fetch(`/api/orders/${orderId}`);
      
      if (!response.ok) {
        throw new Error("Failed to fetch order");
      }

      const data = await response.json();
      setOrder(data.order);
    } catch (err) {
      console.error("Error fetching order:", err);
      setError("Failed to load order details");
    } finally {
      setOrderLoading(false);
    }
  };

  const handleCardInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    let formattedValue = value;
    
    // Format card number
    if (name === "cardNumber") {
      formattedValue = value.replace(/\D/g, "").substring(0, 16);
      formattedValue = formattedValue.replace(/(\d{4})(?=\d)/g, "$1 ");
    }
    
    // Format expiry date
    if (name === "expiryDate") {
      formattedValue = value.replace(/\D/g, "").substring(0, 4);
      if (formattedValue.length >= 2) {
        formattedValue = formattedValue.substring(0, 2) + "/" + formattedValue.substring(2);
      }
    }
    
    // Format CVV
    if (name === "cvv") {
      formattedValue = value.replace(/\D/g, "").substring(0, 3);
    }

    setCardForm(prev => ({ ...prev, [name]: formattedValue }));
  };

  const simulatePayment = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      // Simulate payment processing time
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Simulate payment success/failure (90% success rate)
      const isSuccess = Math.random() > 0.1;

      if (!isSuccess) {
        throw new Error("Payment failed. Please try again.");
      }

      // Create payment record
      const paymentData = {
        order_id: orderId,
        payment_reference: `dummy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        payment_method: selectedPaymentMethod,
        gateway_provider: "manual" as const,
        amount: order!.total_amount,
        currency: "INR",
        gateway_response: {
          status: "success",
          transaction_id: `txn_${Date.now()}`,
          gateway: "dummy_gateway",
          timestamp: new Date().toISOString(),
        },
      };

      const paymentResponse = await fetch("/api/payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(paymentData),
      });

      if (!paymentResponse.ok) {
        throw new Error("Failed to record payment");
      }

      // Update payment status to completed
      const payment = await paymentResponse.json();
      await fetch(`/api/payments/${payment.payment.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "completed",
          gateway_response: {
            ...paymentData.gateway_response,
            completion_time: new Date().toISOString(),
          },
        }),
      });

      setPaymentComplete(true);
    } catch (err) {
      console.error("Payment error:", err);
      setError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading || orderLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p>Loading payment details...</p>
        </div>
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-20">
          <div className="max-w-md mx-auto text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-light mb-4">Error</h1>
            <p className="text-muted-foreground mb-8">{error}</p>
            <Button asChild>
              <Link href="/">Back to Home</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (paymentComplete) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-20">
          <div className="max-w-2xl mx-auto text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-3xl font-light mb-4">Payment Successful!</h1>
            <p className="text-muted-foreground mb-2">
              Your payment has been processed successfully.
            </p>
            <p className="text-sm text-muted-foreground mb-8">
              Order #{order?.order_number} • ₹{order?.total_amount.toFixed(2)}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild>
                <Link href="/profile">View Orders</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/products">Continue Shopping</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!order) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/checkout" className="flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back
            </Link>
          </Button>
          <h1 className="text-2xl font-light">Payment</h1>
        </div>

        <div className="grid lg:grid-cols-2 gap-12">
          {/* Payment Form */}
          <div className="space-y-8">
            {/* Payment Methods */}
            <div>
              <h2 className="text-lg font-medium mb-4">Payment Method</h2>
              <div className="space-y-3">
                {paymentOptions.map((option) => (
                  <div
                    key={option.id}
                    className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                      selectedPaymentMethod === option.id
                        ? "border-primary bg-primary/5"
                        : "border-gray-200 hover:border-gray-300"
                    } ${!option.enabled ? "opacity-50 cursor-not-allowed" : ""}`}
                    onClick={() => option.enabled && setSelectedPaymentMethod(option.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {option.icon}
                        <div>
                          <div className="font-medium">{option.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {option.description}
                          </div>
                        </div>
                      </div>
                      <div
                        className={`w-4 h-4 rounded-full border-2 ${
                          selectedPaymentMethod === option.id
                            ? "border-primary bg-primary"
                            : "border-gray-300"
                        }`}
                      >
                        {selectedPaymentMethod === option.id && (
                          <div className="w-full h-full rounded-full bg-white scale-50"></div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Payment Form Based on Selected Method */}
            {(selectedPaymentMethod === "credit_card" || selectedPaymentMethod === "debit_card") && (
              <div>
                <h3 className="text-md font-medium mb-4">Card Details</h3>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="cardNumber">Card Number</Label>
                    <Input
                      id="cardNumber"
                      name="cardNumber"
                      placeholder="1234 5678 9012 3456"
                      value={cardForm.cardNumber}
                      onChange={handleCardInputChange}
                      maxLength={19}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="expiryDate">Expiry Date</Label>
                      <Input
                        id="expiryDate"
                        name="expiryDate"
                        placeholder="MM/YY"
                        value={cardForm.expiryDate}
                        onChange={handleCardInputChange}
                        maxLength={5}
                      />
                    </div>
                    <div>
                      <Label htmlFor="cvv">CVV</Label>
                      <Input
                        id="cvv"
                        name="cvv"
                        placeholder="123"
                        value={cardForm.cvv}
                        onChange={handleCardInputChange}
                        maxLength={3}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="cardholderName">Cardholder Name</Label>
                    <Input
                      id="cardholderName"
                      name="cardholderName"
                      placeholder="John Doe"
                      value={cardForm.cardholderName}
                      onChange={handleCardInputChange}
                    />
                  </div>
                </div>
              </div>
            )}

            {selectedPaymentMethod === "upi" && (
              <div>
                <h3 className="text-md font-medium mb-4">UPI Details</h3>
                <div>
                  <Label htmlFor="upiId">UPI ID</Label>
                  <Input
                    id="upiId"
                    placeholder="yourname@paytm"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                  />
                </div>
              </div>
            )}

            {selectedPaymentMethod === "net_banking" && (
              <div>
                <h3 className="text-md font-medium mb-4">Net Banking</h3>
                <p className="text-sm text-muted-foreground">
                  You will be redirected to your bank's website to complete the payment.
                </p>
              </div>
            )}

            {selectedPaymentMethod === "wallet" && (
              <div>
                <h3 className="text-md font-medium mb-4">Digital Wallet</h3>
                <p className="text-sm text-muted-foreground">
                  You will be redirected to your wallet provider to complete the payment.
                </p>
              </div>
            )}

            {selectedPaymentMethod === "cod" && (
              <div>
                <h3 className="text-md font-medium mb-4">Cash on Delivery</h3>
                <p className="text-sm text-muted-foreground">
                  You can pay in cash when your order is delivered to your address.
                </p>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-2 text-red-800">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm font-medium">Payment Failed</span>
                </div>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            )}

            {/* Security Info */}
            <div className="bg-muted/50 p-4 rounded-lg">
              <div className="flex items-center gap-3 mb-2">
                <Shield className="w-5 h-5 text-green-600" />
                <span className="font-medium">Secure Payment</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Your payment information is encrypted and secure. This is a demo payment page.
              </p>
            </div>

            {/* Pay Button */}
            <Button
              className="w-full"
              size="lg"
              onClick={simulatePayment}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing Payment...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  Pay ₹{order.total_amount.toFixed(2)}
                </div>
              )}
            </Button>
          </div>

          {/* Order Summary */}
          <div className="lg:sticky lg:top-8 h-fit">
            <div className="bg-muted/30 p-6 rounded-lg">
              <h2 className="text-lg font-medium mb-4">Order Summary</h2>

              {/* Order Info */}
              <div className="mb-4">
                <p className="text-sm text-muted-foreground">Order #{order.order_number}</p>
                <p className="text-xs text-muted-foreground">Status: {order.status.replace("_", " ").toUpperCase()}</p>
              </div>

              <Separator className="mb-4" />

              {/* Items */}
              <div className="space-y-4 mb-6">
                {order.items.map((item) => (
                  <div key={item.id} className="flex gap-3">
                    <div className="relative w-16 h-16 bg-muted rounded-md overflow-hidden">
                      {item.image && (
                        <Image
                          src={item.image}
                          alt={item.name}
                          fill
                          className="object-cover"
                        />
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium text-sm">{item.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        Qty: {item.quantity}
                      </p>
                    </div>
                    <div className="text-sm font-medium">
                      ₹{(item.price * item.quantity).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>

              <Separator className="mb-4" />

              {/* Totals */}
              <div className="space-y-2 mb-6">
                <div className="flex justify-between text-sm">
                  <span>Subtotal</span>
                  <span>₹{order.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Delivery</span>
                  <span>₹{order.delivery_charge.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Tax</span>
                  <span>₹{order.tax_amount.toFixed(2)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-medium">
                  <span>Total</span>
                  <span>₹{order.total_amount.toFixed(2)}</span>
                </div>
              </div>

              {/* Shipping Address */}
              <div className="bg-background p-4 rounded-md">
                <h4 className="font-medium text-sm mb-2">Shipping Address</h4>
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium">{order.shipping_address.full_name}</p>
                  <p>{order.shipping_address.address_line_1}</p>
                  {order.shipping_address.address_line_2 && (
                    <p>{order.shipping_address.address_line_2}</p>
                  )}
                  <p>
                    {order.shipping_address.city}, {order.shipping_address.state}{" "}
                    {order.shipping_address.postal_code}
                  </p>
                  <p>{order.shipping_address.country}</p>
                  {order.shipping_address.phone && (
                    <p>Phone: {order.shipping_address.phone}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
