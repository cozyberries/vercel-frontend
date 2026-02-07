# Quick Start Guide - JWT Authentication System

## 🚀 Setup Instructions

### 1. Environment Variables

Create a `.env.local` file in your project root with:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# JWT Authentication
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production-min-32-chars

# Admin Setup
ADMIN_SETUP_KEY=super-secret-setup-key-change-this-in-production

# App Configuration
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 2. Database Setup

Run the following SQL scripts in your Supabase SQL editor in order:

1. **User Profiles Schema**: `/database/schemas/user_profiles_schema.sql`
2. **Admin RLS Policies**: `/database/schemas/admin_rls_policies.sql`
3. **Orders Schema**: `/database/schemas/orders_schema.sql` (if not already applied)
4. **Payments Schema**: `/database/schemas/payments_schema.sql` (if not already applied)

### 3. Install Dependencies

```bash
npm install
```

The required JWT dependencies are already included:

- `jsonwebtoken` - JWT token handling
- `@types/jsonwebtoken` - TypeScript types
- `dotenv` - Environment variables for CLI script

### 4. Create First Admin User

Choose one of these methods:

#### Option A: Web Setup Page

1. Start your development server: `npm run dev`
2. Visit: `http://localhost:3000/admin/setup`
3. Enter your setup key (from `ADMIN_SETUP_KEY` env var)
4. Create the first super admin user

#### Option B: CLI Script

```bash
npm run create-admin
```

Follow the prompts to create an admin user.

### 5. Test the System

1. **Test Anonymous Access**: Visit your site without logging in - you should get an anonymous JWT token
2. **Test User Registration**: Register a new user - they should get a customer role
3. **Test Admin Access**:
   - Login with your admin credentials
   - Visit `/admin` - you should see the admin dashboard
   - Try accessing admin API endpoints

## 🔧 Key Features

### ✅ JWT Token Authentication

- **Authenticated users**: Get JWT tokens with their role and permissions
- **Anonymous users**: Get temporary tokens for cart/wishlist functionality
- **Automatic token refresh**: Tokens are refreshed on auth state changes

### ✅ Role-Based Access Control

- **Customer**: Default role, access to personal data only
- **Admin**: Can access admin panel, view all orders/users
- **Super Admin**: All admin permissions + can create other admins

### ✅ RLS Bypass for Admins

- Admin users can access `auth.users` table via secure functions
- RLS policies automatically allow admin access to orders, payments, profiles
- Secure functions prevent unauthorized access

### ✅ Protected Admin Pages

- Middleware protection for `/admin/*` routes
- Client-side role checking with proper error messages
- JWT token validation on all admin API endpoints

## 🎯 Usage Examples

### Frontend: Check User Role

```typescript
import { useAuth } from "@/components/supabase-auth-provider";

function MyComponent() {
  const { isAuthenticated, isAdmin, userProfile } = useAuth();

  if (!isAuthenticated) return <LoginPrompt />;
  if (!isAdmin) return <AccessDenied />;

  return <AdminDashboard />;
}
```

### Frontend: Make Authenticated API Calls

```typescript
import { useAuthenticatedFetch } from "@/hooks/useAuthenticatedFetch";

function AdminUsersComponent() {
  const { get } = useAuthenticatedFetch();

  const fetchUsers = async () => {
    const response = await get("/api/admin/users", { requireAdmin: true });
    const data = await response.json();
    return data.users;
  };
}
```

### Backend: Protect API Routes

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

## 🔒 Security Features

- **JWT tokens** stored in memory (not localStorage)
- **Strong password requirements** (minimum 8 characters)
- **Setup key protection** for initial admin creation
- **RLS policies** prevent unauthorized database access
- **Middleware protection** for sensitive routes
- **Role-based function access** with `SECURITY DEFINER`

## 🚨 Important Notes

1. **Change default secrets**: Update `JWT_SECRET` and `ADMIN_SETUP_KEY` in production
2. **Secure your service role key**: The `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS
3. **Monitor admin creation**: Only super admins can create other admins
4. **Test thoroughly**: Verify all role-based access controls work as expected

## 📚 Next Steps

1. Read the full [JWT Authentication Guide](./JWT_AUTH_GUIDE.md)
2. Customize user roles and permissions as needed
3. Add additional admin functionality
4. Set up monitoring and logging for admin actions
5. Configure production environment variables

## 🐛 Troubleshooting

If you encounter issues:

1. Check the [JWT Authentication Guide](./JWT_AUTH_GUIDE.md) troubleshooting section
2. Verify all environment variables are set correctly
3. Ensure database schemas are applied in the correct order
4. Check browser console and server logs for error messages

## 🎉 You're Ready!

Your JWT authentication system with admin roles is now set up and ready to use. Users will automatically get appropriate tokens, admins can bypass RLS restrictions, and your admin pages are properly secured.
