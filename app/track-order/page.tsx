"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Search, 
  Package, 
  Truck, 
  CheckCircle, 
  Clock, 
  MapPin, 
  Phone,
  Mail,
  AlertCircle,
  ExternalLink
} from "lucide-react";

interface TrackingEvent {
  status: string;
  description: string;
  location: string;
  timestamp: string;
  completed: boolean;
}

interface OrderDetails {
  orderNumber: string;
  status: string;
  estimatedDelivery: string;
  trackingNumber: string;
  carrier: string;
  events: TrackingEvent[];
  shippingAddress: string;
  items: Array<{
    name: string;
    quantity: number;
    image: string;
  }>;
}

const mockOrderData: OrderDetails = {
  orderNumber: "CB-2024-001234",
  status: "In Transit",
  estimatedDelivery: "December 15, 2024",
  trackingNumber: "1Z999AA1234567890",
  carrier: "UPS",
  shippingAddress: "123 Main St, New York, NY 10001",
  items: [
    {
      name: "Organic Cotton Baby Bodysuit - White",
      quantity: 2,
      image: "/placeholder-product.jpg"
    },
    {
      name: "Soft Fleece Pajama Set - Blue",
      quantity: 1,
      image: "/placeholder-product.jpg"
    }
  ],
  events: [
    {
      status: "Order Placed",
      description: "Your order has been placed and is being processed",
      location: "CozyBerries Warehouse",
      timestamp: "Dec 10, 2024 at 2:30 PM",
      completed: true
    },
    {
      status: "Processing",
      description: "Your order is being prepared for shipment",
      location: "CozyBerries Warehouse",
      timestamp: "Dec 10, 2024 at 4:15 PM",
      completed: true
    },
    {
      status: "Shipped",
      description: "Your order has been shipped and is on its way",
      location: "CozyBerries Warehouse",
      timestamp: "Dec 11, 2024 at 9:30 AM",
      completed: true
    },
    {
      status: "In Transit",
      description: "Your package is in transit to the destination",
      location: "Newark, NJ",
      timestamp: "Dec 12, 2024 at 11:45 AM",
      completed: false
    },
    {
      status: "Out for Delivery",
      description: "Your package is out for delivery",
      location: "New York, NY",
      timestamp: "Dec 15, 2024 at 6:00 AM",
      completed: false
    },
    {
      status: "Delivered",
      description: "Your package has been delivered",
      location: "New York, NY",
      timestamp: "Dec 15, 2024 at 2:30 PM",
      completed: false
    }
  ]
};

export default function TrackOrderPage() {
  const [orderNumber, setOrderNumber] = useState("");
  const [email, setEmail] = useState("");
  const [searchResults, setSearchResults] = useState<OrderDetails | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSearching(true);
    setError("");

    // Simulate API call
    setTimeout(() => {
      if (orderNumber && email) {
        setSearchResults(mockOrderData);
      } else {
        setError("Please enter both order number and email address");
      }
      setIsSearching(false);
    }, 1000);
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "delivered":
        return "bg-green-100 text-green-800";
      case "in transit":
        return "bg-blue-100 text-blue-800";
      case "shipped":
        return "bg-purple-100 text-purple-800";
      case "processing":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusIcon = (status: string, completed: boolean) => {
    if (completed) {
      return <CheckCircle className="h-5 w-5 text-green-600" />;
    }
    
    switch (status.toLowerCase()) {
      case "shipped":
      case "in transit":
        return <Truck className="h-5 w-5 text-blue-600" />;
      case "processing":
        return <Package className="h-5 w-5 text-yellow-600" />;
      case "delivered":
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      default:
        return <Clock className="h-5 w-5 text-gray-600" />;
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Track Your Order</h1>
          <p className="text-lg text-muted-foreground">
            Enter your order number and email to track your package
          </p>
        </div>

        {/* Search Form */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Order Tracking</CardTitle>
            <CardDescription>
              Enter your order details below to see the current status of your shipment
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSearch} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="orderNumber" className="block text-sm font-medium mb-2">
                    Order Number *
                  </label>
                  <Input
                    id="orderNumber"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    placeholder="e.g., CB-2024-001234"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium mb-2">
                    Email Address *
                  </label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your.email@example.com"
                    required
                  />
                </div>
              </div>
              {error && (
                <div className="flex items-center gap-2 text-red-600">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm">{error}</span>
                </div>
              )}
              <Button type="submit" disabled={isSearching} className="w-full md:w-auto">
                <Search className="h-4 w-4 mr-2" />
                {isSearching ? "Searching..." : "Track Order"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Search Results */}
        {searchResults && (
          <div className="space-y-6">
            {/* Order Summary */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Order #{searchResults.orderNumber}</CardTitle>
                    <CardDescription>
                      Estimated delivery: {searchResults.estimatedDelivery}
                    </CardDescription>
                  </div>
                  <Badge className={getStatusColor(searchResults.status)}>
                    {searchResults.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium mb-2">Tracking Information</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Tracking Number:</span>
                        <span className="font-mono">{searchResults.trackingNumber}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Carrier:</span>
                        <span>{searchResults.carrier}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Status:</span>
                        <span>{searchResults.status}</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Shipping Address</h4>
                    <p className="text-sm text-muted-foreground">{searchResults.shippingAddress}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tracking Timeline */}
            <Card>
              <CardHeader>
                <CardTitle>Tracking Timeline</CardTitle>
                <CardDescription>
                  Follow your package's journey from our warehouse to your door
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {searchResults.events.map((event, index) => (
                    <div key={index} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className={`p-2 rounded-full ${
                          event.completed ? 'bg-green-100' : 'bg-gray-100'
                        }`}>
                          {getStatusIcon(event.status, event.completed)}
                        </div>
                        {index < searchResults.events.length - 1 && (
                          <div className={`w-0.5 h-8 ${
                            event.completed ? 'bg-green-200' : 'bg-gray-200'
                          }`} />
                        )}
                      </div>
                      <div className="flex-1 pb-4">
                        <div className="flex items-center justify-between">
                          <h4 className={`font-medium ${
                            event.completed ? 'text-green-900' : 'text-gray-900'
                          }`}>
                            {event.status}
                          </h4>
                          <span className="text-sm text-muted-foreground">
                            {event.timestamp}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {event.description}
                        </p>
                        <div className="flex items-center gap-1 mt-2 text-sm text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {event.location}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Order Items */}
            <Card>
              <CardHeader>
                <CardTitle>Order Items</CardTitle>
                <CardDescription>
                  Items included in this shipment
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {searchResults.items.map((item, index) => (
                    <div key={index} className="flex items-center gap-4 p-4 border rounded-lg">
                      <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center">
                        <Package className="h-8 w-8 text-gray-400" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium">{item.name}</h4>
                        <p className="text-sm text-muted-foreground">Quantity: {item.quantity}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Help Section */}
            <Card>
              <CardHeader>
                <CardTitle>Need Help?</CardTitle>
                <CardDescription>
                  Having issues with your order? We're here to help!
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center">
                    <Phone className="h-8 w-8 text-primary mx-auto mb-2" />
                    <h4 className="font-medium mb-1">Call Us</h4>
                    <p className="text-sm text-muted-foreground">+1 (555) 123-4567</p>
                    <p className="text-xs text-muted-foreground">Mon-Fri 9AM-6PM EST</p>
                  </div>
                  <div className="text-center">
                    <Mail className="h-8 w-8 text-primary mx-auto mb-2" />
                    <h4 className="font-medium mb-1">Email Us</h4>
                    <p className="text-sm text-muted-foreground">hello@cozyberries.com</p>
                    <p className="text-xs text-muted-foreground">24/7 support</p>
                  </div>
                  <div className="text-center">
                    <ExternalLink className="h-8 w-8 text-primary mx-auto mb-2" />
                    <h4 className="font-medium mb-1">Live Chat</h4>
                    <p className="text-sm text-muted-foreground">Available now</p>
                    <p className="text-xs text-muted-foreground">Quick response</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* No Results State */}
        {!searchResults && !isSearching && (
          <Card>
            <CardContent className="text-center py-12">
              <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Ready to track your order?</h3>
              <p className="text-muted-foreground">
                Enter your order number and email address above to get started.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
