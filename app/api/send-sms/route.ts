import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';
import { currency, isValidPhone, toE164 } from '@/lib/calculations';
import type { SendSmsRequest, SendSmsResponse } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 20;

/**
 * POST /api/send-sms
 * Body: SendSmsRequest
 *
 * Sends the finished invoice summary to the client's phone via Twilio.
 * Credentials (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / SMS_SENDER_NUMBER)
 * live only on the server — never shipped to the browser bundle.
 *
 * Twilio's auth model needs an Account SID *and* Auth Token (not a single
 * API key), so this route reads both; SMS_SENDER_NUMBER is the "from"
 * number as requested in the spec.
 */
export async function POST(req: NextRequest) {
  try {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, SMS_SENDER_NUMBER } = process.env;

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !SMS_SENDER_NUMBER) {
      return NextResponse.json(
        {
          success: false,
          error:
            'SMS is not configured on the server. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and SMS_SENDER_NUMBER to .env.local.',
        } satisfies SendSmsResponse,
        { status: 500 }
      );
    }

    const body = (await req.json().catch(() => null)) as SendSmsRequest | null;

    if (!body || !body.toPhoneNumber || !body.clientName || typeof body.totalDue !== 'number') {
      return NextResponse.json(
        { success: false, error: 'Missing required fields (phone number, client name, or total due).' } satisfies SendSmsResponse,
        { status: 400 }
      );
    }

    if (!isValidPhone(body.toPhoneNumber)) {
      return NextResponse.json(
        { success: false, error: 'That phone number does not look valid. Include the area code.' } satisfies SendSmsResponse,
        { status: 400 }
      );
    }

    const to = toE164(body.toPhoneNumber);
    const workSummary = (body.workSummary || 'services rendered').trim();
    const trimmedSummary = workSummary.length > 140 ? workSummary.slice(0, 137) + '…' : workSummary;

    const messageLines = [
      `Hi ${body.clientName}, your invoice ${body.invoiceId} is ready.`,
      `Work: ${trimmedSummary}`,
      `Total due: ${currency(body.totalDue)}`,
    ];
    if (body.invoiceUrl) messageLines.push(`View & pay: ${body.invoiceUrl}`);

    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    const message = await client.messages.create({
      to,
      from: SMS_SENDER_NUMBER,
      body: messageLines.join('\n'),
    });

    const payload: SendSmsResponse = { success: true, sid: message.sid };
    return NextResponse.json(payload);
  } catch (err: any) {
    console.error('[send-sms] error:', err);
    const message =
      err?.code === 21211
        ? 'Twilio rejected that phone number as invalid.'
        : 'Could not send the SMS. Please try again.';
    return NextResponse.json({ success: false, error: message } satisfies SendSmsResponse, { status: 502 });
  }
}
