# JWT Authentication System Guide

This guide explains how to use the JWT token authentication system that supports both authenticated and anonymous users, with role-based access control for admin functionality.

## Overview

The authentication system provides:

1. **JWT tokens for authenticated users** - Regular users get tokens with their role and permissions
2. **JWT tokens for anonymous users** - Unauthenticated users get temporary anonymous tokens
3. **Role-based access control** - Admin and super admin roles with different permissions
4. **RLS bypass for admins** - Admin users can access restricted data including `auth.users`
5. **Secure admin pages** - Only users with admin roles can access admin functionality

## Architecture Components

### 1. JWT Authentication (`/lib/jwt-auth.ts`)

Core functions for token management:

```typescript
// Generate token for authenticated user
const token = await generateAuthToken(userId);

// Generate token for anonymous user
const anonymousToken = generateAnonymousToken();

// Verify and decode any token
const userPayload = verifyToken(token);

// Check if user is admin
const isAdmin = isAdminUser(userPayload);

// Authenticate API requests
const auth = await authenticateRequest(request);
```

### 2. Enhanced Auth Context (`/components/supabase-auth-provider.tsx`)

Provides authentication state with JWT integration:

```typescript
const {
  user, // Supabase user object
  userProfile, // JWT payload with role info
  isAuthenticated, // Boolean - is user logged in
  isAdmin, // Boolean - does user have admin role
  isSuperAdmin, // Boolean - does user have super admin role
  jwtToken, // Current JWT token
} = useAuth();
```

### 3. Database Schema

#### User Profiles Table

```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  role VARCHAR(20) DEFAULT 'customer' CHECK (role IN ('customer', 'admin', 'super_admin')),
  full_name VARCHAR(255),
  phone VARCHAR(20),
  is_active BOOLEAN DEFAULT true,
  -- ... other fields
);
```

#### Admin Functions for RLS Bypass

- `get_auth_users()` - Access auth.users table (admin only)
- `get_user_statistics()` - Get user stats (admin only)
- `admin_update_user_status()` - Update user status (admin only)
- `admin_delete_user()` - Delete users (super admin only)

## User Roles

### Customer (Default)

- Default role for new signups
- Access to personal data only
- Can place orders, manage profile

### Admin

- Can access admin panel
- Can view all orders and payments
- Can view all users via admin functions
- Can create other admin users
- Cannot access `auth.users` directly (uses admin functions)

### Super Admin

- All admin permissions
- Can create other super admins
- Can delete users
- Full system access

## Setting Up Admin Users

### Method 1: Setup Page (First Admin)

1. Visit `/admin/setup`
2. Enter setup key (from environment variable `ADMIN_SETUP_KEY`)
3. Create the first super admin user

### Method 2: CLI Script

```bash
npm run create-admin
```

### Method 3: API Endpoint (Existing Super Admins)

```typescript
POST /api/admin/create-admin
Authorization: Bearer <super-admin-jwt-token>
{
  "email": "admin@example.com",
  "password": "securepassword",
  "role": "admin", // or "super_admin"
  "fullName": "Admin User"
}
```

## API Authentication

### Using the Authentication Hook

```typescript
import { useAuthenticatedFetch } from "@/hooks/useAuthenticatedFetch";

function AdminComponent() {
  const { get, post } = useAuthenticatedFetch();

  // Fetch admin data (requires admin role)
  const fetchUsers = async () => {
    const response = await get("/api/admin/users", { requireAdmin: true });
    const data = await response.json();
    return data.users;
  };

  // Create new admin (requires super admin)
  const createAdmin = async (adminData) => {
    const response = await post("/api/admin/create-admin", adminData, {
      requireAdmin: true,
    });
    return response.json();
  };
}
```

### Manual API Authentication

```typescript
// Add JWT token to request headers
const response = await fetch("/api/admin/users", {
  headers: {
    Authorization: `Bearer ${jwtToken}`,
    "Content-Type": "application/json",
  },
});
```

## Route Protection

### Client-Side Protection (Pages)

```typescript
// Admin page protection
const { isAuthenticated, isAdmin } = useAuth();

if (!isAuthenticated) {
  router.push("/login?redirect=/admin");
  return;
}

if (!isAdmin) {
  return <AccessDeniedPage />;
}
```

### Server-Side Protection (API Routes)

```typescript
import { authenticateRequest } from "@/lib/jwt-auth";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);

  if (!auth.isAuthenticated || !auth.isAdmin) {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 }
    );
  }

  // Admin-only logic here
}
```

### Middleware Protection

The middleware automatically protects:

- `/admin/*` routes (requires admin JWT token)
- `/profile/*` routes (requires authentication)
- `/checkout/*` routes (requires authentication)

## Anonymous User Support

Anonymous users automatically receive JWT tokens with:

- Temporary user ID (`anon_<timestamp>_<random>`)
- Role: `customer`
- `isAnonymous: true`
- Session ID for tracking

This enables:

- Shopping cart persistence
- Wishlist functionality
- Order tracking (before login)

## Database RLS Policies

### Orders Table

- Users can only see their own orders
- **Admins can see all orders** (bypass policy)
- Admins can update order status

### Payments Table

- Users can only see their own payments
- **Admins can see all payments** (bypass policy)
- Admins can process refunds

### User Profiles Table

- Users can view/update their own profile
- **Admins can view all profiles** (bypass policy)
- **Admins can update any profile** (bypass policy)
- Super admins can delete profiles

## Environment Variables

Required environment variables:

```env
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Admin Setup
ADMIN_SETUP_KEY=super-secret-setup-key-change-this

# Supabase (existing)
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Security Considerations

### JWT Token Security

- Use strong, unique JWT secret in production
- Tokens expire after 7 days (authenticated) or 30 days (anonymous)
- Tokens are stored in memory (not localStorage) for security

### Admin Access Security

- Setup key required for first admin creation
- Admin functions use `SECURITY DEFINER` with role checks
- Middleware validates JWT tokens on admin routes
- RLS policies prevent direct database access

### Password Security

- Minimum 8 character passwords required
- Passwords handled by Supabase Auth (bcrypt hashing)
- Account lockout after failed attempts (Supabase feature)

## Troubleshooting

### Common Issues

1. **"Admin access required" error**

   - Check user role in database: `SELECT role FROM user_profiles WHERE id = '<user-id>'`
   - Verify JWT token contains correct role
   - Ensure user profile was created during signup

2. **JWT token not found**

   - Check if `Authorization: Bearer <token>` header is set
   - Verify token hasn't expired
   - Check JWT secret matches between generation and verification

3. **RLS policy blocking access**
   - Ensure admin functions are being used instead of direct table access
   - Check if user has correct role in `user_profiles` table
   - Verify RLS policies are correctly applied

### Database Queries for Debugging

```sql
-- Check user roles
SELECT up.*, au.email FROM user_profiles up
LEFT JOIN auth.users au ON up.id = au.id;

-- Check if admin functions work
SELECT * FROM get_auth_users(10, 0);

-- Test admin role check
SELECT is_admin('<user-id>');

-- View RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename IN ('orders', 'payments', 'user_profiles');
```

## API Endpoints

### Admin Management

- `GET /api/admin/setup` - Check if admin setup is needed
- `POST /api/admin/setup` - Create first admin (requires setup key)
- `POST /api/admin/create-admin` - Create additional admins (super admin only)
- `GET /api/admin/create-admin` - List all admin users (super admin only)

### Admin Data Access

- `GET /api/admin/users` - List all users with stats (admin only)
- `GET /api/admin/orders` - List all orders (admin only)
- `GET /api/admin/stats` - Get system statistics (admin only)

### User Management

- `PUT /api/admin/users/[id]` - Update user profile (admin only)
- `DELETE /api/admin/users/[id]` - Delete user (super admin only)
- `POST /api/admin/users/[id]/ban` - Ban/unban user (admin only)

All admin endpoints require JWT authentication with appropriate role.
