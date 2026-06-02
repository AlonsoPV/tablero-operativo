import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const path = "C:/Users/alpev/OneDrive/tablero-operativo/outputs/uat_analistas/Plan_UAT_Analista_Pantallas_Especificas.xlsx";
const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(path));

console.log((await wb.inspect({
  kind: "workbook,sheet,table",
  maxChars: 6000,
  tableMaxRows: 5,
  tableMaxCols: 6,
})).ndjson);

console.log((await wb.inspect({
  kind: "table",
  range: "UAT!A1:M12",
  include: "values,formulas",
  tableMaxRows: 12,
  tableMaxCols: 13,
})).ndjson);

console.log((await wb.inspect({
  kind: "table",
  range: "Criterios por modulo!A1:J8",
  include: "values,formulas",
  tableMaxRows: 8,
  tableMaxCols: 10,
})).ndjson);

console.log((await wb.inspect({
  kind: "match",
  searchTerm: "Sprint|sprint",
  options: { useRegex: true, maxResults: 50 },
  summary: "scope exclusion scan",
})).ndjson);

console.log((await wb.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "formula error scan",
})).ndjson);
