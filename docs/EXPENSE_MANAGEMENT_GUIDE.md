# Expense Management System

A comprehensive expense management system integrated into the admin panel for tracking, approving, and analyzing company expenses.

## Features

### Core Functionality
- **Expense Tracking**: Create, view, edit, and delete expense entries
- **Approval Workflow**: Multi-stage approval process (pending → approved → paid)
- **Category Management**: Organize expenses by categories (office supplies, travel, marketing, etc.)
- **Priority Levels**: Set priority levels (low, medium, high, urgent) for expenses
- **File Attachments**: Upload receipts and supporting documents
- **Bulk Operations**: Approve, reject, or mark multiple expenses as paid

### Analytics & Reporting
- **Dashboard Overview**: Quick stats and recent expenses on main admin dashboard
- **Detailed Analytics**: Monthly trends, category breakdown, and growth metrics
- **Status Tracking**: Real-time status overview with pending, approved, rejected, and paid amounts
- **User-wise Reports**: Track expenses by individual users

### User Experience
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Advanced Filtering**: Filter by status, category, priority, date range, and search
- **Real-time Updates**: Instant updates when expenses are approved or rejected
- **Intuitive Interface**: Clean, modern UI with clear visual indicators

## System Architecture

### Database Schema
The expense system uses the following database tables:

#### `expenses` Table
- **id**: Unique identifier (UUID)
- **user_id**: Reference to the user who created the expense
- **title**: Expense title/description
- **amount**: Expense amount (decimal with 2 decimal places)
- **category**: Expense category (enum)
- **priority**: Priority level (enum)
- **status**: Current status (pending, approved, rejected, paid, cancelled)
- **expense_date**: Date when the expense occurred
- **vendor**: Vendor/supplier name (optional)
- **payment_method**: How the expense was paid
- **receipt_url**: URL to receipt/document (optional)
- **notes**: Additional notes (optional)
- **tags**: Array of tags for flexible categorization
- **approved_by**: User ID of approver (optional)
- **approved_at**: Timestamp of approval (optional)
- **rejected_reason**: Reason for rejection (optional)
- **created_at**: Record creation timestamp
- **updated_at**: Last update timestamp

#### `expense_attachments` Table
- **id**: Unique identifier (UUID)
- **expense_id**: Reference to expense
- **filename**: Original filename
- **file_path**: Storage path
- **file_size**: File size in bytes
- **mime_type**: File MIME type
- **uploaded_at**: Upload timestamp

### API Endpoints

#### Expense Management
- `GET /api/admin/expenses` - List expenses with filtering
- `POST /api/admin/expenses` - Create new expense
- `GET /api/admin/expenses/[id]` - Get specific expense
- `PUT /api/admin/expenses/[id]` - Update expense
- `DELETE /api/admin/expenses/[id]` - Delete expense

#### Bulk Operations
- `POST /api/admin/expenses/actions` - Perform bulk actions (approve, reject, mark paid)

#### Analytics
- `GET /api/admin/expenses/summary` - Get expense summary and analytics

### Components

#### Admin Components
- **ExpenseManagement**: Main expense list and management interface
- **ExpenseAnalytics**: Analytics dashboard with charts and insights
- **ExpenseForm**: Form for creating and editing expenses
- **ExpenseDashboard**: Overview widget for main admin dashboard

#### Features
- **Advanced Filtering**: Status, category, priority, date range, and text search
- **Bulk Actions**: Select multiple expenses for batch operations
- **Real-time Updates**: Instant UI updates after API operations
- **Responsive Tables**: Mobile-friendly expense tables
- **Status Badges**: Visual indicators for expense status and priority

## Usage Guide

### For Administrators

#### Accessing Expense Management
1. Login as an admin user
2. Navigate to the admin panel
3. Click on "Expenses" in the sidebar navigation

#### Creating an Expense
1. Click the "Add Expense" button
2. Fill in the required fields:
   - Title (required)
   - Amount (required)
   - Category (required)
   - Expense Date (required)
   - Payment Method (required)
3. Optionally add:
   - Description
   - Vendor information
   - Receipt URL
   - Tags for categorization
   - Additional notes
4. Click "Create Expense"

#### Managing Expenses
1. **View All Expenses**: See complete list with filtering options
2. **Filter Expenses**: Use status, category, priority, and date filters
3. **Search**: Use text search to find specific expenses
4. **Bulk Operations**: Select multiple expenses and:
   - Approve selected expenses
   - Reject selected expenses
   - Mark selected expenses as paid

#### Individual Expense Actions
- **View Details**: Click the action menu → "View Details"
- **Approve**: Click the action menu → "Approve" (for pending expenses)
- **Reject**: Click the action menu → "Reject" (for pending expenses)
- **Mark as Paid**: Click the action menu → "Mark as Paid" (for approved expenses)
- **Delete**: Click the action menu → "Delete"

#### Analytics Dashboard
1. Switch to the "Analytics" tab to view:
   - Total expense statistics
   - Monthly trends
   - Category breakdown
   - Status distribution
   - Growth metrics

### Expense Workflow

1. **Creation**: User creates expense entry (status: pending)
2. **Review**: Admin reviews the expense details
3. **Approval**: Admin approves or rejects the expense
   - **Approved**: Expense moves to approved status
   - **Rejected**: Expense is rejected with reason
4. **Payment**: Admin marks approved expenses as paid
5. **Completion**: Expense workflow is complete

### Permission System

The expense system uses Row Level Security (RLS) with the following permissions:

#### Regular Users
- Can view their own expenses
- Can create new expenses
- Can update their own pending expenses
- Can delete their own pending expenses

#### Admin Users
- Can view all expenses
- Can update any expense
- Can delete any expense
- Can approve/reject expenses
- Can mark expenses as paid
- Can perform bulk operations

### Categories

The system supports the following expense categories:
- **Office Supplies**: Stationery, office equipment, supplies
- **Travel**: Business travel, accommodation, transportation
- **Marketing**: Advertising, promotional materials, campaigns
- **Software**: Software licenses, subscriptions, tools
- **Equipment**: Hardware, machinery, equipment purchases
- **Utilities**: Internet, phone, electricity, utilities
- **Professional Services**: Consulting, legal, accounting services
- **Training**: Employee training, courses, certifications
- **Maintenance**: Equipment maintenance, repairs, servicing
- **Other**: Miscellaneous expenses not covered above

### Priority Levels
- **Low**: Non-urgent expenses, can be processed in regular workflow
- **Medium**: Standard business expenses requiring timely approval
- **High**: Important expenses that need prompt attention
- **Urgent**: Critical expenses requiring immediate approval

### Payment Methods
- **Company Card**: Paid using company credit/debit card
- **Reimbursement**: Employee paid and needs reimbursement
- **Direct Payment**: Company paid directly to vendor
- **Bank Transfer**: Paid via bank transfer

## Technical Implementation

### Security Features
- JWT-based authentication for API access
- Row Level Security (RLS) for database access
- Admin role verification for sensitive operations
- Input validation and sanitization
- SQL injection protection

### Performance Optimizations
- Database indexes for common queries
- Efficient pagination for large datasets
- Optimized API responses with selective data loading
- Client-side caching for frequently accessed data

### Error Handling
- Comprehensive error handling in API endpoints
- User-friendly error messages
- Graceful degradation for failed operations
- Logging for debugging and monitoring

## Future Enhancements

### Planned Features
- **Budget Management**: Set and track budgets by category
- **Recurring Expenses**: Support for recurring expense entries
- **Advanced Reporting**: PDF export, custom date ranges
- **Email Notifications**: Automated notifications for approvals
- **Mobile App**: Dedicated mobile application
- **Integration**: Connect with accounting software (QuickBooks, etc.)
- **Multi-currency**: Support for multiple currencies
- **Expense Policies**: Configurable approval policies and limits

### Technical Improvements
- **Real-time Updates**: WebSocket-based real-time notifications
- **Advanced Analytics**: Machine learning for expense insights
- **Audit Trail**: Detailed logging of all expense changes
- **API Rate Limiting**: Prevent abuse of expense APIs
- **Backup & Recovery**: Automated backup strategies

## Troubleshooting

### Common Issues

#### "Access Denied" Error
- Ensure user has admin role in the database
- Check JWT token validity
- Verify RLS policies are correctly applied

#### Expenses Not Loading
- Check network connectivity
- Verify API endpoints are accessible
- Check browser console for JavaScript errors

#### Upload Issues
- Verify file size limits
- Check supported file formats
- Ensure proper file permissions

#### Database Connection Issues
- Check Supabase connection status
- Verify environment variables
- Check database credentials

### Support
For technical support or feature requests, please contact the development team or create an issue in the project repository.
