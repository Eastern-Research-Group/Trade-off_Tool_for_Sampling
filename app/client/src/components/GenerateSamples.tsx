/** @jsxImportSource @emotion/react */

import React, {
  FormEvent,
  Fragment,
  useContext,
  useEffect,
  useState,
} from 'react';
import { css } from '@emotion/react';
import Collection from '@arcgis/core/core/Collection';
import FeatureSet from '@arcgis/core/rest/support/FeatureSet';
import Graphic from '@arcgis/core/Graphic';
import Polygon from '@arcgis/core/geometry/Polygon';
import * as reactiveUtils from '@arcgis/core/core/reactiveUtils';
// components
import LoadingSpinner from 'components/LoadingSpinner';
import MessageBox from 'components/MessageBox';
import Select from 'components/Select';
// contexts
import { AuthenticationContext } from 'contexts/Authentication';
import {
  useLayerProps,
  useSampleTypesContext,
  useServicesContext,
} from 'contexts/LookupFiles';
import { NavigationContext } from 'contexts/Navigation';
import { SketchContext } from 'contexts/Sketch';
// types
import { LayerType } from 'types/Layer';
import { ErrorType } from 'types/Misc';
// config
import {
  cantUseWith3dMessage,
  cantUseWithVspMessage,
  featureNotAvailableMessage,
  generateRandomExceededTransferLimitMessage,
  generateRandomSuccessMessage,
  webServiceErrorMessage,
} from 'config/errorMessages';
import { PolygonSymbol, SampleSelectType } from 'config/sampleAttributes';
// utils
import { appendEnvironmentObjectParam } from 'utils/arcGisRestUtils';
import { geoprocessorFetch } from 'utils/fetchUtils';
import { useDynamicPopup, useMemoryState } from 'utils/hooks';
import {
  activateSketchButton,
  calculateArea,
  convertToPoint,
  getCurrentDateTime,
  generateUUID,
  removeZValues,
  setZValues,
  updateLayerEdits,
} from 'utils/sketchUtils';
import { createErrorObject } from 'utils/utils';
// styles
import { reactSelectStyles } from 'styles';

// --- styles (GenerateSamples) ---
const addButtonStyles = css`
  margin: 0;
  height: 38px; /* same height as ReactSelect */
`;

const fullWidthSelectStyles = css`
  width: 100%;
  margin-right: 10px;
  margin-bottom: 10px;
`;

const inlineMenuStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
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

const radioLabelStyles = css`
  padding-left: 0.375rem;
`;

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

const submitButtonStyles = css`
  margin-top: 10px;
`;

// --- components (LocateSamples) ---
type GenerateRandomType = {
  status: 'none' | 'fetching' | 'success' | 'failure' | 'exceededTransferLimit';
  error?: ErrorType;
  data: __esri.Graphic[];
};

type GenerateSamplesProps = {
  id: string;
  title: string;
  type: 'random' | 'statistic';
};

function GenerateSamples({ id, title, type }: GenerateSamplesProps) {
  const { userInfo } = useContext(AuthenticationContext);
  const { setGoTo, setGoToOptions, trainingMode } =
    useContext(NavigationContext);
  const {
    allSampleOptions,
    aoiSketchLayer,
    aoiSketchVM,
    defaultSymbols,
    displayDimensions,
    edits,
    getGpMaxRecordCount,
    layers,
    map,
    sampleAttributes,
    sceneView,
    setEdits,
    setSketchLayer,
    sketchLayer,
    sketchVM,
  } = useContext(SketchContext);
  const getPopupTemplate = useDynamicPopup();
  const layerProps = useLayerProps();
  const sampleTypeContext = useSampleTypesContext();
  const services = useServicesContext();

  const [numberRandomSamples, setNumberRandomSamples] = useMemoryState<string>(
    `${id}-numberRandomSamples`,
    '33',
  );
  const [percentConfidence, setPercentConfidence] = useMemoryState<string>(
    `${id}-percentConfidence`,
    '95',
  );
  const [percentComplient, setPercentComplient] = useMemoryState<string>(
    `${id}-percentComplient`,
    '99',
  );
  const [
    sampleType,
    setSampleType, //
  ] = useMemoryState<SampleSelectType | null>(`${id}-sampleType`, null);

  // Initialize the selected sample type to the first option
  useEffect(() => {
    if (sampleType || sampleTypeContext.status !== 'success') return;

    setSampleType(sampleTypeContext.data.sampleSelectOptions[0]);
  }, [sampleTypeContext, sampleType, setSampleType]);

  // Handle a user clicking the sketch AOI button. If an AOI is not selected from the
  // dropdown this will create an AOI layer. This also sets the sketchVM to use the
  // selected AOI and triggers a React useEffect to allow the user to sketch on the map.
  const [generateRandomResponse, setGenerateRandomResponse] =
    useState<GenerateRandomType>({
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
    const wasSet = activateSketchButton(`${id}-sampling-mask`);

    if (wasSet) {
      // let the user draw/place the shape
      aoiSketchVM.create('polygon');
    } else {
      aoiSketchVM.cancel();
    }
  }

  // Fires of requests to Generate Random gp service and updates
  // the passed in requests array.
  function randomSamplesSendRequests(
    aoiGraphics: Collection<__esri.Graphic>,
    numberOfSamples: number,
    maxRecordCount: number,
    requests: {
      inputParameters: any;
      originalValuesZ: number[];
      graphics: __esri.GraphicProperties[];
    }[],
  ) {
    if (!getGpMaxRecordCount || !map || !sampleType || !sketchLayer) return;

    let graphics: __esri.GraphicProperties[] = [];
    const originalValuesZ: number[] = [];
    const fullGraphics = aoiGraphics.clone();
    fullGraphics.forEach((graphic) => {
      const z = removeZValues(graphic);
      originalValuesZ.push(z);

      graphic.attributes = {
        FID: 0,
        Id: 0,
        TYPE: 'Area of Interest',
        PERMANENT_IDENTIFIER: graphic.attributes.PERMANENT_IDENTIFIER,
        GLOBALID: graphic.attributes.GLOBALID,
        OBJECTID: -1,
      };
    });

    graphics = fullGraphics.toArray();

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

    // get the sample type definition (can be established or custom)
    const typeuuid = sampleType.value;
    const sampleTypeFeatureSet = {
      displayFieldName: '',
      geometryType: 'esriGeometryPolygon',
      spatialReference: {
        wkid: 3857,
      },
      fields: layerProps.data.defaultFields,
      features: [
        {
          attributes: {
            ...sampleAttributes[typeuuid as any],
            GLOBALID: generateUUID(),
            PERMANENT_IDENTIFIER: generateUUID(),
          },
        },
      ],
    };

    // determine the number of service calls needed to satisfy the request
    const samplesPerCall = Math.floor(maxRecordCount / graphics.length);
    const iterations = Math.ceil(numberOfSamples / samplesPerCall);

    // fire off the generateRandom requests
    let numSamples = 0;
    let numSamplesLeft = numberOfSamples;
    for (let i = 0; i < iterations; i++) {
      // determine the number of samples for this request
      numSamples =
        numSamplesLeft > samplesPerCall ? samplesPerCall : numSamplesLeft;

      const props = {
        f: 'json',
        Number_of_Samples: numSamples,
        Sample_Type: sampleType.label,
        Area_of_Interest_Mask: featureSet.toJSON(),
        Sample_Type_Parameters: sampleTypeFeatureSet,
      };
      appendEnvironmentObjectParam(props);

      requests.push({
        inputParameters: props,
        originalValuesZ,
        graphics,
      });

      // keep track of the number of remaining samples
      numSamplesLeft = numSamplesLeft - numSamples;
    }
  }

  // Throttles GP server requests to 6 requests at one time.
  // Any more than 6 and the GP server cancels remaining requests.
  async function fireRequestsThrottled(
    parameters: {
      inputParameters: any;
      originalValuesZ: number[];
      graphics: __esri.GraphicProperties[];
    }[],
  ) {
    const requests: {
      request: Promise<any>;
      originalValuesZ: number[];
      graphics: __esri.GraphicProperties[];
    }[] = [];

    let i = 0;
    for (const params of parameters) {
      const request = geoprocessorFetch({
        url: `${services.data.totsGPServer}/Generate%20Random`,
        inputParameters: params.inputParameters,
      });
      requests.push({
        request,
        originalValuesZ: params.originalValuesZ,
        graphics: params.graphics,
      });

      i += 1;
      if (i % 3 === 0) await Promise.all(requests.map((r) => r.request));
    }

    return requests;
  }

  // Handle a user generating random or statistical samples
  async function randomSamples(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (!getGpMaxRecordCount || !map || !sampleType || !sketchLayer) return;

    activateSketchButton('disable-all-buttons');
    sketchVM?.[displayDimensions].cancel();
    aoiSketchVM?.cancel();

    const aoiMaskLayer: LayerType | null =
      generateRandomMode === 'draw'
        ? aoiSketchLayer
        : generateRandomMode === 'file'
          ? selectedAoiFile
          : null;
    if (!aoiMaskLayer) return;

    setGenerateRandomResponse({ status: 'fetching', data: [] });

    if (aoiMaskLayer.sketchLayer.type === 'feature') return;

    try {
      const maxRecordCount = await getGpMaxRecordCount();

      const parameters: {
        inputParameters: any;
        originalValuesZ: number[];
        graphics: __esri.GraphicProperties[];
      }[] = [];
      if (type === 'random') {
        randomSamplesSendRequests(
          aoiMaskLayer.sketchLayer.graphics,
          parseInt(numberRandomSamples),
          maxRecordCount,
          parameters,
        );
      }

      if (type === 'statistic') {
        aoisFull.forEach((aoi) => {
          randomSamplesSendRequests(
            new Collection([aoi.graphic]),
            aoi.numSamples,
            maxRecordCount,
            parameters,
          );
        });
      }

      const requests = await fireRequestsThrottled(parameters);

      const typeuuid = sampleType.value;
      const responses = await Promise.all(requests.map((r) => r.request));

      let res;
      const timestamp = getCurrentDateTime();
      const popupTemplate = getPopupTemplate('Samples', trainingMode);
      const graphicsToAdd: __esri.Graphic[] = [];
      const hybridGraphicsToAdd: __esri.Graphic[] = [];
      const pointsToAdd: __esri.Graphic[] = [];
      for (let i = 0; i < responses.length; i++) {
        res = responses[i];
        const numberOfAois = requests[i].graphics.length;
        if (!res?.results?.[0]?.value) {
          setGenerateRandomResponse({
            status: 'failure',
            error: {
              error: createErrorObject(res),
              message: 'No data',
            },
            data: [],
          });
          return;
        }

        if (res.results[0].value.exceededTransferLimit) {
          setGenerateRandomResponse({
            status: 'exceededTransferLimit',
            data: [],
          });
          return;
        }

        // get the results from the response
        const results = res.results[0].value;

        // set the sample styles
        let symbol: PolygonSymbol = defaultSymbols.symbols['Samples'];
        if (defaultSymbols.symbols.hasOwnProperty(sampleType.value)) {
          symbol = defaultSymbols.symbols[sampleType.value];
        }

        let originalZIndex = 0;
        const graphicsPerAoi = results.features.length / numberOfAois;

        // build an array of graphics to draw on the map
        let index = 0;
        for (const feature of results.features) {
          if (index !== 0 && index % graphicsPerAoi === 0) originalZIndex += 1;

          const originalZ = requests[i].originalValuesZ[originalZIndex];
          const poly = new Graphic({
            attributes: {
              ...(window as any).totsSampleAttributes[typeuuid],
              CREATEDDATE: timestamp,
              DECISIONUNITUUID: sketchLayer.uuid,
              DECISIONUNIT: sketchLayer.label,
              DECISIONUNITSORT: 0,
              OBJECTID: feature.attributes.OBJECTID,
              GLOBALID: feature.attributes.GLOBALID,
              PERMANENT_IDENTIFIER: feature.attributes.PERMANENT_IDENTIFIER,
              UPDATEDDATE: timestamp,
              USERNAME: userInfo?.username || '',
              ORGANIZATION: userInfo?.orgId || '',
            },
            symbol,
            geometry: new Polygon({
              rings: feature.geometry.rings,
              spatialReference: results.spatialReference,
            }),
            popupTemplate,
          });

          await setZValues({
            map,
            graphic: poly,
            zOverride:
              generateRandomElevationMode === 'aoiElevation' ? originalZ : null,
          });

          graphicsToAdd.push(poly);
          pointsToAdd.push(convertToPoint(poly));
          hybridGraphicsToAdd.push(
            poly.attributes.ShapeType === 'point'
              ? convertToPoint(poly)
              : poly.clone(),
          );

          index += 1;
        }
      }

      // put the graphics on the map
      if (sketchLayer?.sketchLayer?.type === 'graphics') {
        // add the graphics to a collection so it can added to browser storage
        const collection = new Collection<__esri.Graphic>();
        collection.addMany(graphicsToAdd);
        sketchLayer.sketchLayer.graphics.addMany(collection);

        sketchLayer.pointsLayer?.addMany(pointsToAdd);
        sketchLayer.hybridLayer?.addMany(hybridGraphicsToAdd);

        let editsCopy = updateLayerEdits({
          edits,
          layer: sketchLayer,
          type: 'add',
          changes: collection,
        });

        if (generateRandomMode === 'draw') {
          // remove the graphics from the generate random mask
          if (
            aoiSketchLayer &&
            aoiSketchLayer.sketchLayer.type === 'graphics'
          ) {
            editsCopy = updateLayerEdits({
              edits: editsCopy,
              layer: aoiSketchLayer,
              type: 'delete',
              changes: aoiSketchLayer.sketchLayer.graphics,
            });

            aoiSketchLayer.sketchLayer.removeAll();
          }
        }

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

      if (generateRandomMode === 'draw') {
        if (aoiSketchLayer && aoiSketchLayer.sketchLayer.type === 'graphics') {
          aoiSketchLayer.sketchLayer.removeAll();
        }
      }
    } catch (err: any) {
      console.error(err);
      setGenerateRandomResponse({
        status: 'failure',
        error: {
          error: createErrorObject(err),
          message: err.message,
        },
        data: [],
      });

      window.logErrorToGa(err);
    }
  }

  // scenario and layer edit UI visibility controls
  const [generateRandomMode, setGenerateRandomMode] = useMemoryState<
    'draw' | 'file' | ''
  >(`${id}-generateRandomMode`, '');
  const [generateRandomElevationMode, setGenerateRandomElevationMode] =
    useMemoryState<'ground' | 'aoiElevation'>(
      `${id}-generateRandomElevationMode`,
      'aoiElevation',
    );
  const [selectedAoiFile, setSelectedAoiFile] =
    useMemoryState<LayerType | null>(`${id}-selectedAoiFile`, null);

  // get drawn aois
  const [watcher, setWatcher] = useState<IHandle | null>(null);
  const [aoisDrawn, setAoisDrawn] = useState<__esri.Graphic[]>([]);
  useEffect(() => {
    if (!aoiSketchLayer || watcher) return;

    if (aoiSketchLayer.sketchLayer.type === 'graphics') {
      setAoisDrawn(aoiSketchLayer.sketchLayer.graphics.toArray());
    }

    setWatcher(
      reactiveUtils.watch(
        () =>
          (aoiSketchLayer.sketchLayer as __esri.GraphicsLayer).graphics.length,
        () => {
          if (aoiSketchLayer.sketchLayer.type !== 'graphics') return;
          setAoisDrawn(aoiSketchLayer.sketchLayer.graphics.toArray());
        },
      ),
    );
  }, [aoiSketchLayer, watcher]);

  // get aois from file
  const [aoisSelected, setAoisSelected] = useState<__esri.Graphic[]>([]);
  useEffect(() => {
    if (!selectedAoiFile) {
      setAoisSelected([]);
      return;
    }

    if (selectedAoiFile.sketchLayer.type !== 'graphics') return;
    setAoisSelected(selectedAoiFile.sketchLayer.graphics.toArray());
  }, [selectedAoiFile]);

  // get aois from selections
  const [aois, setAois] = useState<__esri.Graphic[]>([]);
  useEffect(() => {
    if (generateRandomMode === 'draw') setAois(aoisDrawn);
    if (generateRandomMode === 'file') setAois(aoisSelected);
  }, [aoisDrawn, aoisSelected, generateRandomMode]);

  // get area of aois and num samples per aoi if in statistic mode
  type AoiType = {
    graphic: __esri.Graphic;
    area: number;
    numSamples: number;
    gridDefinition: number;
  };
  const [aoisFull, setAoisFull] = useState<AoiType[]>([]);
  useEffect(() => {
    async function getAoiAreas(aois: __esri.Graphic[]) {
      if (!sampleType) return;

      const aoisFull: AoiType[] = [];
      const complientFloat = parseFloat(percentComplient);
      const confidenceFloat = parseFloat(percentConfidence);
      const sampleArea = sampleAttributes[sampleType.value as any].SA;
      for (const aoi of aois) {
        // calculate area of aoi
        const areaOut = await calculateArea(aoi, sceneView);
        const area = typeof areaOut === 'number' ? areaOut : 0;

        // calculate statistical number of samples for aoi
        // n ~= [0.5(1 - a^(1/V))(2N - V + 1)]
        const N = Math.floor(area / sampleArea); // grid definition
        const a = 1 - confidenceFloat / 100;
        const b = 1 - complientFloat / 100;
        const V = Math.max(1, b * N);
        const numSamples = Math.ceil(
          0.5 * (1 - Math.pow(a, 1 / V)) * (2 * N - V + 1),
        );

        aoisFull.push({
          area,
          numSamples,
          graphic: aoi,
          gridDefinition: N,
        });
      }

      setAoisFull(aoisFull);
    }

    if (type === 'random') {
      setAoisFull(
        aois.map((graphic) => ({
          area: 0,
          numSamples: 0,
          graphic,
          gridDefinition: 0,
        })),
      );
    }
    if (type === 'statistic') getAoiAreas(aois);
  }, [
    aois,
    percentComplient,
    percentConfidence,
    sampleAttributes,
    sampleType,
    sceneView,
    type,
  ]);

  // get total number of samples across all aois
  useEffect(() => {
    if (type === 'random') return;
    let totalNumSamples = 0;
    aoisFull.forEach((aoi) => {
      totalNumSamples += aoi.numSamples;
    });
    setNumberRandomSamples(
      (totalNumSamples && !isNaN(totalNumSamples)
        ? totalNumSamples
        : 0
      ).toString(),
    );
  }, [aoisFull, setNumberRandomSamples, type]);

  useEffect(() => {
    if (!window.location.search.includes('devMode=true')) return;
    console.log('aois (post calculations): ', aoisFull);
  }, [aoisFull]);

  const [validationMessage, setValidationMessage] = useState('');
  useEffect(() => {
    let failedFields = [];
    if (!validateDecimalInput(percentConfidence))
      failedFields.push('"Percent Confidence"');
    if (!validateDecimalInput(percentComplient))
      failedFields.push('"Percent Complient"');

    setValidationMessage(
      failedFields.length > 0
        ? `${failedFields.join(' and ')} must be a number between 50 and 100.`
        : '',
    );
  }, [percentComplient, percentConfidence]);

  function validateDecimalInput(value: string) {
    const float = parseFloat(value);
    if (isNaN(float) || float < 50 || float >= 100) return false;
    return true;
  }

  return (
    <Fragment>
      {sketchLayer?.layerType === 'VSP' && cantUseWithVspMessage}
      {sketchLayer?.layerType !== 'VSP' &&
        displayDimensions === '3d' &&
        cantUseWith3dMessage}
      {sketchLayer?.layerType !== 'VSP' && displayDimensions === '2d' && (
        <Fragment>
          {(services.status === 'fetching' ||
            sampleTypeContext.status === 'fetching' ||
            layerProps.status === 'fetching') && <LoadingSpinner />}
          {(services.status === 'failure' ||
            sampleTypeContext.status === 'failure' ||
            layerProps.status === 'failure') &&
            featureNotAvailableMessage(title)}
          {services.status === 'success' &&
            sampleTypeContext.status === 'success' &&
            layerProps.status === 'success' && (
              <form onSubmit={randomSamples}>
                {type === 'random' && (
                  <p>
                    Select "Draw Sampling Mask" to draw a boundary on your map
                    for placing samples or select "Use Imported Area of
                    Interest" to use an Area of Interest file to place samples.
                    Select a Sample Type from the menu and specify the number of
                    samples to add. Click Submit to add samples.
                  </p>
                )}
                {type === 'statistic' && (
                  <p>
                    Select "Draw Sampling Mask" to draw a boundary on your map
                    for placing samples or select "Use Imported Area of
                    Interest" to use an Area of Interest file to place samples.
                    Select a Sample Type from the menu and specify the "Percent
                    Confidence and "Percent Area Clear/Complient". Click Submit
                    to add samples.
                  </p>
                )}

                <div>
                  <input
                    id={`${id}-draw-aoi`}
                    type="radio"
                    name={`${id}-mode`}
                    value="Draw area of Interest"
                    disabled={generateRandomResponse.status === 'fetching'}
                    checked={generateRandomMode === 'draw'}
                    onChange={(ev) => {
                      setGenerateRandomMode('draw');
                    }}
                  />
                  <label htmlFor={`${id}-draw-aoi`} css={radioLabelStyles}>
                    Draw Sampling Mask
                  </label>
                </div>

                {generateRandomMode === 'draw' && (
                  <button
                    id={`${id}-sampling-mask`}
                    title="Draw Sampling Mask"
                    className="sketch-button"
                    disabled={generateRandomResponse.status === 'fetching'}
                    type="button"
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
                    id={`${id}-use-aoi-file`}
                    type="radio"
                    name={`${id}-mode`}
                    value="Use Imported Area of Interest"
                    disabled={generateRandomResponse.status === 'fetching'}
                    checked={generateRandomMode === 'file'}
                    onChange={(ev) => {
                      setGenerateRandomMode('file');

                      if (!selectedAoiFile) {
                        const aoiLayers = layers.filter(
                          (layer) => layer.layerType === 'Area of Interest',
                        );
                        setSelectedAoiFile(aoiLayers[0]);
                      }
                    }}
                  />
                  <label htmlFor={`${id}-use-aoi-file`} css={radioLabelStyles}>
                    Use Imported Area of Interest
                  </label>
                </div>

                {generateRandomMode === 'file' && (
                  <Fragment>
                    <label htmlFor={`${id}-aoi-mask-select-input`}>
                      Area of Interest Mask
                    </label>
                    <div css={inlineMenuStyles}>
                      <Select
                        id={`${id}-aoi-mask-select`}
                        inputId={`${id}-aoi-mask-select-input`}
                        css={inlineSelectStyles}
                        styles={reactSelectStyles as any}
                        isClearable={true}
                        value={selectedAoiFile}
                        onChange={(ev) => setSelectedAoiFile(ev as LayerType)}
                        options={layers.filter(
                          (layer) => layer.layerType === 'Area of Interest',
                        )}
                      />
                      <button
                        css={addButtonStyles}
                        disabled={generateRandomResponse.status === 'fetching'}
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
                    <label htmlFor={`${id}-sample-type-select-input`}>
                      Sample Type
                    </label>
                    <Select
                      id={`${id}-sample-type-select`}
                      inputId={`${id}-sample-type-select-input`}
                      css={fullWidthSelectStyles}
                      value={sampleType}
                      onChange={(ev) => setSampleType(ev as SampleSelectType)}
                      options={allSampleOptions}
                    />

                    {type === 'random' && (
                      <label>
                        <span>Number of Samples</span>
                        <input
                          css={inputStyles}
                          min={1}
                          required
                          type="number"
                          value={numberRandomSamples}
                          onChange={(ev) =>
                            setNumberRandomSamples(ev.target.value)
                          }
                        />
                      </label>
                    )}

                    {type === 'statistic' && (
                      <Fragment>
                        <label>
                          <span>Percent Confidence</span>
                          <input
                            css={inputStyles}
                            required
                            type="text"
                            value={percentConfidence}
                            onChange={(ev) =>
                              setPercentConfidence(ev.target.value)
                            }
                          />
                        </label>
                        <label>
                          <span>Percent Area Clear/Compliant</span>
                          <input
                            css={inputStyles}
                            required
                            type="text"
                            value={percentComplient}
                            onChange={(ev) =>
                              setPercentComplient(ev.target.value)
                            }
                          />
                        </label>

                        {numberRandomSamples && (
                          <Fragment>
                            {validationMessage && (
                              <MessageBox
                                severity="warning"
                                title=""
                                message={validationMessage}
                              />
                            )}
                            <span>
                              Number of resulting samples:{' '}
                              <strong>
                                {parseInt(numberRandomSamples).toLocaleString()}
                              </strong>
                            </span>
                            <br />
                          </Fragment>
                        )}
                      </Fragment>
                    )}

                    <div>
                      <input
                        id={`${id}-use-aoi-elevation`}
                        type="radio"
                        name={`${id}-elevation-mode`}
                        value="Use AOI Elevation"
                        disabled={generateRandomResponse.status === 'fetching'}
                        checked={generateRandomElevationMode === 'aoiElevation'}
                        onChange={(ev) => {
                          setGenerateRandomElevationMode('aoiElevation');
                        }}
                      />
                      <label
                        htmlFor={`${id}-use-aoi-elevation`}
                        css={radioLabelStyles}
                      >
                        Use AOI Elevation
                      </label>
                    </div>
                    <div>
                      <input
                        id={`${id}-snap-to-ground`}
                        type="radio"
                        name={`${id}-elevation-mode`}
                        value="Snap to Ground"
                        disabled={generateRandomResponse.status === 'fetching'}
                        checked={generateRandomElevationMode === 'ground'}
                        onChange={(ev) => {
                          setGenerateRandomElevationMode('ground');
                        }}
                      />
                      <label
                        htmlFor={`${id}-snap-to-ground`}
                        css={radioLabelStyles}
                      >
                        Snap to Ground
                      </label>
                    </div>

                    {generateRandomResponse.status === 'success' &&
                      sketchLayer &&
                      generateRandomSuccessMessage(
                        generateRandomResponse.data.length,
                        sketchLayer.label,
                      )}
                    {generateRandomResponse.status === 'failure' &&
                      webServiceErrorMessage(generateRandomResponse.error)}
                    {generateRandomResponse.status ===
                      'exceededTransferLimit' &&
                      generateRandomExceededTransferLimitMessage}
                    {((generateRandomMode === 'draw' &&
                      numberRandomSamples &&
                      aoiSketchLayer?.sketchLayer.type === 'graphics' &&
                      aoiSketchLayer.sketchLayer.graphics.length > 0) ||
                      (generateRandomMode === 'file' &&
                        selectedAoiFile?.sketchLayer.type === 'graphics' &&
                        selectedAoiFile.sketchLayer.graphics.length > 0)) && (
                      <button
                        css={submitButtonStyles}
                        disabled={
                          generateRandomResponse.status === 'fetching' ||
                          validationMessage !== ''
                        }
                        type="submit"
                      >
                        {generateRandomResponse.status !== 'fetching' &&
                          'Submit'}
                        {generateRandomResponse.status === 'fetching' && (
                          <Fragment>
                            <i className="fas fa-spinner fa-pulse" />
                            &nbsp;&nbsp;Loading...
                          </Fragment>
                        )}
                      </button>
                    )}
                  </Fragment>
                )}
              </form>
            )}
        </Fragment>
      )}
    </Fragment>
  );
}

export default GenerateSamples;
