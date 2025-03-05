/** @jsxImportSource @emotion/react */

import PopupTemplate from '@arcgis/core/PopupTemplate';
// types
import { LayerType } from 'types/Layer';
// utils
import { calculateArea } from 'utils/sketchUtils';

function AoiSuitabilityCalculations() {
  const stagingAoiLayer = useStagingAoiLayer();

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
  // Add a calculations to the graphics in the sketch layer when they are created, and configure the graphic's popup.
  useEffect(() => {
    if (!aoiSketchVM) return;

    const handle = aoiSketchVM.on('create', async ({ graphic, state }) => {
      if (state !== 'complete') return;
      if (aoiSketchVM.layer !== sketchLayer) return;
      console.log(graphic.toJSON()); // XXX

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
}

export default AoiSuitabilityCalculations;
