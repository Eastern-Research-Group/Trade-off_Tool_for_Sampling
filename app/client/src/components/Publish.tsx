/** @jsxImportSource @emotion/react */

import React, {
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { css } from '@emotion/react';
import IdentityManager from '@arcgis/core/identity/IdentityManager';
import Portal from '@arcgis/core/portal/Portal';
// components
import {
  EditCustomSampleTypesTable,
  EditScenario,
  SaveResultsType,
} from 'components/EditLayerMetaData';
import LoadingSpinner from 'components/LoadingSpinner';
import MessageBox from 'components/MessageBox';
import ShowLessMore from 'components/ShowLessMore';
// contexts
import { AuthenticationContext } from 'contexts/Authentication';
import { CalculateContext } from 'contexts/Calculate';
import { useLookupFiles } from 'contexts/LookupFiles';
import { NavigationContext } from 'contexts/Navigation';
import {
  defaultPlanAttributes,
  PublishContext,
  trainingModePlanAttributes,
} from 'contexts/Publish';
import { SketchContext } from 'contexts/Sketch';
// utils
import {
  addPointFeatures,
  buildFieldFromCustomAttribute,
  buildReferenceLayerTableEditsNew,
  buildRendererParams,
  getAllFeatures,
  getFeatureTables,
  isServiceNameAvailable,
  publish,
} from 'utils/arcGisRestUtils';
import { findLayerInEdits, generateUUID } from 'utils/sketchUtils';
import { createErrorObject } from 'utils/utils';
// types
import {
  DeleteFeatureType,
  FeatureEditsType,
  LayerAoiAnalysisEditsType,
  ScenarioDeconEditsType,
  ScenarioEditsType,
} from 'types/Edits';
import { LayerType } from 'types/Layer';
import { ErrorType } from 'types/Misc';
import { AppType } from 'types/Navigation';
// config
import {
  noDeconPublishMessage,
  noSamplesPublishMessage,
  noSampleTypesPublishMessage,
  noServiceNameMessage,
  noServiceSelectedMessage,
  notLoggedInMessage,
  publishSuccessMessage,
  webServiceErrorMessage,
} from 'config/errorMessages';
import { isDecon } from 'styles';

type PublishResults = {
  [key: string]: {
    adds: FeatureEditsType[];
    updates: FeatureEditsType[];
    deletes: DeleteFeatureType[];
    published: FeatureEditsType[];
  };
};

type PublishType = {
  status:
    | 'none'
    | 'fetching'
    | 'success'
    | 'failure'
    | 'fetch-failure'
    | 'name-not-available';
  summary: {
    success: string;
    failed: string;
  };
  error?: ErrorType;
  rawData: any;
};

// --- styles (Publish) ---
const panelContainer = css`
  padding: 20px;
`;

const publishButtonContainerStyles = css`
  display: flex;
  justify-content: flex-end;
`;

const publishButtonStyles = css`
  margin-top: 10px;

  &:disabled {
    cursor: default;
    opacity: 0.65;
  }
`;

const sectionContainer = css`
  margin-bottom: 10px;
`;

const layerInfo = css`
  padding-bottom: 0.5em;
`;

const totsOutputContainer = css`
  padding-bottom: 1.5em;
`;

const checkedStyles = css`
  color: green;
  margin-right: 10px;
`;

const unCheckedStyles = css`
  color: red;
  margin-right: 10px;
`;

const webMapContainerCheckboxStyles = css`
  margin-left: 20px;
`;

// --- components (Publish) ---
type Props = {
  appType: AppType;
};

function Publish({ appType }: Props) {
  const { oAuthInfo, portal, setSignedIn, setPortal, signedIn } = useContext(
    AuthenticationContext,
  );
  const { calculateResults, calculateResultsDecon } =
    useContext(CalculateContext);
  const { goToOptions, setGoToOptions, trainingMode } =
    useContext(NavigationContext);
  const {
    includeCustomSampleTypes,
    includePlan,
    includePlanWebMap,
    includePlanWebScene,
    publishSamplesMode,
    publishSampleTableMetaData,
    sampleTableDescription,
    sampleTableName,
    sampleTypeSelections,
    selectedService,
    setSampleTableDescription,
    setSampleTableName,
    setSelectedService,
    webMapReferenceLayerSelections,
    webSceneReferenceLayerSelections,
  } = useContext(PublishContext);
  const {
    defaultSymbols,
    edits,
    setEdits,
    layers,
    setLayers,
    map,
    sampleAttributes,
    selectedScenario,
    setSelectedScenario,
    sketchLayer,
    userDefinedAttributes,
    setUserDefinedAttributes,
  } = useContext(SketchContext);

  const layerProps = useLookupFiles().data.layerProps;

  // Checks browser storage to determine if the user clicked publish and logged in.
  const [publishButtonClicked, setPublishButtonClicked] = useState(false);
  const [continueInitialized, setContinueInitialized] = useState(false);
  useEffect(() => {
    if (continueInitialized) return;

    // continue publish is not true, exit early
    if (!goToOptions?.continuePublish) {
      setContinueInitialized(true);
      return;
    }

    // wait until TOTS is signed in before trying to continue the publish
    if (!portal || !signedIn) return;

    // continue with publishing
    setPublishButtonClicked(true);
    setGoToOptions({ continuePublish: false });
    setContinueInitialized(true);
  }, [portal, signedIn, goToOptions, setGoToOptions, continueInitialized]);

  // Sign in if necessary
  useEffect(() => {
    if (!oAuthInfo || !publishButtonClicked) return;

    // have the user login if necessary
    if (!portal || !signedIn) {
      setGoToOptions({ continuePublish: true });
      IdentityManager.getCredential(`${oAuthInfo.portalUrl}/sharing`, {
        oAuthPopupConfirmation: false,
      })
        .then(() => {
          setSignedIn(true);

          const portal = new Portal();
          portal.authMode = 'immediate';
          portal.load().then(() => {
            setPortal(portal);
          });
        })
        .catch((err) => {
          console.error(err);
          setSignedIn(false);
          setPortal(null);
        });
    }
  }, [
    oAuthInfo,
    portal,
    publishButtonClicked,
    setGoToOptions,
    setPortal,
    setSignedIn,
    signedIn,
  ]);

  const [publishResponse, setPublishResponse] = useState<PublishType>({
    status: 'none',
    summary: { success: '', failed: '' },
    rawData: null,
  });

  const [planNameCheckStatus, setPlanNameCheckStatus] = useState<
    'none' | 'available' | 'not-available'
  >('none');
  const [customSampleNameCheckStatus, setCustomSampleNameCheckStatus] =
    useState<'none' | 'available' | 'not-available'>('none');

  // Check if the scenario name is available
  const [hasNameBeenChecked, setHasNameBeenChecked] = useState(false);
  useEffect(() => {
    if (!portal || !publishButtonClicked) return;

    // see if names have already been verified as available
    const planNameChecked =
      !includePlan ||
      selectedScenario?.status === 'edited' ||
      selectedScenario?.status === 'published';
    const sampleTypesNameChecked =
      !includeCustomSampleTypes ||
      (publishSamplesMode === 'existing' && publishSampleTableMetaData?.value);

    if (planNameChecked && sampleTypesNameChecked) {
      setHasNameBeenChecked(true);
      return;
    }

    setPublishResponse({
      status: 'fetching',
      summary: { success: '', failed: '' },
      rawData: null,
    });

    // fire off requests to check if service names are available
    const requests = [];
    let planIndex = -1,
      sampleTypesIndex = -1;
    if (!planNameChecked && selectedScenario) {
      const request = isServiceNameAvailable(
        portal,
        selectedScenario.scenarioName,
      );
      requests.push(request);
      planIndex = requests.length - 1;
    }
    if (!sampleTypesNameChecked && publishSampleTableMetaData) {
      const request = isServiceNameAvailable(
        portal,
        publishSampleTableMetaData.label,
      );
      requests.push(request);
      sampleTypesIndex = requests.length - 1;
    }

    Promise.all(requests)
      .then((responses: any[]) => {
        let stopEarly = false;
        let errorOccurred = false;

        function checkResponse(res: any, setter: Function) {
          if (res.error) {
            stopEarly = true;
            errorOccurred = true;
            setPublishResponse({
              status: 'fetch-failure',
              summary: { success: '', failed: '' },
              error: {
                error: createErrorObject(res),
                message: res.error.message,
              },
              rawData: null,
            });
          }

          if (!res.available) {
            stopEarly = true;
            setter('not-available');
          }
        }

        // check responses for errors
        if (planIndex > -1) {
          checkResponse(responses[planIndex], setPlanNameCheckStatus);
        }
        if (sampleTypesIndex > -1) {
          checkResponse(
            responses[sampleTypesIndex],
            setCustomSampleNameCheckStatus,
          );
        }

        if (stopEarly || errorOccurred) {
          setPublishButtonClicked(false);
          if (!errorOccurred) {
            setPublishResponse({
              status: 'name-not-available',
              summary: { success: '', failed: '' },
              rawData: null,
            });
          }
        }

        setHasNameBeenChecked(true);
      })
      .catch((err) => {
        console.error('isServiceNameAvailable error', err);
        setPublishResponse({
          status: 'fetch-failure',
          summary: { success: '', failed: '' },
          error: {
            error: createErrorObject(err),
            message: err.message,
          },
          rawData: err,
        });

        window.logErrorToGa(err);
      });
  }, [
    appType,
    includeCustomSampleTypes,
    includePlan,
    portal,
    selectedScenario,
    sketchLayer,
    publishButtonClicked,
    publishSamplesMode,
    publishSampleTableMetaData,
    hasNameBeenChecked,
    layers,
  ]);

  const publishItems = useCallback(() => {
    if (!map || !portal || !selectedScenario) return;

    async function publishItemsInner() {
      if (!map || !portal || !selectedScenario) return;

      try {
        const featureServices: any[] = [];
        const errorMessages: string[] = [];
        const includeSamplePlan = !isDecon();
        const includeDeconPlan = isDecon();

        const tempPortal = portal as any;
        const token = tempPortal.credential.token;

        if (includeSamplePlan) {
          const layerInEdits = findLayerInEdits(
            edits.edits,
            selectedScenario.layerId,
          );
          const scenarioIndex = layerInEdits.scenarioIndex;
          const editsScenario =
            layerInEdits.editsScenario as ScenarioEditsType | null;

          if (
            scenarioIndex === -1 ||
            !editsScenario ||
            editsScenario.layers.length === 0
          ) {
            errorMessages.push('No sample data to publish');
          } else {
            const originalLayers = layers.filter(
              (layer) =>
                editsScenario.layers.findIndex(
                  (childLayer) => childLayer.layerId === layer.layerId,
                ) !== -1,
            );
            console.log('originalLayers; ', originalLayers);

            const layersToPublish: any[] = [];
            let sampleTypesToPublish: any = {};
            originalLayers.forEach((layer) => {
              const templatesPolygons: any[] = [];
              const templatesPoints: any[] = [];
              const {
                graphicsExtent,
                sampleTypes,
                uniqueValueInfosPolygons,
                uniqueValueInfosPoints,
              } = buildRendererParams(layer, null);

              sampleTypesToPublish = {
                ...sampleTypesToPublish,
                ...sampleTypes,
              };

              // add a custom type for determining which layers in a feature service
              // are the sample layers. All feature services made through TOTS should only
              // have one layer, but it is possible for user
              if (layer.layerType === 'Samples') {
                templatesPolygons.push({
                  id: 'epa-tots-sample-layer',
                  name: 'epa-tots-sample-layer',
                });
              }
              if (layer.layerType === 'VSP') {
                templatesPolygons.push({
                  id: 'epa-tots-vsp-layer',
                  name: 'epa-tots-vsp-layer',
                });
              }

              // add a custom type for determining which layers in a feature service
              // are the sample layers. All feature services made through TOTS should only
              // have one layer, but it is possible for user
              if (layer.layerType === 'Samples') {
                templatesPoints.push({
                  id: 'epa-tots-sample-points-layer',
                  name: 'epa-tots-sample-points-layer',
                });
              }
              if (layer.layerType === 'VSP') {
                templatesPoints.push({
                  id: 'epa-tots-vsp-points-layer',
                  name: 'epa-tots-vsp-points-layer',
                });
              }

              // get the attributes to be published
              const attributesToInclude = [
                ...defaultPlanAttributes,
                ...(trainingMode ? trainingModePlanAttributes : []),
                ...editsScenario.customAttributes,
              ];
              attributesToInclude.forEach((item, index) => {
                item.id = index + 1;
              });

              let fields = layerProps.defaultFields;
              if (attributesToInclude) {
                fields = layerProps.defaultFields.filter(
                  (x: any) =>
                    attributesToInclude.findIndex((y) => y.name === x.name) >
                      -1 ||
                    x.name === 'GLOBALID' ||
                    x.name === 'OBJECTID',
                );
              }

              attributesToInclude?.forEach((attribute) => {
                const fieldIndex = fields.findIndex(
                  (x: any) => x.name === attribute.name,
                );

                if (fieldIndex > -1) return;

                fields.push(buildFieldFromCustomAttribute(attribute));
              });

              const adds: FeatureEditsType[] = [];
              const updates: FeatureEditsType[] = [];
              const deletes: any[] = [];
              const published: FeatureEditsType[] = [];
              const pointsAdds: FeatureEditsType[] = [];
              const pointsUpdates: FeatureEditsType[] = [];
              const pointsDeletes: any[] = [];
              const pointsPublished: FeatureEditsType[] = [];
              editsScenario.layers.forEach((layerEdits) => {
                published.push(...layerEdits.published);
                published.forEach((item) => {
                  addPointFeatures(
                    layer,
                    pointsPublished,
                    item,
                    attributesToInclude,
                  );
                });

                layerEdits.adds.forEach((item) => {
                  let attributes: any = {};
                  if (layer?.sketchLayer?.type === 'graphics') {
                    const graphic = layer.sketchLayer.graphics.find(
                      (graphic) =>
                        graphic.attributes.PERMANENT_IDENTIFIER ===
                        item.attributes.PERMANENT_IDENTIFIER,
                    );

                    attributes['GLOBALID'] = generateUUID();
                    attributes['OBJECTID'] = graphic.attributes['OBJECTID'];

                    attributesToInclude.forEach((attribute) => {
                      attributes[attribute.name] =
                        graphic.attributes[attribute.name] || null;
                    });
                  }

                  if (attributes.length === 0) {
                    attributes = { ...item.attributes };
                  }

                  adds.push({
                    ...item,
                    attributes,
                  });
                  addPointFeatures(
                    layer,
                    pointsAdds,
                    item,
                    attributesToInclude,
                  );
                });

                const combinedUpdates = [
                  ...layerEdits.updates,
                  ...layerEdits.published,
                ];
                combinedUpdates.forEach((item) => {
                  let attributes: any = {};
                  if (layer?.sketchLayer?.type === 'graphics') {
                    const graphic = layer.sketchLayer.graphics.find(
                      (graphic) =>
                        graphic.attributes.PERMANENT_IDENTIFIER ===
                        item.attributes.PERMANENT_IDENTIFIER,
                    );

                    if (graphic) {
                      attributes['GLOBALID'] = generateUUID();
                      attributes['OBJECTID'] = graphic.attributes['OBJECTID'];

                      attributesToInclude.forEach((attribute) => {
                        attributes[attribute.name] =
                          graphic.attributes[attribute.name] || null;
                      });
                    }
                  }

                  if (attributes.length === 0) {
                    attributes = { ...item.attributes };
                  }

                  const inDeletes =
                    layerEdits.deletes.findIndex(
                      (feat) =>
                        feat.PERMANENT_IDENTIFIER ===
                        item.attributes.PERMANENT_IDENTIFIER,
                    ) !== -1;
                  if (!inDeletes) {
                    adds.push({
                      ...item,
                      attributes,
                    });
                    addPointFeatures(
                      layer,
                      pointsAdds, // layerEdits.pointsId === -1 ? pointsAdds : pointsUpdates,
                      item,
                      attributesToInclude,
                    );
                  }
                });
                layerEdits.deletes.forEach((item) => {
                  deletes.push({
                    ...item,
                    DECISIONUNITUUID: layer.uuid,
                  });
                  if (layerEdits.pointsId !== -1)
                    pointsDeletes.push(item.GLOBALID);
                });
              });

              layersToPublish.push({
                id: layer.id,
                layerId: layer.layerId,
                layerDefinitionProps: {
                  ...layerProps.defaultLayerProps,
                  fields,
                  name: selectedScenario.scenarioName,
                  description: selectedScenario.scenarioDescription,
                  extent: graphicsExtent,
                  drawingInfo: {
                    renderer: {
                      type: 'uniqueValue',
                      field1: 'TYPEUUID',
                      uniqueValueInfos: uniqueValueInfosPolygons,
                    },
                  },
                  types: templatesPolygons,
                },
                adds,
                updates,
                deletes,
                published,
              });

              layersToPublish.push({
                id: layer.pointsId,
                layerId: `${layer.layerId}-points`,
                layerDefinitionProps: {
                  ...layerProps.defaultLayerProps,
                  fields,
                  geometryType: 'esriGeometryPoint',
                  name: selectedScenario.scenarioName + '-points',
                  description: selectedScenario.scenarioDescription,
                  extent: graphicsExtent,
                  drawingInfo: {
                    renderer: {
                      type: 'uniqueValue',
                      field1: 'TYPEUUID',
                      uniqueValueInfos: uniqueValueInfosPoints,
                    },
                  },
                  types: templatesPoints,
                },
                adds: pointsAdds,
                updates: pointsUpdates,
                deletes: pointsDeletes,
                published: pointsPublished,
              });
            });

            console.log('layersToPublish: ', layersToPublish);
            featureServices.push({
              category: 'contains-epa-tots-sample-layer',
              label: editsScenario.scenarioName,
              value: '',
              description: editsScenario.scenarioDescription,
              url: '',
              layers: layersToPublish,
              tables: [
                {
                  tableDefinitionProps: {
                    ...layerProps.defaultTableProps,
                    fields: layerProps.defaultFields,
                    type: 'Table',
                    name: `${editsScenario.scenarioName}-sample-types`,
                    description: `Custom sample type definitions for "${editsScenario.scenarioName}".`,
                  },
                  data: Object.values(sampleTypesToPublish).map(
                    (item: any) => ({
                      ...item.attributes,
                      id: undefined,
                      GLOBALID: generateUUID(),
                      OBJECTID: -1,
                    }),
                  ),
                },
                {
                  tableDefinitionProps: {
                    ...layerProps.defaultTableProps,
                    fields: layerProps.defaultCalculateSettingsTableFields,
                    type: 'Table',
                    name: `${editsScenario.scenarioName}-calculate-settings`,
                    description: `Calculate settings for "${editsScenario.scenarioName}".`,
                  },
                  data: [editsScenario.calculateSettings.current],
                },
                {
                  tableDefinitionProps: {
                    ...layerProps.defaultTableProps,
                    fields: layerProps.defaultCalculateResultsTableFields,
                    type: 'Table',
                    name: `${editsScenario.scenarioName}-calculate-results`,
                    description: `Calculate results for "${editsScenario.scenarioName}".`,
                  },
                  data: [calculateResults.data],
                },
                {
                  tableDefinitionProps: {
                    ...layerProps.defaultTableProps,
                    fields: layerProps.defaultReferenceTableFields,
                    type: 'Table',
                    name: `${editsScenario.scenarioName}-reference-layers`,
                    description: `Links to reference layers for "${editsScenario.scenarioName}".`,
                  },
                  data: buildReferenceLayerTableEditsNew({
                    createWebMap: includePlanWebMap,
                    createWebScene: includePlanWebScene,
                    webMapReferenceLayerSelections,
                    webSceneReferenceLayerSelections,
                  }),
                },
              ],
              onPublishComplete: (res: any) => {
                console.log('res: ', res);
                const portalId = res.portalId;

                const changes: PublishResults = {};
                res.edits.forEach((layerRes: any) => {
                  if (layerRes.id !== 0) return;

                  // need to loop through each array and check the success flag
                  if (layerRes.addResults) {
                    layerRes.addResults.forEach((item: any, index: number) => {
                      // update the edits arrays
                      const origItem = layersToPublish[0].adds[index];
                      const decisionUUID = origItem.attributes.DECISIONUNITUUID;
                      const permanentId =
                        origItem.attributes.PERMANENT_IDENTIFIER;
                      if (item.success) {
                        const type = origItem.attributes.TYPE;
                        origItem.attributes = { ...sampleAttributes[type] };
                        origItem.attributes.DECISIONUNITUUID = decisionUUID;
                        origItem.attributes.PERMANENT_IDENTIFIER = permanentId;
                        origItem.attributes.OBJECTID = item.objectId;
                        origItem.attributes.GLOBALID = item.globalId;

                        // update the published for this layer
                        if (
                          Object.prototype.hasOwnProperty.call(
                            changes,
                            decisionUUID,
                          )
                        ) {
                          const exist =
                            changes[decisionUUID].published.findIndex(
                              (x) =>
                                x.attributes.PERMANENT_IDENTIFIER ===
                                origItem.attributes.PERMANENT_IDENTIFIER,
                            ) > -1;
                          if (!exist)
                            changes[decisionUUID].published.push(origItem);
                        } else {
                          changes[decisionUUID] = {
                            adds: [],
                            updates: [],
                            deletes: [],
                            published: [origItem],
                          };
                        }

                        // find the tots layer
                        const mapLayer = layers.find(
                          (layer) => layer.uuid === decisionUUID,
                        );

                        // update the graphic on the map
                        if (
                          mapLayer &&
                          mapLayer.sketchLayer?.type === 'graphics'
                        ) {
                          const graphic = mapLayer.sketchLayer.graphics.find(
                            (graphic) =>
                              graphic.attributes.PERMANENT_IDENTIFIER ===
                              origItem.attributes.PERMANENT_IDENTIFIER,
                          );

                          if (graphic) {
                            graphic.attributes.OBJECTID = item.objectId;
                            graphic.attributes.GLOBALID = item.globalId;
                          }
                        }
                      } else {
                        // update the adds for this layer
                        if (
                          Object.prototype.hasOwnProperty.call(
                            changes,
                            decisionUUID,
                          )
                        ) {
                          changes[decisionUUID].adds.push(origItem);
                        } else {
                          changes[decisionUUID] = {
                            adds: [origItem],
                            updates: [],
                            deletes: [],
                            published: [],
                          };
                        }
                      }
                    });
                  }
                  if (layerRes.updateResults) {
                    layerRes.updateResults.forEach(
                      (item: any, index: number) => {
                        // update the edits arrays
                        const origItem = layersToPublish[0].updates[index];
                        const decisionUUID =
                          origItem.attributes.DECISIONUNITUUID;
                        if (
                          item.success &&
                          Object.prototype.hasOwnProperty.call(
                            changes,
                            decisionUUID,
                          )
                        ) {
                          const type = origItem.attributes.TYPE;
                          origItem.attributes = { ...sampleAttributes[type] };
                          origItem.attributes.DECISIONUNITUUID = decisionUUID;
                          origItem.attributes.OBJECTID = item.objectId;
                          origItem.attributes.GLOBALID = item.globalId;

                          // get the publish items for this layer
                          const layerNewPublished =
                            changes[decisionUUID].published;

                          // find the item in published
                          const index = layerNewPublished.findIndex(
                            (pubItem) =>
                              pubItem.attributes.PERMANENT_IDENTIFIER ===
                              origItem.attributes.PERMANENT_IDENTIFIER,
                          );

                          // update the item in newPublished
                          if (index > -1) {
                            changes[decisionUUID].published = [
                              ...layerNewPublished.slice(0, index),
                              origItem,
                              ...layerNewPublished.slice(index + 1),
                            ];
                          }

                          // find the tots layer
                          const mapLayer = layers.find(
                            (layer) => layer.uuid === decisionUUID,
                          );

                          // update the graphic on the map
                          if (
                            mapLayer &&
                            mapLayer.sketchLayer?.type === 'graphics'
                          ) {
                            const graphic = mapLayer.sketchLayer.graphics.find(
                              (graphic) =>
                                graphic.attributes.PERMANENT_IDENTIFIER ===
                                origItem.attributes.PERMANENT_IDENTIFIER,
                            );

                            if (graphic) {
                              graphic.attributes.OBJECTID = item.objectId;
                              graphic.attributes.GLOBALID = item.globalId;
                            }
                          }
                        } else {
                          // update the updates for this layer
                          if (
                            Object.prototype.hasOwnProperty.call(
                              changes,
                              decisionUUID,
                            )
                          ) {
                            changes[decisionUUID].updates.push(origItem);
                          } else {
                            changes[decisionUUID] = {
                              adds: [],
                              updates: [origItem],
                              deletes: [],
                              published: [],
                            };
                          }
                        }
                      },
                    );
                  }
                  if (layerRes.deleteResults) {
                    layerRes.deleteResults.forEach(
                      (item: any, index: number) => {
                        // update the edits delete array
                        const origItem = layersToPublish[0].deletes[index];
                        const decisionUUID = origItem.DECISIONUNITUUID;
                        if (
                          item.success &&
                          Object.prototype.hasOwnProperty.call(
                            changes,
                            decisionUUID,
                          )
                        ) {
                          // get the publish items for this layer
                          const layerNewPublished =
                            changes[decisionUUID].published;

                          // find the item in published
                          const pubIndex = layerNewPublished.findIndex(
                            (pubItem) =>
                              pubItem.attributes.PERMANENT_IDENTIFIER ===
                              origItem.PERMANENT_IDENTIFIER,
                          );

                          // update the item in newPublished
                          if (pubIndex > -1) {
                            changes[decisionUUID].published = [
                              ...layerNewPublished.slice(0, pubIndex),
                              ...layerNewPublished.slice(pubIndex + 1),
                            ];
                          }
                        } else {
                          // update the updates for this layer
                          if (
                            Object.prototype.hasOwnProperty.call(
                              changes,
                              decisionUUID,
                            )
                          ) {
                            changes[decisionUUID].deletes.push(origItem);
                          } else {
                            changes[decisionUUID] = {
                              adds: [],
                              updates: [],
                              deletes: [origItem],
                              published: [],
                            };
                          }
                        }
                      },
                    );
                  }
                });

                // make a copy of the edits context variable
                // update the edits state
                setEdits((edits) => {
                  const editsScenario = edits.edits[
                    scenarioIndex
                  ] as ScenarioEditsType;
                  editsScenario.status = 'published';
                  editsScenario.portalId = portalId;

                  editsScenario.layers.forEach((editedLayer) => {
                    // update the ids
                    if (
                      Object.prototype.hasOwnProperty.call(
                        res.idMapping,
                        editedLayer.uuid,
                      )
                    ) {
                      editedLayer.portalId = portalId;
                      editedLayer.id = res.idMapping[editedLayer.uuid].id;
                      editedLayer.pointsId =
                        res.idMapping[editedLayer.uuid].pointsId;
                      editsScenario.id = editedLayer.id;
                      editsScenario.pointsId =
                        res.idMapping[editedLayer.uuid].pointsId;
                    }

                    const edits = changes[editedLayer.uuid];
                    if (edits) {
                      const oldPublished = editedLayer.published.filter((x) => {
                        const idx = editedLayer.deletes.findIndex(
                          (y) =>
                            y.PERMANENT_IDENTIFIER ===
                            x.attributes.PERMANENT_IDENTIFIER,
                        );
                        const idx2 = edits.published.findIndex(
                          (y) =>
                            y.attributes.PERMANENT_IDENTIFIER ===
                            x.attributes.PERMANENT_IDENTIFIER,
                        );
                        return idx === -1 && idx2 === -1;
                      });

                      editedLayer.adds = edits.adds;
                      editedLayer.updates = edits.updates;
                      editedLayer.published = [
                        ...oldPublished,
                        ...edits.published,
                      ];
                      editedLayer.deletes = edits.deletes;
                    }
                  });
                  editsScenario.table = res.table;

                  return {
                    count: edits.count + 1,
                    edits: [
                      ...edits.edits.slice(0, scenarioIndex),
                      editsScenario,
                      ...edits.edits.slice(scenarioIndex + 1),
                    ],
                  };
                });

                // updated the edited layer
                setLayers((layers) =>
                  layers.map((layer) => {
                    if (
                      !Object.prototype.hasOwnProperty.call(changes, layer.uuid)
                    )
                      return layer;

                    const updatedLayer: LayerType = {
                      ...layer,
                      status: 'published',
                      portalId,
                    };

                    // update the ids
                    if (
                      Object.prototype.hasOwnProperty.call(
                        res.idMapping,
                        layer.uuid,
                      )
                    ) {
                      updatedLayer.id = res.idMapping[layer.uuid].id;
                      updatedLayer.pointsId =
                        res.idMapping[layer.uuid].pointsId;
                    }

                    return updatedLayer;
                  }),
                );

                setSelectedScenario((selectedScenario) => {
                  if (!selectedScenario) return selectedScenario;

                  selectedScenario.status = 'published';
                  selectedScenario.portalId = portalId;
                  return selectedScenario;
                });
              },
            });
          }
        }

        if (includeDeconPlan) {
          const { scenarioIndex, editsScenario } = findLayerInEdits(
            edits.edits,
            selectedScenario.layerId,
          );

          if (
            scenarioIndex === -1 ||
            !editsScenario ||
            editsScenario.type !== 'scenario-decon' ||
            editsScenario.linkedLayerIds.length === 0 ||
            !calculateResultsDecon.data
          ) {
            errorMessages.push('No data to publish');
          } else {
            const linkedLayers = edits.edits.filter(
              (edit) =>
                editsScenario.linkedLayerIds.includes(edit.layerId) &&
                edit.type === 'layer-decon',
            );

            // build outputs for: operationSettings, operationDetails, calculationResults
            const operationSettings: any[] = [];
            const operationDetails: any[] = [];
            let calculationResults: any[] = [];
            const calculationResultsSummary: any[] = [];
            const calculationResultsWasteSummary: any[] = [];
            linkedLayers.forEach((linkedLayer) => {
              if (linkedLayer.type !== 'layer-decon') return;
              const aoiLayer = edits.edits.find(
                (edit) => edit.layerId === linkedLayer.analysisLayerId,
              ) as LayerAoiAnalysisEditsType;

              let numBuildings = 0;
              aoiLayer?.layers?.forEach((layer) => {
                if (layer.layerType !== 'AOI Assessed') return;
                numBuildings += layer.adds.length + layer.published.length;
              });

              operationSettings.push({
                OPERATION_UUID: linkedLayer.layerId,
                OPERATION_NAME: linkedLayer.name,
                AOI_LAYER_ID: linkedLayer.analysisLayerId,
                AOI_VERSION: 1,
                BUILDING_COUNT: numBuildings,
                BUILDING_AREA_TOTAL: aoiLayer.aoiSummary.totalBuildingSqM,
                BUILDING_AREA_EXTERIOR: aoiLayer.aoiSummary.totalBuildingExtSqM,
                BUILDING_AREA_INTERIOR: aoiLayer.aoiSummary.totalBuildingIntSqM,
                AOI_AREA: aoiLayer.aoiSummary.totalAoiSqM,
                DECON_EST_APPROACH: linkedLayer.approach,
                DECON_BLDG_EST_APPROACH: linkedLayer.buildingApproach,
                NOTES: '',
              });

              linkedLayer.deconTechSelections.forEach((tech) => {
                operationDetails.push({
                  OPERATION_UUID: linkedLayer.layerId,
                  SURFACE_UUID: tech.id,
                  PARENT_SURFACE_UUID: null,
                  SURFACE: tech.media,
                  SURFACE_SUB_CATEGORY: null,
                  DECON_TECH_UUID: tech.deconTech?.value ?? null,
                  DECON_TECH: tech.deconTech?.label ?? null,
                  NUM_ITERATIVE_APPLICATIONS: tech.numIterativeApplications,
                  PCT_AOI: tech.pctAoi,
                  PCT_DECONED: tech.pctDeconed,
                  SURFACE_AREA: tech.surfaceArea,
                  VOLUME: tech.volume,
                  VOLUME_CONTENTS: tech.volumeContents,
                  REMOVE_BLDG_CONTENTS: tech.removeBuildingContents,
                  NOTES: '',
                });

                tech.subRows?.forEach((sub) => {
                  operationDetails.push({
                    OPERATION_UUID: linkedLayer.layerId,
                    SURFACE_UUID: sub.id,
                    PARENT_SURFACE_UUID: tech.id,
                    SURFACE: tech.media,
                    SURFACE_SUB_CATEGORY: sub.media,
                    // TODO update this to trust what sub provides
                    DECON_TECH_UUID:
                      (sub.deconTech
                        ? sub.deconTech.value
                        : tech.deconTech?.value) ?? null,
                    DECON_TECH:
                      (sub.deconTech
                        ? sub.deconTech.label
                        : tech.deconTech?.label) ?? null,
                    NUM_ITERATIVE_APPLICATIONS: sub.numIterativeApplications,
                    PCT_AOI: sub.pctAoi,
                    PCT_DECONED: sub.pctDeconed,
                    SURFACE_AREA: sub.surfaceArea,
                    VOLUME: sub.volume,
                    VOLUME_CONTENTS: sub.volumeContents,
                    REMOVE_BLDG_CONTENTS: sub.removeBuildingContents,
                    NOTES: '',
                  });
                });
              });

              let totalSolidWaste = 0;
              let totalLiquidWaste = 0;
              let totalSolidWasteMass = 0;
              let totalLiquidWasteMass = 0;
              let totalCost = 0;
              let totalTime = 0;
              linkedLayer.deconLayerResults.resultsTable.forEach((tech) => {
                totalSolidWaste += tech.solidWasteVolumeM3;
                totalSolidWasteMass += tech.solidWasteMassKg;
                totalLiquidWaste += tech.liquidWasteVolumeM3;
                totalLiquidWasteMass += tech.liquidWasteMassKg;
                totalCost += tech.decontaminationCost;
                totalTime += tech.decontaminationTimeDays;
                calculationResults.push({
                  OPERATION_UUID: linkedLayer.layerId,
                  AGGREGATION_LEVEL: 'RAW',
                  SURFACE: tech.contaminationScenario,
                  SURFACE_SUB_CATEGORY: null,
                  DECON_TECH_UUID: tech.decontaminationTechnology,
                  DECON_TECH: tech.decontaminationTechnology,
                  SOLID_WASTE_M3: tech.solidWasteVolumeM3,
                  SOLID_WASTE_MASS: tech.solidWasteMassKg,
                  AQUEOUS_WASTE_M3: tech.liquidWasteVolumeM3,
                  AQUEOUS_WASTE_MASS: tech.liquidWasteMassKg,
                  COST: tech.decontaminationCost,
                  TIME: tech.decontaminationTimeDays,
                });
              });

              calculationResultsSummary.push({
                OPERATION_UUID: linkedLayer.layerId,
                AGGREGATION_LEVEL: 'SUMMARY',
                SURFACE: linkedLayer.name,
                SURFACE_SUB_CATEGORY: null,
                DECON_TECH_UUID: null,
                DECON_TECH: null,
                SOLID_WASTE_M3: totalSolidWaste,
                SOLID_WASTE_MASS: totalSolidWasteMass,
                AQUEOUS_WASTE_M3: totalLiquidWaste,
                AQUEOUS_WASTE_MASS: totalLiquidWasteMass,
                COST: totalCost,
                TIME: totalTime,
              });
            });

            let totalSolidWaste = 0;
            let totalSolidWasteMass = 0;
            let totalLiquidWaste = 0;
            let totalLiquidWasteMass = 0;
            let totalCost = 0;
            let totalTime = 0;
            calculationResultsSummary.forEach((summary) => {
              totalSolidWaste += summary.SOLID_WASTE_M3;
              totalSolidWasteMass += summary.SOLID_WASTE_MASS;
              totalLiquidWaste += summary.AQUEOUS_WASTE_M3;
              totalLiquidWasteMass += summary.AQUEOUS_WASTE_MASS;
              totalCost += summary.COST;
              totalTime += summary.TIME;
            });

            calculationResultsSummary.push({
              OPERATION_UUID: null,
              AGGREGATION_LEVEL: 'SUMMARY_TOTALS',
              SURFACE: null,
              SURFACE_SUB_CATEGORY: null,
              DECON_TECH_UUID: null,
              DECON_TECH: null,
              SOLID_WASTE_M3: totalSolidWaste,
              SOLID_WASTE_MASS: totalSolidWasteMass,
              AQUEOUS_WASTE_M3: totalLiquidWaste,
              AQUEOUS_WASTE_MASS: totalLiquidWasteMass,
              COST: totalCost,
              TIME: totalTime,
            });

            calculateResultsDecon.data.resultsTable.forEach((tech) => {
              calculationResultsWasteSummary.push({
                OPERATION_UUID: null,
                AGGREGATION_LEVEL: 'WASTE_SUMMARY',
                SURFACE: tech.contaminationScenario,
                SURFACE_SUB_CATEGORY: null,
                DECON_TECH_UUID: tech.decontaminationTechnology,
                DECON_TECH: tech.decontaminationTechnology,
                SOLID_WASTE_M3: tech.solidWasteVolumeM3,
                SOLID_WASTE_MASS: tech.solidWasteMassKg,
                AQUEOUS_WASTE_M3: tech.liquidWasteVolumeM3,
                AQUEOUS_WASTE_MASS: tech.liquidWasteMassKg,
                COST: tech.decontaminationCost,
                TIME: tech.decontaminationTimeDays,
              });
            });

            calculationResults = [
              ...calculationResultsSummary,
              ...calculationResultsWasteSummary,
              ...calculationResults,
            ];

            console.log('operationSettings: ', operationSettings);
            console.log('operationDetails: ', operationDetails);
            console.log('calculationResults: ', calculationResults);

            featureServices.push({
              category: 'contains-epa-tods-decon-layer',
              label: editsScenario.scenarioName,
              value: '',
              description: editsScenario.scenarioDescription,
              url: '',
              layers: [],
              tables: [
                {
                  tableDefinitionProps: {
                    ...layerProps.defaultTableProps,
                    fields: layerProps.defaultDeconOperationSettingsTableFields,
                    type: 'Table',
                    name: `${editsScenario.scenarioName}-operation-settings`,
                    description: `Operation settings for "${editsScenario.scenarioName}".`,
                  },
                  data: operationSettings,
                },
                {
                  tableDefinitionProps: {
                    ...layerProps.defaultTableProps,
                    fields: layerProps.defaultDeconOperationDetailsTableFields,
                    type: 'Table',
                    name: `${editsScenario.scenarioName}-operation-details`,
                    description: `Operation details for "${editsScenario.scenarioName}".`,
                  },
                  data: operationDetails,
                },
                {
                  tableDefinitionProps: {
                    ...layerProps.defaultTableProps,
                    fields:
                      layerProps.defaultDeconCalculationResultsTableFields,
                    type: 'Table',
                    name: `${editsScenario.scenarioName}-calculation-results`,
                    description: `Calculation results for "${editsScenario.scenarioName}".`,
                  },
                  data: calculationResults,
                },
                {
                  tableDefinitionProps: {
                    ...layerProps.defaultTableProps,
                    fields: layerProps.defaultReferenceTableFields,
                    type: 'Table',
                    name: `${editsScenario.scenarioName}-reference-layers`,
                    description: `Links to reference layers for "${editsScenario.scenarioName}".`,
                  },
                  data: buildReferenceLayerTableEditsNew({
                    createWebMap: includePlanWebMap,
                    createWebScene: includePlanWebScene,
                    webMapReferenceLayerSelections,
                    webSceneReferenceLayerSelections,
                  }),
                },
              ],
              onPublishComplete: (res: any) => {
                console.log('res: ', res);
                const portalId = res.portalId;

                // make a copy of the edits context variable
                // update the edits state
                setEdits((edits) => {
                  const editsScenario = edits.edits[
                    scenarioIndex
                  ] as ScenarioDeconEditsType;
                  editsScenario.status = 'published';
                  editsScenario.portalId = portalId;

                  editsScenario.linkedLayerIds.forEach((linkedLayerId) => {
                    const linkedLayer = edits.edits.find(
                      (edit) => edit.layerId === linkedLayerId,
                    );
                    if (!linkedLayer) return;
                    linkedLayer.status = 'published';
                    linkedLayer.portalId = portalId;
                  });

                  return {
                    count: edits.count + 1,
                    edits: [
                      ...edits.edits.slice(0, scenarioIndex),
                      editsScenario,
                      ...edits.edits.slice(scenarioIndex + 1),
                    ],
                  };
                });

                // updated the edited layer
                setLayers((layers) =>
                  // TODO need to look up layers linked to selectedScenario
                  //      this only applys to layerType=Decon
                  layers.map((layer) => {
                    const editsLayer = edits.edits.find(
                      (edit) =>
                        edit.layerId === layer.layerId &&
                        edit.type === 'layer-decon',
                    );
                    if (!editsLayer) return layer;

                    const updatedLayer: LayerType = {
                      ...layer,
                      status: 'published',
                      portalId,
                    };
                    return updatedLayer;
                  }),
                );

                setSelectedScenario((selectedScenario) => {
                  if (!selectedScenario) return selectedScenario;

                  selectedScenario.status = 'published';
                  selectedScenario.portalId = portalId;
                  return selectedScenario;
                });
              },
            });
          }
        }

        if (includeCustomSampleTypes) {
          if (sampleTypeSelections.length === 0) {
            errorMessages.push('No sample types to publish');
          } else if (!publishSampleTableMetaData) {
            errorMessages.push('Feature service metadata missing');
          } else if (publishSamplesMode === 'existing' && !selectedService) {
            errorMessages.push('No existing feature service selected');
          } else {
            const sampleTypeData: any[] = [];
            if (publishSamplesMode === 'new') {
              sampleTypeSelections.forEach((type) => {
                if (!type.value) return;

                const sampleType =
                  userDefinedAttributes.sampleTypes[type.value];
                const symbolTypeUuid =
                  sampleType.attributes.TYPEUUID ?? 'Samples';
                const defaultSymbol =
                  defaultSymbols.symbols[
                    Object.prototype.hasOwnProperty.call(
                      defaultSymbols.symbols,
                      symbolTypeUuid,
                    )
                      ? symbolTypeUuid
                      : 'Samples'
                  ];
                if (publishSamplesMode === 'new') {
                  sampleTypeData.push({
                    ...sampleType.attributes,
                    SYMBOLCOLOR: JSON.stringify(defaultSymbol.color),
                    SYMBOLOUTLINE: JSON.stringify(defaultSymbol.outline),
                    SYMBOLTYPE: defaultSymbol.type,
                  });
                }
              });
            }
            if (publishSamplesMode === 'existing' && selectedService) {
              const res = (await getFeatureTables(
                selectedService.url,
                token,
              )) as any[];

              // fire off requests to get the details and features for each layer
              const layerPromises: Promise<any>[] = [];
              res.forEach((layer: any) => {
                // get the layer features promise
                const featuresCall = getAllFeatures(
                  portal,
                  selectedService.url + '/' + layer.id,
                );
                layerPromises.push(featuresCall);
              });

              // wait for all of the promises to resolve
              const responses = await Promise.all(layerPromises);

              // define items used for updating states
              const existingTypeUuids: string[] = [];

              // create the user defined sample types to be added to TOTS
              responses.forEach((layerFeatures) => {
                // get the graphics from the layer
                layerFeatures.features.forEach((feature: any) => {
                  const uuid = feature.attributes.TYPEUUID;
                  sampleTypeData.push(feature.attributes);
                  if (!existingTypeUuids.includes(uuid)) {
                    existingTypeUuids.push(uuid);
                  }
                });
              });

              sampleTypeSelections.forEach((type) => {
                if (!type.value) return;

                const sampleType =
                  userDefinedAttributes.sampleTypes[type.value];
                const symbolTypeUuid =
                  sampleType.attributes.TYPEUUID ?? 'Samples';
                const defaultSymbol =
                  defaultSymbols.symbols[
                    Object.prototype.hasOwnProperty.call(
                      defaultSymbols.symbols,
                      symbolTypeUuid,
                    )
                      ? symbolTypeUuid
                      : 'Samples'
                  ];
                const item = {
                  ...sampleType.attributes,
                  SYMBOLCOLOR: JSON.stringify(defaultSymbol.color),
                  SYMBOLOUTLINE: JSON.stringify(defaultSymbol.outline),
                  SYMBOLTYPE: defaultSymbol.type,
                };
                const typeUuid = item.TYPEUUID || '';

                if (!existingTypeUuids.includes(typeUuid)) {
                  sampleTypeData.push(item);
                }
              });
            }

            featureServices.push({
              category: 'contains-epa-tots-user-defined-sample-types',
              label: publishSampleTableMetaData.label,
              description: publishSampleTableMetaData.description,
              url: publishSampleTableMetaData.url,
              value: publishSampleTableMetaData.value,
              layers: [],
              tables: [
                {
                  tableDefinitionProps: {
                    ...layerProps.defaultTableProps,
                    fields: layerProps.defaultFields,
                    type: 'Table',
                    name: publishSampleTableMetaData.label,
                    description: publishSampleTableMetaData.description,
                  },
                  data: sampleTypeData,
                },
              ],
              onPublishComplete: (res: any) => {
                console.log('res: ', res);
                const newUserDefinedAttributes = { ...userDefinedAttributes };

                // need to loop through each array and check the success flag
                if (res.edits.addResults) {
                  res.edits.addResults.forEach((item: any, index: number) => {
                    // update the edits arrays
                    const origItem = sampleTypeData[index];
                    const origUdt =
                      newUserDefinedAttributes.sampleTypes[
                        origItem.attributes.TYPEUUID
                      ];
                    if (item.success) {
                      origUdt.status = origUdt.serviceId
                        ? 'published-ago'
                        : 'published';
                      origUdt.serviceId =
                        res.service.featureService.serviceItemId;
                      origUdt.attributes.GLOBALID = item.globalId;
                      origUdt.attributes.OBJECTID = item.objectId;
                    }
                  });
                }

                setUserDefinedAttributes(newUserDefinedAttributes);
                if (publishSamplesMode === 'new') {
                  setSampleTableDescription('');
                  setSampleTableName('');
                }
                if (publishSamplesMode === 'existing') {
                  setSelectedService(null);
                }
              },
            });
          }
        }

        if (errorMessages.length > 0) {
          setPublishResponse({
            status: 'fetch-failure',
            summary: { success: '', failed: '' },
            error: { error: null, message: errorMessages.join('\n') },
            rawData: null,
          });
          return;
        }

        console.log('featureServices: ', featureServices);

        // run the publish
        setPublishResponse({
          status: 'fetching',
          summary: { success: '', failed: '' },
          rawData: null,
        });

        const responses: any = await publish({
          portal,
          map,
          featureServices,
          referenceMaterials: {
            createWebMap: includePlanWebMap,
            createWebScene: includePlanWebScene,
            webMapReferenceLayerSelections,
            webSceneReferenceLayerSelections,
          },
        });
        console.log('responses: ', responses);

        // get totals
        const totals = {
          added: 0,
          updated: 0,
          deleted: 0,
          failed: 0,
        };

        responses.forEach((res: any) => {
          res.edits.forEach((layerRes: any) => {
            if (layerRes.id !== 0) return;

            // need to loop through each array and check the success flag
            if (layerRes.addResults) {
              layerRes.addResults.forEach((item: any) => {
                if (item.success) totals.added += 1;
                else totals.failed += 1;
              });
            }
            if (layerRes.updateResults) {
              layerRes.updateResults.forEach((item: any) => {
                if (item.success) totals.updated += 1;
                else totals.failed += 1;
              });
            }
            if (layerRes.deleteResults) {
              layerRes.deleteResults.forEach((item: any) => {
                if (item.success) totals.deleted += 1;
                else totals.failed += 1;
              });
            }
          });
        });

        // create the message string for each type of change (add, update and delete)
        const successParts = [];
        if (totals.added) {
          successParts.push(`${totals.added} item(s) added`);
        }
        if (totals.updated) {
          successParts.push(`${totals.updated} item(s) updated`);
        }
        if (totals.deleted) {
          successParts.push(`${totals.deleted} item(s) deleted`);
        }

        // combine the messages
        let success = '';
        if (successParts.length === 1) {
          success = successParts[0];
        }
        if (successParts.length > 1) {
          success =
            successParts.slice(0, -1).join(', ') +
            ' and ' +
            successParts.slice(-1);
        }

        // create the failed status message
        const failed = totals.failed
          ? `${totals.failed} item(s) failed to publish. Check the console log for details.`
          : '';
        if (failed) console.error('Some items failed to publish: ', responses);

        setPublishResponse({
          status: 'success',
          summary: { success, failed },
          rawData: responses,
        });
      } catch (err) {
        console.error(err);
        setPublishResponse({
          status: 'fetch-failure',
          summary: { success: '', failed: '' },
          error: {
            error: createErrorObject(err),
            message: err.message,
          },
          rawData: err,
        });
        window.logErrorToGa(err);
      }
    }

    publishItemsInner();
  }, [
    calculateResults,
    calculateResultsDecon,
    defaultSymbols,
    edits,
    includeCustomSampleTypes,
    includePlanWebMap,
    includePlanWebScene,
    layerProps,
    layers,
    map,
    portal,
    publishSamplesMode,
    publishSampleTableMetaData,
    sampleAttributes,
    sampleTypeSelections,
    selectedScenario,
    selectedService,
    setEdits,
    setLayers,
    setSampleTableDescription,
    setSampleTableName,
    setSelectedScenario,
    setSelectedService,
    setUserDefinedAttributes,
    trainingMode,
    userDefinedAttributes,
    webMapReferenceLayerSelections,
    webSceneReferenceLayerSelections,
  ]);

  // Run the publish
  useEffect(() => {
    if (!oAuthInfo || !portal || !signedIn) return;
    if (!publishButtonClicked || !hasNameBeenChecked) return;
    if (includePlan && (!layers || layers.length === 0 || !selectedScenario)) {
      return;
    }

    if (
      includeCustomSampleTypes &&
      (Object.keys(sampleTypeSelections).length === 0 ||
        !publishSampleTableMetaData ||
        (publishSamplesMode === 'existing' && !selectedService))
    ) {
      return;
    }
    setPublishButtonClicked(false);

    publishItems();
  }, [
    hasNameBeenChecked,
    includeCustomSampleTypes,
    includePlan,
    layers,
    layerProps,
    oAuthInfo,
    portal,
    publishButtonClicked,
    publishItems,
    publishSampleTableMetaData,
    publishSamplesMode,
    sampleTypeSelections,
    selectedScenario,
    selectedService,
    signedIn,
  ]);

  ///////////////////////////////////////////////////////////////////////////////////////
  //////////////////////////// END - Publish Sample Types ///////////////////////////////
  ///////////////////////////////////////////////////////////////////////////////////////

  // count the number of samples of the selected sampling plan
  let sampleCount = 0;
  if (selectedScenario?.scenarioName) {
    layers.forEach((layer) => {
      if (layer.layerType !== 'Samples' && layer.layerType !== 'VSP') return;
      if (!layer.sketchLayer || layer.sketchLayer.type === 'feature') return;
      if (layer.parentLayer?.title !== selectedScenario.scenarioName) return;

      sampleCount += layer.sketchLayer.graphics.length;
    });
  }

  const [publishNameCheck, setPublishNameCheck] = useState<SaveResultsType>({
    status: 'none',
  });
  const [sampleTypesNameCheck, setSampleTypesNameCheck] =
    useState<SaveResultsType>({ status: 'none' });

  const isPublishPlanReady =
    !includePlan ||
    // verify the service name is available
    ((planNameCheckStatus !== 'not-available' ||
      (planNameCheckStatus === 'not-available' &&
        publishNameCheck.status === 'success')) &&
      ((appType === 'sampling' && sampleCount !== 0) ||
        (appType === 'decon' &&
          calculateResultsDecon.status === 'success' &&
          calculateResultsDecon.data)) && // verify there are samples to publish
      // verify service name availbility if changed
      (publishNameCheck.status === 'none' ||
        publishNameCheck.status === 'success'));

  const isPublishSamplesReady =
    !includeCustomSampleTypes ||
    // verify the service name is available
    ((customSampleNameCheckStatus !== 'not-available' ||
      (customSampleNameCheckStatus === 'not-available' &&
        sampleTypesNameCheck.status === 'success')) &&
      // verify at least on custom sample type is selected and a service is selected
      sampleTypeSelections.length > 0 &&
      ((publishSamplesMode === 'new' && sampleTableName) ||
        (publishSamplesMode === 'existing' && selectedService !== null)) &&
      // verify service name availbility if changed
      (sampleTypesNameCheck.status === 'none' ||
        sampleTypesNameCheck.status === 'success'));

  let appName = '';
  if (appType === 'sampling') appName = 'TOTS';
  if (appType === 'decon') appName = 'TODS';

  return (
    <div css={panelContainer}>
      <h2>Publish Output</h2>
      <div css={sectionContainer}>
        <p>
          Publish the configured {appName} output to your ArcGIS Online account.
          A summary of the selections made on the Configure Output step is
          below. By default, only you and the ArcGIS Online administrator can
          access content created. Provide other collaborators access to{' '}
          {appName} content by{' '}
          <a
            href="https://doc.arcgis.com/en/arcgis-online/share-maps/share-items.htm"
            target="_blank"
            rel="noopener noreferrer"
          >
            sharing
          </a>{' '}
          <a
            className="exit-disclaimer"
            href="https://www.epa.gov/home/exit-epa"
            target="_blank"
            rel="noopener noreferrer"
          >
            EXIT
          </a>{' '}
          the content to everyone (the public), your organization, or members of
          specific groups. You can edit{' '}
          <a
            href="https://doc.arcgis.com/en/arcgis-online/manage-data/item-details.htm"
            target="_blank"
            rel="noopener noreferrer"
          >
            item details
          </a>{' '}
          and change{' '}
          <a
            href="https://doc.arcgis.com/en/arcgis-online/manage-data/manage-hosted-feature-layers.htm"
            target="_blank"
            rel="noopener noreferrer"
          >
            feature layer settings
          </a>
          .{' '}
          <a
            className="exit-disclaimer"
            href="https://www.epa.gov/home/exit-epa"
            target="_blank"
            rel="noopener noreferrer"
          >
            EXIT
          </a>
        </p>
        {planNameCheckStatus === 'not-available' && (
          <EditScenario
            appType={appType}
            initialScenario={selectedScenario}
            initialStatus="name-not-available"
            onSave={(saveResults) => {
              if (!saveResults) return;

              setPublishNameCheck(saveResults);
            }}
          />
        )}
        {planNameCheckStatus !== 'not-available' && (
          <Fragment>
            <p css={layerInfo}>
              <strong>Plan Name: </strong>
              {selectedScenario?.scenarioName}
            </p>
            <p css={layerInfo}>
              <strong>Plan Description: </strong>
              <ShowLessMore
                text={selectedScenario?.scenarioDescription}
                charLimit={20}
              />
            </p>
          </Fragment>
        )}
      </div>

      <div>
        <h3>Publish Summary</h3>
        <div css={totsOutputContainer}>
          <strong>
            {includePlan ? (
              <i className="fas fa-check" css={checkedStyles}></i>
            ) : (
              <i className="fas fa-times" css={unCheckedStyles}></i>
            )}
            Include Tailored {appName} Output Files:
          </strong>
          {includePlan && (
            <div>
              {appType === 'sampling' && (
                <div>
                  <strong css={webMapContainerCheckboxStyles}>
                    {includePlanWebMap ? (
                      <i className="fas fa-check" css={checkedStyles}></i>
                    ) : (
                      <i className="fas fa-times" css={unCheckedStyles}></i>
                    )}
                    Include Web Map:
                  </strong>
                </div>
              )}
              {webMapReferenceLayerSelections.length > 0 && (
                <div css={webMapContainerCheckboxStyles}>
                  Reference layers to include:
                  <ul>
                    {webMapReferenceLayerSelections
                      .sort((a, b) => a.label.localeCompare(b.label))
                      .map((l, index) => (
                        <li key={index}>{l.label}</li>
                      ))}
                  </ul>
                </div>
              )}

              {appType === 'sampling' && (
                <Fragment>
                  <div>
                    <strong css={webMapContainerCheckboxStyles}>
                      {includePlanWebScene ? (
                        <i className="fas fa-check" css={checkedStyles}></i>
                      ) : (
                        <i className="fas fa-times" css={unCheckedStyles}></i>
                      )}
                      Include Web Scene:
                    </strong>
                  </div>
                  {webSceneReferenceLayerSelections.length > 0 && (
                    <div css={webMapContainerCheckboxStyles}>
                      Reference layers to include:
                      <ul>
                        {webSceneReferenceLayerSelections
                          .sort((a, b) => a.label.localeCompare(b.label))
                          .map((l, index) => (
                            <li key={index}>{l.label}</li>
                          ))}
                      </ul>
                    </div>
                  )}
                </Fragment>
              )}
            </div>
          )}
        </div>

        {includeCustomSampleTypes && appType === 'sampling' && (
          <div>
            <strong>Include Custom Sample Types:</strong>
            <ul>
              {sampleTypeSelections.map((item, index) => {
                return <li key={index}>{item.label}</li>;
              })}
            </ul>
            <p>
              <strong>Publish Custom Sample Types to:</strong>
              <br />
              {selectedService ? (
                <Fragment>
                  <strong>Feature Service Name: </strong>
                  {selectedService.label}
                  <br />
                  <strong>Feature Service Description: </strong>
                  {selectedService.description}
                </Fragment>
              ) : (
                <Fragment>
                  <strong>Feature Service Name: </strong>
                  {sampleTableName}
                  <br />
                  <strong>Feature Service Description: </strong>
                  {sampleTableDescription}
                </Fragment>
              )}
            </p>
          </div>
        )}
      </div>

      {publishResponse.status === 'fetching' && <LoadingSpinner />}
      {publishResponse.status === 'fetch-failure' &&
        webServiceErrorMessage(publishResponse.error)}
      {publishResponse.status === 'success' &&
        publishResponse.summary.failed && (
          <MessageBox
            severity="error"
            title="Some item(s) failed to publish"
            message={publishResponse.summary.failed}
          />
        )}
      {publishResponse.status === 'success' &&
        publishSuccessMessage(appName, publishResponse.rawData)}

      {!signedIn && notLoggedInMessage}
      {includePlan &&
        appType === 'sampling' &&
        sampleCount === 0 &&
        noSamplesPublishMessage}
      {includePlan &&
        appType === 'decon' &&
        (calculateResultsDecon.status !== 'success' ||
          !calculateResultsDecon.data) &&
        noDeconPublishMessage}
      {includeCustomSampleTypes && (
        <Fragment>
          {sampleTypeSelections.length === 0 && noSampleTypesPublishMessage}
          {publishSamplesMode === 'new' &&
            publishResponse.status === 'none' &&
            !sampleTableName &&
            noServiceNameMessage}
          {publishSamplesMode === 'existing' &&
            publishResponse.status === 'none' &&
            !selectedService &&
            noServiceSelectedMessage}
        </Fragment>
      )}

      {customSampleNameCheckStatus === 'not-available' &&
        publishSamplesMode === 'new' && (
          <EditCustomSampleTypesTable
            appType={appType}
            initialStatus="name-not-available"
            onSave={(saveResults) => {
              if (!saveResults) return;

              setCustomSampleNameCheckStatus('available');
              setSampleTypesNameCheck(saveResults);
            }}
          />
        )}
      {(includePlan || includeCustomSampleTypes) &&
        isPublishPlanReady &&
        isPublishSamplesReady && (
          <div css={publishButtonContainerStyles}>
            <button
              css={publishButtonStyles}
              onClick={() => setPublishButtonClicked(true)}
            >
              Publish
            </button>
          </div>
        )}
    </div>
  );
}

export default Publish;
