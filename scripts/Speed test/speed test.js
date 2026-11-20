!INC Local Scripts.EAConstants-JScript

function main() {
    // Asegurarse de tener habilitada la consola de salida
    Repository.EnsureOutputVisible("Script");
    Repository.ClearOutput("Script");

    // Verificar que el usuario seleccionó un paquete en el Project Browser
    var treeSelectedType = Repository.GetTreeSelectedItemType();
    if (treeSelectedType !== otPackage) {
        Session.Prompt("Por favor, selecciona un Paquete en el Project Browser antes de ejecutar el script.", promptOK);
        return;
    }

    var parentPackage = Repository.GetTreeSelectedObject();
    
    // Función auxiliar para formatear el tiempo
    function formatTime(ms) {
        var mins = Math.floor(ms / 60000);
        var secs = Math.floor((ms % 60000) / 1000);
        var millis = ms % 1000;
        return mins + " min, " + secs + " seg, " + millis + " ms";
    }

    var t0 = new Date().getTime();
    Session.Output("--- INICIO DEL TEST DE VELOCIDAD ---");
    Session.Output("Hora de inicio: " + new Date().toLocaleTimeString());

    // PASO 1: Crea un paquete hijo "Speed test"
    Session.Output("Paso 1: Creando paquete 'Speed test'...");
    var speedTestPkg = parentPackage.Packages.AddNew("Speed test", "");
    speedTestPkg.Update();
    parentPackage.Packages.Refresh();
    var t1 = new Date().getTime();
    Session.Output(" -> Completado en: " + (t1 - t0) + " ms");

    // PASO 2: Crea 100 elementos de tipo Class
    Session.Output("Paso 2: Creando 100 elementos (Element_001 a Element_100)...");
    var elementsList = [];
    for (var i = 1; i <= 100; i++) {
        var numStr = (i < 10) ? "00" + i : ((i < 100) ? "0" + i : i.toString());
        var newElement = speedTestPkg.Elements.AddNew("Element_" + numStr, "Class");
        newElement.Update();
        elementsList.push(newElement);
    }
    speedTestPkg.Elements.Refresh();
    var t2 = new Date().getTime();
    Session.Output(" -> Completado en: " + (t2 - t1) + " ms");

    // PASO 3: Crea 10 tag values por elemento
    Session.Output("Paso 3: Creando 10 Tag Values por elemento (1000 en total)...");
    for (var i = 0; i < elementsList.length; i++) {
        var currentElement = elementsList[i];
        for (var j = 1; j <= 10; j++) {
            var tagStr = (j < 10) ? "0" + j : j.toString();
            var tag = currentElement.TaggedValues.AddNew("Tag value " + tagStr, "");
            tag.Value = "Value " + tagStr;
            tag.Update();
        }
        currentElement.TaggedValues.Refresh();
    }
    var t3 = new Date().getTime();
    Session.Output(" -> Completado en: " + (t3 - t2) + " ms");

    // PASO 4: Crea el diagrama de tipo Class Diagram
    Session.Output("Paso 4: Creando diagrama de clases...");
    var classDiagram = speedTestPkg.Diagrams.AddNew("Speed test Diagram", "Class");
    classDiagram.Update();
    speedTestPkg.Diagrams.Refresh();
    var t4 = new Date().getTime();
    Session.Output(" -> Completado en: " + (t4 - t3) + " ms");

    // PASO 5: Inserta los objetos en el diagrama en un grid de 10x10
    Session.Output("Paso 5: Insertando 100 elementos en el diagrama (grid 10x10)...");
    var width = 100;
    var height = 50;
    var margin = 20;
    
    for (var i = 0; i < 100; i++) {
        var row = Math.floor(i / 10);
        var col = i % 10;
        
        // Coordenadas top y bottom suelen ser negativas en EA
        var left = 50 + col * (width + margin);
        var top = -(50 + row * (height + margin));
        var right = left + width;
        var bottom = top - height; 
        
        var positionStr = "l=" + left + ";r=" + right + ";t=" + top + ";b=" + bottom + ";";
        
        var diagObj = classDiagram.DiagramObjects.AddNew(positionStr, "");
        diagObj.ElementID = elementsList[i].ElementID;
        diagObj.Update();
    }
    classDiagram.DiagramObjects.Refresh();
    var t5 = new Date().getTime();
    Session.Output(" -> Completado en: " + (t5 - t4) + " ms");

    // PASO 6: Crea 99 conectores (del Element_001 a los demás)
    Session.Output("Paso 6: Creando 99 conectores desde el Element_001...");
    var element001 = elementsList[0];
    for (var i = 1; i < 100; i++) {
        var connector = element001.Connectors.AddNew("", "Association");
        connector.SupplierID = elementsList[i].ElementID;
        connector.Update();
    }
    element001.Connectors.Refresh();
    var t6 = new Date().getTime();
    Session.Output(" -> Completado en: " + (t6 - t5) + " ms");

    // PASO 7: Refrescar y abrir el diagrama
    Session.Output("Paso 7: Refrescando y abriendo el diagrama...");
    Repository.ReloadDiagram(classDiagram.DiagramID);
    Repository.OpenDiagram(classDiagram.DiagramID);
    var t7 = new Date().getTime();
    Session.Output(" -> Completado en: " + (t7 - t6) + " ms");

    // PASO 8: Elimina los objetos del browser en orden
    Session.Output("Paso 8: Eliminando los 100 objetos del modelo (Project Browser)...");
    // Al eliminar desde una colección por índice, se recomienda hacerlo desde atrás hacia adelante
    // para evitar que los índices se desplacen y queden elementos huérfanos.
    for (var i = speedTestPkg.Elements.Count - 1; i >= 0; i--) {
        speedTestPkg.Elements.Delete(i);
    }
    speedTestPkg.Elements.Refresh();
    var t8 = new Date().getTime();
    Session.Output(" -> Completado en: " + (t8 - t7) + " ms");

    // FINAL: Resumen de tiempo
    var totalTimeMs = t8 - t0;
    Session.Output("--- FIN DEL TEST ---");
    Session.Output("Hora de fin: " + new Date().toLocaleTimeString());
    Session.Output("TIEMPO TOTAL DEL PROCESO: " + formatTime(totalTimeMs));
    
    // Notificamos al usuario visualmente (opcional, pero útil)
    Session.Prompt("Proceso finalizado. Tiempo total: " + formatTime(totalTimeMs), promptOK);
}

// Ejecutar el script
main();