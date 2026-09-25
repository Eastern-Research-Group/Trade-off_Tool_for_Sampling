/** @jsxImportSource @emotion/react */

import { useEffect, useState } from 'react';
import { css } from '@emotion/react';

const buttonSharedStyles = css`
  margin: 8.5px;
  font-size: 15px;
  text-align: center;
  vertical-align: middle;
`;

const buttonStyle = css`
  ${buttonSharedStyles}
  background-color: white;
  color: #6e6e6e;
`;

const buttonActiveStyle = css`
  ${buttonSharedStyles}
  background-color: #999696;
  color: black;
`;

const buttonHoverStyle = css`
  ${buttonSharedStyles}
  background-color: #f0f0f0;
  color: black;
  cursor: pointer;
`;

const divSharedStyles = css`
  height: 32px;
  width: 32px;
`;

const divStyle = css`
  ${divSharedStyles}
  background-color: white;
`;

const divActiveStyle = css`
  ${divSharedStyles}
  background-color: #999696;
  color: black;

  &:focus {
    outline: none;
  }
`;

const divHoverStyle = css`
  ${divSharedStyles}
  background-color: #f0f0f0;
  cursor: pointer;
`;

const measurementContainerStyles = css`
  display: flex;
  gap: 5px;
`;

type CustomWidgetButtonProps = {
  active: boolean;
  iconClass: string;
  onClick: Function;
  title: string;
};

function CustomWidgetButton({
  active,
  iconClass,
  onClick,
  title,
}: CustomWidgetButtonProps) {
  const [hover, setHover] = useState(false);

  return (
    <div
      title={title}
      css={active ? divActiveStyle : hover ? divHoverStyle : divStyle}
      onMouseOver={() => setHover(true)}
      onMouseOut={() => setHover(false)}
      onClick={() => onClick()}
      onKeyDown={() => onClick()}
      role="button"
      tabIndex={0}
    >
      <span
        aria-hidden="true"
        className={iconClass}
        css={
          active ? buttonActiveStyle : hover ? buttonHoverStyle : buttonStyle
        }
      />
    </div>
  );
}

// --- components (MeasurementButtons) ---
type Props = {
  displayDimensions: '2d' | '3d';
  measurementWidget: HTMLArcgisMeasurementElement | null;
};

function MeasurementButtons({ displayDimensions, measurementWidget }: Props) {
  const [activeTool, setActiveTool] = useState<'area' | 'distance' | null>(
    null,
  );

  // The component reserves space even with nothing to show, hide it when inactive.
  useEffect(() => {
    if (!measurementWidget) return;

    measurementWidget.style.display = activeTool ? '' : 'none';
  }, [activeTool, measurementWidget]);

  if (!measurementWidget) return null;

  return (
    <div css={measurementContainerStyles}>
      <CustomWidgetButton
        active={activeTool === 'distance'}
        iconClass="esri-icon esri-icon-measure-line"
        title="Distance Measurement Tool"
        onClick={() => {
          setActiveTool('distance');

          measurementWidget.activeTool =
            displayDimensions === '2d' ? 'distance' : 'direct-line';
        }}
      />
      <CustomWidgetButton
        active={activeTool === 'area'}
        iconClass="esri-icon esri-icon-measure-area"
        title="Area Measurement Tool"
        onClick={() => {
          setActiveTool('area');
          measurementWidget.activeTool = 'area';
        }}
      />
      <CustomWidgetButton
        active={false}
        iconClass="esri-icon esri-icon-close"
        title="Clear Measurements"
        onClick={() => {
          setActiveTool(null);
          measurementWidget.clear();
        }}
      />
    </div>
  );
}

export default MeasurementButtons;
