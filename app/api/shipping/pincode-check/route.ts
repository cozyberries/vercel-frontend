import { NextResponse } from "next/server";
import {
  checkPincodeServiceability,
  stateCodeToName,
} from "@/lib/utils/shipping-helpers";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pincode = searchParams.get("pincode");

  if (!pincode || !/^\d{6}$/.test(pincode)) {
    return NextResponse.json(
      { error: "Invalid pincode. Must be 6 digits." },
      { status: 400 }
    );
  }

  try {
    const result = await checkPincodeServiceability(pincode);

    return NextResponse.json({
      serviceable: result.serviceable,
      pincode: result.pincode,
      city: result.district,
      state: stateCodeToName(result.state_code),
      state_code: result.state_code,
      country: result.country_code === "IN" ? "India" : result.country_code,
      prepaid: result.prepaid,
      cod: result.cod,
      is_oda: result.is_oda,
    });
  } catch (err) {
    console.error("Pincode check error:", err);
    return NextResponse.json(
      { error: "Unable to verify pincode. Please try again." },
      { status: 502 }
    );
  }
}
