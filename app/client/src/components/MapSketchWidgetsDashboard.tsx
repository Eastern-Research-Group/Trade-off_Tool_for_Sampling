/** @jsxImportSource @emotion/react */

import {
  Dispatch,
  SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import Point from '@arcgis/core/geometry/Point';
import PopupTemplate from '@arcgis/core/PopupTemplate';
import SketchViewModel from '@arcgis/core/widgets/Sketch/SketchViewModel';
// contexts
import { AuthenticationContext } from 'contexts/Authentication';
import { NavigationContext } from 'contexts/Navigation';
import { SketchContext } from 'contexts/Sketch';
// types
import { LayerType, LayerTypeName } from 'types/Layer';
import { PolygonSymbol } from 'config/sampleAttributes';
// utils
import { useDynamicPopup, useGeometryTools } from 'utils/hooks';
import {
  deactivateButtons,
  deepCopyObject,
  generateUUID,
  getCurrentDateTime,
  getPointSymbol,
  setZValues,
} from 'utils/sketchUtils';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import { DashboardContext, DashboardProjects } from 'contexts/Dashboard';
import Graphic from '@arcgis/core/Graphic';

let terrain3dUseElevationGlobal = true;

// Finds the layer being updated and its index within the layers variable.
// Also returns the eventType (add, update, etc.) and event changes.
function getUpdateEventInfo(event: any) {
  // get type and changes

  const type = event.type;
  const changes = type === 'create' ? [event.graphic] : event.graphics;

  // Get the layer from the event. It's better to get the layer from the graphics
  // since that will persist when changing tabs. For delete events we have to get
  // the layer from the target, since delete events never have the layer on the graphic.
  const eventLayer = type === 'delete' ? event.target?.layer : changes[0].layer;

  return {
    eventType: type,
    eventChanges: changes.map((g: __esri.Graphic) => g.toJSON()),
    eventLayer,
  };
}

// --- components (MapSketchWidgetsDashboard) ---
type Props = {
  mapView: __esri.MapView;
  sceneView: __esri.SceneView;
};

function MapSketchWidgetsDashboard({ mapView, sceneView }: Props) {
  const { userInfo } = useContext(AuthenticationContext);
  const { currentPanel } = useContext(NavigationContext);
  const {
    aoiSketchVMDashboard,
    setAoiSketchVMDashboard,
    aoiSketchLayerDashboard,
    setAoiSketchLayerDashboard,
    dashboardProjects,
    setDashboardProjects,
    selectedDashboardProject,
  } = useContext(DashboardContext);
  const { defaultSymbols, displayDimensions, terrain3dUseElevation } =
    useContext(SketchContext);
  const { loadedProjection } = useGeometryTools();
  const getPopupTemplate = useDynamicPopup();

  // Workaround for esri not recognizing React context.
  // Syncs a global variable with React context.
  useEffect(() => {
    terrain3dUseElevationGlobal = terrain3dUseElevation;
  }, [terrain3dUseElevation]);

  // Creates the SketchViewModel
  useEffect(() => {
    if (aoiSketchVMDashboard || aoiSketchLayerDashboard) return;

    const sketchLayer = new GraphicsLayer({
      id: 'aoi-mask',
      title: 'Area of Interest',
      visible: true,
      listMode: 'show',
    });

    mapView.map.layers.add(sketchLayer);
    setAoiSketchLayerDashboard(sketchLayer);

    const svm = new SketchViewModel({
      view: mapView,
      polygonSymbol: defaultSymbols.symbols['Area of Interest'],
      pointSymbol: defaultSymbols.symbols['Area of Interest'] as any,
    });
    svm.layer = sketchLayer;

    const tempSvm = svm as any;
    const tempWindow = window as any;
    tempWindow.aoiSketchVmInternalLayerId = tempSvm._internalGraphicsLayer.id;

    setAoiSketchVMDashboard(svm);
  }, [
    aoiSketchLayerDashboard,
    aoiSketchVMDashboard,
    defaultSymbols,
    mapView,
    setAoiSketchLayerDashboard,
    setAoiSketchVMDashboard,
  ]);

  // Updates the selected layer of the aoiSketchViewModel
  useEffect(() => {
    if (!aoiSketchVMDashboard) return;

    if (aoiSketchLayerDashboard?.type === 'graphics') {
      aoiSketchVMDashboard.layer = aoiSketchLayerDashboard;

      aoiSketchVMDashboard.polygonSymbol = defaultSymbols.symbols[
        'Area of Interest'
      ] as any;
      aoiSketchVMDashboard.pointSymbol = defaultSymbols.symbols[
        'Area of Interest'
      ] as any;

      if (displayDimensions === '2d') {
        aoiSketchVMDashboard.view = mapView;
        aoiSketchVMDashboard.layer.elevationInfo = null as any;
        aoiSketchVMDashboard.snappingOptions = {
          featureSources: [],
        } as any;
        aoiSketchVMDashboard.defaultCreateOptions = {
          hasZ: false,
        };
        aoiSketchVMDashboard.defaultUpdateOptions = {
          enableZ: false,
        };
      } else {
        aoiSketchVMDashboard.view = sceneView;
        aoiSketchVMDashboard.layer.elevationInfo = { mode: 'absolute-height' };
        aoiSketchVMDashboard.snappingOptions = {
          featureSources: [{ layer: aoiSketchVMDashboard.layer }],
        } as any;
        aoiSketchVMDashboard.defaultCreateOptions = {
          hasZ: true,
        };
        aoiSketchVMDashboard.defaultUpdateOptions = {
          enableZ: true,
        };
      }
    } else {
      // disable the sketch vm for any panel other than locateSamples
      aoiSketchVMDashboard.layer = null as unknown as __esri.GraphicsLayer;
    }
  }, [
    aoiSketchLayerDashboard,
    aoiSketchVMDashboard,
    currentPanel,
    defaultSymbols,
    displayDimensions,
    mapView,
    sceneView,
  ]);

  // Creates the sketchVM events for placing the graphic on the map
  const setupEvents = useCallback(
    (
      sketchViewModel: __esri.SketchViewModel,
      sketchEventSetter: Dispatch<any>,
    ) => {
      let firstPoint: __esri.Point | null = null;

      sketchViewModel.on('create', (event) => {
        const { graphic } = event;
        if (!graphic) return;

        if (!firstPoint) {
          if (graphic.geometry?.type === 'polygon') {
            const poly = graphic.geometry as __esri.Polygon;
            const firstCoordinate = poly.rings?.[0]?.[0];
            firstPoint = new Point({
              x: firstCoordinate[0],
              y: firstCoordinate[1],
              spatialReference: {
                wkid: poly.spatialReference.wkid,
              },
            });
          }
        }

        async function processSketchEvent() {
          // // get the button and it's id
          // const button = document.querySelector('.sketch-button-selected');
          // const id = button && button.id;
          // if (id === 'sampling-mask') {
          //   deactivateButtons();
          // }

          // if (!id) {
          //   sketchViewModel.cancel();
          //   return;
          // }

          // get the predefined attributes using the id of the clicked button
          const uuid = generateUUID();
          const layerType: LayerTypeName = 'Sampling Mask';
          graphic.attributes = {
            DECISIONUNITUUID: graphic.layer.id,
            DECISIONUNIT: graphic.layer.title,
            DECISIONUNITSORT: 0,
            PERMANENT_IDENTIFIER: uuid,
            GLOBALID: uuid,
            OBJECTID: -1,
            TYPE: layerType,
          };

          // add a popup template to the graphic
          graphic.popupTemplate = new PopupTemplate(
            getPopupTemplate(layerType, true),
          );

          // update the z values
          await setZValues({
            map: sketchViewModel.view.map,
            graphic,
            zRefParam: firstPoint,
            zOverride: terrain3dUseElevationGlobal ? null : 0,
          });

          graphic.symbol = sketchViewModel.polygonSymbol;

          // save the graphic
          sketchEventSetter(event);

          setDashboardProjects((projects) => {
            // TODO find project

            return {
              count: projects.count + 1,
              projects: projects.projects,
            };
          });

          firstPoint = null;
        }

        // place the graphic on the map when the drawing is complete
        if (event.state === 'complete') {
          sketchViewModel.complete();
          processSketchEvent();
        }
      });

      sketchViewModel.on('update', (event) => {
        // dock the popup when sketch tools are active
        sketchViewModel.view.popup.dockEnabled =
          event.state === 'complete' ? false : true;

        // the updates have completed add them to the edits variable
        if (event.state === 'complete' && !event.aborted) {
          // fire the update event if event.state is complete.
          if (event.state === 'complete') {
            event.graphics.forEach((graphic) => {
              // graphic.attributes.UPDATEDDATE = getCurrentDateTime();
              // graphic.attributes.USERNAME = userInfo?.username || '';
              // graphic.attributes.ORGANIZATION = userInfo?.orgId || '';
            });
            sketchEventSetter(event);
          }
        }

        if (event.state === 'active') {
          // find the points version of the layer
          event.graphics.forEach((graphic) => {
            const layerId = graphic.layer?.id;
            const pointLayer: __esri.GraphicsLayer = (
              graphic.layer as any
            )?.parent?.layers?.find(
              (layer: __esri.GraphicsLayer) => `${layerId}-points` === layer.id,
            );
            if (pointLayer) {
              // Find the original point graphic and remove it
              const graphicsToRemove: __esri.Graphic[] = [];
              pointLayer.graphics.forEach((pointVersion) => {
                if (
                  graphic.attributes.PERMANENT_IDENTIFIER ===
                  pointVersion.attributes.PERMANENT_IDENTIFIER
                ) {
                  graphicsToRemove.push(pointVersion);
                }
              });
              pointLayer.removeMany(graphicsToRemove);

              // Re-add the point version of the graphic
              const symbol = graphic.symbol as any as PolygonSymbol;
              (pointLayer as any).add({
                attributes: graphic.attributes,
                geometry: (graphic.geometry as __esri.Polygon).centroid,
                popupTemplate: graphic.popupTemplate,
                symbol: getPointSymbol(graphic, symbol),
              });
            }

            const hybridLayer: __esri.GraphicsLayer = (
              graphic.layer as any
            )?.parent?.layers?.find(
              (layer: __esri.GraphicsLayer) => `${layerId}-hybrid` === layer.id,
            );
            if (hybridLayer) {
              // Find the original point graphic and remove it
              const graphicsToRemove: __esri.Graphic[] = [];
              hybridLayer.graphics.forEach((hybridVersion) => {
                if (
                  graphic.attributes.PERMANENT_IDENTIFIER ===
                  hybridVersion.attributes.PERMANENT_IDENTIFIER
                ) {
                  graphicsToRemove.push(hybridVersion);
                }
              });
              hybridLayer.removeMany(graphicsToRemove);

              // Re-add the point version of the graphic
              const symbol = graphic.symbol as any as PolygonSymbol;
              if (graphic.attributes.ShapeType === 'point') {
                (hybridLayer as any).add({
                  attributes: graphic.attributes,
                  geometry: (graphic.geometry as __esri.Polygon).centroid,
                  popupTemplate: graphic.popupTemplate,
                  symbol: getPointSymbol(graphic, symbol),
                });
              } else {
                (hybridLayer as any).add(graphic.clone());
              }
            }
          });
        }

        const isShapeChange =
          event.toolEventInfo &&
          (event.toolEventInfo.type.includes('reshape') ||
            event.toolEventInfo.type.includes('scale'));

        let hasPredefinedBoxes = false;
        event.graphics.forEach((graphic) => {
          if (graphic.attributes?.ShapeType === 'point') {
            hasPredefinedBoxes = true;
          }
        });

        // prevent scale and reshape changes on the predefined graphics
        // allow moves and rotates
        if (isShapeChange && hasPredefinedBoxes) {
          sketchViewModel.undo();
        }
      });

      // handles deleting when the delete key is pressed
      // Workaround for an error that said Argument of type '"delete"' is
      // not assignable to parameter of type '"undo"'.
      // This issue looks like the types haven't been updated, because delete
      // is now an option.
      const tempSketchVM = sketchViewModel as any;
      tempSketchVM.on('delete', (event: any) => {
        // find the points version of the layer
        event.graphics.forEach((graphic: any) => {
          const layerId = tempSketchVM.layer?.id;
          const pointLayer: __esri.GraphicsLayer = (
            tempSketchVM.layer as any
          ).parent.layers.find(
            (layer: __esri.GraphicsLayer) => `${layerId}-points` === layer.id,
          );
          if (pointLayer) {
            // Find the original point graphic and remove it
            const graphicsToRemove: __esri.Graphic[] = [];
            pointLayer.graphics.forEach((pointVersion) => {
              if (
                graphic.attributes.PERMANENT_IDENTIFIER ===
                pointVersion.attributes.PERMANENT_IDENTIFIER
              ) {
                graphicsToRemove.push(pointVersion);
              }
            });
            pointLayer.removeMany(graphicsToRemove);
          }

          const hybridLayer: __esri.GraphicsLayer = (
            tempSketchVM.layer as any
          ).parent.layers.find(
            (layer: __esri.GraphicsLayer) => `${layerId}-hybrid` === layer.id,
          );
          if (hybridLayer) {
            // Find the original point graphic and remove it
            const graphicsToRemove: __esri.Graphic[] = [];
            hybridLayer.graphics.forEach((hybridVersion) => {
              if (
                graphic.attributes.PERMANENT_IDENTIFIER ===
                hybridVersion.attributes.PERMANENT_IDENTIFIER
              ) {
                graphicsToRemove.push(hybridVersion);
              }
            });
            hybridLayer.removeMany(graphicsToRemove);
          }
        });

        sketchEventSetter(event);
      });
    },
    [getPopupTemplate, setDashboardProjects],
  );

  // Setup the sketch view model events for the Sampling Mask sketchVM
  const [
    aoiSketchEventsInitialized,
    setAoiSketchEventsInitialized, //
  ] = useState(false);
  const [
    aoiUpdateSketchEvent,
    setAoiUpdateSketchEvent, //
  ] = useState<any>(null);
  useEffect(() => {
    if (
      !aoiSketchVMDashboard ||
      !loadedProjection ||
      aoiSketchEventsInitialized
    )
      return;
    setupEvents(aoiSketchVMDashboard, setAoiUpdateSketchEvent);

    setAoiSketchEventsInitialized(true);
  }, [
    aoiSketchVMDashboard,
    setupEvents,
    aoiSketchEventsInitialized,
    setAoiSketchEventsInitialized,
    loadedProjection,
  ]);

  // set the updateLayer for the aoiUpdateSketchEvent
  useEffect(() => {
    if (!aoiUpdateSketchEvent) return;
    setAoiUpdateSketchEvent(null);

    const updateEvent = getUpdateEventInfo(aoiUpdateSketchEvent);

    setDashboardProjects((projects) => {
      // make a copy of the edits context variable
      const projectsCopy = deepCopyObject(projects) as DashboardProjects;
      projectsCopy.count += 1;

      const project = projectsCopy.projects.find(
        (p) => p.id === selectedDashboardProject?.value,
      );

      if (!project && selectedDashboardProject) {
        projectsCopy.projects.push({
          id: selectedDashboardProject.value,
          aoiGraphics: [...updateEvent.eventChanges],
        });
      } else if (project) {
        if (updateEvent.eventType === 'create') {
          project.aoiGraphics = project.aoiGraphics.concat(
            updateEvent.eventChanges,
          );
        }
        if (updateEvent.eventType === 'update') {
          const newAoiGraphics: __esri.Graphic[] = [];
          project.aoiGraphics.forEach((g) => {
            const permId = g.attributes.PERMANENT_IDENTIFIER;

            const updateGraphic = updateEvent.eventChanges.find(
              (c: __esri.Graphic) =>
                c.attributes.PERMANENT_IDENTIFIER === permId,
            );
            if (updateGraphic) {
              newAoiGraphics.push(updateGraphic);
            } else {
              newAoiGraphics.push(g);
            }
          });

          project.aoiGraphics = newAoiGraphics;
        }
        if (updateEvent.eventType === 'delete') {
          const idsToDelete = updateEvent.eventChanges.map(
            (c: __esri.Graphic) => {
              return c.attributes.PERMANENT_IDENTIFIER;
            },
          );
          project.aoiGraphics = project.aoiGraphics.filter(
            (g) => !idsToDelete.includes(g.attributes.PERMANENT_IDENTIFIER),
          );
        }
      }

      return projectsCopy;
    });
  }, [
    aoiUpdateSketchEvent,
    selectedDashboardProject,
    setAoiSketchLayerDashboard,
    setDashboardProjects,
  ]);

  useEffect(() => {
    console.log('dashboardProjects: ', dashboardProjects);
  }, [dashboardProjects]);

  // Reactivate aoiSketchVMDashboard after the updateSketchEvent is null
  useEffect(() => {
    if (
      !aoiSketchVMDashboard ||
      aoiSketchVMDashboard.layer ||
      aoiSketchLayerDashboard?.type !== 'graphics' ||
      currentPanel?.value !== 'locateSamples'
    ) {
      return;
    }

    aoiSketchVMDashboard.layer = aoiSketchLayerDashboard;
  }, [currentPanel, aoiSketchVMDashboard, aoiSketchLayerDashboard]);

  return null;
}

export default MapSketchWidgetsDashboard;
