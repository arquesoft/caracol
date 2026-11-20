!INC Local Scripts.EAConstants-JScript

/*
 * Script Name: Mover objetos de acuerdo a tag value
 * Author: Mauricio Moya (mmoya@arquesoft.com)
 * Purpose: Mover a un paquete cada elemento de un paquete dado, de acuerdo al valor de un tag value
 * Date: 17/01/2022
 */
 
var tvName = 'Subarea';
var packageMatrix = new Array();
 
function main()
{
	var thePackage as EA.Package;
	var element as EA.Element;
	var tvValue;
	thePackage = Repository.GetTreeSelectedObject();
	loadPackageMatrix(thePackage);
	for(var i = 0; i < thePackage.Elements.Count; i++) {
		Session.Output("Processing element: " + i);
		element = thePackage.Elements.GetAt(i);
		tvValue = getElementTagValue(element, tvName);
		if(tvValue != "") {
			moveElementToFolder(element,thePackage,tvValue);
		}
	}
	thePackage.Elements.Refresh();
}

function loadPackageMatrix(package) {
	var thePackage as EA.Package;
	var child as EA.Package;
	thePackage = package;
	for(var i = 0; i < thePackage.Packages.Count; i++) {
		Session.Output("Adding to matrix, item: " + i);
		child = thePackage.Packages.GetAt(i);
		packageMatrix.push([child.PackageID, child.Name]);
	}
}

function moveElementToFolder(element, package, packageName) {
	var theElement as EA.Element;
	var packageId;
	theElement = element;
	packageId = getPackageId(package, packageName);
	theElement.PackageID = packageId;
	theElement.Update();
}

function getPackageId(package, packageName) {
	var thePackage as EA.Package;
	var iPackage as EA.Package;
	thePackage = package;
	for(var i = 0; i < packageMatrix.length; i++) {
		if(packageMatrix[i][1] == packageName) {
			return packageMatrix[i][0];
		}
	}
	iPackage = thePackage.Packages.AddNew(packageName,"");
	iPackage.Update();
	thePackage.Packages.Refresh();
	packageMatrix.push([iPackage.PackageID, packageName]);
	return iPackage.PackageID;
}

function getElementTagValue(element, tvName) {
	var theElement as EA.Element;
	var tagValue as EA.TaggedValue;
	theElement = element;
	for(var i = 0; i < theElement.TaggedValues.Count; i++) {
		tagValue = theElement.TaggedValues.GetAt(i);
		if(tagValue.Name == tvName) {
			return tagValue.Value;
		}
	}
	return "";
}

main();