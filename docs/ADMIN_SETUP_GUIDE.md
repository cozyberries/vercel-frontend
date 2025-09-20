# Admin Panel Setup Guide

This guide will help you set up the admin panel functionality for your CozyBerries e-commerce application.

## Overview

The admin panel provides comprehensive management capabilities including:
- **Analytics Dashboard**: Charts and metrics for orders, revenue, and users
- **Product Management**: CRUD operations for products with categories
- **User Management**: View and manage user accounts and their activity
- **Order Management**: Track and update order statuses
- **Settings**: Configure system settings and preferences

## Features Implemented

### 1. Admin Route Protection
- Admin button appears in header only when user is logged in
- Route protection ensures only authenticated users can access admin pages
- Automatic redirect to login page for unauthenticated users

### 2. Admin Dashboard Layout
- Responsive sidebar navigation with mobile support
- Clean, modern design with proper spacing and typography
- Consistent navigation across all admin pages
- Sign out functionality

### 3. Analytics Dashboard
- Real-time statistics cards showing:
  - Total orders and monthly growth
  - Total revenue and monthly revenue
  - Total users and monthly new users
  - Total products count
- Interactive charts for:
  - Monthly revenue trends
  - Monthly order trends
- Recent activity feed
- Fallback mock data for development

### 4. Product Management
- Product listing with search and filtering
- Add new products with form validation
- Edit existing products
- Delete products with confirmation
- Product status management (featured/active)
- Category integration
- Image support (placeholder for now)

### 5. User Management
- User listing with search functionality
- User status tracking (verified/pending)
- Order count and total spent per user
- User activity tracking
- Action menu for user operations

### 6. Order Management
- Order listing with search and status filtering
- Order status updates (payment_pending → processing → shipped → delivered)
- Order details display
- Customer information
- Order value and item tracking

### 7. Settings Panel
- General site settings
- Email configuration (SMTP)
- Security settings (2FA, session timeout)
- Notification preferences
- Database settings (backup, logging)

## API Endpoints Created

### Analytics
- `GET /api/admin/analytics` - Dashboard statistics and chart data

### Products
- `POST /api/admin/products` - Create new product
- `PUT /api/admin/products/[id]` - Update product
- `DELETE /api/admin/products/[id]` - Delete product

### Users
- `GET /api/admin/users` - List all users with statistics

### Orders
- `GET /api/admin/orders` - List all orders
- `PUT /api/admin/orders/[id]` - Update order status

## Supabase Configuration Required

### 1. Database Tables
Ensure these tables exist in your Supabase database:

```sql
-- Products table
CREATE TABLE products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  slug VARCHAR(255) UNIQUE,
  stock_quantity INTEGER DEFAULT 0,
  is_featured BOOLEAN DEFAULT FALSE,
  category_id UUID REFERENCES categories(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Categories table
CREATE TABLE categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Orders table
CREATE TABLE orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number VARCHAR(50) UNIQUE,
  user_id UUID REFERENCES auth.users(id),
  customer_email VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(20),
  shipping_address JSONB NOT NULL,
  billing_address JSONB,
  items JSONB NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  delivery_charge DECIMAL(10,2) DEFAULT 0,
  tax_amount DECIMAL(10,2) DEFAULT 0,
  total_amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'INR',
  status VARCHAR(50) DEFAULT 'payment_pending',
  estimated_delivery_date DATE,
  actual_delivery_date DATE,
  tracking_number VARCHAR(100),
  delivery_notes TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Product images table
CREATE TABLE product_images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  storage_path VARCHAR(500),
  is_primary BOOLEAN DEFAULT FALSE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 2. Row Level Security (RLS)
Enable RLS and create policies:

```sql
-- Enable RLS on all tables
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;

-- Products policies
CREATE POLICY "Products are viewable by everyone" ON products FOR SELECT USING (true);
CREATE POLICY "Products are manageable by authenticated users" ON products FOR ALL USING (auth.role() = 'authenticated');

-- Categories policies
CREATE POLICY "Categories are viewable by everyone" ON categories FOR SELECT USING (true);
CREATE POLICY "Categories are manageable by authenticated users" ON categories FOR ALL USING (auth.role() = 'authenticated');

-- Orders policies
CREATE POLICY "Users can view their own orders" ON orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own orders" ON orders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Orders are manageable by authenticated users" ON orders FOR ALL USING (auth.role() = 'authenticated');

-- Product images policies
CREATE POLICY "Product images are viewable by everyone" ON product_images FOR SELECT USING (true);
CREATE POLICY "Product images are manageable by authenticated users" ON product_images FOR ALL USING (auth.role() = 'authenticated');
```

### 3. Environment Variables
Ensure these are set in your `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 4. Supabase Auth Configuration
- Enable email authentication in Supabase dashboard
- Configure email templates if needed
- Set up OAuth providers (Google) if desired
- Configure redirect URLs

## Usage Instructions

### Accessing Admin Panel
1. Log in to your application
2. Click the "Admin" button in the header (only visible when logged in)
3. Navigate through different sections using the sidebar

### Managing Products
1. Go to Products section
2. Use "Add Product" to create new products
3. Search and filter products as needed
4. Use the dropdown menu on each product for edit/delete actions

### Managing Orders
1. Go to Orders section
2. View all orders with customer details
3. Update order status using the dropdown menu
4. Filter orders by status

### Managing Users
1. Go to Users section
2. View user statistics and activity
3. Search users by email
4. Use action menu for user operations

### Analytics
1. Dashboard shows key metrics
2. Charts display trends over time
3. Recent activity shows latest events

## Customization

### Adding New Admin Features
1. Create new page in `/app/admin/[feature]/page.tsx`
2. Add component in `/components/admin/[FeatureName].tsx`
3. Add API routes in `/app/api/admin/[feature]/route.ts`
4. Update navigation in `AdminLayout.tsx`

### Styling
- Uses Tailwind CSS for styling
- Components follow shadcn/ui design system
- Responsive design for mobile and desktop
- Dark/light theme support

### Data Sources
- Real data from Supabase database
- Mock data fallbacks for development
- Caching with Upstash Redis (if configured)

## Security Considerations

1. **Authentication Required**: All admin routes require user authentication
2. **RLS Policies**: Database access controlled by Row Level Security
3. **Input Validation**: All forms include validation
4. **Error Handling**: Proper error handling throughout the application
5. **Admin Role**: Consider implementing admin role checking for production

## Future Enhancements

- Role-based access control (admin vs regular users)
- Advanced analytics with more chart types
- Bulk operations for products and orders
- Email notifications for order updates
- File upload for product images
- Export functionality for reports
- Advanced search and filtering
- Audit logs for admin actions

## Troubleshooting

### Common Issues
1. **Authentication errors**: Check Supabase configuration
2. **Database errors**: Verify table structure and RLS policies
3. **Styling issues**: Ensure all UI components are properly imported
4. **API errors**: Check network requests in browser dev tools

### Development vs Production
- Mock data is used when API calls fail
- Real data is fetched from Supabase when available
- Error handling provides fallbacks for better UX

This admin panel provides a solid foundation for managing your e-commerce application with room for future enhancements and customization.
