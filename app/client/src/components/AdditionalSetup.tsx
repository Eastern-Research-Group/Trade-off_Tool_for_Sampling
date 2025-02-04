/** @jsxImportSource @emotion/react */

import { css } from '@emotion/react';
// components
import { AccordionList, AccordionItem } from 'components/Accordion';
import CharacterizeAOI from 'components/CharacterizeAOI';
import CustomSampleType from 'components/CustomSampleType';
import NavigationButton from 'components/NavigationButton';
// types
import { ErrorType } from 'types/Misc';
import { AppType } from 'types/Navigation';
// styles
import { isDecon } from 'styles';

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
        </div>

        <AccordionList>
          <AccordionItem
            title={'Characterize Area of Interest'}
            initiallyExpanded={isDecon()}
          >
            <div css={sectionContainer}>
              <CharacterizeAOI appType={appType} />
            </div>
          </AccordionItem>
          {appType === 'sampling' && (
            <AccordionItem title="Create Custom Sample Types">
              <div css={sectionContainer}>
                <CustomSampleType
                  appType="sampling"
                  id="plan-custom-sample-types"
                />
              </div>
            </AccordionItem>
          )}
        </AccordionList>
      </div>

      <div css={sectionContainer}>
        <NavigationButton currentPanel="setup" />
      </div>
    </div>
  );
}

export default AdditionalSetup;
