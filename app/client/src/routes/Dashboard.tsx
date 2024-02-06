/** @jsxImportSource @emotion/react */

import React, { useContext, useEffect, useRef, useState } from 'react';
import { css } from '@emotion/react';
import { useWindowSize } from '@reach/window-size';
// components
import Toolbar from 'components/Toolbar';
import TestingToolbar from 'components/TestingToolbar';
import Map from 'components/Map';
// contexts
import { DialogContext } from 'contexts/Dialog';
import { NavigationContext } from 'contexts/Navigation';
import { SketchContext } from 'contexts/Sketch';
// utilities
import { useSessionStorage } from 'utils/hooks';
// config
import { navPanelWidth } from 'config/appConfig';

const appStyles = (offset: number) => css`
  display: flex;
  flex-direction: column;
  height: calc(100vh - ${offset}px);
  min-height: 675px;
  width: 100%;
`;

const containerStyles = css`
  height: 100%;
  position: relative;
`;

const mapPanelStyles = (tableHeight: number) => css`
  float: right;
  position: relative;
  height: calc(100% - ${tableHeight}px);
  width: calc(100% - ${navPanelWidth});
`;

const mapHeightStyles = css`
  height: 100%;
`;

function Dashboard() {
  const { tablePanelExpanded, tablePanelHeight } =
    useContext(NavigationContext);
  const { layers, selectedScenario } = useContext(SketchContext);
  useSessionStorage();

  const { height, width } = useWindowSize();

  // calculate height of div holding actions info
  const [contentHeight, setContentHeight] = useState(0);
  const [toolbarHeight, setToolbarHeight] = useState(0);

  // calculate height of div holding actions info
  const toolbarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!toolbarRef?.current) return;

    const barHeight = toolbarRef.current.getBoundingClientRect().height;
    if (toolbarHeight !== barHeight) setToolbarHeight(barHeight);
  }, [width, height, toolbarRef, toolbarHeight]);

  const [
    sizeCheckInitialized,
    setSizeCheckInitialized, //
  ] = useState(false);
  const { setOptions } = useContext(DialogContext);
  useEffect(() => {
    if (sizeCheckInitialized) return;

    if (width < 1024 || height < 600) {
      setOptions({
        title: '',
        ariaLabel: 'Small Screen Warning',
        description:
          'This site contains data uploading and map editing features best used in a desktop web browser.',
      });
    }

    setSizeCheckInitialized(true);
  }, [width, height, sizeCheckInitialized, setOptions]);

  const totsRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (!totsRef?.current) return;

    const offsetTop = totsRef.current.offsetTop;
    const clientHeight = totsRef.current.clientHeight;
    if (contentHeight !== clientHeight) setContentHeight(clientHeight);
    if (offset !== offsetTop) setOffset(offsetTop);
  }, [contentHeight, height, offset, totsRef, width]);

  // count the number of samples
  const sampleData: any[] = [];
  layers.forEach((layer) => {
    if (!layer.sketchLayer || layer.sketchLayer.type === 'feature') return;
    if (layer?.parentLayer?.id !== selectedScenario?.layerId) return;
    if (layer.layerType === 'Samples' || layer.layerType === 'VSP') {
      const graphics = layer.sketchLayer.graphics.toArray();
      graphics.sort((a, b) =>
        a.attributes.PERMANENT_IDENTIFIER.localeCompare(
          b.attributes.PERMANENT_IDENTIFIER,
        ),
      );
      graphics.forEach((sample) => {
        sampleData.push({
          graphic: sample,
          ...sample.attributes,
        });
      });
    }
  });

  return (
    <div className="tots" ref={totsRef}>
      <div css={appStyles(offset)}>
        <div css={containerStyles}>
          <div ref={toolbarRef}>
            {window.location.search.includes('devMode=true') && (
              <TestingToolbar />
            )}
            <Toolbar isDashboard={true} />
          </div>
          <div
            css={mapPanelStyles(
              toolbarHeight + (tablePanelExpanded ? tablePanelHeight : 0),
            )}
          >
            <div id="tots-map-div" css={mapHeightStyles}>
              {toolbarHeight && (
                <Map
                  height={
                    contentHeight -
                    (tablePanelExpanded ? tablePanelHeight : 0) -
                    toolbarHeight
                  }
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
