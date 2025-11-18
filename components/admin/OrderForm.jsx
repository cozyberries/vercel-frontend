"use client";

import { useState, useEffect } from "react";
import {
    Plus,
    X,
    Save,
    ShoppingCart,
    Calculator,
    User,
    MapPin,
    Trash2,
    Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthenticatedFetch } from "@/hooks/useAuthenticatedFetch";
import Image from "next/image";
import { useAuth } from "../supabase-auth-provider";

export default function OrderForm({ onCancel, onSuccess }) {
    const { get, post } = useAuthenticatedFetch();

    const [products, setProducts] = useState([]);
    const [selectedItems, setSelectedItems] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [loading, setLoading] = useState(false);
    const [productsLoading, setProductsLoading] = useState(true);
    const [customerEmail, setCustomerEmail] = useState("");
    const [customerPhone, setCustomerPhone] = useState("");
    const [orderStatus, setOrderStatus] = useState("payment_pending");
    const { user } = useAuth();
    const [error, setError] = useState("");

    // Shipping Address
    const [shippingAddress, setShippingAddress] = useState({
        full_name: "",
        address_line_1: "",
        address_line_2: "",
        city: "",
        state: "",
        postal_code: "",
        country: "India",
        phone: "",
    });

    // Order Notes
    const [notes, setNotes] = useState("");

    useEffect(() => {
        fetchProducts();
    }, []);

    const fetchProducts = async () => {
        try {
            setProductsLoading(true);
            const response = await get("/api/products?limit=100");
            const data = await response.json();
            setProducts(data.products || []);
        } catch (error) {
            console.error("Error fetching products:", error);
        } finally {
            setProductsLoading(false);
        }
    };

    const handleAddProduct = (product) => {
        const existingItem = selectedItems.find(
            (item) => item.product.id === product.id
        );

        if (existingItem) {
            setSelectedItems(
                selectedItems.map((item) =>
                    item.product.id === product.id
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                )
            );
        } else {
            setSelectedItems([
                ...selectedItems,
                {
                    product,
                    quantity: 1,
                    price: product.price,
                },
            ]);
        }
    };

    const handleRemoveItem = (productId) => {
        setSelectedItems(selectedItems.filter((item) => item.product.id !== productId));
    };

    const handleQuantityChange = (productId, quantity) => {
        if (quantity <= 0) {
            handleRemoveItem(productId);
            return;
        }
        setSelectedItems(
            selectedItems.map((item) =>
                item.product.id === productId ? { ...item, quantity } : item
            )
        );
    };

    const calculateOrderSummary = () => {
        const subtotal = selectedItems.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0
        );
        const delivery_charge = selectedItems.length > 0 ? 50 : 0;
        const tax_amount = subtotal * 0.1;
        const total_amount = subtotal + delivery_charge + tax_amount;

        return {
            subtotal,
            delivery_charge,
            tax_amount,
            total_amount,
        };
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
        }).format(amount);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (selectedItems.length === 0) {
                setError("Please select at least one product");
                setLoading(false);
                return;
            }

            if (!customerEmail && !customerPhone) {
                setError("Customer email or phone are required");
                setLoading(false);
                return;
            }

            if (!shippingAddress.full_name || !shippingAddress.address_line_1) {
                setError("Shipping address is required");
                setLoading(false);
                return;
            }
            const orderSummary = calculateOrderSummary();

            // Prepare order items
            const orderItems = selectedItems.map((item) => ({
                id: item?.product?.id,
                name: item?.product?.name,
                price: item?.price,
                quantity: item?.quantity,
                image: item?.product?.images?.[0] || "",
            }));

            const orderData = {
                user_id: user?.id,
                customer_email: customerEmail,
                customer_phone: customerPhone || shippingAddress.phone,
                shipping_address: shippingAddress,
                billing_address: shippingAddress,
                items: orderItems,
                subtotal: orderSummary.subtotal,
                delivery_charge: orderSummary.delivery_charge,
                tax_amount: orderSummary.tax_amount,
                total_amount: orderSummary.total_amount,
                currency: "INR",
                status: orderStatus,
                notes: notes || undefined,
            };

            const response = await post("/api/admin/orders", orderData, { requireAdmin: true });
            if (response.ok) {
                const data = await response.json();
                if (data.order) {
                    if (onSuccess) {
                        onSuccess(data.order);
                    } else {
                        toast.success("Order created successfully!");
                        // Reset form
                        setSelectedItems([]);
                        setCustomerEmail("");
                        setCustomerPhone("");
                        setOrderStatus("payment_pending");
                        setShippingAddress({
                            full_name: "",
                            address_line_1: "",
                            address_line_2: "",
                            city: "",
                            state: "",
                            postal_code: "",
                            country: "India",
                            phone: "",
                        });
                        setNotes("");
                    }
                } else {
                    console.error("Order created but no order data in response:", data);
                    toast.error("Order created but failed to retrieve order details");
                }
            } else {
                const errorData = await response.json();
                console.log("errorData", errorData);
                toast.error(errorData.error);
            }
        } catch (error) {
            console.error("Error creating order:", error);
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    const filteredProducts = products.filter((product) =>
        product.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const orderSummary = calculateOrderSummary();

    const statusOptions = [
        { value: "payment_pending", label: "Payment Pending" },
        { value: "payment_confirmed", label: "Payment Confirmed" },
        { value: "processing", label: "Processing" },
        { value: "shipped", label: "Shipped" },
        { value: "delivered", label: "Delivered" },
        { value: "cancelled", label: "Cancelled" },
    ];

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-gray-900">Create New Order</h1>
                <p className="text-gray-600 mt-1">
                    Create orders manually for customers
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column - Product Selection */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Product Search and Selection */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <ShoppingCart className="h-5 w-5" />
                                    Select Products
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {/* Search Bar */}
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                                    <Input
                                        placeholder="Search products..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-10"
                                    />
                                </div>
                                {productsLoading ? (
                                    <div className="text-center py-8 text-gray-500">
                                        Loading products...
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-96 overflow-y-auto">
                                        {filteredProducts.map((product) => (
                                            <div
                                                key={product.id}
                                                className={`relative border rounded-lg p-3 cursor-pointer transition-colors 
                                                ${selectedItems?.some(item => item?.product?.id === product?.id) ? "border-green-200 bg-green-100" : "hover:bg-gray-50 border-gray-700"}`}
                                                onClick={() => handleAddProduct(product)}
                                            >
                                                {selectedItems?.some(item => item?.product?.id === product.id) && (
                                                    <div className="absolute bottom-0 right-0 bg-green-500 text-white rounded-sm px-2 py-1 text-xs mb-1 mx-2">
                                                        {selectedItems?.find(item => item?.product?.id === product.id)?.quantity} Selected
                                                    </div>
                                                )}
                                                <div className="flex items-start gap-3">
                                                    {product.images?.[0] ? (
                                                        <Image
                                                            src={product.images[0]}
                                                            alt={product.name}
                                                            width={60}
                                                            height={60}
                                                            className="rounded-md object-cover"
                                                        />
                                                    ) : (
                                                        <div className="w-[60px] h-[60px] bg-gray-200 rounded-md flex items-center justify-center">
                                                            <ShoppingCart className="h-6 w-6 text-gray-400" />
                                                        </div>
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="font-medium text-sm truncate">
                                                            {product.name}
                                                        </h4>
                                                        <p className="text-sm font-semibold text-blue-600 mt-1">
                                                            {formatCurrency(product.price)}
                                                        </p>
                                                        {product.stock_quantity !== undefined && (
                                                            <p className="text-xs text-gray-500 mt-1">
                                                                Stock: {product.stock_quantity}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleAddProduct(product);
                                                        }}
                                                    >
                                                        <Plus className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                        {filteredProducts.length === 0 && (
                                            <div className="col-span-2 text-center py-8 text-gray-500">
                                                No products found
                                            </div>
                                        )}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Selected Items */}
                        {selectedItems.length > 0 && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Selected Items ({selectedItems.length})</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3">
                                        {selectedItems.map((item) => (
                                            <div
                                                key={item.product.id}
                                                className="flex items-start md:items-center gap-4 p-3 border rounded"
                                            >
                                                {item.product.images?.[0] ? (
                                                    <Image
                                                        src={item.product.images[0]}
                                                        alt={item.product.name}
                                                        width={60}
                                                        height={60}
                                                        className="rounded-sm object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-[60px] h-[60px] bg-gray-200 rounded-md flex items-center justify-center">
                                                        <ShoppingCart className="h-6 w-6 text-gray-400" />
                                                    </div>
                                                )}
                                                <div className="flex flex-col md:flex-row gap-1 md:gap-4 w-full">
                                                    <div className="flex-1">
                                                        <h4 className="font-medium text-sm md:text-base">{item.product.name}</h4>
                                                        <p className="text-xs md:text-sm text-gray-600">
                                                            {formatCurrency(item.price)} each
                                                        </p>
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="outline"
                                                            disabled={item.quantity <= 1}
                                                            onClick={() =>
                                                                handleQuantityChange(
                                                                    item.product.id,
                                                                    item.quantity - 1
                                                                )
                                                            }
                                                        >
                                                            -
                                                        </Button>
                                                        <Input
                                                            type="number"
                                                            min="1"
                                                            value={item.quantity}
                                                            onChange={(e) =>
                                                                handleQuantityChange(
                                                                    item.product.id,
                                                                    parseInt(e.target.value) || 1
                                                                )
                                                            }
                                                            className="w-16 text-center"
                                                        />
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="outline"
                                                            disabled={item.quantity >= item.product.stock_quantity}
                                                            onClick={() =>
                                                                handleQuantityChange(
                                                                    item.product.id,
                                                                    item.quantity + 1
                                                                )
                                                            }
                                                        >
                                                            +
                                                        </Button>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <div className="text-right min-w-[100px]">
                                                            <p className="font-semibold text-sm md:text-base">
                                                                {formatCurrency(item.price * item.quantity)}
                                                            </p>
                                                        </div>
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => handleRemoveItem(item.product.id)}
                                                            className="text-red-600 hover:text-red-700"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* Order Calculations */}
                        {selectedItems.length > 0 && (
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Calculator className="h-5 w-5" />
                                        Order Summary
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-600">Subtotal:</span>
                                            <span className="font-medium">
                                                {formatCurrency(orderSummary.subtotal)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-600">Tax (10%):</span>
                                            <span className="font-medium">
                                                {formatCurrency(orderSummary.tax_amount)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-600">Delivery Charge:</span>
                                            <span className="font-medium">
                                                {formatCurrency(orderSummary.delivery_charge)}
                                            </span>
                                        </div>
                                        <div className="border-t pt-2 mt-2">
                                            <div className="flex justify-between">
                                                <span className="font-semibold text-lg">Total:</span>
                                                <span className="font-bold text-lg text-blue-600">
                                                    {formatCurrency(orderSummary.total_amount)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    {/* Right Column - Customer & Order Details */}
                    <div className="space-y-6">
                        {/* Customer Information */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <User className="h-5 w-5" />
                                    Customer Information
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <Label htmlFor="customer_email">Email *</Label>
                                    <Input
                                        id="customer_email"
                                        type="email"
                                        value={customerEmail}
                                        onChange={(e) => setCustomerEmail(e.target.value)}
                                        placeholder="customer@example.com"
                                        required
                                    />
                                    {error && <p className="text-red-500 text-sm">{error}</p>}
                                </div>
                                <div>
                                    <Label htmlFor="customer_phone">Phone</Label>
                                    <Input
                                        id="customer_phone"
                                        type="tel"
                                        value={customerPhone}
                                        onChange={(e) => setCustomerPhone(e.target.value)}
                                        placeholder="+91 1234567890"
                                    />
                                    {error && <p className="text-red-500 text-sm">{error}</p>}
                                </div>
                                <div>
                                    <Label htmlFor="order_status">Order Status</Label>
                                    <select
                                        id="order_status"
                                        value={orderStatus}
                                        onChange={(e) =>
                                            setOrderStatus(e.target.value)
                                        }
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        {statusOptions.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Shipping Address */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <MapPin className="h-5 w-5" />
                                    Shipping Address
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <Label htmlFor="full_name">Full Name *</Label>
                                    <Input
                                        id="full_name"
                                        value={shippingAddress.full_name}
                                        onChange={(e) =>
                                            setShippingAddress({
                                                ...shippingAddress,
                                                full_name: e.target.value,
                                            })
                                        }
                                        placeholder="John Doe"
                                        required
                                    />
                                    {error && <p className="text-red-500 text-sm">{error}</p>}
                                </div>
                                <div>
                                    <Label htmlFor="address_line_1">Address Line 1 *</Label>
                                    <Input
                                        id="address_line_1"
                                        value={shippingAddress.address_line_1}
                                        onChange={(e) =>
                                            setShippingAddress({
                                                ...shippingAddress,
                                                address_line_1: e.target.value,
                                            })
                                        }
                                        placeholder="Street address"
                                        required
                                    />
                                    {error && <p className="text-red-500 text-sm">{error}</p>}
                                </div>
                                <div>
                                    <Label htmlFor="address_line_2">Address Line 2</Label>
                                    <Input
                                        id="address_line_2"
                                        value={shippingAddress.address_line_2}
                                        onChange={(e) =>
                                            setShippingAddress({
                                                ...shippingAddress,
                                                address_line_2: e.target.value,
                                            })
                                        }
                                        placeholder="Apartment, suite, etc."
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label htmlFor="city">City *</Label>
                                        <Input
                                            id="city"
                                            value={shippingAddress.city}
                                            onChange={(e) =>
                                                setShippingAddress({
                                                    ...shippingAddress,
                                                    city: e.target.value,
                                                })
                                            }
                                            placeholder="City"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="state">State *</Label>
                                        <Input
                                            id="state"
                                            value={shippingAddress.state}
                                            onChange={(e) =>
                                                setShippingAddress({
                                                    ...shippingAddress,
                                                    state: e.target.value,
                                                })
                                            }
                                            placeholder="State"
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label htmlFor="postal_code">Postal Code *</Label>
                                        <Input
                                            id="postal_code"
                                            value={shippingAddress.postal_code}
                                            onChange={(e) =>
                                                setShippingAddress({
                                                    ...shippingAddress,
                                                    postal_code: e.target.value,
                                                })
                                            }
                                            placeholder="123456"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="country">Country</Label>
                                        <Input
                                            id="country"
                                            value={shippingAddress.country}
                                            onChange={(e) =>
                                                setShippingAddress({
                                                    ...shippingAddress,
                                                    country: e.target.value,
                                                })
                                            }
                                            placeholder="India"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <Label htmlFor="shipping_phone">Phone</Label>
                                    <Input
                                        id="shipping_phone"
                                        type="tel"
                                        value={shippingAddress.phone}
                                        onChange={(e) =>
                                            setShippingAddress({
                                                ...shippingAddress,
                                                phone: e.target.value,
                                            })
                                        }
                                        placeholder="+91 1234567890"
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        {/* Order Notes */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Order Notes</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Additional notes for this order..."
                                    rows={4}
                                />
                            </CardContent>
                        </Card>
                    </div>
                </div>

                {/* Form Actions */}
                <div className="flex justify-end space-x-4 pt-6 border-t">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onCancel}
                        disabled={loading}
                    >
                        <X className="h-4 w-4 mr-2" />
                        Cancel
                    </Button>
                    <Button type="submit" disabled={loading || selectedItems.length === 0}>
                        <Save className="h-4 w-4 mr-2" />
                        {loading ? "Creating..." : "Create Order"}
                    </Button>
                </div>
            </form>
        </div>
    );
}
