"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  AlertCircle,
  Loader2,
  QrCode,
  Smartphone,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/components/supabase-auth-provider";
import { useCart } from "@/components/cart-context";
import { GST_PERCENT_LABEL } from "@/lib/constants";
import type { CheckoutSession } from "@/lib/types/order";
import { toImageSrc } from "@/lib/utils/image";
import { toast } from "sonner";
import { sendNotification } from "@/lib/utils/notify";
import { sendActivity } from "@/lib/utils/activities";
import { logEvent } from "@/lib/services/event-logger";

interface UpiLinks {
  phonepe: string;
  gpay: string;
  paytm: string;
}

export default function SessionPaymentPage() {
  const { user, loading } = useAuth();
  const { clearCart } = useCart();
  const router = useRouter();
  const params = useParams();
  const sessionId = params?.sessionId as string;

  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [upiLinks, setUpiLinks] = useState<UpiLinks | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [orderInfo, setOrderInfo] = useState<{ order_id: string; order_number?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [showConfirmPrompt, setShowConfirmPrompt] = useState(false);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
      return;
    }

    if (user && sessionId) {
      fetchSessionAndLinks();
    }
  }, [user, loading, sessionId]);

  const fetchSessionAndLinks = async () => {
    try {
      setSessionLoading(true);

      const [sessionRes, linksRes] = await Promise.all([
        fetch(`/api/checkout-sessions/${sessionId}`),
        fetch(`/api/payments/upi-links?sessionId=${sessionId}`),
      ]);

      if (sessionRes.status === 410) {
        setExpired(true);
        return;
      }

      if (!sessionRes.ok) {
        throw new Error("Failed to fetch session");
      }

      const sessionData = await sessionRes.json();

      // If session is already completed, show success state
      if (sessionData.completed) {
        setPaymentConfirmed(true);
        setOrderInfo({ order_id: sessionData.order_id });
        clearCart();
        return;
      }

      setSession(sessionData.session);

      if (linksRes.ok) {
        const linksData = await linksRes.json();
        setUpiLinks(linksData.links);
        if (linksData.qrCode) {
          setQrCode(linksData.qrCode);
        }
      }
    } catch (err) {
      console.error("Error fetching session:", err);
      setError("Failed to load payment details");
    } finally {
      setSessionLoading(false);
    }
  };

  const handleConfirmPayment = async () => {
    setIsConfirming(true);
    setError(null);

    try {
      logEvent("payment_initiated", { session_id: sessionId });

      const res = await fetch("/api/payments/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });

      if (res.status === 409) {
        const data = await res.json();
        setPaymentConfirmed(true);
        setOrderInfo({ order_id: data.order_id });
        clearCart();
        toast.success("Order already confirmed!");
        return;
      }

      if (res.status === 410) {
        setExpired(true);
        toast.error("Session expired. Please checkout again.");
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to confirm payment");
      }

      const data = await res.json();

      toast.success("Order Placed Successfully!");
      setPaymentConfirmed(true);
      setOrderInfo({ order_id: data.order_id, order_number: data.order_number });
      clearCart();

      try {
        await sendNotification(
          "Order Success",
          `${user?.email} order confirmed via UPI`,
          "success"
        );
        await sendActivity(
          "order_submission_success",
          `Order confirmed via UPI #${data.order_number || data.order_id}`,
          data.order_id
        );
      } catch (notifyErr) {
        console.error("Post-confirmation notification/activity failed (non-fatal):", notifyErr);
      }
    } catch (err) {
      console.error("Payment confirmation error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to confirm payment"
      );
      toast.error("Failed to confirm payment");
    } finally {
      setIsConfirming(false);
      setShowConfirmPrompt(false);
    }
  };

  if (loading || sessionLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p>Loading payment details...</p>
        </div>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-20">
          <div className="max-w-md mx-auto text-center">
            <Clock className="w-16 h-16 text-amber-500 mx-auto mb-4" />
            <h1 className="text-2xl font-light mb-4">Session Expired</h1>
            <p className="text-muted-foreground mb-8">
              Your checkout session has expired. Please go back and try again.
            </p>
            <Button asChild>
              <Link href="/checkout">Back to Checkout</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (error && !session) {
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

  if (paymentConfirmed) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-20">
          <div className="max-w-2xl mx-auto text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-3xl font-light mb-4">Order Placed!</h1>
            <p className="text-muted-foreground mb-2">
              Thank you for your order. We are verifying your payment.
            </p>
            {orderInfo?.order_number && (
              <p className="text-sm text-muted-foreground mb-2">
                Order #{orderInfo.order_number}
              </p>
            )}
            {session && (
              <p className="text-sm text-muted-foreground mb-8">
                Total: ₹{session.total_amount.toFixed(2)}
              </p>
            )}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild>
                <Link href="/products">Continue Shopping</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/orders">View My Orders</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
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
          {/* Payment Section */}
          <div className="space-y-8">
            {/* Amount */}
            <div className="text-center lg:text-left">
              <p className="text-sm text-muted-foreground mb-1">Amount to pay</p>
              <p className="text-4xl font-semibold">
                ₹{session.total_amount.toFixed(2)}
              </p>
            </div>

            {/* QR Code */}
            <div className="flex flex-col items-center">
              <div className="bg-white p-4 rounded-xl shadow-sm border">
                {qrCode ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={qrCode}
                    alt="UPI QR Code"
                    width={280}
                    height={280}
                    className="rounded-lg"
                  />
                ) : (
                  <div className="w-[280px] h-[280px] flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 mt-4 text-muted-foreground">
                <QrCode className="w-4 h-4" />
                <p className="text-sm">
                  Scan QR code with any UPI app to pay ₹{session.total_amount.toFixed(2)}
                </p>
              </div>
            </div>

            {/* UPI App Buttons */}
            {upiLinks && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Smartphone className="w-4 h-4 text-muted-foreground" />
                  <p className="text-sm font-medium">Or pay using</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <a
                    href={upiLinks.phonepe}
                    className="flex flex-col items-center gap-2 p-4 border rounded-lg hover:border-purple-400 hover:bg-purple-50 transition-colors"
                  >
                    <Image src="/phonepe.png" alt="PhonePe" width={40} height={40} className="rounded-lg" />
                    <span className="text-xs font-medium">PhonePe</span>
                  </a>
                  <a
                    href={upiLinks.gpay}
                    className="flex flex-col items-center gap-2 p-4 border rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors"
                  >
                    <Image src="/gpay.png" alt="GPay" width={40} height={40} className="rounded-lg" />
                    <span className="text-xs font-medium">GPay</span>
                  </a>
                  <a
                    href={upiLinks.paytm}
                    className="flex flex-col items-center gap-2 p-4 border rounded-lg hover:border-sky-400 hover:bg-sky-50 transition-colors"
                  >
                    <Image src="/paytm.png" alt="Paytm" width={40} height={40} className="rounded-lg" />
                    <span className="text-xs font-medium">Paytm</span>
                  </a>
                </div>
              </div>
            )}

            <Separator />

            {/* Confirm Payment */}
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                After completing the payment via QR code or UPI app, click the
                button below to confirm your order.
              </p>

              {/* Confirmation Prompt */}
              {showConfirmPrompt && (
                <div className="border border-amber-200 bg-amber-50 rounded-lg p-4">
                  <p className="text-sm font-medium text-amber-900 mb-3">
                    Have you completed the payment of ₹
                    {session.total_amount.toFixed(2)}?
                  </p>
                  <div className="flex gap-3">
                    <Button
                      size="sm"
                      onClick={handleConfirmPayment}
                      disabled={isConfirming}
                    >
                      {isConfirming ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Confirming...
                        </div>
                      ) : (
                        "Yes, I have paid"
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowConfirmPrompt(false)}
                      disabled={isConfirming}
                    >
                      Not yet
                    </Button>
                  </div>
                </div>
              )}

              {!showConfirmPrompt && (
                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => setShowConfirmPrompt(true)}
                >
                  <Check className="w-4 h-4 mr-2" />I Have Paid
                </Button>
              )}

              {/* Error Display */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-red-800">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-sm font-medium">Error</span>
                  </div>
                  <p className="text-sm text-red-700 mt-1">{error}</p>
                </div>
              )}
            </div>
          </div>

          {/* Order Summary */}
          <div className="lg:sticky lg:top-8 h-fit">
            <div className="bg-muted/30 p-6 rounded-lg">
              <h2 className="text-lg font-medium mb-4">Order Summary</h2>

              <Separator className="mb-4" />

              {/* Items */}
              <div className="space-y-4 mb-6">
                {session.items.map((item) => (
                  <div key={`${item.id}-${item.size ?? ""}-${item.color ?? ""}`} className="flex gap-3">
                    <div className="relative w-16 h-16 bg-muted rounded-md overflow-hidden">
                      {item.image && (
                        <Image
                          src={toImageSrc(item.image)}
                          alt={item.name}
                          fill
                          className="object-cover"
                        />
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium text-sm">{item.name}</h3>
                      {(item.size || item.color) && (
                        <p className="text-xs text-muted-foreground">
                          {[
                            item.size && `Size: ${item.size}`,
                            item.color && `Color: ${item.color}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
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
                  <span>₹{session.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Delivery</span>
                  <span>₹{session.delivery_charge.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>{GST_PERCENT_LABEL}</span>
                  <span>₹{session.tax_amount.toFixed(2)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-medium">
                  <span>Total</span>
                  <span>₹{session.total_amount.toFixed(2)}</span>
                </div>
              </div>

              {/* Shipping Address */}
              <div className="bg-background p-4 rounded-md">
                <h4 className="font-medium text-sm mb-2">Shipping Address</h4>
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium">
                    {session.shipping_address.full_name}
                  </p>
                  <p>{session.shipping_address.address_line_1}</p>
                  {session.shipping_address.address_line_2 && (
                    <p>{session.shipping_address.address_line_2}</p>
                  )}
                  <p>
                    {session.shipping_address.city},{" "}
                    {session.shipping_address.state}{" "}
                    {session.shipping_address.postal_code}
                  </p>
                  <p>{session.shipping_address.country}</p>
                  {session.shipping_address.phone && (
                    <p>Phone: {session.shipping_address.phone}</p>
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
