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

// UTILIDAD PARA REGISTRAR EN LA BITÁCORA INALTERABLE (Audit Log permanente)
function logAudit(accion, detalle) {
  try {
    const tz = Session.getScriptTimeZone();
    const fechaHora = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy HH:mm:ss");
    const bSheet = getOrCreateSheet("Bitacora Inalterable", ["FECHA Y HORA", "ACCION", "DETALLE"]);
    bSheet.appendRow([fechaHora, accion, detalle]);
  } catch(e) {}
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

  // 1. Historial de Ventas (Tickets)
  const hSheet = getOrCreateSheet("Historial", ["ID VENTA", "FECHA", "PRODUCTO", "CANTIDAD", "SUBTOTAL", "ID TURNO"]);
  const hData = hSheet.getDataRange().getDisplayValues();
  let historial = [];
  
  if(hData.length > 1) {
     hData.shift();
     historial = hData.map(row => {
       return {
         id: row[0],
         fecha: row[1],
         producto: row[2],
         cantidad: row[3],
         subtotal: row[4],
         idTurno: row[5] || ""
       };
     });
  }

  // 2. Cierres Diarios y Paquetes de Turnos
  const cSheet = getOrCreateSheet("Cierres Diarios", ["ID TURNO", "FECHA APERTURA", "FECHA CIERRE", "ESTADO", "ITEMS VENDIDOS", "TOTAL DINERO"]);
  const cData = cSheet.getDataRange().getDisplayValues();
  let turnos = [];
  if (cData.length > 1) {
    cData.shift();
    turnos = cData.map(row => ({
      idTurno: row[0],
      fechaApertura: row[1],
      fechaCierre: row[2],
      estado: row[3] || "CERRADO",
      items: row[4],
      total: row[5]
    }));
  }

  // 3. Bitácora Inalterable de Auditoría
  const bSheet = getOrCreateSheet("Bitacora Inalterable", ["FECHA Y HORA", "ACCION", "DETALLE"]);
  const bData = bSheet.getDataRange().getDisplayValues();
  let bitacora = [];
  if (bData.length > 1) {
    bData.shift();
    bitacora = bData.map(row => ({
      fecha: row[0],
      accion: row[1],
      detalle: row[2]
    }));
  }

  // 4. Fiados (Cuentas por cobrar)
  const fSheet = getOrCreateSheet("Fiados", ["ID FIADO", "FECHA", "CLIENTE", "PRODUCTOS / DETALLE", "TOTAL", "ESTADO"]);
  const fData = fSheet.getDataRange().getDisplayValues();
  let fiados = [];
  if (fData.length > 1) {
    fData.shift();
    fiados = fData.map(row => ({
      id: row[0],
      fecha: row[1],
      cliente: row[2],
      detalle: row[3],
      total: row[4],
      estado: row[5] || "PENDIENTE"
    }));
  }

  // Reloj y Estado del Servidor
  const tz = Session.getScriptTimeZone();
  const serverHour = parseInt(Utilities.formatDate(new Date(), tz, "H"));
  const todayStr = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy");
  
  // Estado manual del turno
  const storeState = PropertiesService.getScriptProperties().getProperty("storeState") || "CLOSED";
  const activeShiftId = PropertiesService.getScriptProperties().getProperty("activeShiftId") || "";
  const lastStateTime = PropertiesService.getScriptProperties().getProperty("lastStateTime") || "";

  const result = {
    inventario: inventario,
    historial: historial.reverse(),
    cierres: turnos.reverse(),
    turnos: turnos,
    bitacora: bitacora.reverse(),
    fiados: fiados.reverse(),
    clock: { 
      hour: serverHour, 
      today: todayStr, 
      state: storeState, 
      activeShiftId: activeShiftId, 
      lastStateTime: lastStateTime 
    }
  };
  
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const p = JSON.parse(e.postData.contents);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  
  // 1. CREAR UN PRODUCTO
  if (p.action === "crear") {
    sheet.appendRow([p.producto, p.costo, p.venta, p.stockInicial]);
    logAudit("CREACION_PRODUCTO", "Producto '" + p.producto + "' creado con Costo: $" + p.costo + ", Venta: $" + p.venta + ", Stock: " + p.stockInicial);
    return ContentService.createTextOutput("Creado").setMimeType(ContentService.MimeType.TEXT);
  }

  // 2. CREAR MASIVO
  if (p.action === "crear_masivo") {
    if (p.items && Array.isArray(p.items)) {
      for (let i = 0; i < p.items.length; i++) {
        let item = p.items[i];
        sheet.appendRow([
          item.producto || "",
          item.costo || 0,
          item.venta || 0,
          item.stock || 0
        ]);
      }
      logAudit("CARGA_MASIVA", "Se cargaron " + p.items.length + " productos de forma masiva.");
    }
    return ContentService.createTextOutput("Masivo OK (" + (p.items ? p.items.length : 0) + " productos)").setMimeType(ContentService.MimeType.TEXT);
  }

  // 3. ELIMINAR PRODUCTO
  if (p.action === "eliminar") {
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == p.producto) {
        sheet.deleteRow(i + 1);
        logAudit("ELIMINACION_PRODUCTO", "Producto '" + p.producto + "' eliminado del sistema.");
        return ContentService.createTextOutput("Eliminado").setMimeType(ContentService.MimeType.TEXT);
      }
    }
    return ContentService.createTextOutput("No encontrado").setMimeType(ContentService.MimeType.TEXT);
  }
  
  // 4. GESTIONAR STOCK
  if (p.action === "gestionar_stock") {
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == p.producto) {
        let anterior = data[i][3] || 0;
        sheet.getRange(i + 1, 4).setValue(p.nuevoStock);
        logAudit("CAMBIO_STOCK", "Producto '" + p.producto + "' stock cambiado de " + anterior + " a " + p.nuevoStock);
        return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
      }
    }
  }

  // 5. EDITAR PRODUCTO / PRECIOS
  if (p.action === "editar_precio" || p.action === "editar_producto") {
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == p.producto) {
        let anteriorNombre = data[i][0];
        let anteriorCosto = data[i][1] || 0;
        let anteriorVenta = data[i][2] || 0;
        
        let nuevoNombre = p.nuevoNombre || p.producto;
        sheet.getRange(i + 1, 1).setValue(nuevoNombre);
        sheet.getRange(i + 1, 2).setValue(p.nuevoCosto);
        sheet.getRange(i + 1, 3).setValue(p.nuevoVenta);
        
        logAudit("EDICION_PRODUCTO", "Producto '" + anteriorNombre + "' modificado a '" + nuevoNombre + "' - Costo: $" + anteriorCosto + "->" + p.nuevoCosto + ", Venta: $" + anteriorVenta + "->" + p.nuevoVenta);
        return ContentService.createTextOutput("Edicion OK").setMimeType(ContentService.MimeType.TEXT);
      }
    }
    return ContentService.createTextOutput("No encontrado").setMimeType(ContentService.MimeType.TEXT);
  }

  // 6. CHECKOUT (Venta en Turno Activo)
  if (p.action === "checkout") {
    let historialSheet = getOrCreateSheet("Historial", ["ID VENTA", "FECHA", "PRODUCTO", "CANTIDAD", "SUBTOTAL", "ID TURNO"]);
    const ventaId = new Date().getTime().toString(36).toUpperCase(); 
    const activeShiftId = PropertiesService.getScriptProperties().getProperty("activeShiftId") || "TURNO-LIBRE";
    const tz = Session.getScriptTimeZone();
    const fecha = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy HH:mm:ss");
    let totalVenta = 0;
    
    for (let j = 0; j < p.items.length; j++) {
      let item = p.items[j];
      totalVenta += parseFloat(item.subtotal || 0);
      
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] == item.producto) {
           let actual = data[i][3] || 0;
           sheet.getRange(i + 1, 4).setValue(actual - item.qty);
           break;
        }
      }
      historialSheet.appendRow([ventaId, fecha, item.producto, item.qty, item.subtotal, activeShiftId]);
    }
    logAudit("VENTA_REGISTRADA", "Ticket " + ventaId + " (Turno: " + activeShiftId + ") procesado por $" + totalVenta + " (" + p.items.length + " items)");
    return ContentService.createTextOutput("Checkout OK").setMimeType(ContentService.MimeType.TEXT);
  }

  // 7. REVERTIR VENTA
  if (p.action === "revertir_venta") {
    let historialSheet = getOrCreateSheet("Historial");
    const hData = historialSheet.getDataRange().getValues();
    let rowsToDelete = [];
    let productosDevueltos = [];
    
    for (let i = hData.length - 1; i >= 1; i--) {
       if (hData[i][0] == p.ventaId) {
          let prod = hData[i][2];
          let cant = hData[i][3];
          let sub = hData[i][4];
          productosDevueltos.push(cant + "x " + prod + " ($" + sub + ")");
          
          for (let rowInv = 1; rowInv < data.length; rowInv++) {
             if (data[rowInv][0] == prod) {
                let actual = data[rowInv][3] || 0;
                sheet.getRange(rowInv + 1, 4).setValue(actual + cant);
                break;
             }
          }
          rowsToDelete.push(i + 1);
       }
    }
    
    for(let r of rowsToDelete) {
       historialSheet.deleteRow(r);
    }
    logAudit("REVERSION_VENTA", "Ticket " + p.ventaId + " ANULADO Y REVERTIDO. Items devueltos a stock: " + productosDevueltos.join(", "));
    return ContentService.createTextOutput("Revertido").setMimeType(ContentService.MimeType.TEXT);
  }

  // 8. APERTURA DE CAJA (CREACIÓN DE PAQUETE DE TURNO)
  if (p.action === "abrir_caja") {
    const tz = Session.getScriptTimeZone();
    const fechaHora = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy HH:mm:ss");
    const dateCode = Utilities.formatDate(new Date(), tz, "yyyyMMdd-HHmm");
    const newShiftId = "TRN-" + dateCode;
    
    PropertiesService.getScriptProperties().setProperty("storeState", "OPEN");
    PropertiesService.getScriptProperties().setProperty("activeShiftId", newShiftId);
    PropertiesService.getScriptProperties().setProperty("lastStateTime", fechaHora);
    
    let cierresSheet = getOrCreateSheet("Cierres Diarios", ["ID TURNO", "FECHA APERTURA", "FECHA CIERRE", "ESTADO", "ITEMS VENDIDOS", "TOTAL DINERO"]);
    cierresSheet.appendRow([newShiftId, fechaHora, "-", "ABIERTO", 0, 0]);
    
    logAudit("APERTURA_CAJA", "Jornada/Turno " + newShiftId + " ABIERTO el " + fechaHora);
    return ContentService.createTextOutput("Apertura Abierta").setMimeType(ContentService.MimeType.TEXT);
  }

  // 9. CIERRE DE CAJA (FINALIZACIÓN DE PAQUETE DE TURNO)
  if (p.action === "cierre_caja") {
    const tz = Session.getScriptTimeZone();
    const fechaHora = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy HH:mm:ss");
    const activeShiftId = PropertiesService.getScriptProperties().getProperty("activeShiftId") || "";
    
    let historialSheet = getOrCreateSheet("Historial", ["ID VENTA", "FECHA", "PRODUCTO", "CANTIDAD", "SUBTOTAL", "ID TURNO"]);
    let cierresSheet = getOrCreateSheet("Cierres Diarios", ["ID TURNO", "FECHA APERTURA", "FECHA CIERRE", "ESTADO", "ITEMS VENDIDOS", "TOTAL DINERO"]);
    
    const hData = historialSheet.getDataRange().getValues();
    const cData = cierresSheet.getDataRange().getValues();
    
    let totalVentasTurno = 0;
    let itemsVendidosTurno = 0;
    let cantTicketsTurno = 0;
    
    // Sumar las ventas asociadas a este turno específico
    for(let i = 1; i < hData.length; i++) {
        let turnoFila = hData[i][5] ? hData[i][5].toString() : "";
        if (turnoFila === activeShiftId || (!activeShiftId && hData[i][1].toString().includes(Utilities.formatDate(new Date(), tz, "dd/MM/yyyy")))) {
            cantTicketsTurno++;
            itemsVendidosTurno += parseInt(hData[i][3] || 0);
            totalVentasTurno += parseFloat(hData[i][4] || 0);
        }
    }
    
    // Buscar la fila del turno abierto en Cierres Diarios y actualizarla
    let turnoEncontrado = false;
    for (let c = cData.length - 1; c >= 1; c--) {
        if (cData[c][0] === activeShiftId || cData[c][3] === "ABIERTO") {
            cierresSheet.getRange(c + 1, 3).setValue(fechaHora); // FECHA CIERRE
            cierresSheet.getRange(c + 1, 4).setValue("CERRADO"); // ESTADO
            cierresSheet.getRange(c + 1, 5).setValue(itemsVendidosTurno);
            cierresSheet.getRange(c + 1, 6).setValue(totalVentasTurno);
            turnoEncontrado = true;
            break;
        }
    }
    
    // Si no existía la fila previa, se registra completa
    if (!turnoEncontrado) {
        cierresSheet.appendRow([activeShiftId || "TRN-MANUAL", fechaHora, fechaHora, "CERRADO", itemsVendidosTurno, totalVentasTurno]);
    }
    
    PropertiesService.getScriptProperties().setProperty("storeState", "CLOSED");
    PropertiesService.getScriptProperties().setProperty("activeShiftId", "");
    PropertiesService.getScriptProperties().setProperty("lastStateTime", fechaHora);
    
    logAudit("CIERRE_CAJA", "Turno " + activeShiftId + " CERRADO el " + fechaHora + ". Venta: $" + totalVentasTurno + " (" + itemsVendidosTurno + " items en " + cantTicketsTurno + " tickets).");
    return ContentService.createTextOutput("Cierre OK").setMimeType(ContentService.MimeType.TEXT);
  }

  // 10. REGISTRAR FIADO
  if (p.action === "crear_fiado") {
    const fSheet = getOrCreateSheet("Fiados", ["ID FIADO", "FECHA", "CLIENTE", "PRODUCTOS / DETALLE", "TOTAL", "ESTADO"]);
    const fiadoId = "F-" + new Date().getTime().toString(36).toUpperCase();
    const activeShiftId = PropertiesService.getScriptProperties().getProperty("activeShiftId") || "TURNO-LIBRE";
    const tz = Session.getScriptTimeZone();
    const fecha = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy HH:mm:ss");
    
    if (p.items && Array.isArray(p.items)) {
      for (let j = 0; j < p.items.length; j++) {
        let item = p.items[j];
        for (let i = 1; i < data.length; i++) {
          if (data[i][0] == item.producto) {
             let actual = data[i][3] || 0;
             sheet.getRange(i + 1, 4).setValue(actual - item.qty);
             break;
          }
        }
      }
    }
    
    fSheet.appendRow([fiadoId, fecha, p.cliente, p.detalle, p.total, "PENDIENTE"]);
    logAudit("FIADO_CREADO", "Fiado registrado a '" + p.cliente + "' por un total de $" + p.total + " (ID: " + fiadoId + ", Turno: " + activeShiftId + ")");
    return ContentService.createTextOutput("Fiado OK").setMimeType(ContentService.MimeType.TEXT);
  }

  // 11. PAGAR FIADO
  if (p.action === "pagar_fiado") {
    const fSheet = getOrCreateSheet("Fiados");
    const fData = fSheet.getDataRange().getValues();
    const activeShiftId = PropertiesService.getScriptProperties().getProperty("activeShiftId") || "TURNO-LIBRE";
    const tz = Session.getScriptTimeZone();
    const fechaPago = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy HH:mm:ss");

    for (let i = 1; i < fData.length; i++) {
      if (fData[i][0] == p.fiadoId) {
        fSheet.getRange(i + 1, 6).setValue("PAGADO");
        
        const hSheet = getOrCreateSheet("Historial", ["ID VENTA", "FECHA", "PRODUCTO", "CANTIDAD", "SUBTOTAL", "ID TURNO"]);
        hSheet.appendRow(["PAGOF-" + p.fiadoId, fechaPago, "[PAGO DEUDA] " + fData[i][2], 1, fData[i][4], activeShiftId]);

        logAudit("FIADO_PAGADO", "Deuda de '" + fData[i][2] + "' de $" + fData[i][4] + " fue COBRADA Y PAGADA.");
        return ContentService.createTextOutput("Fiado Pagado").setMimeType(ContentService.MimeType.TEXT);
      }
    }
    return ContentService.createTextOutput("Fiado no encontrado").setMimeType(ContentService.MimeType.TEXT);
  }

  // 12. ELIMINAR FIADO
  if (p.action === "eliminar_fiado") {
    const fSheet = getOrCreateSheet("Fiados");
    const fData = fSheet.getDataRange().getValues();
    for (let i = 1; i < fData.length; i++) {
      if (fData[i][0] == p.fiadoId) {
        fSheet.deleteRow(i + 1);
        logAudit("FIADO_ELIMINADO", "Fiado ID " + p.fiadoId + " fue eliminado.");
        return ContentService.createTextOutput("Fiado Eliminado").setMimeType(ContentService.MimeType.TEXT);
      }
    }
  }
}
