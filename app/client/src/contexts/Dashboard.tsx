/** @jsxImportSource @emotion/react */

import React, {
  createContext,
  Dispatch,
  ReactNode,
  SetStateAction,
  useState,
} from 'react';
// types

export type Option = {
  created: string;
  label: string;
  value: string;
  url: string;
};

export type SketchViewModelType = {
  '2d': __esri.SketchViewModel;
  '3d': __esri.SketchViewModel;
};

export type DashboardProject = {
  id: string;
  aoiGraphics: __esri.Graphic[];
};

export type DashboardProjects = {
  count: number;
  projects: DashboardProject[];
};

type DashboardType = {
  dashboardProjects: DashboardProjects;
  setDashboardProjects: Dispatch<SetStateAction<DashboardProjects>>;
  selectedDashboardProject: Option | null;
  setSelectedDashboardProject: Dispatch<SetStateAction<Option | null>>;
  aoiSketchLayerDashboard: __esri.GraphicsLayer | null;
  setAoiSketchLayerDashboard: Dispatch<
    SetStateAction<__esri.GraphicsLayer | null>
  >;
  mapDashboard: __esri.Map | null;
  setMapDashboard: Dispatch<SetStateAction<__esri.Map | null>>;
  mapViewDashboard: __esri.MapView | null;
  setMapViewDashboard: Dispatch<SetStateAction<__esri.MapView | null>>;
  sceneViewDashboard: __esri.SceneView | null;
  setSceneViewDashboard: Dispatch<SetStateAction<__esri.SceneView | null>>;
  sceneViewForAreaDashboard: __esri.SceneView | null;
  setSceneViewForAreaDashboard: Dispatch<
    SetStateAction<__esri.SceneView | null>
  >;
  aoiSketchVMDashboard: __esri.SketchViewModel | null;
  setAoiSketchVMDashboard: Dispatch<
    SetStateAction<__esri.SketchViewModel | null>
  >;
};

export const DashboardContext = createContext<DashboardType>({
  dashboardProjects: { count: 0, projects: [] },
  setDashboardProjects: () => {},
  selectedDashboardProject: null,
  setSelectedDashboardProject: () => {},
  aoiSketchLayerDashboard: null,
  setAoiSketchLayerDashboard: () => {},
  mapDashboard: null,
  setMapDashboard: () => {},
  mapViewDashboard: null,
  setMapViewDashboard: () => {},
  sceneViewDashboard: null,
  setSceneViewDashboard: () => {},
  sceneViewForAreaDashboard: null,
  setSceneViewForAreaDashboard: () => {},
  aoiSketchVMDashboard: null,
  setAoiSketchVMDashboard: () => {},
});

type Props = { children: ReactNode };

export function DashboardProvider({ children }: Props) {
  const [dashboardProjects, setDashboardProjects] = useState<DashboardProjects>(
    { count: 0, projects: [] },
  );
  const [selectedDashboardProject, setSelectedDashboardProject] =
    useState<Option | null>(null);
  const [aoiSketchLayerDashboard, setAoiSketchLayerDashboard] =
    useState<__esri.GraphicsLayer | null>(null);
  const [mapDashboard, setMapDashboard] = useState<__esri.Map | null>(null);
  const [mapViewDashboard, setMapViewDashboard] =
    useState<__esri.MapView | null>(null);
  const [sceneViewDashboard, setSceneViewDashboard] =
    useState<__esri.SceneView | null>(null);
  const [sceneViewForAreaDashboard, setSceneViewForAreaDashboard] =
    useState<__esri.SceneView | null>(null);
  const [
    aoiSketchVMDashboard,
    setAoiSketchVMDashboard, //
  ] = useState<__esri.SketchViewModel | null>(null);

  return (
    <DashboardContext.Provider
      value={{
        dashboardProjects,
        setDashboardProjects,
        selectedDashboardProject,
        setSelectedDashboardProject,
        aoiSketchLayerDashboard,
        setAoiSketchLayerDashboard,
        mapDashboard,
        setMapDashboard,
        mapViewDashboard,
        setMapViewDashboard,
        sceneViewDashboard,
        setSceneViewDashboard,
        sceneViewForAreaDashboard,
        setSceneViewForAreaDashboard,
        aoiSketchVMDashboard,
        setAoiSketchVMDashboard,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}
