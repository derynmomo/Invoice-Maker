import { NextRequest, NextResponse } from 'next/server';
import { generateInvoicePdf } from '@/lib/generateInvoicePdf';
import type { GeneratePdfRequest } from '@/lib/types';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as GeneratePdfRequest | null;
    if (!body?.data || !body?.totals || !body.invoiceId || !body.generatedOn) {
      return NextResponse.json({ error: 'The invoice data is incomplete.' }, { status: 400 });
    }

    const pdfBytes = await generateInvoicePdf(body);
    const filename = `${body.invoiceId.replace(/[^a-zA-Z0-9-]/g, '') || 'invoice'}.pdf`;
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[generate-pdf] error:', error);
    return NextResponse.json({ error: 'Could not generate the PDF. Please try again.' }, { status: 500 });
  }
}
