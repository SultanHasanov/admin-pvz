import type { ThemeConfig } from 'antd'

/** Зелёная тема владельца ПВЗ и размеры, рассчитанные на палец, а не на курсор. */
export const antdTheme:ThemeConfig = {
  token: {
    colorPrimary: '#16a34a',
    colorLink: '#15803d',
    colorBgLayout: '#f5f6f8',
    borderRadius: 10,
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
    // 40px — минимум, при котором по кнопке уверенно попадаешь пальцем.
    controlHeight: 40,
  },
  components: {
    Layout: { siderBg: '#ffffff', headerBg: '#ffffff', headerHeight: 60, headerPadding: '0 16px' },
    Menu: { itemHeight: 44, itemMarginInline: 8, iconMarginInlineEnd: 12 },
    Card: { paddingLG: 20 },
    Table: { cellPaddingBlock: 12 },
    Statistic: { contentFontSize: 20 },
  },
}
