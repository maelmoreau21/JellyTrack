import type { Translate } from './view-renderers';

export interface DashboardFrameProps {
  t: Translate;
  locale: string;
}

export interface DashboardFrameController {
  setToday(plays: number | string, hours: string, users: number | string): void;
}
