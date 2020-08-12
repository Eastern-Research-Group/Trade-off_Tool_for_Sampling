/** @jsx jsx */

import React from 'react';
import { jsx, css } from '@emotion/core';
// components
import { AccordionList, AccordionItem } from 'components/Accordion';
import ColorPicker from 'components/ColorPicker';
import { EditScenario, EditLayer } from 'components/EditLayerMetaData';
import Select from 'components/Select';
import NavigationButton from 'components/NavigationButton';
// contexts
import { useEsriModulesContext } from 'contexts/EsriModules';
import { DialogContext } from 'contexts/Dialog';
import { NavigationContext } from 'contexts/Navigation';
import { SketchContext } from 'contexts/Sketch';
// types
import { LayerType } from 'types/Layer';
import { EditsType, ScenarioEditsType, LayerEditsType } from 'types/Edits';
// config
import {
  sampleAttributes,
  SampleSelectOptions,
  SampleSelectType,
  PolygonSymbol,
} from 'config/sampleAttributes';
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
  getCurrentDateTime,
  getDefaultAreaOfInterestLayer,
  createSampleLayer,
  getPopupTemplate,
  updateLayerEdits,
  updatePolygonSymbol,
} from 'utils/sketchUtils';
import { geoprocessorFetch } from 'utils/fetchUtils';
// styles
import { reactSelectStyles } from 'styles';
import { RGBColor } from 'react-color';

type ShapeTypeSelect = {
  value: string;
  label: string;
};

type EditType = 'create' | 'edit' | 'clone' | 'view';

// Gets a list of scenarios from the provided edits list
function getScenarios(edits: EditsType) {
  return edits.edits.filter(
    (item) => item.type === 'scenario',
  ) as ScenarioEditsType[];
}

// gets an array of layers, included in the provided edits parameter,
// that can be used with the sketch widget. The search will look in
// child layers of scenarios as well.
function getSketchableLayers(
  layers: LayerType[],
  edits: (ScenarioEditsType | LayerEditsType)[],
) {
  return layers.filter(
    (layer) =>
      (layer.layerType === 'Samples' || layer.layerType === 'VSP') &&
      edits.findIndex(
        (editsLayer) =>
          editsLayer.type === 'layer' && editsLayer.layerId === layer.layerId,
      ) > -1,
  ) as LayerType[];
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
    usedNames.push(sampleType.value);
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

/**
 * Converts a number array (esri rgb color) to an rgb object (react-color).
 */
function convertArrayToRgbColor(color: number[]) {
  return {
    r: color[0],
    g: color[1],
    b: color[2],
    a: color.length > 3 ? color[3] : 1,
  } as RGBColor;
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

const colorSettingContainerStyles = css`
  margin-bottom: 15px;
`;

const colorContainerStyles = css`
  display: flex;
`;

const colorLabelStyles = css`
  margin-right: 10px;
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
      title={`Draw a ${label}`}
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

const iconButtonContainerStyles = css`
  display: flex;
  justify-content: space-between;
`;

const iconButtonStyles = css`
  width: 25px;
  margin: 0 2px;
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
  const { setOptions } = React.useContext(DialogContext);
  const {
    setGoTo,
    setGoToOptions,
    trainingMode,
    setTrainingMode,
  } = React.useContext(NavigationContext);
  const {
    autoZoom,
    setAutoZoom,
    edits,
    setEdits,
    layersInitialized,
    layers,
    setLayers,
    map,
    polygonSymbol,
    setPolygonSymbol,
    selectedScenario,
    setSelectedScenario,
    sketchLayer,
    setSketchLayer,
    aoiSketchLayer,
    setAoiSketchLayer,
    sketchVM,
    aoiSketchVM,
    getGpMaxRecordCount,
    userDefinedOptions,
    setUserDefinedOptions,
    userDefinedAttributes,
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

    setSketchLayerInitialized(true);

    // determine which scenario to get layers for and
    // select a scenario if necessary
    const scenarios = getScenarios(edits);
    let layerEdits = edits.edits;
    if (selectedScenario) {
      // get the layers for the selected scenario
      layerEdits = selectedScenario.layers;
    }
    if (!selectedScenario && scenarios.length > 0) {
      // select the first availble scenario and get it's layers
      setSelectedScenario(scenarios[0]);
      layerEdits = scenarios[0].layers;
    }

    // get the first layer that can be used for sketching and return
    const sketchableLayers = getSketchableLayers(layers, layerEdits);
    if (!sketchLayer && sketchableLayers.length > 0) {
      // select the first availble sample layer. This will be
      // an unlinked layer if there is no selected scenario or
      // the selected scenario has no layers
      setSketchLayer(sketchableLayers[0]);
    }

    // check if the default sketch layer has been added already or not
    const defaultIndex = sketchableLayers.findIndex(
      (layer) => layer.name === 'Default Sample Layer',
    );
    if (defaultIndex > -1) return;

    // no sketchable layers were available, create one
    const tempSketchLayer = createSampleLayer(GraphicsLayer);

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
    edits,
    layersInitialized,
    layers,
    setLayers,
    map,
    selectedScenario,
    setSelectedScenario,
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
  ] = React.useState<SampleSelectType>(SampleSelectOptions[0]);

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
    let shapeType = sampleAttributes[label].ShapeType;

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
    let allSampleOptions: SampleSelectType[] = [];

    // Add in the standard sample types. Append "(edited)" to the
    // label if the user made changes to one of the standard types.
    SampleSelectOptions.forEach((option) => {
      allSampleOptions.push({
        value: option.value,
        label: userDefinedAttributes.attributes.hasOwnProperty(option.value)
          ? `${option.value} (edited)`
          : option.label,
        isPredefined: option.isPredefined,
      });
    });

    // Add on any user defined sample types
    allSampleOptions = allSampleOptions.concat(userDefinedOptions);

    setAllSampleOptions(allSampleOptions);
  }, [userDefinedOptions, userDefinedAttributes]);

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
    let sampleTypeName = userDefinedSampleType.value;
    const attributes = sampleAttributes[sampleTypeName];
    if (editType === 'clone') {
      sampleTypeName = getSampleTypeName(allSampleOptions, sampleTypeName);
    }

    const shapeType =
      attributes.ShapeType === 'point'
        ? { value: 'point', label: 'Point' }
        : { value: 'polygon', label: 'Polygon' };

    setEditingStatus(editType);
    setShapeType(shapeType);
    setWidth(attributes.Width.toString());
    setAreaTest(null);
    setTtpk(attributes.TTPK ? attributes.TTPK.toString() : null);
    setTtc(attributes.TTC ? attributes.TTC.toString() : null);
    setTta(attributes.TTA ? attributes.TTA.toString() : null);
    setTtps(attributes.TTPS ? attributes.TTPS.toString() : null);
    setLodp(attributes.LOD_P ? attributes.LOD_P.toString() : null);
    setLodnon(attributes.LOD_NON ? attributes.LOD_NON.toString() : null);
    setMcps(attributes.MCPS ? attributes.MCPS.toString() : null);
    setTcps(attributes.TCPS ? attributes.TCPS.toString() : null);
    setWvps(attributes.WVPS ? attributes.WVPS.toString() : null);
    setWwps(attributes.WWPS ? attributes.WWPS.toString() : null);
    setSa(attributes.SA ? attributes.SA.toString() : null);
    setAlc(attributes.ALC ? attributes.ALC.toString() : null);
    setAmc(attributes.AMC ? attributes.AMC.toString() : null);
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
      sampleTypeName !== userDefinedSampleType.value
    );
  }

  // Updates the attributes of graphics that have had property changes
  function updateAttributes({
    graphics,
    newAttributes,
    oldType,
  }: {
    graphics: __esri.Graphic[];
    newAttributes: any;
    oldType: string;
  }) {
    const editedGraphics: __esri.Graphic[] = [];
    graphics.forEach((graphic: __esri.Graphic) => {
      // update attributes for the edited type
      if (graphic.attributes.TYPE === oldType) {
        const widthChanged = graphic.attributes.Width !== newAttributes.Width;
        const shapeTypeChanged =
          graphic.attributes.ShapeType !== newAttributes.ShapeType;

        graphic.attributes.TYPE = newAttributes.TYPE;
        graphic.attributes.ShapeType = newAttributes.ShapeType;
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
        if (
          newAttributes.ShapeType === 'point' &&
          (widthChanged || shapeTypeChanged)
        ) {
          // convert the geometry _esriPolygon if it is missing stuff
          createBuffer(graphic as __esri.Graphic, Number(width));
        }

        editedGraphics.push(graphic);
      }
    });

    return editedGraphics;
  }

  // Changes the selected layer if the scenario is changed. The first
  // available layer in the scenario will be chosen. If the scenario
  // has no layers, then the first availble unlinked layer is chosen.
  React.useEffect(() => {
    if (!selectedScenario) return;
    if (
      sketchLayer &&
      (!sketchLayer.parentLayer ||
        sketchLayer.parentLayer.id === selectedScenario.layerId)
    ) {
      return;
    }

    // select the first layer within the selected scenario
    if (selectedScenario.layers.length > 0) {
      const newSketchLayer = layers.find(
        (layer) => layer.layerId === selectedScenario.layers[0].layerId,
      );
      if (newSketchLayer) {
        setSketchLayer(newSketchLayer);
        return;
      }
    }

    // select the first unlinked layer
    const newSketchLayer = layers.find((layer) => !layer.parentLayer);
    if (newSketchLayer) setSketchLayer(newSketchLayer);
  }, [layers, selectedScenario, sketchLayer, setSketchLayer]);

  // scenario and layer edit UI visibility controls
  const [addScenarioVisible, setAddScenarioVisible] = React.useState(false);
  const [editScenarioVisible, setEditScenarioVisible] = React.useState(false);
  const [addLayerVisible, setAddLayerVisible] = React.useState(false);
  const [editLayerVisible, setEditLayerVisible] = React.useState(false);

  // get a list of scenarios from edits
  const scenarios = getScenarios(edits);

  // build the list of layers to be displayed in the sample layer dropdown
  const sampleLayers: { label: string; options: LayerType[] }[] = [];
  if (selectedScenario && selectedScenario.layers.length > 0) {
    // get layers for the selected scenario
    sampleLayers.push({
      label: selectedScenario.label,
      options: getSketchableLayers(layers, selectedScenario.layers),
    });
  }

  // get unlinked layers
  sampleLayers.push({
    label: 'Unlinked Layers',
    options: getSketchableLayers(layers, edits.edits),
  });

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
              <br />
              <input
                id="auto-zoom-toggle"
                type="checkbox"
                checked={autoZoom}
                onChange={(ev) => setAutoZoom(!autoZoom)}
              />
              <label htmlFor="auto-zoom-toggle">Auto Zoom</label>
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

          {scenarios.length === 0 ? (
            <EditScenario />
          ) : (
            <React.Fragment>
              <div css={iconButtonContainerStyles}>
                <label htmlFor="sampling-layer-select-input2">
                  Specify Scenario
                </label>
                <div>
                  {selectedScenario && (
                    <React.Fragment>
                      <button css={iconButtonStyles}>
                        <i className="fas fa-trash-alt" />
                      </button>
                      <button
                        css={iconButtonStyles}
                        onClick={() => {
                          setAddScenarioVisible(false);
                          setEditScenarioVisible(!editScenarioVisible);
                        }}
                      >
                        <i
                          className={
                            editScenarioVisible ? 'fas fa-times' : 'fas fa-edit'
                          }
                        />
                      </button>
                    </React.Fragment>
                  )}
                  <button
                    css={iconButtonStyles}
                    onClick={() => {
                      setEditScenarioVisible(false);
                      setAddScenarioVisible(!addScenarioVisible);
                    }}
                  >
                    <i
                      className={
                        addScenarioVisible ? 'fas fa-times' : 'fas fa-plus'
                      }
                    />
                  </button>
                </div>
              </div>
              <Select
                id="sampling-layer-select2"
                inputId="sampling-layer-select-input2"
                css={layerSelectStyles}
                value={selectedScenario}
                onChange={(ev) => setSelectedScenario(ev as ScenarioEditsType)}
                options={scenarios}
              />
              {addScenarioVisible && (
                <EditScenario onSave={() => setAddScenarioVisible(false)} />
              )}
              {editScenarioVisible && (
                <EditScenario
                  initialScenario={selectedScenario}
                  onSave={() => setEditScenarioVisible(false)}
                />
              )}
            </React.Fragment>
          )}

          <div css={iconButtonContainerStyles}>
            <label htmlFor="sampling-layer-select-input">
              Active Sampling Layer
            </label>
            <div>
              {sketchLayer && (
                <React.Fragment>
                  <button css={iconButtonStyles}>
                    <i className="fas fa-trash-alt" />
                  </button>
                  <button css={iconButtonStyles}>
                    <i
                      className={
                        sketchLayer.parentLayer
                          ? 'fas fa-unlink'
                          : 'fas fa-link'
                      }
                    />
                  </button>
                  <button
                    css={iconButtonStyles}
                    onClick={() => setEditLayerVisible(!editLayerVisible)}
                  >
                    <i
                      className={
                        editLayerVisible ? 'fas fa-times' : 'fas fa-edit'
                      }
                    />
                  </button>
                </React.Fragment>
              )}
              <button
                css={iconButtonStyles}
                onClick={() => setAddLayerVisible(!addLayerVisible)}
              >
                <i
                  className={addLayerVisible ? 'fas fa-times' : 'fas fa-plus'}
                />
              </button>
            </div>
          </div>
          <Select
            id="sampling-layer-select"
            inputId="sampling-layer-select-input"
            css={layerSelectStyles}
            value={sketchLayer}
            onChange={(ev) => setSketchLayer(ev as LayerType)}
            options={sampleLayers}
          />
          {addLayerVisible && (
            <EditLayer onSave={() => setAddLayerVisible(false)} />
          )}
          {editLayerVisible && (
            <EditLayer
              initialLayer={sketchLayer}
              onSave={() => setEditLayerVisible(false)}
            />
          )}
        </div>
        <div css={sectionContainerWidthOnly}>
          <p>
            In the panels below, add targeted and/ or multiple samples to the
            plan.
          </p>
        </div>
        <AccordionList>
          {!trainingMode && (
            <AccordionItem title={'Create User Defined Sample Types'}>
              <div css={sectionContainer}>
                <div css={iconButtonContainerStyles}>
                  <label htmlFor="sample-type-select-input">Sample Type</label>
                  <div>
                    {userDefinedSampleType && (
                      <React.Fragment>
                        {!editingStatus && !userDefinedSampleType.isPredefined && (
                          <button
                            css={iconButtonStyles}
                            title="Delete"
                            onClick={() => {
                              const sampleTypeName =
                                userDefinedSampleType.value;

                              setOptions({
                                title: 'Would you like to continue?',
                                ariaLabel: 'Would you like to continue?',
                                description:
                                  'This operation will delete the sample type and any associated samples.',
                                onContinue: () => {
                                  setUserDefinedOptions(
                                    userDefinedOptions.filter(
                                      (option) =>
                                        option.value !== sampleTypeName,
                                    ),
                                  );
                                  setUserDefinedAttributes((userDefined) => {
                                    delete userDefined.attributes[
                                      sampleTypeName
                                    ];
                                    userDefined.editCount += 1;
                                    return userDefined;
                                  });

                                  // Update the attributes of the graphics on the map on edits
                                  let editsCopy: EditsType = edits;
                                  layers.forEach((layer) => {
                                    if (
                                      !['Samples', 'VSP'].includes(
                                        layer.layerType,
                                      ) ||
                                      layer.sketchLayer.type !== 'graphics'
                                    ) {
                                      return;
                                    }

                                    const graphicsToRemove: __esri.Graphic[] = [];
                                    layer.sketchLayer.graphics.forEach(
                                      (graphic) => {
                                        if (
                                          graphic.attributes.TYPE ===
                                          sampleTypeName
                                        ) {
                                          graphicsToRemove.push(graphic);
                                        }
                                      },
                                    );
                                    layer.sketchLayer.removeMany(
                                      graphicsToRemove,
                                    );

                                    if (graphicsToRemove.length > 0) {
                                      const collection = new Collection<
                                        __esri.Graphic
                                      >();
                                      collection.addMany(graphicsToRemove);
                                      editsCopy = updateLayerEdits({
                                        edits: editsCopy,
                                        layer,
                                        type: 'delete',
                                        changes: collection,
                                      });
                                    }
                                  });

                                  setEdits(editsCopy);

                                  // TODO: Add code for deleteing the user defined type
                                  //       from ArcGIS Online.

                                  setUserDefinedSampleType(null);
                                },
                              });
                            }}
                          >
                            <i className="fas fa-trash-alt" />
                            <span className="sr-only">Delete</span>
                          </button>
                        )}
                        <button
                          css={iconButtonStyles}
                          title={editingStatus === 'clone' ? 'Cancel' : 'Clone'}
                          onClick={(ev) => {
                            if (editingStatus === 'clone') {
                              setEditingStatus(null);
                              return;
                            }

                            setSampleTypeInputs('clone');
                          }}
                        >
                          <i
                            className={
                              editingStatus === 'clone'
                                ? 'fas fa-times'
                                : 'fas fa-clone'
                            }
                          />
                          <span className="sr-only">
                            {editingStatus === 'clone' ? 'Cancel' : 'Clone'}
                          </span>
                        </button>
                        {userDefinedSampleType.isPredefined ? (
                          <button
                            css={iconButtonStyles}
                            title={editingStatus === 'view' ? 'Hide' : 'View'}
                            onClick={(ev) => {
                              if (editingStatus === 'view') {
                                setEditingStatus(null);
                                return;
                              }

                              setSampleTypeInputs('view');
                            }}
                          >
                            <i
                              className={
                                editingStatus === 'view'
                                  ? 'fas fa-times'
                                  : 'fas fa-edit'
                              }
                            />
                            <span className="sr-only">
                              {editingStatus === 'view' ? 'Hide' : 'View'}
                            </span>
                          </button>
                        ) : (
                          <button
                            css={iconButtonStyles}
                            title={editingStatus === 'edit' ? 'Cancel' : 'Edit'}
                            onClick={(ev) => {
                              if (editingStatus === 'edit') {
                                setEditingStatus(null);
                                return;
                              }

                              setSampleTypeInputs('edit');
                            }}
                          >
                            <i
                              className={
                                editingStatus === 'edit'
                                  ? 'fas fa-times'
                                  : 'fas fa-edit'
                              }
                            />
                            <span className="sr-only">
                              {editingStatus === 'edit' ? 'Cancel' : 'Edit'}
                            </span>
                          </button>
                        )}
                      </React.Fragment>
                    )}
                    <button
                      css={iconButtonStyles}
                      title={editingStatus === 'create' ? 'Cancel' : 'Create'}
                      onClick={(ev) => {
                        if (editingStatus === 'create') {
                          setEditingStatus(null);
                          return;
                        }

                        setSampleTypeInputs('create');
                      }}
                    >
                      <i
                        className={
                          editingStatus === 'create'
                            ? 'fas fa-times'
                            : 'fas fa-plus'
                        }
                      />
                      <span className="sr-only">
                        {editingStatus === 'create' ? 'Cancel' : 'Create'}
                      </span>
                    </button>
                  </div>
                </div>
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
                {editingStatus && (
                  <div>
                    <div>
                      <label htmlFor="sample-type-name-input">
                        Sample Type Name
                      </label>
                      <input
                        id="sample-type-name-input"
                        disabled={
                          editingStatus === 'view' ||
                          (editingStatus === 'edit' &&
                            userDefinedSampleType?.isPredefined)
                        }
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
                      <label htmlFor="shape-type-select-input">
                        Shape Type
                      </label>
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
                        Total Cost per Sample{' '}
                        <em>(Labor + Material + Waste)</em>
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
                            const predefinedEdited =
                              editingStatus === 'edit' &&
                              userDefinedSampleType?.isPredefined;
                            if (isValid && sampleTypeName && shapeType) {
                              let newSampleType = {
                                value: sampleTypeName,
                                label: sampleTypeName,
                                isPredefined: false,
                              };
                              if (predefinedEdited && userDefinedSampleType) {
                                newSampleType = {
                                  value: userDefinedSampleType.value,
                                  label: `${userDefinedSampleType?.value} (edited)`,
                                  isPredefined:
                                    userDefinedSampleType.isPredefined,
                                };
                              }

                              // update the sample attributes
                              const newAttributes = {
                                OBJECTID: '-1',
                                PERMANENT_IDENTIFIER: null,
                                GLOBALID: null,
                                TYPE: sampleTypeName,
                                ShapeType: shapeType.value,
                                Width: Number(width),
                                TTPK: ttpk ? Number(ttpk) : null,
                                TTC: ttc ? Number(ttc) : null,
                                TTA: tta ? Number(tta) : null,
                                TTPS: ttps ? Number(ttps) : null,
                                LOD_P: lodp ? Number(lodp) : null,
                                LOD_NON: lodnon ? Number(lodnon) : null,
                                MCPS: mcps ? Number(mcps) : null,
                                TCPS: tcps ? Number(tcps) : null,
                                WVPS: wvps ? Number(wvps) : null,
                                WWPS: wwps ? Number(wwps) : null,
                                SA: sa ? Number(sa) : null,
                                AA: null,
                                OAA: null, // TODO: Delete this before release - original AA for debug
                                ALC: alc ? Number(alc) : null,
                                AMC: amc ? Number(amc) : null,
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
                                    userDefinedSampleType.value
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
                                  (option) => option.value === sampleTypeName,
                                ) > -1;
                              if (
                                !hasSample &&
                                userDefinedSampleType &&
                                (editingStatus !== 'edit' ||
                                  (editingStatus === 'edit' &&
                                    !userDefinedSampleType.isPredefined))
                              ) {
                                setUserDefinedOptions((options) => {
                                  if (!didSampleTypeNameChange()) {
                                    return [...options, newSampleType];
                                  }

                                  const newOptions: SampleSelectType[] = [];
                                  options.forEach((option) => {
                                    // if the sampleTypeName changed, replace the option tied to the old name with the new one
                                    if (
                                      didSampleTypeNameChange() &&
                                      option.value ===
                                        userDefinedSampleType.value
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
                                const oldType = userDefinedSampleType.value;

                                // Update the attributes of the graphics on the map on edits
                                let editsCopy: EditsType = edits;
                                layers.forEach((layer) => {
                                  if (
                                    !['Samples', 'VSP'].includes(
                                      layer.layerType,
                                    ) ||
                                    layer.sketchLayer.type !== 'graphics'
                                  ) {
                                    return;
                                  }

                                  const editedGraphics = updateAttributes({
                                    graphics: layer.sketchLayer.graphics.toArray(),
                                    newAttributes,
                                    oldType,
                                  });

                                  if (editedGraphics.length > 0) {
                                    const collection = new Collection<
                                      __esri.Graphic
                                    >();
                                    collection.addMany(editedGraphics);
                                    editsCopy = updateLayerEdits({
                                      edits: editsCopy,
                                      layer,
                                      type: 'update',
                                      changes: collection,
                                    });
                                  }
                                });

                                setEdits(editsCopy);
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
                )}
              </div>
            </AccordionItem>
          )}
          <AccordionItem
            title={'Add Targeted Samples'}
            initiallyExpanded={true}
          >
            <div css={sectionContainer}>
              <div css={colorSettingContainerStyles}>
                <h3>Color Settings</h3>
                <div css={inlineMenuStyles}>
                  <div css={colorContainerStyles}>
                    <span css={colorLabelStyles}>Fill</span>
                    <ColorPicker
                      color={convertArrayToRgbColor(polygonSymbol.color)}
                      onChange={(color: RGBColor) => {
                        const alpha = color.a ? color.a : 1;
                        const newPolygonSymbol: PolygonSymbol = {
                          ...polygonSymbol,
                          color: [color.r, color.g, color.b, alpha],
                        };
                        setPolygonSymbol(newPolygonSymbol);

                        // update all of the symbols
                        updatePolygonSymbol(layers, newPolygonSymbol);
                      }}
                    />
                  </div>
                  <div css={colorContainerStyles}>
                    <span css={colorLabelStyles}>Outline</span>
                    <ColorPicker
                      color={convertArrayToRgbColor(
                        polygonSymbol.outline.color,
                      )}
                      onChange={(color: RGBColor) => {
                        const alpha = color.a ? color.a : 1;
                        const newPolygonSymbol: PolygonSymbol = {
                          ...polygonSymbol,
                          outline: {
                            ...polygonSymbol.outline,
                            color: [color.r, color.g, color.b, alpha],
                          },
                        };
                        setPolygonSymbol(newPolygonSymbol);

                        // update all of the symbols
                        updatePolygonSymbol(layers, newPolygonSymbol);
                      }}
                    />
                  </div>
                </div>
              </div>
              <div>
                <h3>EPA Sample Types</h3>
                <div css={sketchButtonContainerStyles}>
                  {SampleSelectOptions.map((option, index) => {
                    const sampleType = option.value;
                    const shapeType = sampleAttributes[sampleType].ShapeType;
                    const edited = userDefinedAttributes.attributes.hasOwnProperty(
                      sampleType,
                    );
                    return (
                      <SketchButton
                        key={index}
                        label={edited ? `${sampleType} (edited)` : sampleType}
                        iconClass={
                          shapeType === 'point'
                            ? 'fas fa-pen-fancy'
                            : 'fas fa-draw-polygon'
                        }
                        onClick={() => sketchButtonClick(sampleType)}
                      />
                    );
                  })}
                </div>
              </div>
              {!trainingMode && userDefinedOptions.length > 0 && (
                <div>
                  <br />
                  <h3>User Defined Sample Types</h3>
                  <div css={sketchButtonContainerStyles}>
                    {userDefinedOptions.map((option, index) => {
                      if (option.isPredefined) return null;

                      const sampleType = option.value;
                      const shapeType = sampleAttributes[sampleType].ShapeType;
                      return (
                        <SketchButton
                          key={index}
                          label={sampleType}
                          iconClass={
                            shapeType === 'point'
                              ? 'fas fa-pen-fancy'
                              : 'fas fa-draw-polygon'
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
                      styles={reactSelectStyles}
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
