import { railRobot } from '../../shared/railRobot';
import { PUCK_T } from '../product';

/** Station 13: tip height over the product root on the belt and on the shelf: the bottle is gripped mid-body; on the shelf the puck is gone, so the body sits PUCK_T lower. */
export const robot = railRobot('bottle-robot', PUCK_T + 15, 15);
