/** @jsxImportSource @emotion/react */

import React, { useContext } from 'react';
import { css } from '@emotion/react';
// contexts
import { NavigationContext } from 'contexts/Navigation';
// types
import {
  deconPanels,
  isDecon,
  PanelValueType,
  samplingPanels,
} from 'config/navigation';
import { AppType } from 'types/Navigation';

// --- styles (NavigationButton) ---
const containerStyles = css`
  justify-content: flex-end;
`;

const nextButtonStyles = css`
  float: right;
  margin-top: 10px;
`;

// --- components (NavigationButton) ---
type Props = {
  currentPanel: PanelValueType;
};

function NavigationButton({ currentPanel }: Props) {
  const { setGoTo } = useContext(NavigationContext);

  const panelConfig = isDecon() ? deconPanels : samplingPanels;
  const currentIndex = panelConfig.findIndex(
    (panel) => panel.value === currentPanel,
  );
  const nextPanel = panelConfig[currentIndex + 1]?.value;

  if (!nextPanel) return null;
  return (
    <div css={containerStyles}>
      <button
        css={nextButtonStyles}
        onClick={(ev) => {
          setGoTo(nextPanel);
        }}
      >
        Next
      </button>
    </div>
  );
}

export default NavigationButton;
