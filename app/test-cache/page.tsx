"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/components/cart-context";
import { useAuth } from "@/components/supabase-auth-provider";

export default function TestCachePage() {
  const { cart, addToCart, clearCart } = useCart();
  const { user } = useAuth();
  const [logs, setLogs] = useState<string[]>([]);

  // Override console to capture logs
  if (typeof window !== "undefined") {
    const originalLog = console.log;
    const originalWarn = console.warn;
    
    console.log = (...args) => {
      originalLog(...args);
      const message = args[0];
      if (typeof message === 'string' && (
        message.includes('CACHE HIT') || 
        message.includes('CACHE MISS') || 
        message.includes('DATA FETCHED') ||
        message.includes('CACHED:') ||
        message.includes('CACHE FOUND') ||
        message.includes('CACHE EMPTY')
      )) {
        setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
      }
    };

    console.warn = (...args) => {
      originalWarn(...args);
      const message = args[0];
      if (typeof message === 'string' && message.includes('CACHE')) {
        setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ⚠️ ${message}`]);
      }
    };
  }

  const testProduct = {
    id: "test-product-1",
    name: "Test Product",
    price: 99.99,
    image: "/placeholder.jpg"
  };

  const handleAddTestItem = () => {
    addToCart(testProduct, 1);
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: 🛒 Added test item to cart`]);
  };

  const handleClearCart = () => {
    clearCart();
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: 🗑️ Cleared cart`]);
  };

  const handleClearLogs = () => {
    setLogs([]);
  };

  const handleRefreshTest = () => {
    window.location.reload();
  };

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-2xl font-bold mb-4">🧪 Cache Testing</h1>
          <p className="text-gray-600 mb-4">Please log in to test cart caching</p>
          <Button asChild>
            <a href="/login">Login to Test</a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">🧪 Cache Testing Dashboard</h1>
        
        <div className="grid md:grid-cols-2 gap-6">
          {/* Test Controls */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">🎮 Test Controls</h2>
            
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-2">Current cart items: {cart.length}</p>
                <p className="text-sm text-gray-600 mb-4">User ID: {user.id.substring(0, 8)}...</p>
              </div>

              <Button onClick={handleAddTestItem} className="w-full">
                🛒 Add Test Item to Cart
              </Button>
              
              <Button onClick={handleRefreshTest} variant="outline" className="w-full">
                🔄 Refresh Page (Test Cache)
              </Button>
              
              <Button onClick={handleClearCart} variant="destructive" className="w-full">
                🗑️ Clear Cart
              </Button>
            </div>

            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <h3 className="font-semibold text-blue-800 mb-2">📋 Testing Steps:</h3>
              <ol className="text-sm text-blue-700 space-y-1">
                <li>1. Add test item → Should see Supabase logs</li>
                <li>2. Refresh page → Should see Upstash cache logs</li>
                <li>3. Check speed difference!</li>
              </ol>
            </div>
          </div>

          {/* Live Logs */}
          <div className="bg-gray-900 rounded-lg shadow-md p-6 text-white">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">📊 Live Logs</h2>
              <Button onClick={handleClearLogs} size="sm" variant="outline">
                Clear Logs
              </Button>
            </div>
            
            <div className="bg-black rounded p-4 h-64 overflow-y-auto font-mono text-sm">
              {logs.length === 0 ? (
                <p className="text-gray-400">No logs yet... Add an item to cart to start testing!</p>
              ) : (
                logs.map((log, index) => (
                  <div key={index} className="mb-1">
                    {log.includes('CACHE HIT') ? (
                      <span className="text-green-400">{log}</span>
                    ) : log.includes('CACHE MISS') ? (
                      <span className="text-yellow-400">{log}</span>
                    ) : log.includes('DATA FETCHED') ? (
                      <span className="text-blue-400">{log}</span>
                    ) : log.includes('CACHED:') ? (
                      <span className="text-purple-400">{log}</span>
                    ) : (
                      <span className="text-white">{log}</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Expected Results */}
        <div className="mt-6 bg-green-50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-green-800 mb-3">✅ What You Should See</h3>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="font-semibold text-green-700 mb-2">🔵 First Load (Database):</h4>
              <ul className="text-green-600 space-y-1">
                <li>• 🔍 CACHE MISS: Cart not found in Upstash</li>
                <li>• 📦 DATA FETCHED: Cart retrieved from Supabase</li>
                <li>• 💾 CACHED: Cart data saved to Upstash</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-green-700 mb-2">🟢 Refresh (Cache):</h4>
              <ul className="text-green-600 space-y-1">
                <li>• 🔄 CACHE HIT: Cart loaded from Upstash</li>
                <li>• ✅ CACHE FOUND: Cart data retrieved from Redis</li>
                <li>• Much faster response time!</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
