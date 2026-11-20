!INC Local Scripts.EAConstants-JScript

/*
 * Script Name : Reporte Avance Aplicaciones
 * Tipo        : Normal (JScript)
 * Cliente     : Caracol (repositorio CRCL)
 * Autor       : Arquesoft
 *
 * Propósito:
 *   Recorre las aplicaciones (paquetes con estereotipo «Aplicación») de
 *   Proyectos/En curso y evalúa, sección por sección, si ya están modeladas
 *   o documentadas. Las secciones se toman de la plantilla
 *   Proyectos/Plantillas/Aplicación, de modo que si la plantilla cambia el
 *   reporte se ajusta solo.
 *
 *   Genera un Excel en el escritorio del usuario con tres hojas:
 *     - Avance    : una fila por aplicación, una columna por sección y el % de avance
 *     - Resumen   : cumplimiento por sección (con gráfico) y conteo por estado
 *     - Detalle   : los datos medidos en cada sección (diagramas, objetos, palabras)
 *
 * Criterios de evaluación (por sección):
 *   - Sección de DIAGRAMA (en la plantilla trae un diagrama):
 *       ✔ Hecha     -> al menos un diagrama de la sección tiene objetos
 *       ◐ Pendiente -> el paquete existe pero sus diagramas están vacíos
 *   - Sección de DOCUMENTO (en la plantilla no trae diagrama):
 *       ✔ Hecha     -> el documento enlazado o las notas del paquete tienen texto
 *                      propio (MIN_PALABRAS_NUEVAS palabras que no están en la
 *                      plantilla), o imágenes nuevas, o un diagrama con objetos
 *       ◐ Pendiente -> el paquete existe pero sigue con el texto de la plantilla
 *   - ✖ No existe   -> la aplicación no tiene el paquete de esa sección
 *
 *   % Avance = secciones hechas / total de secciones de la plantilla
 *   No se evalúan las secciones de SECCIONES_EXCLUIDAS (Funcionalidades y
 *   Consideraciones especiales), aunque existan en la plantilla.
 *   Responsable = tagged value "Propietario Técnico Principal" de la aplicación.
 */

// ---------------------------------------------------------------- Configuración
var RUTA_EN_CURSO   = ["Proyectos", "En curso"];
var RUTA_PLANTILLA  = ["Proyectos", "Plantillas", "Aplicación"];
var ESTEREOTIPO_APP = "Aplicación";
var ESTEREOTIPOS_SECCION_EXCLUIDOS = ["master document"];   // Generación de Documento - Manual Técnico
var SECCIONES_EXCLUIDAS = ["Funcionalidades", "Consideraciones especiales"];   // no hacen parte del avance
var TAG_RESPONSABLE = "Propietario Técnico Principal";
var SIN_RESPONSABLE = "(sin asignar)";
var MIN_PALABRAS_NUEVAS = 8;
var NOMBRE_ARCHIVO  = "Avance_Aplicaciones_Caracol";

var ST_NO = 0, ST_PEND = 1, ST_OK = 2;
var SIMBOLO = ["✖", "◐", "✔"];
var TEXTO_ESTADO = ["No existe", "Pendiente", "Hecha"];

// ---------------------------------------------------------------- Utilidades
function rgb(r, g, b) { return r + g * 256 + b * 65536; }

function norm(s) {
	s = ("" + (s == null ? "" : s)).toLowerCase();
	s = s.replace(/[áàäâ]/g, "a").replace(/[éèëê]/g, "e").replace(/[íìïî]/g, "i")
	     .replace(/[óòöô]/g, "o").replace(/[úùüû]/g, "u").replace(/ñ/g, "n");
	return s.replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
}

function pad2(n) { return (n < 10 ? "0" : "") + n; }

function log(msg) { Session.Output(msg); }

function hijosOrdenados(pkg) {
	var arr = [];
	for (var i = 0; i < pkg.Packages.Count; i++) arr.push(pkg.Packages.GetAt(i));
	arr.sort(function (a, b) {
		if (a.TreePos != b.TreePos) return a.TreePos - b.TreePos;
		return norm(a.Name) < norm(b.Name) ? -1 : 1;
	});
	return arr;
}

function buscarPorRuta(ruta) {
	var actual = null;
	for (var m = 0; m < Repository.Models.Count; m++) {
		var mod = Repository.Models.GetAt(m);
		if (norm(mod.Name) == norm(ruta[0])) { actual = mod; break; }
	}
	for (var i = 1; actual != null && i < ruta.length; i++) {
		var sig = null;
		for (var j = 0; j < actual.Packages.Count; j++) {
			var p = actual.Packages.GetAt(j);
			if (norm(p.Name) == norm(ruta[i])) { sig = p; break; }
		}
		actual = sig;
	}
	return actual;
}

function tieneEstereotipo(pkg, st) {
	var el = pkg.Element;
	if (el == null) return false;
	var lista = ((el.StereotypeEx || "") + "," + (el.Stereotype || "")).split(",");
	for (var i = 0; i < lista.length; i++) {
		var s = lista[i];
		if (s.indexOf("::") >= 0) s = s.substr(s.lastIndexOf("::") + 2);
		if (norm(s) == norm(st)) return true;
	}
	return false;
}

function esSeccionExcluida(pkg) {
	for (var i = 0; i < ESTEREOTIPOS_SECCION_EXCLUIDOS.length; i++)
		if (tieneEstereotipo(pkg, ESTEREOTIPOS_SECCION_EXCLUIDOS[i])) return true;
	var nn = norm(pkg.Name);
	for (var j = 0; j < SECCIONES_EXCLUIDAS.length; j++) {
		var ex = norm(SECCIONES_EXCLUIDAS[j]);
		if (nn == ex || nn.indexOf(ex + " -") == 0 || nn.indexOf(ex + "-") == 0) return true;
	}
	return false;
}

// Valor del tagged value del responsable en el elemento de la aplicación
function leerResponsable(appPkg) {
	var el = appPkg.Element;
	if (el == null) return SIN_RESPONSABLE;
	for (var i = 0; i < el.TaggedValues.Count; i++) {
		var tv = el.TaggedValues.GetAt(i);
		if (norm(tv.Name) == norm(TAG_RESPONSABLE)) {
			var v = ("" + (tv.Value == null ? "" : tv.Value)).replace(/^\s+|\s+$/g, "");
			return v ? v : SIN_RESPONSABLE;
		}
	}
	return SIN_RESPONSABLE;
}

// Cuenta diagramas, objetos en diagramas y elementos (recursivo)
function medir(pkg, acc) {
	if (!acc) acc = { diagramas: 0, objetos: 0, elementos: 0 };
	for (var d = 0; d < pkg.Diagrams.Count; d++) {
		var dia = pkg.Diagrams.GetAt(d);
		acc.diagramas++;
		acc.objetos += dia.DiagramObjects.Count;
	}
	acc.elementos += pkg.Elements.Count;
	for (var i = 0; i < pkg.Packages.Count; i++) medir(pkg.Packages.GetAt(i), acc);
	return acc;
}

// Convierte RTF a texto plano (suficiente para comparar contenido)
var DESTINOS_IGNORADOS = {
	fonttbl: 1, colortbl: 1, stylesheet: 1, info: 1, pict: 1, object: 1, header: 1,
	footer: 1, headerl: 1, headerr: 1, footerl: 1, footerr: 1, listtable: 1,
	listoverridetable: 1, themedata: 1, colorschememapping: 1, datastore: 1,
	latentstyles: 1, rsidtbl: 1, generator: 1, xmlnstbl: 1, mmathpr: 1, shppict: 1,
	nonshppict: 1, fldinst: 1, bkmkstart: 1, bkmkend: 1, revtbl: 1, pgdsctbl: 1
};

function rtfATexto(rtf) {
	if (!rtf) return "";
	var out = [], pila = [], salta = false, i = 0, n = rtf.length, ucSkip = 0;
	while (i < n) {
		var c = rtf.charAt(i);
		if (c == "{") {
			pila.push(salta);
			var m = /^\{\\(\*)?\\?([a-zA-Z]+)/.exec(rtf.substr(i, 40));
			if (m && (m[1] || DESTINOS_IGNORADOS[m[2].toLowerCase()])) salta = true;
			i++;
		} else if (c == "}") {
			salta = pila.length ? pila.pop() : false;
			i++;
		} else if (c == "\\") {
			var sig = rtf.charAt(i + 1);
			if (sig == "\\" || sig == "{" || sig == "}") {
				if (!salta) out.push(sig);
				i += 2;
			} else if (sig == "'") {
				if (!salta) out.push(String.fromCharCode(parseInt(rtf.substr(i + 2, 2), 16)));
				i += 4;
			} else if (/[a-zA-Z]/.test(sig)) {
				var mw = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(rtf.substr(i, 40));
				var palabra = mw[1], num = mw[2];
				i += mw[0].length;
				if (!salta) {
					if (palabra == "par" || palabra == "line" || palabra == "row") out.push("\n");
					else if (palabra == "tab" || palabra == "cell") out.push(" ");
					else if (palabra == "u" && num != null) {
						var code = parseInt(num, 10);
						if (code < 0) code += 65536;
						out.push(String.fromCharCode(code));
						if (rtf.charAt(i) == "?") i++;
					}
				}
			} else {
				i += 2;
			}
		} else {
			if (!salta && c != "\r" && c != "\n") out.push(c);
			i++;
		}
	}
	return out.join("");
}

function leerDocumento(pkg) {
	var res = { texto: "", imagen: false };
	var el = pkg.Element;
	if (el == null) return res;
	var rtf = "";
	try { rtf = el.GetLinkedDocument(); } catch (e) { rtf = ""; }
	if (rtf) {
		res.imagen = rtf.indexOf("\\pict") >= 0;
		res.texto = rtfATexto(rtf);
	}
	var notas = "";
	try { notas = Repository.GetFormatFromField("TXT", pkg.Notes); } catch (e2) { notas = pkg.Notes; }
	res.texto += " " + notas;
	return res;
}

function conjuntoPalabras(texto, conjunto) {
	if (!conjunto) conjunto = {};
	var arr = norm(texto).split(/[^a-z0-9]+/);
	for (var i = 0; i < arr.length; i++) if (arr[i].length >= 3) conjunto[arr[i]] = 1;
	return conjunto;
}

function palabrasNuevas(texto, base, extra) {
	var vistas = {}, n = 0;
	var arr = norm(texto).split(/[^a-z0-9]+/);
	for (var i = 0; i < arr.length; i++) {
		var w = arr[i];
		if (w.length < 3 || vistas[w] || base[w] || extra[w]) continue;
		vistas[w] = 1; n++;
	}
	return n;
}

function buscarSeccion(appPkg, seccion) {
	var hijos = appPkg.Packages;
	for (var i = 0; i < hijos.Count; i++) {
		var p = hijos.GetAt(i);
		var nn = norm(p.Name);
		if (nn == seccion.clave || nn.indexOf(seccion.clave + " -") == 0 || nn.indexOf(seccion.clave + "-") == 0)
			return p;
	}
	return null;
}

// ---------------------------------------------------------------- Lectura del modelo
function leerPlantilla(pkgPlantilla) {
	var secciones = [];
	var hijos = hijosOrdenados(pkgPlantilla);
	for (var i = 0; i < hijos.length; i++) {
		var p = hijos[i];
		if (esSeccionExcluida(p)) continue;
		var med = medir(p);
		var doc = leerDocumento(p);
		var base = conjuntoPalabras(doc.texto);
		conjuntoPalabras(p.Name, base);
		secciones.push({
			nombre: p.Name,
			clave: norm(p.Name),
			tipo: med.diagramas > 0 ? "Diagrama" : "Documento",
			base: base,
			imagenPlantilla: doc.imagen,
			hechas: 0, pendientes: 0, faltantes: 0
		});
	}
	return secciones;
}

function evaluarAplicacion(appPkg, secciones, detalle) {
	var fila = { nombre: appPkg.Name, responsable: leerResponsable(appPkg), estados: [], hechas: 0, pct: 0 };
	var extra = conjuntoPalabras(appPkg.Name);
	for (var s = 0; s < secciones.length; s++) {
		var sec = secciones[s];
		var pkg = buscarSeccion(appPkg, sec);
		var st, med = { diagramas: 0, objetos: 0, elementos: 0 }, nuevas = 0;
		if (pkg == null) {
			st = ST_NO;
		} else {
			med = medir(pkg);
			var ok;
			if (sec.tipo == "Diagrama") {
				ok = med.objetos > 0;
			} else {
				var doc = leerDocumento(pkg);
				nuevas = palabrasNuevas(doc.texto, sec.base, extra);
				ok = nuevas >= MIN_PALABRAS_NUEVAS || (doc.imagen && !sec.imagenPlantilla) || med.objetos > 0;
			}
			st = ok ? ST_OK : ST_PEND;
		}
		if (st == ST_OK) { fila.hechas++; sec.hechas++; }
		else if (st == ST_PEND) sec.pendientes++;
		else sec.faltantes++;
		fila.estados.push(st);
		detalle.push([appPkg.Name, sec.nombre, sec.tipo, pkg ? pkg.Name : "(no existe)",
			med.diagramas, med.objetos, med.elementos,
			sec.tipo == "Documento" && pkg ? nuevas : "", TEXTO_ESTADO[st]]);
	}
	fila.pct = secciones.length ? fila.hechas / secciones.length : 0;
	fila.estado = fila.pct >= 1 ? "Finalizado" : (fila.hechas == 0 ? "Sin iniciar" : "En proceso");
	return fila;
}

// ---------------------------------------------------------------- Excel
var C_TITULO   = rgb(31, 56, 100);
var C_ENCAB    = rgb(47, 84, 150);
var C_BORDE    = rgb(191, 191, 191);
var C_ZEBRA    = rgb(242, 246, 252);
var FILL_ST    = [rgb(255, 199, 206), rgb(255, 235, 156), rgb(198, 239, 206)];
var FONT_ST    = [rgb(156, 0, 6),     rgb(156, 87, 0),    rgb(0, 97, 0)];

function colorPct(p) {
	if (p >= 1)    return [rgb(0, 176, 80),    rgb(255, 255, 255)];
	if (p >= 0.75) return [rgb(146, 208, 80),  rgb(0, 0, 0)];
	if (p >= 0.5)  return [rgb(255, 235, 156), rgb(0, 0, 0)];
	if (p >= 0.25) return [rgb(248, 203, 173), rgb(0, 0, 0)];
	return [rgb(255, 124, 128), rgb(0, 0, 0)];
}

function colorEstado(e) {
	if (e == "Finalizado") return [FILL_ST[2], FONT_ST[2]];
	if (e == "En proceso") return [FILL_ST[1], FONT_ST[1]];
	return [FILL_ST[0], FONT_ST[0]];
}

function rango(ws, r1, c1, r2, c2) { return ws.Range(ws.Cells(r1, c1), ws.Cells(r2, c2)); }

function pintar(r, fondo, letra, negrita) {
	r.Interior.Color = fondo;
	if (letra != null) r.Font.Color = letra;
	if (negrita) r.Font.Bold = true;
}

function bordes(r) {
	r.Borders.LineStyle = 1;
	r.Borders.Weight = 2;
	r.Borders.Color = C_BORDE;
}

function titulo(ws, texto, subtitulo, ncols) {
	ws.Cells(1, 1).Value = texto;
	var t = rango(ws, 1, 1, 1, ncols);
	t.Merge();
	t.Font.Size = 16;
	t.RowHeight = 30;
	t.VerticalAlignment = -4108;
	pintar(t, C_TITULO, rgb(255, 255, 255), true);
	ws.Cells(2, 1).Value = subtitulo;
	var s = rango(ws, 2, 1, 2, ncols);
	s.Merge();
	s.Font.Italic = true;
	s.Font.Color = rgb(89, 89, 89);
}

function encabezado(r) {
	pintar(r, C_ENCAB, rgb(255, 255, 255), true);
	r.WrapText = true;
	r.HorizontalAlignment = -4108;
	r.VerticalAlignment = -4108;
	bordes(r);
}

function hojaAvance(ws, filas, secciones, subt) {
	ws.Name = "Avance";
	var nSec = secciones.length;
	var cIni = 5, cHechas = cIni + nSec, cPct = cHechas + 1, ncols = cPct;
	titulo(ws, "Avance de documentación de aplicaciones – Caracol", subt, ncols);

	var rH = 4;
	ws.Cells(rH, 1).Value = "#";
	ws.Cells(rH, 2).Value = "Aplicación";
	ws.Cells(rH, 3).Value = "Responsable";
	ws.Cells(rH, 4).Value = "Estado";
	for (var s = 0; s < nSec; s++) ws.Cells(rH, cIni + s).Value = secciones[s].nombre;
	ws.Cells(rH, cHechas).Value = "Secciones hechas (de " + nSec + ")";
	ws.Cells(rH, cPct).Value = "% Avance";
	encabezado(rango(ws, rH, 1, rH, ncols));
	ws.Rows(rH).RowHeight = 62;
	// Tipo de sección bajo el encabezado
	ws.Cells(rH + 1, 2).Value = "Tipo de sección →";
	for (var s2 = 0; s2 < nSec; s2++) ws.Cells(rH + 1, cIni + s2).Value = secciones[s2].tipo;
	var rt = rango(ws, rH + 1, 1, rH + 1, ncols);
	pintar(rt, rgb(217, 225, 242), rgb(47, 84, 150), false);
	rt.Font.Italic = true;
	rt.Font.Size = 9;
	rt.HorizontalAlignment = -4108;
	ws.Cells(rH + 1, 2).HorizontalAlignment = -4152;
	bordes(rt);

	var r0 = rH + 2;
	for (var i = 0; i < filas.length; i++) {
		var f = filas[i], r = r0 + i;
		ws.Cells(r, 1).Value = i + 1;
		ws.Cells(r, 2).Value = f.nombre;
		ws.Cells(r, 3).Value = f.responsable;
		ws.Cells(r, 4).Value = f.estado;
		var ce = colorEstado(f.estado);
		pintar(ws.Cells(r, 4), ce[0], ce[1], true);
		if (i % 2 == 1) pintar(rango(ws, r, 1, r, 3), C_ZEBRA, null, false);
		for (var s3 = 0; s3 < nSec; s3++) {
			var st = f.estados[s3], cel = ws.Cells(r, cIni + s3);
			cel.Value = SIMBOLO[st];
			pintar(cel, FILL_ST[st], FONT_ST[st], true);
		}
		ws.Cells(r, cHechas).NumberFormat = "@";
		ws.Cells(r, cHechas).Value = "'" + f.hechas + " de " + nSec;
		var cp = ws.Cells(r, cPct);
		cp.Value = f.pct;
		var cc = colorPct(f.pct);
		pintar(cp, cc[0], cc[1], true);
	}
	var rUlt = r0 + filas.length - 1;
	if (filas.length > 0) {
		var cuerpo = rango(ws, r0, 1, rUlt, ncols);
		bordes(cuerpo);
		cuerpo.VerticalAlignment = -4108;
		rango(ws, r0, 4, rUlt, ncols).HorizontalAlignment = -4108;
		rango(ws, r0, cIni, rUlt, cIni + nSec - 1).Font.Size = 13;
		rango(ws, r0, cPct, rUlt, cPct).NumberFormat = "0%";
		ws.Cells(r0, 1).Resize(filas.length, 1).HorizontalAlignment = -4108;

		// Promedio general
		var rp = rUlt + 1;
		ws.Cells(rp, 2).Value = "Promedio general";
		ws.Cells(rp, cPct).Formula = "=AVERAGE(" + rango(ws, r0, cPct, rUlt, cPct).Address(false, false) + ")";
		ws.Cells(rp, cPct).NumberFormat = "0%";
		var rpr = rango(ws, rp, 1, rp, ncols);
		pintar(rpr, rgb(217, 225, 242), C_TITULO, true);
		bordes(rpr);
		ws.Cells(rp, cPct).HorizontalAlignment = -4108;
		// Fila de cumplimiento por sección
		ws.Cells(rp + 1, 2).Value = "Apps con la sección hecha";
		for (var s4 = 0; s4 < nSec; s4++) {
			var pc = filas.length ? secciones[s4].hechas / filas.length : 0;
			var cs = ws.Cells(rp + 1, cIni + s4);
			cs.Value = pc;
			cs.NumberFormat = "0%";
			var col = colorPct(pc);
			pintar(cs, col[0], col[1], true);
		}
		var rpr2 = rango(ws, rp + 1, 1, rp + 1, ncols);
		rpr2.HorizontalAlignment = -4108;
		ws.Cells(rp + 1, 2).HorizontalAlignment = -4131;
		ws.Cells(rp + 1, 2).Font.Bold = true;
		bordes(rpr2);

		// Leyenda
		var rl = rp + 3;
		ws.Cells(rl, 2).Value = "Leyenda";
		ws.Cells(rl, 2).Font.Bold = true;
		var ley = [
			[ST_OK,   "Hecha: el diagrama tiene objetos / el documento tiene contenido propio"],
			[ST_PEND, "Pendiente: el paquete existe pero está vacío o con el texto de la plantilla"],
			[ST_NO,   "No existe: la aplicación no tiene el paquete de esta sección"]
		];
		for (var k = 0; k < ley.length; k++) {
			var c1 = ws.Cells(rl + 1 + k, 4);
			c1.Value = SIMBOLO[ley[k][0]];
			c1.HorizontalAlignment = -4108;
			pintar(c1, FILL_ST[ley[k][0]], FONT_ST[ley[k][0]], true);
			ws.Cells(rl + 1 + k, 5).Value = ley[k][1];
		}
		var esc = [[1, "100%"], [0.75, "75% – 99%"], [0.5, "50% – 74%"], [0.25, "25% – 49%"], [0, "0% – 24%"]];
		ws.Cells(rl + 5, 2).Value = "% Avance";
		ws.Cells(rl + 5, 2).Font.Bold = true;
		for (var e = 0; e < esc.length; e++) {
			var c2 = ws.Cells(rl + 6 + e, 4);
			var ccol = colorPct(esc[e][0]);
			c2.Value = esc[e][1];
			c2.HorizontalAlignment = -4108;
			pintar(c2, ccol[0], ccol[1], true);
		}
	}

	ws.Columns(1).ColumnWidth = 5;
	ws.Columns(2).ColumnWidth = 34;
	ws.Columns(3).ColumnWidth = 22;
	ws.Columns(4).ColumnWidth = 13;
	for (var s5 = 0; s5 < nSec; s5++) ws.Columns(cIni + s5).ColumnWidth = 13;
	ws.Columns(cHechas).ColumnWidth = 13;
	ws.Columns(cPct).ColumnWidth = 11;
	try { rango(ws, rH, 1, rUlt, ncols).AutoFilter(); } catch (eAF) {}
	return { filaEncab: rH + 1 };
}

function hojaResumen(excel, ws, filas, secciones, subt) {
	ws.Name = "Resumen";
	titulo(ws, "Resumen por sección", subt, 6);
	var rH = 4;
	var enc = ["Sección", "Tipo", "Hecha", "Pendiente", "No existe", "% de apps con la sección hecha"];
	for (var i = 0; i < enc.length; i++) ws.Cells(rH, i + 1).Value = enc[i];
	encabezado(rango(ws, rH, 1, rH, 6));
	ws.Rows(rH).RowHeight = 32;
	var n = filas.length;
	for (var s = 0; s < secciones.length; s++) {
		var sec = secciones[s], r = rH + 1 + s;
		ws.Cells(r, 1).Value = sec.nombre;
		ws.Cells(r, 2).Value = sec.tipo;
		ws.Cells(r, 3).Value = sec.hechas;
		ws.Cells(r, 4).Value = sec.pendientes;
		ws.Cells(r, 5).Value = sec.faltantes;
		var pc = n ? sec.hechas / n : 0;
		ws.Cells(r, 6).Value = pc;
		ws.Cells(r, 6).NumberFormat = "0%";
		var col = colorPct(pc);
		pintar(ws.Cells(r, 6), col[0], col[1], true);
		if (s % 2 == 1) pintar(rango(ws, r, 1, r, 2), C_ZEBRA, null, false);
	}
	var rU = rH + secciones.length;
	bordes(rango(ws, rH + 1, 1, rU, 6));
	rango(ws, rH + 1, 2, rU, 6).HorizontalAlignment = -4108;
	pintar(rango(ws, rH + 1, 3, rU, 3), FILL_ST[2], FONT_ST[2], false);
	pintar(rango(ws, rH + 1, 4, rU, 4), FILL_ST[1], FONT_ST[1], false);
	pintar(rango(ws, rH + 1, 5, rU, 5), FILL_ST[0], FONT_ST[0], false);

	// Conteo por estado de aplicación
	var rE = rU + 2;
	ws.Cells(rE, 1).Value = "Estado de las aplicaciones";
	ws.Cells(rE, 2).Value = "Cantidad";
	encabezado(rango(ws, rE, 1, rE, 2));
	var estados = ["Finalizado", "En proceso", "Sin iniciar"];
	for (var e = 0; e < estados.length; e++) {
		var cnt = 0;
		for (var f = 0; f < filas.length; f++) if (filas[f].estado == estados[e]) cnt++;
		ws.Cells(rE + 1 + e, 1).Value = estados[e];
		ws.Cells(rE + 1 + e, 2).Value = cnt;
		var ce = colorEstado(estados[e]);
		pintar(ws.Cells(rE + 1 + e, 1), ce[0], ce[1], true);
	}
	ws.Cells(rE + 4, 1).Value = "Total aplicaciones";
	ws.Cells(rE + 4, 2).Value = filas.length;
	ws.Cells(rE + 4, 1).Font.Bold = true;
	ws.Cells(rE + 4, 2).Font.Bold = true;
	bordes(rango(ws, rE + 1, 1, rE + 4, 2));
	rango(ws, rE + 1, 2, rE + 4, 2).HorizontalAlignment = -4108;

	ws.Columns(1).ColumnWidth = 36;
	ws.Columns(2).ColumnWidth = 12;
	ws.Columns(3).ColumnWidth = 10;
	ws.Columns(4).ColumnWidth = 11;
	ws.Columns(5).ColumnWidth = 11;
	ws.Columns(6).ColumnWidth = 18;

	// Gráfico de cumplimiento por sección
	try {
		var izq = ws.Columns(8).Left, arriba = ws.Rows(rH).Top;
		var co = ws.ChartObjects().Add(izq, arriba, 520, 22 * secciones.length + 80);
		var ch = co.Chart;
		ch.ChartType = 57; // xlBarClustered
		ch.SetSourceData(excel.Union(rango(ws, rH, 1, rU, 1), rango(ws, rH, 6, rU, 6)));
		ch.HasTitle = true;
		ch.ChartTitle.Text = "% de aplicaciones con cada sección hecha";
		ch.HasLegend = false;
		ch.Axes(1).ReversePlotOrder = true;
		ch.Axes(2).MinimumScale = 0;
		ch.Axes(2).MaximumScale = 1;
		ch.Axes(2).TickLabels.NumberFormat = "0%";
		ch.SeriesCollection(1).Format.Fill.ForeColor.RGB = C_ENCAB;
		ch.SeriesCollection(1).HasDataLabels = true;
		ch.SeriesCollection(1).DataLabels().NumberFormat = "0%";
	} catch (eCh) {
		log("  (No se pudo crear el gráfico: " + eCh.message + ")");
	}
}

function hojaDetalle(ws, detalle, subt) {
	ws.Name = "Detalle";
	var enc = ["Aplicación", "Sección", "Tipo", "Paquete en el repositorio", "Diagramas",
		"Objetos en diagramas", "Elementos", "Palabras propias en documento", "Resultado"];
	titulo(ws, "Detalle de la evaluación", subt, enc.length);
	var rH = 4;
	for (var i = 0; i < enc.length; i++) ws.Cells(rH, i + 1).Value = enc[i];
	encabezado(rango(ws, rH, 1, rH, enc.length));
	ws.Rows(rH).RowHeight = 32;
	for (var d = 0; d < detalle.length; d++) {
		var r = rH + 1 + d, fila = detalle[d];
		for (var c = 0; c < fila.length; c++) ws.Cells(r, c + 1).Value = fila[c];
		var st = fila[8] == TEXTO_ESTADO[ST_OK] ? ST_OK : (fila[8] == TEXTO_ESTADO[ST_PEND] ? ST_PEND : ST_NO);
		pintar(ws.Cells(r, 9), FILL_ST[st], FONT_ST[st], true);
	}
	if (detalle.length > 0) {
		var rU = rH + detalle.length;
		bordes(rango(ws, rH + 1, 1, rU, enc.length));
		rango(ws, rH + 1, 3, rU, 3).HorizontalAlignment = -4108;
		rango(ws, rH + 1, 5, rU, 9).HorizontalAlignment = -4108;
		try { rango(ws, rH, 1, rU, enc.length).AutoFilter(); } catch (eAF) {}
	}
	var anchos = [30, 28, 11, 52, 11, 12, 11, 14, 12];
	for (var a = 0; a < anchos.length; a++) ws.Columns(a + 1).ColumnWidth = anchos[a];
}

function congelar(excel, ws, fila, col) {
	try {
		ws.Activate();
		excel.ActiveWindow.FreezePanes = false;
		excel.ActiveWindow.SplitRow = fila;
		excel.ActiveWindow.SplitColumn = col;
		excel.ActiveWindow.FreezePanes = true;
		excel.ActiveWindow.DisplayGridlines = false;
	} catch (e) {}
}

function generarExcel(filas, secciones, detalle, ruta, subt) {
	var excel = new ActiveXObject("Excel.Application");
	excel.ScreenUpdating = false;
	excel.DisplayAlerts = false;
	var hojasAntes = excel.SheetsInNewWorkbook;
	excel.SheetsInNewWorkbook = 3;
	var wb = excel.Workbooks.Add();
	excel.SheetsInNewWorkbook = hojasAntes;

	log("Escribiendo hoja Avance...");
	var info = hojaAvance(wb.Worksheets(1), filas, secciones, subt);
	log("Escribiendo hoja Resumen...");
	hojaResumen(excel, wb.Worksheets(2), filas, secciones, subt);
	log("Escribiendo hoja Detalle...");
	hojaDetalle(wb.Worksheets(3), detalle, subt);

	excel.Visible = true;
	excel.ScreenUpdating = true;
	congelar(excel, wb.Worksheets(3), 4, 2);
	congelar(excel, wb.Worksheets(2), 4, 0);
	congelar(excel, wb.Worksheets(1), info.filaEncab, 3);
	wb.Worksheets(1).Activate();
	wb.Worksheets(1).Cells(1, 1).Select();

	wb.SaveAs(ruta, 51); // xlOpenXMLWorkbook
	excel.DisplayAlerts = true;
	return ruta;
}

// Alternativa si Excel no está instalado: archivo de texto tabulado
function generarTexto(filas, secciones, ruta) {
	var fso = new ActiveXObject("Scripting.FileSystemObject");
	var f = fso.CreateTextFile(ruta, true, true);
	var enc = ["#", "Aplicación", "Responsable", "Estado"];
	for (var s = 0; s < secciones.length; s++) enc.push(secciones[s].nombre);
	enc.push("Secciones hechas (de " + secciones.length + ")", "% Avance");
	f.WriteLine(enc.join("\t"));
	for (var i = 0; i < filas.length; i++) {
		var r = [i + 1, filas[i].nombre, filas[i].responsable, filas[i].estado];
		for (var k = 0; k < filas[i].estados.length; k++) r.push(TEXTO_ESTADO[filas[i].estados[k]]);
		r.push(filas[i].hechas + " de " + secciones.length, Math.round(filas[i].pct * 100) + "%");
		f.WriteLine(r.join("\t"));
	}
	f.Close();
	return ruta;
}

// ---------------------------------------------------------------- Principal
function main() {
	Repository.EnsureOutputVisible("Script");
	Repository.ClearOutput("Script");
	log("Reporte de avance de aplicaciones - inicio");

	var pkgEnCurso = buscarPorRuta(RUTA_EN_CURSO);
	var pkgPlantilla = buscarPorRuta(RUTA_PLANTILLA);
	if (pkgEnCurso == null) { Session.Prompt("No se encontró el paquete " + RUTA_EN_CURSO.join("/"), promptOK); return; }
	if (pkgPlantilla == null) { Session.Prompt("No se encontró la plantilla " + RUTA_PLANTILLA.join("/"), promptOK); return; }

	var secciones = leerPlantilla(pkgPlantilla);
	log("Secciones de la plantilla: " + secciones.length);
	for (var s = 0; s < secciones.length; s++) log("  - " + secciones[s].nombre + " [" + secciones[s].tipo + "]");

	var apps = [];
	for (var i = 0; i < pkgEnCurso.Packages.Count; i++) {
		var p = pkgEnCurso.Packages.GetAt(i);
		if (tieneEstereotipo(p, ESTEREOTIPO_APP)) apps.push(p);
	}
	apps.sort(function (a, b) { return norm(a.Name) < norm(b.Name) ? -1 : 1; });
	log("Aplicaciones encontradas: " + apps.length);

	var filas = [], detalle = [];
	for (var a = 0; a < apps.length; a++) {
		log("  [" + (a + 1) + "/" + apps.length + "] " + apps[a].Name);
		filas.push(evaluarAplicacion(apps[a], secciones, detalle));
	}

	var ahora = new Date();
	var fecha = pad2(ahora.getDate()) + "/" + pad2(ahora.getMonth() + 1) + "/" + ahora.getFullYear() +
		" " + pad2(ahora.getHours()) + ":" + pad2(ahora.getMinutes());
	var sello = ahora.getFullYear() + pad2(ahora.getMonth() + 1) + pad2(ahora.getDate()) + "_" +
		pad2(ahora.getHours()) + pad2(ahora.getMinutes());
	var subt = "Fuente: " + RUTA_EN_CURSO.join(" / ") + "  ·  Plantilla: " + RUTA_PLANTILLA.join(" / ") +
		"  ·  Generado: " + fecha + "  ·  Aplicaciones: " + apps.length;

	var escritorio = new ActiveXObject("WScript.Shell").SpecialFolders("Desktop");
	var base = escritorio + "\\" + NOMBRE_ARCHIVO + "_" + sello;
	var ruta;
	try {
		ruta = generarExcel(filas, secciones, detalle, base + ".xlsx", subt);
	} catch (e) {
		log("No se pudo usar Excel (" + e.message + "). Se genera archivo de texto tabulado.");
		ruta = generarTexto(filas, secciones, base + ".txt");
	}
	log("Reporte generado: " + ruta);
	log("Fin.");
}

main();