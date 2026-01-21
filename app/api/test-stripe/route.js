export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    hasPublishableKey: !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    hasSecretKey: !!process.env.STRIPE_SECRET_KEY,
    publishableKeyPrefix: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.substring(0, 20),
    secretKeyPrefix: process.env.STRIPE_SECRET_KEY?.substring(0, 20),
  });
}
