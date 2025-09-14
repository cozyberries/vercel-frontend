# Database Setup for Order Management

This directory contains the database schemas for the order management system. Follow these steps to set up the required tables in your Supabase database.

## Prerequisites

- A Supabase project with authentication enabled
- Access to the SQL editor in your Supabase dashboard
- Existing `user_addresses` table (from profile management)

## Schema Files

- `schemas/orders_schema.sql` - Orders table with all necessary fields and constraints
- `schemas/payments_schema.sql` - Payments table for tracking payment information

## Setup Instructions

### 1. Create Orders Table

1. Open your Supabase dashboard
2. Navigate to the SQL editor
3. Copy and execute the content of `schemas/orders_schema.sql`

This will create:
- `orders` table with all necessary fields
- Auto-generation function for order numbers (format: ORD-YYYYMMDD-XXXX)
- Triggers for order number generation and timestamp updates
- Row Level Security (RLS) policies
- Proper indexes for performance

### 2. Create Payments Table

1. In the SQL editor, copy and execute the content of `schemas/payments_schema.sql`

This will create:
- `payments` table with all necessary fields
- Auto-generation function for internal payment references (format: PAY-YYYYMMDD-XXXX)
- Triggers for payment reference generation and status updates
- Automatic order status updates when payment status changes
- Row Level Security (RLS) policies
- Proper indexes for performance

### 3. Verify Setup

After running both scripts, verify that the following tables exist:
- `orders`
- `payments`

You can check this by running:
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('orders', 'payments');
```

## Table Relationships

- `orders.user_id` → `auth.users.id`
- `payments.order_id` → `orders.id`
- `payments.user_id` → `auth.users.id`

## Order Status Flow

1. **payment_pending** - Initial status when order is created
2. **payment_confirmed** - Payment has been successfully processed
3. **processing** - Order is being prepared for shipment
4. **shipped** - Order has been shipped with tracking info
5. **delivered** - Order has been delivered to customer
6. **cancelled** - Order has been cancelled
7. **refunded** - Order has been refunded

## Payment Status Flow

1. **pending** - Payment initiated but not processed
2. **processing** - Payment is being processed by gateway
3. **completed** - Payment successfully completed
4. **failed** - Payment failed
5. **cancelled** - Payment was cancelled
6. **refunded** - Payment was refunded
7. **partially_refunded** - Payment was partially refunded

## Security Features

- Row Level Security (RLS) is enabled on both tables
- Users can only access their own orders and payments
- Proper foreign key constraints ensure data integrity
- Sensitive payment data is stored securely with PCI compliance considerations

## Performance Optimizations

- Indexes on frequently queried fields (user_id, status, created_at)
- Efficient order number generation using daily counters
- JSONB fields for flexible address and item storage
- Automatic timestamp management with triggers

## Testing the Setup

After setup, you can test the integration by:
1. Adding items to cart
2. Going through checkout flow
3. Creating an order (should get status 'payment_pending')
4. Processing payment on the payment page
5. Verifying order status changes to 'payment_confirmed'

## Troubleshooting

### Common Issues

1. **Foreign key constraint errors**: Ensure the `auth.users` table exists and has the expected structure
2. **Permission errors**: Make sure RLS policies are properly set up
3. **Function errors**: Ensure PostgreSQL version supports the syntax used

### Debugging Queries

Check order creation:
```sql
SELECT * FROM orders WHERE user_id = 'your-user-id' ORDER BY created_at DESC LIMIT 5;
```

Check payment records:
```sql
SELECT * FROM payments WHERE user_id = 'your-user-id' ORDER BY created_at DESC LIMIT 5;
```

## Production Considerations

- Review and adjust order number generation if needed for your business
- Consider additional indexes based on your query patterns
- Set up monitoring for payment status changes
- Implement webhook handlers for real payment gateways
- Add data retention policies as needed
