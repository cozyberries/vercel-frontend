"use client";

import { useState, useEffect } from "react";

interface DataSourceLog {
  timestamp: string;
  source: "UPSTASH_CACHE" | "SUPABASE_DATABASE" | "SUPABASE_FALLBACK";
  action: string;
  details: any;
}

export default function DataSourceIndicator() {
  const [logs, setLogs] = useState<DataSourceLog[]>([]);

  useEffect(() => {
    // Override console.log to capture our specific logs
    const originalLog = console.log;
    
    console.log = (...args) => {
      // Call original console.log
      originalLog(...args);
      
      // Check if this is one of our data source logs
      const message = args[0];
      if (typeof message === 'string') {
        if (message.includes('CACHE HIT') || message.includes('CACHE MISS') || message.includes('DATA FETCHED')) {
          const details = args[1] || {};
          setLogs(prev => [...prev.slice(-4), {
            timestamp: new Date().toLocaleTimeString(),
            source: details.source || 'UNKNOWN',
            action: message,
            details
          }]);
        }
      }
    };

    return () => {
      console.log = originalLog;
    };
  }, []);

  if (logs.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 bg-black/80 text-white p-4 rounded-lg text-xs max-w-sm">
      <h3 className="font-bold mb-2">📊 Data Source Monitor</h3>
      <div className="space-y-1">
        {logs.map((log, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="text-gray-400">{log.timestamp}</span>
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              log.source === 'UPSTASH_CACHE' ? 'bg-green-600' :
              log.source === 'SUPABASE_DATABASE' ? 'bg-blue-600' :
              'bg-yellow-600'
            }`}>
              {log.source === 'UPSTASH_CACHE' ? '⚡ CACHE' :
               log.source === 'SUPABASE_DATABASE' ? '🗄️ DB' :
               '🔍 MISS'}
            </span>
            <span className="text-gray-300">
              {log.details.itemCount !== undefined ? `${log.details.itemCount} items` : ''}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 text-xs text-gray-400">
        🟢 Cache Hit = Fast (Upstash)<br/>
        🔵 Database = Slower (Supabase)<br/>
        🟡 Cache Miss = Fallback
      </div>
    </div>
  );
}
