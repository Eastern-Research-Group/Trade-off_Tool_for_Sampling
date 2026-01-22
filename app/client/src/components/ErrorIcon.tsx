/** @jsxImportSource @emotion/react */

import React, { Fragment } from 'react';
import { css } from '@emotion/react';
import { Tooltip } from 'react-tooltip';

const containerStyles = css`
  display: flex;
  align-items: center;
  gap: 5px;
`;

type Props = {
  id: string;
  text?: string;
  tooltip: string;
  cssStyles?: any;
  place?: 'top' | 'right' | 'bottom' | 'left';
};

function ErrorIcon({ id, text, tooltip, cssStyles, place = 'right' }: Props) {
  return (
    <Fragment>
      <Tooltip
        id={id}
        place={place}
        positionStrategy="fixed"
        style={{ zIndex: 101 }}
        variant="info"
      />
      <div
        css={containerStyles}
        data-tooltip-id={id}
        data-tooltip-html={tooltip}
      >
        <svg
          css={cssStyles}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 40 40"
          width="25px"
          height="25px"
          data-tooltip-id={id}
          data-tooltip-html={tooltip}
        >
          <path
            d="M20 4c0.919 0 1.763 0.506 2.2 1.312l13.5 25c0.419 0.775 0.4 1.713-0.05 2.469S34.381 34 33.5 34H6.5c-0.881 0-1.7-0.463-2.15-1.219s-0.469-1.694-0.05-2.469l13.5-25c0.437-0.805 1.281-1.312 2.2-1.312z"
            fill="#d23c18"
            stroke="#000000"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path
            d="M 20 12.5 c -1.138 0 -2.044 0.969 -1.963 2.106 l 0.463 6.5 c 0.056 0.781 0.713 1.394 1.494 1.394 c 0.788 0 1.437 -0.606 1.494 -1.394 l 0.463 -6.5 c 0.081 -1.138 -0.819 -2.106 -1.963 -2.106 z"
            fill="#000000"
          />
          <path
            d="M 20 26.125 c -1.106 0 -2 0.894 -2 2 s 0.894 2 2 2 s 2 -0.894 2 -2 s -0.894 -2 -2 -2 z"
            fill="#000000"
          />
        </svg>
        {text && <span>{text}</span>}
      </div>
    </Fragment>
  );
}

export default ErrorIcon;
