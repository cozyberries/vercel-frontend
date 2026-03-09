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
  Loader2,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useCart, getCartItemKey } from "@/components/cart-context";
import { useAuth } from "@/components/supabase-auth-provider";
import { useProfile } from "@/hooks/useProfile";
import AddressFormModal from "@/components/profile/AddressFormModal";
import { toast } from "sonner";
import { sendNotification } from "@/lib/utils/notify";
import { sendActivity } from "@/lib/utils/activities";
import { logEvent } from "@/lib/services/event-logger";
import { toImageSrc } from "@/lib/utils/image";
import { DELIVERY_CHARGE_INR, FREE_DELIVERY_THRESHOLD } from "@/lib/constants";

interface CheckoutFormData {
  email: string;
  notes?: string;
}

export default function CheckoutPage() {
  const { cart } = useCart();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    null
  );
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [formData, setFormData] = useState<CheckoutFormData>({
    email: "",
  });
  const [pincodeStatus, setPincodeStatus] = useState<
    "idle" | "checking" | "serviceable" | "not_serviceable" | "error"
  >("idle");
  const [pincodeMessage, setPincodeMessage] = useState("");
  const [deliveryDays, setDeliveryDays] = useState<{ min: number; max: number } | null>(null);

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
  const deliveryCharge = cart.length > 0 && subtotal < FREE_DELIVERY_THRESHOLD ? DELIVERY_CHARGE_INR : 0;
  const total = subtotal + deliveryCharge;

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

  // Auto-select default address if available. Pincode is verified only when adding/editing address in the modal.
  useEffect(() => {
    if (addresses.length > 0 && !selectedAddressId) {
      const defaultAddress = addresses.find((addr) => addr.is_default);
      if (defaultAddress) {
        handleAddressSelect(defaultAddress.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addresses]);

  // Handle address selection. Pincode is verified only when adding/editing address in the modal.
  // addressOverride: use when the address was just added/updated and may not be in state yet.
  const handleAddressSelect = (
    addressId: string,
    addressOverride?: { id: string; postal_code?: string | null }
  ) => {
    setSelectedAddressId(addressId);
    const address = addressOverride ?? addresses.find((a) => a.id === addressId);
    if (!address?.postal_code) {
      setPincodeStatus("idle");
      setPincodeMessage("");
      setDeliveryDays(null);
      return;
    }
    // Trust addresses that were validated when added; no API call on selection.
    setPincodeStatus("serviceable");
    setPincodeMessage("");
    setDeliveryDays(null);
  };

  // Handle adding new address
  const handleAddNewAddress = () => {
    setShowAddressModal(true);
    setShowAddAddress(true);
  };

  // Handle address modal save: select and validate the new/updated address, then close
  const handleAddressModalSave = async () => {
    const saved =
      editingAddress
        ? await handleUpdateAddress(editingAddress)
        : await handleAddAddress();
    if (saved) {
      await handleAddressSelect(saved.id, saved);
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

    if (pincodeStatus !== "serviceable") {
      toast.error("Please select an address with a serviceable pincode");
      return;
    }

    setIsProcessing(true);

    try {
      // Create checkout session (order is created only after payment)
      const sessionRes = await fetch("/api/checkout-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((item) => ({
            id: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            image: item.image,
            ...(item.size ? { size: item.size } : {}),
            ...(item.color ? { color: item.color } : {}),
          })),
          shipping_address_id: selectedAddressId,
          notes: formData.notes || "",
        }),
      });

      if (!sessionRes.ok) {
        toast.error("Failed to start checkout");
        await sendNotification("Checkout Failed", `${user?.email} checkout session failed`, "error");
        setIsProcessing(false);
        return;
      }

      const sessionData = await sessionRes.json();
      const paymentUrl =
        typeof sessionData.payment_url === "string" && sessionData.payment_url.trim()
          ? sessionData.payment_url.trim()
          : null;

      if (!paymentUrl) {
        logEvent("checkout_session_created", {
          session_id: sessionData.session_id,
          item_count: cart.length,
          error: "missing_payment_url",
        });
        toast.error("Checkout started but redirect URL was missing. Please try again.");
        setIsProcessing(false);
        return;
      }

      await logEvent("checkout_session_created", {
        session_id: sessionData.session_id,
        item_count: cart.length,
      });
      // Redirect to session-based payment page (replace so back button skips checkout)
      router.replace(paymentUrl);

    } catch (err) {
      console.error("Checkout session error:", err);
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setIsProcessing(false);
    }
  };


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

                    {/* Pincode serviceability status */}
                    {selectedAddressId && pincodeStatus !== "idle" && (
                      <div
                        className={`mt-3 flex items-center gap-2 text-sm rounded-lg p-3 ${
                          pincodeStatus === "checking"
                            ? "bg-muted/50 text-muted-foreground"
                            : pincodeStatus === "serviceable"
                            ? "bg-green-50 text-green-700 border border-green-200"
                            : pincodeStatus === "not_serviceable"
                            ? "bg-red-50 text-red-700 border border-red-200"
                            : "bg-yellow-50 text-yellow-700 border border-yellow-200"
                        }`}
                      >
                        {pincodeStatus === "checking" && (
                          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        )}
                        {pincodeStatus === "serviceable" && (
                          <CheckCircle className="w-4 h-4 shrink-0" />
                        )}
                        {pincodeStatus === "not_serviceable" && (
                          <AlertCircle className="w-4 h-4 shrink-0" />
                        )}
                        {pincodeStatus === "error" && (
                          <AlertCircle className="w-4 h-4 shrink-0" />
                        )}
                        <span>
                          {pincodeStatus === "checking"
                            ? "Checking delivery availability..."
                            : pincodeMessage}
                        </span>
                      </div>
                    )}
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
                disabled={
                  isProcessing ||
                  !selectedAddressId ||
                  pincodeStatus !== "serviceable"
                }
              >
                {isProcessing ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Processing...
                  </div>
                ) : pincodeStatus === "not_serviceable" ? (
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Delivery Not Available
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4" />
                    {selectedAddressId
                      ? `Pay ₹${total.toFixed(0)}`
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
                  <div key={getCartItemKey(item)} className="flex gap-3">
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
                          {[item.size && `Size: ${item.size}`, item.color && `Color: ${item.color}`]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        Qty: {item.quantity}
                      </p>
                    </div>
                    <div className="text-sm font-medium">
                      ₹{(item.price * item.quantity).toFixed(0)}
                    </div>
                  </div>
                ))}
              </div>

              <Separator className="mb-4" />

              {/* Order Totals */}
              <div className="space-y-2 mb-6">
                <div className="flex justify-between text-sm">
                  <span>Subtotal</span>
                  <span>₹{subtotal.toFixed(0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Delivery</span>
                  {deliveryCharge === 0 ? (
                    <span className="text-green-600 font-medium">FREE</span>
                  ) : (
                    <span>₹{deliveryCharge.toFixed(0)}</span>
                  )}
                </div>
                <Separator />
                <div className="flex justify-between font-medium">
                  <span>Total</span>
                  <span>₹{total.toFixed(0)}</span>
                </div>
              </div>

              {/* Delivery Info */}
              <div className="bg-background p-4 rounded-md">
                <div className="flex items-center gap-3 mb-2">
                  <Truck className="w-4 h-4 text-primary" />
                  <span className="font-medium text-sm">
                    {deliveryCharge === 0
                      ? "Free Delivery"
                      : `Spend ₹${(FREE_DELIVERY_THRESHOLD - subtotal).toFixed(0)} more for free delivery`}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {deliveryDays ? (
                    <>
                      Estimated delivery: <span className="font-medium text-foreground">{deliveryDays.min}-{deliveryDays.max} business days</span>
                    </>
                  ) : (
                    "Select an address to see delivery estimate"
                  )}
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
        enablePincodeCheck
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
