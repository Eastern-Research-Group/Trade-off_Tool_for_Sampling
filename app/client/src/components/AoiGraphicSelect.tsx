/** @jsxImportSource @emotion/react */

import { Dispatch, ReactNode, SetStateAction, useState } from 'react';
import Graphic from '@arcgis/core/Graphic';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import { css } from '@emotion/react';
// components
import Select from 'components/Select';
// utils
import { generateUUID } from 'utils/sketchUtils';

// --- styles ---
const layerSelectStyles = css`
  margin-bottom: 10px;
`;

// --- types ---

type Option = {
  value: string;
  label: string;
};

// --- utils ---
function isOption(o: unknown): o is Option {
  return typeof o === 'object' && o !== null && 'value' in o && 'label' in o;
}

// --- components ---

type Props = {
  addGraphicVisible: boolean;
  editGraphicVisible: boolean;
  extraLabelContent?: ReactNode;
  graphicsLayer: GraphicsLayer;
  label?: string;
  selectedGraphic: Graphic | null;
  setSelectedGraphic: Dispatch<SetStateAction<Graphic | null>>;
};

function AoiGraphicSelect({
  addGraphicVisible,
  editGraphicVisible,
  extraLabelContent,
  graphicsLayer,
  label = 'Active AOI',
  selectedGraphic,
  setSelectedGraphic,
}: Props) {
  const [containerId] = useState(
    `aoi-graphic-select-container-${generateUUID()}`,
  );
  const [inputId] = useState(`aoi-graphic-select-input-${generateUUID()}`);

  const graphics = graphicsLayer.graphics.toArray();

  const optionFromGraphic = (graphic: Graphic | null, i = 0) => {
    if (!graphic) {
      return null;
    }
    return {
      value: graphic.attributes.PERMANENT_IDENTIFIER,
      label: graphic.attributes.name ?? `AOI ${i + 1}`,
    };
  };

  const onChange = (ev: unknown) => {
    if (!isOption(ev)) {
      setSelectedGraphic(null);
      return;
    }
    setSelectedGraphic(
      graphics.find((g) => g.attributes.PERMANENT_IDENTIFIER === ev.value) ??
        null,
    );
  };

  const options = graphics.map(optionFromGraphic);

  return (
    <div>
      <div className="display-flex flex-justify">
        <div className="display-flex flex-align-center">
          <label htmlFor={inputId}>{label}</label>
        </div>
        {extraLabelContent}
      </div>
      <Select
        id={containerId}
        inputId={inputId}
        css={layerSelectStyles}
        isDisabled={addGraphicVisible || editGraphicVisible}
        options={options}
        value={optionFromGraphic(selectedGraphic)}
        onChange={onChange}
      />
    </div>
  );
}

export default AoiGraphicSelect;
