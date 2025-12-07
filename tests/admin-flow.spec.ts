import { test, expect } from '@playwright/test';

test.describe('Admin Order Flow', () => {
    const TEST_EMAIL = process.env.TEST_ADMIN_EMAIL || 'test_admin_user@example.com';
    const TEST_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'TestPassword123!';

    test('Complete Admin Flow: Signup -> Admin Promotio -> Create/Update/Delete Order', async ({ page, request }) => {
        // 1. Sign Up
        await page.goto('http://localhost:3000/auth');

        // Check if we need to switch to sign up tab
        const signUpTab = page.getByRole('tab', { name: 'Sign Up' });
        if (await signUpTab.isVisible()) {
            await signUpTab.click();
        }

        // Fill Sign Up form
        await page.fill('input[type="email"]', TEST_EMAIL);
        await page.fill('input[type="password"]', TEST_PASSWORD);

        // Handle potential existing user by trying to sign in if sign up fails, or just try sign up
        // Ideally we should delete the user first, but let's try assuming fresh or handle "User already registered"

        // Click Sign Up button. It might encompass "Sign Up" text.
        await page.click('button:has-text("Sign Up")');

        // Wait for navigation or success message. 
        // If user already exists, we might stay on page. 
        // Let's assume for this script we might need to Login if Signup fails or just proceed.
        // Simpler: Try to login if we are still on /auth after a timeout or check for error.

        // Wait for a bit
        await page.waitForTimeout(2000);

        // If we are still on /auth, try logging in
        if (page.url().includes('/auth')) {
            // Switch to Sign In
            await page.getByRole('tab', { name: 'Sign In' }).click();
            await page.fill('input[type="email"]', TEST_EMAIL);
            await page.fill('input[type="password"]', TEST_PASSWORD);
            await page.click('button:has-text("Sign In")');
        }

        // Wait for redirect to home
        await expect(page).toHaveURL('http://localhost:3000/');

        // 2. Promote to Admin (API call)
        const promoteResponse = await request.post('http://localhost:3000/api/test/promote-admin', {
            data: { email: TEST_EMAIL }
        });
        expect(promoteResponse.ok()).toBeTruthy();

        // Reload page to refresh claims/profile if needed, or re-login? 
        // IsAuth hook checks profile? Yes. 
        // We might need to refresh page to get new isAdmin status in context.
        await page.reload();
        await page.waitForTimeout(1000);

        // 3. Navigate to Admin > Orders
        // Check if Admin link is visible in header
        await expect(page.getByRole('link', { name: 'Admin' })).toBeVisible();
        await page.getByRole('link', { name: 'Admin' }).click();

        await expect(page).toHaveURL(/\/admin/);

        // Click Orders in sidebar/dashboard
        await page.click('text=Orders');

        // 4. Create Manual Order
        await page.click('button:has-text("Add Order")');

        // Fill Order Form
        await page.fill('input[name="customer_email"]', 'customer@example.com');
        await page.fill('input[name="customer_phone"]', '9876543210');

        // Address
        await page.fill('input[name="full_name"]', 'Test Customer');
        await page.fill('input[name="address_line_1"]', '123 Test St');
        await page.fill('input[name="city"]', 'Test City');
        await page.fill('input[name="state"]', 'Test State');
        await page.fill('input[name="postal_code"]', '123456');

        // Items - Add an item
        await page.click('button:has-text("Add Item")');
        // Assuming inputs for items are generated dynamically. 
        // We need to target the first item inputs.
        // Let's assume placeholders or sequential inputs
        const itemRows = page.locator('.border.p-4.rounded-md'); // Based on typical structure
        await itemRows.first().locator('input[placeholder="Product Name"]').fill('Test Product');
        await itemRows.first().locator('input[type="number"]').first().fill('1'); // Quantity
        await itemRows.first().locator('input[type="number"]').last().fill('100'); // Price

        await page.click('button:has-text("Create Order")');

        // 5. Do Payment Status Update
        // Find the order we just created. It should be at the top.
        // Look for "Test Customer" or email
        await expect(page.locator('text=customer@example.com')).toBeVisible();

        // Updates are done via dropdown or edit button in payment section.
        // The instructions say "do payment status update".
        // In the new UI, payment info is expanded. 
        // Click "Edit" button next to payment status
        await page.click('button:has-text("Edit")'); // There might be multiple, target first one which is likely the top order

        // Select "Completed"
        // Click SelectTrigger
        await page.click('[role="combobox"]');
        // Click "Completed" option
        await page.click('text=Completed');

        // Verify update toast or status change
        await expect(page.locator('text=Payment status updated successfully')).toBeVisible();

        // 6. Delete Order
        // To delete, status must be cancelled or refunded first.
        // So update status to Cancelled.

        // Order status dropdown is in the header of the card usually or separate.
        // "MoreHorizontal" button for order actions.
        await page.locator('button:has(.lucide-more-horizontal)').first().click();

        // Click "Cancel Order"
        await page.click('text=Cancel Order');

        // Wait for status update
        await expect(page.locator('text=Cancelled')).toBeVisible();

        // Now Delete
        await page.locator('button:has(.lucide-more-horizontal)').first().click();

        // Handle Confirm Dialog
        page.on('dialog', dialog => dialog.accept());

        await page.click('text=Delete Order');

        // Verify deletion
        await expect(page.locator('text=Order deleted successfully')).toBeVisible();
        await expect(page.locator('text=customer@example.com')).not.toBeVisible();
    });
});
