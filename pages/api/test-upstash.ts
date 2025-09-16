import { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const hasUrl = !!process.env.UPSTASH_REDIS_REST_URL;
  const hasToken = !!process.env.UPSTASH_REDIS_REST_TOKEN;
  
  const urlPreview = process.env.UPSTASH_REDIS_REST_URL?.substring(0, 30) + '...';
  const tokenPreview = process.env.UPSTASH_REDIS_REST_TOKEN?.substring(0, 15) + '...';
  
  res.status(200).json({
    hasUrl,
    hasToken,
    urlPreview: hasUrl ? urlPreview : 'NOT SET',
    tokenPreview: hasToken ? tokenPreview : 'NOT SET',
    nodeEnv: process.env.NODE_ENV
  });
}
