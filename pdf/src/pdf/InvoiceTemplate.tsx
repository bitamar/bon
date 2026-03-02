import type { PdfRenderInput } from '@bon/types/pdf';
import { DOCUMENT_TYPE_PDF_LABELS, BUSINESS_TYPE_PDF_LABELS } from '@bon/types/pdf';
import { formatMinorUnits, formatDate } from '@bon/types/formatting';

function formatVatRate(basisPoints: number): string {
  return `${(basisPoints / 100).toFixed(0)}%`;
}

function formatQuantity(qty: number): string {
  return qty % 1 === 0 ? String(qty) : qty.toFixed(2);
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = formatDate(iso.split('T')[0]!);
  const time = d.toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jerusalem',
  });
  return `${date} ${time}`;
}

export function InvoiceTemplate(props: Readonly<PdfRenderInput>) {
  const { business, invoice, items, isDraft } = props;

  const docLabel = DOCUMENT_TYPE_PDF_LABELS[invoice.documentType];
  const businessTypeLabel = BUSINESS_TYPE_PDF_LABELS[business.businessType];

  const addressParts = [business.streetAddress, business.city, business.postalCode].filter(Boolean);
  const businessAddress = addressParts.join(', ');

  return (
    <html dir="rtl" lang="he">
      <head>
        <meta charSet="utf-8" />
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
      </head>
      <body>
        {isDraft && (
          <div className="watermark">
            {'\u05D8\u05D9\u05D5\u05D8\u05D4 - \u05DC\u05D0 \u05D1\u05EA\u05D5\u05E7\u05E3'}
          </div>
        )}

        {/* ── Header ── */}
        <header className="header">
          <div className="header-business">
            {business.logoUrl && <img src={business.logoUrl} alt="" className="logo" />}
            <div>
              <h1 className="business-name">{business.name}</h1>
              <div className="business-type">{businessTypeLabel}</div>
            </div>
          </div>
          <div className="header-details">
            <div>
              {'\u05D7.\u05E4. / \u05E2.\u05DE.'}:{' '}
              <span dir="ltr">{business.registrationNumber}</span>
            </div>
            {business.vatNumber && (
              <div>
                {'\u05E2\u05D5\u05E1\u05E7 \u05DE\u05E2"\u05DE'}:{' '}
                <span dir="ltr">{business.vatNumber}</span>
              </div>
            )}
            {businessAddress && <div>{businessAddress}</div>}
            {business.phone && (
              <div>
                {'\u05D8\u05DC'}: <span dir="ltr">{business.phone}</span>
              </div>
            )}
            {business.email && <div>{business.email}</div>}
          </div>
        </header>

        {/* ── Document Identity ── */}
        <section className="doc-identity">
          <h2 className="doc-type">{docLabel}</h2>
          <div className="doc-meta">
            {invoice.documentNumber && (
              <div className="doc-number">
                {'\u05DE\u05E1\u05E4\u05E8'}: <strong dir="ltr">{invoice.documentNumber}</strong>
              </div>
            )}
            <div>
              {'\u05EA\u05D0\u05E8\u05D9\u05DA'}:{' '}
              <span dir="ltr">{formatDate(invoice.invoiceDate)}</span>
            </div>
            {invoice.issuedAt && (
              <div>
                {'\u05D4\u05D5\u05E0\u05E4\u05E7'}:{' '}
                <span dir="ltr">{formatDateTime(invoice.issuedAt)}</span>
              </div>
            )}
            {invoice.dueDate && (
              <div>
                {'\u05EA\u05D0\u05E8\u05D9\u05DA \u05EA\u05E9\u05DC\u05D5\u05DD'}:{' '}
                <span dir="ltr">{formatDate(invoice.dueDate)}</span>
              </div>
            )}
          </div>
        </section>

        {/* ── Customer ── */}
        <section className="customer-section">
          <h3>{'\u05DC\u05DB\u05D1\u05D5\u05D3'}:</h3>
          {invoice.customerName && <div className="customer-name">{invoice.customerName}</div>}
          {invoice.customerTaxId && (
            <div>
              {'\u05D7.\u05E4. / \u05E2.\u05DE.'}: <span dir="ltr">{invoice.customerTaxId}</span>
            </div>
          )}
          {invoice.customerAddress && <div>{invoice.customerAddress}</div>}
          {invoice.customerEmail && <div>{invoice.customerEmail}</div>}
        </section>

        {/* ── Line Items ── */}
        <table className="items-table">
          <thead>
            <tr>
              <th className="col-num">#</th>
              <th className="col-desc">{'\u05EA\u05D9\u05D0\u05D5\u05E8'}</th>
              <th className="col-catalog">{'\u05DE\u05E7"\u05D8'}</th>
              <th className="col-qty">{'\u05DB\u05DE\u05D5\u05EA'}</th>
              <th className="col-price">
                {'\u05DE\u05D7\u05D9\u05E8 \u05D9\u05D7\u05D9\u05D3\u05D4'}
              </th>
              <th className="col-discount">{'\u05D4\u05E0\u05D7\u05D4 %'}</th>
              <th className="col-vat">{'\u05DE\u05E2"\u05DE %'}</th>
              <th className="col-total">{'\u05E1\u05DB\u05D5\u05DD'}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item.id}>
                <td className="col-num">{idx + 1}</td>
                <td className="col-desc">{item.description}</td>
                <td className="col-catalog">{item.catalogNumber ?? ''}</td>
                <td className="col-qty" dir="ltr">
                  {formatQuantity(item.quantity)}
                </td>
                <td className="col-price" dir="ltr">
                  {formatMinorUnits(item.unitPriceMinorUnits, invoice.currency)}
                </td>
                <td className="col-discount" dir="ltr">
                  {item.discountPercent > 0 ? `${item.discountPercent}%` : ''}
                </td>
                <td className="col-vat" dir="ltr">
                  {formatVatRate(item.vatRateBasisPoints)}
                </td>
                <td className="col-total" dir="ltr">
                  {formatMinorUnits(item.lineTotalMinorUnits, invoice.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── Totals ── */}
        <section className="totals-section">
          <table className="totals-table">
            <tbody>
              <tr>
                <td>{'\u05E1\u05D4"\u05DB \u05DC\u05E4\u05E0\u05D9 \u05D4\u05E0\u05D7\u05D4'}</td>
                <td dir="ltr">{formatMinorUnits(invoice.subtotalMinorUnits, invoice.currency)}</td>
              </tr>
              {invoice.discountMinorUnits > 0 && (
                <tr>
                  <td>{'\u05D4\u05E0\u05D7\u05D4'}</td>
                  <td dir="ltr">
                    -{formatMinorUnits(invoice.discountMinorUnits, invoice.currency)}
                  </td>
                </tr>
              )}
              <tr>
                <td>{'\u05E1\u05D4"\u05DB \u05DC\u05E4\u05E0\u05D9 \u05DE\u05E2"\u05DE'}</td>
                <td dir="ltr">
                  {formatMinorUnits(invoice.totalExclVatMinorUnits, invoice.currency)}
                </td>
              </tr>
              <tr>
                <td>{'\u05DE\u05E2"\u05DE'}</td>
                <td dir="ltr">{formatMinorUnits(invoice.vatMinorUnits, invoice.currency)}</td>
              </tr>
              <tr className="total-row">
                <td>
                  <strong>{'\u05E1\u05D4"\u05DB \u05DC\u05EA\u05E9\u05DC\u05D5\u05DD'}</strong>
                </td>
                <td dir="ltr">
                  <strong>
                    {formatMinorUnits(invoice.totalInclVatMinorUnits, invoice.currency)}
                  </strong>
                </td>
              </tr>
            </tbody>
          </table>
          {invoice.vatExemptionReason && (
            <div className="vat-exemption">
              {'\u05E1\u05D9\u05D1\u05EA \u05E4\u05D8\u05D5\u05E8 \u05DE\u05DE\u05E2"\u05DE'}:{' '}
              {invoice.vatExemptionReason}
            </div>
          )}
        </section>

        {/* ── Allocation Number ── */}
        {invoice.allocationNumber && (
          <section className="allocation-section">
            <div className="allocation-box">
              <strong>{'\u05DE\u05E1\u05E4\u05E8 \u05D4\u05E7\u05E6\u05D0\u05D4'}: </strong>
              <span dir="ltr">{invoice.allocationNumber}</span>
            </div>
          </section>
        )}

        {/* ── Notes ── */}
        {invoice.notes && (
          <section className="notes-section">
            <h4>{'\u05D4\u05E2\u05E8\u05D5\u05EA'}</h4>
            <p>{invoice.notes}</p>
          </section>
        )}

        {/* ── Footer ── */}
        <footer className="footer">
          <div>
            {
              '\u05DE\u05E1\u05DE\u05DA \u05D6\u05D4 \u05D4\u05D5\u05E4\u05E7 \u05E2\u05DC \u05D9\u05D3\u05D9 BON v1.0'
            }
          </div>
        </footer>
      </body>
    </html>
  );
}

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;700&display=swap');

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    font-family: 'Heebo', Arial, sans-serif;
    font-size: 11pt;
    color: #1a1a1a;
    line-height: 1.5;
    direction: rtl;
    padding: 30px 40px;
    position: relative;
  }

  .watermark {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-45deg);
    font-size: 72pt;
    font-weight: 700;
    color: rgba(220, 38, 38, 0.12);
    white-space: nowrap;
    pointer-events: none;
    z-index: 1000;
  }

  /* ── Header ── */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 2px solid #2563eb;
  }

  .header-business {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .logo {
    max-height: 60px;
    max-width: 120px;
    object-fit: contain;
  }

  .business-name {
    font-size: 18pt;
    font-weight: 700;
    color: #1e3a5f;
    margin-bottom: 2px;
  }

  .business-type {
    font-size: 9pt;
    color: #6b7280;
  }

  .header-details {
    text-align: left;
    font-size: 9pt;
    color: #4b5563;
    line-height: 1.6;
  }

  /* ── Document Identity ── */
  .doc-identity {
    text-align: center;
    margin-bottom: 20px;
  }

  .doc-type {
    font-size: 16pt;
    font-weight: 700;
    color: #1e3a5f;
    margin-bottom: 8px;
  }

  .doc-meta {
    display: flex;
    justify-content: center;
    gap: 24px;
    font-size: 10pt;
    color: #4b5563;
  }

  .doc-number strong {
    font-size: 12pt;
  }

  /* ── Customer ── */
  .customer-section {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 12px 16px;
    margin-bottom: 20px;
  }

  .customer-section h3 {
    font-size: 10pt;
    font-weight: 500;
    color: #6b7280;
    margin-bottom: 4px;
  }

  .customer-name {
    font-size: 12pt;
    font-weight: 600;
    margin-bottom: 2px;
  }

  .customer-section div {
    font-size: 10pt;
    color: #374151;
  }

  /* ── Items Table ── */
  .items-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 20px;
    font-size: 10pt;
  }

  .items-table thead {
    background: #1e3a5f;
    color: #fff;
  }

  .items-table th {
    padding: 8px 10px;
    font-weight: 500;
    text-align: right;
  }

  .items-table th[dir="ltr"],
  .items-table td[dir="ltr"] {
    text-align: left;
  }

  .items-table td {
    padding: 7px 10px;
    border-bottom: 1px solid #e5e7eb;
  }

  .items-table tbody tr:nth-child(even) {
    background: #f9fafb;
  }

  .col-num { width: 5%; text-align: center !important; }
  .col-desc { width: 30%; }
  .col-catalog { width: 10%; }
  .col-qty { width: 8%; }
  .col-price { width: 14%; }
  .col-discount { width: 8%; }
  .col-vat { width: 8%; }
  .col-total { width: 17%; }

  /* ── Totals ── */
  .totals-section {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    margin-bottom: 20px;
  }

  .totals-table {
    width: 320px;
    border-collapse: collapse;
    font-size: 10pt;
  }

  .totals-table td {
    padding: 5px 10px;
  }

  .totals-table td:first-child {
    text-align: right;
    color: #4b5563;
  }

  .totals-table td:last-child {
    text-align: left;
    font-variant-numeric: tabular-nums;
  }

  .total-row {
    border-top: 2px solid #1e3a5f;
  }

  .total-row td {
    padding-top: 8px;
    font-size: 12pt;
  }

  .vat-exemption {
    margin-top: 8px;
    font-size: 9pt;
    color: #6b7280;
    font-style: italic;
  }

  /* ── Allocation ── */
  .allocation-section {
    margin-bottom: 20px;
  }

  .allocation-box {
    display: inline-block;
    border: 2px solid #16a34a;
    border-radius: 6px;
    padding: 8px 16px;
    background: #f0fdf4;
    font-size: 11pt;
  }

  /* ── Notes ── */
  .notes-section {
    margin-bottom: 20px;
  }

  .notes-section h4 {
    font-size: 10pt;
    font-weight: 500;
    color: #6b7280;
    margin-bottom: 4px;
  }

  .notes-section p {
    font-size: 10pt;
    color: #374151;
    white-space: pre-wrap;
  }

  /* ── Footer ── */
  .footer {
    margin-top: auto;
    padding-top: 16px;
    border-top: 1px solid #e5e7eb;
    text-align: center;
    font-size: 8pt;
    color: #9ca3af;
  }

  @media print {
    body { padding: 0; }
    .watermark { position: fixed; }
  }

  @page {
    size: A4;
    margin: 20mm 15mm;
  }
`;
