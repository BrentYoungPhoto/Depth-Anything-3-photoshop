// ExtendScript for Adobe Photoshop
// Applies a depth mask PNG as a layer mask on the active layer.
// Called from Electron via osascript (macOS) or COM (Windows).

// Usage: arguments[0] = path to mask PNG file

(function () {
  var maskPath = arguments[0];
  if (!maskPath) {
    alert("Depth Mask Tool: No mask file path provided.");
    return;
  }

  var maskFile = new File(maskPath);
  if (!maskFile.exists) {
    alert("Depth Mask Tool: Mask file not found at " + maskPath);
    return;
  }

  // Ensure we have an active document
  if (app.documents.length === 0) {
    alert("Depth Mask Tool: No document is open in Photoshop.");
    return;
  }

  var targetDoc = app.activeDocument;
  var targetLayer = targetDoc.activeLayer;

  // Store current ruler units and set to pixels
  var originalRulerUnits = app.preferences.rulerUnits;
  app.preferences.rulerUnits = Units.PIXELS;

  try {
    // Open the mask image
    var maskDoc = app.open(maskFile);

    // Resize mask to match target document if needed
    if (
      maskDoc.width.value !== targetDoc.width.value ||
      maskDoc.height.value !== targetDoc.height.value
    ) {
      maskDoc.resizeImage(
        targetDoc.width,
        targetDoc.height,
        undefined,
        ResampleMethod.BICUBIC
      );
    }

    // Convert to grayscale if needed
    if (maskDoc.mode !== DocumentMode.GRAYSCALE) {
      maskDoc.changeMode(ChangeMode.GRAYSCALE);
    }

    // Select all and copy the mask
    maskDoc.selection.selectAll();
    maskDoc.selection.copy();
    maskDoc.close(SaveOptions.DONOTSAVECHANGES);

    // Switch back to target document
    app.activeDocument = targetDoc;
    app.activeDocument.activeLayer = targetLayer;

    // Add a layer mask (reveal all) if the layer doesn't have one
    // Use action descriptor for reliable mask creation
    var desc = new ActionDescriptor();
    desc.putClass(charIDToTypeID("Nw  "), charIDToTypeID("Chnl"));
    var ref = new ActionReference();
    ref.putEnumerated(
      charIDToTypeID("Chnl"),
      charIDToTypeID("Chnl"),
      charIDToTypeID("Msk ")
    );
    desc.putReference(charIDToTypeID("At  "), ref);
    desc.putEnumerated(
      charIDToTypeID("Usng"),
      charIDToTypeID("UsrM"),
      charIDToTypeID("RvlA")
    );
    executeAction(charIDToTypeID("Mk  "), desc, DialogModes.NO);

    // Select the layer mask channel
    var maskRef = new ActionReference();
    maskRef.putEnumerated(
      charIDToTypeID("Chnl"),
      charIDToTypeID("Chnl"),
      charIDToTypeID("Msk ")
    );
    var selectDesc = new ActionDescriptor();
    selectDesc.putReference(charIDToTypeID("null"), maskRef);
    selectDesc.putBoolean(charIDToTypeID("MkVs"), true);
    executeAction(charIDToTypeID("slct"), selectDesc, DialogModes.NO);

    // Paste the mask data
    app.activeDocument.paste();

    // Flatten the pasted layer into the mask
    // Deselect
    app.activeDocument.selection.deselect();

  } catch (e) {
    alert("Depth Mask Tool Error: " + e.message);
  } finally {
    // Restore ruler units
    app.preferences.rulerUnits = originalRulerUnits;
  }
})();
