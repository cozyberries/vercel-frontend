-- Admin RLS Bypass Policies
-- This file contains RLS policies that allow admin users to bypass normal restrictions

-- Update Orders table policies to allow admin access
DROP POLICY IF EXISTS "Admins can view all orders" ON orders;
DROP POLICY IF EXISTS "Admins can update all orders" ON orders;
DROP POLICY IF EXISTS "Admins can delete orders" ON orders;

-- Create admin policies for orders
CREATE POLICY "Admins can view all orders" ON orders
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
    );

CREATE POLICY "Admins can update all orders" ON orders
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
    );

CREATE POLICY "Admins can delete orders" ON orders
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
    );

-- Update Payments table policies to allow admin access
DROP POLICY IF EXISTS "Admins can view all payments" ON payments;
DROP POLICY IF EXISTS "Admins can update all payments" ON payments;
DROP POLICY IF EXISTS "Admins can delete payments" ON payments;

-- Create admin policies for payments
CREATE POLICY "Admins can view all payments" ON payments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
    );

CREATE POLICY "Admins can update all payments" ON payments
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
    );

CREATE POLICY "Admins can delete payments" ON payments
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
    );

-- Create function to get auth.users data (only for admins)
CREATE OR REPLACE FUNCTION get_auth_users(
    limit_count INTEGER DEFAULT 50,
    offset_count INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    email TEXT,
    email_confirmed_at TIMESTAMPTZ,
    last_sign_in_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    raw_user_meta_data JSONB,
    is_super_admin BOOLEAN,
    aud TEXT,
    role TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Check if the current user is an admin
    IF NOT EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE user_profiles.id = auth.uid() 
        AND user_profiles.role IN ('admin', 'super_admin')
    ) THEN
        RAISE EXCEPTION 'Access denied: Admin privileges required';
    END IF;

    -- Return auth users data
    RETURN QUERY
    SELECT 
        u.id,
        u.email::TEXT,
        u.email_confirmed_at,
        u.last_sign_in_at,
        u.created_at,
        u.updated_at,
        u.raw_user_meta_data,
        u.is_super_admin,
        u.aud,
        u.role
    FROM auth.users u
    ORDER BY u.created_at DESC
    LIMIT limit_count
    OFFSET offset_count;
END;
$$;

-- Create function to get specific auth user by ID (only for admins)
CREATE OR REPLACE FUNCTION get_auth_user_by_id(user_id UUID)
RETURNS TABLE (
    id UUID,
    email TEXT,
    email_confirmed_at TIMESTAMPTZ,
    last_sign_in_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    raw_user_meta_data JSONB,
    is_super_admin BOOLEAN,
    aud TEXT,
    role TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Check if the current user is an admin
    IF NOT EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE user_profiles.id = auth.uid() 
        AND user_profiles.role IN ('admin', 'super_admin')
    ) THEN
        RAISE EXCEPTION 'Access denied: Admin privileges required';
    END IF;

    -- Return specific auth user data
    RETURN QUERY
    SELECT 
        u.id,
        u.email::TEXT,
        u.email_confirmed_at,
        u.last_sign_in_at,
        u.created_at,
        u.updated_at,
        u.raw_user_meta_data,
        u.is_super_admin,
        u.aud,
        u.role
    FROM auth.users u
    WHERE u.id = user_id;
END;
$$;

-- Create function to update user status (only for admins)
CREATE OR REPLACE FUNCTION admin_update_user_status(
    user_id UUID,
    new_email_confirmed BOOLEAN DEFAULT NULL,
    new_banned_until TIMESTAMPTZ DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Check if the current user is an admin
    IF NOT EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE user_profiles.id = auth.uid() 
        AND user_profiles.role IN ('admin', 'super_admin')
    ) THEN
        RAISE EXCEPTION 'Access denied: Admin privileges required';
    END IF;

    -- Update auth.users table
    UPDATE auth.users
    SET 
        email_confirmed_at = CASE 
            WHEN new_email_confirmed = TRUE AND email_confirmed_at IS NULL 
            THEN NOW()
            WHEN new_email_confirmed = FALSE 
            THEN NULL
            ELSE email_confirmed_at
        END,
        banned_until = new_banned_until,
        updated_at = NOW()
    WHERE id = user_id;

    RETURN FOUND;
END;
$$;

-- Create function to get user statistics (only for admins)
CREATE OR REPLACE FUNCTION get_user_statistics()
RETURNS TABLE (
    total_users BIGINT,
    confirmed_users BIGINT,
    unconfirmed_users BIGINT,
    admin_users BIGINT,
    users_last_30_days BIGINT,
    users_last_7_days BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Check if the current user is an admin
    IF NOT EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE user_profiles.id = auth.uid() 
        AND user_profiles.role IN ('admin', 'super_admin')
    ) THEN
        RAISE EXCEPTION 'Access denied: Admin privileges required';
    END IF;

    -- Return user statistics
    RETURN QUERY
    SELECT 
        (SELECT COUNT(*) FROM auth.users) as total_users,
        (SELECT COUNT(*) FROM auth.users WHERE email_confirmed_at IS NOT NULL) as confirmed_users,
        (SELECT COUNT(*) FROM auth.users WHERE email_confirmed_at IS NULL) as unconfirmed_users,
        (SELECT COUNT(*) FROM user_profiles WHERE role IN ('admin', 'super_admin')) as admin_users,
        (SELECT COUNT(*) FROM auth.users WHERE created_at >= NOW() - INTERVAL '30 days') as users_last_30_days,
        (SELECT COUNT(*) FROM auth.users WHERE created_at >= NOW() - INTERVAL '7 days') as users_last_7_days;
END;
$$;

-- Create function to delete user (only for super admins)
CREATE OR REPLACE FUNCTION admin_delete_user(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Check if the current user is a super admin
    IF NOT EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE user_profiles.id = auth.uid() 
        AND user_profiles.role = 'super_admin'
    ) THEN
        RAISE EXCEPTION 'Access denied: Super admin privileges required';
    END IF;

    -- Prevent deleting yourself
    IF user_id = auth.uid() THEN
        RAISE EXCEPTION 'Cannot delete your own account';
    END IF;

    -- Delete from user_profiles first (cascades will handle auth.users)
    DELETE FROM user_profiles WHERE id = user_id;
    
    -- Delete from auth.users
    DELETE FROM auth.users WHERE id = user_id;

    RETURN FOUND;
END;
$$;

-- Grant execute permissions to authenticated users (functions will check admin status internally)
GRANT EXECUTE ON FUNCTION get_auth_users(INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_auth_user_by_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_user_status(UUID, BOOLEAN, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_statistics() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_delete_user(UUID) TO authenticated;

-- Create a view for admin user management (with RLS)
CREATE OR REPLACE VIEW admin_users_view AS
SELECT 
    up.id,
    up.role,
    up.full_name,
    up.phone,
    up.is_active,
    up.is_verified,
    up.admin_notes,
    up.created_by,
    up.created_at,
    up.updated_at,
    au.email,
    au.email_confirmed_at,
    au.last_sign_in_at,
    au.raw_user_meta_data
FROM user_profiles up
LEFT JOIN auth.users au ON up.id = au.id
ORDER BY up.created_at DESC;

-- Enable RLS on the view
ALTER VIEW admin_users_view SET (security_barrier = true);

-- Create RLS policy for the view (only admins can access)
CREATE POLICY "Admins can view admin_users_view" ON admin_users_view
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
    );

-- Grant access to the view
GRANT SELECT ON admin_users_view TO authenticated;
