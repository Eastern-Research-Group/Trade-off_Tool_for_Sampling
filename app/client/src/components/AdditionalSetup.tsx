/** @jsxImportSource @emotion/react */

import React, { useContext, useEffect, useState } from 'react';
import { css } from '@emotion/react';
// components
import { AccordionList, AccordionItem } from 'components/Accordion';
import MessageBox from 'components/MessageBox';
import NavigationButton from 'components/NavigationButton';
// types
import { ErrorType } from 'types/Misc';
import { AppType } from 'types/Navigation';

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

// --- styles (Calculate) ---
const panelContainer = css`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 100%;
  padding: 20px 0;
`;

const sectionContainer = css`
  margin-bottom: 10px;
  padding: 0 20px;
`;

// --- components (AdditionalSetup) ---
type Props = {
  appType: AppType;
};

function AdditionalSetup({ appType }: Props) {
  return (
    <div css={panelContainer}>
      <div>
        <div css={sectionContainer}>
          <h2>Additional Setup</h2>
          <p>Placeholder text...</p>
          <MessageBox
            severity="warning"
            title="Feature Not Yet Available"
            message="This feature is not available yet."
          />
        </div>

        <AccordionList>
          <AccordionItem
            title={'Characterize Area of Interest'}
            initiallyExpanded={true}
          >
            <div css={sectionContainer}>
              <p>Placeholder...</p>
            </div>
          </AccordionItem>
          {appType === 'sampling' && (
            <AccordionItem title="Create Custom Sample Types">
              <div css={sectionContainer}>
                <p>Placeholder...</p>
              </div>
            </AccordionItem>
          )}
        </AccordionList>
      </div>

      <div css={sectionContainer}>
        <NavigationButton
          goToPanel={appType === 'decon' ? 'decon' : 'locateSamples'}
        />
      </div>
    </div>
  );
}

export default AdditionalSetup;
