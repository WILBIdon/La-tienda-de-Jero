const SHEET_NAME = "Añadiendo Precios y Calculando Ganancias";

function doGet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getDisplayValues();
  const headers = data.shift();
  
  const inventario = data.map(row => {
    let obj = {};
    headers.forEach((header, i) => obj[header] = row[i]);
    return obj;
  });

  let historial = [];
  const hSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Historial");
  if (hSheet) {
    const hData = hSheet.getDataRange().getDisplayValues();
    if(hData.length > 1) { // Hay datos además del encabezado
       hData.shift(); // Quitar encabezado
       // Columnas esperadas: A:ID, B:Fecha, C:Producto, D:Cantidad, E:Monto
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
  }

  // Reloj del Servidor (Antitrampas)
  const tz = Session.getScriptTimeZone();
  const serverHour = parseInt(Utilities.formatDate(new Date(), tz, "H"));
  const todayStr = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy");

  const result = {
    inventario: inventario,
    historial: historial.reverse(), // Para mostrar lo más reciente arriba
    clock: { hour: serverHour, today: todayStr }
  };
  
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const p = JSON.parse(e.postData.contents);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  
  // 1. CREAR PRODUCTO
  if (p.action === "crear") {
    sheet.appendRow([p.producto, p.costo, p.venta, p.stockInicial]);
    return ContentService.createTextOutput("Creado").setMimeType(ContentService.MimeType.TEXT);
  }

  // 2. ELIMINAR PRODUCTO DEL INVENTARIO
  if (p.action === "eliminar") {
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == p.producto) {
        sheet.deleteRow(i + 1);
        return ContentService.createTextOutput("Eliminado").setMimeType(ContentService.MimeType.TEXT);
      }
    }
    return ContentService.createTextOutput("No encontrado").setMimeType(ContentService.MimeType.TEXT);
  }
  
  // 3. GESTION MANUAL DE STOCK (Carga o Disminución sin venta)
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
    let historialSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Historial");
    const ventaId = new Date().getTime().toString(36).toUpperCase(); 
    const fecha = new Date().toLocaleString("es-CO");
    
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
      if (historialSheet) {
         historialSheet.appendRow([ventaId, fecha, item.producto, item.qty, item.subtotal]);
      }
    }
    return ContentService.createTextOutput("Checkout OK").setMimeType(ContentService.MimeType.TEXT);
  }

  // 5. REVERTIR VENTA
  if (p.action === "revertir_venta") {
    let historialSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Historial");
    if(!historialSheet) return ContentService.createTextOutput("Error").setMimeType(ContentService.MimeType.TEXT);

    const hData = historialSheet.getDataRange().getValues();
    let rowsToDelete = [];
    
    // Escaner el historial desde el final para no descuadrar los índices al borrar
    for (let i = hData.length - 1; i >= 1; i--) {
       if (hData[i][0] == p.ventaId) {
          let prod = hData[i][2];
          let cant = hData[i][3];
          
          // Devolver el stock a la hoja principal
          for (let rowInv = 1; rowInv < data.length; rowInv++) {
             if (data[rowInv][0] == prod) {
                let actual = data[rowInv][3] || 0;
                sheet.getRange(rowInv + 1, 4).setValue(actual + cant);
                break; // Break the inner loop, keep scanning the history
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

  // 6. CIERRE DE CAJA
  if (p.action === "cierre_caja") {
    let historialSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Historial");
    let cierresSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Cierres Diarios");
    
    if(!historialSheet || !cierresSheet) {
        return ContentService.createTextOutput("Faltan pestañas").setMimeType(ContentService.MimeType.TEXT);
    }
    
    const hData = historialSheet.getDataRange().getValues();
    const tz = Session.getScriptTimeZone();
    const todayStr = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy");
    
    let totalVentasHoy = 0;
    let cantTickets = 0;
    let itemsVendidos = 0;
    
    for(let i = 1; i < hData.length; i++) {
        // Asumiendo Fecha en columna B (index 1) formateada como string, Ej "12/4/2026, 12:30:00"
        let fechaFila = hData[i][1].toString();
        // Criterio muy simple: revisamos si trae la misma fecha (dd/MM/yyyy)
        // Para asegurar formato sin horas, tomamos solo la parte alfanumerica
        if (fechaFila.includes(todayStr) || fechaFila.includes(todayStr.substring(0, 10))) {
            cantTickets++;
            itemsVendidos += parseInt(hData[i][3] || 0); // columna D: cantidad
            totalVentasHoy += parseFloat(hData[i][4] || 0); // columna E: subtotal
        }
    }
    
    // Anexar informe
    cierresSheet.appendRow([
       Utilities.formatDate(new Date(), tz, "dd/MM/yyyy HH:mm:ss"),
       "Cierre Automático Día",
       itemsVendidos,
       totalVentasHoy
    ]);
    
    return ContentService.createTextOutput("Cierre OK").setMimeType(ContentService.MimeType.TEXT);
  }
}
