/** @jsx jsx */

import React from 'react';
import { jsx, css } from '@emotion/core';
// components
import { AccordionList, AccordionItem } from 'components/Accordion';
import EditLayerMetaData from 'components/EditLayerMetaData';
import Select from 'components/Select';
import NavigationButton from 'components/NavigationButton';
// contexts
import { useEsriModulesContext } from 'contexts/EsriModules';
import { NavigationContext } from 'contexts/Navigation';
import { SketchContext } from 'contexts/Sketch';
// types
import { LayerType } from 'types/Layer';
import { FeatureEditsType } from 'types/Edits';
// config
import {
  sampleAttributes,
  SampleSelectOptions,
  SampleSelectType,
} from 'config/sampleAttributes';
import { polygonSymbol } from 'config/symbols';
import { totsGPServer } from 'config/webService';
import {
  cantUseWithVspMessage,
  generateRandomExceededTransferLimitMessage,
  generateRandomSuccessMessage,
  userDefinedValidationMessage,
  webServiceErrorMessage,
} from 'config/errorMessages';
// utils
import { useGeometryTools, useStartOver } from 'utils/hooks';
import {
  convertToSimpleGraphic,
  getCurrentDateTime,
  getDefaultAreaOfInterestLayer,
  getDefaultSampleLayer,
  getPopupTemplate,
  updateLayerEdits,
} from 'utils/sketchUtils';
import { geoprocessorFetch } from 'utils/fetchUtils';

type ShapeTypeSelect = {
  value: string;
  label: string;
};

type EditType = 'create' | 'edit' | 'clone' | 'view';

// gets an array of layers that can be used with the sketch widget.
function getSketchableLayers(layers: LayerType[]) {
  return layers.filter(
    (layer) => layer.layerType === 'Samples' || layer.layerType === 'VSP',
  );
}

// gets an array of layers that can be used with the aoi sketch widget.
function getSketchableAoiLayers(layers: LayerType[]) {
  return layers.filter((layer) => layer.layerType === 'Area of Interest');
}

/**
 * Determines if the desired name has already been used. If it has
 * it appends in index to the end (i.e. '<desiredName> (2)').
 */
function getSampleTypeName(
  sampleTypes: SampleSelectType[],
  desiredName: string,
) {
  // get a list of names in use
  let usedNames: string[] = [];
  sampleTypes.forEach((sampleType) => {
    usedNames.push(sampleType.label);
  });

  // Find a name where there is not a collision.
  // Most of the time this loop will be skipped.
  let duplicateCount = 0;
  let newName = desiredName;
  while (usedNames.includes(newName)) {
    duplicateCount += 1;
    newName = `${desiredName} (${duplicateCount})`;
  }

  return newName;
}

// --- styles (SketchButton) ---
const panelContainer = css`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 100%;
`;

const sectionContainer = css`
  padding: 20px;
`;

const sectionContainerWidthOnly = css`
  padding: 0 20px;
`;

const layerSelectStyles = css`
  margin-bottom: 10px;
`;

const sketchButtonContainerStyles = css`
  margin-left: 1px;
  margin-top: 1px;

  .sketch-button-selected {
    background-color: #f0f0f0;
  }
`;

const sketchButtonStyles = css`
  position: relative;
  height: 90px;
  width: 33.33%;
  background-color: white;
  color: black;
  border: 1px solid #ccc;
  border-radius: 0;
  margin: 0 0 -1px -1px;

  &::before,
  &::after {
    content: '';
    display: block;
    padding-top: 50%;
  }

  &:hover,
  &:focus {
    background-color: #f0f0f0;
    cursor: pointer;
  }
`;

const textContainerStyles = css`
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const textStyles = css`
  max-height: 85px;
  word-break: break-word;
`;

const centerTextStyles = css`
  margin-top: 10px;
  text-align: center;
`;

const sketchAoiButtonStyles = css`
  background-color: white;
  color: black;
  margin: 0 5px 0 0;

  &:hover,
  &:focus {
    background-color: #f0f0f0;
    cursor: pointer;
  }
`;

const sketchAoiTextStyles = css`
  display: flex;
  justify-content: space-between;
  align-items: center;

  i {
    font-size: 20px;
    margin-right: 5px;
  }
`;

const inlineMenuStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const userDefinedButtonStyles = css`
  ${inlineMenuStyles}
  margin-bottom: 10px;
`;

const addButtonStyles = css`
  margin: 0;
  height: 38px; /* same height as ReactSelect */
`;

const widthAreaCheckContainerStyles = css`
  margin-bottom: 10px;
`;

const widthInputContainerStyles = css`
  margin-right: 10px;
`;

const checkAreaButtonStyles = css`
  margin: 10px 0 0 0;
`;

const fullWidthSelectStyles = css`
  width: 100%;
  margin-right: 10px;
  margin-bottom: 10px;
`;

const inlineSelectStyles = css`
  width: 100%;
  margin-right: 10px;
`;

const inputStyles = css`
  width: 100%;
  height: 36px;
  margin: 0 0 10px 0;
  padding-left: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
`;

const widthInputStyles = css`
  ${inputStyles}
  margin: 0;
`;

const submitButtonStyles = css`
  margin-top: 10px;
`;

// --- components (SketchButton) ---
type SketchButtonProps = {
  label: string;
  iconClass: string;
  onClick: () => void;
};

function SketchButton({ label, iconClass, onClick }: SketchButtonProps) {
  // put an ellipses on the end if the text is to long
  const displayLabel = label.length > 38 ? `${label.substr(0, 38)}...` : label;

  return (
    <button
      id={label}
      title={label}
      className="sketch-button"
      onClick={() => onClick()}
      css={sketchButtonStyles}
    >
      <div css={textContainerStyles}>
        <div css={textStyles}>
          <i className={iconClass} />
          <br />
          {displayLabel}
        </div>
      </div>
    </button>
  );
}

// --- styles (LocateSamples) ---
const headerContainer = css`
  display: flex;
  align-items: center;
  justify-content: space-between;

  h2 {
    margin: 0;
    padding: 0;
  }
`;

const deleteButtonStyles = css`
  width: 75px;
  margin-bottom: 0;
  padding: 0.25em 0;
  color: black;
  background-color: white;
  border-radius: 0;
  line-height: 16px;
  text-decoration-line: none;
  font-weight: bold;

  &:hover {
    background-color: white;
  }
`;

const trainingStyles = css`
  margin-left: 25px;
  font-size: 0.875rem;

  input {
    margin-right: 5px;
  }
`;

const lineSeparatorStyles = css`
  border-bottom: 1px solid #d8dfe2;
`;

// --- components (LocateSamples) ---
type GenerateRandomType = {
  status: 'none' | 'fetching' | 'success' | 'failure' | 'exceededTransferLimit';
  data: __esri.Graphic[];
};

function LocateSamples() {
  const {
    setGoTo,
    setGoToOptions,
    trainingMode,
    setTrainingMode,
  } = React.useContext(NavigationContext);
  const {
    edits,
    setEdits,
    layersInitialized,
    layers,
    setLayers,
    map,
    sketchLayer,
    setSketchLayer,
    aoiSketchLayer,
    setAoiSketchLayer,
    sketchVM,
    aoiSketchVM,
    getGpMaxRecordCount,
    userDefinedOptions,
    setUserDefinedOptions,
    setUserDefinedAttributes,
  } = React.useContext(SketchContext);
  const {
    Collection,
    FeatureSet,
    Geoprocessor,
    Graphic,
    GraphicsLayer,
    Point,
    Polygon,
  } = useEsriModulesContext();
  const startOver = useStartOver();
  const { calculateArea, createBuffer } = useGeometryTools();

  // Sets the sketchLayer to the first layer in the layer selection drop down,
  // if available. If the drop down is empty, an empty sketchLayer will be
  // created.
  const [
    sketchLayerInitialized,
    setSketchLayerInitialized, //
  ] = React.useState(false);
  React.useEffect(() => {
    if (!map || !layersInitialized || sketchLayerInitialized) return;

    // get the first layer that can be used for sketching and return
    const sketchableLayers = getSketchableLayers(layers);
    if (!sketchLayer && sketchableLayers.length > 0) {
      setSketchLayer(sketchableLayers[0]);
    }

    setSketchLayerInitialized(true);

    // check if the default sketch layer has been added already or not
    const defaultIndex = sketchableLayers.findIndex(
      (layer) => layer.name === 'Default Sample Layer',
    );
    if (defaultIndex > -1) return;

    // no sketchable layers were available, create one
    const tempSketchLayer = getDefaultSampleLayer(GraphicsLayer);

    // add the sketch layer to the map
    setLayers((layers) => {
      return [...layers, tempSketchLayer];
    });

    // if the sketch layer wasn't set above, set it now
    if (!sketchLayer && sketchableLayers.length === 0) {
      setSketchLayer(tempSketchLayer);
    }
  }, [
    GraphicsLayer,
    map,
    layersInitialized,
    layers,
    setLayers,
    sketchLayer,
    setSketchLayer,
    sketchLayerInitialized,
  ]);

  // Initializes the aoi layer for performance reasons
  const [aoiLayerInitialized, setAoiLayerInitialized] = React.useState(false);
  React.useEffect(() => {
    if (!map || !layersInitialized || aoiLayerInitialized) return;

    // get the first layer that can be used for aoi sketching and return
    const sketchableLayers = getSketchableAoiLayers(layers);
    if (!aoiSketchLayer && sketchableLayers.length > 0) {
      setAoiSketchLayer(sketchableLayers[0]);
    }

    setAoiLayerInitialized(true);

    // check if the default sketch layer has been added already or not
    const defaultIndex = sketchableLayers.findIndex(
      (layer) => layer.name === 'Sketched Area of Interest',
    );
    if (defaultIndex > -1) return;

    const newAoiSketchLayer = getDefaultAreaOfInterestLayer(GraphicsLayer);

    // add the layer to the map
    setLayers((layers) => {
      return [...layers, newAoiSketchLayer];
    });

    // set the active sketch layer
    if (!aoiSketchLayer && sketchableLayers.length === 0) {
      setAoiSketchLayer(newAoiSketchLayer);
    }
  }, [
    GraphicsLayer,
    map,
    layersInitialized,
    layers,
    setLayers,
    aoiLayerInitialized,
    aoiSketchLayer,
    setAoiSketchLayer,
  ]);

  const [numberRandomSamples, setNumberRandomSamples] = React.useState('33');
  const [
    sampleType,
    setSampleType, //
  ] = React.useState<SampleSelectType>({
    value: 'Sponge',
    label: 'Sponge',
    isPredefined: true,
  });

  // Handle a user clicking one of the sketch buttons
  function sketchButtonClick(label: string) {
    if (!sketchVM || !map || !sketchLayer) return;

    // put the sketch layer on the map, if it isn't there already
    const layerIndex = map.layers.findIndex(
      (layer) => layer.id === sketchLayer.layerId,
    );
    if (layerIndex === -1) map.add(sketchLayer.sketchLayer);

    // save changes from other sketchVM and disable to prevent
    // interference
    if (aoiSketchVM) {
      aoiSketchVM.complete();
      aoiSketchVM.layer = (null as unknown) as __esri.GraphicsLayer;
    }

    // determine whether the sketch button draws points or polygons
    let shapeType = 'polygon';
    if (sampleAttributes[label].IsPoint) {
      shapeType = 'point';
    }

    // disable popups for the active sketch layer, so the user doesn't
    // get shape edit controls and a popup at the same time.
    if (map) {
      map.layers.forEach((layer: any) => {
        // had to use any, since some layer types don't have popupEnabled
        if (layer.popupEnabled) layer.popupEnabled = false;
      });
    }

    // let the user draw/place the shape
    sketchVM.create(shapeType);

    // make the style of the button active
    const elem = document.getElementById(label);
    if (elem) elem.classList.add('sketch-button-selected');
  }

  // Handle a user clicking the sketch AOI button. If an AOI is not selected from the
  // dropdown this will create an AOI layer. This also sets the sketchVM to use the
  // selected AOI and triggers a React useEffect to allow the user to sketch on the map.
  function sketchAoiButtonClick() {
    if (!map || !aoiSketchVM || !aoiSketchLayer) return;

    // put the sketch layer on the map, if it isn't there already
    const layerIndex = map.layers.findIndex(
      (layer) => layer.id === aoiSketchLayer.layerId,
    );
    if (layerIndex === -1) map.add(aoiSketchLayer.sketchLayer);

    // save changes from other sketchVM and disable to prevent
    // interference
    if (sketchVM) {
      sketchVM.complete();
      sketchVM.layer = (null as unknown) as __esri.GraphicsLayer;
    }

    // activate the sketch tool
    aoiSketchVM.create('polygon');

    // disable popups for the active sketch layer, so the user doesn't
    // get shape edit controls and a popup at the same time.
    if (map) {
      map.layers.forEach((layer: any) => {
        // had to use any, since some layer types don't have popupEnabled
        if (layer.popupEnabled) layer.popupEnabled = false;
      });
    }

    // make the style of the button active
    const elem = document.getElementById('aoi');
    if (elem) elem.classList.add('sketch-button-selected');
  }

  // Handle a user generating random samples
  const [
    generateRandomResponse,
    setGenerateRandomResponse, //
  ] = React.useState<GenerateRandomType>({
    status: 'none',
    data: [],
  });
  function randomSamples() {
    if (!map || !sketchLayer || !getGpMaxRecordCount) return;

    getGpMaxRecordCount()
      .then((maxRecordCount) => {
        setGenerateRandomResponse({ status: 'fetching', data: [] });
        let graphics: __esri.GraphicProperties[] = [];
        if (aoiSketchLayer?.sketchLayer?.type === 'graphics') {
          graphics = aoiSketchLayer.sketchLayer.graphics.toArray();
        }

        // create a feature set for communicating with the GPServer
        const featureSet = new FeatureSet({
          displayFieldName: '',
          geometryType: 'polygon',
          spatialReference: {
            wkid: 3857,
          },
          fields: [
            {
              name: 'OBJECTID',
              type: 'oid',
              alias: 'OBJECTID',
            },
            {
              name: 'PERMANENT_IDENTIFIER',
              type: 'guid',
              alias: 'PERMANENT_IDENTIFIER',
            },
          ],
          features: graphics,
        });

        // determine the number of service calls needed to satisfy the request
        const intNumberRandomSamples = parseInt(numberRandomSamples);
        const iterations = Math.ceil(intNumberRandomSamples / maxRecordCount);

        // fire off the generateRandom requests
        const requests = [];
        let numSamples = 0;
        let numSamplesLeft = intNumberRandomSamples;
        for (let i = 0; i < iterations; i++) {
          // determine the number of samples for this request
          numSamples =
            numSamplesLeft > maxRecordCount ? maxRecordCount : numSamplesLeft;

          const props = {
            f: 'json',
            Number_of_Samples: numSamples,
            Sample_Type: sampleType.value,
            Area_of_Interest_Mask: featureSet.toJSON(),
          };
          const request = geoprocessorFetch({
            Geoprocessor,
            url: `${totsGPServer}/Generate%20Random`,
            inputParameters: props,
            useProxy: true,
          });
          requests.push(request);

          // keep track of the number of remaining samples
          numSamplesLeft = numSamplesLeft - numSamples;
        }
        Promise.all(requests)
          .then((responses: any) => {
            console.log('generateRandom responses: ', responses);
            let res;
            const timestamp = getCurrentDateTime();
            const popupTemplate = getPopupTemplate('Samples', trainingMode);
            const graphicsToAdd: __esri.Graphic[] = [];
            for (let i = 0; i < responses.length; i++) {
              res = responses[i];
              if (!res?.results?.[0]?.value) {
                setGenerateRandomResponse({ status: 'failure', data: [] });
                return;
              }

              if (res.results[0].value.exceededTransferLimit) {
                setGenerateRandomResponse({
                  status: 'exceededTransferLimit',
                  data: [],
                });
                return;
              }

              // put the sketch layer on the map, if it isn't there already
              const layerIndex = map.layers.findIndex(
                (layer) => layer.id === sketchLayer.layerId,
              );
              if (layerIndex === -1) map.add(sketchLayer.sketchLayer);

              // get the results from the response
              const results = res.results[0].value;

              // build an array of graphics to draw on the map
              results.features.forEach((feature: any) => {
                graphicsToAdd.push(
                  new Graphic({
                    attributes: {
                      ...feature.attributes,
                      CREATEDDATE: timestamp,
                    },
                    symbol: polygonSymbol,
                    geometry: new Polygon({
                      rings: feature.geometry.rings,
                      spatialReference: results.spatialReference,
                    }),
                    popupTemplate,
                  }),
                );
              });
            }

            // put the graphics on the map
            if (sketchLayer?.sketchLayer?.type === 'graphics') {
              // add the graphics to a collection so it can added to browser storage
              const collection = new Collection<__esri.Graphic>();
              collection.addMany(graphicsToAdd);
              sketchLayer.sketchLayer.graphics.addMany(collection);

              const editsCopy = updateLayerEdits({
                edits,
                layer: sketchLayer,
                type: 'add',
                changes: collection,
              });

              // update the edits state
              setEdits(editsCopy);

              // update the editType of the sketchLayer
              setSketchLayer((sketchLayer: LayerType | null) => {
                if (!sketchLayer) return sketchLayer;
                return {
                  ...sketchLayer,
                  editType: 'add',
                };
              });
            }

            setGenerateRandomResponse({
              status: 'success',
              data: graphicsToAdd,
            });
          })
          .catch((err) => {
            console.error(err);
            setGenerateRandomResponse({ status: 'failure', data: [] });
          });
      })
      .catch((err: any) => {
        console.error(err);
        setGenerateRandomResponse({ status: 'failure', data: [] });
      });
  }

  // Keep the allSampleOptions array up to date
  const [allSampleOptions, setAllSampleOptions] = React.useState<
    SampleSelectType[]
  >([]);
  React.useEffect(() => {
    setAllSampleOptions([...SampleSelectOptions, ...userDefinedOptions]);
  }, [userDefinedOptions]);

  const [
    userDefinedSampleType,
    setUserDefinedSampleType,
  ] = React.useState<SampleSelectType | null>(null);
  const [editingStatus, setEditingStatus] = React.useState<EditType | null>(
    null,
  );
  const [sampleTypeName, setSampleTypeName] = React.useState<string>('');
  const [shapeType, setShapeType] = React.useState<ShapeTypeSelect | null>(
    null,
  );
  const [width, setWidth] = React.useState<string | null>('');
  const [areaTest, setAreaTest] = React.useState<string | null>(null);
  const [ttpk, setTtpk] = React.useState<string | null>('');
  const [ttc, setTtc] = React.useState<string | null>('');
  const [tta, setTta] = React.useState<string | null>('');
  const [ttps, setTtps] = React.useState<string | null>('');
  const [lodp, setLodp] = React.useState<string | null>('');
  const [lodnon, setLodnon] = React.useState<string | null>('');
  const [mcps, setMcps] = React.useState<string | null>('');
  const [tcps, setTcps] = React.useState<string | null>('');
  const [wvps, setWvps] = React.useState<string | null>('');
  const [wwps, setWwps] = React.useState<string | null>('');
  const [sa, setSa] = React.useState<string | null>('');
  const [alc, setAlc] = React.useState<string | null>('');
  const [amc, setAmc] = React.useState<string | null>('');
  const [validationMessage, setValidationMessage] = React.useState<
    JSX.Element[] | string
  >('');

  // Sets all of the user defined sample type inputs based on
  // which edit type is being used.
  function setSampleTypeInputs(editType: EditType) {
    if (editType === 'create') {
      setEditingStatus(editType);
      setShapeType(null);
      setWidth('');
      setAreaTest(null);
      setTtpk('');
      setTtc('');
      setTta('');
      setTtps('');
      setLodp('');
      setLodnon('');
      setMcps('');
      setTcps('');
      setWvps('');
      setWwps('');
      setSa('');
      setAlc('');
      setAmc('');
      setSampleTypeName('');
      return;
    }

    if (!userDefinedSampleType) return;

    // get the sample type name, for a clone operation
    // add a number to the end of the name.
    let sampleTypeName = userDefinedSampleType.label;
    const attributes = sampleAttributes[sampleTypeName];
    if (editType === 'clone') {
      sampleTypeName = getSampleTypeName(allSampleOptions, sampleTypeName);
    }

    const shapeType = attributes.IsPoint
      ? { value: 'point', label: 'Point' }
      : { value: 'polygon', label: 'Polygon' };

    setEditingStatus(editType);
    setShapeType(shapeType);
    setWidth(attributes.Width.toString());
    setAreaTest(null);
    setTtpk(attributes.TTPK);
    setTtc(attributes.TTC);
    setTta(attributes.TTA);
    setTtps(attributes.TTPS);
    setLodp(attributes.LOD_P);
    setLodnon(attributes.LOD_NON);
    setMcps(attributes.MCPS);
    setTcps(attributes.TCPS);
    setWvps(attributes.WVPS);
    setWwps(attributes.WWPS);
    setSa(attributes.SA);
    setAlc(attributes.ALC);
    setAmc(attributes.AMC);
    setSampleTypeName(sampleTypeName);
  }

  // Validates the user input.
  // TODO: This logic needs to be updated to be more robust. Currently,
  //        this just makes sure that all of the fields have been filled out.
  function validateEdits() {
    let isValid = true;
    const messageParts: string[] = [];

    function isNumberValid(
      numberStr: string | null,
      valueValidation?: '' | 'greaterThan0',
    ) {
      if (numberStr === undefined || numberStr === null || numberStr === '') {
        return;
      }

      const number = Number(numberStr);
      if (isNaN(number)) return false;
      if (!valueValidation) return true;
      if (valueValidation === 'greaterThan0' && number > 0) return true;

      return false;
    }

    // validate any fields that need it
    if (!sampleTypeName) {
      isValid = false;
      messageParts.push('User Defined types must have a sample type name.');
    }
    if (shapeType?.value === 'point' && !isNumberValid(width, 'greaterThan0')) {
      isValid = false;
      messageParts.push('Points must have a width greater than 0.');
    }
    if (!isNumberValid(ttpk)) {
      isValid = false;
      messageParts.push('Time to Prepare Kits needs a numeric value.');
    }
    if (!isNumberValid(ttc)) {
      isValid = false;
      messageParts.push('Time to Collect needs a numeric value.');
    }
    if (!isNumberValid(tta)) {
      isValid = false;
      messageParts.push('Time to Analyze needs a numeric value.');
    }
    if (!isNumberValid(ttps)) {
      isValid = false;
      messageParts.push('Total Time per Sample needs a numeric value.');
    }
    if (!isNumberValid(mcps)) {
      isValid = false;
      messageParts.push('Material Cost needs a numeric value.');
    }
    if (!isNumberValid(tcps)) {
      isValid = false;
      messageParts.push('Total Cost per Sample needs a numeric value.');
    }
    if (!isNumberValid(wvps)) {
      isValid = false;
      messageParts.push('Waste Volume needs a numeric value.');
    }
    if (!isNumberValid(wwps)) {
      isValid = false;
      messageParts.push('Waste Weight needs a numeric value.');
    }
    if (!isNumberValid(sa, 'greaterThan0')) {
      isValid = false;
      messageParts.push(
        'Reference Surface Area needs a numeric value greater than 0.',
      );
    }
    if (!isNumberValid(alc)) {
      isValid = false;
      messageParts.push('Analysis Labor Cost needs a numeric value.');
    }
    if (!isNumberValid(amc)) {
      isValid = false;
      messageParts.push('Analysis Material Cost needs a numeric value.');
    }

    if (messageParts.length > 0) {
      const message = messageParts.map((part, index) => {
        return (
          <React.Fragment key={index}>
            {index !== 0 ? <br /> : ''}
            {part}
          </React.Fragment>
        );
      });
      setValidationMessage(message);
    }

    return isValid;
  }

  // Checks to see if the sample type name changed.
  function didSampleTypeNameChange() {
    return (
      editingStatus === 'edit' &&
      userDefinedSampleType &&
      sampleTypeName !== userDefinedSampleType.label
    );
  }

  // Updates the attributes of graphics that have had property changes
  function updateAttributes({
    graphics,
    newAttributes,
    oldType,
  }: {
    graphics: __esri.Graphic[] | FeatureEditsType[];
    newAttributes: any;
    oldType: string;
  }) {
    graphics.forEach((graphic: __esri.Graphic | FeatureEditsType) => {
      // update attributes for the edited type
      if (graphic.attributes.TYPE === oldType) {
        const widthChanged = graphic.attributes.Width !== newAttributes.Width;
        const shapeTypeChanged =
          graphic.attributes.IsPoint !== newAttributes.IsPoint;

        graphic.attributes.TYPE = newAttributes.TYPE;
        graphic.attributes.IsPoint = newAttributes.IsPoint;
        graphic.attributes.Width = newAttributes.Width;
        graphic.attributes.SA = newAttributes.SA;
        graphic.attributes.TTPK = newAttributes.TTPK;
        graphic.attributes.TTC = newAttributes.TTC;
        graphic.attributes.TTA = newAttributes.TTA;
        graphic.attributes.TTPS = newAttributes.TTPS;
        graphic.attributes.LOD_P = newAttributes.LOD_P;
        graphic.attributes.LOD_NON = newAttributes.LOD_NON;
        graphic.attributes.MCPS = newAttributes.MCPS;
        graphic.attributes.TCPS = newAttributes.TCPS;
        graphic.attributes.WVPS = newAttributes.WVPS;
        graphic.attributes.WWPS = newAttributes.WWPS;
        graphic.attributes.ALC = newAttributes.ALC;
        graphic.attributes.AMC = newAttributes.AMC;

        // redraw the graphic if the width changed or if the graphic went from a
        // polygon to a point
        if (newAttributes.IsPoint && (widthChanged || shapeTypeChanged)) {
          // convert the geometry _esriPolygon if it is missing stuff
          const tempGeometry = graphic.geometry as any;
          const isFullGraphic = tempGeometry.centroid ? true : false;
          graphic.geometry = isFullGraphic
            ? (graphic.geometry as __esri.Polygon)
            : new Polygon(graphic.geometry);

          createBuffer(graphic as __esri.Graphic, Number(width));

          if (isFullGraphic) return;
          graphic = convertToSimpleGraphic(graphic as __esri.Graphic);
        }
      }
    });
  }

  return (
    <div css={panelContainer}>
      <div>
        <div css={sectionContainer}>
          <div css={headerContainer}>
            <h2>Create Plan</h2>
            <button css={deleteButtonStyles} onClick={startOver}>
              <i className="fas fa-redo-alt" />
              <br />
              Start Over
            </button>
          </div>
          <div css={headerContainer}>
            <div css={trainingStyles}>
              <input
                id="training-mode-toggle"
                type="checkbox"
                checked={trainingMode}
                onChange={(ev) => setTrainingMode(!trainingMode)}
              />
              <label htmlFor="training-mode-toggle">Training Mode</label>
            </div>
            <button
              css={deleteButtonStyles}
              onClick={() => {
                if (!sketchVM || !sketchLayer) return;

                // make a copy of the edits context variable
                const editsCopy = updateLayerEdits({
                  edits,
                  layer: sketchLayer,
                  type: 'delete',
                  changes: sketchVM.layer.graphics,
                });

                setEdits(editsCopy);

                sketchVM.layer.removeAll();
              }}
            >
              <i className="fas fa-trash-alt" />
              <br />
              Delete All Samples
            </button>
          </div>
        </div>
        <div css={lineSeparatorStyles} />
        <div css={sectionContainer}>
          <p>
            Specify a sampling layer for your project and enter a scenario name
            and description for the plan. The scenario name will become the
            feature layer name if published to your ArcGIS Online account in the{' '}
            <strong>Publish Plan</strong> step.
          </p>
          <label htmlFor="sampling-layer-select-input">
            Specify Sampling Layer
          </label>
          <Select
            id="sampling-layer-select"
            inputId="sampling-layer-select-input"
            css={layerSelectStyles}
            value={sketchLayer}
            onChange={(ev) => setSketchLayer(ev as LayerType)}
            options={getSketchableLayers(layers)}
          />

          <EditLayerMetaData />
        </div>
        <div css={sectionContainerWidthOnly}>
          <p>
            In the panels below, add targeted and/ or multiple samples to the
            plan.
          </p>
        </div>
        <AccordionList>
          <AccordionItem title={'Create User Defined Sample Types'}>
            <div css={sectionContainer}>
              <label htmlFor="sample-type-select">Sample Type</label>
              <Select
                id="sample-type-select"
                inputId="sample-type-select-input"
                css={fullWidthSelectStyles}
                isDisabled={editingStatus ? true : false}
                value={userDefinedSampleType}
                onChange={(ev) =>
                  setUserDefinedSampleType(ev as SampleSelectType)
                }
                options={allSampleOptions}
              />
              <div css={userDefinedButtonStyles}>
                <button
                  css={addButtonStyles}
                  onClick={(ev) => {
                    if (editingStatus === 'create') {
                      setEditingStatus(null);
                      return;
                    }

                    setSampleTypeInputs('create');
                  }}
                >
                  {editingStatus === 'create' ? 'Cancel' : 'Create'}
                </button>
                {userDefinedSampleType && (
                  <React.Fragment>
                    {userDefinedSampleType.isPredefined ? (
                      <button
                        css={addButtonStyles}
                        onClick={(ev) => {
                          if (editingStatus === 'view') {
                            setEditingStatus(null);
                            return;
                          }

                          setSampleTypeInputs('view');
                        }}
                      >
                        {editingStatus === 'view' ? 'Hide' : 'View'}
                      </button>
                    ) : (
                      <button
                        css={addButtonStyles}
                        onClick={(ev) => {
                          if (editingStatus === 'edit') {
                            setEditingStatus(null);
                            return;
                          }

                          setSampleTypeInputs('edit');
                        }}
                      >
                        {editingStatus === 'edit' ? 'Cancel' : 'Edit'}
                      </button>
                    )}
                    <button
                      css={addButtonStyles}
                      onClick={(ev) => {
                        if (editingStatus === 'clone') {
                          setEditingStatus(null);
                          return;
                        }

                        setSampleTypeInputs('clone');
                      }}
                    >
                      {editingStatus === 'clone' ? 'Cancel' : 'Clone'}
                    </button>
                  </React.Fragment>
                )}
              </div>
              {editingStatus && (
                <div>
                  <div>
                    <label htmlFor="sample-type-name-input">
                      Sample Type Name
                    </label>
                    <input
                      id="sample-type-name-input"
                      disabled={editingStatus === 'view'}
                      css={inputStyles}
                      value={sampleTypeName}
                      onChange={(ev) => setSampleTypeName(ev.target.value)}
                    />
                    <label htmlFor="sa-input">
                      Reference Surface Area <em>(sq inch)</em>
                    </label>
                    <input
                      id="sa-input"
                      disabled={editingStatus === 'view'}
                      css={inputStyles}
                      value={sa ? sa : ''}
                      onChange={(ev) => setSa(ev.target.value)}
                    />
                    <label htmlFor="shape-type-select">Shape Type</label>
                    <Select
                      id="shape-type-select"
                      inputId="shape-type-select-input"
                      css={fullWidthSelectStyles}
                      value={shapeType}
                      isDisabled={editingStatus === 'view'}
                      onChange={(ev) => setShapeType(ev as ShapeTypeSelect)}
                      options={[
                        { value: 'point', label: 'Point' },
                        { value: 'polygon', label: 'Polygon' },
                      ]}
                    />
                    {shapeType?.value === 'point' && (
                      <div css={widthAreaCheckContainerStyles}>
                        <div css={inlineMenuStyles}>
                          <div css={widthInputContainerStyles}>
                            <label htmlFor="shape-width-input">
                              Shape Width
                            </label>
                            <input
                              id="shape-width-input"
                              disabled={editingStatus === 'view'}
                              css={widthInputStyles}
                              value={width ? width : ''}
                              onChange={(ev) => setWidth(ev.target.value)}
                            />
                          </div>
                          <button
                            css={checkAreaButtonStyles}
                            onClick={(ev) => {
                              if (!userDefinedSampleType) return;

                              // Create a point in Washington DC
                              const geometry = new Point({
                                spatialReference: { wkid: 3857 },
                                latitude: 38.9072,
                                longitude: -77.0369,
                              });
                              const testPoint = new Graphic({ geometry });

                              createBuffer(testPoint, Number(width));
                              const area = calculateArea(testPoint);

                              let areaStr = '';
                              if (typeof area === 'number') {
                                areaStr = String(Math.round(area * 10) / 10);
                              } else {
                                areaStr = area;
                              }

                              setAreaTest(areaStr);
                            }}
                          >
                            Check Area
                          </button>
                        </div>

                        {areaTest && (
                          <span>Approximate Area: {areaTest} sq in</span>
                        )}
                      </div>
                    )}
                    <label htmlFor="ttpk-input">
                      Time to Prepare Kits <em>(person hrs/sample)</em>
                    </label>
                    <input
                      id="ttpk-input"
                      disabled={editingStatus === 'view'}
                      css={inputStyles}
                      value={ttpk ? ttpk : ''}
                      onChange={(ev) => setTtpk(ev.target.value)}
                    />
                    <label htmlFor="ttc-input">
                      Time to Collect <em>(person hrs/sample)</em>
                    </label>
                    <input
                      id="ttc-input"
                      disabled={editingStatus === 'view'}
                      css={inputStyles}
                      value={ttc ? ttc : ''}
                      onChange={(ev) => setTtc(ev.target.value)}
                    />
                    <label htmlFor="tta-input">
                      Time to Analyze <em>(person hrs/sample)</em>
                    </label>
                    <input
                      id="tta-input"
                      disabled={editingStatus === 'view'}
                      css={inputStyles}
                      value={tta ? tta : ''}
                      onChange={(ev) => setTta(ev.target.value)}
                    />
                    <label htmlFor="ttps-input">
                      Total Time per Sample <em>(person hrs/sample)</em>
                    </label>
                    <input
                      id="ttps-input"
                      disabled={editingStatus === 'view'}
                      css={inputStyles}
                      value={ttps ? ttps : ''}
                      onChange={(ev) => setTtps(ev.target.value)}
                    />
                    <label htmlFor="lod_p-input">
                      Limit of Detection (CFU) Porous{' '}
                      <em>(only used for reference)</em>
                    </label>
                    <input
                      id="lod_p-input"
                      disabled={editingStatus === 'view'}
                      css={inputStyles}
                      value={lodp ? lodp : ''}
                      onChange={(ev) => setLodp(ev.target.value)}
                    />
                    <label htmlFor="lod_non-input">
                      Limit of Detection (CFU) Nonporous{' '}
                      <em>(only used for reference)</em>
                    </label>
                    <input
                      id="lod_non-input"
                      disabled={editingStatus === 'view'}
                      css={inputStyles}
                      value={lodnon ? lodnon : ''}
                      onChange={(ev) => setLodnon(ev.target.value)}
                    />
                    <label htmlFor="mcps-input">
                      Material Cost <em>($/sample)</em>
                    </label>
                    <input
                      id="mcps-input"
                      disabled={editingStatus === 'view'}
                      css={inputStyles}
                      value={mcps ? mcps : ''}
                      onChange={(ev) => setMcps(ev.target.value)}
                    />
                    <label htmlFor="tcps-input">
                      Total Cost per Sample <em>(Labor + Material + Waste)</em>
                    </label>
                    <input
                      id="tcps-input"
                      disabled={editingStatus === 'view'}
                      css={inputStyles}
                      value={tcps ? tcps : ''}
                      onChange={(ev) => setTcps(ev.target.value)}
                    />
                    <label htmlFor="wvps-input">
                      Waste Volume <em>(L/sample)</em>
                    </label>
                    <input
                      id="wvps-input"
                      disabled={editingStatus === 'view'}
                      css={inputStyles}
                      value={wvps ? wvps : ''}
                      onChange={(ev) => setWvps(ev.target.value)}
                    />
                    <label htmlFor="wwps-input">
                      Waste Weight <em>(lbs/sample)</em>
                    </label>
                    <input
                      id="wwps-input"
                      disabled={editingStatus === 'view'}
                      css={inputStyles}
                      value={wwps ? wwps : ''}
                      onChange={(ev) => setWwps(ev.target.value)}
                    />
                    <label htmlFor="alc-input">Analysis Labor Cost</label>
                    <input
                      id="alc-input"
                      disabled={editingStatus === 'view'}
                      css={inputStyles}
                      value={alc ? alc : ''}
                      onChange={(ev) => setAlc(ev.target.value)}
                    />
                    <label htmlFor="amc-input">Analysis Material Cost</label>
                    <input
                      id="amc-input"
                      disabled={editingStatus === 'view'}
                      css={inputStyles}
                      value={amc ? amc : ''}
                      onChange={(ev) => setAmc(ev.target.value)}
                    />
                  </div>
                  {validationMessage &&
                    userDefinedValidationMessage(validationMessage)}
                  <div css={inlineMenuStyles}>
                    {editingStatus !== 'view' && (
                      <button
                        css={addButtonStyles}
                        onClick={(ev) => {
                          const isValid = validateEdits();
                          if (isValid && sampleTypeName) {
                            const newSampleType = {
                              value: sampleTypeName,
                              label: sampleTypeName,
                              isPredefined: false,
                            };

                            // update the sample attributes
                            const newAttributes = {
                              OBJECTID: '-1',
                              PERMANENT_IDENTIFIER: null,
                              GLOBALID: null,
                              TYPE: sampleTypeName,
                              IsPoint:
                                shapeType?.value === 'point' ? true : false,
                              Width: Number(width),
                              TTPK: ttpk ? ttpk.toString() : null,
                              TTC: ttc ? ttc.toString() : null,
                              TTA: tta ? tta.toString() : null,
                              TTPS: ttps ? ttps.toString() : null,
                              LOD_P: lodp ? lodp.toString() : null,
                              LOD_NON: lodnon ? lodnon.toString() : null,
                              MCPS: mcps ? mcps.toString() : null,
                              TCPS: tcps ? tcps.toString() : null,
                              WVPS: wvps ? wvps.toString() : null,
                              WWPS: wwps ? wwps.toString() : null,
                              SA: sa ? sa.toString() : null,
                              AA: '',
                              OAA: '', // TODO: Delete this before release - original AA for debug
                              ALC: alc ? alc.toString() : null,
                              AMC: amc ? amc.toString() : null,
                              Notes: '',
                              CONTAMTYPE: null,
                              CONTAMVAL: null,
                              CONTAMUNIT: null,
                              CREATEDDATE: null,
                              UPDATEDDATE: null,
                              USERNAME: null,
                              ORGANIZATION: null,
                              ELEVATIONSERIES: null,
                            };

                            // add/update the sample's attributes
                            sampleAttributes[sampleTypeName] = newAttributes;
                            setUserDefinedAttributes((item) => {
                              item.attributes[sampleTypeName] = newAttributes;

                              // if the sampleTypeName changed, remove the attributes tied to the old name
                              if (
                                didSampleTypeNameChange() &&
                                userDefinedSampleType
                              ) {
                                delete item.attributes[
                                  userDefinedSampleType.label
                                ];
                              }

                              return {
                                editCount: item.editCount + 1,
                                attributes: item.attributes,
                              };
                            });

                            // add the new option to the dropdown if it doesn't exist
                            const hasSample =
                              userDefinedOptions.findIndex(
                                (option) => option.label === sampleTypeName,
                              ) > -1;
                            if (!hasSample) {
                              setUserDefinedOptions((options) => {
                                if (!didSampleTypeNameChange()) {
                                  return [...options, newSampleType];
                                }

                                const newOptions: SampleSelectType[] = [];
                                options.forEach((option) => {
                                  // if the sampleTypeName changed, replace the option tied to the old name with the new one
                                  if (
                                    didSampleTypeNameChange() &&
                                    option.label ===
                                      userDefinedSampleType?.label
                                  ) {
                                    newOptions.push(newSampleType);
                                    return;
                                  }

                                  newOptions.push(option);
                                });

                                return newOptions;
                              });
                            }

                            if (
                              editingStatus === 'edit' &&
                              userDefinedSampleType
                            ) {
                              const oldType = userDefinedSampleType.label;

                              // Update the attributes of the graphics on the map on edits
                              layers.forEach((layer) => {
                                if (
                                  !['Samples', 'VSP'].includes(
                                    layer.layerType,
                                  ) ||
                                  layer.sketchLayer.type !== 'graphics'
                                ) {
                                  return;
                                }

                                updateAttributes({
                                  graphics: layer.sketchLayer.graphics.toArray(),
                                  newAttributes,
                                  oldType,
                                });
                              });

                              //Update the attributes of the edits context/session storage
                              setEdits((edits) => {
                                edits.edits.forEach((edits) => {
                                  if (
                                    !['Samples', 'VSP'].includes(
                                      edits.layerType,
                                    )
                                  ) {
                                    return;
                                  }

                                  updateAttributes({
                                    graphics: edits.adds as __esri.Graphic[],
                                    newAttributes,
                                    oldType,
                                  });
                                  updateAttributes({
                                    graphics: edits.updates as __esri.Graphic[],
                                    newAttributes,
                                    oldType,
                                  });
                                  updateAttributes({
                                    graphics: edits.published as __esri.Graphic[],
                                    newAttributes,
                                    oldType,
                                  });
                                });

                                return {
                                  count: edits.count + 1,
                                  edits: edits.edits,
                                };
                              });
                            }

                            // select the new sample type
                            setUserDefinedSampleType(newSampleType);

                            setEditingStatus(null);
                          }
                        }}
                      >
                        Save
                      </button>
                    )}
                    <button
                      css={addButtonStyles}
                      onClick={(ev) => {
                        setEditingStatus(null);
                      }}
                    >
                      {editingStatus === 'view' ? 'Hide' : 'Cancel'}
                    </button>
                  </div>
                </div>
              )}{' '}
            </div>
          </AccordionItem>
          <AccordionItem
            title={'Add Targeted Samples'}
            initiallyExpanded={true}
          >
            <div css={sectionContainer}>
              <div>
                <h3>EPA Sample Types</h3>
                <div css={sketchButtonContainerStyles}>
                  {SampleSelectOptions.map((option, index) => {
                    const sampleType = option.label;
                    const isPoint = sampleAttributes[sampleType].IsPoint;
                    return (
                      <SketchButton
                        key={index}
                        label={sampleType}
                        iconClass={
                          isPoint ? 'fas fa-pen-fancy' : 'fas fa-draw-polygon'
                        }
                        onClick={() => sketchButtonClick(sampleType)}
                      />
                    );
                  })}
                </div>
              </div>
              {userDefinedOptions.length > 0 && (
                <div>
                  <br />
                  <h3>User Defined Sample Types</h3>
                  <div css={sketchButtonContainerStyles}>
                    {userDefinedOptions.map((option, index) => {
                      if (option.isPredefined) return null;

                      const sampleType = option.label;
                      const isPoint = sampleAttributes[sampleType].IsPoint;
                      return (
                        <SketchButton
                          key={index}
                          label={sampleType}
                          iconClass={
                            isPoint ? 'fas fa-pen-fancy' : 'fas fa-draw-polygon'
                          }
                          onClick={() => sketchButtonClick(sampleType)}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </AccordionItem>
          <AccordionItem title={'Add Multiple Random Samples'}>
            <div css={sectionContainer}>
              {sketchLayer?.layerType === 'VSP' && cantUseWithVspMessage}
              {sketchLayer?.layerType !== 'VSP' && (
                <React.Fragment>
                  <label htmlFor="number-of-samples-input">
                    Number of Samples
                  </label>
                  <input
                    id="number-of-samples-input"
                    css={inputStyles}
                    value={numberRandomSamples}
                    onChange={(ev) => setNumberRandomSamples(ev.target.value)}
                  />
                  <label htmlFor="sample-type-select-input">Sample Type</label>
                  <Select
                    id="sample-type-select"
                    inputId="sample-type-select-input"
                    css={fullWidthSelectStyles}
                    value={sampleType}
                    onChange={(ev) => setSampleType(ev as SampleSelectType)}
                    options={SampleSelectOptions}
                  />
                  <label htmlFor="aoi-mask-select-input">
                    Area of Interest Mask
                  </label>
                  <div css={inlineMenuStyles}>
                    <Select
                      id="aoi-mask-select"
                      inputId="aoi-mask-select-input"
                      css={inlineSelectStyles}
                      isClearable={true}
                      value={aoiSketchLayer}
                      onChange={(ev) => setAoiSketchLayer(ev as LayerType)}
                      options={layers.filter(
                        (layer) => layer.layerType === 'Area of Interest',
                      )}
                    />
                    <button
                      css={addButtonStyles}
                      onClick={(ev) => {
                        setGoTo('addData');
                        setGoToOptions({
                          from: 'file',
                          layerType: 'Area of Interest',
                        });
                      }}
                    >
                      Add
                    </button>
                  </div>
                  <div css={centerTextStyles}>
                    <em>OR</em>
                  </div>
                  <button
                    id="aoi"
                    title="Draw Area of Interest Mask"
                    className="sketch-button"
                    onClick={sketchAoiButtonClick}
                    css={sketchAoiButtonStyles}
                  >
                    <span css={sketchAoiTextStyles}>
                      <i className="fas fa-draw-polygon" />{' '}
                      <span>Draw Area of Interest Mask</span>
                    </span>
                  </button>
                  {generateRandomResponse.status === 'success' &&
                    sketchLayer &&
                    generateRandomSuccessMessage(
                      generateRandomResponse.data.length,
                      sketchLayer.label,
                    )}
                  {generateRandomResponse.status === 'failure' &&
                    webServiceErrorMessage}
                  {generateRandomResponse.status === 'exceededTransferLimit' &&
                    generateRandomExceededTransferLimitMessage}
                  {numberRandomSamples &&
                    aoiSketchLayer?.sketchLayer.type === 'graphics' &&
                    aoiSketchLayer.sketchLayer.graphics.length > 0 && (
                      <button css={submitButtonStyles} onClick={randomSamples}>
                        {generateRandomResponse.status !== 'fetching' &&
                          'Submit'}
                        {generateRandomResponse.status === 'fetching' && (
                          <React.Fragment>
                            <i className="fas fa-spinner fa-pulse" />
                            &nbsp;&nbsp;Loading...
                          </React.Fragment>
                        )}
                      </button>
                    )}
                </React.Fragment>
              )}
            </div>
          </AccordionItem>
        </AccordionList>
      </div>
      <div css={sectionContainer}>
        <NavigationButton goToPanel="calculate" />
      </div>
    </div>
  );
}

export default LocateSamples;
