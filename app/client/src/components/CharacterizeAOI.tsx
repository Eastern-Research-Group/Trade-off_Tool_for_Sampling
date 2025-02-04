/** @jsxImportSource @emotion/react */

import React, { Fragment, useContext, useEffect, useState } from 'react';
import { css } from '@emotion/react';
// components
import { AccordionList, AccordionItem } from 'components/Accordion';
import InfoIcon from 'components/InfoIcon';
import Select from 'components/Select';
// contexts
import { CalculateContext } from 'contexts/Calculate';
import { NavigationContext } from 'contexts/Navigation';
import { PlanGraphics, SketchContext } from 'contexts/Sketch';
// utils
import {
  activateSketchButton,
  calculateArea,
  createScenarioDeconLayer,
  getDefaultSamplingMaskLayer,
  getScenariosDecon,
  updateLayerEdits,
} from 'utils/sketchUtils';
// types
import {
  ScenarioDeconEditsType,
  LayerEditsType,
  EditsType,
  LayerAoiAnalysisEditsType,
  LayerDeconEditsType,
} from 'types/Edits';
import { LayerType } from 'types/Layer';
import { ErrorType } from 'types/Misc';
import { AppType } from 'types/Navigation';
// styles
import { colors, infoIconStyles, reactSelectStyles } from 'styles';
import { webServiceErrorMessage } from 'config/errorMessages';
import { fetchPost, fetchPostFile } from 'utils/fetchUtils';
import { fetchBuildingData, GsgParam, processScenario } from 'utils/hooks';
import { convertBase64ToFile } from 'utils/utils';
import { useLookupFiles } from 'contexts/LookupFiles';

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

const helpText = `
  Select "Draw Area of Interest" to draw a boundary on your map to<br/>
  designate a decontamination zone or decision unit. The tool will<br/>
  retrieve and analyze building data and ground surface characteristics<br/>
  to inform decontamination strategy decisions. Click Submit to<br/>
  automatically generate a summary of contamination scenarios that are<br/>
  present within the designated AOI.
`;

// --- styles (Calculate) ---
const addButtonStyles = css`
  margin: 0;
  height: 38px; /* same height as ReactSelect */
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

const layerButtonContainerStyles = css`
  display: flex;
  flex-direction: column;
  justify-content: flex-end;

  div {
    display: flex;
    justify-content: flex-end;
  }
`;

const layerSelectStyles = css`
  margin-bottom: 10px;
`;

const radioLabelStyles = css`
  padding-left: 0.375rem;
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

const sketchAoiButtonStyles = css`
  background-color: white;
  color: black;
  margin-bottom: 0.5rem;

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
  display: flex;
  justify-content: flex-end;

  button {
    margin-top: 10px;
  }
`;

const verticalCenterTextStyles = css`
  display: flex;
  align-items: center;
`;

// --- components (CharacterizeAOI) ---
type Props = {
  appType: AppType;
  label?: string;
  showHelpText?: boolean;
  showOnEdit?: boolean;
};

function CharacterizeAOI({
  appType,
  label = 'Active AOI Layer',
  showHelpText = true,
  showOnEdit = false,
}: Props) {
  const { calculateResultsDecon, setCalculateResultsDecon } =
    useContext(CalculateContext);
  const { setGoTo, setGoToOptions } = useContext(NavigationContext);
  const {
    aoiCharacterizationData,
    aoiSketchLayer,
    aoiSketchVM,
    deconOperation,
    deconSketchLayer,
    defaultDeconSelections,
    displayDimensions,
    edits,
    gsgFiles,
    layers,
    layersInitialized,
    map,
    mapView,
    sceneView,
    sceneViewForArea,
    selectedScenario,
    setAoiCharacterizationData,
    setAoiSketchLayer,
    setDeconSketchLayer,
    setEdits,
    setGsgFiles,
    setLayers,
    setSelectedScenario,
    sketchVM,
  } = useContext(SketchContext);
  const { services } = useLookupFiles().data;

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

  const [lastAoiSketchLayer, setLastAoiSketchLayer] =
    useState<__esri.GraphicsLayer | null>(null);
  useEffect(() => {
    if (!aoiSketchVM) return;

    const scenario: ScenarioDeconEditsType | undefined = edits.edits.find(
      (item) => item.type === 'scenario-decon',
    );
    if (!scenario) return;

    const deconLayer = edits.edits.find(
      (l) =>
        scenario.linkedLayerIds.includes(l.layerId) &&
        l.type === 'layer-aoi-analysis',
    ) as LayerAoiAnalysisEditsType;
    if (!deconLayer) return;

    const aoiEditsLayer = deconLayer.layers.find(
      (l) => l.layerType === 'Decon Mask',
    );
    const sketchLayer = layers.find(
      (l) =>
        l.layerType === 'Decon Mask' && l.layerId === aoiEditsLayer?.layerId,
    );
    if (
      sketchLayer &&
      sketchLayer?.sketchLayer?.id !== aoiSketchVM?.layer?.id
    ) {
      setLastAoiSketchLayer(aoiSketchVM.layer);
      aoiSketchVM.layer = sketchLayer.sketchLayer as __esri.GraphicsLayer;
    }

    return function cleanup() {
      if (lastAoiSketchLayer) aoiSketchVM.layer = lastAoiSketchLayer;
    };
  }, [aoiSketchVM, edits, lastAoiSketchLayer, layers]);

  // Handle a user clicking the sketch AOI button. If an AOI is not selected from the
  // dropdown this will create an AOI layer. This also sets the sketchVM to use the
  // selected AOI and triggers a React useEffect to allow the user to sketch on the map.
  function sketchAoiButtonClick() {
    if (!map || !aoiSketchVM || !sceneView || !mapView || !deconSketchLayer)
      return;

    const aoiEditsLayer = deconSketchLayer.layers.find(
      (l) => l.layerType === 'Decon Mask',
    );
    const sketchLayer = layers.find(
      (l) =>
        l.layerType === 'Decon Mask' && l.layerId === aoiEditsLayer?.layerId,
    );

    if (sketchLayer)
      aoiSketchVM.layer = sketchLayer.sketchLayer as __esri.GraphicsLayer;

    // save changes from other sketchVM and disable to prevent
    // interference
    if (sketchVM) sketchVM[displayDimensions].cancel();

    // make the style of the button active
    const wasSet = activateSketchButton('decon-mask');

    if (wasSet) {
      // let the user draw/place the shape
      aoiSketchVM.create('polygon');
    } else {
      aoiSketchVM.cancel();
    }
  }

  async function assessAoi() {
    if (!deconSketchLayer || !deconSketchLayer.aoiLayerMode) return;

    // const planGraphics: AoiGraphics = {};
    let aoiLayer: LayerType | undefined = undefined;

    // locate the layer
    if (deconSketchLayer.aoiLayerMode === 'draw') {
      const aoiEditsLayer = deconSketchLayer.layers.find(
        (l) => l.layerType === 'Decon Mask',
      );
      aoiLayer = layers.find(
        (l) =>
          l.layerType === 'Decon Mask' && l.layerId === aoiEditsLayer?.layerId,
      );
    }

    if (
      deconSketchLayer.aoiLayerMode === 'file' &&
      deconSketchLayer.importedAoiLayer
    ) {
      // locate the layer
      aoiLayer = layers.find(
        (l) =>
          l.layerType === 'Area of Interest' &&
          l.layerId === deconSketchLayer.importedAoiLayer?.layerId,
      );
    }

    const aoiGraphics: __esri.Graphic[] = [];
    if (aoiLayer?.sketchLayer && aoiLayer.sketchLayer.type === 'graphics') {
      aoiGraphics.push(...aoiLayer.sketchLayer.graphics.toArray());
    }

    if (aoiGraphics.length === 0 || !deconSketchLayer) return;

    setAoiCharacterizationData({
      status: 'fetching',
      planGraphics: {},
    });

    const responseIndexes: string[] = [];
    const planGraphics: PlanGraphics = {};
    let planAoiArea = 0;
    for (const graphic of aoiGraphics) {
      const areaSM = await calculateArea(graphic, sceneViewForArea);
      if (typeof areaSM === 'number') {
        planAoiArea += areaSM;
        graphic.attributes.AREA = areaSM;
      }

      responseIndexes.push(deconSketchLayer.layerId);
    }

    if (
      !Object.prototype.hasOwnProperty.call(
        planGraphics,
        deconSketchLayer.layerId,
      )
    ) {
      planGraphics[deconSketchLayer.layerId] = {
        graphics: [],
        imageGraphics: [],
        aoiArea: planAoiArea,
        buildingFootprint: 0,
        summary: {
          totalAoiSqM: planAoiArea,
          totalBuildingFootprintSqM: 0,
          totalBuildingFloorsSqM: 0,
          totalBuildingSqM: 0,
          totalBuildingExtWallsSqM: 0,
          totalBuildingIntWallsSqM: 0,
          totalBuildingRoofSqM: 0,
        },
        aoiPercentages: {
          numAois: 0,
          asphalt: 0,
          concrete: 0,
          soil: 0,
        },
      };
    } else {
      planGraphics[deconSketchLayer.layerId].aoiArea = planAoiArea;
      planGraphics[deconSketchLayer.layerId].summary.totalAoiSqM = planAoiArea;
    }

    try {
      let gsgParam: GsgParam | undefined;
      if (gsgFiles && gsgFiles.selectedIndex !== null) {
        const file = gsgFiles.files[gsgFiles.selectedIndex];
        const gsgFile = await convertBase64ToFile(file.file, file.path);
        const gsgFileUploaded: any = await fetchPostFile(
          `${services.shippTestGPServer}/uploads/upload`,
          {
            f: 'json',
          },
          gsgFile,
        );
        gsgParam = {
          itemID: gsgFileUploaded.item.itemID,
        };
      }

      // TODO - look into adding more queries here
      await fetchBuildingData(
        aoiGraphics,
        services,
        planGraphics,
        responseIndexes,
        gsgParam,
        sceneViewForArea,
        true,
      );

      if (gsgParam) {
        await fetchPost(
          `${services.shippTestGPServer}/uploads/${gsgParam.itemID}/delete`,
          {
            f: 'json',
          },
        );
      }

      let editsCopy: EditsType = edits;
      const newDeconTechSelections = processScenario(
        deconSketchLayer,
        {
          status: 'success',
          planGraphics,
        },
        {},
        {},
        defaultDeconSelections,
      );

      // Figure out what to add graphics to
      const aoiAssessed = deconSketchLayer.layers.find(
        (l) => l.layerType === 'AOI Assessed',
      );
      const imageAnalysis = deconSketchLayer.layers.find(
        (l: any) => l.layerType === 'Image Analysis',
      );
      const deconAoi = deconSketchLayer.layers.find(
        (l: any) => l.layerType === 'Decon Mask',
      );

      if (aoiAssessed && imageAnalysis && deconAoi) {
        const aoiAssessedLayer = layers.find(
          (l) => l.layerId === aoiAssessed.layerId,
        );
        const imageAnalysisLayer = layers.find(
          (l: any) => l.layerId === imageAnalysis.layerId,
        );
        const deconAoiLayer = layers.find(
          (l: any) => l.layerId === deconAoi.layerId,
        );

        // tie graphics and imageryGraphics to a scenario
        const planData = planGraphics[deconSketchLayer.layerId];
        if (
          aoiAssessedLayer?.sketchLayer?.type === 'graphics' &&
          planData?.graphics
        ) {
          aoiAssessedLayer.sketchLayer.graphics.removeAll();
          aoiAssessedLayer.sketchLayer.graphics.addMany(planData.graphics);

          editsCopy = updateLayerEdits({
            appType: 'decon',
            edits: editsCopy,
            layer: aoiAssessedLayer,
            type: 'replace',
            changes: planData.graphics,
          });
        }
        if (
          imageAnalysisLayer?.sketchLayer?.type === 'graphics' &&
          planData?.imageGraphics
        ) {
          imageAnalysisLayer?.sketchLayer.graphics.removeAll();
          imageAnalysisLayer?.sketchLayer.graphics.addMany(
            planData.imageGraphics,
          );

          editsCopy = updateLayerEdits({
            appType: 'decon',
            edits: editsCopy,
            layer: imageAnalysisLayer,
            type: 'replace',
            changes: planData.imageGraphics,
          });
        }
        if (deconAoiLayer) {
          if (deconAoiLayer.sketchLayer)
            deconAoiLayer.sketchLayer.visible = false;
          editsCopy = updateLayerEdits({
            appType: 'decon',
            edits: editsCopy,
            layer: deconAoiLayer,
            type: 'properties',
          });
        }

        const aoiAnalysis = editsCopy.edits.find(
          (e) =>
            e.type === 'layer-aoi-analysis' &&
            e.layerId === deconSketchLayer.layerId,
        ) as LayerAoiAnalysisEditsType | undefined;
        if (aoiAnalysis) {
          aoiAnalysis.aoiPercentages = {
            asphalt: planData.aoiPercentages.asphalt,
            concrete: planData.aoiPercentages.concrete,
            numAois: planData.aoiPercentages.numAois,
            soil: planData.aoiPercentages.soil,
          };
          aoiAnalysis.aoiSummary = {
            totalAoiSqM: planData.summary.totalAoiSqM,
            totalBuildingExtWallsSqM: planData.summary.totalBuildingExtWallsSqM,
            totalBuildingFloorsSqM: planData.summary.totalBuildingFloorsSqM,
            totalBuildingFootprintSqM:
              planData.summary.totalBuildingFootprintSqM,
            totalBuildingIntWallsSqM: planData.summary.totalBuildingIntWallsSqM,
            totalBuildingRoofSqM: planData.summary.totalBuildingRoofSqM,
            totalBuildingSqM: planData.summary.totalBuildingSqM,
            areaByMedia: newDeconTechSelections.map((media: any) => {
              return {
                id: media.id,
                media: media.media,
                pctAoi: media.pctAoi,
                surfaceArea: media.surfaceArea,
              };
            }),
          };

          editsCopy.edits.forEach((edit) => {
            if (
              edit.type !== 'layer-decon' ||
              edit.analysisLayerId !== aoiAnalysis?.layerId
            )
              return;

            edit.deconTechSelections = edit.deconTechSelections.map((tech) => {
              const media = newDeconTechSelections.find(
                (a) => a.media === tech.media,
              );

              let pctAoi = tech.pctAoi;
              let surfaceArea = tech.surfaceArea;
              if (media) {
                pctAoi = media.pctAoi;
                surfaceArea = media.surfaceArea;
              }

              return {
                ...tech,
                pctAoi,
                surfaceArea,
              };
            });
          });
        }
      }

      setEdits(editsCopy);

      setAoiCharacterizationData({
        status: 'success',
        planGraphics,
      });

      if (selectedScenario?.type === 'scenario-decon') {
        setCalculateResultsDecon((calculateResultsDecon) => {
          return {
            status: 'fetching',
            panelOpen: calculateResultsDecon.panelOpen,
            data: null,
          };
        });
      }
    } catch (ex: any) {
      console.error(ex);
      setAoiCharacterizationData({
        status: 'failure',
        planGraphics: {},
      });
    }

    setAddScenarioVisible(false);
    setEditScenarioVisible(false);
  }

  const [generateRandomMode, setGenerateRandomMode] = useState<
    'draw' | 'file' | ''
  >('draw');
  const [selectedAoiFile, setSelectedAoiFile] = useState<LayerType | null>(
    null,
  );
  const [selectedGsgFile, setSelectedGsgFile] = useState<any | null>(null);

  // get gsg file options
  const [gsgFileOptions] = useState(
    gsgFiles.files.map((file, index) => ({
      label: file.name,
      value: index,
      file,
    })),
  );

  // initialize the selected gsg file
  useEffect(() => {
    if (gsgFiles.selectedIndex === null) return;
    setSelectedGsgFile(gsgFileOptions[gsgFiles.selectedIndex]);
  }, [gsgFileOptions, gsgFiles]);

  // useEffect(() => {
  //   if (!selectedScenario || selectedScenario.type !== 'scenario-decon' || selectedScenario.linkedLayerIds.length > 0) {
  //     setSelectedAoiFile(null);
  //     setGenerateRandomMode('draw');
  //     return;
  //   }

  //   if (
  //     selectedScenario.type !== 'scenario-decon' ||
  //     !selectedScenario?.layers[0]?.importedAoiLayer
  //   )
  //     return;

  //   // find the layer
  //   const layer = layers.find(
  //     (l) => l.layerId === selectedScenario.layers[0].importedAoiLayer?.layerId,
  //   );
  //   if (layer) setSelectedAoiFile(layer);
  // }, [layers, selectedScenario]);

  const [addScenarioVisible, setAddScenarioVisible] = useState(false);
  const [editScenarioVisible, setEditScenarioVisible] = useState(false);

  // get decon layers for showing in select
  const [deconLayers, setDeconLayers] = useState<LayerAoiAnalysisEditsType[]>(
    [],
  );
  const [initializedLayers, setInitializedLayers] = useState(false);
  useEffect(() => {
    if (!layersInitialized) return;

    const newDeconLayers: LayerAoiAnalysisEditsType[] = [];
    edits.edits.forEach((edit) => {
      if (edit.type === 'layer-aoi-analysis')
        newDeconLayers.push(edit as LayerAoiAnalysisEditsType);
    });
    setDeconLayers(newDeconLayers);
    setInitializedLayers(true);
  }, [edits, layersInitialized]);

  const [initializedDeconLayer, setInitializedDeconLayer] = useState(false);
  useEffect(() => {
    if (
      deconSketchLayer ||
      initializedDeconLayer ||
      !initializedLayers ||
      !layersInitialized ||
      !map
    )
      return;

    setInitializedDeconLayer(true);

    if (deconLayers.length > 0) {
      setDeconSketchLayer(deconLayers[0]);
    } else {
      const {
        layers: newLayers,
        groupLayer,
        layerDecon,
        layerAoiAnalysis,
        sketchLayer,
        tempDeconLayer,
        tempAssessedAoiLayer,
        tempImageAnalysisLayer,
        tempCharacterizeAoiLayer,
      } = createScenarioDeconLayer(defaultDeconSelections);

      // make a copy of the edits context variable
      setEdits((edits) => {
        const newEdits = edits.edits.filter((edit) => {
          const idx = newLayers.findIndex((l) => l.layerId === edit.layerId);

          return idx === -1;
        });

        return {
          count: edits.count + 1,
          edits: [...newEdits, layerAoiAnalysis, layerDecon],
        };
      });

      setDeconSketchLayer(layerAoiAnalysis);

      const tLayers = [...layers];
      if (tempCharacterizeAoiLayer) tLayers.push(tempCharacterizeAoiLayer);
      if (sketchLayer) tLayers.push(sketchLayer);
      if (tempImageAnalysisLayer) tLayers.push(tempImageAnalysisLayer);
      if (tempAssessedAoiLayer) tLayers.push(tempAssessedAoiLayer);
      if (tempDeconLayer) tLayers.push(tempDeconLayer);

      // update layers (set parent layer)
      window.totsLayers = tLayers;
      setLayers(tLayers);

      // add the scenario group layer to the map
      map.add(groupLayer);
    }
  }, [
    deconLayers,
    deconSketchLayer,
    defaultDeconSelections,
    initializedDeconLayer,
    initializedLayers,
    layers,
    layersInitialized,
    map,
    setDeconSketchLayer,
    setEdits,
    setLayers,
  ]);

  const [newDeconLayerName, setNewDeconLayerName] = useState('');
  const [saveStatus, setSaveStatus] = useState<SaveStatusType>('none');

  // Saves the scenario name and description to the layer and edits objects.
  function handleSave() {
    if (!map) return;

    const layer = layers.find((l) => l.layerId === deconSketchLayer?.layerId);
    if (deconSketchLayer && layer && editScenarioVisible) {
      // update title on layer
      if (layer.sketchLayer) layer.sketchLayer.title = newDeconLayerName;

      // update selected decon layer
      setDeconSketchLayer((layer) => {
        if (!layer) return null;
        return {
          ...layer,
          name: newDeconLayerName,
          label: newDeconLayerName,
        };
      });

      setDeconLayers((deconLayers) => {
        return deconLayers.map((layer) => {
          if (layer.layerId === deconSketchLayer.layerId) {
            return {
              ...layer,
              name: newDeconLayerName,
              label: newDeconLayerName,
            };
          }
          return layer;
        });
      });

      // update the layer in edits and the decisionunit attribute for each graphic
      const editsCopy = updateLayerEdits({
        appType,
        edits,
        layer: { ...layer, name: newDeconLayerName, label: newDeconLayerName },
        type: 'update',
      });
      setEdits(editsCopy);
    } else {
      const {
        layers: newLayers,
        groupLayer,
        layerAoiAnalysis,
        sketchLayer,
        tempAssessedAoiLayer,
        tempImageAnalysisLayer,
        tempCharacterizeAoiLayer,
      } = createScenarioDeconLayer(defaultDeconSelections, newDeconLayerName);

      // make a copy of the edits context variable
      setEdits((edits) => {
        const newEdits = edits.edits.filter((edit) => {
          const idx = newLayers.findIndex((l) => l.layerId === edit.layerId);

          return idx === -1;
        });

        const selectedOp = edits.edits.find(
          (edit) =>
            edit.type === 'layer-decon' &&
            edit.layerId === deconOperation?.layerId,
        ) as LayerDeconEditsType | undefined;
        if (selectedOp) {
          selectedOp.analysisLayerId = layerAoiAnalysis.layerId;
          selectedOp.deconTechSelections = selectedOp.deconTechSelections.map(
            (tech) => {
              return {
                ...tech,
                pctAoi: 0,
                surfaceArea: 0,
              };
            },
          );
        }

        return {
          count: edits.count + 1,
          edits: [...newEdits, layerAoiAnalysis],
        };
      });

      setDeconSketchLayer(layerAoiAnalysis);

      const tLayers = [...layers];
      if (tempCharacterizeAoiLayer) tLayers.push(tempCharacterizeAoiLayer);
      if (sketchLayer) tLayers.push(sketchLayer);
      if (tempImageAnalysisLayer) tLayers.push(tempImageAnalysisLayer);
      if (tempAssessedAoiLayer) tLayers.push(tempAssessedAoiLayer);

      // update layers (set parent layer)
      window.totsLayers = tLayers;
      setLayers(tLayers);

      setCalculateResultsDecon((calculateResultsDecon) => {
        return {
          status: 'fetching',
          panelOpen: calculateResultsDecon.panelOpen,
          data: null,
        };
      });

      // add the scenario group layer to the map
      map.add(groupLayer);
    }

    setAddScenarioVisible(false);
    setEditScenarioVisible(false);
    setSaveStatus('success');
  }

  useEffect(() => {
    setNewDeconLayerName(deconSketchLayer?.name ?? '');
  }, [deconSketchLayer]);

  return (
    <Fragment>
      {showHelpText && <p>{helpText.replaceAll('<br/>', '')}</p>}

      <div>
        <div css={iconButtonContainerStyles}>
          <div css={verticalCenterTextStyles}>
            <label htmlFor="scenario-select-input">{label}</label>
          </div>
          <div css={layerButtonContainerStyles}>
            <div>
              {deconSketchLayer && (
                <Fragment>
                  <button
                    css={iconButtonStyles}
                    title="Delete Layer"
                    onClick={() => {
                      if (!deconSketchLayer) return;

                      const idsToDelete: string[] = [deconSketchLayer.layerId];
                      deconSketchLayer.layers.forEach((l) => {
                        idsToDelete.push(l.layerId);
                      });

                      const newDeconLayers = deconLayers.filter(
                        (layer) => !idsToDelete.includes(layer.layerId),
                      );
                      setDeconLayers(newDeconLayers);
                      setDeconSketchLayer(
                        newDeconLayers.length > 0 ? newDeconLayers[0] : null,
                      );

                      // remove all of the child layers
                      setLayers((layers) => {
                        return layers.filter(
                          (layer) => !idsToDelete.includes(layer.layerId),
                        );
                      });

                      // remove the scenario from edits
                      const newEdits: EditsType = {
                        count: edits.count + 1,
                        edits: edits.edits.filter(
                          (item) => item.layerId !== deconSketchLayer.layerId,
                        ),
                      };

                      edits.edits.forEach((edit) => {
                        if (edit.type !== 'layer-decon') return;
                        if (!idsToDelete.includes(edit.analysisLayerId)) return;

                        edit.analysisLayerId = '';
                        edit.deconTechSelections = edit.deconTechSelections.map(
                          (tech) => {
                            return {
                              ...tech,
                              pctAoi: 0,
                              surfaceArea: 0,
                            };
                          },
                        );
                      });

                      setEdits(newEdits);

                      // select the next available scenario
                      const scenarios = getScenariosDecon(newEdits);
                      setSelectedScenario(
                        scenarios.length > 0 ? scenarios[0] : null,
                      );

                      setCalculateResultsDecon((calculateResultsDecon) => {
                        return {
                          status: 'fetching',
                          panelOpen: calculateResultsDecon.panelOpen,
                          data: null,
                        };
                      });

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
                        (layer) => layer.id === deconSketchLayer.layerId,
                      );
                      map.remove(mapLayer);
                    }}
                  >
                    <i className="fas fa-trash-alt" />
                    <span className="sr-only">Delete Layer</span>
                  </button>

                  {deconSketchLayer.status !== 'published' && (
                    <button
                      css={iconButtonStyles}
                      title={editScenarioVisible ? 'Cancel' : 'Edit Layer'}
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
                      <span className="sr-only">
                        {editScenarioVisible ? 'Cancel' : 'Edit Layer'}
                      </span>
                    </button>
                  )}
                </Fragment>
              )}
              <button
                css={iconButtonStyles}
                title={addScenarioVisible ? 'Cancel' : 'Add Layer'}
                onClick={() => {
                  setEditScenarioVisible(false);
                  if (!addScenarioVisible) setNewDeconLayerName('');
                  setAddScenarioVisible(!addScenarioVisible);
                }}
              >
                <i
                  className={
                    addScenarioVisible ? 'fas fa-times' : 'fas fa-plus'
                  }
                />
                <span className="sr-only">
                  {addScenarioVisible ? 'Cancel' : 'Add Layer'}
                </span>
              </button>
            </div>
          </div>
        </div>
        <Select
          id="characterize-aoi-select-input-container"
          inputId="characterize-aoi-select-input"
          css={layerSelectStyles}
          isDisabled={addScenarioVisible || editScenarioVisible}
          options={deconLayers}
          value={deconSketchLayer}
          onChange={(ev) => {
            const newLayer = ev as LayerAoiAnalysisEditsType;
            setDeconSketchLayer(newLayer);

            setEdits((edits) => {
              return {
                count: edits.count + 1,
                edits: edits.edits.map((edit) => {
                  if (
                    edit.type === 'layer-decon' &&
                    edit.layerId === deconOperation?.layerId
                  ) {
                    return {
                      ...edit,
                      analysisLayerId: newLayer.layerId,
                      deconTechSelections: edit.deconTechSelections.map(
                        (tech) => {
                          const media = newLayer.aoiSummary.areaByMedia.find(
                            (a) => a.media === tech.media,
                          );

                          const pctAoi = media?.pctAoi ?? 0;
                          const surfaceArea = media?.surfaceArea ?? 0;

                          return {
                            ...tech,
                            pctAoi,
                            surfaceArea,
                          };
                        },
                      ),
                    };
                  }

                  return edit;
                }),
              };
            });

            setCalculateResultsDecon((calculateResultsDecon) => {
              return {
                status: 'fetching',
                panelOpen: calculateResultsDecon.panelOpen,
                data: null,
              };
            });
          }}
        />
      </div>

      {(addScenarioVisible || editScenarioVisible) && (
        <div>
          <label>
            <span>Decon Layer Name</span>
            <input
              type="text"
              css={inputStyles}
              maxLength={250}
              placeholder="Enter decon Layer Name"
              value={newDeconLayerName}
              onChange={(ev) => {
                setNewDeconLayerName(ev.target.value);
                setSaveStatus('changes');
              }}
            />
          </label>

          <div css={saveButtonContainerStyles}>
            <button
              css={saveButtonStyles(saveStatus)}
              type="submit"
              disabled={
                saveStatus === 'none' ||
                saveStatus === 'success' ||
                !newDeconLayerName ||
                newDeconLayerName === deconSketchLayer?.name
              }
              onClick={handleSave}
            >
              {(saveStatus === 'none' || saveStatus === 'changes') && 'Save'}
              {saveStatus === 'success' && (
                <Fragment>
                  <i className="fas fa-check" /> Saved
                </Fragment>
              )}
            </button>
          </div>
        </div>
      )}

      {(!showOnEdit ||
        (showOnEdit && (addScenarioVisible || editScenarioVisible))) && (
        <Fragment>
          {showOnEdit && (
            <div
              css={css`
                margin-top: 0.5rem;
              `}
            >
              <strong>Characterize Area of Interest</strong>
              <InfoIcon
                cssStyles={infoIconStyles}
                id="characterize-aoi-help-icon"
                tooltip={helpText}
                place="right"
              />
            </div>
          )}

          <div style={{ display: 'none' }}>
            <input
              id="draw-aoi"
              type="radio"
              name="mode"
              value="Draw area of Interest"
              disabled={calculateResultsDecon.status === 'fetching'}
              checked={generateRandomMode === 'draw'}
              onChange={(_ev) => {
                if (!deconSketchLayer) return;
                setGenerateRandomMode('draw');

                const aoiLayer = deconSketchLayer.layers.find(
                  (l) => l.layerType === 'Decon Mask',
                );
                if (!aoiLayer) return;

                const maskLayer = layers.find(
                  (layer) =>
                    layer.layerType === 'Decon Mask' &&
                    layer.layerId === aoiLayer?.layerId,
                );
                if (maskLayer) setAoiSketchLayer(maskLayer);

                setEdits((edits) => {
                  const index = edits.edits.findIndex(
                    (item) =>
                      item.type === 'layer-aoi-analysis' &&
                      item.layerId === deconSketchLayer.layerId,
                  );
                  const editedAoiAnalysis = edits.edits[
                    index
                  ] as LayerAoiAnalysisEditsType;

                  editedAoiAnalysis.aoiLayerMode = 'draw';

                  return {
                    count: edits.count + 1,
                    edits: [
                      ...edits.edits.slice(0, index),
                      editedAoiAnalysis,
                      ...edits.edits.slice(index + 1),
                    ],
                  };
                });
              }}
            />
            <label htmlFor="draw-aoi" css={radioLabelStyles}>
              Draw Sampling Mask
            </label>
          </div>

          {generateRandomMode === 'draw' && (
            <button
              id="decon-mask"
              title="Draw Decon Mask"
              className="sketch-button"
              disabled={calculateResultsDecon.status === 'fetching'}
              onClick={() => {
                if (!aoiSketchLayer) return;

                sketchAoiButtonClick();
              }}
              css={sketchAoiButtonStyles}
            >
              <span css={sketchAoiTextStyles}>
                <i className="fas fa-draw-polygon" />{' '}
                <span>Draw Area of Interest</span>
              </span>
            </button>
          )}

          <div style={{ display: 'none' }}>
            <input
              id="use-aoi-file"
              type="radio"
              name="mode"
              value="Use Imported Area of Interest"
              disabled={calculateResultsDecon.status === 'fetching'}
              checked={generateRandomMode === 'file'}
              onChange={(_ev) => {
                if (!deconSketchLayer) return;

                setGenerateRandomMode('file');
                setAoiSketchLayer(null);

                let aoiLayer: LayerType | null = null;
                if (!selectedAoiFile) {
                  const aoiLayers = layers.filter(
                    (layer) => layer.layerType === 'Area of Interest',
                  );
                  aoiLayer = aoiLayers[0];
                  setSelectedAoiFile(aoiLayer);
                }

                setEdits((edits) => {
                  const index = edits.edits.findIndex(
                    (item) =>
                      item.type === 'layer-aoi-analysis' &&
                      item.layerId === deconSketchLayer.layerId,
                  );
                  const editedAoiAnalysis = edits.edits[
                    index
                  ] as LayerAoiAnalysisEditsType;

                  const importedAoi = edits.edits.find(
                    (l) =>
                      aoiLayer &&
                      l.type === 'layer' &&
                      l.layerType === 'Area of Interest' &&
                      l.layerId === aoiLayer.layerId,
                  );

                  if (importedAoi)
                    editedAoiAnalysis.importedAoiLayer =
                      importedAoi as LayerEditsType;

                  editedAoiAnalysis.aoiLayerMode = 'file';

                  return {
                    count: edits.count + 1,
                    edits: [
                      ...edits.edits.slice(0, index),
                      editedAoiAnalysis,
                      ...edits.edits.slice(index + 1),
                    ],
                  };
                });
              }}
            />
            <label htmlFor="use-aoi-file" css={radioLabelStyles}>
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
                  onChange={(ev) => {
                    setSelectedAoiFile(ev as LayerType);

                    if (!deconSketchLayer) return;
                    setEdits((edits) => {
                      const index = edits.edits.findIndex(
                        (item) =>
                          item.type === 'layer-aoi-analysis' &&
                          item.layerId === deconSketchLayer.layerId,
                      );
                      const editedAoiAnalysis = edits.edits[
                        index
                      ] as LayerAoiAnalysisEditsType;

                      const importedAoi = edits.edits.find(
                        (l) =>
                          l.type === 'layer' &&
                          l.layerType === 'Area of Interest' &&
                          l.layerId === (ev as LayerType).layerId,
                      );

                      if (importedAoi)
                        editedAoiAnalysis.importedAoiLayer =
                          importedAoi as LayerEditsType;
                      return {
                        count: edits.count + 1,
                        edits: [
                          ...edits.edits.slice(0, index),
                          editedAoiAnalysis,
                          ...edits.edits.slice(index + 1),
                        ],
                      };
                    });
                  }}
                  options={layers.filter(
                    (layer) => layer.layerType === 'Area of Interest',
                  )}
                />
                <button
                  css={addButtonStyles}
                  disabled={calculateResultsDecon.status === 'fetching'}
                  onClick={(_ev) => {
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

          <AccordionList>
            <AccordionItem title="Advanced Options">
              <label htmlFor="gsg-file-select-input">
                GSG File (optional)
                <InfoIcon
                  id={'gsg-file-info-icon'}
                  cssStyles={infoIconStyles}
                  tooltip="Ground Sampled Group (gsg) is a file format used for machine<br/>learning workflows. TODS will use this file for performing<br/>imagery analysis. This file isn't required but providing one<br/>can help the accuracy of the imagery analysis results."
                />
              </label>
              <div css={inlineMenuStyles}>
                <Select
                  id="gsg-file-select"
                  inputId="gsg-file-select-input"
                  css={inlineSelectStyles}
                  styles={reactSelectStyles as any}
                  isClearable={true}
                  value={selectedGsgFile}
                  onChange={(ev) => {
                    setSelectedGsgFile(ev);

                    setGsgFiles((gsg) => {
                      return {
                        ...gsg,
                        selectedIndex: (ev as any)?.value ?? null,
                      };
                    });
                  }}
                  options={gsgFileOptions}
                />
                <button
                  css={addButtonStyles}
                  disabled={calculateResultsDecon.status === 'fetching'}
                  onClick={(_ev) => {
                    setGoTo('addData');
                    setGoToOptions({
                      from: 'file',
                      layerType: 'GSG',
                    });
                  }}
                >
                  Add
                </button>
              </div>
            </AccordionItem>
          </AccordionList>

          {generateRandomMode && (
            <Fragment>
              {calculateResultsDecon.status === 'failure' &&
                webServiceErrorMessage(calculateResultsDecon.error)}
              <div css={submitButtonStyles}>
                <button
                  disabled={calculateResultsDecon.status === 'fetching'}
                  onClick={assessAoi}
                >
                  {aoiCharacterizationData.status !== 'fetching' && 'Submit'}
                  {aoiCharacterizationData.status === 'fetching' && (
                    <Fragment>
                      <i className="fas fa-spinner fa-pulse" />
                      &nbsp;&nbsp;Loading...
                    </Fragment>
                  )}
                </button>
              </div>
            </Fragment>
          )}
        </Fragment>
      )}
    </Fragment>
  );
}

export default CharacterizeAOI;
