import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const input = await FileBlob.load("C:/Users/alpev/OneDrive/Desktop/EnvialoMexico/Plan_UAT_Scrumban_Backlog_Discovery_Areas.xlsx");
const workbook = await SpreadsheetFile.importXlsx(input);
const sheets = await workbook.inspect({ kind: "sheet", include: "id,name", maxChars: 4000 });
console.log(sheets.ndjson);
const table = await workbook.inspect({
  kind: "table",
  range: "Backlog Discovery Areas!A1:L8",
  include: "values",
  tableMaxRows: 8,
  tableMaxCols: 12,
  maxChars: 6000,
});
console.log(table.ndjson);
