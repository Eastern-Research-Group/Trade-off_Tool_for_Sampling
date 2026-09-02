/** @jsxImportSource @emotion/react */

import React, { Fragment, ReactNode } from 'react';
import { css } from '@emotion/react';
import IconExclamationCircle from '~icons/fa7-solid/exclamation-circle';
import IconExclamationTriangle from '~icons/fa7-solid/exclamation-triangle';
import IconInfoCircle from '~icons/fa7-solid/info-circle';
import IconLightbulb from '~icons/fa7-solid/lightbulb';

// --- components (MessageBox) ---
const baseContainerStyles = css`
  display: flex;
  align-items: center;
  color: black;
  padding: 5px;
  margin: 5px 0;
`;

const errorContainerStyles = css`
  ${baseContainerStyles}
  background-color: #f3e3db;
  border-left: 5px solid #d23c18;
`;

const warningContainerStyles = css`
  ${baseContainerStyles}
  background-color: #faf3d1;
  border-left: 5px solid #ffbe2e;
`;

const infoContainerStyles = css`
  ${baseContainerStyles}
  background-color: #e8f6f8;
  border-left: 5px solid #21badf;
`;

const iconContainerStyles = css`
  font-size: 25px;
  margin-right: 5px;
`;

const textContainerStyles = css`
  /* width is container width - icon width - some padding */
  width: calc(100% - 25px - 5px);
`;

const messageTextStyles = css`
  font-size: 12px;
`;

// --- components (MessageBox) ---
type Props = {
  title: string;
  message: string | ReactNode;
  severity: 'error' | 'warning' | 'info' | 'training';
};

function MessageBox({ title, message, severity }: Props) {
  let container;
  let Icon;
  if (severity === 'error') {
    container = errorContainerStyles;
    Icon = IconExclamationCircle;
  }
  if (severity === 'warning') {
    container = warningContainerStyles;
    Icon = IconExclamationTriangle;
  }
  if (severity === 'info') {
    container = infoContainerStyles;
    Icon = IconInfoCircle;
  }
  if (severity === 'training') {
    container = infoContainerStyles;
    Icon = IconLightbulb;
  }

  return (
    <div css={container}>
      <div css={iconContainerStyles}>
        <Icon />
      </div>
      <div css={textContainerStyles}>
        {title && (
          <Fragment>
            <strong>{title}</strong>
            <br />
          </Fragment>
        )}
        <span css={messageTextStyles}>{message}</span>
      </div>
    </div>
  );
}

export default MessageBox;
