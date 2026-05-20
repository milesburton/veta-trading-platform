export type { DashboardContextValue } from "./dashboard/DashboardContext.tsx";
export {
  DashboardContext,
  DashboardProvider,
  useDashboard,
} from "./dashboard/DashboardContext.tsx";
export { DashboardLayout } from "./dashboard/DashboardLayout.tsx";

export {
  LAYOUT_TEMPLATES,
  makeAdministrationModel,
  makeAdminModel,
  makeAdminObservabilityModel,
  makeAlgoModel,
  makeAnalysisModel,
  makeClearModel,
  makeCommoditiesAnalysisModel,
  makeCommoditiesTradingModel,
  makeExecutionModel,
  makeFiAnalysisModel,
  makeFiResearchModel,
  makeFiTradingModel,
  makeMarketFeedsModel,
  makeOptionsModel,
  makeOverviewModel,
  makePipelineOpsModel,
  makeResearchModel,
  makeSystemStatusModel,
  STORAGE_KEY,
} from "./dashboard/layoutModels.ts";

export type { LayoutItem } from "./dashboard/layoutUtils.ts";
export {
  DEFAULT_LAYOUT,
  modelToLayoutItems,
} from "./dashboard/layoutUtils.ts";
export type { PanelId } from "./dashboard/panelRegistry.ts";
export {
  PANEL_IDS,
  PANEL_TITLES,
  SINGLETON_PANELS,
} from "./dashboard/panelRegistry.ts";
