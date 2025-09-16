# 🧪 Testing Data Sources (Upstash vs Supabase)

## 📋 Step-by-Step Testing Guide

### Step 1: Open Developer Tools
1. **Right-click** on your webpage
2. Click **"Inspect"** or **"Inspect Element"**
3. Click the **"Console"** tab
4. This is where you'll see all the logs

### Step 2: Clear Everything (Fresh Start)
1. **Clear browser storage:**
   - Press `F12` → Go to **Application** tab
   - Click **"Local Storage"** → Select your site
   - Click **"Clear All"** button
   
2. **Clear console:**
   - In Console tab, click the **🚫 clear** button

3. **Sign out and sign in again** (if you're logged in)

### Step 3: Test Cart Data Flow

#### 🔵 First Test - Should Use Supabase (Database)
1. **Add items to cart** (click "Add to Cart" on any product)
2. **Watch the console** - you should see:
   ```
   🔍 CACHE MISS: Cart not found in Upstash, fetching from Supabase
   📦 DATA FETCHED: Cart retrieved from Supabase database
   💾 CACHED: Cart data saved to Upstash for future requests
   ```
3. **Check top-right corner** - should show **🔵 DB** indicator

#### 🟢 Second Test - Should Use Upstash (Cache)
1. **Refresh the page** (F5 or Ctrl+R)
2. **Watch the console** - you should see:
   ```
   🔄 CACHE HIT: Cart loaded from Upstash Redis cache
   ✅ CACHE FOUND: Cart data retrieved from Redis
   ```
3. **Check top-right corner** - should show **⚡ CACHE** indicator

### Step 4: What You Should See

#### ✅ Working Correctly:
- **First load**: Supabase logs (🔵 DB indicator)
- **Refresh**: Upstash cache logs (🟢 CACHE indicator)
- **Speed**: Cache should feel faster than database

#### ❌ If Not Working:
- **Only Supabase logs**: Cache isn't working, check Redis connection
- **No logs at all**: Check if you're logged in and have items in cart
- **Errors**: Check console for red error messages

## 🎯 Quick Visual Test

### Look for This Flow:
```
1. Add to cart → 🔵 DB (slow, from Supabase)
2. Refresh page → 🟢 CACHE (fast, from Upstash)
3. Add more items → 🔵 DB (updates database)
4. Refresh again → 🟢 CACHE (fast, from cache)
```

## 🔧 Troubleshooting

### If you don't see any logs:
1. Make sure you're **logged in**
2. Make sure you have **items in your cart**
3. Check if **console is open** and **not filtered**

### If you only see database logs:
1. Check **Redis connection** in console
2. Look for **connection errors**
3. Try the test endpoints: `/api/test-upstash`

### If visual indicator doesn't show:
1. Make sure you're in **development mode**
2. **Refresh the page**
3. Check browser console for **React errors**

## 📊 Expected Timeline

- **Cache Miss (Database)**: ~200-500ms
- **Cache Hit (Redis)**: ~50-100ms
- **Visual difference**: Cache should feel noticeably faster

## 🚀 Pro Tip

Open **two browser tabs**:
1. **Tab 1**: Your app
2. **Tab 2**: Console logs

This way you can see the logs in real-time while using the app!
