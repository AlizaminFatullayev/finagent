import ExcelJS from 'exceljs';
import { rng } from '../src/domain/analysis/testData.js';

/**
 * SYNTHETIC bank transactions for demos and smoke tests. Every name, IBAN, card, FIN and phone
 * is randomly generated; card numbers use the 4000 test prefix. Planted anomalies: extreme outliers,
 * exact duplicates, structuring just below 10,000 AZN, and an off-hours burst.
 */
export async function buildSampleWorkbook(rows = 3_000): Promise<Buffer> {
  const random = rng(2026);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(random() * xs.length)]!;
  const digits = (n: number) => Array.from({ length: n }, () => Math.floor(random() * 10)).join('');

  const first = [
    'Aysel',
    'Rashad',
    'Leyla',
    'Elvin',
    'Nigar',
    'Tural',
    'Gunay',
    'Kamran',
    'Sevinj',
    'Orkhan',
    'Aynur',
    'Farid',
  ];
  const last = ['Synthova', 'Testzade', 'Demoyev', 'Samplova', 'Mockov', 'Fakeli', 'Exampleyev', 'Dummyova'];
  const banks = ['NABZ', 'AIIB', 'CAPN', 'PAHA'];

  // ISO 13616 check digits so the masking detectors treat these as valid IBANs.
  const iban = () => {
    const bban = `${pick(banks)}${digits(20)}`;
    const numeric = `${bban}AZ00`.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
    let r = 0;
    for (const d of numeric) r = (r * 10 + Number(d)) % 97;
    return `AZ${String(98 - r).padStart(2, '0')}${bban}`;
  };
  const card = () => {
    const body = `4000${digits(11)}`;
    let sum = 0;
    for (let i = 0; i < body.length; i++) {
      let d = Number(body[body.length - 1 - i]);
      if (i % 2 === 0) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
      sum += d;
    }
    return `${body}${(10 - (sum % 10)) % 10}`;
  };
  const fin = () => {
    const chars = 'ABCDEFGHJKLMNPRSTUVXYZ';
    return `${digits(1)}${pick([...chars])}${pick([...chars])}${digits(2)}${pick([...chars])}${digits(1)}`;
  };

  const customers = Array.from({ length: 150 }, () => ({
    name: `${pick(first)} ${pick(last)}`,
    fin: fin(),
    iban: iban(),
    card: card(),
    phone: `+994 ${pick(['50', '55', '70', '77'])} ${digits(3)} ${digits(2)} ${digits(2)}`,
    branch: pick(['Baku-Center', 'Baku-Nasimi', 'Ganja', 'Sumgait', 'Lankaran']),
  }));

  // Business-hours weekday timestamp in Q1 2026, as wall-clock time.
  const businessTime = () => {
    for (;;) {
      const d = new Date(
        Date.UTC(
          2026,
          0,
          1 + Math.floor(random() * 90),
          9 + Math.floor(random() * 9),
          Math.floor(random() * 60),
        ),
      );
      if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) return d;
    }
  };
  // Log-uniform amounts follow Benford's law like real payments.
  // Retail-sized amounts (10 to ~8,000 AZN), so the large and near-threshold planted rows stand out.
  const amount = () => Math.round(10 ** (1 + random() * 2.9) * 100) / 100;

  type Txn = [string, Date, string, string, string, string, string, number, string, string, string];
  const txns: Txn[] = [];
  const add = (c: (typeof customers)[number], at: Date, value: number, note = '') =>
    txns.push([
      `TX${String(100000 + txns.length)}`,
      at,
      c.name,
      c.fin,
      c.iban,
      c.card,
      c.phone,
      value,
      pick(['Branch', 'Mobile', 'Online', 'ATM']),
      c.branch,
      note,
    ]);

  for (let i = 0; i < rows; i++) add(pick(customers), businessTime(), amount());

  // Planted: extreme outliers.
  for (const v of [480_000, 615_250.5, 1_250_000]) add(pick(customers), businessTime(), v, 'Large transfer');
  // Planted: structuring - one customer splits payments just under the 10,000 AZN threshold.
  const structurer = customers[7]!;
  for (let i = 0; i < 18; i++)
    add(structurer, businessTime(), Math.round((9_200 + random() * 790) * 100) / 100, 'Cash deposit');
  // Planted: off-hours burst - 8 transfers between 02:00 and 02:50 on one night.
  const night = customers[11]!;
  for (let i = 0; i < 8; i++)
    add(night, new Date(Date.UTC(2026, 1, 11, 2, i * 7)), amount(), 'Online transfer');
  // Planted: exact duplicates (double posting).
  for (let i = 0; i < 6; i++) txns.push([...txns[100 + i]!] as Txn);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'FinAgent sample generator (synthetic data)';
  const ws = wb.addWorksheet('Transactions');
  // A title row above the header exercises header detection.
  ws.addRow(['SYNTHETIC DATA - generated for FinAgent demos. No real customers, accounts or cards.']);
  ws.mergeCells('A1:K1');
  ws.addRow([]);
  ws.addRow([
    'Txn ID',
    'Date',
    'Customer',
    'FIN',
    'IBAN',
    'Card Number',
    'Phone',
    'Amount (AZN)',
    'Channel',
    'Branch',
    'Note',
  ]);
  for (const t of txns) ws.addRow(t);
  ws.getColumn(2).numFmt = 'yyyy-mm-dd hh:mm';

  const cs = wb.addWorksheet('Customers');
  cs.addRow(['Customer', 'FIN', 'Phone', 'Branch', 'Credit limit (AZN)']);
  for (const c of customers)
    cs.addRow([c.name, c.fin, c.phone, c.branch, Math.round(1_000 + random() * 49_000)]);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
