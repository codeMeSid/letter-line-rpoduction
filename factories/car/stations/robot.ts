import { railRobot } from '../../shared/railRobot';
import { TRAY_T } from '../product';

/** Station 12: tip height over the product root on the belt and on the shelf: the carton is gripped at mid height; on the shelf the tray is gone, so it sits TRAY_T lower. */
export const robot = railRobot('car-robot', TRAY_T + 7, 7);
