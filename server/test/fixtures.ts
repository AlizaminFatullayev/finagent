import ExcelJS from 'exceljs';

/** Builds an .xlsx in memory; each sheet is a list of rows (null = empty cell). */
export async function buildXlsx(
  sheets: Record<string, unknown[][]>,
  configure?: (wb: ExcelJS.Workbook) => void,
) {
  const wb = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = wb.addWorksheet(name);
    rows.forEach((row, i) => {
      // Write by explicit row number so fully blank rows are preserved.
      ws.getRow(i + 1).values = row as ExcelJS.CellValue[];
    });
  }
  configure?.(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/**
 * A deliberately messy workbook: a title and a blank row above the header (header on row 3),
 * a merged title cell, a blank row inside the data, a formula, and a second sheet.
 */
export async function messyWorkbook() {
  return buildXlsx(
    {
      Transactions: [
        ['Bank statement Q1 (synthetic)'],
        [],
        ['Txn ID', 'Date', 'Customer', 'Amount', 'Fee %', 'Approved'],
        [1001, new Date(Date.UTC(2024, 0, 5, 10, 30)), 'Aysel Mammadova', 1500.5, '1.5%', 'yes'],
        [1002, new Date(Date.UTC(2024, 0, 6, 23, 10)), 'Rashad Aliyev', 250, '2%', 'no'],
        [],
        [
          1003,
          new Date(Date.UTC(2024, 0, 7, 9, 0)),
          'Leyla Huseynova',
          { formula: 'D4*2', result: 3001 },
          '1%',
          'yes',
        ],
      ],
      Summary: [
        ['Metric', 'Value'],
        ['Total', 4751.5],
      ],
    },
    (wb) => wb.getWorksheet('Transactions')!.mergeCells('A1:F1'),
  );
}
