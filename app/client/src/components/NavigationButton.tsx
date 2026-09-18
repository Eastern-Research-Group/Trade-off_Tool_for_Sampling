/** @jsxImportSource @emotion/react */

import React, { Fragment, useContext, useState } from 'react';
import { css } from '@emotion/react';
// components
import MessageBox from 'components/MessageBox';
// contexts
import { NavigationContext } from 'contexts/Navigation';
import { SketchContext } from 'contexts/Sketch';
// types
import {
  adminPanels,
  deconPanels,
  isAdmin,
  isDecon,
  PanelValueType,
  samplingPanels,
} from 'config/navigation';

// --- styles (NavigationButton) ---
const containerStyles = css`
  display: flex;
  gap: 6px;
  justify-content: flex-end;
  margin-top: 10px;
`;

// --- components (NavigationButton) ---
type Props = {
  currentPanel: PanelValueType;
  includeSkipToPublish?: boolean;
};

function NavigationButton({
  currentPanel,
  includeSkipToPublish = false,
}: Props) {
  const { setGoTo, simulationMode } = useContext(NavigationContext);
  const { layers } = useContext(SketchContext);
  const [contaminationValidationError, setContaminationValidationError] =
    useState(false);

  const panelConfig = (
    isAdmin() ? adminPanels : isDecon() ? deconPanels : samplingPanels
  ).filter(
    (p) =>
      !simulationMode ||
      (simulationMode && !['configureOutput', 'publish'].includes(p.value)),
  );
  const currentIndex = panelConfig.findIndex(
    (panel) => panel.value === currentPanel,
  );
  const nextPanel = panelConfig[currentIndex + 1]?.value;

  if (!nextPanel) return null;

  function handleNext() {
    if (isAdmin() && currentPanel === 'additionalTools') {
      const contaminationGraphics: __esri.Graphic[] = [];
      layers.forEach((layer) => {
        if (layer.layerType !== 'Contamination Map') return;
        if (layer.sketchLayer?.type !== 'graphics') return;
        layer.sketchLayer.graphics.forEach((graphic) => {
          contaminationGraphics.push(graphic);
        });
      });

      const hasInvalidActivity =
        contaminationGraphics.length === 0 ||
        contaminationGraphics.some(
          (graphic) =>
            !Number.isFinite(Number(graphic.attributes?.CONTAMVAL)) ||
            Number(graphic.attributes?.CONTAMVAL) <= 0,
        );

      if (hasInvalidActivity) {
        setContaminationValidationError(true);
        return;
      }
    }

    setContaminationValidationError(false);
    setGoTo(nextPanel);
  }

  return (
    <Fragment>
      {contaminationValidationError && (
        <MessageBox
          severity="error"
          title="Activity Required"
          message="Every contamination map area must have an activity greater than 0 before continuing."
        />
      )}
      <div css={containerStyles}>
        {includeSkipToPublish && !simulationMode && (
          <button onClick={(_ev) => setGoTo('publish')}>Skip to Publish</button>
        )}
        <button onClick={handleNext}>Next</button>
      </div>
    </Fragment>
  );
}

export default NavigationButton;
