/**
 * Мобильный слой Tetrin.
 *
 * Ниже 768px продукт — не сжатый кабинет, а приложение: белый лист без
 * рамок, мягкие сиреневые плитки на нём, плавающая полоса вкладок
 * внизу, листы снизу вверх. Цветов ровно два: грейп — действие и
 * выбранное, лайм — «здесь и сейчас».
 *
 * Одна система на весь мобильный веб. Страница, которая рисует свою
 * карточку своими классами, через месяц перестаёт быть частью этого
 * продукта; поэтому всё, что повторяется дважды, живёт здесь.
 */

export { MobileOnly, DesktopOnly, MScreen, MSection, MLink } from './screen';
export { MTile, MGrid, MBadge, MArrow, MStatTile, mSurface, type MTone } from './surface';
export { MTabBar, MTopBar, MNav, MTitle } from './chrome';
export {
  MButton,
  MButtonLink,
  MIconButton,
  MIconLink,
  MChip,
  MChipLink,
  MChipRow,
  MActionBar,
} from './controls';
export { MRows, MGroup, MRow, MNavRow, MAvatar, MAvatarStack } from './list';
export { MReading, MDelta, MSplitBar, MLegend, MRing, M_SERIES, mSeries } from './stats';
export { MSheet, MCover } from './sheet';
export { MEmpty, MBone, MScreenSkeleton } from './states';
export {
  MField,
  MInput,
  MTextarea,
  MSelect,
  MPlateInput,
  MSegmented,
  MSwitch,
  MSearch,
} from './field';
