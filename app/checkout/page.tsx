"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Truck,
  Shield,
  Check,
  MapPin,
  Plus,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useCart } from "@/components/cart-context";
import { useAuth } from "@/components/supabase-auth-provider";
import { useProfile } from "@/hooks/useProfile";
import AddressFormModal from "@/components/profile/AddressFormModal";
import { toast } from "sonner";
import Script from "next/script";
import { sendNotification } from "@/lib/utils/notify";
import { sendActivity } from "@/lib/utils/activities";
import UpiQr from "@/components/upi-qr";
import { images } from "@/app/assets/images";

interface CheckoutFormData {
  email: string;
  notes?: string;
}

export default function CheckoutPage() {
  const { cart, clearCart } = useCart();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);
  const [orderCompleted, setOrderCompleted] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    null
  );
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [formData, setFormData] = useState<CheckoutFormData>({
    email: "",
  });
  const [showQr, setShowQr] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);



  // Use profile hook for address management
  const {
    addresses,
    isLoading: addressesLoading,
    showAddAddress,
    editingAddress,
    addressData,
    addressValidationErrors,
    setShowAddAddress,
    setAddressData,
    setAddressValidationErrors,
    handleAddAddress,
    handleUpdateAddress,
    handleCloseAddressModal,
  } = useProfile(user);

  const subtotal = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  const deliveryCharge = cart.length > 0 ? 50 : 0;
  const tax = subtotal * 0.1; // 10% tax
  const total = subtotal + deliveryCharge + tax;

  // Redirect if user is not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  // Auto-populate email with user's email
  useEffect(() => {
    if (user?.email) {
      setFormData((prev) => ({
        ...prev,
        email: user.email || "",
      }));
    }
  }, [user]);

  // Auto-select default address if available
  useEffect(() => {
    if (addresses.length > 0 && !selectedAddressId) {
      const defaultAddress = addresses.find((addr) => addr.is_default);
      if (defaultAddress) {
        setSelectedAddressId(defaultAddress.id);
      }
    }
  }, [addresses, selectedAddressId]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // Handle address selection
  const handleAddressSelect = (addressId: string) => {
    setSelectedAddressId(addressId);
  };

  // Handle adding new address
  const handleAddNewAddress = () => {
    setShowAddressModal(true);
    setShowAddAddress(true);
  };

  // Handle address modal save
  const handleAddressModalSave = async () => {
    if (editingAddress) {
      await handleUpdateAddress(editingAddress);
    } else {
      await handleAddAddress();
    }
    setShowAddressModal(false);
  };

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });

    if (!selectedAddressId) {
      alert("Please select a shipping address");
      return;
    }

    // Clear previous timers
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (timerRef.current) clearTimeout(timerRef.current);

    setShowQr(true);

    const totalSeconds = 150; // 2:30
    setCountdown(totalSeconds);

    let sec = totalSeconds;

    // Start countdown
    countdownRef.current = setInterval(() => {
      sec -= 1;

      if (sec >= 0) {
        setCountdown(sec);
      } else {
        clearInterval(countdownRef.current!);
      }
    }, 1000);

    // After countdown ends → auto-create order
    timerRef.current = setTimeout(async () => {
      setIsProcessing(true);

      try {
        let generatedOrderId = `ORD-${Date.now()}`;
        // Create order
        const orderRes = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_id: generatedOrderId,
            items: cart.map((item) => ({
              id: item.id,
              name: item.name,
              price: item.price,
              quantity: item.quantity,
              image: item.image,
            })),
            shipping_address_id: selectedAddressId,
            notes: formData.notes || "",
          }),
        });

        if (!orderRes.ok) {
          toast.error("Failed to save order");
          await sendNotification("Order Failed", `${user?.email} failed`, "error");
          await sendActivity("order_submission_failed", `Failed order #${generatedOrderId}`, generatedOrderId);
          setIsProcessing(false);
          setShowQr(false);
          return;
        }

        const orderData = await orderRes.json();
        const createdOrder = orderData.order;

        const paymentRes = await fetch("/api/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_id: createdOrder.id,
            payment_reference: `UPI_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            payment_method: "upi",
            gateway_provider: "manual",
            amount: total,
            currency: "INR",
            gateway_response: {
              status: "pending",
              method: "upi",
              timestamp: new Date().toISOString(),
            },
          }),
        });

        if (!paymentRes.ok) {
          toast.error("Failed to create payment");
          await sendNotification("Payment Failed", `${user?.email} failed payment`, "error");
          await sendActivity("payment_submission_failed", `Failed payment #${generatedOrderId}`, generatedOrderId);
          setIsProcessing(false);
          setShowQr(false);
          return;
        } else {
          toast.success("Order created successfully!");
          await sendNotification("Order Success", `${user?.email} order successfully created`, "success");
          await sendActivity("order_submission_success", `Order successfully created #${generatedOrderId}`, generatedOrderId);
          setOrderCompleted(true);
          setShowQr(false);
          clearCart();
        }
      } catch (err) {
        console.error("Order creation error:", err);
        toast.error(err instanceof Error ? err.message : "Something went wrong");
        setShowQr(false);
        setIsProcessing(false);
      } finally {
        setIsProcessing(false);
      }
    }, totalSeconds * 1000);
  };


  if (showQr) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-20">
          <div className="max-w-2xl mx-auto text-center">
            <UpiQr
              upiId="hemankoli1409@ybl"
              name="CozyBerries"
              amount={total}
              note={formData.notes || ""}
              shopName="CozyBerries"
              logoUrl={images.logoURL}
              countdown={countdown}
            />
          </div>
        </div>
      </div>
    );
  }

  if (orderCompleted) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-20">
          <div className="max-w-2xl mx-auto text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-3xl font-light mb-4">Order Complete!</h1>
            <p className="text-muted-foreground mb-8">
              Thank you for your order. We'll send you a confirmation email
              shortly.
            </p>
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

  // Redirect if cart is empty
  if (cart.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-20">
          <div className="max-w-md mx-auto text-center">
            <h1 className="text-2xl font-light mb-4">Your cart is empty</h1>
            <p className="text-muted-foreground mb-8">
              Add some items to your cart before checking out.
            </p>
            <Button asChild>
              <Link href="/products">Continue Shopping</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Script type="text/javascript" src="https://checkout.razorpay.com/v1/checkout.js"></Script>
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/" className="flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back
            </Link>
          </Button>
          <h1 className="text-2xl font-light">Checkout</h1>
        </div>

        <div className="grid lg:grid-cols-2 gap-12">
          {/* Checkout Form */}
          <div className="space-y-8">
            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Contact Information */}
              <div>
                <h2 className="text-lg font-medium mb-4">
                  Contact Information
                </h2>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      required
                      disabled
                      value={formData.email}
                      onChange={handleInputChange}
                      placeholder="john@example.com"
                      className="bg-muted/50"
                    />
                  </div>
                </div>
              </div>
              {/* Address Selection */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-medium">Shipping Address</h2>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddNewAddress}
                    className="flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add New Address
                  </Button>
                </div>

                {/* Address Selection */}
                {addresses.length > 0 && (
                  <div className="mb-6">
                    <Label className="text-sm font-medium mb-3 block">
                      Select Address
                    </Label>
                    <div className="space-y-3">
                      {addresses.map((address) => (
                        <div
                          key={address.id}
                          className={`border rounded-lg p-4 cursor-pointer transition-colors ${selectedAddressId === address.id
                            ? "border-primary bg-primary/5"
                            : "border-gray-200 hover:border-gray-300"
                            }`}
                          onClick={() => handleAddressSelect(address.id)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <MapPin className="w-4 h-4 text-gray-500" />
                                <span className="text-sm font-medium capitalize">
                                  {address.address_type}
                                </span>
                                {address.label && (
                                  <span className="text-sm text-gray-500">
                                    ({address.label})
                                  </span>
                                )}
                                {address.is_default && (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                    <Star className="w-3 h-3 mr-1" />
                                    Default
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-gray-600">
                                {address.full_name && (
                                  <p className="font-medium">
                                    {address.full_name}
                                  </p>
                                )}
                                <p>{address.address_line_1}</p>
                                {address.address_line_2 && (
                                  <p>{address.address_line_2}</p>
                                )}
                                <p>
                                  {address.city}, {address.state}{" "}
                                  {address.postal_code}
                                </p>
                                <p>{address.country}</p>
                                {address.phone && (
                                  <p className="mt-1">Phone: {address.phone}</p>
                                )}
                              </div>
                            </div>
                            <div className="ml-4">
                              <div
                                className={`w-4 h-4 rounded-full border-2 ${selectedAddressId === address.id
                                  ? "border-primary bg-primary"
                                  : "border-gray-300"
                                  }`}
                              >
                                {selectedAddressId === address.id && (
                                  <div className="w-full h-full rounded-full bg-white scale-50"></div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {addresses.length === 0 && (
                  <div className="mb-6 p-4 border border-dashed border-gray-300 rounded-lg text-center">
                    <MapPin className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-500 mb-2">
                      No addresses saved
                    </p>
                    <p className="text-xs text-gray-400">
                      Add an address to continue with checkout
                    </p>
                  </div>
                )}

                <Separator className="my-6" />
              </div>
              {/* Security Features */}
              <div className="bg-muted/50 p-4 rounded-lg">
                <div className="flex items-center gap-3 mb-2">
                  <Shield className="w-5 h-5 text-green-600" />
                  <span className="font-medium">Secure Checkout</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Your payment information is encrypted and secure. We never
                  store your card details.
                </p>
              </div>
              {/* Order Notes */}
              <div>
                <Label htmlFor="notes">Order Notes (Optional)</Label>
                <Input
                  id="notes"
                  name="notes"
                  placeholder="Any special instructions for your order..."
                  value={formData.notes || ""}
                  onChange={handleInputChange}
                />
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={isProcessing || !selectedAddressId}
              >
                {isProcessing ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Creating Order...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4" />
                    {selectedAddressId
                      ? `Create Order - ₹${total.toFixed(2)}`
                      : "Select Address to Continue"}
                  </div>
                )}
              </Button>
            </form>
          </div>

          {/* Order Summary */}
          <div className="lg:sticky lg:top-8 h-fit">
            <div className="bg-muted/30 p-6 rounded-lg">
              <h2 className="text-lg font-medium mb-4">Order Summary</h2>

              {/* Cart Items */}
              <div className="space-y-4 mb-6">
                {cart.map((item) => (
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

              {/* Order Totals */}
              <div className="space-y-2 mb-6">
                <div className="flex justify-between text-sm">
                  <span>Subtotal</span>
                  <span>₹{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Delivery</span>
                  <span>₹{deliveryCharge.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Tax</span>
                  <span>₹{tax.toFixed(2)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-medium">
                  <span>Total</span>
                  <span>₹{total.toFixed(2)}</span>
                </div>
              </div>

              {/* Delivery Info */}
              <div className="bg-background p-4 rounded-md">
                <div className="flex items-center gap-3 mb-2">
                  <Truck className="w-4 h-4 text-primary" />
                  <span className="font-medium text-sm">Free Delivery</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Estimated delivery: 3-5 business days
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Address Form Modal */}
      <AddressFormModal
        isOpen={showAddressModal}
        isEditing={!!editingAddress}
        isSaving={false}
        addressData={addressData}
        validationErrors={addressValidationErrors}
        addresses={addresses}
        onClose={() => {
          setShowAddressModal(false);
          handleCloseAddressModal();
        }}
        onSave={handleAddressModalSave}
        onInputChange={(field, value) => {
          setAddressData((prev) => ({ ...prev, [field]: value }));
        }}
      />
    </div>
  );
}
