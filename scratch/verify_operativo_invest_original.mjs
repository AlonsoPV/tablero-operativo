import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const input = await FileBlob.load("C:/Users/alpev/OneDrive/Desktop/EnvialoMexico/Plan_UAT_Scrumban.xlsx");
const workbook = await SpreadsheetFile.importXlsx(input);
const table = await workbook.inspect({
  kind: "table",
  range: "Product Backlog!A1:L10",
  include: "values",
  tableMaxRows: 10,
  tableMaxCols: 12,
  maxChars: 7000,
});
console.log(table.ndjson);
const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);
