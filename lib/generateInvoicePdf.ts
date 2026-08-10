import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { currency, formatDateLong, safeNumber } from './calculations';
import type { GeneratePdfRequest } from './types';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 52;
const NAVY = rgb(22 / 255, 35 / 255, 58 / 255);
const GREEN = rgb(33 / 255, 112 / 255, 86 / 255);
const MUTED = rgb(96 / 255, 103 / 255, 113 / 255);
const RULE = rgb(218 / 255, 215 / 255, 205 / 255);
const PAPER = rgb(252 / 255, 251 / 255, 247 / 255);

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ['No service description provided.'];
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines.slice(0, 7);
}

function drawRight(page: PDFPage, text: string, right: number, y: number, font: PDFFont, size: number, color = NAVY) {
  page.drawText(text, { x: right - font.widthOfTextAtSize(text, size), y, font, size, color });
}

export async function generateInvoicePdf(request: GeneratePdfRequest): Promise<Uint8Array> {
  const { data, totals, invoiceId, generatedOn } = request;
  const document = await PDFDocument.create();
  const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const mono = await document.embedFont(StandardFonts.Courier);

  page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: PAPER });
  page.drawRectangle({ x: 0, y: 0, width: 18, height: PAGE_HEIGHT, color: NAVY });

  page.drawText('INVOICE', { x: MARGIN, y: 710, font: bold, size: 28, color: NAVY });
  page.drawText('LEDGER', { x: MARGIN, y: 745, font: mono, size: 9, color: GREEN });
  page.drawText('VOICE INVOICE MAKER', { x: MARGIN + 48, y: 745, font: mono, size: 8, color: MUTED });
  drawRight(page, 'INVOICE NO.', PAGE_WIDTH - MARGIN, 744, mono, 8, MUTED);
  drawRight(page, invoiceId || 'UNASSIGNED', PAGE_WIDTH - MARGIN, 724, bold, 15, GREEN);
  drawRight(page, `Issued ${formatDateLong(generatedOn)}`, PAGE_WIDTH - MARGIN, 707, regular, 9, MUTED);

  page.drawLine({ start: { x: MARGIN, y: 687 }, end: { x: PAGE_WIDTH - MARGIN, y: 687 }, thickness: 1.5, color: NAVY });

  page.drawText('BILL TO', { x: MARGIN, y: 653, font: mono, size: 8, color: MUTED });
  const clientName = `${data.firstName} ${data.lastName}`.trim() || 'Client name';
  page.drawText(clientName, { x: MARGIN, y: 632, font: bold, size: 14, color: NAVY });
  if (data.email.trim()) page.drawText(data.email.trim(), { x: MARGIN, y: 615, font: regular, size: 9, color: MUTED });
  if (data.phone.trim()) page.drawText(data.phone.trim(), { x: MARGIN, y: 599, font: regular, size: 9, color: MUTED });

  drawRight(page, 'SERVICE DATE', PAGE_WIDTH - MARGIN, 653, mono, 8, MUTED);
  drawRight(page, formatDateLong(data.serviceDate), PAGE_WIDTH - MARGIN, 630, bold, 11, NAVY);

  page.drawText('WORK PERFORMED', { x: MARGIN, y: 560, font: mono, size: 8, color: MUTED });
  page.drawLine({ start: { x: MARGIN, y: 550 }, end: { x: PAGE_WIDTH - MARGIN, y: 550 }, thickness: 0.8, color: RULE });
  const descriptionLines = wrapText(data.description, regular, 10.5, PAGE_WIDTH - MARGIN * 2);
  descriptionLines.forEach((line, index) => {
    page.drawText(line, { x: MARGIN, y: 528 - index * 15, font: regular, size: 10.5, color: NAVY });
  });

  const tableTop = Math.min(420, 510 - descriptionLines.length * 15);
  page.drawRectangle({ x: MARGIN, y: tableTop, width: PAGE_WIDTH - MARGIN * 2, height: 27, color: NAVY });
  page.drawText('ITEM', { x: MARGIN + 12, y: tableTop + 9, font: mono, size: 8, color: PAPER });
  drawRight(page, 'AMOUNT', PAGE_WIDTH - MARGIN - 12, tableTop + 9, mono, 8, PAPER);

  const rows = [
    [`Labor - ${safeNumber(data.hours).toFixed(2)} hrs x ${currency(data.rate)}`, currency(totals.laborSubtotal)],
    ['Materials and parts', currency(data.materialCost)],
  ];
  rows.forEach(([label, amount], index) => {
    const y = tableTop - 30 - index * 34;
    page.drawText(label, { x: MARGIN + 12, y, font: regular, size: 10, color: NAVY });
    drawRight(page, amount, PAGE_WIDTH - MARGIN - 12, y, mono, 10, NAVY);
    page.drawLine({ start: { x: MARGIN, y: y - 12 }, end: { x: PAGE_WIDTH - MARGIN, y: y - 12 }, thickness: 0.6, color: RULE });
  });

  const totalsTop = tableTop - 114;
  const totalRows: Array<[string, string, boolean]> = [
    ['Subtotal', currency(totals.subtotal), false],
    [`Tax (${safeNumber(data.taxRate).toFixed(data.taxRate % 1 === 0 ? 0 : 2)}%)`, currency(totals.taxAmount), false],
    ['TOTAL DUE', currency(totals.total), true],
  ];
  totalRows.forEach(([label, amount, emphasized], index) => {
    const y = totalsTop - index * 29;
    const font = emphasized ? bold : regular;
    const size = emphasized ? 14 : 10;
    page.drawText(label, { x: 354, y, font, size, color: emphasized ? GREEN : MUTED });
    drawRight(page, amount, PAGE_WIDTH - MARGIN, y, emphasized ? mono : regular, size, emphasized ? GREEN : NAVY);
    if (emphasized) {
      page.drawLine({ start: { x: 354, y: y + 23 }, end: { x: PAGE_WIDTH - MARGIN, y: y + 23 }, thickness: 1.5, color: GREEN });
    }
  });

  page.drawLine({ start: { x: MARGIN, y: 74 }, end: { x: PAGE_WIDTH - MARGIN, y: 74 }, thickness: 0.7, color: RULE });
  page.drawText('Thank you for your business.', { x: MARGIN, y: 52, font: bold, size: 9, color: NAVY });
  drawRight(page, invoiceId || 'Invoice', PAGE_WIDTH - MARGIN, 52, mono, 8, MUTED);

  document.setTitle(`${invoiceId || 'Invoice'} - ${clientName}`);
  document.setAuthor('Ledger Invoice Maker');
  document.setSubject('Invoice');
  document.setCreationDate(new Date());
  return document.save();
}
