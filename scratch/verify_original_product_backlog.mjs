import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const originalPath = "C:/Users/alpev/OneDrive/Desktop/EnvialoMexico/Plan_UAT_Scrumban.xlsx";
const input = await FileBlob.load(originalPath);
const workbook = await SpreadsheetFile.importXlsx(input);
const sheets = await workbook.inspect({ kind: "sheet", include: "id,name", maxChars: 4000 });
console.log(sheets.ndjson);
const table = await workbook.inspect({
  kind: "table",
  range: "Product Backlog!A1:L8",
  include: "values",
  tableMaxRows: 8,
  tableMaxCols: 12,
  maxChars: 5000,
});
console.log(table.ndjson);
