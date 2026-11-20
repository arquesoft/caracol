!INC Local Scripts.EAConstants-JScript

/*
 * Script para importar Servicios desde una matriz a un paquete en Enterprise Architect.
 * Selecciona la carpeta (Paquete) en el Project Browser antes de ejecutar.
 */

function main()
{
    // Obtener el paquete seleccionado actualmente en el Project Browser
    var currentPackage as EA.Package;
    currentPackage = Repository.GetTreeSelectedPackage();
    
    if (currentPackage == null) {
        Session.Prompt("Por favor, selecciona un Paquete en el Project Browser primero.", promptOK);
        return;
    }

    Session.Output("Iniciando creación de nodos y servicios en el paquete: " + currentPackage.Name);

    // =================================================================================
    // MATRIZ DE DATOS (Pega aquí las filas generadas por tu fórmula de Excel)
    // Formato: [Nodo, Servicio, Petición HTTP, Host server, Host ADC, Path]
    // =================================================================================
    var matrizServicios = [
['SEGURIDAD', 'AutenticaUsuario', 'POST', 'https://gamapr:7081', 'https://srviibpr:7801', '/security/api/v1/customer/authentic-security'],
['SEGURIDAD', 'CargarUsuario', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/security/api/v1/customer/load-user'],
['SEGURIDAD', 'ConsultaFuncionalidad', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/security/api/v1/customer/query-functionality'],
['SEGURIDAD', 'FuncionalidadesHijas', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/security/api/v1/customer/child-functionalities'],
['SEGURIDAD', 'PerfilesXSistema', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/security/api/v1/customer/profiles-by-system'],
['SEGURIDAD', 'PerfilesXSistemaYUsuario', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/security/api/v1/customer/profiles-by-system-and-user'],
['SEGURIDAD', 'PermisosFuncionalidadXusuario', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/security/api/v1/customer/permissions-functionality-user'],
['SEGURIDAD', 'UsuariosXPerfil', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/security/api/v1/customer/user-by-profile'],
['SEGURIDAD', 'UsuariosXSistema', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/security/api/v1/customer/user-by-system'],
['SEGURIDAD', 'FuncionalidadesMigas', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/security/api/v1/customer/functionalities-crumb'],
['SEGURIDAD', 'TipoFuncionalidadXFuncionalidad', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/security/api/v1/customer/type-functionality-by-functionality'],
['SEGURIDAD', 'PermisosGrupoXCategoriaUsuario', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/security/api/v1/customer/group-permissions-by-user-category'],
['SEGURIDAD', 'UsuarioXCedula', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/security/api/v1/customer/user-by-id'],
['SEGURIDAD', 'SeguridadAutenticaDetalle', 'POST', 'https://gamapr:7081', 'https://srviibpr:7801', '/security/api/v1/customer/authentic-security-detail'],
['SEGURIDAD', 'FuncionalidadXAyuda', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/security/api/v1/customer/functionality-by-help'],
['SEGURIDAD', 'FuncionalidadesSistemaModificadasXUsuario', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/security/api/v1/customer/system-functionalities-modified-user'],
['SEGURIDAD', 'FuncionalidadesVisiblesDeSistemaXUsuario', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/security/api/v1/customer/visible-system-functionality-user'],
['SEGURIDAD', 'IngresarLogError', 'POST', 'https://gamapr:7081', 'https://srviibpr:7801', '/security/api/v1/customer/insert-log-error'],
['CORREO', 'CargaPlantillaV1', 'POST', 'https://gamapr:7081', 'https://srviibpr:7801', '/email/api/v1/load-template/v1'],
['CORREO', 'CargaPlantillaV2', 'POST', 'https://gamapr:7081', 'https://srviibpr:7801', '/email/api/v1/load-template/v2'],
['CORREO', 'CargaPlantillaV3', 'POST', 'https://gamapr:7081', 'https://srviibpr:7801', '/email/api/v1/load-template/v3'],
['CORREO', 'CargaPlantillaV4', 'POST', 'https://gamapr:7081', 'https://srviibpr:7801', '/email/api/v1/load-template/v4'],
['CORREO', 'EnvioCorreoXPerfiles', 'POST', 'https://gamapr:7081', 'https://srviibpr:7801', '/email/api/v1/send-email/post-by-send-mail-by-profiles'],
['CORREO', 'EnvioCorreo-V2', '', '', '', ''],
['BIOMETRICOS', 'RegistrarNovedadEmpleado', 'POST', 'https://gamapr:7081', 'https://srviibpr:7801', '/biometrics/api/v1/customer/post-by-record-novelty-employee'],
['BIOMETRICOS', 'ConsultarProgramacionPermisos', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/biometrics/api/v1/customer/kairos/get-consult-program-permission'],
['BIOMETRICOS', 'ConsultarMarcacionesAprobadas', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/biometrics/api/v1/customer/kairos/get-consult-approved-tiem-entries'],
['BIOMETRICOS', 'ConsultarColaboradores', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/biometrics/api/v1/customer/kairos/get-consult-collaborators'],
['BIOMETRICOS', 'Ping', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/biometrics/api/v1/customer/kairos/get-ping'],
['TI', 'ConsultaUsuariosDominio', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/ti/api/v1/customer/get-by-domain-user'],
['TI', 'ConsultaEventoNegocio', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/ti/api/v1/customer/get-by-consult-business-event'],
['TI', 'CrearEventoNegocio', 'POST', 'https://gamapr:7081', 'https://srviibpr:7801', '/ti/api/v1/customer/post-by-create-business-event'],
['VENTAS_INTER', 'ConsultaClientes', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/international-sales/api/v1/customer/get-by-customer'],
['VENTAS_INTER', 'ConsultaContratosClientes', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/international-sales/api/v1/customer/get-by-contracts'],
['VENTAS_INTER', 'ConsultaProducciones', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/international-sales/api/v1/customer/get-by-production'],
['VENTAS_INTER', 'ConsultaProduccionesXContratoId', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/international-sales/api/v1/customer/get-by-production-contractid'],
['VENTAS_INTER', 'ConsultaTipoContrato', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/international-sales/api/v1/customer/get-by-typecontract'],
['VENTAS_INTER', 'ConsultaContratoXProduccionXContratoId', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/international-sales/api/v1/customer/get-by-contract-production-contractid'],
['VENTAS_INTER', 'ContratoVigenteXProduccionXContrato', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/international-sales/api/v1/customer/get-by-current-production-contract'],
['GESTION_TALENTO', 'Casting-ConsultaHojaVida', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/talent-management/api/v1/customer/casting/get-by-consult-cv'],
['GESTION_TALENTO', 'Casting-ConsultarActores', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/talent-management/api/v1/customer/casting/get-by-consult-actors'],
['GESTION_TALENTO', 'IndiceTalento-ActualizarIdentificacionTalento', 'PUT', 'https://gamapr:7081', 'https://srviibpr:7801', '/talent-management/api/v1/customer/talent-index/put-by-update-talent'],
['GESTION_TALENTO', 'IndiceTalento-ConsultaTalentoXcodigo', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/talent-management/api/v1/customer/talent-index/get-by-consult-talent-code'],
['GESTION_TALENTO', 'IndiceTalento-ConsultaTalentoXIdentificacion', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/talent-management/api/v1/customer/talent-index/get-by-consult-talent-id'],
['GESTION_TALENTO', 'IndiceTalento-ConsultaTalentoXNombre', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/talent-management/api/v1/customer/talent-index/get-by-consult-talent-name'],
['XCALIBUR', 'AnularAprobacionVacaciones', 'POST', 'https://gamapr:7081', 'https://srviibpr:7801', '/xcalibur/api/v1/absences/post-by-cancel-vacation-approval'],
['XCALIBUR', 'ConsultarSolicitudVacaciones', 'POST', 'https://gamapr:7081', 'https://srviibpr:7801', '/xcalibur/api/v1/absences/post-by-consult-application-vacation'],
['XCALIBUR', 'ConsultaDocumentoxTipoDocumental', 'POST', 'https://gamapr:7081', 'https://srviibpr:7801', '/xcalibur/api/v1/management-document/post-by-consult-document-by-typedocument'],
['XCALIBUR', 'CrearCertificadoLaboralPdf', 'POST', 'https://gamapr:7081', 'https://srviibpr:7801', '/xcalibur/api/v1/payroll/post-by-create-work-certificatepdf'],
['XCALIBUR', 'GenerarCertificadoLabora', 'POST', 'https://gamapr:7081', 'https://srviibpr:7801', '/xcalibur/api/v1/payroll/post-by-generate-work-certificate'],
['XCALIBUR', 'AprobacionVacaciones', 'POST', 'https://gamapr:7081', 'https://srviibpr:7801', '/xcalibur/api/v1/payroll/post-by-approval-vacation'],
['XCALIBUR', 'ConsultaCentrosCosto', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/xcalibur/api/v1/xcalibur/get-by-consult-center-cost'],
['XCALIBUR', 'ConsultaCertificadoLaboral', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/xcalibur/api/v1/xcalibur/get-by-consult-work-certificate'],
['XCALIBUR', 'ConsultaClientes', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/xcalibur/api/v1/xcalibur/get-by-consult-customer'],
['XCALIBUR', 'ConsultaCuentasContable', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/xcalibur/api/v1/xcalibur/get-by-consult-accounting-accounts'],
['XCALIBUR', 'ConsultaEmpleados', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/xcalibur/api/v1/xcalibur/get-by-consult-employee'],
['XCALIBUR', 'ConsultaMaterialesVenta', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/xcalibur/api/v1/xcalibur/get-by-consult-materials-sale'],
['XCALIBUR', 'ConsultaOrdenesInternas', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/xcalibur/api/v1/xcalibur/get-by-consult-internal-orders'],
['XCALIBUR', 'ConsultaProveedores', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/xcalibur/api/v1/xcalibur/get-by-consult-supplier'],
['XCALIBUR', 'ConsultaUbicacionesModificadas', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/xcalibur/api/v1/xcalibur/get-by-consult-modified-location'],
['XCALIBUR', 'ConsultarEmpleadoUbicacion', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/xcalibur/api/v1/xcalibur/get-by-consult-employee-location'],
['XCALIBUR', 'ComprobanteNomina', 'FileInput', '', '', '\\betaxcal\xcalibur\RecibosNomina'],
['XCALIBUR', 'ComprobanteVacaciones', 'FileInput', '', '', '\\betaxcal\xcalibur\ComprobanteVacaciones '],
['XCALIBUR', 'EnvioCorreoNotificaciones', 'FileInput', '', '', '\\betaxcal\xcalibur\EnvioCorreosBUS '],
['XCALIBUR', 'OnBase-GeneracionArchivos', 'TimeOut', '', '', ''],
['SAP', 'ConsultaCertificadoRetenciones', 'GET', 'https://gamapr:7081', 'https://srviibpr:7801', '/sap/api/v1/financial/get-consult-withholdings-certificate'],
['DAPRO', 'ReporteGrabacionDiscos', 'POST', 'https://gamapr:7081', 'https://srviibpr:7801', '/dapro/api/v1/customer/post-report-recordingdiscs'],
['XCALIBURSAPPRUBLICOS', 'ActualizarCrudMaterial', 'POST', 'https://gamapr:7081', 'https://srviibpr:7801', '/Publicos/financiera/crud-material-actualizar'],
['XCALIBURSAPPRUBLICOS', 'EliminarCrudMaterial', 'POST', 'https://gamapr:7081', 'https://srviibpr:7801', '/Publicos/financiera/crud-material-eliminar'],
['XCALIBURSAPPRUBLICOS', 'ActualizarCrudPUC', 'POST', 'https://gamapr:7081', 'https://srviibpr:7801', '/Publicos/financiera/crud-puc-actualizar'],
['XCALIBURSAPPRUBLICOS', 'EliminarCrudPUC', 'POST', 'https://gamapr:7081', 'https://srviibpr:7801', '/Publicos/financiera/crud-puc-eliminar'],
['XCALIBURSAPPRUBLICOS', 'ActualizarCrudCenCos', 'POST', 'https://gamapr:7081', 'https://srviibpr:7801', '/Publicos/financiera/crud-cencos-actualizar'],
['XCALIBURSAPPRUBLICOS', 'EliminarCrudCenCos', 'POST', 'https://gamapr:7081', 'https://srviibpr:7801', '/Publicos/financiera/crud-cencos-eliminar'],
['XCALIBURSAPPRUBLICOS', 'ActualizarCrudOinternas', 'POST', 'https://gamapr:7081', 'https://srviibpr:7801', '/Publicos/financiera/crud-ointernas-actualizar'],
['XCALIBURSAPPRUBLICOS', 'EliminarCrudOinternas', 'POST', 'https://gamapr:7081', 'https://srviibpr:7801', '/Publicos/financiera/crud-ointernas-eliminar'],
['XCALIBURSAPPRUBLICOS', 'ActualizarCrudRespuesta', 'POST', 'https://gamapr:7081', 'https://srviibpr:7801', '/Publicos/financiera/respuesta-actualizar'],
['XCALIBURSAPPRUBLICOS', 'ActualizarCrudProveedores', 'POST', 'https://gamapr:7081', 'https://srviibpr:7801', '/Publicos/financiera/crud-proveedores-actualizar'],
['XCALIBURSAPPRUBLICOS', 'EliminarCrudProveedores', 'POST', 'https://gamapr:7081', 'https://srviibpr:7801', '/Publicos/financiera/crud-proveedores-eliminar'],
['XCALIBURSAPPRUBLICOS', 'ActualizarCrudClientes', 'POST', 'https://gamapr:7081', 'https://srviibpr:7801', '/Publicos/financiera/crud-clientes-actualizar'],
['XCALIBURSAPPRUBLICOS', 'EliminarCrudClientes', 'POST', 'https://gamapr:7081', 'https://srviibpr:7801', '/Publicos/financiera/crud-clientes-eliminar'],
['XCALIBURSAPPRUBLICOS', 'ConviaRecibirRespuestaAnticipos', 'POST', 'https://gamapr:7081', 'https://srviibpr:7801', '/Publicos/financiera/convia/recibir-respuesta-anticipos'],
['XCALIBURSAPPRUBLICOS', 'SigoRecibirRespuestaMigo', 'POST', 'https://gamapr:7081', 'https://srviibpr:7801', '/Publicos/financiera/sigo/recibir-respuesta-migo'],
['XCALIBURSAPPRUBLICOS', 'SigoRecibirPedidos', 'POST', 'https://gamapr:7081', 'https://srviibpr:7801', '/Publicos/financiera/sigo/recibir-pedidos'],
['XCALIBURSAPPRUBLICOS', 'GenerarTokenSAP', 'PUT', 'https://gamapr:7081', 'https://srviibpr:7801', '/Publicos/Seguridad/GenerarToken'],
['PUBLICOS', 'ListarDocumentosXTipoDocumental', 'POST', 'http://gamapr:7080', 'https://srviibpr:7800', '/Publicos/gestiondocumental/listardocumentosxtipodocumental'],
['PUBLICOS', 'ObtenerDocumentoXId', 'POST', 'http://gamapr:7080', 'https://srviibpr:7800', '/Publicos/gestiondocumental/obtenerdocumentoxid'],
['PUBLICOS', 'ObtenerCertificadosPrestamos', 'POST', 'http://gamapr:7080', 'https://srviibpr:7800', '/Publicos/gestiondocumental/obtenercertificadosprestamos'],
['PUBLICOS', 'ConsultaAprobadoresVacaciones', 'GET', 'http://gamapr:7080', 'https://srviibpr:7800', '/Publicos/Nomina/CrearSolicitudVacaciones/ConsultaAprobadoresVacaciones'],
['PUBLICOS', 'ConsultaDiasVacaciones', 'GET', 'http://gamapr:7080', 'https://srviibpr:7800', '/Publicos/Nomina/ConsultaDiaVacaciones'],
['PUBLICOS', 'ConsultaListaDistribucion', 'GET', 'http://gamapr:7080', 'https://srviibpr:7800', '/Publicos/Nomina/CrearSolicitudVacaciones/ConsultaListaDistribucion'],
['PUBLICOS', 'CrearSolicitudVacaciones', 'POST', 'http://gamapr:7080', 'https://srviibpr:7800', '/Publicos/Nomina/CrearSolicitudVacaciones/CrearSolicitud'],
['PUBLICOS', 'GenerarCertificadoLabora', 'POST', 'http://gamapr:7080', 'https://srviibpr:7800', '/Publicos/Nomina/CertificadoLaboral/GenerarCertificadoLaboralV3'],
['PUBLICOS', 'SolicitudVacacionesXIdentificacion', 'GET', 'http://gamapr:7080', 'https://srviibpr:7800', '/Publicos/Nomina/SolicitudVacaciones/Identificacion'],
['PUBLICOS', 'GenerarToken', 'POST', 'http://gamapr:7080', 'https://srviibpr:7800', '/Publicos/Seguridad/GenerarToken'],
['PUBLICOS', 'ConsultarActivosUsuario', 'GET', 'http://gamapr:7080', 'https://srviibpr:7800', '/Publicos/Setia/Consultar/ActivosUsuario'],
['PUBLICOS', 'ConsultarPendientesEmpleadosBodegaArte', 'GET', 'http://gamapr:7080', 'https://srviibpr:7800', '/Publicos/BodegaArte/PendientesEmpleado']
    ];

    // Recorrer la matriz
    for (var i = 0; i < matrizServicios.length; i++) {
        var fila = matrizServicios[i];
        
        var nombreNodo = fila[0];
        var nombreServicio = fila[1];
        var peticionHttp = fila[2];
        var hostServer = fila[3];
        var hostAdc = fila[4];
        var pathServicio = fila[5];

        // 1. Obtener o crear el Componente (Nodo Servicio)
        var nodoElement = obtenerOCrearNodo(currentPackage, nombreNodo);

        // 2. Crear el ProvidedInterface (Servicio) dentro del Nodo
        var servicioElement = crearServicio(nodoElement, nombreServicio);

        // 3. Llenar los Tagged Values del Servicio
        // Como vienen del MDG "Caracol", EA a veces requiere instanciarlos si no se sincronizan automáticamente
        llenarTaggedValue(servicioElement, "Petición HTTP", peticionHttp);
        llenarTaggedValue(servicioElement, "Host server", hostServer);
        llenarTaggedValue(servicioElement, "Host ADC", hostAdc);
        llenarTaggedValue(servicioElement, "Path", pathServicio);
    }
    
    Session.Output("Proceso finalizado con éxito.");
}

// Función para buscar un nodo por nombre, o crearlo si no existe
function obtenerOCrearNodo(paquete /* : EA.Package */, nombreNodo) /* : EA.Element */
{
    var elementos as EA.Collection;
    elementos = paquete.Elements;
    
    // Buscar si ya existe el nodo en este paquete
    for (var i = 0; i < elementos.Count; i++) {
        var el as EA.Element;
        el = elementos.GetAt(i);
        if (el.Name == nombreNodo && el.Type == "Component") {
            return el; // Ya existe, lo retornamos
        }
    }
    
    // Si no existe, lo creamos
    Session.Output("  Creando Nodo: " + nombreNodo);
    var nuevoNodo as EA.Element;
    nuevoNodo = elementos.AddNew(nombreNodo, "Component");
    nuevoNodo.Stereotype = "Nodo Servicio";
    nuevoNodo.Update();
    elementos.Refresh();
    
    return nuevoNodo;
}

// Función para crear un servicio (ProvidedInterface) dentro de un Nodo
function crearServicio(nodoPadre /* : EA.Element */, nombreServicio) /* : EA.Element */
{
    var subElementos as EA.Collection;
    subElementos = nodoPadre.Elements;
    
    Session.Output("    Creando Servicio: " + nombreServicio + " en " + nodoPadre.Name);
    var nuevoServicio as EA.Element;
    nuevoServicio = subElementos.AddNew(nombreServicio, "ProvidedInterface");
    nuevoServicio.Stereotype = "Caracol::Servicio"; // Asignar el estereotipo del perfil
    nuevoServicio.Update();
    subElementos.Refresh();
    
    return nuevoServicio;
}

// Función para actualizar un Tagged Value. 
// Como indicas que los crea el MDG, buscamos el tag e insertamos el valor.
function llenarTaggedValue(elemento /* : EA.Element */, nombreTag, valorTag)
{
    var tags as EA.Collection;
    tags = elemento.TaggedValues;
    var encontrado = false;
    
    // Recorrer los tags para ver si ya existe (por la definición del estereotipo)
    for (var i = 0; i < tags.Count; i++) {
        var tagActual as EA.TaggedValue;
        tagActual = tags.GetAt(i);
        
        if (tagActual.Name == nombreTag) {
            tagActual.Value = valorTag;
            tagActual.Update();
            encontrado = true;
            break;
        }
    }
    
    // NOTA DE SEGURIDAD EA: En Enterprise Architect, a veces los Tagged Values de un MDG 
    // no aparecen físicamente en la colección hasta que el usuario sincroniza el estereotipo 
    // manualmente en la UI o se les asigna valor explícitamente agregándolos.
    // Si no se encuentra, lo "instanciamos" para garantizar que guarde el dato.
    if (!encontrado) {
        var nuevoTag as EA.TaggedValue;
        nuevoTag = tags.AddNew(nombreTag, valorTag);
        nuevoTag.Update();
    }
    
    tags.Refresh();
}

// Ejecutar el script
main();