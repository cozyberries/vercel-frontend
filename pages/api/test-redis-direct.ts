import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Test direct fetch to Upstash REST API
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    
    if (!url || !token) {
      return res.status(500).json({ 
        error: 'Missing environment variables',
        hasUrl: !!url,
        hasToken: !!token
      });
    }
    
    // Direct REST API call to test connection
    const response = await fetch(`${url}/ping`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const responseText = await response.text();
    
    if (!response.ok) {
      return res.status(500).json({
        error: 'Redis connection failed',
        status: response.status,
        statusText: response.statusText,
        response: responseText.substring(0, 200) + '...'
      });
    }
    
    const result = JSON.parse(responseText);
    
    res.status(200).json({
      success: true,
      result,
      status: response.status,
      message: 'Direct Redis connection successful!'
    });
    
  } catch (error) {
    console.error('Direct Redis test failed:', error);
    res.status(500).json({
      error: 'Direct Redis test failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
