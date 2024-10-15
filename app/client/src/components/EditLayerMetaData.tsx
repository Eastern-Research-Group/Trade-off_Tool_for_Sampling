/** @jsxImportSource @emotion/react */

import React, { Fragment, useContext, useEffect, useState } from 'react';
import { css } from '@emotion/react';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import GroupLayer from '@arcgis/core/layers/GroupLayer';
import Portal from '@arcgis/core/portal/Portal';
// components
import LoadingSpinner from 'components/LoadingSpinner';
import Select from 'components/Select';
// contexts
import { AuthenticationContext } from 'contexts/Authentication';
import { settingDefaults } from 'contexts/Calculate';
import { NavigationContext } from 'contexts/Navigation';
import { PublishContext } from 'contexts/Publish';
import { SketchContext } from 'contexts/Sketch';
// utils
import { isServiceNameAvailable } from 'utils/arcGisRestUtils';
import {
  createLayerEditTemplate,
  createSampleLayer,
  generateUUID,
  updateLayerEdits,
} from 'utils/sketchUtils';
import { createErrorObject } from 'utils/utils';
// types
import { LayerEditsType, ScenarioEditsType } from 'types/Edits';
import { LayerType } from 'types/Layer';
import { ErrorType } from 'types/Misc';
import { AppType } from 'types/Navigation';
// config
import {
  scenarioNameTakenMessage,
  webServiceErrorMessage,
} from 'config/errorMessages';
// styles
import { colors, linkButtonStyles } from 'styles';

export type SaveStatusType =
  | 'none'
  | 'changes'
  | 'fetching'
  | 'success'
  | 'failure'
  | 'fetch-failure'
  | 'name-not-available';

export type SaveResultsType = {
  status: SaveStatusType;
  error?: ErrorType;
};

type SelectedService = {
  url: string;
  description: string;
  label: string;
  value: string;
};

type FeatureServices = {
  status: 'fetching' | 'failure' | 'success';
  data: SelectedService[];
};

// --- styles (EditScenario) ---
const inputStyles = css`
  width: 100%;
  height: 36px;
  margin: 0 0 10px 0;
  padding-left: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
`;

const saveButtonContainerStyles = css`
  display: flex;
  justify-content: flex-end;
`;

const saveButtonStyles = (status: string) => {
  let backgroundColor = '';
  if (status === 'success') {
    backgroundColor = `background-color: ${colors.green()};`;
  }
  if (status === 'failure' || status === 'name-not-available') {
    backgroundColor = `background-color: ${colors.red()};`;
  }

  return css`
    margin: 5px 0;
    ${backgroundColor}

    &:disabled {
      cursor: default;
      opacity: 0.65;
    }
  `;
};

// --- components (EditScenario) ---
type Props = {
  appType: AppType;
  initialScenario?: ScenarioEditsType | null;
  buttonText?: string;
  initialStatus?: SaveStatusType;
  addDefaultSampleLayer?: boolean;
  onSave?: (saveResults?: SaveResultsType) => void;
};

function EditScenario({
  appType,
  initialScenario = null,
  buttonText = 'Save',
  initialStatus = 'none',
  addDefaultSampleLayer = false,
  onSave,
}: Props) {
  const {
    portal,
    signedIn, //
  } = useContext(AuthenticationContext);
  const {
    defaultDeconSelections,
    edits,
    setEdits,
    map,
    layers,
    setLayers,
    setSelectedScenario,
    setSketchLayer,
  } = useContext(SketchContext);

  // focus on the first input
  useEffect(() => {
    document.getElementById('scenario-name-input')?.focus();
  }, []);

  const [
    saveStatus,
    setSaveStatus, //
  ] = useState<SaveResultsType>({ status: initialStatus });

  const [scenarioName, setScenarioName] = useState(
    initialScenario ? initialScenario.scenarioName : '',
  );
  const [scenarioDescription, setScenarioDescription] = useState(
    initialScenario ? initialScenario.scenarioDescription : '',
  );

  // Updates the scenario metadata.
  function updateScenario(appType: AppType) {
    if (appType === 'decon') updateScenarioDecon();
    if (appType === 'sampling') updateScenarioSampling();
  }

  function updateScenarioSampling() {
    if (!map) return;

    // find the layer being edited
    let index = -1;
    if (initialScenario) {
      index = edits.edits.findIndex(
        (item) =>
          item.type === 'scenario' && item.layerId === initialScenario.layerId,
      );
    }

    // update an existing scenario, otherwise add the new scenario
    if (index > -1 && initialScenario) {
      // update the group layer name
      for (let i = 0; i < map.layers.length; i++) {
        const layer = map.layers.getItemAt(i);
        if (layer.type === 'group' && layer.id === initialScenario.layerId) {
          layer.title = scenarioName;
          break;
        }
      }

      // update the selected scenario
      setSelectedScenario((selectedScenario) => {
        if (!selectedScenario) return null;

        return {
          ...selectedScenario,
          label: scenarioName,
          name: scenarioName,
          scenarioName: scenarioName,
          scenarioDescription: scenarioDescription,
        };
      });

      // make a copy of the edits context variable
      setEdits((edits) => {
        const editedScenario = edits.edits[index] as ScenarioEditsType;
        editedScenario.label = scenarioName;
        editedScenario.name = scenarioName;
        editedScenario.scenarioName = scenarioName;
        editedScenario.scenarioDescription = scenarioDescription;

        return {
          count: edits.count + 1,
          edits: [
            ...edits.edits.slice(0, index),
            editedScenario,
            ...edits.edits.slice(index + 1),
          ],
        };
      });
    } else {
      // create a new group layer for the scenario
      const groupLayer = new GroupLayer({
        title: scenarioName,
      });

      // hide all other plans from the map
      layers.forEach((layer) => {
        if (layer.parentLayer) {
          layer.parentLayer.visible = false;
          return;
        }

        if (layer.layerType === 'Samples' || layer.layerType === 'VSP') {
          layer.sketchLayer.visible = false;
        }
      });

      const newLayers: LayerEditsType[] = [];
      let tempSketchLayer: LayerType | null = null;
      if (addDefaultSampleLayer) {
        edits.edits.forEach((edit) => {
          if (
            edit.type === 'layer' &&
            (edit.layerType === 'Samples' || edit.layerType === 'VSP')
          ) {
            newLayers.push(edit);
          }
        });

        if (newLayers.length === 0) {
          // no sketchable layers were available, create one
          tempSketchLayer = createSampleLayer(undefined, groupLayer);
          newLayers.push(createLayerEditTemplate(tempSketchLayer, 'add'));
        } else {
          // update the parentLayer of layers being added to the group layer
          setLayers((layers) => {
            newLayers.forEach((newLayer) => {
              const layer = layers.find((l) => l.layerId === newLayer.layerId);
              if (!layer) return;

              layer.parentLayer = groupLayer;
              groupLayer.add(layer.sketchLayer);
              map.layers.remove(layer.sketchLayer);
              if (layer.pointsLayer) {
                groupLayer.add(layer.pointsLayer);
                map.layers.remove(layer.pointsLayer);
              }
              if (layer.hybridLayer) {
                groupLayer.add(layer.hybridLayer);
                map.layers.remove(layer.hybridLayer);
              }
            });

            return layers;
          });
        }
      }

      // create the scenario to be added to edits
      const newScenario: ScenarioEditsType = {
        type: 'scenario',
        id: -1,
        pointsId: -1,
        layerId: groupLayer.id,
        portalId: '',
        name: scenarioName,
        label: scenarioName,
        value: groupLayer.id,
        layerType: 'Samples',
        addedFrom: 'sketch',
        hasContaminationRan: false,
        status: 'added',
        editType: 'add',
        visible: true,
        listMode: 'show',
        scenarioName: scenarioName,
        scenarioDescription: scenarioDescription,
        layers: newLayers,
        table: null,
        referenceLayersTable: {
          id: -1,
          referenceLayers: [],
        },
        customAttributes: [],
        calculateSettings: { current: settingDefaults },
      };

      // make a copy of the edits context variable
      setEdits((edits) => {
        const newEdits = edits.edits.filter((edit) => {
          const idx = newLayers.findIndex((l) => l.layerId === edit.layerId);

          return idx === -1;
        });

        newEdits.forEach((edit) => {
          let visible = edit.visible;

          if (edit.type === 'scenario') {
            visible = edit.layerId === newScenario.layerId ? true : false;
          }
          if (edit.type === 'layer') {
            if (edit.layerType === 'Samples' || edit.layerType === 'VSP') {
              visible = false;
            }
          }
          edit.visible = visible;
        });

        return {
          count: edits.count + 1,
          edits: [...newEdits, newScenario],
        };
      });

      // select the new scenario
      setSelectedScenario(newScenario);

      if (addDefaultSampleLayer && tempSketchLayer) {
        groupLayer.add(tempSketchLayer.sketchLayer);
        if (tempSketchLayer.pointsLayer) {
          groupLayer.add(tempSketchLayer.pointsLayer);
        }
        if (tempSketchLayer.hybridLayer) {
          groupLayer.add(tempSketchLayer.hybridLayer);
        }

        // update layers (set parent layer)
        setLayers((layers) => {
          if (!tempSketchLayer) return layers;

          return [...layers, tempSketchLayer];
        });

        // update sketchLayer (clear parent layer)
        setSketchLayer(tempSketchLayer);
      }

      // add the scenario group layer to the map
      map.add(groupLayer);
    }

    const saveStatus: SaveResultsType = { status: 'success' };
    setSaveStatus(saveStatus);
    if (onSave) onSave(saveStatus);
  }

  function updateScenarioDecon() {
    if (!map) return;

    // find the layer being edited
    let index = -1;
    if (initialScenario) {
      index = edits.edits.findIndex(
        (item) =>
          item.type === 'scenario' && item.layerId === initialScenario.layerId,
      );
    }

    // update an existing scenario, otherwise add the new scenario
    if (index > -1 && initialScenario) {
      // update the group layer name
      for (let i = 0; i < map.layers.length; i++) {
        const layer = map.layers.getItemAt(i);
        if (layer.type === 'group' && layer.id === initialScenario.layerId) {
          layer.title = scenarioName;
          break;
        }
      }

      // update the selected scenario
      setSelectedScenario((selectedScenario) => {
        if (!selectedScenario) return null;

        return {
          ...selectedScenario,
          label: scenarioName,
          name: scenarioName,
          scenarioName: scenarioName,
          scenarioDescription: scenarioDescription,
        };
      });

      // make a copy of the edits context variable
      setEdits((edits) => {
        const editedScenario = edits.edits[index] as ScenarioEditsType;
        editedScenario.label = scenarioName;
        editedScenario.name = scenarioName;
        editedScenario.scenarioName = scenarioName;
        editedScenario.scenarioDescription = scenarioDescription;

        return {
          count: edits.count + 1,
          edits: [
            ...edits.edits.slice(0, index),
            editedScenario,
            ...edits.edits.slice(index + 1),
          ],
        };
      });
    } else {
      // create a new group layer for the scenario
      const groupLayer = new GroupLayer({
        title: scenarioName,
      });

      const layerUuidImageAnalysis = generateUUID();
      const graphicsLayerImageAnalysis = new GraphicsLayer({
        id: layerUuidImageAnalysis,
        title: 'Imagery Analysis Results',
        listMode: 'show',
      });

      const layerUuid = generateUUID();
      const graphicsLayer = new GraphicsLayer({
        id: layerUuid,
        title: 'AOI Assessment',
        listMode: 'show',
      });

      const newLayers: LayerEditsType[] = [];
      let tempSketchLayer: LayerType | null = null;
      let tempAssessedAoiLayer: LayerType | null = null;
      let tempImageAnalysisLayer: LayerType | null = null;
      if (addDefaultSampleLayer) {
        edits.edits.forEach((edit) => {
          if (
            edit.type === 'layer' &&
            (edit.layerType === 'Samples' || edit.layerType === 'VSP')
          ) {
            newLayers.push(edit);
          }
        });

        tempAssessedAoiLayer = {
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
          listMode: 'show',
          sort: 0,
          geometryType: 'esriGeometryPolygon',
          addedFrom: 'sketch',
          status: 'added',
          sketchLayer: graphicsLayer,
          pointsLayer: null,
          hybridLayer: null,
          parentLayer: groupLayer,
        } as LayerType;

        tempImageAnalysisLayer = {
          id: -1,
          pointsId: -1,
          uuid: layerUuidImageAnalysis,
          layerId: layerUuidImageAnalysis,
          portalId: '',
          value: 'aoiAssessed',
          name: 'Imagery Analysis Results',
          label: 'Imagery Analysis Results',
          layerType: 'Image Analysis',
          editType: 'add',
          visible: true,
          listMode: 'show',
          sort: 0,
          geometryType: 'esriGeometryPolygon',
          addedFrom: 'sketch',
          status: 'added',
          sketchLayer: graphicsLayerImageAnalysis,
          pointsLayer: null,
          hybridLayer: null,
          parentLayer: groupLayer,
        } as LayerType;

        if (newLayers.length === 0) {
          // no sketchable layers were available, create one
          tempSketchLayer = createSampleLayer(undefined, groupLayer);
          newLayers.push(
            createLayerEditTemplate(tempImageAnalysisLayer, 'add'),
          );
          newLayers.push(createLayerEditTemplate(tempAssessedAoiLayer, 'add'));
          newLayers.push(createLayerEditTemplate(tempSketchLayer, 'add'));
        } else {
          newLayers.push(
            createLayerEditTemplate(tempImageAnalysisLayer, 'add'),
          );
          newLayers.push(createLayerEditTemplate(tempAssessedAoiLayer, 'add'));
          // update the parentLayer of layers being added to the group layer
          setLayers((layers) => {
            newLayers.forEach((newLayer) => {
              const layer = layers.find((l) => l.layerId === newLayer.layerId);
              if (!layer) return;

              layer.parentLayer = groupLayer;
              groupLayer.add(layer.sketchLayer);
              map.layers.remove(layer.sketchLayer);
              if (layer.pointsLayer) {
                groupLayer.add(layer.pointsLayer);
                map.layers.remove(layer.pointsLayer);
              }
              if (layer.hybridLayer) {
                groupLayer.add(layer.hybridLayer);
                map.layers.remove(layer.hybridLayer);
              }
            });

            return layers;
          });
        }
      }

      // create the scenario to be added to edits
      const newScenario: ScenarioEditsType = {
        type: 'scenario',
        id: -1,
        pointsId: -1,
        layerId: groupLayer.id,
        portalId: '',
        name: scenarioName,
        label: scenarioName,
        value: groupLayer.id,
        layerType: 'Samples',
        addedFrom: 'sketch',
        hasContaminationRan: false,
        status: 'added',
        editType: 'add',
        visible: true,
        listMode: 'show',
        scenarioName: scenarioName,
        scenarioDescription: scenarioDescription,
        layers: newLayers,
        table: null,
        referenceLayersTable: {
          id: -1,
          referenceLayers: [],
        },
        customAttributes: [],
        deconTechSelections: defaultDeconSelections,
        deconSummaryResults: {
          summary: {
            totalAoiSqM: 0,
            totalBuildingFootprintSqM: 0,
            totalBuildingFloorsSqM: 0,
            totalBuildingSqM: 0,
            totalBuildingExtWallsSqM: 0,
            totalBuildingIntWallsSqM: 0,
            totalBuildingRoofSqM: 0,
          },
          aoiPercentages: {
            asphalt: 0,
            concrete: 0,
            soil: 0,
          },
          calculateResults: null,
        },
        aoiSummary: {
          area: 0,
          buildingFootprint: 0,
        },
        deconLayerResults: {
          cost: 0,
          time: 0,
          wasteVolume: 0,
          wasteMass: 0,
          resultsTable: [],
        },
        calculateSettings: { current: settingDefaults },
        importedAoiLayer: null,
        aoiLayerMode: 'draw',
        gsgFile: null,
      };

      // make a copy of the edits context variable
      setEdits((edits) => {
        const newEdits = edits.edits.filter((edit) => {
          const idx = newLayers.findIndex((l) => l.layerId === edit.layerId);

          return idx === -1;
        });

        return {
          count: edits.count + 1,
          edits: [...newEdits, newScenario],
        };
      });

      // select the new scenario
      setSelectedScenario(newScenario);

      if (addDefaultSampleLayer && tempSketchLayer) {
        groupLayer.add(tempSketchLayer.sketchLayer);
        if (tempSketchLayer.pointsLayer) {
          groupLayer.add(tempSketchLayer.pointsLayer);
        }
        if (tempSketchLayer.hybridLayer) {
          groupLayer.add(tempSketchLayer.hybridLayer);
        }

        const tLayers = [...layers];
        if (tempSketchLayer) tLayers.push(tempSketchLayer);
        if (tempImageAnalysisLayer) tLayers.push(tempImageAnalysisLayer);
        if (tempAssessedAoiLayer) tLayers.push(tempAssessedAoiLayer);

        // update layers (set parent layer)
        (window as any).totsLayers = tLayers;
        setLayers(tLayers);

        // update sketchLayer (clear parent layer)
        setSketchLayer(tempSketchLayer);
      }

      groupLayer.layers.add(graphicsLayerImageAnalysis);
      groupLayer.layers.add(graphicsLayer);

      // add the scenario group layer to the map
      map.add(groupLayer);
    }

    const saveStatus: SaveResultsType = { status: 'success' };
    setSaveStatus(saveStatus);
    if (onSave) onSave(saveStatus);
  }

  // Handles saving of the layer's scenario name and description fields.
  // Also checks the uniqueness of the scenario name, if the user is signed in.
  function handleSave() {
    // if the user hasn't signed in go ahead and save the
    // scenario name and description
    if (!portal || !signedIn) {
      updateScenario(appType);
      return;
    }

    setSaveStatus({ status: 'fetching' });

    // if the user is signed in, go ahead and check if the
    // service (scenario) name is availble before continuing
    isServiceNameAvailable(portal, scenarioName)
      .then((res: any) => {
        if (res.error) {
          const saveStatus: SaveResultsType = {
            status: 'failure',
            error: {
              error: createErrorObject(res),
              message: res.error.message,
            },
          };
          setSaveStatus(saveStatus);
          if (onSave) onSave(saveStatus);
          return;
        }

        if (!res.available) {
          const saveStatus: SaveResultsType = { status: 'name-not-available' };
          setSaveStatus(saveStatus);
          if (onSave) onSave(saveStatus);
          return;
        }

        updateScenario(appType);
      })
      .catch((err: any) => {
        console.error('isServiceNameAvailable error', err);
        setSaveStatus({
          status: 'failure',
          error: { error: createErrorObject(err), message: err.message },
        });

        window.logErrorToGa(err);
      });
  }

  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault();
      }}
    >
      <label htmlFor="scenario-name-input">
        {appType === 'decon' ? 'Decon Layer' : 'Plan'} Name
      </label>
      <input
        id="scenario-name-input"
        disabled={
          initialScenario && initialScenario.status !== 'added' ? true : false
        }
        css={inputStyles}
        maxLength={250}
        placeholder="Enter Plan Name"
        value={scenarioName}
        onChange={(ev) => {
          setScenarioName(ev.target.value);
          setSaveStatus({ status: 'changes' });
        }}
      />
      {appType === 'sampling' && (
        <Fragment>
          <label htmlFor="scenario-description-input">Plan Description</label>
          <input
            id="scenario-description-input"
            disabled={
              initialScenario && initialScenario.status !== 'added'
                ? true
                : false
            }
            css={inputStyles}
            maxLength={2048}
            placeholder="Enter Plan Description (2048 characters)"
            value={scenarioDescription}
            onChange={(ev) => {
              setScenarioDescription(ev.target.value);
              setSaveStatus({ status: 'changes' });
            }}
          />
        </Fragment>
      )}

      {saveStatus.status === 'fetching' && <LoadingSpinner />}
      {saveStatus.status === 'failure' &&
        webServiceErrorMessage(saveStatus.error)}
      {saveStatus.status === 'name-not-available' &&
        scenarioNameTakenMessage(scenarioName ? scenarioName : '')}
      {(!initialScenario || initialScenario.status === 'added') && (
        <div css={saveButtonContainerStyles}>
          <button
            css={saveButtonStyles(saveStatus.status)}
            type="submit"
            disabled={
              saveStatus.status === 'none' ||
              saveStatus.status === 'fetching' ||
              saveStatus.status === 'success'
            }
            onClick={handleSave}
          >
            {(saveStatus.status === 'none' ||
              saveStatus.status === 'changes' ||
              saveStatus.status === 'fetching') &&
              buttonText}
            {saveStatus.status === 'success' && (
              <Fragment>
                <i className="fas fa-check" /> Saved
              </Fragment>
            )}
            {(saveStatus.status === 'failure' ||
              saveStatus.status === 'fetch-failure' ||
              saveStatus.status === 'name-not-available') && (
              <Fragment>
                <i className="fas fa-exclamation-triangle" /> Error
              </Fragment>
            )}
          </button>
        </div>
      )}
    </form>
  );
}

const modLinkButtonStyles = css`
  ${linkButtonStyles}
  margin-left: 0;
`;

// --- components (EditLayer) ---
type EditLayerProps = {
  appType: AppType;
  initialLayer?: LayerType | null;
  buttonText?: string;
  initialStatus?: SaveStatusType;
  onSave?: () => void;
};

function EditLayer({
  appType,
  initialLayer = null,
  buttonText = 'Save',
  initialStatus = 'none',
  onSave,
}: EditLayerProps) {
  const { setGoTo, setGoToOptions } = useContext(NavigationContext);
  const {
    edits,
    setEdits,
    layers,
    setLayers,
    selectedScenario,
    setSelectedScenario,
    setSketchLayer,
    map,
  } = useContext(SketchContext);

  const [
    saveStatus,
    setSaveStatus, //
  ] = useState<SaveStatusType>(initialStatus);

  const [layerName, setLayerName] = useState(
    initialLayer ? initialLayer.label : '',
  );

  // focus on the first input
  useEffect(() => {
    document.getElementById('layer-name-input')?.focus();
  }, []);

  // Saves the scenario name and description to the layer and edits objects.
  function handleSave() {
    if (!map) return;

    // find the layer being edited
    let index = -1;
    if (initialLayer) {
      index = layers.findIndex(
        (layer) => layer.layerId === initialLayer.layerId,
      );
    }

    // find the parent layer
    let parentLayer: __esri.GroupLayer | null = selectedScenario
      ? (map.layers.find(
          (layer) =>
            layer.type === 'group' && layer.id === selectedScenario.layerId,
        ) as __esri.GroupLayer)
      : null;

    // update an existing scenario, otherwise add the new scenario
    if (index > -1 && initialLayer) {
      const layerId = layers[index].layerId;

      // update the title of the layer on the map
      const mapLayer = layers.find((layer) => layer.layerId === layerId);
      if (mapLayer) mapLayer.sketchLayer.title = layerName;
      if (mapLayer?.pointsLayer) mapLayer.pointsLayer.title = layerName;
      if (mapLayer?.hybridLayer) mapLayer.hybridLayer.title = layerName;

      // update the active sketchLayer
      setSketchLayer((sketchLayer) => {
        if (!sketchLayer) return sketchLayer;
        return {
          ...sketchLayer,
          name: layerName,
          label: layerName,
        };
      });

      // update the list of layers, including setting the parentLayer
      setLayers((layers) => {
        return [
          ...layers.slice(0, index),
          {
            ...initialLayer,
            name: layerName,
            label: layerName,
            parentLayer: parentLayer,
          },
          ...layers.slice(index + 1),
        ];
      });

      // update the layer in edits and the decisionunit attribute for each graphic
      const sketchLayerGraphics =
        initialLayer.sketchLayer as __esri.GraphicsLayer;
      const graphics = sketchLayerGraphics.graphics;
      graphics.forEach((graphic) => {
        graphic.attributes.DECISIONUNIT = layerName;
      });
      const editsCopy = updateLayerEdits({
        appType,
        edits,
        scenario: selectedScenario,
        layer: { ...initialLayer, name: layerName, label: layerName },
        type: 'update',
        changes: graphics,
      });
      setEdits(editsCopy);
    } else {
      // create the layer
      const tempLayer = createSampleLayer(layerName, parentLayer);

      // add the new layer to layers
      setLayers((layers) => {
        return [...layers, tempLayer];
      });

      // add the new layer to edits
      const editsCopy = updateLayerEdits({
        appType,
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
        const tempGroupLayer = groupLayer as __esri.GroupLayer;
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
    }

    setSaveStatus('success');

    // call the onSave callback function
    if (onSave) onSave();
  }

  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault();
      }}
    >
      <p>
        Enter the name for a new empty{' '}
        {appType === 'decon' ? 'decon' : 'sample'} layer and click save or use
        the{' '}
        <button
          css={modLinkButtonStyles}
          onClick={(ev) => {
            setGoTo('addData');
            setGoToOptions({
              from: 'file',
              layerType: 'Samples',
            });
          }}
        >
          Add Data tools
        </button>{' '}
        to import an existing {appType === 'decon' ? 'decon' : 'sample'} layer.
      </p>
      <label htmlFor="layer-name-input">
        {appType === 'decon' ? 'Decon' : ''} Layer Name
      </label>
      <input
        id="layer-name-input"
        css={inputStyles}
        maxLength={250}
        placeholder={`Enter ${appType === 'decon' ? 'decon' : 'sample'} Layer Name`}
        value={layerName}
        onChange={(ev) => {
          setLayerName(ev.target.value);
          setSaveStatus('changes');
        }}
      />

      <div css={saveButtonContainerStyles}>
        <button
          css={saveButtonStyles(saveStatus)}
          type="submit"
          disabled={saveStatus === 'none' || saveStatus === 'success'}
          onClick={handleSave}
        >
          {(saveStatus === 'none' || saveStatus === 'changes') && buttonText}
          {saveStatus === 'success' && (
            <Fragment>
              <i className="fas fa-check" /> Saved
            </Fragment>
          )}
        </button>
      </div>
    </form>
  );
}

// --- components (EditCustomSampleTypesTable) ---
type EditCustomSampleTypesTableProps = {
  appType: AppType;
  initialStatus?: SaveStatusType;
  onSave?: (saveResults?: SaveResultsType) => void;
};

const fullWidthSelectStyles = css`
  width: 100%;
  margin-right: 10px;
`;

function EditCustomSampleTypesTable({
  appType,
  initialStatus = 'none',
  onSave,
}: EditCustomSampleTypesTableProps) {
  const {
    portal,
    signedIn, //
  } = useContext(AuthenticationContext);
  const {
    publishSampleTableMetaData,
    setPublishSampleTableMetaData,
    publishSamplesMode,
    sampleTableDescription,
    setSampleTableDescription,
    sampleTableName,
    setSampleTableName,
    selectedService,
    setSelectedService,
  } = useContext(PublishContext);

  const [
    saveStatus,
    setSaveStatus, //
  ] = useState<SaveResultsType>({ status: initialStatus });

  const [queryInitialized, setQueryInitialized] = useState(false);
  const [featureServices, setFeatureServices] = useState<FeatureServices>({
    status: 'fetching',
    data: [],
  });
  useEffect(() => {
    if (queryInitialized) return;

    setQueryInitialized(true);

    const tmpPortal = portal ? portal : new Portal();
    tmpPortal
      .queryItems({
        categories: [
          appType === 'decon'
            ? 'contains-epa-tods-user-defined-decon-tech'
            : 'contains-epa-tots-user-defined-sample-types',
        ],
        sortField: 'title',
        sortOrder: 'asc',
      })
      .then((res: __esri.PortalQueryResult) => {
        const data = res.results.map((item) => {
          return {
            url: item.url,
            description: item.description,
            label: item.title,
            value: item.id,
          };
        });
        setFeatureServices({ status: 'success', data });
      })
      .catch((err) => {
        console.error(err);
        setFeatureServices({ status: 'failure', data: [] });
      });
  }, [appType, portal, queryInitialized]);

  const handleSave = () => {
    setPublishSampleTableMetaData({
      value: '',
      label: sampleTableName,
      description: sampleTableDescription,
      url: '',
    });
    const saveStatus: SaveResultsType = { status: 'success' };
    setSaveStatus(saveStatus);
    if (onSave) onSave(saveStatus);
  };

  return (
    <Fragment>
      {publishSamplesMode === 'new' && (
        <Fragment>
          <label htmlFor="sample-table-name-input">
            Custom {appType === 'decon' ? 'Decon Technology' : 'Sample Type'}{' '}
            Table Name
          </label>
          <input
            id="sample-table-name-input"
            css={inputStyles}
            maxLength={250}
            placeholder={`Enter Custom ${appType === 'decon' ? 'Decon Technology' : 'Sample Type'} Table Name`}
            value={sampleTableName}
            onChange={(ev) => setSampleTableName(ev.target.value)}
          />
          <label htmlFor="scenario-description-input">
            Custom {appType === 'decon' ? 'Decon Technology' : 'Sample Type'}{' '}
            Table Description
          </label>
          <input
            id="scenario-description-input"
            css={inputStyles}
            maxLength={2048}
            placeholder={`Enter Custom ${appType === 'decon' ? 'Decon Technology' : 'Sample Type'} Table Description (2048 characters)`}
            value={sampleTableDescription}
            onChange={(ev) => setSampleTableDescription(ev.target.value)}
          />
        </Fragment>
      )}
      {publishSamplesMode === 'existing' && (
        <div>
          {featureServices.status === 'fetching' && <LoadingSpinner />}
          {featureServices.status === 'failure' && <p>Error!</p>}
          {featureServices.status === 'success' && (
            <Fragment>
              <label htmlFor="feature-service-select">
                Feature Service Select
              </label>
              <Select
                inputId="feature-service-select"
                css={fullWidthSelectStyles}
                value={selectedService}
                onChange={(ev) => setSelectedService(ev as SelectedService)}
                options={featureServices.data}
              />
            </Fragment>
          )}
        </div>
      )}

      {saveStatus.status === 'fetching' && <LoadingSpinner />}
      {saveStatus.status === 'failure' &&
        webServiceErrorMessage(saveStatus.error)}
      {saveStatus.status === 'name-not-available' &&
        scenarioNameTakenMessage(sampleTableName ? sampleTableName : '')}
      <div css={saveButtonContainerStyles}>
        <button
          css={saveButtonStyles(saveStatus.status)}
          onClick={() => {
            if (publishSamplesMode === 'existing' && selectedService) {
              setPublishSampleTableMetaData(selectedService);
            } else if (publishSamplesMode === 'new') {
              if (!portal || !signedIn) {
                handleSave();
                return;
              }

              setSaveStatus({ status: 'fetching' });

              // if the user is signed in, go ahead and check if the
              // service (scenario) name is availble before continuing
              isServiceNameAvailable(portal, sampleTableName)
                .then((res: any) => {
                  if (res.error) {
                    const saveStatus: SaveResultsType = {
                      status: 'failure',
                      error: {
                        error: createErrorObject(res),
                        message: res.error.message,
                      },
                    };
                    setSaveStatus(saveStatus);
                    if (onSave) onSave(saveStatus);
                    return;
                  }

                  if (!res.available) {
                    const saveStatus: SaveResultsType = {
                      status: 'name-not-available',
                    };
                    setSaveStatus(saveStatus);
                    if (onSave) onSave(saveStatus);
                    return;
                  }

                  handleSave();
                })
                .catch((err: any) => {
                  console.error('isServiceNameAvailable error', err);
                  const saveStatus: SaveResultsType = {
                    status: 'failure',
                    error: {
                      error: createErrorObject(err),
                      message: err.message,
                    },
                  };
                  setSaveStatus(saveStatus);
                  if (onSave) onSave(saveStatus);

                  window.logErrorToGa(err);
                });
            }
          }}
          disabled={
            (publishSamplesMode === 'new' &&
              JSON.stringify(publishSampleTableMetaData) ===
                JSON.stringify({
                  value: '',
                  label: sampleTableName,
                  description: sampleTableDescription,
                  url: '',
                })) ||
            (publishSamplesMode === 'existing' &&
              JSON.stringify(publishSampleTableMetaData) ===
                JSON.stringify(selectedService))
          }
        >
          {(saveStatus.status === 'none' ||
            saveStatus.status === 'changes' ||
            saveStatus.status === 'fetching') &&
            'Save'}
          {saveStatus.status === 'success' && (
            <Fragment>
              <i className="fas fa-check" /> Saved
            </Fragment>
          )}
          {(saveStatus.status === 'failure' ||
            saveStatus.status === 'fetch-failure' ||
            saveStatus.status === 'name-not-available') && (
            <Fragment>
              <i className="fas fa-exclamation-triangle" /> Error
            </Fragment>
          )}
        </button>
      </div>
    </Fragment>
  );
}

export { EditLayer, EditCustomSampleTypesTable, EditScenario };
