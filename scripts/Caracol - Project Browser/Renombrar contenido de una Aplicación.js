//!OPTION COUNT = 1

/*
 * Script Name: Renombrar Estructura de Aplicación
 * Author: EA Automation
 * Description: Valida el estereotipo "Aplicación" del paquete seleccionado y renombra
 *              recursivamente subpaquetes y diagramas al formato "Nombre original - Nombre de la Aplicación".
 */

// Constantes para Session.Prompt en Enterprise Architect
var promptOK = 1;
var promptYESNO = 3;
var resultYes = 1; // EA devuelve 1 al presionar "Yes" u "OK"
var resultNo = 2;  // EA devuelve 2 al presionar "No"

function OnProjectBrowserScript() {
    var appPackage = Repository.GetTreeSelectedPackage();

    if (!appPackage) {
        Session.Prompt("No se pudo obtener el paquete seleccionado.", promptOK);
        return;
    }

    // Validar únicamente que el estereotipo del paquete seleccionado sea "Aplicación"
    var stereotype = appPackage.Element ? appPackage.Element.Stereotype : "";
    var stereotypeEx = appPackage.StereotypeEx || "";

    if (stereotype !== "Aplicación" && stereotypeEx.indexOf("Aplicación") === -1) {
        Session.Prompt("El paquete seleccionado '" + appPackage.Name + "' no posee el estereotipo 'Aplicación'.", promptOK);
        return;
    }

    var appName = appPackage.Name;

    // 1. Confirmar ejecución con el usuario (promptYESNO = 3)
    var confirmExecute = Session.Prompt(
        "¿Desea ejecutar el renombrado sobre la aplicación '" + appName + "'?\n\n" +
        "Esta acción renombrará todos los subpaquetes y diagramas internos al formato:\n" +
        "'Nombre original - " + appName + "'\n\n" +
        "Los elementos, notas, títulos y conectores NO serán modificados.",
        promptYESNO
    );


    Session.Output(">>> Iniciando renombrado para la aplicación: " + appName);

    // 2. Ejecutar renombrado recursivo de diagramas y subpaquetes
    var totalModified = processPackage(appPackage, appName);

    // Refresh visual
    Repository.RefreshModelView(appPackage.PackageID);
    
    Session.Output(">>> Proceso completado. Elementos renombrados: " + totalModified);
    Session.Prompt("Proceso finalizado con éxito.\nSe actualizaron " + totalModified + " elementos.", promptOK);
}

function processPackage(parentPackage, appName) {
    var count = 0;
    var suffix = " - " + appName;

    // Renombrar Diagramas
    for (var i = 0; i < parentPackage.Diagrams.Count; i++) {
        var diagram = parentPackage.Diagrams.GetAt(i);
        if (!endsWith(diagram.Name, suffix)) {
            diagram.Name = diagram.Name + suffix;
            diagram.Update();
            count++;
            Session.Output("Diagrama renombrado: " + diagram.Name);
        }
    }

    // Renombrar Subpaquetes recursivamente
    for (var j = 0; j < parentPackage.Packages.Count; j++) {
        var subPackage = parentPackage.Packages.GetAt(j);

        if (!endsWith(subPackage.Name, suffix)) {
            subPackage.Name = subPackage.Name + suffix;
            subPackage.Update();
            count++;
            Session.Output("Paquete renombrado: " + subPackage.Name);
        }

        count += processPackage(subPackage, appName);
    }

    return count;
}

function endsWith(str, suffix) {
    if (!str || !suffix) return false;
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
}

OnProjectBrowserScript();