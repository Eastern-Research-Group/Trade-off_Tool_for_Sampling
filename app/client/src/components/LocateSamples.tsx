/** @jsxImportSource @emotion/react */

import React, { Fragment, useContext, useEffect, useState } from 'react';
import { css } from '@emotion/react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import Collection from '@arcgis/core/core/Collection';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import Graphic from '@arcgis/core/Graphic';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import GroupLayer from '@arcgis/core/layers/GroupLayer';
import Point from '@arcgis/core/geometry/Point';
// import SimpleMarkerSymbol from '@arcgis/core/symbols/SimpleMarkerSymbol';
import TextSymbol from '@arcgis/core/symbols/TextSymbol';
// components
import { AccordionList, AccordionItem } from 'components/Accordion';
// import ColorPicker from 'components/ColorPicker';
import {
  EditScenario,
  // EditLayer,
} from 'components/EditLayerMetaData';
import LoadingSpinner from 'components/LoadingSpinner';
import { buildingMapPopup } from 'components/MapPopup';
import MessageBox from 'components/MessageBox';
import NavigationButton from 'components/NavigationButton';
import Select from 'components/Select';
// contexts
import { CalculateContext } from 'contexts/Calculate';
// import { DialogContext } from 'contexts/Dialog';
import {
  useLayerProps,
  useSampleTypesContext,
  useServicesContext,
} from 'contexts/LookupFiles';
import { NavigationContext } from 'contexts/Navigation';
// import { PublishContext } from 'contexts/Publish';
import { SketchContext } from 'contexts/Sketch';
// types
import { LayerType } from 'types/Layer';
import { EditsType, ScenarioEditsType } from 'types/Edits';
import { ErrorType } from 'types/Misc';
// config
// import {
//   // AttributeItems,
//   // SampleSelectType,
//   // PolygonSymbol,
// } from 'config/sampleAttributes';
import {
  cantUseWithVspMessage,
  downloadSuccessMessage,
  excelFailureMessage,
  featureNotAvailableMessage,
  generateRandomExceededTransferLimitMessage,
  generateRandomSuccessMessage,
  noDataDownloadMessage,
  // userDefinedValidationMessage,
  webServiceErrorMessage,
} from 'config/errorMessages';
// utils
import { proxyFetch } from 'utils/fetchUtils';
import { useGeometryTools, useDynamicPopup, useStartOver } from 'utils/hooks';
import {
  // convertToPoint,
  createLayer,
  // createSampleLayer,
  deepCopyObject,
  findLayerInEdits,
  generateUUID,
  getCurrentDateTime,
  getDefaultSamplingMaskLayer,
  getNextScenarioLayer,
  // getPointSymbol,
  getScenarios,
  getSketchableLayers,
  updateLayerEdits,
} from 'utils/sketchUtils';
import {
  activateSketchButton,
  createErrorObject,
  // getLayerName,
  getScenarioName,
} from 'utils/utils';
// styles
import { reactSelectStyles } from 'styles';

const bldgTypeEnum = {
  M: 'Masonry',
  W: 'Wood',
  H: 'Manufactured',
  S: 'Steel',
};
const foundTypeEnum = {
  C: 'Crawl',
  B: 'Basement',
  S: 'Slab',
  P: 'Pier',
  I: 'Pile',
  F: 'Fill',
  W: 'Solid Wall',
};
const ftprntsrcEnum = {
  B: 'Bing',
  O: 'Oak Ridge National Labs',
  N: 'National Geospatial-Intelligence Agency',
  M: 'Map Building Layer',
};
const sourceEnum = {
  P: 'Parcel',
  E: 'ESRI',
  H: 'HIFLD Hospital',
  N: 'HIFLD Nursing Home',
  S: 'National Center for Education Statistics',
  X: 'HAZUS/NSI-2015',
};
const stDamcatEnum = {
  RES: 'Residential',
  COM: 'Commercial',
  IND: 'Industrial',
  PUB: 'Public',
};

function handleEnum(value: string, obj: any) {
  return obj.hasOwnProperty(value) ? obj[value] : value;
}

type ShapeTypeSelect = {
  value: string;
  label: string;
};

// type EditType = 'create' | 'edit' | 'clone' | 'view';

const pointStyles: ShapeTypeSelect[] = [
  { value: 'circle', label: 'Circle' },
  { value: 'cross', label: 'Cross' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'square', label: 'Square' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'x', label: 'X' },
  {
    value:
      'path|M17.14 3 8.86 3 3 8.86 3 17.14 8.86 23 17.14 23 23 17.14 23 8.86 17.14 3z',
    label: 'Octagon',
  },
];

// /**
//  * Determines if the desired name has already been used. If it has
//  * it appends in index to the end (i.e. '<desiredName> (2)').
//  */
// function getSampleTypeName(
//   sampleTypes: SampleSelectType[],
//   desiredName: string,
// ) {
//   // get a list of names in use
//   let usedNames: string[] = [];
//   sampleTypes.forEach((sampleType) => {
//     usedNames.push(sampleType.label);
//   });

//   // Find a name where there is not a collision.
//   // Most of the time this loop will be skipped.
//   let duplicateCount = 0;
//   let newName = desiredName;
//   while (usedNames.includes(newName)) {
//     duplicateCount += 1;
//     newName = `${desiredName} (${duplicateCount})`;
//   }

//   return newName;
// }

// --- styles (SketchButton) ---
// const buttonContainerStyles = css`
//   display: flex;
//   align-items: end;
// `;

const panelContainer = css`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 100%;

  .sketch-button-selected {
    background-color: #e7f6f8;
  }

  .sketch-button-selected > div {
    border: 2px solid #01bde3;
  }
`;

const sectionContainer = css`
  padding: 20px;
`;

// const sectionContainerWidthOnly = css`
//   padding: 0 20px;
// `;

const layerSelectStyles = css`
  margin-bottom: 10px;
`;

// const sketchButtonContainerStyles = css`
//   margin-left: 1px;
//   margin-top: 1px;
// `;

// const sketchButtonStyles = css`
//   position: relative;
//   height: 110px;
//   width: 33.33%;
//   background-color: white;
//   color: black;
//   border: 1px solid #ccc;
//   border-radius: 0;
//   margin: 0 0 -1px -1px;

//   &::before,
//   &::after {
//     content: '';
//     display: block;
//     padding-top: 50%;
//   }

//   &:hover,
//   &:focus {
//     background-color: #e7f6f8;
//     cursor: pointer;
//   }
// `;

// const textContainerStyles = css`
//   position: absolute;
//   top: 0;
//   left: 0;
//   bottom: 0;
//   right: 0;
//   display: flex;
//   align-items: center;
//   justify-content: center;
// `;

// const textStyles = css`
//   max-height: 85px;
//   word-break: break-word;
// `;

const sketchAoiButtonStyles = css`
  background-color: white;
  color: black;

  &:hover,
  &:focus {
    background-color: #e7f6f8;
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

const addButtonStyles = css`
  margin: 0;
  height: 38px; /* same height as ReactSelect */
`;

// const fullWidthSelectStyles = css`
//   width: 100%;
//   margin-right: 10px;
//   margin-bottom: 10px;
// `;

// const inputStyles = css`
//   width: 100%;
//   height: 36px;
//   margin: 0 0 10px 0;
//   padding-left: 8px;
//   border: 1px solid #ccc;
//   border-radius: 4px;
// `;

const inlineSelectStyles = css`
  width: 100%;
  margin-right: 10px;
`;

const submitButtonStyles = css`
  margin-top: 10px;
`;

// const sampleCountStyles = css`
//   font-size: 26px;
//   color: #0085e3;
// `;

// --- components (SketchButton) ---
// type SketchButtonProps = {
//   value: string;
//   label: string;
//   iconClass: string;
//   layers: LayerType[];
//   selectedScenario: ScenarioEditsType | null;
//   onClick: () => void;
// };

// function SketchButton({
//   value,
//   label,
//   iconClass,
//   layers,
//   selectedScenario,
//   onClick,
// }: SketchButtonProps) {
//   // put an ellipses on the end if the text is to long
//   const displayLabel = label.length > 30 ? `${label.substr(0, 30)}...` : label;
//   let count = 0;

//   layers.forEach((layer) => {
//     if (layer.layerType !== 'Samples' && layer.layerType !== 'VSP') return;
//     if (layer.sketchLayer.type === 'feature') return;
//     if (layer?.parentLayer?.id !== selectedScenario?.layerId) return;

//     layer.sketchLayer.graphics.forEach((graphic) => {
//       if (graphic.attributes.TYPEUUID === value) count += 1;
//     });
//   });

//   return (
//     <button
//       id={value}
//       title={`Draw a ${label}: ${count}`}
//       className="sketch-button"
//       onClick={() => onClick()}
//       css={sketchButtonStyles}
//     >
//       <div css={textContainerStyles}>
//         <div css={textStyles}>
//           <i className={iconClass} />
//           <br />
//           {displayLabel}
//           {count > 0 && (
//             <Fragment>
//               <br />
//               <span css={sampleCountStyles}>{count}</span>
//             </Fragment>
//           )}
//         </div>
//       </div>
//     </button>
//   );
// }

// --- styles (LocateSamples) ---
const headerContainer = css`
  display: flex;
  align-items: center;
  justify-content: space-evenly;
`;

const headerStyles = css`
  margin: 0;
  padding: 0;
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
  width: 125px;
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

const lineSeparatorStyles = css`
  border-bottom: 1px solid #d8dfe2;
`;

const radioLabelStyles = css`
  padding-left: 0.375rem;
`;

const verticalCenterTextStyles = css`
  display: flex;
  align-items: center;
`;

const fullWidthSelectStyles = css`
  width: 100%;
  margin-right: 10px;
`;

// --- components (LocateSamples) ---
type GenerateRandomType = {
  status: 'none' | 'fetching' | 'success' | 'failure' | 'exceededTransferLimit';
  error?: ErrorType;
  data: __esri.Graphic[];
};

function LocateSamples() {
  const { contaminationMap, setContaminationMap } =
    useContext(CalculateContext);
  // const { setOptions } = useContext(DialogContext);
  const { setGoTo, setGoToOptions, setTablePanelExpanded } =
    useContext(NavigationContext);
  // const { setSampleTypeSelections } = useContext(PublishContext);
  const {
    defaultSymbols,
    // setDefaultSymbolSingle,
    displayDimensions,
    edits,
    setEdits,
    layersInitialized,
    layers,
    setLayers,
    map,
    selectedScenario,
    setSelectedScenario,
    sketchLayer,
    setSketchLayer,
    aoiSketchLayer,
    setAoiSketchLayer,
    sketchVM,
    aoiSketchVM,
    // sampleAttributes,
    // userDefinedOptions,
    // setUserDefinedOptions,
    // userDefinedAttributes,
    // setUserDefinedAttributes,
    // allSampleOptions,
    // displayGeometryType,
    // sceneView,
    // mapView,
  } = useContext(SketchContext);
  const startOver = useStartOver();
  // const { createBuffer } = useGeometryTools();
  const getPopupTemplate = useDynamicPopup();
  const layerProps = useLayerProps();
  const sampleTypeContext = useSampleTypesContext();
  const services = useServicesContext();

  // Sets the sketchLayer to the first layer in the layer selection drop down,
  // if available. If the drop down is empty, an empty sketchLayer will be
  // created.
  const [
    sketchLayerInitialized,
    setSketchLayerInitialized, //
  ] = useState(false);
  useEffect(() => {
    if (!map || !layersInitialized || sketchLayerInitialized) return;

    setSketchLayerInitialized(true);

    const { nextScenario, nextLayer } = getNextScenarioLayer(
      edits,
      layers,
      selectedScenario,
      sketchLayer,
    );

    if (nextScenario) setSelectedScenario(nextScenario);
    if (nextLayer) setSketchLayer(nextLayer);
  }, [
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
  useEffect(() => {
    if (!map || !layersInitialized || aoiSketchLayer) return;

    const newAoiSketchLayer = getDefaultSamplingMaskLayer();

    // add the layer to the map
    setLayers((layers) => {
      return [...layers, newAoiSketchLayer];
    });

    // set the active sketch layer
    setAoiSketchLayer(newAoiSketchLayer);
  }, [map, aoiSketchLayer, setAoiSketchLayer, layersInitialized, setLayers]);

  // // Handle a user clicking one of the sketch buttons
  // function sketchButtonClick(label: string) {
  //   if (!sketchVM || !map || !sketchLayer || !sceneView || !mapView) return;

  //   // put the sketch layer on the map, if it isn't there already and
  //   // is not part of a group layer
  //   const layerIndex = map.layers.findIndex(
  //     (layer) => layer.id === sketchLayer.layerId,
  //   );
  //   if (layerIndex === -1 && !sketchLayer.parentLayer) {
  //     map.add(sketchLayer.sketchLayer);
  //   }

  //   // save changes from other sketchVM and disable to prevent
  //   // interference
  //   if (aoiSketchVM) {
  //     aoiSketchVM.cancel();
  //   }

  //   // determine whether the sketch button draws points or polygons
  //   const attributes = sampleAttributes[label as any];
  //   let shapeType = attributes.ShapeType;

  //   // make the style of the button active
  //   const wasSet = activateSketchButton(label);

  //   // update the sketchVM symbol
  //   let symbolType = 'Samples';
  //   if (defaultSymbols.symbols.hasOwnProperty(label)) symbolType = label;

  //   const isPath = attributes.POINT_STYLE.includes('path|');
  //   const pointProps = {
  //     color: defaultSymbols.symbols[symbolType].color,
  //     outline: defaultSymbols.symbols[symbolType].outline,
  //     style: isPath ? 'path' : attributes.POINT_STYLE,
  //   } as any;
  //   if (isPath) pointProps.path = attributes.POINT_STYLE.replace('path|', '');

  //   sketchVM['2d'].polygonSymbol = defaultSymbols.symbols[symbolType] as any;
  //   sketchVM['2d'].pointSymbol = new SimpleMarkerSymbol(pointProps);
  //   sketchVM['3d'].polygonSymbol = defaultSymbols.symbols[symbolType] as any;
  //   sketchVM['3d'].pointSymbol = new SimpleMarkerSymbol(pointProps);

  //   // let the user draw/place the shape
  //   if (wasSet) sketchVM[displayDimensions].create(shapeType);
  //   else sketchVM[displayDimensions].cancel();
  // }

  const { calculateArea } = useGeometryTools();

  // Handle a user clicking the sketch AOI button. If an AOI is not selected from the
  // dropdown this will create an AOI layer. This also sets the sketchVM to use the
  // selected AOI and triggers a React useEffect to allow the user to sketch on the map.
  const [
    generateRandomResponse,
    setGenerateRandomResponse, //
  ] = useState<GenerateRandomType>({
    status: 'none',
    data: [],
  });
  function sketchAoiButtonClick() {
    if (!map || !aoiSketchVM || !aoiSketchLayer) return;

    setGenerateRandomResponse({
      status: 'none',
      data: [],
    });

    // put the sketch layer on the map, if it isn't there already
    const layerIndex = map.layers.findIndex(
      (layer) => layer.id === aoiSketchLayer.layerId,
    );
    if (layerIndex === -1) map.add(aoiSketchLayer.sketchLayer);

    // save changes from other sketchVM and disable to prevent
    // interference
    if (sketchVM) {
      sketchVM[displayDimensions].cancel();
    }

    // make the style of the button active
    const wasSet = activateSketchButton('sampling-mask');

    if (wasSet) {
      // let the user draw/place the shape
      aoiSketchVM.create('polygon');
    } else {
      aoiSketchVM.cancel();
    }
  }

  // Handle a user generating random samples
  async function assessAoi() {
    if (!map || !sketchLayer) return;

    activateSketchButton('disable-all-buttons');
    sketchVM?.[displayDimensions].cancel();
    aoiSketchVM?.cancel();

    const aoiMaskLayer: LayerType | null =
      generateRandomMode === 'draw'
        ? aoiSketchLayer
        : generateRandomMode === 'file'
          ? selectedAoiFile
          : null;
    if (
      !aoiMaskLayer?.sketchLayer ||
      aoiMaskLayer.sketchLayer.type !== 'graphics'
    )
      return;

    setGenerateRandomResponse({ status: 'fetching', data: [] });

    const features: any[] = [];
    let totalAoiSqM = 0;
    let totalBuildingFootprintSqM = 0;
    aoiMaskLayer.sketchLayer.graphics.forEach((graphic) => {
      const geometry = graphic.geometry as __esri.Polygon;

      const areaSM = calculateArea(graphic);
      if (typeof areaSM === 'number') {
        totalAoiSqM += areaSM;
        graphic.attributes.AREA = areaSM;
      }

      const dim1Rings: number[][][] = [];
      geometry.rings.forEach((dim1) => {
        const dim2Rings: number[][] = [];
        dim1.forEach((dim2) => {
          const point = new Point({
            spatialReference: {
              wkid: 102100,
            },
            x: dim2[0],
            y: dim2[1],
          });

          dim2Rings.push([point.longitude, point.latitude]);
        });

        dim1Rings.push(dim2Rings);
      });

      features.push({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: dim1Rings,
        },
      });
    });
    console.log('totalAoiSqM: ', totalAoiSqM);

    try {
      // TODO - look into adding more queries here
      const requests: any[] = [];
      features.forEach((feature) => {
        // TODO - look into adding more queries here
        const request: any = proxyFetch(
          `${services.data.nsi}/structures?fmt=fc`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              type: 'FeatureCollection',
              features: [feature],
            }),
          },
        );

        requests.push(request);
      });

      const responses = await Promise.all(requests);

      let editsCopy: EditsType = edits;
      const graphics: __esri.Graphic[] = [];
      responses.forEach((results) => {
        results.features.forEach((feature: any) => {
          const { bldgtype, found_type, ftprntsrc, source, sqft, st_damcat } =
            feature.properties;
          totalBuildingFootprintSqM += sqft / 10.7639104167;
          graphics.push(
            new Graphic({
              attributes: {
                ...feature.properties,
                bldgtype: handleEnum(bldgtype, bldgTypeEnum),
                found_type: handleEnum(found_type, foundTypeEnum),
                ftprntsrc: handleEnum(ftprntsrc, ftprntsrcEnum),
                source: handleEnum(source, sourceEnum),
                st_damcat: handleEnum(st_damcat, stDamcatEnum),
                CONTAMTYPE: '',
                CONTAMUNIT: '',
                CONTAMVAL: 0,
              },
              geometry: new Point({
                longitude: feature.geometry.coordinates[0],
                latitude: feature.geometry.coordinates[1],
                spatialReference: {
                  wkid: 102100,
                },
              }),
              symbol: new TextSymbol({
                text: '\ue687',
                color: 'blue',
                yoffset: -13,
                font: {
                  family: 'CalciteWebCoreIcons',
                  size: 24,
                },
              }),
              popupTemplate: {
                title: '',
                content: buildingMapPopup,
              },
            }),
          );
        });
      });

      console.log('totalBuildingFootprintSqM: ', totalBuildingFootprintSqM);

      if (
        contaminationMap &&
        contaminationMap?.sketchLayer?.type === 'graphics'
      ) {
        // loop through structures
        graphics.forEach((graphic) => {
          // loop through contamination map features
          (
            contaminationMap.sketchLayer as __esri.GraphicsLayer
          ).graphics.forEach((contamGraphic) => {
            // call intersect to see if decon app intersects contamination map
            if (
              !graphic.geometry ||
              !contamGraphic.geometry ||
              !geometryEngine.intersects(
                graphic.geometry,
                contamGraphic.geometry,
              )
            ) {
              return;
            }

            // const contamReduction = graphic.attributes.LOD_NON;
            // console.log('contamReduction: ', contamReduction);
            // const reductionFactor = parseSmallFloat(1 - contamReduction);
            // console.log('parseSmallFloat 1 - contamReduction: ', reductionFactor);
            const newCfu = contamGraphic.attributes.CONTAMVAL; // * reductionFactor;
            graphic.attributes.CONTAMVAL = newCfu;
            graphic.attributes.CONTAMUNIT = contamGraphic.attributes.CONTAMUNIT;
            graphic.attributes.CONTAMTYPE = contamGraphic.attributes.CONTAMTYPE;
          });
        });
      }

      console.log('graphics: ', graphics);

      // Figure out what to add graphics to
      const aoiAssessed = selectedScenario?.layers.find(
        (l) => l.layerType === 'AOI Assessed',
      );

      if (aoiAssessed) {
        const aoiAssessedLayer = layers.find(
          (l) => l.layerId === aoiAssessed.layerId,
        );
        if (aoiAssessedLayer?.sketchLayer?.type === 'graphics') {
          editsCopy = updateLayerEdits({
            edits,
            scenario: selectedScenario,
            layer: aoiAssessedLayer,
            type: 'delete',
            changes: aoiAssessedLayer?.sketchLayer.graphics,
          });

          aoiAssessedLayer?.sketchLayer.graphics.removeAll();
          aoiAssessedLayer?.sketchLayer.graphics.addMany(graphics);

          editsCopy = updateLayerEdits({
            edits,
            scenario: selectedScenario,
            layer: aoiAssessedLayer,
            type: 'add',
            changes: new Collection(graphics),
          });
        }
      } else {
        const scenarioLayer = map.layers.find(
          (l) => l.id === selectedScenario?.layerId,
        );
        if (scenarioLayer && scenarioLayer.type === 'group') {
          const tmpScenarioLayer = scenarioLayer as __esri.GroupLayer;
          //&& scenarioLayer.layerType === '') {
          // build the layer
          const layerUuid = generateUUID();
          const graphicsLayer = new GraphicsLayer({
            id: layerUuid,
            title: 'AOI Assessment',
            listMode: 'hide',
            graphics,
          });

          // scenarioLayer..layers.add(graphicsLayer);
          tmpScenarioLayer.layers.add(graphicsLayer);

          const layer = {
            id: -1,
            pointsId: -1,
            uuid: layerUuid,
            layerId: layerUuid,
            portalId: '',
            value: 'aoiAssessed',
            name: 'AOI Assessment',
            label: 'AOI Assessment',
            layerType: 'AOI Assessed',
            editType: 'add',
            visible: true,
            listMode: 'hide',
            sort: 0,
            geometryType: 'esriGeometryPolygon',
            addedFrom: 'sketch',
            status: 'added',
            sketchLayer: graphicsLayer,
            pointsLayer: null,
            hybridLayer: null,
            parentLayer: null,
          } as LayerType;

          // add it to edits
          editsCopy = updateLayerEdits({
            edits,
            scenario: selectedScenario,
            layer,
            type: 'add',
            changes: new Collection(graphics),
          });

          setSelectedScenario((selectedScenario) => {
            if (!selectedScenario) return selectedScenario;

            const scenario = editsCopy.edits.find(
              (edit) =>
                edit.type === 'scenario' &&
                edit.layerId === selectedScenario.layerId,
            ) as ScenarioEditsType;
            const newLayer = scenario.layers.find(
              (l) => l.layerId === layer.layerId,
            );

            if (!newLayer) return selectedScenario;

            return {
              ...selectedScenario,
              layers: [...selectedScenario.layers, newLayer],
            };
          });

          setLayers((layers) => {
            return [...layers, layer];
          });
        }
      }

      // if (generateRandomMode === 'draw') {
      //   // remove the graphics from the generate random mask
      //   if (aoiMaskLayer && aoiMaskLayer.sketchLayer.type === 'graphics') {
      //     editsCopy = updateLayerEdits({
      //       edits: editsCopy,
      //       layer: aoiMaskLayer,
      //       type: 'delete',
      //       changes: aoiMaskLayer.sketchLayer.graphics,
      //     });

      //     aoiMaskLayer.sketchLayer.removeAll();
      //   }
      // }

      // update the edits state
      setEdits(editsCopy);

      setGenerateRandomResponse({
        status: 'success',
        data: graphics,
      });
    } catch (ex: any) {
      console.error(ex);
      setGenerateRandomResponse({
        status: 'failure',
        error: {
          error: createErrorObject(ex),
          message: ex.message,
        },
        data: [],
      });

      window.logErrorToGa(ex);
    }
  }

  type Cell = { value: any; font?: any; alignment?: any };
  type Row = Cell[];

  type DownloadStatus =
    | 'none'
    | 'fetching'
    | 'success'
    | 'no-data'
    | 'excel-failure';
  const [
    downloadStatus,
    setDownloadStatus, //
  ] = useState<DownloadStatus>('none');
  async function downloadSummary() {
    // find the layer
    const aoiAssessed = selectedScenario?.layers.find(
      (l) => l.layerType === 'AOI Assessed',
    );
    console.log('aoiAssessed: ', aoiAssessed);
    if (!aoiAssessed) {
      setDownloadStatus('no-data');
      return;
    }

    const aoiAssessedLayer = layers.find(
      (l) => l.layerId === aoiAssessed.layerId,
    );
    if (
      !aoiAssessedLayer ||
      (aoiAssessedLayer.sketchLayer as __esri.GraphicsLayer).graphics.length ===
        0
    ) {
      setDownloadStatus('no-data');
      return;
    }

    setDownloadStatus('fetching');

    const workbook = new ExcelJS.Workbook();

    // create the styles
    const defaultFont = { name: 'Calibri', size: 12 };
    const labelFont = { name: 'Calibri', bold: true, size: 12 };

    // add the sheet
    const summarySheet = workbook.addWorksheet('Building Data');

    const cols = [
      { label: 'Building ID', fieldName: 'bid' },
      { label: 'Building Type', fieldName: 'bldgtype' },
      { label: 'Census Block FIPS', fieldName: 'cbfips' },
      { label: 'ID', fieldName: 'fd_id' },
      { label: 'Flood Zone (2021)', fieldName: 'firmzone' },
      { label: 'Foundation Height (feet)', fieldName: 'found_ht' },
      { label: 'Foundation Type', fieldName: 'found_type' },
      { label: 'Footprint ID', fieldName: 'ftprntid' },
      { label: 'Footprint Source', fieldName: 'ftprntsrc' },
      { label: 'Ground Elevation (feet)', fieldName: 'ground_elv' },
      { label: 'Ground Elevation (meters)', fieldName: 'ground_elv_m' },
      { label: 'Median Year Built', fieldName: 'med_yr_blt' },
      { label: 'Number of Stories', fieldName: 'num_story' },
      { label: 'Percent Over 65 Disabled', fieldName: 'o65disable' },
      { label: 'Occupancy Type', fieldName: 'occtype' },
      { label: 'Population Night Over 65', fieldName: 'pop2amo65' },
      { label: 'Population Night Under 65', fieldName: 'pop2amu65' },
      { label: 'Population Day Over 65', fieldName: 'pop2pmo65' },
      { label: 'Population Day Under 65', fieldName: 'pop2pmu65' },
      { label: 'Source', fieldName: 'source' },
      { label: 'Square Feet', fieldName: 'sqft' },
      { label: 'Structure Damage Category', fieldName: 'st_damcat' },
      { label: 'Students', fieldName: 'students' },
      { label: 'Percent Under 65 Disabled', fieldName: 'u65disable' },
      { label: 'Value of Contents', fieldName: 'val_cont' },
      { label: 'Value of Structure', fieldName: 'val_struct' },
      { label: 'Value of Vehicles', fieldName: 'val_vehic' },
      { label: 'x', fieldName: 'x' },
      { label: 'y', fieldName: 'y' },
    ];

    let curRow = fillOutCells({
      sheet: summarySheet,
      rows: [
        [
          ...cols.map((col) => {
            return {
              value: col.label,
              font: labelFont,
            };
          }),
        ],
      ],
    });

    const rows: Row[] = [];
    (aoiAssessedLayer.sketchLayer as __esri.GraphicsLayer).graphics.forEach(
      (graphic) => {
        rows.push(
          cols.map((col) => {
            return {
              value: graphic.attributes[col.fieldName],
            };
          }),
        );
      },
    );

    fillOutCells({
      sheet: summarySheet,
      rows,
      startRow: curRow,
    });

    function fillOutCells({
      sheet,
      rows,
      startRow = 1,
    }: {
      sheet: ExcelJS.Worksheet;
      rows: Row[];
      startRow?: number;
    }) {
      let rowIdx = startRow;
      rows.forEach((rowData, index) => {
        if (index !== 0) rowIdx += 1;
        rowData.forEach((cellData, cellIdx) => {
          const cell = sheet.getCell(rowIdx, cellIdx + 1);
          cell.value = cellData.value;
          cell.font = cellData.font ?? defaultFont;
          if (cellData.alignment) cell.alignment = cellData.alignment;
        });
      });

      return rowIdx + 1;
    }

    // download the file
    try {
      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(
        new Blob([buffer]),
        `tods_${selectedScenario?.scenarioName}_aoi_assessment.xlsx`,
      );
      setDownloadStatus('success');
    } catch (err: any) {
      console.error(err);
      setDownloadStatus('excel-failure');

      window.logErrorToGa(err);
    }
  }

  // const [userDefinedSampleType, setUserDefinedSampleType] =
  //   useState<SampleSelectType | null>(null);
  // const [editingStatus, setEditingStatus] = useState<EditType | null>(null);
  // const [sampleTypeName, setSampleTypeName] = useState<string>('');
  // const [shapeType, setShapeType] = useState<ShapeTypeSelect | null>(null);
  // const [pointStyle, setPointStyle] = useState<ShapeTypeSelect | null>(null);
  // const [ttpk, setTtpk] = useState<string | null>('');
  // const [ttc, setTtc] = useState<string | null>('');
  // const [tta, setTta] = useState<string | null>('');
  // const [ttps, setTtps] = useState<string | null>('');
  // const [lodp, setLodp] = useState<string | null>('');
  // const [lodnon, setLodnon] = useState<string | null>('');
  // const [mcps, setMcps] = useState<string | null>('');
  // const [tcps, setTcps] = useState<string | null>('');
  // const [wvps, setWvps] = useState<string | null>('');
  // const [wwps, setWwps] = useState<string | null>('');
  // const [sa, setSa] = useState<string | null>('');
  // const [alc, setAlc] = useState<string | null>('');
  // const [amc, setAmc] = useState<string | null>('');
  // const [validationMessage, setValidationMessage] = useState<
  //   JSX.Element[] | string
  // >('');

  // // Sets all of the user defined sample type inputs based on
  // // which edit type is being used.
  // function setSampleTypeInputs(editType: EditType) {
  //   if (editType === 'create') {
  //     setEditingStatus(editType);
  //     setShapeType(null);
  //     setPointStyle(null);
  //     setTtpk('');
  //     setTtc('');
  //     setTta('');
  //     setTtps('');
  //     setLodp('');
  //     setLodnon('');
  //     setMcps('');
  //     setTcps('');
  //     setWvps('');
  //     setWwps('');
  //     setSa('');
  //     setAlc('');
  //     setAmc('');
  //     setSampleTypeName('');
  //     return;
  //   }

  //   if (!userDefinedSampleType) return;

  //   // get the sample type name, for a clone operation
  //   // add a number to the end of the name.
  //   let sampleTypeUuid = userDefinedSampleType.value;
  //   let sampleTypeName = userDefinedSampleType.label;
  //   const attributes = sampleAttributes[sampleTypeUuid as any];
  //   if (editType === 'clone') {
  //     sampleTypeName = getSampleTypeName(allSampleOptions, sampleTypeName);
  //   }

  //   const shapeType =
  //     attributes.ShapeType === 'point'
  //       ? { value: 'point', label: 'Point' }
  //       : { value: 'polygon', label: 'Polygon' };

  //   setEditingStatus(editType);
  //   setShapeType(shapeType);
  //   setTtpk(attributes.TTPK ? attributes.TTPK.toString() : null);
  //   setTtc(attributes.TTC ? attributes.TTC.toString() : null);
  //   setTta(attributes.TTA ? attributes.TTA.toString() : null);
  //   setTtps(attributes.TTPS ? attributes.TTPS.toString() : null);
  //   setLodp(attributes.LOD_P ? attributes.LOD_P.toString() : null);
  //   setLodnon(attributes.LOD_NON ? attributes.LOD_NON.toString() : null);
  //   setMcps(attributes.MCPS ? attributes.MCPS.toString() : null);
  //   setTcps(attributes.TCPS ? attributes.TCPS.toString() : null);
  //   setWvps(attributes.WVPS ? attributes.WVPS.toString() : null);
  //   setWwps(attributes.WWPS ? attributes.WWPS.toString() : null);
  //   setSa(attributes.SA ? attributes.SA.toString() : null);
  //   setAlc(attributes.ALC ? attributes.ALC.toString() : null);
  //   setAmc(attributes.AMC ? attributes.AMC.toString() : null);
  //   setSampleTypeName(sampleTypeName);

  //   const pointStyle = pointStyles.find(
  //     (s) => s.value === attributes.POINT_STYLE,
  //   );
  //   setPointStyle(pointStyle || null);
  // }

  // // Validates the user input.
  // // TODO: This logic needs to be updated to be more robust. Currently,
  // //        this just makes sure that all of the fields have been filled out.
  // function validateEdits() {
  //   let isValid = true;
  //   const messageParts: string[] = [];

  //   function isNumberValid(
  //     numberStr: string | null,
  //     valueValidation?: '' | 'greaterThan0' | 'between0-1',
  //   ) {
  //     if (numberStr === undefined || numberStr === null || numberStr === '') {
  //       return;
  //     }

  //     const number = Number(numberStr);
  //     if (isNaN(number)) return false;
  //     if (!valueValidation) return true;
  //     if (valueValidation === 'greaterThan0' && number > 0) return true;
  //     if (valueValidation === 'between0-1' && number > 0 && number <= 1)
  //       return true;

  //     return false;
  //   }

  //   // validate any fields that need it
  //   if (!sampleTypeName) {
  //     isValid = false;
  //     messageParts.push(
  //       'User Defined types must have a decon technology name.',
  //     );
  //   }
  //   if (
  //     sampleAttributes.hasOwnProperty(sampleTypeName) &&
  //     (editingStatus !== 'edit' ||
  //       (editingStatus === 'edit' &&
  //         userDefinedSampleType &&
  //         userDefinedSampleType.value !== sampleTypeName))
  //   ) {
  //     isValid = false;
  //     messageParts.push(
  //       `The "${sampleTypeName}" name is already in use. Please rename the decon technology and try again.`,
  //     );
  //   }
  //   if (!isNumberValid(ttpk)) {
  //     isValid = false;
  //     messageParts.push('Setup Time needs a numeric value.');
  //   }
  //   if (!isNumberValid(ttc)) {
  //     isValid = false;
  //     messageParts.push('Application Time needs a numeric value.');
  //   }
  //   if (!isNumberValid(tta)) {
  //     isValid = false;
  //     messageParts.push('Residence Time needs a numeric value.');
  //   }
  //   if (!isNumberValid(lodnon, 'between0-1')) {
  //     isValid = false;
  //     messageParts.push(
  //       'Contamination Removal needs a numeric value between 0 and 1.',
  //     );
  //   }
  //   if (!isNumberValid(mcps)) {
  //     isValid = false;
  //     messageParts.push('Setup Cost needs a numeric value.');
  //   }
  //   if (!isNumberValid(tcps)) {
  //     isValid = false;
  //     messageParts.push('Cost needs a numeric value.');
  //   }
  //   if (!isNumberValid(sa, 'greaterThan0')) {
  //     isValid = false;
  //     messageParts.push(
  //       'Application Max Area needs a numeric value greater than 0.',
  //     );
  //   }
  //   if (!isNumberValid(wvps)) {
  //     isValid = false;
  //     messageParts.push('Solid Waste Volume needs a numeric value.');
  //   }
  //   if (!isNumberValid(wwps)) {
  //     isValid = false;
  //     messageParts.push('Solid Waste Mass needs a numeric value.');
  //   }
  //   if (!isNumberValid(alc)) {
  //     isValid = false;
  //     messageParts.push('Liquid Waste Volume needs a numeric value.');
  //   }
  //   if (!isNumberValid(amc)) {
  //     isValid = false;
  //     messageParts.push('Liquid Waste Mass needs a numeric value.');
  //   }

  //   if (messageParts.length > 0) {
  //     const message = messageParts.map((part, index) => {
  //       return (
  //         <Fragment key={index}>
  //           {index !== 0 ? <br /> : ''}
  //           {part}
  //         </Fragment>
  //       );
  //     });
  //     setValidationMessage(message);
  //   }

  //   return isValid;
  // }

  // // Checks to see if the sample type name changed.
  // function didSampleTypeNameChange() {
  //   return (
  //     editingStatus === 'edit' &&
  //     userDefinedSampleType &&
  //     sampleTypeName !== userDefinedSampleType.label
  //   );
  // }

  // // Updates the attributes of graphics that have had property changes
  // function updateAttributes({
  //   graphics,
  //   newAttributes,
  //   oldType,
  //   symbol = null,
  // }: {
  //   graphics: __esri.Graphic[];
  //   newAttributes: any;
  //   oldType: string;
  //   symbol?: PolygonSymbol | null;
  // }) {
  //   const editedGraphics: __esri.Graphic[] = [];
  //   graphics.forEach((graphic: __esri.Graphic) => {
  //     // update attributes for the edited type
  //     if (graphic.attributes.TYPEUUID === oldType) {
  //       const areaChanged = graphic.attributes.SA !== newAttributes.SA;
  //       const shapeTypeChanged =
  //         graphic.attributes.ShapeType !== newAttributes.ShapeType;

  //       graphic.attributes.TYPE = newAttributes.TYPE;
  //       graphic.attributes.ShapeType = newAttributes.ShapeType;
  //       graphic.attributes.Width = newAttributes.Width;
  //       graphic.attributes.SA = newAttributes.SA;
  //       graphic.attributes.TTPK = newAttributes.TTPK;
  //       graphic.attributes.TTC = newAttributes.TTC;
  //       graphic.attributes.TTA = newAttributes.TTA;
  //       graphic.attributes.TTPS = newAttributes.TTPS;
  //       graphic.attributes.LOD_P = newAttributes.LOD_P;
  //       graphic.attributes.LOD_NON = newAttributes.LOD_NON;
  //       graphic.attributes.MCPS = newAttributes.MCPS;
  //       graphic.attributes.TCPS = newAttributes.TCPS;
  //       graphic.attributes.WVPS = newAttributes.WVPS;
  //       graphic.attributes.WWPS = newAttributes.WWPS;
  //       graphic.attributes.ALC = newAttributes.ALC;
  //       graphic.attributes.AMC = newAttributes.AMC;
  //       graphic.attributes.POINT_STYLE = newAttributes.POINT_STYLE;

  //       // redraw the graphic if the width changed or if the graphic went from a
  //       // polygon to a point
  //       if (
  //         newAttributes.ShapeType === 'point' &&
  //         (areaChanged || shapeTypeChanged)
  //       ) {
  //         // convert the geometry _esriPolygon if it is missing stuff
  //         createBuffer(graphic as __esri.Graphic);
  //       }

  //       // update the point symbol if necessary
  //       if (graphic.geometry.type === 'point') {
  //         graphic.symbol = getPointSymbol(graphic, symbol);
  //       }

  //       editedGraphics.push(graphic);
  //     }
  //   });

  //   return editedGraphics;
  // }

  // Changes the selected layer if the scenario is changed. The first
  // available layer in the scenario will be chosen. If the scenario
  // has no layers, then the first availble unlinked layer is chosen.
  useEffect(() => {
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
    const newSketchLayer = layers.find(
      (layer) =>
        (layer.layerType === 'Samples' || layer.layerType === 'VSP') &&
        !layer.parentLayer,
    );
    if (newSketchLayer) setSketchLayer(newSketchLayer);
    else setSketchLayer(null);
  }, [layers, selectedScenario, sketchLayer, setSketchLayer]);

  // scenario and layer edit UI visibility controls
  const [addScenarioVisible, setAddScenarioVisible] = useState(false);
  const [editScenarioVisible, setEditScenarioVisible] = useState(false);
  // const [addLayerVisible, setAddLayerVisible] = useState(false);
  // const [editLayerVisible, setEditLayerVisible] = useState(false);
  const [generateRandomMode, setGenerateRandomMode] = useState<
    'draw' | 'file' | ''
  >('');
  const [selectedAoiFile, setSelectedAoiFile] = useState<LayerType | null>(
    null,
  );

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

  // // Initialize the local user defined type symbol. Also updates this variable
  // // when the user changes the user defined sample type selection.
  // const [udtSymbol, setUdtSymbol] = useState<PolygonSymbol>(
  //   defaultSymbols.symbols['Samples'],
  // );
  // useEffect(() => {
  //   if (!userDefinedSampleType) return;

  //   if (defaultSymbols.symbols.hasOwnProperty(userDefinedSampleType.value)) {
  //     setUdtSymbol(defaultSymbols.symbols[userDefinedSampleType.value]);
  //   } else {
  //     setUdtSymbol(defaultSymbols.symbols['Samples']);
  //   }
  // }, [defaultSymbols, userDefinedSampleType]);

  pointStyles.sort((a, b) => a.value.localeCompare(b.value));

  return (
    <div css={panelContainer}>
      <div>
        <div css={sectionContainer}>
          <h2 css={headerStyles}>Create Decon Plan</h2>
          <div css={headerContainer}>
            <button css={deleteButtonStyles} onClick={startOver}>
              <i className="fas fa-redo-alt" />
              <br />
              Start Over
            </button>
            <button
              css={deleteButtonStyles}
              onClick={() => {
                if (!sketchVM || !sketchLayer) return;

                // Figure out what to add graphics to
                const aoiAssessed = selectedScenario?.layers.find(
                  (l) => l.layerType === 'AOI Assessed',
                );
                if (!aoiAssessed) return;

                let editsCopy: EditsType = edits;
                const aoiAssessedLayer = layers.find(
                  (l) => l.layerId === aoiAssessed.layerId,
                );
                if (aoiAssessedLayer?.sketchLayer?.type === 'graphics') {
                  editsCopy = updateLayerEdits({
                    edits,
                    scenario: selectedScenario,
                    layer: aoiAssessedLayer,
                    type: 'delete',
                    changes: aoiAssessedLayer?.sketchLayer.graphics,
                  });

                  aoiAssessedLayer?.sketchLayer.graphics.removeAll();
                }

                setEdits(editsCopy);
              }}
            >
              <i className="fas fa-trash-alt" />
              <br />
              Delete All Results
            </button>
          </div>
        </div>
        <div css={lineSeparatorStyles} />
        <div css={sectionContainer}>
          {selectedScenario ? (
            <p></p>
          ) : (
            <Fragment>
              <p>
                Create a decontamination plan. Enter a plan name and description
                and click Save.
              </p>
              <MessageBox
                severity="warning"
                title=""
                message="Note: Your work in TODS only persists as long as your current browser session. Be sure to download results and/or publish your plan to retain a copy of your work."
              />
            </Fragment>
          )}

          {scenarios.length === 0 ? (
            <EditScenario addDefaultSampleLayer={true} />
          ) : (
            <Fragment>
              <div css={iconButtonContainerStyles}>
                <div css={verticalCenterTextStyles}>
                  <label htmlFor="scenario-select-input">Specify Plan</label>
                </div>
                <div>
                  {selectedScenario && (
                    <Fragment>
                      <button
                        css={iconButtonStyles}
                        title="Delete Plan"
                        onClick={() => {
                          // remove all of the child layers
                          setLayers((layers) => {
                            return layers.filter(
                              (layer) =>
                                selectedScenario.layers.findIndex(
                                  (scenarioLayer) =>
                                    scenarioLayer.layerId === layer.layerId,
                                ) === -1,
                            );
                          });

                          // remove the scenario from edits
                          const newEdits: EditsType = {
                            count: edits.count + 1,
                            edits: edits.edits.filter(
                              (item) =>
                                item.layerId !== selectedScenario.layerId,
                            ),
                          };
                          setEdits(newEdits);

                          // select the next available scenario
                          const scenarios = getScenarios(newEdits);
                          setSelectedScenario(
                            scenarios.length > 0 ? scenarios[0] : null,
                          );

                          if (!map) return;

                          // make the new selection visible
                          if (scenarios.length > 0) {
                            const newSelection = map.layers.find(
                              (layer) => layer.id === scenarios[0].layerId,
                            );
                            if (newSelection) newSelection.visible = true;
                          }

                          // remove the scenario from the map
                          const mapLayer = map.layers.find(
                            (layer) => layer.id === selectedScenario.layerId,
                          );
                          map.remove(mapLayer);
                        }}
                      >
                        <i className="fas fa-trash-alt" />
                        <span className="sr-only">Delete Plan</span>
                      </button>
                      <button
                        css={iconButtonStyles}
                        title="Clone Scenario"
                        onClick={(ev) => {
                          if (!map) return;

                          // get the name for the new layer
                          const newScenarioName = getScenarioName(
                            edits,
                            selectedScenario.label,
                          );

                          // get the edits from the selected scenario
                          const selectedScenarioEdits = findLayerInEdits(
                            edits.edits,
                            selectedScenario.layerId,
                          ).editsScenario;
                          if (!selectedScenarioEdits) return;

                          // copy the edits for that scenario
                          const copiedScenario: ScenarioEditsType =
                            deepCopyObject(selectedScenarioEdits);

                          // find the selected group layer
                          const selectedGroupLayer = map.layers.find(
                            (layer) => layer.id === copiedScenario.layerId,
                          );

                          // create a new group layer for the cloned scenario
                          const groupLayer = new GroupLayer({
                            title: newScenarioName,
                            visible: selectedGroupLayer.visible,
                            listMode: selectedGroupLayer.listMode,
                          });

                          // update the name and id for the copied scenario
                          copiedScenario.addedFrom = 'sketch';
                          copiedScenario.editType = 'add';
                          copiedScenario.hasContaminationRan = false;
                          copiedScenario.id = -1;
                          copiedScenario.label = newScenarioName;
                          copiedScenario.layerId = groupLayer.id;
                          copiedScenario.name = newScenarioName;
                          copiedScenario.pointsId = -1;
                          copiedScenario.portalId = '';
                          copiedScenario.scenarioName = newScenarioName;
                          copiedScenario.status = 'added';
                          copiedScenario.value = groupLayer.id;

                          // loop through and generate new uuids for layers/graphics
                          const timestamp = getCurrentDateTime();
                          copiedScenario.layers.forEach((layer) => {
                            // update info for layer
                            const layerUuid = generateUUID();
                            layer.addedFrom = 'sketch';
                            layer.editType = 'add';
                            layer.hasContaminationRan = false;
                            layer.id = -1;
                            layer.layerId = layerUuid;
                            layer.pointsId = -1;
                            layer.portalId = '';
                            layer.status = 'added';
                            layer.uuid = layerUuid;

                            // update info for combine adds, published, and updates
                            const newAdds = [...layer.adds, ...layer.updates];
                            layer.published.forEach((sample) => {
                              const alreadyAdded =
                                newAdds.findIndex(
                                  (addedSample) =>
                                    addedSample.attributes
                                      .PERMANENT_IDENTIFIER ===
                                    sample.attributes.PERMANENT_IDENTIFIER,
                                ) > -1;
                              if (!alreadyAdded) newAdds.push(sample);
                            });
                            layer.adds = newAdds;

                            // update info for adds
                            layer.adds.forEach((sample) => {
                              const sampleUuid = generateUUID();
                              sample.attributes.CREATEDDATE = timestamp;
                              sample.attributes.DECISIONUNITUUID = layerUuid;
                              sample.attributes.GLOBALID = sampleUuid;
                              sample.attributes.OBJECTID = -1;
                              sample.attributes.PERMANENT_IDENTIFIER =
                                sampleUuid;
                              sample.attributes.UPDATEDDATE = timestamp;
                            });

                            // clear out deletes, updates, and published
                            layer.deletes = [];
                            layer.updates = [];
                            layer.published = [];
                          });

                          const newLayers: LayerType[] = [];
                          const scenarioLayers: __esri.GraphicsLayer[] = [];
                          copiedScenario.layers.forEach((layer) => {
                            scenarioLayers.push(
                              ...createLayer({
                                defaultSymbols,
                                editsLayer: layer,
                                getPopupTemplate,
                                newLayers,
                                parentLayer: groupLayer,
                              }),
                            );
                          });
                          groupLayer.addMany(scenarioLayers);
                          map.add(groupLayer);

                          setLayers((layers) => {
                            return [...layers, ...newLayers];
                          });

                          const fullCopyEdits: EditsType =
                            deepCopyObject(edits);
                          fullCopyEdits.edits.push(copiedScenario);

                          setEdits(fullCopyEdits);

                          setSelectedScenario(copiedScenario);
                        }}
                      >
                        <i className="fas fa-clone" />
                        <span className="sr-only">Clone Scenario</span>
                      </button>
                      {selectedScenario.status !== 'published' && (
                        <button
                          css={iconButtonStyles}
                          title={editScenarioVisible ? 'Cancel' : 'Edit Plan'}
                          onClick={() => {
                            setAddScenarioVisible(false);
                            setEditScenarioVisible(!editScenarioVisible);
                          }}
                        >
                          <i
                            className={
                              editScenarioVisible
                                ? 'fas fa-times'
                                : 'fas fa-edit'
                            }
                          />
                          <span className="sr-only">
                            {editScenarioVisible ? 'Cancel' : 'Edit Plan'}
                          </span>
                        </button>
                      )}
                    </Fragment>
                  )}
                  <button
                    css={iconButtonStyles}
                    title={addScenarioVisible ? 'Cancel' : 'Add Plan'}
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
                    <span className="sr-only">
                      {addScenarioVisible ? 'Cancel' : 'Add Plan'}
                    </span>
                  </button>
                </div>
              </div>
              <Select
                id="scenario-select-input-container"
                inputId="scenario-select-input"
                css={layerSelectStyles}
                isDisabled={addScenarioVisible || editScenarioVisible}
                value={selectedScenario}
                onChange={(ev) => {
                  const newScenario = ev as ScenarioEditsType;
                  setSelectedScenario(newScenario);

                  // update the visiblity of layers
                  layers.forEach((layer) => {
                    if (layer.parentLayer) {
                      layer.parentLayer.visible =
                        layer.parentLayer.id === newScenario.layerId
                          ? true
                          : false;
                      return;
                    }

                    if (
                      layer.layerType === 'Samples' ||
                      layer.layerType === 'VSP'
                    ) {
                      layer.sketchLayer.visible = false;
                    }
                  });

                  setEdits((edits) => ({
                    count: edits.count + 1,
                    edits: edits.edits.map((edit) => {
                      let visible = edit.visible;

                      if (edit.type === 'scenario') {
                        visible =
                          edit.layerId === newScenario.layerId ? true : false;
                      }
                      if (edit.type === 'layer') {
                        if (
                          edit.layerType === 'Samples' ||
                          edit.layerType === 'VSP'
                        ) {
                          visible = false;
                        }
                      }

                      return {
                        ...edit,
                        visible,
                      };
                    }),
                  }));
                }}
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
            </Fragment>
          )}

          {/* {selectedScenario && !addScenarioVisible && !editScenarioVisible && (
            <Fragment>
              <div css={iconButtonContainerStyles}>
                <div css={verticalCenterTextStyles}>
                  <label htmlFor="sampling-layer-select-input">
                    Active
                    <br />
                    Decon Layer
                  </label>
                </div>
                <div css={buttonContainerStyles}>
                  {sketchLayer && (
                    <Fragment>
                      {sketchLayer.parentLayer ? (
                        <button
                          css={iconButtonStyles}
                          title="Unlink Layer"
                          onClick={() => {
                            if (!map) return;

                            // update edits (move the layer to the root)
                            setEdits((edits) => {
                              const {
                                scenarioIndex,
                                layerIndex,
                                editsScenario,
                                editsLayer,
                              } = findLayerInEdits(
                                edits.edits,
                                sketchLayer.layerId,
                              );

                              if (editsScenario) {
                                editsScenario.layers = [
                                  ...editsScenario.layers.slice(0, layerIndex),
                                  ...editsScenario.layers.slice(layerIndex + 1),
                                ];
                                if (editsScenario.status === 'published') {
                                  editsScenario.status = 'edited';
                                }

                                return {
                                  count: edits.count + 1,
                                  edits: [
                                    ...edits.edits.slice(0, scenarioIndex),
                                    editsScenario,
                                    ...edits.edits.slice(scenarioIndex + 1),
                                    {
                                      ...editsLayer,
                                      visible: false,
                                    },
                                  ],
                                };
                              }

                              return {
                                count: edits.count + 1,
                                edits: [...edits.edits, editsLayer],
                              };
                            });

                            // remove the layer from the parent group layer and add to map
                            sketchLayer.sketchLayer.visible = false;
                            sketchLayer.parentLayer?.remove(
                              sketchLayer.sketchLayer,
                            );
                            map.add(sketchLayer.sketchLayer);
                            if (sketchLayer.pointsLayer) {
                              sketchLayer.pointsLayer.visible = false;
                              sketchLayer.parentLayer?.remove(
                                sketchLayer.pointsLayer,
                              );
                              map.add(sketchLayer.pointsLayer);
                            }
                            if (sketchLayer.hybridLayer) {
                              sketchLayer.hybridLayer.visible = false;
                              sketchLayer.parentLayer?.remove(
                                sketchLayer.hybridLayer,
                              );
                              map.add(sketchLayer.hybridLayer);
                            }

                            // update layers (clear parent layer)
                            setLayers((layers) => {
                              const layerIndex = layers.findIndex(
                                (layer) =>
                                  layer.layerId === sketchLayer.layerId,
                              );

                              if (layerIndex === -1) return layers;

                              const layer = layers[layerIndex];
                              layer.parentLayer = null;

                              return [
                                ...layers.slice(0, layerIndex),
                                layer,
                                ...layers.slice(layerIndex + 1),
                              ];
                            });

                            // update sketchLayer (clear parent layer)
                            setSketchLayer((sketchLayer) => {
                              if (!sketchLayer) return sketchLayer;

                              return {
                                ...sketchLayer,
                                parentLayer: null,
                              };
                            });

                            // update the selected scenario
                            setSelectedScenario((selectedScenario) => {
                              if (!selectedScenario) return selectedScenario;

                              return {
                                ...selectedScenario,
                                layers: selectedScenario.layers.filter(
                                  (layer) =>
                                    layer.layerId !== sketchLayer.layerId,
                                ),
                              };
                            });
                          }}
                        >
                          <i className="fas fa-unlink" />
                          <span className="sr-only">Unlink Layer</span>
                        </button>
                      ) : (
                        <button
                          css={iconButtonStyles}
                          title="Link Layer"
                          onClick={() => {
                            if (!map || !selectedScenario) return;

                            // update edits (move the layer to the selected scenario)
                            const editsCopy = updateLayerEdits({
                              edits,
                              scenario: selectedScenario,
                              layer: sketchLayer,
                              type: 'move',
                            });
                            setEdits(editsCopy);

                            // find the new parent layer
                            const groupLayer = map.layers.find(
                              (layer) => layer.id === selectedScenario.layerId,
                            ) as __esri.GroupLayer;
                            if (!groupLayer) return;

                            // add the layer to the parent group layer
                            groupLayer.add(sketchLayer.sketchLayer);
                            if (sketchLayer.pointsLayer) {
                              groupLayer.add(sketchLayer.pointsLayer);
                            }
                            if (sketchLayer.hybridLayer) {
                              groupLayer.add(sketchLayer.hybridLayer);
                            }

                            // show the newly added layer
                            if (
                              displayGeometryType === 'points' &&
                              sketchLayer.pointsLayer
                            ) {
                              sketchLayer.pointsLayer.visible = true;
                            } else if (
                              displayGeometryType === 'hybrid' &&
                              sketchLayer.hybridLayer
                            ) {
                              sketchLayer.hybridLayer.visible = true;
                            } else {
                              sketchLayer.sketchLayer.visible = true;
                            }

                            // update layers (set parent layer)
                            setLayers((layers) => {
                              const layerIndex = layers.findIndex(
                                (layer) =>
                                  layer.layerId === sketchLayer.layerId,
                              );

                              if (layerIndex === -1) return layers;

                              const layer = layers[layerIndex];
                              layer.parentLayer = groupLayer;

                              return [
                                ...layers.slice(0, layerIndex),
                                layer,
                                ...layers.slice(layerIndex + 1),
                              ];
                            });

                            // update sketchLayer (clear parent layer)
                            setSketchLayer((sketchLayer) => {
                              if (!sketchLayer) return sketchLayer;

                              return {
                                ...sketchLayer,
                                parentLayer: groupLayer,
                              };
                            });

                            // update the selectedScenario to keep the active layer dropdown
                            // synced up
                            const scenario = editsCopy.edits.find(
                              (edit) =>
                                edit.type === 'scenario' &&
                                edit.layerId === selectedScenario.layerId,
                            );
                            if (scenario)
                              setSelectedScenario(
                                scenario as ScenarioEditsType,
                              );
                          }}
                        >
                          <i className="fas fa-link" />
                          <span className="sr-only">Link Layer</span>
                        </button>
                      )}
                      <button
                        css={iconButtonStyles}
                        title="Delete Layer"
                        onClick={() => {
                          // remove the layer from layers
                          setLayers((layers) => {
                            return layers.filter(
                              (layer) => layer.layerId !== sketchLayer.layerId,
                            );
                          });

                          const parentLayer = sketchLayer.parentLayer;
                          if (parentLayer) {
                            // remove the scenario from edits
                            setEdits((edits) => {
                              const index = edits.edits.findIndex(
                                (edit) => edit.layerId === parentLayer.id,
                              );

                              const editedScenario = edits.edits[
                                index
                              ] as ScenarioEditsType;
                              editedScenario.layers =
                                editedScenario.layers.filter(
                                  (layer) =>
                                    layer.layerId !== sketchLayer.layerId,
                                );

                              return {
                                count: edits.count + 1,
                                edits: [
                                  ...edits.edits.slice(0, index),
                                  editedScenario,
                                  ...edits.edits.slice(index + 1),
                                ],
                              };
                            });

                            if (sketchLayer.sketchLayer)
                              parentLayer.remove(sketchLayer.sketchLayer);
                            if (sketchLayer.pointsLayer)
                              parentLayer.remove(sketchLayer.pointsLayer);
                            if (sketchLayer.hybridLayer)
                              parentLayer.remove(sketchLayer.hybridLayer);
                          } else {
                            // remove the scenario from edits
                            setEdits((edits) => {
                              return {
                                count: edits.count + 1,
                                edits: edits.edits.filter(
                                  (item) =>
                                    item.layerId !== sketchLayer.layerId,
                                ),
                              };
                            });
                          }

                          // select the next available layer
                          let newSketchLayerIndex: number = -1;

                          // check in the selected scenario first, then in the root of edits
                          if (selectedScenario) {
                            const index = selectedScenario.layers.findIndex(
                              (layer) => layer.layerId !== sketchLayer.layerId,
                            );
                            if (index > -1) {
                              newSketchLayerIndex = layers.findIndex(
                                (layer) =>
                                  layer.layerId ===
                                  selectedScenario.layers[index].layerId,
                              );
                            }
                          }
                          if (newSketchLayerIndex === -1) {
                            const index = edits.edits.findIndex(
                              (layer) =>
                                layer.type === 'layer' &&
                                (layer.layerType === 'Samples' ||
                                  layer.layerType === 'VSP') &&
                                layer.layerId !== sketchLayer.layerId,
                            );
                            if (index > -1) {
                              newSketchLayerIndex = layers.findIndex(
                                (layer) =>
                                  layer.layerId === edits.edits[index].layerId,
                              );
                            }
                          }

                          setSketchLayer(
                            newSketchLayerIndex > -1
                              ? layers[newSketchLayerIndex]
                              : null,
                          );

                          // remove the scenario from the map
                          const parent = parentLayer
                            ? parentLayer
                            : map
                              ? map
                              : null;
                          if (parent) parent.remove(sketchLayer.sketchLayer);
                        }}
                      >
                        <i className="fas fa-trash-alt" />
                        <span className="sr-only">Delete Layer</span>
                      </button>
                      <button
                        css={iconButtonStyles}
                        title="Clone Layer"
                        onClick={(ev) => {
                          // get the name for the new layer
                          const newLayerName = getLayerName(
                            layers,
                            sketchLayer.label,
                          );

                          // create the layer
                          const tempLayer = createSampleLayer(
                            newLayerName,
                            sketchLayer.parentLayer,
                          );
                          if (
                            !map ||
                            sketchLayer.sketchLayer.type !== 'graphics' ||
                            tempLayer.sketchLayer.type !== 'graphics' ||
                            !tempLayer.pointsLayer ||
                            tempLayer.pointsLayer.type !== 'graphics' ||
                            !tempLayer.hybridLayer ||
                            tempLayer.hybridLayer.type !== 'graphics'
                          )
                            return;

                          const clonedGraphics: __esri.Graphic[] = [];
                          const clonedPointGraphics: __esri.Graphic[] = [];
                          const clonedHybridGraphics: __esri.Graphic[] = [];
                          sketchLayer.sketchLayer.graphics.forEach(
                            (graphic) => {
                              const uuid = generateUUID();
                              const clonedGraphic = new Graphic({
                                attributes: {
                                  ...graphic.attributes,
                                  GLOBALID: uuid,
                                  PERMANENT_IDENTIFIER: uuid,
                                  DECISIONUNIT: tempLayer.name,
                                  DECISIONUNITUUID: tempLayer.uuid,
                                },
                                geometry: graphic.geometry,
                                popupTemplate: graphic.popupTemplate,
                                symbol: graphic.symbol,
                              });
                              clonedGraphics.push(clonedGraphic);

                              clonedPointGraphics.push(
                                convertToPoint(clonedGraphic),
                              );
                              clonedHybridGraphics.push(
                                clonedGraphic.attributes.ShapeType === 'point'
                                  ? convertToPoint(clonedGraphic)
                                  : clonedGraphic.clone(),
                              );
                            },
                          );

                          tempLayer.sketchLayer.addMany(clonedGraphics);
                          tempLayer.pointsLayer.addMany(clonedPointGraphics);
                          tempLayer.hybridLayer.addMany(clonedHybridGraphics);

                          // add the new layer to layers
                          setLayers((layers) => {
                            return [...layers, tempLayer];
                          });

                          // clone the active layer in edits
                          // make a copy of the edits context variable
                          let editsCopy = updateLayerEdits({
                            changes: tempLayer.sketchLayer.graphics,
                            edits,
                            scenario: selectedScenario,
                            layer: tempLayer,
                            type: 'add',
                          });
                          setEdits(editsCopy);

                          // add the layer to the scenario's group layer, a scenario is selected
                          const groupLayer = map.layers.find(
                            (layer) => layer.id === selectedScenario?.layerId,
                          );
                          if (groupLayer && groupLayer.type === 'group') {
                            const tempGroupLayer =
                              groupLayer as __esri.GroupLayer;
                            tempGroupLayer.add(tempLayer.sketchLayer);
                            if (tempLayer.pointsLayer) {
                              tempGroupLayer.add(tempLayer.pointsLayer);
                            }
                            if (tempLayer.hybridLayer) {
                              tempGroupLayer.add(tempLayer.hybridLayer);
                            }
                          }

                          // make the new layer the active sketch layer
                          setSketchLayer(tempLayer);

                          setSelectedScenario((selectedScenario) => {
                            if (!selectedScenario) return selectedScenario;

                            const scenario = editsCopy.edits.find(
                              (edit) =>
                                edit.type === 'scenario' &&
                                edit.layerId === selectedScenario.layerId,
                            ) as ScenarioEditsType;
                            const newLayer = scenario.layers.find(
                              (layer) => layer.layerId === tempLayer.layerId,
                            );

                            if (!newLayer) return selectedScenario;

                            return {
                              ...selectedScenario,
                              layers: [...selectedScenario.layers, newLayer],
                            };
                          });
                        }}
                      >
                        <i className="fas fa-clone" />
                        <span className="sr-only">Clone Layer</span>
                      </button>
                      <button
                        css={iconButtonStyles}
                        title={editLayerVisible ? 'Cancel' : 'Edit Layer'}
                        onClick={() => {
                          setAddLayerVisible(false);
                          setEditLayerVisible(!editLayerVisible);
                        }}
                      >
                        <i
                          className={
                            editLayerVisible ? 'fas fa-times' : 'fas fa-edit'
                          }
                        />
                        <span className="sr-only">
                          {editLayerVisible ? 'Cancel' : 'Edit Layer'}
                        </span>
                      </button>
                    </Fragment>
                  )}
                  <button
                    css={iconButtonStyles}
                    title={addLayerVisible ? 'Cancel' : 'Add Layer'}
                    onClick={() => {
                      setEditLayerVisible(false);
                      setAddLayerVisible(!addLayerVisible);
                    }}
                  >
                    <i
                      className={
                        addLayerVisible ? 'fas fa-times' : 'fas fa-plus'
                      }
                    />
                    <span className="sr-only">
                      {addLayerVisible ? 'Cancel' : 'Add Layer'}
                    </span>
                  </button>
                </div>
              </div>
              <Select
                id="sampling-layer-select"
                inputId="sampling-layer-select-input"
                css={layerSelectStyles}
                isDisabled={addLayerVisible || editLayerVisible}
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
            </Fragment>
          )} */}
        </div>

        {selectedScenario && (
          <Fragment>
            {/* <div css={sectionContainerWidthOnly}>
              <p>
                In the panels below, select and add decontamination technologies
                to apply to the plan.
              </p>
              <ColorPicker
                title="Default Decon Technology Symbology"
                symbol={defaultSymbols.symbols['Samples']}
                onChange={(symbol: PolygonSymbol) => {
                  setDefaultSymbolSingle('Samples', symbol);
                }}
              />
            </div> */}
            <AccordionList>
              <AccordionItem
                title="Characterize Area of Interest"
                initiallyExpanded={true}
              >
                <div css={sectionContainer}>
                  {sketchLayer?.layerType === 'VSP' && cantUseWithVspMessage}
                  {sketchLayer?.layerType !== 'VSP' && (
                    <Fragment>
                      {(services.status === 'fetching' ||
                        sampleTypeContext.status === 'fetching' ||
                        layerProps.status === 'fetching') && <LoadingSpinner />}
                      {(services.status === 'failure' ||
                        sampleTypeContext.status === 'failure' ||
                        layerProps.status === 'failure') &&
                        featureNotAvailableMessage(
                          'Add Multiple Random Samples',
                        )}
                      {services.status === 'success' &&
                        sampleTypeContext.status === 'success' &&
                        layerProps.status === 'success' && (
                          <Fragment>
                            <p>
                              Select "Draw Sampling Mask" to draw a boundary on
                              your map for assessing AOI or select "Use Imported
                              Area of Interest" to use an Area of Interest file
                              to assess the AOI. Click Submit to assess the AOI.
                            </p>
                            <div>
                              <label htmlFor="contamination-map-select-input">
                                Contamination map
                              </label>
                              <div css={inlineMenuStyles}>
                                <Select
                                  id="contamination-map-select"
                                  inputId="contamination-map-select-input"
                                  css={fullWidthSelectStyles}
                                  styles={reactSelectStyles as any}
                                  value={contaminationMap}
                                  onChange={(ev) =>
                                    setContaminationMap(ev as LayerType)
                                  }
                                  options={layers.filter(
                                    (layer: any) =>
                                      layer.layerType === 'Contamination Map',
                                  )}
                                />
                                <button
                                  css={addButtonStyles}
                                  onClick={(ev) => {
                                    setGoTo('addData');
                                    setGoToOptions({
                                      from: 'file',
                                      layerType: 'Contamination Map',
                                    });
                                  }}
                                >
                                  Add
                                </button>
                              </div>
                            </div>
                            <br />

                            <div>
                              <input
                                id="draw-aoi"
                                type="radio"
                                name="mode"
                                value="Draw area of Interest"
                                disabled={
                                  generateRandomResponse.status === 'fetching'
                                }
                                checked={generateRandomMode === 'draw'}
                                onChange={(ev) => {
                                  setGenerateRandomMode('draw');

                                  const maskLayers = layers.filter(
                                    (layer) =>
                                      layer.layerType === 'Sampling Mask',
                                  );
                                  setAoiSketchLayer(maskLayers[0]);
                                }}
                              />
                              <label htmlFor="draw-aoi" css={radioLabelStyles}>
                                Draw Sampling Mask
                              </label>
                            </div>

                            {generateRandomMode === 'draw' && (
                              <button
                                id="sampling-mask"
                                title="Draw Sampling Mask"
                                className="sketch-button"
                                disabled={
                                  generateRandomResponse.status === 'fetching'
                                }
                                onClick={() => {
                                  if (!aoiSketchLayer) return;

                                  sketchAoiButtonClick();
                                }}
                                css={sketchAoiButtonStyles}
                              >
                                <span css={sketchAoiTextStyles}>
                                  <i className="fas fa-draw-polygon" />{' '}
                                  <span>Draw Sampling Mask</span>
                                </span>
                              </button>
                            )}

                            <div>
                              <input
                                id="use-aoi-file"
                                type="radio"
                                name="mode"
                                value="Use Imported Area of Interest"
                                disabled={
                                  generateRandomResponse.status === 'fetching'
                                }
                                checked={generateRandomMode === 'file'}
                                onChange={(ev) => {
                                  setGenerateRandomMode('file');

                                  setAoiSketchLayer(null);

                                  if (!selectedAoiFile) {
                                    const aoiLayers = layers.filter(
                                      (layer) =>
                                        layer.layerType === 'Area of Interest',
                                    );
                                    setSelectedAoiFile(aoiLayers[0]);
                                  }
                                }}
                              />
                              <label
                                htmlFor="use-aoi-file"
                                css={radioLabelStyles}
                              >
                                Use Imported Area of Interest
                              </label>
                            </div>

                            {generateRandomMode === 'file' && (
                              <Fragment>
                                <label htmlFor="aoi-mask-select-input">
                                  Area of Interest Mask
                                </label>
                                <div css={inlineMenuStyles}>
                                  <Select
                                    id="aoi-mask-select"
                                    inputId="aoi-mask-select-input"
                                    css={inlineSelectStyles}
                                    styles={reactSelectStyles as any}
                                    isClearable={true}
                                    value={selectedAoiFile}
                                    onChange={(ev) =>
                                      setSelectedAoiFile(ev as LayerType)
                                    }
                                    options={layers.filter(
                                      (layer) =>
                                        layer.layerType === 'Area of Interest',
                                    )}
                                  />
                                  <button
                                    css={addButtonStyles}
                                    disabled={
                                      generateRandomResponse.status ===
                                      'fetching'
                                    }
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
                              </Fragment>
                            )}
                            {generateRandomMode && (
                              <Fragment>
                                <br />
                                {generateRandomResponse.status === 'success' &&
                                  sketchLayer &&
                                  generateRandomSuccessMessage(
                                    generateRandomResponse.data.length,
                                    sketchLayer.label,
                                  )}
                                {generateRandomResponse.status === 'failure' &&
                                  webServiceErrorMessage(
                                    generateRandomResponse.error,
                                  )}
                                {generateRandomResponse.status ===
                                  'exceededTransferLimit' &&
                                  generateRandomExceededTransferLimitMessage}
                                {((generateRandomMode === 'draw' &&
                                  aoiSketchLayer?.sketchLayer.type ===
                                    'graphics' &&
                                  aoiSketchLayer.sketchLayer.graphics.length >
                                    0) ||
                                  (generateRandomMode === 'file' &&
                                    selectedAoiFile?.sketchLayer.type ===
                                      'graphics' &&
                                    selectedAoiFile.sketchLayer.graphics
                                      .length > 0)) && (
                                  <button
                                    css={submitButtonStyles}
                                    disabled={
                                      generateRandomResponse.status ===
                                      'fetching'
                                    }
                                    onClick={assessAoi}
                                  >
                                    {generateRandomResponse.status !==
                                      'fetching' && 'Submit'}
                                    {generateRandomResponse.status ===
                                      'fetching' && (
                                      <Fragment>
                                        <i className="fas fa-spinner fa-pulse" />
                                        &nbsp;&nbsp;Loading...
                                      </Fragment>
                                    )}
                                  </button>
                                )}
                              </Fragment>
                            )}

                            <div>
                              {downloadStatus === 'fetching' && (
                                <LoadingSpinner />
                              )}
                              {downloadStatus === 'excel-failure' &&
                                excelFailureMessage}
                              {downloadStatus === 'no-data' &&
                                noDataDownloadMessage}
                              {downloadStatus === 'success' &&
                                downloadSuccessMessage}

                              <button
                                css={submitButtonStyles}
                                onClick={() => setTablePanelExpanded(true)}
                              >
                                View Results
                              </button>
                              <br />
                              <button
                                css={submitButtonStyles}
                                onClick={downloadSummary}
                              >
                                Download Results
                              </button>
                            </div>
                          </Fragment>
                        )}
                    </Fragment>
                  )}
                </div>
              </AccordionItem>
              {/* <AccordionItem
                title={'Apply Decontamination Technology'}
                initiallyExpanded={true}
              >
                <div css={sectionContainer}>
                  <p>
                    Click on a decon technology to enable TODS drawing mode.
                    Click on the map layer to draw a decontamination application
                    point. Optionally, add any relevant notes. Click Save.
                    Repeat these steps to continue adding targeted
                    decontamination methods.
                  </p>
                  <div>
                    <h3>Established Decontamination Technologies</h3>
                    <div css={sketchButtonContainerStyles}>
                      {sampleTypeContext.status === 'fetching' && (
                        <LoadingSpinner />
                      )}
                      {sampleTypeContext.status === 'failure' &&
                        featureNotAvailableMessage(
                          'Established Decon Technologies',
                        )}
                      {sampleTypeContext.status === 'success' && (
                        <Fragment>
                          {sampleTypeContext.data.sampleSelectOptions.map(
                            (option: any, index: number) => {
                              const sampleTypeUuid = option.value;
                              const sampleType = option.label;

                              if (
                                !sampleAttributes.hasOwnProperty(sampleTypeUuid)
                              ) {
                                return null;
                              }

                              const shapeType =
                                sampleAttributes[sampleTypeUuid].ShapeType;
                              const edited =
                                userDefinedAttributes.sampleTypes.hasOwnProperty(
                                  sampleTypeUuid,
                                );
                              return (
                                <SketchButton
                                  key={index}
                                  layers={layers}
                                  value={sampleTypeUuid}
                                  selectedScenario={selectedScenario}
                                  label={
                                    edited
                                      ? `${sampleType} (edited)`
                                      : sampleType
                                  }
                                  iconClass={
                                    shapeType === 'point'
                                      ? 'fas fa-pen-fancy'
                                      : 'fas fa-draw-polygon'
                                  }
                                  onClick={() =>
                                    sketchButtonClick(sampleTypeUuid)
                                  }
                                />
                              );
                            },
                          )}
                        </Fragment>
                      )}
                    </div>
                  </div>
                  {userDefinedOptions.length > 0 && (
                    <div>
                      <br />
                      <h3>Custom Decon Technologies</h3>
                      <div css={sketchButtonContainerStyles}>
                        {userDefinedOptions.map((option, index) => {
                          if (option.isPredefined) return null;

                          const sampleTypeUuid = option.value;
                          const shapeType =
                            sampleAttributes[sampleTypeUuid as any].ShapeType;
                          return (
                            <SketchButton
                              key={index}
                              value={sampleTypeUuid}
                              label={option.label}
                              layers={layers}
                              selectedScenario={selectedScenario}
                              iconClass={
                                shapeType === 'point'
                                  ? 'fas fa-pen-fancy'
                                  : 'fas fa-draw-polygon'
                              }
                              onClick={() => sketchButtonClick(sampleTypeUuid)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </AccordionItem>
              <AccordionItem
                title={'Create Custom Decontamination Technologies'}
              >
                <div css={sectionContainer}>
                  <p>
                    Choose an existing decon technology from the menu or click +
                    to add a new decon technology from scratch. You have the
                    option to clone or view an existing decon technology.
                    Populate or edit the parameter fields and click Save. Once
                    you have saved a custom decon technology you can edit and/or
                    delete the parameters using additional controls now
                    available to you.
                  </p>
                  <div css={iconButtonContainerStyles}>
                    <label htmlFor="cst-sample-type-select-input">
                      Decon Technology
                    </label>
                    <div>
                      {userDefinedSampleType && (
                        <Fragment>
                          {!editingStatus &&
                            !userDefinedSampleType.isPredefined && (
                              <button
                                css={iconButtonStyles}
                                title="Delete Decon Technology"
                                onClick={() => {
                                  setValidationMessage('');
                                  const sampleTypeUuid =
                                    userDefinedSampleType.value;

                                  setOptions({
                                    title: 'Would you like to continue?',
                                    ariaLabel: 'Would you like to continue?',
                                    description:
                                      'Decon plans are referencing decon applications based on one or more of the custom decon technologies. ' +
                                      'This operation will delete any decon applications from the decon plan that are associated ' +
                                      'with these custom decon technologies that you are attempting to remove.',
                                    onContinue: () => {
                                      setUserDefinedOptions(
                                        userDefinedOptions.filter(
                                          (option) =>
                                            option.value !== sampleTypeUuid,
                                        ),
                                      );
                                      setUserDefinedAttributes(
                                        (userDefined) => {
                                          const newUserDefined = {
                                            ...userDefined,
                                          };

                                          // mark to delete if this is a published sample type
                                          // otherwise just remove it
                                          if (
                                            newUserDefined.sampleTypes[
                                              sampleTypeUuid
                                            ].serviceId
                                          ) {
                                            newUserDefined.sampleTypes[
                                              sampleTypeUuid
                                            ].status = 'delete';
                                          } else {
                                            delete newUserDefined.sampleTypes[
                                              sampleTypeUuid
                                            ];
                                          }

                                          newUserDefined.editCount =
                                            newUserDefined.editCount + 1;
                                          return newUserDefined;
                                        },
                                      );
                                      setSampleTypeSelections([]);

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

                                        const graphicsToRemove: __esri.Graphic[] =
                                          [];
                                        layer.sketchLayer.graphics.forEach(
                                          (graphic) => {
                                            if (
                                              graphic.attributes.TYPEUUID ===
                                              sampleTypeUuid
                                            ) {
                                              graphicsToRemove.push(graphic);
                                            }
                                          },
                                        );
                                        layer.sketchLayer.removeMany(
                                          graphicsToRemove,
                                        );

                                        if (graphicsToRemove.length > 0) {
                                          const collection =
                                            new Collection<__esri.Graphic>();
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

                                      setUserDefinedSampleType(null);
                                    },
                                  });
                                }}
                              >
                                <i className="fas fa-trash-alt" />
                                <span className="sr-only">
                                  Delete Decon Technology
                                </span>
                              </button>
                            )}
                          <button
                            css={iconButtonStyles}
                            title={
                              editingStatus === 'clone'
                                ? 'Cancel'
                                : 'Clone Decon Technology'
                            }
                            onClick={(ev) => {
                              setValidationMessage('');
                              if (editingStatus === 'clone') {
                                setEditingStatus(null);
                                if (
                                  userDefinedSampleType &&
                                  defaultSymbols.symbols.hasOwnProperty(
                                    userDefinedSampleType.value,
                                  )
                                ) {
                                  setUdtSymbol(
                                    defaultSymbols.symbols[
                                      userDefinedSampleType.value
                                    ],
                                  );
                                } else {
                                  setUdtSymbol(
                                    defaultSymbols.symbols['Samples'],
                                  );
                                }
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
                              {editingStatus === 'clone'
                                ? 'Cancel'
                                : 'Clone Decon Technology'}
                            </span>
                          </button>
                          {userDefinedSampleType.isPredefined ? (
                            <button
                              css={iconButtonStyles}
                              title={
                                editingStatus === 'view'
                                  ? 'Hide'
                                  : 'View Decon Technology'
                              }
                              onClick={(ev) => {
                                setValidationMessage('');
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
                                    : 'fas fa-file-alt'
                                }
                              />
                              <span className="sr-only">
                                {editingStatus === 'view'
                                  ? 'Hide'
                                  : 'View Decon Technology'}
                              </span>
                            </button>
                          ) : (
                            <button
                              css={iconButtonStyles}
                              title={
                                editingStatus === 'edit'
                                  ? 'Cancel'
                                  : 'Edit Decon Technology'
                              }
                              onClick={(ev) => {
                                setValidationMessage('');
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
                                {editingStatus === 'edit'
                                  ? 'Cancel'
                                  : 'Edit Decon Technology'}
                              </span>
                            </button>
                          )}
                        </Fragment>
                      )}
                      <button
                        css={iconButtonStyles}
                        title={
                          editingStatus === 'create'
                            ? 'Cancel'
                            : 'Create Decon Technology'
                        }
                        onClick={(ev) => {
                          setValidationMessage('');
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
                          {editingStatus === 'create'
                            ? 'Cancel'
                            : 'Create Decon Technology'}
                        </span>
                      </button>
                    </div>
                  </div>
                  <Select
                    id="cst-sample-type-select"
                    inputId="cst-sample-type-select-input"
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
                      <ColorPicker
                        symbol={udtSymbol}
                        onChange={(symbol: PolygonSymbol) => {
                          setUdtSymbol(symbol);
                        }}
                      />
                      <label htmlFor="point-style-select-input">
                        Point Style
                      </label>
                      <Select
                        id="point-style-select"
                        inputId="point-style-select-input"
                        css={fullWidthSelectStyles}
                        value={pointStyle}
                        isDisabled={editingStatus === 'view'}
                        onChange={(ev) => setPointStyle(ev as ShapeTypeSelect)}
                        options={pointStyles}
                      />
                      <div>
                        <label htmlFor="sample-type-name-input">
                          Decon Technology Name
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
                          Application Max Area{' '}
                          <em>
                            (m<sup>2</sup>)
                          </em>
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
                        <label htmlFor="ttpk-input">
                          Setup Time <em>(hrs)</em>
                        </label>
                        <input
                          id="ttpk-input"
                          disabled={editingStatus === 'view'}
                          css={inputStyles}
                          value={ttpk ? ttpk : ''}
                          onChange={(ev) => setTtpk(ev.target.value)}
                        />
                        <label htmlFor="ttc-input">
                          Application Time{' '}
                          <em>
                            (hrs/m<sup>2</sup>)
                          </em>
                        </label>
                        <input
                          id="ttc-input"
                          disabled={editingStatus === 'view'}
                          css={inputStyles}
                          value={ttc ? ttc : ''}
                          onChange={(ev) => setTtc(ev.target.value)}
                        />
                        <label htmlFor="tta-input">
                          Residence Time <em>(hrs)</em>
                        </label>
                        <input
                          id="tta-input"
                          disabled={editingStatus === 'view'}
                          css={inputStyles}
                          value={tta ? tta : ''}
                          onChange={(ev) => setTta(ev.target.value)}
                        />
                        {/* <label htmlFor="ttps-input">
                          Total Time per Decon <em>(person hrs/application)</em>
                        </label>
                        <input
                          id="ttps-input"
                          disabled={editingStatus === 'view'}
                          css={inputStyles}
                          value={ttps ? ttps : ''}
                          onChange={(ev) => setTtps(ev.target.value)}
                        /> /}
                        <label htmlFor="lod_p-input">
                          Log Reduction <em>(only used for reference)</em>
                        </label>
                        <input
                          id="lod_p-input"
                          disabled={editingStatus === 'view'}
                          css={inputStyles}
                          value={lodp ? lodp : ''}
                          onChange={(ev) => setLodp(ev.target.value)}
                        />
                        <label htmlFor="lod_non-input">
                          Contamination Removal <em>(%)</em>
                        </label>
                        <input
                          id="lod_non-input"
                          disabled={editingStatus === 'view'}
                          css={inputStyles}
                          value={lodnon ? lodnon : ''}
                          onChange={(ev) => setLodnon(ev.target.value)}
                        />
                        <label htmlFor="mcps-input">
                          Setup Cost <em>($/application)</em>
                        </label>
                        <input
                          id="mcps-input"
                          disabled={editingStatus === 'view'}
                          css={inputStyles}
                          value={mcps ? mcps : ''}
                          onChange={(ev) => setMcps(ev.target.value)}
                        />
                        <label htmlFor="tcps-input">
                          Application Cost{' '}
                          <em>
                            ($/m<sup>2</sup>)
                          </em>
                        </label>
                        <input
                          id="tcps-input"
                          disabled={editingStatus === 'view'}
                          css={inputStyles}
                          value={tcps ? tcps : ''}
                          onChange={(ev) => setTcps(ev.target.value)}
                        />
                        <label htmlFor="wvps-input">
                          Solid Waste Volume{' '}
                          <em>
                            (m<sup>3</sup>/m<sup>2</sup>)
                          </em>
                        </label>
                        <input
                          id="wvps-input"
                          disabled={editingStatus === 'view'}
                          css={inputStyles}
                          value={wvps ? wvps : ''}
                          onChange={(ev) => setWvps(ev.target.value)}
                        />
                        <label htmlFor="wwps-input">
                          Solid Waste Mass{' '}
                          <em>
                            (kg/m<sup>2</sup>)
                          </em>
                        </label>
                        <input
                          id="wwps-input"
                          disabled={editingStatus === 'view'}
                          css={inputStyles}
                          value={wwps ? wwps : ''}
                          onChange={(ev) => setWwps(ev.target.value)}
                        />
                        <label htmlFor="alc-input">
                          Liquid Waste Volume{' '}
                          <em>
                            (m<sup>3</sup>/m<sup>2</sup>)
                          </em>
                        </label>
                        <input
                          id="alc-input"
                          disabled={editingStatus === 'view'}
                          css={inputStyles}
                          value={alc ? alc : ''}
                          onChange={(ev) => setAlc(ev.target.value)}
                        />
                        <label htmlFor="amc-input">
                          Liquid Waste Mass{' '}
                          <em>
                            (kg/m<sup>2</sup>)
                          </em>
                        </label>
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
                        <button
                          css={addButtonStyles}
                          onClick={(ev) => {
                            setEditingStatus(null);
                            setValidationMessage('');
                          }}
                        >
                          {editingStatus === 'view' ? 'Hide' : 'Cancel'}
                        </button>
                        {(editingStatus !== 'view' ||
                          (editingStatus === 'view' &&
                            udtSymbol &&
                            userDefinedSampleType &&
                            ((defaultSymbols.symbols.hasOwnProperty(
                              userDefinedSampleType.value,
                            ) &&
                              JSON.stringify(udtSymbol) !==
                                JSON.stringify(
                                  defaultSymbols.symbols[
                                    userDefinedSampleType.value
                                  ],
                                )) ||
                              (!defaultSymbols.symbols.hasOwnProperty(
                                userDefinedSampleType.value,
                              ) &&
                                JSON.stringify(udtSymbol) !==
                                  JSON.stringify(
                                    defaultSymbols.symbols['Samples'],
                                  ))))) && (
                          <button
                            css={addButtonStyles}
                            onClick={(ev) => {
                              setValidationMessage('');
                              const typeUuid =
                                (editingStatus === 'edit' ||
                                  editingStatus === 'view') &&
                                userDefinedSampleType?.value
                                  ? userDefinedSampleType.value
                                  : generateUUID();

                              if (udtSymbol) {
                                setDefaultSymbolSingle(typeUuid, udtSymbol);
                              }

                              if (editingStatus === 'view') return;

                              const isValid = validateEdits();
                              const predefinedEdited =
                                editingStatus === 'edit' &&
                                userDefinedSampleType?.isPredefined;
                              if (isValid && sampleTypeName && shapeType) {
                                let newSampleType = {
                                  value: typeUuid,
                                  label: sampleTypeName,
                                  isPredefined: false,
                                };
                                if (predefinedEdited && userDefinedSampleType) {
                                  newSampleType = {
                                    value: userDefinedSampleType.value,
                                    label: `${userDefinedSampleType?.label} (edited)`,
                                    isPredefined:
                                      userDefinedSampleType.isPredefined,
                                  };
                                }

                                // update the sample attributes
                                const newAttributes: AttributeItems = {
                                  OBJECTID: '-1',
                                  PERMANENT_IDENTIFIER: null,
                                  GLOBALID: null,
                                  TYPEUUID: typeUuid,
                                  TYPE: sampleTypeName,
                                  ShapeType: shapeType.value,
                                  POINT_STYLE: pointStyle?.value || 'circle',
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
                                  DECISIONUNITUUID: null,
                                  DECISIONUNIT: null,
                                  DECISIONUNITSORT: 0,
                                };
                                if (
                                  userDefinedAttributes.sampleTypes.hasOwnProperty(
                                    typeUuid,
                                  )
                                ) {
                                  const sampleType =
                                    userDefinedAttributes.sampleTypes[typeUuid]
                                      .attributes;
                                  if (sampleType.OBJECTID) {
                                    newAttributes.OBJECTID =
                                      sampleType.OBJECTID;
                                  }
                                  if (sampleType.GLOBALID) {
                                    newAttributes.GLOBALID =
                                      sampleType.GLOBALID;
                                  }
                                }

                                // add/update the sample's attributes
                                sampleAttributes[typeUuid as any] =
                                  newAttributes;
                                setUserDefinedAttributes((item) => {
                                  let status:
                                    | 'add'
                                    | 'edit'
                                    | 'delete'
                                    | 'published' = 'add';
                                  if (
                                    item.sampleTypes[typeUuid]?.status ===
                                    'published'
                                  ) {
                                    status = 'edit';
                                  }
                                  if (
                                    item.sampleTypes[typeUuid]?.status ===
                                    'delete'
                                  ) {
                                    status = 'delete';
                                  }

                                  item.sampleTypes[typeUuid] = {
                                    status,
                                    attributes: newAttributes,
                                    serviceId: item.sampleTypes.hasOwnProperty(
                                      typeUuid,
                                    )
                                      ? item.sampleTypes[typeUuid].serviceId
                                      : '',
                                  };

                                  return {
                                    editCount: item.editCount + 1,
                                    sampleTypes: item.sampleTypes,
                                  };
                                });

                                // add the new option to the dropdown if it doesn't exist
                                if (
                                  editingStatus !== 'edit' ||
                                  (editingStatus === 'edit' &&
                                    !userDefinedSampleType?.isPredefined)
                                ) {
                                  setUserDefinedOptions((options) => {
                                    if (editingStatus !== 'edit') {
                                      return [...options, newSampleType];
                                    }

                                    const newOptions: SampleSelectType[] = [];
                                    options.forEach((option) => {
                                      // if the sampleTypeName changed, replace the option tied to the old name with the new one
                                      if (
                                        didSampleTypeNameChange() &&
                                        option.value ===
                                          userDefinedSampleType?.value
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
                                      graphics:
                                        layer.sketchLayer.graphics.toArray(),
                                      newAttributes,
                                      oldType,
                                    });
                                    if (layer.pointsLayer) {
                                      updateAttributes({
                                        graphics:
                                          layer.pointsLayer.graphics.toArray(),
                                        newAttributes,
                                        oldType,
                                        symbol: udtSymbol,
                                      });
                                    }
                                    if (layer.hybridLayer) {
                                      updateAttributes({
                                        graphics:
                                          layer.hybridLayer.graphics.toArray(),
                                        newAttributes,
                                        oldType,
                                        symbol: udtSymbol,
                                      });
                                    }

                                    if (editedGraphics.length > 0) {
                                      const collection =
                                        new Collection<__esri.Graphic>();
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
                      </div>
                    </div>
                  )}
                </div>
              </AccordionItem> */}
            </AccordionList>
          </Fragment>
        )}
      </div>
      <div css={sectionContainer}>
        <NavigationButton goToPanel="calculate" />
      </div>
    </div>
  );
}

export default LocateSamples;
