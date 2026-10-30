import { railRobot } from '../../shared/railRobot';
import { PUCK_T } from '../product';

/** Station 11: tip height over the product root on the belt and on the shelf: the mug is gripped round the body at mid height; on the shelf the puck is gone, so the body sits PUCK_T lower. */
export const robot = railRobot('mug-robot', PUCK_T + 12, 12);
