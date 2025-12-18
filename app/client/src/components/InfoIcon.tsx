/** @jsxImportSource @emotion/react */

import React, { Fragment } from 'react';
import { Tooltip } from 'react-tooltip';
import IconInfoCircle from '~icons/fa7-solid/info-circle';

type Props = {
  id: string;
  tooltip: string;
  cssStyles?: any;
  place?: 'top' | 'right' | 'bottom' | 'left';
};

function InfoIcon({ id, tooltip, cssStyles, place = 'right' }: Props) {
  return (
    <Fragment>
      <Tooltip
        id={id}
        place={place}
        positionStrategy="fixed"
        style={{ zIndex: 101 }}
        variant="info"
      />
      <IconInfoCircle
        css={cssStyles}
        data-tooltip-id={id}
        data-tooltip-html={tooltip}
      />
    </Fragment>
  );
}

export default InfoIcon;
