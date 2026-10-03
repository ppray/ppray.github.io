// 关卡总目。顺序即难度与年代顺序：从「没有工具可交易」的 1982 年，
// 走到「央行一句话就能轧空你」的 2012 年。
import latam1982 from './latam1982.js';
import japan1990 from './japan1990.js';
import asia1997 from './asia1997.js';
import russia1998 from './russia1998.js';
import subprime2008 from './subprime2008.js';
import euro2012 from './euro2012.js';

export const LEVELS = [latam1982, japan1990, asia1997, russia1998, subprime2008, euro2012];
export const levelById = Object.fromEntries(LEVELS.map(l => [l.id, l]));
export default LEVELS;
