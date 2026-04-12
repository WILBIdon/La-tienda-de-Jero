const SHEET_NAME = "Añadiendo Precios y Calculando Ganancias";

function doGet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getDisplayValues();
  const headers = data.shift();
  
  const json = data.map(row => {
    let obj = {};
    headers.forEach((header, i) => obj[header] = row[i]);
    return obj;
  });
  
  return ContentService.createTextOutput(JSON.stringify(json))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const p = JSON.parse(e.postData.contents);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  
  if (p.action === "crear") {
    // Append a new row ensuring the proper columns:
    // Columna A: Producto | B: P. Compra (Costo) | C: P. Venta | D: Stock
    sheet.appendRow([p.producto, p.costo, p.venta, p.stockInicial]);
    return ContentService.createTextOutput("Creado").setMimeType(ContentService.MimeType.TEXT);
  }

  if (p.action === "eliminar") {
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == p.producto) {
        sheet.deleteRow(i + 1);
        return ContentService.createTextOutput("Eliminado").setMimeType(ContentService.MimeType.TEXT);
      }
    }
    return ContentService.createTextOutput("Producto no encontrado para eliminar").setMimeType(ContentService.MimeType.TEXT);
  }
  
  // Si la acción no es crear (es 'actualizar' o la estructura antigua)
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == p.producto) {       // Columna A: Producto
      sheet.getRange(i + 1, 4).setValue(p.nuevoStock); // Columna D: Stock
      return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
    }
  }
  
  return ContentService.createTextOutput("Producto no encontrado").setMimeType(ContentService.MimeType.TEXT);
}
