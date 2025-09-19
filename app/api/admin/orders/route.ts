import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    
    // Get the current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");
    const status = searchParams.get("status");

    let query = supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data: orders, error: ordersError } = await query;

    if (ordersError) {
      return NextResponse.json(
        { error: "Failed to fetch orders" },
        { status: 500 }
      );
    }

    // Add mock orders for demo purposes
    const mockOrders = [
      {
        id: "mock-order-1",
        order_number: "ORD-2024-001",
        user_id: "mock-user-1",
        customer_email: "john.doe@example.com",
        customer_phone: "+91 98765 43210",
        shipping_address: {
          full_name: "John Doe",
          address_line_1: "123 Main Street",
          address_line_2: "Apt 4B",
          city: "Mumbai",
          state: "Maharashtra",
          postal_code: "400001",
          country: "India",
          phone: "+91 98765 43210",
          address_type: "home",
          label: "Home"
        },
        billing_address: {
          full_name: "John Doe",
          address_line_1: "123 Main Street",
          address_line_2: "Apt 4B",
          city: "Mumbai",
          state: "Maharashtra",
          postal_code: "400001",
          country: "India",
          phone: "+91 98765 43210",
          address_type: "home",
          label: "Home"
        },
        items: [
          {
            id: "item-1",
            name: "Baby Onesie Set",
            price: 450,
            quantity: 2,
            image: "/products/baby-onesie.jpg"
          }
        ],
        subtotal: 900,
        delivery_charge: 50,
        tax_amount: 95,
        total_amount: 1045,
        currency: "INR",
        status: "delivered",
        created_at: "2024-11-15T10:30:00Z",
        updated_at: "2024-11-20T14:20:00Z",
        notes: "Handle with care"
      },
      {
        id: "mock-order-2",
        order_number: "ORD-2024-002",
        user_id: "mock-user-2",
        customer_email: "jane.smith@example.com",
        customer_phone: "+91 98765 43211",
        shipping_address: {
          full_name: "Jane Smith",
          address_line_1: "456 Park Avenue",
          city: "Delhi",
          state: "Delhi",
          postal_code: "110001",
          country: "India",
          phone: "+91 98765 43211",
          address_type: "home",
          label: "Home"
        },
        billing_address: {
          full_name: "Jane Smith",
          address_line_1: "456 Park Avenue",
          city: "Delhi",
          state: "Delhi",
          postal_code: "110001",
          country: "India",
          phone: "+91 98765 43211",
          address_type: "home",
          label: "Home"
        },
        items: [
          {
            id: "item-2",
            name: "Cotton Baby Dress",
            price: 650,
            quantity: 1,
            image: "/products/baby-dress.jpg"
          },
          {
            id: "item-3",
            name: "Baby Hat",
            price: 200,
            quantity: 1,
            image: "/products/baby-hat.jpg"
          }
        ],
        subtotal: 850,
        delivery_charge: 50,
        tax_amount: 90,
        total_amount: 990,
        currency: "INR",
        status: "shipped",
        created_at: "2024-11-20T14:15:00Z",
        updated_at: "2024-11-22T09:30:00Z"
      },
      {
        id: "mock-order-3",
        order_number: "ORD-2024-003",
        user_id: "mock-user-3",
        customer_email: "mike.wilson@example.com",
        customer_phone: "+91 98765 43212",
        shipping_address: {
          full_name: "Mike Wilson",
          address_line_1: "789 Garden Road",
          city: "Bangalore",
          state: "Karnataka",
          postal_code: "560001",
          country: "India",
          phone: "+91 98765 43212",
          address_type: "office",
          label: "Office"
        },
        billing_address: {
          full_name: "Mike Wilson",
          address_line_1: "789 Garden Road",
          city: "Bangalore",
          state: "Karnataka",
          postal_code: "560001",
          country: "India",
          phone: "+91 98765 43212",
          address_type: "office",
          label: "Office"
        },
        items: [
          {
            id: "item-4",
            name: "Baby Romper",
            price: 550,
            quantity: 1,
            image: "/products/baby-romper.jpg"
          }
        ],
        subtotal: 550,
        delivery_charge: 50,
        tax_amount: 60,
        total_amount: 660,
        currency: "INR",
        status: "processing",
        created_at: "2024-12-01T11:45:00Z",
        updated_at: "2024-12-01T11:45:00Z"
      },
      {
        id: "mock-order-4",
        order_number: "ORD-2024-004",
        user_id: "mock-user-4",
        customer_email: "sarah.johnson@example.com",
        customer_phone: "+91 98765 43213",
        shipping_address: {
          full_name: "Sarah Johnson",
          address_line_1: "321 Oak Street",
          city: "Chennai",
          state: "Tamil Nadu",
          postal_code: "600001",
          country: "India",
          phone: "+91 98765 43213",
          address_type: "home",
          label: "Home"
        },
        billing_address: {
          full_name: "Sarah Johnson",
          address_line_1: "321 Oak Street",
          city: "Chennai",
          state: "Tamil Nadu",
          postal_code: "600001",
          country: "India",
          phone: "+91 98765 43213",
          address_type: "home",
          label: "Home"
        },
        items: [
          {
            id: "item-5",
            name: "Baby Sleepsuit",
            price: 750,
            quantity: 2,
            image: "/products/baby-sleepsuit.jpg"
          }
        ],
        subtotal: 1500,
        delivery_charge: 50,
        tax_amount: 155,
        total_amount: 1705,
        currency: "INR",
        status: "payment_pending",
        created_at: "2024-12-02T16:20:00Z",
        updated_at: "2024-12-02T16:20:00Z"
      }
    ];

    // Combine real orders with mock orders
    const allOrders = [...(orders || []), ...mockOrders];

    return NextResponse.json({
      orders: allOrders,
      total: allOrders.length,
    });

  } catch (error) {
    console.error("Error fetching orders:", error);
    return NextResponse.json(
      { error: "Failed to fetch orders" },
      { status: 500 }
    );
  }
}
