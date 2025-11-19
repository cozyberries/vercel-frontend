"use client";

import { useState, useEffect } from "react";
import {
  Search,
  Calendar,
  Package,
  MoreHorizontal,
  Eye,
  Truck,
  CheckCircle,
  XCircle,
  Clock,
  CalendarDays,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Order, OrderStatus } from "@/lib/types/order";
import { useAuthenticatedFetch } from "@/hooks/useAuthenticatedFetch";
import OrderForm from "./OrderForm";

export default function OrderManagement() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [showForm, setShowForm] = useState(false);

  // Date filter states - default to last 1 week
  const getOneWeekAgo = () => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split("T")[0];
  };

  const [fromDate, setFromDate] = useState<string>(getOneWeekAgo());
  const [toDate, setToDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );

  const { get, put } = useAuthenticatedFetch();

  useEffect(() => {
    fetchOrders();
  }, [fromDate, toDate, statusFilter]);

  const fetchOrders = async () => {
    try {
      setLoading(true);

      // Build query parameters
      const params = new URLSearchParams();
      if (statusFilter !== "all") {
        params.append("status", statusFilter);
      }
      if (fromDate) {
        params.append("from_date", fromDate);
      }
      if (toDate) {
        params.append("to_date", toDate);
      }

      const queryString = params.toString();
      const url = `/api/admin/orders${queryString ? `?${queryString}` : ""}`;

      const response = await get(url, { requireAdmin: true });
      const data = await response.json();
      setOrders(data.orders || []);
    } catch (error) {
      console.error("Error fetching orders:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (
    orderId: string,
    newStatus: OrderStatus
  ) => {
    try {
      const response = await put(
        `/api/admin/orders/${orderId}`,
        { status: newStatus },
        { requireAdmin: true }
      );

      if (response.ok) {
        setOrders(
          orders.map((order) =>
            order.id === orderId ? { ...order, status: newStatus } : order
          )
        );
      } else {
        alert("Failed to update order status");
      }
    } catch (error) {
      console.error("Error updating order status:", error);
      alert("Error updating order status");
    }
  };

  const getStatusIcon = (status: OrderStatus) => {
    switch (status) {
      case "payment_pending":
        return <Clock className="h-4 w-4" />;
      case "payment_confirmed":
        return <CheckCircle className="h-4 w-4" />;
      case "processing":
        return <Package className="h-4 w-4" />;
      case "shipped":
        return <Truck className="h-4 w-4" />;
      case "delivered":
        return <CheckCircle className="h-4 w-4" />;
      case "cancelled":
        return <XCircle className="h-4 w-4" />;
      case "refunded":
        return <XCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: OrderStatus) => {
    switch (status) {
      case "payment_pending":
        return "bg-yellow-100 text-yellow-800";
      case "payment_confirmed":
        return "bg-blue-100 text-blue-800";
      case "processing":
        return "bg-purple-100 text-purple-800";
      case "shipped":
        return "bg-indigo-100 text-indigo-800";
      case "delivered":
        return "bg-green-100 text-green-800";
      case "cancelled":
        return "bg-red-100 text-red-800";
      case "refunded":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(amount);
  };

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.order_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customer_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.shipping_address.full_name
        .toLowerCase()
        .includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || order.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const statusOptions: { value: OrderStatus | "all"; label: string }[] = [
    { value: "all", label: "All Orders" },
    { value: "payment_pending", label: "Payment Pending" },
    { value: "payment_confirmed", label: "Payment Confirmed" },
    { value: "processing", label: "Processing" },
    { value: "shipped", label: "Shipped" },
    { value: "delivered", label: "Delivered" },
    { value: "cancelled", label: "Cancelled" },
    { value: "refunded", label: "Refunded" },
  ];

  const handleFormSubmit = () => {
    setShowForm(false);
    fetchOrders();
  };

  if (showForm) {
    return (
      <OrderForm
        onSuccess={handleFormSubmit}
        onCancel={() => {
          setShowForm(false);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Order Management</h1>
        <p className="text-gray-600 mt-1">Manage and track customer orders</p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search orders..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Date Filters */}
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">
                  Date Range:
                </span>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 items-center">
                <div className="flex items-center gap-2">
                  <label htmlFor="from-date" className="text-sm text-gray-600">
                    From:
                  </label>
                  <Input
                    id="from-date"
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="w-auto"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="to-date" className="text-sm text-gray-600">
                    To:
                  </label>
                  <Input
                    id="to-date"
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="w-auto"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFromDate(getOneWeekAgo());
                    setToDate(new Date().toISOString().split("T")[0]);
                  }}
                >
                  Last Week
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const oneMonthAgo = new Date();
                    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
                    setFromDate(oneMonthAgo.toISOString().split("T")[0]);
                    setToDate(new Date().toISOString().split("T")[0]);
                  }}
                >
                  Last Month
                </Button>
              </div>
              <Button onClick={() => setShowForm(true)} className="flex items-center">
                <Plus className="h-4 w-4 mr-2" />
                Add Order
              </Button>
            </div>

            {/* Status Filters */}
            <div className="flex gap-2 flex-wrap">
              {statusOptions.map((option) => (
                <Button
                  key={option.value}
                  variant={
                    statusFilter === option.value ? "default" : "outline"
                  }
                  size="sm"
                  onClick={() => setStatusFilter(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Orders ({filteredOrders.length})</CardTitle>
              <p className="text-sm text-gray-500 mt-1">
                {fromDate && toDate ? (
                  <>
                    Showing orders from{" "}
                    {new Date(fromDate).toLocaleDateString()} to{" "}
                    {new Date(toDate).toLocaleDateString()}
                  </>
                ) : fromDate ? (
                  <>
                    Showing orders from{" "}
                    {new Date(fromDate).toLocaleDateString()}
                  </>
                ) : toDate ? (
                  <>
                    Showing orders up to {new Date(toDate).toLocaleDateString()}
                  </>
                ) : (
                  <>Showing all orders</>
                )}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFromDate(getOneWeekAgo());
                setToDate(new Date().toISOString().split("T")[0]);
                setStatusFilter("all");
                setSearchTerm("");
              }}
            >
              Reset to Default
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-20 bg-gray-200 rounded"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredOrders.map((order) => (
                <div
                  key={order.id}
                  className="border rounded-lg p-4 hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-4 mb-2">
                        <h3 className="font-semibold text-lg">
                          Order #{order.order_number || order.id.slice(0, 8)}
                        </h3>
                        <Badge className={getStatusColor(order.status)}>
                          <span className="flex items-center">
                            {getStatusIcon(order.status)}
                            <span className="ml-1 capitalize">
                              {order.status.replace("_", " ")}
                            </span>
                          </span>
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                        <div>
                          <p>
                            <strong>Customer:</strong> {order.customer_email}
                          </p>
                          <p>
                            <strong>Name:</strong>{" "}
                            {order.shipping_address.full_name}
                          </p>
                        </div>
                        <div>
                          <p>
                            <strong>Items:</strong> {order.items.length} items
                          </p>
                          <p>
                            <strong>Total:</strong>{" "}
                            {formatCurrency(order.total_amount)}
                          </p>
                        </div>
                        <div>
                          <p>
                            <strong>Ordered:</strong>{" "}
                            {formatDate(order.created_at)}
                          </p>
                          <p>
                            <strong>Location:</strong>{" "}
                            {order.shipping_address.city},{" "}
                            {order.shipping_address.state}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          {order.status === "payment_confirmed" && (
                            <DropdownMenuItem
                              onClick={() =>
                                handleStatusUpdate(order.id, "processing")
                              }
                            >
                              <Package className="h-4 w-4 mr-2" />
                              Mark as Processing
                            </DropdownMenuItem>
                          )}
                          {order.status === "processing" && (
                            <DropdownMenuItem
                              onClick={() =>
                                handleStatusUpdate(order.id, "shipped")
                              }
                            >
                              <Truck className="h-4 w-4 mr-2" />
                              Mark as Shipped
                            </DropdownMenuItem>
                          )}
                          {order.status === "shipped" && (
                            <DropdownMenuItem
                              onClick={() =>
                                handleStatusUpdate(order.id, "delivered")
                              }
                            >
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Mark as Delivered
                            </DropdownMenuItem>
                          )}
                          {(order.status === "payment_pending" ||
                            order.status === "processing") && (
                              <DropdownMenuItem
                                onClick={() =>
                                  handleStatusUpdate(order.id, "cancelled")
                                }
                                className="text-red-600"
                              >
                                <XCircle className="h-4 w-4 mr-2" />
                                Cancel Order
                              </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && filteredOrders.length === 0 && (
            <div className="text-center py-12">
              <div className="text-gray-400 mb-4">
                <Package className="h-12 w-12 mx-auto" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No orders found
              </h3>
              <p className="text-gray-500">
                {searchTerm || statusFilter !== "all"
                  ? "Try adjusting your search or filter criteria"
                  : "No orders have been placed yet"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
