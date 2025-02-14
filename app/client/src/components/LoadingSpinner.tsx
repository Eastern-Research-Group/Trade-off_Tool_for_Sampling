/** @jsxImportSource @emotion/react */

import { css, keyframes } from '@emotion/react';
// styles
import { colors } from 'styles';

const rotate = keyframes`
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
`;

const dash = keyframes`
  0% {
    stroke-dashoffset: 150;
    transform: rotate(0deg);
  }
  50% {
   stroke-dashoffset: 50;
   transform: rotate(300deg);
  }
  100% {
   stroke-dashoffset: 150;
   transform: rotate(720deg);
  }
`;

const color = keyframes`
  0% {
    stroke: ${colors.blue()};
  }
  25% {
    stroke: ${colors.gold()};
  }
  50% {
    stroke: ${colors.teal()};
  }
  75% {
    stroke: ${colors.magenta()};
  }
  100% {
    stroke: ${colors.blue()};
  }
`;

const svgStyles = css`
  display: block;
  margin: 1rem auto;
  animation: ${rotate} 5s linear infinite;
`;

const circleStyles = css`
  fill: none;
  stroke-width: 5;
  stroke-linecap: round;
  stroke-dasharray: 150;
  stroke-dashoffset: 0;
  transform-origin: center;
  animation:
    ${dash} 1.25s ease-in-out infinite,
    ${color} 5s ease-in-out infinite;
`;

// --- components ---
function LoadingSpinner(props: React.HTMLAttributes<SVGSVGElement>) {
  return (
    <svg
      data-testid="tots-loading-spinner"
      css={svgStyles}
      width="50"
      height="50"
      viewBox="0 0 50 50"
      {...props}
    >
      <circle css={circleStyles} cx="25" cy="25" r="20" />
    </svg>
  );
}

export default LoadingSpinner;
