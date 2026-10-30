import { railRobot } from '../../shared/railRobot';
import { DON_TOP } from '../product';

/** Station 11: rail robot. Tip height over the product root on the belt (lying on its tray, gripped from above) and on the shelf (standing on its rim, gripped at its middle (centre z = DON_R + GLAZE_R = 19.6)). */
export const robot = railRobot('donut-robot', DON_TOP + 3, 20);
