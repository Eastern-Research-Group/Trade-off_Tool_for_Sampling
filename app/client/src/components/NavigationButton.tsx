/** @jsxImportSource @emotion/react */

import React, { useContext } from 'react';
import { css } from '@emotion/react';
// contexts
import { NavigationContext } from 'contexts/Navigation';
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
  return (
    <div css={containerStyles}>
      {includeSkipToPublish && !simulationMode && (
        <button onClick={(_ev) => setGoTo('publish')}>Skip to Publish</button>
      )}
      <button onClick={(_ev) => setGoTo(nextPanel)}>Next</button>
    </div>
  );
}

export default NavigationButton;
