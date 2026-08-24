/**
 * Мобильный слой Tetrin.
 *
 * Ниже 768px продукт показывает не сжатый кабинет, а то же приложение,
 * что стоит на iPhone: полотно табло, белая бумага на нём, полоса
 * вкладок внизу, листы снизу вверх. Композиция, отступы, кегли и
 * скругления перенесены из `ios/Tetr/` — там же лежат объяснения,
 * почему каждое такое.
 *
 * Одна система на весь мобильный веб. Страница, которая рисует свою
 * карточку своими классами, через месяц перестаёт быть частью этого
 * продукта; поэтому всё, что повторяется дважды, живёт здесь.
 */

export { MobileOnly, DesktopOnly, MobilePage, MobileSection } from './layout';
export { MobileCard, MobileReading, MobileDelta } from './card';
export { MobileTabBar } from './tab-bar';
export { MobileTopBar, MobileBackHeader, MobileTitle, MobileIconButton } from './header';
export {
  MobileButton,
  MobileLinkButton,
  MobileChip,
  MobileQuietButton,
  MobileActionBar,
} from './button';
export {
  MobileGroup,
  MobileLinkRow,
  MobileButtonRow,
  MobileRow,
  MobileDataRow,
  MobileDataList,
  MobileAvatar,
} from './list';
export { MobileStatRow, MobileStatCards, MobileSplitBar, MobileSplitLegend } from './stats';
export { MobileEmpty, MobileError, MobileSkeleton, MobileSkeletonRows } from './states';
export { MobileSheet, MobileCover } from './sheet';
export {
  MobileField,
  MobileInput,
  MobileTextarea,
  MobileSelect,
  MobileSwitchRow,
  MobileSegmented,
  MobileSegmentedLinks,
} from './field';
export { MobileSearch, MobileChipRow } from './toolbar';
export { TetrinLoader, TetrinMiniLoader } from './loader';
