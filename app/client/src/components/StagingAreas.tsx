/** @jsxImportSource @emotion/react */

import { useContext, useEffect } from 'react';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import ImageryLayer from '@arcgis/core/layers/ImageryLayer.js';
import PopupTemplate from '@arcgis/core/PopupTemplate.js';
// components
import AoiSketchButton from 'components/AoiSketchButton';
import Switch from 'components/Switch';
// contexts
import { useLookupFiles } from 'contexts/LookupFiles';
import { SketchContext } from 'contexts/Sketch';
// types
import { LayerType } from 'types/Layer';
// utils
import {
  calculateArea,
  generateUUID,
  getDefaultSamplingMaskLayer,
} from 'utils/sketchUtils';

const SUITABILITY_LAYER_ID = generateUUID();
const STAGING_AOI_LAYER_NAME = 'Sketched Staging AOI';

// --- components ---

function StagingAreas() {
  const { setSuitabilityLayerVisible, suitabilityLayerVisible } =
    useContext(SketchContext);

  useSuitabilityLayer();

  const stagingAoiLayer = useStagingAoiLayer();

  const sketchLayer = stagingAoiLayer?.sketchLayer;

  return (
    <div>
      <label className="display-flex flex-align-center flex-justify margin-0">
        <strong>Display Staging Suitability Layer</strong>
        <Switch
          ariaLabel="Display Staging Suitability Layer"
          checked={suitabilityLayerVisible}
          onChange={setSuitabilityLayerVisible}
        />
      </label>
      <AoiSketchButton className="margin-top-1" sketchLayer={sketchLayer} />
      <CalculationResults />
    </div>
  );
}

function CalculationResults() {
  const stagingAoiLayer = useStagingAoiLayer();

  const { totalArea, totalSolidWasteCapacity, totalLiquidWasteCapacity } =
    useAoiCalculations(stagingAoiLayer);

  const formatNumber = (value: number) =>
    value.toLocaleString('en-US', { maximumFractionDigits: 2 });

  // TODO: Format this nicely.
  return (
    <section>
      <p>Area: {formatNumber(totalArea)} m²</p>
      <p>Solid Waste Capacity: {formatNumber(totalSolidWasteCapacity)} m³</p>
      <p>Liquid Waste Capacity: {formatNumber(totalLiquidWasteCapacity)} m³</p>
    </section>
  );
}

// --- custom hooks ---

function useAoiCalculations(aoiLayer?: LayerType) {
  const { aoiSketchLayer, aoiSketchVM, sceneViewForArea } =
    useContext(SketchContext);

  const targetLayer = aoiLayer ?? aoiSketchLayer;
  const sketchLayer =
    targetLayer?.sketchLayer instanceof GraphicsLayer
      ? targetLayer.sketchLayer
      : null;

  const calculateSolidWasteCapacity = (areaSqM: number) => {
    return (areaSqM * 0.4) / 0.3284;
  };
  const calculateLiquidWasteCapacity = (areaSqM: number) => {
    return (areaSqM * 0.4) / 0.0020975 / 1000;
  };
  const sumValues = (key: string) => {
    return (sketchLayer?.graphics ?? []).reduce((total, graphic) => {
      return total + (graphic.attributes[key] ?? 0);
    }, 0);
  };

  // Add a calculations to the graphics in the sketch layer when they are created, and configure the graphic's popup.
  useEffect(() => {
    if (!aoiSketchVM) return;

    const handle = aoiSketchVM.on('create', async ({ graphic, state }) => {
      if (state !== 'complete') return;
      if (aoiSketchVM.layer !== sketchLayer) return;

      const areaSqM = await calculateArea(
        graphic,
        sceneViewForArea,
        'sqmeters',
      );

      if (typeof areaSqM === 'number') {
        graphic.attributes = {
          ...graphic.attributes,
          AREA: areaSqM,
          SOLID_WASTE_CAPACITY: calculateSolidWasteCapacity(areaSqM),
          LIQUID_WASTE_CAPACITY: calculateLiquidWasteCapacity(areaSqM),
        };
      }

      const numberFormat = { digitSeparator: true, places: 2 };
      graphic.popupTemplate = new PopupTemplate({
        title: 'Area of Interest',
        content: [
          {
            type: 'fields',
            fieldInfos: [
              { fieldName: 'AREA', label: 'Area (m²)' },
              {
                fieldName: 'SOLID_WASTE_CAPACITY',
                label: 'Solid Waste Capacity (m³)',
              },
              {
                fieldName: 'LIQUID_WASTE_CAPACITY',
                label: 'Liquid Waste Capacity (m³)',
              },
            ].map((fieldInfo) => ({ ...fieldInfo, format: numberFormat })),
          },
        ],
      });
    });

    return function cleanup() {
      handle.remove();
    };
  }, [aoiSketchVM, sceneViewForArea, sketchLayer]);

  return {
    totalArea: sumValues('AREA'),
    totalSolidWasteCapacity: sumValues('SOLID_WASTE_CAPACITY'),
    totalLiquidWasteCapacity: sumValues('LIQUID_WASTE_CAPACITY'),
  };
}

function useStagingAoiLayer() {
  const { map, layers, layersInitialized, setLayers } =
    useContext(SketchContext);

  const stagingAoiLayer = layers.find(
    (layer) => layer.name === STAGING_AOI_LAYER_NAME,
  );

  useEffect(() => {
    if (!map || !layersInitialized) return;
    if (stagingAoiLayer) return;

    const newStagingAoiLayer = getDefaultSamplingMaskLayer(
      STAGING_AOI_LAYER_NAME,
    );
    const sketchLayer = newStagingAoiLayer.sketchLayer;
    if (sketchLayer) map.add(sketchLayer);

    // add the layer to the map
    setLayers((layers) => [...layers, newStagingAoiLayer]);
  }, [layersInitialized, map, setLayers, stagingAoiLayer]);

  return stagingAoiLayer;
}

function useSuitabilityLayer() {
  const { services } = useLookupFiles().data;
  const { map, setReferenceLayers, suitabilityLayerVisible } =
    useContext(SketchContext);

  const suitabilityLayer = (() => {
    if (!map) return;
    return (
      map.findLayerById(SUITABILITY_LAYER_ID) ??
      new ImageryLayer({
        bandIds: [0, 1, 2],
        format: 'jpgpng',
        id: SUITABILITY_LAYER_ID,
        listMode: 'show',
        mosaicRule: { ascending: true, method: 'northwest', operation: 'sum' },
        // TODO: Add a colormap to the suitability layer.
        /*rasterFunction: {
          functionName: 'Colormap',
          functionArguments: {
            Colormap: [
              [0, 255, 0, 0],
              [1, 255, 128, 0],
              [2, 255, 255, 0],
              [3, 141, 211, 0],
              [4, 56, 168, 0],
            ],
            Raster: {
              rasterFunctionArguments: {
                InputRanges: [
                  0, 100.0001, 100.0001, 200.0001, 200.0001, 300.0001, 300.0001,
                  400.0001, 400.0001, 500.0001,
                ],
                OutputValues: [0, 1, 2, 3, 4],
                NoDataRanges: [],
              },
              rasterFunction: 'Remap',
              variableName: 'Raster',
            },
          },
        },*/
        url: services.suitability,
      })
    );
  })();

  if (suitabilityLayer) {
    if (map && !map.allLayers.includes(suitabilityLayer)) {
      map.add(suitabilityLayer);
    }
    if (suitabilityLayer.visible !== suitabilityLayerVisible) {
      suitabilityLayer.visible = suitabilityLayerVisible;
    }
  }

  // Add the suitability layer to the list of reference layers.
  useEffect(() => {
    // TODO: See if this is necessary. It significantly increases the size of the indexDB.
    /*setReferenceLayers((prev) => {
      if (prev.includes(suitabilityLayer)) {
        return prev;
      } else {
        return [...prev, suitabilityLayer];
      }
    });*/
  }, [setReferenceLayers, suitabilityLayer]);

  // Hide the suitability layer when the component unmounts.
  useEffect(() => {
    return function cleanup() {
      if (suitabilityLayer) suitabilityLayer.visible = false;
    };
  }, [suitabilityLayer]);

  return suitabilityLayer;
}

export default StagingAreas;
