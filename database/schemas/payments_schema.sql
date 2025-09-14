-- Payments table schema for Supabase
-- This table stores payment information for orders

CREATE TABLE IF NOT EXISTS payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Payment tracking
    payment_reference VARCHAR(100) UNIQUE NOT NULL, -- External payment gateway reference
    internal_reference VARCHAR(50) UNIQUE NOT NULL, -- Our internal reference
    
    -- Payment status
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (
        status IN (
            'pending',
            'processing',
            'completed',
            'failed',
            'cancelled',
            'refunded',
            'partially_refunded'
        )
    ),
    
    -- Payment method information
    payment_method VARCHAR(50) NOT NULL CHECK (
        payment_method IN (
            'credit_card',
            'debit_card',
            'net_banking',
            'upi',
            'wallet',
            'cod', -- Cash on Delivery
            'emi',
            'bank_transfer'
        )
    ),
    
    -- Payment gateway information
    gateway_provider VARCHAR(50) NOT NULL CHECK (
        gateway_provider IN (
            'razorpay',
            'stripe',
            'payu',
            'paypal',
            'phonepe',
            'googlepay',
            'paytm',
            'manual' -- For COD or manual processes
        )
    ),
    
    -- Financial details
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    gateway_fee DECIMAL(10,2) DEFAULT 0,
    net_amount DECIMAL(10,2) GENERATED ALWAYS AS (amount - COALESCE(gateway_fee, 0)) STORED,
    
    -- Refund information
    refunded_amount DECIMAL(10,2) DEFAULT 0,
    refund_reference VARCHAR(100),
    refund_reason TEXT,
    
    -- Gateway response data (stored as JSONB for flexibility)
    gateway_response JSONB,
    
    -- Card information (for card payments) - PCI compliant, masked data only
    card_last_four VARCHAR(4),
    card_brand VARCHAR(20), -- visa, mastercard, amex, etc.
    card_type VARCHAR(20),  -- credit, debit
    
    -- UPI information (for UPI payments)
    upi_id VARCHAR(100),
    
    -- Bank information (for net banking)
    bank_name VARCHAR(100),
    bank_reference VARCHAR(100),
    
    -- Transaction timestamps
    initiated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    
    -- Additional information
    failure_reason TEXT,
    notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT payments_amount_positive CHECK (amount > 0),
    CONSTRAINT payments_refunded_amount_valid CHECK (
        refunded_amount >= 0 AND refunded_amount <= amount
    ),
    CONSTRAINT payments_gateway_fee_valid CHECK (
        gateway_fee >= 0 AND gateway_fee <= amount
    )
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_payment_reference ON payments(payment_reference);
CREATE INDEX IF NOT EXISTS idx_payments_internal_reference ON payments(internal_reference);
CREATE INDEX IF NOT EXISTS idx_payments_gateway_provider ON payments(gateway_provider);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_completed_at ON payments(completed_at DESC);

-- Create function to generate internal payment references
CREATE OR REPLACE FUNCTION generate_payment_reference()
RETURNS TEXT AS $$
DECLARE
    payment_ref TEXT;
    counter INTEGER;
BEGIN
    -- Generate payment reference with format: PAY-YYYYMMDD-XXXX
    -- Where XXXX is a 4-digit counter for the day
    
    SELECT COUNT(*) + 1 INTO counter
    FROM payments 
    WHERE DATE(created_at) = CURRENT_DATE;
    
    payment_ref := 'PAY-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD(counter::TEXT, 4, '0');
    
    RETURN payment_ref;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-generate internal payment references
CREATE OR REPLACE FUNCTION set_payment_reference()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.internal_reference IS NULL OR NEW.internal_reference = '' THEN
        NEW.internal_reference := generate_payment_reference();
    END IF;
    
    NEW.updated_at := NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_payment_reference
    BEFORE INSERT OR UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION set_payment_reference();

-- Create trigger to update timestamps based on status changes
CREATE OR REPLACE FUNCTION update_payment_timestamps()
RETURNS TRIGGER AS $$
BEGIN
    -- Update completed_at when status changes to completed
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        NEW.completed_at := NOW();
    END IF;
    
    -- Update failed_at when status changes to failed
    IF NEW.status = 'failed' AND OLD.status != 'failed' THEN
        NEW.failed_at := NOW();
    END IF;
    
    NEW.updated_at := NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_payment_timestamps
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_payment_timestamps();

-- Create function to update order status when payment status changes
CREATE OR REPLACE FUNCTION update_order_status_on_payment()
RETURNS TRIGGER AS $$
BEGIN
    -- Update order status when payment is completed
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        UPDATE orders 
        SET status = 'payment_confirmed', updated_at = NOW()
        WHERE id = NEW.order_id AND status = 'payment_pending';
    END IF;
    
    -- Update order status when payment fails
    IF NEW.status = 'failed' AND (OLD.status IS NULL OR OLD.status != 'failed') THEN
        UPDATE orders 
        SET status = 'payment_pending', updated_at = NOW()
        WHERE id = NEW.order_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_order_status_on_payment
    AFTER INSERT OR UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_order_status_on_payment();

-- Enable Row Level Security (RLS)
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can only see their own payments
CREATE POLICY "Users can view their own payments" ON payments
    FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own payments
CREATE POLICY "Users can create their own payments" ON payments
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own payments (limited fields)
CREATE POLICY "Users can update their own payments" ON payments
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Grant necessary permissions
GRANT ALL ON payments TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
