import ExcelJS from "exceljs";

export class ExcelFormatter {
  static autoFitColumns(sheet: ExcelJS.Worksheet) {
    sheet.columns?.forEach((col) => {
      if (!col) return;
      let max = 10;
      col.eachCell?.({ includeEmpty: true }, (cell) => {
        const len = cell.value ? cell.value.toString().length : 0;
        max = Math.max(max, len + 2);
      });
      col.width = max;
    });
  }

  static wrapTextAll(sheet: ExcelJS.Worksheet) {
    sheet.eachRow((row) =>
      row.eachCell((cell) => {
        cell.alignment = { wrapText: true, vertical: "top" };
      })
    );
  }

  static formatSheet(sheet: ExcelJS.Worksheet) {
    this.autoFitColumns(sheet);
    this.wrapTextAll(sheet);
  }
}
