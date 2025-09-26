import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { PaymentStatus } from "@/lib/types/order";
import CacheService from "@/lib/services/cache";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
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

    const resolvedParams = await params;
    const { id } = resolvedParams;

    if (!id) {
      return NextResponse.json(
        { error: "Payment ID is required" },
        { status: 400 }
      );
    }

    // Get the payment
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (paymentError || !payment) {
      return NextResponse.json(
        { error: "Payment not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ payment });
    
  } catch (error) {
    console.error("Error fetching payment:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
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

    const resolvedParams = await params;
    const { id } = resolvedParams;
    const body = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: "Payment ID is required" },
        { status: 400 }
      );
    }

    // Get the current payment to validate the update
    const { data: currentPayment, error: fetchError } = await supabase
      .from("payments")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !currentPayment) {
      return NextResponse.json(
        { error: "Payment not found" },
        { status: 404 }
      );
    }

    // Prepare update data based on what's allowed to be updated
    const updateData: any = {};

    // Status updates (typically done by payment gateway webhooks)
    if (body.status && isValidStatusTransition(currentPayment.status, body.status)) {
      updateData.status = body.status;
    }

    // Gateway response updates
    if (body.gateway_response) {
      updateData.gateway_response = body.gateway_response;
    }

    // Failure reason updates
    if (body.failure_reason) {
      updateData.failure_reason = body.failure_reason;
    }

    // Card information (for successful payments)
    if (body.card_last_four) {
      updateData.card_last_four = body.card_last_four;
    }
    if (body.card_brand) {
      updateData.card_brand = body.card_brand;
    }
    if (body.card_type) {
      updateData.card_type = body.card_type;
    }

    // UPI information
    if (body.upi_id) {
      updateData.upi_id = body.upi_id;
    }

    // Bank information
    if (body.bank_name) {
      updateData.bank_name = body.bank_name;
    }
    if (body.bank_reference) {
      updateData.bank_reference = body.bank_reference;
    }

    // Notes
    if (body.notes) {
      updateData.notes = body.notes;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    // Update the payment
    const { data: payment, error: updateError } = await supabase
      .from("payments")
      .update(updateData)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (updateError || !payment) {
      console.error("Error updating payment:", updateError);
      return NextResponse.json(
        { error: "Failed to update payment" },
        { status: 400 }
      );
    }

    // Clear orders cache since payment status changes may trigger order status updates via database triggers
    try {
      await CacheService.clearAllOrders(user.id);
      await CacheService.clearOrderDetails(user.id, payment.order_id);
      console.log(`Orders cache cleared for user: ${user.id} after payment update`);
    } catch (cacheError) {
      console.error("Error clearing orders cache after payment update:", cacheError);
      // Don't fail the payment update if cache clearing fails
    }

    return NextResponse.json({ payment });
    
  } catch (error) {
    console.error("Error updating payment:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function isValidStatusTransition(currentStatus: PaymentStatus, newStatus: PaymentStatus): boolean {
  const validTransitions: Record<PaymentStatus, PaymentStatus[]> = {
    pending: ['processing', 'completed', 'failed', 'cancelled'],
    processing: ['completed', 'failed', 'cancelled'],
    completed: ['refunded', 'partially_refunded'],
    failed: ['pending'], // Allow retry
    cancelled: [], // Final state
    refunded: [], // Final state
    partially_refunded: ['refunded'], // Can be fully refunded
  };

  return validTransitions[currentStatus]?.includes(newStatus) || false;
}
