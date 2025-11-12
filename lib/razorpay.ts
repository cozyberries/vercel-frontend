import Razorpay from "razorpay";

// Validate required environment variables at startup
const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

if (!keyId || !keySecret) {
  throw new Error(
    "Missing required Razorpay environment variables: RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be defined"
  );
}

export const razorpay = new Razorpay({
  key_id: keyId,
  key_secret: keySecret,
});