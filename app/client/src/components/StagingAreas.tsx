/** @jsxImportSource @emotion/react */

import { useContext, useEffect } from 'react';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
// components
import AoiSketchButton from 'components/AoiSketchButton';
import Switch from 'components/Switch';
// contexts
import { useLookupFiles } from 'contexts/LookupFiles';
import { SketchContext } from 'contexts/Sketch';
// utils
import { generateUUID } from 'utils/sketchUtils';

const SUITABILITY_LAYER_ID = generateUUID();

// --- components ---

function StagingAreas() {
  const { suitabilityLayerVisible, setSuitabilityLayerVisible } =
    useContext(SketchContext);

  useSuitabilityLayer();

  return (
    <div>
      <label className="display-flex flex-align-center flex-justify margin-0">
        <strong>Display Staging Suitability Layer</strong>
        <Switch
          checked={suitabilityLayerVisible}
          onChange={setSuitabilityLayerVisible}
        />
      </label>
      <AoiSketchButton className="margin-top-1" />
    </div>
  );
}

// --- custom hooks ---

function useSuitabilityLayer() {
  const { services } = useLookupFiles().data;
  const { map, setReferenceLayers, suitabilityLayerVisible } =
    useContext(SketchContext);

  const suitabilityLayer = (() => {
    if (!map) return;
    return (
      map.findLayerById(SUITABILITY_LAYER_ID) ??
      new FeatureLayer({
        id: SUITABILITY_LAYER_ID,
        title: 'Staging Suitability',
        visible: true,
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
