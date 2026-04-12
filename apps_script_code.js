const SHEET_NAME = "Añadiendo Precios y Calculando Ganancias";

// UTILIDAD PARA ASEGURAR QUE LAS PESTAÑAS EXISTEN
function getOrCreateSheet(sheetName, headers = []) {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    if (headers.length > 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    }
  }
  return sheet;
}

function doGet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if(!sheet) return ContentService.createTextOutput("Error: Hoja principal no existe").setMimeType(ContentService.MimeType.TEXT);

  const data = sheet.getDataRange().getDisplayValues();
  const headers = data.shift() || [];
  
  const inventario = data.map(row => {
    let obj = {};
    headers.forEach((header, i) => obj[header] = row[i]);
    return obj;
  });

  // Aseguramos que existe el Historial para leerlo (lo crea vacío si no)
  const hSheet = getOrCreateSheet("Historial", ["ID VENTA", "FECHA", "PRODUCTO", "CANTIDAD", "SUBTOTAL"]);
  const hData = hSheet.getDataRange().getDisplayValues();
  let historial = [];
  
  if(hData.length > 1) { // Hay datos además del encabezado
     hData.shift(); // Quitar encabezado
     historial = hData.map(row => {
       return {
         id: row[0],
         fecha: row[1],
         producto: row[2],
         cantidad: row[3],
         subtotal: row[4]
       };
     });
  }

  // Reloj y Estado del Servidor
  const tz = Session.getScriptTimeZone();
  const serverHour = parseInt(Utilities.formatDate(new Date(), tz, "H"));
  const todayStr = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy");
  
  // Estado manual de la tienda
  const storeState = PropertiesService.getScriptProperties().getProperty("storeState") || "CLOSED";

  const result = {
    inventario: inventario,
    historial: historial.reverse(), // Para mostrar lo más reciente arriba
    clock: { hour: serverHour, today: todayStr, state: storeState }
  };
  
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const p = JSON.parse(e.postData.contents);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  
  if (p.action === "crear") {
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
    return ContentService.createTextOutput("No encontrado").setMimeType(ContentService.MimeType.TEXT);
  }
  
  if (p.action === "gestionar_stock") {
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == p.producto) {
        sheet.getRange(i + 1, 4).setValue(p.nuevoStock);
        return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
      }
    }
  }

  // 4. CHECKOUT (Carrito de Ventas masivo)
  if (p.action === "checkout") {
    let historialSheet = getOrCreateSheet("Historial", ["ID VENTA", "FECHA", "PRODUCTO", "CANTIDAD", "SUBTOTAL"]);
    const ventaId = new Date().getTime().toString(36).toUpperCase(); 
    
    const tz = Session.getScriptTimeZone();
    const fecha = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy HH:mm:ss");
    
    // p.items = [{producto, qty, precio, subtotal}, ...]
    for (let j = 0; j < p.items.length; j++) {
      let item = p.items[j];
      
      // Restar stock principal
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] == item.producto) {
           let actual = data[i][3] || 0;
           sheet.getRange(i + 1, 4).setValue(actual - item.qty);
           break;
        }
      }
      
      // Grabar en Historial
      historialSheet.appendRow([ventaId, fecha, item.producto, item.qty, item.subtotal]);
    }
    return ContentService.createTextOutput("Checkout OK").setMimeType(ContentService.MimeType.TEXT);
  }

  // 5. REVERTIR VENTA
  if (p.action === "revertir_venta") {
    let historialSheet = getOrCreateSheet("Historial");
    const hData = historialSheet.getDataRange().getValues();
    let rowsToDelete = [];
    
    // Escanear el historial desde el final para no descuadrar los índices
    for (let i = hData.length - 1; i >= 1; i--) {
       if (hData[i][0] == p.ventaId) {
          let prod = hData[i][2];
          let cant = hData[i][3];
          
          // Devolver el stock
          for (let rowInv = 1; rowInv < data.length; rowInv++) {
             if (data[rowInv][0] == prod) {
                let actual = data[rowInv][3] || 0;
                sheet.getRange(rowInv + 1, 4).setValue(actual + cant);
                break;
             }
          }
          rowsToDelete.push(i + 1); // 1-based index
       }
    }
    
    for(let r of rowsToDelete) {
       historialSheet.deleteRow(r);
    }
    return ContentService.createTextOutput("Revertido").setMimeType(ContentService.MimeType.TEXT);
  }

  // 6. APERTURA DE CAJA
  if (p.action === "abrir_caja") {
    PropertiesService.getScriptProperties().setProperty("storeState", "OPEN");
    
    let cierresSheet = getOrCreateSheet("Cierres Diarios", ["FECHA", "DESCRIPCIÓN", "ITEMS VENDIDOS", "TOTAL DINERO"]);
    const tz = Session.getScriptTimeZone();
    
    cierresSheet.appendRow([
       Utilities.formatDate(new Date(), tz, "dd/MM/yyyy HH:mm:ss"),
       "Apertura de Caja (Inicio de Turno)",
       "-",
       "-"
    ]);
    
    return ContentService.createTextOutput("Apertura Abierta").setMimeType(ContentService.MimeType.TEXT);
  }

  // 7. CIERRE DE CAJA
  if (p.action === "cierre_caja") {
    PropertiesService.getScriptProperties().setProperty("storeState", "CLOSED");
    
    let historialSheet = getOrCreateSheet("Historial", ["ID VENTA", "FECHA", "PRODUCTO", "CANTIDAD", "SUBTOTAL"]);
    let cierresSheet = getOrCreateSheet("Cierres Diarios", ["FECHA", "DESCRIPCIÓN", "ITEMS VENDIDOS", "TOTAL DINERO"]);
    
    const hData = historialSheet.getDataRange().getValues();
    const tz = Session.getScriptTimeZone();
    const todayStr = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy");
    
    let totalVentasHoy = 0;
    let cantTickets = 0;
    let itemsVendidos = 0;
    
    for(let i = 1; i < hData.length; i++) {
        let fechaFila = hData[i][1].toString();
        if (fechaFila.includes(todayStr) || fechaFila.includes(todayStr.substring(0, 10))) {
            cantTickets++;
            itemsVendidos += parseInt(hData[i][3] || 0);
            totalVentasHoy += parseFloat(hData[i][4] || 0);
        }
    }
    
    cierresSheet.appendRow([
       Utilities.formatDate(new Date(), tz, "dd/MM/yyyy HH:mm:ss"),
       "Cierre Z-Out Final de Día",
       itemsVendidos,
       totalVentasHoy
    ]);
    
    return ContentService.createTextOutput("Cierre OK").setMimeType(ContentService.MimeType.TEXT);
  }
}
