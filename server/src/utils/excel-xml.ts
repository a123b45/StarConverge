function xmlEscape(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\r\n/g, "&#10;")
    .replace(/\n/g, "&#10;")
    .replace(/\r/g, "&#10;");
}

export function buildExcelXml(
  headers: string[],
  rows: string[][],
  sheetName = "Sheet1",
) {
  const safeSheet = xmlEscape(sheetName.slice(0, 31) || "Sheet1");
  const headerCells = headers
    .map(
      (h) =>
        `<Cell ss:StyleID="header"><Data ss:Type="String">${xmlEscape(h)}</Data></Cell>`,
    )
    .join("");
  const body = rows
    .map(
      (row) =>
        `<Row>${row
          .map(
            (cell) =>
              `<Cell ss:StyleID="wrap"><Data ss:Type="String">${xmlEscape(cell ?? "")}</Data></Cell>`,
          )
          .join("")}</Row>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="header"><Font ss:Bold="1"/></Style>
  <Style ss:ID="wrap"><Alignment ss:Vertical="Top" ss:WrapText="1"/></Style>
 </Styles>
 <Worksheet ss:Name="${safeSheet}">
  <Table>
   <Row>${headerCells}</Row>
   ${body}
  </Table>
 </Worksheet>
</Workbook>`;
}
