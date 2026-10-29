/**
 * Client half of the "Open in VS Code" bundle.
 *
 * 在会话头部的右对齐工具区（conversation.session.header.utilities）注册一个图标按钮，
 * order: -20 使其位于内置“打开方式”（open-in-app，order: -10）的左侧。点击后把当前
 * 会话的工作区目录（cwd）POST 到本包的 Host 路由 /open-in-vscode 启动 VS Code。
 */
window.__ModuleLoader__.load({
  id: 'dsh-open-with-vscode',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const CSS_ID = 'dsh-open-with-vscode/button.css';
    const css = [
      '.dshOpenInVscode{flex:none;align-self:center;display:inline-flex;align-items:center;position:relative}',
      '.dshOpenInVscode_button{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-sm);height:24px;color:var(--dsw-alias-label-primary);background:transparent;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:3px 6px}',
      '.dshOpenInVscode_button:hover:not(:disabled),.dshOpenInVscode_button:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dshOpenInVscode_button:disabled{cursor:default}',
      '.dshOpenInVscode_button.hasFailed{color:var(--dsw-alias-state-error-primary)}',
      '.dshOpenInVscode_icon{display:block}',
      '.dshOpenInVscode_toast{position:absolute;top:calc(100% + 4px);left:0;z-index:30;box-sizing:border-box;max-width:240px;background:var(--dsw-alias-bg-overlay);border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-xs);color:var(--dsw-alias-state-error-primary);padding:4px 8px;font-size:11px;line-height:16px;white-space:nowrap}',
    ].join('');

    /** 注入按钮样式；返回清理函数。同一页面重复挂载时幂等。 */
    function ensureCss() {
      if (typeof document === 'undefined') return () => {};
      if (document.querySelector(`style[data-plugin-css="${CSS_ID}"]`) !== null) return () => {};
      const tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-open-with-vscode';
      tag.dataset.pluginCss = CSS_ID;
      tag.textContent = css;
      document.head.appendChild(tag);
      return () => {
        tag.remove();
      };
    }

    const NS = 'open-with-vscode';
    const zh = {
      'open.tooltip': '在 VS Code 中打开',
      'open.failed': '打开失败，请重试',
    };
    const en = {
      'open.tooltip': 'Open in VS Code',
      'open.failed': 'Could not open. Try again.',
    };

    /** 按钮图标：插件目录内的 icon.svg，内联为 data URI（由 embed-icon 脚本嵌入）。 */
    const ICON_SRC = "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%20100%20100%22%3E%3Cmask%20id%3D%22a%22%20width%3D%22100%22%20height%3D%22100%22%20x%3D%220%22%20y%3D%220%22%20mask-type%3D%22alpha%22%20maskUnits%3D%22userSpaceOnUse%22%3E%3Cpath%20fill%3D%22%23fff%22%20fill-rule%3D%22evenodd%22%20d%3D%22M70.912%2099.317a6.223%206.223%200%200%200%204.96-.19l20.589-9.907A6.25%206.25%200%200%200%20100%2083.587V16.413a6.25%206.25%200%200%200-3.54-5.632L75.874.874a6.226%206.226%200%200%200-7.104%201.21L29.355%2038.04%2012.187%2025.01a4.162%204.162%200%200%200-5.318.236l-5.506%205.009a4.168%204.168%200%200%200-.004%206.162L16.247%2050%201.36%2063.583a4.168%204.168%200%200%200%20.004%206.162l5.506%205.01a4.162%204.162%200%200%200%205.318.236l17.168-13.032L68.77%2097.917a6.217%206.217%200%200%200%202.143%201.4ZM75.015%2027.3%2045.11%2050l29.906%2022.701V27.3Z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fmask%3E%3Cg%20mask%3D%22url(%23a)%22%3E%3Cpath%20fill%3D%22%230065A9%22%20d%3D%22M96.461%2010.796%2075.857.876a6.23%206.23%200%200%200-7.107%201.207l-67.451%2061.5a4.167%204.167%200%200%200%20.004%206.162l5.51%205.009a4.167%204.167%200%200%200%205.32.236l81.228-61.62c2.725-2.067%206.639-.124%206.639%203.297v-.24a6.25%206.25%200%200%200-3.539-5.63Z%22%2F%3E%3Cg%20filter%3D%22url(%23b)%22%3E%3Cpath%20fill%3D%22%23007ACC%22%20d%3D%22m96.461%2089.204-20.604%209.92a6.229%206.229%200%200%201-7.107-1.207l-67.451-61.5a4.167%204.167%200%200%201%20.004-6.162l5.51-5.009a4.167%204.167%200%200%201%205.32-.236l81.228%2061.62c2.725%202.067%206.639.124%206.639-3.297v.24a6.25%206.25%200%200%201-3.539%205.63Z%22%2F%3E%3C%2Fg%3E%3Cg%20filter%3D%22url(%23c)%22%3E%3Cpath%20fill%3D%22%231F9CF0%22%20d%3D%22M75.858%2099.126a6.232%206.232%200%200%201-7.108-1.21c2.306%202.307%206.25.674%206.25-2.588V4.672c0-3.262-3.944-4.895-6.25-2.589a6.232%206.232%200%200%201%207.108-1.21l20.6%209.908A6.25%206.25%200%200%201%20100%2016.413v67.174a6.25%206.25%200%200%201-3.541%205.633l-20.601%209.906Z%22%2F%3E%3C%2Fg%3E%3Cpath%20fill%3D%22url(%23d)%22%20fill-rule%3D%22evenodd%22%20d%3D%22M70.851%2099.317a6.224%206.224%200%200%200%204.96-.19L96.4%2089.22a6.25%206.25%200%200%200%203.54-5.633V16.413a6.25%206.25%200%200%200-3.54-5.632L75.812.874a6.226%206.226%200%200%200-7.104%201.21L29.294%2038.04%2012.126%2025.01a4.162%204.162%200%200%200-5.317.236l-5.507%205.009a4.168%204.168%200%200%200-.004%206.162L16.186%2050%201.298%2063.583a4.168%204.168%200%200%200%20.004%206.162l5.507%205.009a4.162%204.162%200%200%200%205.317.236L29.294%2061.96l39.414%2035.958a6.218%206.218%200%200%200%202.143%201.4ZM74.954%2027.3%2045.048%2050l29.906%2022.701V27.3Z%22%20clip-rule%3D%22evenodd%22%20opacity%3D%22.25%22%20style%3D%22mix-blend-mode%3Aoverlay%22%2F%3E%3C%2Fg%3E%3Cdefs%3E%3Cfilter%20id%3D%22b%22%20width%3D%22116.727%22%20height%3D%2292.246%22%20x%3D%22-8.394%22%20y%3D%2215.829%22%20color-interpolation-filters%3D%22sRGB%22%20filterUnits%3D%22userSpaceOnUse%22%3E%3CfeFlood%20flood-opacity%3D%220%22%20result%3D%22BackgroundImageFix%22%2F%3E%3CfeColorMatrix%20in%3D%22SourceAlpha%22%20values%3D%220%200%200%200%200%200%200%200%200%200%200%200%200%200%200%200%200%200%20127%200%22%2F%3E%3CfeOffset%2F%3E%3CfeGaussianBlur%20stdDeviation%3D%224.167%22%2F%3E%3CfeColorMatrix%20values%3D%220%200%200%200%200%200%200%200%200%200%200%200%200%200%200%200%200%200%200.25%200%22%2F%3E%3CfeBlend%20in2%3D%22BackgroundImageFix%22%20mode%3D%22overlay%22%20result%3D%22effect1_dropShadow%22%2F%3E%3CfeBlend%20in%3D%22SourceGraphic%22%20in2%3D%22effect1_dropShadow%22%20result%3D%22shape%22%2F%3E%3C%2Ffilter%3E%3Cfilter%20id%3D%22c%22%20width%3D%2247.917%22%20height%3D%22116.151%22%20x%3D%2260.417%22%20y%3D%22-8.076%22%20color-interpolation-filters%3D%22sRGB%22%20filterUnits%3D%22userSpaceOnUse%22%3E%3CfeFlood%20flood-opacity%3D%220%22%20result%3D%22BackgroundImageFix%22%2F%3E%3CfeColorMatrix%20in%3D%22SourceAlpha%22%20values%3D%220%200%200%200%200%200%200%200%200%200%200%200%200%200%200%200%200%200%20127%200%22%2F%3E%3CfeOffset%2F%3E%3CfeGaussianBlur%20stdDeviation%3D%224.167%22%2F%3E%3CfeColorMatrix%20values%3D%220%200%200%200%200%200%200%200%200%200%200%200%200%200%200%200%200%200%200.25%200%22%2F%3E%3CfeBlend%20in2%3D%22BackgroundImageFix%22%20mode%3D%22overlay%22%20result%3D%22effect1_dropShadow%22%2F%3E%3CfeBlend%20in%3D%22SourceGraphic%22%20in2%3D%22effect1_dropShadow%22%20result%3D%22shape%22%2F%3E%3C%2Ffilter%3E%3ClinearGradient%20id%3D%22d%22%20x1%3D%2249.939%22%20x2%3D%2249.939%22%20y1%3D%22.258%22%20y2%3D%2299.742%22%20gradientUnits%3D%22userSpaceOnUse%22%3E%3Cstop%20stop-color%3D%22%23fff%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23fff%22%20stop-opacity%3D%220%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3C%2Fsvg%3E";
    function VscodeIcon() {
      return h('img', {
        src: ICON_SRC,
        width: 16,
        height: 16,
        alt: '',
        className: 'dshOpenInVscode_icon',
      });
    }

    /** 会话头按钮：读取当前会话 cwd，点击后请求 Host 用 VS Code 打开该目录。 */
    function VscodeButton(props) {
      const { sessionId, useSessions, t } = props;
      const cwd = useSessions((state) => state.byId[sessionId]?.cwd);
      const [busy, setBusy] = React.useState(false);
      const [failure, setFailure] = React.useState(false);
      const inFlight = React.useRef(false);
      if (!cwd) return null;
      const open = () => {
        if (inFlight.current) return;
        inFlight.current = true;
        setBusy(true);
        setFailure(false);
        fetch('open-in-vscode', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ path: cwd }),
        })
          .then((res) => {
            if (!res.ok) throw new Error(`open failed: HTTP ${String(res.status)}`);
            return res.json();
          })
          .then((payload) => {
            if (payload.ok !== true) throw new Error('launch not acknowledged');
          })
          .catch((error) => {
            console.error('open-in-vscode:', error);
            setFailure(true);
          })
          .finally(() => {
            inFlight.current = false;
            setBusy(false);
          });
      };
      return h('span', { className: 'dshOpenInVscode' },
        h('button', {
          type: 'button',
          className: `dshOpenInVscode_button${busy ? ' isBusy' : ''}${failure ? ' hasFailed' : ''}`,
          title: t('open.tooltip'),
          'aria-label': t('open.tooltip'),
          disabled: busy,
          onClick: open,
        }, h(VscodeIcon)),
        failure ? h('span', { className: 'dshOpenInVscode_toast', role: 'alert' }, t('open.failed')) : null);
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => {
          const removeCss = ensureCss();
          const removeLocale = ctx.locale.register(NS, { zh, en });
          return () => {
            removeCss();
            if (typeof removeLocale === 'function') removeLocale();
          };
        }, 'open-in-vscode: resources');
        const t = ctx.locale.bind(NS);
        ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
          name: 'conversation.session.header.utilities',
          id: 'open-in-vscode',
          order: -20,
          locale: NS,
          inject: () => ({ t }),
        }, VscodeButton));
      },
    };
  },
});
