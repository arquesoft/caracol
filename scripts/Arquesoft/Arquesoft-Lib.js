!INC Local Scripts.EAConstants-JScript
!INC EAScriptLib.JScript-TaggedValue
!INC EAScriptLib.JScript-Database
!INC EAScriptLib.JScript-GUID

function startScript(nombreScript) {
	Repository.ClearOutput("Script");
	EnsureOutputVisible ("Script");
	Session.Output("=============================================================");
	Session.Output("ARQUESOFT SCRIPT " + nombreScript);
	Session.Output("=============================================================");
	Session.Output("Start: " + DTFormatDate(new Date));
	Session.Output("=============================================================");
	Session.Output("Executing "+ nombreScript+". Please wait....");
}

function endScript() {
	Session.Output("SCRIPT END: " + DTFormatDate(new Date));
	Session.Output("=============================================================");
}

function DTFormatDate(date) {
	var now = date;
	var hours = now.getHours();
	if ( hours < 10 )
		hours = "0" + hours;
	var minutes = now.getMinutes();
	if ( minutes < 10 )
		minutes = "0" + minutes;
	var seconds = now.getSeconds();
	if ( seconds < 10 )
		seconds = "0" + seconds;
	var month = now.getMonth() + 1;
	var day = now.getDate();
	if(month < 10) {
		month = "0" + month;
	}
	if(day < 10) {
		day = "0" + day;
	}
	var displayDate = now.getFullYear() + "/" + month + "/" + day;
	displayDate += " " + hours + ":" + minutes + ":" + seconds;
	return displayDate;
}

function StringToDate(displayDate){
	var year = parseInt(displayDate.substring(0,4),10);
	var month = parseInt(displayDate.substring(5,7),10) - 1;
	var day = parseInt(displayDate.substring(8,10),10);
	var hour = parseInt(displayDate.substring(11,13),10);
	var minutes = parseInt(displayDate.substring(14,16),10);
	var seconds = parseInt(displayDate.substring(17,19),10);
	return new Date(year, month, day, hour, minutes, seconds);
}

function getNewGUID() {
	var guid = new ActiveXObject("Scriptlet.Typelib").guid.substr(0, 38);
	return guid;
}

function isUserInGroup(groupGUID) {
	var userGUID = Repository.GetCurrentLoginUser(true);
	var result = DBGetFieldValueArrayString("GroupID", "t_secusergroup", "UserID = '" + userGUID + "' AND GroupID = '" + groupGUID + "'");
	if(result.length == 0) {
		return false;
	}
	return true;
}

function isUserInGroupByName(groupName) {
	var userGUID = Repository.GetCurrentLoginUser(true);
	var result = DBGetFieldValueArrayString("GroupName", "t_secusergroup ug, t_secgroup g", "ug.UserID = '" + userGUID + "' AND  ug.GroupID = g.GroupID AND g.GroupName ='" + groupName + "'");
	if(result.length == 0) {
		return false;
	}
	return true;
}

function getUserFullName(){
	var userGUID = Repository.GetCurrentLoginUser(true);
	var sql = "SELECT CONCAT(FirstName,' ', Surname) as Name FROM t_secuser WHERE UserID ='" + userGUID + "'";
	var queryResult = Repository.SQLQuery( sql );
	var stringValue = null;
	if ( queryResult.length > 0 )
	{
		stringValue = stringValue = queryResult.substring(queryResult.indexOf("<Row><Name>")+11, queryResult.indexOf("</Name></Row>"));
	}
	return stringValue;
}

function encodeBreakLines(initial) {
	return initial.replace(/(?:\r\n|\r|\n)/g, '@@');
}

function decodeBreakLines(encoded) {
	return encoded.replace(/@@/g,"\r\n");
}

if (!String.prototype.trim) {
  (function() {
    // Make sure we trim BOM and NBSP
    var rtrim = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g;
    String.prototype.trim = function() {
      return this.replace(rtrim, '');
    };
  })();
}

function setNullTagValue(tagValueName) {
	var treeSelectedType = Repository.GetTreeSelectedItemType();
	switch ( treeSelectedType )
	{
		case otElement :
		{
			var theElement as EA.Element;
			theElement = Repository.GetTreeSelectedObject();
			for(var i = 0; i < theElement.TaggedValues.Count; i++) {
				var tv as EA.TaggedValue;
				tv = theElement.TaggedValues.GetAt(i);
				if(tv.Name == tagValueName) {
					tv.Value = "";
					tv.Update();
					theElement.Refresh();
					break;
				}
			}
			break;
		}
		default:
		{
			// Error message
			Session.Prompt( "Este script solo funciona sobre elementos", promptOK );
		}
	}
}

function TVGetElementTaggedValueNotes( theElement /* : EA.Element */, taggedValueName /* : String */, defaultValue /* : String */ ) /* : variant */
{
	var result = defaultValue;
	
	if ( theElement != null && taggedValueName.length > 0 )
	{
		var taggedValue as EA.TaggedValue;
		taggedValue = theElement.TaggedValues.GetByName( taggedValueName );
		
		if ( taggedValue != null ){
			result = taggedValue.Notes;
		}
	}
	
	return result;	
}

function TVSetElementTaggedValueNotes( theElement /* : EA.Element */, taggedValueName /* : String */, taggedValueValue /* : variant */, replaceExisting /* : boolean */ ) /* : void */
{
	if ( theElement != null && taggedValueName.length > 0 )
	{
		var taggedValue as EA.TaggedValue;
		taggedValue = null;
	
		// If replace existing was specified then attempt to get a tagged value from the element
		// with the provided name
		if ( replaceExisting )
			taggedValue = theElement.TaggedValues.GetByName( taggedValueName );
		
		if ( taggedValue == null )
		{
			taggedValue = theElement.TaggedValues.AddNew( taggedValueName, taggedValueValue );
		}
		else
		{
			taggedValue.Notes = taggedValueValue;
		}
		
		taggedValue.Update();
	}
}

function updateTag(theElement, tagName, tagValue, tagNotes) {
	var sql;
	var element as EA.Element;
	var tag as EA.TaggedValue;
	var containsTag = false;
	element = theElement;
	for(var i = 0; i < element.TaggedValues.Count; i++) {
		tag = element.TaggedValues.GetAt(i);
		if(tag.Name == tagName) {
			containsTag = true;
			break;
		}
	}
	if(!containsTag) {
		sql = "INSERT INTO t_objectproperties (ea_guid,Object_ID,Property,Value,Notes) VALUES('" + GUIDGenerateGUID() + "'," + element.ElementID + ",'" + tagName + "','" + tagValue + "','" + tagNotes + "')";
	} else {
		sql = "UPDATE t_objectproperties SET Value = '" + tagValue + "', Notes = '" + tagNotes + "' WHERE PropertyID = " + tag.PropertyID;
	}
	Session.Output("Updating element: " + theElement.Name);
	Repository.Execute(sql);
}

function adjustEndsOfTheConnectors(diagramID){
	var diagram as EA.Diagram;	
	diagram = Repository.GetDiagramByID(diagramID);
	//Session.Output("Procesando diagrama: " + diagram.Name + " (ID: " + diagram.DiagramID + ")");
	for (var l = 0; l < diagram.DiagramLinks.Count; l++) {
		var diagramLink = diagram.DiagramLinks.GetAt(l);
		var geometry = diagramLink.Geometry;

		var geometryModificado = geometry.replace(
		  /(EDGE=\d+;)(SX=-?\d+;SY=-?\d+;EX=-?\d+;EY=-?\d+;)(\$LLB=.*)/,
		  function(match, edge, coords, resto) {
			var coordsCero = coords.replace(/(SX|SY|EX|EY)=-?\d+/g, "$1=0");
			return edge + coordsCero + resto;
		  }
		);
		  
		diagramLink.geometry = geometryModificado ;
		diagramLink.Update();
		//Session.Output("texto:" + geometryModificado);
	}	
	Session.Output("✅ Connectors Fixed");
}

/**
 * Genera un DUID aleatorio de 8 caracteres hexadecimales
 */
function getDUID() {
    var hexChars = "0123456789ABCDEF";
    var duid = "";
    for (var i = 0; i < 8; i++) {
        var randIndex = Math.floor(Math.random() * hexChars.length);
        duid += hexChars.charAt(randIndex);
    }
    return duid;
}